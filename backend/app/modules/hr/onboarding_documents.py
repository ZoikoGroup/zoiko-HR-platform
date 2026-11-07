"""Onboarding ↔ document engine (Prompt 2: HR-ONB-001/003/004/005/007/010/011/015/017/020/022).

* New-starter data is captured as structured form submissions (HR-ONB-001 personal, -003 emergency contacts, -017 bank and
  payroll), not only file uploads: DRAFT → SUBMITTED (with the declaration) → VERIFIED by HR (bank details: by someone with
  explicit finance permission) or RETURNED with a reason. Verified values update the employee record through employee_history.
* Financial values are encrypted at rest, masked (last 4) in every response and document, revealed only to finance-permitted
  people (audited), never e-mailed, logged or given to the assistant. Payroll receives them only after verification, through
  the integration event `onboarding.payroll_details_verified` (ids only).
* Fields the law may not require (nationality, national/tax identifier, social security number) are hidden unless the
  worker's ACTIVE jurisdiction pack asks for them (`jurisdiction_packs.requirements`): data minimisation fails closed.
* Checklists gain owner role, mandatory flag, auto-ticks from engine records, and exceptions (reason, owner, due date, blocked
  action). Onboarding cannot be completed while a mandatory item is open without an exception.
"""
import json
import logging
from datetime import date, datetime, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel, Field
from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.core.client_ip import get_client_ip
from app.core.dependencies import get_current_user
from app.core.rate_limiter import limiter
from app.database import get_db
from app.modules.doc_templates import access, hooks, preflight, service as doc_service, starters, storage
from app.modules.doc_templates.models import GeneratedDocument, JurisdictionPack
from app.modules.hr.models import (Asset, EmployeeLifecycle, OnboardingChecklist, OnboardingChecklistItem, OnboardingFormSubmission,
                                   OnboardingNewHire, OrganizationConfig)
from app.modules.hr.recruitment_documents import _try_generate, documents_for_source, system_actor

logger = logging.getLogger("zoiko.onboarding.documents")

FORMS = {"HR-ONB-001": "New starter information", "HR-ONB-003": "Emergency contacts", "HR-ONB-017": "Bank and payroll details"}
BANK_FORM = "HR-ONB-017"
OPTIONAL_BY_PACK = {"nationality": "collect_nationality", "national_identifier": "collect_national_identifier",
                    "tax_identifier": "collect_tax_identifier", "social_security_number": "collect_social_security_number"}
ROUTING_LABELS = {"GB": "Sort code", "IE": "BIC", "US": "Routing number", "IN": "IFSC code", "AU": "BSB number", "CA": "Transit and institution number",
                  "NZ": "Bank and branch number", "SG": "Bank and branch code", "AE": "IBAN / SWIFT"}
DECLARATION_VERSION = "ONB-DECL-1.0"
FINANCE_VIEWERS_KEY = "payroll.finance_viewer_ids"


# ── form definitions ─────────────────────────────────────────────────────────────────────────────────────────────────

def _starter_fields(db, canonical_id: str) -> list[dict]:
    s = starters.latest(db, canonical_id) or {}
    for b in s.get("content") or []:
        if b.get("type") == "form_fields":
            return b["fields"]
    return []


def _declaration(db, canonical_id: str) -> Optional[str]:
    s = starters.latest(db, canonical_id) or {}
    return next((b.get("text") for b in s.get("content") or [] if b.get("type") == "declaration"), None)


def _pack_requirements(db, organization_id: int, country: Optional[str], region: Optional[str]) -> dict:
    if not country:
        return {}
    packs = preflight.candidate_packs(db, organization_id, country, region, date.today())
    req = {}
    for p in reversed(packs):                                # most specific pack wins
        req.update(p.requirements or {})
    return req


def visible_fields(db, organization_id: int, canonical_id: str, country: Optional[str], region: Optional[str]) -> list[dict]:
    reqs = _pack_requirements(db, organization_id, country, region)
    out = []
    for f in _starter_fields(db, canonical_id):
        flag = OPTIONAL_BY_PACK.get(f["key"])
        if flag and not reqs.get(flag):
            continue                                       # only collected when the jurisdiction pack requires it
        f = dict(f)
        if f["key"] == "routing_code" and country in ROUTING_LABELS:
            f["label"] = ROUTING_LABELS[country]
        if flag:
            f["required"] = True
        out.append(f)
    return out


def _financial_keys(fields: list[dict]) -> set:
    return {f["key"] for f in fields if f.get("classification") == "FINANCIAL"}


def mask(value) -> str:
    v = "".join(str(value or "").split())
    return f"•••• {v[-4:]}" if len(v) > 4 else "••••"


# ── finance permission ───────────────────────────────────────────────────────────────────────────────────────────────

def finance_viewer_ids(db, organization_id: int) -> set[int]:
    row = db.query(OrganizationConfig).filter(OrganizationConfig.organization_id == organization_id,
                                              OrganizationConfig.key == FINANCE_VIEWERS_KEY).first()
    out = set()
    for part in (row.value if row else "").split(","):
        if part.strip().isdigit():
            out.add(int(part.strip()))
    return out


def is_finance_permitted(db, user) -> bool:
    return user.id in finance_viewer_ids(db, user.organization_id)


def set_finance_viewers(db, actor, employee_ids: list[int]) -> list[int]:
    access.require_org_admin(actor)
    from app.modules.employee.models import Employee
    clean = []
    for eid in dict.fromkeys(employee_ids):
        e = db.get(Employee, eid)
        if e is None or e.organization_id != actor.organization_id:
            raise HTTPException(400, f"Employee {eid} was not found.")
        clean.append(eid)
    row = db.query(OrganizationConfig).filter(OrganizationConfig.organization_id == actor.organization_id,
                                              OrganizationConfig.key == FINANCE_VIEWERS_KEY).first()
    if row is None:
        row = OrganizationConfig(organization_id=actor.organization_id, key=FINANCE_VIEWERS_KEY, category="payroll",
                                 description="People who may see and verify unmasked bank and payroll details")
        db.add(row)
    row.value = ",".join(str(i) for i in clean)
    db.commit()
    _audit(db, actor, "payroll.finance_viewers_changed", "OrganizationConfig", row.id, f"{len(clean)} people")
    return clean


def _audit(db, actor, action_type, entity_type, entity_id, target_name):
    try:
        from app.modules.super_admin.activity_service import record_activity
        record_activity(db, action_type=action_type, actor=actor, organization_id=actor.organization_id, entity_type=entity_type,
                        entity_id=entity_id, target_name=target_name, commit=True)
    except Exception:
        pass


# ── submissions ──────────────────────────────────────────────────────────────────────────────────────────────────────

def _values(sub: OnboardingFormSubmission) -> dict:
    vals = dict(sub.data or {})
    if sub.data_encrypted:
        vals.update(json.loads(storage.decrypt_text(sub.data_encrypted)))
    vals.pop("_declaration", None)
    return vals


def _store_values(sub: OnboardingFormSubmission, values: dict, fields: list[dict]) -> None:
    allowed = {f["key"]: f for f in fields}
    fin = _financial_keys(fields)
    plain, secret = {}, {}
    for k, v in values.items():
        if k not in allowed:
            continue
        v = (str(v).strip()[:500] if v is not None else None) or None
        (secret if k in fin else plain)[k] = v
    keep_decl = (sub.data or {}).get("_declaration")
    sub.data = {**plain, **({"_declaration": keep_decl} if keep_decl else {})}
    sub.data_encrypted = storage.encrypt_text(json.dumps(secret)) if any(secret.values()) else None


def serialize_submission(db, sub: OnboardingFormSubmission, fields: list[dict], *, reveal: bool = False) -> dict:
    vals = _values(sub)
    fin = _financial_keys(fields)
    shown = {k: (v if reveal or k not in fin else (mask(v) if v else None)) for k, v in vals.items()}
    return {"id": sub.id, "canonical_id": sub.canonical_id, "title": FORMS.get(sub.canonical_id), "status": sub.status,
            "values": shown, "masked_keys": sorted(fin) if not reveal else [], "submitted_at": sub.submitted_at,
            "verified_by": sub.verified_by, "verified_at": sub.verified_at, "return_reason": sub.return_reason,
            "document_id": sub.document_id, "fields": fields, "declaration": _declaration(db, sub.canonical_id),
            "declaration_version": DECLARATION_VERSION}


def _hire_location(hire: OnboardingNewHire):
    return hire.work_country, hire.work_region


def _get_or_create(db, hire: OnboardingNewHire, canonical_id: str) -> OnboardingFormSubmission:
    sub = (db.query(OnboardingFormSubmission).filter(OnboardingFormSubmission.new_hire_id == hire.id,
                                                     OnboardingFormSubmission.canonical_id == canonical_id)
           .order_by(OnboardingFormSubmission.id.desc()).first())
    if sub is None:
        sub = OnboardingFormSubmission(organization_id=hire.organization_id, new_hire_id=hire.id, canonical_id=canonical_id, status="DRAFT")
        db.add(sub)
        db.flush()
    return sub


def portal_forms(db, hire: OnboardingNewHire) -> list[dict]:
    country, region = _hire_location(hire)
    out = []
    for cid in FORMS:
        fields = visible_fields(db, hire.organization_id, cid, country, region)
        sub = (db.query(OnboardingFormSubmission).filter(OnboardingFormSubmission.new_hire_id == hire.id,
                                                         OnboardingFormSubmission.canonical_id == cid)
               .order_by(OnboardingFormSubmission.id.desc()).first())
        if sub is None:
            out.append({"canonical_id": cid, "title": FORMS[cid], "status": "NOT_STARTED", "values": {}, "fields": fields,
                        "declaration": _declaration(db, cid), "declaration_version": DECLARATION_VERSION, "masked_keys": []})
        else:
            out.append(serialize_submission(db, sub, fields))
    return out


def save_portal_form(db, hire: OnboardingNewHire, canonical_id: str, values: dict, *, submit: bool, declaration_accepted: bool,
                     ip: Optional[str], user_agent: Optional[str]) -> dict:
    if canonical_id not in FORMS:
        raise HTTPException(404, "Form not found")
    country, region = _hire_location(hire)
    fields = visible_fields(db, hire.organization_id, canonical_id, country, region)
    sub = _get_or_create(db, hire, canonical_id)
    if sub.status in ("SUBMITTED", "VERIFIED"):
        raise HTTPException(409, "This form was already submitted. HR will return it to you if anything needs changing.")
    current = _values(sub)
    current.update(values or {})
    _store_values(sub, current, fields)
    if submit:
        missing = [f["label"] for f in fields if f.get("required") and not (current.get(f["key"]) or "").strip()]
        if canonical_id == "HR-ONB-003" and not (current.get("contact1_name") and current.get("contact1_phone")):
            missing.append("at least one emergency contact")
        if missing:
            raise HTTPException(422, {"code": "MISSING_FIELDS", "message": "Complete the required fields.", "missing": missing})
        if not declaration_accepted:
            raise HTTPException(422, "Confirm the declaration to submit.")
        sub.data = {**(sub.data or {}), "_declaration": {"version": DECLARATION_VERSION, "accepted_at": datetime.utcnow().isoformat(),
                                                         "ip": ip, "user_agent": (user_agent or "")[:300]}}
        sub.status, sub.submitted_at, sub.return_reason = "SUBMITTED", datetime.utcnow(), None
    db.commit()
    return serialize_submission(db, sub, fields)


def _sub(db, actor, sub_id) -> OnboardingFormSubmission:
    sub = db.get(OnboardingFormSubmission, sub_id)
    if sub is None or sub.organization_id != actor.organization_id:
        raise HTTPException(404, "Submission not found")
    return sub


def _location_of(db, sub):
    if sub.new_hire_id:
        hire = db.get(OnboardingNewHire, sub.new_hire_id)
        return hire.work_country, hire.work_region
    from app.modules.employee.models import Employee
    e = db.get(Employee, sub.employee_id)
    return (e.work_country, e.work_region) if e else (None, None)


def return_submission(db, actor, sub: OnboardingFormSubmission, reason: str) -> OnboardingFormSubmission:
    access.require_hr(actor)
    if sub.status != "SUBMITTED":
        raise HTTPException(409, "Only a submitted form can be returned.")
    if not (reason or "").strip():
        raise HTTPException(422, "Say what needs changing.")
    sub.status, sub.return_reason = "RETURNED", reason.strip()[:2000]
    db.commit()
    return sub


def verify_submission(db, actor, sub: OnboardingFormSubmission) -> OnboardingFormSubmission:
    if sub.canonical_id != BANK_FORM:
        access.require_hr(actor)
    elif not is_finance_permitted(db, actor):
        raise HTTPException(403, {"code": "FINANCE_PERMISSION_REQUIRED",
                                  "message": "Bank and payroll details are verified by someone with finance permission."})
    if sub.status != "SUBMITTED":
        raise HTTPException(409, "Only a submitted form can be verified.")
    sub.status, sub.verified_by, sub.verified_at = "VERIFIED", actor.id, datetime.utcnow()
    db.commit()
    _apply(db, actor, sub)
    hire = db.get(OnboardingNewHire, sub.new_hire_id) if sub.new_hire_id else None
    employee_id = sub.employee_id or getattr(hire, "employee_id", None)
    subject = ("employee", employee_id) if employee_id else ("new_hire", sub.new_hire_id)
    doc = _try_generate(db, actor, canonical_id=sub.canonical_id, subject_type=subject[0], subject_id=subject[1],
                        source_ref=f"onboarding_form_submission:{sub.id}", trigger="onboarding_form.verified")
    if doc is not None:
        sub = db.get(OnboardingFormSubmission, sub.id)
        sub.document_id = doc.id
        db.commit()
    if sub.canonical_id == BANK_FORM:
        try:
            from app.modules.integrations.events import emit_event
            emit_event(db, "onboarding.payroll_details_verified", {"submission_id": sub.id, "new_hire_id": sub.new_hire_id,
                                                                   "employee_id": employee_id}, sub.organization_id)
        except Exception:
            logger.warning("payroll hand-off event failed for submission %s", sub.id)
    return sub


def _apply(db, actor, sub: OnboardingFormSubmission) -> None:
    """Verified values go into the employee record (with history) or, before the account exists, into the hire's details."""
    from app.modules.employee.models import Employee
    from app.modules.hr.models import EmployeeHistory
    vals = _values(sub)
    hire = db.get(OnboardingNewHire, sub.new_hire_id) if sub.new_hire_id else None
    emp = db.get(Employee, sub.employee_id or getattr(hire, "employee_id", None)) if (sub.employee_id or getattr(hire, "employee_id", None)) else None
    updates = {}
    if sub.canonical_id == "HR-ONB-001":
        addr = ", ".join(v for v in (vals.get("address_line1"), vals.get("address_line2")) if v) or None
        updates = {"first_name": vals.get("legal_first_name"), "last_name": vals.get("legal_last_name"), "personal_email": vals.get("personal_email"),
                   "phone": vals.get("mobile_phone"), "current_address": addr, "city": vals.get("city"), "state": vals.get("region"),
                   "country": vals.get("country"), "pincode": vals.get("postal_code"), "language": vals.get("preferred_language")}
        if vals.get("date_of_birth"):
            try:
                updates["date_of_birth"] = date.fromisoformat(vals["date_of_birth"][:10])
            except ValueError:
                pass
    elif sub.canonical_id == "HR-ONB-003":
        updates = {"emergency_contacts": emergency_contacts(vals)}
    updates = {k: v for k, v in updates.items() if v not in (None, "", [])}
    if not updates:
        return
    if emp is not None:
        for k, v in updates.items():
            old = getattr(emp, k)
            if old != v:
                db.add(EmployeeHistory(employee_id=emp.id, organization_id=emp.organization_id, field_name=k,
                                       old_value=None if old is None else str(old)[:500], new_value=str(v)[:500], changed_by=actor.id,
                                       change_reason=f"Verified {FORMS[sub.canonical_id]} ({sub.canonical_id})"))
                setattr(emp, k, v)
    elif hire is not None:
        details = dict(hire.profile_details or {})
        details["verified"] = {**(details.get("verified") or {}), **{k: (v.isoformat() if isinstance(v, date) else v) for k, v in updates.items()}}
        hire.profile_details = details
    db.commit()


def emergency_contacts(vals: dict) -> list[dict]:
    """The ESS shape (core/identity_formats): name, relationship, primaryPhone, alternatePhone, address, isPrimary."""
    out = []
    for n in (1, 2, 3):
        if vals.get(f"contact{n}_name") and vals.get(f"contact{n}_phone"):
            out.append({"name": vals[f"contact{n}_name"], "relationship": vals.get(f"contact{n}_relationship") or "",
                        "primaryPhone": vals[f"contact{n}_phone"], "alternatePhone": vals.get(f"contact{n}_alt_phone") or "",
                        "address": vals.get(f"contact{n}_address") or "", "isPrimary": n == 1})
    return out


def bank_change_requested(db, employee, changed_by) -> None:
    """A bank detail change after onboarding: the employee is told (fraud protection) and payroll waits for re-verification."""
    from app.modules.hr.models import EmployeeProfile
    prof = db.query(EmployeeProfile).filter(EmployeeProfile.employee_id == employee.id).first()
    if prof is None:
        return
    sub = OnboardingFormSubmission(organization_id=employee.organization_id, employee_id=employee.id, canonical_id=BANK_FORM,
                                   status="SUBMITTED", submitted_at=datetime.utcnow(),
                                   data={"_declaration": {"version": "ESS-CHANGE", "changed_by": getattr(changed_by, "id", None),
                                                          "accepted_at": datetime.utcnow().isoformat()}})
    sub.data_encrypted = storage.encrypt_text(json.dumps({"account_holder": f"{employee.first_name} {employee.last_name}",
                                                          "bank_name": prof.bank_name, "account_number": prof.bank_account,
                                                          "routing_code": prof.bank_ifsc}))
    db.add(sub)
    db.commit()
    try:
        from app.services import email_service
        email_service.send_bank_details_changed_email(employee.work_email or employee.email, employee.first_name or "there",
                                                      datetime.utcnow().strftime("%b %d, %Y %H:%M UTC"), db=db,
                                                      organization_id=employee.organization_id)
    except Exception:
        logger.warning("bank change notice failed for employee %s", employee.id)


def _form_context(ctx):
    sub = ctx.source
    if sub is None or type(sub).__name__ != "OnboardingFormSubmission":
        return
    country, region = _location_of(ctx.db, sub)
    fields = visible_fields(ctx.db, sub.organization_id, sub.canonical_id, country, region)
    fin = _financial_keys(fields)
    vals = _values(sub)
    ctx.form_values = {k: (mask(v) if k in fin else v) for k, v in vals.items() if v}


hooks.context(list(FORMS), _form_context)


# ── checklists ───────────────────────────────────────────────────────────────────────────────────────────────────────

MANAGER_CHECKLIST = "HR-ONB-005"
PEOPLE_ITEM_SOURCES = {"onb001": "HR-ONB-001", "onb003": "HR-ONB-003", "onb017": "HR-ONB-017"}


def _hire_items(db, hire: OnboardingNewHire) -> list[OnboardingChecklistItem]:
    return (db.query(OnboardingChecklistItem).join(OnboardingChecklist, OnboardingChecklist.id == OnboardingChecklistItem.checklist_id)
            .filter(OnboardingChecklist.onboarding_new_hire_id == hire.id, OnboardingChecklist.is_deleted.is_(False),
                    OnboardingChecklistItem.is_deleted.is_(False)).order_by(OnboardingChecklistItem.id).all())


def engine_state(db, hire: OnboardingNewHire) -> dict:
    """Checklist keys that complete themselves from engine records and verified forms."""
    state = {}
    for key, cid in PEOPLE_ITEM_SOURCES.items():
        sub = (db.query(OnboardingFormSubmission).filter(OnboardingFormSubmission.new_hire_id == hire.id,
                                                         OnboardingFormSubmission.canonical_id == cid,
                                                         OnboardingFormSubmission.status == "VERIFIED").first())
        if sub is not None:
            state[key] = {"done": True, "on": sub.verified_at.date().isoformat() if sub.verified_at else None}
    emp_id = hire.employee_id
    if emp_id:
        for key, cid, statuses in (("onb011", "HR-ONB-011", ("ACKNOWLEDGED",)), ("onb010", "HR-ONB-010", ("ACKNOWLEDGED",)),
                                   ("onb015", "HR-ONB-015", ("EXECUTED",)), ("onb020", "HR-ONB-020", ("ISSUED", "ACKNOWLEDGED"))):
            d = (db.query(GeneratedDocument).filter(GeneratedDocument.organization_id == hire.organization_id, GeneratedDocument.canonical_id == cid,
                                                    GeneratedDocument.subject_type == "employee", GeneratedDocument.subject_id == emp_id,
                                                    GeneratedDocument.status.in_(statuses)).first())
            if d is not None:
                state[key] = {"done": True, "on": (d.status_changed_at or d.created_at).date().isoformat()}
    for it in _hire_items(db, hire):
        if it.item_key:
            if it.completed:
                state[it.item_key] = {"done": True, "on": it.completed_at.date().isoformat() if it.completed_at else None}
            elif it.exception_reason:
                state.setdefault(it.item_key, {"done": False, "note": f"exception: {it.exception_reason}"})
    if any(it.owner_role == "manager" for it in _hire_items(db, hire)):
        state.setdefault("onb005", {"done": True, "on": None, "note": "manager checklist assigned"})
    return state


def checklist_blockers(db, hire: OnboardingNewHire) -> list[str]:
    """Mandatory items that are neither complete (by hand or from an engine record) nor recorded as an exception."""
    state = engine_state(db, hire)
    out = []
    for it in _hire_items(db, hire):
        if not it.mandatory or it.completed or it.exception_reason:
            continue
        if it.item_key and state.get(it.item_key, {}).get("done"):
            continue
        out.append(f"mandatory item '{it.title}' is open with no exception recorded")
    return out


def _checklist_rows(db, hire: OnboardingNewHire):
    state = engine_state(db, hire)
    rows, exceptions = [], []
    for it in _hire_items(db, hire):
        done = it.completed or (it.item_key and state.get(it.item_key, {}).get("done"))
        on = it.completed_at.date().isoformat() if it.completed_at else (state.get(it.item_key or "", {}).get("on") or "")
        rows.append([it.title, it.owner_role or "", "Done" if done else ("Exception" if it.exception_reason else "Open"), on if done else ""])
        if it.exception_reason and not done:
            from app.modules.employee.models import Employee
            owner = db.get(Employee, it.exception_owner_id) if it.exception_owner_id else None
            exceptions.append([it.title, it.exception_reason, f"{owner.first_name} {owner.last_name}" if owner else "",
                               it.exception_due_date.isoformat() if it.exception_due_date else "", it.blocked_action or ""])
    return rows, exceptions, state


def _hire_for_subject(ctx) -> Optional[OnboardingNewHire]:
    if ctx.subject_type == "new_hire":
        return ctx.subject
    if ctx.subject_type == "employee" and ctx.subject is not None:
        return (ctx.db.query(OnboardingNewHire).filter(OnboardingNewHire.employee_id == ctx.subject.id)
                .order_by(OnboardingNewHire.id.desc()).first())
    return None


def _checklist_context(ctx):
    hire = _hire_for_subject(ctx)
    if hire is None:
        return
    rows, exceptions, state = _checklist_rows(ctx.db, hire)
    country = hire.work_country or getattr(ctx.subject, "work_country", None)
    legal_keys = [k for k in ("legal_terms", "legal_right_to_work", "legal_tax_handoff", "legal_notices") if k in state]
    if not legal_keys:
        from app.core import regions
        exceptions.append(["Legal onboarding", f"Legal onboarding items not configured for {regions.country_name(country) or 'this country'}",
                           "HR", "", "Resolve or waive with a reason before closing"])
    ctx.extra.setdefault("onboarding.checklist_items", rows or None)
    ctx.extra.setdefault("onboarding.exceptions", exceptions or None)
    ctx.checklist_state = state
    if not ctx.extra.get("onboarding.owner") and hire.created_by:
        ctx.extra["onboarding.owner"] = hire.created_by


hooks.context(["HR-ONB-004", "HR-ONB-022", MANAGER_CHECKLIST], _checklist_context)


def record_exception(db, actor, item_id: int, data: dict) -> OnboardingChecklistItem:
    access.require_hr(actor)
    it = db.get(OnboardingChecklistItem, item_id)
    if it is None or it.organization_id != actor.organization_id:
        raise HTTPException(404, "Checklist item not found")
    reason = (data.get("reason") or "").strip()
    if not reason:
        raise HTTPException(422, "Give the reason for the exception.")
    if not data.get("owner_id") or not data.get("due_date"):
        raise HTTPException(422, "An exception needs an owner and a due date.")
    it.exception_reason, it.exception_owner_id, it.exception_due_date = reason[:2000], data["owner_id"], data["due_date"]
    it.blocked_action = (data.get("blocked_action") or "").strip()[:300] or None
    db.commit()
    return it


def assign_manager_checklist(db, hire: OnboardingNewHire) -> Optional[OnboardingChecklist]:
    """HR-ONB-005 as real tasks for the reporting manager, with due dates from the start date."""
    if not hire.manager_id:
        return None
    exists = (db.query(OnboardingChecklist).filter(OnboardingChecklist.onboarding_new_hire_id == hire.id, OnboardingChecklist.name == "Manager onboarding",
                                                   OnboardingChecklist.is_deleted.is_(False)).first())
    if exists is not None:
        return exists
    s = starters.latest(db, MANAGER_CHECKLIST) or {}
    items = [it for b in s.get("content") or [] if b.get("type") == "checklist" for it in b["items"]]
    if not items:
        return None
    cl = OnboardingChecklist(organization_id=hire.organization_id, onboarding_new_hire_id=hire.id, name="Manager onboarding",
                             category="Manager", status="pending", created_by="system")
    db.add(cl)
    db.flush()
    for it in items:
        due = hire.joining_date + timedelta(days=it.get("due_offset_days") or 0) if hire.joining_date else None
        db.add(OnboardingChecklistItem(organization_id=hire.organization_id, checklist_id=cl.id, title=it["label"], item_key=f"mgr_{it['key']}",
                                       owner_role="manager", mandatory=bool(it.get("mandatory")), due_offset_days=it.get("due_offset_days"),
                                       due_date=due, assignee_employee_id=hire.manager_id, completed=False, created_by="system"))
    db.commit()
    return cl


def my_tasks(db, user) -> list[dict]:
    rows = (db.query(OnboardingChecklistItem, OnboardingChecklist, OnboardingNewHire)
            .join(OnboardingChecklist, OnboardingChecklist.id == OnboardingChecklistItem.checklist_id)
            .join(OnboardingNewHire, OnboardingNewHire.id == OnboardingChecklist.onboarding_new_hire_id)
            .filter(OnboardingChecklistItem.assignee_employee_id == user.id, OnboardingChecklistItem.is_deleted.is_(False),
                    OnboardingChecklist.is_deleted.is_(False), OnboardingNewHire.organization_id == user.organization_id)
            .order_by(OnboardingChecklistItem.completed, OnboardingChecklistItem.due_date).limit(500).all())
    return [{"id": it.id, "title": it.title, "checklist": cl.name, "new_hire_id": h.id, "new_hire_name": h.candidate_name,
             "due_date": it.due_date, "completed": it.completed, "completed_at": it.completed_at, "mandatory": it.mandatory,
             "overdue": bool(it.due_date and not it.completed and it.due_date < date.today())} for it, cl, h in rows]


def complete_my_task(db, user, item_id: int, done: bool) -> dict:
    it = db.get(OnboardingChecklistItem, item_id)
    if it is None or it.organization_id != user.organization_id or it.assignee_employee_id != user.id:
        raise HTTPException(404, "Task not found")
    it.completed = done
    it.completed_at = datetime.utcnow() if done else None
    db.commit()
    return {"id": it.id, "completed": it.completed}


# ── automatic documents ──────────────────────────────────────────────────────────────────────────────────────────────

def on_onboarding_started(db, hire: OnboardingNewHire) -> None:
    try:
        assign_manager_checklist(db, hire)
        actor = system_actor(db, hire.organization_id)
        if hire.manager_id:
            _try_generate(db, actor, canonical_id=MANAGER_CHECKLIST, subject_type="new_hire", subject_id=hire.id,
                          source_ref=f"onboarding_new_hire:{hire.id}", trigger="new_hire.created")
    except Exception:
        db.rollback()
        logger.warning("manager onboarding checklist failed for new hire %s", hire.id)


def on_onboarding_completed(db, hire: OnboardingNewHire, employee, actor=None) -> None:
    """HR-ONB-004 checklist record and HR-ONB-022 completion record; probation schedule from the offer; policy acknowledgements."""
    actor = actor or system_actor(db, hire.organization_id)
    closed = {"onboarding.completed_on": hire.completed_at or datetime.utcnow(),
              "onboarding.closed_by_name": f"{actor.first_name} {actor.last_name}" if actor else None}
    for cid in ("HR-ONB-004", "HR-ONB-022"):
        _try_generate(db, actor, canonical_id=cid, subject_type="employee", subject_id=employee.id,
                      source_ref=f"onboarding_new_hire:{hire.id}", trigger="onboarding.completed", extra=dict(closed))
    _auto_probation(db, hire, employee, actor)
    issue_policy_acknowledgements(db, employee, actor)


def _auto_probation(db, hire, employee, actor) -> None:
    from app.modules.hr.models import OfferStatus, RecruitmentCandidate, RecruitmentOffer
    cand = db.query(RecruitmentCandidate).filter(RecruitmentCandidate.onboarding_new_hire_id == hire.id).first()
    offer = (db.query(RecruitmentOffer).filter(RecruitmentOffer.candidate_id == cand.id, RecruitmentOffer.status == OfferStatus.ACCEPTED)
             .order_by(RecruitmentOffer.id.desc()).first()) if cand else None
    months = getattr(offer, "probation_months", None)
    if not months or not employee.date_of_joining:
        return                                              # never assumed: HR sets the probation schedule explicitly
    start = employee.date_of_joining
    m = start.month - 1 + months
    end = date(start.year + m // 12, m % 12 + 1, min(start.day, 28))
    create_probation(db, actor, employee, {"start_date": start, "end_date": end, "review_dates": [],
                                           "reviewer_id": employee.reporting_manager_id}, system=True)


def create_probation(db, actor, employee, data: dict, system: bool = False) -> EmployeeLifecycle:
    """HR-ONB-020: a probation_start lifecycle event (start, end, reviews), review tasks for the reviewer, the schedule letter."""
    if not system:
        access.require_hr(actor)
    start, end = data.get("start_date"), data.get("end_date")
    if not start or not end or end <= start:
        raise HTTPException(422, "The probation end date must be after its start date.")
    from app.modules.employee.models import Employee
    reviewer = db.get(Employee, data.get("reviewer_id")) if data.get("reviewer_id") else None
    if reviewer is not None and reviewer.organization_id != employee.organization_id:
        raise HTTPException(400, "The reviewer was not found.")
    reviews = [{"label": (r.get("label") or f"Review {i + 1}")[:100], "date": r["date"].isoformat() if isinstance(r["date"], date) else str(r["date"])[:10],
                "with_id": r.get("with_id") or getattr(reviewer, "id", None)} for i, r in enumerate(data.get("review_dates") or []) if r.get("date")]
    ev = EmployeeLifecycle(employee_id=employee.id, organization_id=employee.organization_id, event_type="probation_start", event_date=date.today(),
                           effective_date=start, new_value={"start_date": start.isoformat(), "end_date": end.isoformat(), "review_dates": reviews,
                                                            "objectives_summary": (data.get("objectives_summary") or "")[:2000] or None,
                                                            "reviewer_id": getattr(reviewer, "id", None)},
                           initiated_by=getattr(actor, "id", None), status="pending")
    db.add(ev)
    db.commit()
    hire = db.query(OnboardingNewHire).filter(OnboardingNewHire.employee_id == employee.id).order_by(OnboardingNewHire.id.desc()).first()
    if hire is not None and reviews:
        cl = OnboardingChecklist(organization_id=employee.organization_id, onboarding_new_hire_id=hire.id, name="Probation reviews",
                                 category="Manager", status="pending", created_by="system")
        db.add(cl)
        db.flush()
        for r in reviews:
            db.add(OnboardingChecklistItem(organization_id=employee.organization_id, checklist_id=cl.id, title=f"Probation review: {r['label']}",
                                           owner_role="manager", mandatory=False, due_date=date.fromisoformat(r["date"]),
                                           assignee_employee_id=r["with_id"], completed=False, created_by="system", item_key="probation_review"))
        db.commit()
    _try_generate(db, actor, canonical_id="HR-ONB-020", subject_type="employee", subject_id=employee.id,
                  source_ref=f"employee_lifecycle:{ev.id}", trigger="employee_lifecycle.probation_start")
    return ev


def _probation_context(ctx):
    ev = ctx.source
    if ev is None or type(ev).__name__ != "EmployeeLifecycle":
        return
    v = ev.new_value or {}
    from app.modules.employee.models import Employee
    from app.modules.doc_templates import formatting
    ctx.extra["probation.start_date"] = date.fromisoformat(v["start_date"]) if v.get("start_date") else None
    ctx.extra["probation.end_date"] = date.fromisoformat(v["end_date"]) if v.get("end_date") else None
    rows = []
    for r in v.get("review_dates") or []:
        who = ctx.db.get(Employee, r.get("with_id")) if r.get("with_id") else None
        rows.append([r.get("label") or "", formatting.format_date(r.get("date"), ctx.language, ctx.country()),
                     f"{who.first_name} {who.last_name}" if who else ""])
    ctx.extra["probation.review_dates"] = rows or None
    ctx.extra["probation.objectives_summary"] = v.get("objectives_summary")
    reviewer = ctx.db.get(Employee, v.get("reviewer_id")) if v.get("reviewer_id") else None
    ctx.extra["probation.reviewer"] = f"{reviewer.first_name} {reviewer.last_name}" if reviewer else None


hooks.context(["HR-ONB-020"], _probation_context)


def on_asset_assigned(db, asset: Asset, actor) -> None:
    if not asset.employee_id:
        return
    _try_generate(db, actor, canonical_id="HR-ONB-015", subject_type="employee", subject_id=asset.employee_id,
                  source_ref=f"asset:{asset.id}", trigger="asset.assigned")


def _asset_context(ctx):
    a = ctx.source
    if a is None or type(a).__name__ != "Asset":
        return
    from app.modules.doc_templates import formatting
    same_day = (ctx.db.query(Asset).filter(Asset.organization_id == a.organization_id, Asset.employee_id == a.employee_id,
                                           Asset.assigned_date == a.assigned_date, Asset.deleted_at.is_(None)).order_by(Asset.id).all()
                if a.assigned_date else [a])
    ctx.extra["asset.items"] = [[x.name, x.asset_tag, x.serial_number or "", (getattr(x.condition, "value", x.condition) or "").capitalize(),
                                 formatting.format_date(x.assigned_date, ctx.language, ctx.country())] for x in same_day] or None
    ctx.extra["asset.issued_by"] = f"{ctx.requester.first_name} {ctx.requester.last_name}" if ctx.requester else None


hooks.context(["HR-ONB-015"], _asset_context)

POLICY_FOR_ACK = {"HR-ONB-010": "HR-POL-002", "HR-ONB-011": "HR-POL-001"}


def _policy_doc(db, organization_id, employee_id, policy_id):
    return (db.query(GeneratedDocument).filter(GeneratedDocument.organization_id == organization_id, GeneratedDocument.canonical_id == policy_id,
                                               GeneratedDocument.subject_type == "employee", GeneratedDocument.subject_id == employee_id,
                                               GeneratedDocument.status.in_(["ISSUED", "ACKNOWLEDGED", "EXECUTED", "RETAINED"]))
            .order_by(GeneratedDocument.id.desc()).first())


def _policy_context(ctx):
    if ctx.subject_type != "employee" or ctx.subject is None:
        return
    policy_id = POLICY_FOR_ACK.get(ctx.canonical_id)
    pol = _policy_doc(ctx.db, ctx.subject.organization_id, ctx.subject.id, policy_id) if policy_id else None
    if pol is None:
        return                                              # no issued policy: policy.version stays missing and preflight denies
    from app.modules.doc_templates.models import TemplateVariant
    v = ctx.db.get(TemplateVariant, pol.variant_id) if pol.variant_id else None
    ctx.extra["policy.version"] = str(pol.variant_version) if pol.variant_version else None
    ctx.extra["policy.effective_from"] = getattr(v, "effective_from", None)
    ctx.extra["policy.document_ref"] = pol.document_number


hooks.context(list(POLICY_FOR_ACK), _policy_context)


def issue_policy_acknowledgements(db, employee, actor) -> None:
    """One acknowledgement letter per issued policy version (HR-ONB-010 for the code of conduct, -011 for the handbook)."""
    for ack_id, policy_id in POLICY_FOR_ACK.items():
        pol = _policy_doc(db, employee.organization_id, employee.id, policy_id)
        if pol is None:
            continue
        ref = f"policy_document:{pol.id}"
        if db.query(GeneratedDocument.id).filter(GeneratedDocument.source_ref == ref, GeneratedDocument.canonical_id == ack_id).first():
            continue
        _try_generate(db, actor, canonical_id=ack_id, subject_type="employee", subject_id=employee.id, source_ref=ref,
                      trigger="policy.issued")


def _on_policy_issued(db, doc):
    if doc.subject_type != "employee" or not doc.subject_id:
        return
    from app.modules.employee.models import Employee
    emp = db.get(Employee, doc.subject_id)
    issuer = db.get(Employee, doc.issued_by) if doc.issued_by else None
    if emp is not None:
        issue_policy_acknowledgements(db, emp, issuer or system_actor(db, doc.organization_id))


hooks.on("issued", list(POLICY_FOR_ACK.values()), _on_policy_issued)


def commencement_job(db, today: Optional[date] = None) -> int:
    """HR-ONB-007: once an active employee's start date is reached, confirm it (one letter per person)."""
    from app.modules.employee.models import Employee, EmployeeStatus
    today = today or date.today()
    n = 0
    for emp in db.query(Employee).filter(Employee.status == EmployeeStatus.ACTIVE, Employee.is_active.is_(True),
                                         Employee.date_of_joining <= today, Employee.date_of_joining >= today - timedelta(days=7),
                                         Employee.organization_id.isnot(None)).all():
        ref = f"employee_start:{emp.id}"
        if db.query(GeneratedDocument.id).filter(GeneratedDocument.source_ref == ref).first():
            continue
        actor = system_actor(db, emp.organization_id)
        if _try_generate(db, actor, canonical_id="HR-ONB-007", subject_type="employee", subject_id=emp.id, source_ref=ref,
                         trigger="employee.start_date_reached") is not None:
            n += 1
    return n


# ── HTTP ─────────────────────────────────────────────────────────────────────────────────────────────────────────────

router = APIRouter(prefix="/hr/onboarding", tags=["Onboarding documents"])
portal_router = APIRouter(prefix="/public/onboarding", tags=["Onboarding portal forms"])


class FormBody(BaseModel):
    values: dict = Field(default_factory=dict)
    declaration_accepted: bool = False


class ReturnBody(BaseModel):
    reason: str = Field(..., min_length=1, max_length=2000)


class ExceptionBody(BaseModel):
    reason: str = Field(..., min_length=1, max_length=2000)
    owner_id: int
    due_date: date
    blocked_action: Optional[str] = Field(None, max_length=300)


class FinanceViewers(BaseModel):
    employee_ids: list[int] = Field(default_factory=list, max_length=50)


class ProbationBody(BaseModel):
    start_date: date
    end_date: date
    review_dates: list[dict] = Field(default_factory=list, max_length=12)
    objectives_summary: Optional[str] = Field(None, max_length=2000)
    reviewer_id: Optional[int] = None


class TaskBody(BaseModel):
    completed: bool = True


def _hire(db, actor, hire_id) -> OnboardingNewHire:
    access.require_hr(actor)
    h = db.get(OnboardingNewHire, hire_id)
    if h is None or h.organization_id != actor.organization_id or h.is_deleted:
        raise HTTPException(404, "New hire not found")
    return h


@router.get("/new-hires/{hire_id}/forms")
def hire_forms(hire_id: int, db: Session = Depends(get_db), user=Depends(get_current_user)):
    h = _hire(db, user, hire_id)
    return {"items": portal_forms(db, h), "finance_permitted": is_finance_permitted(db, user)}


@router.get("/new-hires/{hire_id}/documents-status")
def hire_documents(hire_id: int, db: Session = Depends(get_db), user=Depends(get_current_user)):
    h = _hire(db, user, hire_id)
    out = documents_for_source(db, user.organization_id, f"onboarding_new_hire:{h.id}")
    out["checklist_blockers"] = checklist_blockers(db, h)
    return out


@router.post("/forms/{sub_id}/verify")
def verify(sub_id: int, db: Session = Depends(get_db), user=Depends(get_current_user)):
    sub = verify_submission(db, user, _sub(db, user, sub_id))
    country, region = _location_of(db, sub)
    return serialize_submission(db, sub, visible_fields(db, sub.organization_id, sub.canonical_id, country, region))


@router.post("/forms/{sub_id}/return")
def return_form(sub_id: int, body: ReturnBody, db: Session = Depends(get_db), user=Depends(get_current_user)):
    sub = return_submission(db, user, _sub(db, user, sub_id), body.reason)
    country, region = _location_of(db, sub)
    return serialize_submission(db, sub, visible_fields(db, sub.organization_id, sub.canonical_id, country, region))


@router.get("/forms/{sub_id}/reveal")
def reveal(sub_id: int, db: Session = Depends(get_db), user=Depends(get_current_user)):
    sub = _sub(db, user, sub_id)
    if not is_finance_permitted(db, user):
        raise HTTPException(403, {"code": "FINANCE_PERMISSION_REQUIRED", "message": "Only people with finance permission can see these details."})
    _audit(db, user, "payroll.details_revealed", "OnboardingFormSubmission", sub.id, FORMS.get(sub.canonical_id))
    country, region = _location_of(db, sub)
    return serialize_submission(db, sub, visible_fields(db, sub.organization_id, sub.canonical_id, country, region), reveal=True)


@router.get("/payroll-verifications")
def payroll_queue(db: Session = Depends(get_db), user=Depends(get_current_user)):
    if not is_finance_permitted(db, user):
        raise HTTPException(403, {"code": "FINANCE_PERMISSION_REQUIRED", "message": "Only people with finance permission can verify payroll details."})
    rows = (db.query(OnboardingFormSubmission).filter(OnboardingFormSubmission.organization_id == user.organization_id,
                                                      OnboardingFormSubmission.canonical_id == BANK_FORM,
                                                      OnboardingFormSubmission.status == "SUBMITTED").order_by(OnboardingFormSubmission.id).all())
    out = []
    for s in rows:
        country, region = _location_of(db, s)
        out.append({**serialize_submission(db, s, visible_fields(db, s.organization_id, s.canonical_id, country, region)),
                    "new_hire_id": s.new_hire_id, "employee_id": s.employee_id})
    return {"items": out, "total": len(out)}


@router.get("/finance-viewers")
def get_finance_viewers(db: Session = Depends(get_db), user=Depends(get_current_user)):
    access.require_hr(user)
    return {"employee_ids": sorted(finance_viewer_ids(db, user.organization_id))}


@router.put("/finance-viewers")
def put_finance_viewers(body: FinanceViewers, db: Session = Depends(get_db), user=Depends(get_current_user)):
    return {"employee_ids": set_finance_viewers(db, user, body.employee_ids)}


@router.put("/checklist-items/{item_id}/exception")
def item_exception(item_id: int, body: ExceptionBody, db: Session = Depends(get_db), user=Depends(get_current_user)):
    it = record_exception(db, user, item_id, body.model_dump())
    return {"id": it.id, "exception_reason": it.exception_reason, "exception_owner_id": it.exception_owner_id,
            "exception_due_date": it.exception_due_date, "blocked_action": it.blocked_action}


@router.get("/my-tasks")
def tasks(db: Session = Depends(get_db), user=Depends(get_current_user)):
    items = my_tasks(db, user)
    return {"items": items, "total": len(items), "open": sum(1 for i in items if not i["completed"])}


@router.put("/my-tasks/{item_id}")
def complete_task(item_id: int, body: TaskBody, db: Session = Depends(get_db), user=Depends(get_current_user)):
    return complete_my_task(db, user, item_id, body.completed)


@router.post("/probation/{employee_id}", status_code=201)
def probation(employee_id: int, body: ProbationBody, db: Session = Depends(get_db), user=Depends(get_current_user)):
    from app.modules.employee.models import Employee
    access.require_hr(user)
    emp = db.get(Employee, employee_id)
    if emp is None or emp.organization_id != user.organization_id:
        raise HTTPException(404, "Employee not found")
    data = body.model_dump()
    for r in data["review_dates"]:
        try:
            r["date"] = date.fromisoformat(str(r.get("date"))[:10])
        except ValueError:
            raise HTTPException(422, "Each review needs a valid date.")
    ev = create_probation(db, user, emp, data)
    return {"event_id": ev.id, **documents_for_source(db, user.organization_id, f"employee_lifecycle:{ev.id}")}


@portal_router.get("/{token}/forms")
@limiter.limit("60/minute")
def portal_get_forms(request: Request, token: str, db: Session = Depends(get_db)):
    from app.modules.hr import onboarding_flow
    hire = onboarding_flow.hire_for_token(db, token)
    return {"items": portal_forms(db, hire)}


@portal_router.put("/{token}/forms/{canonical_id}")
@limiter.limit("30/minute")
def portal_save_form(request: Request, token: str, canonical_id: str, body: FormBody, db: Session = Depends(get_db)):
    from app.modules.hr import onboarding_flow
    hire = onboarding_flow.hire_for_token(db, token)
    return save_portal_form(db, hire, canonical_id, body.values, submit=False, declaration_accepted=False, ip=None, user_agent=None)


@portal_router.post("/{token}/forms/{canonical_id}/submit")
@limiter.limit("20/minute")
def portal_submit_form(request: Request, token: str, canonical_id: str, body: FormBody, db: Session = Depends(get_db)):
    from app.modules.hr import onboarding_flow
    hire = onboarding_flow.hire_for_token(db, token)
    return save_portal_form(db, hire, canonical_id, body.values, submit=True, declaration_accepted=body.declaration_accepted,
                            ip=get_client_ip(request), user_agent=request.headers.get("user-agent"))
