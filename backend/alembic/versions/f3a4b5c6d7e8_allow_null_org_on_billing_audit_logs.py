"""allow null organization_id on billing_audit_logs (platform events)

Revision ID: f3a4b5c6d7e8
Revises: e2a3b4c5d6e7
Create Date: 2026-09-24

Super-admin plan catalog operations and unorg-mapped webhook events write to
the billing audit trail with NO organization. The old code passed a 0 sentinel,
which violates the organizations FK and turns every such write into an
unhandled 500 ("Something went wrong on the server") after the entity itself
was already committed — exactly the Add-Plan failure seen on the Plans &
Catalog page. Make the column nullable so platform-level events record
organization_id=NULL instead of a fake 0 row.
"""
from typing import Sequence, Union

from alembic import op

# revision identifiers, used by Alembic.
revision: str = 'f3a4b5c6d7e8'
down_revision: Union[str, Sequence[str], None] = 'e2a3b4c5d6e7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.alter_column("billing_audit_logs", "organization_id", nullable=True)


def downgrade() -> None:
    op.alter_column("billing_audit_logs", "organization_id", nullable=False)