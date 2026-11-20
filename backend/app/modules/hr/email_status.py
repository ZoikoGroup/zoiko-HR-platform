"""
modules/hr/email_status.py
--------------------------
QA report #13 (BUG-8, BUG-25): an address on a real mail domain can still have no mailbox behind it. Nothing can prove a
mailbox exists without sending to it (SMTP "RCPT probing" is unreliable and gets the sender blacklisted, so it is not done),
so the address is confirmed by the first real send: when the mail server permanently refuses the recipient, every candidate
and new hire of that organization with this address is marked email_status = "bounced" and their profile says so.
Changing the address clears the mark.
"""
import logging
import re
from typing import Optional

from sqlalchemy import func

logger = logging.getLogger("zoiko.email_status")

BOUNCED = "bounced"
_PERMANENT_RECIPIENT = re.compile(r"^SMTPRecipientsRefused\b.*\bSMTP 5\d\d\b")


def is_recipient_bounce(error: Optional[str]) -> bool:
    """True for a permanent (5xx) refusal of the recipient address, as written by email_service._smtp_error_text."""
    return bool(error and _PERMANENT_RECIPIENT.search(error))


def mark_bounced(db, organization_id: Optional[int], email: str) -> int:
    """Flags the candidates and new hires with this address. Returns how many rows changed; never raises."""
    if not email or not organization_id:
        return 0
    try:
        from app.modules.hr.models import OnboardingNewHire, RecruitmentCandidate
        own = db is None
        if own:
            from app.database import SessionLocal
            db = SessionLocal()
        try:
            address = email.strip().lower()
            changed = 0
            for model in (RecruitmentCandidate, OnboardingNewHire):
                changed += (db.query(model)
                            .filter(model.organization_id == organization_id, func.lower(model.email) == address)
                            .update({model.email_status: BOUNCED}, synchronize_session=False))
            db.commit()
            return changed
        finally:
            if own:
                db.close()
    except Exception as exc:                            # a bookkeeping failure must never break the caller's flow
        logger.warning("Could not record the bounce for an address in org %s: %s", organization_id, exc)
        try:
            db.rollback()
        except Exception:
            pass
        return 0
