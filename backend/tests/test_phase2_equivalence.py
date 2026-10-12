"""
Phase 2 rewrites return exactly what the old code returned, on seeded data that includes soft-deleted organizations,
several snapshots per org (with timestamp ties) and orgs with no rows at all.

Each test computes the old answer the old way (load everything, loop in Python) and compares it with the new query.
"""
from datetime import date, datetime, timedelta

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.core.sql_helpers import latest_per_group
from app.database import Base
from app.modules.billing.models import (
    BillableWorkforceSnapshot, BillingEntitlementSnapshot, BillingPlan, BillingSubscription, PlanCode, SubscriptionStatus,
)
from app.modules.employee.models import Employee, EmployeeStatus, EmploymentType, UserRole
from app.modules.hr.models import Organization, OrganizationStatus
from app.modules.super_admin import organization_service


@pytest.fixture
def db():
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(engine)
    s = sessionmaker(bind=engine)()
    now = datetime(2026, 10, 1, 12, 0, 0)
    s.add_all([
        BillingPlan(code="core", name="Core", catalog_version="v1", monthly_price=12),
        BillingPlan(code="advanced", name="Advanced", catalog_version="v1", monthly_price=25),
    ])
    s.flush()
    plans = {p.code.value if hasattr(p.code, "value") else p.code: p for p in s.query(BillingPlan)}
    statuses = [SubscriptionStatus.ACTIVE, SubscriptionStatus.PAST_DUE, SubscriptionStatus.EVALUATION, SubscriptionStatus.ACTIVE]
    for i in range(1, 9):
        org = Organization(organization_name=None if i == 3 else f"Org {i}", display_name=f"Disp {i}" if i in (3, 4) else None,
                           status=OrganizationStatus.ON_HOLD if i == 5 else OrganizationStatus.ACTIVE)
        s.add(org)
        s.flush()
        if i in (6, 7):
            org.deleted_at = now                               # soft-deleted
        plan = plans["advanced" if i % 2 else "core"]
        s.add(BillingSubscription(organization_id=org.id, status=statuses[i % 4], plan_id=plan.id, plan_code=plan.code,
                                  quantity=10 + i, committed_quantity=12))
        if i == 8:
            continue                                           # an org with no snapshots at all
        for d in range(5):
            s.add(BillableWorkforceSnapshot(organization_id=org.id, quantity=10 + i + d, snapshot_at=now - timedelta(days=d)))
            s.add(BillingEntitlementSnapshot(organization_id=org.id, package=PlanCode.CORE if d else plan.code,
                                             computed_at=now - timedelta(days=d)))
        # a tie on the newest timestamp: the later insert (higher id) must win, as in the old loop's iteration
        s.add(BillableWorkforceSnapshot(organization_id=org.id, quantity=99, snapshot_at=now))
    s.add(Employee(email="sa@eq.example", hashed_password="x", employee_code="SA1", role=UserRole.SUPER_ADMIN, first_name="S",
                   last_name="A", job_title="t", employment_type=EmploymentType.FULL_TIME, status=EmployeeStatus.ACTIVE,
                   is_active=True, date_of_joining=date(2024, 1, 1)))
    s.commit()
    yield s
    s.close()


def _old_latest(db, model, ts_attr):
    """The old code: load every row newest-first and keep the first per org."""
    out = {}
    for row in db.query(model).order_by(getattr(model, ts_attr).desc(), model.id.desc()).all():
        out.setdefault(row.organization_id, row)
    return out


def test_latest_per_group_matches_the_load_everything_loop(db):
    old = _old_latest(db, BillableWorkforceSnapshot, "snapshot_at")
    new = {r.organization_id: r for r in latest_per_group(
        db, BillableWorkforceSnapshot, BillableWorkforceSnapshot.organization_id, BillableWorkforceSnapshot.snapshot_at,
        [BillableWorkforceSnapshot.organization_id, BillableWorkforceSnapshot.quantity])}
    assert {k: v.quantity for k, v in old.items()} == {k: v.quantity for k, v in new.items()}
    assert all(v.quantity == 99 for v in new.values())          # the tie went to the later row
    old_e = _old_latest(db, BillingEntitlementSnapshot, "computed_at")
    new_e = {r.organization_id: r for r in latest_per_group(
        db, BillingEntitlementSnapshot, BillingEntitlementSnapshot.organization_id, BillingEntitlementSnapshot.computed_at,
        [BillingEntitlementSnapshot.organization_id, BillingEntitlementSnapshot.package])}
    assert {k: v.package for k, v in old_e.items()} == {k: v.package for k, v in new_e.items()}


def test_org_names_by_id_matches_the_old_full_map_including_soft_delete(db):
    old = {o.id: o.name for o in db.query(Organization).all()}            # global filter: deleted orgs missing
    every_id = [i for (i,) in db.query(Organization.id).execution_options(include_deleted=True)]
    assert organization_service.org_names_by_id(db, every_id) == old
    assert organization_service.org_names_by_id(db, [every_id[0], None]) == {every_id[0]: old[every_id[0]]}
    assert organization_service.org_names_by_id(db, []) == {}
    with_deleted = organization_service.org_names_by_id(db, every_id, include_deleted=True)
    assert len(with_deleted) == len(every_id) and set(old) < set(with_deleted)


def _call(fn, db, **kw):
    return fn(db=db, _=None, **kw).model_dump()


def _old_commercial_numbers(db):
    plans = {p.id: p for p in db.query(BillingPlan).all()}
    subs_by_org = {s.organization_id: s for s in db.query(BillingSubscription).all()}
    latest_w = _old_latest(db, BillableWorkforceSnapshot, "snapshot_at")
    latest_e = _old_latest(db, BillingEntitlementSnapshot, "computed_at")
    overage_cents = overage_orgs = 0
    for org_id, snap in latest_w.items():
        sub = subs_by_org.get(org_id)
        if not sub or sub.committed_quantity is None:
            continue
        over = snap.quantity - sub.committed_quantity
        if over > 0:
            overage_orgs += 1
            plan = plans.get(sub.plan_id)
            if plan and plan.monthly_price:
                overage_cents += int(plan.monthly_price * 100 * over)
    mismatch = sum(1 for org_id, ent in latest_e.items()
                   if (sub := subs_by_org.get(org_id)) and ent.package and sub.plan_code and ent.package != sub.plan_code)
    return overage_cents, overage_orgs, mismatch


def test_commercial_health_overages_and_mismatches_unchanged(db, monkeypatch):
    from app.modules.super_admin import command_center_router as cc
    monkeypatch.setattr(cc, "_get_or_create_today_snapshot", lambda db: None)      # Postgres-only upsert; not under test
    out = _call(cc.commercial_health, db, days=30)
    cents, orgs, mismatch = _old_commercial_numbers(db)
    assert (out["plan_overages_cents"], out["plan_overages_org_count"], out["entitlement_mismatch_count"]) == (cents, orgs, mismatch)
    assert orgs > 0 and mismatch >= 0


def test_customer_health_and_lifecycle_ignore_deleted_orgs_as_before(db):
    from app.modules.super_admin import command_center_router as cc
    health = _call(cc.customer_health, db)
    live = db.query(Organization).all()
    assert health["healthy"] + health["watch"] + health["at_risk"] == len(live)
    names = {o.id: o.name for o in live}
    for row in health["top_at_risk"]:
        assert row["organization_name"] == names[row["organization_id"]]
    life = _call(cc.lifecycle, db)
    assert life["created"] == len(live) and life["activated"] == sum(1 for o in live if o.status == OrganizationStatus.ACTIVE)


def test_attention_names_match_the_old_map_and_deleted_orgs_stay_unnamed(db):
    from app.modules.super_admin import command_center_router as cc
    items = cc._compute_attention(db)
    old = {o.id: o.name for o in db.query(Organization).all()}
    assert items, "seed should raise at least the past-due and on-hold items"
    for i in items:
        assert i.organization_name == (old.get(i.organization_id) if i.organization_id else None)
    deleted = {i for (i,) in db.query(Organization.id).filter(Organization.deleted_at.isnot(None)).execution_options(include_deleted=True)}
    assert all(i.organization_name is None for i in items if i.organization_id in deleted)


def test_asset_reports_list_stays_a_list_and_pages_on_request(db):
    from app.modules.hr import asset_service
    from app.modules.hr.models import AssetReport
    for n in range(30):
        db.add(AssetReport(report_type="inventory", title=f"R{n}"))
    db.commit()
    assert [r.title for r in asset_service.get_asset_reports(db)] == [r.title for r in db.query(AssetReport).order_by(AssetReport.created_at.desc(), AssetReport.id.desc())]
    rows, total = asset_service.get_asset_reports(db, page=2, per_page=10)
    assert total == 30 and len(rows) == 10
