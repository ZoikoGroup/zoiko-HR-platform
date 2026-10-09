"""phase2 hot-path indexes: latest-snapshot lookups, list ordering, filtered foreign keys

Revision ID: a2b3c4d5e6f7
Revises: z1a2b3c4d5ec
Create Date: 2026-10-09

Every index is built with CREATE INDEX CONCURRENTLY (inside Alembic's autocommit block) so production tables stay
readable and writable while it builds, and with IF NOT EXISTS so the migration is idempotent. downgrade() drops them
the same way (DROP INDEX CONCURRENTLY IF EXISTS).

Why each one (from EXPLAIN on the seeded perf database, docs/benchmark-phase2.md):
  * billable_workforce_snapshots / billing_entitlement_snapshots (organization_id, <time> DESC, id DESC):
    command-center "latest snapshot per org" (DISTINCT ON) becomes a single index scan, no sort.
  * employees (created_at), (organization_id, created_at): users lists ORDER BY created_at DESC LIMIT n read the
    first n index entries instead of sorting every employee.
  * leave_requests (organization_id, created_at DESC, id DESC): /hr/leaves pages in index order.
  * employees department_id / designation_id / reporting_manager_id: list filters, per-department headcount,
    reportees. These foreign keys had no index.
  * organization_id on org-scoped lists that had none (compensation bands, salary revisions/structures, employee
    benefits, support tickets, security events, workflow workspaces); (organization_id, created_at) on login
    activity (command-center activation/adoption windows).
  * employee_id on asset requests and onboarding new hires / preboarding tasks (per-person filters).
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "a2b3c4d5e6f7"
down_revision: Union[str, Sequence[str], None] = "z1a2b3c4d5ec"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# (index name, table, columns as SQL expressions)
INDEXES = [
    ("ix_bws_org_snapshot_at", "billable_workforce_snapshots", ["organization_id", "snapshot_at DESC", "id DESC"]),
    ("ix_bes_org_computed_at", "billing_entitlement_snapshots", ["organization_id", "computed_at DESC", "id DESC"]),
    ("ix_employees_created_at", "employees", ["created_at"]),
    ("ix_employees_org_created", "employees", ["organization_id", "created_at"]),
    ("ix_employees_department_id", "employees", ["department_id"]),
    ("ix_employees_designation_id", "employees", ["designation_id"]),
    ("ix_employees_reporting_manager_id", "employees", ["reporting_manager_id"]),
    ("ix_leave_requests_org_created", "leave_requests", ["organization_id", "created_at DESC", "id DESC"]),
    ("ix_compensation_bands_organization_id", "compensation_bands", ["organization_id"]),
    ("ix_salary_revisions_organization_id", "salary_revisions", ["organization_id"]),
    ("ix_salary_structures_organization_id", "salary_structures", ["organization_id"]),
    ("ix_employee_benefits_organization_id", "employee_benefits", ["organization_id"]),
    ("ix_super_admin_support_tickets_organization_id", "super_admin_support_tickets", ["organization_id"]),
    ("ix_super_admin_security_events_organization_id", "super_admin_security_events", ["organization_id"]),
    ("ix_super_admin_login_activities_org_created", "super_admin_login_activities", ["organization_id", "created_at"]),
    ("ix_workflow_workspaces_organization_id", "workflow_workspaces", ["organization_id"]),
    ("ix_asset_requests_employee_id", "asset_requests", ["employee_id"]),
    ("ix_onboarding_new_hires_employee_id", "onboarding_new_hires", ["employee_id"]),
    ("ix_onboarding_preboarding_tasks_employee_id", "onboarding_preboarding_tasks", ["employee_id"]),
]


def _existing_tables():
    return set(sa.inspect(op.get_bind()).get_table_names())


def upgrade() -> None:
    tables = _existing_tables()
    postgres = op.get_bind().dialect.name == "postgresql"
    with op.get_context().autocommit_block():
        for name, table, cols in INDEXES:
            if table not in tables:
                continue
            if postgres:
                op.execute(f'CREATE INDEX CONCURRENTLY IF NOT EXISTS "{name}" ON "{table}" ({", ".join(cols)})')
            else:
                op.execute(f'CREATE INDEX IF NOT EXISTS "{name}" ON "{table}" ({", ".join(cols)})')


def downgrade() -> None:
    postgres = op.get_bind().dialect.name == "postgresql"
    with op.get_context().autocommit_block():
        for name, _table, _cols in reversed(INDEXES):
            op.execute(f'DROP INDEX {"CONCURRENTLY " if postgres else ""}IF EXISTS "{name}"')
