"""add billing_quotations table

Revision ID: 36c94a486784
Revises: ab6df8b648e0
Create Date: 2026-09-08 15:50:36.486313

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '36c94a486784'
down_revision: Union[str, Sequence[str], None] = 'ab6df8b648e0'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "billing_quotations",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("organization_id", sa.Integer(), sa.ForeignKey("organizations.id"), nullable=False),
        sa.Column("quote_number", sa.String(length=50), nullable=False),
        sa.Column("plan_code", sa.String(length=50), nullable=False),
        sa.Column("billing_cycle", sa.String(length=50), nullable=False, server_default="MONTHLY"),
        sa.Column("currency", sa.String(length=3), nullable=False, server_default="USD"),
        sa.Column("amount_cents", sa.Integer(), nullable=False),
        sa.Column("recipient_email", sa.String(length=255), nullable=False),
        sa.Column("recipient_name", sa.String(length=200), nullable=True),
        sa.Column("status", sa.String(length=50), nullable=False, server_default="PENDING"),
        sa.Column("issued_at", sa.DateTime(), server_default=sa.func.now()),
        sa.Column("valid_until", sa.DateTime(), nullable=False),
        sa.Column("decided_at", sa.DateTime(), nullable=True),
        sa.Column("decision_token_hash", sa.String(length=64), nullable=True),
        sa.Column("decision_token_expires_at", sa.DateTime(), nullable=True),
        sa.Column("invoice_number", sa.String(length=50), nullable=True),
        sa.Column("invoice_sent_at", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), nullable=True),
        sa.UniqueConstraint("quote_number", name="uq_billing_quotations_quote_number"),
    )
    op.create_index("ix_billing_quotations_organization_id", "billing_quotations", ["organization_id"])
    op.create_index("ix_billing_quotations_decision_token_hash", "billing_quotations", ["decision_token_hash"])


def downgrade() -> None:
    op.drop_index("ix_billing_quotations_decision_token_hash", table_name="billing_quotations")
    op.drop_index("ix_billing_quotations_organization_id", table_name="billing_quotations")
    op.drop_table("billing_quotations")
