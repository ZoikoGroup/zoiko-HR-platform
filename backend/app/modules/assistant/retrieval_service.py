"""
modules/assistant/retrieval_service.py
------------------------------------------
pgvector similarity search over published knowledge fragments, filtered
BEFORE ranking (eligibility-first, matching the architecture doc): tenant,
publish status, and applicability (jurisdiction/worker_type/audience_role)
are all resolved in Postgres before any vector comparison runs.
"""

import datetime
import re

from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.config import settings
from app.core.privacy.tenant_scope import unscoped_for_system
from app.modules.assistant import embeddings
from app.modules.assistant.models import (
    KnowledgeFragment, KnowledgeSourceVersion, KnowledgeSource,
    KnowledgeApplicability, KnowledgeStatus, ChatRetrievalRun, ChatRetrievalHit,
)

TOP_K = 5

# Hybrid ranking (architecture spec, retrieval stage: "lexical/semantic/hybrid
# search only within eligible IDs", "optional rerank if bounded"): the vector
# search pulls a wider candidate set, then exact-term overlap re-orders it so a
# fragment naming the asked-about thing ("carry forward", "per diem") beats one
# that is merely on the same topic. Relevance gating still uses the cosine
# score alone — keyword overlap can promote, never admit, a fragment.
_CANDIDATE_MULTIPLIER = 4
_LEXICAL_WEIGHT = 0.2
_WORD_RE = re.compile(r"[a-z0-9]+")
_STOPWORDS = frozenset(
    "the a an and or of to in on for is are was were be been do does did can could may might will would should "
    "i me my we our you your it its this that these those what which who whom how when where why with about from "
    "as at by if then than there their they them he she his her any all some get got have has had not no yes".split()
)


def _terms(text: str) -> set[str]:
    return {w for w in _WORD_RE.findall(text.lower()) if len(w) > 2 and w not in _STOPWORDS}


def _rerank(rows, query_text: str, top_k: int) -> list[tuple]:
    """rows: (fragment, source_id, distance). Returns the top_k relevant rows
    as (fragment, source_id, cosine_score, rank_score), best first."""
    query_terms = _terms(query_text)
    ranked = []
    for fragment, source_id, distance in rows:
        score = max(0.0, 1.0 - float(distance))
        if score < MIN_RELEVANCE_SCORE:
            continue
        overlap = len(query_terms & _terms(fragment.text)) / len(query_terms) if query_terms else 0.0
        ranked.append((fragment, source_id, score, (1 - _LEXICAL_WEIGHT) * score + _LEXICAL_WEIGHT * overlap))
    ranked.sort(key=lambda r: r[3], reverse=True)
    return ranked[:top_k]


def _titles(db: Session, source_ids) -> dict[int, str]:
    ids = set(source_ids)
    if not ids:
        return {}
    # ids come from eligible_version_ids() (already authorized), so a platform/public hit keeps its real title
    query = db.query(KnowledgeSource.id, KnowledgeSource.title).filter(KnowledgeSource.id.in_(ids))
    return dict(unscoped_for_system(query, reason="titles of sources already resolved as eligible").all())

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


def _platform_titles_replaced(own_policy_ids: set[str]) -> set[str]:
    """Titles of platform documents superseded by the organization's own published policies."""
    if not own_policy_ids:
        return set()
    from app.modules.hr.policy_documents import LEGACY_KB_TITLES
    return {title for title, ids in LEGACY_KB_TITLES.items() if own_policy_ids & set(ids)}


def eligible_version_ids(
    db: Session,
    organization_id: int,
    worker_type: str | None = None,
    audience_role: str | None = None,
    jurisdiction: str | None = None,
    employee=None,
) -> list[int]:
    """Knowledge versions the asker may be answered from, resolved before any vector comparison: tenant (or platform-public),
    PUBLISHED status, effective dates, applicability, and — for company policies published from the template engine — the
    policy's distribution audience. A policy published to one department is never evidence for someone outside it; with no
    employee to check, audience-restricted policies are excluded.

    Platform-wide knowledge (settings.PLATFORM_KNOWLEDGE_ORG_ID) is the shared HR standard every organization answers from.
    Where an organization has published its own policy for a topic, that policy replaces the platform document for the same
    topic (policy_documents.LEGACY_KB_TITLES), so the two can never disagree in one answer."""
    today = datetime.date.today()
    platform_org = settings.PLATFORM_KNOWLEDGE_ORG_ID
    visible_orgs = {organization_id} | ({platform_org} if platform_org else set())
    # The request's automatic tenant scope would add organization_id = <tenant> and hide the platform-wide and public
    # sources this query is meant to include; the explicit organization/public filter below is the scope instead.
    rows = unscoped_for_system(
        db.query(KnowledgeSourceVersion.id, KnowledgeSource.policy_audience, KnowledgeSource.organization_id,
                 KnowledgeSource.title, KnowledgeSource.policy_canonical_id)
        .join(KnowledgeSource, KnowledgeSource.id == KnowledgeSourceVersion.knowledge_source_id)
        .outerjoin(KnowledgeApplicability,
                   KnowledgeApplicability.knowledge_source_version_id == KnowledgeSourceVersion.id)
        .filter(or_(
            KnowledgeSource.organization_id.in_(visible_orgs),
            KnowledgeSource.is_public.is_(True),
        ))
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
        ),
        reason="knowledge eligibility spans the tenant, platform-wide and public sources; filtered explicitly above",
    ).all()
    # De-duplicated here, not with SELECT DISTINCT: policy_audience is a json
    # column and Postgres has no equality operator for json, so DISTINCT over
    # it fails. Several applicability rows can repeat one version.
    replaced = _platform_titles_replaced(
        {canonical for _, _, org, _, canonical in rows if org == organization_id and canonical}
    ) if platform_org and platform_org != organization_id else set()
    out, seen = [], set()
    for version_id, audience, source_org, title, _ in rows:
        if version_id in seen:
            continue
        seen.add(version_id)
        if source_org == platform_org and source_org != organization_id and title in replaced:
            continue
        if audience and (audience.get("type") or "all") != "all":
            from app.modules.hr.policy_documents import audience_includes
            if employee is None or not audience_includes(employee, audience):
                continue
        out.append(version_id)
    return out


def retrieve(
    db: Session,
    organization_id: int,
    query_text: str,
    worker_type: str | None = None,
    audience_role: str | None = None,
    jurisdiction: str | None = None,
    top_k: int = TOP_K,
    employee=None,
) -> list[dict]:
    """Return up to top_k eligible fragments ranked by cosine similarity.
    Each result: fragment_id, source_id, source_version_id, source_title, text, score.

    Evidence comes from the caller's own tenant, plus any platform-public
    content (KnowledgeSource.is_public == True) — the product/company FAQ that
    is already served to anonymous visitors on zoikohr.com, so a signed-in
    employee asking "what does Zoiko HR do?" is answered from the same
    approved source instead of dead-ending on their tenant's empty KB.
    Public content is global by design; this does NOT widen access to any
    other tenant's private content. Company policies carry their version in the
    source title, so a citation always names the version it came from."""
    version_ids = eligible_version_ids(db, organization_id, worker_type, audience_role, jurisdiction, employee)
    if not version_ids:
        return []
    query_vector = embeddings.embed_text(query_text)

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
        .limit(top_k * _CANDIDATE_MULTIPLIER)
        .all()
    )
    ranked = _rerank(rows, query_text, top_k)
    source_titles = _titles(db, (source_id for _, source_id, _, _ in ranked))
    return [{
        "fragment_id": fragment.id,
        "source_version_id": fragment.knowledge_source_version_id,
        "source_id": source_id,
        "source_title": source_titles.get(source_id, "Unknown source"),
        "text": fragment.text,
        "score": score,
    } for fragment, source_id, score, _ in ranked]


def fragments_for_turn(db: Session, turn_id: int) -> tuple[str | None, list[dict]]:
    """The evidence the prepare step already retrieved and persisted for this
    turn (ChatRetrievalRun/Hit), in rank order and in retrieve()'s shape, plus
    the query it was retrieved for. The streaming step uses this instead of
    re-embedding and re-querying — one retrieval per turn, and the model is
    guaranteed to see exactly the evidence that was recorded."""
    run = (
        db.query(ChatRetrievalRun)
        .filter(ChatRetrievalRun.turn_id == turn_id)
        .order_by(ChatRetrievalRun.id.desc())
        .first()
    )
    if not run:
        return None, []
    rows = (
        db.query(ChatRetrievalHit.score, KnowledgeFragment, KnowledgeSourceVersion.knowledge_source_id)
        .join(KnowledgeFragment, KnowledgeFragment.id == ChatRetrievalHit.knowledge_fragment_id)
        .join(KnowledgeSourceVersion, KnowledgeSourceVersion.id == KnowledgeFragment.knowledge_source_version_id)
        .filter(ChatRetrievalHit.retrieval_run_id == run.id)
        .order_by(ChatRetrievalHit.rank)
        .all()
    )
    source_titles = _titles(db, (source_id for _, _, source_id in rows))
    return run.query_text, [{
        "fragment_id": fragment.id,
        "source_version_id": fragment.knowledge_source_version_id,
        "source_id": source_id,
        "source_title": source_titles.get(source_id, "Unknown source"),
        "text": fragment.text,
        "score": float(score),
    } for score, fragment, source_id in rows]


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
        .limit(top_k * _CANDIDATE_MULTIPLIER)
        .all()
    )
    ranked = _rerank(rows, query_text, top_k)
    rows = [(fragment, source_id, 1.0 - score) for fragment, source_id, score, _ in ranked]
    source_titles = _titles(db, (source_id for _, source_id, _ in rows))

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
