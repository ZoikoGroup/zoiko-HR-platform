"""
modules/assistant/knowledge_service.py
------------------------------------------
Knowledge source authoring/ingestion: create → chunk → embed → publish.
Mirrors the spec's lifecycle (draft/review/published/superseded/retired) in a
form that fits a single synchronous request (no async ingestion worker in
v1 — sources are small policy documents, not bulk imports).
"""

import datetime
import hashlib

from sqlalchemy.orm import Session

from app.core.exceptions import NotFoundException, BadRequestException
from app.modules.assistant import embeddings
from app.modules.assistant.models import (
    KnowledgeSource, KnowledgeSourceVersion, KnowledgeApplicability,
    KnowledgeFragment, KnowledgeIngestionRun, KnowledgeStatus,
)

CHUNK_CHAR_SIZE = 1400
CHUNK_OVERLAP = 150


def _chunk_text(text: str) -> list[str]:
    """Paragraph-aware chunking: pack paragraphs up to CHUNK_CHAR_SIZE chars,
    never splitting a paragraph across chunks unless it alone exceeds the
    limit. Overlap keeps a short trailing window for context continuity."""
    paragraphs = [p.strip() for p in text.split("\n\n") if p.strip()]
    chunks: list[str] = []
    current = ""

    for para in paragraphs:
        if len(current) + len(para) + 2 <= CHUNK_CHAR_SIZE:
            current = f"{current}\n\n{para}" if current else para
            continue
        if current:
            chunks.append(current)
        if len(para) <= CHUNK_CHAR_SIZE:
            current = para
        else:
            for i in range(0, len(para), CHUNK_CHAR_SIZE - CHUNK_OVERLAP):
                chunks.append(para[i:i + CHUNK_CHAR_SIZE])
            current = ""
    if current:
        chunks.append(current)
    return chunks or [text]


def create_source(
    db: Session,
    organization_id: int,
    owner_employee_id: int,
    title: str,
    source_type: str,
    authority_tier: str,
    content_text: str,
    jurisdiction_code: str | None,
    worker_type: str | None,
    audience_role: str | None,
    effective_from,
    effective_to,
) -> KnowledgeSource:
    source = KnowledgeSource(
        organization_id=organization_id,
        title=title,
        source_type=source_type,
        authority_tier=authority_tier,
        status=KnowledgeStatus.DRAFT,
        owner_employee_id=owner_employee_id,
    )
    db.add(source)
    db.flush()

    version = _create_version(db, source, content_text, effective_from, effective_to)
    if jurisdiction_code or worker_type or audience_role:
        db.add(KnowledgeApplicability(
            knowledge_source_version_id=version.id,
            jurisdiction_code=jurisdiction_code,
            worker_type=worker_type,
            audience_role=audience_role,
        ))

    _ingest_version(db, version)
    db.commit()
    db.refresh(source)
    return source


def _create_version(db: Session, source: KnowledgeSource, content_text: str, effective_from, effective_to) -> KnowledgeSourceVersion:
    next_version_no = (
        db.query(KnowledgeSourceVersion)
        .filter(KnowledgeSourceVersion.knowledge_source_id == source.id)
        .count()
    ) + 1
    content_hash = hashlib.sha256(content_text.encode("utf-8")).hexdigest()
    version = KnowledgeSourceVersion(
        knowledge_source_id=source.id,
        version_no=next_version_no,
        content_text=content_text,
        content_hash=content_hash,
        effective_from=effective_from,
        effective_to=effective_to,
    )
    db.add(version)
    db.flush()
    return version


def _ingest_version(db: Session, version: KnowledgeSourceVersion) -> None:
    run = KnowledgeIngestionRun(knowledge_source_id=version.knowledge_source_id, status="running")
    db.add(run)
    db.flush()
    try:
        chunks = _chunk_text(version.content_text)
        vectors = embeddings.embed_batch(chunks)
        for idx, (chunk_text, vector) in enumerate(zip(chunks, vectors)):
            db.add(KnowledgeFragment(
                knowledge_source_version_id=version.id,
                chunk_index=idx,
                text=chunk_text,
                embedding=vector,
                token_count=len(chunk_text.split()),
            ))
        run.status = "completed"
    except Exception as e:
        run.status = "failed"
        run.error_message = str(e)
        raise
    finally:
        db.flush()


def publish_source(db: Session, organization_id: int, source_id: int, published_by: int) -> KnowledgeSource:
    source = (
        db.query(KnowledgeSource)
        .filter(KnowledgeSource.id == source_id, KnowledgeSource.organization_id == organization_id)
        .first()
    )
    if not source:
        raise NotFoundException("KnowledgeSource", source_id)
    if not source.versions:
        raise BadRequestException("Cannot publish a source with no content version.")

    latest_version = source.versions[-1]
    latest_version.published_at = latest_version.published_at or datetime.datetime.utcnow()
    latest_version.published_by = published_by
    source.status = KnowledgeStatus.PUBLISHED
    db.commit()
    db.refresh(source)
    return source


def list_sources(
    db: Session, organization_id: int,
    search: str | None = None, status: str | None = None, source_type: str | None = None,
) -> list[KnowledgeSource]:
    """Admin table search/filter (WF-12: 'search; filters for lifecycle,
    authority, jurisdiction...'). Filters compose with AND; all optional."""
    query = db.query(KnowledgeSource).filter(KnowledgeSource.organization_id == organization_id)
    if search:
        query = query.filter(KnowledgeSource.title.ilike(f"%{search}%"))
    if status:
        query = query.filter(KnowledgeSource.status == KnowledgeStatus(status))
    if source_type:
        query = query.filter(KnowledgeSource.source_type == source_type)
    return query.order_by(KnowledgeSource.created_at.desc()).all()


def get_source(db: Session, organization_id: int, source_id: int) -> KnowledgeSource:
    source = (
        db.query(KnowledgeSource)
        .filter(KnowledgeSource.id == source_id, KnowledgeSource.organization_id == organization_id)
        .first()
    )
    if not source:
        raise NotFoundException("KnowledgeSource", source_id)
    return source


def list_versions(db: Session, organization_id: int, source_id: int) -> list[KnowledgeSourceVersion]:
    """WF-12 version review: full version history for a source, newest first."""
    get_source(db, organization_id, source_id)  # 404s / org-scopes
    return (
        db.query(KnowledgeSourceVersion)
        .filter(KnowledgeSourceVersion.knowledge_source_id == source_id)
        .order_by(KnowledgeSourceVersion.version_no.desc())
        .all()
    )


def retire_source(db: Session, organization_id: int, source_id: int, retired_by: int) -> KnowledgeSource:
    """Terminal — makes the source permanently ineligible for retrieval
    without deleting it (evidence/audit history is never destroyed). For a
    reversible pause instead, use suspend_source()."""
    source = get_source(db, organization_id, source_id)
    if source.status == KnowledgeStatus.RETIRED:
        raise BadRequestException("Source is already retired.")
    source.status = KnowledgeStatus.RETIRED
    db.commit()
    db.refresh(source)
    return source


def add_source_version(
    db: Session,
    organization_id: int,
    source_id: int,
    updated_by: int,
    content_text: str,
    effective_from=None,
    effective_to=None,
    jurisdiction_code: str | None = None,
    worker_type: str | None = None,
    audience_role: str | None = None,
) -> KnowledgeSource:
    """Adds a new content version to an EXISTING source (e.g. a policy
    update) — distinct from create_source(), which only handles a brand-new
    source's first version. Closes out the previous version's effective_to
    so retrieval_service never surfaces two versions of the same source at
    once (it filters by source status + per-version effective dates, not
    "latest version only"). If the source is already published, the new
    version is stamped published immediately — a second version added to a
    live source is meant to take effect right away, not sit in limbo."""
    source = get_source(db, organization_id, source_id)
    previous_latest = source.versions[-1] if source.versions else None

    new_effective_from = effective_from or datetime.date.today()
    if previous_latest and (previous_latest.effective_to is None or previous_latest.effective_to >= new_effective_from):
        previous_latest.effective_to = new_effective_from - datetime.timedelta(days=1)

    version = _create_version(db, source, content_text, new_effective_from, effective_to)

    if jurisdiction_code is None and worker_type is None and audience_role is None and previous_latest and previous_latest.applicability:
        prev_appl = previous_latest.applicability[0]
        jurisdiction_code, worker_type, audience_role = prev_appl.jurisdiction_code, prev_appl.worker_type, prev_appl.audience_role
    if jurisdiction_code or worker_type or audience_role:
        db.add(KnowledgeApplicability(
            knowledge_source_version_id=version.id,
            jurisdiction_code=jurisdiction_code,
            worker_type=worker_type,
            audience_role=audience_role,
        ))

    _ingest_version(db, version)

    if source.status == KnowledgeStatus.PUBLISHED:
        version.published_at = datetime.datetime.utcnow()
        version.published_by = updated_by

    db.commit()
    db.refresh(source)
    return source


def update_source_metadata(
    db: Session,
    organization_id: int,
    source_id: int,
    title: str | None = None,
    source_type: str | None = None,
    authority_tier: str | None = None,
    jurisdiction_code: str | None = None,
    worker_type: str | None = None,
    audience_role: str | None = None,
) -> KnowledgeSource:
    """Full-replace semantics for whichever fields are provided (matches the
    rest of this codebase's PATCH conventions, e.g. conversation rename) —
    not a way to clear a field back to null. Applicability edits apply to
    the latest version only; earlier versions' applicability is historical
    and left untouched."""
    source = get_source(db, organization_id, source_id)
    if title is not None:
        source.title = title
    if source_type is not None:
        source.source_type = source_type
    if authority_tier is not None:
        source.authority_tier = authority_tier

    if jurisdiction_code is not None or worker_type is not None or audience_role is not None:
        if not source.versions:
            raise BadRequestException("Cannot set applicability on a source with no content version.")
        latest_version = source.versions[-1]
        appl = latest_version.applicability[0] if latest_version.applicability else None
        if not appl:
            appl = KnowledgeApplicability(knowledge_source_version_id=latest_version.id)
            db.add(appl)
        if jurisdiction_code is not None:
            appl.jurisdiction_code = jurisdiction_code
        if worker_type is not None:
            appl.worker_type = worker_type
        if audience_role is not None:
            appl.audience_role = audience_role

    db.commit()
    db.refresh(source)
    return source


def delete_source(db: Session, organization_id: int, source_id: int) -> None:
    """Hard-delete — only permitted while still DRAFT (never published, so
    never eligible for retrieval and never citable in any
    chat_response_provenance row). A published/retired/suspended source may
    have been cited in a real past answer and must never be hard-deleted;
    use retire_source() instead, which preserves that citation history."""
    source = get_source(db, organization_id, source_id)
    if source.status != KnowledgeStatus.DRAFT:
        raise BadRequestException(
            "Only a draft (never-published) source can be deleted. "
            "Retire a published source instead — it stays out of retrieval but keeps its citation history intact."
        )
    version_ids = [v.id for v in source.versions]
    if version_ids:
        db.query(KnowledgeFragment).filter(KnowledgeFragment.knowledge_source_version_id.in_(version_ids)).delete(synchronize_session=False)
        db.query(KnowledgeApplicability).filter(KnowledgeApplicability.knowledge_source_version_id.in_(version_ids)).delete(synchronize_session=False)
    db.query(KnowledgeIngestionRun).filter(KnowledgeIngestionRun.knowledge_source_id == source.id).delete(synchronize_session=False)
    db.query(KnowledgeSourceVersion).filter(KnowledgeSourceVersion.knowledge_source_id == source.id).delete(synchronize_session=False)
    db.delete(source)
    db.commit()


def suspend_source(db: Session, organization_id: int, source_id: int) -> KnowledgeSource:
    """Reversible per-source kill switch (AI Guardrail spec Section 26:
    'Knowledge-source kill switch | Source/version | Make source ineligible
    for retrieval without deleting evidence history' — distinct from the
    permanent retire()). Moves a published source back to REVIEW, which
    retrieval_service already excludes (only PUBLISHED is eligible); publish
    again later to reactivate — no separate 'reactivate' verb needed since
    publish_source() doesn't guard against re-publishing."""
    source = get_source(db, organization_id, source_id)
    if source.status != KnowledgeStatus.PUBLISHED:
        raise BadRequestException(f"Only a published source can be suspended (current status: '{source.status.value}').")
    source.status = KnowledgeStatus.REVIEW
    db.commit()
    db.refresh(source)
    return source
