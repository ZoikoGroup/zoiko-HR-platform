"""Zoiko offer package: the 10 standard onboarding documents for a new hire.

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
from typing import Optional

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.modules.doc_templates import signing, state, storage
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


def mode_of(category: Optional[str]) -> Optional[str]:
    d = C.DOCS.get(category or "")
    return d["mode"] if d else None


def is_blocking(doc: OnboardingDocument) -> bool:
    """Does this document hold up completion while it is not approved?"""
    return doc.status != NO_ACTION_STATUS and mode_of(doc.category) not in ("VOLUNTARY", "INFO")


# ── organisation settings (organization_configs, one JSON row) ──────────────────────────────────────────────────────
CONFIG_KEY = "onboarding_package.config"
HEX = re.compile(r"^#[0-9A-Fa-f]{6}$")
TEXT_SETTINGS = {"legal_name": 200, "registered_address": 500, "header_label": 60, "jurisdiction": 120, "signatory_name": 200,
                 "signatory_title": 200, "hr_contact_name": 200, "hr_contact_email": 255, "leave_entitlement": 300,
                 "post_employment_period": 200, "pay_frequency": 60, "kpi_review_cycle": 120, "benefits_reference": 300,
                 "effective_date": 40}


def _org(db, organization_id) -> Optional[Organization]:
    return db.get(Organization, organization_id)


def _is_us(org) -> bool:
    c = (getattr(org, "country", "") or "").strip().lower()
    return c in ("us", "usa", "united states", "united states of america")


def _defaults(org) -> dict:
    name = (getattr(org, "organization_name", None) or getattr(org, "display_name", None) or "").strip()
    addr = ", ".join(p for p in [getattr(org, "address", None), getattr(org, "city", None), getattr(org, "state", None),
                                 getattr(org, "country", None)] if p and str(p).strip())
    us = _is_us(org)
    return {
        "legal_name": name, "registered_address": addr,
        "header_label": ((getattr(org, "display_name", None) or name) or "ZOIKO GROUP").upper()[:60],
        "brand_primary": "#0B3D91", "brand_accent": "#00A3E0",
        "paper": "LETTER" if us else "A4", "spelling": "US" if us else "UK", "date_format": "MDY" if us else "DMY",
        "jurisdiction": getattr(org, "country", None) or "",
        "signatory_name": "", "signatory_title": "", "hr_contact_name": "",
        "hr_contact_email": getattr(org, "registered_email", None) or "",
        "response_days": 7, "leave_entitlement": "", "post_employment_period": "", "pay_frequency": "",
        "kpi_review_cycle": "", "benefits_reference": "", "effective_date": "", "clauses": {}, "logo_key": "",
    }


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
    _write_config(db, actor.organization_id, cfg)
    return cfg


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


def save_logo(db, actor, data: bytes) -> dict:
    """Validate an uploaded logo (PNG, JPEG or WebP, max 2 MB), strip metadata by re-encoding it as PNG, scale it down, store it."""
    if not data:
        raise HTTPException(422, "Choose a logo image to upload.")
    if len(data) > LOGO_MAX_BYTES:
        raise HTTPException(422, "The logo must be 2 MB or smaller.")
    from PIL import Image, UnidentifiedImageError
    import io as _io
    try:
        probe = Image.open(_io.BytesIO(data))
        if probe.format not in ("PNG", "JPEG", "WEBP"):
            raise HTTPException(422, "Upload the logo as a PNG, JPG or WebP image.")
        probe.verify()
        img = Image.open(_io.BytesIO(data))
        img.load()
    except HTTPException:
        raise
    except (UnidentifiedImageError, OSError, ValueError, Image.DecompressionBombError):
        raise HTTPException(422, "The file is not a readable image.")
    img = img.convert("RGBA")
    img.thumbnail(LOGO_MAX_PX)
    out = _io.BytesIO()
    img.save(out, format="PNG", optimize=True)
    cfg = get_config(db, actor.organization_id)
    cfg["logo_key"] = storage.get_store().put(actor.organization_id, f"org-logo-{secrets.token_hex(6)}.png", out.getvalue())
    _write_config(db, actor.organization_id, cfg)
    return settings_view(db, actor.organization_id)


def remove_logo(db, actor) -> dict:
    cfg = get_config(db, actor.organization_id)
    cfg["logo_key"] = ""
    _write_config(db, actor.organization_id, cfg)
    return settings_view(db, actor.organization_id)


def logo_bytes(db, organization_id: int, cfg: Optional[dict] = None) -> Optional[bytes]:
    key = (cfg or get_config(db, organization_id)).get("logo_key")
    if not key:
        return None
    try:
        return storage.get_store().get(key)
    except Exception:
        logger.warning("offer package logo for org %s is missing from storage", organization_id)
        return None


def settings_view(db, organization_id: int) -> dict:
    cfg = get_config(db, organization_id)
    used: dict[str, list[str]] = {}
    for cat in C.CATEGORIES:
        for tok in C.tokens_in(cat):
            ck = C.clause_key(tok)
            if ck:
                used.setdefault(ck, []).append(C.DOCS[cat]["title"])
    clauses = [{"key": k, "token": R._hook_token(k), "title": t, "note": n, "required": req, "used_in": used.get(k, []),
                **{f: (cfg["clauses"].get(k) or {}).get(f) for f in ("text", "not_applicable", "counsel_reference", "updated_at")}}
               for k, (t, n, req) in C.CLAUSES.items()]
    settings_out = {k: v for k, v in cfg.items() if k not in ("clauses", "logo_key")}
    settings_out["has_logo"] = bool(cfg.get("logo_key"))
    return {"settings": settings_out, "clauses": clauses,
            "documents": [{k: d[k] for k in ("category", "title", "template_id", "doc_type", "risk", "sensitivity", "mode",
                                              "orientation", "pages", "signers")} for d in C.documents()],
            "mode_labels": C.MODE_LABELS}


# ── per-hire data ────────────────────────────────────────────────────────────────────────────────────────────────────
# Fields HR may type in per new hire (everything else comes from settings, the hire record, the offer or is computed).
HIRE_INPUT_FIELDS = [k for k in C.FIELDS if k.split(".")[0] in ("employment", "job", "kpi", "worker")
                     and k not in ("worker.full_name", "worker.email", "worker.outside_activities", "employment.pay_terms")]


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


def _pretty(v: Optional[str]) -> Optional[str]:
    if not v:
        return None
    special = {"onsite": "On-site", "on_site": "On-site", "full_time": "Full-time", "part_time": "Part-time"}
    return special.get(str(v).lower(), str(v).replace("_", " ").capitalize())


PER_PERIOD = {"annual": "per year", "monthly": "per month", "weekly": "per week", "hourly": "per hour", "one_time": "one-off"}


def _offer_for(db, hire):
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


def save_hire_inputs(db, hire, values: dict) -> dict:
    if not isinstance(values, dict):
        raise HTTPException(422, "values must be an object.")
    current = hire_inputs(hire)
    for key, val in values.items():
        if key not in HIRE_INPUT_FIELDS:
            raise HTTPException(422, f"{key} cannot be set here.")
        v = str(val or "").strip()[:2000]
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
        "employment.work_location": (offer.work_location if offer else None) or getattr(org, "city", None),
        "employment.work_arrangement": _pretty(offer.work_arrangement if offer else None),
        "employment.working_hours": working_hours,
        "employment.work_pattern": (offer.work_pattern if offer else None) or working_hours,
        "employment.base_pay": base_pay,
        "employment.pay_frequency": cfg.get("pay_frequency") or None,
        "employment.variable_pay": (f"Equity: {offer.equity}" if offer and offer.equity else None),
        "employment.benefits_reference": cfg.get("benefits_reference") or None,
        "employment.leave_entitlement": cfg.get("leave_entitlement") or None,
        "employment.country": country_name(country_code) if country_code else (getattr(org, "country", None) or None),
        "offer.response_deadline": _fmt_date(date.today() + timedelta(days=int(cfg.get("response_days") or 7)), cfg),
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
        values[key] = val
    if address:                                                   # ... except the address the new hire entered themselves
        values["worker.postal_address"] = address
    if values.get("employment.work_pattern") is None:
        values["employment.work_pattern"] = values.get("employment.working_hours")
    if values.get("employment.continuous_service_date") is None:
        values["employment.continuous_service_date"] = values.get("employment.start_date")
    if values.get("employment.base_pay") and values.get("employment.pay_frequency"):
        values["employment.pay_terms"] = f"{values['employment.base_pay']}, paid {values['employment.pay_frequency']}"
    return values


def render_context(db, hire, category: str, *, cfg: Optional[dict] = None, final: bool = False, esign: bool = False,
                   secure_link: Optional[str] = None, contract_id: Optional[str] = None) -> R.RenderContext:
    cfg = cfg or get_config(db, hire.organization_id)
    values = build_values(db, hire, cfg, secure_link=secure_link, contract_id=contract_id)
    if not final:   # previews: show where the generated values will go
        values.setdefault("offer.secure_link", None)
        values["offer.secure_link"] = values["offer.secure_link"] or "(your secure onboarding link – added when sent)"
        values["contract.id"] = values["contract.id"] or "(assigned when issued)"
    ctx = R.RenderContext(mode="issue", values=values, clauses=cfg.get("clauses") or {},
                          optional=set(C.OPTIONAL_BY_DOC.get(category, set())),
                          activities=(hire.profile_details or {}).get("outside_activities"),
                          org_label=(cfg.get("header_label") or "ZOIKO GROUP").upper(), primary=cfg["brand_primary"],
                          accent=cfg["brand_accent"], paper=cfg["paper"], spelling=cfg["spelling"],
                          effective_date=values.get("document.effective_date") or "", esign=esign,
                          logo_png=logo_bytes(db, hire.organization_id, cfg))
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
    for tok in C.tokens_in(category):
        ck = C.clause_key(tok)
        if ck:
            if ctx.clause_value(ck) is None:
                clauses.append(ck)
        elif ctx.field_value(tok) is None and tok not in ("offer.secure_link", "contract.id"):
            for src in DERIVED_FROM.get(tok, (tok,)):
                if ctx.field_value(src) is None and src not in fields:
                    fields.append(src)
    return {"ready": not fields and not clauses, "missing_fields": fields, "missing_clauses": clauses}


def template_context(db, organization_id: int) -> R.RenderContext:
    cfg = get_config(db, organization_id)
    return R.RenderContext(mode="template", org_label=(cfg.get("header_label") or "ZOIKO GROUP").upper(),
                           primary=cfg["brand_primary"], accent=cfg["brand_accent"], paper=cfg["paper"], spelling=cfg["spelling"],
                           effective_date=_fmt_date(cfg.get("effective_date") or date.today(), cfg),
                           logo_png=logo_bytes(db, organization_id, cfg))


def template_set_pdf(db, organization_id: int) -> bytes:
    return R.render_template_set(template_context(db, organization_id))


def preview_pdf(db, hire, category: str) -> bytes:
    if category not in C.DOCS:
        raise HTTPException(404, "Unknown package document.")
    return R.render_pdf(category, render_context(db, hire, category))


# ── state of a hire's package ────────────────────────────────────────────────────────────────────────────────────────
def _rows(db, hire) -> dict:
    rows = (db.query(OnboardingDocument)
            .filter(OnboardingDocument.onboarding_new_hire_id == hire.id, OnboardingDocument.is_deleted == False,  # noqa: E712
                    OnboardingDocument.category.in_(C.CATEGORIES))
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
    mode = mode_of(row.category)
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


def package_view(db, hire) -> dict:
    cfg = get_config(db, hire.organization_id)
    rows = _rows(db, hire)
    docs = []
    for d in C.documents():
        cat = d["category"]
        ctx = render_context(db, hire, cat, cfg=cfg, final=True)
        gaps = readiness(ctx, cat)
        row = rows.get(cat)
        gen = _gen(db, row)
        docs.append({
            "category": cat, "title": d["title"], "template_id": d["template_id"], "mode": d["mode"],
            "mode_label": C.MODE_LABELS[d["mode"]], "doc_type": d["doc_type"], "risk": d["risk"], "sensitivity": d["sensitivity"],
            "orientation": d["orientation"], "signers": d["signers"], "state": _row_state(db, row),
            "onboarding_document_id": row.id if row else None, "status": row.status if row else None,
            "signing_status": gen.status if gen else None, "ready": gaps["ready"],
            "missing_fields": [{"key": k, "meaning": C.FIELDS[k][0], "source": C.FIELDS[k][1],
                                "editable": k in HIRE_INPUT_FIELDS, "candidate_provides": k == "worker.postal_address",
                                "hr_may_enter": k == "worker.postal_address"}
                               for k in gaps["missing_fields"]],
            "missing_clauses": [{"key": k, "title": C.CLAUSES[k][0]} for k in gaps["missing_clauses"]],
        })
    pkg = (hire.profile_details or {}).get("_package") or {}
    values = build_values(db, hire, cfg)
    return {"new_hire_id": hire.id, "candidate_name": hire.candidate_name, "email": hire.email, "documents": docs,
            "sent_at": pkg.get("sent_at"), "inputs": hire_inputs(hire),
            "input_fields": [{"key": k, "meaning": C.FIELDS[k][0], "value": values.get(k), "required": C.FIELDS[k][2]}
                             for k in HIRE_INPUT_FIELDS],
            "ready_to_send": [d["category"] for d in docs if d["ready"] and d["state"] in ("not_sent", "declined")]}


# ── issuing ──────────────────────────────────────────────────────────────────────────────────────────────────────────
def _ensure_definition(db, d: dict) -> TemplateDefinition:
    t = db.get(TemplateDefinition, d["template_id"])
    if t is None:      # package-specific ids (HR-CON-101 …) are not in the 566 register
        t = TemplateDefinition(canonical_id=d["template_id"], family_id=d["family_id"], title=d["title"], kind=d["doc_type"],
                               legal_risk=d["risk"], sensitivity=d["sensitivity"], catalogue_status="ONBOARDING_PACKAGE",
                               implemented=False, output_mode="DOCUMENT", execution_mode="SIGN_CANDIDATE",
                               audience="COUNTERPARTY", approval_policy=d["risk"], source_spec="ZOIKO-OFFER-PACKAGE v1.0")
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


def _issue_one(db, hire, d: dict, cfg: dict, actor, secure_link: str, row: Optional[OnboardingDocument]) -> OnboardingDocument:
    cat, mode = d["category"], d["mode"]
    store = storage.get_store()
    number = f"ONB-{d['template_id'].replace('HR-', '')}-{hire.id}-{secrets.token_hex(3).upper()}"
    ctx = render_context(db, hire, cat, cfg=cfg, final=True, esign=(mode == "SIGN"), secure_link=secure_link,
                         contract_id=number if cat == "employment_contract" else None)
    pdf = R.render_pdf(cat, ctx)
    key = store.put(hire.organization_id, f"onb-{hire.id}-{cat}-{secrets.token_hex(4)}.pdf", pdf)
    _store_files(hire, cat, key)
    gen_id = None
    if mode == "SIGN":
        t = _ensure_definition(db, d)
        html = R.render_html(cat, ctx, document_number=number)
        html_key = store.put(hire.organization_id, f"onb-{hire.id}-{cat}-{secrets.token_hex(4)}.html", html.encode("utf-8"))
        now = datetime.utcnow()
        gen = GeneratedDocument(
            document_number=number, organization_id=hire.organization_id, canonical_id=t.canonical_id, family_id=d["family_id"],
            title=d["title"], kind=d["doc_type"], legal_risk=d["risk"], sensitivity=d["sensitivity"], output_mode="DOCUMENT",
            execution_mode="SIGN_CANDIDATE", audience="COUNTERPARTY", approval_policy=d["risk"], subject_type="new_hire",
            subject_id=hire.id, source_ref=f"onboarding_new_hire:{hire.id}", language="en", rendered_html_path=html_key,
            pdf_path=key, pdf_sha256=hashlib.sha256(pdf).hexdigest(), recipient_name=hire.candidate_name,
            recipient_email=hire.email, requested_by=getattr(actor, "id", None) or _fallback_actor(db, hire),
            issued_by=getattr(actor, "id", None), issued_at=now, due_by=now + timedelta(days=int(cfg.get("response_days") or 7)),
            expires_at=now + timedelta(days=30))
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
    db.flush()
    return row


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
    from app.modules.hr import onboarding_flow
    if hire.status not in onboarding_flow.ACTIVE_STATUSES:
        raise HTTPException(400, "Onboarding documents can only be sent while onboarding is active.")
    wanted = [c for c in (categories or C.CATEGORIES) if c in C.DOCS]
    cfg = get_config(db, hire.organization_id)
    rows = _rows(db, hire)
    secure_link = onboarding_flow.current_portal_url(db, hire)
    issued, held, unchanged = [], [], []
    for cat in wanted:
        d, row = C.DOCS[cat], rows.get(cat)
        st = _row_state(db, row)
        if st not in ("not_sent", "declined"):
            unchanged.append({"category": cat, "title": d["title"], "state": st})
            continue
        if cat == "offer_letter" and _link_recruitment_offer(db, hire, row):
            unchanged.append({"category": cat, "title": d["title"], "state": "completed"})
            continue
        gaps = readiness(render_context(db, hire, cat, cfg=cfg, final=True, secure_link=secure_link), cat)
        if not gaps["ready"]:
            held.append({"category": cat, "title": d["title"], **gaps})
            continue
        old = _gen(db, row)
        if old is not None and old.status == "ISSUED":          # a leftover from the earlier generator: replaced, link revoked
            state.transition(db, old, "SUPERSEDED", actor_id=getattr(actor, "id", None),
                             detail={"reason": "replaced by the onboarding package document sent by HR"})
            signing.revoke_candidate_tokens(db, old)
        _issue_one(db, hire, d, cfg, actor, secure_link, row)
        issued.append({"category": cat, "title": d["title"], "mode": d["mode"]})
    details = dict(hire.profile_details or {})
    pkg = dict(details.get("_package") or {})
    if issued or not automatic:
        pkg.update({"sent_at": pkg.get("sent_at") or datetime.utcnow().isoformat(), "last_sent_at": datetime.utcnow().isoformat(),
                    "sent_by": getattr(actor, "id", None) if actor else pkg.get("sent_by")})
    pkg["held"] = [h["category"] for h in held]
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
    if mode_of(doc.category) != "ACKNOWLEDGE":
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
    db.commit()
    from app.modules.hr.service import log_onboarding_activity
    log_onboarding_activity(db, hire.id, "Document acknowledged", f"{hire.candidate_name} acknowledged receipt of '{doc.title}'.",
                            hire.organization_id)
    sync_onboarding_document_checklist(db, hire)


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
        out[row.id] = {"mode": mode_of(cat), "mode_label": C.MODE_LABELS[mode_of(cat)],
                       "template_id": C.DOCS[cat]["template_id"], "package_file": bool(package_file_key(hire, cat)),
                       "acknowledged_at": (acks.get(str(row.id)) or {}).get("at"), "optional": mode_of(cat) in ("VOLUNTARY", "INFO")}
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
                                                  or (affidavit is not None and _row_state(db, affidavit) == "awaiting_signature")):
        needs.append("outside_activities")              # Schedule A of the affidavit, completed before signing
    return {"needs": needs, "outside_activities": details.get("outside_activities"),
            "ack_text": ACK_TEXT, "ack_text_version": ACK_TEXT_VERSION}


# ── checklist ────────────────────────────────────────────────────────────────────────────────────────────────────────
CHECKLIST_NAME = "Onboarding Documents & Agreements"
ITEM_VERB = {"SIGN": "Sign", "ACKNOWLEDGE": "Acknowledge", "COMPLETE": "Complete and return"}


def sync_onboarding_document_checklist(db: Session, hire: OnboardingNewHire) -> None:
    """Mirror documents that need the new hire to act into their checklist (voluntary and information documents are left out,
    so they never hold up completion)."""
    from app.modules.hr.models import OnboardingChecklist, OnboardingChecklistItem
    docs = (db.query(OnboardingDocument)
            .filter(OnboardingDocument.onboarding_new_hire_id == hire.id, OnboardingDocument.is_deleted == False)  # noqa: E712
            .order_by(OnboardingDocument.id).all())
    # only package documents the new hire must act on; ordinary uploads are already covered by "documents approved"
    actionable = [d for d in docs if mode_of(d.category) in ("SIGN", "ACKNOWLEDGE", "COMPLETE") and d.status != NO_ACTION_STATUS]
    checklist = (db.query(OnboardingChecklist)
                 .filter(OnboardingChecklist.onboarding_new_hire_id == hire.id, OnboardingChecklist.name == CHECKLIST_NAME,
                         OnboardingChecklist.is_deleted == False).first())  # noqa: E712
    if checklist is None:
        if not actionable:
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
        mode = mode_of(d.category)
        done = d.status == "approved"
        title = f"{ITEM_VERB.get(mode, 'Review')} {d.title}"
        desc = (f"Done · {d.title}" if done else
                {"SIGN": "Waiting for the new hire's electronic signature", "ACKNOWLEDGE": "Waiting for acknowledgement of receipt",
                 "COMPLETE": "Waiting for the completed form" if d.status != "pending" else "Uploaded – HR to review"}
                .get(mode, "Waiting for the document to be approved"))
        it = existing.get(key)
        if it is None:
            it = OnboardingChecklistItem(organization_id=hire.organization_id, checklist_id=checklist.id, item_key=key,
                                         due_date=hire.joining_date or date.today(), owner_role="employee")
            db.add(it)
        it.title, it.description, it.mandatory = title[:200], desc, True
        it.completed, it.completed_at = done, (it.completed_at or datetime.utcnow()) if done else None
    for key, it in existing.items():             # documents removed, or now voluntary / informational
        if key.startswith("doc_") and key not in wanted:
            it.is_deleted = True
    db.flush()
    live = [i for i in checklist.items if not i.is_deleted]
    done_n = sum(1 for i in live if i.completed)
    checklist.status = "completed" if live and done_n == len(live) else ("in_progress" if done_n else "pending")
    db.commit()


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


def generate_html_for_doc(doc: GeneratedDocument) -> str:
    """Fallback when a document has no stored HTML: never invent terms; point the reader to the PDF."""
    from html import escape
    return (f'<!DOCTYPE html><html><head><meta charset="utf-8"></head><body style="font-family:Arial,sans-serif;padding:24px">'
            f"<h1 style=\"font-size:20px\">{escape(doc.title)}</h1><p>Document {escape(doc.document_number)}.</p>"
            "<p>The on-screen version of this document is not available. Download the PDF to read the full document before "
            "signing.</p></body></html>")
