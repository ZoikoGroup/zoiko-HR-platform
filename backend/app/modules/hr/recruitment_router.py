"""
modules/hr/recruitment_router.py
---------------------------------
Defines all HTTP endpoints for the Recruitment module.

Endpoints:
  DASHBOARD
    GET    /hr/recruitment/dashboard               → Dashboard stats

  REQUISITIONS
    GET    /hr/recruitment/requisitions             → List requisitions
    POST   /hr/recruitment/requisitions             → Create requisition
    GET    /hr/recruitment/requisitions/{req_id}    → Get requisition
    PUT    /hr/recruitment/requisitions/{req_id}    → Update requisition
    DELETE /hr/recruitment/requisitions/{req_id}    → Delete requisition
    PUT    /hr/recruitment/requisitions/{req_id}/approve → Approve requisition
    PUT    /hr/recruitment/requisitions/{req_id}/reject  → Reject requisition

  CANDIDATES
    GET    /hr/recruitment/candidates               → List candidates
    POST   /hr/recruitment/candidates               → Create candidate
    GET    /hr/recruitment/candidates/{candidate_id} → Get candidate
    PUT    /hr/recruitment/candidates/{candidate_id} → Update candidate
    DELETE /hr/recruitment/candidates/{candidate_id} → Delete candidate
    PUT    /hr/recruitment/candidates/{candidate_id}/status → Update candidate status

  INTERVIEWS
    GET    /hr/recruitment/interviews               → List interviews
    POST   /hr/recruitment/interviews               → Create interview
    GET    /hr/recruitment/interviews/{interview_id} → Get interview
    PUT    /hr/recruitment/interviews/{interview_id} → Update interview
    DELETE /hr/recruitment/interviews/{interview_id} → Delete interview
    PUT    /hr/recruitment/interviews/{interview_id}/feedback → Add interview feedback

  OFFERS
    GET    /hr/recruitment/offers                   → List offers
    POST   /hr/recruitment/offers                   → Create offer
    GET    /hr/recruitment/offers/{offer_id}         → Get offer
    PUT    /hr/recruitment/offers/{offer_id}         → Update offer
    DELETE /hr/recruitment/offers/{offer_id}         → Delete offer
    PUT    /hr/recruitment/offers/{offer_id}/accept  → Accept offer
    PUT    /hr/recruitment/offers/{offer_id}/reject  → Reject offer
    PUT    /hr/recruitment/offers/{offer_id}/withdraw → Withdraw offer
"""

from typing import Optional

from fastapi import APIRouter, Depends, Query, Body, status, Request
from sqlalchemy.orm import Session

from app.database import get_db
from app.core.dependencies import get_current_user, get_current_admin
from app.core.rate_limiter import limiter

from app.modules.hr import recruitment_service
from app.modules.hr.models import (
    RecruitmentCandidateStatus, RequisitionStatus, InterviewStatus, OfferStatus,
)
from app.modules.hr.schemas import (
    RecruitmentDashboardResponse,
    RequisitionCreate, RequisitionUpdate, RequisitionResponse, RequisitionListResponse,
    CandidateCreate, CandidateUpdate, CandidateResponse, CandidateStatusUpdate, CandidateListResponse,
    InterviewCreate, InterviewUpdate, InterviewResponse, InterviewFeedback, InterviewListResponse,
    OfferCreate, OfferUpdate, OfferResponse, OfferStatusUpdate, OfferListResponse,
    DocumentCreate, DocumentResponse,
    ApplicationCreate, ApplicationResponse,
    InterviewFeedbackCreate, InterviewFeedbackResponse,
    OfferApprovalCreate, OfferApprovalResponse,
    RecruitmentAnalyticsResponse,
    SuccessResponse,
)

recruitment_router = APIRouter(prefix="/hr/recruitment", tags=["Recruitment"])


# ════════════════════════════════════════════════════════════════════════════
# DASHBOARD
# ════════════════════════════════════════════════════════════════════════════

@recruitment_router.get(
    "/dashboard",
    response_model=RecruitmentDashboardResponse,
    summary="Recruitment dashboard statistics",
    description="Returns recruitment summary metrics: open positions, active candidates, interviews, offers, etc.",
)
def recruitment_dashboard(
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    return recruitment_service.get_recruitment_dashboard(db, current_user.organization_id)


# ════════════════════════════════════════════════════════════════════════════
# REQUISITIONS
# ════════════════════════════════════════════════════════════════════════════

@recruitment_router.get(
    "/requisitions",
    response_model=RequisitionListResponse,
    summary="List requisitions (paginated)",
    description="Returns a paginated list of requisitions, optionally filtered by search, status, or department.",
)
def list_requisitions(
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
    page: int = Query(1, ge=1, description="Page number"),
    per_page: int = Query(20, ge=1, le=10000, description="Results per page"),
    search: Optional[str] = Query(None, description="Search by title or department"),
    status: Optional[RequisitionStatus] = Query(None, description="Filter by status"),
    department: Optional[str] = Query(None, description="Filter by department"),
):
    return recruitment_service.get_requisitions(db, current_user.organization_id, page, per_page, search, status, department)


@recruitment_router.post(
    "/requisitions",
    response_model=RequisitionResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create a requisition",
)
def create_requisition(
    data: RequisitionCreate,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_admin),
):
    return recruitment_service.create_requisition(db, data, current_user.organization_id)


@recruitment_router.get(
    "/requisitions/{req_id}",
    response_model=RequisitionResponse,
    summary="Get a requisition by ID",
)
def get_requisition(
    req_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    return recruitment_service.get_requisition_by_id(db, req_id, current_user.organization_id)


@recruitment_router.put(
    "/requisitions/{req_id}",
    response_model=RequisitionResponse,
    summary="Update a requisition",
)
def update_requisition(
    req_id: int,
    data: RequisitionUpdate,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    return recruitment_service.update_requisition(db, req_id, data, current_user.organization_id)


@recruitment_router.delete(
    "/requisitions/{req_id}",
    response_model=SuccessResponse,
    summary="Delete a requisition",
    dependencies=[Depends(get_current_admin)],
)
def delete_requisition(
    req_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    recruitment_service.delete_requisition(db, req_id, current_user.organization_id)
    return {"message": f"Requisition {req_id} has been deleted successfully."}


@recruitment_router.put(
    "/requisitions/{req_id}/approve",
    response_model=RequisitionResponse,
    summary="Approve a requisition",
    dependencies=[Depends(get_current_admin)],
)
def approve_requisition(
    req_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    return recruitment_service.approve_requisition(db, req_id, current_user.organization_id)


@recruitment_router.put(
    "/requisitions/{req_id}/reject",
    response_model=RequisitionResponse,
    summary="Reject a requisition",
    dependencies=[Depends(get_current_admin)],
)
def reject_requisition(
    req_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    return recruitment_service.reject_requisition(db, req_id, current_user.organization_id)


# ════════════════════════════════════════════════════════════════════════════
# CANDIDATES
# ════════════════════════════════════════════════════════════════════════════

@recruitment_router.get(
    "/candidates",
    response_model=CandidateListResponse,
    summary="List candidates (paginated)",
    description="Returns a paginated list of candidates, optionally filtered by search, status, or position.",
)
def list_candidates(
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
    page: int = Query(1, ge=1, description="Page number"),
    per_page: int = Query(20, ge=1, le=10000, description="Results per page"),
    search: Optional[str] = Query(None, description="Search by name, email, or position"),
    status: Optional[RecruitmentCandidateStatus] = Query(None, description="Filter by status"),
    position: Optional[str] = Query(None, description="Filter by position"),
    requisition_id: Optional[int] = Query(None, description="Filter by linked requisition ID"),
):
    return recruitment_service.get_candidates(db, current_user.organization_id, page, per_page, search, status, position, requisition_id)


@recruitment_router.post(
    "/candidates",
    response_model=CandidateResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create a candidate",
)
def create_candidate(
    data: CandidateCreate,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_admin),
):
    return recruitment_service.create_candidate(db, data, current_user.organization_id)


@recruitment_router.get(
    "/candidates/{candidate_id}",
    response_model=CandidateResponse,
    summary="Get a candidate by ID",
)
def get_candidate(
    candidate_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    return recruitment_service.get_candidate_by_id(db, candidate_id, current_user.organization_id)


@recruitment_router.put(
    "/candidates/{candidate_id}",
    response_model=CandidateResponse,
    summary="Update a candidate",
)
def update_candidate(
    candidate_id: int,
    data: CandidateUpdate,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    return recruitment_service.update_candidate(db, candidate_id, data, current_user.organization_id)


@recruitment_router.delete(
    "/candidates/{candidate_id}",
    response_model=SuccessResponse,
    summary="Delete a candidate",
    dependencies=[Depends(get_current_admin)],
)
def delete_candidate(
    candidate_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    recruitment_service.delete_candidate(db, candidate_id, current_user.organization_id)
    return {"message": f"Candidate {candidate_id} has been deleted successfully."}


@recruitment_router.put(
    "/candidates/{candidate_id}/status",
    response_model=CandidateResponse,
    summary="Update candidate status",
)
def update_candidate_status(
    candidate_id: int,
    data: CandidateStatusUpdate,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    return recruitment_service.update_candidate_status(db, candidate_id, data, current_user.organization_id)


# ════════════════════════════════════════════════════════════════════════════
# INTERVIEWS
# ════════════════════════════════════════════════════════════════════════════

@recruitment_router.get(
    "/interviews",
    response_model=InterviewListResponse,
    summary="List interviews (paginated)",
    description="Returns a paginated list of interviews, optionally filtered by candidate or status.",
)
def list_interviews(
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
    page: int = Query(1, ge=1, description="Page number"),
    per_page: int = Query(20, ge=1, le=10000, description="Results per page"),
    candidate_id: Optional[int] = Query(None, description="Filter by candidate ID"),
    status: Optional[InterviewStatus] = Query(None, description="Filter by status"),
):
    return recruitment_service.get_interviews(db, current_user.organization_id, page, per_page, candidate_id, status)


@recruitment_router.post(
    "/interviews",
    response_model=InterviewResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create an interview",
)
def create_interview(
    data: InterviewCreate,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_admin),
):
    return recruitment_service.create_interview(db, data, current_user.organization_id)


@recruitment_router.get(
    "/interviews/{interview_id}",
    response_model=InterviewResponse,
    summary="Get an interview by ID",
)
def get_interview(
    interview_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    return recruitment_service.get_interview_by_id(db, interview_id, current_user.organization_id)


@recruitment_router.put(
    "/interviews/{interview_id}",
    response_model=InterviewResponse,
    summary="Update an interview",
)
def update_interview(
    interview_id: int,
    data: InterviewUpdate,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    return recruitment_service.update_interview(db, interview_id, data, current_user.organization_id)


@recruitment_router.delete(
    "/interviews/{interview_id}",
    response_model=SuccessResponse,
    summary="Delete an interview",
    dependencies=[Depends(get_current_admin)],
)
def delete_interview(
    interview_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    recruitment_service.delete_interview(db, interview_id, current_user.organization_id)
    return {"message": f"Interview {interview_id} has been deleted successfully."}


@recruitment_router.put(
    "/interviews/{interview_id}/feedback",
    response_model=InterviewResponse,
    summary="Add feedback to an interview",
)
def add_interview_feedback(
    interview_id: int,
    data: InterviewFeedback,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    return recruitment_service.update_interview_feedback(db, interview_id, data, current_user.organization_id)


# ════════════════════════════════════════════════════════════════════════════
# OFFERS
# ════════════════════════════════════════════════════════════════════════════

@recruitment_router.get(
    "/offers",
    response_model=OfferListResponse,
    summary="List offers (paginated)",
    description="Returns a paginated list of offers, optionally filtered by candidate or status.",
)
def list_offers(
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
    page: int = Query(1, ge=1, description="Page number"),
    per_page: int = Query(20, ge=1, le=10000, description="Results per page"),
    candidate_id: Optional[int] = Query(None, description="Filter by candidate ID"),
    status: Optional[OfferStatus] = Query(None, description="Filter by status"),
):
    return recruitment_service.get_offers(db, current_user.organization_id, page, per_page, candidate_id, status)


@recruitment_router.post(
    "/offers",
    response_model=OfferResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create an offer",
)
def create_offer(
    data: OfferCreate,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_admin),
):
    return recruitment_service.create_offer(db, data, current_user.organization_id)


@recruitment_router.get(
    "/offers/{offer_id}",
    response_model=OfferResponse,
    summary="Get an offer by ID",
)
def get_offer(
    offer_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    return recruitment_service.get_offer_by_id(db, offer_id, current_user.organization_id)


@recruitment_router.put(
    "/offers/{offer_id}",
    response_model=OfferResponse,
    summary="Update an offer",
)
def update_offer(
    offer_id: int,
    data: OfferUpdate,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    return recruitment_service.update_offer(db, offer_id, data, current_user.organization_id)


@recruitment_router.delete(
    "/offers/{offer_id}",
    response_model=SuccessResponse,
    summary="Delete an offer",
    dependencies=[Depends(get_current_admin)],
)
def delete_offer(
    offer_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    recruitment_service.delete_offer(db, offer_id, current_user.organization_id)
    return {"message": f"Offer {offer_id} has been deleted successfully."}


@recruitment_router.put(
    "/offers/{offer_id}/accept",
    response_model=OfferResponse,
    summary="Accept an offer",
)
def accept_offer(
    offer_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    return recruitment_service.accept_offer(db, offer_id, current_user.organization_id)


@recruitment_router.put(
    "/offers/{offer_id}/reject",
    response_model=OfferResponse,
    summary="Reject an offer",
)
def reject_offer(
    offer_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    return recruitment_service.reject_offer(db, offer_id, current_user.organization_id)


@recruitment_router.put(
    "/offers/{offer_id}/withdraw",
    response_model=OfferResponse,
    summary="Withdraw an offer",
    dependencies=[Depends(get_current_admin)],
)
def withdraw_offer(
    offer_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    return recruitment_service.withdraw_offer(db, offer_id, current_user.organization_id)


# ════════════════════════════════════════════════════════════════════════════
# DOCUMENTS
# ════════════════════════════════════════════════════════════════════════════

@recruitment_router.get(
    "/candidates/{candidate_id}/documents",
    response_model=list[DocumentResponse],
    summary="List candidate documents",
)
def list_candidate_documents(
    candidate_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    return recruitment_service.get_candidate_documents(db, candidate_id, current_user.organization_id)


@recruitment_router.delete(
    "/documents/{document_id}",
    response_model=SuccessResponse,
    summary="Delete a candidate document",
    dependencies=[Depends(get_current_admin)],
)
def delete_document(
    document_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    recruitment_service.delete_document(db, document_id, current_user.organization_id)
    return {"message": f"Document {document_id} deleted successfully."}


# ════════════════════════════════════════════════════════════════════════════
# APPLICATIONS
# ════════════════════════════════════════════════════════════════════════════

@recruitment_router.post(
    "/applications",
    response_model=ApplicationResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create an application",
)
def create_application(
    data: ApplicationCreate,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    return recruitment_service.create_application(db, data, current_user.organization_id)


@recruitment_router.get(
    "/applications",
    response_model=list[ApplicationResponse],
    summary="List applications",
)
def list_applications(
    candidate_id: Optional[int] = Query(None, description="Filter by candidate ID"),
    requisition_id: Optional[int] = Query(None, description="Filter by requisition ID"),
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    return recruitment_service.get_applications(db, current_user.organization_id, candidate_id, requisition_id)


@recruitment_router.put(
    "/applications/{application_id}/status",
    response_model=ApplicationResponse,
    summary="Update application status",
)
def update_application_status(
    application_id: int,
    data: CandidateStatusUpdate,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    return recruitment_service.update_application_status(db, application_id, data.status.value, current_user.organization_id)


# ════════════════════════════════════════════════════════════════════════════
# INTERVIEW FEEDBACK
# ════════════════════════════════════════════════════════════════════════════

@recruitment_router.post(
    "/interview-feedback",
    response_model=InterviewFeedbackResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create interview feedback",
)
def create_interview_feedback(
    data: InterviewFeedbackCreate,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    return recruitment_service.create_interview_feedback(db, data, current_user.organization_id)


@recruitment_router.get(
    "/interviews/{interview_id}/feedback",
    response_model=list[InterviewFeedbackResponse],
    summary="List interview feedback",
)
def list_interview_feedback(
    interview_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    return recruitment_service.get_interview_feedback_list(db, interview_id, current_user.organization_id)


# ════════════════════════════════════════════════════════════════════════════
# OFFER APPROVALS
# ════════════════════════════════════════════════════════════════════════════

@recruitment_router.post(
    "/offer-approvals",
    response_model=OfferApprovalResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create an offer approval",
)
def create_offer_approval(
    data: OfferApprovalCreate,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    return recruitment_service.create_offer_approval(db, data, current_user.organization_id)


@recruitment_router.get(
    "/offers/{offer_id}/approvals",
    response_model=list[OfferApprovalResponse],
    summary="List offer approvals",
)
def list_offer_approvals(
    offer_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    return recruitment_service.get_offer_approvals(db, offer_id, current_user.organization_id)


# ════════════════════════════════════════════════════════════════════════════
# ANALYTICS
# ════════════════════════════════════════════════════════════════════════════

@recruitment_router.get(
    "/analytics/summary",
    summary="Get recruitment analytics summary",
)
def get_recruitment_analytics_summary(
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    return recruitment_service.get_recruitment_analytics_summary(db, current_user.organization_id)
