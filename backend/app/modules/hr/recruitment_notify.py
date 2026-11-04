"""Emails the recruitment flow sends. Every function here is best effort: a mail problem is logged and never undoes or
fails the change that triggered it (the change is already committed when these run).

  interview booked / moved / cancelled  -> the candidate and the interviewer (with a calendar invitation)
  application under review / not taken  -> the candidate
  offer sent                            -> the candidate
  offer accepted / declined             -> the organization's admins and HR admins
  requisition submitted                 -> the organization's admins (approval needed)
  requisition approved / rejected       -> whoever raised it
"""
from __future__ import annotations

import logging
from datetime import date, datetime, timedelta
from typing import Optional

from sqlalchemy.orm import Session

logger = logging.getLogger("zoiko.recruitment")

INTERVIEW_TYPE_LABELS = {"phone": "Phone call", "video": "Video call", "in_person": "In person", "technical": "Technical interview",
                         "panel": "Panel interview", "hr": "HR interview"}
EMPLOYMENT_TYPE_LABELS = {"full_time": "Full-time", "part_time": "Part-time", "contract": "Contract", "internship": "Internship",
                          "freelance": "Freelance / consultant"}
PERIOD_LABELS = {"annual": "per year", "monthly": "per month", "weekly": "per week", "hourly": "per hour", "one_time": "one-time"}


def _app_base() -> str:
    try:
        from app.services.email_service import _login_url
        return _login_url().rsplit("/login", 1)[0]
    except Exception:
        return ""


def _org_name(db: Session, organization_id) -> str:
    from app.modules.hr.models import Organization
    org = db.query(Organization).filter(Organization.id == organization_id).first() if organization_id else None
    return (org.name if org is not None else "") or "our team"


def _person_name(emp) -> str:
    return f"{emp.first_name or ''} {emp.last_name or ''}".strip() or emp.email


def _hr_recipients(db: Session, organization_id, roles=("admin", "hr_admin")):
    from app.modules.employee.models import Employee, UserRole
    wanted = [UserRole(r) for r in roles]
    return (db.query(Employee)
            .filter(Employee.organization_id == organization_id, Employee.role.in_(wanted), Employee.is_active.is_(True))
            .all())


def _date_display(d) -> str:
    if not d:
        return "To be confirmed"
    if isinstance(d, str):
        d = date.fromisoformat(d[:10])
    return d.strftime("%a, %b %d, %Y")


def _time_display(interview) -> Optional[str]:
    if not interview.start_time:
        return None
    t = interview.start_time + (f" - {interview.end_time}" if interview.end_time else "")
    return f"{t} ({interview.timezone})" if interview.timezone else t


# ── calendar invitation ──────────────────────────────────────────────────────────────────────────────────────────────
def _ics_escape(text: str) -> str:
    return (text or "").replace("\\", "\\\\").replace(";", "\\;").replace(",", "\\,").replace("\n", "\\n")


def interview_ics(interview, organization_name: str, cancel: bool = False) -> Optional[str]:
    """An iCalendar invitation for the interview (METHOD:CANCEL withdraws it). None without a date."""
    if not interview.interview_date:
        return None
    d = interview.interview_date
    stamp = datetime.utcnow().strftime("%Y%m%dT%H%M%SZ")
    lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Zoiko HR//Recruitment//EN",
             f"METHOD:{'CANCEL' if cancel else 'REQUEST'}", "BEGIN:VEVENT",
             f"UID:interview-{interview.id}@zoikohr.com", f"DTSTAMP:{stamp}",
             f"SEQUENCE:{int(datetime.utcnow().timestamp()) // 60 % 100000}"]
    if interview.start_time:
        sh, sm = (int(x) for x in interview.start_time.split(":"))
        start = datetime(d.year, d.month, d.day, sh, sm)
        if interview.end_time:
            eh, em = (int(x) for x in interview.end_time.split(":"))
            end = datetime(d.year, d.month, d.day, eh, em)
        else:
            end = start + timedelta(hours=1)
        tz = f";TZID={interview.timezone}" if interview.timezone else ""
        lines += [f"DTSTART{tz}:{start.strftime('%Y%m%dT%H%M%S')}", f"DTEND{tz}:{end.strftime('%Y%m%dT%H%M%S')}"]
    else:
        lines += [f"DTSTART;VALUE=DATE:{d.strftime('%Y%m%d')}", f"DTEND;VALUE=DATE:{(d + timedelta(days=1)).strftime('%Y%m%d')}"]
    where = interview.meeting_link or interview.location or ""
    lines += [f"SUMMARY:{_ics_escape('Interview: ' + interview.position + ' - ' + organization_name)}",
              f"DESCRIPTION:{_ics_escape('Interview with ' + interview.candidate_name + ' for ' + interview.position + ('. Join: ' + interview.meeting_link if interview.meeting_link else ''))}",
              f"LOCATION:{_ics_escape(where)}",
              f"STATUS:{'CANCELLED' if cancel else 'CONFIRMED'}", "END:VEVENT", "END:VCALENDAR"]
    return "\r\n".join(lines) + "\r\n"


# ── interviews ───────────────────────────────────────────────────────────────────────────────────────────────────────
def _interview_recipients(db: Session, interview):
    """[(email, name, is_candidate)] for the linked candidate and interviewer."""
    from app.modules.employee.models import Employee
    from app.modules.hr.models import RecruitmentCandidate
    out = []
    if interview.candidate_id:
        cand = db.query(RecruitmentCandidate).filter(RecruitmentCandidate.id == interview.candidate_id).first()
        if cand is not None and cand.email:
            out.append((cand.email, cand.name, True))
    if interview.interviewer_id:
        emp = db.query(Employee).filter(Employee.id == interview.interviewer_id, Employee.is_active.is_(True)).first()
        if emp is not None and emp.email:
            out.append((emp.email, _person_name(emp), False))
    return out


def interviewer_name(db: Session, interview) -> Optional[str]:
    if interview.interviewer_id:
        from app.modules.employee.models import Employee
        emp = db.query(Employee).filter(Employee.id == interview.interviewer_id).first()
        if emp is not None:
            return _person_name(emp)
    return interview.interviewer


def notify_interview(db: Session, interview, kind: str, previous_display: Optional[str] = None) -> int:
    """kind: scheduled | rescheduled | cancelled. Returns how many emails were queued."""
    try:
        from app.services import email_service as es
        org = _org_name(db, interview.organization_id)
        sent = 0
        common = dict(candidate_name=interview.candidate_name, position=interview.position, organization_name=org,
                      date_display=_date_display(interview.interview_date), time_display=_time_display(interview),
                      db=db, organization_id=interview.organization_id)
        ics = interview_ics(interview, org, cancel=(kind == "cancelled"))
        for email, name, is_candidate in _interview_recipients(db, interview):
            if kind == "cancelled":
                ok = es.send_interview_cancelled(email, name, is_candidate, ics=ics, **common)
            else:
                extra = dict(interview_type_label=INTERVIEW_TYPE_LABELS.get(interview.interview_type, interview.interview_type or "Interview"),
                             location=interview.location, meeting_link=interview.meeting_link,
                             interviewer_name=interviewer_name(db, interview), ics=ics)
                if kind == "rescheduled":
                    ok = es.send_interview_rescheduled(email, name, is_candidate, previous_display=previous_display, **extra, **common)
                else:
                    ok = es.send_interview_scheduled(email, name, is_candidate, **extra, **common)
            sent += 1 if ok else 0
        return sent
    except Exception:
        logger.exception("interview %s email failed", kind)
        return 0


# ── candidates ───────────────────────────────────────────────────────────────────────────────────────────────────────
CANDIDATE_EMAIL_STATUS = {"screening": ("Under review", False), "rejected": ("Not selected", True)}


def notify_candidate_status(db: Session, candidate, status_value: str) -> bool:
    if status_value not in CANDIDATE_EMAIL_STATUS or not candidate.email:
        return False
    try:
        from app.services.email_service import send_candidate_status_update
        label, rejection = CANDIDATE_EMAIL_STATUS[status_value]
        return bool(send_candidate_status_update(candidate.email, candidate.name, candidate.position,
                                                 _org_name(db, candidate.organization_id), label, is_rejection=rejection,
                                                 db=db, organization_id=candidate.organization_id))
    except Exception:
        logger.exception("candidate status email failed")
        return False


# ── offers ───────────────────────────────────────────────────────────────────────────────────────────────────────────
def money_display(amount, currency: Optional[str], period: Optional[str]) -> str:
    """"INR 25,000 per month" - the currency code is unambiguous in every mail client."""
    if amount is None:
        return "To be confirmed"
    n = float(amount)
    text = f"{(currency or 'USD').upper()} {n:,.0f}" if n == int(n) else f"{(currency or 'USD').upper()} {n:,.2f}"
    if period == "one_time":
        return f"{text} (one-time)"
    suffix = PERIOD_LABELS.get(period or "")
    return f"{text} {suffix}" if suffix else text


def send_offer(db: Session, offer) -> bool:
    """Email the offer's key terms to the linked candidate. False when there is nobody to email."""
    from app.modules.hr.models import RecruitmentCandidate
    cand = db.query(RecruitmentCandidate).filter(RecruitmentCandidate.id == offer.candidate_id).first() if offer.candidate_id else None
    if cand is None or not cand.email:
        return False
    try:
        from app.services.email_service import send_offer_letter
        rem = (offer.remuneration_type or "salary").capitalize()
        return bool(send_offer_letter(
            cand.email, offer.candidate_name, offer.position, _org_name(db, offer.organization_id),
            EMPLOYMENT_TYPE_LABELS.get(offer.employment_type or "", "Employment"), rem,
            money_display(offer.salary, offer.currency, offer.pay_period),
            start_date_display=_date_display(offer.joining_date) if offer.joining_date else None,
            equity=offer.equity, entity_name=offer.entity_name, db=db, organization_id=offer.organization_id,
        ))
    except Exception:
        logger.exception("offer letter email failed")
        return False


def notify_offer_outcome(db: Session, offer, accepted: bool) -> int:
    try:
        from app.services.email_service import send_offer_outcome
        org = _org_name(db, offer.organization_id)
        url = f"{_app_base()}/zoiko-hr/recruitment/offers"
        n = 0
        for admin in _hr_recipients(db, offer.organization_id):
            n += bool(send_offer_outcome(admin.email, admin.first_name or "there", offer.candidate_name, offer.position, org,
                                         accepted, url,
                                         start_date_display=_date_display(offer.joining_date) if offer.joining_date else None,
                                         db=db, organization_id=offer.organization_id))
        return n
    except Exception:
        logger.exception("offer outcome email failed")
        return 0


# ── requisitions ─────────────────────────────────────────────────────────────────────────────────────────────────────
def notify_requisition_submitted(db: Session, req, requester) -> int:
    try:
        from app.services.email_service import send_requisition_approval_request
        org = _org_name(db, req.organization_id)
        url = f"{_app_base()}/zoiko-hr/recruitment/job-requisitions"
        n = 0
        for admin in _hr_recipients(db, req.organization_id, roles=("admin",)):
            if requester is not None and admin.id == getattr(requester, "id", None):
                continue                                   # the approver does not need to be told about their own request
            n += bool(send_requisition_approval_request(
                admin.email, admin.first_name or "there", _person_name(requester) if requester is not None else "A colleague",
                req.title, req.department, req.openings or 1, (req.priority or "medium").capitalize(), org, url,
                location=req.location, db=db, organization_id=req.organization_id))
        return n
    except Exception:
        logger.exception("requisition approval request email failed")
        return 0


def notify_requisition_decision(db: Session, req, approved: bool, decider) -> bool:
    if not req.created_by or (decider is not None and req.created_by == decider.id):
        return False
    try:
        from app.modules.employee.models import Employee
        from app.services.email_service import send_requisition_decision
        requester = db.query(Employee).filter(Employee.id == req.created_by, Employee.is_active.is_(True)).first()
        if requester is None:
            return False
        return bool(send_requisition_decision(
            requester.email, requester.first_name or "there", req.title, req.department, approved,
            _person_name(decider) if decider is not None else "an admin",
            f"{_app_base()}/zoiko-hr/recruitment/job-requisitions", db=db, organization_id=req.organization_id))
    except Exception:
        logger.exception("requisition decision email failed")
        return False
