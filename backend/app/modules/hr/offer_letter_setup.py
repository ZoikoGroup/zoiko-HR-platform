"""Set up offer letters for a work country in one guided step (Recruitment → Offer Management → "Set up offer letters").

An organization needs, before any offer letter can be generated for people working in a country: an employing legal entity,
an authorised signatory, its own ACTIVE jurisdiction pack for that country, and the offer templates and their clauses released
in that pack. The template library's normal path asks for three different people (author, approver, releaser) — impossible
for an organization with a single admin.

Here an organization admin reviews the platform's UNCHANGED starter wording and attests it by typing their name. That one
attestation approves and releases it: the HR-DOC-003 approval record, the pack sign-off and every released row carry the
attesting admin, the mode ("STARTER_SINGLE_ADMIN_ATTESTATION") and the starter revision. Only starter wording qualifies —
a template whose mandatory clause has no starter text (internship, fixed-term, withdrawal) is reported as needing the
organization's own wording, which keeps the full review chain in the template library.

GET  /hr/recruitment/offer-letter-setup?country=IN   what exists, what is missing, the prefilled employer details
POST /hr/recruitment/offer-letter-setup               do it (organization admin, typed-name attestation)
"""
from __future__ import annotations

import copy
from datetime import date, datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.core.dependencies import get_current_user
from app.database import get_db
from app.modules.doc_templates import access, content, preflight, starters
from app.modules.doc_templates.models import (AuthorisedSignatory, EmployerEntity, JurisdictionPack, TemplateApprovalRecord,
                                              TemplateClause, TemplateDefinition, TemplateVariant)

router = APIRouter(prefix="/hr/recruitment", tags=["Offer letter setup"])

# the offer letter set (Recruitment → offers): letters by type, amendment, withdrawal, acceptance acknowledgement
OFFER_TEMPLATES = ("HR-HIR-011", "HR-HIR-012", "HR-HIR-014", "HR-HIR-015", "HR-HIR-016", "HR-HIR-017", "HR-HIR-018", "HR-HIR-019")
MODE = "STARTER_SINGLE_ADMIN_ATTESTATION"
SIGNATORY_SCOPE = ["HR-HIR"]
# "activate for every country": an admin's standing attestation. An offer saved by anyone in HR then activates its work
# country from the unchanged starters, recorded under that admin (see standing_attester).
STANDING_KEY = "recruitment.offer_letters_standing_attestation"


def _country_of(org) -> Optional[str]:
    from app.core import regions
    return regions.country_code_strict(getattr(org, "country", None))


def _entity(db, org_id: int) -> Optional[EmployerEntity]:
    return preflight.default_entity(db, org_id)


def _pack(db, org_id: int, country: str) -> Optional[JurisdictionPack]:
    return (db.query(JurisdictionPack).filter(JurisdictionPack.scope_type == "TENANT", JurisdictionPack.owner_organization_id == org_id,
                                              JurisdictionPack.country == country, JurisdictionPack.region.is_(None),
                                              JurisdictionPack.status != "RETIRED")
            .order_by(JurisdictionPack.id.desc()).first())


def _active_variant(db, org_id: int, pack_id: int, cid: str) -> Optional[TemplateVariant]:
    return (db.query(TemplateVariant).filter(TemplateVariant.canonical_id == cid, TemplateVariant.pack_id == pack_id,
                                             TemplateVariant.owner_organization_id == org_id, TemplateVariant.language == "en",
                                             TemplateVariant.status == "ACTIVE").first())


def _people(db, org_id: int) -> list[dict]:
    from app.modules.employee.models import Employee, UserRole
    rows = (db.query(Employee).filter(Employee.organization_id == org_id, Employee.is_active.is_(True),
                                      Employee.role.in_([UserRole.ADMIN, UserRole.HR_ADMIN]))
            .order_by(Employee.first_name, Employee.last_name).all())
    return [{"id": e.id, "name": content._name(e), "role": getattr(e.role, "value", e.role), "job_title": e.job_title} for e in rows]


def _template_plan(db, org_id: int, pack: Optional[JurisdictionPack]) -> list[dict]:
    out = []
    for cid in OFFER_TEMPLATES:
        d = db.get(TemplateDefinition, cid)
        s = starters.latest(db, cid)
        row = {"canonical_id": cid, "title": d.title if d else cid}
        if pack is not None and _active_variant(db, org_id, pack.id, cid) is not None:
            out.append({**row, "state": "released"})
            continue
        if d is None or not d.implemented or s is None:
            out.append({**row, "state": "unavailable", "reason": "This template is not available yet."})
            continue
        needs = [k for k in (s.get("clause_rules") or {}).get("mandatory") or [] if not (starters.starter_clause(db, k) or {}).get("text")
                 and not (pack is not None and preflight.find_clause(db, org_id, k, pack.id, "en", date.today()))]
        if needs:
            out.append({**row, "state": "needs_wording", "clauses": needs,
                        "reason": "Needs your organization's own wording for: " + ", ".join(needs)
                                  + ". Write it in the clause library; it is reviewed by a second admin before release."})
        else:
            out.append({**row, "state": "ready_from_starter"})
    return out


def overview(db, actor, country: Optional[str]) -> dict:
    access.require_hr(actor)
    org = actor.organization
    country = (country or _country_of(org) or "").upper() or None
    entity = _entity(db, actor.organization_id)
    pack = _pack(db, actor.organization_id, country) if country else None
    sigs = []
    if entity is not None:
        sigs = [{"id": s.id, "employee_id": s.employee_id, "title": s.signatory_title}
                for s in db.query(AuthorisedSignatory).filter(AuthorisedSignatory.organization_id == actor.organization_id,
                                                              AuthorisedSignatory.entity_id == entity.id,
                                                              AuthorisedSignatory.status == "active").all()]
    from app.modules.doc_templates import entitlements
    from app.modules.hr.recruitment_documents import offer_letters_without_approval
    d = db.get(TemplateDefinition, "HR-HIR-012")
    missing_plan = [k for k in (entitlements.required_features(d) if d else []) if not preflight.entitled(db, actor.organization_id, k)]
    profile = {
        "legal_name": getattr(org, "organization_name", None) or getattr(org, "display_name", None),
        "country": _country_of(org), "region": getattr(org, "state", None), "city": getattr(org, "city", None),
        "address": getattr(org, "address", None), "tax_id": getattr(org, "tax_number", None),
        "email": getattr(org, "registered_email", None), "phone": getattr(org, "phone", None),
    }
    return {
        "country": country,
        "can_attest": access.role_of(actor) == "admin",
        "attester_name": content._name(actor),                    # the attestation is typed exactly as this
        "attestation_text": content.ATTESTATION_TEXT.format(country=country or "the work country"),
        "entity": ({"id": entity.id, "legal_name": entity.legal_name, "country": entity.country, "region": entity.region,
                    "city": entity.city, "postal_code": entity.postal_code, "address": "\n".join(entity.address_lines or []),
                    "tax_id": entity.tax_id, "registration_number": entity.registration_number, "email": entity.email,
                    "phone": entity.phone} if entity else None),
        "entity_prefill": profile,
        "signatories": sigs,
        "people": _people(db, actor.organization_id),
        "pack": {"id": pack.id, "status": pack.status, "signed_off_by_name": pack.signed_off_by_name,
                 "signed_off_at": pack.signed_off_at} if pack else None,
        "templates": _template_plan(db, actor.organization_id, pack),
        "plan_missing": missing_plan,
        "offers_without_approval": bool(offer_letters_without_approval(db, actor.organization_id)),
        "all_countries": standing(db, actor.organization_id),
    }


# ── the setup ────────────────────────────────────────────────────────────────────────────────────────────────────────

class EntityBody(BaseModel):
    legal_name: str = Field(..., min_length=2, max_length=255)
    country: str = Field(..., min_length=2, max_length=2)
    region: Optional[str] = Field(None, max_length=100)
    city: Optional[str] = Field(None, max_length=100)
    postal_code: Optional[str] = Field(None, max_length=20)
    address: Optional[str] = Field(None, max_length=1000)
    tax_id: Optional[str] = Field(None, max_length=100)
    registration_number: Optional[str] = Field(None, max_length=100)
    email: Optional[str] = Field(None, max_length=255)
    phone: Optional[str] = Field(None, max_length=50)


class SetupBody(BaseModel):
    country: str = Field(..., min_length=2, max_length=2)
    entity: EntityBody
    signatory_employee_id: int
    signatory_title: str = Field(..., min_length=2, max_length=150)
    offers_without_approval: Optional[bool] = None
    all_countries: bool = False
    attestation_accepted: bool
    signed_name: str = Field(..., min_length=2, max_length=200)


def _save_entity(db, actor, body: EntityBody) -> EmployerEntity:
    e = _entity(db, actor.organization_id)
    if e is None:
        e = EmployerEntity(organization_id=actor.organization_id, is_default=True, status="active", created_by=actor.id)
        db.add(e)
    e.legal_name, e.country = body.legal_name.strip(), body.country.upper()
    e.region, e.city, e.postal_code = body.region or None, body.city or None, body.postal_code or None
    e.address_lines = [ln.strip() for ln in (body.address or "").splitlines() if ln.strip()] or None
    e.tax_id, e.registration_number = body.tax_id or None, body.registration_number or None
    e.email, e.phone = body.email or None, body.phone or None
    db.flush()
    return e


def _save_signatory(db, actor, entity: EmployerEntity, employee_id: int, title: str) -> AuthorisedSignatory:
    if not any(p["id"] == employee_id for p in _people(db, actor.organization_id)):
        raise HTTPException(422, "Choose the signatory from your organization's admins and HR admins.")
    s = (db.query(AuthorisedSignatory).filter(AuthorisedSignatory.organization_id == actor.organization_id,
                                              AuthorisedSignatory.entity_id == entity.id, AuthorisedSignatory.employee_id == employee_id,
                                              AuthorisedSignatory.status == "active").first())
    if s is None:
        s = AuthorisedSignatory(organization_id=actor.organization_id, entity_id=entity.id, employee_id=employee_id,
                                authority_scope=list(SIGNATORY_SCOPE), max_risk_level="L2", valid_from=date.today(),
                                approved_by=actor.id, status="active", created_by=actor.id)
        db.add(s)
    else:
        scope = list(s.authority_scope or [])
        if "ALL" not in scope and "HR-HIR" not in scope:
            s.authority_scope = scope + ["HR-HIR"]
    s.signatory_title = title.strip()
    db.flush()
    return s


def _activate_pack(db, actor, country: str, signed_name: str, *, automatic: bool = False) -> JurisdictionPack:
    from app.core import regions
    if not regions.country_name(country):
        raise HTTPException(422, "Choose a valid ISO country code.")
    p = _pack(db, actor.organization_id, country)
    now = datetime.utcnow()
    if p is None:
        p = JurisdictionPack(scope_type="TENANT", owner_organization_id=actor.organization_id, country=country, status="DRAFT",
                             source_references=[], retention_rules={}, requirements={}, created_by=actor.id,
                             notes="Created by the offer letter setup.")
        db.add(p)
    if p.status != "ACTIVE":
        if p.status == "SUSPENDED":
            raise HTTPException(409, "Your organization's pack for this country is suspended. Resume it in Jurisdiction Packs.")
        p.status, p.attested_by = "ACTIVE", actor.id
        p.signed_off_by_name = signed_name
        p.signed_off_by_role = ("Organization admin (offer generation request)" if automatic
                                else f"Organization admin ({MODE})")
        p.signed_off_at, p.effective_from = now, p.effective_from or date.today()
    db.flush()
    return p


def _release_clause(db, actor, pack: JurisdictionPack, key: str, *, automatic: bool = False) -> Optional[TemplateClause]:
    if preflight.find_clause(db, actor.organization_id, key, pack.id, "en", date.today()) is not None:
        return None
    starter = starters.starter_clause(db, key)
    if not (starter or {}).get("text"):
        return None
    from app.modules.doc_templates import blocks
    last = (db.query(TemplateClause).filter(TemplateClause.clause_key == key, TemplateClause.pack_id == pack.id,
                                            TemplateClause.owner_organization_id == actor.organization_id,
                                            TemplateClause.language == "en").order_by(TemplateClause.version.desc()).first())
    c = TemplateClause(clause_key=key, pack_id=pack.id, owner_organization_id=actor.organization_id, language="en",
                       version=(last.version + 1) if last else 1, status="ACTIVE", title=starter.get("title"), text=starter["text"],
                       source_references=[{"source": "platform starter", "revision": starter.get("revision")}],
                       effective_from=date.today(), authored_by=None, reviewed_by=actor.id, released_by=actor.id,
                       change_reason=(f"Unchanged platform starter provisioned at offer generation request by {content._name(actor)}"
                                      if automatic else f"Starter wording attested by {content._name(actor)} ({MODE})"),
                       previous_version_id=last.id if last else None)
    c.checksum = blocks.checksum(c.clause_key, c.text, c.language)
    db.add(c)
    db.flush()
    return c


def _release_template(db, actor, pack: JurisdictionPack, cid: str, signed_name: str, ip: Optional[str], *,
                      automatic: bool = False, cross_border_from: Optional[str] = None) -> TemplateVariant:
    from app.modules.doc_templates import governance, storage
    d = db.get(TemplateDefinition, cid)
    if not preflight.tenant_attestation_allowed(db, actor.organization_id, d.legal_risk):
        raise HTTPException(403, {"code": "TENANT_ATTESTATION_DISABLED",
                                  "message": "Your plan or settings do not allow organization-approved templates for this risk level."})
    seed = starters.latest(db, cid)
    lineage = (db.query(TemplateVariant).filter(TemplateVariant.canonical_id == cid, TemplateVariant.pack_id == pack.id,
                                                TemplateVariant.owner_organization_id == actor.organization_id,
                                                TemplateVariant.language == "en").order_by(TemplateVariant.version).all())
    now = datetime.utcnow()
    applicability = copy.deepcopy(seed.get("applicability") or {})
    if cross_border_from and cross_border_from != pack.country:
        allowed = list(applicability.get("cross_border_from") or [])
        if cross_border_from not in allowed:
            allowed.append(cross_border_from)
        applicability["cross_border_from"] = allowed
    v = TemplateVariant(
        canonical_id=cid, pack_id=pack.id, owner_organization_id=actor.organization_id, language="en",
        version=(lineage[-1].version + 1) if lineage else 1, status="LEGAL_APPROVED", release_mode="TENANT_ATTESTED",
        applicability=applicability or None, content=copy.deepcopy(seed["content"]),
        field_contract=copy.deepcopy(seed["field_contract"]), clause_rules=copy.deepcopy(seed["clause_rules"]),
        options=copy.deepcopy(seed.get("options") or {}), authored_by=None, reviewed_by=actor.id,
        previous_version_id=lineage[-1].id if lineage else None, status_changed_at=now, starter_revision=seed.get("revision"),
        change_reason=(f"Unchanged platform starter (revision {seed.get('revision')}) provisioned for {pack.country} at offer generation"
                      if automatic else f"Unchanged platform starter (revision {seed.get('revision')}) attested for {pack.country}"))
    v.checksum = content.variant_checksum(v)
    db.add(v)
    db.flush()
    problems = content.release_test(db, v)
    if problems:
        raise HTTPException(422, {"code": "RELEASE_TEST_FAILED", "template": cid, "problems": problems})
    clauses = [preflight.find_clause(db, actor.organization_id, k, pack.id, "en", date.today())
               for k in (v.clause_rules or {}).get("mandatory") or []]
    review = {"reviewer_name": content._name(actor),
              "reviewer_role": "Organization admin (offer generation request)" if automatic else "Organization admin",
              "reviewer_firm": getattr(actor.organization, "organization_name", ""),
              "qualification_statement": ("Automated attestation of unchanged starter wording requested by offer generation"
                                           if automatic else f"Tenant attestation of unchanged starter wording ({MODE})"),
              "date": now.date().isoformat(), "attestation": content.ATTESTATION_TEXT.format(country=pack.country),
              "attested_by": actor.id, "signed_name": signed_name, "signed_at": now.isoformat(),
              "mode": "OFFER_GENERATION_REQUEST" if automatic else MODE,
              "attestation_method": "offer_generation_request" if automatic else "typed_name",
              "starter_revision": seed.get("revision")}
    v.legal_review = review
    rec = TemplateApprovalRecord(owner_organization_id=actor.organization_id, variant_id=v.id, variant_checksum=v.checksum,
                                 reviewer_id=actor.id, review=review,
                                 signed_name_typed=None if automatic else signed_name, ip_address=ip, created_at=now)
    pdf = governance.to_pdf(governance.approval_record(db, v, review, clauses=[c for c in clauses if c]), actor.organization)
    rec.record_pdf_sha256 = content.service_sha(pdf)
    rec.record_pdf_path = storage.get_store().put(actor.organization_id, f"HR-DOC-003-v{v.id}-{rec.record_pdf_sha256[:12]}.pdf", pdf)
    db.add(rec)
    for p in lineage:
        if p.status in ("ACTIVE", "SUSPENDED"):
            content._withdraw(db, actor, p, "RETIRED", f"Superseded by version {v.version}", new=v, action="SUPERSEDED")
    v.status, v.status_changed_at, v.released_by, v.effective_from = "ACTIVE", datetime.utcnow(), actor.id, date.today()
    db.flush()
    return v


def standing(db, org_id: int) -> Optional[dict]:
    import json
    from app.modules.hr.models import OrganizationConfig
    row = db.query(OrganizationConfig).filter(OrganizationConfig.organization_id == org_id, OrganizationConfig.key == STANDING_KEY).first()
    try:
        return json.loads(row.value) if row and row.value else None
    except ValueError:
        return None


def _save_standing(db, actor, signed_name: str) -> None:
    import json
    from app.modules.hr.models import OrganizationConfig
    row = db.query(OrganizationConfig).filter(OrganizationConfig.organization_id == actor.organization_id,
                                              OrganizationConfig.key == STANDING_KEY).first()
    if row is None:
        row = OrganizationConfig(organization_id=actor.organization_id, key=STANDING_KEY, category="recruitment",
                                 description="Offer letters: standing attestation of unchanged starter wording for every country")
        db.add(row)
    row.value = json.dumps({"by": actor.id, "name": signed_name, "at": datetime.utcnow().isoformat(), "mode": MODE})
    db.flush()


def standing_attester(db, actor):
    """Return only the active admin who explicitly saved a standing attestation.

    An admin's offer-generation request by itself is not consent to attest jurisdiction-specific legal wording.
    """
    if actor is None:
        return None
    att = standing(db, actor.organization_id)
    if not att:
        return None
    from app.modules.employee.models import Employee
    admin = db.get(Employee, att.get("by"))
    if admin is None or not admin.is_active or admin.organization_id != actor.organization_id or access.role_of(admin) != "admin":
        return None
    return admin


def run_setup(db, actor, body: SetupBody, ip: Optional[str] = None) -> dict:
    access.require_org_admin(actor)
    if not body.attestation_accepted:
        raise HTTPException(422, "Confirm the attestation to set up offer letters.")
    if not content.blocks_mod_same_name(body.signed_name, content._name(actor)):
        raise HTTPException(422, {"code": "NAME_MISMATCH", "message": "Type your full name exactly as it appears on your profile."})
    country = body.country.upper()
    released, clauses_released, skipped = [], [], []
    try:
        entity = _save_entity(db, actor, body.entity)
        _save_signatory(db, actor, entity, body.signatory_employee_id, body.signatory_title)
        pack = _activate_pack(db, actor, country, body.signed_name)
        for t in _template_plan(db, actor.organization_id, pack):
            if t["state"] != "ready_from_starter":
                if t["state"] != "released":
                    skipped.append(t)
                continue
            seed = starters.latest(db, t["canonical_id"])
            for key in ((seed.get("clause_rules") or {}).get("mandatory") or []) + ((seed.get("clause_rules") or {}).get("optional") or []):
                c = _release_clause(db, actor, pack, key)
                if c is not None:
                    clauses_released.append(key)
            _release_template(db, actor, pack, t["canonical_id"], body.signed_name, ip)
            released.append(t["canonical_id"])
        if body.all_countries:
            _save_standing(db, actor, body.signed_name)
        if body.offers_without_approval is not None:
            from app.modules.hr.recruitment_documents import save_privacy_settings
            db.flush()
            save_privacy_settings(db, actor, {"offer_letters_without_approval": bool(body.offers_without_approval)})
        db.commit()
    except Exception:
        db.rollback()
        raise
    from app.modules.doc_templates import hooks
    for cid in released:
        v = _active_variant(db, actor.organization_id, pack.id, cid)
        try:
            hooks.send(db, "variant_released", actor, v, None)
        except Exception:                       # a listener never undoes a committed release
            pass
    return {"released": released, "clauses_released": clauses_released, "skipped": skipped, **overview(db, actor, country)}


def provision_offer_starters_on_generation(db, actor, offer, canonical_id: str) -> list[str]:
    """Provision unchanged starter records as part of an explicit offer-generation request.

    This is the automatic counterpart to the guided setup panel. It requires the same plan/settings entitlement,
    an existing complete employer entity, an authorized signatory, and an organization admin making the request.
    The approval evidence records the generation request (not a typed-name signature).
    """
    actor = standing_attester(db, actor)
    if actor is None:
        return []
    from app.modules.doc_templates.approvals import eligible_signatories
    from app.modules.doc_templates.models import TemplateDefinition
    from app.modules.doc_templates import hooks
    from app.modules.hr.recruitment_documents import select_offer_template

    cid, blocked = select_offer_template(offer)
    if blocked or cid != canonical_id or not offer.work_country:
        return []
    country = offer.work_country.upper()
    entity = preflight.resolve_entity(db, actor.organization_id, None, offer.employer_entity_id)
    if entity is None or not entity.legal_name or not entity.country:
        return []
    definition = db.get(TemplateDefinition, cid)
    if definition is None or not preflight.tenant_attestation_allowed(db, actor.organization_id, definition.legal_risk):
        return []
    if not eligible_signatories(db, actor.organization_id, entity.id, cid, definition.family_id, definition.legal_risk, set()):
        return []

    pack = _pack(db, actor.organization_id, country)
    if pack is not None and pack.status == "SUSPENDED":
        return []
    if pack is None:
        pack = _activate_pack(db, actor, country, content._name(actor), automatic=True)
    elif pack.status != "ACTIVE":
        pack = _activate_pack(db, actor, country, content._name(actor), automatic=True)

    cross_border_from = entity.country if entity.country != country else None
    released: list[str] = []
    targets = list(dict.fromkeys((cid, "HR-HIR-019")))
    for template_id in targets:
        seed = starters.latest(db, template_id)
        if not seed:
            continue
        rules = seed.get("clause_rules") or {}
        mandatory = rules.get("mandatory") or []
        # A template with jurisdiction wording that has no starter text still needs the guided wording workflow.
        if any(not (starters.starter_clause(db, key) or {}).get("text")
               and preflight.find_clause(db, actor.organization_id, key, pack.id, "en", date.today()) is None
               for key in mandatory):
            continue
        for key in mandatory + (rules.get("optional") or []):
            _release_clause(db, actor, pack, key, automatic=True)
        existing = _active_variant(db, actor.organization_id, pack.id, template_id)
        cross_border_allowed = (not cross_border_from or cross_border_from in
                                ((existing.applicability or {}).get("cross_border_from") or [])) if existing else False
        if existing is not None and cross_border_allowed:
            continue
        if template_id != cid and existing is not None and not cross_border_from:
            continue
        if existing is not None and not cross_border_from:
            continue
        if template_id != cid and existing is None:
            target_definition = db.get(TemplateDefinition, template_id)
            if target_definition is None or not preflight.tenant_attestation_allowed(db, actor.organization_id, target_definition.legal_risk):
                continue
        _release_template(db, actor, pack, template_id, content._name(actor), None, automatic=True,
                          cross_border_from=cross_border_from)
        released.append(template_id)

    db.commit()
    for template_id in released:
        variant = _active_variant(db, actor.organization_id, pack.id, template_id)
        try:
            hooks.send(db, "variant_released", actor, variant, None)
        except Exception:
            pass
    return released


def can_auto_provision_offer_starters(db, actor, offer, canonical_id: str) -> bool:
    """Whether generation can complete setup from existing, unchanged starter wording."""
    actor = standing_attester(db, actor)
    if actor is None or not offer.work_country:
        return False
    from app.modules.doc_templates.approvals import eligible_signatories
    from app.modules.doc_templates.models import TemplateDefinition
    from app.modules.hr.recruitment_documents import select_offer_template
    cid, blocked = select_offer_template(offer)
    if blocked or cid != canonical_id:
        return False
    entity = preflight.resolve_entity(db, actor.organization_id, None, offer.employer_entity_id)
    if entity is None or not entity.legal_name or not entity.country:
        return False
    definition = db.get(TemplateDefinition, cid)
    if definition is None or not preflight.tenant_attestation_allowed(db, actor.organization_id, definition.legal_risk):
        return False
    if not eligible_signatories(db, actor.organization_id, entity.id, cid, definition.family_id, definition.legal_risk, set()):
        return False
    pack = _pack(db, actor.organization_id, offer.work_country.upper())
    if pack is not None and pack.status == "SUSPENDED":
        return False
    seed = starters.latest(db, cid)
    if not seed:
        return False
    for key in (seed.get("clause_rules") or {}).get("mandatory") or []:
        if (starters.starter_clause(db, key) or {}).get("text"):
            continue
        if pack is None or preflight.find_clause(db, actor.organization_id, key, pack.id, "en", date.today()) is None:
            return False
    return True


@router.get("/offer-letter-setup")
def get_setup(country: Optional[str] = Query(None, min_length=2, max_length=2), db: Session = Depends(get_db),
              user=Depends(get_current_user)):
    return overview(db, user, country)


@router.post("/offer-letter-setup")
def post_setup(body: SetupBody, request: Request, db: Session = Depends(get_db), user=Depends(get_current_user)):
    from app.core.client_ip import get_client_ip
    return run_setup(db, user, body, ip=get_client_ip(request))
