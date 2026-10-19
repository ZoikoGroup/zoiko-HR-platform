import re
from datetime import datetime, date
from typing import Optional
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.modules.hr import recruitment_notify as notify
from app.modules.hr.models import (
    RecruitmentCandidate, RecruitmentRequisition, RecruitmentInterview, RecruitmentOffer,
    RecruitmentDocument, RecruitmentApplication,
    RecruitmentInterviewFeedback, RecruitmentOfferApproval,
    RecruitmentCandidateStatus, RequisitionStatus, InterviewStatus, OfferStatus,
    OnboardingNewHire, OnboardingActivity,
)
from app.modules.hr.schemas import (
    RequisitionCreate, RequisitionUpdate,
    CandidateCreate, CandidateUpdate, CandidateStatusUpdate,
    InterviewCreate, InterviewUpdate, InterviewFeedback,
    OfferCreate, OfferUpdate, OfferStatusUpdate,
    DocumentCreate, DocumentResponse,
    ApplicationCreate, ApplicationResponse,
    InterviewFeedbackCreate,
    OfferApprovalCreate, OfferApprovalResponse,
)
from app.core.exceptions import NotFoundException, BadRequestException
from app.core.sanitize import sanitize_dict


def get_recruitment_dashboard(db: Session, organization_id: Optional[int] = None) -> dict:
    org = organization_id
    open_reqs = db.query(RecruitmentRequisition).filter(
        RecruitmentRequisition.status == RequisitionStatus.OPEN, RecruitmentRequisition.organization_id == org).all()
    open_requisitions = len(open_reqs)
    total_open_positions = sum(max((r.openings or 0) - (r.filled or 0), 0) for r in open_reqs)    # seats, not requisitions

    active_candidates = db.query(func.count(RecruitmentCandidate.id)).filter(
        RecruitmentCandidate.organization_id == org,
        RecruitmentCandidate.status.notin_([RecruitmentCandidateStatus.HIRED, RecruitmentCandidateStatus.REJECTED]),
    ).scalar() or 0

    scheduled_interviews = db.query(func.count(RecruitmentInterview.id)).filter(
        RecruitmentInterview.organization_id == org,
        RecruitmentInterview.status == InterviewStatus.SCHEDULED,
        RecruitmentInterview.interview_date >= date.today(),                                   # upcoming only
    ).scalar() or 0

    offers_extended = db.query(func.count(RecruitmentOffer.id)).filter(
        RecruitmentOffer.organization_id == org,
        RecruitmentOffer.status.in_([OfferStatus.PENDING, OfferStatus.APPROVED, OfferStatus.COUNTERED]),
    ).scalar() or 0
    offers_accepted = db.query(func.count(RecruitmentOffer.id)).filter(
        RecruitmentOffer.organization_id == org, RecruitmentOffer.status == OfferStatus.ACCEPTED,
    ).scalar() or 0

    # Time to hire: from application to the moment they were hired, for candidates whose hire time is known.
    hired = db.query(RecruitmentCandidate.applied_at, RecruitmentCandidate.hired_at).filter(
        RecruitmentCandidate.organization_id == org,
        RecruitmentCandidate.status == RecruitmentCandidateStatus.HIRED,
        RecruitmentCandidate.hired_at.isnot(None), RecruitmentCandidate.applied_at.isnot(None),
    ).all()
    spans = [max((h - a).total_seconds() / 86400, 0) for a, h in hired]
    time_to_hire = round(sum(spans) / len(spans), 1) if spans else None

    hiring_funnel = (db.query(RecruitmentCandidate.status, func.count(RecruitmentCandidate.id))
                     .filter(RecruitmentCandidate.organization_id == org)
                     .group_by(RecruitmentCandidate.status).all())

    last_change = func.coalesce(RecruitmentCandidate.updated_at, RecruitmentCandidate.created_at)
    recent = (db.query(RecruitmentCandidate).filter(RecruitmentCandidate.organization_id == org)
              .order_by(last_change.desc(), RecruitmentCandidate.id.desc()).limit(10).all())

    return {
        "total_open_positions": total_open_positions,
        "open_requisitions": open_requisitions,
        "active_candidates": active_candidates,
        "scheduled_interviews": scheduled_interviews,
        "offers_extended": offers_extended,
        "offers_accepted": offers_accepted,
        "time_to_hire": time_to_hire,
        "hires_measured": len(spans),
        "hiring_funnel": [{"status": st.value, "count": cnt} for st, cnt in hiring_funnel],
        "recent_activity": [
            {
                "id": c.id,
                "name": c.name,
                "position": c.position,
                "status": c.status.value if c.status else None,
                "applied_at": c.applied_at,
                "updated_at": c.updated_at or c.created_at,
            }
            for c in recent
        ],
    }


def create_requisition(db: Session, data: RequisitionCreate, organization_id: Optional[int] = None, actor=None) -> RecruitmentRequisition:
    safe = sanitize_dict(data.model_dump(exclude_unset=True))
    status_value = safe.pop("status", None) or "draft"
    req = RecruitmentRequisition(**safe)
    req.status = RequisitionStatus.PENDING if status_value == "pending" else RequisitionStatus.DRAFT
    req.filled = 0
    req.created_by = getattr(actor, "id", None)
    if organization_id:
        req.organization_id = organization_id
    db.add(req)
    db.commit()
    db.refresh(req)
    req.candidate_count = 0
    if req.status == RequisitionStatus.PENDING:
        notify.notify_requisition_submitted(db, req, actor)
    return req


def _attach_candidate_counts(db: Session, requisitions: list) -> None:
    """Set a live `.candidate_count` attribute on each requisition (not persisted)."""
    ids = [r.id for r in requisitions]
    for r in requisitions:
        r.candidate_count = 0
    if not ids:
        return
    counts = (
        db.query(RecruitmentCandidate.requisition_id, func.count(RecruitmentCandidate.id))
        .filter(RecruitmentCandidate.requisition_id.in_(ids))
        .group_by(RecruitmentCandidate.requisition_id)
        .all()
    )
    counts_by_id = {req_id: count for req_id, count in counts}
    for r in requisitions:
        r.candidate_count = counts_by_id.get(r.id, 0)


def get_requisitions(
    db: Session,
    organization_id: Optional[int] = None,
    page: int = 1,
    per_page: int = 20,
    search: Optional[str] = None,
    status: Optional[RequisitionStatus] = None,
    department: Optional[str] = None,
) -> dict:
    per_page = min(per_page, 100)
    query = db.query(RecruitmentRequisition)

    if organization_id:
        query = query.filter(RecruitmentRequisition.organization_id == organization_id)

    if search:
        term = f"%{search}%"
        query = query.filter(
            (RecruitmentRequisition.title.ilike(term)) |
            (RecruitmentRequisition.department.ilike(term))
        )

    if status:
        query = query.filter(RecruitmentRequisition.status == status)

    if department:
        query = query.filter(RecruitmentRequisition.department == department)

    total = query.count()
    items = query.order_by(RecruitmentRequisition.created_at.desc()).offset((page - 1) * per_page).limit(per_page).all()
    _attach_candidate_counts(db, items)

    return {
        "total": total,
        "page": page,
        "per_page": per_page,
        "pages": (total + per_page - 1) // per_page,
        "items": items,
    }


def get_requisition_by_id(db: Session, req_id: int, organization_id: Optional[int] = None) -> RecruitmentRequisition:
    filter_args = [RecruitmentRequisition.id == req_id]
    if organization_id:
        filter_args.append(RecruitmentRequisition.organization_id == organization_id)
    req = db.query(RecruitmentRequisition).filter(*filter_args).first()
    if not req:
        raise NotFoundException("RecruitmentRequisition", req_id)
    _attach_candidate_counts(db, [req])
    return req


def update_requisition(db: Session, req_id: int, data: RequisitionUpdate, organization_id: Optional[int] = None) -> RecruitmentRequisition:
    req = get_requisition_by_id(db, req_id, organization_id)
    if req.status == RequisitionStatus.CLOSED:
        raise BadRequestException("A closed requisition can no longer be edited.")
    update_data = sanitize_dict(data.model_dump(exclude_unset=True))
    for required in ("title", "department", "openings", "priority"):
        if required in update_data and update_data[required] is None:
            update_data.pop(required)
    if "openings" in update_data and update_data["openings"] < (req.filled or 0):
        raise BadRequestException(f"{req.filled} opening(s) are already filled; openings cannot be lower than that.")
    for field, value in update_data.items():
        setattr(req, field, value)
    if req.status == RequisitionStatus.OPEN and (req.filled or 0) >= (req.openings or 0):
        req.status = RequisitionStatus.CLOSED                          # every seat is filled
    db.commit()
    db.refresh(req)
    _attach_candidate_counts(db, [req])
    return req


def delete_requisition(db: Session, req_id: int, organization_id: Optional[int] = None) -> None:
    req = get_requisition_by_id(db, req_id, organization_id)
    if getattr(req, "candidate_count", 0):
        raise BadRequestException(
            f"{req.candidate_count} candidate(s) are linked to this requisition. Close it instead, or unlink them first.")
    db.delete(req)
    db.commit()


def _move_requisition(db: Session, req: RecruitmentRequisition, allowed_from, to, message: str) -> RecruitmentRequisition:
    if req.status not in allowed_from:
        raise BadRequestException(message)
    req.status = to
    db.commit()
    db.refresh(req)
    _attach_candidate_counts(db, [req])
    return req


def submit_requisition(db: Session, req_id: int, organization_id: Optional[int] = None, actor=None) -> RecruitmentRequisition:
    req = get_requisition_by_id(db, req_id, organization_id)
    req = _move_requisition(db, req, {RequisitionStatus.DRAFT}, RequisitionStatus.PENDING, "Only a draft can be submitted for approval.")
    notify.notify_requisition_submitted(db, req, actor)
    return req


def approve_requisition(db: Session, req_id: int, organization_id: Optional[int] = None, actor=None) -> RecruitmentRequisition:
    req = get_requisition_by_id(db, req_id, organization_id)
    req = _move_requisition(db, req, {RequisitionStatus.DRAFT, RequisitionStatus.PENDING}, RequisitionStatus.OPEN,
                            "Requisition must be in DRAFT or PENDING status to approve")
    notify.notify_requisition_decision(db, req, True, actor)
    return req


def reject_requisition(db: Session, req_id: int, organization_id: Optional[int] = None, actor=None) -> RecruitmentRequisition:
    req = get_requisition_by_id(db, req_id, organization_id)
    req = _move_requisition(db, req, {RequisitionStatus.DRAFT, RequisitionStatus.PENDING}, RequisitionStatus.CLOSED,
                            "Only a requisition awaiting approval can be rejected. Close an open one instead.")
    notify.notify_requisition_decision(db, req, False, actor)
    return req


def hold_requisition(db: Session, req_id: int, organization_id: Optional[int] = None) -> RecruitmentRequisition:
    req = get_requisition_by_id(db, req_id, organization_id)
    return _move_requisition(db, req, {RequisitionStatus.OPEN}, RequisitionStatus.ON_HOLD, "Only an open requisition can be put on hold.")


def resume_requisition(db: Session, req_id: int, organization_id: Optional[int] = None) -> RecruitmentRequisition:
    req = get_requisition_by_id(db, req_id, organization_id)
    return _move_requisition(db, req, {RequisitionStatus.ON_HOLD}, RequisitionStatus.OPEN, "Only a requisition on hold can be resumed.")


def close_requisition(db: Session, req_id: int, organization_id: Optional[int] = None) -> RecruitmentRequisition:
    req = get_requisition_by_id(db, req_id, organization_id)
    return _move_requisition(db, req, {RequisitionStatus.OPEN, RequisitionStatus.ON_HOLD}, RequisitionStatus.CLOSED,
                             "Only an open or on-hold requisition can be closed.")


def _attach_requisition_titles(db: Session, candidates: list) -> None:
    """Set a live `.requisition_title` attribute on each candidate (not persisted)."""
    for c in candidates:
        c.requisition_title = None
    req_ids = {c.requisition_id for c in candidates if c.requisition_id}
    if not req_ids:
        return
    titles = dict(
        db.query(RecruitmentRequisition.id, RecruitmentRequisition.title)
        .filter(RecruitmentRequisition.id.in_(req_ids))
        .all()
    )
    for c in candidates:
        if c.requisition_id:
            c.requisition_title = titles.get(c.requisition_id)


def _check_candidate(db: Session, organization_id, email, position, requisition_id, exclude_id=None) -> None:
    """A candidate applies once per position, and a linked requisition must belong to this organization."""
    if requisition_id:
        q = db.query(RecruitmentRequisition.id).filter(RecruitmentRequisition.id == requisition_id)
        if organization_id:
            q = q.filter(RecruitmentRequisition.organization_id == organization_id)
        if not q.first():
            raise BadRequestException("The selected job requisition was not found.")
    if email and position:
        dup = db.query(RecruitmentCandidate.id).filter(
            func.lower(RecruitmentCandidate.email) == email.lower(), func.lower(RecruitmentCandidate.position) == position.lower(),
        )
        if organization_id:
            dup = dup.filter(RecruitmentCandidate.organization_id == organization_id)
        if exclude_id:
            dup = dup.filter(RecruitmentCandidate.id != exclude_id)
        if dup.first():
            raise BadRequestException(f"A candidate with the email {email} has already applied for {position}.")


# Where a candidate can move from each stage. Hired is final (onboarding has started); a rejected candidate can only be
# reopened as a fresh application.
CANDIDATE_TRANSITIONS = {
    RecruitmentCandidateStatus.APPLIED: {RecruitmentCandidateStatus.SCREENING, RecruitmentCandidateStatus.INTERVIEW,
                                         RecruitmentCandidateStatus.OFFER, RecruitmentCandidateStatus.REJECTED},
    RecruitmentCandidateStatus.SCREENING: {RecruitmentCandidateStatus.APPLIED, RecruitmentCandidateStatus.INTERVIEW,
                                           RecruitmentCandidateStatus.OFFER, RecruitmentCandidateStatus.REJECTED},
    RecruitmentCandidateStatus.INTERVIEW: {RecruitmentCandidateStatus.SCREENING, RecruitmentCandidateStatus.OFFER,
                                           RecruitmentCandidateStatus.REJECTED},
    RecruitmentCandidateStatus.OFFER: {RecruitmentCandidateStatus.INTERVIEW, RecruitmentCandidateStatus.HIRED,
                                       RecruitmentCandidateStatus.REJECTED},
    RecruitmentCandidateStatus.HIRED: set(),
    RecruitmentCandidateStatus.REJECTED: {RecruitmentCandidateStatus.APPLIED},
}


def check_candidate_transition(current, new) -> None:
    if new is None or new == current:
        return
    if new not in CANDIDATE_TRANSITIONS.get(current, set()):
        if current == RecruitmentCandidateStatus.HIRED:
            raise BadRequestException("This candidate is already hired, so their stage can no longer change.")
        if current == RecruitmentCandidateStatus.REJECTED:
            raise BadRequestException("A rejected candidate can only be reopened as Applied.")
        raise BadRequestException(f"A candidate in {_label(current)} cannot move to {_label(new)}.")


def _after_candidate_status_change(db: Session, candidate: RecruitmentCandidate, previous, organization_id) -> None:
    if candidate.status == previous:
        return
    if candidate.status == RecruitmentCandidateStatus.HIRED:
        _handle_candidate_hired(db, candidate, organization_id)
    notify.notify_candidate_status(db, candidate, candidate.status.value)


def create_candidate(db: Session, data: CandidateCreate, organization_id: Optional[int] = None) -> RecruitmentCandidate:
    _check_candidate(db, organization_id, data.email, data.position, data.requisition_id)
    safe = sanitize_dict(data.model_dump(exclude_unset=True))
    if safe.get("status") in (RecruitmentCandidateStatus.HIRED, RecruitmentCandidateStatus.REJECTED):
        raise BadRequestException("A new candidate starts in the pipeline; mark them hired through an accepted offer.")
    candidate = RecruitmentCandidate(**safe)
    if organization_id:
        candidate.organization_id = organization_id
    db.add(candidate)
    db.commit()
    db.refresh(candidate)
    _attach_requisition_titles(db, [candidate])
    return candidate


def get_candidates(
    db: Session,
    organization_id: Optional[int] = None,
    page: int = 1,
    per_page: int = 20,
    search: Optional[str] = None,
    status: Optional[RecruitmentCandidateStatus] = None,
    position: Optional[str] = None,
    requisition_id: Optional[int] = None,
) -> dict:
    per_page = min(per_page, 100)
    query = db.query(RecruitmentCandidate)

    if organization_id:
        query = query.filter(RecruitmentCandidate.organization_id == organization_id)

    if search:
        term = f"%{search}%"
        query = query.filter(
            (RecruitmentCandidate.name.ilike(term)) |
            (RecruitmentCandidate.email.ilike(term)) |
            (RecruitmentCandidate.position.ilike(term))
        )

    if status:
        query = query.filter(RecruitmentCandidate.status == status)

    if position:
        query = query.filter(RecruitmentCandidate.position == position)

    if requisition_id:
        query = query.filter(RecruitmentCandidate.requisition_id == requisition_id)

    total = query.count()
    items = query.order_by(RecruitmentCandidate.created_at.desc()).offset((page - 1) * per_page).limit(per_page).all()
    _attach_requisition_titles(db, items)

    return {
        "total": total,
        "page": page,
        "per_page": per_page,
        "pages": (total + per_page - 1) // per_page,
        "items": items,
    }


def get_candidate_by_id(db: Session, candidate_id: int, organization_id: Optional[int] = None) -> RecruitmentCandidate:
    filter_args = [RecruitmentCandidate.id == candidate_id]
    if organization_id:
        filter_args.append(RecruitmentCandidate.organization_id == organization_id)
    candidate = db.query(RecruitmentCandidate).filter(*filter_args).first()
    if not candidate:
        raise NotFoundException("RecruitmentCandidate", candidate_id)
    _attach_requisition_titles(db, [candidate])
    return candidate


def _create_onboarding_record_for_hire(db: Session, candidate: RecruitmentCandidate, organization_id: Optional[int] = None) -> OnboardingNewHire:
    """When a candidate is marked HIRED, start their onboarding (unless they are already being onboarded): the record
    carries the accepted offer's start date and employment type and the requisition's department, and the
    organization's onboarding settings are applied (checklists, document requests, the pre-onboarding invite)."""
    active = ("offer_sent", "offer_accepted", "pre_joining", "in_progress")
    if candidate.onboarding_new_hire_id:
        existing_by_id = db.query(OnboardingNewHire).filter(
            OnboardingNewHire.id == candidate.onboarding_new_hire_id,
            OnboardingNewHire.organization_id == organization_id,
            OnboardingNewHire.is_deleted == False,
            OnboardingNewHire.status.in_(active),
        ).first()
        if existing_by_id:
            return existing_by_id

    existing_by_email = db.query(OnboardingNewHire).filter(
        func.lower(OnboardingNewHire.email) == (candidate.email or "").lower(),
        OnboardingNewHire.organization_id == organization_id,
        OnboardingNewHire.is_deleted == False,
        OnboardingNewHire.status.in_(active),          # a finished or cancelled onboarding is not reused for a re-hire
    ).first()
    if existing_by_email:
        candidate.onboarding_new_hire_id = existing_by_email.id
        db.commit()
        return existing_by_email

    accepted_offer = (
        db.query(RecruitmentOffer)
        .filter(RecruitmentOffer.candidate_id == candidate.id, RecruitmentOffer.status == OfferStatus.ACCEPTED)
        .order_by(RecruitmentOffer.updated_at.desc(), RecruitmentOffer.id.desc())
        .first()
    )
    department_id = None
    if candidate.requisition_id:
        from app.modules.hr.models import Department
        req = db.query(RecruitmentRequisition).filter(RecruitmentRequisition.id == candidate.requisition_id).first()
        if req is not None and req.department:
            dept = db.query(Department).filter(func.lower(Department.name) == req.department.strip().lower(),
                                               Department.organization_id == organization_id).first()
            department_id = dept.id if dept is not None else None

    new_hire = OnboardingNewHire(
        candidate_name=candidate.name,
        email=candidate.email,
        phone=candidate.phone,
        position=accepted_offer.position if accepted_offer else candidate.position,
        joining_date=accepted_offer.joining_date if accepted_offer else None,
        employment_type=accepted_offer.employment_type if accepted_offer else None,
        department_id=department_id,
        status="offer_accepted",
    )
    if organization_id is not None:
        new_hire.organization_id = organization_id
    db.add(new_hire)
    db.commit()
    db.refresh(new_hire)

    candidate.onboarding_new_hire_id = new_hire.id
    db.commit()

    activity = OnboardingActivity(
        onboarding_new_hire_id=new_hire.id,
        action="Hired via Recruitment",
        description=f"{candidate.name} was marked Hired in Recruitment and added to Onboarding.",
        organization_id=organization_id,
    )
    db.add(activity)
    db.commit()
    from app.modules.hr import onboarding_flow
    onboarding_flow.start_onboarding(db, new_hire)
    return new_hire


def _increment_requisition_filled(db: Session, requisition_id: int) -> None:
    """Count one more filled opening against the requisition, auto-closing it once full."""
    req = db.query(RecruitmentRequisition).filter(RecruitmentRequisition.id == requisition_id).first()
    if not req:
        return
    req.filled = (req.filled or 0) + 1
    if req.status == RequisitionStatus.OPEN and req.filled >= req.openings:
        req.status = RequisitionStatus.CLOSED
    db.commit()


def _handle_candidate_hired(db: Session, candidate: RecruitmentCandidate, organization_id: Optional[int] = None) -> OnboardingNewHire:
    """Single entry point for 'a candidate just became HIRED' — starts onboarding and
    counts the hire against their linked requisition, exactly once per candidate."""
    is_first_hire = candidate.onboarding_new_hire_id is None
    if candidate.hired_at is None:
        candidate.hired_at = datetime.utcnow()
        db.commit()
    new_hire = _create_onboarding_record_for_hire(db, candidate, organization_id)
    if is_first_hire and candidate.requisition_id:
        _increment_requisition_filled(db, candidate.requisition_id)
    return new_hire


def update_candidate(db: Session, candidate_id: int, data: CandidateUpdate, organization_id: Optional[int] = None) -> RecruitmentCandidate:
    candidate = get_candidate_by_id(db, candidate_id, organization_id)
    previous_status = candidate.status
    update_data = sanitize_dict(data.model_dump(exclude_unset=True))
    for required in ("name", "email", "position", "status"):
        if update_data.get(required) is None:
            update_data.pop(required, None)
    new_req = update_data.get("requisition_id")
    if "requisition_id" in update_data and new_req == candidate.requisition_id:
        new_req = None      # unchanged, nothing to verify
    if {"email", "position"} & set(update_data) or new_req:
        _check_candidate(db, organization_id, update_data.get("email", candidate.email), update_data.get("position", candidate.position), new_req, exclude_id=candidate.id)
    check_candidate_transition(previous_status, update_data.get("status"))
    for field, value in update_data.items():
        setattr(candidate, field, value)
    db.commit()
    db.refresh(candidate)
    _after_candidate_status_change(db, candidate, previous_status, organization_id)
    _attach_requisition_titles(db, [candidate])
    return candidate


def delete_candidate(db: Session, candidate_id: int, organization_id: Optional[int] = None) -> None:
    candidate = get_candidate_by_id(db, candidate_id, organization_id)
    linked = {
        "interview(s)": db.query(func.count(RecruitmentInterview.id)).filter(RecruitmentInterview.candidate_id == candidate.id).scalar() or 0,
        "offer(s)": db.query(func.count(RecruitmentOffer.id)).filter(RecruitmentOffer.candidate_id == candidate.id).scalar() or 0,
        "document(s)": db.query(func.count(RecruitmentDocument.id)).filter(RecruitmentDocument.candidate_id == candidate.id).scalar() or 0,
        "application(s)": db.query(func.count(RecruitmentApplication.id)).filter(RecruitmentApplication.candidate_id == candidate.id).scalar() or 0,
    }
    held = [f"{n} {what}" for what, n in linked.items() if n]
    if held:
        raise BadRequestException(f"This candidate has {', '.join(held)}. Mark them rejected instead of deleting the record.")
    db.delete(candidate)
    db.commit()


def update_candidate_status(db: Session, candidate_id: int, data: CandidateStatusUpdate, organization_id: Optional[int] = None) -> RecruitmentCandidate:
    candidate = get_candidate_by_id(db, candidate_id, organization_id)
    previous_status = candidate.status
    check_candidate_transition(previous_status, data.status)
    candidate.status = data.status
    db.commit()
    db.refresh(candidate)
    _after_candidate_status_change(db, candidate, previous_status, organization_id)
    _attach_requisition_titles(db, [candidate])
    return candidate


def _check_interview_links(db: Session, values: dict, organization_id: Optional[int]) -> None:
    """A linked candidate / interviewer must belong to this organization; a linked candidate fills the name and position."""
    from app.modules.employee.models import Employee
    if values.get("candidate_id"):
        cand = db.query(RecruitmentCandidate).filter(RecruitmentCandidate.id == values["candidate_id"],
                                                     RecruitmentCandidate.organization_id == organization_id).first()
        if cand is None:
            raise BadRequestException("The selected candidate was not found.")
        values.setdefault("candidate_name", cand.name)
        values.setdefault("position", cand.position)
    if values.get("interviewer_id"):
        emp = db.query(Employee).filter(Employee.id == values["interviewer_id"], Employee.organization_id == organization_id,
                                        Employee.is_active.is_(True)).first()
        if emp is None:
            raise BadRequestException("The selected interviewer was not found.")
        values["interviewer"] = f"{emp.first_name or ''} {emp.last_name or ''}".strip() or emp.email


def _interview_when(interview) -> str:
    return f"{interview.interview_date:%a, %b %d, %Y}" + (f" {interview.start_time}" if interview.start_time else "")


def create_interview(db: Session, data: InterviewCreate, organization_id: Optional[int] = None) -> RecruitmentInterview:
    safe = sanitize_dict(data.model_dump(exclude_unset=True))
    send = safe.pop("notify", True)
    if safe.get("interview_date") and safe["interview_date"] < date.today():
        raise BadRequestException("An interview cannot be scheduled in the past.")
    _check_interview_links(db, safe, organization_id)
    interview = RecruitmentInterview(**safe)
    if organization_id:
        interview.organization_id = organization_id
    db.add(interview)
    db.commit()
    db.refresh(interview)
    if interview.candidate_id:                     # the candidate is now at the interview stage
        cand = db.query(RecruitmentCandidate).filter(RecruitmentCandidate.id == interview.candidate_id).first()
        if cand is not None and cand.status in (RecruitmentCandidateStatus.APPLIED, RecruitmentCandidateStatus.SCREENING):
            cand.status = RecruitmentCandidateStatus.INTERVIEW
            db.commit()
    interview.emails_sent = notify.notify_interview(db, interview, "scheduled") if send else 0
    return interview


def get_interviews(
    db: Session,
    organization_id: Optional[int] = None,
    page: int = 1,
    per_page: int = 20,
    candidate_id: Optional[int] = None,
    status: Optional[InterviewStatus] = None,
) -> dict:
    per_page = min(per_page, 100)
    query = db.query(RecruitmentInterview)

    if organization_id:
        query = query.filter(RecruitmentInterview.organization_id == organization_id)

    if candidate_id:
        query = query.filter(RecruitmentInterview.candidate_id == candidate_id)

    if status:
        query = query.filter(RecruitmentInterview.status == status)

    total = query.count()
    items = query.order_by(RecruitmentInterview.interview_date.desc()).offset((page - 1) * per_page).limit(per_page).all()

    return {
        "total": total,
        "page": page,
        "per_page": per_page,
        "pages": (total + per_page - 1) // per_page,
        "items": items,
    }


def get_interview_by_id(db: Session, interview_id: int, organization_id: Optional[int] = None) -> RecruitmentInterview:
    filter_args = [RecruitmentInterview.id == interview_id]
    if organization_id:
        filter_args.append(RecruitmentInterview.organization_id == organization_id)
    interview = db.query(RecruitmentInterview).filter(*filter_args).first()
    if not interview:
        raise NotFoundException("RecruitmentInterview", interview_id)
    return interview


# Where an interview can go from each status. A finished interview stays finished and a cancelled one can only be
# put back on the calendar, so it can never flip between completed and cancelled.
INTERVIEW_TRANSITIONS = {
    InterviewStatus.SCHEDULED: {InterviewStatus.IN_PROGRESS, InterviewStatus.COMPLETED, InterviewStatus.CANCELLED},
    InterviewStatus.IN_PROGRESS: {InterviewStatus.COMPLETED, InterviewStatus.CANCELLED},
    InterviewStatus.COMPLETED: set(),
    InterviewStatus.CANCELLED: {InterviewStatus.SCHEDULED},
}


def _label(status) -> str:
    return str(getattr(status, "value", status)).replace("_", " ")


def check_interview_transition(current, new) -> None:
    if new is None or new == current:
        return
    if new not in INTERVIEW_TRANSITIONS.get(current, set()):
        if current == InterviewStatus.COMPLETED:
            raise BadRequestException("This interview is already completed, so its status can no longer be changed.")
        if current == InterviewStatus.CANCELLED:
            raise BadRequestException("A cancelled interview cannot be marked " + _label(new) + ". Reschedule it first.")
        raise BadRequestException(f"An interview that is {_label(current)} cannot be changed to {_label(new)}.")


def update_interview(db: Session, interview_id: int, data: InterviewUpdate, organization_id: Optional[int] = None) -> RecruitmentInterview:
    interview = get_interview_by_id(db, interview_id, organization_id)
    check_interview_transition(interview.status, data.status)
    update_data = sanitize_dict(data.model_dump(exclude_unset=True))
    send = update_data.pop("notify", True)
    for required in ("status", "candidate_name", "position", "interview_date", "interview_type"):
        if required in update_data and update_data[required] is None:
            update_data.pop(required)
    if interview.status == InterviewStatus.COMPLETED and {"interview_date", "start_time", "end_time"} & set(update_data):
        raise BadRequestException("A completed interview cannot be moved.")
    _check_interview_links(db, update_data, organization_id)
    before = (interview.interview_date, interview.start_time, interview.end_time, interview.timezone)
    previous_display = _interview_when(interview)
    previous_status = interview.status
    for field, value in update_data.items():
        setattr(interview, field, value)
    if interview.start_time and interview.end_time and interview.end_time <= interview.start_time:
        raise BadRequestException("The end time must be after the start time.")
    moved = before != (interview.interview_date, interview.start_time, interview.end_time, interview.timezone)
    if moved and interview.interview_date < date.today():
        raise BadRequestException("An interview cannot be moved into the past.")
    db.commit()
    db.refresh(interview)
    sent = 0
    if send:
        if interview.status == InterviewStatus.CANCELLED and previous_status != InterviewStatus.CANCELLED:
            sent = notify.notify_interview(db, interview, "cancelled")
        elif previous_status == InterviewStatus.CANCELLED and interview.status == InterviewStatus.SCHEDULED:
            sent = notify.notify_interview(db, interview, "scheduled")
        elif moved and interview.status == InterviewStatus.SCHEDULED:
            sent = notify.notify_interview(db, interview, "rescheduled", previous_display=previous_display)
    interview.emails_sent = sent
    return interview


def delete_interview(db: Session, interview_id: int, organization_id: Optional[int] = None) -> None:
    interview = get_interview_by_id(db, interview_id, organization_id)
    db.delete(interview)
    db.commit()


def update_interview_feedback(db: Session, interview_id: int, data: InterviewFeedback, organization_id: Optional[int] = None) -> RecruitmentInterview:
    interview = get_interview_by_id(db, interview_id, organization_id)
    if interview.status == InterviewStatus.CANCELLED:
        raise BadRequestException("Feedback cannot be added to a cancelled interview.")
    check_interview_transition(interview.status, data.status)
    update_data = data.model_dump(exclude_unset=True)
    if update_data.get("status") is None:
        update_data.pop("status", None)
    for field, value in update_data.items():
        setattr(interview, field, value)
    db.commit()
    db.refresh(interview)
    return interview


# Statuses an offer can be put in by editing it. Accepted / rejected / withdrawn go through their own endpoints, which also
# start onboarding and check the transition.
_EDITABLE_OFFER_STATUSES = {OfferStatus.DRAFT, OfferStatus.PENDING, OfferStatus.APPROVED, OfferStatus.COUNTERED}
_DEFAULT_PAY_PERIOD = {"salary": "annual", "stipend": "monthly", "fee": "one_time"}


def _apply_offer_pay_rules(db: Session, values: dict, organization_id: Optional[int], current: Optional[RecruitmentOffer] = None) -> dict:
    """Normalise how an offer is paid. Internships pay a stipend (never a salary); the currency follows the work country,
    then the candidate's location, then the organization's own currency."""
    from app.core import regions

    def cur(field):
        return values[field] if field in values else (getattr(current, field, None) if current is not None else None)

    for field in ("work_country", "entity_country"):
        if values.get(field):
            code = regions.country_code(values[field])
            if not code:
                raise BadRequestException(f"Unknown country code: {values[field]}.")
            values[field] = code

    employment_type = cur("employment_type")
    remuneration = cur("remuneration_type")
    if employment_type == "internship":
        if remuneration in ("salary", "fee") and "remuneration_type" in values:
            raise BadRequestException("An internship offers a stipend, not a salary or fee.")
        values["remuneration_type"] = remuneration = "stipend"
    elif employment_type == "freelance" and not remuneration:
        values["remuneration_type"] = remuneration = "fee"
    if not remuneration:
        values["remuneration_type"] = remuneration = "salary"
    if remuneration == "stipend" and employment_type not in (None, "internship"):
        raise BadRequestException("A stipend is paid for internships; set the employment type to Internship.")

    if not cur("pay_period"):
        values["pay_period"] = _DEFAULT_PAY_PERIOD[remuneration]

    if values.get("currency"):
        if not regions.is_currency(values["currency"]):
            raise BadRequestException(f"Unknown currency: {values['currency']}.")
        values["currency"] = values["currency"].upper()
    elif not cur("currency"):
        country = cur("work_country")
        if not country:
            cand_id = cur("candidate_id")
            cand = db.query(RecruitmentCandidate).filter(RecruitmentCandidate.id == cand_id).first() if cand_id else None
            country = regions.country_code(cand.location) if cand is not None and cand.location else None
            if country and not cur("work_country"):
                values["work_country"] = country
        org_currency = None
        if organization_id:
            from app.modules.hr.models import Organization
            org = db.query(Organization).filter(Organization.id == organization_id).first()
            if org is not None:
                org_currency = org.currency if regions.is_currency(org.currency) else regions.currency_for(org.country)
        values["currency"] = regions.currency_for(country, org_currency) if country else (org_currency or regions.DEFAULT_CURRENCY)
    _check_entity(values, current)
    return values


def _check_entity(values: dict, current) -> None:
    """The contracting entity is identified and addressed the way its country does it (GSTIN in India, EIN in the US...)."""
    from app.core import business_ids

    def cur(field):
        return values[field] if field in values else (getattr(current, field, None) if current is not None else None)

    has_entity = any(cur(f) for f in ("entity_name", "entity_tax_id", "entity_address", "entity_city", "entity_postal_code"))
    if not has_entity:
        return
    country = cur("entity_country") or cur("work_country")
    if not country:
        raise BadRequestException("Choose the country the contracting entity is registered in.")
    values["entity_country"] = country
    if cur("entity_tax_id") is not None or "entity_id_type" in values:
        id_key = business_ids.id_type(country, cur("entity_id_type"))["key"]
        values["entity_id_type"] = id_key
        if cur("entity_tax_id"):
            problem = business_ids.validate_id(country, id_key, cur("entity_tax_id"))
            if problem:
                raise BadRequestException(problem)
            values["entity_tax_id"] = business_ids.clean(cur("entity_tax_id"))
    if cur("entity_postal_code"):
        problem = business_ids.validate_postal(country, cur("entity_postal_code"))
        if problem:
            raise BadRequestException(problem)
        values["entity_postal_code"] = str(cur("entity_postal_code")).strip().upper()
    regions = business_ids.REGIONS.get(country)
    if regions and cur("entity_region") and cur("entity_region") not in regions:
        raise BadRequestException(f"Choose a valid {business_ids.format_for(country)['region_label'] or 'region'}.")


def _check_offer_candidate(db: Session, candidate_id: Optional[int], organization_id: Optional[int]) -> None:
    if candidate_id and organization_id:
        exists = db.query(RecruitmentCandidate.id).filter(RecruitmentCandidate.id == candidate_id,
                                                          RecruitmentCandidate.organization_id == organization_id).first()
        if not exists:
            raise BadRequestException("The linked candidate was not found.")


def create_offer(db: Session, data: OfferCreate, organization_id: Optional[int] = None) -> RecruitmentOffer:
    safe = sanitize_dict(data.model_dump(exclude_unset=True))
    if safe.get("status") is None:
        safe.pop("status", None)
    elif safe["status"] not in (OfferStatus.DRAFT, OfferStatus.PENDING):
        raise BadRequestException("A new offer starts as Draft or Pending.")
    _check_offer_candidate(db, safe.get("candidate_id"), organization_id)
    safe = _apply_offer_pay_rules(db, safe, organization_id)
    offer = RecruitmentOffer(**safe)
    if organization_id:
        offer.organization_id = organization_id
    db.add(offer)
    db.commit()
    db.refresh(offer)
    return offer


def get_offers(
    db: Session,
    organization_id: Optional[int] = None,
    page: int = 1,
    per_page: int = 20,
    candidate_id: Optional[int] = None,
    status: Optional[OfferStatus] = None,
) -> dict:
    per_page = min(per_page, 100)
    query = db.query(RecruitmentOffer)

    if organization_id:
        query = query.filter(RecruitmentOffer.organization_id == organization_id)

    if candidate_id:
        query = query.filter(RecruitmentOffer.candidate_id == candidate_id)

    if status:
        query = query.filter(RecruitmentOffer.status == status)

    total = query.count()
    items = query.order_by(RecruitmentOffer.created_at.desc()).offset((page - 1) * per_page).limit(per_page).all()

    return {
        "total": total,
        "page": page,
        "per_page": per_page,
        "pages": (total + per_page - 1) // per_page,
        "items": items,
    }


def get_offer_by_id(db: Session, offer_id: int, organization_id: Optional[int] = None) -> RecruitmentOffer:
    filter_args = [RecruitmentOffer.id == offer_id]
    if organization_id:
        filter_args.append(RecruitmentOffer.organization_id == organization_id)
    offer = db.query(RecruitmentOffer).filter(*filter_args).first()
    if not offer:
        raise NotFoundException("RecruitmentOffer", offer_id)
    return offer


def update_offer(db: Session, offer_id: int, data: OfferUpdate, organization_id: Optional[int] = None) -> RecruitmentOffer:
    offer = get_offer_by_id(db, offer_id, organization_id)
    update_data = sanitize_dict(data.model_dump(exclude_unset=True))
    for required in ("candidate_name", "position", "status", "remuneration_type"):
        if required in update_data and update_data[required] is None:
            update_data.pop(required)
    if offer.status in (OfferStatus.ACCEPTED, OfferStatus.REJECTED, OfferStatus.WITHDRAWN):
        raise BadRequestException(f"A {offer.status.value} offer can no longer be edited.")
    if "status" in update_data and update_data["status"] not in _EDITABLE_OFFER_STATUSES:
        raise BadRequestException("Use Accept, Reject or Withdraw to close an offer.")
    if "candidate_id" in update_data:
        _check_offer_candidate(db, update_data["candidate_id"], organization_id)
    if "work_country" in update_data and "currency" not in update_data:
        update_data["currency"] = None                      # a new work country brings its own currency unless one is given
        offer.currency = None
    update_data = _apply_offer_pay_rules(db, update_data, organization_id, offer)
    for field, value in update_data.items():
        setattr(offer, field, value)
    db.commit()
    db.refresh(offer)
    return offer


def delete_offer(db: Session, offer_id: int, organization_id: Optional[int] = None) -> None:
    offer = get_offer_by_id(db, offer_id, organization_id)
    db.delete(offer)
    db.commit()


def send_offer(db: Session, offer_id: int, organization_id: Optional[int] = None) -> RecruitmentOffer:
    """Mark a draft offer as sent and email its terms to the linked candidate."""
    offer = get_offer_by_id(db, offer_id, organization_id)
    if offer.status not in (OfferStatus.DRAFT, OfferStatus.PENDING, OfferStatus.APPROVED, OfferStatus.COUNTERED):
        raise BadRequestException(f"A {offer.status.value} offer cannot be sent.")
    if offer.salary is None:
        raise BadRequestException("Add the remuneration amount before sending the offer.")
    if offer.status == OfferStatus.DRAFT:
        offer.status = OfferStatus.PENDING
    db.commit()
    db.refresh(offer)
    if offer.candidate_id:
        cand = db.query(RecruitmentCandidate).filter(RecruitmentCandidate.id == offer.candidate_id).first()
        if cand is not None and cand.status in (RecruitmentCandidateStatus.APPLIED, RecruitmentCandidateStatus.SCREENING,
                                                RecruitmentCandidateStatus.INTERVIEW):
            cand.status = RecruitmentCandidateStatus.OFFER
            db.commit()
    offer.email_sent = notify.send_offer(db, offer)
    return offer


def send_offer_with_pdf(db: Session, offer_id: int, organization_id: Optional[int] = None,
                        pdf_bytes: bytes = None, pdf_filename: str = "Offer Letter.pdf") -> RecruitmentOffer:
    """Mark a draft offer as sent and email its terms with a PDF attachment to the linked candidate."""
    offer = get_offer_by_id(db, offer_id, organization_id)
    if offer.status not in (OfferStatus.DRAFT, OfferStatus.PENDING, OfferStatus.APPROVED, OfferStatus.COUNTERED):
        raise BadRequestException(f"A {offer.status.value} offer cannot be sent.")
    if offer.salary is None:
        raise BadRequestException("Add the remuneration amount before sending the offer.")
    if offer.status == OfferStatus.DRAFT:
        offer.status = OfferStatus.PENDING
    db.commit()
    db.refresh(offer)
    if offer.candidate_id:
        cand = db.query(RecruitmentCandidate).filter(RecruitmentCandidate.id == offer.candidate_id).first()
        if cand is not None and cand.status in (RecruitmentCandidateStatus.APPLIED, RecruitmentCandidateStatus.SCREENING,
                                                RecruitmentCandidateStatus.INTERVIEW):
            cand.status = RecruitmentCandidateStatus.OFFER
            db.commit()
    offer.email_sent = notify.send_offer_with_pdf(db, offer, pdf_bytes, pdf_filename)
    return offer


def accept_offer(db: Session, offer_id: int, organization_id: Optional[int] = None) -> RecruitmentOffer:
    offer = get_offer_by_id(db, offer_id, organization_id)
    if offer.status not in (OfferStatus.PENDING, OfferStatus.APPROVED, OfferStatus.COUNTERED):
        raise BadRequestException("Send the offer before recording the candidate's answer.")
    offer.status = OfferStatus.ACCEPTED
    db.commit()
    db.refresh(offer)

    if offer.candidate_id:
        candidate = db.query(RecruitmentCandidate).filter(RecruitmentCandidate.id == offer.candidate_id).first()
        if candidate and candidate.status != RecruitmentCandidateStatus.HIRED:
            candidate.status = RecruitmentCandidateStatus.HIRED
            db.commit()
            db.refresh(candidate)
            _handle_candidate_hired(db, candidate, candidate.organization_id)

    notify.notify_offer_outcome(db, offer, accepted=True)
    return offer


def reject_offer(db: Session, offer_id: int, organization_id: Optional[int] = None) -> RecruitmentOffer:
    offer = get_offer_by_id(db, offer_id, organization_id)
    if offer.status not in (OfferStatus.PENDING, OfferStatus.APPROVED, OfferStatus.COUNTERED):
        raise BadRequestException("Only a sent offer can be declined. Withdraw a draft instead.")
    offer.status = OfferStatus.REJECTED
    db.commit()
    db.refresh(offer)
    notify.notify_offer_outcome(db, offer, accepted=False)
    return offer


def withdraw_offer(db: Session, offer_id: int, organization_id: Optional[int] = None) -> RecruitmentOffer:
    offer = get_offer_by_id(db, offer_id, organization_id)
    if offer.status not in (OfferStatus.DRAFT, OfferStatus.PENDING, OfferStatus.APPROVED, OfferStatus.COUNTERED):
        raise BadRequestException("Offer cannot be withdrawn in its current status")
    offer.status = OfferStatus.WITHDRAWN
    db.commit()
    db.refresh(offer)
    return offer


# ════════════════════════════════════════════════════════════════════════════
# DOCUMENTS
# ════════════════════════════════════════════════════════════════════════════

def create_document(db: Session, data: DocumentCreate, file_path: str, organization_id: Optional[int] = None) -> RecruitmentDocument:
    doc = RecruitmentDocument(
        candidate_id=data.candidate_id,
        document_type=data.document_type,
        file_path=file_path,
        file_name=data.file_name,
        file_size=data.file_size,
    )
    if organization_id:
        doc.organization_id = organization_id
    db.add(doc)
    db.commit()
    db.refresh(doc)
    return doc


def get_candidate_documents(db: Session, candidate_id: int, organization_id: Optional[int] = None) -> list[RecruitmentDocument]:
    filter_args = [RecruitmentDocument.candidate_id == candidate_id]
    if organization_id:
        filter_args.append(RecruitmentDocument.organization_id == organization_id)
    return db.query(RecruitmentDocument).filter(*filter_args).all()


def delete_document(db: Session, document_id: int, organization_id: Optional[int] = None) -> None:
    filter_args = [RecruitmentDocument.id == document_id]
    if organization_id:
        filter_args.append(RecruitmentDocument.organization_id == organization_id)
    doc = db.query(RecruitmentDocument).filter(*filter_args).first()
    if not doc:
        raise NotFoundException("RecruitmentDocument", document_id)
    db.delete(doc)
    db.commit()


# ════════════════════════════════════════════════════════════════════════════
# APPLICATIONS
# ════════════════════════════════════════════════════════════════════════════

def create_application(db: Session, data: ApplicationCreate, organization_id: Optional[int] = None) -> RecruitmentApplication:
    app = RecruitmentApplication(**data.model_dump())
    if organization_id:
        app.organization_id = organization_id
    db.add(app)
    db.commit()
    db.refresh(app)
    return app


def get_applications(db: Session, organization_id: Optional[int] = None,
                     candidate_id: Optional[int] = None,
                     requisition_id: Optional[int] = None,
                     page: Optional[int] = None, per_page: Optional[int] = None):
    """Applications of the organization: the plain list (unordered, as before; capped) without page/per_page, else a
    page dict ordered newest first."""
    from app.core.pagination import legacy_list, page_of, wants_page
    query = db.query(RecruitmentApplication)
    if organization_id:
        query = query.filter(RecruitmentApplication.organization_id == organization_id)
    if candidate_id:
        query = query.filter(RecruitmentApplication.candidate_id == candidate_id)
    if requisition_id:
        query = query.filter(RecruitmentApplication.requisition_id == requisition_id)
    if wants_page(page, per_page):
        return page_of(query.order_by(RecruitmentApplication.id.desc()), page, per_page)
    return legacy_list(query, "/hr/recruitment/applications")


def update_application_status(db: Session, application_id: int, status: str, organization_id: Optional[int] = None) -> RecruitmentApplication:
    filter_args = [RecruitmentApplication.id == application_id]
    if organization_id:
        filter_args.append(RecruitmentApplication.organization_id == organization_id)
    app = db.query(RecruitmentApplication).filter(*filter_args).first()
    if not app:
        raise NotFoundException("RecruitmentApplication", application_id)
    app.status = status
    db.commit()
    db.refresh(app)
    return app


# ════════════════════════════════════════════════════════════════════════════
# INTERVIEW FEEDBACK
# ════════════════════════════════════════════════════════════════════════════

def create_interview_feedback(db: Session, data: InterviewFeedbackCreate, organization_id: Optional[int] = None) -> RecruitmentInterviewFeedback:
    fb = RecruitmentInterviewFeedback(**data.model_dump())
    if organization_id:
        fb.organization_id = organization_id
    db.add(fb)
    db.commit()
    db.refresh(fb)
    return fb


def get_interview_feedback_list(db: Session, interview_id: int, organization_id: Optional[int] = None) -> list[RecruitmentInterviewFeedback]:
    filter_args = [RecruitmentInterviewFeedback.interview_id == interview_id]
    if organization_id:
        filter_args.append(RecruitmentInterviewFeedback.organization_id == organization_id)
    return db.query(RecruitmentInterviewFeedback).filter(*filter_args).all()


# ════════════════════════════════════════════════════════════════════════════
# OFFER APPROVALS
# ════════════════════════════════════════════════════════════════════════════

def create_offer_approval(db: Session, data: OfferApprovalCreate, organization_id: Optional[int] = None) -> RecruitmentOfferApproval:
    approval = RecruitmentOfferApproval(**data.model_dump())
    if organization_id:
        approval.organization_id = organization_id
    db.add(approval)
    db.commit()
    db.refresh(approval)
    return approval


def get_offer_approvals(db: Session, offer_id: int, organization_id: Optional[int] = None) -> list[RecruitmentOfferApproval]:
    filter_args = [RecruitmentOfferApproval.offer_id == offer_id]
    if organization_id:
        filter_args.append(RecruitmentOfferApproval.organization_id == organization_id)
    return db.query(RecruitmentOfferApproval).filter(*filter_args).all()


# ════════════════════════════════════════════════════════════════════════════
# ANALYTICS
# ════════════════════════════════════════════════════════════════════════════

def get_recruitment_analytics_summary(db: Session, organization_id: Optional[int] = None) -> dict:
    candidate_filter = [True]
    requisition_filter = [True]
    interview_filter = [True]
    offer_filter = [True]
    application_filter = [True]
    if organization_id:
        candidate_filter = [RecruitmentCandidate.organization_id == organization_id]
        requisition_filter = [RecruitmentRequisition.organization_id == organization_id]
        interview_filter = [RecruitmentInterview.organization_id == organization_id]
        offer_filter = [RecruitmentOffer.organization_id == organization_id]
        application_filter = [RecruitmentApplication.organization_id == organization_id]
    total_candidates = db.query(RecruitmentCandidate).filter(*candidate_filter).count()
    total_requisitions = db.query(RecruitmentRequisition).filter(*requisition_filter).count()
    total_interviews = db.query(RecruitmentInterview).filter(*interview_filter).count()
    total_offers = db.query(RecruitmentOffer).filter(*offer_filter).count()
    total_hired = db.query(RecruitmentOffer).filter(
        RecruitmentOffer.status == OfferStatus.ACCEPTED, *offer_filter
    ).count()
    return {
        "total_candidates": total_candidates,
        "total_requisitions": total_requisitions,
        "total_interviews": total_interviews,
        "total_offers": total_offers,
        "total_hired": total_hired,
        "conversion_rates": {
            "application_to_interview": (total_interviews / total_applications * 100) if (total_applications := db.query(RecruitmentApplication).filter(*application_filter).count()) > 0 else 0,
            "interview_to_offer": (total_offers / total_interviews * 100) if total_interviews > 0 else 0,
            "offer_to_hire": (total_hired / total_offers * 100) if total_offers > 0 else 0,
        }
    }
