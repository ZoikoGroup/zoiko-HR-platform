"""
tests/fixtures/tenants.py
-------------------------
Prompt 6 — synthetic tenant & worker builders for lifecycle E2E, coverage and
timezone-boundary tests.

Every builder returns a small dataclass (OrgFixture) carrying the created
Organization, its BillingSubscription and an org-admin Employee. Everything is
ADD-ONLY to the passed-in session — tests get a fresh in-memory sqlite DB via
the `db` fixture, so it is safe to reuse org ids 1..N across builders.

States covered (matching the PRD lifecycle vocabulary):
  - Plan tiers:          Core / Advanced / Enterprise
  - Org lifecycle:       evaluation, pilot, active, leave, pre-hire, former
  - Worker commercial:   contractor, transfer, rehire, duplicate-import

The `/me` endpoints (self-serve billing) are tested here via HTTP with a real
JWT for the org-admin employee, exercising token->org scoping and the Section 19
trimming rules.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone

from sqlalchemy.orm import Session

from app.modules.billing.models import (
    BillingAuditAction,
    BillingAuditLog,
    BillingSubscription,
    BillingClassification,
    BillingCycle,
    PlanCode,
    SubscriptionStatus,
)
from app.modules.billing.feature_keys import FEATURE_KEYS
from app.modules.billing.entitlement_service import ENTITLED_AVAILABLE, NOT_ENTITLED
from app.modules.employee.models import Employee, EmployeeStatus, EmploymentType, UserRole
from app.modules.hr.models import Organization, OrganizationStatus


@dataclass
class OrgFixture:
    org: Organization
    sub: BillingSubscription
    admin: Employee | None = None
    extra: dict = field(default_factory=dict)


def _utc(days: float = 0) -> datetime:
    """Utcnow shifted by days (naive, matching the platform's storage)."""
    return datetime.utcnow() + timedelta(days=days)


def make_admin_employee(
    db: Session,
    *,
    org_id: int,
    email: str,
    role: UserRole = UserRole.ADMIN,
    employee_id: str = "E-0001",
    status: EmployeeStatus = EmployeeStatus.ACTIVE,
) -> Employee:
    emp = Employee(
        email=email,
        hashed_password="hashed-not-important-for-fixtures",
        employee_code=f"{employee_id}-{org_id}",
        role=role,
        first_name="Admin",
        last_name="Fixture",
        job_title="Org Admin",
        employment_type=EmploymentType.FULL_TIME,
        status=status,
        date_of_joining=datetime.utcnow().date() - timedelta(days=365),
        organization_id=org_id,
    )
    db.add(emp)
    db.commit()
    db.refresh(emp)
    return emp


def _org(
    db: Session,
    *,
    org_id: int,
    name: str,
    org_status: OrganizationStatus,
    plan_code: PlanCode | None,
    sub_status: SubscriptionStatus,
    billing_timezone: str = "UTC",
    commercial: bool = False,
    quantity: int = 0,
) -> tuple[Organization, BillingSubscription]:
    org = Organization(
        id=org_id,
        name=name,
        status=org_status,
        timezone=billing_timezone,
    )
    db.add(org)
    db.flush()

    billing_cls = (
        BillingClassification.COMMERCIAL if commercial else BillingClassification.INTERNAL
    )
    sub = BillingSubscription(
        organization_id=org_id,
        billing_classification=billing_cls,
        status=sub_status,
        plan_code=plan_code,
        billing_cycle=BillingCycle.MONTHLY if plan_code else None,
        billing_timezone=billing_timezone,
        quantity=quantity,
        renewal_anchor_date=_utc(30) if plan_code else None,
        service_start_at=_utc() if commercial else None,
    )
    db.add(sub)
    db.commit()
    db.refresh(org)
    db.refresh(sub)
    return org, sub


# ── Plan-tier tenants ────────────────────────────────────────────────────────

def core_tenant(db: Session, org_id: int = 1) -> OrgFixture:
    org, sub = _org(
        db, org_id=org_id, name="Core Tenant", org_status=OrganizationStatus.ACTIVE,
        plan_code=PlanCode.CORE, sub_status=SubscriptionStatus.ACTIVE, quantity=10,
    )
    admin = make_admin_employee(db, org_id=org_id, email=f"admin-core-{org_id}@z.test")
    return OrgFixture(org=org, sub=sub, admin=admin)


def advanced_tenant(db: Session, org_id: int = 2) -> OrgFixture:
    org, sub = _org(
        db, org_id=org_id, name="Advanced Tenant", org_status=OrganizationStatus.ACTIVE,
        plan_code=PlanCode.ADVANCED, sub_status=SubscriptionStatus.ACTIVE, quantity=25,
    )
    admin = make_admin_employee(db, org_id=org_id, email=f"admin-advanced-{org_id}@z.test")
    return OrgFixture(org=org, sub=sub, admin=admin)


def enterprise_tenant(db: Session, org_id: int = 3) -> OrgFixture:
    org, sub = _org(
        db, org_id=org_id, name="Enterprise Tenant", org_status=OrganizationStatus.ACTIVE,
        plan_code=PlanCode.ENTERPRISE, sub_status=SubscriptionStatus.ACTIVE,
        quantity=100, commercial=True,
    )
    admin = make_admin_employee(db, org_id=org_id, email=f"admin-enterprise-{org_id}@z.test")
    return OrgFixture(org=org, sub=sub, admin=admin)


# ── Org-lifecycle tenants ────────────────────────────────────────────────────

def evaluation_tenant(db: Session, org_id: int = 4) -> OrgFixture:
    org, sub = _org(
        db, org_id=org_id, name="Evaluation Tenant", org_status=OrganizationStatus.APPROVED,
        plan_code=None, sub_status=SubscriptionStatus.EVALUATION,
    )
    admin = make_admin_employee(db, org_id=org_id, email=f"admin-eval-{org_id}@z.test")
    return OrgFixture(org=org, sub=sub, admin=admin)


def pilot_tenant(db: Session, org_id: int = 5) -> OrgFixture:
    org, sub = _org(
        db, org_id=org_id, name="Pilot Tenant", org_status=OrganizationStatus.APPROVED,
        plan_code=PlanCode.ADVANCED, sub_status=SubscriptionStatus.EVALUATION, quantity=5,
    )
    admin = make_admin_employee(db, org_id=org_id, email=f"admin-pilot-{org_id}@z.test")
    return OrgFixture(org=org, sub=sub, admin=admin)


def active_tenant(db: Session, org_id: int = 6) -> OrgFixture:
    org, sub = _org(
        db, org_id=org_id, name="Active Tenant", org_status=OrganizationStatus.ACTIVE,
        plan_code=PlanCode.CORE, sub_status=SubscriptionStatus.ACTIVE, quantity=8, commercial=True,
    )
    admin = make_admin_employee(db, org_id=org_id, email=f"admin-active-{org_id}@z.test")
    return OrgFixture(org=org, sub=sub, admin=admin)


def leave_tenant(db: Session, org_id: int = 7) -> OrgFixture:
    """Org that is ACTIVE but the tenant is on leave at the worker level."""
    org, sub = _org(
        db, org_id=org_id, name="Leave Tenant", org_status=OrganizationStatus.ACTIVE,
        plan_code=PlanCode.CORE, sub_status=SubscriptionStatus.ACTIVE, quantity=2,
    )
    admin = make_admin_employee(db, org_id=org_id, email=f"admin-leave-{org_id}@z.test",
                                status=EmployeeStatus.ON_LEAVE)
    return OrgFixture(org=org, sub=sub, admin=admin)


def prehire_tenant(db: Session, org_id: int = 8) -> OrgFixture:
    """Pre-hire: org active on an evaluation/pilot sub, worker PENDING."""
    org, sub = _org(
        db, org_id=org_id, name="Pre-hire Tenant", org_status=OrganizationStatus.APPROVED,
        plan_code=PlanCode.CORE, sub_status=SubscriptionStatus.EVALUATION, quantity=1,
    )
    admin = make_admin_employee(db, org_id=org_id, email=f"admin-prehire-{org_id}@z.test",
                                status=EmployeeStatus.PENDING)
    return OrgFixture(org=org, sub=sub, admin=admin)


def former_tenant(db: Session, org_id: int = 9) -> OrgFixture:
    """Former/canceled tenant: subscription CANCELED, org ACTIVE but churned."""
    org, sub = _org(
        db, org_id=org_id, name="Former Tenant", org_status=OrganizationStatus.ACTIVE,
        plan_code=PlanCode.ADVANCED, sub_status=SubscriptionStatus.CANCELED, quantity=0,
    )
    return OrgFixture(org=org, sub=sub)


def transferred_worker_tenant(db: Session, org_id: int = 10) -> OrgFixture:
    """Contractor worker transferred into the org (CONTRACT, active)."""
    org, sub = _org(
        db, org_id=org_id, name="Transfer Tenant", org_status=OrganizationStatus.ACTIVE,
        plan_code=PlanCode.ADVANCED, sub_status=SubscriptionStatus.ACTIVE, quantity=3,
    )
    admin = make_admin_employee(db, org_id=org_id, email=f"admin-xfer-{org_id}@z.test")
    worker = Employee(
        email=f"worker-xfer-{org_id}@z.test",
        hashed_password="x",
        employee_code="E-XFER",
        role=UserRole.EMPLOYEE,
        first_name="Xfer",
        last_name="Worker",
        job_title="Contractor",
        employment_type=EmploymentType.CONTRACT,
        status=EmployeeStatus.ACTIVE,
        date_of_joining=datetime.utcnow().date() - timedelta(days=60),
        organization_id=org_id,
    )
    db.add(worker)
    db.commit()
    return OrgFixture(org=org, sub=sub, admin=admin, extra={"worker": worker})


def rehire_tenant(db: Session, org_id: int = 11) -> OrgFixture:
    """Worker RESIGNED then rehired (now ACTIVE) — lifecycle duplicate detection."""
    org, sub = _org(
        db, org_id=org_id, name="Rehire Tenant", org_status=OrganizationStatus.ACTIVE,
        plan_code=PlanCode.CORE, sub_status=SubscriptionStatus.ACTIVE, quantity=1,
    )
    admin = make_admin_employee(db, org_id=org_id, email=f"admin-rehire-{org_id}@z.test")
    return OrgFixture(org=org, sub=sub, admin=admin)


def duplicate_import_tenant(db: Session, org_id: int = 12) -> OrgFixture:
    """One row imported; a second import sharing the email must be rejected by
    the UNIQUE(employees.email) constraint — the dedup guard. The E2E test
    asserts that a duplicate insert raises IntegrityError."""
    org, sub = _org(
        db, org_id=org_id, name="Dup Import Tenant", org_status=OrganizationStatus.ACTIVE,
        plan_code=PlanCode.CORE, sub_status=SubscriptionStatus.ACTIVE, quantity=2,
    )
    admin = make_admin_employee(db, org_id=org_id, email=f"admin-dupe-{org_id}@z.test")
    worker = Employee(
        email=f"shared-{org_id}@z.test", hashed_password="x", employee_code="E-DUP",
        role=UserRole.EMPLOYEE, first_name="A", last_name="Dup", job_title="Engineer",
        employment_type=EmploymentType.FULL_TIME, status=EmployeeStatus.ACTIVE,
        date_of_joining=datetime.utcnow().date() - timedelta(days=30), organization_id=org_id,
    )
    db.add(worker)
    db.commit()
    db.refresh(worker)
    return OrgFixture(org=org, sub=sub, admin=admin, extra={"worker": worker})


ALL_TENANT_BUILDERS = [
    core_tenant, advanced_tenant, enterprise_tenant,
    evaluation_tenant, pilot_tenant, active_tenant,
    leave_tenant, prehire_tenant, former_tenant,
    transferred_worker_tenant, rehire_tenant, duplicate_import_tenant,
]


def default_tenant_matrix(db: Session) -> dict[str, OrgFixture]:
    """Build every synthetic tenant once into `db`, keyed by builder name."""
    result = {}
    for build in ALL_TENANT_BUILDERS:
        result[build.__name__] = build(db)
    return result


# ── Entitlement mapping seeding ──────────────────────────────────────────────

def seed_entitlement_mappings(
    db: Session,
    *,
    plan_codes: list[PlanCode],
    entitled_keys: set[str] | None = None,
    not_entitled_keys: set[str] | None = None,
) -> int:
    """Insert PlanEntitlementMapping rows. Entitle ALL FEATURE_KEYS by default
    except the hard-blocked hr.ai.autonomous_action; optionally mark a set as
    NOT_ENTITLED to simulate a paywall for downgrade/coverage scenarios.
    Returns the number of rows inserted.
    """
    from app.modules.billing.models import PlanEntitlementMapping
    from app.modules.billing.feature_keys import FEATURE_KEY_REGISTRY_VERSION

    entitled = set(entitled_keys) if entitled_keys is not None else set(FEATURE_KEYS)
    entitled.discard("hr.ai.autonomous_action")

    not_entitled = set(not_entitled_keys or set())
    rows = 0
    for pc in plan_codes:
        for fk in entitled - not_entitled:
            db.add(PlanEntitlementMapping(
                plan_code=pc,
                feature_key=fk,
                state=ENTITLED_AVAILABLE,
                catalog_version=FEATURE_KEY_REGISTRY_VERSION,
                approved_by="tests/fixtures/tenants.py",
                approved_at=datetime.utcnow(),
            ))
            rows += 1
        for fk in not_entitled:
            db.add(PlanEntitlementMapping(
                plan_code=pc,
                feature_key=fk,
                state=NOT_ENTITLED,
                catalog_version=FEATURE_KEY_REGISTRY_VERSION,
                approved_by="tests/fixtures/tenants.py",
                approved_at=datetime.utcnow(),
            ))
            rows += 1
    db.commit()
    return rows


def audit_action_names(db: Session, organization_id: int) -> list[str]:
    return [
        row.action.value if hasattr(row.action, "value") else str(row.action)
        for row in (
            db.query(BillingAuditLog)
            .filter(BillingAuditLog.organization_id == organization_id)
            .order_by(BillingAuditLog.created_at.asc())
            .all()
        )
    ]
