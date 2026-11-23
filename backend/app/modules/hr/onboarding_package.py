"""HR onboarding package: the 10 standard onboarding documents for a new hire.

Content lives in `onboarding_package_content` (one structured source per document) and is rendered by
`onboarding_package_render` to the PDF and to the HTML the candidate reads before signing.

Flow (Org Admin › Onboarding › Documents):
1. Settings › Offer package: employer particulars, branding, signatory, and the counsel clause library. Every {{clause:…}} hook
   prints counsel's wording; until a required hook has wording, the documents that use it stay drafts (watermarked, never sent).
2. Per new hire, the package panel shows each document's readiness: missing HR data (HR can type it in) and missing clauses.
   HR can preview any document, ready or not.
3. "Send" issues the ready documents and e-mails the portal link. Each document has an action mode:
   SIGN (e-signature, with OTP and an execution certificate), ACKNOWLEDGE (receipt, in the portal), COMPLETE (download, complete,
   upload for HR review), VOLUNTARY (optional, never blocks onboarding, never filed), INFO (reference template, no action).
4. Documents held only for candidate data (postal address, outside activities) are issued automatically when the candidate
   enters it in the portal.
"""
from __future__ import annotations

import hashlib
import json
import logging
import re
import secrets
from datetime import date, datetime, timedelta
from contextlib import contextmanager
from typing import Optional

from fastapi import HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.modules.doc_templates import renderer, signing, state, storage
from app.modules.doc_templates.models import GeneratedDocument, TemplateDefinition
from app.modules.hr import onboarding_package_content as C
from app.modules.hr import onboarding_package_render as R
from app.modules.hr.models import (OnboardingDocument, OnboardingNewHire, Organization, OrganizationConfig, RecruitmentCandidate,
                                   RecruitmentOffer)

logger = logging.getLogger("zoiko.onboarding.package")

# ── public constants (other modules import these) ────────────────────────────────────────────────────────────────────
ONBOARDING_PACKAGE_SPEC = [{"category": d["category"], "title": d["title"], "canonical_id": d["template_id"],
                            "family_id": d["family_id"], "mode": d["mode"], "requires_signature": d["mode"] == "SIGN",
                            "description": C.MODE_LABELS[d["mode"]]} for d in C.documents()]
PACKAGE_CATEGORIES = C.CATEGORIES
SPEC_BY_CATEGORY = {s["category"]: s for s in ONBOARDING_PACKAGE_SPEC}
SIGNABLE_CATEGORIES = {s["category"] for s in ONBOARDING_PACKAGE_SPEC if s["mode"] == "SIGN"}
NO_ACTION_STATUS = "available"        # VOLUNTARY / INFO documents: issued, nothing to approve, never block completion
ACK_TEXT_VERSION = "ONB-ACK-1.0"
ACK_TEXT = "I confirm that I have received and read this document. This is an acknowledgement of receipt only."


def issued_meta(row) -> dict:
    """{version, mode, issued_at} recorded when this onboarding document was issued; {} for rows issued before v2 (which
    were all package version 1.0, issued under the then-current mode)."""
    hire = getattr(row, "new_hire", None)
    if hire is None or getattr(row, "id", None) is None:
        return {}
    return dict(((hire.profile_details or {}).get("_package_issued") or {}).get(str(row.id)) or {})


def mode_of(category_or_row) -> Optional[str]:
    """The action mode of a package document. For an issued row it is the mode the document was issued under, so a later
    package version that changes a document's mode never changes how an already-issued document behaves."""
    if category_or_row is not None and not isinstance(category_or_row, str):
        meta = issued_meta(category_or_row)
        if meta.get("mode"):
            return meta["mode"]
        category_or_row = getattr(category_or_row, "category", None)
    d = C.DOCS.get(category_or_row or "")
    # Rows written before v2 have no issue metadata. Keep the v1 self-disclosure
    # form voluntary for those rows even though the v2 declaration is required.
    if d and C.PACKAGE_VERSION == "2.0" and category_or_row == "self_disclosure":
        return "VOLUNTARY"
    return d["mode"] if d else None


def is_blocking(doc: OnboardingDocument) -> bool:
    """Does this document hold up completion while it is not approved?"""
    return doc.status != NO_ACTION_STATUS and mode_of(doc) not in ("VOLUNTARY", "INFO")


# ── organisation settings (organization_configs, one JSON row) ──────────────────────────────────────────────────────
CONFIG_KEY = "onboarding_package.config"
HEX = re.compile(r"^#[0-9A-Fa-f]{6}$")
TEXT_SETTINGS = {"legal_name": 200, "registered_address": 500, "header_label": 60, "jurisdiction": 120, "signatory_name": 200,
                 "signatory_title": 200, "hr_contact_name": 200, "hr_contact_email": 255, "leave_entitlement": 300,
                 "post_employment_period": 200, "pay_frequency": 60, "kpi_review_cycle": 120, "benefits_reference": 300,
                 "effective_date": 40}


def _org(db=None, organization_id=None):
    """_org(db, id): the Organization row; _org(): the organisation package module (onboarding_package_org)."""
    if db is None:
        from app.modules.hr import onboarding_package_org as ORG
        return ORG
    return db.get(Organization, organization_id)


def _is_us(org) -> bool:
    c = (getattr(org, "country", "") or "").strip().lower()
    return c in ("us", "usa", "united states", "united states of america")


def _defaults(org) -> dict:
    """Company particulars are NEVER taken from the organisation record: every employer detail printed in the documents is
    what HR entered on Onboarding › Settings › Offer package (until then the documents stay held as not ready). Only the
    formatting defaults (paper, spelling, date format) follow the organisation's country."""
    us = _is_us(org)
    return {
        "legal_name": "", "registered_address": "",
        "header_label": "",
        "brand_primary": "#0B3D91", "brand_accent": "#00A3E0",
        "paper": "LETTER" if us else "A4", "spelling": "US" if us else "UK", "date_format": "MDY" if us else "DMY",
        "jurisdiction": "",
        "signatory_name": "", "signatory_title": "", "hr_contact_name": "",
        "hr_contact_email": "",
        "response_days": 7, "leave_entitlement": "", "post_employment_period": "", "pay_frequency": "",
        "kpi_review_cycle": "", "benefits_reference": "", "effective_date": "", "clauses": {}, "logo_key": "",
        "signature_key": "",
        # clause wording proposed by "Set up docs for your organisation": never printed until counsel approves it
        "clauses_pending": {},
    }


def header_label(cfg: dict) -> str:
    """The running header's "LABEL | HR": the header label from the settings, else the employer legal name from the settings."""
    return ((cfg.get("header_label") or "").strip() or (cfg.get("legal_name") or "").strip()).upper()[:60]


def _row(db, organization_id):
    return db.query(OrganizationConfig).filter(OrganizationConfig.organization_id == organization_id,
                                               OrganizationConfig.key == CONFIG_KEY).first()


def get_config(db, organization_id: int) -> dict:
    cfg = _defaults(_org(db, organization_id))
    row = _row(db, organization_id)
    if row and row.value:
        try:
            stored = json.loads(row.value)
            if isinstance(stored, dict):
                cfg.update({k: v for k, v in stored.items() if k in cfg and v not in (None,)})
        except json.JSONDecodeError:
            logger.warning("offer package settings for org %s are not valid JSON", organization_id)
    # the employer particulars come from the organisation's Company Profile (Settings), the single source for documents
    from app.modules.hr import company_profile as CP
    profile = CP.get_profile(db, organization_id)
    for key in CP.OWNED_BY_PROFILE:
        cfg[key] = profile.get(key) if profile.get(key) is not None else cfg.get(key)
    cfg["registered_address"] = CP.registered_address(profile)
    return cfg


def save_config(db, actor, data: dict) -> dict:
    cfg = get_config(db, actor.organization_id)
    data = data or {}
    for key, limit in TEXT_SETTINGS.items():
        if key in data:
            cfg[key] = str(data[key] or "").strip()[:limit]
    for key in ("brand_primary", "brand_accent"):
        if key in data:
            v = str(data[key] or "").strip()
            if not HEX.match(v):
                raise HTTPException(422, f"{key} must be a hex colour such as #0B3D91.")
            cfg[key] = v.upper()
    for key, allowed in (("paper", ("A4", "LETTER")), ("spelling", ("UK", "US")), ("date_format", ("DMY", "MDY"))):
        if key in data:
            v = str(data[key] or "").upper()
            if v not in allowed:
                raise HTTPException(422, f"{key} must be one of {', '.join(allowed)}.")
            cfg[key] = v
    if "response_days" in data:
        try:
            n = int(data["response_days"])
        except (TypeError, ValueError):
            n = -1
        if not 1 <= n <= 60:
            raise HTTPException(422, "response_days must be between 1 and 60.")
        cfg["response_days"] = n
    if cfg.get("hr_contact_email") and not re.match(r"^[^@\s]+@[^@\s]+\.[^@\s]+$", cfg["hr_contact_email"]):
        raise HTTPException(422, "hr_contact_email is not a valid e-mail address.")
    if "clauses" in data:
        if not isinstance(data["clauses"], dict):
            raise HTTPException(422, "clauses must be an object.")
        clauses = dict(cfg.get("clauses") or {})
        for key, val in data["clauses"].items():
            if key not in C.CLAUSES:
                raise HTTPException(422, f"Unknown clause {key}.")
            val = val or {}
            text = str(val.get("text") or "").strip()
            if len(text) > 20000:
                raise HTTPException(422, f"The wording for {key} is too long.")
            na = bool(val.get("not_applicable"))
            prev = clauses.get(key) or {}
            if text or na:
                changed = text != (prev.get("text") or "") or na != bool(prev.get("not_applicable"))
                clauses[key] = {"text": text, "not_applicable": na,
                                "counsel_reference": str(val.get("counsel_reference") or "").strip()[:200],
                                "updated_by": actor.id if changed else prev.get("updated_by"),
                                "updated_at": datetime.utcnow().isoformat() if changed else prev.get("updated_at")}
            else:
                clauses.pop(key, None)
        cfg["clauses"] = clauses
    from app.modules.hr import company_profile as CP
    owned = {k: cfg[k] for k in (*CP.OWNED_BY_PROFILE, "registered_address") if k in data}
    if owned:
        CP.update_owned_fields(db, actor, owned)       # employer particulars are kept in the Company Profile
    _write_config(db, actor.organization_id, cfg)
    return cfg


def decide_pending_clause(db, actor, key: str, approve: bool, counsel_reference: str = "") -> dict:
    """Counsel's decision on clause wording proposed by "Set up docs for your organisation": approved wording becomes the
    organisation's clause wording (with counsel's reference); rejected wording is discarded."""
    from app.modules.doc_templates import access
    access.require_org_admin(actor)
    cfg = get_config(db, actor.organization_id)
    pending = dict(cfg.get("clauses_pending") or {})
    item = pending.pop(key, None)
    if item is None:
        raise HTTPException(404, "No proposed wording for this clause.")
    if approve:
        ref = str(counsel_reference or "").strip()[:200]
        if not ref:
            raise HTTPException(422, "Give counsel's reference (name, firm or matter) for the approved wording.")
        save_config(db, actor, {"clauses": {key: {"text": item["text"], "counsel_reference": ref}}})
        cfg = get_config(db, actor.organization_id)
    cfg["clauses_pending"] = pending
    _write_config(db, actor.organization_id, cfg)
    return settings_view(db, actor.organization_id)


# ── company logo (printed in every document's header and the offer letterhead) ──────────────────────────────────────
LOGO_MAX_BYTES = 2 * 1024 * 1024
LOGO_MAX_PX = (900, 300)


def _write_config(db, organization_id: int, cfg: dict) -> None:
    row = _row(db, organization_id)
    if row is None:
        row = OrganizationConfig(organization_id=organization_id, key=CONFIG_KEY, category="onboarding_package",
                                 description="Offer package documents: employer particulars, branding and counsel clauses")
        db.add(row)
    row.value = json.dumps(cfg)
    db.commit()


def _clean_png(data: bytes, what: str, max_px: tuple) -> bytes:
    """Validate an uploaded image (PNG, JPEG or WebP, max 2 MB), strip metadata by re-encoding it as PNG, scale it down."""
    if not data:
        raise HTTPException(422, f"Choose {what} image to upload.")
    if len(data) > LOGO_MAX_BYTES:
        raise HTTPException(422, f"The {what.split(' ', 1)[-1]} must be 2 MB or smaller.")
    from PIL import Image, UnidentifiedImageError
    import io as _io
    try:
        probe = Image.open(_io.BytesIO(data))
        if probe.format not in ("PNG", "JPEG", "WEBP"):
            raise HTTPException(422, f"Upload the {what.split(' ', 1)[-1]} as a PNG, JPG or WebP image.")
        probe.verify()
        img = Image.open(_io.BytesIO(data))
        img.load()
    except HTTPException:
        raise
    except (UnidentifiedImageError, OSError, ValueError, Image.DecompressionBombError):
        raise HTTPException(422, "The file is not a readable image.")
    img = img.convert("RGBA")
    img.thumbnail(max_px)
    out = _io.BytesIO()
    img.save(out, format="PNG", optimize=True)
    return out.getvalue()


def save_logo(db, actor, data: bytes) -> dict:
    """Validate an uploaded logo (PNG, JPEG or WebP, max 2 MB), strip metadata by re-encoding it as PNG, scale it down, store it."""
    png = _clean_png(data, "a logo", LOGO_MAX_PX)
    cfg = get_config(db, actor.organization_id)
    cfg["logo_key"] = storage.get_store().put(actor.organization_id, f"org-logo-{secrets.token_hex(6)}.png", png)
    _write_config(db, actor.organization_id, cfg)
    return settings_view(db, actor.organization_id)


def remove_logo(db, actor) -> dict:
    cfg = get_config(db, actor.organization_id)
    cfg["logo_key"] = ""
    _write_config(db, actor.organization_id, cfg)
    return settings_view(db, actor.organization_id)


def _stored_image(db, organization_id: int, key_name: str, cfg: Optional[dict] = None) -> Optional[bytes]:
    key = (cfg or get_config(db, organization_id)).get(key_name)
    if not key:
        return None
    try:
        return storage.get_store().get(key)
    except Exception:
        logger.warning("offer package image %s for org %s is missing from storage", key_name, organization_id)
        return None


def logo_bytes(db, organization_id: int, cfg: Optional[dict] = None) -> Optional[bytes]:
    return _stored_image(db, organization_id, "logo_key", cfg)


def public_branding(db, organization_id: int) -> tuple:
    """(legal name, logo as a data: URI) shown on public pages a candidate opens (the signing page): the Company Profile's
    full legal name and the logo uploaded in Onboarding settings; ("", None) for what is not set."""
    from app.core.privacy import context as privacy_ctx
    try:
        with privacy_ctx.tenant_context(organization_id):        # a public page: no signed-in user, read as that organisation
            cfg = get_config(db, organization_id)
            logo = logo_bytes(db, organization_id, cfg)
    except Exception:
        logger.warning("branding for org %s could not be read", organization_id)
        return "", None
    name = (cfg.get("legal_name") or "").strip()
    if not logo:
        return name, None
    import base64
    return name, "data:image/png;base64," + base64.b64encode(logo).decode("ascii")


# ── the authorised signatory's signature (printed in the employer's signature cell of documents generated from now on) ──
SIGNATURE_MAX_PX = (600, 200)


def save_signature(db, actor, data: bytes) -> dict:
    """The authorised signatory's signature image. Uploading it is the organisation's choice to have it printed on the
    documents it issues (as a facsimile under the signatory's name); without it the signature cell stays blank."""
    png = _clean_png(data, "a signature", SIGNATURE_MAX_PX)
    cfg = get_config(db, actor.organization_id)
    cfg["signature_key"] = storage.get_store().put(actor.organization_id, f"org-signature-{secrets.token_hex(6)}.png", png)
    _write_config(db, actor.organization_id, cfg)
    return settings_view(db, actor.organization_id)


def remove_signature(db, actor) -> dict:
    cfg = get_config(db, actor.organization_id)
    cfg["signature_key"] = ""
    _write_config(db, actor.organization_id, cfg)
    return settings_view(db, actor.organization_id)


def signature_bytes(db, organization_id: int, cfg: Optional[dict] = None) -> Optional[bytes]:
    return _stored_image(db, organization_id, "signature_key", cfg)


def settings_view(db, organization_id: int) -> dict:
    cfg = get_config(db, organization_id)
    used: dict[str, list[str]] = {}
    for cat in C.CATEGORIES:
        for tok in C.tokens_in(cat):
            ck = C.clause_key(tok)
            if ck:
                used.setdefault(ck, []).append(C.DOCS[cat]["title"])
    clauses = [{"key": k, "token": R._hook_token(k), "title": t, "note": n, "required": req, "used_in": used.get(k, []),
                "standard_text": C.STANDARD_CLAUSES.get(k), "pending": (cfg.get("clauses_pending") or {}).get(k),
                **{f: (cfg["clauses"].get(k) or {}).get(f) for f in ("text", "not_applicable", "counsel_reference", "updated_at")}}
               for k, (t, n, req) in C.CLAUSES.items()]
    settings_out = {k: v for k, v in cfg.items() if k not in ("clauses", "logo_key", "signature_key", "clauses_pending")}
    settings_out["has_logo"] = bool(cfg.get("logo_key"))
    settings_out["has_signature"] = bool(cfg.get("signature_key"))
    from app.modules.hr import company_profile as CP
    company = CP.profile_view(db, organization_id)
    return {"settings": settings_out, "clauses": clauses,
            "documents": [{k: d[k] for k in ("category", "title", "template_id", "doc_type", "risk", "sensitivity", "mode",
                                              "orientation", "pages", "signers")} for d in C.documents()],
            "mode_labels": C.MODE_LABELS, "company_profile": company}


# ── per-hire data ────────────────────────────────────────────────────────────────────────────────────────────────────
# Fields HR may type in per new hire (everything else comes from settings, the hire record, the offer or is computed).
# values computed from the Company Profile, the profiles and the hire (never typed per hire)
V2_COMPUTED = {k for k in C.FIELDS if k.split(".")[0] in ("company", "engagement", "role")} | {
    "worker.full_name_caps", "worker.initials", "worker.address_block", "worker.address_inline", "employment.start_date_long",
    "employment.notice_text", "employment.employer_notice_text", "employment.pay_amount", "employment.pay_statement",
    "employment.duties_paragraph", "kpi.areas", "offer.compliance_documents", "document.issue_date_legal", "document.reference"}
# v2 per-hire choices HR makes in the package panel
V2_HIRE_INPUTS = {"engagement_profile_slug": "Engagement profile", "role_profile_slug": "Role profile",
                  "offer.candidate_fit_summary": C.FIELDS["offer.candidate_fit_summary"][0],
                  "document.issue_date": "Issue date (YYYY-MM-DD; default today)"}
HIRE_INPUT_FIELDS = [k for k in C.FIELDS if k.split(".")[0] in ("employment", "job", "kpi", "worker")
                     and k not in ("worker.full_name", "worker.email", "worker.outside_activities", "employment.pay_terms")
                     and k not in V2_COMPUTED] + list(V2_HIRE_INPUTS)


def input_meaning(key: str) -> str:
    return V2_HIRE_INPUTS.get(key) or C.FIELDS[key][0]


def _fmt_date(d, cfg) -> Optional[str]:
    if not d:
        return None
    if isinstance(d, str):
        try:
            d = date.fromisoformat(d[:10])
        except ValueError:
            return d
    if isinstance(d, datetime):
        d = d.date()
    return f"{d.strftime('%B')} {d.day:02d}, {d.year}" if cfg.get("date_format") == "MDY" else f"{d.day:02d} {d.strftime('%B %Y')}"


def response_deadline(cfg: dict, start=None, issue=None) -> date:
    """The "sign by" date printed in the offer letter: the issue date plus the response days, but never after the start
    date (the letter asks for documents to be verified before the start). A start already in the past is not a cap."""
    def _d(v):
        if isinstance(v, datetime):
            return v.date()
        if isinstance(v, str):
            try:
                return date.fromisoformat(v[:10])
            except ValueError:
                return None
        return v
    base = _d(issue) or date.today()
    deadline = base + timedelta(days=int(cfg.get("response_days") or 7))
    start = _d(start)
    if start and start >= base and deadline > start:
        deadline = start
    return deadline


def _pretty(v: Optional[str]) -> Optional[str]:
    if not v:
        return None
    special = {"onsite": "On-site", "on_site": "On-site", "full_time": "Full-time", "part_time": "Part-time"}
    return special.get(str(v).lower(), str(v).replace("_", " ").capitalize())


PER_PERIOD = {"annual": "per year", "monthly": "per month", "weekly": "per week", "hourly": "per hour", "one_time": "one-off"}


def _offer_for(db, hire):
    return _cached(db, ("offer", hire.id), lambda: _load_offer_for(db, hire))


def _load_offer_for(db, hire):
    cand = db.query(RecruitmentCandidate).filter(RecruitmentCandidate.onboarding_new_hire_id == hire.id).first()
    offer = (db.query(RecruitmentOffer).filter(RecruitmentOffer.candidate_id == cand.id).order_by(RecruitmentOffer.id.desc()).first()
             if cand else None)
    req = None
    if cand and getattr(cand, "requisition_id", None):
        from app.modules.hr.models import RecruitmentRequisition
        req = db.get(RecruitmentRequisition, cand.requisition_id)
    return cand, offer, req


def hire_inputs(hire) -> dict:
    return dict((hire.profile_details or {}).get("_package_inputs") or {})


def save_hire_inputs(db, hire, values: dict, actor=None) -> dict:
    if not isinstance(values, dict):
        raise HTTPException(422, "values must be an object.")
    # merge fields of the clause wording ("clause.<token>") are the organisation's: saved once in the Company Profile
    # (Clause details) for every hire, straight from the panel
    clause_values = {k: v for k, v in values.items() if isinstance(k, str) and k.startswith("clause.")}
    if clause_values:
        from app.modules.hr import company_profile as CP
        from app.modules.hr import onboarding_clause_tokens as T
        if actor is None or getattr(actor, "organization_id", None) != hire.organization_id:
            raise HTTPException(403, "Clause details can only be saved by the organisation's admin.")
        data = {}
        for key, val in clause_values.items():
            token = key.split(".", 1)[1]
            if token not in T.CATALOG:
                raise HTTPException(422, f"{key} cannot be set here.")
            data[T.profile_key(token)] = str(val or "").strip()
        CP.save_profile(db, actor, data)
        values = {k: v for k, v in values.items() if k not in clause_values}
    current = hire_inputs(hire)
    for key, val in values.items():
        if key not in HIRE_INPUT_FIELDS:
            raise HTTPException(422, f"{key} cannot be set here.")
        v = str(val or "").strip()[:4000 if key == "offer.candidate_fit_summary" else 2000]
        if v and key in ("engagement_profile_slug", "role_profile_slug"):
            from app.modules.hr import onboarding_profiles as PR
            if key == "engagement_profile_slug":
                found = PR.engagement_for(db, hire.organization_id, v)
            else:
                found = PR.role_for(db, hire.organization_id, v, None)
            if found is None:
                raise HTTPException(422, f"No {V2_HIRE_INPUTS[key].lower()} '{v}' in this organisation.")
        if v and key == "employment.probation_months":
            if not re.fullmatch(r"\d{1,2}", v) or not 0 < int(v) <= 36:
                raise HTTPException(422, "Probation must be a number of months between 1 and 36.")
        if v and key == "document.issue_date":
            try:
                date.fromisoformat(v[:10])
            except ValueError:
                raise HTTPException(422, "The issue date must be a date such as 2026-07-06.")
        if v:
            current[key] = v
        else:
            current.pop(key, None)
    details = dict(hire.profile_details or {})
    details["_package_inputs"] = current
    hire.profile_details = details
    db.commit()
    return current


def build_values(db, hire: OnboardingNewHire, cfg: dict, *, secure_link: Optional[str] = None,
                 contract_id: Optional[str] = None) -> dict:
    org = _org(db, hire.organization_id)
    _cand, offer, req = _offer_for(db, hire)
    details = hire.profile_details or {}
    from app.core.regions import country_name

    start = hire.joining_date or (offer.joining_date if offer else None)
    country_code = (offer.work_country if offer else None) or hire.work_country
    hours = getattr(offer, "hours_per_week", None) if offer else None
    working_hours = f"{float(hours):g} hours per week" if hours else None
    base_pay = None
    if offer and offer.salary:
        cur = offer.currency or getattr(org, "currency", None) or ""
        base_pay = f"{cur} {float(offer.salary):,.2f} {PER_PERIOD.get(offer.pay_period or 'annual', '')}".strip()
    address = ", ".join(str(details.get(k)).strip() for k in ("address", "city", "state", "postal_code", "country")
                        if details.get(k) and str(details.get(k)).strip()) or None
    emp = getattr(hire, "employee", None)
    if address is None and emp is not None and getattr(emp, "current_address", None):
        address = emp.current_address
    hr_contact = " – ".join(p for p in (cfg.get("hr_contact_name"), cfg.get("hr_contact_email")) if p) or None
    emp = getattr(hire, "employee", None)
    values = {
        "generated_at": _fmt_date(date.today(), cfg),
        "employer.legal_name": cfg.get("legal_name") or None,
        "employer.registered_address": cfg.get("registered_address") or None,
        "employer.signatory_name": cfg.get("signatory_name") or None,
        "employer.signatory_title": cfg.get("signatory_title") or None,
        "employer.hr_contact": hr_contact,
        "worker.full_name": hire.candidate_name,
        "worker.email": hire.email,
        "worker.phone": hire.phone or (getattr(_cand, "phone", None) if _cand else None),
        "worker.postal_address": address,
        "worker.employee_id": getattr(emp, "employee_code", None) if emp else None,
        "employment.position_title": hire.position or (offer.position if offer else None),
        "employment.department": hire.department_name or (req.department if req else None),
        "employment.reports_to": hire.manager_name,
        "employment.employment_type": _pretty(hire.employment_type or (offer.employment_type if offer else None)),
        "employment.start_date": _fmt_date(start, cfg),
        "employment.continuous_service_date": _fmt_date(start, cfg),
        "employment.work_location": (offer.work_location if offer else None),          # never the org record's city
        "employment.work_arrangement": _pretty(offer.work_arrangement if offer else None),
        "employment.working_hours": working_hours,
        "employment.work_pattern": (offer.work_pattern if offer else None) or working_hours,
        "employment.base_pay": base_pay,
        "employment.pay_frequency": cfg.get("pay_frequency") or None,
        "employment.variable_pay": (f"Equity: {offer.equity}" if offer and offer.equity else None),
        "employment.benefits_reference": cfg.get("benefits_reference") or None,
        "employment.leave_entitlement": _leave_text(cfg.get("leave_entitlement")),
        "employment.country": country_name(country_code) if country_code else (cfg.get("jurisdiction") or None),
        "offer.response_deadline": _fmt_date(response_deadline(cfg, start, hire_inputs(hire).get("document.issue_date")), cfg),
        "offer.secure_link": secure_link,
        "contract.id": contract_id,
        "agreement.post_employment_period": cfg.get("post_employment_period") or None,
        "document.version": C.PACKAGE_VERSION,
        "document.effective_date": _fmt_date(cfg.get("effective_date") or start or date.today(), cfg),
        "job.role_purpose": (req.description.strip()[:1200] if req and req.description else None),
        "job.skills_essential": (req.requirements.strip()[:800] if req and req.requirements else None),
        "kpi.review_cycle": cfg.get("kpi_review_cycle") or None,
    }
    for key, val in hire_inputs(hire).items():                    # HR's per-hire entries win
        values[key] = _fmt_date(val, cfg) if key == "employment.start_date" else val
    values["employment.leave_entitlement"] = _leave_text(values.get("employment.leave_entitlement"))
    if address:                                                   # ... except the address the new hire entered themselves
        values["worker.postal_address"] = address
    if values.get("employment.work_pattern") is None:
        values["employment.work_pattern"] = values.get("employment.working_hours")
    if values.get("employment.continuous_service_date") is None:
        values["employment.continuous_service_date"] = values.get("employment.start_date")
    if values.get("employment.base_pay") and values.get("employment.pay_frequency"):
        values["employment.pay_terms"] = f"{values['employment.base_pay']}, paid {values['employment.pay_frequency']}"
    values.update(_v2_values(db, hire, cfg, offer, values))
    # probation in an organisation's own template: HR's entry for this hire, else the engagement profile's
    values["employment.probation_months"] = (hire_inputs(hire).get("employment.probation_months")
                                             or values.get("engagement.assessment_months") or None)
    typed_base = values.pop("_typed_base_pay", None)
    if typed_base:                                                # HR typed a bare amount: print it formatted everywhere
        values["employment.base_pay"] = typed_base
        if values.get("employment.pay_frequency"):
            values["employment.pay_terms"] = f"{typed_base}, paid {values['employment.pay_frequency']}"
    # merge fields used inside counsel clause wording ({{speak_up_channel}}, {{ip_assignment_term}}, ...)
    from app.modules.hr import company_profile as CP
    from app.modules.hr import onboarding_clause_tokens as T
    profile = _profile_for(db, hire.organization_id)
    eng, _role = hire_profiles(db, hire)
    values.update(T.resolve_all(profile, values, eng, CP.notice_for(profile, (eng or {}).get("slug")),
                                getattr(offer, "hours_per_week", None) if offer else None))
    if any((details.get(k) or "").strip() for k in ("house", "building", "street", "landmark", "locality", "district")):
        values["worker.postal_address"] = values.get("worker.address_inline") or values.get("worker.postal_address")
    values.update(_template_blank_values(hire, cfg, offer, values))
    return values


def _add_months(d: date, months: int) -> date:
    import calendar
    m = d.month - 1 + months
    y, m = d.year + m // 12, m % 12 + 1
    return date(y, m, min(d.day, calendar.monthrange(y, m)[1]))


# a "name" that is really a label copied out of a template's signature block ("Candidate Signature", "Name", "Recipient")
_LABEL_WORDS = re.compile(r"(?i)\b(signature|signed|candidate|recipient|employee|witness|name|date|place|seal|stamp|"
                          r"designation|for the company)\b")


def real_person_name(value) -> Optional[str]:
    """The signatory name, or None when what is stored is a template label and not a person (the document is then held
    until Company Profile has a real name, instead of printing the label)."""
    v = " ".join(str(value or "").split())
    if not v or _LABEL_WORDS.search(v) or not re.search(r"[A-Za-z]", v):
        return None
    return v


def _template_blank_values(hire, cfg: dict, offer, values: dict) -> dict:
    """Values for the blanks an organisation's own templates leave for each hire (degree, institution, place of signing,
    end of the assessment, the next stage's title). HR's entry for this hire wins; there is no other record of a degree or
    a next-stage title, so those come only from HR (the package panel lists them as missing until typed)."""
    from app.modules.hr import doc_formatting as F
    inputs = hire_inputs(hire)
    details = hire.profile_details or {}
    fmt = cfg.get("date_format") or "DMY"
    out = {
        "worker.degree": inputs.get("worker.degree") or None,
        "worker.institution": inputs.get("worker.institution") or (getattr(offer, "academic_institution", None) if offer else None),
        "worker.place": (inputs.get("worker.place") or str(details.get("city_display") or details.get("city") or "").strip()
                         or None),
        "employment.next_stage_title": inputs.get("employment.next_stage_title") or None,
        "employer.signatory_name": real_person_name(values.get("employer.signatory_name")),
        "employer.signature": "",
    }
    end = F.to_date(inputs.get("employment.assessment_end_date"))
    if end is None:                      # the engagement profile's assessment length, counted from the start date
        start = F.to_date(hire.joining_date or (offer.joining_date if offer else None)
                          or inputs.get("employment.start_date"))
        months = values.get("engagement.assessment_months")
        try:
            months = int(months) if months not in (None, "") else None
        except (TypeError, ValueError):
            months = None
        if start is not None and months:
            end = _add_months(start, months) - timedelta(days=1)
    out["employment.assessment_end_date"] = (F.format_date_long(end, fmt) or None) if end else None
    return out


# ── v2 values: Company Profile, Engagement / Role Profiles, per-hire choices, computed text ─────────────────────────
_DAY_NAMES = {"MON": "Monday", "TUE": "Tuesday", "WED": "Wednesday", "THU": "Thursday", "FRI": "Friday", "SAT": "Saturday",
              "SUN": "Sunday"}
_DAY_ORDER = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"]


def _leave_text(value) -> Optional[str]:
    """Leave entitlement as printed: a bare number ("24") is that many days."""
    v = str(value or "").strip()
    if not v:
        return None
    return f"{v} days" if re.fullmatch(r"\d{1,3}(\.\d)?", v) else v


def _clock(hhmm: Optional[str]) -> str:
    if not hhmm:
        return ""
    h, m = (int(x) for x in hhmm.split(":"))
    return f"{(h % 12) or 12}:{m:02d} {'AM' if h < 12 else 'PM'}"


def _employee_notice_text(profile: dict, eng: dict) -> Optional[str]:
    """The notice the employee gives, from the Company Profile's notice rules for the hire's employee type:
    "30 days' written notice", or "14 days' written notice during the Probation period and 30 days' written notice after it"
    when the two stages differ."""
    from app.modules.hr import company_profile as CP
    from app.modules.hr import doc_formatting as F
    notice = CP.notice_for(profile, (eng or {}).get("slug"))
    during = F.notice_text(*notice["during"]) if notice["during"] else ""
    after = F.notice_text(*notice["after"]) if notice["after"] else ""
    if during and after and during != after:
        label = ((eng or {}).get("assessment_label") or "Probation").strip()
        stage = label if label.lower().endswith("period") else f"{label} period"
        return f"{during} during the {stage} and {after} after it"
    return after or during or None


def _work_schedule(eng: dict) -> Optional[str]:
    if eng.get("work_schedule"):
        return eng["work_schedule"]
    days = [d for d in _DAY_ORDER if d in (eng.get("working_days") or [])]
    if not days:
        return None
    first = _DAY_ORDER.index(days[0])
    consecutive = [_DAY_ORDER.index(d) for d in days] == list(range(first, first + len(days)))
    if consecutive and len(days) > 1:
        span = f"{_DAY_NAMES[days[0]]} to {_DAY_NAMES[days[-1]]}"
    else:
        span = ", ".join(_DAY_NAMES[d] for d in days)
    tz = f" {eng['timezone_label']}" if eng.get("timezone_label") else ""
    hours = ""
    if eng.get("start_time") and eng.get("end_time"):
        hours = f", {_clock(eng['start_time'])}{tz} to {_clock(eng['end_time'])}{tz}"
    return span + hours


def worker_address_parts(details: dict) -> dict:
    from app.core import regions
    keys = ("house", "building", "street", "landmark", "locality", "district", "city", "state", "postal_code")
    parts = {k: details.get(k) for k in keys}
    if not any(parts.get(k) for k in ("house", "building", "street")):
        parts["address"] = details.get("address")
    country = details.get("country")
    parts["country"] = (regions.country_code(country) or "").upper() if country else ""
    return parts


def engagement_with_source(db, hire) -> tuple:
    """(engagement profile, source) — see onboarding_profiles.engagement_for_hire."""
    from app.modules.hr import onboarding_profiles as PR
    _cand, offer, _req = _offer_for(db, hire)
    chosen = hire_inputs(hire).get("engagement_profile_slug")
    offer_slug = getattr(offer, "engagement_profile_slug", None) if offer is not None else None
    kind = hire.employment_type or (offer.employment_type if offer is not None else None)
    return _cached(db, ("engagement", hire.id, chosen, offer_slug, kind),
                   lambda: PR.engagement_for_hire(db, hire.organization_id, chosen, offer_slug, kind))


def hire_profiles(db, hire) -> tuple:
    """(engagement profile, role profile) for the hire; the role is None when none was chosen and none matches."""
    from app.modules.hr import onboarding_profiles as PR
    inputs = hire_inputs(hire)

    def load():
        eng, _source = engagement_with_source(db, hire)
        role = PR.role_for(db, hire.organization_id, inputs.get("role_profile_slug"), hire.position)
        if role is None:          # no saved profile for this position: build one from the hire's own records
            role = generated_role(db, hire)
        return eng, role
    return _cached(db, ("profiles", hire.id, inputs.get("engagement_profile_slug"), inputs.get("role_profile_slug"),
                        hire.position), load)


# ── generated role profile ───────────────────────────────────────────────────────────────────────────────────────────
# When no saved Role Profile matches the hire's position, the documents use one built from the hire's own records, best
# source first: the job description linked to the requisition, a job description with the position's title, the
# requisition's description and requirements, and finally neutral wording from the position and department. A saved Role
# Profile (Settings › Engagement & role profiles) always wins; the panel warns that the generated one is in use.
GENERIC_KPIS = [
    {"title": "Delivery", "bullets": ["Complete planned and assigned work within the agreed timelines."],
     "success": "Agreed work is finished on time, or risks are raised early with the manager."},
    {"title": "Quality", "bullets": ["Produce accurate, complete work that meets the agreed standard."],
     "success": "Work is accepted without avoidable rework."},
    {"title": "Communication", "bullets": ["Share progress, decisions and blockers clearly and promptly."],
     "success": "The manager and team always know the status and next steps."},
    {"title": "Collaboration", "bullets": ["Work constructively with the team and act on feedback."],
     "success": "Hand-overs are complete and feedback is addressed."},
    {"title": "Reporting", "bullets": ["Submit the Daily Work Report each working day."],
     "success": "Reports are complete, accurate and on time."},
    {"title": "Policies and security", "bullets": ["Follow company policies and keep company information in approved systems."],
     "success": "No policy or information-security breaches."},
]


def _text_items(value) -> list[str]:
    """Strings from a JSON list (strings or {text|title|description} objects) or from free text (one item per line,
    bullets stripped)."""
    if isinstance(value, list):
        items = []
        for v in value:
            if isinstance(v, dict):
                v = v.get("text") or v.get("title") or v.get("description") or ""
            items.append(str(v or ""))
    else:
        items = str(value or "").splitlines()
    out = []
    for item in items:
        t = re.sub(r"^\s*(?:[-*•▪◦]|\d+[.)])\s*", "", item).strip()
        if t:
            out.append(t if t.endswith((".", "!", "?", ":")) else f"{t}.")
    return out


def _paragraphs(value) -> list[str]:
    return [" ".join(p.split()) for p in re.split(r"\n\s*\n", str(value or "")) if p.strip()]


def _job_description_for(db, hire, req, title: str):
    from app.modules.hr.models import JobDescription
    jd = db.get(JobDescription, req.job_description_id) if req is not None and getattr(req, "job_description_id", None) else None
    if jd is not None and jd.organization_id == hire.organization_id:
        return jd
    rows = (db.query(JobDescription).filter(JobDescription.organization_id == hire.organization_id,
                                            func.lower(JobDescription.title) == title.casefold(),
                                            JobDescription.status != "RETIRED")
            .order_by(JobDescription.id.desc()).all())
    return next((j for j in rows if j.status == "APPROVED"), rows[0] if rows else None)


def _lower_first(t: str) -> str:
    return t[:1].lower() + t[1:] if t[:2] != t[:2].upper() else t


def generated_role(db, hire) -> Optional[dict]:
    """A role profile built from the hire's records (see above). None only when the hire has no position at all."""
    _cand, offer, req = _offer_for(db, hire)
    title = " ".join(str(hire.position or (offer.position if offer else None) or (req.title if req else None) or "").split())
    if not title:
        return None
    dept = (hire.department_name or (req.department if req else None) or "").strip()
    jd = _job_description_for(db, hire, req, title)
    about, duties, skills, source = [], [], [], "the position"
    if jd is not None:
        about, duties = _paragraphs(jd.purpose), _text_items(jd.key_responsibilities)
        skills = _text_items(jd.requirements_essential)
        source = "the job description"
    if req is not None and not (about and duties):
        # a requisition's text is often a short internal note ("need a backend developer"): only real sentences are printed
        lines = [t for t in _text_items(req.description) if len(t.split()) >= 3]
        if not any(len(t.split()) >= 8 for t in lines):
            lines = [t for t in lines if len(t.split()) >= 3] if len(lines) > 1 else []
        if not about and lines:
            long = [p for p in _paragraphs(req.description) if len(p.split()) >= 8]
            about = long[:2] if len(lines) <= 1 else ([lines[0]] if len(lines[0].split()) >= 8 else [])
        if not duties and len(lines) > 1:
            duties = lines[1:] if about and about[0] == lines[0] else lines
        if not skills:
            skills = [t for t in _text_items(req.requirements) if len(t.split()) >= 2]
        if about or duties:
            source = "the job description and requisition" if jd is not None else "the requisition"
    team = f" in the {dept} team" if dept else ""
    if not about:
        about = [f"The {title}{team} delivers the work of the role to the agreed standard, working closely with the manager "
                 "and colleagues.",
                 "The role's priorities and targets are agreed with the manager and reviewed regularly."]
    groups = [{"heading": "Key responsibilities", "bullets": duties[:12]}] if duties else [
        {"heading": "Core duties", "bullets": [f"Carry out the day-to-day duties of the {title} role as agreed with the manager.",
                                               "Plan and complete assigned work within the agreed timelines.",
                                               "Keep work accurate, documented and in line with company standards."]},
        {"heading": "Collaboration and reporting", "bullets": ["Work with the team and other departments towards shared goals.",
                                                               "Report progress, risks and blockers promptly.",
                                                               "Submit the Daily Work Report each working day."]},
        {"heading": "Development and compliance", "bullets": ["Keep skills up to date and complete the training the role needs.",
                                                              "Follow company policies, including confidentiality and "
                                                              "information security."]},
    ]
    if skills:
        groups.append({"heading": "Skills and requirements", "bullets": skills[:12]})
    headline = duties[:5] or ["Core duties: carry out the duties of the role as agreed with the manager.",
                              "Delivery: plan and complete assigned work on time and to the agreed standard.",
                              "Collaboration: work with the team and report progress, risks and blockers.",
                              "Compliance: follow company policies and protect company information."]
    main = duties[:6] or [b for g in groups[:2] for b in g["bullets"]]
    contract = "The main duties of the role are to " + "; ".join(_lower_first(d.rstrip(".")) for d in main) + "."
    return {"slug": "", "title": title, "about": about, "responsibility_groups": groups,
            "offer_responsibilities": headline, "contract_duties": contract, "required_skills": skills[:20],
            "work_setup": [], "performance_structure": ["Progress is reviewed regularly with the manager against the KPI areas below."],
            "kpi_areas": GENERIC_KPIS, "generated": True, "generated_from": source}


def _list(value) -> Optional[list]:
    return list(value) if value else None


def _v2_values(db, hire, cfg: dict, offer, v1: dict) -> dict:
    from app.core.regions import country_name
    from app.modules.hr import company_profile as CP
    from app.modules.hr import doc_formatting as F
    profile = _profile_for(db, hire.organization_id)
    eng, role = hire_profiles(db, hire)
    eng = eng or {}
    role = role or {}
    inputs = hire_inputs(hire)
    fmt = cfg.get("date_format") or "DMY"
    details = hire.profile_details or {}
    legal = profile.get("legal_name") or None

    # company
    if (profile.get("address_line1") or "").strip():
        parts = {k: profile.get(k) for k in ("address_line1", "address_line2", "city", "city_display", "district", "state",
                                              "postal_code")}
        company_lines = F.address_lines(parts, profile.get("country"))
    else:
        company_lines = CP.address_parts(profile)
    if not company_lines and (cfg.get("registered_address") or "").strip():     # saved before the Company Profile existed
        company_lines = [ln.strip() for ln in re.split(r"[\n]", cfg["registered_address"]) if ln.strip()]
    # Keep the package's existing counsel-clause setting as a compatibility source
    # for organisations that have not yet migrated this wording into Company Profile.
    clause_law = ((cfg.get("clauses") or {}).get("governing_law") or {}).get("text")
    law = (profile.get("governing_law_text") or clause_law or "").strip().rstrip(".").strip() or None   # template adds the "."
    if law is None and profile.get("jurisdiction_country") and profile.get("jurisdiction_city"):
        country = country_name(profile["jurisdiction_country"]) or profile["jurisdiction_country"]
        law = f"the laws of {country}; the courts at {profile['jurisdiction_city']} have exclusive jurisdiction"
    channel = (profile.get("reports_channel_text") or "").strip()

    # the person
    addr = worker_address_parts(details)
    has_address = any(addr.get(k) for k in ("address", "house", "street", "city"))
    worker_lines = F.address_lines(addr, addr.get("country")) if has_address else []
    if not worker_lines and v1.get("worker.postal_address"):          # HR typed the address as one line
        worker_lines = [ln.strip() for ln in str(v1["worker.postal_address"]).split(",") if ln.strip()]

    # pay: the offer's amount, else the amount HR typed for this hire in the package panel
    currency = _pay_currency(offer, profile, hire)
    typed = (hire_inputs(hire).get("employment.base_pay") or "").strip()
    raw_amount, period_key = None, None
    if offer is not None and offer.salary:
        raw_amount, period_key = offer.salary, (offer.pay_period or "annual")
    elif typed and _BARE_AMOUNT.match(typed):                         # "12000" / "12,000.50": format it like an offer
        raw_amount = typed.replace(",", "").replace(" ", "")
        period_key = _default_pay_period(eng, profile)
    amount, statement, typed_base = None, None, None
    if raw_amount is not None and currency:
        amount = F.format_money(raw_amount, currency, profile.get("number_grouping"))
        period = PER_PERIOD.get(period_key, "")
        if not (offer is not None and offer.salary):
            typed_base = f"{amount} {period}".strip()                 # also printed where the documents show "base pay"
        gross = " (gross)" if profile.get("stipend_gross_label") else ""
        statement = f"{amount} {period}{gross}".strip()
        if period_key == "monthly" and profile.get("pay_day_of_month"):
            day = F.ordinal(int(profile["pay_day_of_month"]))
            statement += f", paid on the {day} of each month for the preceding period"
    if amount is None and typed:                                      # HR typed the full wording ("GBP 42,000 per year")
        amount = typed
        # the statement carries the period too ("GBP 42,000 per year, paid monthly"), as the v1 pay terms did
        statement = v1.get("employment.pay_terms") or typed
    if amount is None and v1.get("employment.base_pay"):
        amount = v1["employment.base_pay"]
        statement = v1.get("employment.pay_terms") or amount
    start = hire.joining_date or (offer.joining_date if offer else None) or F.to_date(inputs.get("employment.start_date"))
    issue = F.to_date(inputs.get("document.issue_date")) or date.today()
    duties = role.get("contract_duties") or " ".join(role.get("offer_responsibilities") or []) or None
    initials = F.initials(hire.candidate_name)
    with_associates = legal
    if legal and profile.get("associated_companies_clause"):
        with_associates = f"{legal} (and its associated companies)"
    return {
        "company.legal_name": legal,
        "company.short_name": profile.get("short_name") or legal,
        "company.legal_name_with_associates": with_associates,
        "company.address_block": "\n".join(company_lines) or None,
        "company.address_inline": ", ".join(company_lines) or None,
        "company.cin": profile.get("cin") or None,
        "company.gstin": profile.get("gstin") or None,
        "company.phone": profile.get("phone") or None,
        "company.website": profile.get("website") or None,
        "company.onboarding_return_email": profile.get("onboarding_return_email") or profile.get("hr_contact_email") or None,
        "company.reports_email": profile.get("reports_email") or None,
        "company.reports_channel": f" and {channel}" if channel else "",
        "company.time_tracking_tool": profile.get("time_tracking_tool_name") or None,
        "company.task_system": profile.get("task_system_name") or None,
        "company.jurisdiction_city": profile.get("jurisdiction_city") or None,
        "company.governing_law": law,
        "company.copyright_line": profile.get("copyright_holder") or legal,
        "company.sign_off": profile.get("signatory_sign_off") or None,
        "company.group_name": profile.get("group_name") or None,
        "worker.full_name_caps": F.name_caps(hire.candidate_name) or None,
        "worker.initials": initials or None,
        "worker.address_block": "\n".join(worker_lines) or None,
        "worker.address_inline": ", ".join(worker_lines) or None,
        "engagement.programme_name": eng.get("programme_name") or None,
        "engagement.programme_short": eng.get("programme_short") or None,
        "engagement.party_term": eng.get("party_term") or None,
        "engagement.engagement_term": eng.get("engagement_term") or None,
        "engagement.assessment_months": eng.get("assessment_months"),
        "engagement.assessment_label": eng.get("assessment_label") or None,
        "engagement.conversion_text": eng.get("conversion_text") or None,
        "engagement.conversion_heading": ("Programme Structure and Conversion Pathway" if eng.get("programme_name")
                                          else f"{eng.get('assessment_label') or 'Probation'} and Confirmation"),
        "engagement.conversion_paragraph": eng.get("conversion_text") or (
            "Conversion to the next stage is not automatic and depends on the review at the end of the "
            f"{eng.get('assessment_label') or 'Probation'}."),
        "engagement.remuneration_label": eng.get("remuneration_label") or None,
        "engagement.work_schedule": _work_schedule(eng),
        "engagement.saturday_rule": eng.get("saturday_rule") or None,
        "engagement.leave_rule": eng.get("leave_rule") or None,
        "engagement.workspace_requirements": _list(eng.get("workspace_requirements")),
        "employment.start_date_long": F.format_date_long(start, fmt) or None,
        "employment.notice_text": _employee_notice_text(profile, eng),
        "employment.employer_notice_text": F.notice_text(profile.get("employer_notice_value"),
                                                         profile.get("employer_notice_unit")) or None,
        "employment.pay_amount": amount,
        "_typed_base_pay": typed_base,
        "employment.pay_statement": statement,
        "employment.duties_paragraph": duties,
        "offer.candidate_fit_summary": inputs.get("offer.candidate_fit_summary") or None,
        "offer.compliance_documents": _list(profile.get("compliance_documents")),
        "document.issue_date": F.format_date(issue, fmt),
        "document.issue_date_legal": F.format_date_legal(issue),
        "document.reference": f"{initials or 'NH'}-{hire.id}",
        "role.title": role.get("title") or None,
        "role.about": _list(role.get("about")),
        "role.responsibility_groups": _list(role.get("responsibility_groups")),
        "role.offer_responsibilities": _list(role.get("offer_responsibilities")),
        "role.required_skills": _list(role.get("required_skills")),
        "role.work_setup": _list(role.get("work_setup")),
        "role.performance_structure": _list(role.get("performance_structure")),
        "kpi.areas": _list(role.get("kpi_areas")),
        # one non-solicitation period: the NDA prints the post-termination period (the older NDA-only value as a fallback)
        "company.nda_non_solicit_months": profile.get("non_solicit_post_termination_months") or profile.get("nda_non_solicit_months"),
        "company.nda_non_compete_months": profile.get("nda_non_compete_months"),
        "company.non_solicit_months": profile.get("non_solicit_post_termination_months"),
        "company.confidentiality_duration": profile.get("nda_confidentiality_duration") or None,
        "company.affidavit_hours": profile.get("affidavit_submission_hours"),
        "company.affidavit_notary": "yes" if profile.get("affidavit_requires_notary") else "",
        "company.affidavit_stamp_note": profile.get("affidavit_stamp_paper_note") or None,
        "company.brand_label": profile.get("brand_label") or None,
        "company.brands": _list(profile.get("brands")),
        "company.group_name_caps": ((profile.get("group_name") or legal or "").upper()) or None,
        "company.velocity_motto": profile.get("velocity_motto") or None,
        "company.velocity_deadline": profile.get("velocity_deadline_text") or None,
        "document.year": str(issue.year),
        "engagement.timezone": eng.get("timezone_label") or None,
        "employment.work_location_suffix": f", at {offer.work_location}" if offer is not None and offer.work_location else "",
        "employment.country_is_in": "yes" if ((offer.work_country if offer is not None else None) or hire.work_country or "")
                                    .upper() == "IN" else "",
    }


_BARE_AMOUNT = re.compile(r"^\d{1,3}(?:[, ]?\d{2,3})*(?:\.\d{1,2})?$")


def _pay_currency(offer, profile: dict, hire) -> Optional[str]:
    """The offer's currency, else the Company Profile's, else the work country's."""
    cur = (offer.currency if offer is not None else None) or profile.get("currency")
    if not cur:
        country = (offer.work_country if offer is not None else None) or hire.work_country or profile.get("country")
        if country:
            from app.core import regions
            try:
                cur = regions.currency_for(country, None)
            except Exception:
                cur = None
    return (cur or "").upper() or None


def _default_pay_period(eng: dict, profile: dict) -> str:
    """The period of an amount HR typed without one: a stipend or a monthly payroll is per month, otherwise per year."""
    if (eng or {}).get("remuneration_type") == "stipend" or (profile.get("pay_frequency") or "monthly") == "monthly":
        return "monthly"
    return "annual"


def consistency_warnings(db, hire, cfg: Optional[dict] = None) -> list:
    """Non-blocking checks shown in amber in the package panel: inconsistent terms, dates and names. They never stop a
    send."""
    from app.modules.hr import company_profile as CP
    from app.modules.hr import doc_formatting as F
    cfg = cfg or _config_for(db, hire.organization_id)
    profile = _profile_for(db, hire.organization_id)
    cand, offer, _req = _offer_for(db, hire)
    eng, role = hire_profiles(db, hire)
    inputs = hire_inputs(hire)
    out = []

    def warn(code, text):
        out.append({"code": code, "message": text})

    start = F.to_date(hire.joining_date or (offer.joining_date if offer else None))
    issue = F.to_date(inputs.get("document.issue_date")) or date.today()
    if start and eng and eng.get("working_days") and F.weekday_code(start) not in eng["working_days"]:
        when = F.format_date_long(start, cfg.get("date_format"))
        warn("start_on_non_working_day",
             f"The start date ({when}) is not a working day in the {eng.get('name') or 'engagement'} profile.")
    if start and start < issue:
        warn("start_before_issue", "The start date is earlier than the issue date.")
    deadline = F.to_date(getattr(offer, "response_deadline", None)) if offer else None
    if deadline and start and deadline > start:
        warn("deadline_after_start", "The offer's response deadline is after the start date.")
    if offer is not None and offer.salary and not (offer.currency or profile.get("currency")):
        warn("pay_without_currency", "The pay amount has no currency.")
    if cand is not None and cand.name and hire.candidate_name:
        a = " ".join(cand.name.split()).casefold()
        b = " ".join(hire.candidate_name.split()).casefold()
        if a != b:
            warn("name_mismatch",
                 f"The name on the offer ({cand.name}) differs from the new hire record ({hire.candidate_name}).")
    _eng, source = engagement_with_source(db, hire)
    kind = _pretty(hire.employment_type or (offer.employment_type if offer else None))
    if source == "standard":
        warn("no_engagement_for_type",
             f"No engagement profile is set up for {kind or 'this'} hires, so the neutral Standard Employee terms are used. "
             "Choose the offer type on the offer, or the engagement profile above.")
    slug = (eng or {}).get("slug")
    rules = [r for r in profile.get("notice_rules") or [] if r.get("active") and r.get("value") is not None]
    if slug and rules and not any(r.get("employee_type") == slug for r in rules) and not (eng or {}).get("default"):
        printed = _employee_notice_text(profile, eng)
        if printed:
            warn("notice_from_all_employees_rule",
                 f"The notice printed ({printed}) is the all-employees rule: there is no notice rule for "
                 f"{(eng or {}).get('name') or slug}. If these hires give a different notice, add a rule for them in "
                 "Settings › Company Profile › Notice period rules.")
    emp = CP.notice_for(profile, (eng or {}).get("slug"))["after"] or (None, None)       # after probation: the lasting term
    er = (profile.get("employer_notice_value"), profile.get("employer_notice_unit"))
    if emp[0] is not None and er[0] is not None and tuple(emp) != er:
        warn("notice_mismatch", f"The employee gives {F.notice_text(*emp)} but the employer gives {F.notice_text(*er)}. "
                                "Check this is intended.")
    # (non-solicitation: the NDA and the contract print the one post-termination period, so they cannot disagree)
    rule = (eng or {}).get("leave_rule") or ""
    if rule and (eng or {}).get("leave_accrual_days_per_month") and re.search(r"unpaid|no pro-?rata", rule, re.I):
        warn("leave_rule_conflict",
             "The leave rule says leave is unpaid / not pro-rata, but the profile accrues leave each month.")
    if role is None:
        warn("no_role_profile", "No role profile matches this position. Choose one so the role's own duties are printed.")
    elif role.get("generated"):
        warn("role_profile_generated",
             f"No role profile is saved for \"{role['title']}\", so the role details were written automatically from "
             f"{role['generated_from']}. Check them in the preview, or save a role profile in Settings to use your own wording.")
    return out


PRINTED_GROUPS = (("Company", "company."), ("Employee", "worker."), ("Role", "role."), ("Role", "kpi.areas"),
                  ("Engagement", "engagement."), ("Pay & dates", "employment."), ("Offer & document", "offer."),
                  ("Offer & document", "document."))
_PRINTED_V1 = ("worker.full_name", "worker.email", "worker.employee_id", "employment.position_title", "employment.department",
               "employment.reports_to")


def printed_values(values: dict) -> list:
    """The v2 values grouped for the panel's "Values that will be printed" list."""
    groups: dict = {}
    for label, prefix in PRINTED_GROUPS:
        for key in C.FIELDS:
            if key.startswith(prefix) and (key in V2_COMPUTED or key in V2_HIRE_INPUTS or key in _PRINTED_V1):
                rows = groups.setdefault(label, [])
                if all(r["key"] != key for r in rows):
                    rows.append({"key": key, "label": C.FIELDS[key][0], "value": values.get(key)})
    return [{"group": g, "values": v} for g, v in groups.items()]


# ── per-operation cache ──────────────────────────────────────────────────────────────────────────────────────────────
# A hire's values do not depend on the document: opening the package panel, sending the package or listing what is
# outstanding used to rebuild them (company profile, offer, engagement profiles …) once per document — about 100 queries,
# which timed out against a distant database. Inside values_cache() each hire's values, the settings and the logo are built
# once. Nothing an operation writes while the cache is open (issued rows, stored files) is read when building values.
_CACHE_KEY = "_onboarding_package_cache"


@contextmanager
def values_cache(db):
    owner = _CACHE_KEY not in db.info
    if owner:
        db.info[_CACHE_KEY] = {}
    try:
        yield
    finally:
        if owner:
            db.info.pop(_CACHE_KEY, None)


def _cached(db, key, build):
    cache = db.info.get(_CACHE_KEY)
    if cache is None:
        return build()
    if key not in cache:
        cache[key] = build()
    return cache[key]


def _profile_for(db, organization_id: int) -> dict:
    from app.modules.hr import company_profile as CP
    return _cached(db, ("company_profile", organization_id), lambda: CP.get_profile(db, organization_id))


def _config_for(db, organization_id: int) -> dict:
    return _cached(db, ("config", organization_id), lambda: get_config(db, organization_id))


def _values_for(db, hire, cfg: dict, *, secure_link: Optional[str] = None, contract_id: Optional[str] = None) -> dict:
    """A copy of the hire's values (callers may change their copy)."""
    built = _cached(db, ("values", hire.id, secure_link, contract_id),
                    lambda: build_values(db, hire, cfg, secure_link=secure_link, contract_id=contract_id))
    return dict(built)


def doc_meta(db, hire_or_org, category: str) -> dict:
    """The document's description for this organisation (title, template id, the organisation's mode …)."""
    from app.modules.hr import onboarding_package_org as ORG
    org_id = hire_or_org if isinstance(hire_or_org, int) else hire_or_org.organization_id
    return _cached(db, ("meta", org_id, category), lambda: ORG.meta(db, org_id, category))


def package_categories(db, hire) -> list[str]:
    """The hire's package documents in order: those in the package now, then any sent earlier that are no longer in it."""
    from app.modules.hr import onboarding_package_org as ORG
    cats = [d["category"] for d in ORG.documents_for_hire(db, hire)]
    return cats + [c for c in _rows(db, hire) if c not in cats]


def _content_for(db, hire, category: str, fresh: bool) -> tuple:
    """(renderer blocks, source). A document already issued uses the version it was issued from (version safety);
    `fresh` (sending) resolves the version that applies now."""
    from app.modules.hr import onboarding_package_org as ORG
    if not fresh:
        row = _rows(db, hire).get(category)
        src = issued_meta(row).get("source") if row is not None else None
        if src:
            content = ORG.content_for_source(db, category, src)
            if content is not None:
                return content, src
    return ORG.resolve(db, hire, category)


def render_context(db, hire, category: str, *, cfg: Optional[dict] = None, final: bool = False, esign: bool = False,
                   secure_link: Optional[str] = None, contract_id: Optional[str] = None, fresh: bool = False) -> R.RenderContext:
    cfg = cfg or _config_for(db, hire.organization_id)
    meta = doc_meta(db, hire, category)
    content, source = _content_for(db, hire, category, fresh)
    values = _values_for(db, hire, cfg, secure_link=secure_link, contract_id=contract_id)
    if not final:   # previews: show where the generated values will go
        values.setdefault("offer.secure_link", None)
        values["offer.secure_link"] = values["offer.secure_link"] or "(your secure onboarding link – added when sent)"
        values["contract.id"] = values["contract.id"] or "(assigned when issued)"
    ctx = R.RenderContext(mode="issue", values=values, clauses=cfg.get("clauses") or {},
                          optional=set(C.OPTIONAL_BY_DOC.get(category, set())),
                          activities=(hire.profile_details or {}).get("outside_activities"),
                          org_label=header_label(cfg), primary=cfg["brand_primary"],
                          accent=cfg["brand_accent"], paper=cfg["paper"], spelling=cfg["spelling"],
                          effective_date=values.get("document.effective_date") or "", esign=esign,
                          logo_png=_cached(db, ("logo", hire.organization_id), lambda: logo_bytes(db, hire.organization_id, cfg)),
                          signature_png=_cached(db, ("signature", hire.organization_id),
                                                lambda: signature_bytes(db, hire.organization_id, cfg)),
                          content=content, source=source, meta=meta)
    if source.get("kind") == "variant":
        ctx.version = f"{C.PACKAGE_VERSION} (organisation v{source.get('variant_version')})"
    gaps = readiness(ctx, category)
    ctx.draft = not (final and gaps["ready"])
    ctx.status_text = (f"ISSUED – {values['generated_at']}" if not ctx.draft else None)
    return ctx


# values built from other fields: when missing, the field they come from is what HR is asked for
DERIVED_FROM = {"employment.work_pattern": ("employment.working_hours",),
                "employment.continuous_service_date": ("employment.start_date",),
                "employment.pay_terms": ("employment.base_pay", "employment.pay_frequency")}


def readiness(ctx: R.RenderContext, category: str) -> dict:
    fields, clauses = [], []
    for tok in C.tokens_in(category, R.content_for(category, ctx)):
        ck = C.clause_key(tok)
        if ck:
            if ctx.clause_value(ck) is None:
                clauses.append(ck)
            else:
                for gap in ctx.clause_gaps(ck):            # a merge field in the wording with no value: never print "{{…}}"
                    key = "clause." + gap
                    if key not in fields:
                        fields.append(key)
        elif ctx.field_value(tok) is None and tok not in ("offer.secure_link", "contract.id"):
            for src in DERIVED_FROM.get(tok, (tok,)):
                if ctx.field_value(src) is None and src not in fields:
                    fields.append(src)
    return {"ready": not fields and not clauses, "missing_fields": fields, "missing_clauses": clauses}


def template_context(db, organization_id: int) -> R.RenderContext:
    cfg = get_config(db, organization_id)
    return R.RenderContext(mode="template", org_label=header_label(cfg),
                           primary=cfg["brand_primary"], accent=cfg["brand_accent"], paper=cfg["paper"], spelling=cfg["spelling"],
                           effective_date=_fmt_date(cfg.get("effective_date") or date.today(), cfg),
                           logo_png=logo_bytes(db, organization_id, cfg))


def template_set_pdf(db, organization_id: int) -> bytes:
    return R.render_template_set(template_context(db, organization_id))


def stored_document_pdf(db, document_id: Optional[int], organization_id: int) -> Optional[tuple[bytes, str]]:
    """(bytes, file name) of the document the new hire was actually sent, from the document store: the signed copy (with
    the signatures page and the evidence certificate) once it is executed, otherwise the issued original. None when the
    onboarding row is not backed by an issued document (a plain upload)."""
    if not document_id:
        return None
    gen = db.get(GeneratedDocument, document_id)
    if gen is None or gen.organization_id != organization_id:
        return None
    signed = gen.status == "EXECUTED" and bool(gen.executed_pdf_path)
    key = gen.executed_pdf_path if signed else gen.pdf_path
    if not key:
        return None
    try:
        data = storage.get_store().get(key)
    except Exception:
        logger.exception("stored document %s could not be read", gen.id)
        return None
    title = re.sub(r"[^A-Za-z0-9 ._-]+", "", gen.title or "document").strip() or "document"
    return data, f"{title} - {gen.document_number}{' (signed)' if signed else ''}.pdf"


def preview_pdf(db, hire, category: str) -> bytes:
    """What HR sees under "Preview": the document as sent (signed copy once signed); a draft render only before sending."""
    _known(db, hire, category)
    from app.modules.hr import onboarding_package_forms as FORMS
    filled = FORMS.filled_pdf(db, hire, category)
    if filled is not None:                               # a form the new hire filled in online: their completed copy
        return filled
    row = _rows(db, hire).get(category)
    if row is not None and row.document_id:
        stored = stored_document_pdf(db, row.document_id, hire.organization_id)
        if stored is not None:
            return stored[0]
    return R.render_pdf(category, render_context(db, hire, category))


# ── state of a hire's package ────────────────────────────────────────────────────────────────────────────────────────
def _known(db, hire, category: str) -> None:
    from app.modules.hr import onboarding_package_org as ORG
    if not ORG.is_package_category(category) or category not in ORG.known_categories(db, hire.organization_id):
        raise HTTPException(404, "Unknown package document.")


def _rows(db, hire) -> dict:
    from app.modules.hr import onboarding_package_org as ORG
    rows = (db.query(OnboardingDocument)
            .filter(OnboardingDocument.onboarding_new_hire_id == hire.id, OnboardingDocument.is_deleted == False,  # noqa: E712
                    OnboardingDocument.category.in_(ORG.known_categories(db, hire.organization_id)))
            .order_by(OnboardingDocument.id.desc()).all())
    out = {}
    for r in rows:
        out.setdefault(r.category, r)
    return out


def _gen(db, row) -> Optional[GeneratedDocument]:
    return db.get(GeneratedDocument, row.document_id) if row is not None and row.document_id else None


def _row_state(db, row) -> str:
    """not_sent | awaiting_signature | awaiting_acknowledgement | awaiting_upload | needs_review | completed | available |
    declined | rejected"""
    if row is None:
        return "not_sent"
    mode = mode_of(row)
    hire = getattr(row, "new_hire", None)
    if hire is not None and not package_file_key(hire, row.category) and not _is_recruitment_letter(db, hire, row):
        # never issued through this package: an upload request made before it existed, or a document the earlier automatic
        # generator created by itself. Only a signed one is kept (as a record); everything else is sent only when HR presses Send.
        gen = _gen(db, row)
        return "completed" if gen is not None and gen.status == "EXECUTED" else "not_sent"
    if row.status == NO_ACTION_STATUS:
        return "available"
    if row.status == "approved":
        return "completed"
    if row.status == "rejected":
        return "rejected"
    if mode == "SIGN":
        gen = _gen(db, row)
        if gen is not None and gen.status in ("DECLINED", "EXPIRED", "REVOKED", "CANCELLED"):
            return "declined"
        return "awaiting_signature"
    if mode == "ACKNOWLEDGE":
        return "awaiting_acknowledgement"
    if mode == "COMPLETE":
        return "needs_review" if row.status == "pending" else "awaiting_upload"
    return "available"


def _is_recruitment_letter(db, hire, row) -> bool:
    """The offer letter signed in Recruitment, linked into the package (not issued by it)."""
    if row.category != "offer_letter" or not row.document_id:
        return False
    _cand, offer, _req = _offer_for(db, hire)
    return bool(offer is not None and getattr(offer, "document_id", None) == row.document_id)


# v2 documents print the hire's address as address_block / address_inline, both computed from the one postal address the
# new hire enters in the portal (or HR types in for them): a gap in either is reported as that one input.
ADDRESS_INPUT = "worker.postal_address"
_ADDRESS_FORMS = {"worker.address_block", "worker.address_inline"}


# computed values with a gap are reported as the input HR types for this hire (so the panel offers a box to fill)
_COMPUTED_FROM_INPUT = {"employment.pay_statement": "employment.base_pay", "employment.pay_amount": "employment.base_pay",
                        "employment.start_date_long": "employment.start_date"}


def _reported_missing(keys: list) -> list:
    out: dict = {}
    for k in keys:
        out.setdefault(ADDRESS_INPUT if k in _ADDRESS_FORMS else _COMPUTED_FROM_INPUT.get(k, k), None)
    return list(out)


def field_meaning(key: str) -> str:
    if key.startswith("clause."):
        from app.modules.hr import onboarding_clause_tokens as T
        return T.label(key.split(".", 1)[1])
    return C.FIELDS[key][0] if key in C.FIELDS else key


def field_source(key: str) -> str:
    if key.startswith("clause."):
        return "Settings › Company Profile › Clause details"
    return C.FIELDS[key][1] if key in C.FIELDS else ""


def _clause_token_known(key: str) -> bool:
    if not key.startswith("clause."):
        return False
    from app.modules.hr import onboarding_clause_tokens as T
    return key.split(".", 1)[1] in T.CATALOG


def _settings_path(key: str) -> Optional[str]:
    """Where in Onboarding › Settings an organisation-wide value that is missing is set (None: typed per hire)."""
    base = "/zoiko-hr/onboarding/settings#"
    if key in HIRE_INPUT_FIELDS or key == ADDRESS_INPUT:
        return None
    if key.startswith("clause."):
        return base + "company-profile-clauses"
    if key in ("employment.notice_text", "employment.employer_notice_text"):
        return base + "company-profile-legal"
    if key.startswith(("engagement.", "role.")) or key == "kpi.areas":
        return base + "onboarding-profiles"
    if key.startswith(("company.", "employer.")):
        return base + "company-profile"
    return base + "offer-package"


def package_view(db, hire) -> dict:
    with values_cache(db):
        return _package_view(db, hire)


def _package_view(db, hire) -> dict:
    from app.modules.hr import onboarding_package_forms as FORMS
    cfg = _config_for(db, hire.organization_id)
    rows = _rows(db, hire)
    docs = []
    in_package = {d["category"] for d in _org().documents_for_hire(db, hire)}
    for cat in package_categories(db, hire):
        d = doc_meta(db, hire, cat)
        ctx = render_context(db, hire, cat, cfg=cfg, final=True)
        gaps = readiness(ctx, cat)
        row = rows.get(cat)
        gen = _gen(db, row)
        docs.append({
            "category": cat, "title": d["title"], "template_id": d["template_id"], "mode": d["mode"],
            "mode_label": C.MODE_LABELS[d["mode"]], "doc_type": d["doc_type"], "risk": d["risk"], "sensitivity": d["sensitivity"],
            "orientation": d["orientation"], "signers": d["signers"], "state": _row_state(db, row),
            "source": d.get("source", "platform"), "in_package": cat in in_package,
            "template_version": (ctx.source or {}).get("variant_version"),
            "onboarding_document_id": row.id if row else None, "status": row.status if row else None,
            "signing_status": gen.status if gen else None, "ready": gaps["ready"],
            "filled_online": d["mode"] == "COMPLETE" and row is not None and FORMS.submitted(db, hire, cat) is not None,
            "missing_fields": [{"key": k, "meaning": field_meaning(k), "source": field_source(k),
                                "editable": k in HIRE_INPUT_FIELDS or _clause_token_known(k),
                                "org_wide": k.startswith("clause."),
                                "candidate_provides": k == ADDRESS_INPUT, "hr_may_enter": k == ADDRESS_INPUT,
                                "settings_path": _settings_path(k)}
                               for k in _reported_missing(gaps["missing_fields"])],
            "missing_clauses": [{"key": k, "title": C.CLAUSES[k][0]} for k in gaps["missing_clauses"]],
        })
    pkg = (hire.profile_details or {}).get("_package") or {}
    values = _values_for(db, hire, cfg)
    return {"new_hire_id": hire.id, "candidate_name": hire.candidate_name, "email": hire.email, "documents": docs,
            "sent_at": pkg.get("sent_at"), "inputs": hire_inputs(hire),
            "input_fields": [{"key": k, "meaning": input_meaning(k),
                              "value": values.get(k) if k in C.FIELDS else hire_inputs(hire).get(k),
                              "required": C.FIELDS[k][2] if k in C.FIELDS else False} for k in HIRE_INPUT_FIELDS],
            "warnings": consistency_warnings(db, hire, cfg),
            "engagement": _engagement_summary(db, hire),
            "role": _role_summary(db, hire),
            "role_profiles": _role_profile_choices(db, hire.organization_id),
            "printed_values": printed_values(values),
            "ready_to_send": [d["category"] for d in docs if d["ready"] and d["state"] in ("not_sent", "declined")]}


def _engagement_summary(db, hire) -> dict:
    eng, source = engagement_with_source(db, hire)
    return {"slug": (eng or {}).get("slug"), "name": (eng or {}).get("name"), "source": source}


def _role_summary(db, hire) -> dict:
    """The role profile the documents use and why: "chosen" (HR picked it), "position" (its title matches the hire's
    position), "generated" (no profile matches: built from the job details) or "missing" (the chosen profile was deleted)."""
    from app.modules.hr import onboarding_profiles as PR
    chosen = hire_inputs(hire).get("role_profile_slug") or None
    role = PR.role_for(db, hire.organization_id, chosen, hire.position)
    if role is not None:
        return {"slug": role.get("slug"), "title": role.get("title"), "source": "chosen" if chosen else "position"}
    return {"slug": None, "title": hire.position or None, "source": "missing" if chosen else "generated"}


def _role_profile_choices(db, organization_id: int) -> list[dict]:
    """Every role profile the organisation configured, for the panel's Role profile choice (sorted by title)."""
    from app.modules.hr import onboarding_profiles as PR
    out = [{"slug": p["slug"], "title": p.get("title") or p["slug"]} for p in PR.role_profiles(db, organization_id) if p.get("slug")]
    return sorted(out, key=lambda p: str(p["title"]).casefold())


# ── the organisation's board: the 10 documents of every new hire (Onboarding › Checklists) ─────────────────────────────
BOARD_STATES = ("not_sent", "awaiting_signature", "awaiting_acknowledgement", "awaiting_upload", "needs_review", "completed",
                "available", "declined", "rejected")
_BOARD_ACTIVE = ("offer_sent", "offer_accepted", "pre_joining", "in_progress")
_DONE = ("completed", "available")          # == onboarding_submissions.DONE_STATES: needs_review is not done


def status_board(db, organization_id: int, *, include_finished: bool = False) -> dict:
    """The state of each of the 10 package documents for every new hire of the organisation, in a fixed number of queries
    (hires, their documents, the signing records; offer lookups only for a linked recruitment offer letter). No document is
    rendered here: the per-hire panel (package_view) is where readiness and missing data are worked out."""
    with values_cache(db):
        q = db.query(OnboardingNewHire).filter(OnboardingNewHire.organization_id == organization_id,
                                               OnboardingNewHire.is_deleted == False)  # noqa: E712
        q = q.filter(OnboardingNewHire.status != "cancelled") if include_finished else             q.filter(OnboardingNewHire.status.in_(_BOARD_ACTIVE))
        hires = q.order_by(OnboardingNewHire.joining_date.is_(None), OnboardingNewHire.joining_date, OnboardingNewHire.id).all()
        by_hire: dict = {}
        ORG = _org()
        if hires:
            rows = (db.query(OnboardingDocument)
                    .filter(OnboardingDocument.onboarding_new_hire_id.in_([h.id for h in hires]),
                            OnboardingDocument.is_deleted == False,  # noqa: E712
                            OnboardingDocument.category.in_(ORG.known_categories(db, organization_id)))
                    .order_by(OnboardingDocument.id.desc()).all())
            gen_ids = {r.document_id for r in rows if r.document_id}
            if gen_ids:                                   # loaded once: _gen() then finds them in the session
                db.query(GeneratedDocument).filter(GeneratedDocument.id.in_(gen_ids)).all()
            for r in rows:
                by_hire.setdefault(r.onboarding_new_hire_id, {}).setdefault(r.category, r)
        documents = [{"category": d["category"], "title": d["title"], "mode": d["mode"], "mode_label": C.MODE_LABELS[d["mode"]]}
                     for d in ORG.documents_for_org(db, organization_id)]
        pkg_rows = {r.category: r for r in ORG.rows_for(db, organization_id)}
        audience_rules = any((r.applies_to_engagement_slugs or r.excluded_engagement_slugs) for r in pkg_rows.values())
        totals = {s: 0 for s in BOARD_STATES}
        out = []
        for hire in hires:
            rows = by_hire.get(hire.id, {})
            docs, counts = {}, {s: 0 for s in BOARD_STATES}
            slug = None
            if audience_rules:                            # only when a document is limited to some engagement profiles
                eng, _src = engagement_with_source(db, hire)
                slug = (eng or {}).get("slug")
            for d in documents:
                row = rows.get(d["category"])
                if row is None and audience_rules and not ORG.applies_to(pkg_rows[d["category"]], slug):
                    docs[d["category"]] = {"state": "not_included", "onboarding_document_id": None, "updated_at": None}
                    continue
                state = _row_state(db, row)
                counts[state] += 1
                totals[state] += 1
                docs[d["category"]] = {"state": state, "onboarding_document_id": row.id if row else None,
                                       "updated_at": (row.updated_at or row.created_at).isoformat()
                                       if row is not None and (row.updated_at or row.created_at) else None}
            pkg = (hire.profile_details or {}).get("_package") or {}
            out.append({"new_hire_id": hire.id, "candidate_name": hire.candidate_name, "position": hire.position,
                        "status": hire.status, "joining_date": hire.joining_date.isoformat() if hire.joining_date else None,
                        "sent_at": pkg.get("sent_at"), "documents": docs, "counts": counts,
                        "done": sum(n for s, n in counts.items() if s in _DONE),
                        "total": sum(1 for v in docs.values() if v["state"] != "not_included")})
        return {"documents": documents, "hires": out, "totals": totals}


# ── issuing ──────────────────────────────────────────────────────────────────────────────────────────────────────────
def _ensure_definition(db, d: dict) -> TemplateDefinition:
    t = db.get(TemplateDefinition, d["template_id"])
    if t is None:      # package-specific ids (HR-CON-101 …) are not in the 566 register
        t = TemplateDefinition(canonical_id=d["template_id"], family_id=d["family_id"], title=d["title"], kind=d["doc_type"],
                               legal_risk=d["risk"], sensitivity=d["sensitivity"], catalogue_status="ONBOARDING_PACKAGE",
                               implemented=False, output_mode="DOCUMENT", execution_mode="SIGN_CANDIDATE",
                               audience="COUNTERPARTY", approval_policy=d["risk"], source_spec=f"HR-ONBOARDING-PACKAGE v{C.PACKAGE_VERSION}")
        db.add(t)
        db.flush()
    return t


def _store_files(hire, category: str, key: str) -> None:
    details = dict(hire.profile_details or {})
    files = dict(details.get("_package_files") or {})
    files[category] = key
    details["_package_files"] = files
    hire.profile_details = details


def package_file_key(hire, category: str) -> Optional[str]:
    return ((hire.profile_details or {}).get("_package_files") or {}).get(category)


def _slug(category: str) -> str:
    """A category as a file-name part (organisation documents are "org:<template id>")."""
    return re.sub(r"[^A-Za-z0-9_-]+", "-", category)


def _issue_one(db, hire, d: dict, cfg: dict, actor, secure_link: str, row: Optional[OnboardingDocument]) -> OnboardingDocument:
    cat, mode = d["category"], d["mode"]
    store = storage.get_store()
    number = f"ONB-{d['template_id'].replace('HR-', '')}-{hire.id}-{secrets.token_hex(3).upper()}"
    ctx = render_context(db, hire, cat, cfg=cfg, final=True, esign=(mode == "SIGN"), secure_link=secure_link,
                         contract_id=number if cat == "employment_contract" else None, fresh=True)
    pdf = R.render_pdf(cat, ctx)
    if "{{" in renderer.pdf_text(pdf):              # readiness: never issue a document with an unfilled placeholder
        raise NotReady(cat)
    source = dict(ctx.source or {})
    key = store.put(hire.organization_id, f"onb-{hire.id}-{_slug(cat)}-{secrets.token_hex(4)}.pdf", pdf)
    _store_files(hire, cat, key)
    gen_id = None
    if mode == "SIGN":
        t = _ensure_definition(db, d)
        html = R.render_html(cat, ctx, document_number=number)
        html_key = store.put(hire.organization_id, f"onb-{hire.id}-{_slug(cat)}-{secrets.token_hex(4)}.html", html.encode("utf-8"))
        now = datetime.utcnow()
        gen = GeneratedDocument(
            document_number=number, organization_id=hire.organization_id, canonical_id=t.canonical_id, family_id=d["family_id"],
            title=d["title"], kind=d["doc_type"], legal_risk=d["risk"], sensitivity=d["sensitivity"], output_mode="DOCUMENT",
            # an organisation document can ask the employer to sign too (its signers on the package card)
            execution_mode="SIGN_BOTH" if "employer" in (d.get("party_signers") or []) else "SIGN_CANDIDATE", audience="COUNTERPARTY", approval_policy=d["risk"], subject_type="new_hire",
            subject_id=hire.id, source_ref=f"onboarding_new_hire:{hire.id}", language="en", rendered_html_path=html_key,
            pdf_path=key, pdf_sha256=hashlib.sha256(pdf).hexdigest(), recipient_name=hire.candidate_name,
            recipient_email=hire.email, requested_by=getattr(actor, "id", None) or _fallback_actor(db, hire),
            issued_by=getattr(actor, "id", None), issued_at=now, due_by=now + timedelta(days=int(cfg.get("response_days") or 7)),
            expires_at=now + timedelta(days=30), variant_id=source.get("variant_id"),
            variant_version=source.get("variant_version"), variant_checksum=source.get("variant_checksum"))
        state._set(gen, "ISSUED")
        db.add(gen)
        db.flush()
        state.add_event(db, gen, "issued", actor_id=getattr(actor, "id", None), detail={"package": cat})
        raw, _ = signing.issue_candidate_token(db, gen)
        details = dict(hire.profile_details or {})
        tokens = dict(details.get("_signing_tokens") or {})
        tokens[str(gen.id)] = raw
        details["_signing_tokens"] = tokens
        hire.profile_details = details
        gen_id = gen.id
    status = {"SIGN": "requested", "ACKNOWLEDGE": "requested", "COMPLETE": "requested"}.get(mode, NO_ACTION_STATUS)
    file_path = None if mode == "COMPLETE" else key        # COMPLETE: the candidate's upload becomes the file
    if row is None:
        row = OnboardingDocument(organization_id=hire.organization_id, onboarding_new_hire_id=hire.id, title=d["title"],
                                 category=cat, created_by="system")
        db.add(row)
    row.title, row.file_path, row.document_id, row.status, row.rejection_reason = d["title"], file_path, gen_id, status, None
    row.details_changed, row.kind = False, "package"
    row.details_changed = False          # freshly issued from the current details; the reissue warning no longer applies
    db.flush()
    details = dict(hire.profile_details or {})              # the version and mode this document was issued under
    issued = dict(details.get("_package_issued") or {})
    # version safety: what this document was issued from (template version, content and values checksums, the PDF's hash)
    snapshot = hashlib.sha256(json.dumps(ctx.values, sort_keys=True, default=str).encode("utf-8")).hexdigest()
    issued[str(row.id)] = {"version": C.PACKAGE_VERSION, "mode": mode, "category": cat, "issued_at": datetime.utcnow().isoformat(),
                           "template_id": d["template_id"], "title": d["title"], "source": source,
                           "variant_id": source.get("variant_id"), "variant_version": source.get("variant_version"),
                           "variant_checksum": source.get("variant_checksum"), "starter_revision": source.get("starter_revision"),
                           "content_checksum": source.get("content_checksum"), "values_checksum": snapshot,
                           "clauses": sorted(k for k, v in (ctx.clauses or {}).items() if (v or {}).get("text")),
                           "rendered_sha256": hashlib.sha256(pdf).hexdigest(), "worker_checksum": worker_checksum(ctx.values)}
    details["_package_issued"] = issued
    hire.profile_details = details
    return row


class NotReady(Exception):
    """The rendered document still shows a "{{…}}" placeholder: it is held, not issued."""


def worker_checksum(values: dict) -> str:
    """The new hire's own details printed in a document (worker.*): compared when they change their details later."""
    mine = {k: v for k, v in (values or {}).items() if str(k).startswith("worker.")}
    return hashlib.sha256(json.dumps(mine, sort_keys=True, default=str).encode("utf-8")).hexdigest()


def flag_details_changed(db, hire) -> int:
    """After the new hire changes their details: a document already sent but not yet signed / acknowledged / returned that
    printed different details is flagged "Details changed – reissue" for HR. A sent document itself is never altered."""
    try:
        with values_cache(db):
            current = worker_checksum(_values_for(db, hire, _config_for(db, hire.organization_id)))
        n = 0
        for row in _rows(db, hire).values():
            meta = issued_meta(row)
            if not meta.get("worker_checksum") or row.status != "requested" or row.details_changed:
                continue
            if meta["worker_checksum"] != current:
                row.details_changed = True
                n += 1
        if n:
            db.commit()
        return n
    except Exception:
        db.rollback()
        logger.exception("details-changed check failed for new hire %s", hire.id)
        return 0


def _fallback_actor(db, hire) -> int:
    from app.modules.employee.models import Employee
    emp = (db.query(Employee).filter(Employee.organization_id == hire.organization_id).order_by(Employee.id).first())
    if emp is None:
        raise HTTPException(409, "No employee account exists in this organisation to record as the issuer.")
    return emp.id


def _link_recruitment_offer(db, hire, row) -> Optional[OnboardingDocument]:
    """An offer letter already signed in Recruitment is reused, not issued twice."""
    _cand, offer, _req = _offer_for(db, hire)
    gen = db.get(GeneratedDocument, offer.document_id) if offer and getattr(offer, "document_id", None) else None
    if gen is None or gen.status != "EXECUTED":
        return None
    if row is None:
        row = OnboardingDocument(organization_id=hire.organization_id, onboarding_new_hire_id=hire.id, title="Offer Letter",
                                 category="offer_letter", created_by="system")
        db.add(row)
    row.document_id, row.file_path, row.status = gen.id, gen.executed_pdf_path or gen.pdf_path, "approved"
    db.flush()
    return row


def send_package(db, hire: OnboardingNewHire, actor=None, categories: Optional[list[str]] = None, *, notify: bool = True,
                 automatic: bool = False) -> dict:
    """Issue every ready document of the package that has not been issued yet. Never re-issues a live document."""
    with values_cache(db):
        return _send_package(db, hire, actor, categories, notify=notify, automatic=automatic)


def _send_package(db, hire: OnboardingNewHire, actor=None, categories: Optional[list[str]] = None, *, notify: bool = True,
                  automatic: bool = False) -> dict:
    from app.modules.hr import onboarding_flow
    if hire.status not in onboarding_flow.ACTIVE_STATUSES:
        raise HTTPException(400, "Onboarding documents can only be sent while onboarding is active.")
    in_package = {d["category"]: d for d in _org().documents_for_hire(db, hire)}
    wanted = [c for c in (categories or list(in_package)) if c in in_package]   # switched off / not for this hire: never sent
    cfg = _config_for(db, hire.organization_id)
    rows = _rows(db, hire)
    secure_link = onboarding_flow.current_portal_url(db, hire)
    issued, held, unchanged = [], [], []
    for cat in wanted:
        d, row = in_package[cat], rows.get(cat)
        st = _row_state(db, row)
        if st not in ("not_sent", "declined"):
            unchanged.append({"category": cat, "title": d["title"], "state": st})
            continue
        if cat == "offer_letter" and _link_recruitment_offer(db, hire, row):
            unchanged.append({"category": cat, "title": d["title"], "state": "completed"})
            continue
        gaps = readiness(render_context(db, hire, cat, cfg=cfg, final=True, secure_link=secure_link, fresh=True), cat)
        if not gaps["ready"]:
            held.append({"category": cat, "title": d["title"], **gaps})
            continue
        old = _gen(db, row)
        if old is not None and old.status == "ISSUED":          # a leftover from the earlier generator: replaced, link revoked
            state.transition(db, old, "SUPERSEDED", actor_id=getattr(actor, "id", None),
                             detail={"reason": "replaced by the onboarding package document sent by HR"})
            signing.revoke_candidate_tokens(db, old)
        try:
            _issue_one(db, hire, d, cfg, actor, secure_link, row)
        except NotReady:
            held.append({"category": cat, "title": d["title"], "ready": False, "missing_fields": ["unfilled placeholder"],
                         "missing_clauses": []})
            continue
        issued.append({"category": cat, "title": d["title"], "mode": d["mode"]})
    details = dict(hire.profile_details or {})
    pkg = dict(details.get("_package") or {})
    if issued or not automatic:
        pkg.update({"sent_at": pkg.get("sent_at") or datetime.utcnow().isoformat(), "last_sent_at": datetime.utcnow().isoformat(),
                    "sent_by": getattr(actor, "id", None) if actor else pkg.get("sent_by")})
    # documents held for the new hire's details are released automatically later; a send of a chosen few changes the hold
    # of those documents only (an earlier hold of another document stays)
    pkg["held"] = [c for c in (pkg.get("held") or []) if c not in wanted] + [h["category"] for h in held]
    if issued:
        pkg.pop("submitted_at", None)          # new documents to act on: the hire's earlier submission no longer covers them
    details["_package"] = pkg
    hire.profile_details = details
    db.commit()
    sync_onboarding_document_checklist(db, hire)
    from app.modules.hr.service import log_onboarding_activity
    if issued:
        log_onboarding_activity(db, hire.id, "Offer package issued" if not automatic else "Offer package documents released",
                                f"{len(issued)} document(s) issued to {hire.candidate_name}: " + ", ".join(i["title"] for i in issued)
                                + ("" if not automatic else " (after the new hire completed their details)."),
                                hire.organization_id)
    email_sent = False
    if issued and notify:
        email_sent = _notify(db, hire, issued, secure_link)
    return {"issued": issued, "held": held, "unchanged": unchanged, "portal_url": secure_link, "email_sent": email_sent}


def _notify(db, hire, issued: list[dict], url: str) -> bool:
    from app.modules.hr import onboarding_flow
    note = {"SIGN": "E-signature required", "ACKNOWLEDGE": "Please acknowledge receipt", "COMPLETE": "Complete and upload",
            "VOLUNTARY": "Optional – voluntary", "INFO": "For information"}
    try:
        return bool(onboarding_flow.notify_document_request(db, hire, [{"title": i["title"], "note": note[i["mode"]]} for i in issued]))
    except Exception:
        logger.exception("offer package e-mail failed for new hire %s", hire.id)
        return False


def release_held(db, hire) -> dict:
    """Called after the candidate saves portal details: issue documents that were waiting only for that data."""
    pkg = (hire.profile_details or {}).get("_package") or {}
    if not pkg.get("sent_at") or not pkg.get("held"):
        return {"issued": []}
    try:
        return send_package(db, hire, None, list(pkg["held"]), notify=False, automatic=True)
    except HTTPException:
        return {"issued": []}
    except Exception:
        db.rollback()
        logger.exception("releasing held package documents failed for new hire %s", hire.id)
        return {"issued": []}


def generate_onboarding_package(db, hire, categories=None, actor=None) -> list[OnboardingDocument]:
    """Backwards-compatible wrapper: issue the package and return the hire's package document rows."""
    send_package(db, hire, actor, categories, notify=False)
    return list(_rows(db, hire).values())


def link_documents_to_employee(db, hire, employee) -> int:
    """On completion: the new employee sees their own signed offer letter and package documents in self-service."""
    from sqlalchemy import or_
    _cand, offer, _req = _offer_for(db, hire)
    ids = [r.document_id for r in _rows(db, hire).values() if r.document_id]
    if offer is not None and getattr(offer, "document_id", None):
        ids.append(offer.document_id)
    q = db.query(GeneratedDocument).filter(
        GeneratedDocument.organization_id == hire.organization_id, GeneratedDocument.recipient_employee_id.is_(None),
        or_(GeneratedDocument.id.in_(ids or [0]),
            (GeneratedDocument.subject_type == "new_hire") & (GeneratedDocument.subject_id == hire.id)))
    n = 0
    for doc in q.all():
        doc.recipient_employee_id = employee.id
        n += 1
    db.commit()
    return n


# ── candidate actions in the portal ──────────────────────────────────────────────────────────────────────────────────
def acknowledge(db, hire, doc: OnboardingDocument, *, text_version: str, ip: Optional[str], user_agent: Optional[str]) -> None:
    if mode_of(doc) != "ACKNOWLEDGE":
        raise HTTPException(409, "This document does not ask for an acknowledgement.")
    if doc.status == "approved":
        return
    if doc.status != "requested":
        raise HTTPException(409, "This document cannot be acknowledged now.")
    if text_version != ACK_TEXT_VERSION:
        raise HTTPException(422, "Confirm the current acknowledgement statement.")
    digest = None
    if doc.file_path:
        try:
            digest = hashlib.sha256(storage.get_store().get(doc.file_path)).hexdigest()
        except Exception:
            digest = None
    details = dict(hire.profile_details or {})
    acks = dict(details.get("_acknowledgements") or {})
    acks[str(doc.id)] = {"at": datetime.utcnow().isoformat(), "text_version": text_version, "document_sha256": digest,
                         "ip": (ip or "")[:64], "user_agent": (user_agent or "")[:300]}
    details["_acknowledgements"] = acks
    hire.profile_details = details
    doc.status = "approved"
    from app.modules.hr import onboarding_submissions
    onboarding_submissions.on_submitted(db, hire, "acknowledge", doc)      # row, activity, HR digest, checklist, one commit


def save_outside_activities(db, hire, data: dict) -> None:
    none = bool((data or {}).get("none"))
    rows = []
    for r in ((data or {}).get("rows") or [])[:20]:
        org = str(r.get("organisation") or "").strip()[:200]
        if not org:
            continue
        try:
            hours = max(0.0, min(168.0, float(r.get("hours") or 0)))
        except (TypeError, ValueError):
            raise HTTPException(422, "Hours per week must be a number.")
        paid = str(r.get("paid") or "").strip().lower()
        if paid not in ("paid", "unpaid"):
            raise HTTPException(422, "Choose paid or unpaid for each activity.")
        rows.append({"organisation": org, "role": str(r.get("role") or "").strip()[:200], "hours": f"{hours:g}",
                     "paid": paid.capitalize(), "approved": False})
    if not none and not rows:
        raise HTTPException(422, "List your outside activities, or confirm that you have none.")
    if _row_state(db, _rows(db, hire).get("exclusivity_affidavit")) == "completed":
        raise HTTPException(409, "Your affidavit is already signed. Contact HR to change your declaration.")
    details = dict(hire.profile_details or {})
    details["outside_activities"] = {"none": none and not rows, "rows": rows, "declared_at": datetime.utcnow().isoformat()}
    hire.profile_details = details
    db.commit()
    from app.modules.hr.service import log_onboarding_activity
    log_onboarding_activity(db, hire.id, "Outside activities declared",
                            f"{hire.candidate_name} declared {len(rows) or 'no'} outside activit{'y' if len(rows) == 1 else 'ies'}.",
                            hire.organization_id)


AFFIDAVIT_ID = "HR-CON-101"


def _hire_of(db, doc: GeneratedDocument) -> Optional[OnboardingNewHire]:
    if doc.subject_type != "new_hire" or not doc.subject_id:
        return None
    hire = db.get(OnboardingNewHire, doc.subject_id)
    return hire if hire is not None and hire.organization_id == doc.organization_id else None


def check_before_signing(db, doc: GeneratedDocument) -> None:
    """The affidavit's Schedule A is the deponent's own declaration: it must be made (in the portal) before signing."""
    if doc.canonical_id != AFFIDAVIT_ID:
        return
    hire = _hire_of(db, doc)
    if hire is not None and not (hire.profile_details or {}).get("outside_activities"):
        raise HTTPException(409, {"code": "DECLARATION_REQUIRED",
                                  "message": "Before signing, complete Schedule A: declare your outside activities (or confirm you "
                                             "have none) in your onboarding portal."})


def declaration_needed(db, doc: GeneratedDocument) -> bool:
    """True for an unsigned affidavit whose Schedule A declaration has not been made yet."""
    if doc.canonical_id != AFFIDAVIT_ID or doc.status != "ISSUED":
        return False
    hire = _hire_of(db, doc)
    return hire is not None and not (hire.profile_details or {}).get("outside_activities")


def declare_for_document(db, doc: GeneratedDocument, data: dict) -> None:
    """Schedule A made from wherever the affidavit is being signed (the signing link or self-service), not only the portal."""
    hire = _hire_of(db, doc) if doc.canonical_id == AFFIDAVIT_ID else None
    if hire is None:
        raise HTTPException(409, "This document has no declaration to complete.")
    if doc.status != "ISSUED":
        raise HTTPException(409, "This document can no longer be signed.")
    save_outside_activities(db, hire, data)
    release_held(db, hire)


def signing_schedule(db, doc: GeneratedDocument) -> Optional[bytes]:
    """Pages appended to the executed document before the signature certificate (the affidavit's Schedule A)."""
    if doc.canonical_id != AFFIDAVIT_ID:
        return None
    hire = _hire_of(db, doc)
    if hire is None:
        return None
    acts = (hire.profile_details or {}).get("outside_activities") or {"none": True, "rows": []}
    ctx = render_context(db, hire, "exclusivity_affidavit", final=True)
    ctx.activities = acts
    return R.render_affidavit_schedule(ctx, _fmt_date((acts.get("declared_at") or "")[:10], get_config(db, hire.organization_id)) or "")


def portal_items(db, hire) -> dict:
    """Extra package facts for the candidate's portal (per onboarding document id)."""
    acks = (hire.profile_details or {}).get("_acknowledgements") or {}
    out = {}
    for cat, row in _rows(db, hire).items():
        mode = mode_of(row)
        out[row.id] = {"mode": mode, "mode_label": C.MODE_LABELS.get(mode, mode or ""),
                       "template_id": issued_meta(row).get("template_id") or doc_meta(db, hire, cat)["template_id"],
                       "package_file": bool(package_file_key(hire, cat)),
                       "acknowledged_at": (acks.get(str(row.id)) or {}).get("at"), "optional": mode in ("VOLUNTARY", "INFO")}
    return out


def portal_package_status(db, hire) -> dict:
    pkg = (hire.profile_details or {}).get("_package") or {}
    held = set(pkg.get("held") or [])
    details = hire.profile_details or {}
    needs = []
    if held & {"nda", "employment_contract", "exclusivity_affidavit"} and not any(
            details.get(k) for k in ("address", "city")):
        needs.append("address")
    affidavit = _rows(db, hire).get("exclusivity_affidavit")
    if not details.get("outside_activities") and ("exclusivity_affidavit" in held
                                                  or (affidavit is not None and affidavit.status != "approved"
                                                      and _row_state(db, affidavit) not in ("completed", "declined"))):
        needs.append("outside_activities")              # Schedule A of the affidavit, completed before signing
    return {"needs": needs, "outside_activities": details.get("outside_activities"),
            "ack_text": ACK_TEXT, "ack_text_version": ACK_TEXT_VERSION}


# ── checklist ────────────────────────────────────────────────────────────────────────────────────────────────────────
CHECKLIST_NAME = "Onboarding Documents & Agreements"
ITEM_VERB = {"SIGN": "Sign", "ACKNOWLEDGE": "Acknowledge", "COMPLETE": "Complete and return"}


def sync_onboarding_document_checklist(db: Session, hire: OnboardingNewHire, *, commit: bool = True) -> None:
    """Mirror every item the new hire is asked for (uploads, structured forms, package documents to sign / acknowledge /
    complete) into their checklist. requested → "Open", pending → "Submitted – HR to review", approved / verified / executed →
    done (completed + completed_at persisted), rejected → "Returned – <reason>". Voluntary and information documents are left
    out, so they never hold up completion. Engine-ticked items (verified starter / emergency / bank forms) are persisted too."""
    from app.modules.hr.models import OnboardingChecklist, OnboardingChecklistItem
    from app.modules.hr import onboarding_submissions as S
    docs = (db.query(OnboardingDocument)
            .filter(OnboardingDocument.onboarding_new_hire_id == hire.id, OnboardingDocument.is_deleted == False)  # noqa: E712
            .order_by(OnboardingDocument.id).all())
    actionable = [d for d in docs if S.needs_action(d)]
    _persist_engine_ticks(db, hire)
    checklist = (db.query(OnboardingChecklist)
                 .filter(OnboardingChecklist.onboarding_new_hire_id == hire.id, OnboardingChecklist.name == CHECKLIST_NAME,
                         OnboardingChecklist.is_deleted == False).first())  # noqa: E712
    if checklist is None:
        if not actionable:
            if commit:
                db.commit()
            return
        checklist = OnboardingChecklist(organization_id=hire.organization_id, onboarding_new_hire_id=hire.id, name=CHECKLIST_NAME,
                                        description="Sign, acknowledge or complete your onboarding documents.", category="HR",
                                        status="pending")
        db.add(checklist)
        db.flush()
    existing = {i.item_key: i for i in checklist.items if i.item_key and not i.is_deleted}
    wanted = set()
    for d in actionable:
        key = f"doc_{d.id}"
        wanted.add(key)
        done = S.status_done(d.status)
        it = existing.get(key)
        if it is None:
            it = OnboardingChecklistItem(organization_id=hire.organization_id, checklist_id=checklist.id, item_key=key,
                                         due_date=hire.joining_date or date.today(), owner_role="employee")
            db.add(it)
            checklist.items.append(it)
        it.title, it.description, it.mandatory = S.checklist_title(d)[:200], S.checklist_description(d), True
        it.completed, it.completed_at = done, (it.completed_at or datetime.utcnow()) if done else None
    for key, it in existing.items():             # documents removed, or now voluntary / informational
        if key.startswith("doc_") and key not in wanted:
            it.is_deleted = True
    db.flush()
    live = [i for i in checklist.items if not i.is_deleted]
    done_n = sum(1 for i in live if i.completed)
    checklist.status = "completed" if live and done_n == len(live) else ("in_progress" if done_n else "pending")
    if commit:
        db.commit()


def _persist_engine_ticks(db, hire) -> None:
    """Template checklist items linked to a structured form (onb001 / onb003 / onb017) are ticked for real once verified."""
    from app.modules.hr import onboarding_documents as OD
    from app.modules.hr.models import OnboardingFormSubmission
    items = [it for it in OD._hire_items(db, hire) if it.item_key in OD.PEOPLE_ITEM_SOURCES and not it.completed]
    for it in items:
        sub = (db.query(OnboardingFormSubmission)
               .filter(OnboardingFormSubmission.new_hire_id == hire.id,
                       OnboardingFormSubmission.canonical_id == OD.PEOPLE_ITEM_SOURCES[it.item_key],
                       OnboardingFormSubmission.status == "VERIFIED").first())
        if sub is not None:
            it.completed, it.completed_at = True, sub.verified_at or datetime.utcnow()


# ── signing links (used by the portal) ───────────────────────────────────────────────────────────────────────────────
def get_signing_token_for_onboarding_doc(db: Session, onb_doc: OnboardingDocument) -> Optional[str]:
    """A live candidate signing token for a signable onboarding document (reused while unused and unexpired)."""
    if not onb_doc.document_id:
        return None
    gen_doc = db.get(GeneratedDocument, onb_doc.document_id)
    if not gen_doc or gen_doc.status != "ISSUED":
        return None
    from app.modules.employee.models import SecurityActionPurpose, SecurityActionToken
    hire = db.get(OnboardingNewHire, onb_doc.onboarding_new_hire_id) if onb_doc.onboarding_new_hire_id else None
    details = dict(hire.profile_details or {}) if hire else {}
    tokens = dict(details.get("_signing_tokens") or {})
    cached = tokens.get(str(gen_doc.id))
    if cached:
        active = (db.query(SecurityActionToken)
                  .filter(SecurityActionToken.token_hash == signing._token_hash(cached),
                          SecurityActionToken.purpose == SecurityActionPurpose.DOCUMENT_SIGN,
                          SecurityActionToken.used_at.is_(None), SecurityActionToken.expires_at > datetime.utcnow()).first())
        if active:
            return cached
    raw, _ = signing.issue_candidate_token(db, gen_doc)
    if hire:
        tokens[str(gen_doc.id)] = raw
        details["_signing_tokens"] = tokens
        hire.profile_details = details
    db.commit()
    return raw


def next_to_sign(db: Session, doc: GeneratedDocument) -> dict:
    """After the candidate signs `doc` from its link: the package's other documents still waiting for their signature, in
    package order, with a live link token for the first one. (The affidavit's Schedule A declaration is made on its signing
    page, so it is offered like the others.)"""
    empty = {"in_package": False, "remaining": 0, "next": None}
    onb = (db.query(OnboardingDocument)
           .filter(OnboardingDocument.document_id == doc.id, OnboardingDocument.is_deleted == False)  # noqa: E712
           .first())
    hire = db.get(OnboardingNewHire, onb.onboarding_new_hire_id) if onb is not None and onb.onboarding_new_hire_id else None
    if hire is None or hire.organization_id != doc.organization_id:
        return empty
    rows = _rows(db, hire)
    waiting = []
    for cat in package_categories(db, hire):
        row = rows.get(cat)
        if row is None or row.document_id == doc.id or mode_of(row) != "SIGN" or _row_state(db, row) != "awaiting_signature":
            continue
        gen = _gen(db, row)
        if gen is None or gen.status != "ISSUED"                 or (gen.recipient_email or "").lower() != (doc.recipient_email or "").lower()                 or "candidate" not in signing.required_parties(gen) or "candidate" in signing.signed_parties(db, gen):
            continue
        waiting.append((row, gen.title or row.title))
    nxt = None
    for row, title in waiting:
        raw = get_signing_token_for_onboarding_doc(db, row)
        if raw:
            nxt = {"title": title, "token": raw}
            break
    return {"in_package": True, "remaining": len(waiting), "next": nxt, "submission": submission_status(db, hire),
            "candidate_name": hire.candidate_name, "position": hire.position}


# ── the new hire's final submission ──────────────────────────────────────────────────────────────────────────────────
_OWED = {"awaiting_signature": "sign", "awaiting_acknowledgement": "acknowledge", "awaiting_upload": "complete and upload",
         "rejected": "upload again", "declined": "contact HR about"}


def outstanding_for_hire(db, hire) -> list[dict]:
    with values_cache(db):
        return _outstanding_for_hire(db, hire)


def _outstanding_for_hire(db, hire) -> list[dict]:
    """What the new hire still has to do before they can submit: package documents to sign / acknowledge / upload, other
    requested uploads, and the details the package waits for. Voluntary and information documents never count."""
    out = []
    package_ids = set()
    rows = _rows(db, hire)
    for cat, row in rows.items():
        package_ids.add(row.id)
        verb = _OWED.get(_row_state(db, row))
        if verb:
            out.append({"title": row.title or doc_meta(db, hire, cat)["title"], "action": verb})
    others = (db.query(OnboardingDocument)
              .filter(OnboardingDocument.onboarding_new_hire_id == hire.id, OnboardingDocument.is_deleted == False)  # noqa: E712
              .all())
    for d in others:
        if d.id not in package_ids and is_blocking(d) and d.status in ("requested", "rejected"):
            out.append({"title": d.title, "action": "upload" if d.status == "requested" else "upload again"})
    # QA report #17 (BUG-16): the contact & address details and the structured forms are part of "everything"
    if not contact_details_complete(hire):
        out.append({"title": "Your contact and address details", "action": "complete"})
    out.extend(_open_portal_forms(db, hire))
    needs = portal_package_status(db, hire)["needs"]
    for need in needs:
        out.append({"title": {"address": "Your residential address",
                              "outside_activities": "Schedule A: outside activities"}.get(need, need), "action": "complete"})
    # documents HR has not been able to send yet (held): the package is not complete until they arrive and are done
    held = ((hire.profile_details or {}).get("_package") or {}).get("held") or []
    in_package = {d["category"]: d for d in _org().documents_for_hire(db, hire)}
    for cat in held:
        if cat not in in_package or in_package[cat]["mode"] in ("VOLUNTARY", "INFO"):
            continue                       # switched off since, or never blocks
        gaps = readiness(render_context(db, hire, cat, final=True), cat)
        if not gaps["ready"] and not gaps["missing_clauses"] and set(_reported_missing(gaps["missing_fields"])) <= {ADDRESS_INPUT}:
            continue                       # waiting only for the hire's own address: already listed above as their step
        # otherwise HR still has to complete the settings and/or press Send: the hire has not received it yet
        out.append({"title": in_package[cat]["title"], "action": "wait for HR to send"})
    return out


def contact_details_complete(hire) -> bool:
    """Submitted on the portal, every required detail present and within its rule (the phone is kept on the hire)."""
    from app.core import field_rules
    from app.modules.hr.onboarding_flow import PORTAL_DETAIL_REQUIRED, PORTAL_DETAIL_RULES
    details = hire.profile_details or {}
    if not details.get("details_submitted_at"):
        return False
    country = details.get("country")
    for key in PORTAL_DETAIL_REQUIRED:
        value = hire.phone if key == "phone" else details.get(key)
        if not str(value or "").strip():
            return False
        rule = PORTAL_DETAIL_RULES.get(key)
        if rule and field_rules.problem(rule, value, country if rule in field_rules.COUNTRY_DRIVEN else None):
            return False
    return True


def _open_portal_forms(db, hire) -> list[dict]:
    """The structured forms the hire fills in on the portal that are not submitted yet (not started, draft or returned)."""
    from app.modules.hr.models import OnboardingFormSubmission
    from app.modules.hr.onboarding_documents import FORMS, PORTAL_FORMS
    subs = (db.query(OnboardingFormSubmission)
            .filter(OnboardingFormSubmission.new_hire_id == hire.id, OnboardingFormSubmission.canonical_id.in_(PORTAL_FORMS))
            .order_by(OnboardingFormSubmission.id.desc()).all())
    latest: dict = {}
    for sub in subs:
        latest.setdefault(sub.canonical_id, sub)
    return [{"title": FORMS[cid], "action": "complete and submit"} for cid in PORTAL_FORMS
            if getattr(latest.get(cid), "status", None) not in ("SUBMITTED", "VERIFIED")]


def submission_status(db, hire) -> dict:
    pkg = (hire.profile_details or {}).get("_package") or {}
    outstanding = outstanding_for_hire(db, hire)
    # the steps besides documents, for the portal's progress counter (contact details and the structured forms)
    open_titles = {o["title"] for o in outstanding}
    from app.modules.hr.onboarding_documents import FORMS, PORTAL_FORMS
    steps = [{"title": t, "done": t not in open_titles}
             for t in ("Your contact and address details", *(FORMS[c] for c in PORTAL_FORMS))]
    return {"submitted_at": pkg.get("submitted_at"), "outstanding": outstanding, "can_submit": not outstanding, "steps": steps}


def submit_package(db, hire) -> dict:
    """The new hire confirms they have finished: everything they owe is done. HR is told in-app; repeat calls are harmless."""
    outstanding = outstanding_for_hire(db, hire)
    if outstanding:
        raise HTTPException(409, {"code": "ONBOARDING_INCOMPLETE",
                                  "message": "Finish these first: " + "; ".join(f"{o['action']} {o['title']}" for o in outstanding),
                                  "outstanding": outstanding})
    details = dict(hire.profile_details or {})
    pkg = dict(details.get("_package") or {})
    first = not pkg.get("submitted_at")
    if first:
        pkg["submitted_at"] = datetime.utcnow().isoformat()
        details["_package"] = pkg
        hire.profile_details = details
        sync_onboarding_document_checklist(db, hire)
        from app.modules.hr.service import log_onboarding_activity
        log_onboarding_activity(db, hire.id, "Onboarding documents submitted",
                                f"{hire.candidate_name} completed and submitted all their onboarding documents.", hire.organization_id)
        try:
            from app.modules.super_admin.admin_notifications import notify_org_admins
            notify_org_admins(db, org_id=hire.organization_id, title="Onboarding documents submitted",
                              message=f"{hire.candidate_name} ({hire.position or 'new hire'}) has signed and submitted all onboarding "
                                      "documents. They are ready for your review.", notification_type="onboarding")
        except Exception:
            logger.exception("submission notification failed for new hire %s", hire.id)
        db.commit()
        _email_package_submitted(db, hire)
    return {**submission_status(db, hire), "first_submission": first}


_DONE_WORDS = {"SIGN": "Signed", "ACKNOWLEDGE": "Acknowledged", "COMPLETE": "Completed", "VOLUNTARY": "Completed",
               "INFO": "Received"}


def _email_package_submitted(db, hire) -> int:
    """One email to the organisation's admins and the hire's manager: every onboarding document is done."""
    try:
        from app.modules.hr import onboarding_flow
        from app.services.email_service import send_onboarding_documents_submitted
        rows = _rows(db, hire)
        documents = []
        for cat in package_categories(db, hire):
            row = rows.get(cat)
            if row is None:
                continue
            d = {"title": row.title or doc_meta(db, hire, cat)["title"]}
            state = _row_state(db, row)
            from app.modules.hr.onboarding_submissions import is_done     # one rule for "done" (board, checklist, e-mail)
            done = is_done(state)
            word = (_DONE_WORDS.get(mode_of(row), "Completed") if done else
                    "Submitted – HR to review" if state == "needs_review" else state.replace("_", " ").capitalize())
            documents.append({"title": d["title"], "status": word})
        recipients = {a.email: a.first_name or "there" for a in onboarding_flow._admins(db, hire.organization_id) if a.email}
        if hire.manager is not None and hire.manager.email:
            recipients.setdefault(hire.manager.email, hire.manager.first_name or "there")
        org = onboarding_flow._org_name(db, hire.organization_id)
        url = f"{onboarding_flow.app_base()}/zoiko-hr/onboarding/checklists"
        sent = 0
        for email, name in recipients.items():
            sent += bool(send_onboarding_documents_submitted(
                email, name, hire.candidate_name, hire.position, org, documents, url,
                onboarding_flow._date_display(hire.joining_date), db=db, organization_id=hire.organization_id))
        return sent
    except Exception:
        logger.exception("package submitted email failed for new hire %s", hire.id)
        return 0


def hire_for_document(db, doc: GeneratedDocument) -> Optional[OnboardingNewHire]:
    onb = (db.query(OnboardingDocument)
           .filter(OnboardingDocument.document_id == doc.id, OnboardingDocument.is_deleted == False)  # noqa: E712
           .first())
    hire = db.get(OnboardingNewHire, onb.onboarding_new_hire_id) if onb is not None and onb.onboarding_new_hire_id else None
    return hire if hire is not None and hire.organization_id == doc.organization_id else None


# ── signed documents, for HR / org admins ───────────────────────────────────────────────────────────────────────────
PARTY_LABEL = {"candidate": "Employee", "employee": "Employee", "employer": "Employer", "witness": "Witness"}


def signed_documents(db, organization_id: int, new_hire_id: Optional[int] = None) -> list[dict]:
    """Every onboarding document the new hire (later the employee) has signed, with each signature: who, how, when, and
    whether a drawn image exists (served by signature_image). Grouped by new hire, newest hire first."""
    from app.modules.doc_templates.models import DocumentSignature
    q = (db.query(OnboardingDocument, OnboardingNewHire, GeneratedDocument)
         .join(OnboardingNewHire, OnboardingNewHire.id == OnboardingDocument.onboarding_new_hire_id)
         .join(GeneratedDocument, GeneratedDocument.id == OnboardingDocument.document_id)
         .filter(OnboardingDocument.organization_id == organization_id, OnboardingDocument.is_deleted == False,  # noqa: E712
                 GeneratedDocument.organization_id == organization_id))
    if new_hire_id is not None:
        q = q.filter(OnboardingNewHire.id == new_hire_id)
    rows = q.order_by(OnboardingNewHire.id.desc(), OnboardingDocument.id).limit(2000).all()
    if not rows:
        return []
    sigs: dict[int, list] = {}
    for sig in (db.query(DocumentSignature)
                .filter(DocumentSignature.document_id.in_([g.id for _o, _h, g in rows]), DocumentSignature.decision == "SIGNED")
                .order_by(DocumentSignature.signed_at).all()):
        sigs.setdefault(sig.document_id, []).append(sig)
    order = {cat: i for i, cat in enumerate(_org().known_categories(db, organization_id))}
    hires: dict[int, dict] = {}
    for onb, hire, gen in rows:
        if gen.id not in sigs:
            continue
        h = hires.setdefault(hire.id, {"new_hire_id": hire.id, "candidate_name": hire.candidate_name, "position": hire.position,
                                       "documents": []})
        h["documents"].append({
            "id": gen.id, "onboarding_document_id": onb.id, "title": gen.title or onb.title, "category": onb.category,
            "document_number": gen.document_number, "status": gen.status, "fully_signed": gen.status == "EXECUTED",
            "signatures": [{"id": s.id, "party": PARTY_LABEL.get(s.signer_party, s.signer_party.title()),
                            "name": s.signer_name_typed, "method": s.signature_method, "signed_at": s.signed_at,
                            "email": s.signer_email, "otp_verified": bool(s.otp_verified_at), "ip_address": s.ip_address,
                            "has_image": bool(s.signature_image_path)} for s in sigs[gen.id]],
        })
    for h in hires.values():
        h["documents"].sort(key=lambda d: (order.get(d["category"], 99), d["id"]))
    return list(hires.values())


def signature_image(db, organization_id: int, signature_id: int) -> bytes:
    from app.modules.doc_templates.models import DocumentSignature
    sig = db.get(DocumentSignature, signature_id)
    if sig is None or sig.organization_id != organization_id or not sig.signature_image_path:
        raise HTTPException(404, "Signature image not found")
    onboarding = (db.query(OnboardingDocument.id)
                  .filter(OnboardingDocument.document_id == sig.document_id, OnboardingDocument.organization_id == organization_id,
                          OnboardingDocument.is_deleted == False).first())  # noqa: E712
    if onboarding is None:                     # only the onboarding documents this page lists, never other HR documents
        raise HTTPException(404, "Signature image not found")
    return storage.get_store().get(sig.signature_image_path)


def generate_html_for_doc(doc: GeneratedDocument) -> str:
    """Fallback when a document has no stored HTML: never invent terms; point the reader to the PDF."""
    from html import escape
    return (f'<!DOCTYPE html><html><head><meta charset="utf-8"></head><body style="font-family:Arial,sans-serif;padding:24px">'
            f"<h1 style=\"font-size:20px\">{escape(doc.title)}</h1><p>Document {escape(doc.document_number)}.</p>"
            "<p>The on-screen version of this document is not available. Download the PDF to read the full document before "
            "signing.</p></body></html>")


# ── downloads: file names, one document, the whole package ───────────────────────────────────────────────────────────
DOC_SLUGS = {"offer_letter": "OFFER_LETTER", "job_description": "JOB_DESCRIPTION",
             "daily_kpi": "DAILY_KEY_PERFORMANCE_INDICATORS", "nda": "NON-DISCLOSURE_AGREEMENT",
             "employment_contract": "EMPLOYMENT_CONTRACT", "exclusivity_affidavit": "AFFIDAVIT",
             "self_disclosure": "VOLUNTARY_SELF-DISCLOSURE_FORM", "job_application": "JOB_APPLICATION_FORM",
             "daily_work_report": "DAILY_WORK_REPORT", "velocity_report": "PROJECT_VELOCITY_REPORT"}


def package_filename(hire, category: str, ext: str = "pdf", state: str = "") -> str:
    """{INITIALS}_{FULL_NAME_UPPER_UNDERSCORED}_{DOC_SLUG}.{ext}, e.g. RR_RAVURI_RUGVEDH_OFFER_LETTER.pdf.
    Non-ASCII names are transliterated; only A-Z, 0-9, "_" and "-" remain."""
    from app.modules.hr import doc_formatting as F
    name = F.transliterate(hire.candidate_name or "").upper()
    name = re.sub(r"[^A-Z0-9]+", "_", name).strip("_") or "NEW_HIRE"
    initials = F.initials(hire.candidate_name) or "NH"
    base = re.sub(r"[^A-Z0-9_-]+", "", f"{initials}_{name}_{DOC_SLUGS.get(category, category.upper())}")
    return f"{base}.{ext}"


def document_file(db, hire, category: str) -> tuple:
    """(pdf bytes, file name, state) of one package document: what the new hire was sent (the signed copy once executed),
    else a watermarked draft rendered now. state: signed | issued | completed | draft."""
    _known(db, hire, category)
    from app.modules.hr import onboarding_package_forms as FORMS
    filled = FORMS.filled_pdf(db, hire, category)
    if filled is not None:                               # a form the new hire filled in online: the completed copy
        return filled, package_filename(hire, category, "pdf", "completed"), "completed"
    row = _rows(db, hire).get(category)
    if row is not None and row.document_id:
        gen = _gen(db, row)
        stored = stored_document_pdf(db, row.document_id, hire.organization_id)
        if stored is not None:
            state = "signed" if gen is not None and gen.status == "EXECUTED" and gen.executed_pdf_path else "issued"
            return stored[0], package_filename(hire, category, "pdf", state), state
    key = package_file_key(hire, category) if row is not None else None
    if key:                                              # acknowledge / complete / info documents: the issued file
        try:
            return storage.get_store().get(key), package_filename(hire, category, "pdf", "issued"), "issued"
        except Exception:
            logger.exception("issued package file %s could not be read", key)
    return R.render_pdf(category, render_context(db, hire, category)), package_filename(hire, category, "pdf", "draft"), "draft"


def package_zip(db, hire, fmt: str = "pdf") -> tuple:
    """(zip bytes, file name): every package document for the hire, in package order."""
    import io
    import zipfile
    if fmt not in ("pdf", "docx", "both"):
        raise HTTPException(422, "format must be pdf, docx or both.")
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        for cat in package_categories(db, hire):
            if fmt in ("pdf", "both"):
                data, name, _state = document_file(db, hire, cat)
                zf.writestr(name, data)
            if fmt in ("docx", "both"):
                data, name = document_docx(db, hire, cat)
                zf.writestr(name, data)
    from app.modules.hr import doc_formatting as F
    who = re.sub(r"[^A-Z0-9]+", "_", F.transliterate(hire.candidate_name or "").upper()).strip("_") or "NEW_HIRE"
    return buf.getvalue(), f"{F.initials(hire.candidate_name) or 'NH'}_{who}_ONBOARDING_PACKAGE.zip"


def document_docx(db, hire, category: str) -> tuple:
    """(docx bytes, file name): an editable Word copy for HR, rendered from the same blocks as the PDF with the hire's
    current values. The e-signed / issued record is always the stored PDF."""
    _known(db, hire, category)
    from app.modules.hr import onboarding_package_docx as D
    from app.modules.hr import onboarding_package_forms as FORMS
    sub = FORMS.submitted(db, hire, category)
    if sub is not None:                                  # a form the new hire filled in online: the completed copy
        return (D.render_docx(category, FORMS.filled_context(db, hire, category, sub)),
                package_filename(hire, category, "docx", "completed"))
    row = _rows(db, hire).get(category)
    gen = _gen(db, row)
    state = "draft"
    if gen is not None:
        state = "signed" if gen.status == "EXECUTED" and gen.executed_pdf_path else "issued"
    elif row is not None and package_file_key(hire, category):
        state = "issued"
    ctx = render_context(db, hire, category, final=state != "draft")
    return D.render_docx(category, ctx), package_filename(hire, category, "docx", state)
