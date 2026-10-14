"""(Re)apply tenant row-level security policies and per-role GRANTs. Idempotent. Run after every migration that adds a table.

    python scripts/privacy_apply_rls.py --dry-run                 # print the SQL
    HR_DATABASE_URL=postgresql://zhr_migrator:...@host/db python scripts/privacy_apply_rls.py [--force] [--grants]

--force   also FORCE row-level security (binds the table owner too). Only when the app no longer connects as the owner.
--grants  also issue the per-role GRANTs (needs the roles from scripts/privacy_db_roles.sql).
"""
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
os.environ.setdefault("ENVIRONMENT", "testing")

import app.main  # noqa: E402,F401
from sqlalchemy import create_engine  # noqa: E402

from app.core.privacy import rls  # noqa: E402
from app.database import Base  # noqa: E402


def main(argv):
    plan = rls.policy_plan(Base.metadata)
    stmts = rls.enable_sql(plan, force="--force" in argv)
    if "--grants" in argv:
        stmts += rls.grants_sql(plan, Base.metadata)
    if "--dry-run" in argv:
        print(";\n".join(stmts) + ";")
        return 0
    url = os.environ.get("HR_DATABASE_URL")
    if not url or not url.startswith("postgresql"):
        print("HR_DATABASE_URL must be a PostgreSQL URL (use --dry-run to just print the SQL)")
        return 2
    engine = create_engine(url)
    with engine.begin() as conn:
        existing = {r[0] for r in conn.exec_driver_sql("SELECT tablename FROM pg_tables WHERE schemaname = 'public'")}
        keep = [p for p in plan if p["table"] in existing]
        for s in rls.enable_sql(keep, force="--force" in argv) + (rls.grants_sql(keep, Base.metadata) if "--grants" in argv else []):
            conn.exec_driver_sql(s)
    print(f"row-level security applied to {len(keep)} tables")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
