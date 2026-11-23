"""document reminder requests: scheduled upload reminders and the per-document cooldown (QA R1-15, R1-16)

Revision ID: e555225b0cf9
Revises: c1d2e3f4a5b6
Create Date: 2026-11-23 09:41:34.031552

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'e555225b0cf9'
down_revision: Union[str, Sequence[str], None] = 'c1d2e3f4a5b6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


TABLE = "hr_document_reminder_requests"


def upgrade() -> None:
    bind = op.get_bind()
    if TABLE in sa.inspect(bind).get_table_names():
        return
    op.create_table(TABLE,
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('organization_id', sa.Integer(), nullable=False),
    sa.Column('employee_id', sa.Integer(), nullable=False),
    sa.Column('category_ids', sa.JSON(), nullable=True),
    sa.Column('sent_category_ids', sa.JSON(), nullable=True),
    sa.Column('message', sa.Text(), nullable=True),
    sa.Column('channel', sa.String(length=10), server_default='both', nullable=False),
    sa.Column('scheduled_for', sa.DateTime(), nullable=True),
    sa.Column('status', sa.String(length=12), server_default='scheduled', nullable=False),
    sa.Column('detail', sa.String(length=255), nullable=True),
    sa.Column('created_by', sa.Integer(), nullable=True),
    sa.Column('created_at', sa.DateTime(), server_default=sa.text('now()'), nullable=False),
    sa.Column('sent_at', sa.DateTime(), nullable=True),
    sa.ForeignKeyConstraint(['created_by'], ['employees.id'], ),
    sa.ForeignKeyConstraint(['employee_id'], ['employees.id'], ),
    sa.ForeignKeyConstraint(['organization_id'], ['organizations.id'], ),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index('ix_hdrr_due', TABLE, ['status', 'scheduled_for'], unique=False)
    op.create_index('ix_hdrr_employee', TABLE, ['organization_id', 'employee_id', 'sent_at'], unique=False)
    if bind.dialect.name == "postgresql":
        # same protections as every tenant table: the isolation policy and a tenant-safe key to the person reminded
        from app.core.privacy import rls
        for stmt in rls.enable_sql([{"table": TABLE, "using": rls.TENANT_EXPR}]):
            op.execute(stmt)
        major = int(bind.exec_driver_sql("SHOW server_version_num").scalar()) // 10000
        for stmt in rls.composite_fk_sql([{"child": TABLE, "column": "employee_id", "parent": "employees", "ondelete": None}],
                                         pg_major=major):
            op.execute(stmt)


def downgrade() -> None:
    bind = op.get_bind()
    if TABLE not in sa.inspect(bind).get_table_names():
        return
    op.drop_index('ix_hdrr_employee', table_name=TABLE)
    op.drop_index('ix_hdrr_due', table_name=TABLE)
    op.drop_table(TABLE)
