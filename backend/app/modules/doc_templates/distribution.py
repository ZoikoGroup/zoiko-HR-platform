"""Policy distribution (HR-DOC-014) and bulk generation.

Publishing never half-issues: every recipient is preflighted first and, if any recipient is blocked, nothing is generated
unless HR explicitly confirms a partial publish after seeing the per-person results. New joiners who match a published
audience receive the policy automatically (jobs.new_joiners_job; there is no employee-created event to subscribe to).
"""
from __future__ import annotations

import logging
from datetime import datetime
from typing import Optional

from fastapi import HTTPException
from sqlalchemy import or_

from app.modules.doc_templates import access, governance, preflight, registry, service, state
from app.modules.doc_templates.models import DocumentBulkRun, GeneratedDocument, PolicyDistribution, TemplateDefinition

logger = logging.getLogger("zoiko.doc_templates")
AUDIENCE_TYPES = ("all", "departments", "designations", "employment_types", "locations", "employees")
MAX_BULK = 200


def _clean_audience(a) -> dict:
    if not isinstance(a, dict) or a.get("type", "all") not in AUDIENCE_TYPES:
        raise HTTPException(422, f"audience.type must be one of {', '.join(AUDIENCE_TYPES)}.")
    t = a.get("type", "all")
    ids = a.get("ids") or []
    if t != "all" and (not isinstance(ids, list) or not ids):
        raise HTTPException(422, "Choose at least one audience value.")
    return {"type": t, "ids": ids[:5000] if t != "all" else []}


def audience_employees(db, organization_id: int, audience: dict) -> list:
    from app.modules.employee.models import Employee, EmployeeStatus
    q = db.query(Employee).filter(Employee.organization_id == organization_id, Employee.is_active.is_(True),
                                  Employee.status.in_([EmployeeStatus.ACTIVE, EmployeeStatus.ON_LEAVE]))
    t, ids = audience.get("type", "all"), audience.get("ids") or []
    if t == "departments":
        q = q.filter(Employee.department_id.in_([int(i) for i in ids]))
    elif t == "designations":
        q = q.filter(Employee.designation_id.in_([int(i) for i in ids]))
    elif t == "employment_types":
        from app.modules.employee.models import EmploymentType
        q = q.filter(Employee.employment_type.in_([EmploymentType(i) for i in ids if i in {e.value for e in EmploymentType}]))
    elif t == "locations":
        vals = [str(i) for i in ids]
        q = q.filter(or_(Employee.work_country.in_([v.upper() for v in vals]), Employee.work_city.in_(vals)))
    elif t == "employees":
        q = q.filter(Employee.id.in_([int(i) for i in ids]))
    return q.order_by(Employee.id).all()


def get(db, actor, dist_id: int) -> PolicyDistribution:
    access.require_hr(actor)
    d = db.get(PolicyDistribution, dist_id)
    if d is None or d.organization_id != actor.organization_id:
        raise HTTPException(404, "Distribution not found")
    return d


def serialize(db, d: PolicyDistribution) -> dict:
    return {"id": d.id, "canonical_id": d.canonical_id, "title": d.title, "variant_id": d.variant_id, "version": d.version,
            "variant_checksum": d.variant_checksum, "audience": d.audience, "requires": d.requires, "due_date": d.due_date,
            "reminder_days": d.reminder_days, "auto_include_new_joiners": d.auto_include_new_joiners, "status": d.status,
            "published_by": d.published_by, "published_at": d.published_at, "closed_at": d.closed_at,
            "stats": governance.distribution_stats(db, d) if d.status != "DRAFT" else None, "last_results": d.last_results,
            "previous_distribution_id": d.previous_distribution_id, "kb_sync_status": d.kb_sync_status, "kb_synced_at": d.kb_synced_at,
            "created_at": d.created_at}


def create(db, actor, data: dict) -> PolicyDistribution:
    access.require_hr(actor)
    definition = db.get(TemplateDefinition, data.get("canonical_id") or "")
    if definition is None or definition.output_mode != "POLICY" or definition.canonical_id in registry.SYSTEM_RECORDS:
        raise HTTPException(422, "Choose a policy template.")
    if not definition.implemented:
        raise HTTPException(409, {"code": "NOT_IMPLEMENTED", "message": "This policy template is not available yet."})
    requires = data.get("requires") or "ACKNOWLEDGE"
    if requires not in ("ACKNOWLEDGE", "SIGN"):
        raise HTTPException(422, "requires must be ACKNOWLEDGE or SIGN.")
    d = PolicyDistribution(organization_id=actor.organization_id, canonical_id=definition.canonical_id,
                           title=(data.get("title") or definition.title)[:255], audience=_clean_audience(data.get("audience") or {"type": "all"}),
                           requires=requires, due_date=data.get("due_date"), reminder_days=data.get("reminder_days") or [7, 1],
                           auto_include_new_joiners=bool(data.get("auto_include_new_joiners", True)), status="DRAFT",
                           created_by=actor.id)
    db.add(d)
    db.commit()
    return d


def update(db, actor, d: PolicyDistribution, data: dict) -> PolicyDistribution:
    if d.status != "DRAFT":
        raise HTTPException(409, "Only a draft distribution can be edited.")
    if "audience" in data:
        d.audience = _clean_audience(data["audience"])
    for k in ("title", "due_date", "reminder_days", "auto_include_new_joiners"):
        if k in data:
            setattr(d, k, data[k])
    if data.get("requires") in ("ACKNOWLEDGE", "SIGN"):
        d.requires = data["requires"]
    db.commit()
    return d


def _check_all(db, actor, d: PolicyDistribution, people) -> list[dict]:
    results = []
    for emp in people:
        r = preflight.run_preflight(db, organization_id=actor.organization_id, actor=actor, canonical_id=d.canonical_id,
                                    subject_type="employee", subject_id=emp.id, organization=actor.organization)
        results.append({"employee_id": emp.id, "outcome": r.outcome, "reasons": r.reasons, "missing_fields": r.missing_fields})
    return results


def publish(db, actor, d: PolicyDistribution, *, confirm_partial: bool = False) -> dict:
    access.require_hr(actor)
    if d.status != "DRAFT":
        raise HTTPException(409, "This distribution was already published.")
    people = audience_employees(db, actor.organization_id, d.audience)
    if not people:
        raise HTTPException(422, "Nobody matches this audience.")
    checks = _check_all(db, actor, d, people)
    blocked = [c for c in checks if c["outcome"] != preflight.ALLOW]
    if blocked and (not confirm_partial or len(blocked) == len(checks)):
        d.last_results = checks
        db.commit()
        return {"published": False, "results": checks, "blocked": len(blocked), "ready": len(checks) - len(blocked),
                "message": "Some recipients are blocked. Fix them, or confirm to publish to the others only."}
    d.status, d.published_by, d.published_at = "PUBLISHED", actor.id, datetime.utcnow()
    db.commit()
    ok_ids = {c["employee_id"] for c in checks if c["outcome"] == preflight.ALLOW}
    results = [c for c in checks if c["employee_id"] not in ok_ids]
    if len(ok_ids) > BACKGROUND_OVER:
        # every recipient was checked above; rendering and delivery run in the background (progress in last_results)
        d.last_results = results
        db.commit()
        ids = sorted(ok_ids)
        run_in_background(lambda s, a: _deliver_all(s, a, s.get(PolicyDistribution, d.id), ids, list(results)), actor.id)
        return {"published": True, "in_progress": True, "results": results, "blocked": len(blocked), "ready": len(ok_ids)}
    results = _deliver_all(db, actor, d, [e.id for e in people if e.id in ok_ids], results)
    return {"published": True, "results": results, "blocked": len(blocked), "ready": len(ok_ids)}


def _deliver_all(db, actor, d: PolicyDistribution, employee_ids: list[int], results: list) -> list:
    from app.modules.employee.models import Employee
    for n, eid in enumerate(employee_ids, start=1):
        results.append(_deliver_one(db, actor, d, db.get(Employee, eid)))
        if n % 25 == 0:
            d.last_results = list(results)
            db.commit()
    d.last_results = results
    db.commit()
    from app.modules.doc_templates import hooks
    hooks.send(db, "policy_published", actor, d)          # knowledge-base sync, closing a superseded campaign
    return results


def _deliver_one(db, actor, d: PolicyDistribution, emp) -> dict:
    try:
        doc = service.generate(db, actor, canonical_id=d.canonical_id, subject_type="employee", subject_id=emp.id,
                               distribution_id=d.id)
        if d.variant_id is None:
            d.variant_id, d.version, d.variant_checksum = doc.variant_id, doc.variant_version, doc.variant_checksum
        if d.requires == "SIGN":
            doc.execution_mode = "SIGN_EMPLOYEE"
        if d.due_date:
            doc.due_by = datetime.combine(d.due_date, datetime.min.time())
            doc.expires_at = None
        doc.reminder_days = d.reminder_days
        db.commit()
        if doc.status == "RENDERED_DRAFT":
            service.issue(db, doc, actor)
        return {"employee_id": emp.id, "outcome": preflight.ALLOW, "document_id": doc.id, "status": doc.status}
    except HTTPException as exc:
        db.rollback()
        detail = exc.detail if isinstance(exc.detail, dict) else {"message": str(exc.detail)}
        return {"employee_id": emp.id, "outcome": detail.get("outcome", "ERROR"), "reasons": detail.get("reasons") or [detail.get("message")]}


def close(db, actor, d: PolicyDistribution) -> PolicyDistribution:
    access.require_hr(actor)
    if d.status != "PUBLISHED":
        raise HTTPException(409, "Only a published distribution can be closed.")
    d.status, d.closed_at = "CLOSED", datetime.utcnow()
    db.commit()
    return d


def include_new_joiners(db, d: PolicyDistribution) -> int:
    """Generate and issue the policy for audience members who joined after publication (scheduled job)."""
    from app.modules.employee.models import Employee
    publisher = db.get(Employee, d.published_by) if d.published_by else None
    if publisher is None or not publisher.is_active or access.role_of(publisher) not in registry.HR_ROLES:
        return 0
    have = {r[0] for r in db.query(GeneratedDocument.subject_id).filter(GeneratedDocument.distribution_id == d.id).all()}
    count = 0
    for emp in audience_employees(db, d.organization_id, d.audience):
        if emp.id in have:
            continue
        result = _deliver_one(db, publisher, d, emp)
        count += int(result.get("outcome") == preflight.ALLOW)
    return count


# ── bulk generation ──────────────────────────────────────────────────────────────────────────────────────────────────

def bulk_generate(db, actor, *, canonical_id: str, subject_type: str, subject_ids: list, language: str = "en") -> DocumentBulkRun:
    access.require_hr(actor)
    ids = list(dict.fromkeys(int(i) for i in subject_ids or []))
    if not ids:
        raise HTTPException(422, "Choose at least one subject.")
    if len(ids) > MAX_BULK:
        raise HTTPException(422, f"At most {MAX_BULK} documents per run.")
    run = DocumentBulkRun(organization_id=actor.organization_id, canonical_id=canonical_id, subject_type=subject_type,
                          subject_ids=ids, requested_by=actor.id, status="RUNNING")
    db.add(run)
    db.commit()
    if len(ids) > BACKGROUND_OVER:
        # large runs render in the background; GET /bulk-runs/{id} reports progress
        start_background(run.id, actor.id, language)
        return run
    return _run_bulk(db, actor, run, language)


BACKGROUND_OVER = 20
BULK_INLINE = False                  # tests run background work in-line for determinism
SESSION_FACTORY = None               # defaults to app.database.SessionLocal


def start_background(run_id: int, actor_id: int, language: str) -> None:
    run_in_background(lambda s, a: _run_bulk(s, a, s.get(DocumentBulkRun, run_id), language), actor_id,
                      on_error=lambda s: _fail_run(s, run_id))


def _fail_run(s, run_id: int) -> None:
    run = s.get(DocumentBulkRun, run_id)
    if run is not None:
        run.status = "FAILED"
        s.commit()


def run_in_background(job, actor_id: int, on_error=None) -> None:
    """Run job(session, actor) on its own session, in a worker thread (or in-line when BULK_INLINE is set for tests)."""
    def work():
        from app.database import SessionLocal
        from app.modules.employee.models import Employee
        s = (SESSION_FACTORY or SessionLocal)()
        try:
            job(s, s.get(Employee, actor_id))
        except Exception:
            logger.exception("doc_templates background job failed")
            s.rollback()
            if on_error:
                on_error(s)
        finally:
            if SESSION_FACTORY is None:
                s.close()
    if BULK_INLINE:
        work()
        return
    import threading
    threading.Thread(target=work, name="doc-templates-bulk", daemon=True).start()


def _run_bulk(db, actor, run: DocumentBulkRun, language: str) -> DocumentBulkRun:
    canonical_id, subject_type, ids = run.canonical_id, run.subject_type, list(run.subject_ids or [])
    results = []
    for sid in ids:
        try:
            doc = service.generate(db, actor, canonical_id=canonical_id, subject_type=subject_type, subject_id=sid, language=language)
            results.append({"subject_id": sid, "outcome": preflight.ALLOW, "document_id": doc.id, "status": doc.status})
        except HTTPException as exc:
            db.rollback()
            detail = exc.detail if isinstance(exc.detail, dict) else {"message": str(exc.detail)}
            results.append({"subject_id": sid, "outcome": detail.get("outcome", "ERROR"),
                            "reasons": detail.get("reasons") or [detail.get("message")], "missing_fields": detail.get("missing_fields")})
        if len(results) % 10 == 0:                       # progress for the background view
            r = db.get(DocumentBulkRun, run.id)
            r.results = list(results)
            db.commit()
    run = db.get(DocumentBulkRun, run.id)
    run.results, run.status, run.finished_at = results, "DONE", datetime.utcnow()
    db.commit()
    return run
