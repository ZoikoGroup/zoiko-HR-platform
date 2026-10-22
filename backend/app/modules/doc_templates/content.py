"""Template content lifecycle: variants (HR-DOC-004), clauses, jurisdiction packs, approvals (HR-DOC-003) and withdrawals
(HR-DOC-018).

    IN_DRAFT → LEGAL_REVIEW → LEGAL_APPROVED → RELEASE_TESTED → ACTIVE → SUSPENDED / RETIRED

* Author ≠ legal reviewer ≠ releaser, always (three different people).
* Content, field contract and clause rules freeze when a variant leaves IN_DRAFT (models._frozen_content); an edit is a new
  version in the same lineage (canonical_id + pack + owner + language).
* Tenants work in TENANT_ATTESTED mode only, on their own TENANT packs. Platform (PLATFORM_COUNSEL) content is loaded by Zoiko
  Legal through scripts/doc_templates_platform_content.py and is read-only to tenants.
* Releasing a new version retires the previous ACTIVE one (HR-DOC-018, action SUPERSEDED). Issued documents never change.
"""
from __future__ import annotations

import copy
from datetime import date, datetime
from typing import Optional

from fastapi import HTTPException
from sqlalchemy import func, or_

from app.modules.doc_templates import access, approvals, blocks, fields, governance, notify, preflight, registry, renderer, resolver, starters, state, storage
from app.modules.doc_templates.entities import normalise_region
from app.modules.doc_templates.models import (GeneratedDocument, JurisdictionPack, TemplateApprovalRecord, TemplateClause,
                                              TemplateDefinition, TemplateSupersession, TemplateVariant)

ATTESTATION_TEXT = "We have reviewed this template for use in {country} and accept responsibility for its content."


# ── visibility ───────────────────────────────────────────────────────────────────────────────────────────────────────

def visible(model, organization_id: int):
    return or_(model.owner_organization_id == organization_id, model.owner_organization_id.is_(None))


def get_variant(db, organization_id: int, variant_id: int) -> TemplateVariant:
    v = db.query(TemplateVariant).filter(TemplateVariant.id == variant_id, visible(TemplateVariant, organization_id)).first()
    if v is None:
        raise HTTPException(404, "Template variant not found")
    return v


def own_variant(db, organization_id: int, variant_id: int) -> TemplateVariant:
    v = get_variant(db, organization_id, variant_id)
    if v.owner_organization_id != organization_id:
        raise HTTPException(403, "Platform template content is read-only. Create your organization's own version instead.")
    return v


def get_pack(db, organization_id: int, pack_id: int) -> JurisdictionPack:
    p = db.query(JurisdictionPack).filter(JurisdictionPack.id == pack_id, visible(JurisdictionPack, organization_id)).first()
    if p is None:
        raise HTTPException(404, "Jurisdiction pack not found")
    return p


def get_clause(db, organization_id: int, clause_id: int) -> TemplateClause:
    c = db.query(TemplateClause).filter(TemplateClause.id == clause_id, visible(TemplateClause, organization_id)).first()
    if c is None:
        raise HTTPException(404, "Clause not found")
    return c


def _name(person) -> str:
    return f"{getattr(person, 'first_name', '')} {getattr(person, 'last_name', '')}".strip()


def _people(db, organization_id, roles, exclude=()):
    from app.modules.employee.models import Employee, UserRole
    return db.query(Employee).filter(Employee.organization_id == organization_id, Employee.role.in_([UserRole(r) for r in roles]),
                                     Employee.is_active.is_(True), Employee.id.notin_(list(exclude) or [-1])).all()


# ── jurisdiction packs ───────────────────────────────────────────────────────────────────────────────────────────────

def create_pack(db, actor, data: dict) -> JurisdictionPack:
    access.require_hr(actor)
    from app.core import regions
    country = (data.get("country") or "").upper()
    if not regions.country_name(country):
        raise HTTPException(422, "Choose a valid ISO country code.")
    p = JurisdictionPack(scope_type="TENANT", owner_organization_id=actor.organization_id, country=country,
                         region=normalise_region(country, data.get("region")), status="DRAFT", effective_from=data.get("effective_from"),
                         effective_to=data.get("effective_to"), source_references=data.get("source_references") or [],
                         retention_rules=data.get("retention_rules") or {}, requirements=_requirements(data.get("requirements")),
                         notes=data.get("notes"), created_by=actor.id)
    db.add(p)
    db.commit()
    return p


def update_pack(db, actor, pack: JurisdictionPack, data: dict) -> JurisdictionPack:
    _own_pack(actor, pack)
    if pack.status != "DRAFT":
        raise HTTPException(409, "Only a draft pack can be edited.")
    if "region" in data:
        pack.region = normalise_region(pack.country, data["region"])
    for key in ("effective_from", "effective_to", "source_references", "retention_rules", "notes"):
        if key in data:
            setattr(pack, key, data[key])
    if "requirements" in data:
        pack.requirements = _requirements(data["requirements"])
    db.commit()
    return pack


PACK_REQUIREMENTS = ("collect_nationality", "collect_national_identifier", "collect_tax_identifier", "collect_social_security_number")


def _requirements(value) -> dict:
    value = value or {}
    unknown = set(value) - set(PACK_REQUIREMENTS)
    if unknown:
        raise HTTPException(422, f"Unknown requirement: {sorted(unknown)}")
    return {k: bool(v) for k, v in value.items()}


def _own_pack(actor, pack):
    access.require_hr(actor)
    if pack.scope_type != "TENANT" or pack.owner_organization_id != actor.organization_id:
        raise HTTPException(403, "Platform jurisdiction packs are read-only.")


def submit_pack(db, actor, pack: JurisdictionPack) -> JurisdictionPack:
    _own_pack(actor, pack)
    if pack.status != "DRAFT":
        raise HTTPException(409, "Only a draft pack can be submitted.")
    pack.status = "LEGAL_REVIEW"
    db.commit()
    return pack


def activate_pack(db, actor, pack: JurisdictionPack, attestation: dict) -> JurisdictionPack:
    """A tenant pack becomes ACTIVE when an organization admin other than its creator attests it."""
    _own_pack(actor, pack)
    access.require_org_admin(actor)
    if pack.status != "LEGAL_REVIEW":
        raise HTTPException(409, "Submit the pack for review first.")
    if actor.id == pack.created_by:
        raise HTTPException(403, {"code": "SEPARATION_OF_DUTIES", "message": "The person who created the pack cannot activate it."})
    if not attestation.get("accepted"):
        raise HTTPException(422, "Confirm the attestation to activate the pack.")
    pack.status = "ACTIVE"
    pack.attested_by = actor.id
    pack.signed_off_by_name = attestation.get("name") or _name(actor)
    pack.signed_off_by_role = attestation.get("role") or "Organization admin"
    pack.signed_off_firm = attestation.get("firm")
    pack.signed_off_at = datetime.utcnow()
    pack.effective_from = pack.effective_from or date.today()
    db.commit()
    return pack


def change_pack_status(db, actor, pack: JurisdictionPack, target: str) -> JurisdictionPack:
    _own_pack(actor, pack)
    allowed = {"ACTIVE": {"SUSPENDED", "RETIRED"}, "SUSPENDED": {"ACTIVE", "RETIRED"}, "DRAFT": {"RETIRED"}, "LEGAL_REVIEW": {"DRAFT", "RETIRED"}}
    if target not in allowed.get(pack.status, set()):
        raise HTTPException(409, f"A pack in status {pack.status} cannot move to {target}.")
    if target == "ACTIVE":
        access.require_org_admin(actor)
    pack.status = target
    db.commit()
    return pack


# ── variants ─────────────────────────────────────────────────────────────────────────────────────────────────────────

def _lineage(db, v_or_key) -> list[TemplateVariant]:
    canonical_id, pack_id, owner, language = v_or_key
    return (db.query(TemplateVariant)
            .filter(TemplateVariant.canonical_id == canonical_id, TemplateVariant.pack_id == pack_id,
                    TemplateVariant.language == language,
                    (TemplateVariant.owner_organization_id == owner) if owner is not None else TemplateVariant.owner_organization_id.is_(None))
            .order_by(TemplateVariant.version).all())


def _key(v: TemplateVariant):
    return (v.canonical_id, v.pack_id, v.owner_organization_id, v.language)


def base_content(db, v: TemplateVariant) -> list:
    """The content a draft started from (its previous version, else the starter): locked blocks are checked against it."""
    if v.previous_version_id:
        prev = db.get(TemplateVariant, v.previous_version_id)
        if prev is not None:
            return prev.content
    starter = starters.latest(db, v.canonical_id)
    return starter["content"] if starter else []


def create_tenant_variant(db, actor, *, canonical_id: str, pack_id: int, language: str = "en",
                          from_variant_id: Optional[int] = None) -> TemplateVariant:
    access.require_hr(actor)
    org_id = actor.organization_id
    d = db.get(TemplateDefinition, canonical_id)
    if d is None:
        raise HTTPException(404, "Template not found")
    if canonical_id in registry.SYSTEM_RECORDS:
        raise HTTPException(409, "Governance records are produced by the engine and have no editable content.")
    if not d.implemented:
        raise HTTPException(409, {"code": "NOT_IMPLEMENTED", "message": "This template is not available yet."})
    pack = get_pack(db, org_id, pack_id)
    if pack.scope_type != "TENANT" or pack.owner_organization_id != org_id:
        raise HTTPException(409, "Organization templates live in your own jurisdiction pack. Create one for this country first.")
    if pack.status == "RETIRED":
        raise HTTPException(409, "This jurisdiction pack is retired.")
    if not preflight.tenant_attestation_allowed(db, org_id, d.legal_risk):
        raise HTTPException(403, {"code": "TENANT_ATTESTATION_DISABLED",
                                  "message": "Your plan or settings do not allow organization-approved templates for this risk level."})
    key = (canonical_id, pack.id, org_id, language)
    lineage = _lineage(db, key)
    if any(v.status in ("IN_DRAFT", "LEGAL_REVIEW", "LEGAL_APPROVED", "RELEASE_TESTED") for v in lineage):
        raise HTTPException(409, "A version of this template is already in progress. Finish or retire it first.")
    if from_variant_id:
        src = get_variant(db, org_id, from_variant_id)
        if src.canonical_id != canonical_id:
            raise HTTPException(422, "The source variant is for a different template.")
        seed = {"content": src.content, "field_contract": src.field_contract, "clause_rules": src.clause_rules,
                "options": src.options or {}, "applicability": src.applicability}
    elif lineage:
        last = lineage[-1]
        seed = {"content": last.content, "field_contract": last.field_contract, "clause_rules": last.clause_rules,
                "options": last.options or {}, "applicability": last.applicability}
    elif starters.latest(db, canonical_id) is not None:
        seed = starters.latest(db, canonical_id)
    else:
        raise HTTPException(409, {"code": "NO_STARTER_CONTENT", "message": "No starter content exists for this template yet."})
    v = TemplateVariant(
        canonical_id=canonical_id, pack_id=pack.id, owner_organization_id=org_id, language=language,
        version=(lineage[-1].version + 1) if lineage else 1, status="IN_DRAFT", release_mode="TENANT_ATTESTED",
        applicability=copy.deepcopy(seed.get("applicability")), content=copy.deepcopy(seed["content"]),
        field_contract=copy.deepcopy(seed["field_contract"]), clause_rules=copy.deepcopy(seed["clause_rules"]),
        options=copy.deepcopy(seed.get("options") or {}), authored_by=actor.id,
        previous_version_id=lineage[-1].id if lineage else None, status_changed_at=datetime.utcnow(),
        starter_revision=seed.get("revision") if not from_variant_id and not lineage else None)
    v.checksum = variant_checksum(v)
    db.add(v)
    db.commit()
    return v


def variant_checksum(v: TemplateVariant) -> str:
    return blocks.checksum(v.content, v.field_contract, v.clause_rules, v.applicability, v.options, v.language)


def validate_variant(db, v: TemplateVariant, content=None, field_contract=None, clause_rules=None) -> list[str]:
    content = v.content if content is None else content
    field_contract = v.field_contract if field_contract is None else field_contract
    clause_rules = v.clause_rules if clause_rules is None else clause_rules
    problems = blocks.validate_content(content, field_contract, clause_rules)
    problems += blocks.locked_blocks_preserved(base_content(db, v), content)
    return problems


def update_variant(db, actor, v: TemplateVariant, data: dict) -> TemplateVariant:
    access.require_hr(actor)
    if v.owner_organization_id != actor.organization_id:
        raise HTTPException(403, "Platform template content is read-only.")
    if v.status != "IN_DRAFT":
        raise HTTPException(409, "Only a draft can be edited. Create a new version to change released content.")
    content = data.get("content", v.content)
    fc = data.get("field_contract", v.field_contract)
    cr = data.get("clause_rules", v.clause_rules)
    problems = validate_variant(db, v, content, fc, cr)
    if data.get("applicability") is not None and not isinstance(data["applicability"], dict):
        problems.append("applicability must be an object")
    if problems:
        raise HTTPException(422, {"code": "INVALID_TEMPLATE", "problems": problems})
    v.content, v.field_contract, v.clause_rules = content, fc, cr
    for key in ("applicability", "options", "effective_from", "effective_to", "change_reason", "change_summary"):
        if key in data:
            setattr(v, key, data[key])
    if "minor_change" in data:
        if data["minor_change"] and v.previous_version_id is None:
            raise HTTPException(422, "The first version of a template cannot be a minor change.")
        v.minor_change = bool(data["minor_change"])
    v.authored_by = v.authored_by or actor.id
    v.checksum = variant_checksum(v)
    db.commit()
    return v


def submit_variant(db, actor, v: TemplateVariant) -> TemplateVariant:
    access.require_hr(actor)
    if v.owner_organization_id != actor.organization_id:
        raise HTTPException(403, "Platform template content is read-only.")
    if v.status != "IN_DRAFT":
        raise HTTPException(409, "Only a draft can be submitted for review.")
    problems = validate_variant(db, v)
    if problems:
        raise HTTPException(422, {"code": "INVALID_TEMPLATE", "problems": problems})
    if not (v.change_reason or "").strip():
        raise HTTPException(422, "Describe what changed in this version before submitting it.")
    v.checksum = variant_checksum(v)
    v.status, v.status_changed_at = "LEGAL_REVIEW", datetime.utcnow()
    db.commit()
    pack = db.get(JurisdictionPack, v.pack_id)
    reviewers = _people(db, actor.organization_id, ["admin"], exclude=[actor.id])
    notify.variant_review(db, v, reviewers, actor, "legal review", f"{pack.country}{('-' + pack.region) if pack.region else ''}")
    return v


def _is_signatory(db, actor, canonical_id, family_id, risk) -> bool:
    from app.modules.doc_templates.models import AuthorisedSignatory
    sigs = db.query(AuthorisedSignatory).filter(AuthorisedSignatory.organization_id == actor.organization_id,
                                                AuthorisedSignatory.employee_id == actor.id).all()
    return any(approvals.signatory_covers(s, canonical_id, family_id, risk) for s in sigs)


def approve_legal(db, actor, v: TemplateVariant, review: dict, *, ip: Optional[str] = None) -> TemplateApprovalRecord:
    """LEGAL_REVIEW → LEGAL_APPROVED, with the HR-DOC-003 record. For a tenant variant this is the tenant's attestation."""
    if v.owner_organization_id != actor.organization_id:
        raise HTTPException(403, "Platform template content is read-only.")
    if v.status != "LEGAL_REVIEW":
        raise HTTPException(409, "This version is not waiting for legal review.")
    d = db.get(TemplateDefinition, v.canonical_id)
    if access.role_of(actor) != "admin" and not _is_signatory(db, actor, d.canonical_id, d.family_id, d.legal_risk):
        raise HTTPException(403, "Only an organization admin or an authorised signatory can approve template content.")
    if actor.id == v.authored_by:
        raise HTTPException(403, {"code": "SEPARATION_OF_DUTIES", "message": "You cannot approve a template version you authored."})
    pack = db.get(JurisdictionPack, v.pack_id)
    review = dict(review or {})
    if not review.get("attestation_accepted"):
        raise HTTPException(422, "Confirm the attestation: " + ATTESTATION_TEXT.format(country=pack.country))
    if d.legal_risk == "L3":
        missing = [k for k in ("counsel_name", "counsel_firm", "counsel_qualification", "review_date") if not review.get(k)]
        if missing:
            raise HTTPException(422, {"code": "COUNSEL_DETAILS_REQUIRED", "missing": missing,
                                      "message": "L3 templates need the name, firm, qualification and review date of your legal counsel."})
    if not blocks_mod_same_name(review.get("signed_name"), _name(actor)):
        raise HTTPException(422, {"code": "NAME_MISMATCH", "message": "Type your full name exactly as it appears on your profile."})
    clauses = []
    for key in (v.clause_rules or {}).get("mandatory") or []:
        c = preflight.find_clause(db, actor.organization_id, key, v.pack_id, v.language, date.today())
        if c is None:
            raise HTTPException(409, {"code": f"CLAUSE_UNRESOLVED:{key}", "message": f"Mandatory clause {key} has no ACTIVE text in this pack."})
        clauses.append(c)
    now = datetime.utcnow()
    record_review = {
        "reviewer_name": review.get("counsel_name") or _name(actor),
        "reviewer_role": review.get("reviewer_role") or ("Legal counsel" if review.get("counsel_name") else "Organization admin"),
        "reviewer_firm": review.get("counsel_firm") or getattr(actor.organization, "organization_name", ""),
        "qualification_statement": review.get("counsel_qualification") or review.get("qualification_statement")
        or "Tenant attestation (TENANT_ATTESTED release mode)",
        "date": review.get("review_date") or now.date().isoformat(), "conditions": review.get("conditions"),
        "sources": [s for s in (review.get("sources") or []) if isinstance(s, dict)][:50],
        "attestation": ATTESTATION_TEXT.format(country=pack.country), "attested_by": actor.id,
        "signed_name": review.get("signed_name"), "signed_at": now.isoformat(),
    }
    v.reviewed_by = actor.id
    v.legal_review = record_review
    v.status, v.status_changed_at = "LEGAL_APPROVED", now
    rec = TemplateApprovalRecord(owner_organization_id=v.owner_organization_id, variant_id=v.id, variant_checksum=v.checksum,
                                 reviewer_id=actor.id, review=record_review, signed_name_typed=review.get("signed_name"),
                                 ip_address=ip, created_at=now)
    pdf = governance.to_pdf(governance.approval_record(db, v, record_review, clauses=clauses), actor.organization)
    rec.record_pdf_sha256 = service_sha(pdf)
    rec.record_pdf_path = storage.get_store().put(actor.organization_id, f"HR-DOC-003-v{v.id}-{rec.record_pdf_sha256[:12]}.pdf", pdf)
    db.add(rec)
    db.commit()
    releasers = _people(db, actor.organization_id, ["admin"], exclude=[actor.id, v.authored_by or -1])
    notify.variant_review(db, v, releasers, actor, "release approval", f"{pack.country}{('-' + pack.region) if pack.region else ''}")
    return rec


def blocks_mod_same_name(a, b) -> bool:
    norm = lambda s: " ".join((s or "").casefold().split())
    return bool(norm(a)) and norm(a) == norm(b)


def service_sha(data: bytes) -> str:
    import hashlib
    return hashlib.sha256(data).hexdigest()


def release_test(db, v: TemplateVariant) -> list[str]:
    """Release test: validates again and renders the variant with synthetic sample data (never a real person)."""
    problems = validate_variant(db, v)
    if problems:
        return problems
    from app.modules.hr.models import Organization
    sample_org = Organization(id=0, organization_name="Example Organisation", display_name="Example Organisation", currency="GBP")
    ctx = fields.FieldContext(db=db, organization=sample_org, language=v.language, sample=True)
    clauses = {}
    for key in ((v.clause_rules or {}).get("mandatory") or []) + ((v.clause_rules or {}).get("optional") or []):
        c = preflight.find_clause(db, v.owner_organization_id or -1, key, v.pack_id, v.language, date.today())
        if c is not None:
            clauses[key] = c
    try:
        from app.modules.doc_templates.service import build_input
        inp = build_input(ctx, blocks=v.content, clauses=clauses, required_clause_keys=list((v.clause_rules or {}).get("mandatory") or []),
                          number="SAMPLE-0000-000000", title="Release test", sensitivity="C2",
                          letterhead_info={"legal_name": "Example Employer Ltd"}, author="Example Employer Ltd")
        renderer.render_pdf(inp)
        renderer.render_html(inp)
    except Exception as exc:                                     # the release test reports, never raises
        return [f"render failed: {type(exc).__name__}: {exc}"[:300]]
    return []


def release_variant(db, actor, v: TemplateVariant) -> TemplateVariant:
    """LEGAL_APPROVED → RELEASE_TESTED → ACTIVE. Released by an organization admin who neither wrote nor approved it."""
    if v.owner_organization_id != actor.organization_id:
        raise HTTPException(403, "Platform template content is read-only.")
    access.require_org_admin(actor)
    if v.status != "LEGAL_APPROVED":
        raise HTTPException(409, "Only a legally approved version can be released.")
    if actor.id in (v.authored_by, v.reviewed_by):
        raise HTTPException(403, {"code": "SEPARATION_OF_DUTIES",
                                  "message": "The releaser must be a different person from the author and the legal reviewer."})
    d = db.get(TemplateDefinition, v.canonical_id)
    if not preflight.tenant_attestation_allowed(db, actor.organization_id, d.legal_risk):
        raise HTTPException(403, {"code": "TENANT_ATTESTATION_DISABLED",
                                  "message": "Your plan or settings do not allow organization-approved templates for this risk level."})
    pack = db.get(JurisdictionPack, v.pack_id)
    if pack.status != "ACTIVE":
        raise HTTPException(409, "Activate the jurisdiction pack before releasing templates in it.")
    if v.checksum != variant_checksum(v):
        raise HTTPException(409, "The content changed after approval. Create a new version.")
    problems = release_test(db, v)
    if problems:
        raise HTTPException(422, {"code": "RELEASE_TEST_FAILED", "problems": problems})
    now = datetime.utcnow()
    v.status, v.status_changed_at = "RELEASE_TESTED", now
    db.flush()
    previous = [p for p in _lineage(db, _key(v)) if p.status in ("ACTIVE", "SUSPENDED") and p.id != v.id]
    for p in previous:
        _withdraw(db, actor, p, "RETIRED", f"Superseded by version {v.version}", new=v, action="SUPERSEDED")
    v.status, v.status_changed_at = "ACTIVE", datetime.utcnow()
    v.released_by = actor.id
    v.effective_from = v.effective_from or date.today()
    db.commit()
    notify.variant_event(db, "template.variant.released", v, actor.organization_id)
    from app.modules.doc_templates import hooks
    hooks.send(db, "variant_released", actor, v, previous[0] if previous else None)
    return v


def withdraw_variant(db, actor, v: TemplateVariant, target: str, reason: str) -> TemplateSupersession:
    if v.owner_organization_id != actor.organization_id:
        raise HTTPException(403, "Platform template content is read-only.")
    access.require_hr(actor)
    if not (reason or "").strip():
        raise HTTPException(422, "Give a reason.")
    allowed = {"ACTIVE": {"SUSPENDED", "RETIRED"}, "SUSPENDED": {"RETIRED"},
               "IN_DRAFT": {"RETIRED"}, "LEGAL_REVIEW": {"RETIRED"}, "LEGAL_APPROVED": {"RETIRED"}}
    if target not in allowed.get(v.status, set()):
        raise HTTPException(409, f"A version in status {v.status} cannot move to {target}.")
    sup = _withdraw(db, actor, v, target, reason.strip(), action=target)
    db.commit()
    notify.variant_event(db, "template.variant.suspended", v, actor.organization_id)
    return sup


def _withdraw(db, actor, v: TemplateVariant, target: str, reason: str, *, new: Optional[TemplateVariant] = None,
              action: str = "SUSPENDED") -> TemplateSupersession:
    drafts = db.query(GeneratedDocument.id).filter(GeneratedDocument.variant_id == v.id,
                                                   GeneratedDocument.status.in_(sorted(state.DRAFT_STATES))).all()
    v.status, v.status_changed_at = target, datetime.utcnow()
    sup = TemplateSupersession(owner_organization_id=v.owner_organization_id, canonical_id=v.canonical_id, old_variant_id=v.id,
                               old_version=v.version, new_variant_id=getattr(new, "id", None), new_version=getattr(new, "version", None),
                               action=action, reason=reason[:2000], effective_at=datetime.utcnow(), decided_by=actor.id,
                               affected_in_progress=len(drafts), affected_document_ids=[d[0] for d in drafts], issued_unchanged=True)
    db.add(sup)
    db.flush()
    pdf = governance.to_pdf(governance.supersession_record(db, sup), actor.organization)
    sup.record_pdf_sha256 = service_sha(pdf)
    sup.record_pdf_path = storage.get_store().put(v.owner_organization_id, f"HR-DOC-018-{sup.id}-{sup.record_pdf_sha256[:12]}.pdf", pdf)
    return sup


# ── clauses ──────────────────────────────────────────────────────────────────────────────────────────────────────────

def validate_clause_text(text: str) -> list[str]:
    problems = []
    if not isinstance(text, str) or not text.strip():
        return ["clause text is required"]
    if len(text) > blocks.MAX_TEXT:
        problems.append(f"clause text is longer than {blocks.MAX_TEXT} characters")
    if resolver.clause_keys(text) or resolver.uses_required_block(text):
        problems.append("a clause cannot include another clause or the required clause block")
    for key in resolver.field_keys(text):
        fd = fields.REGISTRY.get(key)
        if fd is None or fd.system_only:
            problems.append(f"unknown field {{{{{key}}}}}")
    return problems


def create_clause(db, actor, data: dict) -> TemplateClause:
    access.require_hr(actor)
    key = (data.get("clause_key") or "").strip()
    if not blocks._KEY.match(key):
        raise HTTPException(422, "Clause keys are lower-case letters, digits and underscores.")
    pack = get_pack(db, actor.organization_id, int(data.get("pack_id") or 0))
    if pack.scope_type != "TENANT" or pack.owner_organization_id != actor.organization_id:
        raise HTTPException(409, "Organization clauses live in your own jurisdiction pack.")
    problems = validate_clause_text(data.get("text"))
    if problems:
        raise HTTPException(422, {"code": "INVALID_CLAUSE", "problems": problems})
    language = data.get("language") or "en"
    lineage = (db.query(TemplateClause).filter(TemplateClause.clause_key == key, TemplateClause.pack_id == pack.id,
                                               TemplateClause.owner_organization_id == actor.organization_id,
                                               TemplateClause.language == language).order_by(TemplateClause.version).all())
    if any(c.status in ("IN_DRAFT", "LEGAL_REVIEW", "LEGAL_APPROVED", "RELEASE_TESTED") for c in lineage):
        raise HTTPException(409, "A version of this clause is already in progress.")
    c = TemplateClause(clause_key=key, pack_id=pack.id, owner_organization_id=actor.organization_id, language=language,
                       version=(lineage[-1].version + 1) if lineage else 1, status="IN_DRAFT", title=data.get("title"),
                       text=data["text"], source_references=data.get("source_references") or [], effective_from=data.get("effective_from"),
                       effective_to=data.get("effective_to"), authored_by=actor.id, change_reason=data.get("change_reason"),
                       previous_version_id=lineage[-1].id if lineage else None)
    c.checksum = blocks.checksum(c.clause_key, c.text, c.language)
    db.add(c)
    db.commit()
    return c


def update_clause(db, actor, c: TemplateClause, data: dict) -> TemplateClause:
    access.require_hr(actor)
    if c.owner_organization_id != actor.organization_id:
        raise HTTPException(403, "Platform clauses are read-only.")
    if c.status != "IN_DRAFT":
        raise HTTPException(409, "Only a draft clause can be edited.")
    if "text" in data:
        problems = validate_clause_text(data["text"])
        if problems:
            raise HTTPException(422, {"code": "INVALID_CLAUSE", "problems": problems})
        c.text = data["text"]
    for key in ("title", "source_references", "effective_from", "effective_to", "change_reason"):
        if key in data:
            setattr(c, key, data[key])
    c.checksum = blocks.checksum(c.clause_key, c.text, c.language)
    db.commit()
    return c


def clause_transition(db, actor, c: TemplateClause, action: str, *, review: Optional[dict] = None) -> TemplateClause:
    """submit → approve (≠ author) → release (≠ author, ≠ approver; supersedes the previous ACTIVE version) → suspend/retire."""
    access.require_hr(actor)
    if c.owner_organization_id != actor.organization_id:
        raise HTTPException(403, "Platform clauses are read-only.")
    now = datetime.utcnow()
    if action == "submit":
        if c.status != "IN_DRAFT":
            raise HTTPException(409, "Only a draft clause can be submitted.")
        c.status = "LEGAL_REVIEW"
    elif action == "approve":
        access.require_org_admin(actor)
        if c.status != "LEGAL_REVIEW":
            raise HTTPException(409, "This clause is not waiting for review.")
        if actor.id == c.authored_by:
            raise HTTPException(403, {"code": "SEPARATION_OF_DUTIES", "message": "You cannot approve a clause you wrote."})
        if not (review or {}).get("attestation_accepted"):
            raise HTTPException(422, "Confirm that you reviewed this clause and accept responsibility for it.")
        c.reviewed_by, c.status = actor.id, "LEGAL_APPROVED"
    elif action == "release":
        access.require_org_admin(actor)
        if c.status != "LEGAL_APPROVED":
            raise HTTPException(409, "Only an approved clause can be released.")
        if actor.id in (c.authored_by, c.reviewed_by):
            raise HTTPException(403, {"code": "SEPARATION_OF_DUTIES",
                                      "message": "The releaser must be a different person from the author and the reviewer."})
        for previous_clause in db.query(TemplateClause).filter(TemplateClause.clause_key == c.clause_key, TemplateClause.pack_id == c.pack_id,
                                                   TemplateClause.owner_organization_id == c.owner_organization_id,
                                                   TemplateClause.language == c.language, TemplateClause.status == "ACTIVE",
                                                   TemplateClause.id != c.id).all():
            previous_clause.status = "RETIRED"
        c.released_by, c.status = actor.id, "ACTIVE"
        c.effective_from = c.effective_from or date.today()
    elif action in ("suspend", "retire"):
        target = "SUSPENDED" if action == "suspend" else "RETIRED"
        if c.status not in ("ACTIVE", "SUSPENDED") or (c.status == "SUSPENDED" and target == "SUSPENDED"):
            raise HTTPException(409, f"A clause in status {c.status} cannot be {action}d.")
        c.status = target
    else:
        raise HTTPException(404, "Unknown action")
    c.updated_at = now
    db.commit()
    return c
