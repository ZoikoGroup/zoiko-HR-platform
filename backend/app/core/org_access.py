"""Org-scoped access decision used by the auth path (Part B).

get_current_user / login / refresh re-validate, on every request:
  * is the organization soft-deleted?        -> block (DELETED_ORG_MESSAGE)
  * has the evaluation ended and is there no paying subscription? -> block
  * (login only) is the organization APPROVED/ACTIVE?             -> specific messages

Today those checks are 4-6 sequential queries (employee, is_deleted, org,
active evaluation, subscription, org-again). They are collapsed into one
cached OrgAccess decision keyed `org_access:{org_id}`:

  * hot path (cache hit) -> 0 extra queries; get_current_user's single
    Employee+Organization joinedload is the only SQL the auth layer runs.
  * cold path (cache miss) -> org row + active evaluation + subscription,
    then the decision is cached for the TTL below.

TTL: 30s when the in-process cache can be invalidated reliably (single
worker, or Redis shared across workers), 5s when several workers share no
Redis — short enough that a super-admin delete/suspend/"End evaluation"
lands within moments, long enough that the fixed Neon round-trip tax
disappears. Invalidation (below) is authoritative; the TTL only bounds the
staleness window for changes made outside our write paths.

Fail-closed: any cache read/set error degrades to an authoritative DB read;
a stale cache entry can never grant access the DB would refuse."""

import logging
from dataclasses import asdict, dataclass
from datetime import datetime
from typing import Optional

from sqlalchemy import event
from sqlalchemy.orm import Session

from app.config import settings

logger = logging.getLogger("zoiko.org_access")

_CACHE_PREFIX = "org_access:"
_CACHE_TTL_SINGLE = 30
_CACHE_TTL_MULTI = 5


@dataclass
class OrgAccess:
    exists: bool
    deleted: bool
    status: Optional[str]
    organization_code: Optional[str]
    rejection_reason: Optional[str]
    evaluation_block_reason: Optional[str]


def _cache_ttl() -> int:
    workers = int(getattr(settings, "WEB_CONCURRENCY", 1) or 1)
    if workers > 1 and not getattr(settings, "REDIS_URL", None):
        return _CACHE_TTL_MULTI
    return _CACHE_TTL_SINGLE


def org_access_key(org_id: int) -> str:
    return f"{_CACHE_PREFIX}{org_id}"


def _status_value(status) -> Optional[str]:
    return status.value if hasattr(status, "value") else status


def _compute(db: Session, org_id: int, org=None, now: Optional[datetime] = None) -> OrgAccess:
    """Authoritative read of an org's access state. Pure read — never writes."""
    from app.modules.hr.models import Organization

    if org is None:
        org = (
            db.query(Organization)
            .filter(Organization.id == org_id)
            .execution_options(include_deleted=True)
            .first()
        )
    if org is None:
        return OrgAccess(exists=False, deleted=False, status=None,
                         organization_code=None, rejection_reason=None,
                         evaluation_block_reason=None)

    status = _status_value(org.status)

    block_reason = None
    if status in ("active", "approved"):
        # Delegates to the single source of truth (billing.service.evaluation_
        # access_block_reason, pure read after Part B) so the rule can never
        # drift between call sites and a suite that patches that function (a
        # deliberate test allow-list) disables the gate here too. One query when
        # the evaluation is live, two only when it has ended and the
        # subscription must be read. Result is cached, so the hot path is O(0).
        from app.modules.billing.service import evaluation_access_block_reason
        block_reason = evaluation_access_block_reason(db, org_id)

    return OrgAccess(
        exists=True,
        deleted=bool(org.deleted_at),
        status=status,
        organization_code=org.organization_code,
        rejection_reason=org.rejection_reason,
        evaluation_block_reason=block_reason,
    )


def get_org_access(db: Session, org_id: int, *, org=None, now: Optional[datetime] = None) -> OrgAccess:
    """Return the cached org access decision, computing + caching on miss.
    `org` may be passed when the caller already loaded the row (saves a query);
    it is still treated as authoritative on the miss path."""
    key = org_access_key(org_id)
    cached = None
    try:
        cached = get_cached(key)
    except Exception as exc:
        logger.warning("[org_access] cache read failed for org %s — reading DB: %s", org_id, exc)
    if cached is not None:
        try:
            return OrgAccess(**cached)
        except (TypeError, ValueError) as exc:
            logger.warning("[org_access] cached decision for org %s was invalid, re-reading: %s", org_id, exc)

    decision = _compute(db, org_id, org=org, now=now)
    try:
        set_cached(key, asdict(decision), ttl=_cache_ttl())
    except Exception as exc:
        logger.warning("[org_access] cache set failed for org %s — decision not cached: %s", org_id, exc)
    return decision


def invalidate_org_access(org_id: int) -> None:
    """Drop the cached decision for an org (after any org/evaluation/subscription write)."""
    if org_id is None:
        return
    try:
        invalidate_cache(f"{_CACHE_PREFIX}{org_id}")
        # The entitlement middleware also caches whether this org has any
        # billing subscription (Part C); a subscription/evaluation write here
        # is exactly the event that should refresh it.
        invalidate_cache(f"billing_sub_exists:{org_id}")
    except Exception as exc:
        logger.error("[org_access] invalidation FAILED for org %s — a stale decision may be served until its "
                     "TTL lapses. Investigate: %s", org_id, exc)


# ── Automatic invalidation on commit ────────────────────────────────────────
# Any flush that touches an Organization, a BillingSubscription or an
# OrganizationEvaluation marks its org_id; after_commit drops those cache keys.
# Bulk/execution_options UPDATEs go around the ORM flush, so the callers that
# use them (expire_overdue_evaluations, and the org delete/status handlers)
# call invalidate_org_access explicitly.
_CLASS_TO_ORG_ID = {}
_ENTITY_TUPLE = ()
_listener_registered = False


def _register_entities() -> None:
    global _CLASS_TO_ORG_ID, _ENTITY_TUPLE
    from app.modules.hr.models import Organization
    from app.modules.billing.models import BillingSubscription, OrganizationEvaluation, BillingConversion

    _CLASS_TO_ORG_ID = {
        Organization: "id",
        OrganizationEvaluation: "organization_id",
        BillingSubscription: "organization_id",
        BillingConversion: "organization_id",
    }
    _ENTITY_TUPLE = tuple(_CLASS_TO_ORG_ID)


def _object_org_id(obj) -> Optional[int]:
    if not isinstance(obj, _ENTITY_TUPLE):
        return None
    for cls, attr in _CLASS_TO_ORG_ID.items():
        if isinstance(obj, cls):
            return getattr(obj, attr, None)
    return None


def _collect_dirty_org_ids(session: Session, flush_context, instances) -> None:
    ids = None
    for obj in list(session.new) + list(session.dirty) + list(session.deleted):
        oid = _object_org_id(obj)
        if oid is not None:
            if ids is None:
                ids = session.info.setdefault("org_access_dirty", set())
            ids.add(oid)


def _invalidate_on_commit(session: Session) -> None:
    ids = session.info.get("org_access_dirty")
    if ids:
        for oid in ids:
            invalidate_org_access(oid)
        session.info.pop("org_access_dirty", None)


def _discard_on_rollback(session: Session) -> None:
    session.info.pop("org_access_dirty", None)


def register_listeners() -> None:
    global _listener_registered
    if _listener_registered:
        return
    _register_entities()
    event.listen(Session, "before_flush", _collect_dirty_org_ids)
    event.listen(Session, "after_commit", _invalidate_on_commit)
    event.listen(Session, "after_rollback", _discard_on_rollback)
    _listener_registered = True


register_listeners()


# Re-exported for callers that already import from app.core.cache; keeping local
# names so `from app.core import cache` stays the single source of truth.
from app.core.cache import get_cached, set_cached, invalidate_cache  # noqa: E402,F401