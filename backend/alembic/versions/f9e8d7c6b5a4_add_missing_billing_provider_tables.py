"""add missing billing provider-ref, invoice, webhook, idempotency, reconciliation, plan-change and refund tables

Revision ID: f9e8d7c6b5a4
Revises: d3e4f5a6b7c8
Create Date: 2026-09-09

These seven tables (ProviderRef, BillingInvoice, BillingWebhookEvent,
BillingIdempotencyKey, BillingReconciliationCase, BillingPlanChange,
BillingRefundRequest in app/modules/billing/models.py) were added to the
ORM models after the create_all-based baseline (17aefc359dab) had already
run against existing databases, but no migration was ever written for them —
Base.metadata.create_all at app startup papered over the gap in dev, but
`alembic upgrade head` fails on any database that never had create_all rerun
since (e5f6a7b8c9d0's downgrade_impact_item FKs to billing_plan_changes).
All seven tables are fresh and additive — no existing rows are touched.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = 'f9e8d7c6b5a4'
down_revision: Union[str, Sequence[str], None] = 'd3e4f5a6b7c8'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'billing_provider_refs',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('organization_id', sa.Integer(), sa.ForeignKey('organizations.id'), nullable=False, unique=True),
        sa.Column('stripe_customer_id', sa.String(length=255), nullable=True),
        sa.Column('stripe_subscription_id', sa.String(length=255), nullable=True),
        sa.Column('stripe_payment_method_id', sa.String(length=255), nullable=True),
        sa.Column('stripe_latest_invoice_id', sa.String(length=255), nullable=True),
        sa.Column('created_at', sa.DateTime(), server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(), nullable=True),
    )
    op.create_index('ix_billing_provider_refs_stripe_customer_id', 'billing_provider_refs', ['stripe_customer_id'])
    op.create_index('ix_billing_provider_refs_stripe_subscription_id', 'billing_provider_refs', ['stripe_subscription_id'])

    op.create_table(
        'billing_invoices',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('organization_id', sa.Integer(), sa.ForeignKey('organizations.id'), nullable=False),
        sa.Column('stripe_invoice_id', sa.String(length=255), nullable=False, unique=True),
        sa.Column('amount_due_cents', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('amount_paid_cents', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('currency', sa.String(length=3), nullable=False, server_default='USD'),
        sa.Column('status', sa.String(length=50), nullable=False),
        sa.Column('hosted_invoice_url', sa.String(length=500), nullable=True),
        sa.Column('invoice_pdf_url', sa.String(length=500), nullable=True),
        sa.Column('period_start', sa.DateTime(), nullable=True),
        sa.Column('period_end', sa.DateTime(), nullable=True),
        sa.Column('created_at', sa.DateTime(), server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(), nullable=True),
    )
    op.create_index('ix_billing_invoices_organization_id', 'billing_invoices', ['organization_id'])

    op.create_table(
        'billing_webhook_events',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('stripe_event_id', sa.String(length=255), nullable=False, unique=True),
        sa.Column('event_type', sa.String(length=100), nullable=False),
        sa.Column('processed', sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column('error_message', sa.Text(), nullable=True),
        sa.Column('payload', sa.JSON(), nullable=True),
        sa.Column('created_at', sa.DateTime(), server_default=sa.func.now()),
        sa.Column('processed_at', sa.DateTime(), nullable=True),
    )
    op.create_index('ix_billing_webhook_events_stripe_event_id', 'billing_webhook_events', ['stripe_event_id'])

    op.create_table(
        'billing_idempotency_keys',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('idempotency_key', sa.String(length=255), nullable=False),
        sa.Column('organization_id', sa.Integer(), nullable=False),
        sa.Column('endpoint', sa.String(length=200), nullable=False),
        sa.Column('request_body_hash', sa.String(length=64), nullable=False),
        sa.Column('result_status_code', sa.Integer(), nullable=False),
        sa.Column('result_body', sa.JSON(), nullable=False),
        sa.Column('created_at', sa.DateTime(), server_default=sa.func.now()),
        sa.UniqueConstraint('idempotency_key', 'organization_id', 'endpoint', name='uq_idempotency_org_endpoint'),
    )

    op.create_table(
        'billing_reconciliation_cases',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('organization_id', sa.Integer(), sa.ForeignKey('organizations.id'), nullable=False),
        sa.Column('reason', sa.String(length=50), nullable=False),
        sa.Column('status', sa.String(length=50), nullable=False),
        sa.Column('local_snapshot', sa.JSON(), nullable=True),
        sa.Column('stripe_snapshot', sa.JSON(), nullable=True),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('opened_by', sa.String(length=255), nullable=True),
        sa.Column('resolved_by', sa.String(length=255), nullable=True),
        sa.Column('resolved_at', sa.DateTime(), nullable=True),
        sa.Column('created_at', sa.DateTime(), server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(), nullable=True),
    )
    op.create_index('ix_billing_reconciliation_cases_organization_id', 'billing_reconciliation_cases', ['organization_id'])

    op.create_table(
        'billing_plan_changes',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('organization_id', sa.Integer(), sa.ForeignKey('organizations.id'), nullable=False),
        sa.Column('change_type', sa.String(length=50), nullable=False),
        sa.Column('from_plan_id', sa.Integer(), sa.ForeignKey('billing_plans.id'), nullable=True),
        sa.Column('to_plan_id', sa.Integer(), sa.ForeignKey('billing_plans.id'), nullable=False),
        sa.Column('billing_cycle', sa.String(length=50), nullable=False),
        sa.Column('effective_at', sa.DateTime(), nullable=False),
        sa.Column('status', sa.String(length=50), nullable=False),
        sa.Column('blockers_snapshot', sa.JSON(), nullable=True),
        sa.Column('proration_preview', sa.JSON(), nullable=True),
        sa.Column('entitlement_delta', sa.JSON(), nullable=True),
        sa.Column('requested_by', sa.String(length=255), nullable=True),
        sa.Column('cancel_reason', sa.Text(), nullable=True),
        sa.Column('canceled_at', sa.DateTime(), nullable=True),
        sa.Column('executed_at', sa.DateTime(), nullable=True),
        sa.Column('created_at', sa.DateTime(), server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(), nullable=True),
    )
    op.create_index('ix_billing_plan_changes_organization_id', 'billing_plan_changes', ['organization_id'])

    op.create_table(
        'billing_refund_requests',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('organization_id', sa.Integer(), sa.ForeignKey('organizations.id'), nullable=False),
        sa.Column('request_type', sa.String(length=50), nullable=False),
        sa.Column('amount_cents', sa.Integer(), nullable=False),
        sa.Column('currency', sa.String(length=3), nullable=False, server_default='USD'),
        sa.Column('reason', sa.Text(), nullable=False),
        sa.Column('stripe_subscription_id', sa.String(length=255), nullable=True),
        sa.Column('stripe_invoice_id', sa.String(length=255), nullable=True),
        sa.Column('stripe_refund_id', sa.String(length=255), nullable=True),
        sa.Column('status', sa.String(length=50), nullable=False),
        sa.Column('requested_by', sa.String(length=255), nullable=False),
        sa.Column('approved_by', sa.String(length=255), nullable=True),
        sa.Column('rejection_reason', sa.Text(), nullable=True),
        sa.Column('processed_at', sa.DateTime(), nullable=True),
        sa.Column('created_at', sa.DateTime(), server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(), nullable=True),
    )
    op.create_index('ix_billing_refund_requests_organization_id', 'billing_refund_requests', ['organization_id'])


def downgrade() -> None:
    op.drop_index('ix_billing_refund_requests_organization_id', table_name='billing_refund_requests')
    op.drop_table('billing_refund_requests')
    op.drop_index('ix_billing_plan_changes_organization_id', table_name='billing_plan_changes')
    op.drop_table('billing_plan_changes')
    op.drop_index('ix_billing_reconciliation_cases_organization_id', table_name='billing_reconciliation_cases')
    op.drop_table('billing_reconciliation_cases')
    op.drop_table('billing_idempotency_keys')
    op.drop_index('ix_billing_webhook_events_stripe_event_id', table_name='billing_webhook_events')
    op.drop_table('billing_webhook_events')
    op.drop_index('ix_billing_invoices_organization_id', table_name='billing_invoices')
    op.drop_table('billing_invoices')
    op.drop_index('ix_billing_provider_refs_stripe_subscription_id', table_name='billing_provider_refs')
    op.drop_index('ix_billing_provider_refs_stripe_customer_id', table_name='billing_provider_refs')
    op.drop_table('billing_provider_refs')
