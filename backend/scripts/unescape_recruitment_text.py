"""Undo the old HTML-escaping of recruitment text ("R&amp;D" -> "R&D"); QA report #13, root cause F.

The alembic migration c6d7e8f9a0b4 runs the same repair once on deploy. This script is for checking first or re-running:

    python scripts/unescape_recruitment_text.py --dry-run           # list what would change (default)
    python scripts/unescape_recruitment_text.py --apply [--org 37]  # change it

Only table, row id and column are printed (no personal data).
"""
import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--apply", action="store_true", help="write the changes (default is a dry run)")
    parser.add_argument("--dry-run", action="store_true", help="only list the values that would change")
    parser.add_argument("--org", type=int, default=None, help="limit to one organization id")
    args = parser.parse_args()
    from app.database import engine
    from app.modules.hr.recruitment_text_repair import repair
    dry = not args.apply or args.dry_run
    with (engine.connect() if dry else engine.begin()) as conn:
        changes = repair(conn, dry_run=dry, organization_id=args.org)
    for table, row_id, column in changes:
        print(f"{'would unescape' if dry else 'unescaped'} {table}.{column} id={row_id}")
    print(f"{len(changes)} value(s) {'would change' if dry else 'changed'}.")


if __name__ == "__main__":
    main()
