"""offboarding module: exit cases, clearance tasks, asset returns, settlement, exit interview,
exit documents, activity, settings and checklist templates

Revision ID: eebc54645fb2
Revises: 4c8e1f2a9b7d
Create Date: 2026-11-23 17:30:29.189736

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'eebc54645fb2'
down_revision: Union[str, Sequence[str], None] = '4c8e1f2a9b7d'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


TABLES = ['offboarding_cases', 'offboarding_checklist_templates', 'offboarding_settings', 'offboarding_activity', 'offboarding_asset_returns', 'offboarding_documents', 'offboarding_exit_interviews', 'offboarding_settlements', 'offboarding_tasks']
# keys that must stay inside one organisation (composite tenant foreign keys, as core/privacy/rls.tenant_fk_pairs lists them)
TENANT_KEYS = [
    ("offboarding_activity", "case_id", "offboarding_cases", "CASCADE"),
    ("offboarding_asset_returns", "asset_id", "assets", None),
    ("offboarding_asset_returns", "case_id", "offboarding_cases", "CASCADE"),
    ("offboarding_cases", "employee_id", "employees", None),
    ("offboarding_cases", "reportees_to_id", "employees", None),
    ("offboarding_checklist_templates", "department_id", "departments", None),
    ("offboarding_documents", "case_id", "offboarding_cases", "CASCADE"),
    ("offboarding_exit_interviews", "case_id", "offboarding_cases", "CASCADE"),
    ("offboarding_settlements", "case_id", "offboarding_cases", "CASCADE"),
    ("offboarding_tasks", "assignee_id", "employees", None),
    ("offboarding_tasks", "case_id", "offboarding_cases", "CASCADE"),
]


def upgrade() -> None:
    bind = op.get_bind()
    if "offboarding_cases" in sa.inspect(bind).get_table_names():
        return

    """Upgrade schema."""
    op.create_table('offboarding_cases',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('organization_id', sa.Integer(), nullable=False),
    sa.Column('employee_id', sa.Integer(), nullable=False),
    sa.Column('case_number', sa.String(length=30), nullable=False),
    sa.Column('exit_type', sa.String(length=30), nullable=False),
    sa.Column('status', sa.String(length=20), server_default='submitted', nullable=False),
    sa.Column('source', sa.String(length=20), server_default='hr', nullable=False),
    sa.Column('reason_category', sa.String(length=60), nullable=True),
    sa.Column('reason', sa.Text(), nullable=True),
    sa.Column('hr_notes', sa.Text(), nullable=True),
    sa.Column('resignation_date', sa.Date(), nullable=True),
    sa.Column('requested_last_day', sa.Date(), nullable=True),
    sa.Column('notice_days', sa.Integer(), nullable=True),
    sa.Column('notice_end_date', sa.Date(), nullable=True),
    sa.Column('notice_handling', sa.String(length=20), server_default='serve', nullable=False),
    sa.Column('last_working_day', sa.Date(), nullable=True),
    sa.Column('reportees_to_id', sa.Integer(), nullable=True),
    sa.Column('rehire_eligible', sa.Boolean(), nullable=True),
    sa.Column('rehire_notes', sa.Text(), nullable=True),
    sa.Column('requested_by', sa.Integer(), nullable=True),
    sa.Column('decided_by', sa.Integer(), nullable=True),
    sa.Column('decided_at', sa.DateTime(), nullable=True),
    sa.Column('decision_note', sa.Text(), nullable=True),
    sa.Column('withdrawal_requested_at', sa.DateTime(), nullable=True),
    sa.Column('withdrawal_reason', sa.Text(), nullable=True),
    sa.Column('access_revoked_at', sa.DateTime(), nullable=True),
    sa.Column('exited_at', sa.DateTime(), nullable=True),
    sa.Column('closed_at', sa.DateTime(), nullable=True),
    sa.Column('closed_by', sa.Integer(), nullable=True),
    sa.Column('created_at', sa.DateTime(), server_default=sa.text('now()'), nullable=False),
    sa.Column('updated_at', sa.DateTime(), nullable=True),
    sa.ForeignKeyConstraint(['closed_by'], ['employees.id'], ),
    sa.ForeignKeyConstraint(['decided_by'], ['employees.id'], ),
    sa.ForeignKeyConstraint(['employee_id'], ['employees.id'], ),
    sa.ForeignKeyConstraint(['organization_id'], ['organizations.id'], ),
    sa.ForeignKeyConstraint(['reportees_to_id'], ['employees.id'], ),
    sa.ForeignKeyConstraint(['requested_by'], ['employees.id'], ),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index('ix_offb_case_employee', 'offboarding_cases', ['organization_id', 'employee_id'], unique=False)
    op.create_index('ix_offb_case_lwd', 'offboarding_cases', ['status', 'last_working_day'], unique=False)
    op.create_index('ix_offb_case_org_status', 'offboarding_cases', ['organization_id', 'status'], unique=False)
    op.create_table('offboarding_checklist_templates',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('organization_id', sa.Integer(), nullable=False),
    sa.Column('name', sa.String(length=120), nullable=False),
    sa.Column('exit_types', sa.JSON(), nullable=True),
    sa.Column('department_id', sa.Integer(), nullable=True),
    sa.Column('items', sa.JSON(), nullable=False),
    sa.Column('is_default', sa.Boolean(), server_default='false', nullable=False),
    sa.Column('is_active', sa.Boolean(), server_default='true', nullable=False),
    sa.Column('created_by', sa.Integer(), nullable=True),
    sa.Column('created_at', sa.DateTime(), server_default=sa.text('now()'), nullable=False),
    sa.Column('updated_at', sa.DateTime(), nullable=True),
    sa.ForeignKeyConstraint(['created_by'], ['employees.id'], ),
    sa.ForeignKeyConstraint(['department_id'], ['departments.id'], ),
    sa.ForeignKeyConstraint(['organization_id'], ['organizations.id'], ),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index('ix_offb_tpl_org', 'offboarding_checklist_templates', ['organization_id'], unique=False)
    op.create_table('offboarding_settings',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('organization_id', sa.Integer(), nullable=False),
    sa.Column('config', sa.JSON(), nullable=False),
    sa.Column('updated_by', sa.Integer(), nullable=True),
    sa.Column('updated_at', sa.DateTime(), server_default=sa.text('now()'), nullable=True),
    sa.ForeignKeyConstraint(['organization_id'], ['organizations.id'], ),
    sa.ForeignKeyConstraint(['updated_by'], ['employees.id'], ),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('organization_id', name='uq_offb_settings_org')
    )
    op.create_table('offboarding_activity',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('organization_id', sa.Integer(), nullable=False),
    sa.Column('case_id', sa.Integer(), nullable=False),
    sa.Column('actor_id', sa.Integer(), nullable=True),
    sa.Column('action', sa.String(length=60), nullable=False),
    sa.Column('message', sa.String(length=500), nullable=False),
    sa.Column('hr_only', sa.Boolean(), server_default='false', nullable=False),
    sa.Column('created_at', sa.DateTime(), server_default=sa.text('now()'), nullable=False),
    sa.ForeignKeyConstraint(['actor_id'], ['employees.id'], ),
    sa.ForeignKeyConstraint(['case_id'], ['offboarding_cases.id'], ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['organization_id'], ['organizations.id'], ),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index('ix_offb_activity_case', 'offboarding_activity', ['organization_id', 'case_id'], unique=False)
    op.create_table('offboarding_asset_returns',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('organization_id', sa.Integer(), nullable=False),
    sa.Column('case_id', sa.Integer(), nullable=False),
    sa.Column('asset_id', sa.Integer(), nullable=False),
    sa.Column('asset_name', sa.String(length=200), nullable=True),
    sa.Column('asset_tag', sa.String(length=100), nullable=True),
    sa.Column('status', sa.String(length=12), server_default='pending', nullable=False),
    sa.Column('condition', sa.String(length=50), nullable=True),
    sa.Column('note', sa.Text(), nullable=True),
    sa.Column('recovery_amount', sa.Numeric(precision=12, scale=2), nullable=True),
    sa.Column('received_by', sa.Integer(), nullable=True),
    sa.Column('resolved_at', sa.DateTime(), nullable=True),
    sa.Column('created_at', sa.DateTime(), server_default=sa.text('now()'), nullable=False),
    sa.ForeignKeyConstraint(['asset_id'], ['assets.id'], ),
    sa.ForeignKeyConstraint(['case_id'], ['offboarding_cases.id'], ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['organization_id'], ['organizations.id'], ),
    sa.ForeignKeyConstraint(['received_by'], ['employees.id'], ),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('case_id', 'asset_id', name='uq_offb_asset_case')
    )
    op.create_index('ix_offb_asset_org_status', 'offboarding_asset_returns', ['organization_id', 'status'], unique=False)
    op.create_table('offboarding_documents',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('organization_id', sa.Integer(), nullable=False),
    sa.Column('case_id', sa.Integer(), nullable=False),
    sa.Column('kind', sa.String(length=40), nullable=False),
    sa.Column('title', sa.String(length=200), nullable=False),
    sa.Column('content', sa.JSON(), nullable=False),
    sa.Column('issued_by', sa.Integer(), nullable=True),
    sa.Column('issued_at', sa.DateTime(), server_default=sa.text('now()'), nullable=False),
    sa.Column('revoked_at', sa.DateTime(), nullable=True),
    sa.Column('access_token_hash', sa.String(length=64), nullable=True),
    sa.Column('access_expires_at', sa.DateTime(), nullable=True),
    sa.Column('downloaded_at', sa.DateTime(), nullable=True),
    sa.ForeignKeyConstraint(['case_id'], ['offboarding_cases.id'], ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['issued_by'], ['employees.id'], ),
    sa.ForeignKeyConstraint(['organization_id'], ['organizations.id'], ),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index('ix_offb_doc_case', 'offboarding_documents', ['organization_id', 'case_id'], unique=False)
    op.create_index('ix_offb_doc_token', 'offboarding_documents', ['access_token_hash'], unique=False)
    op.create_table('offboarding_exit_interviews',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('organization_id', sa.Integer(), nullable=False),
    sa.Column('case_id', sa.Integer(), nullable=False),
    sa.Column('status', sa.String(length=12), server_default='not_sent', nullable=False),
    sa.Column('questions', sa.JSON(), nullable=False),
    sa.Column('answers', sa.JSON(), nullable=True),
    sa.Column('primary_reason', sa.String(length=60), nullable=True),
    sa.Column('would_recommend', sa.Integer(), nullable=True),
    sa.Column('hr_summary', sa.Text(), nullable=True),
    sa.Column('sent_at', sa.DateTime(), nullable=True),
    sa.Column('submitted_at', sa.DateTime(), nullable=True),
    sa.Column('created_at', sa.DateTime(), server_default=sa.text('now()'), nullable=False),
    sa.ForeignKeyConstraint(['case_id'], ['offboarding_cases.id'], ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['organization_id'], ['organizations.id'], ),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('case_id', name='uq_offb_interview_case')
    )
    op.create_table('offboarding_settlements',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('organization_id', sa.Integer(), nullable=False),
    sa.Column('case_id', sa.Integer(), nullable=False),
    sa.Column('currency', sa.String(length=3), nullable=True),
    sa.Column('leave_days', sa.Numeric(precision=8, scale=2), nullable=True),
    sa.Column('daily_rate', sa.Numeric(precision=12, scale=2), nullable=True),
    sa.Column('earnings', sa.JSON(), nullable=False),
    sa.Column('deductions', sa.JSON(), nullable=False),
    sa.Column('net_amount', sa.Numeric(precision=12, scale=2), nullable=True),
    sa.Column('status', sa.String(length=16), server_default='draft', nullable=False),
    sa.Column('notes', sa.Text(), nullable=True),
    sa.Column('approved_by', sa.Integer(), nullable=True),
    sa.Column('approved_at', sa.DateTime(), nullable=True),
    sa.Column('paid_on', sa.Date(), nullable=True),
    sa.Column('payment_reference', sa.String(length=120), nullable=True),
    sa.Column('updated_by', sa.Integer(), nullable=True),
    sa.Column('created_at', sa.DateTime(), server_default=sa.text('now()'), nullable=False),
    sa.Column('updated_at', sa.DateTime(), nullable=True),
    sa.ForeignKeyConstraint(['approved_by'], ['employees.id'], ),
    sa.ForeignKeyConstraint(['case_id'], ['offboarding_cases.id'], ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['organization_id'], ['organizations.id'], ),
    sa.ForeignKeyConstraint(['updated_by'], ['employees.id'], ),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('case_id', name='uq_offb_settlement_case')
    )
    op.create_table('offboarding_tasks',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('organization_id', sa.Integer(), nullable=False),
    sa.Column('case_id', sa.Integer(), nullable=False),
    sa.Column('title', sa.String(length=200), nullable=False),
    sa.Column('description', sa.Text(), nullable=True),
    sa.Column('owner_role', sa.String(length=20), nullable=False),
    sa.Column('assignee_id', sa.Integer(), nullable=True),
    sa.Column('mandatory', sa.Boolean(), server_default='true', nullable=False),
    sa.Column('due_date', sa.Date(), nullable=True),
    sa.Column('status', sa.String(length=12), server_default='open', nullable=False),
    sa.Column('note', sa.Text(), nullable=True),
    sa.Column('exception_reason', sa.Text(), nullable=True),
    sa.Column('completed_by', sa.Integer(), nullable=True),
    sa.Column('completed_at', sa.DateTime(), nullable=True),
    sa.Column('reminded_at', sa.DateTime(), nullable=True),
    sa.Column('sort_order', sa.Integer(), server_default='0', nullable=False),
    sa.Column('created_at', sa.DateTime(), server_default=sa.text('now()'), nullable=False),
    sa.ForeignKeyConstraint(['assignee_id'], ['employees.id'], ),
    sa.ForeignKeyConstraint(['case_id'], ['offboarding_cases.id'], ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['completed_by'], ['employees.id'], ),
    sa.ForeignKeyConstraint(['organization_id'], ['organizations.id'], ),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index('ix_offb_task_assignee', 'offboarding_tasks', ['organization_id', 'assignee_id', 'status'], unique=False)
    op.create_index('ix_offb_task_case', 'offboarding_tasks', ['organization_id', 'case_id'], unique=False)

    if bind.dialect.name == "postgresql":
        # same protections as every tenant table: the isolation policy and tenant-safe keys to people and assets
        from app.core.privacy import rls
        for stmt in rls.enable_sql([{"table": t, "using": rls.TENANT_EXPR} for t in TABLES]):
            op.execute(stmt)
        major = int(bind.exec_driver_sql("SHOW server_version_num").scalar()) // 10000
        pairs = [{"child": c, "column": col, "parent": parent, "ondelete": od} for c, col, parent, od in TENANT_KEYS]
        for stmt in rls.composite_fk_sql(pairs, pg_major=major):
            op.execute(stmt)


def downgrade() -> None:
    bind = op.get_bind()
    existing = set(sa.inspect(bind).get_table_names())
    for t in reversed(TABLES):
        if t in existing:
            op.drop_table(t)
