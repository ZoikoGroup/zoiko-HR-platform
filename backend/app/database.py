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

from sqlalchemy import create_engine, exc, text
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
import app.modules.super_admin.command_center_models  # noqa: F401,E402
import app.modules.assistant.models  # noqa: F401,E402
import app.modules.billing.models  # noqa: F401,E402


def initialize_database() -> None:
    """Create tables in development; production runs `alembic upgrade head`
    as a deploy step instead (see backend/alembic/)."""
    if not _is_development_environment():
        logger.info("Production DB init skipped; run `alembic upgrade head` before starting.")
        return

    try:
        with engine.begin() as conn:
            conn.execute(text("CREATE EXTENSION IF NOT EXISTS vector"))
        Base.metadata.create_all(bind=engine)
        logger.info("HR platform database tables initialized.")
    except exc.SQLAlchemyError as exc_info:
        logger.error("Database initialization failed: %s", exc_info)
        raise

    # -- Schema migration: add columns that create_all won't retroactively add -----
    _ALTER_SQL = [
        "ALTER TABLE billing_subscriptions ADD COLUMN IF NOT EXISTS plan_id INTEGER",
        "ALTER TABLE billing_subscriptions ADD COLUMN IF NOT EXISTS billing_cycle VARCHAR(50)",
        "ALTER TABLE billing_subscriptions ADD COLUMN IF NOT EXISTS billing_metric VARCHAR(50)",
        "ALTER TABLE billing_subscriptions ADD COLUMN IF NOT EXISTS committed_quantity INTEGER",
        "ALTER TABLE billing_subscriptions ADD COLUMN IF NOT EXISTS billing_timezone VARCHAR(100) DEFAULT 'UTC'",
        "ALTER TABLE billing_subscriptions ADD COLUMN IF NOT EXISTS service_start_at TIMESTAMP",
        "ALTER TABLE billing_subscriptions ADD COLUMN IF NOT EXISTS commercial_effective_at TIMESTAMP",
        "ALTER TABLE billing_subscriptions ADD COLUMN IF NOT EXISTS renewal_anchor_date TIMESTAMP",
        "ALTER TABLE billing_subscriptions ADD COLUMN IF NOT EXISTS quantity INTEGER",
        "ALTER TABLE billing_subscriptions ADD COLUMN IF NOT EXISTS price_catalog_version VARCHAR(50)",
        "ALTER TABLE billing_plans ADD COLUMN IF NOT EXISTS name VARCHAR(100) NOT NULL DEFAULT ''",
        "ALTER TABLE billing_plans ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE",
        "ALTER TABLE billing_plans ADD COLUMN IF NOT EXISTS is_contract_priced BOOLEAN NOT NULL DEFAULT FALSE",
        "ALTER TABLE billing_plans ALTER COLUMN price_locked SET DEFAULT FALSE",
        "ALTER TABLE billing_plans ADD COLUMN IF NOT EXISTS monthly_price NUMERIC(12,2)",
        "ALTER TABLE billing_plans ADD COLUMN IF NOT EXISTS annual_price NUMERIC(12,2)",
        "ALTER TABLE billing_plans ADD COLUMN IF NOT EXISTS currency VARCHAR(3) DEFAULT 'USD'",
        "ALTER TABLE billing_plans ADD COLUMN IF NOT EXISTS description TEXT",
        "ALTER TABLE chat_handoffs ADD COLUMN IF NOT EXISTS resolution_note TEXT",
        "ALTER TABLE chat_handoffs ADD COLUMN IF NOT EXISTS resolved_by INTEGER",
        "ALTER TABLE chat_handoffs ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMP",
        "ALTER TABLE hr_documents ADD COLUMN IF NOT EXISTS folder_id INTEGER",
        "ALTER TABLE knowledge_sources ADD COLUMN IF NOT EXISTS is_public BOOLEAN NOT NULL DEFAULT FALSE",
    ]
    try:
        from sqlalchemy import text as sql_text
        Session = sessionmaker(bind=engine)
        db = Session()
        for stmt in _ALTER_SQL:
            db.execute(sql_text(stmt))
        db.commit()
        db.close()
        logger.info("Billing schema migration: ensured all billing_subscriptions columns exist.")
    except Exception as exc_info:
        logger.warning("Billing schema migration skipped: %s", exc_info)

    # Backfill: map existing plan_code strings to plan_id FKs
    try:
        from app.modules.billing.service import backfill_plan_ids
        Session = sessionmaker(bind=engine)
        db = Session()
        count = backfill_plan_ids(db)
        if count:
            logger.info("Billing backfill: updated %d subscriptions with plan_id.", count)
        db.close()
    except Exception as exc_info:
        logger.warning("Billing backfill skipped: %s", exc_info)

    # Seed billing plan catalog if empty (one source of truth, Section 2)
    try:
        from app.modules.billing.models import BillingPlan, PlanCode, BillingMetric
        Session = sessionmaker(bind=engine)
        db = Session()
        if not db.query(BillingPlan).first():
            plans = [
                BillingPlan(
                    code=PlanCode.CORE, name="Core",
                    catalog_version="ZHR-COM-BILL-001-v1",
                    billing_metric=BillingMetric.ACTIVE_WORKFORCE,
                    is_active=True, is_contract_priced=False,
                    description="Essential HR tools for small to mid-size teams.",
                ),
                BillingPlan(
                    code=PlanCode.ADVANCED, name="Advanced",
                    catalog_version="ZHR-COM-BILL-001-v1",
                    billing_metric=BillingMetric.ACTIVE_WORKFORCE,
                    is_active=True, is_contract_priced=False,
                    description="Advanced HR, payroll, and compliance for growing organisations.",
                ),
                BillingPlan(
                    code=PlanCode.ENTERPRISE, name="Enterprise",
                    catalog_version="ZHR-COM-BILL-001-v1",
                    billing_metric=BillingMetric.COMMITTED_WORKFORCE,
                    is_active=True, is_contract_priced=True,
                    description="Custom deployment with dedicated support — contact sales.",
                ),
            ]
            db.add_all(plans)
            db.commit()
            logger.info("Billing plan catalog seeded: 3 plans (Core, Advanced, Enterprise).")
        db.close()
    except Exception as exc_info:
        logger.warning("Billing plan seed skipped: %s", exc_info)


# -- 4. Session dependency -------------------------------------------------------
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
