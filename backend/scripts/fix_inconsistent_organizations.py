"""
fix_inconsistent_organizations.py  (ZHR-35 data fix)
----------------------------------------------------
Finds organizations stuck in the inconsistent state the old split delete paths
left behind - still listed on the Organizations page, but with nobody able to
sign in because their administrators were removed or every user is inactive -
and (only when explicitly told to) brings them into the consistent *deleted*
state using the same soft-delete service the app uses.

SAFE BY DEFAULT: with no flags it only prints a report and changes nothing.

    python -m scripts.fix_inconsistent_organizations
        -> report only (dry run)

    python -m scripts.fix_inconsistent_organizations --apply --ids 4,9 --actor you@example.com
        -> soft-deletes exactly organizations 4 and 9 (the ids you approved from
           the report), attributed to that Super Admin, with an audit row each.

Nothing is ever hard-deleted. Each change is undone by the Restore action on the
Organizations page (Deleted filter), or by restore_organization().

Rollback for an applied run: use Restore on the Organizations page (Deleted filter).
"""

import argparse
import sys
from typing import Optional

from sqlalchemy.orm import Session

from app.modules.employee.models import Employee, UserRole
from app.modules.hr.models import Organization
from app.modules.super_admin import organization_service

REASON = "ZHR-35 data fix: organization had no active administrator or users"


def find_inconsistent(db: Session) -> list[dict]:
    """Organizations that are listed as live but cannot be used by anyone."""
    findings = []
    for org in db.query(Organization).order_by(Organization.id).all():  # deleted ones are already filtered out
        members = db.query(Employee).filter(Employee.organization_id == org.id, Employee.role != UserRole.SUPER_ADMIN).all()
        admins = [m for m in members if m.role == UserRole.ADMIN]
        active_members = [m for m in members if m.is_active]
        active_admins = [m for m in admins if m.is_active]
        problems = []
        if not members:
            problems.append("no users at all")
        elif not active_members:
            problems.append("every user is inactive (nobody can sign in)")
        elif not active_admins:
            problems.append("no active organization administrator")
        if problems:
            findings.append({
                "id": org.id, "name": org.name, "status": getattr(org.status, "value", str(org.status)),
                "users_total": len(members), "users_active": len(active_members),
                "admins_total": len(admins), "admins_active": len(active_admins),
                "problem": "; ".join(problems),
                "change": f"soft-delete organization {org.id} ({org.name}) and deactivate its {len(active_members)} active user(s)",
            })
    return findings


def apply_fix(db: Session, ids: list[int], actor_email: str) -> list[int]:
    actor = db.query(Employee).filter(Employee.email == actor_email, Employee.role == UserRole.SUPER_ADMIN).first()
    if actor is None:
        raise SystemExit(f"--actor must be an existing Super Admin email; '{actor_email}' is not.")
    allowed = {f["id"]: f for f in find_inconsistent(db)}
    done = []
    for org_id in ids:
        if org_id not in allowed:
            print(f"skip {org_id}: not in the inconsistent set (already consistent or already deleted)")
            continue
        org = organization_service.get_organization(db, org_id)
        organization_service.delete_organization(db, org_id, actor, org.name, REASON, source="data-fix")
        done.append(org_id)
        print(f"fixed {org_id}: {allowed[org_id]['change']}")
    return done


def main(argv: Optional[list[str]] = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--apply", action="store_true", help="make the changes (default: report only)")
    parser.add_argument("--ids", help="comma-separated organization ids approved for the fix (required with --apply)")
    parser.add_argument("--actor", help="Super Admin email the change is attributed to (required with --apply)")
    args = parser.parse_args(argv)

    from app.database import SessionLocal

    db = SessionLocal()
    try:
        findings = find_inconsistent(db)
        print(f"{len(findings)} inconsistent organization(s) found.")
        for f in findings:
            print(f"  #{f['id']} {f['name']!r} [{f['status']}] users {f['users_active']}/{f['users_total']} active, "
                  f"admins {f['admins_active']}/{f['admins_total']} active - {f['problem']}")
            print(f"      change: {f['change']}")
        if not args.apply:
            print("\nDry run: nothing was changed. Re-run with --apply --ids <approved ids> --actor <super admin email>.")
            return 0
        if not args.ids or not args.actor:
            print("--apply needs both --ids and --actor.", file=sys.stderr)
            return 2
        ids = [int(x) for x in args.ids.split(",") if x.strip()]
        done = apply_fix(db, ids, args.actor)
        print(f"\nApplied to {len(done)} organization(s): {done}")
        return 0
    finally:
        db.close()


if __name__ == "__main__":
    raise SystemExit(main())
