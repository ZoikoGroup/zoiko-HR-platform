"""The onboarding flow around the CRUD in service.py:

    offer accepted / new hire added
        -> start_onboarding: checklist templates from Settings are assigned (task owners emailed), the Settings' required
           documents are requested, and the new hire is emailed a pre-onboarding link
    pre-onboarding link (no account needed)
        -> the new hire uploads requested documents and enters their address and emergency contact
    HR reviews documents (a rejection emails the new hire to upload again), works the checklists, runs orientation
    complete
        -> only when the checklists are done and documents approved (Settings can relax this, or HR can override):
           the employee account is created and admins + the manager are emailed

Emails never undo or fail the change that triggered them.
"""
from __future__ import annotations

import contextvars
import hashlib
import logging
import secrets
from contextlib import contextmanager
from datetime import date, datetime, timedelta
from typing import Optional

from sqlalchemy.orm import Session

from app.core.exceptions import BadRequestException, NotFoundException
from app.modules.hr.models import (
    OnboardingChecklist, OnboardingChecklistItem, OnboardingDocument, OnboardingNewHire, OnboardingOrientation,
    OnboardingOrientationAttendee, OnboardingSettings,
)

logger = logging.getLogger("zoiko.onboarding")

# ── vocabulary ───────────────────────────────────────────────────────────────────────────────────────────────────────
STATUS_TRANSITIONS = {
    "offer_sent": {"offer_accepted", "cancelled"},
    "offer_accepted": {"pre_joining", "in_progress", "cancelled"},
    "pre_joining": {"offer_accepted", "in_progress", "cancelled"},
    "in_progress": {"pre_joining", "completed", "cancelled"},
    "completed": set(),
    "cancelled": {"offer_accepted"},               # reopened
}
STATUSES = tuple(STATUS_TRANSITIONS)
ACTIVE_STATUSES = ("offer_sent", "offer_accepted", "pre_joining", "in_progress")
JOINING_STATUSES = ("not_joined", "joined", "no_show", "deferred")
ATTENDEE_STATUSES = ("pending", "attended", "absent", "excused")
DOCUMENT_LABELS = {
    # ── legacy upload categories ──
    "id_proof": "ID proof",
    "education_certificates": "Education certificates",
    "experience_letters": "Experience letters",
    "bank_details": "Bank details",
    "other": "Other document",
    # ── 10 standard onboarding package documents ──
    "offer_letter": "Offer Letter",
    "job_description": "Job Description",
    "daily_kpi": "Daily Key Performance Indicators (KPIs)",
    "nda": "Non-Disclosure Agreement (NDA)",
    "employment_contract": "Employment Contract",
    "exclusivity_affidavit": "Affidavit of Employment Exclusivity",
    "self_disclosure": "Voluntary Self-Disclosure Form",
    "job_application": "Job Application Form",
    "daily_work_report": "Daily Work Report (DWR) Template",
    "velocity_report": "Project Velocity Report Template",
}


def check_status_transition(current: str, new: Optional[str]) -> None:
    if new is None or new == current:
        return
    if new not in STATUS_TRANSITIONS:
        raise BadRequestException(f"Unknown onboarding status: {new}.")
    if new not in STATUS_TRANSITIONS.get(current, set()):
        if current == "completed":
            raise BadRequestException("Onboarding is already completed; the employee account exists.")
        raise BadRequestException(f"Onboarding cannot move from {current.replace('_', ' ')} to {new.replace('_', ' ')}.")


# ── helpers ──────────────────────────────────────────────────────────────────────────────────────────────────────────
def app_base() -> str:
    try:
        from app.services.email_service import _login_url
        return _login_url().rsplit("/login", 1)[0]
    except Exception:
        return ""


def _org_name(db: Session, organization_id) -> str:
    from app.modules.hr.models import Organization
    org = db.query(Organization).filter(Organization.id == organization_id).first()
    return (org.name if org is not None else "") or "your new employer"


def _first_name(hire: OnboardingNewHire) -> str:
    return (hire.candidate_name or "").strip().split(" ")[0] or "there"


def _date_display(d) -> Optional[str]:
    return d.strftime("%a, %b %d, %Y") if d else None


def _hash(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def _admins(db: Session, organization_id, roles=("admin", "hr_admin")):
    from app.modules.employee.models import Employee, UserRole
    return (db.query(Employee)
            .filter(Employee.organization_id == organization_id, Employee.role.in_([UserRole(r) for r in roles]),
                    Employee.is_active.is_(True)).all())


# ── settings ─────────────────────────────────────────────────────────────────────────────────────────────────────────
def get_settings(db: Session, organization_id: int) -> OnboardingSettings:
    row = db.query(OnboardingSettings).filter(OnboardingSettings.organization_id == organization_id).first()
    if row is None:
        from app.modules.hr import welcome_message as WM
        row = OnboardingSettings(organization_id=organization_id, auto_template_ids=[],
                                 required_document_categories=["id_proof", "bank_details"], auto_send_portal_invite=True,
                                 portal_link_days=30, reminder_days=3, require_checklists_complete=True,
                                 require_documents_approved=True, welcome_message=WM.DEFAULT_WELCOME_MESSAGE,
                                 welcome_signature=WM.DEFAULT_WELCOME_SIGNATURE)
        db.add(row)
        db.commit()
        db.refresh(row)
    return row


def update_settings(db: Session, organization_id: int, data: dict) -> OnboardingSettings:
    from app.modules.hr import welcome_message as WM
    row = get_settings(db, organization_id)
    if "welcome_message" in data:
        WM.validate_message(data["welcome_message"])          # 422: too long or an unknown {{placeholder}}
        if not (data["welcome_message"] or "").strip():
            data["welcome_message"] = WM.DEFAULT_WELCOME_MESSAGE   # an empty message reads as the default
    if "welcome_signature" in data:
        WM.validate_signature(data["welcome_signature"])
        data["welcome_signature"] = (data["welcome_signature"] or "").strip() or WM.DEFAULT_WELCOME_SIGNATURE
    if "auto_template_ids" in data and data["auto_template_ids"] is not None:
        ids = sorted({int(i) for i in data["auto_template_ids"]})
        found = {i for (i,) in db.query(OnboardingChecklist.id).filter(
            OnboardingChecklist.id.in_(ids), OnboardingChecklist.organization_id == organization_id,
            OnboardingChecklist.onboarding_new_hire_id.is_(None), OnboardingChecklist.is_deleted == False).all()}  # noqa: E712
        if found != set(ids):
            raise BadRequestException("One of the selected checklist templates no longer exists.")
        data["auto_template_ids"] = ids
    if "required_document_categories" in data and data["required_document_categories"] is not None:
        from app.modules.hr import onboarding_org_settings as OS
        active = OS.active_keys(db, organization_id)        # the organisation's own upload categories
        bad = [c for c in data["required_document_categories"] if c not in active]
        if bad:
            raise BadRequestException(f"Unknown document categories: {', '.join(bad)}.")
    for field, value in data.items():
        if value is not None:
            setattr(row, field, value)
    db.commit()
    db.refresh(row)
    return row


# ── welcome (offer accepted e-mail, invite, portal) ────────────────────────────────────────────────────────────────
# While an offer acceptance is being processed, start_onboarding creates the pre-onboarding link without e-mailing it:
# the candidate gets one offer-accepted welcome e-mail (send_offer_accepted_welcome) that carries the link.
_INVITE_DEFERRED: contextvars.ContextVar[bool] = contextvars.ContextVar("onboarding_invite_deferred", default=False)


@contextmanager
def invite_deferred():
    token = _INVITE_DEFERRED.set(True)
    try:
        yield
    finally:
        _INVITE_DEFERRED.reset(token)


def _hr_contact(db: Session, organization_id: int) -> tuple[str, str]:
    """The HR contact from Settings › Company Profile (name, e-mail); blanks when not set."""
    try:
        from app.modules.hr import company_profile as CP
        profile = CP.get_profile(db, organization_id)
        name = str(profile.get("hr_contact_name") or "").strip()
        email = str(profile.get("hr_contact_email") or "").strip()
        return name, (email if CP.EMAIL.match(email) else "")
    except Exception:
        logger.warning("HR contact could not be read for organization %s", organization_id)
        return "", ""


def _plural(n: int, one: str, many: Optional[str] = None) -> str:
    return f"{n} {one if n == 1 else (many or one + 's')}"


def next_steps(db: Session, hire: OnboardingNewHire) -> list[dict]:
    """What the new hire still has to do, from real data. Steps with nothing to do are left out."""
    steps: list[dict] = []
    if not (hire.profile_details or {}).get("details_submitted_at"):
        steps.append({"title": "Confirm your personal details",
                      "detail": "Check your contact details, address and emergency contact."})
    from app.modules.hr.onboarding_package import PACKAGE_CATEGORIES
    rows = (db.query(OnboardingDocument)
            .filter(OnboardingDocument.onboarding_new_hire_id == hire.id, OnboardingDocument.is_deleted == False)  # noqa: E712
            .order_by(OnboardingDocument.id).all())
    uploads = [d for d in rows if d.status in ("requested", "rejected") and not d.document_id
               and d.category not in PACKAGE_CATEGORIES]
    if uploads:
        steps.append({"title": f"Upload {_plural(len(uploads), 'document')}",
                      "detail": ", ".join(d.title for d in uploads)})
    done = {d.category for d in rows if d.status == "approved"}
    try:
        from app.modules.hr import onboarding_package
        package = [d for d in onboarding_package._org().documents_for_hire(db, hire)
                   if d.get("category") != "offer_letter" and d.get("category") not in done]
    except Exception:
        logger.warning("offer package documents could not be listed for new hire %s", hire.id)
        package = []
    action = [d for d in package if d.get("mode") in ("SIGN", "ACKNOWLEDGE", "COMPLETE")]
    if action:
        modes = {d["mode"] for d in action}
        verbs = [v for m, v in (("SIGN", "sign"), ("ACKNOWLEDGE", "acknowledge"), ("COMPLETE", "complete")) if m in modes]
        verb = verbs[0] if len(verbs) == 1 else ", ".join(verbs[:-1]) + " or " + verbs[-1]
        steps.append({"title": f"{verb[0].upper()}{verb[1:]} {_plural(len(action), 'onboarding document')} from your offer package",
                      "detail": ", ".join(d.get("title") or "" for d in action)})
    info = [d for d in package if d.get("mode") == "INFO"]
    if info:
        steps.append({"title": f"Review {_plural(len(info), 'policy', 'policies')} shared for your information",
                      "detail": ", ".join(d.get("title") or "" for d in info)})
    return steps


def welcome_context(db: Session, hire: OnboardingNewHire, settings: Optional[OnboardingSettings] = None) -> dict:
    """Everything the welcome e-mails show besides the link: the rendered message, signature, steps and HR contact.
    Values come from the hire's own organisation only."""
    from app.modules.hr import welcome_message as WM
    settings = settings or get_settings(db, hire.organization_id)
    company = _org_name(db, hire.organization_id)
    rendered = WM.render_for_hire(db, hire, settings, company_name=company)
    hr_name, hr_email = _hr_contact(db, hire.organization_id)
    return {
        "company_name": company,
        "first_name": _first_name(hire),
        "start_date_display": WM.long_date(hire.joining_date),
        "welcome_blocks": rendered["blocks"],
        "welcome_text": rendered["text"],
        "welcome_signature": rendered["signature"],
        "next_steps": next_steps(db, hire),
        "hr_contact_name": hr_name,
        "hr_contact_email": hr_email,
    }


def _portal_welcome(db: Session, hire: OnboardingNewHire) -> dict:
    """The same rendered welcome message the e-mails carry (the portal never formats the raw text itself)."""
    from app.modules.hr import welcome_message as WM
    rendered = WM.render_for_hire(db, hire, company_name=_org_name(db, hire.organization_id))
    return {"welcome_message": rendered["text"], "welcome_blocks": rendered["blocks"], "welcome_html": rendered["html"],
            "welcome_signature": rendered["signature"]}


def _hire_for_offer(db: Session, offer) -> Optional[OnboardingNewHire]:
    from app.modules.hr.models import RecruitmentCandidate
    if not offer.candidate_id:
        return None
    cand = db.query(RecruitmentCandidate).filter(RecruitmentCandidate.id == offer.candidate_id).first()
    if cand is None or not cand.onboarding_new_hire_id or cand.organization_id != offer.organization_id:
        return None
    return (db.query(OnboardingNewHire)
            .filter(OnboardingNewHire.id == cand.onboarding_new_hire_id, OnboardingNewHire.organization_id == offer.organization_id,
                    OnboardingNewHire.is_deleted == False).first())  # noqa: E712


def _link_signed_offer(db: Session, hire: OnboardingNewHire, offer) -> bool:
    """Put the signed offer letter in the new hire's portal (reused, never issued twice). True when it is there."""
    if not getattr(offer, "document_id", None):
        return False
    try:
        from app.modules.hr import onboarding_package
        row = (db.query(OnboardingDocument)
               .filter(OnboardingDocument.onboarding_new_hire_id == hire.id, OnboardingDocument.category == "offer_letter",
                       OnboardingDocument.is_deleted == False).first())  # noqa: E712
        if row is not None and row.document_id:
            return row.document_id == offer.document_id and row.status == "approved"
        linked = onboarding_package._link_recruitment_offer(db, hire, row)
        db.commit()
        return linked is not None
    except Exception:
        db.rollback()
        logger.warning("signed offer letter could not be linked into the portal of new hire %s", hire.id)
        return False


def send_offer_accepted_welcome(db: Session, offer, deferred_mail: Optional[list] = None) -> bool:
    """The one e-mail a candidate gets when their offer is accepted: confirmation, welcome message, next steps and the
    pre-onboarding link (or, when invites are not automatic, that HR will send it). Sent once per offer
    (recruitment_offers.welcome_email_sent_at); never fails the acceptance.

    deferred_mail: candidate e-mails held back while the acceptance was processed (the acceptance confirmation document,
    see doc_templates.notify.hold_candidate_mail): their link and attachment go into this e-mail. If this e-mail is not
    sent, they are sent on their own as before."""
    from sqlalchemy import update
    from app.modules.hr.models import RecruitmentOffer
    deferred_mail = deferred_mail or []
    sent = False
    try:
        hire = _hire_for_offer(db, offer)
        if hire is None or not hire.email or hire.status not in ACTIVE_STATUSES:
            return False
        now = datetime.utcnow()
        claimed = db.execute(update(RecruitmentOffer)
                             .where(RecruitmentOffer.id == offer.id, RecruitmentOffer.welcome_email_sent_at.is_(None))
                             .values(welcome_email_sent_at=now)).rowcount
        db.commit()
        if claimed != 1:
            return False
        try:
            sent = _send_offer_accepted_welcome(db, offer, hire, deferred_mail, now)
        finally:
            if not sent:                   # a later attempt may try again
                db.execute(update(RecruitmentOffer).where(RecruitmentOffer.id == offer.id).values(welcome_email_sent_at=None))
                db.commit()
    except Exception:
        db.rollback()
        logger.exception("offer accepted welcome e-mail failed for offer %s", getattr(offer, "id", None))
        sent = False
    finally:
        if not sent:
            for item in deferred_mail:
                try:
                    item["send"]()
                except Exception:
                    logger.warning("held candidate e-mail could not be sent for offer %s", getattr(offer, "id", None))
    return sent


def _send_offer_accepted_welcome(db: Session, offer, hire: OnboardingNewHire, deferred_mail: list, now: datetime) -> bool:
    from app.services.email_service import send_offer_accepted_welcome as send_mail
    settings = get_settings(db, hire.organization_id)
    url = expires = None
    if settings.auto_send_portal_invite:
        url = current_portal_url(db, hire)
        expires = hire.portal_expires_at
    letter_in_portal = _link_signed_offer(db, hire, offer)
    ctx = welcome_context(db, hire, settings)
    accepted = getattr(offer, "accepted_at", None) or now
    attachments = [item["attachment"] for item in deferred_mail if item.get("attachment")]
    documents = [{"label": item["label"], "url": item["url"]} for item in deferred_mail if item.get("url")]
    ok = bool(send_mail(
        hire.email, ctx["first_name"], ctx["company_name"], offer.position or hire.position,
        start_date_display=ctx["start_date_display"], manager_name=hire.manager_name,
        accepted_on_display=f"{accepted.day} {accepted:%B %Y}", portal_url=url,
        expires_display=f"{expires.day} {expires:%B %Y}" if (url and expires) else None,
        signed_letter_in_portal=letter_in_portal, welcome_blocks=ctx["welcome_blocks"],
        welcome_signature=ctx["welcome_signature"], next_steps=ctx["next_steps"], hr_contact_name=ctx["hr_contact_name"],
        hr_contact_email=ctx["hr_contact_email"], documents=documents, attachments=attachments or None,
        db=db, organization_id=hire.organization_id))
    if ok:
        if url:
            hire.portal_invited_at = datetime.utcnow()
            db.commit()
        from app.modules.hr.service import log_onboarding_activity
        log_onboarding_activity(db, hire.id, "Offer accepted email sent",
                                f"{hire.candidate_name} was sent the offer-accepted welcome email"
                                + (" with their pre-onboarding link." if url else "; HR will send the pre-onboarding link."),
                                hire.organization_id)
    return ok


# ── pre-onboarding link ──────────────────────────────────────────────────────────────────────────────────────────────
def portal_url(token: str) -> str:
    return f"{app_base()}/onboarding-portal/{token}"


def issue_portal_link(db: Session, hire: OnboardingNewHire, send: bool = True) -> dict:
    """A fresh link. Older valid links remain active until expired. Emails it to the new hire when send=True."""
    if hire.status not in ACTIVE_STATUSES:
        raise BadRequestException("A pre-onboarding link can only be sent while onboarding is active.")
    settings = get_settings(db, hire.organization_id)
    token = secrets.token_urlsafe(32)
    days = max(int(settings.portal_link_days or 30), 1)
    expires = datetime.utcnow() + timedelta(days=days)
    if hire.joining_date:
        expires = max(expires, datetime.combine(hire.joining_date, datetime.min.time()) + timedelta(days=7))

    # Preserve previous token hash so any already emailed links continue working
    new_hash = _hash(token)
    details = dict(hire.profile_details or {})
    token_hashes = list(details.get("_token_hashes") or [])
    if hire.portal_token_hash and hire.portal_token_hash not in token_hashes:
        token_hashes.append(hire.portal_token_hash)
    if new_hash not in token_hashes:
        token_hashes.append(new_hash)
    details["_token_hashes"] = token_hashes
    hire.profile_details = details

    hire.portal_token_hash = new_hash
    try:
        from app.core.crypto import encrypt_secret
        hire.portal_token_enc = encrypt_secret(token)
    except Exception:
        hire.portal_token_enc = None
    hire.portal_expires_at = expires
    hire.portal_invited_at = datetime.utcnow()
    db.commit()
    sent = False
    if send:
        try:
            from app.services.email_service import send_onboarding_invite
            requested = db.query(OnboardingDocument).filter(
                OnboardingDocument.onboarding_new_hire_id == hire.id, OnboardingDocument.is_deleted == False,  # noqa: E712
                OnboardingDocument.status.in_(["requested", "rejected"])).count()
            ctx = welcome_context(db, hire, settings)
            sent = bool(send_onboarding_invite(
                hire.email, _first_name(hire), ctx["company_name"], hire.position, portal_url(token),
                expires.strftime("%b %d, %Y"), joining_date_display=ctx["start_date_display"],
                manager_name=hire.manager_name, documents_requested=requested, welcome_blocks=ctx["welcome_blocks"],
                welcome_signature=ctx["welcome_signature"], next_steps=ctx["next_steps"],
                hr_contact_name=ctx["hr_contact_name"], hr_contact_email=ctx["hr_contact_email"],
                db=db, organization_id=hire.organization_id))
        except Exception:
            logger.exception("onboarding invite email failed")
    from app.modules.hr.service import log_onboarding_activity
    log_onboarding_activity(db, hire.id, "Pre-onboarding link sent" if sent else "Pre-onboarding link created",
                            f"Pre-onboarding link for {hire.candidate_name}, valid until {expires:%b %d, %Y}.", hire.organization_id)
    return {"url": portal_url(token), "expires_at": expires, "email_sent": sent}


def hire_for_token(db: Session, token: str) -> OnboardingNewHire:
    if not token or len(token) < 20:
        raise NotFoundException("Pre-onboarding link")
    target_hash = _hash(token)
    hire = (db.query(OnboardingNewHire)
            .filter(OnboardingNewHire.portal_token_hash == target_hash, OnboardingNewHire.is_deleted == False)  # noqa: E712
            .first())
    if hire is None:
        # Check active new hires for token hash in history list
        active_candidates = (db.query(OnboardingNewHire)
                             .filter(OnboardingNewHire.is_deleted == False, OnboardingNewHire.status.in_(ACTIVE_STATUSES))
                             .all())
        for candidate in active_candidates:
            token_list = (candidate.profile_details or {}).get("_token_hashes") or []
            if target_hash in token_list:
                hire = candidate
                break

    if hire is None or hire.portal_expires_at is None or hire.portal_expires_at < datetime.utcnow() \
            or hire.status not in ACTIVE_STATUSES:
        raise NotFoundException("Pre-onboarding link")
    return hire


def _details_with_form_answers(db, hire) -> dict:
    """The contact & address details for the portal, with blanks filled from the new starter form the hire already
    filled in (the same address is asked in both places; it is typed once)."""
    details = dict(hire.profile_details or {})
    try:
        from app.modules.hr import onboarding_documents as OD
        from app.modules.hr.models import OnboardingFormSubmission
        sub = (db.query(OnboardingFormSubmission)
               .filter(OnboardingFormSubmission.new_hire_id == hire.id,
                       OnboardingFormSubmission.canonical_id.in_(list(OD.FORMS)))
               .order_by(OnboardingFormSubmission.id.desc()).all())
        for s in sub:
            vals = OD._values(s)
            if not vals.get("address_line1"):
                continue
            line = ", ".join(v for v in (vals.get("address_line1"), vals.get("address_line2")) if v)
            if not OD.details_address_line(details):
                details["address"] = line
            for form_key, detail_key in OD.PREFILL_FROM_DETAILS.items():
                if form_key != "address_line1" and vals.get(form_key) and not str(details.get(detail_key) or "").strip():
                    details[detail_key] = vals[form_key]
            break
    except Exception:
        logger.warning("could not prefill the portal details of new hire %s from their forms", hire.id)
    return details


def portal_view(db: Session, hire: OnboardingNewHire) -> dict:
    from app.modules.hr import onboarding_package

    docs = (db.query(OnboardingDocument)
            .filter(OnboardingDocument.onboarding_new_hire_id == hire.id, OnboardingDocument.is_deleted == False)  # noqa: E712
            .order_by(OnboardingDocument.id).all())
    sessions = (db.query(OnboardingOrientation)
                .join(OnboardingOrientationAttendee, OnboardingOrientationAttendee.session_id == OnboardingOrientation.id)
                .filter(OnboardingOrientationAttendee.onboarding_new_hire_id == hire.id,
                        OnboardingOrientationAttendee.is_deleted == False, OnboardingOrientation.is_deleted == False,  # noqa: E712
                        OnboardingOrientation.status != "cancelled").all())

    base = app_base()
    pkg = onboarding_package.portal_items(db, hire)
    from app.modules.hr import onboarding_org_settings as OS
    cats = OS.category_map(db, hire.organization_id)
    doc_items = []
    for d in docs:
        if d.kind == "form" or d.form_submission_id:
            continue                 # structured forms are filled in their own section (and listed under "My documents")
        extra = pkg.get(d.id) or {}
        cat = cats.get(d.category)
        mode = extra.get("mode")
        is_signable = mode == "SIGN" or (mode is None and bool(d.document_id))
        sign_url = None
        needs_declaration = d.category == "exclusivity_affidavit" and d.status != "approved" \
            and not (hire.profile_details or {}).get("outside_activities")
        if is_signable and d.status != "approved":      # the affidavit's Schedule A is asked for on its signing page
            try:
                raw_token = onboarding_package.get_signing_token_for_onboarding_doc(db, d)
                if raw_token:
                    sign_url = f"{base}/sign/{raw_token}"
            except Exception:
                logger.warning("Could not issue signing link for onboarding doc %s", d.id)

        doc_items.append({
            "id": d.id,
            "title": d.title,
            "category": d.category,
            "status": d.status,
            "rejection_reason": d.rejection_reason,
            "uploaded": bool(d.file_path),
            "document_id": d.document_id,
            "requires_signature": is_signable,
            "sign_url": sign_url,
            "package_mode": mode,
            "mode_label": extra.get("mode_label"),
            "template_id": extra.get("template_id"),
            "optional": bool(extra.get("optional")),
            "acknowledged_at": extra.get("acknowledged_at"),
            "has_package_file": bool(extra.get("package_file")),
            "needs_declaration": needs_declaration,
            # the organisation's upload category: what it is for and which files it accepts
            "description": cat.description if cat is not None else None,
            "accepted_types": list(cat.accepted_types or OS.DEFAULT_TYPES) if cat is not None else None,
            "max_size_mb": cat.max_size_mb if cat is not None else None,
        })

    return {
        "candidate_name": hire.candidate_name,
        "position": hire.position,
        "organization_name": _org_name(db, hire.organization_id),
        "joining_date": hire.joining_date,
        "manager_name": hire.manager_name,
        "department_name": hire.department_name,
        **_portal_welcome(db, hire),
        "expires_at": hire.portal_expires_at,
        "details": _details_with_form_answers(db, hire),
        "phone": hire.phone,
        "documents": doc_items,
        "package": onboarding_package.portal_package_status(db, hire),
        "submission": onboarding_package.submission_status(db, hire),
        "orientation": [{"title": s.title, "date": s.date, "time": s.time, "location": s.location,
                         "meeting_link": s.meeting_link} for s in sessions],
    }


PORTAL_DETAIL_RULES = {"phone": "phone", "address": "address", "city": "place_name", "state": "state", "country": "country",
                       "postal_code": "postal_code"}
PORTAL_DETAIL_REQUIRED = ("phone", "address", "city", "country", "postal_code")
ADDRESS_PARTS = ("house", "building", "street", "landmark", "locality", "district")   # optional structured parts


def save_portal_details(db: Session, hire: OnboardingNewHire, data: dict) -> dict:
    """The new hire's contact and address details. Checked with the shared field rules (the same messages as every other
    form); with `submit` the required ones must all be present, and the submission time is recorded."""
    from app.core import field_rules
    details = dict(hire.profile_details or {})
    data = dict(data or {})
    if any(str(data.get(k) or "").strip() for k in ("house", "building", "street")) and not str(data.get("address") or "").strip():
        # structured parts only: the one-line address (used by the forms and v1 documents) is built from them
        data["address"] = ", ".join(str(data[k]).strip() for k in ("house", "building", "street")
                                    if str(data.get(k) or "").strip())[:300]
    from app.modules.hr.onboarding_submissions import detail_snapshot
    before = detail_snapshot(hire)
    values = {k: data.get(k) for k in PORTAL_DETAIL_RULES if k in data and str(data.get(k) or "").strip()}
    previous = {**{k: before.get(k) for k in PORTAL_DETAIL_RULES if k != "phone"}, "phone": before["phone"]}
    cleaned, errors = field_rules.validate_record(values, PORTAL_DETAIL_RULES, previous=previous)
    submit = bool(data.get("submit"))
    if submit:
        for key in PORTAL_DETAIL_REQUIRED:
            value = data.get(key) if key in data else previous.get(key)
            if key not in errors and not str(value or "").strip():
                errors[key] = "This is required."
    field_rules.raise_if_errors(errors)
    for key in ("address", "city", "state", "country", "postal_code", "emergency_contact_name",
                "emergency_contact_relation", "emergency_contact_phone", *ADDRESS_PARTS):
        if key in data:
            value = cleaned.get(key, (data.get(key) or "").strip())
            details[key] = str(value)[:300] if value else None
    if data.get("phone"):
        hire.phone = str(cleaned.get("phone", data["phone"])).strip()[:50]
    if submit:
        details["details_submitted_at"] = datetime.utcnow().isoformat()
    hire.profile_details = details
    from app.modules.hr import onboarding_submissions
    onboarding_submissions.mark_details_changed(db, hire, before)
    db.commit()
    from app.modules.hr.service import log_onboarding_activity
    log_onboarding_activity(db, hire.id, "Details submitted", f"{hire.candidate_name} updated their personal details.", hire.organization_id)
    from app.modules.hr import onboarding_package
    onboarding_package.release_held(db, hire)       # documents not sent yet that were waiting for the address
    onboarding_package.flag_details_changed(db, hire)   # sent but unsigned documents printed the old details: HR reissues
    try:                                            # documents prepared when the new hire submits (or held for their details)
        from app.modules.hr import onboarding_doc_automation as AUTO
        AUTO.dispatch(db, hire, "details_submitted" if submit else AUTO.RETRY)
    except Exception:
        db.rollback()
        logger.exception("automatic onboarding documents failed for new hire %s", hire.id)
    return portal_view(db, hire)


# ── automatic start ──────────────────────────────────────────────────────────────────────────────────────────────────
def request_documents(db: Session, hire: OnboardingNewHire, categories: list[str], notify: bool = True) -> list[OnboardingDocument]:
    """Ask the new hire for documents. A category already requested, uploaded or approved is not asked for twice. Categories
    are the organisation's active upload categories (Settings › Documents requested from new hires)."""
    from app.modules.hr import onboarding_org_settings as OS
    from app.modules.hr.onboarding_package import PACKAGE_CATEGORIES
    # offer-package documents are generated and issued from the package (Documents › Offer package), never requested as uploads;
    # older settings may still list them, so they are skipped rather than refused
    categories = [c for c in categories if c not in PACKAGE_CATEGORIES]
    active = OS.active_keys(db, hire.organization_id)
    bad = [c for c in categories if c not in active]
    if bad:
        raise BadRequestException(f"Unknown document categories: {', '.join(bad)}.")
    have = {d.category for d in db.query(OnboardingDocument).filter(
        OnboardingDocument.onboarding_new_hire_id == hire.id, OnboardingDocument.is_deleted == False,  # noqa: E712
        OnboardingDocument.status != "rejected").all() if d.kind != "form" and not d.form_submission_id}
    created = []
    for cat in dict.fromkeys(categories):
        if cat in have:
            continue
        doc = OnboardingDocument(title=OS.label_for(db, hire.organization_id, cat), category=cat, file_path=None, status="requested",
                                 onboarding_new_hire_id=hire.id, organization_id=hire.organization_id)
        db.add(doc)
        created.append(doc)
    db.commit()
    if created and notify and hire.portal_token_hash:
        notify_document_request(db, hire, [{"title": d.title, "note": "Requested"} for d in created])
    return created


def start_onboarding(db: Session, hire: OnboardingNewHire) -> None:
    """Apply the organization's settings to a new hire: checklists, document requests, the pre-onboarding invite."""
    try:
        settings = get_settings(db, hire.organization_id)
        from app.modules.hr import service
        for template_id in settings.auto_template_ids or []:
            try:
                service.assign_checklist_template(db, hire.id, int(template_id), hire.organization_id)
            except Exception:
                db.rollback()
                logger.warning("auto checklist %s could not be assigned to new hire %s", template_id, hire.id)
        if settings.required_document_categories:
            request_documents(db, hire, list(settings.required_document_categories), notify=False)
        if settings.auto_send_portal_invite and hire.email and hire.status in ACTIVE_STATUSES:
            # on an offer acceptance the link goes out in the one offer-accepted welcome e-mail instead
            issue_portal_link(db, hire, send=not _INVITE_DEFERRED.get())
    except Exception:
        db.rollback()
        logger.exception("starting onboarding failed for new hire %s", hire.id)
    try:
        from app.modules.hr import onboarding_documents
        onboarding_documents.on_onboarding_started(db, hire)        # hook kept; no manager checklist is created
    except Exception:
        db.rollback()
        logger.exception("manager onboarding checklist failed for new hire %s", hire.id)
    try:                                       # package documents set to be prepared when the new hire is created
        from app.modules.hr import onboarding_doc_automation
        onboarding_doc_automation.dispatch(db, hire, "hire_created")
    except Exception:
        db.rollback()
        logger.exception("automatic onboarding documents failed for new hire %s", hire.id)


# ── completion ───────────────────────────────────────────────────────────────────────────────────────────────────────
def progress(db: Session, hire: OnboardingNewHire) -> dict:
    items = (db.query(OnboardingChecklistItem)
             .join(OnboardingChecklist, OnboardingChecklistItem.checklist_id == OnboardingChecklist.id)
             .filter(OnboardingChecklist.onboarding_new_hire_id == hire.id, OnboardingChecklist.is_deleted == False,  # noqa: E712
                     OnboardingChecklistItem.is_deleted == False).all())  # noqa: E712
    docs = db.query(OnboardingDocument).filter(OnboardingDocument.onboarding_new_hire_id == hire.id,
                                               OnboardingDocument.is_deleted == False).all()  # noqa: E712
    attend = (db.query(OnboardingOrientationAttendee)
              .join(OnboardingOrientation, OnboardingOrientationAttendee.session_id == OnboardingOrientation.id)
              .filter(OnboardingOrientationAttendee.onboarding_new_hire_id == hire.id,
                      OnboardingOrientationAttendee.is_deleted == False, OnboardingOrientation.is_deleted == False).all())  # noqa: E712
    settings = get_settings(db, hire.organization_id)
    blockers = []
    open_items = [i for i in items if not i.completed]
    if settings.require_checklists_complete and open_items:
        blockers.append(f"{len(open_items)} checklist item(s) are not done")
    from app.modules.hr.onboarding_package import is_blocking
    docs = [d for d in docs if is_blocking(d)]          # voluntary / for-information package documents never block
    not_approved = [d for d in docs if d.status != "approved"]
    if settings.require_documents_approved and not_approved:
        blockers.append(f"{len(not_approved)} document(s) are not approved")
    done = len(items) - len(open_items)
    return {
        "checklist_total": len(items), "checklist_done": done,
        "documents_total": len(docs), "documents_approved": len(docs) - len(not_approved),
        "documents_waiting": sum(d.status in ("requested", "rejected") for d in docs),
        "orientation_sessions": len(attend), "orientation_attended": sum(a.status == "attended" for a in attend),
        "portal_invited_at": hire.portal_invited_at, "portal_expires_at": hire.portal_expires_at,
        "percent": round(100 * (done + len(docs) - len(not_approved)) / (len(items) + len(docs))) if (items or docs) else 0,
        "blockers": blockers,
    }


def completion_blockers(db: Session, hire: OnboardingNewHire) -> list[str]:
    from app.modules.hr import onboarding_documents
    # mandatory checklist items must be done (by hand or by their engine record) or carry a recorded exception
    return progress(db, hire)["blockers"] + onboarding_documents.checklist_blockers(db, hire)


def notify_completed(db: Session, hire: OnboardingNewHire, employee) -> int:
    try:
        from app.services.email_service import send_onboarding_completed
        recipients = {a.email: a.first_name or "there" for a in _admins(db, hire.organization_id)}
        if hire.manager is not None and hire.manager.email:
            recipients[hire.manager.email] = hire.manager.first_name or "there"
        org = _org_name(db, hire.organization_id)
        n = 0
        for email, name in recipients.items():
            n += bool(send_onboarding_completed(email, name, hire.candidate_name, employee.employee_code, hire.position, org,
                                                f"{app_base()}/zoiko-hr/employees", _date_display(hire.joining_date),
                                                db=db, organization_id=hire.organization_id))
        return n
    except Exception:
        logger.exception("onboarding completed email failed")
        return 0


# ── other emails ─────────────────────────────────────────────────────────────────────────────────────────────────────
def current_portal_url(db: Session, hire: OnboardingNewHire) -> Optional[str]:
    """The live link the new hire already has (so a new email does not invalidate an older one), else a fresh one."""
    if hire.status not in ACTIVE_STATUSES:
        return None
    if hire.portal_token_enc and hire.portal_expires_at and hire.portal_expires_at > datetime.utcnow():
        try:
            from app.core.crypto import decrypt_secret
            token = decrypt_secret(hire.portal_token_enc)
            if token and _hash(token) == hire.portal_token_hash:
                return portal_url(token)
        except Exception:
            logger.warning("stored pre-onboarding link could not be read; issuing a new one")
    return issue_portal_link(db, hire, send=False)["url"]


def notify_document_request(db: Session, hire: OnboardingNewHire, documents: list[dict], is_reminder: bool = False) -> bool:
    if not hire.email or hire.status not in ACTIVE_STATUSES:
        return False
    try:
        from app.services.email_service import send_onboarding_document_request
        url = current_portal_url(db, hire)
        return bool(send_onboarding_document_request(
            hire.email, _first_name(hire), _org_name(db, hire.organization_id), documents, url,
            joining_date_display=_date_display(hire.joining_date), is_reminder=is_reminder, db=db,
            organization_id=hire.organization_id))
    except Exception:
        logger.exception("document request email failed")
        return False


def notify_task_assignees(db: Session, hire: OnboardingNewHire, items: list[OnboardingChecklistItem]) -> int:
    by_person: dict[int, list] = {}
    for item in items:
        if item.assignee_employee_id:
            by_person.setdefault(item.assignee_employee_id, []).append(item)
    if not by_person:
        return 0
    from app.modules.hr.hr_notifications import notify_employee
    notify_employee(db, hire.organization_id, sorted(by_person), "onboarding.tasks_assigned",
                    link="/zoiko-hr/onboarding/checklists")                   # A5: in-app, alongside the email
    try:
        from app.modules.employee.models import Employee
        from app.services.email_service import send_onboarding_task_assigned
        org = _org_name(db, hire.organization_id)
        n = 0
        for emp_id, its in by_person.items():
            emp = db.query(Employee).filter(Employee.id == emp_id, Employee.is_active.is_(True)).first()
            if emp is None or not emp.email:
                continue
            n += bool(send_onboarding_task_assigned(
                emp.email, emp.first_name or "there", hire.candidate_name, hire.position, org,
                [{"title": i.title, "due": i.due_date.strftime("%b %d, %Y") if i.due_date else None} for i in its],
                f"{app_base()}/zoiko-hr/onboarding/checklists", _date_display(hire.joining_date), db=db,
                organization_id=hire.organization_id))
        return n
    except Exception:
        logger.exception("task assigned email failed")
        return 0


def notify_orientation(db: Session, session: OnboardingOrientation, kind: str, hires: Optional[list] = None) -> int:
    """kind: invite | updated | cancelled. hires defaults to everyone on the session."""
    try:
        from app.services.email_service import send_orientation_invite
        if hires is None:
            hires = [a.new_hire for a in session.attendees if not a.is_deleted and a.new_hire is not None]
        org = _org_name(db, session.organization_id)
        n = 0
        for hire in hires:
            if not hire.email or hire.is_deleted:
                continue
            n += bool(send_orientation_invite(hire.email, _first_name(hire), org, session.title, _date_display(session.date),
                                              session.time, session.location, session.meeting_link, session.presenter,
                                              kind=kind, db=db, organization_id=session.organization_id))
        return n
    except Exception:
        logger.exception("orientation email failed")
        return 0


# ── daily reminders ──────────────────────────────────────────────────────────────────────────────────────────────────
def run_document_reminders(db: Session, today: Optional[date] = None) -> int:
    """Remind new hires about documents they still owe, every `reminder_days` days after their invite."""
    today = today or date.today()
    sent = 0
    for settings in db.query(OnboardingSettings).filter(OnboardingSettings.reminder_days > 0).all():
        if settings.last_reminder_run == today:
            continue
        hires = (db.query(OnboardingNewHire)
                 .filter(OnboardingNewHire.organization_id == settings.organization_id, OnboardingNewHire.is_deleted == False,  # noqa: E712
                         OnboardingNewHire.status.in_(ACTIVE_STATUSES), OnboardingNewHire.portal_invited_at.isnot(None)).all())
        for hire in hires:
            days = (today - hire.portal_invited_at.date()).days
            if days <= 0 or days % settings.reminder_days:
                continue
            owed = db.query(OnboardingDocument).filter(
                OnboardingDocument.onboarding_new_hire_id == hire.id, OnboardingDocument.is_deleted == False,  # noqa: E712
                OnboardingDocument.status.in_(["requested", "rejected"])).all()
            if owed:
                invited = hire.portal_invited_at
                sent += notify_document_request(db, hire, [{"title": d.title, "note": f"Rejected: {d.rejection_reason}" if d.rejection_reason else "Still needed"} for d in owed], is_reminder=True)
                hire.portal_invited_at = invited          # if the link had to be renewed, keep the reminder rhythm
                db.commit()
        settings.last_reminder_run = today
        db.commit()
    return sent


def reminder_job() -> None:
    from app.database import SessionLocal
    db = SessionLocal()
    try:
        n = run_document_reminders(db)
        if n:
            logger.info("[onboarding] sent %d document reminder(s)", n)
    except Exception:
        logger.exception("onboarding reminder job failed")
    finally:
        db.close()
