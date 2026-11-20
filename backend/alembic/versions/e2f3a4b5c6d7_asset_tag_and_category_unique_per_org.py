"""Asset tags and asset category names: unique per organization, not across all organizations

Revision ID: e2f3a4b5c6d7
Revises: 4f39f5164151
Create Date: 2026-11-20

Before: assets.asset_tag and asset_categories.name each had a column-level UNIQUE across the whole table, while the app only
checked inside one organization. A second organization using a tag or a category name the first already had got a 500, and
the error confirmed that the value existed somewhere else.

After:
  uq_assets_org_asset_tag             (organization_id, asset_tag)   WHERE deleted_at IS NULL
      the app's own rule: a deleted asset's tag can be used again (asset_service checks the same)
  uq_asset_categories_org_lower_name  (organization_id, lower(name))
      the app compares category names ignoring case

1. Before changing anything the migration looks for rows that would break the new rule (two live assets with the same tag
   in one organization, or two categories whose names differ only in case in one organization). If there are any it STOPS
   and lists their ids: which one to rename is a human decision.
2. The old single-column unique constraint (or unique index) on each column is dropped, whatever it is called.
3. The two per-organization indexes are created if they are not there.

Downgrade drops the per-organization indexes and puts the global constraints back; it stops instead if two organizations
now share a tag or a category name, since the global rule could not hold.
"""
import logging

import sqlalchemy as sa
from alembic import op

revision = "e2f3a4b5c6d7"
down_revision = "4f39f5164151"
branch_labels = None
depends_on = None

log = logging.getLogger("alembic.runtime.migration")

TAG_INDEX = "uq_assets_org_asset_tag"
CATEGORY_INDEX = "uq_asset_categories_org_lower_name"
# (table, column, name the global constraint gets back on downgrade)
GLOBAL = (("assets", "asset_tag", "assets_asset_tag_key"), ("asset_categories", "name", "asset_categories_name_key"))


def _collisions(bind) -> list[str]:
    problems = []
    for org, tag in bind.execute(sa.text(
        "SELECT organization_id, asset_tag FROM assets WHERE deleted_at IS NULL "
        "GROUP BY organization_id, asset_tag HAVING count(*) > 1"
    )).fetchall():
        ids = [r[0] for r in bind.execute(sa.text(
            "SELECT id FROM assets WHERE deleted_at IS NULL AND organization_id = :o AND asset_tag = :t ORDER BY id"
        ), {"o": org, "t": tag}).fetchall()]
        problems.append(f"organization {org}: assets {ids} share one tag")
    for org, lname in bind.execute(sa.text(
        "SELECT organization_id, lower(name) FROM asset_categories GROUP BY organization_id, lower(name) HAVING count(*) > 1"
    )).fetchall():
        ids = [r[0] for r in bind.execute(sa.text(
            "SELECT id FROM asset_categories WHERE organization_id = :o AND lower(name) = :n ORDER BY id"
        ), {"o": org, "n": lname}).fetchall()]
        problems.append(f"organization {org}: asset categories {ids} have names that differ only in case")
    return problems


def _index_names(bind, table: str) -> set:
    if bind.dialect.name == "postgresql":
        sql = f"SELECT indexname FROM pg_indexes WHERE tablename = '{table}' AND schemaname = current_schema()"
    elif bind.dialect.name == "sqlite":
        sql = f"SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = '{table}'"
    else:
        return {i["name"] for i in sa.inspect(bind).get_indexes(table)}
    return {r[0] for r in bind.execute(sa.text(sql)).fetchall()}


def _drop_global_unique(bind, table: str, column: str) -> None:
    inspector = sa.inspect(bind)
    if bind.dialect.name == "sqlite":
        # SQLite keeps an unnamed column UNIQUE inside the table definition (backed by an automatic index the inspector only
        # lists with include_auto_indexes), so it cannot be dropped by name: batch mode rebuilds the table from a reflected
        # copy that leaves that constraint out (columns, data and named indexes are kept).
        auto = inspector.get_indexes(table, include_auto_indexes=True)
        if any(i.get("unique") and i["column_names"] == [column] and (i.get("name") or "").startswith("sqlite_autoindex")
               for i in auto):
            copy = sa.Table(table, sa.MetaData(), autoload_with=bind)
            for constraint in [c for c in copy.constraints if isinstance(c, sa.UniqueConstraint)
                               and [col.name for col in c.columns] == [column]]:
                copy.constraints.discard(constraint)
            copy.c[column].unique = None
            with op.batch_alter_table(table, copy_from=copy, recreate="always"):
                pass
            log.info("dropped the global unique constraint on %s.%s", table, column)
        return
    dropped = set()
    for c in inspector.get_unique_constraints(table):
        if c["column_names"] == [column] and c.get("name"):
            op.drop_constraint(c["name"], table, type_="unique")
            dropped.add(c["name"])
            log.info("dropped unique constraint %s on %s.%s", c["name"], table, column)
    for i in inspector.get_indexes(table):
        if i.get("unique") and i["column_names"] == [column] and i.get("name") and i["name"] not in dropped:
            op.drop_index(i["name"], table_name=table)
            log.info("dropped unique index %s on %s.%s", i["name"], table, column)


def upgrade():
    bind = op.get_bind()
    problems = _collisions(bind)
    if problems:
        raise RuntimeError(
            "Cannot make asset tags and asset category names unique per organization: these rows already clash. "
            "Rename (or delete) all but one in each group and run the migration again. " + "; ".join(problems)
        )

    for table, column, _name in GLOBAL:
        _drop_global_unique(bind, table, column)

    if TAG_INDEX not in _index_names(bind, "assets"):
        op.create_index(TAG_INDEX, "assets", ["organization_id", "asset_tag"], unique=True,
                        postgresql_where=sa.text("deleted_at IS NULL"), sqlite_where=sa.text("deleted_at IS NULL"))
    if CATEGORY_INDEX not in _index_names(bind, "asset_categories"):
        op.create_index(CATEGORY_INDEX, "asset_categories", ["organization_id", sa.text("lower(name)")], unique=True)


def downgrade():
    bind = op.get_bind()
    for table, column, _name in GLOBAL:
        shared = bind.execute(sa.text(
            f"SELECT {column} FROM {table} GROUP BY {column} HAVING count(*) > 1"
        )).fetchall()
        if shared:
            raise RuntimeError(
                f"Cannot put back the global unique rule on {table}.{column}: {len(shared)} value(s) are now used more "
                "than once (by different organizations, or by deleted assets). Rename them first."
            )
    if TAG_INDEX in _index_names(bind, "assets"):
        op.drop_index(TAG_INDEX, table_name="assets")
    if CATEGORY_INDEX in _index_names(bind, "asset_categories"):
        op.drop_index(CATEGORY_INDEX, table_name="asset_categories")
    for table, column, name in GLOBAL:
        if bind.dialect.name == "sqlite":
            with op.batch_alter_table(table, recreate="always") as batch:
                batch.create_unique_constraint(name, [column])
        else:
            op.create_unique_constraint(name, table, [column])
