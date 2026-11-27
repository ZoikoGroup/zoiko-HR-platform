"""
scripts/copilot_monitor.py — daily copilot health check (M1-17). From backend/:

    python scripts/copilot_monitor.py              # last 24 hours, every organization
    python scripts/copilot_monitor.py --hours 6 --json

Checks the copilot's error rate, p95 time to first word, model-provider errors, fallbacks to the backup model and
the estimated token spend against the HR_COPILOT_ALERT_* thresholds (app/config.py). Prints a short report; exits 1
with one "::error::" line per alert, so the scheduled GitHub Actions run (copilot-monitor.yml) fails and notifies.

Read-only. Built from copilot_events (no message text, no person). Uses HR_DATABASE_URL like the app.
"""
from __future__ import annotations

import argparse
import json
import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))


def main() -> None:
    ap = argparse.ArgumentParser(description="Copilot health check (M1-17)")
    ap.add_argument("--hours", type=int, default=24)
    ap.add_argument("--json", action="store_true")
    args = ap.parse_args()

    from app.database import SessionLocal, initialize_database
    from app.modules.assistant import analytics_service

    initialize_database()
    db = SessionLocal()
    try:
        # a script has no tenant context, so the automatic tenant scope doesn't apply (core/privacy/tenant_scope.py)
        h = analytics_service.health(db, hours=args.hours)
    finally:
        db.close()

    if args.json:
        print(json.dumps(h, indent=2))
    else:
        fw = h["first_word_ms"]
        print(f"Copilot health  {h['from']} -> {h['to']}  (all organizations)")
        print(f"  answers              {h['answers']}")
        print(f"  error rate           {h['error_rate_pct']}%   (model-provider errors: {h['provider_errors']})")
        print(f"  first word           p50 {fw['p50']} ms, p95 {fw['p95']} ms   ({fw['answers_measured']} streamed answers)")
        print(f"  fallback to backup   {h['fallbacks']} answers ({h['fallback_rate_pct']}%)")
        print(f"  tokens               {h['tokens']['prompt']} in, {h['tokens']['completion']} out")
        print(f"  estimated spend      ${h['estimated_spend_usd']}  (list prices; see HR_COPILOT_PRICES_USD_PER_MTOK)")
        print("  status               " + ("ALERT" if h["alerts"] else "OK"))
    for alert in h["alerts"]:
        print(f"::error::copilot: {alert}")
    sys.exit(1 if h["alerts"] else 0)


if __name__ == "__main__":
    main()
