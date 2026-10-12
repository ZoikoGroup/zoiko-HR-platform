"""
activity_service.py
-------------------
Organization activity recording (ZHR-36).

One entry point — :func:`record_activity` — that service-layer business actions
call, so the Super Admin's Workflows page can answer *"which organization, which
person in what role, which target, what exactly changed, and did it work"* for
**every** tenant at once.

Why the existing audit table is reused
-------------------------------------
``super_admin_audit_logs`` is already the platform's single append-only audit
ledger (served at ``GET /super-admin/audit-logs`` and written by every
super-admin mutation). Organization activity is stored there too, in added
columns, rather than in a second table: one ledger to query, retain and audit is
worth more than a table per feature.

What is deliberately *not* stored
---------------------------------
Passwords, hashes, tokens and bank details are replaced with a mask **before**
the row is built — see :func:`mask_value`. Nothing sensitive is written and then
hidden; it never enters the ledger at all.
"""

import logging
from datetime import date, datetime
from decimal import Decimal
from enum import Enum
from typing import Any, Iterable, Optional

from sqlalchemy.orm import Session

from app.modules.super_admin.models import AuditAction, AuditLog

logger = logging.getLogger("zoiko.activity")


# ═══════════════════════════════════════════════════════════════════════════════
# SENSITIVE DATA
# ═══════════════════════════════════════════════════════════════════════════════

# A field is masked when its normalized name CONTAINS one of these fragments, so
# "hashed_password", "temp_password" and "bank_account_number" are all caught by
# the same few entries instead of needing an exhaustive list. Every fragment here
# is long enough to be unambiguous inside a column name.
SENSITIVE_SUBSTRINGS = (
    "password",
    "token",
    "secret",
    "apikey",
    "authkey",
    "privatekey",
    "bankaccount",
    "accountnumber",
    "bankifsc",
    "aadhaar",
    "aadhar",
    "cardnumber",
    "cvv",
    "otp",
    "pincode",
    "ssn",
)

# Too short to substring-match safely ("pan" would also hit a future "panel"), so
# these only match when the field name starts with them: "pan", "pan_number".
SENSITIVE_PREFIXES = ("pan", "uan", "ifsc")

MASK = "••••••"


def _normalize_key(key: Any) -> str:
    return "".join(ch for ch in str(key).lower() if ch.isalnum())


def is_sensitive(key: Any) -> bool:
    name = _normalize_key(key)
    if any(fragment in name for fragment in SENSITIVE_SUBSTRINGS):
        return True
    return name.startswith(SENSITIVE_PREFIXES)


def mask_value(key: Any, value: Any) -> Any:
    """JSON-safe value for ``key``, masked when the field is sensitive."""
    if is_sensitive(key):
        return MASK if value is not None else None
    return json_safe(value)


def json_safe(value: Any) -> Any:
    """Convert a column value to something JSON can store and a UI can render."""
    if value is None or isinstance(value, (str, bool, int, float)):
        return value
    if isinstance(value, Decimal):
        return float(value)
    if isinstance(value, Enum):
        return value.value
    if isinstance(value, datetime):
        return value.isoformat()
    if isinstance(value, date):
        return value.isoformat()
    if isinstance(value, dict):
        return {str(k): json_safe(v) for k, v in value.items()}
    if isinstance(value, (list, tuple, set)):
        return [json_safe(v) for v in value]
    return str(value)


# ═══════════════════════════════════════════════════════════════════════════════
# FIELD LABELS + DIFFS
# ═══════════════════════════════════════════════════════════════════════════════

FIELD_LABELS = {
    "first_name": "First name", "last_name": "Last name", "email": "Email",
    "phone": "Phone", "job_title": "Job title", "employment_type": "Employment type",
    "status": "Status", "is_active": "Active", "date_of_joining": "Date of joining",
    "date_of_birth": "Date of birth", "gender": "Gender", "department_id": "Department",
    "designation_id": "Designation", "reporting_manager_id": "Reporting manager",
    "role": "Role", "employee_code": "Employee code", "work_email": "Work email",
    "personal_email": "Personal email", "confirmation_date": "Confirmation date",
    "basic_salary": "Basic salary", "hra": "HRA", "ctc": "CTC",
    "current_address": "Current address", "permanent_address": "Permanent address",
    "city": "City", "state": "State", "country": "Country",
    "bank_account": "Bank account", "bank_ifsc": "Bank IFSC",
    "pan_number": "PAN number", "uan_number": "UAN number",
    "leave_type": "Leave type", "start_date": "Start date", "end_date": "End date",
    "days": "Days", "reason": "Reason", "reviewed_by": "Reviewed by",
    "name": "Name", "value": "Value", "description": "Description",
    "category": "Category", "key": "Key", "effective_from": "Effective from",
    "effective_to": "Effective to", "amount": "Amount", "frequency": "Frequency",
    "comp_type": "Type", "currency": "Currency", "title": "Title",
    "cost_center": "Cost center", "is_taxable": "Taxable", "notes": "Notes",
    "percentage": "Percentage", "annual_ctc": "Annual CTC",
}

# Never diffed: internal bookkeeping that would only add noise to the feed.
UNINTERESTING_FIELDS = {
    "updated_at", "created_at", "updated_by", "created_by", "hashed_password",
    "must_change_password", "password_changed_at", "emergency_contacts",
    "id", "organization_id", "is_active", "deleted_at", "failed_login_attempts", "locked_until",
}


def field_label(key: str) -> str:
    if key in FIELD_LABELS:
        return FIELD_LABELS[key]
    return "".join(f" {ch.lower()}" if ch.isupper() else ch for ch in str(key)).strip().capitalize()


def snapshot(obj, fields: Optional[Iterable[str]] = None) -> dict:
    """``{field: value}`` for an ORM row, before it is mutated."""
    if obj is None:
        return {}
    keys = list(fields) if fields else [c.name for c in obj.__table__.columns]
    return {k: json_safe(getattr(obj, k, None)) for k in keys}


def diff(before: dict, after: dict) -> list:
    """Only the fields that actually changed, as [{field, label, before, after}].

    Sensitive fields keep their *presence* (so the detail panel can show that a
    bank account was set) but never their value.
    """
    changes = []
    for key in sorted(set(before) | set(after)):
        if key in UNINTERESTING_FIELDS:
            continue
        old, new = before.get(key), after.get(key)
        if old == new:
            continue
        sensitive = is_sensitive(key)
        changes.append({
            "field": key,
            "label": field_label(key),
            "before": MASK if (sensitive and old is not None) else old,
            "after": MASK if (sensitive and new is not None) else new,
            "masked": sensitive,
        })
    return changes


def changes_from(before: dict, update: dict) -> list:
    """Diff an applied update payload against the values it replaced."""
    after = dict(before)
    for key, value in update.items():
        after[key] = json_safe(getattr(value, "value", value))
    return diff(before, after)


# ═══════════════════════════════════════════════════════════════════════════════
# ACTOR + TARGET
# ═══════════════════════════════════════════════════════════════════════════════

ROLE_LABELS = {
    "super_admin": "Super Admin",
    "admin": "Org Admin",
    "hr_admin": "HR Admin",
    "manager": "Manager",
    "employee": "Employee",
    "billing_admin": "Billing Admin",
}


def role_label(role: Any) -> str:
    value = getattr(role, "value", role)
    key = str(value or "").strip().lower()
    if key in ROLE_LABELS:
        return ROLE_LABELS[key]
    return field_label(key) if key else "Unknown"


def person_name(obj) -> str:
    """Full name if there is one, else something a human can still recognise."""
    if obj is None:
        return "System"
    first = (getattr(obj, "first_name", None) or "").strip()
    last = (getattr(obj, "last_name", None) or "").strip()
    name = " ".join(part for part in (first, last) if part)
    if name:
        return name
    for attr in ("organization_name", "display_name", "name", "subject", "title", "email"):
        value = getattr(obj, attr, None)
        if isinstance(value, str) and value.strip():
            return value.strip()
    return f"#{getattr(obj, 'id', '?')}"


def actor_snapshot(actor) -> tuple:
    """``(display name, role key, role label, id, email)`` for the feed."""
    if actor is None:
        return ("System", "system", "System", None, None)
    role = getattr(actor.role, "value", actor.role)
    role = str(role or "").strip().lower() or "unknown"
    return (
        person_name(actor),
        role,
        role_label(role),
        getattr(actor, "id", None),
        getattr(actor, "email", None),
    )


def build_target_label(name: Optional[str], code: Any = None) -> Optional[str]:
    """``"Rahul Mehta (ACMEE00001)"`` — name, plus the code when there is one."""
    if not name:
        return f"#{code}" if code not in (None, "") else None
    if code in (None, ""):
        return name
    return f"{name} ({code})"


# ═══════════════════════════════════════════════════════════════════════════════
# ACTION CATALOG
# ═══════════════════════════════════════════════════════════════════════════════

# action_type -> (verb phrase, group, placement)
#   placement "target"  : "{actor} ({role}) {verb} {target}"      ("added employee Rahul Mehta")
#   placement "into"    : "{actor} ({role}) {verb} {total} into"  ("imported 40 rows into Acme Ltd")
#   placement "none"    : "{actor} ({role}) {verb}"               ("reset organization settings")
# The verb phrases live here — not in the UI — so the sentence a super admin
# reads can never drift from what the server actually recorded.
ACTION_CATALOG: dict = {
    # ── Employees ──────────────────────────────────────────────────────────
    "employee.added":             ("added employee", "Employee", "target"),
    "employee.updated":           ("updated employee", "Employee", "target"),
    "employee.deactivated":       ("deactivated employee", "Employee", "target"),
    "employee.deleted":           ("deleted employee", "Employee", "target"),
    "employee.permanently_deleted": ("permanently deleted employee", "Employee", "target"),
    "employee.bulk_imported":     ("imported employee rows", "Employee", "into"),
    "employee.bulk_removed":      ("removed employee records", "Employee", "into"),
    "employee.all_removed":       ("removed all employee records", "Employee", "into"),
    "employee.invited":           ("invited user", "User", "target"),
    # ── Leave ──────────────────────────────────────────────────────────────
    "leave.requested":            ("requested leave for", "Leave", "target"),
    "leave.updated":              ("updated leave request for", "Leave", "target"),
    "leave.deleted":              ("deleted leave request for", "Leave", "target"),
    "leave.approved":             ("approved leave for", "Leave", "target"),
    "leave.rejected":             ("rejected leave for", "Leave", "target"),
    "leave.settings_updated":     ("updated leave settings for", "Leave", "target"),
    "leave.type_created":         ("created leave type", "Leave", "target"),
    "leave.type_updated":         ("updated leave type", "Leave", "target"),
    "leave.type_deleted":         ("deleted leave type", "Leave", "target"),
    # ── Payroll / compensation ─────────────────────────────────────────────
    "payroll.compensation_added":     ("added compensation for", "Payroll", "target"),
    "payroll.compensation_updated":   ("updated compensation for", "Payroll", "target"),
    "payroll.compensation_deleted":   ("deleted compensation for", "Payroll", "target"),
    "payroll.benefit_added":          ("added benefit for", "Payroll", "target"),
    "payroll.benefit_deleted":        ("deleted benefit for", "Payroll", "target"),
    # ── Organization settings ──────────────────────────────────────────────
    "settings.updated":           ("updated setting for", "Settings", "target"),
    "settings.bulk_updated":      ("updated organization settings for", "Settings", "none"),
    "settings.deleted":           ("deleted setting for", "Settings", "target"),
    "settings.reset":             ("reset organization settings for", "Settings", "none"),
}


def action_meta(action_type: Optional[str]) -> tuple:
    """``(verb, group, placement)`` for an action type; unknown types degrade
    gracefully to a readable generic phrase instead of raising."""
    if action_type in ACTION_CATALOG:
        return ACTION_CATALOG[action_type]
    fallback = (str(action_type or "performed an action on").replace("_", " "),
                "Other", "target")
    return fallback


def action_groups() -> list:
    groups = sorted({meta[1] for meta in ACTION_CATALOG.values()})
    return [{"key": g, "label": g} for g in groups]


_ADDING_ACTIONS = {"employee.added", "employee.invited", "payroll.compensation_added", "payroll.benefit_added",
                  "leave.type_created"}


def build_sentence(*, action_type: str, actor_name: Optional[str], role_label_text: Optional[str],
                   target_name: Optional[str], organization_name: Optional[str],
                   counts: Optional[dict] = None, status: str = "success") -> str:
    """The one-line story of an event.

    ``"Priya Shah (Org Admin) added employee Rahul Mehta to Acme Ltd"``
    """
    verb, _group, placement = action_meta(action_type)
    who = f"{actor_name} ({role_label_text})" if role_label_text else (actor_name or "System")
    org = organization_name or "the platform"

    if placement == "none":
        sentence = f"{who} {verb} {org}"
    elif placement == "into":
        total = (counts or {}).get("total")
        amount = f"{total} " if total not in (None, "") else ""
        sentence = f"{who} {verb} {amount}in {org}"
    else:
        sentence = f"{who} {verb}"
        if target_name:
            sentence += f" {target_name}"
        if organization_name:
            joiner = "to" if action_type in _ADDING_ACTIONS else "in"
            sentence += f" {joiner} {org}"

    if counts:
        bits = []
        for key in ("created", "updated", "succeeded", "deactivated", "deleted", "failed"):
            value = counts.get(key)
            if value:
                bits.append(f"{value} {key}")
        if bits:
            sentence += f" ({', '.join(bits)})"
    if status == "failed":
        sentence += " - failed"
    return sentence


# ═══════════════════════════════════════════════════════════════════════════════
# RECORDING
# ═══════════════════════════════════════════════════════════════════════════════

DEFAULT_ACTION = {
    "employee.added": AuditAction.CREATE,
    "employee.updated": AuditAction.UPDATE,
    "employee.deactivated": AuditAction.DEACTIVATE,
    "employee.deleted": AuditAction.DELETE,
    "employee.permanently_deleted": AuditAction.DELETE,
    "employee.bulk_imported": AuditAction.CREATE,
    "employee.bulk_removed": AuditAction.DELETE,
    "employee.all_removed": AuditAction.DELETE,
    "employee.invited": AuditAction.CREATE,
    "leave.requested": AuditAction.CREATE,
    "leave.updated": AuditAction.UPDATE,
    "leave.deleted": AuditAction.DELETE,
    "leave.approved": AuditAction.APPROVED,
    "leave.rejected": AuditAction.REJECTED,
    "leave.settings_updated": AuditAction.CONFIG_CHANGE,
    "leave.type_created": AuditAction.CREATE,
    "leave.type_updated": AuditAction.UPDATE,
    "leave.type_deleted": AuditAction.DELETE,
    "payroll.compensation_added": AuditAction.CREATE,
    "payroll.compensation_updated": AuditAction.UPDATE,
    "payroll.compensation_deleted": AuditAction.DELETE,
    "payroll.benefit_added": AuditAction.CREATE,
    "payroll.benefit_deleted": AuditAction.DELETE,
    "settings.updated": AuditAction.CONFIG_CHANGE,
    "settings.bulk_updated": AuditAction.CONFIG_CHANGE,
    "settings.deleted": AuditAction.CONFIG_CHANGE,
    "settings.reset": AuditAction.CONFIG_CHANGE,
}

ENTITY_TYPES = {
    "employee": "Employee",
    "leave": "LeaveRequest",
    "payroll": "EmployeeCompensation",
    "settings": "OrganizationConfig",
}


def entity_type_for(action_type: Optional[str]) -> str:
    prefix = str(action_type or "").split(".")[0]
    return ENTITY_TYPES.get(prefix, "Organization")


def record_activity(
    db: Session,
    *,
    action_type: str,
    actor=None,
    organization_id: Optional[int] = None,
    target=None,
    target_name: Optional[str] = None,
    target_code: Any = None,
    entity_type: Optional[str] = None,
    entity_id: Optional[int] = None,
    changes: Optional[list] = None,
    status: str = "success",
    error: Any = None,
    counts: Optional[dict] = None,
    details: Optional[dict] = None,
    organization_name: Optional[str] = None,
    commit: bool = True,
) -> AuditLog:
    """Write one organization-activity event.

    Commits by default. Services on this platform commit their own business
    change before recording the event, so relying on a later request-scoped
    commit silently discarded most events; ``commit=False`` is only for the rare
    caller that still owns an open transaction.

    Never raises. A broken activity feed must not fail the business action that
    triggered it; problems are logged instead.
    """
    try:
        name, role_key, role_text, actor_id, actor_email = actor_snapshot(actor)
        if organization_id is None and actor is not None:
            organization_id = getattr(actor, "organization_id", None)
        if target_name is None:
            target_name = person_name(target) if target is not None else None
        if target_code is None and target is not None:
            target_code = getattr(target, "employee_code", None) or getattr(target, "code", None)
        if entity_id is None and target is not None:
            entity_id = getattr(target, "id", None)

        label = build_target_label(target_name, target_code)
        clean_changes = []
        for change in changes or []:
            clean_changes.append({
                "field": change.get("field"),
                "label": change.get("label") or field_label(change.get("field", "")),
                "before": json_safe(change.get("before")),
                "after": json_safe(change.get("after")),
                "masked": bool(change.get("masked")) or is_sensitive(change.get("field")),
            })

        payload = dict(details or {})
        if counts:
            payload["counts"] = {k: json_safe(v) for k, v in counts.items()}
        if organization_name:
            # Snapshotted so the sentence a super admin reads keeps naming the
            # organization the action actually touched, even after a rename.
            payload["organization_name"] = organization_name
        sentence = build_sentence(
            action_type=action_type, actor_name=name, role_label_text=role_text,
            target_name=target_name, organization_name=organization_name, counts=counts, status=status,
        )

        row = AuditLog(
            action=DEFAULT_ACTION.get(action_type, AuditAction.UPDATE),
            entity_type=entity_type or entity_type_for(action_type),
            entity_id=entity_id,
            performed_by=actor_id,
            performed_by_email=actor_email,
            details={**payload, "sentence": sentence, "action_type": action_type} if sentence else payload,
            organization_id=organization_id,
            actor_name=name,
            actor_role=role_key,
            action_type=action_type,
            target_label=label,
            status=status,
            changes=clean_changes or None,
            error_message=str(error)[:500] if error else None,
            # Naive UTC, the platform storage convention: written explicitly so the
            # instant is right regardless of the database session time zone.
            created_at=datetime.utcnow(),
        )
        db.add(row)
        if commit:
            db.commit()
        return row
    except Exception:
        logger.exception("record_activity(%s) failed", action_type)
        try:
            db.rollback()
        except Exception:
            pass
        return None


def record_failure(
    db: Session,
    *,
    action_type: str,
    actor=None,
    organization_id: Optional[int] = None,
    target=None,
    target_name: Optional[str] = None,
    entity_type: Optional[str] = None,
    entity_id: Optional[int] = None,
    error: Any,
    details: Optional[dict] = None,
    organization_name: Optional[str] = None,
) -> Optional[AuditLog]:
    """Record an action that was attempted and failed.

    Commits immediately: by this point the business transaction has raised and
    the session must be rolled back before the ledger row can be written.
    """
    try:
        db.rollback()
    except Exception:
        pass
    message = str(error)
    return record_activity(
        db,
        action_type=action_type,
        actor=actor,
        organization_id=organization_id,
        target=target,
        target_name=target_name,
        entity_type=entity_type,
        entity_id=entity_id,
        status="failed",
        error=message[:500],
        details={**(details or {}), "error": message[:500]},
        organization_name=organization_name,
        commit=True,
    )


# ═══════════════════════════════════════════════════════════════════════════════
# READING
# ═══════════════════════════════════════════════════════════════════════════════

def _org_name(db: Session, organization_id: Optional[int]) -> Optional[str]:
    if organization_id is None:
        return None
    from app.modules.hr.models import Organization

    org = (
        db.query(Organization)
        .filter(Organization.id == organization_id)
        .execution_options(include_deleted=True)
        .first()
    )
    if org is None:
        # A hard-deleted organization must not make the event disappear, and must
        # never be re-labelled with another tenant's name.
        return f"Organization {organization_id}"
    return org.organization_name or org.display_name or org.name or f"Organization {organization_id}"


def target_name_of(row: AuditLog) -> Optional[str]:
    """Target without the trailing code, for sentence building."""
    label = row.target_label
    if not label:
        return None
    if label.endswith(")") and " (" in label:
        return label.rsplit(" (", 1)[0]
    return label


def event_view(db: Session, row: AuditLog, org_names: Optional[dict] = None) -> dict:
    """API shape for one event: the sentence plus every part behind it."""
    details = row.details if isinstance(row.details, dict) else {}
    org_name = details.get("organization_name")
    if not org_name:
        org_name = (org_names or {}).get(row.organization_id) or _org_name(db, row.organization_id)
    counts = details.get("counts")
    action_type = row.action_type or details.get("action_type")
    _verb, group, _placement = action_meta(action_type)
    sentence = details.get("sentence") or build_sentence(
        action_type=action_type, actor_name=row.actor_name,
        role_label_text=role_label(row.actor_role), target_name=target_name_of(row),
        organization_name=org_name, counts=counts, status=row.status or "success",
    )
    return {
        "id": row.id,
        "sentence": sentence,
        "action": row.action.value if hasattr(row.action, "value") else row.action,
        "action_type": action_type,
        "action_group": group,
        "entity_type": row.entity_type,
        "entity_id": row.entity_id,
        "organization_id": row.organization_id,
        "organization_name": org_name,
        "actor_id": row.performed_by,
        "actor_name": row.actor_name or row.performed_by_email,
        "actor_email": row.performed_by_email,
        "actor_role": row.actor_role,
        "actor_role_label": role_label(row.actor_role) if row.actor_role else None,
        "target_label": row.target_label,
        "status": row.status or "success",
        "changes": row.changes or [],
        "counts": counts or None,
        "error_message": row.error_message,
        "details": {k: v for k, v in details.items()
                    if k not in ("sentence", "action_type", "organization_name")},
        "ip_address": row.ip_address,
        "created_at": row.created_at.isoformat() + "Z" if row.created_at else None,
    }
