"""Automatic tenant scoping of every ORM query (ZHR-PRIV-001 C01, C03).

Route code already filters by organization. This is the second line, applied to EVERY session: while a TENANT request (or a job
running as a tenant) is in progress, any ORM SELECT / UPDATE / DELETE on a table that has `organization_id` gets
`organization_id = <that tenant>` added by the session itself, whatever the query author wrote or forgot. A tenant-plane request
cannot read another tenant's rows even through a query nobody reviewed. Inserts are checked too: a new row for another tenant is
refused, and a new row with no organization takes the caller's.

* Applies only when the request context says TENANT with a tenant id (set by the privacy middleware from the signed token). Sign-in,
  public pages, platform requests, tests and scripts have no tenant context and are untouched. Platform queries are limited by the
  routes the platform may call and by the database roles (scripts/privacy_db_roles.sql), not by this filter.
* `unscoped_for_system()` is the one named escape hatch (cross-tenant identity lookups, schedulers). It only works from the modules
  listed in ALLOWED_SYSTEM_MODULES, and tests/privacy/test_tenant_scope.py fails if anything else calls it.
* HR_TENANT_SCOPE_MODE: enforce (default) | log (count and warn, change nothing) | off.
"""
from __future__ import annotations

import inspect
import logging
import os
from typing import Optional

from sqlalchemy import event
from sqlalchemy.orm import Session, with_loader_criteria

from app.core.privacy import context as ctx

logger = logging.getLogger("zoiko.privacy")

ALLOWED_SYSTEM_MODULES = (
    "app.modules.employee.service",          # sign-in and e-mail identity are looked up across organizations by design
    "app.modules.employee.router",
    "app.modules.hr.service",                # the e-mail identity check (one address, one person, across organizations)           # sign-in, refresh, MFA enrolment: no tenant is known yet
    "app.modules.super_admin",               # platform control-plane code
    "app.modules.billing",                   # subscription billing, webhooks, schedulers
    "app.modules.integrations",
    "app.core.dependencies",
    "app.core.org_access",
    "app.core.privacy",
    "app.database",
    "app.main",
    "scripts",
    "tests",
    "test_",                                  # pytest imports test modules by their bare name
    "conftest",
)

_tenant_models: Optional[list] = None
_installed = False


def mode() -> str:
    return (os.environ.get("HR_TENANT_SCOPE_MODE") or "enforce").strip().lower()


def tenant_models() -> list:
    """Mapped classes whose table has organization_id (except Organization itself)."""
    global _tenant_models
    if _tenant_models is None:
        from app.database import Base
        out = []
        for mapper in Base.registry.mappers:
            cls = mapper.class_
            table = getattr(cls, "__table__", None)
            if table is not None and "organization_id" in table.c and table.name != "organizations":
                out.append(cls)
        _tenant_models = out
    return _tenant_models


def unscoped_for_system(statement, *, reason: str):
    """Mark a statement as intentionally cross-tenant. Allowed only from ALLOWED_SYSTEM_MODULES; `reason` is for the reader."""
    if not reason or not reason.strip():
        raise ValueError("unscoped_for_system needs a reason")
    caller = inspect.stack()[1].frame.f_globals.get("__name__", "")
    if not caller.startswith(ALLOWED_SYSTEM_MODULES):
        raise PermissionError(f"{caller} may not run unscoped queries")
    return statement.execution_options(unscoped_for_system=True)


def _scope(state):
    if mode() == "off":
        return
    c = ctx.current()
    if c is None or c.plane != ctx.TENANT or c.tenant_id is None:
        return
    if state.execution_options.get("unscoped_for_system"):
        return
    if not (state.is_select or state.is_update or state.is_delete):
        return
    if mode() == "log":
        logger.debug("tenant scope (log mode): would restrict %s to tenant %s", getattr(state.statement, "__visit_name__", "?"), c.tenant_id)
        return
    tid = c.tenant_id
    # a plain expression, not a lambda: SQLAlchemy caches lambda criteria by their code, which would pin the FIRST tenant's id
    options = [with_loader_criteria(M, M.organization_id == tid, include_aliases=True) for M in tenant_models()]
    state.statement = state.statement.options(*options)


def _check_new_rows(session: Session, _flush_context, _instances):
    if mode() == "off":
        return
    c = ctx.current()
    if c is None or c.plane != ctx.TENANT or c.tenant_id is None:
        return
    tenant_cls = tuple(tenant_models())
    for obj in list(session.new):
        if isinstance(obj, tenant_cls):
            org = getattr(obj, "organization_id", None)
            if org is None:
                obj.organization_id = c.tenant_id
            elif org != c.tenant_id:
                logger.error("ALERT tenant write refused: %s for tenant %s inside tenant %s", type(obj).__name__, org, c.tenant_id)
                raise PermissionError("A record cannot be created for another organization.")


def install() -> None:
    global _installed
    if _installed:
        return
    event.listen(Session, "do_orm_execute", _scope)
    event.listen(Session, "before_flush", _check_new_rows)
    _installed = True
