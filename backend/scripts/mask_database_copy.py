"""Mask personal data in a COPY of the database before it is used outside production (ZHR-PRIV-001 F03).

    HR_DATABASE_URL=<the copy> python scripts/mask_database_copy.py --i-am-on-a-copy [--dry-run]

Driven by the classification registry: every column of a tenant table classified above PLATFORM_META / TENANT_AGGREGATE is replaced
(names, addresses, contact details, pay, bank and tax ids, reasons, notes, file paths, secrets). Structure, ids, dates of record
creation, statuses and plan data are left so the copy still behaves like the real thing. Password hashes are replaced with an
unusable value, so nobody can sign in to a masked copy with a real password.

It will not run without --i-am-on-a-copy, and it refuses a database that is not local unless --allow-remote is also given: it rewrites
every row it touches. It is not reversible. Real data in staging or demo needs a governed exception.
"""
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
os.environ.setdefault("ENVIRONMENT", "development")

import app.main  # noqa: E402,F401
from sqlalchemy import Boolean, Date, DateTime, Enum, Integer, JSON, Numeric, String, Text, text  # noqa: E402

from app.core.privacy import classification as cls  # noqa: E402
from app.database import Base, engine  # noqa: E402

KEEP = {"id", "organization_id", "created_at", "updated_at", "status", "role", "is_active"}


def _is_masked(table: str, column) -> bool:
    if column.name in KEEP or column.primary_key or column.foreign_keys:
        return False
    level = cls.classify(table, column.name)
    return level != cls.UNCLASSIFIED and cls.rank(level) > cls.rank(cls.Level.TENANT_AGGREGATE)


def plan() -> list[tuple[str, str, str]]:
    """[(table, column, how)] for every column that gets masked."""
    out = []
    for table in cls.tenant_data_tables(Base.metadata):
        for col in table.c:
            if not _is_masked(table.name, col):
                continue
            t = col.type
            if isinstance(t, (Enum, Boolean, DateTime, Date, Integer)) and not col.nullable:
                continue                                                 # structural: cannot be blanked without breaking the row
            if isinstance(t, (String, Text)):
                how = "password" if cls.classify(table.name, col.name) == cls.Level.SECRET else ("email" if "email" in col.name else "text")
            elif isinstance(t, Numeric):
                how = "zero"
            else:
                how = "null" if col.nullable else None
                if how is None:
                    continue
            out.append((table.name, col.name, how))
    return out


def main(argv) -> int:
    if "--i-am-on-a-copy" not in argv:
        print("refusing: pass --i-am-on-a-copy to confirm this is a copy, not the real database.")
        return 2
    url = str(engine.url).lower()
    local = url.startswith("sqlite") or any(h in url for h in ("localhost", "127.0.0.1", "[::1]"))
    if not local and "--allow-remote" not in argv:
        print("refusing: the database is not local. Add --allow-remote only if this really is a disposable copy.")
        return 2
    steps = plan()
    if "--dry-run" in argv:
        for t, c, how in steps:
            print(f"{t}.{c} -> {how}")
        print(f"{len(steps)} columns would be masked")
        return 0
    with engine.begin() as conn:
        for table, column, how in steps:
            q = f'"{table}"'
            c = f'"{column}"'
            if how == "password":
                conn.execute(text(f"UPDATE {q} SET {c} = '!masked' WHERE {c} IS NOT NULL"))
            elif how == "email":
                conn.execute(text(f"UPDATE {q} SET {c} = 'masked-' || CAST(id AS VARCHAR) || '@masked.invalid' WHERE {c} IS NOT NULL"))
            elif how == "text":
                conn.execute(text(f"UPDATE {q} SET {c} = 'masked-' || CAST(id AS VARCHAR) WHERE {c} IS NOT NULL"))
            elif how == "zero":
                conn.execute(text(f"UPDATE {q} SET {c} = 0 WHERE {c} IS NOT NULL"))
            else:
                conn.execute(text(f"UPDATE {q} SET {c} = NULL"))
    print(f"masked {len(steps)} columns")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
