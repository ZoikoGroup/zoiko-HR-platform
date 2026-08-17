"""Ensure every existing organization has a non-billable BillingSubscription row.

Per ZHR-COM-BILL-001 Section 16/M1: existing tenants must default to
non-billable (INTERNAL) until an affirmative COMMERCIAL conversion happens.
Run this once after deploying the billing module.
"""
from app.database import initialize_database, SessionLocal
from app.modules.hr.models import Organization
from app.modules.billing.models import BillingSubscription, BillingClassification, SubscriptionStatus

initialize_database()
db = SessionLocal()
try:
    orgs = db.query(Organization).all()
    created = 0
    for org in orgs:
        existing = (
            db.query(BillingSubscription)
            .filter(BillingSubscription.organization_id == org.id)
            .first()
        )
        if existing:
            continue
        db.add(BillingSubscription(
            organization_id=org.id,
            billing_classification=BillingClassification.INTERNAL,
            status=SubscriptionStatus.EVALUATION,
        ))
        created += 1
    db.commit()
    print(f"Checked {len(orgs)} organizations. Created {created} non-billable billing_subscriptions rows.")
finally:
    db.close()
