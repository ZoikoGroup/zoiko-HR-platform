"""asset reports and asset settings belong to an organization

Revision ID: b3c4d5e6f7a8
Revises: a2b3c4d5e6f7
Create Date: 2026-10-09

Both tables had no organization_id, so every organization saw every other organization's asset reports and any org
admin's settings change applied to all organizations.

  * asset_reports.organization_id (nullable, indexed), backfilled from the employee who generated each report.
    Reports with no generator stay NULL: only a platform super admin sees those.
  * asset_settings.organization_id (nullable, indexed) + updated_by. Existing rows keep organization_id NULL and become
    platform defaults: an organization reads its own value for a key if it has one, otherwise the default. Org admins
    write their own rows only.
  * setting_key was globally unique; it is now unique per organization (organization_id, setting_key), plus one
    platform default per key (partial unique index WHERE organization_id IS NULL).

Reversible: downgrade drops the org-specific settings rows (they cannot be represented without the column) and
restores the global unique constraint.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "b3c4d5e6f7a8"
down_revision: Union[str, Sequence[str], None] = "a2b3c4d5e6f7"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _cols(table):
    insp = sa.inspect(op.get_bind())
    return {c["name"] for c in insp.get_columns(table)} if insp.has_table(table) else None


def _setting_key_uniques():
    insp = sa.inspect(op.get_bind())
    return [u["name"] for u in insp.get_unique_constraints("asset_settings") if u["column_names"] == ["setting_key"] and u["name"]]


def upgrade() -> None:
    reports = _cols("asset_reports")
    if reports is not None and "organization_id" not in reports:
        op.add_column("asset_reports", sa.Column("organization_id", sa.Integer(), sa.ForeignKey("organizations.id"), nullable=True))
        op.create_index("ix_asset_reports_organization_id", "asset_reports", ["organization_id"])
        op.execute(
            "UPDATE asset_reports SET organization_id = "
            "(SELECT employees.organization_id FROM employees WHERE employees.id = asset_reports.generated_by) "
            "WHERE generated_by IS NOT NULL"
        )

    settings = _cols("asset_settings")
    if settings is None:
        return
    with op.batch_alter_table("asset_settings") as batch:
        if "organization_id" not in settings:
            batch.add_column(sa.Column("organization_id", sa.Integer(), sa.ForeignKey("organizations.id"), nullable=True))
        if "updated_by" not in settings:
            batch.add_column(sa.Column("updated_by", sa.Integer(), sa.ForeignKey("employees.id"), nullable=True))
        for name in _setting_key_uniques():
            batch.drop_constraint(name, type_="unique")
    op.create_index("ix_asset_settings_organization_id", "asset_settings", ["organization_id"])
    op.create_index("uq_asset_settings_org_key", "asset_settings", ["organization_id", "setting_key"], unique=True)
    op.create_index("uq_asset_settings_default_key", "asset_settings", ["setting_key"], unique=True,
                    postgresql_where=sa.text("organization_id IS NULL"), sqlite_where=sa.text("organization_id IS NULL"))


def downgrade() -> None:
    settings = _cols("asset_settings")
    if settings is not None and "organization_id" in settings:
        op.execute("DELETE FROM asset_settings WHERE organization_id IS NOT NULL")
        for name in ("uq_asset_settings_default_key", "uq_asset_settings_org_key", "ix_asset_settings_organization_id"):
            op.drop_index(name, table_name="asset_settings")
        with op.batch_alter_table("asset_settings") as batch:
            batch.drop_column("updated_by")
            batch.drop_column("organization_id")
            batch.create_unique_constraint("asset_settings_setting_key_key", ["setting_key"])
    reports = _cols("asset_reports")
    if reports is not None and "organization_id" in reports:
        op.drop_index("ix_asset_reports_organization_id", table_name="asset_reports")
        with op.batch_alter_table("asset_reports") as batch:
            batch.drop_column("organization_id")
