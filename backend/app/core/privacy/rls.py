"""PostgreSQL row-level security for tenant tables (ZHR-PRIV-001 C02, C04, A02).

Two kinds of tenant table, decided by the classification registry:

  DATA     the tenant's people / finance / customer / file data. Policy: a row is visible only when its organization_id equals
           the transaction's `app.tenant_id`. No setting -> the expression is NULL -> no rows (fail closed). The platform
           role has NO grant on these tables at all.
  CONTROL  Zoiko's own records about the tenant (subscription billing, evaluations, platform support...). Policy: the same
           tenant rule, OR the transaction says `app.plane = 'PLATFORM'` (the platform role reads across tenants).

Tables that have no organization_id of their own (children of a tenant table) get an EXISTS policy through their foreign key,
so a child row is visible exactly when its parent is.

The tenant is set per transaction with `SET LOCAL app.tenant_id = <id>` (never plain SET), so a pooled connection cannot
carry one request's tenant into the next.
"""
from __future__ import annotations

from typing import Iterable

from sqlalchemy import MetaData, Table

from app.core.privacy import classification as cls

TENANT_SETTING = "app.tenant_id"
PLANE_SETTING = "app.plane"
POLICY_NAME = "zhr_tenant_isolation"

TENANT_EXPR = f"organization_id = NULLIF(current_setting('{TENANT_SETTING}', true), '')::int"
PLATFORM_EXPR = f"current_setting('{PLANE_SETTING}', true) = 'PLATFORM'"

ROLES = {
    "migrator": "zhr_migrator",
    "tenant": "zhr_app_tenant",
    "platform": "zhr_app_platform",
    "jobs": "zhr_jobs",
    "bi": "zhr_bi_readonly",
}


def q(name: str) -> str:
    return '"' + name.replace('"', '""') + '"'


def kind_of(table_name: str) -> str:
    base = cls.table_default(table_name)
    return "CONTROL" if base in cls.PLATFORM_VISIBLE else "DATA"


def _parent_fk(table: Table, tenant_tables: set[str]):
    for fk in table.foreign_keys:
        if fk.column.table.name in tenant_tables:
            return fk
    return None


def policy_plan(metadata: MetaData) -> list[dict]:
    """[{table, kind, using}] for every tenant-data table (direct or through a parent)."""
    tables = cls.tenant_data_tables(metadata)
    direct = {t.name for t in tables if "organization_id" in t.c}
    plan = []
    for t in tables:
        kind = kind_of(t.name)
        if "organization_id" in t.c:
            using = TENANT_EXPR
        else:
            fk = _parent_fk(t, {x.name for x in tables})
            if fk is None:
                continue
            parent = fk.column.table.name
            using = f"EXISTS (SELECT 1 FROM {q(parent)} p WHERE p.{q(fk.column.name)} = {q(t.name)}.{q(fk.parent.name)})"
        if kind == "CONTROL":
            using = f"({using}) OR {PLATFORM_EXPR}"
        plan.append({"table": t.name, "kind": kind, "using": using, "direct": t.name in direct})
    if "organizations" in metadata.tables:
        # a tenant sees its own organization row; the platform sees them all
        plan.append({"table": "organizations", "kind": "CONTROL",
                     "using": f"(id = NULLIF(current_setting('{TENANT_SETTING}', true), '')::int) OR {PLATFORM_EXPR}", "direct": True})
    return plan


def enable_sql(plan: Iterable[dict], force: bool = False) -> list[str]:
    out = []
    for p in plan:
        t = q(p["table"])
        out += [
            f"ALTER TABLE {t} ENABLE ROW LEVEL SECURITY",
            f"DROP POLICY IF EXISTS {POLICY_NAME} ON {t}",
            f"CREATE POLICY {POLICY_NAME} ON {t} USING ({p['using']}) WITH CHECK ({p['using']})",
        ]
        out.append(f"ALTER TABLE {t} FORCE ROW LEVEL SECURITY" if force else f"ALTER TABLE {t} NO FORCE ROW LEVEL SECURITY")
    return out


def disable_sql(plan: Iterable[dict]) -> list[str]:
    out = []
    for p in plan:
        t = q(p["table"])
        out += [f"DROP POLICY IF EXISTS {POLICY_NAME} ON {t}", f"ALTER TABLE {t} NO FORCE ROW LEVEL SECURITY", f"ALTER TABLE {t} DISABLE ROW LEVEL SECURITY"]
    return out


def grants_sql(plan: Iterable[dict], metadata: MetaData) -> list[str]:
    """GRANTs per role. The platform role gets CONTROL tables only; the tenant and job roles get everything; BI gets nothing here
    (it reads approved views only)."""
    plan = list(plan)
    control = [p["table"] for p in plan if p["kind"] == "CONTROL"]
    data = [p["table"] for p in plan if p["kind"] == "DATA"]
    tenant_tables = {p["table"] for p in plan}
    non_tenant = [t.name for t in metadata.sorted_tables if t.name not in tenant_tables]
    r = ROLES
    out = []
    for role in (r["tenant"], r["jobs"]):
        out.append(f"GRANT SELECT, INSERT, UPDATE, DELETE ON {', '.join(q(t) for t in control + data + non_tenant)} TO {role}")
    if control or non_tenant:
        out.append(f"GRANT SELECT, INSERT, UPDATE, DELETE ON {', '.join(q(t) for t in control + non_tenant)} TO {r['platform']}")
    # the platform role may NOT touch tenant data tables: say so explicitly, so a later blanket GRANT is visible in review
    if data:
        out.append(f"REVOKE ALL ON {', '.join(q(t) for t in data)} FROM {r['platform']}, {r['bi']}")
    out.append(f"GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO {r['tenant']}, {r['platform']}, {r['jobs']}")
    return out


# ── C03: a row cannot reference a row of another tenant ────────────────────────────────────────────────────────────────
# For every foreign key between two tenant tables a SECOND, composite foreign key is added: (fk_column, organization_id) ->
# (id, organization_id). The database itself then refuses a child in tenant A that points at a parent in tenant B, whatever the
# application does. NULL in either column means "no reference" and is allowed (MATCH SIMPLE), so unattributed legacy rows keep working.
# Added NOT VALID: new and changed rows are checked at once, existing rows are reported by scripts/privacy_check_cross_tenant.py
# and validated once someone has looked at them (ALTER TABLE ... VALIDATE CONSTRAINT). Nothing is rewritten or deleted.
import hashlib


def _short(name: str) -> str:
    return name if len(name) <= 60 else name[:50] + hashlib.sha1(name.encode()).hexdigest()[:8]


def tenant_fk_pairs(metadata: MetaData) -> list[dict]:
    tenant = {t.name: t for t in cls.tenant_data_tables(metadata) if "organization_id" in t.c}
    pairs = []
    for t in tenant.values():
        for fk in t.foreign_keys:
            parent = fk.column.table
            if parent.name not in tenant or fk.column.name != "id" or parent.name == t.name and fk.parent.name == "id":
                continue
            if len(fk.constraint.columns) != 1:
                continue
            # who CREATED or DECIDED a record may be a platform account (no organization): those references are bookkeeping, not
            # the record's own data, and a composite key would refuse them
            if parent.name == "employees" and (fk.parent.name.endswith("_by") or fk.parent.name in ("assigned_to", "assigned_to_id", "approver_id")):
                continue
            pairs.append({"child": t.name, "column": fk.parent.name, "parent": parent.name, "ondelete": (fk.ondelete or "").upper() or None})
    return sorted(pairs, key=lambda p: (p["child"], p["column"]))


def composite_fk_sql(pairs: Iterable[dict], pg_major: int = 17) -> list[str]:
    out, parents_done = [], set()
    for p in pairs:
        parent, child, col = q(p["parent"]), q(p["child"]), q(p["column"])
        uname = _short(f"uq_{p['parent']}_id_org")
        if p["parent"] not in parents_done:
            out.append(f"DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = '{uname}') THEN "
                       f"ALTER TABLE {parent} ADD CONSTRAINT {q(uname)} UNIQUE (id, organization_id); END IF; END $$")
            parents_done.add(p["parent"])
        name = _short(f"fk_{p['child']}_{p['column']}_tenant")
        action = ""
        if p["ondelete"] == "CASCADE":
            action = " ON DELETE CASCADE"
        elif p["ondelete"] == "SET NULL":
            if pg_major < 15:
                continue                                                  # cannot express "null only the reference" before PG 15
            action = f" ON DELETE SET NULL ({col})"
        out.append(f"DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = '{name}') THEN "
                   f"ALTER TABLE {child} ADD CONSTRAINT {q(name)} FOREIGN KEY ({col}, organization_id) REFERENCES {parent} (id, organization_id){action} NOT VALID; END IF; END $$")
    return out


def composite_fk_drop_sql(pairs: Iterable[dict]) -> list[str]:
    out = []
    for p in pairs:
        out.append(f"ALTER TABLE {q(p['child'])} DROP CONSTRAINT IF EXISTS {q(_short('fk_' + p['child'] + '_' + p['column'] + '_tenant'))}")
    for parent in sorted({p["parent"] for p in pairs}):
        out.append(f"ALTER TABLE {q(parent)} DROP CONSTRAINT IF EXISTS {q(_short('uq_' + parent + '_id_org'))}")
    return out
