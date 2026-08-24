"""
seed_command_center_demo.py
-----------------------------
DEMO-ONLY data for the Platform Command Center dashboard, for visual/manual
testing in a dev database. Enriches the organizations that already exist
(billing subscriptions + pricing, a login-failure spike, an unresolved
security event, an open urgent ticket, an entitlement mismatch, admin-set
service health values) and backfills ~29 days of PlatformDailySnapshot
history with a plausible upward trend converging on today's real totals, so
KPI sparklines and the Commercial Health trend chart have something to draw.

This never touches today's snapshot row — that one is always computed live
by the app itself (command_center_router._get_or_create_today_snapshot) so
production behavior stays honest. Only past days are backfilled here, and
only in a database you've confirmed is safe to seed.

Usage (from backend/):
    python -m scripts.seed_command_center_demo
"""

import logging
from datetime import datetime, timedelta, date as date_cls
from decimal import Decimal

from app.database import initialize_database, SessionLocal

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("zoiko.seed.command_center_demo")


def run() -> None:
    initialize_database()
    db = SessionLocal()
    try:
        from app.modules.hr.models import Organization
        from app.modules.employee.models import Employee
        from app.modules.billing.models import (
            BillingPlan, BillingSubscription, PlanCode, SubscriptionStatus,
            BillableWorkforceSnapshot, BillingEntitlementSnapshot,
        )
        from app.modules.super_admin.models import LoginActivity, SecurityEvent, SupportTicket
        from app.modules.super_admin.command_center_models import PlatformServiceHealth, ServiceHealthStatus
        from app.modules.super_admin.command_center_router import _compute_platform_totals
        from app.modules.super_admin.command_center_models import PlatformDailySnapshot

        # ── 1. Plan pricing (CORE/ADVANCED get a per-seat price; ENTERPRISE
        #    stays contract-priced/unpriced, matching real business rules) ──
        core = db.query(BillingPlan).filter(BillingPlan.code == PlanCode.CORE).first()
        advanced = db.query(BillingPlan).filter(BillingPlan.code == PlanCode.ADVANCED).first()
        if core:
            core.monthly_price = Decimal("8.00")
            core.annual_price = Decimal("80.00")
        if advanced:
            advanced.monthly_price = Decimal("15.00")
            advanced.annual_price = Decimal("150.00")
        db.commit()

        all_orgs = db.query(Organization).order_by(Organization.id).all()

        def _subscribe(org, plan, status, quantity, committed_quantity):
            if not org:
                logger.warning("Org not found, skipping subscription seed.")
                return None
            sub = db.query(BillingSubscription).filter(BillingSubscription.organization_id == org.id).first()
            if not sub:
                sub = BillingSubscription(organization_id=org.id)
                db.add(sub)
            sub.billing_classification = "commercial"
            sub.status = status
            sub.plan_id = plan.id if plan else None
            sub.plan_code = plan.code if plan else None
            sub.quantity = quantity
            sub.committed_quantity = committed_quantity
            db.commit()
            return org

        # Smoke Test Co — clean active subscription, but a login-failure spike.
        org1_raw = next((o for o in all_orgs if o.name == "Smoke Test Co"), None)
        org1 = _subscribe(org1_raw, core, SubscriptionStatus.ACTIVE, 1, 1)
        # Rugvedh — active, seat overage (26 active employees vs. 20 committed),
        # plus an entitlement mismatch (entitled for CORE but subscribed to ADVANCED).
        org2_raw = next((o for o in all_orgs if o.name == "Rugvedh"), None)
        org2 = _subscribe(org2_raw, advanced, SubscriptionStatus.ACTIVE, 26, 20)
        # One active "dummy" org — subscription past due (drives Failed Payments + attention).
        org8_raw = next((o for o in all_orgs if o.name == "dummy" and o.status and o.status.value == "active"), None)
        org8 = _subscribe(org8_raw, core, SubscriptionStatus.PAST_DUE, 1, 1)

        if org2:
            db.add(BillableWorkforceSnapshot(organization_id=org2.id, quantity=26, reconciliation_status="derived_from_hr_state"))
            existing_ent = db.query(BillingEntitlementSnapshot).filter(
                BillingEntitlementSnapshot.organization_id == org2.id
            ).first()
            if not existing_ent:
                db.add(BillingEntitlementSnapshot(organization_id=org2.id, package=PlanCode.CORE))
            db.commit()

            employee = db.query(Employee).filter(Employee.organization_id == org2.id).first()
            if employee and not db.query(SupportTicket).filter(
                SupportTicket.organization_id == org2.id, SupportTicket.status == "open"
            ).first():
                db.add(SupportTicket(
                    organization_id=org2.id, raised_by=employee.id,
                    subject="Payroll export job failed", description="Monthly payroll export failed twice in a row.",
                    category="billing", priority="urgent", status="open",
                ))
            if not db.query(SecurityEvent).filter(
                SecurityEvent.organization_id == org2.id, SecurityEvent.is_resolved == False,  # noqa: E712
            ).first():
                db.add(SecurityEvent(
                    event_type="privileged_role_change", severity="high",
                    description="Admin role granted outside business hours.",
                    organization_id=org2.id, is_resolved=False,
                ))
            db.commit()

        if org1:
            now = datetime.utcnow()
            for i in range(6):
                db.add(LoginActivity(
                    email=f"user{i}@smoketestco.example", organization_id=org1.id,
                    status="failed", failure_reason="invalid_password",
                    created_at=now - timedelta(minutes=10 * i),
                ))
            db.commit()

        # ── 2. Platform Health — admin-recorded status-page values ─────────
        health_values = {
            "authentication": (ServiceHealthStatus.HEALTHY, Decimal("100.000"), 68),
            "hr_core": (ServiceHealthStatus.HEALTHY, Decimal("99.980"), 72),
            "workflow_engine": (ServiceHealthStatus.HEALTHY, Decimal("99.990"), 158),
            "notifications": (ServiceHealthStatus.HEALTHY, Decimal("99.960"), 46),
            "integrations": (ServiceHealthStatus.WARNING, Decimal("99.920"), 234),
        }
        for service_name, (status, availability, latency) in health_values.items():
            row = db.query(PlatformServiceHealth).filter(PlatformServiceHealth.service_name == service_name).first()
            if row:
                row.status = status
                row.availability_pct = availability
                row.latency_p95_ms = latency
        db.commit()

        # ── 3. Backfill ~29 days of daily snapshots with a plausible ramp,
        #    converging on today's real totals. Today's row is left untouched
        #    — the live app computes it honestly on the next dashboard load. ──
        today_totals = _compute_platform_totals(db)
        today = date_cls.today()
        for days_ago in range(29, 0, -1):
            snapshot_date = today - timedelta(days=days_ago)
            ramp = 0.6 + 0.4 * ((29 - days_ago) / 29)  # 60% -> ~100% of today's totals
            row = db.query(PlatformDailySnapshot).filter(PlatformDailySnapshot.snapshot_date == snapshot_date).first()
            if not row:
                row = PlatformDailySnapshot(snapshot_date=snapshot_date)
                db.add(row)
            row.total_organizations = max(1, round(today_totals["total_organizations"] * ramp))
            row.active_organizations = max(1, round(today_totals["active_organizations"] * ramp))
            row.total_workforce = max(1, round(today_totals["total_workforce"] * ramp))
            row.activated_organizations = max(0, round(today_totals["activated_organizations"] * ramp))
            row.mrr_cents = round(today_totals["mrr_cents"] * ramp)
        db.commit()

        logger.info("Command Center demo data seeded.")
    finally:
        db.close()


if __name__ == "__main__":
    run()
