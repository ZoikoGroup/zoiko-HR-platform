"""
modules/billing/schemas.py
---------------------------
Pydantic request/response models for the billing foundation + lifecycle endpoints.
List responses use { list, total } convention per super_admin pattern.
"""

from datetime import datetime
from typing import Optional, List

from pydantic import BaseModel

from app.modules.billing.models import (
    BillingClassification,
    BillingCycle,
    BillingMetric,
    DataClassification,
    EvaluationStatus,
    PlanCode,
    RefundRequestStatus,
    RefundRequestType,
    TaxCategory,
)


# ── Existing foundation schemas ──────────────────────────────────────────────

class BillingOverviewResponse(BaseModel):
    organization_id: int
    billing_classification: Optional[str] = None
    status: Optional[str] = None
    billing_channel: Optional[str] = None
    plan_code: Optional[str] = None
    price_catalog_version: Optional[str] = None
    billing_metric: Optional[str] = None
    quantity: Optional[int] = None
    committed_quantity: Optional[int] = None
    service_start_at: Optional[datetime] = None

    model_config = {"from_attributes": True}


class WorkerStateItem(BaseModel):
    employee_id: int
    commercial_state: str
    worker_commercial_category: str

    model_config = {"from_attributes": True}


class WorkforceSnapshotResponse(BaseModel):
    organization_id: int
    quantity: int
    catalog_version: Optional[str] = None
    reconciliation_status: str
    snapshot_at: Optional[datetime] = None
    worker_states: List[WorkerStateItem] = []

    model_config = {"from_attributes": True}


class ClassificationUpdateRequest(BaseModel):
    billing_classification: BillingClassification
    reason: Optional[str] = None


class BillingAuditLogItem(BaseModel):
    id: int
    organization_id: int
    action: str
    entity_type: str
    entity_id: Optional[int] = None
    actor_email: Optional[str] = None
    before: Optional[dict] = None
    after: Optional[dict] = None
    reason: Optional[str] = None
    source: Optional[str] = None
    stripe_event_id: Optional[str] = None
    created_at: Optional[datetime] = None

    model_config = {"from_attributes": True}


# ── Plan schemas ──────────────────────────────────────────────────────────────

class PlanResponse(BaseModel):
    id: int
    code: str
    name: Optional[str] = None
    catalog_version: str
    billing_metric: str
    is_active: bool
    is_contract_priced: bool
    is_self_serve_enabled: bool
    is_published: bool = False
    monthly_price: Optional[float] = None
    annual_price: Optional[float] = None
    currency: Optional[str] = None
    description: Optional[str] = None
    tax_category: Optional[str] = None
    stripe_product_id: Optional[str] = None
    stripe_monthly_price_id: Optional[str] = None
    stripe_annual_price_id: Optional[str] = None
    published_at: Optional[datetime] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    model_config = {"from_attributes": True}


class PlanCreateRequest(BaseModel):
    code: PlanCode
    name: Optional[str] = None
    catalog_version: str
    billing_metric: BillingMetric = BillingMetric.ACTIVE_WORKFORCE
    is_active: bool = True
    is_contract_priced: bool = False
    monthly_price: Optional[float] = None
    annual_price: Optional[float] = None
    currency: Optional[str] = "USD"
    description: Optional[str] = None


class PlanUpdateRequest(BaseModel):
    name: Optional[str] = None
    catalog_version: Optional[str] = None
    billing_metric: Optional[BillingMetric] = None
    is_active: Optional[bool] = None
    is_contract_priced: Optional[bool] = None
    monthly_price: Optional[float] = None
    annual_price: Optional[float] = None
    currency: Optional[str] = None
    description: Optional[str] = None


class PlanListResponse(BaseModel):
    list: List[PlanResponse]
    total: int


# ── Catalog schemas (Section 17) ──────────────────────────────────────────────

class CatalogPlanResponse(BaseModel):
    """Public-safe catalog projection. Prices may be null (P0: not yet
    approved) — frontend must render "pricing pending" not raw null/NaN."""
    id: int
    code: str
    name: Optional[str] = None
    catalog_version: str
    billing_metric: str
    is_active: bool
    is_contract_priced: bool
    is_self_serve_enabled: bool
    is_published: bool
    monthly_price: Optional[float] = None
    annual_price: Optional[float] = None
    currency: Optional[str] = None
    description: Optional[str] = None
    tax_category: Optional[str] = None
    stripe_product_id: Optional[str] = None
    stripe_monthly_price_id: Optional[str] = None
    stripe_annual_price_id: Optional[str] = None
    published_at: Optional[datetime] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    model_config = {"from_attributes": True}


class CatalogResponse(BaseModel):
    version: Optional[str] = None
    list: List[CatalogPlanResponse]
    total: int


class CatalogPublishRequest(BaseModel):
    """Publishing is irreversible + append-only (Section 17), so the caller
    must echo the exact version string they intend to publish."""
    catalog_version: str


class CatalogPublishResponse(BaseModel):
    published: List[CatalogPlanResponse]
    total: int
    version: str


# ── Evaluation schemas ────────────────────────────────────────────────────────

class EvaluationStartRequest(BaseModel):
    organization_id: int
    evaluation_ends_at: datetime
    approved_package_scope: Optional[str] = None
    data_classification: DataClassification = DataClassification.SYNTHETIC
    conversion_owner: Optional[str] = None


class EvaluationResponse(BaseModel):
    id: int
    organization_id: int
    evaluation_ends_at: datetime
    approved_package_scope: Optional[str] = None
    data_classification: str
    conversion_owner: Optional[str] = None
    status: str
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    model_config = {"from_attributes": True}


class EvaluationListResponse(BaseModel):
    list: List[EvaluationResponse]
    total: int


# ── Conversion schemas ────────────────────────────────────────────────────────

class ConversionRequest(BaseModel):
    plan_id: int
    billing_cycle: BillingCycle
    quantity_basis: str
    commercial_effective_at: datetime
    approver: str
    order_form_reference: Optional[str] = None
    implementation_sow_reference: Optional[str] = None
    signed_agreement_reference: Optional[str] = None


class ConversionResponse(BaseModel):
    id: int
    organization_id: int
    evaluation_id: Optional[int] = None
    catalog_version: str
    quantity_basis: str
    commercial_effective_at: datetime
    approver: str
    order_form_reference: Optional[str] = None
    implementation_sow_reference: Optional[str] = None
    signed_agreement_reference: Optional[str] = None
    created_at: Optional[datetime] = None

    model_config = {"from_attributes": True}


class ConversionListResponse(BaseModel):
    list: List[ConversionResponse]
    total: int


# ── Subscription schemas ──────────────────────────────────────────────────────

class SubscriptionResponse(BaseModel):
    id: int
    organization_id: int
    billing_classification: Optional[str] = None
    status: Optional[str] = None
    billing_channel: Optional[str] = None
    plan_id: Optional[int] = None
    plan_code: Optional[str] = None
    billing_cycle: Optional[str] = None
    price_catalog_version: Optional[str] = None
    billing_metric: Optional[str] = None
    quantity: Optional[int] = None
    committed_quantity: Optional[int] = None
    renewal_anchor_date: Optional[datetime] = None
    commercial_effective_at: Optional[datetime] = None
    billing_timezone: Optional[str] = None
    service_start_at: Optional[datetime] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    model_config = {"from_attributes": True}


class UpgradeRequest(BaseModel):
    plan_id: int
    billing_cycle: BillingCycle
    effective_at: Optional[datetime] = None


class DowngradeRequest(BaseModel):
    plan_id: int
    billing_cycle: BillingCycle
    effective_at: Optional[datetime] = None


class DowngradeDryRunResponse(BaseModel):
    eligible: bool
    blockers: List[dict] = []
    change_type: Optional[str] = None
    from_plan_id: Optional[int] = None
    to_plan_id: Optional[int] = None
    from_plan_code: Optional[str] = None
    to_plan_code: Optional[str] = None
    effective_at: Optional[str] = None
    renewal_anchor_date: Optional[str] = None
    entitlement_delta: Optional[dict] = None
    proration_preview: Optional[dict] = None


class CancelRequest(BaseModel):
    reason: Optional[str] = None
    effective_at: Optional[datetime] = None


# ── Discount schemas ──────────────────────────────────────────────────────────

class DiscountCreateRequest(BaseModel):
    organization_id: int
    campaign_or_contract_id: str
    approver: str
    package_eligibility: Optional[str] = None
    currency: Optional[str] = "USD"
    effective_start: datetime
    effective_end: Optional[datetime] = None
    is_stackable: bool = False


class DiscountResponse(BaseModel):
    id: int
    organization_id: int
    campaign_or_contract_id: str
    approver: str
    package_eligibility: Optional[str] = None
    currency: Optional[str] = None
    effective_start: datetime
    effective_end: Optional[datetime] = None
    is_stackable: bool
    created_at: Optional[datetime] = None

    model_config = {"from_attributes": True}


class DiscountListResponse(BaseModel):
    list: List[DiscountResponse]
    total: int


# ── Checkout session schemas (Prompt 3) ────────────────────────────────────

class CheckoutSessionRequest(BaseModel):
    organization_id: int
    plan_id: int
    billing_cycle: BillingCycle
    success_url: str                      # Stripe redirects here on success
    cancel_url: str                       # Stripe redirects here on cancel


class CheckoutSessionResponse(BaseModel):
    checkout_session_id: str
    checkout_url: str
    organization_id: int
    plan_id: int


# ── Provider ref schemas ────────────────────────────────────────────────────

class ProviderRefResponse(BaseModel):
    organization_id: int
    stripe_customer_id: Optional[str] = None
    stripe_subscription_id: Optional[str] = None
    stripe_payment_method_id: Optional[str] = None
    stripe_latest_invoice_id: Optional[str] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    model_config = {"from_attributes": True}


# ── Invoice schemas ─────────────────────────────────────────────────────────

class BillingInvoiceResponse(BaseModel):
    id: int
    organization_id: int
    stripe_invoice_id: str
    amount_due_cents: int
    amount_paid_cents: int
    currency: str
    status: str
    hosted_invoice_url: Optional[str] = None
    invoice_pdf_url: Optional[str] = None
    period_start: Optional[datetime] = None
    period_end: Optional[datetime] = None
    created_at: Optional[datetime] = None

    model_config = {"from_attributes": True}


class InvoiceListResponse(BaseModel):
    list: List[BillingInvoiceResponse]
    total: int


# ── Reconciliation schemas ──────────────────────────────────────────────────

class ReconciliationCaseResponse(BaseModel):
    id: int
    organization_id: int
    reason: str
    status: str
    local_snapshot: Optional[dict] = None
    stripe_snapshot: Optional[dict] = None
    notes: Optional[str] = None
    opened_by: Optional[str] = None
    resolved_by: Optional[str] = None
    resolved_at: Optional[datetime] = None
    created_at: Optional[datetime] = None

    model_config = {"from_attributes": True}


class ReconcileRequest(BaseModel):
    organization_id: int


# ── Webhook event schemas ───────────────────────────────────────────────────

class WebhookEventListResponse(BaseModel):
    id: int
    stripe_event_id: str
    event_type: str
    processed: bool
    error_message: Optional[str] = None
    created_at: Optional[datetime] = None
    processed_at: Optional[datetime] = None

    model_config = {"from_attributes": True}


# ── Plan Change schemas (Prompt 4) ────────────────────────────────────────

class PlanChangePreviewRequest(BaseModel):
    plan_id: int


class PlanChangePreviewResponse(BaseModel):
    eligible: bool
    blockers: List[dict] = []
    change_type: Optional[str] = None
    from_plan_id: Optional[int] = None
    to_plan_id: Optional[int] = None
    from_plan_code: Optional[str] = None
    to_plan_code: Optional[str] = None
    effective_at: Optional[str] = None
    renewal_anchor_date: Optional[str] = None
    entitlement_delta: Optional[dict] = None
    proration_preview: Optional[dict] = None


class PlanChangeScheduleRequest(BaseModel):
    plan_id: int
    billing_cycle: BillingCycle
    effective_at: Optional[datetime] = None


class PlanChangeResponse(BaseModel):
    id: int
    organization_id: int
    change_type: str
    from_plan_id: Optional[int] = None
    to_plan_id: int
    billing_cycle: str
    effective_at: datetime
    status: str
    blockers_snapshot: Optional[List[dict]] = None
    proration_preview: Optional[dict] = None
    entitlement_delta: Optional[dict] = None
    requested_by: Optional[str] = None
    cancel_reason: Optional[str] = None
    canceled_at: Optional[datetime] = None
    executed_at: Optional[datetime] = None
    created_at: Optional[datetime] = None

    model_config = {"from_attributes": True}


class PlanChangeListResponse(BaseModel):
    list: List[PlanChangeResponse]
    total: int


class PlanChangeCancelRequest(BaseModel):
    cancel_reason: Optional[str] = None


# ── Refund / Credit schemas (Section 12 I3) ───────────────────────────────

class RefundRequest(BaseModel):
    amount_cents: int
    reason: str
    request_type: RefundRequestType = RefundRequestType.REFUND
    stripe_subscription_id: Optional[str] = None
    stripe_invoice_id: Optional[str] = None


class RefundApproveRequest(BaseModel):
    rejection_reason: Optional[str] = None


class RefundResponse(BaseModel):
    id: int
    organization_id: int
    request_type: str
    amount_cents: int
    currency: str
    reason: str
    stripe_subscription_id: Optional[str] = None
    stripe_invoice_id: Optional[str] = None
    stripe_refund_id: Optional[str] = None
    status: str
    requested_by: str
    approved_by: Optional[str] = None
    rejection_reason: Optional[str] = None
    processed_at: Optional[datetime] = None
    created_at: Optional[datetime] = None

    model_config = {"from_attributes": True}


class RefundListResponse(BaseModel):
    list: List[RefundResponse]
    total: int


# ── Delinquency & Support Access (Section 10 G1-G5, Section 18 O3) ─────────

class DelinquencyStatusResponse(BaseModel):
    organization_id: int
    has_open_case: bool
    stage: Optional[str] = None
    status: Optional[str] = None
    failed_at: Optional[datetime] = None
    recovered_at: Optional[datetime] = None
    retention_hold_until: Optional[datetime] = None
    days_elapsed: Optional[int] = None


class SupportAccessRequest(BaseModel):
    organization_id: int
    reason: Optional[str] = None
    ttl_hours: int = 24


class SupportAccessResponse(BaseModel):
    id: int
    organization_id: int
    granted_by: str
    reason: Optional[str] = None
    expires_at: datetime
    revoked_at: Optional[datetime] = None
    revoked_by: Optional[str] = None
    created_at: Optional[datetime] = None

    model_config = {"from_attributes": True}


class SupportAccessCreatedResponse(SupportAccessResponse):
    token: str  # raw token, returned exactly once on creation


class SupportAccessValidateRequest(BaseModel):
    organization_id: int
    token: str


class SupportAccessListResponse(BaseModel):
    list: List[SupportAccessResponse]
    total: int


# ── Customer Self-Serve Billing (/billing/me/*) — Prompt 6 ────────────────

class MeSubscriptionResponse(BaseModel):
    """Subscription scoped to the caller's own organization. Trimming (Section 19)
    is applied server-side for HR Admin / Organization Admin: financial detail and
    billing classification are nulled as in to_overview_response(trimmed=True)."""
    organization_id: int
    billing_classification: Optional[str] = None
    status: Optional[str] = None
    billing_channel: Optional[str] = None
    plan_id: Optional[int] = None
    plan_code: Optional[str] = None
    plan_name: Optional[str] = None
    billing_cycle: Optional[str] = None
    price_catalog_version: Optional[str] = None
    billing_metric: Optional[str] = None
    quantity: Optional[int] = None
    committed_quantity: Optional[int] = None
    renewal_anchor_date: Optional[datetime] = None
    commercial_effective_at: Optional[datetime] = None
    billing_timezone: Optional[str] = None
    service_start_at: Optional[datetime] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None


class MeEntitlementsResponse(BaseModel):
    organization_id: int
    catalog_version: str
    states: dict
    contract_overrides: dict


class MeCancelRequest(BaseModel):
    reason: Optional[str] = None
    effective_at: Optional[datetime] = None


class MeReactivateRequest(BaseModel):
    reason: Optional[str] = None


class MeReactivateResponse(BaseModel):
    organization_id: int
    status: str
    plan_code: Optional[str] = None
    billing_empty_card: bool = False


class MeDowngradeImpactRequest(BaseModel):
    target_plan_code: str


class MeDowngradeImpactResponse(BaseModel):
    organization_id: int
    eligible: bool
    blockers: List[dict] = []
    current_plan_code: Optional[str] = None
    target_plan_code: str
