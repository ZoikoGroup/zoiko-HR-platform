"""
scripts/copilot_weekly_report.py — the weekly copilot analytics report (M1-16). From backend/:

    python scripts/copilot_weekly_report.py                  # every organization, last 7 days
    python scripts/copilot_weekly_report.py --org 37         # one organization
    python scripts/copilot_weekly_report.py --days 30 --json

Read-only. Built from copilot_events, which hold no message text and no person, so "questions without answers" are
reported by intent and screen. Uses HR_DATABASE_URL like the app: point it at the database you mean to read.
"""
from __future__ import annotations

import argparse
import json
import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))


def _table(rows: list[dict]) -> str:
    if not rows:
        return "  (none)"
    return "\n".join(f"  {r['count']:>4}  {r['intent']:<34} {r['screen']}" for r in rows)


def main() -> None:
    ap = argparse.ArgumentParser(description="Weekly copilot analytics (M1-16)")
    ap.add_argument("--org", type=int, help="one organization id (default: all)")
    ap.add_argument("--days", type=int, default=7)
    ap.add_argument("--json", action="store_true", help="print the raw summary as JSON")
    args = ap.parse_args()

    from app.database import SessionLocal, initialize_database
    from app.modules.assistant import analytics_service

    initialize_database()
    db = SessionLocal()
    try:
        # a script has no tenant context, so the automatic tenant scope doesn't apply (core/privacy/tenant_scope.py)
        s = analytics_service.weekly_summary(db, organization_id=args.org, days=args.days)
    finally:
        db.close()

    if args.json:
        print(json.dumps(s, indent=2))
        return
    fb = s["feedback"]
    print(f"Copilot report  {s['from']} → {s['to']}  ({'organization ' + str(args.org) if args.org else 'all organizations'})")
    print(f"Answers: {s['answers']}   answered {s['answered_rate']}%   without an answer {s['unanswered_rate']}%   "
          f"handed to HR {s['handoff_rate']}%")
    print(f"Outcomes: {s['outcomes']}")
    print(f"Thumbs: {fb['rated']} rated, {fb['down']} down ({fb['thumbs_down_rate']}%)   reasons: {fb['down_reasons']}")
    print(f"Latency: p50 {s['latency_ms']['p50']} ms, p95 {s['latency_ms']['p95']} ms   models: {s['models']}")
    print("\nTop questions without an answer (intent, screen asked from):")
    print(_table(s["top_unanswered"]))
    print("\nTop thumbs-down (intent, screen asked from):")
    print(_table(s["top_thumbs_down"]))


if __name__ == "__main__":
    main()
