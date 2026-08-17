"""
modules/assistant/retrieval_service.py
------------------------------------------
pgvector similarity search over published knowledge fragments, filtered
BEFORE ranking (eligibility-first, matching the architecture doc): tenant,
publish status, and applicability (jurisdiction/worker_type/audience_role)
are all resolved in Postgres before any vector comparison runs.
"""

from sqlalchemy.orm import Session

from app.modules.assistant import embeddings
from app.modules.assistant.models import (
    KnowledgeFragment, KnowledgeSourceVersion, KnowledgeSource,
    KnowledgeApplicability, KnowledgeStatus,
)

TOP_K = 5


def retrieve(
    db: Session,
    organization_id: int,
    query_text: str,
    worker_type: str | None = None,
    audience_role: str | None = None,
    top_k: int = TOP_K,
) -> list[dict]:
    """Return up to top_k eligible fragments ranked by cosine similarity.
    Each result: fragment_id, source_id, source_version_id, source_title, text, score."""
    query_vector = embeddings.embed_text(query_text)

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
        results.append({
            "fragment_id": fragment.id,
            "source_version_id": fragment.knowledge_source_version_id,
            "source_id": source_id,
            "source_title": source_titles.get(source_id, "Unknown source"),
            "text": fragment.text,
            "score": max(0.0, 1.0 - float(distance)),
        })
    return results
