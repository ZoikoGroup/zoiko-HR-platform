"""List platform accounts that are shared or generic (admin@, support@, superadmin...), ZHR-PRIV-001 B01.

    python scripts/privacy_flag_generic_accounts.py             # report only (default)
    python scripts/privacy_flag_generic_accounts.py --disable   # also deactivate them and end their sessions

Report-only by default: the account you are signed in with may be one of them. Create a named replacement first (through the
platform-accounts request flow, approved by a second administrator), then re-run with --disable. The script refuses to leave
fewer than two active platform administrators.
"""
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
os.environ.setdefault("ENVIRONMENT", "testing")

import app.main  # noqa: E402,F401
from app.core.privacy import accounts  # noqa: E402
from app.core.privacy.sessions import revoke_all_sessions  # noqa: E402
from app.database import SessionLocal  # noqa: E402
from app.modules.employee.models import Employee, UserRole  # noqa: E402


def main(argv):
    db = SessionLocal()
    try:
        platform = db.query(Employee).filter(Employee.role == UserRole.SUPER_ADMIN).order_by(Employee.id).all()
        generic = [e for e in platform if accounts.is_generic_account(e.email)]
        named_active = [e for e in platform if e.is_active and not accounts.is_generic_account(e.email)]
        for e in platform:
            print(f"{'GENERIC' if e in generic else 'named  '}  id={e.id}  {'active' if e.is_active else 'inactive'}  mfa={'yes' if e.mfa_enabled else 'no'}  {e.email}")
        if "--disable" in argv:
            if len(named_active) < 2:
                print("refusing: fewer than two active NAMED platform administrators would remain. Add named accounts first.")
                return 1
            for e in generic:
                e.is_active = False
                revoke_all_sessions(e)
            db.commit()
            print(f"disabled {len(generic)} generic account(s)")
        else:
            print(f"{len(generic)} generic account(s) found (report only)")
        return 0
    finally:
        db.close()


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
