"""
audit_emails.py
---------------
Finds EXISTING accounts whose e-mail address is not a real, usable one (a placeholder such as name@example.com, a throwaway
inbox, or a domain that cannot receive mail). Accounts created before real-email checking existed were not checked, and are
treated as confirmed so nobody was locked out when the rule arrived.

Usage (from backend/):
    python -m scripts.audit_emails                      # list the suspicious accounts, change nothing
    python -m scripts.audit_emails --no-dns             # skip the DNS lookups (placeholder / disposable domains only)
    python -m scripts.audit_emails --require-confirmation   # ALSO mark them unconfirmed and e-mail a confirmation link

--require-confirmation makes each listed account confirm its address before it can sign in again. An account whose address
really cannot receive mail will never confirm, which is the point: an administrator should replace that address (or remove the
account). Accounts of the platform Super Admin are never touched.
"""

import argparse
import logging
import sys

from app.core import email_quality
from app.database import SessionLocal
from app.modules.employee import service
from app.modules.employee.models import Employee, UserRole

logging.basicConfig(level=logging.WARNING, format="%(asctime)s [%(levelname)s] %(message)s")


def problem_for(email: str, use_dns: bool):
    domain = email.rsplit("@", 1)[-1].strip().lower()
    problem = email_quality.problem_with_domain(domain)
    if problem:
        return problem
    if use_dns and email_quality._domain_receives_mail(domain) is False:
        return f'the domain "{domain}" cannot receive email'
    return None


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description="List accounts whose email address is not a real, usable one.")
    parser.add_argument("--no-dns", action="store_true", help="do not look the domains up in DNS")
    parser.add_argument("--require-confirmation", action="store_true", help="mark the listed accounts unconfirmed and e-mail each a confirmation link")
    args = parser.parse_args(argv)

    db = SessionLocal()
    flagged = []
    try:
        for emp in db.query(Employee).order_by(Employee.id).all():
            if not emp.email or emp.role == UserRole.SUPER_ADMIN:
                continue
            problem = problem_for(emp.email, use_dns=not args.no_dns)
            if problem:
                flagged.append((emp, problem))

        if not flagged:
            print("Every account address looks real.")
            return 0

        print(f"{len(flagged)} account(s) with an address that is not a real, usable one:\n")
        for emp, problem in flagged:
            org = emp.organization_id if emp.organization_id is not None else "-"
            print(f"  id={emp.id:<6} org={org!s:<5} {emp.email:<40} {emp.role.value if hasattr(emp.role, 'value') else emp.role:<14} {problem}")

        if args.require_confirmation:
            print("\nMarking them unconfirmed and sending confirmation links...")
            for emp, _ in flagged:
                service.begin_email_verification(db, emp)
            print(f"Done: {len(flagged)} confirmation email(s) queued.")
        else:
            print("\nNothing was changed. Re-run with --require-confirmation to make these accounts confirm their address.")
        return 0
    finally:
        db.close()


if __name__ == "__main__":
    sys.exit(main())
