"""billing actor references may name a platform account: drop their tenant composite keys

Revision ID: d7e1a0b2c3f9
Revises: d7e1a0b2c3f8
Create Date: 2026-10-22

`billing_audit_logs.actor_id` and `billing_confirmation_tokens.actor_id` record WHO performed a billing action. Platform accounts
(Super Admin, no organization) perform them too: deleting an organization cancels its subscription, Super Admin plan and refund
actions are audited. The composite (actor_id, organization_id) keys of e6f7a8b9c0d1 refused those rows
("fk_billing_audit_logs_actor_id_tenant"), so the actor column now follows the `*_by` bookkeeping rule in
core/privacy/rls.tenant_fk_pairs and keeps only its plain foreign key to employees.

PostgreSQL only; guarded. Downgrade re-adds the keys NOT VALID (as e6f7a8b9c0d1 did).
"""
from typing import Sequence, Union

from alembic import op

revision: str = "d7e1a0b2c3f9"
down_revision: Union[str, Sequence[str], None] = "d7e1a0b2c3f8"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

KEYS = (("billing_audit_logs", "fk_billing_audit_logs_actor_id_tenant"),
        ("billing_confirmation_tokens", "fk_billing_confirmation_tokens_actor_id_tenant"))


def upgrade() -> None:
    if op.get_bind().dialect.name != "postgresql":
        return
    for table, name in KEYS:
        op.execute(f'ALTER TABLE IF EXISTS {table} DROP CONSTRAINT IF EXISTS "{name}"')


def downgrade() -> None:
    if op.get_bind().dialect.name != "postgresql":
        return
    for table, name in KEYS:
        op.execute(f"DO $$ BEGIN IF to_regclass('{table}') IS NOT NULL AND to_regclass('employees') IS NOT NULL "
                   f"AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = '{name}') THEN "
                   f'ALTER TABLE {table} ADD CONSTRAINT "{name}" FOREIGN KEY (actor_id, organization_id) '
                   f"REFERENCES employees (id, organization_id) NOT VALID; END IF; END $$")
