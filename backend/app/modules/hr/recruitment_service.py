from datetime import datetime, date
from typing import Optional
from sqlalchemy import func
from sqlalchemy.orm import Session

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
    open_filter = [RecruitmentRequisition.status == RequisitionStatus.OPEN]
    if organization_id:
        open_filter.append(RecruitmentRequisition.organization_id == organization_id)
    total_open_positions = db.query(func.count(RecruitmentRequisition.id)).filter(
        *open_filter
    ).scalar() or 0

    active_filter = [RecruitmentCandidate.status.notin_([RecruitmentCandidateStatus.HIRED, RecruitmentCandidateStatus.REJECTED])]
    if organization_id:
        active_filter.append(RecruitmentCandidate.organization_id == organization_id)
    active_candidates = db.query(func.count(RecruitmentCandidate.id)).filter(
        *active_filter
    ).scalar() or 0

    scheduled_filter = [RecruitmentInterview.status == InterviewStatus.SCHEDULED]
    if organization_id:
        scheduled_filter.append(RecruitmentInterview.organization_id == organization_id)
    scheduled_interviews = db.query(func.count(RecruitmentInterview.id)).filter(
        *scheduled_filter
    ).scalar() or 0

    extended_filter = [RecruitmentOffer.status.in_([OfferStatus.PENDING, OfferStatus.APPROVED])]
    if organization_id:
        extended_filter.append(RecruitmentOffer.organization_id == organization_id)
    offers_extended = db.query(func.count(RecruitmentOffer.id)).filter(
        *extended_filter
    ).scalar() or 0

    accepted_filter = [RecruitmentOffer.status == OfferStatus.ACCEPTED]
    if organization_id:
        accepted_filter.append(RecruitmentOffer.organization_id == organization_id)
    offers_accepted = db.query(func.count(RecruitmentOffer.id)).filter(
        *accepted_filter
    ).scalar() or 0

    time_to_hire = 0.0
    hired_filter = [RecruitmentCandidate.status == RecruitmentCandidateStatus.HIRED]
    if organization_id:
        hired_filter.append(RecruitmentCandidate.organization_id == organization_id)
    hired = db.query(RecruitmentCandidate).filter(
        *hired_filter
    ).all()
    if hired:
        total_days = 0
        for c in hired:
            if c.applied_at and c.updated_at:
                delta = (c.updated_at - c.applied_at).days
                total_days += delta
        time_to_hire = round(total_days / len(hired), 1)

    funnel_query = db.query(RecruitmentCandidate.status, func.count(RecruitmentCandidate.id))
    if organization_id:
        funnel_query = funnel_query.filter(RecruitmentCandidate.organization_id == organization_id)
    hiring_funnel = funnel_query.group_by(RecruitmentCandidate.status).all()

    recent_query = db.query(RecruitmentCandidate)
    if organization_id:
        recent_query = recent_query.filter(RecruitmentCandidate.organization_id == organization_id)
    recent = recent_query.order_by(RecruitmentCandidate.created_at.desc()).limit(10).all()

    return {
        "total_open_positions": total_open_positions,
        "active_candidates": active_candidates,
        "scheduled_interviews": scheduled_interviews,
        "offers_extended": offers_extended,
        "offers_accepted": offers_accepted,
        "time_to_hire": time_to_hire,
        "hiring_funnel": [{"status": s.value, "count": cnt} for s, cnt in hiring_funnel],
        "recent_activity": [
            {
                "id": c.id,
                "name": c.name,
                "position": c.position,
                "status": c.status.value if c.status else None,
                "applied_at": c.applied_at,
            }
            for c in recent
        ],
    }


def create_requisition(db: Session, data: RequisitionCreate, organization_id: Optional[int] = None) -> RecruitmentRequisition:
    safe = sanitize_dict(data.model_dump(exclude_unset=True))
    req = RecruitmentRequisition(**safe)
    if organization_id:
        req.organization_id = organization_id
    db.add(req)
    db.commit()
    db.refresh(req)
    req.candidate_count = 0
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
    update_data = sanitize_dict(data.model_dump(exclude_unset=True))
    for field, value in update_data.items():
        setattr(req, field, value)
    db.commit()
    db.refresh(req)
    _attach_candidate_counts(db, [req])
    return req


def delete_requisition(db: Session, req_id: int, organization_id: Optional[int] = None) -> None:
    req = get_requisition_by_id(db, req_id, organization_id)
    db.delete(req)
    db.commit()


def approve_requisition(db: Session, req_id: int, organization_id: Optional[int] = None) -> RecruitmentRequisition:
    req = get_requisition_by_id(db, req_id, organization_id)
    if req.status != RequisitionStatus.DRAFT and req.status != RequisitionStatus.PENDING:
        raise BadRequestException("Requisition must be in DRAFT or PENDING status to approve")
    req.status = RequisitionStatus.OPEN
    db.commit()
    db.refresh(req)
    _attach_candidate_counts(db, [req])
    return req


def reject_requisition(db: Session, req_id: int, organization_id: Optional[int] = None) -> RecruitmentRequisition:
    req = get_requisition_by_id(db, req_id, organization_id)
    if req.status not in (RequisitionStatus.DRAFT, RequisitionStatus.PENDING, RequisitionStatus.OPEN):
        raise BadRequestException("Requisition cannot be rejected in its current status")
    req.status = RequisitionStatus.CLOSED
    db.commit()
    db.refresh(req)
    _attach_candidate_counts(db, [req])
    return req


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


def create_candidate(db: Session, data: CandidateCreate, organization_id: Optional[int] = None) -> RecruitmentCandidate:
    safe = sanitize_dict(data.model_dump(exclude_unset=True))
    candidate = RecruitmentCandidate(**safe)
    if organization_id:
        candidate.organization_id = organization_id
    db.add(candidate)
    db.commit()
    db.refresh(candidate)
    if candidate.status == RecruitmentCandidateStatus.HIRED:
        _handle_candidate_hired(db, candidate, organization_id)
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
    """When a candidate is marked HIRED, start their onboarding record if one doesn't already exist."""
    if candidate.onboarding_new_hire_id:
        existing_by_id = db.query(OnboardingNewHire).filter(
            OnboardingNewHire.id == candidate.onboarding_new_hire_id,
            OnboardingNewHire.is_deleted == False,
        ).first()
        if existing_by_id:
            return existing_by_id

    existing = db.query(OnboardingNewHire).filter(
        OnboardingNewHire.email == candidate.email,
        OnboardingNewHire.is_deleted == False,
    )
    if organization_id:
        existing = existing.filter(OnboardingNewHire.organization_id == organization_id)
    existing_by_email = existing.first()
    if existing_by_email:
        candidate.onboarding_new_hire_id = existing_by_email.id
        db.commit()
        return existing_by_email

    accepted_offer = (
        db.query(RecruitmentOffer)
        .filter(RecruitmentOffer.candidate_id == candidate.id, RecruitmentOffer.status == OfferStatus.ACCEPTED)
        .order_by(RecruitmentOffer.updated_at.desc())
        .first()
    )

    new_hire = OnboardingNewHire(
        candidate_name=candidate.name,
        email=candidate.email,
        phone=candidate.phone,
        position=candidate.position,
        joining_date=accepted_offer.joining_date if accepted_offer else None,
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
    new_hire = _create_onboarding_record_for_hire(db, candidate, organization_id)
    if is_first_hire and candidate.requisition_id:
        _increment_requisition_filled(db, candidate.requisition_id)
    return new_hire


def update_candidate(db: Session, candidate_id: int, data: CandidateUpdate, organization_id: Optional[int] = None) -> RecruitmentCandidate:
    candidate = get_candidate_by_id(db, candidate_id, organization_id)
    previous_status = candidate.status
    update_data = sanitize_dict(data.model_dump(exclude_unset=True))
    for field, value in update_data.items():
        setattr(candidate, field, value)
    db.commit()
    db.refresh(candidate)
    if candidate.status == RecruitmentCandidateStatus.HIRED and previous_status != RecruitmentCandidateStatus.HIRED:
        _handle_candidate_hired(db, candidate, organization_id)
    _attach_requisition_titles(db, [candidate])
    return candidate


def delete_candidate(db: Session, candidate_id: int, organization_id: Optional[int] = None) -> None:
    candidate = get_candidate_by_id(db, candidate_id, organization_id)
    db.delete(candidate)
    db.commit()


def update_candidate_status(db: Session, candidate_id: int, data: CandidateStatusUpdate, organization_id: Optional[int] = None) -> RecruitmentCandidate:
    candidate = get_candidate_by_id(db, candidate_id, organization_id)
    previous_status = candidate.status
    candidate.status = data.status
    db.commit()
    db.refresh(candidate)
    if candidate.status == RecruitmentCandidateStatus.HIRED and previous_status != RecruitmentCandidateStatus.HIRED:
        _handle_candidate_hired(db, candidate, organization_id)
    _attach_requisition_titles(db, [candidate])
    return candidate


def create_interview(db: Session, data: InterviewCreate, organization_id: Optional[int] = None) -> RecruitmentInterview:
    safe = sanitize_dict(data.model_dump(exclude_unset=True))
    interview = RecruitmentInterview(**safe)
    if organization_id:
        interview.organization_id = organization_id
    db.add(interview)
    db.commit()
    db.refresh(interview)
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


def update_interview(db: Session, interview_id: int, data: InterviewUpdate, organization_id: Optional[int] = None) -> RecruitmentInterview:
    interview = get_interview_by_id(db, interview_id, organization_id)
    update_data = sanitize_dict(data.model_dump(exclude_unset=True))
    for field, value in update_data.items():
        setattr(interview, field, value)
    db.commit()
    db.refresh(interview)
    return interview


def delete_interview(db: Session, interview_id: int, organization_id: Optional[int] = None) -> None:
    interview = get_interview_by_id(db, interview_id, organization_id)
    db.delete(interview)
    db.commit()


def update_interview_feedback(db: Session, interview_id: int, data: InterviewFeedback, organization_id: Optional[int] = None) -> RecruitmentInterview:
    interview = get_interview_by_id(db, interview_id, organization_id)
    update_data = data.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(interview, field, value)
    db.commit()
    db.refresh(interview)
    return interview


def create_offer(db: Session, data: OfferCreate, organization_id: Optional[int] = None) -> RecruitmentOffer:
    safe = sanitize_dict(data.model_dump(exclude_unset=True))
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
    for field, value in update_data.items():
        setattr(offer, field, value)
    db.commit()
    db.refresh(offer)
    return offer


def delete_offer(db: Session, offer_id: int, organization_id: Optional[int] = None) -> None:
    offer = get_offer_by_id(db, offer_id, organization_id)
    db.delete(offer)
    db.commit()


def accept_offer(db: Session, offer_id: int, organization_id: Optional[int] = None) -> RecruitmentOffer:
    offer = get_offer_by_id(db, offer_id, organization_id)
    if offer.status != OfferStatus.PENDING and offer.status != OfferStatus.APPROVED:
        raise BadRequestException("Offer must be in PENDING or APPROVED status to accept")
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

    return offer


def reject_offer(db: Session, offer_id: int, organization_id: Optional[int] = None) -> RecruitmentOffer:
    offer = get_offer_by_id(db, offer_id, organization_id)
    if offer.status not in (OfferStatus.DRAFT, OfferStatus.PENDING, OfferStatus.APPROVED):
        raise BadRequestException("Offer cannot be rejected in its current status")
    offer.status = OfferStatus.REJECTED
    db.commit()
    db.refresh(offer)
    return offer


def withdraw_offer(db: Session, offer_id: int, organization_id: Optional[int] = None) -> RecruitmentOffer:
    offer = get_offer_by_id(db, offer_id, organization_id)
    if offer.status not in (OfferStatus.DRAFT, OfferStatus.PENDING, OfferStatus.APPROVED):
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
                     requisition_id: Optional[int] = None) -> list[RecruitmentApplication]:
    query = db.query(RecruitmentApplication)
    if organization_id:
        query = query.filter(RecruitmentApplication.organization_id == organization_id)
    if candidate_id:
        query = query.filter(RecruitmentApplication.candidate_id == candidate_id)
    if requisition_id:
        query = query.filter(RecruitmentApplication.requisition_id == requisition_id)
    return query.all()


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
