"""Offboarding settings and clearance checklist templates (Offboarding → Settings)."""
import copy
from typing import Optional

from sqlalchemy.orm import Session

from app.core.exceptions import BadRequestException, NotFoundException
from app.modules.hr.offboarding.models import (EXIT_TYPES, OWNER_ROLES, OffboardingChecklistTemplate,
                                               OffboardingSettings)

REASON_CATEGORIES = [
    {"key": "better_opportunity", "label": "Better opportunity"},
    {"key": "compensation", "label": "Compensation"},
    {"key": "career_growth", "label": "Career growth"},
    {"key": "manager_or_team", "label": "Manager or team"},
    {"key": "work_life_balance", "label": "Work-life balance"},
    {"key": "relocation", "label": "Relocation"},
    {"key": "higher_studies", "label": "Higher studies"},
    {"key": "health_or_personal", "label": "Health or personal reasons"},
    {"key": "performance", "label": "Performance"},
    {"key": "conduct", "label": "Conduct"},
    {"key": "restructuring", "label": "Restructuring / redundancy"},
    {"key": "contract_end", "label": "Contract ended"},
    {"key": "retirement", "label": "Retirement"},
    {"key": "other", "label": "Other"},
]

DEFAULT_QUESTIONS = [
    {"id": "q_reason", "text": "What is the main reason you are leaving?", "type": "choice", "required": True,
     "options": [c["key"] for c in REASON_CATEGORIES if c["key"] not in ("performance", "conduct", "contract_end")]},
    {"id": "q_role", "text": "How satisfied were you with your role?", "type": "rating", "required": True},
    {"id": "q_manager", "text": "How satisfied were you with the support from your manager?", "type": "rating", "required": True},
    {"id": "q_growth", "text": "How satisfied were you with learning and growth opportunities?", "type": "rating", "required": True},
    {"id": "q_recommend", "text": "How likely are you to recommend us as a place to work? (0-10)", "type": "nps", "required": True},
    {"id": "q_better", "text": "What could we have done better?", "type": "text", "required": False},
    {"id": "q_return", "text": "Would you consider working with us again?", "type": "yesno", "required": False},
]

QUESTION_TYPES = ("choice", "rating", "nps", "text", "yesno")

DEFAULT_SETTINGS = {
    # who decides a resignation: HR only, or HR or the person's own manager
    "approver": "manager_or_hr",
    # an exit HR starts (termination, mutual separation…) needs a second HR person to approve it
    "second_approval_for_hr_exits": False,
    # used when the company profile has no notice rules
    "default_notice_days": 30,
    "interview_auto_send": True,
    "interview_questions": DEFAULT_QUESTIONS,
    "encashable_leave_types": ["annual", "earned"],
    "daily_rate_divisor": 30,
    # who gets the HR / IT / Finance / Admin clearance items (employee ids; None = HR assigns them case by case)
    "task_assignees": {"hr": None, "it": None, "finance": None, "admin": None},
    "reminder_every_days": 3,
    "contract_end_lookahead_days": 30,
    # a case can only be closed once the settlement is paid or marked not applicable
    "close_requires_settlement": True,
    "documents_link_days": 90,
    "auto_issue_acknowledgement": True,
}

DEFAULT_CHECKLIST = [
    {"title": "Hand over work and documentation", "owner_role": "employee", "due_offset_days": -3, "mandatory": True,
     "description": "Write up open work, passwords to shared tools and contacts, and hand them to your manager."},
    {"title": "Submit pending expense claims", "owner_role": "employee", "due_offset_days": -2, "mandatory": False,
     "description": "Claims after your last day may not be paid."},
    {"title": "Confirm bank and contact details for final pay", "owner_role": "employee", "due_offset_days": -2,
     "mandatory": True, "description": "Check your bank details and a personal e-mail address we can reach you on."},
    {"title": "Confirm knowledge transfer is complete", "owner_role": "manager", "due_offset_days": -1, "mandatory": True,
     "description": "Confirm the handover covers everything the team needs."},
    {"title": "Revoke system and e-mail access", "owner_role": "it", "due_offset_days": 0, "mandatory": True,
     "description": "Disable accounts, transfer mailbox and files, remove from groups and tools."},
    {"title": "Collect laptop, ID card and other company property", "owner_role": "admin", "due_offset_days": 0,
     "mandatory": True, "description": "Record each item in Asset recovery."},
    {"title": "Clear outstanding advances and dues", "owner_role": "finance", "due_offset_days": 0, "mandatory": True,
     "description": "Loans, advances, travel and expense balances."},
    {"title": "Prepare final settlement", "owner_role": "finance", "due_offset_days": 7, "mandatory": True,
     "description": "Leave pay-out, notice, deductions, net amount."},
    {"title": "Conduct exit interview", "owner_role": "hr", "due_offset_days": -1, "mandatory": False,
     "description": "Send the questionnaire and review the answers."},
    {"title": "Issue relieving / experience letter", "owner_role": "hr", "due_offset_days": 1, "mandatory": True,
     "description": "Issue it from the case's Documents tab."},
]


def _merge(stored: Optional[dict]) -> dict:
    cfg = copy.deepcopy(DEFAULT_SETTINGS)
    for k, v in (stored or {}).items():
        if k in cfg and v is not None:
            if isinstance(cfg[k], dict) and isinstance(v, dict):
                cfg[k] = {**cfg[k], **{kk: vv for kk, vv in v.items() if kk in cfg[k]}}
            else:
                cfg[k] = v
    return cfg


def get_settings(db: Session, org_id: int) -> dict:
    row = db.query(OffboardingSettings).filter(OffboardingSettings.organization_id == org_id).first()
    return _merge(row.config if row else None)


def _check_question(q: dict, i: int) -> dict:
    if not isinstance(q, dict):
        raise BadRequestException(f"Question {i + 1} is not valid.")
    text = " ".join(str(q.get("text") or "").split())
    if not text:
        raise BadRequestException(f"Question {i + 1} needs a text.")
    if len(text) > 300:
        raise BadRequestException(f"Question {i + 1} can be at most 300 characters.")
    qtype = q.get("type") or "text"
    if qtype not in QUESTION_TYPES:
        raise BadRequestException(f"Question {i + 1} has an unknown answer type.")
    out = {"id": str(q.get("id") or f"q{i + 1}")[:40], "text": text, "type": qtype, "required": bool(q.get("required"))}
    if qtype == "choice":
        opts = [str(o).strip()[:80] for o in (q.get("options") or []) if str(o).strip()]
        if len(opts) < 2:
            raise BadRequestException(f"Question {i + 1} needs at least two options.")
        out["options"] = opts
    return out


def save_settings(db: Session, org_id: int, actor_id: int, body: dict) -> dict:
    from app.modules.employee.models import Employee
    cfg = get_settings(db, org_id)
    if "approver" in body:
        if body["approver"] not in ("hr", "manager_or_hr"):
            raise BadRequestException("Choose who decides resignations.")
        cfg["approver"] = body["approver"]
    for key in ("second_approval_for_hr_exits", "interview_auto_send", "close_requires_settlement", "auto_issue_acknowledgement"):
        if key in body:
            cfg[key] = bool(body[key])
    for key, lo, hi, label in (("default_notice_days", 0, 365, "Default notice"), ("daily_rate_divisor", 1, 31, "Days per month"),
                               ("reminder_every_days", 1, 30, "Reminder interval"),
                               ("contract_end_lookahead_days", 0, 180, "Contract end look-ahead"),
                               ("documents_link_days", 1, 365, "Document link validity")):
        if key in body:
            try:
                v = int(body[key])
            except (TypeError, ValueError):
                raise BadRequestException(f"{label} must be a whole number.")
            if not lo <= v <= hi:
                raise BadRequestException(f"{label} must be between {lo} and {hi}.")
            cfg[key] = v
    if "encashable_leave_types" in body:
        from app.modules.hr.models import LeaveType
        allowed = {t.value for t in LeaveType}
        types = [str(t) for t in body["encashable_leave_types"] or []]
        if any(t not in allowed for t in types):
            raise BadRequestException("Unknown leave type in leave pay-out.")
        cfg["encashable_leave_types"] = sorted(set(types))
    if "interview_questions" in body:
        qs = body["interview_questions"] or []
        if not qs:
            raise BadRequestException("The exit interview needs at least one question.")
        if len(qs) > 30:
            raise BadRequestException("The exit interview can have at most 30 questions.")
        checked = [_check_question(q, i) for i, q in enumerate(qs)]
        if len({q["id"] for q in checked}) != len(checked):
            raise BadRequestException("Two questions have the same id.")
        cfg["interview_questions"] = checked
    if "task_assignees" in body:
        assignees = {}
        for role in ("hr", "it", "finance", "admin"):
            v = (body["task_assignees"] or {}).get(role)
            if v in (None, "", 0):
                assignees[role] = None
                continue
            emp = db.query(Employee).filter(Employee.id == int(v), Employee.organization_id == org_id,
                                            Employee.is_active.is_(True)).first()
            if not emp:
                raise BadRequestException(f"The {role.upper()} task owner must be an active person in your organisation.")
            assignees[role] = emp.id
        cfg["task_assignees"] = assignees
    row = db.query(OffboardingSettings).filter(OffboardingSettings.organization_id == org_id).first()
    if row is None:
        row = OffboardingSettings(organization_id=org_id, config=cfg)
        db.add(row)
    row.config = cfg
    row.updated_by = actor_id
    db.commit()
    return cfg


# ── checklist templates ──────────────────────────────────────────────────────────────────────────────────────────────

def ensure_default_template(db: Session, org_id: int) -> OffboardingChecklistTemplate:
    tpl = (db.query(OffboardingChecklistTemplate)
           .filter(OffboardingChecklistTemplate.organization_id == org_id, OffboardingChecklistTemplate.is_default.is_(True))
           .first())
    if tpl is None:
        tpl = OffboardingChecklistTemplate(organization_id=org_id, name="Standard clearance", exit_types=[],
                                           items=copy.deepcopy(DEFAULT_CHECKLIST), is_default=True, is_active=True)
        db.add(tpl)
        db.flush()
    return tpl


def template_out(t: OffboardingChecklistTemplate) -> dict:
    return {"id": t.id, "name": t.name, "exit_types": t.exit_types or [], "department_id": t.department_id,
            "items": t.items or [], "is_default": bool(t.is_default), "is_active": bool(t.is_active)}


def list_templates(db: Session, org_id: int) -> list:
    ensure_default_template(db, org_id)
    db.commit()
    rows = (db.query(OffboardingChecklistTemplate).filter(OffboardingChecklistTemplate.organization_id == org_id)
            .order_by(OffboardingChecklistTemplate.is_default.desc(), OffboardingChecklistTemplate.name).all())
    return [template_out(t) for t in rows]


def _check_items(items) -> list:
    if not items:
        raise BadRequestException("A checklist needs at least one item.")
    if len(items) > 60:
        raise BadRequestException("A checklist can have at most 60 items.")
    out = []
    for i, it in enumerate(items):
        title = " ".join(str((it or {}).get("title") or "").split())
        if not title:
            raise BadRequestException(f"Item {i + 1} needs a title.")
        if len(title) > 200:
            raise BadRequestException(f"Item {i + 1}: the title can be at most 200 characters.")
        role = it.get("owner_role")
        if role not in OWNER_ROLES:
            raise BadRequestException(f"Item {i + 1}: choose who owns it.")
        try:
            offset = int(it.get("due_offset_days") or 0)
        except (TypeError, ValueError):
            raise BadRequestException(f"Item {i + 1}: the due day must be a whole number.")
        if not -90 <= offset <= 90:
            raise BadRequestException(f"Item {i + 1}: the due day must be within 90 days of the last working day.")
        out.append({"title": title, "description": (str(it.get("description") or "").strip()[:1000] or None),
                    "owner_role": role, "due_offset_days": offset, "mandatory": bool(it.get("mandatory", True))})
    return out


def save_template(db: Session, org_id: int, actor_id: int, body: dict, template_id: Optional[int] = None) -> dict:
    name = " ".join(str(body.get("name") or "").split())
    if not name:
        raise BadRequestException("Give the checklist a name.")
    if len(name) > 120:
        raise BadRequestException("The name can be at most 120 characters.")
    types = [t for t in body.get("exit_types") or []]
    if any(t not in EXIT_TYPES for t in types):
        raise BadRequestException("Unknown exit type.")
    items = _check_items(body.get("items"))
    if template_id is None:
        tpl = OffboardingChecklistTemplate(organization_id=org_id, created_by=actor_id, is_default=False)
        db.add(tpl)
    else:
        tpl = db.query(OffboardingChecklistTemplate).filter(OffboardingChecklistTemplate.id == template_id,
                                                            OffboardingChecklistTemplate.organization_id == org_id).first()
        if tpl is None:
            raise NotFoundException("Checklist", template_id)
    dept = body.get("department_id")
    if dept:
        from app.modules.hr.models import Department
        if not db.query(Department.id).filter(Department.id == int(dept), Department.organization_id == org_id).first():
            raise BadRequestException("Unknown department.")
    tpl.name, tpl.exit_types, tpl.items = name, types, items
    tpl.department_id = int(dept) if dept else None
    tpl.is_active = bool(body.get("is_active", True)) if not tpl.is_default else True
    db.commit()
    return template_out(tpl)


def delete_template(db: Session, org_id: int, template_id: int) -> None:
    tpl = db.query(OffboardingChecklistTemplate).filter(OffboardingChecklistTemplate.id == template_id,
                                                        OffboardingChecklistTemplate.organization_id == org_id).first()
    if tpl is None:
        raise NotFoundException("Checklist", template_id)
    if tpl.is_default:
        raise BadRequestException("The standard checklist cannot be removed. Edit it instead.")
    db.delete(tpl)
    db.commit()


def pick_template(db: Session, org_id: int, exit_type: str, department_id: Optional[int]) -> OffboardingChecklistTemplate:
    """The most specific active checklist: same exit type and department, then exit type, then department, then standard."""
    default = ensure_default_template(db, org_id)
    rows = (db.query(OffboardingChecklistTemplate)
            .filter(OffboardingChecklistTemplate.organization_id == org_id, OffboardingChecklistTemplate.is_active.is_(True),
                    OffboardingChecklistTemplate.is_default.is_(False)).all())

    def score(t):
        types = t.exit_types or []
        if types and exit_type not in types:
            return -1
        if t.department_id and t.department_id != department_id:
            return -1
        return (2 if types else 0) + (1 if t.department_id else 0)
    best = max(rows, key=score, default=None)
    return best if best is not None and score(best) >= 0 else default
