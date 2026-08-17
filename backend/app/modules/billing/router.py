"""
modules/billing/router.py
---------------------------
Billing & Subscription endpoints — ZHR-COM-BILL-001 foundation + lifecycle phase.

Scope: organization billing classification, plan catalog, evaluations,
conversions, subscription management, discounts, workforce snapshot,
and the billing audit trail.

RBAC: permission table at top maps roles to allowed actions.
Existing billing deps from core/dependencies.py are reused — no second
permission system.
"""

import logging

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.core.dependencies import (
    get_current_billing_admin,
    get_current_billing_owner,
    get_current_billing_viewer,
    get_current_user,
    require_organization_access,
)
from app.core.exceptions import ForbiddenException, AlreadyExistsException
from app.modules.billing import service
from app.modules.billing.models import BillingAuditAction, BillingPlan
from app.modules.billing.schemas import (
    BillingAuditLogItem,
    BillingOverviewResponse,
    CancelRequest,
    ClassificationUpdateRequest,
    ConversionListResponse,
    ConversionRequest,
    ConversionResponse,
    DiscountCreateRequest,
    DiscountListResponse,
    DiscountResponse,
    DowngradeDryRunResponse,
    DowngradeRequest,
    EvaluationListResponse,
    EvaluationResponse,
    EvaluationStartRequest,
    PlanCreateRequest,
    PlanListResponse,
    PlanResponse,
    PlanUpdateRequest,
    SubscriptionResponse,
    UpgradeRequest,
    WorkforceSnapshotResponse,
)

logger = logging.getLogger("zoiko.billing")

billing_router = APIRouter(prefix="/billing", tags=["Billing"])


# ── RBAC Permission Table (Section 19) ────────────────────────────────────────
# Maps role → set of allowed actions. Auditable at a glance.
# super_admin = Organization Owner (full authority).
# billing_admin = near-Owner billing authority (same minus unilateral refunds).
# admin/hr_admin = view package + workforce usage only (no financial detail).
# manager/employee = no billing access.

_BILLING_PERMISSIONS = {
    "super_admin": {
        "view_plans", "manage_plans",
        "view_evaluations", "manage_evaluations", "convert_evaluations",
        "view_subscriptions", "manage_subscriptions",
        "view_discounts", "manage_discounts",
        "view_billing_overview", "view_audit_logs",
        "manage_classifications", "manage_workforce",
    },
    "billing_admin": {
        "view_plans",
        "view_evaluations", "manage_evaluations", "convert_evaluations",
        "view_subscriptions", "manage_subscriptions",
        "view_discounts", "manage_discounts",
        "view_billing_overview", "view_audit_logs",
        "manage_workforce",
    },
    "admin": {
        "view_plans",
        "view_subscriptions",
    },
    "hr_admin": {
        "view_plans",
        "view_subscriptions",
    },
}


def _check_billing_permission(role: str, action: str) -> None:
    """Raise 403 if role lacks the specified billing action."""
    allowed = _BILLING_PERMISSIONS.get(role, set())
    if action not in allowed:
        raise ForbiddenException(
            f"Role '{role}' lacks billing permission '{action}'."
        )


def _get_billing_role(current_user) -> str:
    return service.role_value(current_user.role)


def _check_org_scope(current_user, org_id: int) -> None:
    """The Organization Owner (super_admin) may access any org; every other
    billing role must belong to the org it's asking about."""
    if _get_billing_role(current_user) != "super_admin":
        require_organization_access(target_organization_id=org_id, current_user=current_user)


# ── Existing foundation endpoints ─────────────────────────────────────────────

@billing_router.get(
    "/organizations/{org_id}/overview",
    response_model=BillingOverviewResponse,
    summary="Billing/subscription overview (trimmed for HR Admin / Organization Admin)",
)
def get_overview(
    org_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_billing_viewer),
):
    _check_org_scope(current_user, org_id)
    subscription = service.get_or_create_subscription(db, org_id)
    trimmed = _get_billing_role(current_user) in ("admin", "hr_admin")
    return service.to_overview_response(db, subscription, trimmed=trimmed)


@billing_router.get(
    "/organizations/{org_id}/workforce",
    response_model=WorkforceSnapshotResponse,
    summary="Latest billable workforce snapshot",
)
def get_workforce(
    org_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_billing_viewer),
):
    _check_org_scope(current_user, org_id)
    snapshot = service.get_latest_workforce_snapshot(db, org_id)
    worker_states = service.get_worker_states(db, org_id)
    return {
        "organization_id": snapshot.organization_id,
        "quantity": snapshot.quantity,
        "catalog_version": snapshot.catalog_version,
        "reconciliation_status": snapshot.reconciliation_status,
        "snapshot_at": snapshot.snapshot_at,
        "worker_states": worker_states,
    }


@billing_router.post(
    "/organizations/{org_id}/workforce/recompute",
    response_model=WorkforceSnapshotResponse,
    summary="Recompute the billable workforce snapshot from current HR state",
)
def recompute_workforce(
    org_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_billing_admin),
):
    _check_org_scope(current_user, org_id)
    snapshot = service.recompute_billable_workforce_snapshot(db, org_id)
    service.log_billing_audit(
        db,
        actor=current_user,
        organization_id=org_id,
        action=BillingAuditAction.WORKFORCE_RECOMPUTED,
        entity_type="BillableWorkforceSnapshot",
        entity_id=snapshot.id,
        before=None,
        after={"quantity": snapshot.quantity},
        reason="Manual recompute",
    )
    worker_states = service.get_worker_states(db, org_id)
    return {
        "organization_id": snapshot.organization_id,
        "quantity": snapshot.quantity,
        "catalog_version": snapshot.catalog_version,
        "reconciliation_status": snapshot.reconciliation_status,
        "snapshot_at": snapshot.snapshot_at,
        "worker_states": worker_states,
    }


@billing_router.put(
    "/organizations/{org_id}/classification",
    response_model=BillingOverviewResponse,
    summary="Change an organization's billing classification (Owner only)",
)
def update_classification(
    org_id: int,
    data: ClassificationUpdateRequest,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_billing_owner),
):
    subscription = service.get_or_create_subscription(db, org_id)
    before_classification = service.role_value(subscription.billing_classification)
    subscription.billing_classification = data.billing_classification
    db.commit()
    db.refresh(subscription)

    service.log_billing_audit(
        db,
        actor=current_user,
        organization_id=org_id,
        action=BillingAuditAction.CLASSIFICATION_CHANGED,
        entity_type="BillingSubscription",
        entity_id=subscription.id,
        before={"billing_classification": before_classification},
        after={"billing_classification": service.role_value(subscription.billing_classification)},
        reason=data.reason,
    )
    return service.to_overview_response(db, subscription, trimmed=False)


@billing_router.get(
    "/organizations/{org_id}/audit-logs",
    response_model=list[BillingAuditLogItem],
    summary="Billing audit trail for an organization",
)
def get_audit_logs(
    org_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_billing_admin),
):
    _check_org_scope(current_user, org_id)
    return service.get_audit_logs(db, org_id)


# ── Plan catalog endpoints ────────────────────────────────────────────────────

@billing_router.get(
    "/plans",
    response_model=PlanListResponse,
    summary="List plan catalog (Super Admin: all; Org Admin: active only)",
)
def list_plans(
    db: Session = Depends(get_db),
    current_user=Depends(get_current_billing_viewer),
):
    role = _get_billing_role(current_user)
    active_only = role in ("admin", "hr_admin")
    plans = service.get_plans(db, active_only=active_only)
    return PlanListResponse(
        list=[service.plan_to_dict(p) for p in plans],
        total=len(plans),
    )


@billing_router.post(
    "/plans",
    response_model=PlanResponse,
    summary="Create/version a plan (Super Admin only)",
)
def create_plan(
    data: PlanCreateRequest,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_billing_owner),
):
    plan = BillingPlan(
        code=data.code,
        name=data.name,
        catalog_version=data.catalog_version,
        billing_metric=data.billing_metric,
        is_active=data.is_active,
        is_contract_priced=data.is_contract_priced,
        monthly_price=data.monthly_price,
        annual_price=data.annual_price,
        currency=data.currency,
        description=data.description,
    )
    db.add(plan)
    db.commit()
    db.refresh(plan)

    service.log_billing_audit(
        db,
        actor=current_user,
        organization_id=0,
        action=BillingAuditAction.PLAN_CREATED,
        entity_type="BillingPlan",
        entity_id=plan.id,
        before=None,
        after=service.plan_to_dict(plan),
    )
    return service.plan_to_dict(plan)


@billing_router.put(
    "/plans/{plan_id}",
    response_model=PlanResponse,
    summary="Update a plan (blocked if catalog_version referenced by conversions)",
)
def update_plan(
    plan_id: int,
    data: PlanUpdateRequest,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_billing_owner),
):
    plan = service.get_plan_by_id(db, plan_id)

    # Immutability guard: if this plan's catalog_version is referenced by any
    # billing_conversion, reject edits (Section 17).
    if data.catalog_version is not None and data.catalog_version != plan.catalog_version:
        if service.is_plan_catalog_version_referenced(db, plan.catalog_version):
            raise AlreadyExistsException(
                "BillingPlan catalog_version",
                f"'{plan.catalog_version}' — referenced by existing billing conversions. "
                f"Create a new catalog version instead."
            )

    before = service.plan_to_dict(plan)

    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(plan, field, value)
    db.commit()
    db.refresh(plan)

    service.log_billing_audit(
        db,
        actor=current_user,
        organization_id=0,
        action=BillingAuditAction.PLAN_UPDATED,
        entity_type="BillingPlan",
        entity_id=plan.id,
        before=before,
        after=service.plan_to_dict(plan),
    )
    return service.plan_to_dict(plan)


# ── Evaluation endpoints ──────────────────────────────────────────────────────

@billing_router.post(
    "/evaluations",
    response_model=EvaluationResponse,
    summary="Start an evaluation for an organization",
)
def start_evaluation(
    data: EvaluationStartRequest,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_billing_owner),
):
    evaluation = service.start_evaluation(
        db,
        organization_id=data.organization_id,
        evaluation_ends_at=data.evaluation_ends_at,
        approved_package_scope=data.approved_package_scope,
        data_classification=data.data_classification,
        conversion_owner=data.conversion_owner,
    )

    service.log_billing_audit(
        db,
        actor=current_user,
        organization_id=data.organization_id,
        action=BillingAuditAction.EVALUATION_STARTED,
        entity_type="OrganizationEvaluation",
        entity_id=evaluation.id,
        before=None,
        after={
            "evaluation_ends_at": evaluation.evaluation_ends_at.isoformat(),
            "data_classification": service.role_value(evaluation.data_classification),
            "approved_package_scope": evaluation.approved_package_scope,
        },
    )
    return evaluation


@billing_router.get(
    "/evaluations/{org_id}",
    response_model=EvaluationListResponse,
    summary="List evaluations for an organization",
)
def list_evaluations(
    org_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_billing_viewer),
):
    _check_org_scope(current_user, org_id)
    evaluations = service.get_org_evaluations(db, org_id)
    return EvaluationListResponse(list=evaluations, total=len(evaluations))


@billing_router.post(
    "/evaluations/{evaluation_id}/end",
    response_model=EvaluationResponse,
    summary="End an active evaluation (read-only mode)",
)
def end_evaluation(
    evaluation_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_billing_owner),
):
    evaluation = service.end_evaluation(db, evaluation_id)

    service.log_billing_audit(
        db,
        actor=current_user,
        organization_id=evaluation.organization_id,
        action=BillingAuditAction.EVALUATION_ENDED,
        entity_type="OrganizationEvaluation",
        entity_id=evaluation.id,
        before={"status": "active"},
        after={"status": "evaluation_ended"},
    )
    return evaluation


# ── Conversion endpoint ───────────────────────────────────────────────────────

@billing_router.post(
    "/evaluations/{evaluation_id}/convert",
    response_model=ConversionResponse,
    summary="Convert evaluation → commercial subscription",
)
def convert_evaluation(
    evaluation_id: int,
    data: ConversionRequest,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_billing_owner),
):
    conversion = service.convert_evaluation(
        db,
        evaluation_id=evaluation_id,
        plan_id=data.plan_id,
        billing_cycle=data.billing_cycle,
        quantity_basis=data.quantity_basis,
        commercial_effective_at=data.commercial_effective_at,
        approver=data.approver,
        order_form_reference=data.order_form_reference,
        implementation_sow_reference=data.implementation_sow_reference,
        signed_agreement_reference=data.signed_agreement_reference,
    )

    service.log_billing_audit(
        db,
        actor=current_user,
        organization_id=conversion.organization_id,
        action=BillingAuditAction.EVALUATION_CONVERTED,
        entity_type="BillingConversion",
        entity_id=conversion.id,
        before=None,
        after={
            "catalog_version": conversion.catalog_version,
            "quantity_basis": conversion.quantity_basis,
            "commercial_effective_at": conversion.commercial_effective_at.isoformat(),
            "approver": conversion.approver,
        },
    )
    return conversion


@billing_router.get(
    "/evaluations/{org_id}/conversions",
    response_model=ConversionListResponse,
    summary="List conversion history for an organization (read-only audit trail)",
)
def list_conversions(
    org_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_billing_viewer),
):
    _check_org_scope(current_user, org_id)
    conversions = service.get_conversions(db, org_id)
    return ConversionListResponse(list=conversions, total=len(conversions))


# ── Subscription endpoints ────────────────────────────────────────────────────

@billing_router.get(
    "/subscriptions/{org_id}",
    response_model=SubscriptionResponse,
    summary="Current subscription for an organization",
)
def get_subscription(
    org_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_billing_viewer),
):
    _check_org_scope(current_user, org_id)
    subscription = service.get_or_create_subscription(db, org_id)
    return subscription


@billing_router.post(
    "/subscriptions/{org_id}/upgrade",
    response_model=SubscriptionResponse,
    summary="Immediate subscription upgrade (proration stub)",
)
def upgrade_subscription(
    org_id: int,
    data: UpgradeRequest,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_billing_owner),
):
    _check_org_scope(current_user, org_id)
    subscription = service.upgrade_subscription(
        db,
        organization_id=org_id,
        plan_id=data.plan_id,
        billing_cycle=data.billing_cycle,
        effective_at=data.effective_at,
    )

    service.log_billing_audit(
        db,
        actor=current_user,
        organization_id=org_id,
        action=BillingAuditAction.SUBSCRIPTION_UPGRADED,
        entity_type="BillingSubscription",
        entity_id=subscription.id,
        before=None,
        after={
            "plan_id": subscription.plan_id,
            "plan_code": service.role_value(subscription.plan_code) if subscription.plan_code else None,
            "billing_cycle": service.role_value(subscription.billing_cycle) if subscription.billing_cycle else None,
        },
    )
    return subscription


@billing_router.post(
    "/subscriptions/{org_id}/downgrade-dry-run",
    response_model=DowngradeDryRunResponse,
    summary="Dry-run eligibility check for downgrade",
)
def downgrade_dry_run(
    org_id: int,
    data: DowngradeRequest,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_billing_owner),
):
    _check_org_scope(current_user, org_id)
    return service.downgrade_subscription_dry_run(db, org_id, data.plan_id)


@billing_router.post(
    "/subscriptions/{org_id}/downgrade",
    response_model=SubscriptionResponse,
    summary="Schedule downgrade (effective at renewal_anchor_date)",
)
def downgrade_subscription(
    org_id: int,
    data: DowngradeRequest,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_billing_owner),
):
    _check_org_scope(current_user, org_id)
    subscription = service.schedule_downgrade(
        db,
        organization_id=org_id,
        plan_id=data.plan_id,
        billing_cycle=data.billing_cycle,
        effective_at=data.effective_at,
    )

    service.log_billing_audit(
        db,
        actor=current_user,
        organization_id=org_id,
        action=BillingAuditAction.SUBSCRIPTION_DOWNGRADED,
        entity_type="BillingSubscription",
        entity_id=subscription.id,
        before=None,
        after={
            "plan_id": subscription.plan_id,
            "plan_code": service.role_value(subscription.plan_code) if subscription.plan_code else None,
            "renewal_anchor_date": subscription.renewal_anchor_date.isoformat() if subscription.renewal_anchor_date else None,
        },
    )
    return subscription


@billing_router.post(
    "/subscriptions/{org_id}/cancel",
    response_model=SubscriptionResponse,
    summary="Schedule cancellation (no immediate data purge)",
)
def cancel_subscription(
    org_id: int,
    data: CancelRequest,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_billing_owner),
):
    _check_org_scope(current_user, org_id)
    subscription = service.cancel_subscription(
        db,
        organization_id=org_id,
        reason=data.reason,
        effective_at=data.effective_at,
    )

    service.log_billing_audit(
        db,
        actor=current_user,
        organization_id=org_id,
        action=BillingAuditAction.SUBSCRIPTION_CANCELED,
        entity_type="BillingSubscription",
        entity_id=subscription.id,
        before={"status": "active"},
        after={"status": "cancel_at_period_end"},
        reason=data.reason,
    )
    return subscription


# ── Discount endpoints ────────────────────────────────────────────────────────

@billing_router.get(
    "/discounts",
    response_model=DiscountListResponse,
    summary="List discounts (Super Admin: all; scoped by org_id param)",
)
def list_discounts(
    organization_id: int = Query(None, alias="organization_id"),
    db: Session = Depends(get_db),
    current_user=Depends(get_current_billing_admin),
):
    role = _get_billing_role(current_user)
    _check_billing_permission(role, "view_discounts")
    org_id = organization_id
    if role != "super_admin" and org_id is None:
        org_id = getattr(current_user, "organization_id", None)
    discounts = service.get_discounts(db, organization_id=org_id)
    return DiscountListResponse(list=discounts, total=len(discounts))


@billing_router.post(
    "/discounts",
    response_model=DiscountResponse,
    summary="Create a discount (Super Admin / Billing Admin only)",
)
def create_discount(
    data: DiscountCreateRequest,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_billing_admin),
):
    role = _get_billing_role(current_user)
    _check_billing_permission(role, "manage_discounts")
    _check_org_scope(current_user, data.organization_id)

    discount = service.create_discount(
        db,
        organization_id=data.organization_id,
        campaign_or_contract_id=data.campaign_or_contract_id,
        approver=data.approver,
        package_eligibility=data.package_eligibility,
        currency=data.currency,
        effective_start=data.effective_start,
        effective_end=data.effective_end,
        is_stackable=data.is_stackable,
    )

    service.log_billing_audit(
        db,
        actor=current_user,
        organization_id=data.organization_id,
        action=BillingAuditAction.DISCOUNT_CREATED,
        entity_type="BillingDiscount",
        entity_id=discount.id,
        before=None,
        after={
            "campaign_or_contract_id": discount.campaign_or_contract_id,
            "approver": discount.approver,
            "is_stackable": discount.is_stackable,
        },
    )
    return discount
