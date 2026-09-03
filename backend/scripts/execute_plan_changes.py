"""Execute due plan changes (period-end downgrades/upgrades).

Run daily via cron or APScheduler. Per Section 13/J3: downgrades take
effect at renewal anchor date by default. This script finds all
BillingPlanChange rows where effective_at <= now and status is
SCHEDULED or BLOCKED, re-checks blockers, and executes the change.

Usage:
  python scripts/execute_plan_changes.py

Exit codes:
  0 — success (even if no changes were due)
  1 — fatal error (DB connection, etc.)
"""
import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from app.database import initialize_database, SessionLocal
from app.modules.billing.plan_change_service import execute_due_changes

initialize_database()
db = SessionLocal()

try:
    result = execute_due_changes(db)
    print(
        f"Plan change execution complete: "
        f"{result['total_due']} due, "
        f"{result['executed']} executed, "
        f"{result['blocked']} blocked, "
        f"{result['failed']} failed"
    )
    for r in result.get("results", []):
        print(f"  change_id={r['change_id']} status={r['status']}"
              + (f" reason={r.get('reason', '')}" if r.get('reason') else "")
              + (f" error={r.get('error', '')}" if r.get('error') else "")
              + (f" new_plan={r.get('new_plan', '')}" if r.get('new_plan') else ""))
except Exception as e:
    print(f"FATAL: {e}", file=sys.stderr)
    sys.exit(1)
finally:
    db.close()
