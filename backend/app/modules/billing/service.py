"""
modules/billing/service.py
----------------------------
Business logic for the billing foundation + lifecycle phase: subscription lookup,
billable-workforce classification/snapshotting, entitlement snapshot,
plan catalog management, evaluations, conversions, subscription changes,
discounts, and billing audit logging.

The workforce classification rules below implement Section 4 (A1-A10) of
ZHR-COM-BILL-001 as a *read-derived* first pass: they classify each Employee
against today's HR employment status rather than an event-sourced lifecycle
ledger (Section 22), which is a later phase. `CATALOG_VERSION_DRAFT` marks
every artifact produced here as pending the real approved catalog (Section 3).
"""

from datetime import datetime, timedelta, timezone
from typing import Optional

from sqlalchemy.orm import Session

from app.core.exceptions import (
    BadRequestException,
    NotFoundException,
)
from app.modules.employee.models import Employee, EmployeeStatus, EmploymentType
from app.modules.billing.models import (
    BillingAuditAction,
    BillingAuditLog,
    BillingConversion,
    BillingCycle,
    BillingDiscount,
    BillingPlan,
    BillingSubscription,
    BillingWorkerState,
    BillableWorkforceSnapshot,
    BillingClassification,
    DataClassification,
    EvaluationStatus,
    OrganizationEvaluation,
    PlanCode,
    SubscriptionStatus,
    WorkerCommercialCategory,
    WorkerCommercialState,
)

CATALOG_VERSION_DRAFT = "ZHR-COM-BILL-001-v1-draft"
INCLUSION_RULE_VERSION_DRAFT = "v1-draft"

# Back-billing tolerance: 15 minutes (Section 17)
BACK_BILLING_TOLERANCE = timedelta(minutes=15)

# Section 4/A4: employment has ended -> stop future billable quantity.
_TERMINAL_STATUSES = {
    EmployeeStatus.TERMINATED,
    EmployeeStatus.RESIGNED,
    EmployeeStatus.DEACTIVATED,
    EmployeeStatus.ARCHIVED,
}

# Section 4/A3: leave and access-level restrictions (suspended/locked) do not
# end the employment relationship, so they stay billable by default.
_ACTIVE_BILLABLE_STATUSES = {
    EmployeeStatus.ACTIVE,
    EmployeeStatus.ON_LEAVE,
    EmployeeStatus.SUSPENDED,
    EmployeeStatus.LOCKED,
    EmployeeStatus.PASSWORD_RESET_REQUIRED,
}

# Section 4/A6: only approved worker categories are billable by default;
# anything else (contractor/intern/unclassified) defaults to review rather
# than being auto-charged.
_STANDARD_EMPLOYMENT_TYPES = {
    EmploymentType.FULL_TIME,
    EmploymentType.PART_TIME,
    EmploymentType.PROBATION,
}


def role_value(role) -> str:
    return role.value if hasattr(role, "value") else str(role)


# ── Workforce classification ──────────────────────────────────────────────────

def classify_employee(employee: Employee) -> tuple[WorkerCommercialState, WorkerCommercialCategory]:
    """Derive (commercial_state, worker_commercial_category) from today's HR
    employment fields. Conservative by design: anything ambiguous resolves to
    PENDING_REVIEW / EXCLUDED_NON_BILLABLE rather than being auto-billed."""
    if employee.employment_type == EmploymentType.CONTRACT:
        category = WorkerCommercialCategory.CONTRACTOR
    elif employee.employment_type == EmploymentType.INTERN:
        category = WorkerCommercialCategory.INTERN
    elif employee.employment_type in _STANDARD_EMPLOYMENT_TYPES:
        category = WorkerCommercialCategory.EMPLOYEE
    else:
        category = WorkerCommercialCategory.OTHER_NON_EMPLOYEE

    if employee.status in _TERMINAL_STATUSES:
        state = WorkerCommercialState.FORMER_NON_BILLABLE
    elif employee.status in _ACTIVE_BILLABLE_STATUSES:
        state = (
            WorkerCommercialState.ACTIVE_BILLABLE
            if category == WorkerCommercialCategory.EMPLOYEE
            else WorkerCommercialState.EXCLUDED_NON_BILLABLE
        )
    else:
        state = WorkerCommercialState.PENDING_REVIEW

    return state, category


# ── Subscription helpers ──────────────────────────────────────────────────────

def get_or_create_subscription(db: Session, organization_id: int) -> BillingSubscription:
    subscription = (
        db.query(BillingSubscription)
        .filter(BillingSubscription.organization_id == organization_id)
        .first()
    )
    if subscription:
        return subscription

    from app.modules.hr.models import Organization

    if not db.query(Organization).filter(Organization.id == organization_id).first():
        raise NotFoundException("Organization", organization_id)

    subscription = BillingSubscription(
        organization_id=organization_id,
        billing_classification=BillingClassification.INTERNAL,
        status=SubscriptionStatus.EVALUATION,
    )
    db.add(subscription)
    db.commit()
    db.refresh(subscription)
    return subscription


def clear_delinquency_restriction(db: Session, organization_id: int) -> bool:
    """Return True when a recovered delinquency may be lifted (no other
    suspension/restriction reason exists), so PAYMENT_RECOVERED can restore
    the subscription to ACTIVE automatically (Section 22).

    This is the single place that decides whether restoration is safe. If a
    future suspension/restriction source (platform suspend, enterprise hold,
    legal block) is introduced, it must be added here so recovery respects it.
    """
    from app.modules.hr.models import Organization, OrganizationStatus

    org = db.query(Organization).filter(Organization.id == organization_id).first()
    if org is None:
        return False
    if org.status in (OrganizationStatus.SUSPENDED, OrganizationStatus.DEACTIVATED, OrganizationStatus.ON_HOLD):
        return False
    return True


def to_overview_response(db: Session, subscription: BillingSubscription, trimmed: bool) -> dict:
    """Full response for Organization Owner / Billing Admin. Trimmed response
    for HR Admin / Organization Admin exposes plan + workforce usage only,
    per Section 19's 'no financial detail by default' rule."""
    plan_name = None
    if subscription.plan_id:
        plan = db.query(BillingPlan).filter(BillingPlan.id == subscription.plan_id).first()
        if plan:
            plan_name = plan.name

    if trimmed:
        return {
            "organization_id": subscription.organization_id,
            "billing_classification": None,
            "status": None,
            "billing_channel": None,
            "plan_id": None,
            "plan_code": role_value(subscription.plan_code) if subscription.plan_code else None,
            "plan_name": plan_name,
            "price_catalog_version": None,
            "billing_metric": role_value(subscription.billing_metric) if subscription.billing_metric else None,
            "quantity": subscription.quantity,
            "committed_quantity": None,
            "service_start_at": None,
        }
    return {
        "organization_id": subscription.organization_id,
        "billing_classification": role_value(subscription.billing_classification),
        "status": role_value(subscription.status),
        "billing_channel": role_value(subscription.billing_channel) if subscription.billing_channel else None,
        "plan_id": subscription.plan_id,
        "plan_code": role_value(subscription.plan_code) if subscription.plan_code else None,
        "plan_name": plan_name,
        "price_catalog_version": subscription.price_catalog_version,
        "billing_metric": role_value(subscription.billing_metric) if subscription.billing_metric else None,
        "quantity": subscription.quantity,
        "committed_quantity": subscription.committed_quantity,
        "service_start_at": subscription.service_start_at,
    }


# ── Workforce snapshot ────────────────────────────────────────────────────────

def recompute_billable_workforce_snapshot(db: Session, organization_id: int) -> BillableWorkforceSnapshot:
    from app.modules.hr.models import Organization

    if not db.query(Organization).filter(Organization.id == organization_id).first():
        raise NotFoundException("Organization", organization_id)

    employees = db.query(Employee).filter(Employee.organization_id == organization_id).all()

    billable_count = 0
    for employee in employees:
        state, category = classify_employee(employee)
        if state == WorkerCommercialState.ACTIVE_BILLABLE:
            billable_count += 1

        worker_state = (
            db.query(BillingWorkerState)
            .filter(BillingWorkerState.employee_id == employee.id)
            .first()
        )
        if worker_state is None:
            worker_state = BillingWorkerState(
                employee_id=employee.id,
                organization_id=organization_id,
                billing_inclusion_rule_version=INCLUSION_RULE_VERSION_DRAFT,
            )
            db.add(worker_state)

        worker_state.commercial_state = state
        worker_state.worker_commercial_category = category
        worker_state.updated_at = datetime.utcnow()

    snapshot = BillableWorkforceSnapshot(
        organization_id=organization_id,
        quantity=billable_count,
        catalog_version=CATALOG_VERSION_DRAFT,
        reconciliation_status="derived_from_hr_state",
    )
    db.add(snapshot)

    subscription = get_or_create_subscription(db, organization_id)
    subscription.quantity = billable_count

    db.commit()
    db.refresh(snapshot)
    return snapshot


def get_latest_workforce_snapshot(db: Session, organization_id: int) -> BillableWorkforceSnapshot:
    snapshot = (
        db.query(BillableWorkforceSnapshot)
        .filter(BillableWorkforceSnapshot.organization_id == organization_id)
        .order_by(BillableWorkforceSnapshot.snapshot_at.desc())
        .first()
    )
    if snapshot is None:
        snapshot = recompute_billable_workforce_snapshot(db, organization_id)
    return snapshot


def get_worker_states(db: Session, organization_id: int) -> list[BillingWorkerState]:
    return (
        db.query(BillingWorkerState)
        .filter(BillingWorkerState.organization_id == organization_id)
        .all()
    )


# ── Plan catalog ──────────────────────────────────────────────────────────────

def get_plans(db: Session, active_only: bool = False) -> list[BillingPlan]:
    q = db.query(BillingPlan).order_by(BillingPlan.code, BillingPlan.catalog_version.desc())
    if active_only:
        q = q.filter(BillingPlan.is_active == True)
    return q.all()


def get_plan_by_id(db: Session, plan_id: int) -> BillingPlan:
    plan = db.query(BillingPlan).filter(BillingPlan.id == plan_id).first()
    if not plan:
        raise NotFoundException("BillingPlan", plan_id)
    return plan


def is_plan_catalog_version_referenced(db: Session, catalog_version: str) -> bool:
    """Check if any billing_conversion references this catalog version."""
    return db.query(BillingConversion).filter(
        BillingConversion.catalog_version == catalog_version
    ).first() is not None


def plan_to_dict(plan: BillingPlan) -> dict:
    return {
        "id": plan.id,
        "code": role_value(plan.code),
        "name": plan.name,
        "catalog_version": plan.catalog_version,
        "billing_metric": role_value(plan.billing_metric),
        "is_active": plan.is_active,
        "is_contract_priced": plan.is_contract_priced,
        "is_self_serve_enabled": plan.is_self_serve_enabled,
        "is_published": plan.published_at is not None,
        "monthly_price": float(plan.monthly_price) if plan.monthly_price is not None else None,
        "annual_price": float(plan.annual_price) if plan.annual_price is not None else None,
        "currency": plan.currency,
        "description": plan.description,
        "tax_category": role_value(plan.tax_category) if plan.tax_category else None,
        "stripe_product_id": plan.stripe_product_id,
        "stripe_monthly_price_id": plan.stripe_monthly_price_id,
        "stripe_annual_price_id": plan.stripe_annual_price_id,
        "published_at": plan.published_at.isoformat() if plan.published_at else None,
        "created_at": plan.created_at.isoformat() if plan.created_at else None,
        "updated_at": plan.updated_at.isoformat() if plan.updated_at else None,
    }


# ── Evaluations ───────────────────────────────────────────────────────────────

def start_evaluation(
    db: Session,
    organization_id: int,
    evaluation_ends_at: datetime,
    approved_package_scope: Optional[str] = None,
    data_classification: DataClassification = DataClassification.SYNTHETIC,
    conversion_owner: Optional[str] = None,
) -> OrganizationEvaluation:
    from app.modules.hr.models import Organization

    if not db.query(Organization).filter(Organization.id == organization_id).first():
        raise NotFoundException("Organization", organization_id)

    # Check for existing active evaluation
    existing = (
        db.query(OrganizationEvaluation)
        .filter(
            OrganizationEvaluation.organization_id == organization_id,
            OrganizationEvaluation.status == EvaluationStatus.ACTIVE,
        )
        .first()
    )
    if existing:
        raise BadRequestException("Organization already has an active evaluation.")

    evaluation = OrganizationEvaluation(
        organization_id=organization_id,
        evaluation_ends_at=evaluation_ends_at,
        approved_package_scope=approved_package_scope,
        data_classification=data_classification,
        conversion_owner=conversion_owner,
        status=EvaluationStatus.ACTIVE,
    )
    db.add(evaluation)

    # Update subscription classification
    subscription = get_or_create_subscription(db, organization_id)
    subscription.billing_classification = BillingClassification.EVALUATION
    subscription.status = SubscriptionStatus.EVALUATION

    db.commit()
    db.refresh(evaluation)
    return evaluation


def get_evaluation(db: Session, evaluation_id: int) -> OrganizationEvaluation:
    evaluation = db.query(OrganizationEvaluation).filter(
        OrganizationEvaluation.id == evaluation_id
    ).first()
    if not evaluation:
        raise NotFoundException("OrganizationEvaluation", evaluation_id)
    return evaluation


def get_org_evaluations(db: Session, organization_id: int) -> list[OrganizationEvaluation]:
    return (
        db.query(OrganizationEvaluation)
        .filter(OrganizationEvaluation.organization_id == organization_id)
        .order_by(OrganizationEvaluation.created_at.desc())
        .all()
    )


def end_evaluation(db: Session, evaluation_id: int) -> OrganizationEvaluation:
    evaluation = get_evaluation(db, evaluation_id)
    if evaluation.status != EvaluationStatus.ACTIVE:
        raise BadRequestException("Evaluation is not active.")

    evaluation.status = EvaluationStatus.EVALUATION_ENDED
    db.commit()
    db.refresh(evaluation)
    return evaluation


# ── Conversion ────────────────────────────────────────────────────────────────

def convert_evaluation(
    db: Session,
    evaluation_id: int,
    plan_id: int,
    billing_cycle: BillingCycle,
    quantity_basis: str,
    commercial_effective_at: datetime,
    approver: str,
    order_form_reference: Optional[str] = None,
    implementation_sow_reference: Optional[str] = None,
    signed_agreement_reference: Optional[str] = None,
) -> BillingConversion:
    evaluation = get_evaluation(db, evaluation_id)
    if evaluation.status != EvaluationStatus.ACTIVE:
        raise BadRequestException("Evaluation is not active.")

    plan = get_plan_by_id(db, plan_id)

    # Back-billing rejection (Section 17): reject if commercial_effective_at
    # is earlier than now minus tolerance, unless signed agreement provided.
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    if commercial_effective_at < (now - BACK_BILLING_TOLERANCE):
        if not signed_agreement_reference:
            raise BadRequestException(
                "commercial_effective_at is before the allowed window. "
                "Provide a signed_agreement_reference to allow back-dating."
            )

    # Enterprise-only requirements: order_form_reference required when
    # is_contract_priced or committed_quantity is set.
    if plan.is_contract_priced:
        if not order_form_reference:
            raise BadRequestException(
                "order_form_reference is required for contract-priced plans."
            )

    subscription = get_or_create_subscription(db, evaluation.organization_id)

    if subscription.committed_quantity and not order_form_reference:
        raise BadRequestException(
            "order_form_reference is required when committed_quantity is set."
        )

    # Write immutable billing_conversion record
    conversion = BillingConversion(
        organization_id=evaluation.organization_id,
        evaluation_id=evaluation.id,
        catalog_version=plan.catalog_version,
        quantity_basis=quantity_basis,
        commercial_effective_at=commercial_effective_at,
        approver=approver,
        order_form_reference=order_form_reference,
        implementation_sow_reference=implementation_sow_reference,
        signed_agreement_reference=signed_agreement_reference,
    )
    db.add(conversion)
    db.flush()

    # Update evaluation status
    evaluation.status = EvaluationStatus.CONVERTED

    # Update subscription to commercial
    subscription.plan_id = plan.id
    subscription.plan_code = plan.code
    subscription.billing_cycle = billing_cycle
    subscription.billing_metric = plan.billing_metric
    subscription.price_catalog_version = plan.catalog_version
    subscription.billing_classification = BillingClassification.COMMERCIAL
    subscription.status = SubscriptionStatus.ACTIVE
    subscription.commercial_effective_at = commercial_effective_at
    if subscription.service_start_at is None:
        subscription.service_start_at = commercial_effective_at
    subscription.renewal_anchor_date = commercial_effective_at

    db.commit()
    db.refresh(conversion)
    return conversion


def get_conversions(db: Session, organization_id: int) -> list[BillingConversion]:
    return (
        db.query(BillingConversion)
        .filter(BillingConversion.organization_id == organization_id)
        .order_by(BillingConversion.created_at.desc())
        .all()
    )


# ── Subscription management ───────────────────────────────────────────────────

def upgrade_subscription(
    db: Session,
    organization_id: int,
    plan_id: int,
    billing_cycle: BillingCycle,
    effective_at: Optional[datetime] = None,
) -> BillingSubscription:
    subscription = get_or_create_subscription(db, organization_id)
    plan = get_plan_by_id(db, plan_id)

    before_plan_id = subscription.plan_id
    before_plan_code = role_value(subscription.plan_code) if subscription.plan_code else None

    subscription.plan_id = plan.id
    subscription.plan_code = plan.code
    subscription.billing_cycle = billing_cycle
    subscription.billing_metric = plan.billing_metric
    subscription.price_catalog_version = plan.catalog_version
    if effective_at:
        subscription.commercial_effective_at = effective_at

    # TODO: stub — proration calculation is a separate ticket (payment provider integration)
    db.commit()
    db.refresh(subscription)
    return subscription


def downgrade_subscription_dry_run(
    db: Session,
    organization_id: int,
    plan_id: int,
) -> dict:
    """Eligibility check for downgrade. Returns blockers list."""
    # TODO: stub — real conflict detection (SSO/retention/integration) is a separate ticket
    blockers = []
    return {"eligible": len(blockers) == 0, "blockers": blockers}


def schedule_downgrade(
    db: Session,
    organization_id: int,
    plan_id: int,
    billing_cycle: BillingCycle,
    effective_at: Optional[datetime] = None,
) -> BillingSubscription:
    subscription = get_or_create_subscription(db, organization_id)
    plan = get_plan_by_id(db, plan_id)

    # Downgrade only takes effect at renewal_anchor_date, never immediate
    target_date = effective_at or subscription.renewal_anchor_date
    if not target_date:
        target_date = datetime.now(timezone.utc).replace(tzinfo=None) + timedelta(days=30)

    subscription.plan_id = plan.id
    subscription.plan_code = plan.code
    subscription.billing_cycle = billing_cycle
    subscription.billing_metric = plan.billing_metric
    subscription.price_catalog_version = plan.catalog_version
    subscription.renewal_anchor_date = target_date

    # TODO: stub — eligibility conflict detection (SSO/retention/integration)
    db.commit()
    db.refresh(subscription)
    return subscription


def cancel_subscription(
    db: Session,
    organization_id: int,
    reason: Optional[str] = None,
    effective_at: Optional[datetime] = None,
) -> BillingSubscription:
    subscription = get_or_create_subscription(db, organization_id)
    subscription.status = SubscriptionStatus.CANCEL_AT_PERIOD_END

    # Data retention: do NOT delete data (Section 13/20)
    # TODO: stub — cancellation date handling for data retention
    db.commit()
    db.refresh(subscription)
    return subscription


# ── Discounts ─────────────────────────────────────────────────────────────────

def create_discount(
    db: Session,
    organization_id: int,
    campaign_or_contract_id: str,
    approver: str,
    package_eligibility: Optional[str] = None,
    currency: Optional[str] = "USD",
    effective_start: datetime = None,
    effective_end: Optional[datetime] = None,
    is_stackable: bool = False,
) -> BillingDiscount:
    if not effective_start:
        effective_start = datetime.now(timezone.utc).replace(tzinfo=None)

    # Stackability check: if not stackable, reject if overlapping non-stackable exists
    if not is_stackable:
        overlapping = (
            db.query(BillingDiscount)
            .filter(
                BillingDiscount.organization_id == organization_id,
                BillingDiscount.is_stackable == False,
                BillingDiscount.effective_start <= (effective_end or datetime.max.replace(tzinfo=None)),
                (BillingDiscount.effective_end == None) | (BillingDiscount.effective_end >= effective_start),
            )
            .first()
        )
        if overlapping:
            raise BadRequestException(
                "Cannot add non-stackable discount: overlapping non-stackable discount already exists"
            )

    discount = BillingDiscount(
        organization_id=organization_id,
        campaign_or_contract_id=campaign_or_contract_id,
        approver=approver,
        package_eligibility=package_eligibility,
        currency=currency,
        effective_start=effective_start,
        effective_end=effective_end,
        is_stackable=is_stackable,
    )
    db.add(discount)
    db.commit()
    db.refresh(discount)
    return discount


def get_discounts(db: Session, organization_id: Optional[int] = None) -> list[BillingDiscount]:
    q = db.query(BillingDiscount).order_by(BillingDiscount.created_at.desc())
    if organization_id:
        q = q.filter(BillingDiscount.organization_id == organization_id)
    return q.all()


# ── Billing audit logging ─────────────────────────────────────────────────────

def log_billing_audit(
    db: Session,
    actor,
    organization_id: int,
    action: BillingAuditAction,
    entity_type: str,
    entity_id: Optional[int],
    before: Optional[dict],
    after: Optional[dict],
    reason: Optional[str] = None,
    source: Optional[str] = None,
    stripe_event_id: Optional[str] = None,
) -> BillingAuditLog:
    log = BillingAuditLog(
        organization_id=organization_id,
        action=action,
        entity_type=entity_type,
        entity_id=entity_id,
        actor_id=getattr(actor, "id", None),
        actor_email=getattr(actor, "email", None),
        before=before,
        after=after,
        reason=reason,
        source=source,
        stripe_event_id=stripe_event_id,
    )
    db.add(log)
    db.commit()
    db.refresh(log)
    return log


def get_audit_logs(db: Session, organization_id: int) -> list[BillingAuditLog]:
    return (
        db.query(BillingAuditLog)
        .filter(BillingAuditLog.organization_id == organization_id)
        .order_by(BillingAuditLog.created_at.desc())
        .all()
    )


# ── Backfill: plan_code string → plan_id FK ──────────────────────────────────

def backfill_plan_ids(db: Session) -> int:
    """Map existing billing_subscriptions.plan_code string to plan_id FK.
    Returns count of updated rows."""
    subscriptions = db.query(BillingSubscription).filter(
        BillingSubscription.plan_id == None,
        BillingSubscription.plan_code != None,
    ).all()

    count = 0
    for sub in subscriptions:
        plan = (
            db.query(BillingPlan)
            .filter(BillingPlan.code == sub.plan_code)
            .order_by(BillingPlan.catalog_version.desc())
            .first()
        )
        if plan:
            sub.plan_id = plan.id
            count += 1

    if count:
        db.commit()
    return count
