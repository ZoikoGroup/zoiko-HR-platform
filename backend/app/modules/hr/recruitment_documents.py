"""Recruitment ↔ document engine (Prompt 2: HR-HIR-001/004/006/007/011/012/014–020).

* Offer letters are rendered by the engine, never in the browser. Flow: offer saved → approved by someone other than its
  creator (recruitment_offer_approvals) → letter generated (that approval is reused for the engine's L2 step when separation
  of duties holds) → issued (the candidate gets a single-use signing link) → the signing outcome drives the offer:
  EXECUTED → accepted (+ hand-off to onboarding, + HR-HIR-019), DECLINED → declined, EXPIRED → expired.
* Those offer state changes happen here, in hook handlers that run after the engine committed — never in the renderer.
* Records produced by recruitment actions (requisition authorization, interview record and scorecard) and letters sent on
  recruitment events (privacy notice, rejection) are generated with a system trigger. If no ACTIVE variant exists the engine
  denies, nothing is sent, and the blocked attempt is visible on the record (decision receipts by source_ref).
"""
from __future__ import annotations

import logging
from datetime import date, datetime, timedelta
from decimal import Decimal
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.core.dependencies import get_current_user
from app.database import get_db
from app.modules.doc_templates import access, hooks, preflight, service as doc_service
from app.modules.doc_templates.models import DecisionReceipt, GeneratedDocument, TemplateVariant
from app.modules.hr.models import (OfferStatus, OrganizationConfig, RecruitmentCandidate, RecruitmentCandidateStatus, RecruitmentInterview,
                                   RecruitmentInterviewFeedback, RecruitmentOffer, RecruitmentOfferApproval, RecruitmentRequisition)

logger = logging.getLogger("zoiko.recruitment.documents")

OFFER_LETTERS = ("HR-HIR-011", "HR-HIR-012", "HR-HIR-014", "HR-HIR-015", "HR-HIR-016", "HR-HIR-017")
AMENDMENT = "HR-HIR-017"
WITHDRAWAL = "HR-HIR-018"
ACCEPTANCE = "HR-HIR-019"
REJECTION = "HR-HIR-020"
PRIVACY_NOTICE = "HR-HIR-004"
REQUISITION_RECORD = "HR-HIR-001"
INTERVIEW_RECORD = "HR-HIR-006"
SCORECARD = "HR-HIR-007"
OFFER_IN_PROGRESS = ("REQUESTED", "CONTEXT_VALIDATED", "RENDERED_DRAFT", "PENDING_APPROVAL", "HUMAN_APPROVED")
CONDITION_TYPES = ("reference_check", "background_check", "right_to_work", "qualification_verification", "medical_where_lawful",
                   "licence_verification", "other")

# ── per-organization recruitment privacy settings (organization_configs, category "recruitment") ──────────────────

PRIVACY_SETTINGS = {
    "privacy_contact_email": ("recruitment.privacy_contact_email", str),
    "candidate_data_retention_months": ("recruitment.candidate_data_retention_months", int),   # no default: HR must set it
    "uses_cv_parsing": ("recruitment.uses_cv_parsing", bool),
    "talent_pool_opt_in_url": ("recruitment.talent_pool_opt_in_url", str),
    "issue_confirmation_on_clearance": ("recruitment.issue_confirmation_on_clearance", bool),
    # offers need no second approver: saving an offer approves it and generates its letter at once (HR still sends it)
    "offer_letters_without_approval": ("recruitment.offer_letters_without_approval", bool),
}

OFFER_WAIVER_REASON = "Organization setting: offer letters without approval"


def offer_letters_without_approval(db, organization_id: int) -> bool:
    """On unless the organization switched it off (since 2026-10-22): saving an offer generates its letter."""
    value = privacy_setting(db, organization_id, "offer_letters_without_approval")
    return True if value is None else bool(value)


def _cast(value, typ):
    if value in (None, ""):
        return None
    if typ is bool:
        return str(value).lower() in ("1", "true", "yes", "on")
    if typ is int:
        try:
            return int(value)
        except ValueError:
            return None
    return str(value)


def privacy_setting(db, organization_id: int, key: str):
    cfg_key, typ = PRIVACY_SETTINGS[key]
    row = db.query(OrganizationConfig).filter(OrganizationConfig.organization_id == organization_id, OrganizationConfig.key == cfg_key).first()
    value = _cast(row.value if row else None, typ)
    if key == "uses_cv_parsing" and value is None:
        return True                 # the platform's CV reader is on for every organization unless switched off explicitly
    return value


def privacy_settings(db, organization_id: int) -> dict:
    return {k: privacy_setting(db, organization_id, k) for k in PRIVACY_SETTINGS}


def save_privacy_settings(db, actor, data: dict) -> dict:
    access.require_org_admin(actor)
    for key, value in data.items():
        if key not in PRIVACY_SETTINGS:
            continue
        cfg_key, typ = PRIVACY_SETTINGS[key]
        if key == "candidate_data_retention_months" and value is not None and not (1 <= int(value) <= 120):
            raise HTTPException(422, "Retention must be between 1 and 120 months.")
        row = db.query(OrganizationConfig).filter(OrganizationConfig.organization_id == actor.organization_id,
                                                  OrganizationConfig.key == cfg_key).first()
        if row is None:
            row = OrganizationConfig(organization_id=actor.organization_id, key=cfg_key, category="recruitment",
                                     description=f"Recruitment privacy: {key}")
            db.add(row)
        row.value = "" if value is None else str(value).lower() if typ is bool else str(value)
    db.commit()
    return privacy_settings(db, actor.organization_id)


# ── helpers ──────────────────────────────────────────────────────────────────────────────────────────────────────────

def system_actor(db, organization_id: int):
    """The person a module-triggered document is recorded as requested by when no human is attached to the trigger."""
    from app.modules.employee.models import Employee, UserRole
    return (db.query(Employee).filter(Employee.organization_id == organization_id, Employee.is_active.is_(True),
                                      Employee.role.in_([UserRole.HR_ADMIN, UserRole.ADMIN])).order_by(Employee.id).first())


def _ref(kind: str, rid: int) -> str:
    return f"{kind}:{rid}"


def _doc_for(db, source_ref: str, canonical_ids) -> Optional[GeneratedDocument]:
    return (db.query(GeneratedDocument).filter(GeneratedDocument.source_ref == source_ref, GeneratedDocument.canonical_id.in_(list(canonical_ids)))
            .order_by(GeneratedDocument.id.desc()).first())


def _try_generate(db, actor, *, canonical_id, subject_type, subject_id, source_ref, trigger, issue=True, **kw) -> Optional[GeneratedDocument]:
    """Generate (and for L1, issue) a module-triggered document. A denial is recorded by the engine; it never fails the
    HR action that triggered it."""
    if actor is None:
        return None
    from app.modules.doc_templates import automation
    mode = automation.mode_for(db, actor.organization_id, canonical_id)
    if mode == "off":
        automation.record_skip(db, actor.organization_id, canonical_id, source_ref, trigger)
        return None
    try:
        doc = doc_service.generate(db, actor, canonical_id=canonical_id, subject_type=subject_type, subject_id=subject_id,
                                   source_ref=source_ref, system_trigger=trigger, **kw)
    except HTTPException as exc:
        db.rollback()
        logger.info("recruitment document %s for %s not generated (%s)", canonical_id, source_ref, exc.status_code)
        return None
    automation.record(db, doc, trigger, mode)
    if mode == "draft":
        issue = False                       # HR reviews and issues every document of this template
    elif mode == "auto" and not automation.may_auto_issue(doc):
        issue = issue and doc.status == "HUMAN_APPROVED"     # approved by a person in the module: issuing is not automatic judgement
    if issue and doc.status in ("RENDERED_DRAFT", "HUMAN_APPROVED"):
        try:
            doc = doc_service.issue(db, doc, actor, system_trigger=trigger)
        except HTTPException:
            db.rollback()
    return doc


def documents_for_source(db, organization_id: int, source_ref: str) -> dict:
    """Every document generated for a record, and the latest blocked attempt per template (reasons only)."""
    docs = (db.query(GeneratedDocument).filter(GeneratedDocument.organization_id == organization_id, GeneratedDocument.source_ref == source_ref)
            .order_by(GeneratedDocument.id.desc()).all())
    blocked = {}
    for r in (db.query(DecisionReceipt).filter(DecisionReceipt.organization_id == organization_id, DecisionReceipt.source_ref == source_ref,
                                               DecisionReceipt.outcome != "ALLOW").order_by(DecisionReceipt.id.desc()).all()):
        later_ok = any(d.canonical_id == r.canonical_id and d.created_at and r.created_at and d.created_at >= r.created_at for d in docs)
        if r.canonical_id not in blocked and not later_ok:
            blocked[r.canonical_id] = {"canonical_id": r.canonical_id, "outcome": r.outcome, "reasons": r.reasons or [], "at": r.created_at}
    return {"documents": [doc_service.serialize(d) for d in docs], "blocked": list(blocked.values())}


# ── offers ───────────────────────────────────────────────────────────────────────────────────────────────────────────

JSON_FIELDS = ("conditions", "components", "learning_objectives", "scorecard_criteria")


def json_safe(values: dict) -> dict:
    """JSON columns get plain JSON (dates as ISO strings, decimals as numbers)."""
    from fastapi.encoders import jsonable_encoder
    for k in JSON_FIELDS:
        if values.get(k) is not None:
            values[k] = jsonable_encoder(values[k])
            if k in ("components", "scorecard_criteria"):
                for item in values[k]:
                    for num in ("amount", "weight"):
                        if isinstance(item.get(num), str):
                            item[num] = float(item[num])
    return values


def check_offer_fields(db, values: dict, organization_id: int, offer: Optional[RecruitmentOffer] = None) -> None:
    """Links must belong to the organization; dates and conditions must make sense."""
    from app.modules.doc_templates.models import EmployerEntity
    from app.modules.employee.models import Employee
    from app.modules.hr.models import Department
    for key, model in (("department_id", Department), ("reporting_manager_id", Employee), ("mentor_id", Employee),
                       ("employer_entity_id", EmployerEntity)):
        rid = values.get(key)
        if rid:
            row = db.get(model, rid)
            if row is None or getattr(row, "organization_id", None) != organization_id:
                raise HTTPException(400, f"The selected {key.replace('_id', '').replace('_', ' ')} was not found.")
    start = values.get("joining_date", getattr(offer, "joining_date", None))
    for key in ("contract_end_date", "internship_end_date"):
        end = values.get(key, getattr(offer, key, None))
        if end and start and end <= start:
            raise HTTPException(400, f"The {key.replace('_', ' ')} must be after the start date.")
    if values.get("work_arrangement") not in (None, "onsite", "hybrid", "remote"):
        raise HTTPException(400, "Working arrangement must be onsite, hybrid or remote.")
    for cond in values.get("conditions") or []:
        if cond.get("type") not in CONDITION_TYPES or not (cond.get("description") or "").strip():
            raise HTTPException(400, "Each condition needs a type and a description.")


def select_offer_template(offer: RecruitmentOffer) -> tuple[Optional[str], Optional[str]]:
    """The server-side template selection rule (shown to HR before generating)."""
    if offer.amends_offer_id:
        return AMENDMENT, None
    # Older offers may not have an employment_type saved. Their pay model still
    # distinguishes internship stipends from regular salaries.
    kind = offer.employment_type or ("internship" if offer.remuneration_type == "stipend" else "full_time")
    if kind == "freelance":
        return None, "Contractor engagement letters are not available yet."
    if kind == "internship":
        return "HR-HIR-014", None
    if kind == "contract":
        return "HR-HIR-015", None
    if kind == "part_time":
        return "HR-HIR-016", None
    open_conditions = [c for c in (offer.conditions or []) if isinstance(c, dict) and c.get("status", "open") != "cleared"]
    return ("HR-HIR-011" if open_conditions else "HR-HIR-012"), None


def _offer(db, actor, offer_id: int) -> RecruitmentOffer:
    o = db.get(RecruitmentOffer, offer_id)
    if o is None or o.organization_id != actor.organization_id:
        raise HTTPException(404, "Offer not found")
    return o


def _letter(db, offer) -> Optional[GeneratedDocument]:
    """Return the current offer letter, repairing older generated rows that were never linked back to the offer.

    Some automatic document triggers create the GeneratedDocument with the correct offer source_ref but do not pass
    through the explicit generate-letter endpoint that normally stores RecruitmentOffer.document_id. Resolve that
    canonical offer template from the source record so reads, issuing, and signing hooks all see the same document.
    """
    canonical_id, _ = select_offer_template(offer)
    if not canonical_id:
        return None

    source_ref = _ref("recruitment_offer", offer.id)
    linked = db.get(GeneratedDocument, offer.document_id) if offer.document_id else None
    if (linked is not None and linked.organization_id == offer.organization_id
            and linked.source_ref == source_ref and linked.canonical_id == canonical_id):
        return linked

    recovered = (db.query(GeneratedDocument)
                 .filter(GeneratedDocument.organization_id == offer.organization_id,
                         GeneratedDocument.source_ref == source_ref,
                         GeneratedDocument.canonical_id == canonical_id)
                 .order_by(GeneratedDocument.id.desc())
                 .first())
    if recovered is not None:
        offer.document_id = recovered.id
        return recovered
    return None


def _has_released_offer_variant(db, organization_id: int, offer: RecruitmentOffer, canonical_id: str) -> bool:
    """Whether this offer can use a currently effective released variant for its work location."""
    country = (offer.work_country or "").upper()
    if not country:
        return False
    today = date.today()
    packs = preflight.candidate_packs(db, organization_id, country, offer.work_region, today)
    return any(
        db.query(TemplateVariant.id).filter(
            TemplateVariant.canonical_id == canonical_id,
            TemplateVariant.pack_id == pack.id,
            TemplateVariant.status == "ACTIVE",
            (TemplateVariant.effective_from.is_(None) | (TemplateVariant.effective_from <= today)),
            (TemplateVariant.effective_to.is_(None) | (TemplateVariant.effective_to >= today)),
        ).first() is not None
        for pack in packs
    )


def approve_offer(db, actor, offer: RecruitmentOffer, comment: Optional[str]) -> RecruitmentOffer:
    access.require_hr(actor)
    if offer.status not in (OfferStatus.DRAFT, OfferStatus.PENDING, OfferStatus.COUNTERED):
        raise HTTPException(409, f"A {offer.status.value} offer cannot be approved.")
    if offer.created_by and offer.created_by == actor.id:
        raise HTTPException(403, {"code": "SEPARATION_OF_DUTIES", "message": "Someone other than the person who prepared the offer must approve it."})
    if offer.salary is None:
        raise HTTPException(400, "Add the pay before approving the offer.")
    offer.status, offer.approved_by, offer.approved_at = OfferStatus.APPROVED, actor.id, datetime.utcnow()
    db.add(RecruitmentOfferApproval(offer_id=offer.id, approver_id=actor.id, approval_status="approved", comments=(comment or None),
                                    organization_id=offer.organization_id))
    db.commit()
    return offer


def auto_prepare_offer_letter(db, actor, offer_id: int) -> dict:
    """With "offer letters without approval" on: a saved offer is approved by the person who saved it and its letter (the
    template for the offer type, in the variant and clauses released for the work country) is generated straight away, ready
    for HR to send. Anything that stops the letter (no pack for the country, a missing clause or field) is returned, never
    raised: the offer itself is always saved."""
    if actor is None or not offer_letters_without_approval(db, actor.organization_id):
        return {"auto": False}
    offer = db.get(RecruitmentOffer, offer_id)
    if offer is None or offer.organization_id != actor.organization_id:
        return {"auto": False}
    current = _letter(db, offer)
    if current is not None and current.status in ("ISSUED", "EXECUTED"):
        return {"auto": True, "generated": False, "reason": "This offer's letter was already sent."}
    if current is not None and current.status in OFFER_IN_PROGRESS:
        if current.release_mode == "STARTER_PREVIEW":
            # The preview is useful while no released variant exists. A later template setup must replace it.
            if not _has_released_offer_variant(db, actor.organization_id, offer, current.canonical_id):
                return {"auto": True, "generated": False, "reason": "An unreviewed starter preview is already available."}
            doc_service.cancel(db, current, actor, "A released jurisdiction template is now available.",
                               system_trigger="recruitment_offer.template_ready")
            offer.document_id = None
            db.commit()
        elif offer.status == OfferStatus.APPROVED:
            return {"auto": True, "generated": False, "reason": "A letter for this offer already exists."}
        else:
            # the terms changed after the letter was made (an edit puts the offer back to draft): replace the unsent letter
            doc_service.cancel(db, current, actor, "The offer's terms changed; a new letter was generated.",
                               system_trigger="recruitment_offer.updated")
    cid, blocked = select_offer_template(offer)
    if blocked or not offer.candidate_id or offer.salary is None:
        return {"auto": True, "generated": False,
                "reason": blocked or ("Link the offer to a candidate." if not offer.candidate_id else "Add the pay.")}
    if offer.status in (OfferStatus.DRAFT, OfferStatus.PENDING, OfferStatus.COUNTERED):
        offer.status, offer.approved_by, offer.approved_at = OfferStatus.APPROVED, actor.id, datetime.utcnow()
        db.add(RecruitmentOfferApproval(offer_id=offer.id, approver_id=actor.id, approval_status="approved",
                                        comments=OFFER_WAIVER_REASON, organization_id=offer.organization_id))
        db.commit()
    if offer.status != OfferStatus.APPROVED:
        return {"auto": True, "generated": False, "reason": f"A {offer.status.value} offer gets no new letter."}
    try:
        doc = generate_offer_letter(db, actor, offer, waive_approval=True)
    except HTTPException as exc:
        db.rollback()
        detail = exc.detail if isinstance(exc.detail, dict) else {"message": str(exc.detail)}
        logger.info("offer %s: letter not generated automatically (%s)", offer_id, detail.get("reasons") or exc.status_code)
        return {"auto": True, "generated": False, "reason": detail.get("message"), "reasons": detail.get("reasons") or []}
    return {"auto": True, "generated": True, "document_id": doc.id, "canonical_id": doc.canonical_id}


LETTER_FIX_LINKS = {
    "plan": ("See plans", "/organization-admin/billing-and-plan"),
    "pack": ("Set up a jurisdiction pack", "/zoiko-hr/documents/jurisdiction-packs"),
    "template": ("Release the template", "/zoiko-hr/documents/templates"),
    "clauses": ("Write and release the clauses", "/zoiko-hr/documents/clauses"),
    "approval": ("Recruitment settings (Candidates → Privacy settings)", "/zoiko-hr/recruitment/candidates"),
}


def offer_letter_readiness(db, actor, offer: RecruitmentOffer) -> dict:
    """Everything an offer letter needs, each checked on its own (the engine's preflight stops at the first problem, so HR
    would otherwise fix one thing at a time). Read-only; nothing is generated or recorded."""
    from app.modules.doc_templates import entitlements, preflight, starters
    from app.modules.doc_templates.approvals import _people_with_roles, eligible_signatories
    from app.modules.doc_templates.models import TemplateDefinition
    org = actor.organization_id
    today = date.today()
    steps = []

    def step(key, label, ok, detail, fix=None, automatic=False, preview_only=False):
        link = LETTER_FIX_LINKS.get(fix or key) if not ok else None
        steps.append({"key": key, "label": label, "ok": bool(ok), "detail": detail,
                      "automatic": bool(automatic), "preview_only": bool(preview_only),
                      "fix": {"label": link[0], "href": link[1]} if link and not automatic and not preview_only else None})

    cid, blocked = select_offer_template(offer)
    details_missing = [m for m, bad in (("candidate", not offer.candidate_id), ("pay", offer.salary is None),
                                        ("work country", not offer.work_country)) if bad]
    step("offer", "Offer details", not blocked and not details_missing,
         blocked or (f"Add the {', '.join(details_missing)} to the offer." if details_missing else f"Template {cid} applies to this offer."))
    definition = db.get(TemplateDefinition, cid) if cid else None
    draft_preview_available = bool(
        cid and (offer.work_country or "").upper() in DRAFT_PREVIEW_COUNTRIES
        and starters.latest(db, cid)
        and preflight.templates_enabled(db, org)
        and preflight.entitled(db, org)
    )

    missing_features = [k for k in (entitlements.required_features(definition) if definition else [])
                        if not preflight.entitled(db, org, k)]
    step("plan", "Plan includes offer letters", not missing_features,
         "Included in your plan." if not missing_features else
         f"Your plan does not include {', '.join(missing_features)} (candidate e-signature needs it).")

    entity = preflight.resolve_entity(db, org, None, offer.employer_entity_id)
    entity_ok = entity is not None and bool(entity.legal_name) and bool(entity.country)
    step("entity", "Employing legal entity", entity_ok,
         f"{entity.legal_name} ({entity.country})" if entity_ok else
         ("The entity needs a legal name and a country." if entity is not None else
          "No active legal entity is set up for your organization."),
         preview_only=draft_preview_available and not entity_ok)

    sigs = eligible_signatories(db, org, entity.id, cid, definition.family_id, definition.legal_risk, set()) if (entity_ok and definition) else []
    step("signatory", "Authorised signatory", bool(sigs),
         f"{len(sigs)} signatory(ies) can sign offer letters." if sigs else
         "Nobody is authorised to sign offer letters for this entity.",
         preview_only=draft_preview_available and not bool(sigs))

    auto_setup_available = False
    if cid:
        from app.modules.hr.offer_letter_setup import can_auto_provision_offer_starters
        auto_setup_available = can_auto_provision_offer_starters(db, actor, offer, cid)

    packs = preflight.candidate_packs(db, org, offer.work_country, offer.work_region, today) if offer.work_country else []
    step("pack", f"Jurisdiction pack for {offer.work_country or 'the work country'}", bool(packs),
         ", ".join(f"{p.scope_type.lower()} pack #{p.id}" for p in packs) if packs else
         ("Will be provisioned automatically from the starter when you generate the letter." if auto_setup_available else
          "Automatic starter preview is available; no legal jurisdiction pack is created for preview." if draft_preview_available else
          f"No active pack covers {offer.work_country or 'the work country'}. Create your organization's pack and activate it."),
         automatic=auto_setup_available and not packs, preview_only=draft_preview_available and not packs and not auto_setup_available)

    variant = None
    if packs and cid:
        for p in packs:
            variant = (db.query(TemplateVariant).filter(TemplateVariant.canonical_id == cid, TemplateVariant.pack_id == p.id,
                                                        TemplateVariant.status == "ACTIVE", TemplateVariant.language == "en")
                       .order_by(TemplateVariant.version.desc()).first())
            if variant is not None:
                break
    step("template", f"Released template {cid or ''}".strip(), variant is not None,
         f"Version {variant.version} ({variant.release_mode.replace('_', ' ').lower()})" if variant else
         ("Will be released automatically from the starter when you generate the letter." if auto_setup_available else
          "Starter template is available for a draft preview only; it is not released for sending." if draft_preview_available else
          f"No released version of {cid} in the pack. Create it from the starter and release it.") if cid else "No template applies.",
         automatic=auto_setup_available and variant is None,
         preview_only=draft_preview_available and variant is None and not auto_setup_available)

    missing_clauses = []
    if variant is not None:
        for key in (variant.clause_rules or {}).get("mandatory") or []:
            if preflight.find_clause(db, org, key, variant.pack_id, variant.language, today) is None:
                missing_clauses.append(key)
    step("clauses", "Required clauses", variant is not None and not missing_clauses,
         ("All required clauses are released." if not missing_clauses else "Missing: " + ", ".join(missing_clauses)) if variant
         else ("Will be released automatically from the starter when you generate the letter."
               if auto_setup_available else "Country-specific clause placeholders are shown in the preview; clauses are not legally released." if draft_preview_available
               else "Checked once the template is released."),
         automatic=auto_setup_available and (variant is None or bool(missing_clauses)),
         preview_only=draft_preview_available and (variant is None or bool(missing_clauses)) and not auto_setup_available)

    waived = offer_letters_without_approval(db, org)
    if waived:
        pending_auto_approval = offer.status != OfferStatus.APPROVED and not offer.issued_at
        step("approval", "Offer approval", True,
             "Will be approved automatically when you generate the letter." if pending_auto_approval else
             "Not required (organization setting): the offer is approved.",
             automatic=pending_auto_approval)
    elif offer.status == OfferStatus.APPROVED or offer.issued_at:
        step("approval", "Offer approval", True, "Approved.")
    else:
        others = _people_with_roles(db, org, ["hr_admin", "admin"], {offer.created_by} if offer.created_by else set())
        step("approval", "Offer approval", False,
             "Waiting for someone other than the person who prepared it to approve it." if others else
             "Nobody other than the preparer can approve offers. Add another HR admin or switch on offer letters without approval.")

    final = None
    auto_pending = any(s.get("automatic") for s in steps)
    if all(s["ok"] for s in steps if s["key"] != "approval") and cid and offer.candidate_id and not auto_pending:
        r = preflight.run_preflight(db, organization_id=org, actor=actor, canonical_id=cid, subject_type="candidate",
                                    subject_id=offer.candidate_id, source_ref=_ref("recruitment_offer", offer.id),
                                    organization=actor.organization, waive_approval=OFFER_WAIVER_REASON if waived else None)
        db.rollback()
        final = r.as_dict()
        if final.get("outcome") != "ALLOW":
            step("final", "Final check", False, "; ".join(final.get("reasons") or []) or "The engine refused the letter.")
    return {"offer_id": offer.id, "canonical_id": cid, "ready": all(s["ok"] for s in steps), "steps": steps,
            "work_country": offer.work_country, "auto_setup_available": auto_setup_available,
            "draft_preview_available": draft_preview_available,
            "draft_preview_countries": sorted(DRAFT_PREVIEW_COUNTRIES)}


def offer_preflight(db, actor, offer: RecruitmentOffer) -> dict:
    from app.modules.doc_templates import preflight
    cid, blocked = select_offer_template(offer)
    out = {"canonical_id": cid, "selection_blocked": blocked, "approved": offer.status == OfferStatus.APPROVED}
    if cid and offer.candidate_id:
        r = preflight.run_preflight(db, organization_id=actor.organization_id, actor=actor, canonical_id=cid, subject_type="candidate",
                                    subject_id=offer.candidate_id, source_ref=_ref("recruitment_offer", offer.id), organization=actor.organization)
        db.rollback()
        out["preflight"] = r.as_dict()
    elif cid:
        out["selection_blocked"] = "Link the offer to a candidate before generating the letter."
    return out


DRAFT_PREVIEW_COUNTRIES = {"GB", "US", "AU", "IN", "CA"}
SENDABLE_OFFER_STARTER = "OFFER_STARTER"


def generate_unreviewed_offer_draft(db, actor, offer: RecruitmentOffer, canonical_id: str, *, sendable: bool = False):
    """Persist a rendered starter draft, or a sendable offer using unchanged platform starter content.

    A sendable starter is intentionally distinct from a jurisdiction-released variant. It is available only for the five
    supported offer countries, uses the exact starter blocks and existing starter clause text, and refuses to send when a
    required clause or required offer field has no starter value.
    """
    from datetime import timedelta
    from types import SimpleNamespace
    from app.modules.doc_templates import fields, renderer, service as doc_service, starters, state
    from app.modules.doc_templates.models import GeneratedDocument, TemplateDefinition
    from app.modules.hr.models import RecruitmentCandidate

    if (offer.work_country or "").upper() not in DRAFT_PREVIEW_COUNTRIES:
        raise HTTPException(409, "A released jurisdiction template is required for this work country.")
    if not preflight.templates_enabled(db, actor.organization_id):
        raise HTTPException(409, "Document generation is disabled for this organization.")
    if not preflight.entitled(db, actor.organization_id):
        raise HTTPException(403, "Your plan does not include offer letters.")
    definition = db.get(TemplateDefinition, canonical_id)
    starter = starters.latest(db, canonical_id)
    candidate = db.get(RecruitmentCandidate, offer.candidate_id)
    if definition is None or starter is None or candidate is None:
        raise HTTPException(404, "Offer template or candidate not found.")
    if sendable and not (candidate.email or "").strip():
        raise HTTPException(409, "Add an email address to the linked candidate before sending the offer letter.")

    existing = _letter(db, offer)
    if existing is not None and existing.status in OFFER_IN_PROGRESS:
        return existing
    country = offer.work_country.upper()
    entity = preflight.resolve_entity(db, actor.organization_id, None, offer.employer_entity_id)
    if entity is None:
        organization = actor.organization
        entity = SimpleNamespace(
            legal_name=getattr(organization, "organization_name", None) or getattr(organization, "display_name", None) or "Employer name not set",
            trading_name=None, country=country, region=getattr(organization, "state", None), city=getattr(organization, "city", None),
            postal_code=None, address_lines=[getattr(organization, "address", None)] if getattr(organization, "address", None) else [],
            registration_number=None, registration_type=None, logo_file=None)
    if sendable and getattr(entity, "legal_name", None) == "Employer name not set":
        raise HTTPException(409, "Set your organization's name before sending an offer letter.")

    now = datetime.utcnow()
    number = doc_service.next_document_number(db, actor.organization)
    source_ref = _ref("recruitment_offer", offer.id)
    doc = GeneratedDocument(
        document_number=number, organization_id=actor.organization_id, canonical_id=canonical_id,
        family_id=definition.family_id, title=definition.title, kind=definition.kind,
        legal_risk=definition.legal_risk, sensitivity=definition.sensitivity, output_mode=definition.output_mode,
        execution_mode=definition.execution_mode, audience=definition.audience,
        approval_policy="L1" if sendable else "L2",
        variant_id=None, variant_version=None, variant_checksum=None, pack_id=None,
        release_mode=SENDABLE_OFFER_STARTER if sendable else "STARTER_PREVIEW", subject_type="candidate", subject_id=candidate.id,
        source_ref=source_ref, language="en", recipient_name=fields._full_name(candidate),
        recipient_email=candidate.email, entity_id=getattr(entity, "id", None), requested_by=actor.id)
    state.initial(doc)
    db.add(doc)
    db.flush()
    state.add_event(db, doc, "requested", actor_id=actor.id,
                    detail={"canonical_id": canonical_id, "preview_only": not sendable,
                            "release_mode": doc.release_mode, "starter_revision": starter.get("revision")})
    state.transition(db, doc, "CONTEXT_VALIDATED", actor_id=actor.id,
                     detail={"jurisdiction": country, "preview_only": not sendable})

    ctx = fields.FieldContext(db=db, organization=actor.organization, subject_type="candidate", subject=candidate,
                              entity=entity, requester=actor, canonical_id=canonical_id, source=offer,
                              language="en", sample=False)
    today = date.today()
    days = int(starter.get("options", {}).get("response_days") or 14)
    ctx.document = {"number": number, "date": today, "title": definition.title,
                    "response_deadline": today + timedelta(days=days)}
    rules = starter.get("clause_rules") or {}
    mandatory = list(rules.get("mandatory") or [])
    clauses = {}
    for key in mandatory + list(rules.get("optional") or []):
        clause = starters.starter_clause(db, key)
        if clause and clause.get("text"):
            clauses[key] = SimpleNamespace(text=clause["text"])
        elif key in mandatory and sendable:
            raise HTTPException(409, {"code": "OFFER_STARTER_CLAUSE_MISSING",
                                      "message": f"The selected offer template has no ready starter text for required clause '{key}'."})
        else:
            clauses[key] = SimpleNamespace(text=f"[Unreviewed draft placeholder: jurisdiction-specific clause '{key}' is not configured.]")
    if sendable:
        missing = fields.required_missing(ctx, list((starter.get("field_contract") or {}).get("required") or []))
        if missing:
            raise HTTPException(422, {"code": "OFFER_FIELDS_MISSING",
                                      "message": "Complete the required offer fields before sending: " + ", ".join(missing)})
    inp = doc_service.build_input(ctx, blocks=starter.get("content") or [], clauses=clauses,
                                  required_clause_keys=mandatory, number=number, title=definition.title,
                                  sensitivity=definition.sensitivity, letterhead_info=doc_service.letterhead(entity, actor.organization),
                                  author=getattr(entity, "legal_name", ""))
    doc_service._store_render(db, doc, inp)
    state.transition(db, doc, "RENDERED_DRAFT", actor_id=actor.id, event_type="rendered",
                     detail={"sha256": doc.pdf_sha256, "preview_only": not sendable,
                             "country": country, "release_mode": doc.release_mode,
                             "starter_revision": starter.get("revision")})
    doc.due_by = datetime.combine(today + timedelta(days=days), datetime.min.time())
    doc.expires_at = doc.due_by + timedelta(days=7)
    doc.reminder_days = list(starter.get("options", {}).get("reminder_days") or [])
    offer.document_id = doc.id
    if sendable:
        if offer.status != OfferStatus.APPROVED:
            raise HTTPException(409, "Approve the offer before sending the letter.")
        approver_id = offer.approved_by or actor.id
        doc.approved_by = [approver_id]
        state.transition(db, doc, "HUMAN_APPROVED", actor_id=approver_id, event_type="offer_approval_reused",
                         detail={"source": "recruitment_offer", "offer_id": offer.id})
        state.add_event(db, doc, "automatic_offer_template", actor_id=actor.id,
                        detail={"country": country, "starter_revision": starter.get("revision"),
                                "jurisdiction_pack_required": False})
    db.commit()
    db.refresh(doc)
    return doc


def auto_generate_offer_draft_on_create(db, actor, offer: RecruitmentOffer) -> Optional[GeneratedDocument]:
    """Attach a starter draft as soon as an offer is created for a supported work country."""
    if actor is None or offer is None or not offer.candidate_id or (offer.work_country or "").upper() not in DRAFT_PREVIEW_COUNTRIES:
        return None
    current = _letter(db, offer)
    if current is not None:
        return current
    cid, blocked = select_offer_template(offer)
    if blocked or not cid:
        return None
    try:
        return generate_unreviewed_offer_draft(db, actor, offer, cid)
    except Exception:
        db.rollback()
        logger.exception("offer %s: automatic starter draft generation failed", offer.id)
        return None


def generate_offer_letter(db, actor, offer: RecruitmentOffer, *, waive_approval: bool = False) -> GeneratedDocument:
    access.require_hr(actor)
    cid, blocked = select_offer_template(offer)
    if blocked:
        raise HTTPException(409, {"code": "TEMPLATE_NOT_AVAILABLE", "message": blocked})
    if not offer.candidate_id:
        raise HTTPException(409, "Link the offer to a candidate before generating the letter.")
    if offer.status != OfferStatus.APPROVED:
        if (offer_letters_without_approval(db, actor.organization_id)
                and offer.status in (OfferStatus.DRAFT, OfferStatus.PENDING, OfferStatus.COUNTERED)):
            if offer.salary is None:
                raise HTTPException(400, "Add the pay before generating the offer letter.")
            offer.status, offer.approved_by, offer.approved_at = OfferStatus.APPROVED, actor.id, datetime.utcnow()
            db.add(RecruitmentOfferApproval(offer_id=offer.id, approver_id=actor.id, approval_status="approved",
                                            comments=OFFER_WAIVER_REASON, organization_id=offer.organization_id))
            db.commit()
            waive_approval = True
            offer = db.get(RecruitmentOffer, offer.id)
        else:
            raise HTTPException(409, {"code": "OFFER_NOT_APPROVED", "message": "The offer must be approved before its letter is generated."})
    country = (offer.work_country or "").upper()
    current = _letter(db, offer)
    if current is not None and current.status in OFFER_IN_PROGRESS and current.release_mode != "STARTER_PREVIEW":
        raise HTTPException(409, "A letter for this offer is already in progress. Issue or cancel it first.")
    # A generation request by an organization admin can provision eligible, unchanged starter content for the offer's
    # work country. Existing entity/signatory and plan checks remain required; unresolved legal wording still blocks.
    from app.modules.hr.offer_letter_setup import provision_offer_starters_on_generation
    try:
        provision_offer_starters_on_generation(db, actor, offer, cid)
    except HTTPException:
        db.rollback()  # leave the offer intact; the normal preflight below returns the actionable blocker
        offer = db.get(RecruitmentOffer, offer.id)
    current = _letter(db, offer)
    released = _has_released_offer_variant(db, actor.organization_id, offer, cid)
    if current is not None and current.status in OFFER_IN_PROGRESS and current.release_mode == "STARTER_PREVIEW":
        if not released:
            return current
        doc_service.cancel(db, current, actor, "A released jurisdiction template is now available.",
                           system_trigger="recruitment_offer.template_ready")
        offer.document_id = None
        db.commit()
    approvals = (db.query(RecruitmentOfferApproval).filter(RecruitmentOfferApproval.offer_id == offer.id,
                                                           RecruitmentOfferApproval.approval_status == "approved")
                 .order_by(RecruitmentOfferApproval.id).all())
    prior = [{"approver_id": a.approver_id, "decided_at": a.approved_date, "comment": a.comments, "source": "recruitment offer approval"}
             for a in approvals]
    try:
        doc = doc_service.generate(db, actor, canonical_id=cid, subject_type="candidate", subject_id=offer.candidate_id,
                                   source_ref=_ref("recruitment_offer", offer.id), entity_id=offer.employer_entity_id,
                                   prior_approvals=None if waive_approval else prior,
                                   waive_approval=OFFER_WAIVER_REASON if waive_approval else None)
    except doc_service.PreflightDenied:
        if country in DRAFT_PREVIEW_COUNTRIES:
            current = _letter(db, offer)
            if current is not None and current.status in OFFER_IN_PROGRESS and current.release_mode == "STARTER_PREVIEW":
                return current
            return generate_unreviewed_offer_draft(db, actor, offer, cid)
        raise
    offer = db.get(RecruitmentOffer, offer.id)
    offer.document_id = doc.id
    db.commit()
    return doc


def _approve_offer_for_sending(db, actor, offer: RecruitmentOffer) -> bool:
    """Ensure offer approval exists, returning whether the organization uses automatic approval."""
    access.require_hr(actor)
    if offer.status in (OfferStatus.ACCEPTED, OfferStatus.REJECTED, OfferStatus.WITHDRAWN, OfferStatus.EXPIRED):
        raise HTTPException(409, f"A {offer.status.value} offer cannot be sent.")
    automatic = offer_letters_without_approval(db, actor.organization_id)
    if offer.status == OfferStatus.APPROVED and offer.approved_by:
        return automatic
    if not automatic:
        raise HTTPException(409, "Approve the offer before sending its letter.")
    if offer.status == OfferStatus.APPROVED:
        if offer.salary is None:
            raise HTTPException(400, "Add the remuneration amount before sending the offer.")
        offer.approved_by, offer.approved_at = actor.id, offer.approved_at or datetime.utcnow()
        db.add(RecruitmentOfferApproval(offer_id=offer.id, approver_id=actor.id, approval_status="approved",
                                        comments=OFFER_WAIVER_REASON, organization_id=offer.organization_id))
        db.commit()
        return True
    if offer.status not in (OfferStatus.DRAFT, OfferStatus.PENDING, OfferStatus.COUNTERED):
        raise HTTPException(409, f"A {offer.status.value} offer cannot be approved for sending.")
    if offer.salary is None:
        raise HTTPException(400, "Add the remuneration amount before sending the offer.")
    offer.status, offer.approved_by, offer.approved_at = OfferStatus.APPROVED, actor.id, datetime.utcnow()
    db.add(RecruitmentOfferApproval(offer_id=offer.id, approver_id=actor.id, approval_status="approved",
                                    comments=OFFER_WAIVER_REASON, organization_id=offer.organization_id))
    db.commit()
    return True


def send_offer_letter(db: Session, actor, offer: RecruitmentOffer) -> GeneratedDocument:
    """Prepare, approve when configured, issue and synchronously email an offer's candidate signing link."""
    access.require_hr(actor)
    if offer.issued_at:
        raise HTTPException(409, "This offer has already been sent. Use Resend to send a fresh signing link.")
    if not offer.candidate_id:
        raise HTTPException(409, "Link this offer to a candidate before sending it.")
    candidate = db.get(RecruitmentCandidate, offer.candidate_id)
    if candidate is None or not (candidate.email or "").strip():
        raise HTTPException(409, "The linked candidate needs an email address before the offer can be sent.")

    automatic_approval = _approve_offer_for_sending(db, actor, offer)
    canonical_id, blocked = select_offer_template(offer)
    if blocked or not canonical_id:
        raise HTTPException(409, blocked or "No offer letter template applies to this offer.")

    current = _letter(db, offer)
    if current is not None and current.status in ("ISSUED", "EXECUTED"):
        raise HTTPException(409, "This offer letter has already been issued. Use Resend to send a fresh signing link.")

    def block_unreviewed_cross_border_preview(doc):
        if doc is None or doc.release_mode != "STARTER_PREVIEW":
            return
        entity = preflight.resolve_entity(db, actor.organization_id, None, offer.employer_entity_id)
        employer_country = getattr(entity, "country", None) or getattr(actor.organization, "country", None)
        if employer_country:
            from app.core.regions import country_code_strict
            employer_country = country_code_strict(employer_country) or employer_country.upper()
        else:
            employer_country = (offer.work_country or "").upper()
        work_country = (offer.work_country or "").upper()
        if employer_country and work_country and employer_country != work_country:
            raise HTTPException(409, {
                "code": "STARTER_PREVIEW_NOT_ISSUABLE",
                "message": "This is an unreviewed starter draft. Release a jurisdiction-specific template that covers this cross-border employment before issuing it.",
            })

    # A preview may help HR prepare the offer, but the sendable starter fallback is not
    # sufficient for work performed across a border. Keep the preview intact so the
    # employee cannot receive unreviewed cross-border terms.
    block_unreviewed_cross_border_preview(current)

    must_regenerate = bool(current and current.status in OFFER_IN_PROGRESS and (
        current.release_mode == "STARTER_PREVIEW"
        or (automatic_approval and current.approval_policy != "L1")
    ))
    if must_regenerate:
        doc_service.cancel(db, current, actor,
                           "Replaced for one-step offer sending using the active approval setting.",
                           system_trigger="recruitment_offer.send")
        offer.document_id = None
        db.commit()
        current = None

    if current is None or current.status not in OFFER_IN_PROGRESS:
        current = generate_offer_letter(db, actor, offer, waive_approval=automatic_approval)

    block_unreviewed_cross_border_preview(current)

    if current.release_mode == "STARTER_PREVIEW":
        doc_service.cancel(db, current, actor, "Replaced by the sendable platform offer starter.",
                           system_trigger="recruitment_offer.send")
        offer.document_id = None
        db.commit()
        current = generate_unreviewed_offer_draft(db, actor, offer, canonical_id, sendable=True)

    if current.status == "PENDING_APPROVAL":
        raise HTTPException(409, "The offer letter needs its assigned document approval before it can be sent.")
    if current.status not in ("HUMAN_APPROVED", "RENDERED_DRAFT"):
        raise HTTPException(409, f"The offer letter is {current.status.lower().replace('_', ' ')} and cannot be sent.")
    if current.status == "RENDERED_DRAFT" and current.approval_policy != "L1":
        raise HTTPException(409, "The offer letter needs approval before it can be sent.")

    doc = doc_service.issue(db, current, actor, require_delivery=True)
    offer = db.get(RecruitmentOffer, offer.id)
    offer.status = OfferStatus.PENDING
    offer.issued_at = doc.issued_at or datetime.utcnow()
    if offer.response_deadline is None and doc.due_by:
        offer.response_deadline = doc.due_by.date()
    if candidate.status in (RecruitmentCandidateStatus.APPLIED, RecruitmentCandidateStatus.SCREENING,
                            RecruitmentCandidateStatus.INTERVIEW):
        candidate.status = RecruitmentCandidateStatus.OFFER
    db.commit()
    db.refresh(doc)
    return doc


def resend_offer_letter(db: Session, actor, offer: RecruitmentOffer) -> GeneratedDocument:
    """Retry delivery by replacing the candidate's single-use signing link."""
    access.require_hr(actor)
    doc = _letter(db, offer)
    if doc is None or doc.status != "ISSUED":
        raise HTTPException(409, "Issue the offer letter before resending it.")
    if doc.legal_hold:
        raise HTTPException(409, "This offer letter is on legal hold and cannot be resent.")
    if not offer.issued_at:
        offer.issued_at = doc.issued_at or datetime.utcnow()
        if offer.status in (OfferStatus.DRAFT, OfferStatus.APPROVED, OfferStatus.COUNTERED):
            offer.status = OfferStatus.PENDING
        if offer.response_deadline is None and doc.due_by:
            offer.response_deadline = doc.due_by.date()
        db.commit()
    if offer.status in (OfferStatus.ACCEPTED, OfferStatus.REJECTED, OfferStatus.WITHDRAWN, OfferStatus.EXPIRED):
        raise HTTPException(409, f"A {offer.status.value} offer cannot be resent.")
    candidate = db.get(RecruitmentCandidate, offer.candidate_id) if offer.candidate_id else None
    if candidate is None or not (candidate.email or "").strip():
        raise HTTPException(409, "The linked candidate needs an email address before the offer can be resent.")
    from app.modules.doc_templates import signing, notify, fields
    doc.recipient_email = candidate.email
    doc.recipient_name = fields._full_name(candidate)
    raw, expires = signing.issue_candidate_token(db, doc)
    organization_name = (getattr(actor.organization, "organization_name", None)
                         or getattr(actor.organization, "display_name", None) or "Your employer")
    if not notify.candidate_link(db, doc, candidate, raw, expires, organization_name, wait=True):
        signing.revoke_candidate_tokens(db, doc)
        db.commit()
        raise HTTPException(502, {"code": "OFFER_EMAIL_DELIVERY_FAILED",
                                  "message": "The signing link could not be delivered. Check the email configuration and try again."})
    doc.delivered_via, doc.delivered_at = "email", datetime.utcnow()
    state.add_event(db, doc, "emailed", actor_id=actor.id, detail={"channel": "candidate_link", "resent": True})
    db.commit()
    db.refresh(doc)
    return doc


def issue_offer_letter(db: Session, actor, offer: RecruitmentOffer) -> GeneratedDocument:
    return send_offer_letter(db, actor, offer)


def amend_offer(db, actor, offer: RecruitmentOffer, changes: dict) -> dict:
    """Editing an issued offer creates a new offer row that needs its own approval and issues HR-HIR-017."""
    access.require_hr(actor)
    letter = _letter(db, offer)
    if letter is None or letter.status not in ("ISSUED", "EXECUTED"):
        raise HTTPException(409, "Only an offer whose letter was issued can be amended. Edit a draft offer directly.")
    if offer.status in (OfferStatus.REJECTED, OfferStatus.WITHDRAWN, OfferStatus.EXPIRED):
        raise HTTPException(409, f"A {offer.status.value} offer cannot be amended.")
    if not changes:
        raise HTTPException(422, "Say what changes.")
    copy_cols = [c.name for c in RecruitmentOffer.__table__.columns if c.name not in (
        "id", "status", "created_at", "updated_at", "created_by", "approved_by", "approved_at", "issued_at", "accepted_at", "decline_reason",
        "document_id", "amends_offer_id", "withdrawal_reason_category", "withdrawal_reason_note", "withdrawal_condition",
        "withdrawal_legal_review", "withdrawal_requested_by")]
    new = RecruitmentOffer(**{c: getattr(offer, c) for c in copy_cols})
    for k, v in changes.items():
        if k in copy_cols and k not in ("candidate_id", "candidate_name", "organization_id"):
            setattr(new, k, v)
    check_offer_fields(db, changes, offer.organization_id, offer)
    new.status, new.created_by, new.amends_offer_id = OfferStatus.DRAFT, actor.id, offer.id
    new.response_deadline = changes.get("response_deadline")
    db.add(new)
    db.commit()
    return {"offer": new, "warning": ("The original offer was already accepted. The amendment needs the candidate's agreement and may "
                                      "need legal review." if offer.status == OfferStatus.ACCEPTED else None)}


OFFER_DIFF_FIELDS = [("position", "Position"), ("salary", "Pay"), ("currency", "Currency"), ("pay_period", "Pay period"),
                     ("joining_date", "Start date"), ("employment_type", "Employment type"), ("work_location", "Work location"),
                     ("work_arrangement", "Working arrangement"), ("hours_per_week", "Hours per week"), ("work_pattern", "Working pattern"),
                     ("contract_end_date", "Fixed-term end date"), ("internship_end_date", "Internship end date"),
                     ("benefits_summary", "Benefits"), ("equity", "Equity"), ("probation_months", "Probation (months)")]


def offer_changes(ctx, old: RecruitmentOffer, new: RecruitmentOffer) -> list:
    from app.modules.doc_templates import formatting
    rows = []
    for col, label in OFFER_DIFF_FIELDS:
        a, b = getattr(old, col), getattr(new, col)
        if a == b:
            continue

        def show(v):
            if v is None or v == "":
                return "—"
            if isinstance(v, date):
                return formatting.format_date(v, ctx.language, ctx.country())
            if col == "salary":
                return formatting.format_money(v, new.currency, ctx.language, new.work_country or ctx.country())
            return str(v)
        rows.append([label, show(a), show(b)])
    return rows


def _amendment_context(ctx):
    o = ctx.source
    if o is None or not getattr(o, "amends_offer_id", None):
        return
    old = ctx.db.get(RecruitmentOffer, o.amends_offer_id)
    if old is None:
        return
    ctx.extra["offer.previous_reference"] = f"OFR-{old.id:05d}"
    ctx.extra["offer.previous_date"] = old.issued_at or old.created_at
    ctx.extra["offer.changes"] = offer_changes(ctx, old, o) or None


hooks.context([AMENDMENT], _amendment_context)


def request_withdrawal(db, actor, offer: RecruitmentOffer, data: dict) -> GeneratedDocument:
    """Withdrawal needs a reason and approval before the notice is issued; the offer only changes when a human issues it."""
    access.require_hr(actor)
    category = data.get("category")
    if category not in ("condition_not_met", "role_cancelled", "candidate_request", "other"):
        raise HTTPException(422, "Choose the reason for withdrawing the offer.")
    statement = (data.get("statement") or "").strip()
    if not statement:
        raise HTTPException(422, "Write the reviewed statement that the candidate will read.")
    if category == "condition_not_met" and not (data.get("condition") or "").strip():
        raise HTTPException(422, "Say which condition was not met.")
    accepted = offer.status == OfferStatus.ACCEPTED
    if accepted and data.get("legal_review_completed") is None:
        raise HTTPException(422, {"code": "LEGAL_REVIEW_NOTE_REQUIRED",
                                  "message": "This offer was already accepted. Record whether legal review was completed."})
    if offer.status in (OfferStatus.REJECTED, OfferStatus.WITHDRAWN, OfferStatus.EXPIRED):
        raise HTTPException(409, f"A {offer.status.value} offer cannot be withdrawn.")
    offer.withdrawal_reason_category, offer.withdrawal_reason_note = category, statement
    offer.withdrawal_condition = (data.get("condition") or "").strip() or None
    offer.withdrawal_legal_review = data.get("legal_review_completed") if accepted else None
    offer.withdrawal_requested_by = actor.id
    db.commit()
    if not offer.candidate_id:
        offer.status = OfferStatus.WITHDRAWN                   # nobody to notify: an internal draft is simply withdrawn
        db.commit()
        return None
    return doc_service.generate(db, actor, canonical_id=WITHDRAWAL, subject_type="candidate", subject_id=offer.candidate_id,
                                source_ref=_ref("recruitment_offer", offer.id), entity_id=offer.employer_entity_id,
                                approver_roles=["admin"] if accepted else None)


def clear_condition(db, actor, offer: RecruitmentOffer, index: int) -> RecruitmentOffer:
    access.require_hr(actor)
    conds = list(offer.conditions or [])
    if not (0 <= index < len(conds)):
        raise HTTPException(404, "Condition not found")
    conds[index] = {**conds[index], "status": "cleared", "cleared_at": datetime.utcnow().isoformat(), "cleared_by": actor.id}
    offer.conditions = conds
    db.commit()
    if (offer.status == OfferStatus.ACCEPTED and all(c.get("status") == "cleared" for c in conds)
            and privacy_setting(db, offer.organization_id, "issue_confirmation_on_clearance")):
        _try_generate(db, actor, canonical_id="HR-HIR-012", subject_type="candidate", subject_id=offer.candidate_id,
                      source_ref=_ref("recruitment_offer", offer.id), trigger="recruitment_offer.conditions_cleared", issue=False)
    return offer


# ── signing outcomes (hooks) ─────────────────────────────────────────────────────────────────────────────────────────

def _offer_of(db, doc) -> Optional[RecruitmentOffer]:
    if not (doc.source_ref or "").startswith("recruitment_offer:"):
        return None
    o = db.get(RecruitmentOffer, int(doc.source_ref.split(":")[1]))
    return o if o is not None and o.organization_id == doc.organization_id else None


def on_offer_executed(db, doc):
    from app.modules.hr import recruitment_service
    offer = _offer_of(db, doc)
    if offer is None:
        return
    letter = _letter(db, offer)
    if letter is None or letter.id != doc.id:
        return
    offer.accepted_at = datetime.utcnow()
    db.commit()
    if offer.amends_offer_id:
        original = db.get(RecruitmentOffer, offer.amends_offer_id)
        if original is not None and original.status != OfferStatus.ACCEPTED:
            original.status = OfferStatus.WITHDRAWN            # replaced by the accepted amendment
            db.commit()
    if offer.status != OfferStatus.ACCEPTED:
        recruitment_service.accept_offer(db, offer.id, offer.organization_id, _from_engine=True)
    from app.modules.employee.models import Employee
    issuer = db.get(Employee, doc.issued_by) if doc.issued_by else None
    _try_generate(db, issuer or system_actor(db, offer.organization_id), canonical_id=ACCEPTANCE, subject_type="candidate",
                  subject_id=offer.candidate_id, source_ref=_ref("recruitment_offer", offer.id), trigger="offer_document.executed")


def on_offer_declined(db, doc):
    from app.modules.doc_templates.signing import signatures
    from app.modules.hr import recruitment_notify
    offer = _offer_of(db, doc)
    if offer is None:
        return
    letter = _letter(db, offer)
    if letter is None or letter.id != doc.id:
        return
    declined = next((s for s in signatures(db, doc) if s.decision == "DECLINED"), None)
    offer.status = OfferStatus.REJECTED                        # shown as "Declined"
    offer.decline_reason = getattr(declined, "decline_reason", None)
    db.commit()
    recruitment_notify.notify_offer_outcome(db, offer, accepted=False)


def on_offer_expired(db, doc):
    offer = _offer_of(db, doc)
    if offer is None:
        return
    letter = _letter(db, offer)
    if letter is None or letter.id != doc.id:
        return
    if offer.status in (OfferStatus.PENDING, OfferStatus.APPROVED, OfferStatus.COUNTERED):
        offer.status = OfferStatus.EXPIRED
        db.commit()


def on_amendment_issued(db, doc):
    offer = _offer_of(db, doc)
    if offer is None or not offer.amends_offer_id:
        return
    original = db.get(RecruitmentOffer, offer.amends_offer_id)
    previous = _letter(db, original) if original else None
    if previous is not None and previous.status == "ISSUED":
        doc_service.supersede(db, previous, None, reason="offer amended")


def on_withdrawal_issued(db, doc):
    offer = _offer_of(db, doc)
    if offer is None:
        return
    letter = _letter(db, offer)
    if letter is not None and letter.status in OFFER_IN_PROGRESS + ("ISSUED",):
        try:
            doc_service.cancel(db, letter, None, "offer withdrawn", system_trigger="recruitment_offer.withdrawn")
        except HTTPException:
            db.rollback()
    offer.status = OfferStatus.WITHDRAWN
    db.commit()


hooks.on("executed", OFFER_LETTERS, on_offer_executed)
hooks.on("declined", OFFER_LETTERS, on_offer_declined)
hooks.on("expired", OFFER_LETTERS, on_offer_expired)
hooks.on("issued", [AMENDMENT], on_amendment_issued)
hooks.on("issued", [WITHDRAWAL], on_withdrawal_issued)


# ── requisitions, candidates, interviews ─────────────────────────────────────────────────────────────────────────────

def on_requisition_decided(db, req: RecruitmentRequisition, decider) -> None:
    """HR-HIR-001: the requester asked, the decider approved — the engine reuses that decision for its L2 step."""
    from app.modules.employee.models import Employee
    requester = db.get(Employee, req.created_by) if req.created_by else None
    actor = requester if requester is not None and requester.is_active else decider
    prior = [{"approver_id": decider.id, "decided_at": req.decided_at, "comment": req.decision_comment, "source": "requisition approval"}]
    doc = _try_generate(db, actor, canonical_id=REQUISITION_RECORD, subject_type="org", subject_id=None,
                        source_ref=_ref("recruitment_requisition", req.id), trigger="recruitment_requisition.decided",
                        prior_approvals=prior, issue=False)
    if doc is not None and doc.status == "HUMAN_APPROVED":
        try:
            doc_service.issue(db, doc, decider, system_trigger="recruitment_requisition.decided")
        except HTTPException:
            db.rollback()


def on_candidate_created(db, candidate: RecruitmentCandidate, actor) -> None:
    _try_generate(db, actor or system_actor(db, candidate.organization_id), canonical_id=PRIVACY_NOTICE, subject_type="candidate",
                  subject_id=candidate.id, source_ref=_ref("recruitment_candidate", candidate.id), trigger="candidate.created")


STAGE_FROM_STATUS = {"applied": "application", "screening": "screening", "interview": "interview", "offer": "final"}


def on_candidate_rejected(db, candidate: RecruitmentCandidate, previous_status, actor, note: Optional[str] = None) -> bool:
    """HR-HIR-020 instead of the generic status e-mail. Returns False when no letter could be issued (the caller then keeps
    the existing notification so the candidate is still told)."""
    prev = getattr(previous_status, "value", previous_status)
    candidate.stage_reached = STAGE_FROM_STATUS.get(prev, "application")
    candidate.rejection_note = (note or "").strip()[:2000] or None if candidate.stage_reached == "final" else None
    db.commit()
    doc = _try_generate(db, actor or system_actor(db, candidate.organization_id), canonical_id=REJECTION, subject_type="candidate",
                        subject_id=candidate.id, source_ref=_ref("recruitment_candidate", candidate.id), trigger="candidate.rejected",
                        approver_roles=None)
    return doc is not None and doc.status == "ISSUED"


def submit_scorecard(db, actor, interview_id: int, data: dict) -> RecruitmentInterviewFeedback:
    """The interview feedback form as a structured scorecard (HR-HIR-007) and evidence record (HR-HIR-006)."""
    iv = db.get(RecruitmentInterview, interview_id)
    if iv is None or iv.organization_id != actor.organization_id:
        raise HTTPException(404, "Interview not found")
    if not access.is_hr(actor) and iv.interviewer_id != actor.id:
        raise HTTPException(403, "Only the interviewer or HR can submit feedback for this interview.")
    if getattr(iv.status, "value", iv.status) == "cancelled":
        raise HTTPException(409, "A cancelled interview has no feedback.")
    cand = db.get(RecruitmentCandidate, iv.candidate_id) if iv.candidate_id else None
    req = db.get(RecruitmentRequisition, cand.requisition_id) if cand is not None and cand.requisition_id else None
    criteria = {c["key"]: c for c in (getattr(req, "scorecard_criteria", None) or []) if isinstance(c, dict) and c.get("key")}
    scores, weight_sum, total = [], Decimal(0), Decimal(0)
    for s in data.get("scores") or []:
        key = s.get("criterion_key")
        crit = criteria.get(key) if criteria else {"key": key, "label": s.get("label") or key, "weight": 1}
        if crit is None:
            raise HTTPException(422, f"Unknown criterion {key}.")
        score = s.get("score")
        if not isinstance(score, int) or not 1 <= score <= 5:
            raise HTTPException(422, "Each score is a whole number from 1 to 5.")
        if not (s.get("evidence") or "").strip():
            raise HTTPException(422, {"code": "EVIDENCE_REQUIRED", "message": f"Add the evidence for {crit.get('label') or key}."})
        w = Decimal(str(crit.get("weight") or 1))
        weight_sum += w
        total += w * score
        scores.append({"criterion_key": key, "label": crit.get("label") or key, "weight": float(w), "score": score,
                       "evidence": s["evidence"].strip()[:2000]})
    if not scores:
        raise HTTPException(422, "Score at least one criterion.")
    missing = set(criteria) - {s["criterion_key"] for s in scores}
    if missing:
        raise HTTPException(422, {"code": "CRITERIA_MISSING", "message": "Score every criterion of this requisition.", "missing": sorted(missing)})
    rec = data.get("recommendation")
    if rec not in ("proceed", "hold", "do_not_proceed"):
        raise HTTPException(422, "Choose a recommendation.")
    if rec != "proceed" and not (data.get("recommendation_reason") or "").strip():
        raise HTTPException(422, "Give the job-related reason for this recommendation.")
    weighted = (total / weight_sum).quantize(Decimal("0.01"))
    fb = RecruitmentInterviewFeedback(
        interview_id=iv.id, interviewer_id=actor.id, rating=int(round(float(weighted))), organization_id=iv.organization_id,
        feedback=(data.get("evidence_notes") or None), strengths=(data.get("strengths") or None), scores=scores, weighted_total=weighted,
        questions=[q.strip()[:500] for q in (data.get("questions") or []) if isinstance(q, str) and q.strip()][:30] or None,
        evidence_notes=data.get("evidence_notes"), concerns=data.get("concerns"), adjustments_provided=data.get("adjustments_provided"),
        recommendation=rec, recommendation_reason=data.get("recommendation_reason"), stage=data.get("stage"), created_date=datetime.utcnow())
    db.add(fb)
    iv.feedback, iv.rating = (data.get("evidence_notes") or iv.feedback), fb.rating
    if data.get("mark_completed"):
        from app.modules.hr.models import InterviewStatus
        iv.status = InterviewStatus.COMPLETED
    db.commit()
    if cand is not None:
        for cid in (SCORECARD, INTERVIEW_RECORD):
            _try_generate(db, actor, canonical_id=cid, subject_type="candidate", subject_id=cand.id,
                          source_ref=_ref("recruitment_interview_feedback", fb.id), trigger="interview.feedback_submitted")
    return fb


def scorecards_for_requisition(db, actor, req_id: int) -> dict:
    if access.role_of(actor) not in ("admin", "hr_admin", "manager"):
        raise HTTPException(403, "Not allowed")
    req = db.get(RecruitmentRequisition, req_id)
    if req is None or req.organization_id != actor.organization_id:
        raise HTTPException(404, "Requisition not found")
    rows = (db.query(RecruitmentInterviewFeedback, RecruitmentInterview, RecruitmentCandidate)
            .join(RecruitmentInterview, RecruitmentInterview.id == RecruitmentInterviewFeedback.interview_id)
            .join(RecruitmentCandidate, RecruitmentCandidate.id == RecruitmentInterview.candidate_id)
            .filter(RecruitmentCandidate.requisition_id == req.id, RecruitmentInterviewFeedback.weighted_total.isnot(None)).all())
    by_candidate: dict = {}
    for fb, iv, cand in rows:
        entry = by_candidate.setdefault(cand.id, {"candidate_id": cand.id, "candidate_name": cand.name, "scorecards": []})
        entry["scorecards"].append({"feedback_id": fb.id, "interview_id": iv.id, "interviewer_id": fb.interviewer_id,
                                    "weighted_total": float(fb.weighted_total), "recommendation": fb.recommendation, "scores": fb.scores})
    for e in by_candidate.values():
        totals = [s["weighted_total"] for s in e["scorecards"]]
        e["average"] = round(sum(totals) / len(totals), 2) if totals else None
    return {"criteria": req.scorecard_criteria or [], "candidates": sorted(by_candidate.values(), key=lambda e: -(e["average"] or 0))}


# ── HTTP ─────────────────────────────────────────────────────────────────────────────────────────────────────────────

router = APIRouter(prefix="/hr/recruitment", tags=["Recruitment documents"])


class Comment(BaseModel):
    comment: Optional[str] = Field(None, max_length=2000)


class AmendBody(BaseModel):
    changes: dict


class WithdrawBody(BaseModel):
    category: str = Field(..., max_length=30)
    statement: str = Field(..., min_length=1, max_length=4000)
    condition: Optional[str] = Field(None, max_length=300)
    legal_review_completed: Optional[bool] = None


class ScoreItem(BaseModel):
    criterion_key: str = Field(..., max_length=60)
    label: Optional[str] = Field(None, max_length=200)
    score: int
    evidence: str = Field(..., max_length=2000)


class ScorecardBody(BaseModel):
    scores: list[ScoreItem] = Field(..., min_length=1, max_length=30)
    questions: list[str] = Field(default_factory=list, max_length=30)
    evidence_notes: Optional[str] = Field(None, max_length=5000)
    strengths: Optional[str] = Field(None, max_length=3000)
    concerns: Optional[str] = Field(None, max_length=3000)
    adjustments_provided: Optional[str] = Field(None, max_length=2000)
    recommendation: str = Field(..., max_length=20)
    recommendation_reason: Optional[str] = Field(None, max_length=3000)
    stage: Optional[str] = Field(None, max_length=50)
    mark_completed: bool = False


class PrivacySettingsBody(BaseModel):
    privacy_contact_email: Optional[str] = Field(None, max_length=255)
    candidate_data_retention_months: Optional[int] = None
    uses_cv_parsing: Optional[bool] = None
    talent_pool_opt_in_url: Optional[str] = Field(None, max_length=500)
    issue_confirmation_on_clearance: Optional[bool] = None
    offer_letters_without_approval: Optional[bool] = None


class BulkRejectBody(BaseModel):
    candidate_ids: list[int] = Field(..., min_length=1, max_length=200)
    notes: dict[str, str] = Field(default_factory=dict)       # candidate id -> reviewed personal note (final stage only)
    preview: bool = True


def _offer_view(db, offer) -> dict:
    letter = _letter(db, offer)
    cid, blocked = select_offer_template(offer)
    return {"offer_id": offer.id, "status": offer.status.value, "template": cid, "selection_blocked": blocked,
            "approved_by": offer.approved_by, "approved_at": offer.approved_at, "issued_at": offer.issued_at, "accepted_at": offer.accepted_at,
            "decline_reason": offer.decline_reason, "amends_offer_id": offer.amends_offer_id,
            "letter": doc_service.serialize(letter) if letter else None}


@router.get("/privacy-settings")
def get_privacy_settings(db: Session = Depends(get_db), user=Depends(get_current_user)):
    access.require_hr(user)
    return privacy_settings(db, user.organization_id)


@router.put("/privacy-settings")
def put_privacy_settings(body: PrivacySettingsBody, db: Session = Depends(get_db), user=Depends(get_current_user)):
    return save_privacy_settings(db, user, body.model_dump(exclude_unset=True))


@router.get("/offers/{offer_id}/document")
def offer_document(offer_id: int, db: Session = Depends(get_db), user=Depends(get_current_user)):
    access.require_hr(user)
    offer = _offer(db, user, offer_id)
    previous_document_id = offer.document_id
    view = _offer_view(db, offer)
    # Persist legacy-link repair so subsequent issue/signing actions and refreshed pages use this same letter.
    if offer.document_id != previous_document_id:
        db.commit()
    return {**view, **documents_for_source(db, user.organization_id, _ref("recruitment_offer", offer.id))}


@router.get("/offers/{offer_id}/letter/preflight")
def offer_letter_preflight(offer_id: int, db: Session = Depends(get_db), user=Depends(get_current_user)):
    access.require_hr(user)
    return offer_preflight(db, user, _offer(db, user, offer_id))


@router.get("/offers/{offer_id}/letter/readiness")
def offer_letter_readiness_route(offer_id: int, db: Session = Depends(get_db), user=Depends(get_current_user)):
    access.require_hr(user)
    return offer_letter_readiness(db, user, _offer(db, user, offer_id))


@router.get("/offers/{offer_id}/letter/draft-preview")
def offer_letter_draft_preview(offer_id: int, db: Session = Depends(get_db), user=Depends(get_current_user)):
    """Render an unissued starter preview for the supported countries without activating a legal pack.

    This is an ephemeral preview only: it creates no document, approval, or signature record, and cannot be issued.
    Jurisdiction clauses without released text are rendered as explicit placeholders.
    """
    access.require_hr(user)
    offer = _offer(db, user, offer_id)
    cid, blocked = select_offer_template(offer)
    if blocked or not cid or not offer.candidate_id:
        raise HTTPException(409, blocked or "Link the offer to a candidate before previewing the letter.")
    country = (offer.work_country or "").upper()
    if country not in DRAFT_PREVIEW_COUNTRIES:
        raise HTTPException(409, {"code": "DRAFT_PREVIEW_UNAVAILABLE", "message": f"Starter previews are available for {', '.join(sorted(DRAFT_PREVIEW_COUNTRIES))}."})

    from app.core.regions import country_name
    from app.modules.doc_templates import fields, renderer, service, starters
    from app.modules.doc_templates.models import TemplateDefinition
    from app.modules.hr.models import RecruitmentCandidate
    starter = starters.latest(db, cid)
    candidate = db.get(RecruitmentCandidate, offer.candidate_id)
    if starter is None or candidate is None:
        raise HTTPException(404, "Offer letter starter or candidate not found.")
    entity = preflight.resolve_entity(db, user.organization_id, None, offer.employer_entity_id)
    if entity is None:
        # Use the organization's existing profile for preview-only letterhead; never persist this as a legal entity.
        from types import SimpleNamespace
        organization = user.organization
        address = getattr(organization, "address", None)
        entity = SimpleNamespace(
            legal_name=getattr(organization, "organization_name", None) or getattr(organization, "display_name", None) or "Employer name not set",
            trading_name=None, country=country, region=getattr(organization, "state", None), city=getattr(organization, "city", None),
            postal_code=None, address_lines=[address] if address else [], registration_number=None, registration_type=None,
            logo_file=None, email=getattr(organization, "registered_email", None), phone=getattr(organization, "phone", None))
    ctx = fields.FieldContext(db=db, organization=user.organization, subject_type="candidate", subject=candidate,
                              entity=entity, requester=user, canonical_id=cid, source=offer,
                              language="en", sample=False)
    definition = db.get(TemplateDefinition, cid)
    ctx.document = {"date": date.today(), "title": definition.title if definition else cid}
    rules = starter.get("clause_rules") or {}
    required = list(rules.get("mandatory") or [])
    clauses = {}
    packs = preflight.candidate_packs(db, user.organization_id, country, offer.work_region, date.today())
    for key in required + list(rules.get("optional") or []):
        clause = next((found for pack in packs
                       if (found := preflight.find_clause(db, user.organization_id, key, pack.id, "en", date.today()))), None)
        if clause is not None:
            clauses[key] = clause
        elif key in required:
            clauses[key] = type("DraftClause", (), {"text": f"[Draft placeholder: jurisdiction-specific clause '{key}' has not been configured.]"})()
    html = renderer.render_html(service.build_input(
        ctx, blocks=starter.get("content") or [], clauses=clauses, required_clause_keys=required,
        number="DRAFT-PREVIEW", title=ctx.document["title"],
        sensitivity=getattr(definition, "sensitivity", "C2"),
        letterhead_info=service.letterhead(entity, user.organization),
        author=getattr(entity, "legal_name", None) or getattr(user.organization, "organization_name", "")))
    return {"html": html, "preview_only": True, "issuable": False, "jurisdiction": country,
            "jurisdiction_name": country_name(country) or country, "canonical_id": cid,
            "notice": "Unreviewed starter preview. It is not an approved jurisdiction template and cannot be issued."}


@router.post("/offers/{offer_id}/approve")
def approve(offer_id: int, body: Comment, db: Session = Depends(get_db), user=Depends(get_current_user)):
    return _offer_view(db, approve_offer(db, user, _offer(db, user, offer_id), body.comment))


@router.post("/offers/{offer_id}/letter", status_code=201)
def generate_letter(offer_id: int, db: Session = Depends(get_db), user=Depends(get_current_user)):
    generate_offer_letter(db, user, _offer(db, user, offer_id))
    return _offer_view(db, db.get(RecruitmentOffer, offer_id))


@router.post("/offers/{offer_id}/letter/send")
def send_letter(offer_id: int, db: Session = Depends(get_db), user=Depends(get_current_user)):
    send_offer_letter(db, user, _offer(db, user, offer_id))
    return _offer_view(db, db.get(RecruitmentOffer, offer_id))


@router.post("/offers/{offer_id}/letter/resend")
def resend_letter(offer_id: int, db: Session = Depends(get_db), user=Depends(get_current_user)):
    resend_offer_letter(db, user, _offer(db, user, offer_id))
    return _offer_view(db, db.get(RecruitmentOffer, offer_id))


@router.post("/offers/{offer_id}/letter/issue")
def issue_letter(offer_id: int, db: Session = Depends(get_db), user=Depends(get_current_user)):
    send_offer_letter(db, user, _offer(db, user, offer_id))
    return _offer_view(db, db.get(RecruitmentOffer, offer_id))


@router.post("/offers/{offer_id}/amend", status_code=201)
def amend(offer_id: int, body: AmendBody, db: Session = Depends(get_db), user=Depends(get_current_user)):
    out = amend_offer(db, user, _offer(db, user, offer_id), body.changes)
    auto = auto_prepare_offer_letter(db, user, out["offer"].id)
    return {**_offer_view(db, db.get(RecruitmentOffer, out["offer"].id)), "warning": out["warning"], "automatic_letter": auto}


@router.post("/offers/{offer_id}/withdrawal", status_code=201)
def withdraw(offer_id: int, body: WithdrawBody, db: Session = Depends(get_db), user=Depends(get_current_user)):
    doc = request_withdrawal(db, user, _offer(db, user, offer_id), body.model_dump())
    return {**_offer_view(db, db.get(RecruitmentOffer, offer_id)), "withdrawal_document": doc_service.serialize(doc) if doc else None}


@router.post("/offers/{offer_id}/conditions/{index}/clear")
def clear(offer_id: int, index: int, db: Session = Depends(get_db), user=Depends(get_current_user)):
    return _offer_view(db, clear_condition(db, user, _offer(db, user, offer_id), index))


@router.get("/candidates/{candidate_id}/documents-status")
def candidate_documents(candidate_id: int, db: Session = Depends(get_db), user=Depends(get_current_user)):
    access.require_hr(user)
    cand = db.get(RecruitmentCandidate, candidate_id)
    if cand is None or cand.organization_id != user.organization_id:
        raise HTTPException(404, "Candidate not found")
    out = documents_for_source(db, user.organization_id, _ref("recruitment_candidate", cand.id))
    notice = next((d for d in out["documents"] if d["canonical_id"] == PRIVACY_NOTICE and d.get("issued_at")), None)
    out["privacy_notice_sent_at"] = notice["issued_at"] if notice else None
    out["privacy_notice_blocked"] = next((b for b in out["blocked"] if b["canonical_id"] == PRIVACY_NOTICE), None)
    offers = db.query(RecruitmentOffer).filter(RecruitmentOffer.candidate_id == cand.id).all()
    for o in offers:
        out["documents"] += documents_for_source(db, user.organization_id, _ref("recruitment_offer", o.id))["documents"]
    return out


@router.post("/candidates/{candidate_id}/privacy-notice")
def resend_privacy_notice(candidate_id: int, db: Session = Depends(get_db), user=Depends(get_current_user)):
    access.require_hr(user)
    cand = db.get(RecruitmentCandidate, candidate_id)
    if cand is None or cand.organization_id != user.organization_id:
        raise HTTPException(404, "Candidate not found")
    doc = doc_service.generate(db, user, canonical_id=PRIVACY_NOTICE, subject_type="candidate", subject_id=cand.id,
                               source_ref=_ref("recruitment_candidate", cand.id))
    return doc_service.serialize(doc_service.issue(db, doc, user))


@router.post("/candidates/bulk-reject")
def bulk_reject(body: BulkRejectBody, db: Session = Depends(get_db), user=Depends(get_current_user)):
    """Preview (default) runs the rejection letter's preflight for every candidate; confirm rejects them and issues letters."""
    from app.modules.doc_templates import preflight
    from app.modules.hr import recruitment_service
    from app.modules.hr.schemas import CandidateStatusUpdate
    access.require_hr(user)
    results = []
    for cid in body.candidate_ids:
        cand = db.get(RecruitmentCandidate, cid)
        if cand is None or cand.organization_id != user.organization_id:
            results.append({"candidate_id": cid, "outcome": "NOT_FOUND"})
            continue
        if cand.status in (RecruitmentCandidateStatus.HIRED, RecruitmentCandidateStatus.REJECTED):
            results.append({"candidate_id": cid, "outcome": "SKIPPED", "reason": f"already {cand.status.value}"})
            continue
        stage = STAGE_FROM_STATUS.get(cand.status.value, "application")
        if body.preview:
            cand.stage_reached = stage                    # what the rejection would record (rolled back below)
            r = preflight.run_preflight(db, organization_id=user.organization_id, actor=user, canonical_id=REJECTION, subject_type="candidate",
                                        subject_id=cand.id, source_ref=_ref("recruitment_candidate", cand.id), organization=user.organization)
            db.rollback()
            results.append({"candidate_id": cid, "name": cand.name, "stage": stage, "outcome": r.outcome, "reasons": r.reasons})
            continue
        recruitment_service.update_candidate_status(db, cid, CandidateStatusUpdate(status="rejected"), user.organization_id, actor=user,
                                                    note=body.notes.get(str(cid)))
        sent = _doc_for(db, _ref("recruitment_candidate", cid), [REJECTION])
        results.append({"candidate_id": cid, "name": cand.name, "stage": stage, "outcome": "REJECTED",
                        "letter": sent.document_number if sent is not None and sent.status == "ISSUED" else None})
    return {"preview": body.preview, "results": results}


@router.post("/interviews/{interview_id}/scorecard", status_code=201)
def scorecard(interview_id: int, body: ScorecardBody, db: Session = Depends(get_db), user=Depends(get_current_user)):
    fb = submit_scorecard(db, user, interview_id, body.model_dump())
    return {"feedback_id": fb.id, "weighted_total": float(fb.weighted_total), "rating": fb.rating, "recommendation": fb.recommendation,
            **documents_for_source(db, user.organization_id, _ref("recruitment_interview_feedback", fb.id))}


@router.get("/requisitions/{req_id}/scorecards")
def requisition_scorecards(req_id: int, db: Session = Depends(get_db), user=Depends(get_current_user)):
    return scorecards_for_requisition(db, user, req_id)


@router.get("/requisitions/{req_id}/authorization")
def requisition_authorization(req_id: int, db: Session = Depends(get_db), user=Depends(get_current_user)):
    access.require_hr(user)
    req = db.get(RecruitmentRequisition, req_id)
    if req is None or req.organization_id != user.organization_id:
        raise HTTPException(404, "Requisition not found")
    return documents_for_source(db, user.organization_id, _ref("recruitment_requisition", req.id))
