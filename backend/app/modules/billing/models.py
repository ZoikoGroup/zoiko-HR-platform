"""
modules/billing/models.py
--------------------------
Foundation data model for ZHR-COM-BILL-001 (Zoiko HR Commercial Billing &
Subscription Operating Standard) — see docs/ZHR-COM-BILL-001-commercial-billing-standard.md.

Scope: organization billing classification, plan catalog (unpriced —
numeric prices are a P0 launch blocker, not an engineering decision),
billable workforce state/snapshot, entitlement snapshot, evaluations,
conversions, subscriptions, discounts, and a dedicated billing audit trail.
Stripe/provider references, implementation engagements, storage/AI usage
events and reconciliation cases are deferred until Stripe and the catalog
are actually approved (Section 3).
"""

import enum

from sqlalchemy import (
    Column, Integer, String, Numeric, Boolean, DateTime, Text, ForeignKey, JSON, UniqueConstraint,
)
from sqlalchemy.ext.hybrid import hybrid_property
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.database import Base
from app.modules.employee.models import CaseInsensitiveEnum


# ── Billing-related enums (Prompts 1-3) ─────────────────────────────────────

class ReconciliationCaseStatus(str, enum.Enum):
    OPEN = "open"
    INVESTIGATING = "investigating"
    RESOLVED = "resolved"
    DISMISSED = "dismissed"


class ReconciliationCaseReason(str, enum.Enum):
    BILLING_COUNT_DISCREPANCY = "billing_count_discrepancy"
    STATUS_MISMATCH = "status_mismatch"
    PLAN_MISMATCH = "plan_mismatch"
    QUANTITY_MISMATCH = "quantity_mismatch"
    MISSING_PROVIDER_REF = "missing_provider_ref"
    OTHER = "other"


# ── Enums (Section 21) ───────────────────────────────────────────────────────

class BillingClassification(str, enum.Enum):
    COMMERCIAL = "commercial"
    EVALUATION = "evaluation"
    PILOT_NON_BILLABLE = "pilot_non_billable"
    INTERNAL = "internal"
    DEMO = "demo"
    STAGING = "staging"
    QA = "qa"
    PARTNER_SANDBOX = "partner_sandbox"


class SubscriptionStatus(str, enum.Enum):
    EVALUATION = "evaluation"
    EVALUATION_EXPIRED = "evaluation_expired"
    ACTIVE = "active"
    PAST_DUE = "past_due"
    RESTRICTED = "restricted"
    SUSPENDED = "suspended"
    CANCEL_AT_PERIOD_END = "cancel_at_period_end"
    CANCELED = "canceled"
    TERMINATED = "terminated"


class BillingChannel(str, enum.Enum):
    WEB_STRIPE = "web_stripe"
    ENTERPRISE_INVOICE = "enterprise_invoice"
    RESELLER_APPROVED = "reseller_approved"
    OTHER_APPROVED = "other_approved"


class PlanCode(str, enum.Enum):
    CORE = "core"
    ADVANCED = "advanced"
    ENTERPRISE = "enterprise"


class BillingMetric(str, enum.Enum):
    ACTIVE_WORKFORCE = "active_workforce"
    COMMITTED_WORKFORCE = "committed_workforce"
    CONTRACT_DEFINED = "contract_defined"


class BillingCycle(str, enum.Enum):
    MONTHLY = "monthly"
    ANNUAL = "annual"


class EvaluationStatus(str, enum.Enum):
    ACTIVE = "active"
    EVALUATION_ENDED = "evaluation_ended"
    CONVERTED = "converted"


class DataClassification(str, enum.Enum):
    SYNTHETIC = "synthetic"
    CUSTOMER_CONTROLLED = "customer_controlled"


class WorkerCommercialState(str, enum.Enum):
    PRE_HIRE_NON_BILLABLE = "pre_hire_non_billable"
    ACTIVE_BILLABLE = "active_billable"
    FORMER_NON_BILLABLE = "former_non_billable"
    EXCLUDED_NON_BILLABLE = "excluded_non_billable"
    PENDING_REVIEW = "pending_review"


class WorkerCommercialCategory(str, enum.Enum):
    EMPLOYEE = "employee"
    CONTRACTOR = "contractor"
    INTERN = "intern"
    OTHER_NON_EMPLOYEE = "other_non_employee"


class BillingAuditAction(str, enum.Enum):
    CLASSIFICATION_CHANGED = "classification_changed"
    WORKFORCE_RECOMPUTED = "workforce_recomputed"
    PLAN_ASSIGNED = "plan_assigned"
    ROLE_GRANTED = "role_granted"
    PLAN_CREATED = "plan_created"
    PLAN_UPDATED = "plan_updated"
    EVALUATION_STARTED = "evaluation_started"
    EVALUATION_ENDED = "evaluation_ended"
    EVALUATION_CONVERTED = "evaluation_converted"
    SUBSCRIPTION_UPGRADED = "subscription_upgraded"
    SUBSCRIPTION_DOWNGRADED = "subscription_downgraded"
    SUBSCRIPTION_CANCELED = "subscription_canceled"
    SUBSCRIPTION_REACTIVATED = "subscription_reactivated"
    DISCOUNT_CREATED = "discount_created"
    SUBSCRIPTION_ACTIVATED = "subscription_activated"
    SUBSCRIPTION_PAST_DUE = "subscription_past_due"
    SUBSCRIPTION_DELETED = "subscription_deleted"
    SUBSCRIPTION_STATUS_CHANGED = "subscription_status_changed"
    INVOICE_PAID = "invoice_paid"
    INVOICE_PAYMENT_FAILED = "invoice_payment_failed"
    WEBHOOK_RECEIVED = "webhook_received"
    WEBHOOK_UNHANDLED = "webhook_unhandled"
    RECONCILIATION_CASE_OPENED = "reconciliation_case_opened"
    CHECKOUT_SESSION_CREATED = "checkout_session_created"
    PLAN_CHANGE_SCHEDULED = "plan_change_scheduled"
    PLAN_CHANGE_CANCELED = "plan_change_canceled"
    PLAN_CHANGE_EXECUTED = "plan_change_executed"
    PLAN_CHANGE_BLOCKER_DETECTED = "plan_change_blocker_detected"
    REFUND_REQUESTED = "refund_requested"
    REFUND_APPROVED = "refund_approved"
    REFUND_REJECTED = "refund_rejected"
    CREDIT_REQUESTED = "credit_requested"
    CREDIT_APPROVED = "credit_approved"
    DELINQUENCY_CASE_OPENED = "delinquency_case_opened"
    DELINQUENCY_STAGE_CHANGED = "delinquency_stage_changed"
    DELINQUENCY_RECOVERED = "delinquency_recovered"
    DELINQUENCY_RETENTION_HOLD = "delinquency_retention_hold"
    DELINQUENCY_TERMINATION_STARTED = "delinquency_termination_started"
    SUPPORT_ACCESS_GRANTED = "support_access_granted"
    SUPPORT_ACCESS_REVOKED = "support_access_revoked"
    CONFIRMATION_TOKEN_CREATED = "confirmation_token_created"
    CONFIRMATION_TOKEN_CONSUMED = "confirmation_token_consumed"
    # ZHR-COM-ENT-001 §19.1 — commercial exception entitlement lifecycle
    EXCEPTION_REQUESTED = "exception_requested"
    EXCEPTION_APPROVED = "exception_approved"
    EXCEPTION_REJECTED = "exception_rejected"
    EXCEPTION_REVOKED = "exception_revoked"
    EXCEPTION_EXPIRED = "exception_expired"


# ── Models ────────────────────────────────────────────────────────────────────

class TaxCategory(str, enum.Enum):
    """Per-SKU tax category (Section 11 H5). SaaS and professional services must
    NOT share one tax treatment by assumption — each catalog line carries its own
    category from day one, even before a real tax engine is wired in (H2: no
    hard-coded tax rate)."""
    SAAS_SUBSCRIPTION = "saas_subscription"
    IMPLEMENTATION_SERVICE = "implementation_service"
    TRAINING_SUPPORT = "training_support"
    OTHER = "other"


class BillingPlan(Base):
    """Catalog row for CORE/ADVANCED/ENTERPRISE. Numeric pricing is NOT locked
    (Section 3/17 P0 blocker) — price stays null and is_self_serve_enabled
    resolves to False whenever either price is NULL.

    Section 17 (Canonical Price Catalog Governance): publication is append-only.
    A plan becomes published when published_at is set (is_published derived).
    A published plan is immutable — mutating one raises at the service layer.
    provider product/price IDs and tax category are explicit required catalog
    fields (Section 17), nullable until Stripe sync runs against test mode.
    """
    __tablename__ = "billing_plans"

    id = Column(Integer, primary_key=True, index=True)
    code = Column(CaseInsensitiveEnum(PlanCode), nullable=False)
    name = Column(String(100), nullable=True)
    catalog_version = Column(String(50), nullable=False)
    billing_metric = Column(CaseInsensitiveEnum(BillingMetric), default=BillingMetric.ACTIVE_WORKFORCE, nullable=False)
    is_active = Column(Boolean, default=True, nullable=False)
    is_contract_priced = Column(Boolean, default=False, nullable=False)
    monthly_price = Column(Numeric(12, 2), nullable=True)
    annual_price = Column(Numeric(12, 2), nullable=True)
    currency = Column(String(3), default="USD", nullable=True)
    description = Column(Text, nullable=True)
    # Section 17: append-only publication + provider IDs + tax category
    published_at = Column(DateTime, nullable=True)
    tax_category = Column(CaseInsensitiveEnum(TaxCategory), default=TaxCategory.SAAS_SUBSCRIPTION, nullable=False)
    stripe_product_id = Column(String(255), nullable=True)
    stripe_monthly_price_id = Column(String(255), nullable=True)
    stripe_annual_price_id = Column(String(255), nullable=True)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, onupdate=func.now())

    @hybrid_property
    def is_published(self):
        """Section 17: a catalog entry is published iff its published_at is set."""
        return self.published_at is not None

    @hybrid_property
    def is_self_serve_enabled(self):
        """Computed: False when either price is NULL or contract-priced."""
        if self.is_contract_priced:
            return False
        return self.monthly_price is not None and self.annual_price is not None


class BillingSubscription(Base):
    """1:1 with an Organization. The commercial record of record for that org."""
    __tablename__ = "billing_subscriptions"

    id = Column(Integer, primary_key=True, index=True)
    organization_id = Column(Integer, ForeignKey("organizations.id"), unique=True, nullable=False)
    billing_classification = Column(
        CaseInsensitiveEnum(BillingClassification), default=BillingClassification.INTERNAL, nullable=False,
    )
    status = Column(CaseInsensitiveEnum(SubscriptionStatus), default=SubscriptionStatus.EVALUATION, nullable=False)
    billing_channel = Column(CaseInsensitiveEnum(BillingChannel), nullable=True)
    plan_id = Column(Integer, ForeignKey("billing_plans.id"), nullable=True)
    plan_code = Column(CaseInsensitiveEnum(PlanCode), nullable=True)
    billing_cycle = Column(CaseInsensitiveEnum(BillingCycle), nullable=True)
    price_catalog_version = Column(String(50), nullable=True)
    billing_metric = Column(CaseInsensitiveEnum(BillingMetric), nullable=True)
    quantity = Column(Integer, nullable=True)
    committed_quantity = Column(Integer, nullable=True)
    renewal_anchor_date = Column(DateTime, nullable=True)
    commercial_effective_at = Column(DateTime, nullable=True)
    billing_timezone = Column(String(100), default="UTC", nullable=True)
    service_start_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, onupdate=func.now())

    organization = relationship("Organization")
    plan = relationship("BillingPlan", foreign_keys=[plan_id])


class BillingWorkerState(Base):
    """Commercial state for one Employee, kept separate from the Employee row
    itself (Section 4/21) so HR lifecycle edits never silently mutate billing."""
    __tablename__ = "billing_worker_states"

    id = Column(Integer, primary_key=True, index=True)
    employee_id = Column(Integer, ForeignKey("employees.id"), unique=True, nullable=False)
    organization_id = Column(Integer, ForeignKey("organizations.id"), nullable=False)
    commercial_state = Column(
        CaseInsensitiveEnum(WorkerCommercialState), default=WorkerCommercialState.PENDING_REVIEW, nullable=False,
    )
    worker_commercial_category = Column(
        CaseInsensitiveEnum(WorkerCommercialCategory), default=WorkerCommercialCategory.EMPLOYEE, nullable=False,
    )
    billing_inclusion_rule_version = Column(String(50), nullable=True)
    effective_start = Column(DateTime, nullable=True)
    effective_end = Column(DateTime, nullable=True)
    updated_at = Column(DateTime, onupdate=func.now())

    employee = relationship("Employee", foreign_keys=[employee_id])
    organization = relationship("Organization", foreign_keys=[organization_id])


class BillableWorkforceSnapshot(Base):
    """Server-authoritative billable workforce count for an org at a point in
    time (Section 21). Never derived from raw identity-user counts."""
    __tablename__ = "billable_workforce_snapshots"

    id = Column(Integer, primary_key=True, index=True)
    organization_id = Column(Integer, ForeignKey("organizations.id"), nullable=False, index=True)
    quantity = Column(Integer, nullable=False, default=0)
    catalog_version = Column(String(50), nullable=True)
    reconciliation_status = Column(String(50), default="derived_from_hr_state", nullable=False)
    snapshot_at = Column(DateTime, server_default=func.now())

    organization = relationship("Organization")


class BillingEntitlementSnapshot(Base):
    """Package + add-ons + contract overrides resolved for an org (Section 6/21).
    Foundation phase only stores the package; add_ons/contract_overrides stay
    empty until a real catalog/contract model exists."""
    __tablename__ = "billing_entitlement_snapshots"

    id = Column(Integer, primary_key=True, index=True)
    organization_id = Column(Integer, ForeignKey("organizations.id"), nullable=False, index=True)
    package = Column(CaseInsensitiveEnum(PlanCode), nullable=True)
    add_ons = Column(JSON, default=list, nullable=True)
    contract_overrides = Column(JSON, default=dict, nullable=True)
    catalog_version = Column(String(50), nullable=True)
    computed_at = Column(DateTime, server_default=func.now())

    organization = relationship("Organization")


class OrganizationEvaluation(Base):
    """Evaluation period for an organization. Evaluations never auto-charge
    and require an explicit evaluation_ends_at deadline."""
    __tablename__ = "organization_evaluations"

    id = Column(Integer, primary_key=True, index=True)
    organization_id = Column(Integer, ForeignKey("organizations.id"), nullable=False, index=True)
    evaluation_ends_at = Column(DateTime, nullable=False)
    approved_package_scope = Column(String(200), nullable=True)
    data_classification = Column(
        CaseInsensitiveEnum(DataClassification), default=DataClassification.SYNTHETIC, nullable=False,
    )
    conversion_owner = Column(String(255), nullable=True)
    status = Column(
        CaseInsensitiveEnum(EvaluationStatus), default=EvaluationStatus.ACTIVE, nullable=False,
    )
    # Milestone-reminder guards (Section 8.1) — set immediately after a
    # successful send so a scheduler retry/replay never double-sends.
    reminder_7d_sent_at = Column(DateTime, nullable=True)
    reminder_2d_sent_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, onupdate=func.now())

    organization = relationship("Organization")


class BillingConversion(Base):
    """Immutable audit trail for evaluation → commercial conversion.
    Append-only: no update/delete endpoints allowed."""
    __tablename__ = "billing_conversions"

    id = Column(Integer, primary_key=True, index=True)
    organization_id = Column(Integer, ForeignKey("organizations.id"), nullable=False, index=True)
    evaluation_id = Column(Integer, ForeignKey("organization_evaluations.id"), nullable=True)
    catalog_version = Column(String(50), nullable=False)
    quantity_basis = Column(String(200), nullable=False)
    commercial_effective_at = Column(DateTime, nullable=False)
    approver = Column(String(255), nullable=False)
    order_form_reference = Column(String(500), nullable=True)
    implementation_sow_reference = Column(String(500), nullable=True)
    signed_agreement_reference = Column(String(500), nullable=True)
    created_at = Column(DateTime, server_default=func.now())

    organization = relationship("Organization")
    evaluation = relationship("OrganizationEvaluation", foreign_keys=[evaluation_id])


class BillingDiscount(Base):
    """Discount record for an organization. Stackability is enforced at the
    application level: non-stackable discounts cannot overlap."""
    __tablename__ = "billing_discounts"

    id = Column(Integer, primary_key=True, index=True)
    organization_id = Column(Integer, ForeignKey("organizations.id"), nullable=False, index=True)
    campaign_or_contract_id = Column(String(200), nullable=False)
    approver = Column(String(255), nullable=False)
    package_eligibility = Column(String(200), nullable=True)
    currency = Column(String(3), default="USD", nullable=True)
    effective_start = Column(DateTime, nullable=False)
    effective_end = Column(DateTime, nullable=True)
    is_stackable = Column(Boolean, default=False, nullable=False)
    created_at = Column(DateTime, server_default=func.now())

    organization = relationship("Organization")


class PlanEntitlementMapping(Base):
    """One row = one (plan, feature_key) decision at one catalog version.
    Ships EMPTY. Populated only via an explicit, approved seed script run
    by someone with authority to approve the Section 20 entitlement-matrix
    checklist item — never inferred or defaulted by engineering."""
    __tablename__ = "plan_entitlement_mappings"

    id = Column(Integer, primary_key=True)
    plan_code = Column(CaseInsensitiveEnum(PlanCode), nullable=False)
    feature_key = Column(String(150), nullable=False)
    state = Column(String(30), nullable=False)   # canonical state vocabulary
    mode = Column("mode", String(30), nullable=True, quote=True)     # Section 14.1 outward mode override (e.g. read_only)
    limit_ref = Column(String(100), nullable=True)  # Section 14.1 quota/cap reference (e.g. "core.exports.limit=20/min")
    catalog_version = Column(String(50), nullable=False)
    approved_by = Column(String(255), nullable=False)
    approved_at = Column(DateTime, server_default=func.now())

    __table_args__ = (
        UniqueConstraint(
            "plan_code",
            "feature_key",
            "catalog_version",
            name="uq_plan_feature_catalog",
        ),
        {"extend_existing": True},
    )


class BillingAuditLog(Base):
    """Dedicated billing audit trail (Section 19/20) — kept separate from
    super_admin_audit_logs so billing evidence has its own retention/ownership
    even though the shape mirrors it."""
    __tablename__ = "billing_audit_logs"

    id = Column(Integer, primary_key=True, index=True)
    organization_id = Column(Integer, ForeignKey("organizations.id"), nullable=False, index=True)
    action = Column(CaseInsensitiveEnum(BillingAuditAction), nullable=False)
    entity_type = Column(String(100), nullable=False)
    entity_id = Column(Integer, nullable=True)
    actor_id = Column(Integer, ForeignKey("employees.id"), nullable=True)
    actor_email = Column(String(255), nullable=True)
    before = Column(JSON, nullable=True)
    after = Column(JSON, nullable=True)
    reason = Column(Text, nullable=True)
    source = Column(String(50), nullable=True)          # "stripe_webhook" / "api" / "reconciliation"
    stripe_event_id = Column(String(255), nullable=True)  # traceability for webhook-driven rows
    created_at = Column(DateTime, server_default=func.now())

    organization = relationship("Organization")
    actor = relationship("Employee", foreign_keys=[actor_id])


# ── Provider References (Section 21 provider_refs) ─────────────────────────

class ProviderRef(Base):
    """Stripe provider references for an organization. One row per org that
    has interacted with Stripe. Nullable columns are populated as the org
    progresses through checkout → subscription lifecycle."""
    __tablename__ = "billing_provider_refs"

    id = Column(Integer, primary_key=True, index=True)
    organization_id = Column(Integer, ForeignKey("organizations.id"), unique=True, nullable=False)
    stripe_customer_id = Column(String(255), nullable=True, index=True)
    stripe_subscription_id = Column(String(255), nullable=True, index=True)
    stripe_payment_method_id = Column(String(255), nullable=True)
    stripe_latest_invoice_id = Column(String(255), nullable=True)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, onupdate=func.now())

    organization = relationship("Organization")


# ── Billing Invoice mirror (read-only from Stripe) ─────────────────────────

class BillingInvoice(Base):
    """Read-only mirror of Stripe invoices for display purposes only.
    Per I2: invoice line descriptions never include employee names or
    HR-sensitive detail — this model stores only Stripe-native fields."""
    __tablename__ = "billing_invoices"

    id = Column(Integer, primary_key=True, index=True)
    organization_id = Column(Integer, ForeignKey("organizations.id"), nullable=False, index=True)
    stripe_invoice_id = Column(String(255), unique=True, nullable=False)
    amount_due_cents = Column(Integer, nullable=False, default=0)
    amount_paid_cents = Column(Integer, nullable=False, default=0)
    currency = Column(String(3), default="USD", nullable=False)
    status = Column(String(50), nullable=False)  # draft/open/paid/void/uncollectible
    hosted_invoice_url = Column(String(500), nullable=True)
    invoice_pdf_url = Column(String(500), nullable=True)
    period_start = Column(DateTime, nullable=True)
    period_end = Column(DateTime, nullable=True)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, onupdate=func.now())

    organization = relationship("Organization")


# ── Webhook Event Inbox (replay protection) ────────────────────────────────

class BillingWebhookEvent(Base):
    """Append-only event inbox keyed by Stripe event ID. A duplicate event ID
    is always a no-op — this table is the single source of truth for the
    BILLING_COUNT_DISCREPANCY guardrail and Section 20 replay protection."""
    __tablename__ = "billing_webhook_events"

    id = Column(Integer, primary_key=True, index=True)
    stripe_event_id = Column(String(255), unique=True, nullable=False, index=True)
    event_type = Column(String(100), nullable=False)
    processed = Column(Boolean, default=False, nullable=False)
    error_message = Column(Text, nullable=True)
    payload = Column(JSON, nullable=True)
    created_at = Column(DateTime, server_default=func.now())
    processed_at = Column(DateTime, nullable=True)


# ── Idempotency Keys ───────────────────────────────────────────────────────

class BillingIdempotencyKey(Base):
    """Universal idempotency record for mutating billing endpoints.
    Composite key: (idempotency_key, org_id, endpoint). A replay with a
    different request body returns 409; a replay with the same body returns
    the stored result."""
    __tablename__ = "billing_idempotency_keys"

    id = Column(Integer, primary_key=True, index=True)
    idempotency_key = Column(String(255), nullable=False)
    organization_id = Column(Integer, nullable=False)
    endpoint = Column(String(200), nullable=False)
    request_body_hash = Column(String(64), nullable=False)  # SHA-256 of JSON body
    result_status_code = Column(Integer, nullable=False)
    result_body = Column(JSON, nullable=False)
    created_at = Column(DateTime, server_default=func.now())

    __table_args__ = (
        UniqueConstraint("idempotency_key", "organization_id", "endpoint", name="uq_idempotency_org_endpoint"),
    )


# ── Reconciliation Cases (Section 21 / Section 22 BILLING_COUNT_DISCREPANCY) ─

class BillingReconciliationCase(Base):
    """Opened when local BillingSubscription state differs from Stripe.
    Per Section 21: open a case, never silently overwrite finalized invoice
    history. Cases are reviewed manually or by reconciliation automation."""
    __tablename__ = "billing_reconciliation_cases"

    id = Column(Integer, primary_key=True, index=True)
    organization_id = Column(Integer, ForeignKey("organizations.id"), nullable=False, index=True)
    reason = Column(CaseInsensitiveEnum(ReconciliationCaseReason), nullable=False)
    status = Column(CaseInsensitiveEnum(ReconciliationCaseStatus), default=ReconciliationCaseStatus.OPEN, nullable=False)
    local_snapshot = Column(JSON, nullable=True)     # snapshot of local BillingSubscription
    stripe_snapshot = Column(JSON, nullable=True)     # snapshot of Stripe subscription state
    notes = Column(Text, nullable=True)
    opened_by = Column(String(255), nullable=True)    # "stripe_webhook" or user email
    resolved_by = Column(String(255), nullable=True)
    resolved_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, onupdate=func.now())

    organization = relationship("Organization")


# ── Plan Change (Prompt 4) ────────────────────────────────────────────────

class PlanChangeStatus(str, enum.Enum):
    SCHEDULED = "scheduled"
    EXECUTING = "executing"
    EXECUTED = "executed"
    BLOCKED = "blocked"
    CANCELED = "canceled"


class PlanChangeType(str, enum.Enum):
    UPGRADE = "upgrade"
    DOWNGRADE = "downgrade"


class BillingPlanChange(Base):
    """Scheduled plan change — created by POST /billing/plan-changes/schedule,
    executed daily by the period-end scheduler job. Blockers are re-checked
    at execution time; if still blocked, change flagged for manual ops review."""
    __tablename__ = "billing_plan_changes"

    id = Column(Integer, primary_key=True, index=True)
    organization_id = Column(Integer, ForeignKey("organizations.id"), nullable=False, index=True)
    change_type = Column(CaseInsensitiveEnum(PlanChangeType), nullable=False)
    from_plan_id = Column(Integer, ForeignKey("billing_plans.id"), nullable=True)
    to_plan_id = Column(Integer, ForeignKey("billing_plans.id"), nullable=False)
    billing_cycle = Column(CaseInsensitiveEnum(BillingCycle), nullable=False)
    effective_at = Column(DateTime, nullable=False)
    status = Column(CaseInsensitiveEnum(PlanChangeStatus), default=PlanChangeStatus.SCHEDULED, nullable=False)
    blockers_snapshot = Column(JSON, nullable=True)
    proration_preview = Column(JSON, nullable=True)
    entitlement_delta = Column(JSON, nullable=True)
    requested_by = Column(String(255), nullable=True)
    cancel_reason = Column(Text, nullable=True)
    canceled_at = Column(DateTime, nullable=True)
    executed_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, onupdate=func.now())

    organization = relationship("Organization")
    from_plan = relationship("BillingPlan", foreign_keys=[from_plan_id])
    to_plan = relationship("BillingPlan", foreign_keys=[to_plan_id])


# ── Refund / Credit Request (Section 12 I3/I4) ────────────────────────────

class RefundRequestStatus(str, enum.Enum):
    PENDING_APPROVAL = "pending_approval"
    APPROVED_AND_PROCESSED = "approved_and_processed"
    REJECTED = "rejected"


class RefundRequestType(str, enum.Enum):
    REFUND = "refund"
    CREDIT = "credit"


class BillingRefundRequest(Base):
    """Two-step refund/credit workflow per Section 12 (I3):
    1. Owner/Billing Admin requests (PENDING_APPROVAL)
    2. Billing Ops/Finance approves → Stripe refund/credit executed

    Engineering hardening: requester ≠ approver (same-actor rejection)."""
    __tablename__ = "billing_refund_requests"

    id = Column(Integer, primary_key=True, index=True)
    organization_id = Column(Integer, ForeignKey("organizations.id"), nullable=False, index=True)
    request_type = Column(CaseInsensitiveEnum(RefundRequestType), nullable=False)
    amount_cents = Column(Integer, nullable=False)
    currency = Column(String(3), default="USD", nullable=False)
    reason = Column(Text, nullable=False)
    stripe_subscription_id = Column(String(255), nullable=True)
    stripe_invoice_id = Column(String(255), nullable=True)
    stripe_refund_id = Column(String(255), nullable=True)
    status = Column(CaseInsensitiveEnum(RefundRequestStatus), default=RefundRequestStatus.PENDING_APPROVAL, nullable=False)
    requested_by = Column(String(255), nullable=False)
    approved_by = Column(String(255), nullable=True)
    rejection_reason = Column(Text, nullable=True)
    processed_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, onupdate=func.now())

    organization = relationship("Organization")


# ── Delinquency (Section 10 G1–G5, Section 22 DAY_* events) ────────────────

class DelinquencyStage(str, enum.Enum):
    """Graduated recovery stages per Section 10 G1. Recovery is attempted
    through day 14; new commercial expansion is gated from day 10; controlled
    service restriction starts day 20; termination/closure workflow at day 45
    unless an Enterprise contractual cure period overrides the timing."""
    RECOVERY = "recovery"                  # payment failed, still trying (day 0–14)
    DAY_10_RESTRICT = "day_10_restrict"    # block new commercial expansion / cost-increasing actions
    DAY_20_RESTRICT = "day_20_restrict"    # controlled service restriction, preserve read/remediation/privacy/export
    DAY_45_TERMINATION = "day_45_termination"  # terminate standard subscription, begin closure workflow


class DelinquencyCaseStatus(str, enum.Enum):
    OPEN = "open"
    RECOVERED = "recovered"
    TERMINATED = "terminated"


class DelinquencyCase(Base):
    """One open delinquency case per organization while a payment failure is
    being recovered. Tracks the graduated day-10/20/45 timeline and the
    derived RESTRICTED stage so the entitlement layer can gate actions
    without relying on frontend banners alone (Section 10 G2/G3)."""
    __tablename__ = "billing_delinquency_cases"

    id = Column(Integer, primary_key=True, index=True)
    organization_id = Column(Integer, ForeignKey("organizations.id"), unique=True, nullable=False, index=True)
    status = Column(CaseInsensitiveEnum(DelinquencyCaseStatus), default=DelinquencyCaseStatus.OPEN, nullable=False)
    stage = Column(CaseInsensitiveEnum(DelinquencyStage), default=DelinquencyStage.RECOVERY, nullable=False)
    stripe_event_id = Column(String(255), nullable=True)
    failed_at = Column(DateTime, nullable=False)          # when invoice.payment_failed was received
    recovered_at = Column(DateTime, nullable=True)
    terminated_at = Column(DateTime, nullable=True)
    retention_hold_until = Column(DateTime, nullable=True)  # G2/G5: export/retention window after termination
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, onupdate=func.now())

    organization = relationship("Organization")


# ── Support Access (Section 18 O3 / G4 Billing Operations escalation) ─────

class SupportAccessGrant(Base):
    """Time-bounded, tenant-scoped, fully-logged grant of elevated Billing
    Operations support access to an organization (Section 8/18: tenant-scoped,
    logged and time-bounded). A durable opaque token is minted, expiry is
    enforced, and every grant/revoke is recorded on the billing audit trail."""
    __tablename__ = "billing_support_access_grants"

    id = Column(Integer, primary_key=True, index=True)
    organization_id = Column(Integer, ForeignKey("organizations.id"), nullable=False, index=True)
    token_hash = Column(String(128), nullable=False, unique=True)  # SHA-256 of the raw token
    granted_by = Column(String(255), nullable=False)   # Billing Ops actor
    reason = Column(Text, nullable=True)
    expires_at = Column(DateTime, nullable=False)
    revoked_at = Column(DateTime, nullable=True)
    revoked_by = Column(String(255), nullable=True)
    created_at = Column(DateTime, server_default=func.now())

    organization = relationship("Organization")


# ── Confirmation Tokens (two-step destructive / state-changing actions) ────

class ConfirmationTokenPurpose(str, enum.Enum):
    DELETE_ORGANIZATION = "delete_organization"
    UPDATE_ORGANIZATION_STATUS = "update_organization_status"


class ConfirmationTokenStatus(str, enum.Enum):
    PENDING = "pending"
    CONSUMED = "consumed"
    EXPIRED = "expired"
    REVOKED = "revoked"


class ConfirmationToken(Base):
    """One-time, time-bounded token minted before a destructive or
    irrevocable organization action (e.g. hard-delete, forced status change).
    The actor must present the token back to confirm the action — a two-step
    pattern that prevents accidental destructive changes."""
    __tablename__ = "billing_confirmation_tokens"

    id = Column(Integer, primary_key=True, index=True)
    organization_id = Column(Integer, ForeignKey("organizations.id"), nullable=False, index=True)
    purpose = Column(CaseInsensitiveEnum(ConfirmationTokenPurpose), nullable=False)
    token_hash = Column(String(128), nullable=False, unique=True)  # SHA-256 of the raw token
    expires_at = Column(DateTime, nullable=False)
    status = Column(CaseInsensitiveEnum(ConfirmationTokenStatus), default=ConfirmationTokenStatus.PENDING, nullable=False)
    actor_id = Column(Integer, ForeignKey("employees.id"), nullable=True)
    actor_email = Column(String(255), nullable=True)
    consumed_at = Column(DateTime, nullable=True)
    token_metadata = Column(JSON, nullable=True)   # e.g. the proposed target status / confirmation display
    created_at = Column(DateTime, server_default=func.now())

    organization = relationship("Organization")


# ═════════════════════════════════════════════════════════════════════════════
# ZHR-COM-ENT-001 — Commercial Plan Entitlement & Subscription Control
# (see docs/ZHR-COM-ENT-001-...-specification.md, Section 14).
#
# The spec's canonical table names are short and singular (commercial_sku,
# feature_definition, ...). New tables below use those names verbatim so the
# data model matches the spec document, while the N+1 existing pre-spec tables
# keep their historical plural names. plan_feature_entitlement is already
# covered by the existing plan_entitlement_mappings table (Phase 1 keeps that
# table; Phase 2 adds the spec's `mode`/`limit_ref` vocabulary on top of it).
# ═════════════════════════════════════════════════════════════════════════════

class EntitlementMode(str, enum.Enum):
    """Section 14.1 — the nine canonical entitlement modes. The historically
    named `state` values (ENTITLED_AVAILABLE etc.) map onto these modes in
    entitlement_service.py; `mode` is the outward-facing, spec vocabulary."""
    ENABLED = "enabled"
    DISABLED_PLAN = "disabled_plan"
    READ_ONLY = "read_only"
    CONFIG_REQUIRED = "config_required"
    DEPENDENCY_REQUIRED = "dependency_required"
    POLICY_BLOCKED = "policy_blocked"
    RESTRICTED_BILLING = "restricted_billing"
    INCIDENT_DISABLED = "incident_disabled"
    LIMIT_REACHED = "limit_reached"


class CommercialCatalogStatus(str, enum.Enum):
    DRAFT = "draft"
    PUBLISHED = "published"
    RETIRED = "retired"


class CommercialSkuType(str, enum.Enum):
    SUBSCRIPTION = "subscription"
    SEAT_ADDON = "seat_addon"
    SERVICE = "service"


class FeatureSensitivity(str, enum.Enum):
    INTERNAL = "internal"
    SENSITIVE = "sensitive"
    RESTRICTED = "restricted"


class FeatureEnforcementMode(str, enum.Enum):
    OFF = "off"
    REPORT_ONLY = "report_only"
    ENFORCE = "enforce"


class FeatureStatus(str, enum.Enum):
    ACTIVE = "active"
    DISABLED = "disabled"
    DEPRECATED = "deprecated"


class FeatureKeyAlias(Base):
    """Section 14 `feature_key_alias` — durable canonical-alias mapping (Phase 11).
    Legacy engineering key → Appendix A sibling. The resolver canonicalizes
    every incoming feature_key through this table before validity / hard-block
    checks, logging a deprecation warning on each alias hit. FEATURE_KEY_CANONICAL
    in feature_keys.py mirrors these rows and is the in-code fallback when the
    table is empty in a dev database that has not run migrations."""
    __tablename__ = "feature_key_alias"

    id = Column(Integer, primary_key=True, index=True)
    alias_key = Column(String(150), nullable=False, index=True)
    canonical_key = Column(String(150), nullable=False)
    note = Column(String(255), nullable=True)
    created_at = Column(DateTime, server_default=func.now())

    __table_args__ = (
        UniqueConstraint("alias_key", name="uq_feature_key_alias_alias_key"),
    )


class DowngradeImpactSeverity(str, enum.Enum):
    BLOCKING = "blocking"
    WARNING = "warning"


class CommercialExceptionStatus(str, enum.Enum):
    PENDING_APPROVAL = "pending_approval"
    ACTIVE = "active"
    REJECTED = "rejected"
    EXPIRED = "expired"
    REVOKED = "revoked"


class CommercialCatalogVersion(Base):
    """Section 14 `commercial_catalog_version` — versioned, immutable-after-
    publish catalog snapshot. checksum stays null until the canonical catalog
    publishes an integrity digest."""
    __tablename__ = "commercial_catalog_version"

    id = Column(Integer, primary_key=True, index=True)
    version = Column(String(50), unique=True, nullable=False)
    status = Column(
        CaseInsensitiveEnum(CommercialCatalogStatus), default=CommercialCatalogStatus.DRAFT, nullable=False,
    )
    effective_from = Column(DateTime, nullable=True)
    effective_to = Column(DateTime, nullable=True)
    approved_by = Column(String(255), nullable=True)
    published_at = Column(DateTime, nullable=True)
    checksum = Column(String(64), nullable=True)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, onupdate=func.now())

    skus = relationship("CommercialSku", back_populates="catalog_version")


class CommercialSku(Base):
    """Section 14 `commercial_sku` — rated catalog line. Amount may stay NULL
    until price approval (P0 rule: live use is forbidden when a required value
    is absent, mirroring BillingPlan's unpriced posture)."""
    __tablename__ = "commercial_sku"

    id = Column(Integer, primary_key=True, index=True)
    catalog_version_id = Column(Integer, ForeignKey("commercial_catalog_version.id"), nullable=True)
    code = Column(String(100), nullable=False)
    type = Column(CaseInsensitiveEnum(CommercialSkuType), default=CommercialSkuType.SUBSCRIPTION, nullable=False)
    interval = Column(String(20), nullable=True)   # monthly | annual | one_time
    currency = Column(String(3), nullable=True)
    amount_cents = Column(Integer, nullable=True)  # null until pricing approved
    tax_code = Column(String(50), nullable=True)
    provider_product_id = Column(String(255), nullable=True)
    provider_price_id = Column(String(255), nullable=True)
    is_active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, onupdate=func.now())

    catalog_version = relationship("CommercialCatalogVersion", back_populates="skus")

    __table_args__ = (
        UniqueConstraint("catalog_version_id", "code", name="uq_catalog_sku_code"),
    )


class FeatureDefinition(Base):
    """Section 14 `feature_definition` — stable semantic feature-key registry
    with domain, sensitivity and enforcement posture. The engineering
    FEATURE_KEYS frozenset in feature_keys.py stays the runtime gate; this
    table is the durable, governable description of each key."""
    __tablename__ = "feature_definition"

    id = Column(Integer, primary_key=True, index=True)
    key = Column(String(150), unique=True, nullable=False, index=True)
    domain = Column(String(100), nullable=True)
    description = Column(Text, nullable=True)
    sensitivity = Column(
        CaseInsensitiveEnum(FeatureSensitivity), default=FeatureSensitivity.INTERNAL, nullable=False,
    )
    enforcement_mode = Column(
        CaseInsensitiveEnum(FeatureEnforcementMode), default=FeatureEnforcementMode.REPORT_ONLY, nullable=False,
    )
    status = Column(
        CaseInsensitiveEnum(FeatureStatus), default=FeatureStatus.ACTIVE, nullable=False,
    )
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, onupdate=func.now())


class DowngradeImpactItem(Base):
    """Section 14 `downgrade_impact_item` — concrete blockers/warnings hanging
    off a scheduled plan change (or a preview, where plan_change_id is NULL).
    Populated from downgrade_blockers.Blocker rows so the impact is durable
    and resolvable instead of living only in a JSON blob."""
    __tablename__ = "downgrade_impact_item"

    id = Column(Integer, primary_key=True, index=True)
    plan_change_id = Column(Integer, ForeignKey("billing_plan_changes.id"), nullable=True, index=True)
    feature_key = Column(String(150), nullable=False)
    resource_type = Column(String(100), nullable=True)
    resource_id = Column(String(200), nullable=True)
    severity = Column(
        CaseInsensitiveEnum(DowngradeImpactSeverity), default=DowngradeImpactSeverity.BLOCKING, nullable=False,
    )
    remediation = Column(Text, nullable=True)
    resolved_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, server_default=func.now())

    plan_change = relationship("BillingPlanChange", foreign_keys=[plan_change_id])


class CommercialExceptionEntitlement(Base):
    """Section 14 `commercial_exception_entitlement` — time-bound, operator-
    approved entitlement override for a single (organization, feature_key).
    Never indefinite: starts_at/expires_at are required. Grantable modes are
    restricted to ENABLED / READ_ONLY (validated in exception_service; a
    manual row inserting POLICY_BLOCKED etc. is meaningless).
    Status lifecycle: PENDING_APPROVAL -> ACTIVE/REJECTED -> EXPIRED/REVOKED.
    Mirror of approved_by/requested_by is kept so requester == approver can be
    rejected (same-actor pattern shared with refund_service)."""
    __tablename__ = "commercial_exception_entitlement"

    id = Column(Integer, primary_key=True, index=True)
    organization_id = Column(Integer, ForeignKey("organizations.id"), nullable=False, index=True)
    feature_key = Column(String(150), nullable=False, index=True)
    mode = Column("mode", CaseInsensitiveEnum(EntitlementMode), nullable=False, quote=True)
    reason = Column(Text, nullable=False)
    requested_by = Column(String(255), nullable=False)
    approved_by = Column(String(255), nullable=True)
    starts_at = Column(DateTime, nullable=False)
    expires_at = Column(DateTime, nullable=False)
    status = Column(
        CaseInsensitiveEnum(CommercialExceptionStatus),
        default=CommercialExceptionStatus.PENDING_APPROVAL,
        nullable=False,
    )
    rejection_reason = Column(Text, nullable=True)
    rejected_by = Column(String(255), nullable=True)
    revoked_by = Column(String(255), nullable=True)
    revoked_at = Column(DateTime, nullable=True)
    approved_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, onupdate=func.now())

    organization = relationship("Organization")

    __table_args__ = (
        UniqueConstraint(
            "organization_id", "feature_key", "starts_at", "expires_at",
            name="uq_exception_org_feature_window",
        ),
    )


# ── Registration Quotation (quote -> accept/reject -> invoice) ──────────────

class QuotationStatus(str, enum.Enum):
    PENDING = "pending"
    ACCEPTED = "accepted"
    REJECTED = "rejected"


class BillingQuotation(Base):
    """A commercial quote emailed to the registrant right after their
    organization signs up (self-serve evaluation registration). The
    registrant accepts or rejects it via a single-use emailed link; accepting
    notifies the registrant + every Super Admin and triggers an invoice
    email. This is independent of Stripe — there is no real subscription/
    payment yet at registration time, so amount_cents here is only the
    quoted figure (from BillingPlan's list price), not a charge."""
    __tablename__ = "billing_quotations"

    id = Column(Integer, primary_key=True, index=True)
    organization_id = Column(Integer, ForeignKey("organizations.id"), nullable=False, index=True)
    quote_number = Column(String(50), nullable=False, unique=True)

    plan_code = Column(CaseInsensitiveEnum(PlanCode), nullable=False)
    billing_cycle = Column(CaseInsensitiveEnum(BillingCycle), nullable=False, default=BillingCycle.MONTHLY)
    currency = Column(String(3), nullable=False, default="USD")
    amount_cents = Column(Integer, nullable=False)

    recipient_email = Column(String(255), nullable=False)
    recipient_name = Column(String(200), nullable=True)

    status = Column(CaseInsensitiveEnum(QuotationStatus), nullable=False, default=QuotationStatus.PENDING)
    issued_at = Column(DateTime, server_default=func.now())
    valid_until = Column(DateTime, nullable=False)
    decided_at = Column(DateTime, nullable=True)

    # Single-use decision link — only the hash is stored, matching
    # SecurityActionToken's pattern (employee/models.py); kept local to this
    # table rather than reusing that table, since a quotation has exactly one
    # decision token for its whole lifetime and this avoids widening a
    # security-sensitive shared table/enum for an unrelated concern.
    decision_token_hash = Column(String(64), nullable=True, index=True)
    decision_token_expires_at = Column(DateTime, nullable=True)

    invoice_number = Column(String(50), nullable=True)
    invoice_sent_at = Column(DateTime, nullable=True)

    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, onupdate=func.now())

    organization = relationship("Organization")
