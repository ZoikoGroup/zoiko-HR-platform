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
    Column, Integer, String, Numeric, Boolean, DateTime, Text, ForeignKey, JSON,
)
from sqlalchemy.ext.hybrid import hybrid_property
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.database import Base
from app.modules.employee.models import CaseInsensitiveEnum


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
    DISCOUNT_CREATED = "discount_created"


# ── Models ────────────────────────────────────────────────────────────────────

class BillingPlan(Base):
    """Catalog row for CORE/ADVANCED/ENTERPRISE. Numeric pricing is NOT locked
    (Section 3/17 P0 blocker) — price stays null and is_self_serve_enabled
    resolves to False whenever either price is NULL."""
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
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, onupdate=func.now())

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
    created_at = Column(DateTime, server_default=func.now())

    organization = relationship("Organization")
    actor = relationship("Employee", foreign_keys=[actor_id])
