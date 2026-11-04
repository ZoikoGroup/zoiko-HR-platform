"""Go-live tooling for the template engine (Prompt 4 §C): the documents action centre, automation settings, the country
activation kit (with the counsel review pack), retention operations, legacy documents, reporting, language coverage and the
platform's emergency controls.

Nothing here reads or prints document contents: ids, numbers, titles of ordinary (C2) documents, statuses, dates and counts.
"""
from __future__ import annotations

import csv
import io
import logging
from collections import Counter, defaultdict
from datetime import date, datetime, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import Response
from pydantic import BaseModel, Field
from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from app.core import regions
from app.core.dependencies import get_current_super_admin, get_current_user
from app.database import get_db
from app.modules.doc_templates import access, automation, governance, preflight, registry, starters, state
from app.modules.doc_templates.models import (DecisionReceipt, DocTemplateSettings, GeneratedDocument, JurisdictionPack, TemplateDefinition,
                                              TemplateVariant)

logger = logging.getLogger("zoiko.doc_templates")
SMALL_GROUP = 3                      # department figures for fewer people than this are suppressed (privacy, small-group rule)
DONE = ("ACKNOWLEDGED", "EXECUTED", "RETAINED")


def _label(doc: GeneratedDocument) -> str:
    return doc.title if doc.sensitivity == "C2" else "Confidential document"


# ── 1. documents action centre ───────────────────────────────────────────────────────────────────────────────────────

ACTION_TEXT = {"ACKNOWLEDGE": "acknowledge", "SIGN_EMPLOYEE": "sign", "SIGN_BOTH": "sign", "SIGN_CANDIDATE": "sign"}


def my_actions(db, user) -> dict:
    from app.modules.hr.models import Appraisal, ProbationReview
    docs = (db.query(GeneratedDocument).filter(access.list_filter(db, user), GeneratedDocument.recipient_employee_id == user.id,
                                               GeneratedDocument.status == "ISSUED", GeneratedDocument.execution_mode != "NONE")
            .order_by(GeneratedDocument.due_by.is_(None), GeneratedDocument.due_by).limit(200).all())
    now = datetime.utcnow()
    items = [{"kind": "document", "document_id": d.id, "document_number": d.document_number, "title": _label(d),
              "action": ACTION_TEXT.get(d.execution_mode, "review"), "due_by": d.due_by, "overdue": bool(d.due_by and d.due_by < now),
              "link": f"/employee/documents/company?generated={d.id}"} for d in docs]
    for r in db.query(ProbationReview).filter(ProbationReview.employee_id == user.id, ProbationReview.status == "SUBMITTED").all():
        items.append({"kind": "probation_review", "id": r.id, "title": f"Probation review {r.review_number}: add your comments",
                      "action": "complete", "due_by": None, "overdue": False, "link": "/employee/performance"})
    for a in db.query(Appraisal).filter(Appraisal.employee_id == user.id, Appraisal.self_submitted_at.is_(None),
                                        Appraisal.finalised_at.is_(None)).all():
        items.append({"kind": "self_assessment", "id": a.id, "title": f"Self-assessment for {a.cycle}", "action": "complete",
                      "due_by": None, "overdue": False, "link": "/employee/performance"})
    return {"items": items, "count": len(items), "overdue": sum(1 for i in items if i["overdue"])}


def team_actions(db, user) -> dict:
    """What a manager (or HR) has to do for their team: reviews, assessments, plans and decisions waiting on them."""
    from app.modules.hr.models import (Appraisal, AttendanceCorrectionRequest, EmployeeLifecycle, LeaveRequest, OnboardingChecklistItem,
                                       OvertimeRequest, PerformanceImprovementPlan, RequestStatus)
    if not (access.is_hr(user) or access.role_of(user) == "manager"):
        raise HTTPException(404, "Not found")
    team = list(access.report_ids(db, user)) if not access.is_hr(user) else None
    scope = (lambda col: col.in_(team or [-1])) if team is not None else (lambda col: col.isnot(None))
    org = user.organization_id
    out = []
    for i in db.query(OnboardingChecklistItem).filter(OnboardingChecklistItem.organization_id == org, OnboardingChecklistItem.completed.is_(False),
                                                     OnboardingChecklistItem.assignee_employee_id == user.id).limit(200).all():
        out.append({"kind": "checklist" if i.item_key != "probation_review" else "probation_review", "id": i.id, "title": i.title,
                    "due_by": i.due_date, "link": "/zoiko-hr/performance/probation"})
    for a in db.query(Appraisal).filter(Appraisal.organization_id == org, Appraisal.reviewer_id == user.id, Appraisal.manager_submitted_at.is_(None),
                                        Appraisal.finalised_at.is_(None)).all():
        out.append({"kind": "manager_assessment", "id": a.id, "title": f"Manager assessment for employee #{a.employee_id} ({a.cycle})",
                    "due_by": None, "link": "/zoiko-hr/performance/appraisals"})
    if access.is_hr(user):
        for p in db.query(PerformanceImprovementPlan).filter(PerformanceImprovementPlan.organization_id == org,
                                                             PerformanceImprovementPlan.status == "PENDING_HR_APPROVAL").all():
            if user.id not in (p.manager_id, p.created_by):
                out.append({"kind": "pip_approval", "id": p.id, "title": f"Improvement plan for employee #{p.employee_id} needs HR approval",
                            "due_by": None, "link": "/zoiko-hr/performance/pips"})
    for model, kind, title in ((OvertimeRequest, "overtime", "Overtime request"), (AttendanceCorrectionRequest, "correction", "Attendance correction")):
        for r in db.query(model).filter(model.organization_id == org, model.status == "PENDING", scope(model.employee_id),
                                        model.employee_id != user.id, model.requested_by != user.id).limit(200).all():
            out.append({"kind": kind, "id": r.id, "title": f"{title} from employee #{r.employee_id}", "due_by": None,
                        "link": "/zoiko-hr/attendance/time-requests"})
    for lv in db.query(LeaveRequest).filter(LeaveRequest.organization_id == org, LeaveRequest.status == RequestStatus.PENDING,
                                            scope(LeaveRequest.employee_id), LeaveRequest.employee_id != user.id).limit(200).all():
        out.append({"kind": "leave", "id": lv.id, "title": f"Leave request LV-{org}-{lv.id:04d}", "due_by": lv.start_date,
                    "link": "/zoiko-hr/leave/requests"})
    for ev in db.query(EmployeeLifecycle).filter(EmployeeLifecycle.organization_id == org, EmployeeLifecycle.status == "pending",
                                                 scope(EmployeeLifecycle.employee_id), EmployeeLifecycle.employee_id != user.id,
                                                 or_(EmployeeLifecycle.initiated_by.is_(None), EmployeeLifecycle.initiated_by != user.id)).limit(200).all():
        if ev.event_type in ("promotion", "role_change", "department_change", "transfer", "manager_change", "probation_extended",
                             "confirmation", "probation_end") and (access.is_hr(user) or ev.event_type == "transfer"):
            out.append({"kind": "change", "id": ev.id, "title": f"{ev.event_type.replace('_', ' ').capitalize()} for employee #{ev.employee_id}",
                        "due_by": ev.effective_date, "link": "/zoiko-hr/employee-changes"})
    return {"items": out, "count": len(out)}


def notify_in_app(db, doc: GeneratedDocument, person) -> None:
    """The in-app notifications inbox gets an ID-only entry when a document needs the person's action."""
    try:
        from app.modules.super_admin.models import Notification, NotificationTarget
        n = Notification(title="A document needs your action", message=f"Document {doc.document_number} is waiting for you in Zoiko HR.",
                         notification_type="document", priority="normal", target_type="user", channels=["in_app"],
                         sender_name="Zoiko HR", status="sent", sent_at=datetime.utcnow())
        n.targets = [NotificationTarget(kind="user", ref=str(person.id))]
        db.add(n)
        db.commit()
    except Exception:
        db.rollback()
        logger.warning("in-app notification failed for document id %s", doc.id)


# ── 3. country activation kit ────────────────────────────────────────────────────────────────────────────────────────

def countries_in_use(db, organization_id: int) -> list[str]:
    from app.modules.employee.models import Employee
    from app.modules.hr.models import RecruitmentOffer
    found = {c for (c,) in db.query(Employee.work_country).filter(Employee.organization_id == organization_id, Employee.work_country.isnot(None)).distinct()}
    found |= {c for (c,) in db.query(RecruitmentOffer.work_country).filter(RecruitmentOffer.organization_id == organization_id,
                                                                          RecruitmentOffer.work_country.isnot(None)).distinct()}
    return sorted(c.upper() for c in found if c)


def clause_catalogue() -> dict:
    """clause key -> {used_by: [cid], mandatory_in: [cid], starter_text: bool, title}"""
    out: dict = {}
    for cid, s in sorted(starters.STARTERS.items()):
        for kind in ("mandatory", "optional"):
            for key in s["clause_rules"][kind]:
                row = out.setdefault(key, {"used_by": [], "mandatory_in": [], "starter_text": key in starters.STARTER_CLAUSES,
                                           "title": (starters.STARTER_CLAUSES.get(key) or {}).get("title")})
                row["used_by"].append(cid)
                if kind == "mandatory":
                    row["mandatory_in"].append(cid)
    return out


def country_status(db, user, country: str) -> dict:
    """Which implemented templates can be used for people working in `country`, which are blocked and why, and the clauses."""
    access.require_hr(user)
    org, today, country = user.organization_id, date.today(), country.upper()
    packs = preflight.candidate_packs(db, org, country, None, today)
    pack_ids = [p.id for p in packs]
    templates = []
    clause_state: dict = {}
    for d in db.query(TemplateDefinition).filter(TemplateDefinition.implemented.is_(True)).order_by(TemplateDefinition.canonical_id).all():
        if d.canonical_id in registry.SYSTEM_RECORDS:
            continue
        reasons = []
        variant = None
        if not packs:
            reasons.append("NO_ACTIVE_PACK")
        else:
            variant = (db.query(TemplateVariant).filter(TemplateVariant.canonical_id == d.canonical_id, TemplateVariant.pack_id.in_(pack_ids),
                                                        TemplateVariant.status == "ACTIVE",
                                                        or_(TemplateVariant.owner_organization_id == org, TemplateVariant.owner_organization_id.is_(None)))
                       .order_by(TemplateVariant.owner_organization_id.is_(None), TemplateVariant.version.desc()).first())
            if variant is None:
                reasons.append("NO_ACTIVE_VARIANT")
            elif variant.release_mode == "TENANT_ATTESTED" and not preflight.tenant_attestation_allowed(db, org, d.legal_risk):
                reasons.append("TENANT_ATTESTATION_DISABLED")
        rules = (variant.clause_rules if variant else (starters.STARTERS.get(d.canonical_id) or {}).get("clause_rules")) or {}
        for key in rules.get("mandatory") or []:
            released = bool(variant) and preflight.find_clause(db, org, key, variant.pack_id, variant.language, today) is not None
            if not released and packs:
                released = any(preflight.find_clause(db, org, key, pid, "en", today) is not None for pid in pack_ids)
            clause_state[key] = clause_state.get(key, False) or released
            if not released:
                reasons.append(f"CLAUSE_UNRESOLVED:{key}")
        templates.append({"canonical_id": d.canonical_id, "title": d.title, "legal_risk": d.legal_risk, "unlocked": not reasons,
                          "reasons": reasons, "variant": ({"id": variant.id, "version": variant.version, "release_mode": variant.release_mode}
                                                         if variant else None)})
    cat = clause_catalogue()
    clauses = [{"clause_key": k, **v, "released": clause_state.get(k, False) or (bool(packs) and any(
        preflight.find_clause(db, org, k, pid, "en", today) is not None for pid in pack_ids))} for k, v in sorted(cat.items())]
    unlocked = sum(1 for t in templates if t["unlocked"])
    return {"country": country, "country_name": regions.country_name(country) or country,
            "packs": [{"id": p.id, "scope_type": p.scope_type, "status": p.status, "region": p.region} for p in packs],
            "templates": templates, "unlocked": unlocked, "total": len(templates),
            "progress": round(unlocked / len(templates) * 100) if templates else 0, "clauses": clauses,
            "clauses_to_write": sum(1 for c in clauses if not c["released"] and not c["starter_text"] and c["mandatory_in"])}


def activation_overview(db, user) -> dict:
    access.require_hr(user)
    rows = []
    for c in countries_in_use(db, user.organization_id):
        s = country_status(db, user, c)
        rows.append({k: s[k] for k in ("country", "country_name", "unlocked", "total", "progress", "clauses_to_write")} | {"packs": s["packs"]})
    return {"countries": rows}


def counsel_pack_rows(db, user, country: str) -> list[list]:
    s = country_status(db, user, country)
    header = ["Template", "Title", "Legal risk", "Clause key", "Mandatory", "Starter text", "Released in this country", "Note"]
    rows = [header]
    for t in s["templates"]:
        st = starters.STARTERS.get(t["canonical_id"]) or {}
        keys = (st.get("clause_rules") or {}).get("mandatory", []) + (st.get("clause_rules") or {}).get("optional", [])
        if not keys:
            rows.append([t["canonical_id"], t["title"], t["legal_risk"], "", "", "", "", "Review the starter wording"])
        for k in keys:
            sc = starters.STARTER_CLAUSES.get(k)
            released = not any(r == f"CLAUSE_UNRESOLVED:{k}" for r in t["reasons"])
            rows.append([t["canonical_id"], t["title"], t["legal_risk"], k, "yes" if k in st["clause_rules"]["mandatory"] else "no",
                         (sc or {}).get("text", "(no starter text: must be written for this country)"), "yes" if released else "no",
                         "Starter draft: review before release" if sc else "Write and return the clause text"])
    return rows


def counsel_pack_csv(db, user, country: str) -> str:
    buf = io.StringIO()
    w = csv.writer(buf)
    for r in counsel_pack_rows(db, user, country):
        w.writerow([governance._csv_safe(str(x)) for x in r])
    return buf.getvalue()


def counsel_pack_pdf(db, user, country: str) -> bytes:
    rows = counsel_pack_rows(db, user, country)
    rec = governance.Record("COUNSEL-PACK", f"Counsel review pack — {regions.country_name(country.upper()) or country.upper()}")
    rec.para("Every template Zoiko HR can produce, its starter wording and the clauses that must be written or confirmed for this "
             "country. Starter text is a draft, not legal advice. Return the reviewed or written clause text to your HR administrator; "
             "nothing is used until it is released in your jurisdiction pack.", "small")
    rec.table(rows[0], rows[1:])
    return governance.to_pdf(rec, user.organization)


def country_demand(db) -> list[dict]:
    """Platform report for Zoiko Legal: how many organizations employ people in each country (counts only)."""
    from app.modules.employee.models import Employee
    rows = (db.query(Employee.work_country, func.count(func.distinct(Employee.organization_id))).filter(Employee.work_country.isnot(None))
            .group_by(Employee.work_country).all())
    platform = {p.country for p in db.query(JurisdictionPack).filter(JurisdictionPack.scope_type == "PLATFORM", JurisdictionPack.status == "ACTIVE").all()}
    return sorted([{"country": c.upper(), "organizations": n, "platform_pack_active": c.upper() in platform} for c, n in rows if c],
                  key=lambda r: -r["organizations"])


# ── 5. retention and legal hold ──────────────────────────────────────────────────────────────────────────────────────

def _settings_row(db, organization_id) -> DocTemplateSettings:
    row = db.query(DocTemplateSettings).filter(DocTemplateSettings.organization_id == organization_id).first()
    if row is None:
        row = DocTemplateSettings(organization_id=organization_id)
        db.add(row)
        db.flush()
    return row


def retention_settings(db, user) -> dict:
    access.require_hr(user)
    keys = sorted({k for (k,) in db.query(TemplateDefinition.retention_rule_key).filter(TemplateDefinition.implemented.is_(True)).distinct() if k})
    row = db.query(DocTemplateSettings).filter(DocTemplateSettings.organization_id == user.organization_id).first()
    current = (row.retention_durations or {}) if row else {}
    return {"rules": [{"rule_key": k, "years": current.get(k)} for k in keys],
            "note": "Nothing is defaulted. Until a duration is set (here or in a counsel-approved pack), documents are kept and flagged "
                    "'retention not configured'. Disposal and destruction certificates (HR-DOC-020) are not part of this release."}


def save_retention(db, user, durations: dict) -> dict:
    access.require_org_admin(user)
    row = _settings_row(db, user.organization_id)
    current = dict(row.retention_durations or {})
    for k, years in (durations or {}).items():
        if years in (None, ""):
            current.pop(k, None)
            continue
        if not isinstance(years, (int, float)) or not (0 < years <= 100):
            raise HTTPException(422, f"Retention for {k} must be between 1 and 100 years.")
        current[k] = years
    row.retention_durations, row.updated_by = current, user.id
    db.commit()
    return retention_settings(db, user)


def retention_queue(db, user) -> dict:
    access.require_hr(user)
    org, today = user.organization_id, date.today()
    due = (db.query(GeneratedDocument).filter(GeneratedDocument.organization_id == org, GeneratedDocument.retention_until.isnot(None),
                                              GeneratedDocument.retention_until < today).order_by(GeneratedDocument.retention_until).limit(500).all())
    not_configured = db.query(func.count(GeneratedDocument.id)).filter(GeneratedDocument.organization_id == org,
                                                                       GeneratedDocument.retention_until.is_(None)).scalar()
    return {"due_for_review": [{"id": d.id, "document_number": d.document_number, "canonical_id": d.canonical_id, "status": d.status,
                                "retention_until": d.retention_until, "legal_hold": d.legal_hold} for d in due],
            "retention_not_configured": int(not_configured or 0)}


def retention_review(db, user, doc: GeneratedDocument, decision: str, years: Optional[int], note: Optional[str]) -> dict:
    access.require_hr(user)
    if decision not in ("keep", "extend"):
        raise HTTPException(422, "decision must be keep or extend (disposal is not part of this release).")
    if decision == "extend":
        if not years or years < 1:
            raise HTTPException(422, "Give the number of years to extend by.")
        base = doc.retention_until or date.today()
        doc.retention_until = date(base.year + int(years), base.month, min(base.day, 28))
    state.add_event(db, doc, "retention_reviewed", actor_id=user.id, detail={"decision": decision, "years": years, "legal_hold": doc.legal_hold})
    doc.retention_flagged_at = None
    db.commit()
    return {"id": doc.id, "retention_until": doc.retention_until}


# ── 4. legacy documents ──────────────────────────────────────────────────────────────────────────────────────────────

LEGACY_TYPE_MAP = {"employee_handbook": "HR-POL-001", "handbook": "HR-POL-001", "code_of_conduct": "HR-POL-002",
                   "confirmation_letter": "HR-PRF-004", "promotion_letter": "HR-CHG-004", "transfer_letter": "HR-CHG-007",
                   "pip": "HR-PRF-013", "salary_increase_letter": "HR-CMP-005", "appraisal": "HR-PRF-007"}


def legacy_summary(db, user) -> dict:
    access.require_hr(user)
    from app.modules.hr.models import HrDocument
    rows = (db.query(HrDocument.document_type, HrDocument.canonical_id, func.count(HrDocument.id))
            .filter(HrDocument.organization_id == user.organization_id, HrDocument.is_legacy.is_(True), HrDocument.is_deleted.is_(False))
            .group_by(HrDocument.document_type, HrDocument.canonical_id).all())
    return {"legacy": [{"document_type": t, "canonical_id": c, "count": n} for t, c, n in rows],
            "note": "Legacy uploads stay readable as they are. The canonical id is for reporting only; nothing is re-rendered."}


# ── 8. reporting ─────────────────────────────────────────────────────────────────────────────────────────────────────

def report(db, user) -> dict:
    access.require_hr(user)
    org, now = user.organization_id, datetime.utcnow()
    base = db.query(GeneratedDocument).filter(GeneratedDocument.organization_id == org)
    by_status = dict(db.query(GeneratedDocument.status, func.count(GeneratedDocument.id)).filter(GeneratedDocument.organization_id == org)
                     .group_by(GeneratedDocument.status).all())
    overdue = base.filter(GeneratedDocument.status == "ISSUED", GeneratedDocument.due_by.isnot(None), GeneratedDocument.due_by < now)
    overdue_split = Counter("signature" if d.execution_mode.startswith("SIGN") else "acknowledgement" for d in overdue.all()
                            if d.execution_mode != "NONE")
    executed = base.filter(GeneratedDocument.status == "EXECUTED", GeneratedDocument.issued_at.isnot(None)).all()
    hours = [((d.status_changed_at or now) - d.issued_at).total_seconds() / 3600 for d in executed if d.status_changed_at]
    from app.modules.employee.models import Employee
    from app.modules.hr.models import Department, LearningCertification
    depts = {d.id: d.name for d in db.query(Department).filter(Department.organization_id == org).all()}
    ack: dict = defaultdict(lambda: [0, 0])
    for d, dept_id in (db.query(GeneratedDocument, Employee.department_id).join(Employee, Employee.id == GeneratedDocument.subject_id)
                       .filter(GeneratedDocument.organization_id == org, GeneratedDocument.family_id == "HR-POL",
                               GeneratedDocument.distribution_id.isnot(None)).all()):
        key = depts.get(dept_id, "Unassigned")
        ack[key][1] += 1
        ack[key][0] += int(d.status in DONE)
    rates = [{"department": k, "rate": round(a / n * 100, 1), "recipients": n} if n >= SMALL_GROUP else
             {"department": k, "suppressed": True} for k, (a, n) in sorted(ack.items())]
    expiring = db.query(func.count(LearningCertification.id)).filter(LearningCertification.organization_id == org,
                                                                     LearningCertification.expiry_date.isnot(None),
                                                                     LearningCertification.expiry_date <= date.today() + timedelta(days=60),
                                                                     LearningCertification.expiry_date >= date.today()).scalar()
    blocked = Counter()
    for r in db.query(DecisionReceipt).filter(DecisionReceipt.organization_id == org, DecisionReceipt.outcome != "ALLOW",
                                              DecisionReceipt.created_at >= now - timedelta(days=90)).all():
        for code in r.reasons or []:
            blocked[str(code).split(":")[0] if not str(code).startswith(("MISSING_FIELD", "CLAUSE_UNRESOLVED")) else code] += 1
    return {"by_status": by_status, "overdue": dict(overdue_split), "average_hours_to_sign": round(sum(hours) / len(hours), 1) if hours else None,
            "policy_acknowledgement_by_department": rates, "certifications_expiring_60_days": int(expiring or 0),
            "blocked_generations_90_days": [{"reason": k, "count": v} for k, v in blocked.most_common(25)],
            "small_group_threshold": SMALL_GROUP}


# ── 9. languages ─────────────────────────────────────────────────────────────────────────────────────────────────────

RTL_LANGUAGES = {"ar", "he", "fa", "ur"}


def languages(db, user) -> dict:
    access.require_hr(user)
    rows = (db.query(TemplateVariant.canonical_id, TemplateVariant.language).filter(TemplateVariant.status == "ACTIVE",
                                                                                     or_(TemplateVariant.owner_organization_id == user.organization_id,
                                                                                         TemplateVariant.owner_organization_id.is_(None)))
            .distinct().all())
    out: dict = defaultdict(list)
    for cid, lang in rows:
        out[cid].append({"language": lang, "direction": "rtl" if lang.split("-")[0] in RTL_LANGUAGES else "ltr"})
    return {"templates": out}


# ── 11. emergency controls (platform) ────────────────────────────────────────────────────────────────────────────────

def _platform_actor_org():
    return None


def suspend_platform_pack(db, admin, pack: JurisdictionPack, reason: str) -> dict:
    """Super Admin: suspend a platform pack and its ACTIVE variants. No tenant document is read; affected tenants get counts."""
    from app.modules.doc_templates import content
    if pack.scope_type != "PLATFORM" or pack.owner_organization_id is not None:
        raise HTTPException(404, "Not found")
    if pack.status != "ACTIVE":
        raise HTTPException(409, "Only an active pack can be suspended.")
    pack.status = "SUSPENDED"
    results = []
    for v in db.query(TemplateVariant).filter(TemplateVariant.pack_id == pack.id, TemplateVariant.status == "ACTIVE").all():
        sup = content._withdraw(db, admin, v, "SUSPENDED", reason)
        results.append({"variant_id": v.id, "supersession_id": sup.id})
    db.commit()
    _notify_affected(db, [r["variant_id"] for r in results], reason)
    return {"pack_id": pack.id, "status": pack.status, "variants_suspended": len(results)}


def suspend_platform_variant(db, admin, v: TemplateVariant, reason: str) -> dict:
    from app.modules.doc_templates import content
    if v.owner_organization_id is not None or v.release_mode != "PLATFORM_COUNSEL":
        raise HTTPException(404, "Not found")
    if v.status != "ACTIVE":
        raise HTTPException(409, "Only an active variant can be suspended.")
    sup = content._withdraw(db, admin, v, "SUSPENDED", reason)
    db.commit()
    _notify_affected(db, [v.id], reason)
    return {"variant_id": v.id, "status": v.status, "supersession_id": sup.id}


def _notify_affected(db, variant_ids: list[int], reason: str) -> None:
    """Organizations that used the suspended content are told how many of their drafts are affected (counts only)."""
    from app.modules.super_admin.models import Notification, NotificationTarget
    counts = dict(db.query(GeneratedDocument.organization_id, func.count(GeneratedDocument.id))
                  .filter(GeneratedDocument.variant_id.in_(variant_ids or [-1]), GeneratedDocument.status.in_(sorted(state.DRAFT_STATES)))
                  .group_by(GeneratedDocument.organization_id).all())
    users = dict(db.query(GeneratedDocument.organization_id, func.count(GeneratedDocument.id))
                 .filter(GeneratedDocument.variant_id.in_(variant_ids or [-1])).group_by(GeneratedDocument.organization_id).all())
    for org_id in users:
        n = Notification(title="Template content suspended",
                         message=f"Zoiko suspended platform template content your organization uses. {counts.get(org_id, 0)} unissued draft(s) "
                                 "can no longer be issued; issued documents are unchanged. Generate affected documents again once a "
                                 "replacement is released.",
                         notification_type="warning", priority="high", target_type="organization", audience="org_admins",
                         channels=["in_app"], sender_name="Zoiko HR", status="sent", sent_at=datetime.utcnow())
        n.targets = [NotificationTarget(kind="org", ref=str(org_id))]
        db.add(n)
    db.commit()


# ── HTTP ─────────────────────────────────────────────────────────────────────────────────────────────────────────────

router = APIRouter(prefix="/hr/document-centre", tags=["Documents centre"])
me_router = APIRouter(prefix="/hr/me/document-actions", tags=["Documents to action (self-service)"])
platform_router = APIRouter(prefix="/super-admin/doc-templates", tags=["Template engine (platform)"])


class ReasonIn(BaseModel):
    reason: str = Field(..., min_length=5, max_length=2000)


class RetentionReviewIn(BaseModel):
    decision: str = Field(..., pattern="^(keep|extend)$")
    years: Optional[int] = Field(None, ge=1, le=50)
    note: Optional[str] = Field(None, max_length=1000)


@me_router.get("")
def actions_mine(db: Session = Depends(get_db), user=Depends(get_current_user)):
    return my_actions(db, user)


@router.get("/team-actions")
def actions_team(db: Session = Depends(get_db), user=Depends(get_current_user)):
    return team_actions(db, user)


@router.get("/automation")
def get_automation(db: Session = Depends(get_db), user=Depends(get_current_user)):
    access.require_hr(user)
    row = db.query(DocTemplateSettings).filter(DocTemplateSettings.organization_id == user.organization_id).first()
    return {"rules": automation.rules(db, user.organization_id),
            "generation": ((row.automation_rules or {}) if row else {}).get("_generation", "on")}


@router.put("/automation")
def put_automation(body: dict, db: Session = Depends(get_db), user=Depends(get_current_user)):
    return {"rules": automation.save(db, user, body)}


@router.get("/activation")
def activation(db: Session = Depends(get_db), user=Depends(get_current_user)):
    return activation_overview(db, user)


@router.get("/activation/{country}")
def activation_country(country: str, db: Session = Depends(get_db), user=Depends(get_current_user)):
    if not regions.country_code_strict(country):
        raise HTTPException(404, "Unknown country")
    return country_status(db, user, country)


@router.get("/activation/{country}/counsel-pack")
def counsel_pack(country: str, format: str = Query("csv", pattern="^(csv|pdf)$"), db: Session = Depends(get_db), user=Depends(get_current_user)):
    if not regions.country_code_strict(country):
        raise HTTPException(404, "Unknown country")
    name = f"counsel-review-pack-{country.upper()}"
    if format == "pdf":
        return Response(counsel_pack_pdf(db, user, country), media_type="application/pdf",
                        headers={"Content-Disposition": f'attachment; filename="{name}.pdf"'})
    return Response(counsel_pack_csv(db, user, country), media_type="text/csv", headers={"Content-Disposition": f'attachment; filename="{name}.csv"'})


@router.get("/retention")
def get_retention(db: Session = Depends(get_db), user=Depends(get_current_user)):
    return retention_settings(db, user)


@router.put("/retention")
def put_retention(body: dict, db: Session = Depends(get_db), user=Depends(get_current_user)):
    return save_retention(db, user, body)


@router.get("/retention/queue")
def get_retention_queue(db: Session = Depends(get_db), user=Depends(get_current_user)):
    return retention_queue(db, user)


@router.post("/retention/{document_id}/review")
def review_retention(document_id: int, body: RetentionReviewIn, db: Session = Depends(get_db), user=Depends(get_current_user)):
    doc = db.get(GeneratedDocument, document_id)
    if doc is None or doc.organization_id != user.organization_id:
        raise HTTPException(404, "Document not found")
    return retention_review(db, user, doc, body.decision, body.years, body.note)


@router.get("/legacy")
def get_legacy(db: Session = Depends(get_db), user=Depends(get_current_user)):
    return legacy_summary(db, user)


@router.get("/reports")
def get_report(db: Session = Depends(get_db), user=Depends(get_current_user)):
    return report(db, user)


@router.get("/languages")
def get_languages(db: Session = Depends(get_db), user=Depends(get_current_user)):
    return languages(db, user)


@platform_router.get("/packs")
def platform_packs(db: Session = Depends(get_db), admin=Depends(get_current_super_admin)):
    rows = db.query(JurisdictionPack).filter(JurisdictionPack.scope_type == "PLATFORM").order_by(JurisdictionPack.country).all()
    return {"items": [{"id": p.id, "country": p.country, "region": p.region, "status": p.status,
                       "variants_active": db.query(func.count(TemplateVariant.id)).filter(TemplateVariant.pack_id == p.id,
                                                                                         TemplateVariant.status == "ACTIVE").scalar()}
                      for p in rows]}


@platform_router.post("/packs/{pack_id}/suspend")
def platform_suspend_pack(pack_id: int, body: ReasonIn, db: Session = Depends(get_db), admin=Depends(get_current_super_admin)):
    p = db.get(JurisdictionPack, pack_id)
    if p is None:
        raise HTTPException(404, "Not found")
    return suspend_platform_pack(db, admin, p, body.reason)


@platform_router.post("/variants/{variant_id}/suspend")
def platform_suspend_variant(variant_id: int, body: ReasonIn, db: Session = Depends(get_db), admin=Depends(get_current_super_admin)):
    v = db.get(TemplateVariant, variant_id)
    if v is None:
        raise HTTPException(404, "Not found")
    return suspend_platform_variant(db, admin, v, body.reason)


@platform_router.get("/country-demand")
def platform_country_demand(db: Session = Depends(get_db), admin=Depends(get_current_super_admin)):
    return {"countries": country_demand(db)}


from app.modules.doc_templates import mira as _mira  # noqa: E402,F401  (registers Mira's read-only answers)
