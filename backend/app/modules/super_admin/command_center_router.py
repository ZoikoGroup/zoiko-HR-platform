"""
modules/super_admin/command_center_router.py
-----------------------------------------------
Platform Command Center endpoints. Everything here is computed live from
real rows (Organization, Employee, BillingSubscription, AuditLog,
LoginActivity, SecurityEvent, SupportTicket, ...) except for the three
purpose-built tables in command_center_models.py: admin-maintained service
health, an admin-logged incident trail, and a daily platform snapshot used
for KPI sparklines/trend charts. No number here is ever fabricated — where
a real source doesn't exist yet (MFA coverage, policy violations, payment-
gateway failures), the corresponding widget is simply absent from the
frontend rather than backed by an endpoint here.
"""

from datetime import date as date_cls, datetime, timedelta

from fastapi import APIRouter, Depends
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.database import get_db
from app.core.dependencies import get_current_super_admin
from app.core.exceptions import BadRequestException, NotFoundException

from app.modules.super_admin.command_center_models import (
    PlatformServiceHealth, PlatformIncident, PlatformDailySnapshot,
    ServiceHealthStatus, IncidentSeverity, IncidentStatus,
)
from app.modules.super_admin.command_center_schemas import (
    KpiSeries, KpiTile, OverviewResponse,
    AttentionItem, AttentionResponse,
    AtRiskOrg, CustomerHealthResponse,
    CommercialTrendPoint, CommercialHealthResponse,
    LifecycleResponse,
    ServiceHealthItem, ServiceHealthUpdate,
    SecurityResponse,
    IncidentItem, IncidentCreate,
)

router = APIRouter(prefix="/super-admin/command-center", tags=["Super Admin / Command Center"])

_SERVICE_DEFAULTS = [
    ("authentication", "Authentication"),
    ("hr_core", "HR Core"),
    ("workflow_engine", "Workflow Engine"),
    ("notifications", "Notifications"),
    ("integrations", "Integrations"),
]


# ═══════════════════════════════════════════════════════════════════════════════
# Shared helpers
# ═══════════════════════════════════════════════════════════════════════════════

def _seed_service_health(db: Session) -> None:
    if db.query(PlatformServiceHealth).first():
        return
    for name, display in _SERVICE_DEFAULTS:
        db.add(PlatformServiceHealth(service_name=name, display_name=display, status=ServiceHealthStatus.HEALTHY))
    db.commit()


def _compute_platform_totals(db: Session) -> dict:
    from app.modules.hr.models import Organization, OrganizationStatus
    from app.modules.employee.models import Employee, EmployeeStatus
    from app.modules.billing.models import BillingSubscription, BillingPlan, SubscriptionStatus, BillingCycle
    from app.modules.super_admin.models import LoginActivity

    orgs = db.query(Organization).all()
    total_organizations = len(orgs)
    active_organizations = sum(
        1 for o in orgs if o.status and o.status.value == OrganizationStatus.ACTIVE.value
    )
    total_workforce = db.query(Employee).filter(Employee.status == EmployeeStatus.ACTIVE).count()

    cutoff = datetime.utcnow() - timedelta(days=30)
    activated_org_ids = {
        row[0] for row in db.query(LoginActivity.organization_id)
        .filter(
            LoginActivity.status == "success",
            LoginActivity.created_at >= cutoff,
            LoginActivity.organization_id.isnot(None),
        )
        .distinct()
    }

    mrr_cents = 0
    subs = db.query(BillingSubscription).filter(
        BillingSubscription.status.in_([
            SubscriptionStatus.ACTIVE, SubscriptionStatus.PAST_DUE, SubscriptionStatus.RESTRICTED,
        ])
    ).all()
    if subs:
        plan_ids = {s.plan_id for s in subs if s.plan_id}
        plans = {p.id: p for p in db.query(BillingPlan).filter(BillingPlan.id.in_(plan_ids)).all()} if plan_ids else {}
        for s in subs:
            plan = plans.get(s.plan_id)
            if not plan or plan.monthly_price is None:
                continue
            qty = s.quantity or 1
            if s.billing_cycle == BillingCycle.ANNUAL and plan.annual_price:
                monthly = plan.annual_price / 12
            else:
                monthly = plan.monthly_price
            mrr_cents += int(monthly * 100 * qty)

    return {
        "total_organizations": total_organizations,
        "active_organizations": active_organizations,
        "total_workforce": total_workforce,
        "activated_organizations": len(activated_org_ids & {o.id for o in orgs}),
        "mrr_cents": mrr_cents,
    }


def _get_or_create_today_snapshot(db: Session) -> PlatformDailySnapshot:
    today = date_cls.today()
    snap = db.query(PlatformDailySnapshot).filter(PlatformDailySnapshot.snapshot_date == today).first()
    stats = _compute_platform_totals(db)
    if snap is None:
        snap = PlatformDailySnapshot(snapshot_date=today, **stats)
        db.add(snap)
    else:
        for key, value in stats.items():
            setattr(snap, key, value)
    db.commit()
    db.refresh(snap)
    return snap


def _compute_attention(db: Session) -> list[AttentionItem]:
    from app.modules.hr.models import Organization, OrganizationStatus
    from app.modules.billing.models import BillingSubscription, SubscriptionStatus
    from app.modules.super_admin.models import LoginActivity, SecurityEvent, SupportTicket

    items: list[AttentionItem] = []
    now = datetime.utcnow()
    org_names = {o.id: o.name for o in db.query(Organization).all()}

    cutoff = now - timedelta(hours=2)
    failed_rows = (
        db.query(LoginActivity.organization_id, func.count(LoginActivity.id))
        .filter(
            LoginActivity.status != "success",
            LoginActivity.created_at >= cutoff,
            LoginActivity.organization_id.isnot(None),
        )
        .group_by(LoginActivity.organization_id)
        .having(func.count(LoginActivity.id) >= 5)
        .all()
    )
    for org_id, count in failed_rows:
        items.append(AttentionItem(
            severity="critical",
            issue=f"{count} failed sign-ins in the last 2 hours",
            organization_id=org_id,
            organization_name=org_names.get(org_id),
            detected_at=now,
            action_label="Investigate",
            action_href=f"/super-admin/organizations/{org_id}",
        ))

    for s in db.query(BillingSubscription).filter(BillingSubscription.status == SubscriptionStatus.PAST_DUE).all():
        items.append(AttentionItem(
            severity="high",
            issue="Subscription payment past due",
            organization_id=s.organization_id,
            organization_name=org_names.get(s.organization_id),
            action_label="Review",
            action_href=f"/super-admin/organizations/{s.organization_id}",
        ))

    # Delinquency lifecycle anomalies (Section 10 G1-G5) surfaced to command
    # center so escalation is not banner-dependent.
    from app.modules.billing.models import DelinquencyCase, DelinquencyCaseStatus

    _STAGE_SEVERITY = {"DAY_45_TERMINATION": "critical", "DAY_20_RESTRICT": "high", "DAY_10_RESTRICT": "high", "RECOVERY": "medium"}
    for case in db.query(DelinquencyCase).filter(
        DelinquencyCase.status == DelinquencyCaseStatus.OPEN
    ).all():
        stage = case.stage.value if case.stage else "recovery"
        days = max(0, int((now - case.failed_at).total_seconds() // 86400)) if case.failed_at else 0
        items.append(AttentionItem(
            severity=_STAGE_SEVERITY.get(stage, "high"),
            issue=f"Delinquency escalation: {days}d unpaid, stage {stage}",
            organization_id=case.organization_id,
            organization_name=org_names.get(case.organization_id),
            detected_at=case.failed_at,
            action_label="Review",
            action_href=f"/super-admin/organizations/{case.organization_id}",
        ))

    # Active Billing Operations support-access grants — surface for review so
    # time-bounded access is visible and auditable.
    from app.modules.billing.models import SupportAccessGrant

    for g in db.query(SupportAccessGrant).filter(SupportAccessGrant.revoked_at.is_(None)).all():
        items.append(AttentionItem(
            severity="low",
            issue="Active support-access grant (expires)",
            organization_id=g.organization_id,
            organization_name=org_names.get(g.organization_id),
            detected_at=g.expires_at,
            action_label="Review",
            action_href=f"/super-admin/organizations/{g.organization_id}",
        ))

    for t in db.query(SupportTicket).filter(
        SupportTicket.priority.in_(["urgent", "high"]), SupportTicket.status == "open"
    ).all():
        items.append(AttentionItem(
            severity="high" if t.priority == "urgent" else "medium",
            issue=t.subject,
            organization_id=t.organization_id,
            organization_name=org_names.get(t.organization_id),
            detected_at=t.created_at,
            action_label="Review",
            action_href=f"/super-admin/organizations/{t.organization_id}",
        ))

    for e in db.query(SecurityEvent).filter(
        SecurityEvent.is_resolved == False,  # noqa: E712
        SecurityEvent.severity.in_(["critical", "high"]),
    ).all():
        items.append(AttentionItem(
            severity=e.severity,
            issue=e.description or e.event_type,
            organization_id=e.organization_id,
            organization_name=org_names.get(e.organization_id) if e.organization_id else None,
            detected_at=e.created_at,
            action_label="Investigate",
            action_href=f"/super-admin/organizations/{e.organization_id}" if e.organization_id else None,
        ))

    for o in db.query(Organization).filter(Organization.status == OrganizationStatus.ON_HOLD).all():
        items.append(AttentionItem(
            severity="medium",
            issue="Organization on hold",
            organization_id=o.id,
            organization_name=o.name,
            detected_at=o.on_hold_at,
            action_label="Review",
            action_href=f"/super-admin/organizations/{o.id}",
        ))

    severity_order = {"critical": 0, "high": 1, "medium": 2, "low": 3}
    items.sort(key=lambda i: severity_order.get(i.severity, 4))
    return items


# ═══════════════════════════════════════════════════════════════════════════════
# Overview
# ═══════════════════════════════════════════════════════════════════════════════

@router.get("/overview", response_model=OverviewResponse, summary="Command Center KPI overview")
def command_center_overview(days: int = 30, db: Session = Depends(get_db), _=Depends(get_current_super_admin)):
    from app.modules.billing.models import BillingPlan

    _seed_service_health(db)
    today_snap = _get_or_create_today_snapshot(db)

    start = date_cls.today() - timedelta(days=days)
    rows = db.query(PlatformDailySnapshot).filter(
        PlatformDailySnapshot.snapshot_date >= start
    ).order_by(PlatformDailySnapshot.snapshot_date).all()
    if not rows:
        rows = [today_snap]

    def _series(attr):
        return KpiSeries(dates=[r.snapshot_date for r in rows], values=[float(getattr(r, attr) or 0) for r in rows])

    def _delta_pct(attr):
        if len(rows) < 2:
            return None
        first = getattr(rows[0], attr) or 0
        last = getattr(rows[-1], attr) or 0
        if not first:
            return None
        return round((last - first) / first * 100, 1)

    activation_values = [
        (r.activated_organizations / r.total_organizations * 100) if r.total_organizations else 0.0
        for r in rows
    ]
    activation_delta = None
    if len(activation_values) >= 2 and activation_values[0]:
        activation_delta = round((activation_values[-1] - activation_values[0]) / activation_values[0] * 100, 1)

    health_rows = db.query(PlatformServiceHealth).all()
    recorded = [float(h.availability_pct) for h in health_rows if h.availability_pct is not None]
    reliability = round(sum(recorded) / len(recorded), 2) if recorded else None

    worst = "healthy"
    for h in health_rows:
        if h.status == ServiceHealthStatus.DOWN:
            worst = "down"
            break
        if h.status == ServiceHealthStatus.WARNING:
            worst = "warning"
    banner_status = {"healthy": "operational", "warning": "degraded", "down": "outage"}[worst]

    active_p1 = db.query(PlatformIncident).filter(
        PlatformIncident.severity == IncidentSeverity.CRITICAL,
        PlatformIncident.status != IncidentStatus.RESOLVED,
    ).count()

    attention = _compute_attention(db)
    critical_attention_count = sum(1 for a in attention if a.severity in ("critical", "high"))

    pricing_configured = db.query(BillingPlan).filter(BillingPlan.monthly_price.isnot(None)).first() is not None

    return OverviewResponse(
        period_days=days,
        active_organizations=KpiTile(
            value=today_snap.active_organizations, delta_pct=_delta_pct("active_organizations"),
            series=_series("active_organizations"),
        ),
        subscribed_workforce=KpiTile(
            value=today_snap.total_workforce, delta_pct=_delta_pct("total_workforce"),
            series=_series("total_workforce"),
        ),
        mrr_cents=KpiTile(
            value=today_snap.mrr_cents, delta_pct=_delta_pct("mrr_cents"),
            series=_series("mrr_cents"),
        ),
        activation_rate_pct=KpiTile(
            value=activation_values[-1], delta_pct=activation_delta,
            series=KpiSeries(dates=[r.snapshot_date for r in rows], values=activation_values),
        ),
        platform_reliability_pct=reliability,
        critical_attention_count=critical_attention_count,
        banner_status=banner_status,
        active_p1_incidents=active_p1,
        mrr_pricing_configured=pricing_configured,
    )


# ═══════════════════════════════════════════════════════════════════════════════
# Needs Your Attention
# ═══════════════════════════════════════════════════════════════════════════════

@router.get("/attention", response_model=AttentionResponse, summary="Needs Your Attention queue")
def command_center_attention(db: Session = Depends(get_db), _=Depends(get_current_super_admin)):
    return AttentionResponse(items=_compute_attention(db))


# ═══════════════════════════════════════════════════════════════════════════════
# Customer Health
# ═══════════════════════════════════════════════════════════════════════════════

@router.get("/customer-health", response_model=CustomerHealthResponse, summary="Customer health segmentation")
def customer_health(db: Session = Depends(get_db), _=Depends(get_current_super_admin)):
    from app.modules.hr.models import Organization
    from app.modules.billing.models import BillingSubscription, OrganizationEvaluation, EvaluationStatus
    from app.modules.super_admin.models import SecurityEvent, SupportTicket

    orgs = db.query(Organization).all()
    subs = {s.organization_id: s for s in db.query(BillingSubscription).all()}
    evals = {
        e.organization_id: e for e in db.query(OrganizationEvaluation)
        .filter(OrganizationEvaluation.status == EvaluationStatus.ACTIVE).all()
    }

    sec_counts = dict(
        db.query(SecurityEvent.organization_id, func.count(SecurityEvent.id))
        .filter(SecurityEvent.is_resolved == False, SecurityEvent.organization_id.isnot(None))  # noqa: E712
        .group_by(SecurityEvent.organization_id).all()
    )
    ticket_counts = dict(
        db.query(SupportTicket.organization_id, func.count(SupportTicket.id))
        .filter(SupportTicket.status == "open", SupportTicket.priority.in_(["urgent", "high"]))
        .group_by(SupportTicket.organization_id).all()
    )

    now = datetime.utcnow()
    results = []
    for o in orgs:
        if o.status and o.status.value in ("rejected", "deactivated"):
            continue
        score = 0
        reasons = []
        sub = subs.get(o.id)
        if sub and sub.status:
            if sub.status.value == "past_due":
                score += 35
                reasons.append("Subscription past due")
            elif sub.status.value in ("suspended", "restricted"):
                score += 45
                reasons.append("Subscription restricted/suspended")
            elif sub.status.value == "canceled":
                score += 60
                reasons.append("Subscription canceled")
        sec = sec_counts.get(o.id, 0)
        if sec:
            score += min(sec * 10, 30)
            reasons.append(f"{sec} unresolved security event(s)")
        tick = ticket_counts.get(o.id, 0)
        if tick:
            score += min(tick * 8, 24)
            reasons.append(f"{tick} open urgent ticket(s)")
        ev = evals.get(o.id)
        if ev and ev.evaluation_ends_at and ev.evaluation_ends_at < now:
            score += 20
            reasons.append("Evaluation expired without conversion")
        if o.status and o.status.value == "on_hold":
            score += 15
            reasons.append("Organization on hold")
        results.append((o, min(score, 100), reasons))

    healthy = sum(1 for _, s, _ in results if s < 30)
    watch = sum(1 for _, s, _ in results if 30 <= s < 60)
    at_risk = sum(1 for _, s, _ in results if s >= 60)

    top = sorted(results, key=lambda r: r[1], reverse=True)[:5]
    top_at_risk = [
        AtRiskOrg(organization_id=o.id, organization_name=o.name, risk_score=s, reasons=reasons)
        for o, s, reasons in top if s > 0
    ]

    return CustomerHealthResponse(healthy=healthy, watch=watch, at_risk=at_risk, top_at_risk=top_at_risk)


# ═══════════════════════════════════════════════════════════════════════════════
# Commercial Health
# ═══════════════════════════════════════════════════════════════════════════════

@router.get("/commercial-health", response_model=CommercialHealthResponse, summary="Commercial health & revenue trend")
def commercial_health(days: int = 30, db: Session = Depends(get_db), _=Depends(get_current_super_admin)):
    from app.modules.billing.models import (
        BillingSubscription, BillingPlan, SubscriptionStatus,
        BillableWorkforceSnapshot, BillingEntitlementSnapshot,
    )

    _get_or_create_today_snapshot(db)
    start = date_cls.today() - timedelta(days=days)
    rows = db.query(PlatformDailySnapshot).filter(
        PlatformDailySnapshot.snapshot_date >= start
    ).order_by(PlatformDailySnapshot.snapshot_date).all()
    trend = [CommercialTrendPoint(date=r.snapshot_date, mrr_cents=r.mrr_cents, workforce=r.total_workforce) for r in rows]

    pricing_configured = db.query(BillingPlan).filter(BillingPlan.monthly_price.isnot(None)).first() is not None
    plans = {p.id: p for p in db.query(BillingPlan).all()}
    subs_by_org = {s.organization_id: s for s in db.query(BillingSubscription).all()}

    revenue_next_30 = 0
    for s in subs_by_org.values():
        if s.status != SubscriptionStatus.ACTIVE:
            continue
        plan = plans.get(s.plan_id)
        if plan and plan.monthly_price:
            revenue_next_30 += int(plan.monthly_price * 100 * (s.quantity or 1))

    past_due_subs = [s for s in subs_by_org.values() if s.status == SubscriptionStatus.PAST_DUE]
    failed_cents = 0
    for s in past_due_subs:
        plan = plans.get(s.plan_id)
        if plan and plan.monthly_price:
            failed_cents += int(plan.monthly_price * 100 * (s.quantity or 1))

    latest_workforce_by_org = {}
    for snap in db.query(BillableWorkforceSnapshot).order_by(BillableWorkforceSnapshot.snapshot_at.desc()).all():
        latest_workforce_by_org.setdefault(snap.organization_id, snap)

    overage_cents = 0
    overage_orgs = 0
    for org_id, snap in latest_workforce_by_org.items():
        sub = subs_by_org.get(org_id)
        if not sub or sub.committed_quantity is None:
            continue
        overage = snap.quantity - sub.committed_quantity
        if overage > 0:
            overage_orgs += 1
            plan = plans.get(sub.plan_id)
            if plan and plan.monthly_price:
                overage_cents += int(plan.monthly_price * 100 * overage)

    latest_entitlement_by_org = {}
    for ent in db.query(BillingEntitlementSnapshot).order_by(BillingEntitlementSnapshot.computed_at.desc()).all():
        latest_entitlement_by_org.setdefault(ent.organization_id, ent)

    mismatch_count = 0
    for org_id, ent in latest_entitlement_by_org.items():
        sub = subs_by_org.get(org_id)
        if sub and ent.package and sub.plan_code and ent.package != sub.plan_code:
            mismatch_count += 1

    return CommercialHealthResponse(
        trend=trend,
        revenue_next_30_days_cents=revenue_next_30,
        failed_payments_cents=failed_cents,
        failed_payments_org_count=len(past_due_subs),
        plan_overages_cents=overage_cents,
        plan_overages_org_count=overage_orgs,
        entitlement_mismatch_count=mismatch_count,
        pricing_configured=pricing_configured,
    )


# ═══════════════════════════════════════════════════════════════════════════════
# Organization Lifecycle
# ═══════════════════════════════════════════════════════════════════════════════

@router.get("/lifecycle", response_model=LifecycleResponse, summary="Organization lifecycle funnel")
def lifecycle(db: Session = Depends(get_db), _=Depends(get_current_super_admin)):
    from app.modules.hr.models import Organization, OrganizationStatus
    from app.modules.employee.models import Employee, UserRole
    from app.modules.billing.models import BillingSubscription
    from app.modules.super_admin.models import LoginActivity

    orgs = db.query(Organization).all()
    created = len(orgs)
    provisioned = sum(1 for o in orgs if o.status and o.status.value != OrganizationStatus.PENDING.value)

    admin_org_ids = {
        row[0] for row in db.query(Employee.organization_id).filter(Employee.role == UserRole.ADMIN).distinct()
    }
    subscribed_org_ids = {row[0] for row in db.query(BillingSubscription.organization_id).distinct()}
    configured = sum(1 for o in orgs if o.id in admin_org_ids and o.id in subscribed_org_ids)

    activated = sum(1 for o in orgs if o.status and o.status.value == OrganizationStatus.ACTIVE.value)

    cutoff = datetime.utcnow() - timedelta(days=30)
    adopted_org_ids = {
        row[0] for row in db.query(LoginActivity.organization_id)
        .filter(
            LoginActivity.status == "success",
            LoginActivity.created_at >= cutoff,
            LoginActivity.organization_id.isnot(None),
        ).distinct()
    }
    adopted = sum(1 for o in orgs if o.id in adopted_org_ids)

    conversion_rate = round((adopted / created * 100), 1) if created else 0.0

    return LifecycleResponse(
        created=created, provisioned=provisioned, configured=configured,
        activated=activated, adopted=adopted, conversion_rate_pct=conversion_rate,
    )


# ═══════════════════════════════════════════════════════════════════════════════
# Platform Health (admin-maintained)
# ═══════════════════════════════════════════════════════════════════════════════

def _to_health_item(row: PlatformServiceHealth) -> ServiceHealthItem:
    return ServiceHealthItem(
        service_name=row.service_name, display_name=row.display_name, status=row.status.value,
        availability_pct=float(row.availability_pct) if row.availability_pct is not None else None,
        latency_p95_ms=row.latency_p95_ms, notes=row.notes, updated_at=row.updated_at,
    )


@router.get("/platform-health", response_model=list[ServiceHealthItem], summary="Platform service health")
def get_platform_health(db: Session = Depends(get_db), _=Depends(get_current_super_admin)):
    _seed_service_health(db)
    rows = db.query(PlatformServiceHealth).order_by(PlatformServiceHealth.id).all()
    return [_to_health_item(r) for r in rows]


@router.put("/platform-health/{service_name}", response_model=ServiceHealthItem, summary="Update a service's health record")
def update_platform_health(
    service_name: str,
    data: ServiceHealthUpdate,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_super_admin),
):
    row = db.query(PlatformServiceHealth).filter(PlatformServiceHealth.service_name == service_name).first()
    if not row:
        raise NotFoundException("Service", service_name)
    try:
        row.status = ServiceHealthStatus(data.status)
    except ValueError:
        raise BadRequestException(f"Invalid status '{data.status}'.")
    row.availability_pct = data.availability_pct
    row.latency_p95_ms = data.latency_p95_ms
    row.notes = data.notes
    row.updated_by = current_user.id
    db.commit()

    from app.modules.super_admin.models import AuditLog, AuditAction
    db.add(AuditLog(
        action=AuditAction.CONFIG_CHANGE, entity_type="PlatformServiceHealth", entity_id=row.id,
        performed_by=current_user.id, performed_by_email=current_user.email,
        details={"service": service_name, "status": data.status},
    ))
    db.commit()
    db.refresh(row)
    return _to_health_item(row)


# ═══════════════════════════════════════════════════════════════════════════════
# Security & Privileged Access
# ═══════════════════════════════════════════════════════════════════════════════

@router.get("/security", response_model=SecurityResponse, summary="Security & privileged access overview")
def security_overview(days: int = 30, db: Session = Depends(get_db), _=Depends(get_current_super_admin)):
    from app.modules.employee.models import Employee, UserRole
    from app.modules.hr.models import Organization, OrganizationStatus
    from app.modules.super_admin.models import LoginActivity, AuditLog, AuditAction

    admin_users = db.query(Employee).filter(Employee.role == UserRole.ADMIN).count()
    super_admins = db.query(Employee).filter(Employee.role == UserRole.SUPER_ADMIN).count()

    cutoff = datetime.utcnow() - timedelta(days=days)
    privileged_emails = [
        e[0] for e in db.query(Employee.email).filter(
            Employee.role.in_([UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.BILLING_ADMIN])
        ).all()
    ]
    privileged_sign_ins = 0
    if privileged_emails:
        privileged_sign_ins = db.query(LoginActivity).filter(
            LoginActivity.status == "success",
            LoginActivity.created_at >= cutoff,
            LoginActivity.email.in_(privileged_emails),
        ).count()

    privileged_actions = db.query(AuditLog).filter(
        AuditLog.created_at >= cutoff,
        AuditLog.action.in_([
            AuditAction.CONFIG_CHANGE, AuditAction.SUSPEND, AuditAction.ACTIVATE,
            AuditAction.DEACTIVATE, AuditAction.LOCK, AuditAction.UNLOCK, AuditAction.PASSWORD_RESET,
        ]),
    ).count()

    review_due = db.query(Organization).filter(Organization.status == OrganizationStatus.PENDING).count()

    return SecurityResponse(
        privileged_sign_ins=privileged_sign_ins, admin_users=admin_users, super_admins=super_admins,
        privileged_actions=privileged_actions, review_due=review_due,
    )


# ═══════════════════════════════════════════════════════════════════════════════
# Incidents (admin-logged, backs the status banner)
# ═══════════════════════════════════════════════════════════════════════════════

def _to_incident_item(row: PlatformIncident) -> IncidentItem:
    return IncidentItem(
        id=row.id, title=row.title, description=row.description, severity=row.severity.value,
        status=row.status.value, organization_id=row.organization_id,
        created_at=row.created_at, resolved_at=row.resolved_at,
    )


@router.get("/incidents", response_model=list[IncidentItem], summary="Recent platform incidents")
def list_incidents(limit: int = 20, db: Session = Depends(get_db), _=Depends(get_current_super_admin)):
    rows = db.query(PlatformIncident).order_by(PlatformIncident.created_at.desc()).limit(min(limit, 100)).all()
    return [_to_incident_item(r) for r in rows]


@router.post("/incidents", response_model=IncidentItem, summary="Log a platform incident")
def create_incident(
    data: IncidentCreate, db: Session = Depends(get_db), current_user=Depends(get_current_super_admin),
):
    try:
        severity = IncidentSeverity(data.severity)
    except ValueError:
        raise BadRequestException(f"Invalid severity '{data.severity}'.")
    row = PlatformIncident(
        title=data.title, description=data.description, severity=severity,
        organization_id=data.organization_id, created_by=current_user.id,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return _to_incident_item(row)


@router.put("/incidents/{incident_id}/resolve", response_model=IncidentItem, summary="Resolve a platform incident")
def resolve_incident(
    incident_id: int, db: Session = Depends(get_db), current_user=Depends(get_current_super_admin),
):
    row = db.query(PlatformIncident).filter(PlatformIncident.id == incident_id).first()
    if not row:
        raise NotFoundException("Incident", incident_id)
    row.status = IncidentStatus.RESOLVED
    row.resolved_at = datetime.utcnow()
    db.commit()
    db.refresh(row)
    return _to_incident_item(row)
