"""Request-scoped tenant context (ZHR-PRIV-001 C01, C09).

The tenant is resolved ONLY from the authenticated identity: never from a URL, query string, body or header. Code that
touches tenant data asks `current_tenant()`; with no context it RAISES (fail closed) rather than returning everything.
"""
from __future__ import annotations

import contextvars
import uuid
from contextlib import contextmanager
from dataclasses import dataclass
from typing import Optional

TENANT = "TENANT"
PLATFORM = "PLATFORM"
SERVICE = "SERVICE"


class NoTenantContext(RuntimeError):
    """Tenant data was requested with no tenant context set. This is always a bug or an attack: it is never 'show all'."""


@dataclass(frozen=True)
class Ctx:
    plane: str
    tenant_id: Optional[int]
    actor_id: Optional[int]
    correlation_id: str
    role: Optional[str] = None


_ctx: contextvars.ContextVar[Optional[Ctx]] = contextvars.ContextVar("zhr_privacy_ctx", default=None)


def new_correlation_id() -> str:
    return uuid.uuid4().hex


def set_context(plane: str, tenant_id: Optional[int], actor_id: Optional[int], correlation_id: Optional[str] = None, role: Optional[str] = None):
    """Set the context; returns a token for `reset_context`."""
    prior = _ctx.get()
    cid = correlation_id or (prior.correlation_id if prior else new_correlation_id())
    return _ctx.set(Ctx(plane=plane, tenant_id=tenant_id, actor_id=actor_id, correlation_id=cid, role=role if role is not None else (prior.role if prior else None)))


def reset_context(token) -> None:
    _ctx.reset(token)


def current() -> Optional[Ctx]:
    return _ctx.get()


def current_plane() -> Optional[str]:
    c = _ctx.get()
    return c.plane if c else None


def current_actor() -> Optional[int]:
    c = _ctx.get()
    return c.actor_id if c else None


def current_tenant() -> int:
    """The tenant of the caller. Raises NoTenantContext when there is none, and for platform subjects (who have no tenant)."""
    c = _ctx.get()
    if c is None or c.tenant_id is None or c.plane == PLATFORM:
        raise NoTenantContext("no tenant context: tenant data is unavailable")
    return c.tenant_id


def correlation_id() -> str:
    c = _ctx.get()
    return c.correlation_id if c else "-"


@contextmanager
def tenant_context(tenant_id: int, actor_id: Optional[int] = None, plane: str = TENANT):
    """Run a block (a background job, a script) as one tenant. Jobs must pass tenant_id and actor_id explicitly."""
    if tenant_id is None:
        raise NoTenantContext("a tenant job needs a tenant_id")
    token = set_context(plane, tenant_id, actor_id)
    try:
        yield
    finally:
        reset_context(token)
