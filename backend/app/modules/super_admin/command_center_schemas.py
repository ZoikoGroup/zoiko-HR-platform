from datetime import date, datetime
from typing import List, Optional

from pydantic import BaseModel


# ── Overview / KPIs ──────────────────────────────────────────────────────────
class KpiSeries(BaseModel):
    dates: List[date]
    values: List[float]


class KpiTile(BaseModel):
    value: float
    delta_pct: Optional[float] = None
    series: KpiSeries


class OverviewResponse(BaseModel):
    period_days: int
    active_organizations: KpiTile
    subscribed_workforce: KpiTile
    mrr_cents: KpiTile
    activation_rate_pct: KpiTile
    platform_reliability_pct: Optional[float] = None
    critical_attention_count: int
    banner_status: str  # operational | degraded | outage
    active_p1_incidents: int
    mrr_pricing_configured: bool


# ── Needs Your Attention ─────────────────────────────────────────────────────
class AttentionItem(BaseModel):
    severity: str  # critical | high | medium | low
    issue: str
    organization_id: Optional[int] = None
    organization_name: Optional[str] = None
    detected_at: Optional[datetime] = None
    action_label: str  # Investigate | Retry | Review
    action_href: Optional[str] = None


class AttentionResponse(BaseModel):
    items: List[AttentionItem]


# ── Customer Health ──────────────────────────────────────────────────────────
class AtRiskOrg(BaseModel):
    organization_id: int
    organization_name: str
    risk_score: int
    reasons: List[str]


class CustomerHealthResponse(BaseModel):
    healthy: int
    watch: int
    at_risk: int
    top_at_risk: List[AtRiskOrg]


# ── Commercial Health ─────────────────────────────────────────────────────────
class CommercialTrendPoint(BaseModel):
    date: date
    mrr_cents: int
    workforce: int


class CommercialHealthResponse(BaseModel):
    trend: List[CommercialTrendPoint]
    revenue_next_30_days_cents: int
    failed_payments_cents: int
    failed_payments_org_count: int
    plan_overages_cents: int
    plan_overages_org_count: int
    entitlement_mismatch_count: int
    pricing_configured: bool


# ── Organization Lifecycle ───────────────────────────────────────────────────
class LifecycleResponse(BaseModel):
    created: int
    provisioned: int
    configured: int
    activated: int
    adopted: int
    conversion_rate_pct: float


# ── Platform Health ──────────────────────────────────────────────────────────
class ServiceHealthItem(BaseModel):
    service_name: str
    display_name: str
    status: str
    availability_pct: Optional[float] = None
    latency_p95_ms: Optional[int] = None
    notes: Optional[str] = None
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class ServiceHealthUpdate(BaseModel):
    status: str
    availability_pct: Optional[float] = None
    latency_p95_ms: Optional[int] = None
    notes: Optional[str] = None


# ── Security & Privileged Access ─────────────────────────────────────────────
class SecurityResponse(BaseModel):
    privileged_sign_ins: int
    admin_users: int
    super_admins: int
    privileged_actions: int
    review_due: int


# ── Incidents ─────────────────────────────────────────────────────────────────
class IncidentItem(BaseModel):
    id: int
    title: str
    description: Optional[str] = None
    severity: str
    status: str
    organization_id: Optional[int] = None
    created_at: Optional[datetime] = None
    resolved_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class IncidentCreate(BaseModel):
    title: str
    description: Optional[str] = None
    severity: str = "medium"
    organization_id: Optional[int] = None
