"""Automatic preparation (and, if the organisation chooses, sending) of onboarding package documents.

Each package document has a trigger (onboarding_document_rules.TRIGGERS): when the new hire is created, when they submit
their details in the portal, or a number of days before their start date. ``manual`` (the default of every existing row)
means HR sends it, exactly as before.

When a trigger fires, the hire's documents with that trigger that have not been sent yet are checked:

* mode ``review`` (the default): documents that are ready are put in the hire's *prepared* queue and HR is notified once
  ("3 documents are ready to send for Asha Rao"); HR sends them with one click from the new hire's documents panel.
* mode ``auto``: documents that are ready are sent at once (the new hire gets the usual e-mail with their portal link).

A document that is not ready (a missing value, missing clause wording, nobody to countersign) is never sent. HR is notified
with what is missing, and it is checked again when the new hire submits their details and every morning, so it goes into
the queue (or out, in ``auto``) as soon as the gap is filled.

Nothing here re-sends a document: a document already sent stays with the hire (onboarding_package.send_package never
re-issues). Every run is recorded on the hire (``_package.automation``) and in the onboarding activity log.

Settings are one `organization_configs` row per organisation (CONFIG_KEY). Runs happen on a background thread with their
own database session (inline under pytest) and never break the action that triggered them.
"""
from __future__ import annotations

import hashlib
import json
import logging
import sys
import threading
from datetime import date, datetime
from typing import Optional

from fastapi import HTTPException

from app.modules.hr.models import OnboardingNewHire, OrganizationConfig

logger = logging.getLogger("zoiko.onboarding.automation")

CONFIG_KEY = "onboarding_doc_automation.config"
MODES = {"review": "Prepare the documents and wait for HR to send them",
         "auto": "Send the documents automatically as soon as they are ready"}
DEFAULTS = {"mode": "review", "notify_hr": True}
HISTORY = 20
RETRY = "retry"                     # re-check documents held earlier (details submitted, every morning)


# ── settings ─────────────────────────────────────────────────────────────────────────────────────────────────────────
def _row(db, organization_id: int):
    return db.query(OrganizationConfig).filter(OrganizationConfig.organization_id == organization_id,
                                               OrganizationConfig.key == CONFIG_KEY).first()


def settings(db, organization_id: int) -> dict:
    row = _row(db, organization_id)
    data = {}
    if row is not None and row.value:
        try:
            data = json.loads(row.value) or {}
        except (TypeError, ValueError):
            data = {}
    out = {**DEFAULTS, **{k: v for k, v in data.items() if k in DEFAULTS}}
    if out["mode"] not in MODES:
        out["mode"] = DEFAULTS["mode"]
    out["modes"] = [{"value": k, "label": v} for k, v in MODES.items()]
    return out


def save_settings(db, actor, data: dict) -> dict:
    from app.modules.doc_templates import access
    access.require_hr(actor)
    data = data or {}
    current = {k: v for k, v in settings(db, actor.organization_id).items() if k in DEFAULTS}
    if "mode" in data:
        if data["mode"] not in MODES:
            raise HTTPException(422, f"Choose one of: {', '.join(MODES)}.")
        current["mode"] = data["mode"]
    if "notify_hr" in data:
        current["notify_hr"] = bool(data["notify_hr"])
    row = _row(db, actor.organization_id)
    if row is None:
        row = OrganizationConfig(organization_id=actor.organization_id, key=CONFIG_KEY, category="onboarding_package",
                                 description="Automatic preparation and sending of onboarding documents")
        db.add(row)
    row.value = json.dumps(current)
    db.commit()
    from app.modules.hr import onboarding_package_org as ORG
    ORG.audit(db, actor, "onboarding_automation_saved", current)
    return settings(db, actor.organization_id)


# ── which documents a trigger covers ─────────────────────────────────────────────────────────────────────────────────
def _pkg(hire) -> dict:
    return dict((hire.profile_details or {}).get("_package") or {})


def _save_pkg(hire, pkg: dict) -> None:
    details = dict(hire.profile_details or {})
    details["_package"] = pkg
    hire.profile_details = details


def _due(row, trigger: str, hire, today: date) -> bool:
    when = row.send_when or "manual"
    if trigger == "days_before_start":
        if when != "days_before_start":
            return False
        start = getattr(hire, "joining_date", None)
        if start is None:
            return False
        return (start - today).days <= int(row.send_days_before or 0)
    return when == trigger


def documents_for(db, hire, trigger: str, today: Optional[date] = None) -> list[dict]:
    """The hire's package documents this trigger covers that have not been sent yet (plus, on a retry or a later trigger,
    the ones held earlier by automation)."""
    from app.modules.hr import onboarding_package as P
    from app.modules.hr import onboarding_package_org as ORG
    today = today or date.today()
    rows = {r.category: r for r in ORG.rows_for(db, hire.organization_id)}
    issued = P._rows(db, hire)
    held_before = set((_pkg(hire).get("auto_held") or {}).keys())
    out = []
    for d in ORG.documents_for_hire(db, hire):
        cat = d["category"]
        r = rows.get(cat)
        if r is None:
            continue
        if P._row_state(db, issued.get(cat)) not in ("not_sent", "declined"):
            continue
        if _due(r, trigger, hire, today) or (cat in held_before and trigger != "hire_created"):
            out.append(d)
    return out


def has_trigger(db, organization_id: int, trigger: str) -> bool:
    from app.modules.hr import onboarding_package_org as ORG
    return any(r.enabled and (r.send_when or "manual") == trigger for r in ORG.rows_for(db, organization_id))


# ── running ──────────────────────────────────────────────────────────────────────────────────────────────────────────
def run(db, hire, trigger: str, *, today: Optional[date] = None) -> dict:
    """Prepare (review) or send (auto) the documents `trigger` covers. Returns {trigger, mode, issued, queued, held}."""
    from app.modules.hr import onboarding_flow
    from app.modules.hr import onboarding_package as P
    result = {"trigger": trigger, "mode": None, "issued": [], "queued": [], "held": []}
    if hire is None or hire.is_deleted or hire.status not in onboarding_flow.ACTIVE_STATUSES:
        return result
    cfg = settings(db, hire.organization_id)
    result["mode"] = cfg["mode"]
    with P.values_cache(db):
        docs = documents_for(db, hire, trigger, today)
        if not docs:
            return result
        cats = [d["category"] for d in docs]
        pkg = _pkg(hire)
        if cfg["mode"] == "auto":
            pkg["auto_release"] = True                     # documents held for the new hire's details go out once entered
            _save_pkg(hire, pkg)
            db.commit()
            res = P.send_package(db, hire, None, cats, notify=True, automatic=True)
            result["issued"] = [i["category"] for i in res.get("issued") or []]
            held = {h["category"]: h for h in res.get("held") or []}
        else:
            ready, held = [], {}
            p_cfg = P._config_for(db, hire.organization_id)
            for d in docs:
                ctx = P.render_context(db, hire, d["category"], cfg=p_cfg, final=True, fresh=True)
                gaps = P.with_countersign_gap(db, hire, d, P.readiness(ctx, d["category"]))
                if gaps["ready"]:
                    ready.append(d["category"])
                else:
                    held[d["category"]] = {"category": d["category"], "title": d["title"], **gaps}
            result["queued"] = ready
        pkg = _pkg(hire)                                   # (send_package may have changed it)
        queue = dict(pkg.get("queued") or {})
        now = datetime.utcnow().isoformat()
        for cat in result["queued"]:
            queue.setdefault(cat, {"trigger": trigger, "at": now})
        for cat in result["issued"]:
            queue.pop(cat, None)
        auto_held = dict(pkg.get("auto_held") or {})
        for cat in cats:
            auto_held.pop(cat, None)
        for cat, h in held.items():
            auto_held[cat] = {"trigger": trigger, "at": now, "missing_fields": list(h.get("missing_fields") or []),
                              "missing_clauses": list(h.get("missing_clauses") or [])}
        result["held"] = sorted(held)
        pkg["queued"], pkg["auto_held"] = queue, auto_held
        history = list(pkg.get("automation") or [])
        history.append({"trigger": trigger, "mode": cfg["mode"], "at": now, "issued": result["issued"],
                        "queued": result["queued"], "held": result["held"]})
        pkg["automation"] = history[-HISTORY:]
        _save_pkg(hire, pkg)
        db.commit()
        titles = {d["category"]: d["title"] for d in docs}
        _log(db, hire, result, titles)
        if cfg.get("notify_hr"):
            _notify_hr(db, hire, result, titles, held)
    return result


def _log(db, hire, result: dict, titles: dict) -> None:
    from app.modules.hr.service import log_onboarding_activity
    parts = []
    if result["issued"]:
        parts.append("sent " + ", ".join(titles[c] for c in result["issued"]))
    if result["queued"]:
        parts.append("prepared for HR to send: " + ", ".join(titles[c] for c in result["queued"]))
    if result["held"]:
        parts.append("held (details missing): " + ", ".join(titles[c] for c in result["held"]))
    if parts:
        try:
            log_onboarding_activity(db, hire.id, "Documents prepared automatically", "; ".join(parts).capitalize() + ".",
                                    hire.organization_id)
        except Exception:
            db.rollback()
            logger.exception("automation activity log failed for new hire %s", hire.id)


def _notify_hr(db, hire, result: dict, titles: dict, held: dict) -> None:
    """One in-app notification to the organisation's admins and HR admins, only when something new happened."""
    from app.modules.hr import hr_notifications as N
    from app.modules.hr import onboarding_flow
    pkg = _pkg(hire)
    signature = hashlib.sha256(json.dumps([result["issued"], sorted((pkg.get("queued") or {}).keys()),
                                           sorted((pkg.get("auto_held") or {}).items())], sort_keys=True, default=str)
                               .encode("utf-8")).hexdigest()[:16]
    if not (result["issued"] or result["queued"] or result["held"]) or pkg.get("notified") == signature:
        return
    admins = [e.id for e in onboarding_flow._admins(db, hire.organization_id)]
    if not admins:
        return
    link = f"/zoiko-hr/onboarding/documents?hire={hire.id}"
    name = hire.candidate_name or "a new hire"
    if result["issued"]:
        N.notify_employee(db, hire.organization_id, admins, "onboarding.documents_sent", link=link,
                          title=f"{len(result['issued'])} document(s) to {name}")
    if result["queued"]:
        N.notify_employee(db, hire.organization_id, admins, "onboarding.documents_ready", link=link,
                          title=f"{len(result['queued'])} document(s) for {name}")
    if result["held"]:
        N.notify_employee(db, hire.organization_id, admins, "onboarding.documents_held", link=link,
                          title=f"{len(result['held'])} document(s) for {name}")
    pkg["notified"] = signature
    _save_pkg(hire, pkg)
    db.commit()


def run_safely(db, hire, trigger: str, *, today: Optional[date] = None) -> dict:
    try:
        return run(db, hire, trigger, today=today)
    except Exception:
        db.rollback()
        logger.exception("automatic documents (%s) failed for new hire %s", trigger, getattr(hire, "id", None))
        return {"trigger": trigger, "error": True, "issued": [], "queued": [], "held": []}


def dispatch(db, hire, trigger: str) -> None:
    """Fire a trigger for a hire without slowing the action that caused it: a background thread with its own session
    (inline under pytest). Does nothing when no document of the organisation uses the trigger and none is held."""
    try:
        held = bool(_pkg(hire).get("auto_held"))
        if not has_trigger(db, hire.organization_id, trigger) and not (held and trigger != "hire_created"):
            return
    except Exception:
        logger.exception("automation check failed for new hire %s", getattr(hire, "id", None))
        return
    if "pytest" in sys.modules:
        run_safely(db, hire, trigger)
        return
    bind, hire_id = db.get_bind(), hire.id
    threading.Thread(target=_run_in_thread, args=(bind, hire_id, trigger), name=f"onb-auto-{hire_id}", daemon=True).start()


def _run_in_thread(bind, hire_id: int, trigger: str) -> None:
    from sqlalchemy.orm import Session
    db = Session(bind=bind)
    try:
        run_safely(db, db.get(OnboardingNewHire, hire_id), trigger)
    finally:
        db.close()


# ── the daily walk ───────────────────────────────────────────────────────────────────────────────────────────────────
def run_daily(db, today: Optional[date] = None) -> int:
    """Every morning: documents due N days before the start date, and documents held earlier (checked again)."""
    from app.modules.hr import onboarding_flow
    from app.modules.hr.docs_setup_models import OrgPackageDocument
    today = today or date.today()
    orgs = {oid for (oid,) in db.query(OrgPackageDocument.organization_id)
            .filter(OrgPackageDocument.send_when.isnot(None), OrgPackageDocument.send_when != "manual").distinct().all()}
    done = 0
    for org_id in sorted(orgs):
        hires = (db.query(OnboardingNewHire).filter(OnboardingNewHire.organization_id == org_id,
                                                    OnboardingNewHire.is_deleted == False,  # noqa: E712
                                                    OnboardingNewHire.status.in_(onboarding_flow.ACTIVE_STATUSES)).all())
        for hire in hires:
            if has_trigger(db, org_id, "days_before_start"):
                r = run_safely(db, hire, "days_before_start", today=today)
                done += len(r["issued"]) + len(r["queued"])
            if _pkg(hire).get("auto_held"):
                r = run_safely(db, hire, RETRY, today=today)
                done += len(r["issued"]) + len(r["queued"])
    return done


def daily_job() -> None:
    from app.database import SessionLocal
    db = SessionLocal()
    try:
        n = run_daily(db)
        if n:
            logger.info("[onboarding] %d document(s) prepared or sent automatically", n)
    except Exception:
        logger.exception("onboarding document automation job failed")
    finally:
        db.close()


# ── HR's view and the one-click send ─────────────────────────────────────────────────────────────────────────────────
def hire_view(db, hire, documents: list) -> dict:
    """What the documents panel shows: documents prepared and waiting for HR, and documents held with what is missing."""
    pkg = _pkg(hire)
    unsent = {d["category"] for d in documents if d.get("state") in ("not_sent", "declined")}
    ready = {d["category"] for d in documents if d.get("ready")}
    queued = [c for c in (pkg.get("queued") or {}) if c in unsent and c in ready]
    held = [c for c in (pkg.get("auto_held") or {}) if c in unsent]
    last = (pkg.get("automation") or [None])[-1]
    return {"mode": settings(db, hire.organization_id)["mode"], "queued": queued, "held": held, "last_run": last}


def send_queued(db, hire, actor, categories: Optional[list] = None) -> dict:
    """HR's one click: send the documents automation prepared (or the chosen ones among them)."""
    from app.modules.hr import onboarding_package as P
    pkg = _pkg(hire)
    queue = dict(pkg.get("queued") or {})
    cats = [c for c in queue if not categories or c in categories]
    if not cats:
        raise HTTPException(409, "No prepared documents are waiting to be sent.")
    res = P.send_package(db, hire, actor, cats)
    pkg = _pkg(hire)
    queue = dict(pkg.get("queued") or {})
    for i in res.get("issued") or []:
        queue.pop(i["category"], None)
    pkg["queued"] = queue
    _save_pkg(hire, pkg)
    db.commit()
    return res
