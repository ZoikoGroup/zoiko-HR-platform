"""Request-scoped read cache for read-mostly tables.

Some GET endpoints read the same settings row, template, clause or plan record dozens of times while they walk a list of
documents (e.g. Onboarding › Settings: setup status ~85 queries, Missing details ~79, mostly the same few rows). Against a
distant database every repeat costs a full round trip.

While a GET/HEAD request is being served, an identical SELECT that touches only the tables in CACHEABLE_TABLES runs once
and its result is reused for the rest of that request (SQLAlchemy's documented do_orm_execute + FrozenResult pattern).

Safety:
- the cache lives for ONE request only (a ContextVar set by the ASGI middleware below): nothing is shared between users,
  organizations or requests, so nothing can go stale across requests;
- any flush (a write) in any session during the request empties it;
- SELECT ... FOR UPDATE and populate_existing loads are never cached;
- POST/PUT/PATCH/DELETE requests and background jobs are not cached at all.
Switch off with HR_REQUEST_READ_CACHE=false.
"""
from __future__ import annotations

from contextvars import ContextVar
from typing import Optional

from sqlalchemy import event
from sqlalchemy.orm import Session
from sqlalchemy.sql.util import find_tables

# read-mostly reference and configuration tables (settings, templates, clauses, plan, entity)
CACHEABLE_TABLES = frozenset({
    "organization_configs", "organizations", "template_starters", "template_starter_clauses", "template_definitions",
    "template_variants", "template_clauses", "jurisdiction_packs", "doc_template_settings", "billing_subscriptions",
    "billing_plans", "org_package_documents", "employer_entities", "authorised_signatories", "policy_distributions",
    "billing_entitlement_snapshots", "feature_definitions",
})

_cache: ContextVar[Optional[dict]] = ContextVar("hr_request_read_cache", default=None)
_installed = False


def _enabled() -> bool:
    from app.config import settings
    return bool(getattr(settings, "REQUEST_READ_CACHE", True))


def _key(state) -> Optional[tuple]:
    stmt = state.statement
    if getattr(stmt, "_for_update_arg", None) is not None:
        return None
    opts = state.execution_options
    if opts.get("populate_existing") or opts.get("hr_no_read_cache") or opts.get("yield_per") or opts.get("stream_results"):
        return None
    try:
        names = {t.name for t in find_tables(stmt, include_aliases=True, include_joins=True) if hasattr(t, "name")}
    except Exception:
        return None
    if not names or not names <= CACHEABLE_TABLES:
        return None
    try:
        compiled = stmt.compile(dialect=state.session.get_bind().dialect)
        params = dict(compiled.params)
        params.update(state.parameters or {})
        return (str(compiled), repr(sorted(params.items(), key=lambda kv: kv[0])),
                bool(opts.get("include_deleted")))
    except Exception:
        return None


def memo(key, build):
    """build() once per GET request (its result is reused for the rest of the request; any write empties it). Outside a
    GET request it simply calls build()."""
    cache = _cache.get()
    if cache is None:
        return build()
    k = ("memo",) + tuple(key)
    if k not in cache:
        cache[k] = build()
    return cache[k]


def _on_execute(state):
    cache = _cache.get()
    if cache is None or not state.is_select:
        return None
    # an object refreshing its own expired attributes (after a commit or rollback) or loading a relationship must always
    # read the row itself: only top-level queries are shared
    if getattr(state, "is_column_load", False) or getattr(state, "is_relationship_load", False):
        return None
    key = _key(state)
    if key is None:
        return None
    from sqlalchemy.orm import loading
    frozen = cache.get(key)
    if frozen is None:
        frozen = state.invoke_statement().freeze()
        cache[key] = frozen
        return frozen()
    try:
        return loading.merge_frozen_result(state.session, state.statement, frozen, load=False)()
    except Exception:                       # e.g. the session holds a changed copy of a cached row: read it normally
        cache.pop(key, None)
        return state.invoke_statement()


def _on_flush(session, flush_context):
    cache = _cache.get()
    if cache:
        cache.clear()


def install() -> None:
    """Register the listeners. Call after every other do_orm_execute listener (tenant scope, deleted organizations), so
    the cached statement is the final one."""
    global _installed
    if _installed or not _enabled():
        return
    event.listen(Session, "do_orm_execute", _on_execute)
    event.listen(Session, "after_flush", _on_flush)
    _installed = True


class RequestReadCacheMiddleware:
    """Pure ASGI middleware: gives each GET/HEAD request its own empty cache (the ContextVar is copied into the threadpool
    that runs sync endpoints)."""

    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope.get("type") != "http" or scope.get("method") not in ("GET", "HEAD"):
            return await self.app(scope, receive, send)
        token = _cache.set({})
        try:
            return await self.app(scope, receive, send)
        finally:
            _cache.reset(token)
