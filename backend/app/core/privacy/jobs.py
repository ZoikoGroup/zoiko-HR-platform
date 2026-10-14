"""Background work runs as a tenant, never as "everything" (ZHR-PRIV-001 C09).

There is no Celery here: background work is APScheduler loops and fire-and-forget threads. The rule is the same.

* `tenant_job` wraps a function that touches ONE tenant's data. The call must name `tenant_id` and `actor_id` explicitly; without
  them it fails closed. The tenant context is set for the duration of the call.
* `recheck(...)` asks again, at the moment of delivery (an email, a file, a webhook), whether the tenant is still active and the
  actor is still an active person of that tenant. A job queued yesterday by someone who has since left delivers nothing today.
* `run_in_thread` starts a thread that carries the caller's context, because a new thread does not inherit it.
"""
from __future__ import annotations

import contextvars
import functools
import logging
import threading
from typing import Callable, Optional

from app.core.privacy import context as ctx

logger = logging.getLogger("zoiko.privacy")


class JobNotAuthorized(RuntimeError):
    """The tenant or the actor is no longer allowed: nothing is delivered."""


def recheck(db, tenant_id: Optional[int], actor_id: Optional[int], *, require_actor: bool = True) -> None:
    """Raise JobNotAuthorized unless the tenant is live and the actor is an active person of it. Run at job start AND just before
    delivering results."""
    if tenant_id is None:
        raise ctx.NoTenantContext("a tenant job needs a tenant_id")
    from app.core import org_access
    decision = org_access.get_org_access(db, tenant_id)
    if decision.deleted or decision.status in ("suspended", "deactivated", "rejected"):
        raise JobNotAuthorized("tenant is not active")
    if require_actor:
        if actor_id is None:
            raise JobNotAuthorized("a tenant job needs an actor_id")
        from app.modules.employee.models import Employee
        person = db.query(Employee).filter(Employee.id == actor_id).execution_options(include_deleted=True).first()
        if person is None or not person.is_active or person.organization_id != tenant_id:
            raise JobNotAuthorized("actor is not an active member of the tenant")


def tenant_job(fn: Callable) -> Callable:
    """@tenant_job
       def send_report(db, *, tenant_id, actor_id, ...): ...   # called as send_report(db, tenant_id=7, actor_id=42)"""
    @functools.wraps(fn)
    def wrapper(*args, tenant_id: Optional[int] = None, actor_id: Optional[int] = None, **kwargs):
        if tenant_id is None or actor_id is None:
            logger.error("ALERT tenant job %s called without tenant_id/actor_id: refused (fail closed)", fn.__name__)
            raise ctx.NoTenantContext(f"{fn.__name__} needs tenant_id and actor_id")
        with ctx.tenant_context(tenant_id, actor_id):
            return fn(*args, tenant_id=tenant_id, actor_id=actor_id, **kwargs)
    return wrapper


def run_in_thread(target: Callable, *args, name: Optional[str] = None, **kwargs) -> threading.Thread:
    """Start a daemon thread that runs with a COPY of the caller's context (tenant, actor, correlation id)."""
    snapshot = contextvars.copy_context()
    thread = threading.Thread(target=lambda: snapshot.run(target, *args, **kwargs), daemon=True, name=name)
    thread.start()
    return thread
