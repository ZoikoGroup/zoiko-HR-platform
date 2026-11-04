"""Per-organization settings for the Prompt 3 document flows (policies, leave, working time, compensation).

Stored in `organization_configs` (one row per key, category = the group), like the recruitment privacy settings of Prompt 2, so a
new setting needs no migration. A setting with no default stays empty until the organization sets it: a policy field that reads
it is then missing and preflight refuses the document (fail closed) instead of printing an invented value.
"""
from __future__ import annotations

import json
from decimal import Decimal, InvalidOperation
from typing import Any, Optional

from fastapi import HTTPException

from app.modules.hr.models import OrganizationConfig

# key -> (type, default, description)
SETTINGS: dict[str, tuple[type, Any, str]] = {
    # policies (org-wide; owner_name / contact / scope_statement may also be set per policy: policies.<ID>.<field>)
    "policies.owner_name": (str, None, "Default policy owner"),
    "policies.contact": (str, None, "Default contact for policy questions"),
    "policies.scope_statement": (str, None, "Default 'applies to' statement"),
    "policies.review_months": (int, 12, "Months between policy reviews"),
    "policies.privacy_contact": (str, None, "Privacy / data protection contact"),
    "policies.absence_notification_rule": (str, None, "When to report an unplanned absence"),
    "policies.default_probation_months": (int, None, "Default probation length (months) where the contract is silent"),
    "policies.remote_cost_support": (str, None, "Support with remote working costs"),
    "policies.core_hours": (str, None, "Core hours"),
    "policies.leave_year_label": (str, None, "Leave year (when leave settings do not define it)"),
    "policies.annual_leave_notice_days": (int, None, "Days of notice for annual leave requests"),
    "policies.self_certification_days": (int, None, "Days of absence before evidence may be requested"),
    "policies.travel_class_rules": (str, None, "Class of travel and accommodation rules"),
    "policies.travel_assistance_contact": (str, None, "Travel assistance contact"),
    "policies.expense_limits_summary": (str, None, "Expense limits (when travel settings do not describe them)"),
    "policies.claim_deadline_days": (int, None, "Days to submit an expense claim"),
    "policies.eap_contact": (str, None, "Employee assistance programme contact"),
    "policies.claim_dispute_days": (int, None, "Days to dispute an expense decision"),
    # working time
    "attendance.standard_workday_hours": (Decimal, None, "Standard working day for timekeeping (hours)"),
    "attendance.shift_change_notice_days": (int, None, "Normal notice for a shift change (days)"),
    # leave
    "leave.document_map": (dict, None, "Leave type -> documents generated on creation / decision"),
    "leave.bereavement_evidence_enabled": (bool, False, "Ask for evidence of bereavement (only where policy allows)"),
    # performance and learning
    "performance.calibration_required": (bool, False, "Appraisals are calibrated by someone else before they are final"),
    "learning.reminder_days": (str, "60,30,7", "Days before a certification or training expires to remind the holder"),
    # compensation
    "compensation.managers_see_reports": (bool, False, "Managers may see compensation documents of their reports"),
    "compensation.expense_second_approval_threshold": (Decimal, None, "Claims above this total need a second approver"),
}
GROUP_ROLES = {"policies": "hr", "attendance": "hr", "leave": "hr", "compensation": "admin", "performance": "hr", "learning": "hr"}
PER_POLICY_FIELDS = ("owner_name", "contact", "scope_statement")


def _cast(raw: Optional[str], typ):
    if raw in (None, ""):
        return None
    try:
        if typ is bool:
            return str(raw).lower() in ("1", "true", "yes", "on")
        if typ is int:
            return int(raw)
        if typ is Decimal:
            return Decimal(str(raw))
        if typ is dict:
            v = json.loads(raw)
            return v if isinstance(v, dict) else None
    except (ValueError, InvalidOperation, json.JSONDecodeError):
        return None
    return str(raw)


def _row(db, organization_id: int, key: str):
    return db.query(OrganizationConfig).filter(OrganizationConfig.organization_id == organization_id,
                                               OrganizationConfig.key == key).first()


def _type_of(key: str):
    if key in SETTINGS:
        return SETTINGS[key][0]
    parts = key.split(".")
    if len(parts) == 3 and parts[0] == "policies" and parts[2] in PER_POLICY_FIELDS:
        return str
    raise KeyError(key)


def get(db, organization_id: int, key: str):
    typ = _type_of(key)
    row = _row(db, organization_id, key)
    value = _cast(row.value if row else None, typ)
    return SETTINGS[key][1] if value is None and key in SETTINGS else value


def group(db, organization_id: int, prefix: str) -> dict:
    out = {k.split(".", 1)[1]: get(db, organization_id, k) for k in SETTINGS if k.startswith(prefix + ".")}
    return {k: (float(v) if isinstance(v, Decimal) else v) for k, v in out.items()}


def save(db, actor, data: dict, prefix: str) -> dict:
    """Validated write of `prefix.*` settings; unknown keys are refused (422)."""
    from app.modules.doc_templates import access
    if GROUP_ROLES.get(prefix) == "admin":
        access.require_org_admin(actor)
    else:
        access.require_hr(actor)
    for short, value in (data or {}).items():
        key = f"{prefix}.{short}"
        try:
            typ = _type_of(key)
        except KeyError:
            raise HTTPException(422, f"Unknown setting {short}.")
        if value not in (None, "") and typ in (int, Decimal):
            try:
                if (int(value) if typ is int else Decimal(str(value))) < 0:
                    raise ValueError
            except (ValueError, InvalidOperation):
                raise HTTPException(422, f"{short} must be a non-negative number.")
        if typ is dict and value is not None and not isinstance(value, dict):
            raise HTTPException(422, f"{short} must be an object.")
        row = _row(db, actor.organization_id, key)
        if row is None:
            row = OrganizationConfig(organization_id=actor.organization_id, key=key, category=prefix,
                                     description=(SETTINGS.get(key) or (None, None, f"Policy setting {short}"))[2][:255])
            db.add(row)
        if value is None or value == "":
            row.value = ""
        elif typ is bool:
            row.value = "true" if value else "false"
        elif typ is dict:
            row.value = json.dumps(value)
        else:
            row.value = str(value).strip()[:2000]
    db.commit()
    return group(db, actor.organization_id, prefix)
