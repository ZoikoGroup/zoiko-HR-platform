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
    monthly_price: Optional[float] = None
    annual_price: Optional[float] = None
    currency: Optional[str] = None
    description: Optional[str] = None
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
    blockers: List[str] = []


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
