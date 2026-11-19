"""Employee e-mail: stored lower-cased, unique per organization regardless of case

Revision ID: d1e2f3a4b5c6
Revises: c6d7e8f9a0b4
Create Date: 2026-11-19

The rule (see docs/email-identity-per-organization.md):
  * the same address may have a separate account in MANY organizations;
  * inside ONE organization an address appears once, compared case-insensitively and trimmed;
  * platform accounts (organization_id IS NULL) are unique among themselves only.

1. Data: every employees.email is trimmed and lower-cased (the app now writes them that way, see Employee._normalise_email).
   Before changing anything the migration looks for rows that would collide after lower-casing (same organization, or two
   platform accounts) and STOPS with their ids if there are any: which account survives is a human decision.
2. Schema: two unique expression indexes are the race-proof guarantee behind the app's friendly check:
     uq_employees_org_lower_email       (organization_id, lower(email)) WHERE organization_id IS NOT NULL
     uq_employees_platform_lower_email  (lower(email))                  WHERE organization_id IS NULL
   uq_employees_organization_email (organization_id, email) is kept; it is implied by the first index.

Downgrade drops the two indexes. The lower-casing is not undone (it loses nothing an address can be told apart by).
"""
import logging

import sqlalchemy as sa
from alembic import op

revision = "d1e2f3a4b5c6"
down_revision = "c6d7e8f9a0b4"
branch_labels = None
depends_on = None

log = logging.getLogger("alembic.runtime.migration")

ORG_INDEX = "uq_employees_org_lower_email"
PLATFORM_INDEX = "uq_employees_platform_lower_email"


def _collisions(bind) -> list:
    rows = bind.execute(sa.text(
        """
        SELECT organization_id, lower(trim(email)) AS address, count(*) AS n
        FROM employees
        GROUP BY organization_id, lower(trim(email))
        HAVING count(*) > 1
        """
    )).fetchall()
    out = []
    for org_id, address, _n in rows:
        ids = [r[0] for r in bind.execute(sa.text(
            "SELECT id FROM employees WHERE organization_id IS NOT DISTINCT FROM :org AND lower(trim(email)) = :address ORDER BY id"
        ), {"org": org_id, "address": address}).fetchall()]
        out.append((org_id, ids))
    return out


def _index_names(bind) -> set:
    """Index names on employees, read from the catalog: the inspector leaves out expression indexes on some dialects."""
    if bind.dialect.name == "postgresql":
        sql = "SELECT indexname FROM pg_indexes WHERE tablename = 'employees'"
    elif bind.dialect.name == "sqlite":
        sql = "SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = 'employees'"
    else:
        return {i["name"] for i in sa.inspect(bind).get_indexes("employees")}
    return {r[0] for r in bind.execute(sa.text(sql)).fetchall()}


def upgrade():
    bind = op.get_bind()
    clashes = _collisions(bind)
    if clashes:
        detail = "; ".join(f"organization {org if org is not None else 'NULL (platform)'}: employee ids {ids}" for org, ids in clashes)
        raise RuntimeError(
            "Cannot make employee e-mail unique per organization ignoring case: these accounts would collide after "
            f"lower-casing. Decide which to keep (merge or change the address) and run the migration again. {detail}"
        )

    changed = bind.execute(sa.text(
        "UPDATE employees SET email = lower(trim(email)) WHERE email <> lower(trim(email)) RETURNING id"
    )).fetchall()
    for (row_id,) in changed:
        log.info("lower-cased employees.email id=%s", row_id)
    log.info("employees.email normalised on %d row(s)", len(changed))

    existing = _index_names(bind)
    if ORG_INDEX not in existing:
        op.create_index(ORG_INDEX, "employees", ["organization_id", sa.text("lower(email)")], unique=True,
                        postgresql_where=sa.text("organization_id IS NOT NULL"),
                        sqlite_where=sa.text("organization_id IS NOT NULL"))
    if PLATFORM_INDEX not in existing:
        op.create_index(PLATFORM_INDEX, "employees", [sa.text("lower(email)")], unique=True,
                        postgresql_where=sa.text("organization_id IS NULL"),
                        sqlite_where=sa.text("organization_id IS NULL"))


def downgrade():
    existing = _index_names(op.get_bind())
    if PLATFORM_INDEX in existing:
        op.drop_index(PLATFORM_INDEX, table_name="employees")
    if ORG_INDEX in existing:
        op.drop_index(ORG_INDEX, table_name="employees")
