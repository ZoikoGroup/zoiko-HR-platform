"""Bulk generation of onboarding packages: one ZIP with a folder per new hire holding their 10 documents (as sent, or
watermarked drafts). Nothing is sent to anyone.

A job is one `organization_configs` row (BULK_KEY_PREFIX + job id) holding its progress, so any worker can report it; the
ZIP goes to the document store. Jobs run on a background thread with their own database session (inline under pytest).
Every read is scoped to the caller's organisation.
"""
from __future__ import annotations

import io
import json
import logging
import secrets
import sys
import threading
import zipfile
from datetime import datetime
from typing import Optional

from fastapi import HTTPException

from app.modules.hr.models import OnboardingNewHire, OrganizationConfig

logger = logging.getLogger("zoiko.onboarding.bulk")

BULK_KEY_PREFIX = "onboarding_package.bulk_job:"
MAX_HIRES = 50


def _row(db, organization_id: int, job_id: str):
    return db.query(OrganizationConfig).filter(OrganizationConfig.organization_id == organization_id,
                                               OrganizationConfig.key == BULK_KEY_PREFIX + job_id).first()


def _save(db, organization_id: int, job_id: str, state: dict) -> None:
    row = _row(db, organization_id, job_id)
    if row is None:
        row = OrganizationConfig(organization_id=organization_id, key=BULK_KEY_PREFIX + job_id, category="onboarding_package",
                                 description="Onboarding package bulk generation job")
        db.add(row)
    row.value = json.dumps(state)
    db.commit()


def job_view(db, organization_id: int, job_id: str) -> dict:
    row = _row(db, organization_id, job_id)
    if row is None:
        raise HTTPException(404, "Job not found.")
    state = json.loads(row.value or "{}")
    out = {k: v for k, v in state.items() if k != "zip_key"}
    out["job_id"] = job_id
    out["download_ready"] = bool(state.get("zip_key"))
    return out


def start(db, actor, new_hire_ids) -> dict:
    ids = [int(i) for i in (new_hire_ids or []) if str(i).isdigit()]
    ids = list(dict.fromkeys(ids))
    if not ids:
        raise HTTPException(422, "Choose at least one new hire.")
    if len(ids) > MAX_HIRES:
        raise HTTPException(422, f"Generate at most {MAX_HIRES} new hires at a time.")
    found = {h.id for h in db.query(OnboardingNewHire.id).filter(OnboardingNewHire.id.in_(ids),
                                                                  OnboardingNewHire.organization_id == actor.organization_id,
                                                                  OnboardingNewHire.is_deleted == False).all()}  # noqa: E712
    missing = [i for i in ids if i not in found]
    if missing:
        raise HTTPException(404, f"New hire(s) not found: {', '.join(map(str, missing))}.")
    job_id = secrets.token_hex(8)
    state = {"status": "queued", "total": len(ids), "done": 0, "failed": [], "new_hire_ids": ids,
             "created_by": actor.id, "created_at": datetime.utcnow().isoformat(), "finished_at": None}
    _save(db, actor.organization_id, job_id, state)
    org = actor.organization_id
    bind = db.get_bind()                                   # the job's own session, on the same database as this request
    if "pytest" in sys.modules:
        _run(org, job_id, bind)
    else:
        threading.Thread(target=_run, args=(org, job_id, bind), name=f"onb-bulk-{job_id}", daemon=True).start()
    return job_view(db, org, job_id)


def _run(organization_id: int, job_id: str, bind) -> None:
    from sqlalchemy.orm import Session
    from app.modules.doc_templates import storage
    from app.modules.hr import doc_formatting as F
    from app.modules.hr import onboarding_package as P
    from app.modules.hr import onboarding_package_content as C
    db = Session(bind=bind)
    try:
        state = json.loads(_row(db, organization_id, job_id).value)
        state["status"] = "running"
        _save(db, organization_id, job_id, state)
        buf = io.BytesIO()
        with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
            for hire_id in state["new_hire_ids"]:
                hire = db.get(OnboardingNewHire, hire_id)
                if hire is None or hire.organization_id != organization_id:
                    state["failed"].append({"new_hire_id": hire_id, "reason": "not found"})
                    continue
                folder = (F.transliterate(hire.candidate_name or "").upper().replace(" ", "_") or f"NEW_HIRE_{hire.id}")
                folder = "".join(ch for ch in folder if ch.isalnum() or ch in "_-") + f"_{hire.id}"
                try:
                    for cat in C.CATEGORIES:
                        data, name, _s = P.document_file(db, hire, cat)
                        zf.writestr(f"{folder}/{name}", data)
                except Exception as e:                      # one hire's problem never stops the others
                    db.rollback()
                    logger.exception("bulk package for new hire %s failed", hire_id)
                    state["failed"].append({"new_hire_id": hire_id, "reason": str(e)[:200]})
                state["done"] += 1
                _save(db, organization_id, job_id, state)
        state["zip_key"] = storage.get_store().put(organization_id, f"onboarding-packages-{job_id}.zip", buf.getvalue())
        state["status"] = "completed"
        state["finished_at"] = datetime.utcnow().isoformat()
        _save(db, organization_id, job_id, state)
    except Exception:
        logger.exception("bulk package job %s failed", job_id)
        try:
            db.rollback()
            state = json.loads(_row(db, organization_id, job_id).value)
            state["status"] = "failed"
            _save(db, organization_id, job_id, state)
        except Exception:
            pass
    finally:
        db.close()


def job_zip(db, organization_id: int, job_id: str) -> Optional[bytes]:
    row = _row(db, organization_id, job_id)
    if row is None:
        raise HTTPException(404, "Job not found.")
    key = json.loads(row.value or "{}").get("zip_key")
    if not key:
        raise HTTPException(409, "The job has not finished yet.")
    from app.modules.doc_templates import storage
    return storage.get_store().get(key)
