"""Report every existing row that references a row of ANOTHER organization (ZHR-PRIV-001 C03). Read-only: it never changes data.

    python scripts/privacy_check_cross_tenant.py            # human readable
    python scripts/privacy_check_cross_tenant.py --json     # machine readable
    HR_DATABASE_URL=... python scripts/privacy_check_cross_tenant.py

Exit code 0 = nothing found, 1 = at least one cross-tenant reference (fix by hand: the rows listed belong to somebody).
"""
import json
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
os.environ.setdefault("ENVIRONMENT", "testing")

import app.main  # noqa: E402,F401
from sqlalchemy import text  # noqa: E402

from app.core.privacy import rls  # noqa: E402
from app.database import Base  # noqa: E402


def find(conn, limit: int = 20) -> list[dict]:
    found = []
    for p in rls.tenant_fk_pairs(Base.metadata):
        c, col, par = rls.q(p["child"]), rls.q(p["column"]), rls.q(p["parent"])
        sql = (f"SELECT c.id, c.organization_id, par.organization_id FROM {c} c JOIN {par} par ON par.id = c.{col} "
               f"WHERE c.organization_id IS NOT NULL AND par.organization_id IS NOT NULL AND c.organization_id <> par.organization_id")
        try:
            rows = conn.execute(text(sql + f" LIMIT {int(limit)}")).fetchall()
            total = conn.execute(text(f"SELECT count(*) FROM ({sql}) x")).scalar()
        except Exception as exc:                                    # a table the database does not have yet
            conn.rollback() if hasattr(conn, "rollback") else None
            found.append({"child": p["child"], "column": p["column"], "parent": p["parent"], "error": str(exc)[:120]})
            continue
        if total:
            found.append({"child": p["child"], "column": p["column"], "parent": p["parent"], "count": int(total),
                          "examples": [{"child_id": r[0], "child_org": r[1], "parent_org": r[2]} for r in rows]})
    return found


def main(argv):
    from app.database import engine
    with engine.connect() as conn:
        report = find(conn)
    real = [r for r in report if "count" in r]
    if "--json" in argv:
        print(json.dumps(report, indent=1))
    else:
        for r in report:
            if "count" in r:
                print(f"{r['child']}.{r['column']} -> {r['parent']}: {r['count']} cross-tenant reference(s), e.g. {r['examples'][:3]}")
            else:
                print(f"{r['child']}.{r['column']} -> {r['parent']}: could not be checked ({r['error']})")
        print("no cross-tenant references found" if not real else f"{len(real)} relationship(s) with cross-tenant references")
    return 1 if real else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
