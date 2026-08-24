"""
main.py
-------
Entry point of the standalone Zoiko HR Platform backend.

Only HR modules are registered:
  - auth + employee management  (app.modules.employee)
  - HR module + sub-modules      (app.modules.hr)
  - Super Admin                  (app.modules.super_admin)
  - Billing & Subscription       (app.modules.billing)

The schema is created on boot via Base.metadata.create_all (create_all is
additive-only and safe for the platform's own dedicated database).
"""

import logging
from contextlib import asynccontextmanager
from datetime import datetime

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware

from app.config import settings
from app.database import engine, Base, initialize_database
from app.core.exceptions import (
    ZoikoException,
    zoiko_exception_handler,
    generic_exception_handler,
)
from app.core.rate_limiter import limiter

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("zoiko.hr")


@asynccontextmanager
async def lifespan(application: FastAPI):
    # create_all is additive-only and never alters existing tables/columns.
    initialize_database()
    logger.info("[startup] Tables ready: %s", sorted(Base.metadata.tables.keys()))
    yield
    # Dispose all pooled connections before shutdown so Neon's SSL teardown
    # doesn't race with SQLAlchemy's pool-reset rollback.
    engine.dispose()
    logger.info("[shutdown] Database connection pool disposed.")


app = FastAPI(
    title=settings.APP_NAME,
    version=settings.APP_VERSION,
    # API docs/schema expose all ~482 routes; keep them out of production.
    docs_url="/docs" if settings.DEBUG else None,
    redoc_url="/redoc" if settings.DEBUG else None,
    openapi_url="/openapi.json" if settings.DEBUG else None,
    lifespan=lifespan,
)


@app.middleware("http")
async def request_logging_middleware(request: Request, call_next):
    if request.method == "OPTIONS":
        return await call_next(request)
    start = datetime.utcnow()
    response = await call_next(request)
    elapsed = (datetime.utcnow() - start).total_seconds()
    logger.info(
        f"{request.method} {request.url.path} -> {response.status_code} ({elapsed:.3f}s) "
        f"from {request.client.host if request.client else 'unknown'}"
    )
    return response


_cors_origins = [o.strip() for o in settings.CORS_ORIGINS.split(",") if o.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "Accept"],
    # Content-Disposition isn't on the CORS response-header safelist, so
    # without this, frontend `fetch()` calls against /hr/documents/{id}/file
    # (frontend and backend run on different origins/ports) can never read
    # the real filename off the response — every document view/download
    # silently falls back to a generic "document-{id}" name.
    expose_headers=["Content-Disposition"],
)

app.state.limiter = limiter
app.add_middleware(SlowAPIMiddleware)
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
app.add_exception_handler(ZoikoException, zoiko_exception_handler)
app.add_exception_handler(Exception, generic_exception_handler)


# ── Router imports (each imported independently so one failure never
#    silences the rest) ───────────────────────────────────────────────────────
def _safe_import(import_fn, name):
    try:
        return import_fn()
    except Exception as e:
        msg = f"Failed to import {name}: {e}"
        logger.error(msg, exc_info=True)
        raise RuntimeError(f"CRITICAL startup failure: {msg}") from e


auth_router        = _safe_import(lambda: __import__("app.modules.employee.router", fromlist=["auth_router"]).auth_router, "employee.auth_router")
employee_router    = _safe_import(lambda: __import__("app.modules.employee.router", fromlist=["employee_router"]).employee_router, "employee.employee_router")
hr_router          = _safe_import(lambda: __import__("app.modules.hr.router", fromlist=["hr_router"]).hr_router, "hr.hr_router")
attendance_router  = _safe_import(lambda: __import__("app.modules.hr.attendance_router", fromlist=["attendance_router"]).attendance_router, "hr.attendance_router")
asset_router       = _safe_import(lambda: __import__("app.modules.hr.asset_router", fromlist=["asset_router"]).asset_router, "hr.asset_router")
learning_router    = _safe_import(lambda: __import__("app.modules.hr.learning_router", fromlist=["learning_router"]).learning_router, "hr.learning_router")
recruitment_router = _safe_import(lambda: __import__("app.modules.hr.recruitment_router", fromlist=["recruitment_router"]).recruitment_router, "hr.recruitment_router")
workforce_router   = _safe_import(lambda: __import__("app.modules.hr.workforce_router", fromlist=["workforce_router"]).workforce_router, "hr.workforce_router")
org_config_router  = _safe_import(lambda: __import__("app.modules.hr.org_config_router", fromlist=["org_config_router"]).org_config_router, "hr.org_config_router")
super_admin_router = _safe_import(lambda: __import__("app.modules.super_admin.router", fromlist=["router"]).router, "super_admin.router")
command_center_router = _safe_import(lambda: __import__("app.modules.super_admin.command_center_router", fromlist=["router"]).router, "super_admin.command_center_router")
assistant_router   = _safe_import(lambda: __import__("app.modules.assistant.router", fromlist=["assistant_router"]).assistant_router, "assistant.assistant_router")
billing_router     = _safe_import(lambda: __import__("app.modules.billing.router", fromlist=["billing_router"]).billing_router, "billing.billing_router")

app.include_router(auth_router)
app.include_router(employee_router)
app.include_router(hr_router)
app.include_router(attendance_router)
app.include_router(asset_router)
app.include_router(learning_router)
app.include_router(recruitment_router)
app.include_router(workforce_router)
app.include_router(org_config_router)
app.include_router(super_admin_router)
app.include_router(command_center_router)
app.include_router(assistant_router)
app.include_router(billing_router)


@app.get("/", include_in_schema=False, tags=["Meta"])
def root():
    return {
        "name": settings.APP_NAME,
        "version": settings.APP_VERSION,
        "docs": "/docs" if settings.DEBUG else None,
        "health": "/super-admin/health",
    }
