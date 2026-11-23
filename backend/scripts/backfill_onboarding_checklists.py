"""Re-sync every new hire's "Onboarding Documents & Agreements" checklist with the submission pipeline's rules, and give
structured forms that were already submitted / verified their row in Onboarding › Documents. Idempotent: run it as often
as you like.

    python -m scripts.backfill_onboarding_checklists [--org ORG_ID]
"""
import argparse

from app.database import SessionLocal, initialize_database


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--org", type=int, default=None, help="only this organization")
    args = parser.parse_args()
    initialize_database()
    from app.modules.hr import onboarding_submissions
    db = SessionLocal()
    try:
        result = onboarding_submissions.backfill(db, organization_id=args.org)
        print(f"Re-synced {result['hires']} new hire(s); created {result['form_rows_created']} structured form row(s).")
    finally:
        db.close()


if __name__ == "__main__":
    main()
