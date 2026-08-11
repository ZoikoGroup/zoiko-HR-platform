"""
database.py
-----------
SQLAlchemy setup for the standalone HR platform. PostgreSQL (Neon) only —
same engine patterns as the source codebase but scoped to this platform's
own database (HR_DATABASE_URL).
"""

import logging
import os
from urllib.parse import urlparse

from sqlalchemy import create_engine, exc, inspect
from sqlalchemy.orm import declarative_base, sessionmaker

from app.config import settings

logger = logging.getLogger("zoiko.hr")


def _is_development_environment() -> bool:
    env_name = (os.getenv("ENVIRONMENT") or os.getenv("APP_ENV") or "").strip().lower()
    debug_flag = str(getattr(settings, "DEBUG", False)).strip().lower()
    return env_name == "development" or debug_flag in {"1", "true", "yes", "on"}


def resolve_database_url(raw_url: str | None = None) -> str:
    """Resolve the PostgreSQL database URL.

    Neon is the only supported database. If HR_DATABASE_URL is missing or does
    not point at PostgreSQL, startup refuses on purpose.
    """
    candidate_url = (raw_url or settings.DATABASE_URL or "").strip()
    if not candidate_url:
        raise RuntimeError(
            "HR_DATABASE_URL is not configured. The platform requires PostgreSQL "
            "(Neon). Please set HR_DATABASE_URL in your .env file."
        )

    parsed = urlparse(candidate_url)
    if parsed.scheme in {"postgresql", "postgres"}:
        return candidate_url

    raise RuntimeError(
        f"HR_DATABASE_URL must be a PostgreSQL URL, got scheme '{parsed.scheme or '(none)'}'."
    )


# -- 1. Engine ----------------------------------------------------------------
resolved_database_url = resolve_database_url()

engine = create_engine(
    resolved_database_url,
    connect_args={"sslmode": "require"},
    pool_pre_ping=True,
    pool_size=5,
    max_overflow=10,
    pool_recycle=1800,
)


# -- 2. Session factory -------------------------------------------------------
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


# -- 3. Declarative base -------------------------------------------------------
Base = declarative_base()

# Import every model module so Base.metadata carries the full schema for
# create_all on boot.
import app.modules.employee.models  # noqa: F401,E402
import app.modules.hr.models  # noqa: F401,E402
import app.modules.super_admin.models  # noqa: F401,E402


def initialize_database() -> None:
    """Create tables in development; production relies on Alembic."""
    if not _is_development_environment():
        logger.info("Production DB init skipped; Alembic migrations are expected.")
        return

    try:
        Base.metadata.create_all(bind=engine)
        logger.info("HR platform database tables initialized.")
    except exc.SQLAlchemyError as exc_info:
        logger.error("Database initialization failed: %s", exc_info)
        raise


# -- 4. Table names helper ------------------------------------------------------
def get_table_names() -> list[str]:
    try:
        inspector = inspect(engine)
        return inspector.get_table_names()
    except exc.SQLAlchemyError as exc_info:
        logger.warning("Could not inspect database tables: %s", exc_info)
        return []


# -- 5. Session dependency -------------------------------------------------------
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
