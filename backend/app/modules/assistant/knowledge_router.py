from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.core.dependencies import get_current_admin, get_organization_id
from app.core.rate_limiter import limiter
from fastapi import Request

from app.modules.assistant import knowledge_service, audit_service
from app.modules.assistant.schemas import (
    KnowledgeSourceCreate, KnowledgeSourceResponse, KnowledgeSourceVersionResponse, SuccessResponse,
    KnowledgeSourceVersionCreate, KnowledgeSourceMetadataUpdate,
)

knowledge_router = APIRouter(prefix="/assistant/admin/knowledge", tags=["Assistant Admin - Knowledge"])


@knowledge_router.get("/sources", response_model=list[KnowledgeSourceResponse])
def list_sources(
    db: Session = Depends(get_db),
    current_user=Depends(get_current_admin),
    organization_id: int = Depends(get_organization_id),
    search: Optional[str] = Query(None),
    status: Optional[str] = Query(None, pattern="^(draft|review|published|superseded|retired)$"),
    source_type: Optional[str] = Query(None),
):
    return knowledge_service.list_sources(db, organization_id, search=search, status=status, source_type=source_type)


@knowledge_router.get("/sources/{source_id}", response_model=KnowledgeSourceResponse)
def get_source(
    source_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_admin),
    organization_id: int = Depends(get_organization_id),
):
    return knowledge_service.get_source(db, organization_id, source_id)


@knowledge_router.post("/sources", response_model=KnowledgeSourceResponse)
@limiter.limit("20/minute")
def create_source(
    request: Request,
    payload: KnowledgeSourceCreate,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_admin),
    organization_id: int = Depends(get_organization_id),
):
    source = knowledge_service.create_source(
        db, organization_id, current_user.id,
        title=payload.title, source_type=payload.source_type, authority_tier=payload.authority_tier,
        content_text=payload.content_text, jurisdiction_code=payload.jurisdiction_code,
        worker_type=payload.worker_type, audience_role=payload.audience_role,
        effective_from=payload.effective_from, effective_to=payload.effective_to,
    )
    audit_service.record(db, organization_id, "knowledge_source_created", "knowledge_source",
                          source.id, current_user.id)
    db.commit()
    return source


@knowledge_router.post("/sources/{source_id}/publish", response_model=KnowledgeSourceResponse)
def publish_source(
    source_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_admin),
    organization_id: int = Depends(get_organization_id),
):
    source = knowledge_service.publish_source(db, organization_id, source_id, current_user.id)
    audit_service.record(db, organization_id, "knowledge_source_published", "knowledge_source",
                          source.id, current_user.id)
    db.commit()
    return source


@knowledge_router.post("/sources/{source_id}/versions", response_model=KnowledgeSourceResponse)
@limiter.limit("20/minute")
def add_source_version(
    request: Request,
    source_id: int,
    payload: KnowledgeSourceVersionCreate,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_admin),
    organization_id: int = Depends(get_organization_id),
):
    source = knowledge_service.add_source_version(
        db, organization_id, source_id, current_user.id,
        content_text=payload.content_text, effective_from=payload.effective_from, effective_to=payload.effective_to,
        jurisdiction_code=payload.jurisdiction_code, worker_type=payload.worker_type, audience_role=payload.audience_role,
    )
    audit_service.record(db, organization_id, "knowledge_source_version_added", "knowledge_source",
                          source.id, current_user.id)
    db.commit()
    return source


@knowledge_router.patch("/sources/{source_id}", response_model=KnowledgeSourceResponse)
def update_source(
    source_id: int,
    payload: KnowledgeSourceMetadataUpdate,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_admin),
    organization_id: int = Depends(get_organization_id),
):
    source = knowledge_service.update_source_metadata(
        db, organization_id, source_id,
        title=payload.title, source_type=payload.source_type, authority_tier=payload.authority_tier,
        jurisdiction_code=payload.jurisdiction_code, worker_type=payload.worker_type, audience_role=payload.audience_role,
    )
    audit_service.record(db, organization_id, "knowledge_source_updated", "knowledge_source",
                          source.id, current_user.id)
    db.commit()
    return source


@knowledge_router.delete("/sources/{source_id}", response_model=SuccessResponse)
def delete_source(
    source_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_admin),
    organization_id: int = Depends(get_organization_id),
):
    knowledge_service.delete_source(db, organization_id, source_id)
    audit_service.record(db, organization_id, "knowledge_source_deleted", "knowledge_source",
                          source_id, current_user.id)
    db.commit()
    return {"success": True}


@knowledge_router.get("/sources/{source_id}/versions", response_model=list[KnowledgeSourceVersionResponse])
def list_versions(
    source_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_admin),
    organization_id: int = Depends(get_organization_id),
):
    return knowledge_service.list_versions(db, organization_id, source_id)


@knowledge_router.post("/sources/{source_id}/retire", response_model=KnowledgeSourceResponse)
def retire_source(
    source_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_admin),
    organization_id: int = Depends(get_organization_id),
):
    source = knowledge_service.retire_source(db, organization_id, source_id, current_user.id)
    audit_service.record(db, organization_id, "knowledge_source_retired", "knowledge_source",
                          source.id, current_user.id)
    db.commit()
    return source


@knowledge_router.post("/sources/{source_id}/suspend", response_model=KnowledgeSourceResponse)
def suspend_source(
    source_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_admin),
    organization_id: int = Depends(get_organization_id),
):
    """Reversible per-source kill switch — publish again later to reactivate."""
    source = knowledge_service.suspend_source(db, organization_id, source_id)
    audit_service.record(db, organization_id, "knowledge_source_suspended", "knowledge_source",
                          source.id, current_user.id)
    db.commit()
    return source
