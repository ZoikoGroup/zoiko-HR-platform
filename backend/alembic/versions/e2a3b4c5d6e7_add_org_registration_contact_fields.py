"""add organization registration contact fields (org_type, phone, tax_number, registered_email)

Revision ID: e2a3b4c5d6e7
Revises: b7c8d9e0f1a2
Create Date: 2026-09-24

The super-admin organization profile must carry every field collected during
registration. The registration flow captured org_type / phone / tax_number /
registered_email in RegisterRequest but the organizations table had no columns
for them, so the data was silently dropped and the profile page showed blanks.
Adds the missing columns (nullable, additive); existing rows are untouched.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = 'e2a3b4c5d6e7'
down_revision: Union[str, Sequence[str], None] = 'b7c8d9e0f1a2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_COLUMNS = [
    ("org_type", sa.String(length=100)),
    ("phone", sa.String(length=50)),
    ("tax_number", sa.String(length=100)),
    ("registered_email", sa.String(length=255)),
]


def upgrade() -> None:
    for name, col_type in _COLUMNS:
        op.add_column("organizations", sa.Column(name, col_type, nullable=True))


def downgrade() -> None:
    for name, _ in reversed(_COLUMNS):
        op.drop_column("organizations", name)