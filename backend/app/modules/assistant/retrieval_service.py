"""
modules/assistant/retrieval_service.py
------------------------------------------
pgvector similarity search over published knowledge fragments, filtered
BEFORE ranking (eligibility-first, matching the architecture doc): tenant,
publish status, and applicability (jurisdiction/worker_type/audience_role)
are all resolved in Postgres before any vector comparison runs.
"""

import datetime

from sqlalchemy.orm import Session

from app.modules.assistant import embeddings
from app.modules.assistant.models import (
    KnowledgeFragment, KnowledgeSourceVersion, KnowledgeSource,
    KnowledgeApplicability, KnowledgeStatus,
)

TOP_K = 5

# Below this cosine-similarity score, a "top match" isn't actually related to
# the query — it's just whatever happened to be nearest in a small knowledge
# base. Without this floor, a vague or unrelated query (e.g. "what is this",
# "who is in engineering") always returns *something*, and the model then
# confidently answers from evidence that doesn't actually address the
# question. Calibrated empirically: genuine questions (even off-topic ones
# like "travel reimbursement" against a leave-only KB) scored >=0.58, while
# vague/non-questions scored <=0.44 — 0.5 sits in the gap with margin both
# ways.
MIN_RELEVANCE_SCORE = 0.5


def retrieve(
    db: Session,
    organization_id: int,
    query_text: str,
    worker_type: str | None = None,
    audience_role: str | None = None,
    jurisdiction: str | None = None,
    top_k: int = TOP_K,
) -> list[dict]:
    """Return up to top_k eligible fragments ranked by cosine similarity.
    Each result: fragment_id, source_id, source_version_id, source_title, text, score."""
    query_vector = embeddings.embed_text(query_text)
    today = datetime.date.today()

    eligible_version_ids = (
        db.query(KnowledgeSourceVersion.id)
        .join(KnowledgeSource, KnowledgeSource.id == KnowledgeSourceVersion.knowledge_source_id)
        .outerjoin(KnowledgeApplicability,
                   KnowledgeApplicability.knowledge_source_version_id == KnowledgeSourceVersion.id)
        .filter(KnowledgeSource.organization_id == organization_id)
        .filter(KnowledgeSource.status == KnowledgeStatus.PUBLISHED)
        .filter(
            (KnowledgeApplicability.worker_type.is_(None)) | (KnowledgeApplicability.worker_type == worker_type)
        )
        .filter(
            (KnowledgeApplicability.audience_role.is_(None)) | (KnowledgeApplicability.audience_role == audience_role)
        )
        .filter(
            (KnowledgeApplicability.jurisdiction_code.is_(None)) | (KnowledgeApplicability.jurisdiction_code == jurisdiction)
        )
        .filter(
            (KnowledgeSourceVersion.effective_from.is_(None)) | (KnowledgeSourceVersion.effective_from <= today)
        )
        .filter(
            (KnowledgeSourceVersion.effective_to.is_(None)) | (KnowledgeSourceVersion.effective_to >= today)
        )
        .distinct()
        .all()
    )
    version_ids = [row[0] for row in eligible_version_ids]
    if not version_ids:
        return []

    rows = (
        db.query(
            KnowledgeFragment,
            KnowledgeSourceVersion.knowledge_source_id,
            KnowledgeFragment.embedding.cosine_distance(query_vector).label("distance"),
        )
        .join(KnowledgeSourceVersion, KnowledgeSourceVersion.id == KnowledgeFragment.knowledge_source_version_id)
        .filter(KnowledgeFragment.knowledge_source_version_id.in_(version_ids))
        .filter(KnowledgeFragment.embedding.is_not(None))
        .order_by("distance")
        .limit(top_k)
        .all()
    )

    source_titles = {
        s.id: s.title for s in db.query(KnowledgeSource).filter(KnowledgeSource.organization_id == organization_id).all()
    }

    results = []
    for fragment, source_id, distance in rows:
        score = max(0.0, 1.0 - float(distance))
        if score < MIN_RELEVANCE_SCORE:
            continue
        results.append({
            "fragment_id": fragment.id,
            "source_version_id": fragment.knowledge_source_version_id,
            "source_id": source_id,
            "source_title": source_titles.get(source_id, "Unknown source"),
            "text": fragment.text,
            "score": score,
        })
    return results


def retrieve_public(db: Session, query_text: str, top_k: int = TOP_K) -> list[dict]:
    """Same shape as retrieve(), for the unauthenticated public assistant
    (zoikohr.com). Eligibility is KnowledgeSource.is_public == True instead
    of an organization_id match — public content is explicitly opted-in per
    source, regardless of which tenant authored it, so an anonymous visitor
    is never scoped to any one organization. Applicability filters
    (worker_type/audience_role/jurisdiction) don't apply to a visitor with no
    account, so they're skipped entirely rather than passed as None."""
    query_vector = embeddings.embed_text(query_text)
    today = datetime.date.today()

    eligible_version_ids = (
        db.query(KnowledgeSourceVersion.id)
        .join(KnowledgeSource, KnowledgeSource.id == KnowledgeSourceVersion.knowledge_source_id)
        .filter(KnowledgeSource.is_public.is_(True))
        .filter(KnowledgeSource.status == KnowledgeStatus.PUBLISHED)
        .filter(
            (KnowledgeSourceVersion.effective_from.is_(None)) | (KnowledgeSourceVersion.effective_from <= today)
        )
        .filter(
            (KnowledgeSourceVersion.effective_to.is_(None)) | (KnowledgeSourceVersion.effective_to >= today)
        )
        .distinct()
        .all()
    )
    version_ids = [row[0] for row in eligible_version_ids]
    if not version_ids:
        return []

    rows = (
        db.query(
            KnowledgeFragment,
            KnowledgeSourceVersion.knowledge_source_id,
            KnowledgeFragment.embedding.cosine_distance(query_vector).label("distance"),
        )
        .join(KnowledgeSourceVersion, KnowledgeSourceVersion.id == KnowledgeFragment.knowledge_source_version_id)
        .filter(KnowledgeFragment.knowledge_source_version_id.in_(version_ids))
        .filter(KnowledgeFragment.embedding.is_not(None))
        .order_by("distance")
        .limit(top_k)
        .all()
    )

    source_titles = {
        s.id: s.title for s in db.query(KnowledgeSource).filter(KnowledgeSource.is_public.is_(True)).all()
    }

    results = []
    for fragment, source_id, distance in rows:
        score = max(0.0, 1.0 - float(distance))
        if score < MIN_RELEVANCE_SCORE:
            continue
        results.append({
            "fragment_id": fragment.id,
            "source_version_id": fragment.knowledge_source_version_id,
            "source_id": source_id,
            "source_title": source_titles.get(source_id, "Unknown source"),
            "text": fragment.text,
            "score": score,
        })
    return results
