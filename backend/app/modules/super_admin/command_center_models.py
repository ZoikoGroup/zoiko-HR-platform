"""
modules/super_admin/command_center_models.py
---------------------------------------------
Tables backing the Platform Command Center dashboard that have no existing
home elsewhere: admin-maintained service health (an internal status page),
an admin-logged incident trail, and a daily platform-wide snapshot used for
KPI sparklines / trend charts. Everything else on the dashboard is computed
live from existing tables (Organization, Employee, BillingSubscription,
AuditLog, LoginActivity, SecurityEvent, SupportTicket, ...).
"""

import enum
from sqlalchemy import (
    Column, Integer, String, Numeric, Boolean, Date, DateTime, Text, Enum, ForeignKey,
)
from sqlalchemy.sql import func
from app.database import Base


class ServiceHealthStatus(str, enum.Enum):
    HEALTHY = "healthy"
    WARNING = "warning"
    DOWN = "down"


class IncidentSeverity(str, enum.Enum):
    CRITICAL = "critical"
    HIGH = "high"
    MEDIUM = "medium"
    LOW = "low"


class IncidentStatus(str, enum.Enum):
    OPEN = "open"
    INVESTIGATING = "investigating"
    RESOLVED = "resolved"


class PlatformServiceHealth(Base):
    """Admin-maintained status for one platform service, shown on the Command
    Center like an internal status page. availability_pct/latency_p95_ms stay
    NULL (rendered as "not yet recorded") until an admin sets them."""
    __tablename__ = "super_admin_service_health"

    id = Column(Integer, primary_key=True, index=True)
    service_name = Column(String(100), unique=True, nullable=False)
    display_name = Column(String(150), nullable=False)
    status = Column(Enum(ServiceHealthStatus), default=ServiceHealthStatus.HEALTHY, nullable=False)
    availability_pct = Column(Numeric(6, 3), nullable=True)
    latency_p95_ms = Column(Integer, nullable=True)
    notes = Column(Text, nullable=True)
    updated_by = Column(Integer, ForeignKey("employees.id"), nullable=True)
    updated_at = Column(DateTime, onupdate=func.now(), server_default=func.now())


class PlatformIncident(Base):
    """Admin-logged operational incident. Backs the "N active P1 incidents"
    status banner — never inferred, only what an admin actually records."""
    __tablename__ = "super_admin_incidents"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String(300), nullable=False)
    description = Column(Text, nullable=True)
    severity = Column(Enum(IncidentSeverity), default=IncidentSeverity.MEDIUM, nullable=False)
    status = Column(Enum(IncidentStatus), default=IncidentStatus.OPEN, nullable=False)
    organization_id = Column(Integer, ForeignKey("organizations.id"), nullable=True)
    created_by = Column(Integer, ForeignKey("employees.id"), nullable=True)
    created_at = Column(DateTime, server_default=func.now())
    resolved_at = Column(DateTime, nullable=True)


class PlatformDailySnapshot(Base):
    """One row per calendar day of platform-wide aggregates, upserted for
    "today" whenever the Command Center overview is loaded. Backs the KPI
    sparklines and the Commercial Health revenue/workforce trend chart. The
    trend is only as long as the history that has actually accumulated —
    never backfilled with invented figures."""
    __tablename__ = "super_admin_daily_snapshots"

    id = Column(Integer, primary_key=True, index=True)
    snapshot_date = Column(Date, unique=True, nullable=False, index=True)
    total_organizations = Column(Integer, default=0, nullable=False)
    active_organizations = Column(Integer, default=0, nullable=False)
    total_workforce = Column(Integer, default=0, nullable=False)
    activated_organizations = Column(Integer, default=0, nullable=False)
    mrr_cents = Column(Integer, default=0, nullable=False)
    created_at = Column(DateTime, server_default=func.now())
