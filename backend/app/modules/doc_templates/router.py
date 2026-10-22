"""HTTP API of the document template engine (docs/templates/architecture.md §API).

    /hr/templates/*               catalogue (566), field registry, settings, variants, clauses, jurisdiction packs
    /hr/generated-documents/*     preflight, generate, list, approve, issue, cancel, correct, legal hold, downloads, governance
    /hr/me/generated-documents/*  the signed-in employee's own documents: read, acknowledge, sign, decline
    /hr/legal-entities/*          employer entities and authorised signatories (organization admin)
    /hr/employees/{id}/jurisdiction  worker jurisdiction facts (HR)
    /hr/policy-distributions/*    HR-DOC-014
    /public/documents/*           candidate signing (single-use link + OTP) and document verification (no personal data)

Every /hr route is tenant-scoped by the signed token (privacy middleware + automatic tenant filter); platform accounts get
404 on all of them. A foreign or forbidden object always answers exactly like a missing one.
"""
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response
from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.core.client_ip import get_client_ip
from app.core.dependencies import get_current_user
from app.core.privacy.files import sign_download, verify_download
from app.core.rate_limiter import limiter
from app.database import get_db
from app.modules.doc_templates import (access, content, distribution, entities, fields, governance, preflight, registry,
                                       service, signing, state)
from app.modules.doc_templates import schemas as S
from app.modules.doc_templates.models import (DecisionReceipt, DocTemplateSettings, DocumentAcknowledgement, DocumentBulkRun,
                                              DocumentEvent, DocumentExpiryItem, DocumentSignature, EmployerEntity, GeneratedDocument,
                                              GeneratedDocumentApproval, JurisdictionPack, PolicyDistribution, TemplateApprovalRecord,
                                              TemplateClause, TemplateDefinition, TemplateSupersession, TemplateVariant)

templates_router = APIRouter(prefix="/hr/templates", tags=["Document templates"])
documents_router = APIRouter(prefix="/hr/generated-documents", tags=["Generated documents"])
ess_router = APIRouter(prefix="/hr/me/generated-documents", tags=["Generated documents (self-service)"])
entities_router = APIRouter(prefix="/hr", tags=["Legal entities"])
distributions_router = APIRouter(prefix="/hr/policy-distributions", tags=["Policy distributions"])
public_router = APIRouter(prefix="/public/documents", tags=["Public documents"])

MAX_PER_PAGE = 200


def _page(query, page, per_page, ser):
    page = max(int(page or 1), 1)
    size = min(max(int(per_page or 25), 1), MAX_PER_PAGE)
    total = query.order_by(None).count()
    rows = query.offset((page - 1) * size).limit(size).all()
    return {"items": [ser(r) for r in rows], "total": total, "page": page, "per_page": size}


def _ua(request: Request) -> str:
    return (request.headers.get("user-agent") or "")[:400]


def _file_response(data: bytes, filename: str, inline: bool = True) -> Response:
    return Response(content=data, media_type="application/pdf", headers={
        "Content-Disposition": f'{"inline" if inline else "attachment"}; filename="{filename}"',
        "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff"})


# ═══ serializers ════════════════════════════════════════════════════════════════════════════════════════════════════

def ser_definition(d: TemplateDefinition, avail: Optional[dict] = None) -> dict:
    a = avail or {}
    v = a.get("variant")
    return {"canonical_id": d.canonical_id, "family_id": d.family_id, "family_name": registry.FAMILIES.get(d.family_id, ("",))[0],
            "title": d.title, "kind": d.kind, "legal_risk": d.legal_risk, "sensitivity": d.sensitivity,
            "lifecycle_trigger": d.lifecycle_trigger, "catalogue_status": d.catalogue_status, "implemented": d.implemented,
            "engine_record": d.canonical_id in registry.SYSTEM_RECORDS, "output_mode": d.output_mode,
            "execution_mode": d.execution_mode, "audience": d.audience, "approval_policy": d.approval_policy,
            "available": bool(a.get("available")), "unavailable_reason": a.get("reason") if not a.get("available") else None,
            "active_variant": ({"id": v.id, "version": v.version, "release_mode": v.release_mode, "pack_id": v.pack_id} if v else None)}


def ser_variant(v: TemplateVariant, *, full: bool = False) -> dict:
    out = {"id": v.id, "canonical_id": v.canonical_id, "pack_id": v.pack_id, "owner": "organization" if v.owner_organization_id else "platform",
           "language": v.language, "version": v.version, "status": v.status, "release_mode": v.release_mode,
           "effective_from": v.effective_from, "effective_to": v.effective_to, "checksum": v.checksum, "authored_by": v.authored_by,
           "reviewed_by": v.reviewed_by, "released_by": v.released_by, "change_reason": v.change_reason, "change_summary": v.change_summary, "minor_change": bool(v.minor_change),
           "previous_version_id": v.previous_version_id, "status_changed_at": v.status_changed_at, "created_at": v.created_at}
    if full:
        out.update({"content": v.content, "field_contract": v.field_contract, "clause_rules": v.clause_rules,
                    "applicability": v.applicability, "options": v.options, "legal_review": v.legal_review})
    return out


def ser_pack(p: JurisdictionPack) -> dict:
    return {"id": p.id, "scope_type": p.scope_type, "owner": "organization" if p.owner_organization_id else "platform",
            "country": p.country, "region": p.region, "status": p.status, "effective_from": p.effective_from,
            "effective_to": p.effective_to, "signed_off_by_name": p.signed_off_by_name, "signed_off_by_role": p.signed_off_by_role,
            "signed_off_firm": p.signed_off_firm, "signed_off_at": p.signed_off_at, "source_references": p.source_references,
            "retention_rules": p.retention_rules, "requirements": p.requirements or {}, "notes": p.notes, "created_by": p.created_by,
            "created_at": p.created_at}


def ser_clause(c: TemplateClause) -> dict:
    return {"id": c.id, "clause_key": c.clause_key, "pack_id": c.pack_id, "owner": "organization" if c.owner_organization_id else "platform",
            "language": c.language, "version": c.version, "status": c.status, "title": c.title, "text": c.text,
            "source_references": c.source_references, "effective_from": c.effective_from, "effective_to": c.effective_to,
            "checksum": c.checksum, "authored_by": c.authored_by, "reviewed_by": c.reviewed_by, "released_by": c.released_by,
            "change_reason": c.change_reason, "previous_version_id": c.previous_version_id, "created_at": c.created_at}


def ser_settings(s: DocTemplateSettings, db, org_id) -> dict:
    from app.config import settings
    return {"tenant_attestation_enabled": s.tenant_attestation_enabled, "prefer_tenant_variants": s.prefer_tenant_variants,
            "expiry_warning_days": s.expiry_warning_days, "approval_overrides": s.approval_overrides or {},
            "platform_allows_tenant_attestation": settings.TEMPLATES_TENANT_ATTESTATION_ENABLED,
            "platform_allows_l3_attestation": settings.TEMPLATES_TENANT_ATTESTATION_L3_ENABLED,
            "plan_includes_tenant_attestation": preflight.entitled(db, org_id, "hr.documents.tenant_attestation")}


# ═══ /hr/templates ══════════════════════════════════════════════════════════════════════════════════════════════════

@templates_router.get("")
def list_templates(family: Optional[str] = None, search: Optional[str] = Query(None, max_length=100), implemented: Optional[bool] = None,
                   available: Optional[bool] = None, page: Optional[int] = None, per_page: Optional[int] = None,
                   db: Session = Depends(get_db), user=Depends(get_current_user)):
    access.require_hr(user)
    avail = governance.availability(db, user.organization_id)
    rows = db.query(TemplateDefinition).order_by(TemplateDefinition.canonical_id).all()
    if family:
        rows = [d for d in rows if d.family_id == family]
    if search:
        s = search.casefold()
        rows = [d for d in rows if s in d.title.casefold() or s in d.canonical_id.casefold()]
    if implemented is not None:
        rows = [d for d in rows if d.implemented == implemented]
    if available is not None:
        rows = [d for d in rows if bool(avail.get(d.canonical_id, {}).get("available")) == available]
    p = max(int(page or 1), 1)
    size = min(max(int(per_page or 50), 1), 600)
    chunk = rows[(p - 1) * size: p * size]
    return {"items": [ser_definition(d, avail.get(d.canonical_id)) for d in chunk], "total": len(rows), "page": p, "per_page": size}


@templates_router.get("/families")
def list_families(db: Session = Depends(get_db), user=Depends(get_current_user)):
    access.require_hr(user)
    counts = {}
    for d in db.query(TemplateDefinition).all():
        c = counts.setdefault(d.family_id, {"total": 0, "implemented": 0})
        c["total"] += 1
        c["implemented"] += int(d.implemented)
    return {"items": [{"family_id": k, "name": n, "definitions": cnt, **counts.get(k, {"total": 0, "implemented": 0})}
                      for k, (n, cnt) in registry.FAMILIES.items()], "total": len(registry.FAMILIES)}


@templates_router.get("/fields")
def list_fields(user=Depends(get_current_user)):
    access.require_hr(user)
    items = fields.catalogue()
    return {"items": items, "total": len(items)}


@templates_router.get("/settings")
def get_settings(db: Session = Depends(get_db), user=Depends(get_current_user)):
    access.require_hr(user)
    return ser_settings(preflight.org_settings(db, user.organization_id), db, user.organization_id)


@templates_router.put("/settings")
def put_settings(body: S.SettingsUpdate, db: Session = Depends(get_db), user=Depends(get_current_user)):
    access.require_org_admin(user)
    row = db.query(DocTemplateSettings).filter(DocTemplateSettings.organization_id == user.organization_id).first()
    if row is None:
        row = DocTemplateSettings(organization_id=user.organization_id)
        db.add(row)
    data = body.model_dump(exclude_unset=True)
    if "approval_overrides" in data:
        clean = {}
        for key, level in (data["approval_overrides"] or {}).items():
            d = db.get(TemplateDefinition, key)
            base = d.approval_policy if d else ("L1" if key in registry.FAMILIES else None)
            if base is None:
                raise HTTPException(422, f"Unknown template or family: {key}")
            if registry.stricter(base, level) != level:
                raise HTTPException(422, f"{key} is already {base}; an override can only make approval stricter.")
            clean[key] = level
        row.approval_overrides = clean
    for k in ("tenant_attestation_enabled", "prefer_tenant_variants", "expiry_warning_days"):
        if k in data and data[k] is not None:
            setattr(row, k, data[k])
    row.updated_by = user.id
    db.commit()
    return ser_settings(row, db, user.organization_id)


# -- jurisdiction packs --

@templates_router.get("/packs")
def list_packs(country: Optional[str] = Query(None, max_length=2), status: Optional[str] = None,
               page: Optional[int] = None, per_page: Optional[int] = None, db: Session = Depends(get_db), user=Depends(get_current_user)):
    access.require_hr(user)
    q = db.query(JurisdictionPack).filter(content.visible(JurisdictionPack, user.organization_id))
    if country:
        q = q.filter(JurisdictionPack.country == country.upper())
    if status:
        q = q.filter(JurisdictionPack.status == status)
    return _page(q.order_by(JurisdictionPack.country, JurisdictionPack.id), page, per_page, ser_pack)


@templates_router.post("/packs", status_code=201)
def create_pack(body: S.PackCreate, db: Session = Depends(get_db), user=Depends(get_current_user)):
    return ser_pack(content.create_pack(db, user, body.model_dump()))


@templates_router.get("/packs/{pack_id}")
def get_pack(pack_id: int, db: Session = Depends(get_db), user=Depends(get_current_user)):
    access.require_hr(user)
    return ser_pack(content.get_pack(db, user.organization_id, pack_id))


@templates_router.put("/packs/{pack_id}")
def update_pack(pack_id: int, body: S.PackUpdate, db: Session = Depends(get_db), user=Depends(get_current_user)):
    p = content.get_pack(db, user.organization_id, pack_id)
    return ser_pack(content.update_pack(db, user, p, body.model_dump(exclude_unset=True)))


@templates_router.post("/packs/{pack_id}/submit")
def submit_pack(pack_id: int, db: Session = Depends(get_db), user=Depends(get_current_user)):
    return ser_pack(content.submit_pack(db, user, content.get_pack(db, user.organization_id, pack_id)))


@templates_router.post("/packs/{pack_id}/activate")
def activate_pack(pack_id: int, body: S.PackAttestation, db: Session = Depends(get_db), user=Depends(get_current_user)):
    return ser_pack(content.activate_pack(db, user, content.get_pack(db, user.organization_id, pack_id), body.model_dump()))


@templates_router.post("/packs/{pack_id}/{action}")
def pack_action(pack_id: int, action: str, db: Session = Depends(get_db), user=Depends(get_current_user)):
    target = {"suspend": "SUSPENDED", "retire": "RETIRED", "reinstate": "ACTIVE", "return-to-draft": "DRAFT"}.get(action)
    if target is None:
        raise HTTPException(404, "Not Found")
    return ser_pack(content.change_pack_status(db, user, content.get_pack(db, user.organization_id, pack_id), target))


# -- clauses --

@templates_router.get("/clauses")
def list_clauses(pack_id: Optional[int] = None, clause_key: Optional[str] = Query(None, max_length=80), status: Optional[str] = None,
                 page: Optional[int] = None, per_page: Optional[int] = None, db: Session = Depends(get_db), user=Depends(get_current_user)):
    access.require_hr(user)
    q = db.query(TemplateClause).filter(content.visible(TemplateClause, user.organization_id))
    if pack_id:
        q = q.filter(TemplateClause.pack_id == pack_id)
    if clause_key:
        q = q.filter(TemplateClause.clause_key == clause_key)
    if status:
        q = q.filter(TemplateClause.status == status)
    return _page(q.order_by(TemplateClause.clause_key, TemplateClause.version.desc()), page, per_page, ser_clause)


@templates_router.post("/clauses", status_code=201)
def create_clause(body: S.ClauseCreate, db: Session = Depends(get_db), user=Depends(get_current_user)):
    return ser_clause(content.create_clause(db, user, body.model_dump()))


@templates_router.get("/clauses/{clause_id}")
def get_clause(clause_id: int, db: Session = Depends(get_db), user=Depends(get_current_user)):
    access.require_hr(user)
    return ser_clause(content.get_clause(db, user.organization_id, clause_id))


@templates_router.put("/clauses/{clause_id}")
def update_clause(clause_id: int, body: S.ClauseUpdate, db: Session = Depends(get_db), user=Depends(get_current_user)):
    c = content.get_clause(db, user.organization_id, clause_id)
    return ser_clause(content.update_clause(db, user, c, body.model_dump(exclude_unset=True)))


@templates_router.post("/clauses/{clause_id}/{action}")
def clause_action(clause_id: int, action: str, body: Optional[S.ClauseReview] = None, db: Session = Depends(get_db),
                  user=Depends(get_current_user)):
    if action not in ("submit", "approve", "release", "suspend", "retire"):
        raise HTTPException(404, "Not Found")
    c = content.get_clause(db, user.organization_id, clause_id)
    return ser_clause(content.clause_transition(db, user, c, action, review=body.model_dump() if body else None))


# -- variants --

@templates_router.get("/variants/{variant_id}")
def get_variant(variant_id: int, db: Session = Depends(get_db), user=Depends(get_current_user)):
    access.require_hr(user)
    v = content.get_variant(db, user.organization_id, variant_id)
    out = ser_variant(v, full=True)
    out["problems"] = content.validate_variant(db, v) if v.status == "IN_DRAFT" else []
    out["locked_block_ids"] = [b.get("id") for b in content.base_content(db, v) if isinstance(b, dict) and b.get("locked")]
    return out


@templates_router.put("/variants/{variant_id}")
def update_variant(variant_id: int, body: S.VariantUpdate, db: Session = Depends(get_db), user=Depends(get_current_user)):
    v = content.get_variant(db, user.organization_id, variant_id)
    return ser_variant(content.update_variant(db, user, v, body.model_dump(exclude_unset=True)), full=True)


@templates_router.post("/variants/{variant_id}/validate")
def validate_variant(variant_id: int, body: S.VariantUpdate, db: Session = Depends(get_db), user=Depends(get_current_user)):
    access.require_hr(user)
    v = content.get_variant(db, user.organization_id, variant_id)
    data = body.model_dump(exclude_unset=True)
    return {"problems": content.validate_variant(db, v, data.get("content"), data.get("field_contract"), data.get("clause_rules"))}


@templates_router.post("/variants/{variant_id}/preview")
def preview_variant(variant_id: int, body: Optional[S.VariantUpdate] = None, db: Session = Depends(get_db),
                    user=Depends(get_current_user)):
    """Live preview with synthetic sample data (never a real employee)."""
    access.require_hr(user)
    v = content.get_variant(db, user.organization_id, variant_id)
    data = body.model_dump(exclude_unset=True) if body else {}
    blocks_ = data.get("content") or v.content
    rules = data.get("clause_rules") or v.clause_rules or {}
    problems = content.validate_variant(db, v, blocks_, data.get("field_contract") or v.field_contract, rules)
    if problems:
        return {"html": None, "problems": problems}
    from datetime import date as _date
    from app.modules.hr.models import Organization
    clauses = {}
    for key in (rules.get("mandatory") or []) + (rules.get("optional") or []):
        c = preflight.find_clause(db, user.organization_id, key, v.pack_id, v.language, _date.today())
        if c is not None:
            clauses[key] = c
    sample_org = Organization(id=0, organization_name="Example Organisation", display_name="Example Organisation", currency="GBP")
    ctx = fields.FieldContext(db=db, organization=sample_org, language=v.language, sample=True)
    missing_clauses = [k for k in rules.get("mandatory") or [] if k not in clauses]
    stub = {k: type("C", (), {"text": f"[Clause {k} has no ACTIVE text in this pack yet]"})() for k in missing_clauses}
    inp = service.build_input(ctx, blocks=blocks_, clauses={**clauses, **stub}, required_clause_keys=list(rules.get("mandatory") or []),
                              number="SAMPLE-2026-000000", title="Preview", sensitivity="C2",
                              letterhead_info={"legal_name": "Example Employer Ltd", "address": "1 Sample Street, Sample City"},
                              author="Example Employer Ltd")
    from app.modules.doc_templates import renderer
    return {"html": renderer.render_html(inp), "problems": [], "missing_clauses": missing_clauses}


@templates_router.post("/variants/{variant_id}/submit-review")
def submit_variant(variant_id: int, db: Session = Depends(get_db), user=Depends(get_current_user)):
    return ser_variant(content.submit_variant(db, user, content.get_variant(db, user.organization_id, variant_id)))


@templates_router.post("/variants/{variant_id}/approve-legal")
def approve_variant(variant_id: int, body: S.LegalApproval, request: Request, db: Session = Depends(get_db),
                    user=Depends(get_current_user)):
    v = content.get_variant(db, user.organization_id, variant_id)
    rec = content.approve_legal(db, user, v, body.model_dump(), ip=get_client_ip(request))
    return {**ser_variant(v), "approval_record_id": rec.id}


@templates_router.post("/variants/{variant_id}/release")
def release_variant(variant_id: int, db: Session = Depends(get_db), user=Depends(get_current_user)):
    return ser_variant(content.release_variant(db, user, content.get_variant(db, user.organization_id, variant_id)))


@templates_router.post("/variants/{variant_id}/suspend")
def suspend_variant(variant_id: int, body: S.Reason, db: Session = Depends(get_db), user=Depends(get_current_user)):
    v = content.get_variant(db, user.organization_id, variant_id)
    sup = content.withdraw_variant(db, user, v, "SUSPENDED", body.reason)
    return {**ser_variant(v), "supersession_id": sup.id, "affected_in_progress": sup.affected_in_progress}


@templates_router.post("/variants/{variant_id}/retire")
def retire_variant(variant_id: int, body: S.Reason, db: Session = Depends(get_db), user=Depends(get_current_user)):
    v = content.get_variant(db, user.organization_id, variant_id)
    sup = content.withdraw_variant(db, user, v, "RETIRED", body.reason)
    return {**ser_variant(v), "supersession_id": sup.id, "affected_in_progress": sup.affected_in_progress}


@templates_router.get("/variants/{variant_id}/diff/{other_id}")
def diff_variants(variant_id: int, other_id: int, db: Session = Depends(get_db), user=Depends(get_current_user)):
    access.require_hr(user)
    a = content.get_variant(db, user.organization_id, variant_id)
    b = content.get_variant(db, user.organization_id, other_id)
    old, new = (a, b) if a.version <= b.version else (b, a)
    return governance.diff(old, new)


# -- one template (declared last: its path parameter would capture the literal routes above) --

@templates_router.get("/{canonical_id}")
def get_template(canonical_id: str, db: Session = Depends(get_db), user=Depends(get_current_user)):
    access.require_hr(user)
    d = db.get(TemplateDefinition, canonical_id)
    if d is None:
        raise HTTPException(404, "Template not found")
    avail = governance.availability(db, user.organization_id).get(canonical_id)
    variants = (db.query(TemplateVariant).filter(TemplateVariant.canonical_id == canonical_id,
                                                 content.visible(TemplateVariant, user.organization_id))
                .order_by(TemplateVariant.pack_id, TemplateVariant.version.desc()).all())
    from app.modules.doc_templates import starters
    starter = starters.STARTERS.get(canonical_id)
    return {**ser_definition(d, avail), "variants": [ser_variant(v) for v in variants],
            "has_starter_content": starter is not None,
            "required_fields": (starter or {}).get("field_contract", {}).get("required", []),
            "clause_keys": (starter or {}).get("clause_rules", {}),
            "request_roles": sorted(registry.request_roles(d.family_id))}


@templates_router.post("/{canonical_id}/variants", status_code=201)
def create_variant(canonical_id: str, body: S.VariantCreate, db: Session = Depends(get_db), user=Depends(get_current_user)):
    v = content.create_tenant_variant(db, user, canonical_id=canonical_id, pack_id=body.pack_id, language=body.language,
                                      from_variant_id=body.from_variant_id)
    return ser_variant(v, full=True)


# ═══ /hr/generated-documents ════════════════════════════════════════════════════════════════════════════════════════

def _doc(db, user, document_id: int, action: str = "read") -> GeneratedDocument:
    return access.require_view(db, user, db.get(GeneratedDocument, document_id), action)


def _signatory_doc(db, user, document_id: int) -> GeneratedDocument:
    """Authorised signatories need not be HR users: they reach a document of their organization when they hold signing
    authority for it (entity, template scope, risk level). Anyone else gets the same 404 as for a missing document."""
    doc = db.get(GeneratedDocument, document_id)
    if doc is None or doc.organization_id != user.organization_id:
        raise HTTPException(404, "Document not found")
    if access.can_view(db, user, doc):
        return doc
    if not _holds_authority(db, user, doc):
        raise HTTPException(404, "Document not found")
    return doc


def _holds_authority(db, user, doc) -> bool:
    from app.modules.doc_templates import approvals
    from app.modules.doc_templates.models import AuthorisedSignatory
    if doc.subject_type == "employee" and doc.subject_id == user.id:
        return False
    sigs = db.query(AuthorisedSignatory).filter(AuthorisedSignatory.organization_id == doc.organization_id,
                                                AuthorisedSignatory.entity_id == doc.entity_id,
                                                AuthorisedSignatory.employee_id == user.id).all()
    return any(approvals.signatory_covers(s, doc.canonical_id, doc.family_id, doc.legal_risk) for s in sigs)


def _hr_doc(db, user, document_id: int) -> GeneratedDocument:
    access.require_hr(user)
    return _doc(db, user, document_id)


@documents_router.post("/preflight")
def preflight_dry_run(body: S.GenerateRequest, db: Session = Depends(get_db), user=Depends(get_current_user)):
    """What would happen if this document were generated now. Persists nothing."""
    r = preflight.run_preflight(db, organization_id=user.organization_id, actor=user, canonical_id=body.canonical_id,
                                subject_type=body.subject_type, subject_id=body.subject_id, source_ref=body.source_ref,
                                language=body.language, effective_date=body.effective_date, entity_id=body.entity_id,
                                signatory_id=body.signatory_id, organization=user.organization)
    db.rollback()
    return r.as_dict()


@documents_router.post("/generate", status_code=201)
def generate(body: S.GenerateRequest, request: Request, db: Session = Depends(get_db), user=Depends(get_current_user)):
    doc = service.generate(db, user, **body.model_dump(), idempotency_key=request.headers.get("Idempotency-Key"))
    return service.serialize(doc)


@documents_router.post("/bulk-generate", status_code=201)
def bulk_generate(body: S.BulkGenerateRequest, db: Session = Depends(get_db), user=Depends(get_current_user)):
    run = distribution.bulk_generate(db, user, canonical_id=body.canonical_id, subject_type=body.subject_type,
                                     subject_ids=body.subject_ids, language=body.language)
    return _ser_run(run)


def _ser_progress(run) -> dict:
    total = len(run.subject_ids or [])
    done = len(run.results or [])
    return {"total": total, "done": done, "percent": round(done / total * 100) if total else 100}


def _ser_run(run: DocumentBulkRun) -> dict:
    return {"id": run.id, "canonical_id": run.canonical_id, "subject_type": run.subject_type, "status": run.status,
            "progress": _ser_progress(run),
            "results": run.results or [], "created_at": run.created_at, "finished_at": run.finished_at,
            "generated": sum(1 for r in run.results or [] if r.get("document_id")),
            "blocked": sum(1 for r in run.results or [] if not r.get("document_id"))}


@documents_router.get("/bulk-runs/{run_id}")
def get_bulk_run(run_id: int, db: Session = Depends(get_db), user=Depends(get_current_user)):
    access.require_hr(user)
    run = db.get(DocumentBulkRun, run_id)
    if run is None or run.organization_id != user.organization_id:
        raise HTTPException(404, "Not found")
    return _ser_run(run)


@documents_router.get("")
def list_documents(template: Optional[str] = Query(None, max_length=20), family: Optional[str] = Query(None, max_length=10),
                   status: Optional[str] = Query(None, max_length=30), subject_type: Optional[str] = Query(None, max_length=20),
                   subject_id: Optional[int] = None, search: Optional[str] = Query(None, max_length=100),
                   date_from: Optional[datetime] = None, date_to: Optional[datetime] = None,
                   page: Optional[int] = None, per_page: Optional[int] = None, db: Session = Depends(get_db), user=Depends(get_current_user)):
    if access.role_of(user) not in ("admin", "hr_admin", "manager"):
        raise HTTPException(403, "Use My documents to see your own documents.")
    q = db.query(GeneratedDocument).filter(access.list_filter(db, user))
    if template:
        q = q.filter(GeneratedDocument.canonical_id == template)
    if family:
        q = q.filter(GeneratedDocument.family_id == family)
    if status:
        q = q.filter(GeneratedDocument.status == status)
    if subject_type:
        q = q.filter(GeneratedDocument.subject_type == subject_type)
    if subject_id:
        q = q.filter(GeneratedDocument.subject_id == subject_id)
    if search:
        term = f"%{search.strip()}%"
        q = q.filter(or_(GeneratedDocument.document_number.ilike(term), GeneratedDocument.title.ilike(term),
                         GeneratedDocument.recipient_name.ilike(term)))
    if date_from:
        q = q.filter(GeneratedDocument.created_at >= date_from)
    if date_to:
        q = q.filter(GeneratedDocument.created_at <= date_to)
    is_hr = access.is_hr(user)
    return _page(q.order_by(GeneratedDocument.id.desc()), page, per_page, lambda d: service.serialize(d, viewer_is_hr=is_hr))


@documents_router.get("/files/{token}")
def signed_file(token: str, db: Session = Depends(get_db)):
    """Short-lived signed link (≤5 minutes, one object, one tenant). Every failure is a 404."""
    try:
        claims = verify_download(token)
    except ValueError:
        raise HTTPException(404, "Not Found")
    if claims["kind"] not in ("generated_document", "generated_document_original"):
        raise HTTPException(404, "Not Found")
    doc = db.get(GeneratedDocument, claims["object_id"])
    if doc is None or doc.organization_id != claims["organization_id"]:
        raise HTTPException(404, "Not Found")
    which = "original" if claims["kind"] == "generated_document_original" else "pdf"
    try:
        data = service.file_bytes(doc, which)
    except HTTPException:
        raise HTTPException(404, "Not Found")
    state.add_event(db, doc, "downloaded", actor_type="link", detail={"file": which})
    db.commit()
    return _file_response(data, f"{doc.document_number}{'-original' if which == 'original' and doc.executed_pdf_path else ''}.pdf")


def _download_link(db, user, doc, original: bool) -> dict:
    kind = "generated_document_original" if original else "generated_document"
    token = sign_download(kind, doc.id, doc.organization_id)
    state.add_event(db, doc, "download_link", actor_id=user.id, detail={"file": "original" if original else "current"})
    db.commit()
    return {"url": f"/hr/generated-documents/files/{token}", "expires_in": 300}


@documents_router.get("/{document_id}")
def get_document(document_id: int, db: Session = Depends(get_db), user=Depends(get_current_user)):
    if access.role_of(user) not in ("admin", "hr_admin", "manager"):
        raise HTTPException(404, "Document not found")
    doc = _doc(db, user, document_id)
    out = service.serialize(doc, viewer_is_hr=access.is_hr(user))
    steps = db.query(GeneratedDocumentApproval).filter(GeneratedDocumentApproval.document_id == doc.id) \
        .order_by(GeneratedDocumentApproval.step_order).all()
    out["approval_steps"] = [{"step_order": s.step_order, "step_kind": s.step_kind, "required_roles": s.required_roles,
                              "approver_id": s.approver_id, "decision": s.decision, "comment": s.comment if access.is_hr(user) else None,
                              "decided_at": s.decided_at} for s in steps]
    out["signatures"] = [{"party": s.signer_party, "decision": s.decision, "signed_at": s.signed_at, "method": s.signature_method}
                         for s in signing.signatures(db, doc)]
    out["required_parties"] = signing.required_parties(doc)
    return out


@documents_router.get("/{document_id}/preview")
def preview_document(document_id: int, db: Session = Depends(get_db), user=Depends(get_current_user)):
    if access.role_of(user) not in ("admin", "hr_admin", "manager"):
        raise HTTPException(404, "Document not found")
    doc = _doc(db, user, document_id)
    html = service.file_bytes(doc, "html").decode("utf-8")
    state.add_event(db, doc, "previewed", actor_id=user.id)
    db.commit()
    return {"html": html, "document_number": doc.document_number, "status": doc.status}


@documents_router.post("/{document_id}/download-link")
def document_download_link(document_id: int, original: bool = False, db: Session = Depends(get_db), user=Depends(get_current_user)):
    if access.role_of(user) not in ("admin", "hr_admin", "manager"):
        raise HTTPException(404, "Document not found")
    return _download_link(db, user, _doc(db, user, document_id, "download"), original)


@documents_router.get("/{document_id}/timeline")
def document_timeline(document_id: int, db: Session = Depends(get_db), user=Depends(get_current_user)):
    doc = _hr_doc(db, user, document_id)
    evs = db.query(DocumentEvent).filter(DocumentEvent.document_id == doc.id).order_by(DocumentEvent.id).all()
    return {"items": [{"id": e.id, "event_type": e.event_type, "actor_type": e.actor_type, "actor_id": e.actor_id,
                       "detail": e.detail, "created_at": e.created_at} for e in evs], "total": len(evs)}


@documents_router.post("/{document_id}/approve")
def approve_document(document_id: int, body: S.Comment, db: Session = Depends(get_db), user=Depends(get_current_user)):
    doc = _signatory_doc(db, user, document_id)
    return service.serialize(service.approve(db, doc, user, body.comment))


@documents_router.post("/{document_id}/reject")
def reject_document(document_id: int, body: S.Comment, db: Session = Depends(get_db), user=Depends(get_current_user)):
    doc = _signatory_doc(db, user, document_id)
    return service.serialize(service.reject(db, doc, user, body.comment))


@documents_router.post("/{document_id}/issue")
def issue_document(document_id: int, request: Request, db: Session = Depends(get_db), user=Depends(get_current_user)):
    doc = _hr_doc(db, user, document_id)
    if request.headers.get("Idempotency-Key") and doc.status in access.POST_ISSUE:
        return service.serialize(doc)               # a retried issue returns the issued document instead of a conflict
    return service.serialize(service.issue(db, doc, user))


@documents_router.post("/{document_id}/cancel")
def cancel_document(document_id: int, body: S.Reason, db: Session = Depends(get_db), user=Depends(get_current_user)):
    return service.serialize(service.cancel(db, _hr_doc(db, user, document_id), user, body.reason))


@documents_router.post("/{document_id}/correct", status_code=201)
def correct_document(document_id: int, body: S.Reason, db: Session = Depends(get_db), user=Depends(get_current_user)):
    return service.serialize(service.correct(db, _hr_doc(db, user, document_id), user, body.reason))


@documents_router.post("/{document_id}/legal-hold")
def legal_hold(document_id: int, body: S.Reason, db: Session = Depends(get_db), user=Depends(get_current_user)):
    return service.serialize(service.set_legal_hold(db, _hr_doc(db, user, document_id), user, body.reason))


@documents_router.post("/{document_id}/release-hold")
def release_hold(document_id: int, db: Session = Depends(get_db), user=Depends(get_current_user)):
    return service.serialize(service.release_hold(db, _hr_doc(db, user, document_id), user))


@documents_router.post("/{document_id}/name-override")
def name_override(document_id: int, body: S.NameOverride, db: Session = Depends(get_db), user=Depends(get_current_user)):
    """HR accepts a signer name that differs from the one on the document (audited, never silent)."""
    doc = _hr_doc(db, user, document_id)
    overrides = dict(doc.signer_name_overrides or {})
    overrides[body.party] = body.name.strip()
    doc.signer_name_overrides = overrides
    state.add_event(db, doc, "name_override", actor_id=user.id, detail={"party": body.party})
    db.commit()
    return {"ok": True}


@documents_router.post("/{document_id}/employer-sign/otp")
@limiter.limit("5/minute")
def employer_sign_otp(request: Request, document_id: int, db: Session = Depends(get_db), user=Depends(get_current_user)):
    doc = _signatory_doc(db, user, document_id)
    signing._require_signatory(db, doc, user)
    return signing.send_otp(db, doc, party="employer", signer_key=f"employee:{user.id}", email=user.work_email or user.email,
                            first_name=user.first_name)


@documents_router.post("/{document_id}/employer-sign")
@limiter.limit("10/minute")
def employer_sign(request: Request, document_id: int, body: S.SignRequest, db: Session = Depends(get_db), user=Depends(get_current_user)):
    doc = _signatory_doc(db, user, document_id)
    signing.sign(db, doc, party="employer", signer_employee=user, signer_email=user.work_email or user.email, typed_name=body.typed_name,
                 method=body.method, drawn=body.drawn_signature, consent_version=body.consent_version, otp_code=body.otp_code,
                 ip=get_client_ip(request), user_agent=_ua(request))
    return service.serialize(doc)


# -- governance reports (HR-DOC family) --

def _export(record: governance.Record, fmt: str, organization, filename: str, entity=None):
    if fmt == "csv":
        return Response(content=governance.to_csv(record), media_type="text/csv",
                        headers={"Content-Disposition": f'attachment; filename="{filename}.csv"', "Cache-Control": "private, no-store"})
    if fmt == "pdf":
        return _file_response(governance.to_pdf(record, organization, entity), f"{filename}.pdf", inline=False)
    return {"canonical_id": record.canonical_id, "title": record.title, "sections": [list(s) for s in record.sections]}


Fmt = Query("json", pattern="^(json|csv|pdf)$")


@documents_router.get("/governance/register")
def gov_register(format: str = Fmt, db: Session = Depends(get_db), user=Depends(get_current_user)):
    access.require_hr(user)
    return _export(governance.register_record(db, user.organization), format, user.organization, "HR-DOC-001-template-register")


@documents_router.get("/governance/approvals")
def gov_approvals(page: Optional[int] = None, per_page: Optional[int] = None, db: Session = Depends(get_db), user=Depends(get_current_user)):
    """HR-DOC-003 legal approval records of this organization's template versions, and HR-DOC-010 document approvals."""
    access.require_hr(user)
    recs = db.query(TemplateApprovalRecord).filter(TemplateApprovalRecord.owner_organization_id == user.organization_id) \
        .order_by(TemplateApprovalRecord.id.desc()).limit(500).all()
    docs = (db.query(GeneratedDocument).filter(GeneratedDocument.organization_id == user.organization_id,
                                               GeneratedDocument.approval_policy.in_(["L2", "L3"]))
            .order_by(GeneratedDocument.id.desc()))
    paged = _page(docs, page, per_page, lambda d: {"document_id": d.id, "document_number": d.document_number, "title": d.title,
                                                   "approval_policy": d.approval_policy, "status": d.status})
    return {"template_approvals": [{"id": r.id, "variant_id": r.variant_id, "variant_checksum": r.variant_checksum,
                                    "reviewer_id": r.reviewer_id, "reviewer_name": (r.review or {}).get("reviewer_name"),
                                    "created_at": r.created_at, "record_sha256": r.record_pdf_sha256} for r in recs],
            "document_approvals": paged}


@documents_router.get("/governance/approvals/{record_id}")
def gov_approval_record(record_id: int, db: Session = Depends(get_db), user=Depends(get_current_user)):
    access.require_hr(user)
    r = db.get(TemplateApprovalRecord, record_id)
    if r is None or r.owner_organization_id != user.organization_id or not r.record_pdf_path:
        raise HTTPException(404, "Not found")
    from app.modules.doc_templates import storage
    return _file_response(storage.get_store().get(r.record_pdf_path), f"HR-DOC-003-{r.variant_id}.pdf", inline=False)


@documents_router.get("/governance/versions")
def gov_versions(variant_id: int, format: str = Fmt, db: Session = Depends(get_db), user=Depends(get_current_user)):
    access.require_hr(user)
    v = content.get_variant(db, user.organization_id, variant_id)
    return _export(governance.version_history_record(db, v), format, user.organization, f"HR-DOC-004-{v.canonical_id}-v{v.version}")


@documents_router.get("/governance/generation-instructions")
def gov_generation_instructions(page: Optional[int] = None, per_page: Optional[int] = None, db: Session = Depends(get_db),
                                user=Depends(get_current_user)):
    access.require_hr(user)
    q = db.query(DecisionReceipt).filter(DecisionReceipt.organization_id == user.organization_id).order_by(DecisionReceipt.id.desc())
    return _page(q, page, per_page, lambda r: {"receipt_id": r.id, "document_id": r.document_id, "canonical_id": r.canonical_id,
                                               "outcome": r.outcome, "reasons": r.reasons, "created_at": r.created_at,
                                               "requested_by": r.requested_by, "engine_version": r.engine_version})


@documents_router.get("/governance/generation-instructions/{document_id}")
def gov_generation_instruction(document_id: int, format: str = Fmt, db: Session = Depends(get_db), user=Depends(get_current_user)):
    doc = _hr_doc(db, user, document_id)
    return _export(governance.generation_instruction_record(db, doc), format, user.organization, f"HR-DOC-008-{doc.document_number}")


@documents_router.get("/governance/workflow-approvals/{document_id}")
def gov_workflow_approval(document_id: int, format: str = Fmt, db: Session = Depends(get_db), user=Depends(get_current_user)):
    doc = _hr_doc(db, user, document_id)
    return _export(governance.workflow_approval_record(db, doc), format, user.organization, f"HR-DOC-010-{doc.document_number}")


@documents_router.get("/governance/signature-evidence/{document_id}")
def gov_signature_evidence(document_id: int, format: str = Fmt, db: Session = Depends(get_db), user=Depends(get_current_user)):
    doc = _hr_doc(db, user, document_id)
    sigs = signing.signatures(db, doc)
    if not sigs:
        raise HTTPException(404, "This document has no signatures yet.")
    completed = doc.status_changed_at if doc.status == "EXECUTED" else None
    return _export(governance.certificate_record(db, doc, sigs, completed, user.organization), format, user.organization,
                   f"HR-DOC-012-{doc.document_number}")


@documents_router.get("/governance/acknowledgements")
def gov_acknowledgements(document_id: Optional[int] = None, page: Optional[int] = None, per_page: Optional[int] = None,
                         db: Session = Depends(get_db), user=Depends(get_current_user)):
    access.require_hr(user)
    q = db.query(DocumentAcknowledgement).filter(DocumentAcknowledgement.organization_id == user.organization_id)
    if document_id:
        q = q.filter(DocumentAcknowledgement.document_id == document_id)
    return _page(q.order_by(DocumentAcknowledgement.id.desc()), page, per_page,
                 lambda a: {"id": a.id, "document_id": a.document_id, "employee_id": a.employee_id,
                            "acknowledged_at": a.acknowledged_at, "text_version": a.acknowledgement_text_version,
                            "document_sha256": a.document_sha256})


@documents_router.get("/governance/acknowledgements/{ack_id}")
def gov_acknowledgement(ack_id: int, format: str = Fmt, db: Session = Depends(get_db), user=Depends(get_current_user)):
    access.require_hr(user)
    a = db.get(DocumentAcknowledgement, ack_id)
    if a is None or a.organization_id != user.organization_id:
        raise HTTPException(404, "Not found")
    return _export(governance.acknowledgement_record(db, a), format, user.organization, f"HR-DOC-013-{a.id}")


@documents_router.get("/governance/distributions/{distribution_id}")
def gov_distribution(distribution_id: int, format: str = Fmt, db: Session = Depends(get_db), user=Depends(get_current_user)):
    d = distribution.get(db, user, distribution_id)
    return _export(governance.distribution_record(db, d), format, user.organization, f"HR-DOC-014-{d.id}")


@documents_router.get("/governance/expiries")
def gov_expiries(status: Optional[str] = Query(None, pattern="^(OPEN|RENEWED|WAIVED)$"), format: str = Fmt,
                 db: Session = Depends(get_db), user=Depends(get_current_user)):
    access.require_hr(user)
    if format != "json":
        return _export(governance.expiry_record(db, user.organization_id), format, user.organization, "HR-DOC-016-expiries")
    q = db.query(DocumentExpiryItem).filter(DocumentExpiryItem.organization_id == user.organization_id)
    if status:
        q = q.filter(DocumentExpiryItem.status == status)
    rows = q.order_by(DocumentExpiryItem.expiry_date).limit(1000).all()
    return {"items": [{"id": i.id, "item_type": i.item_type, "ref_id": i.ref_id, "title": i.title, "owner_employee_id": i.owner_employee_id,
                       "expiry_date": i.expiry_date, "action_required": i.action_required, "status": i.status,
                       "resolution_note": i.resolution_note, "resolved_at": i.resolved_at} for i in rows], "total": len(rows)}


@documents_router.put("/governance/expiries/{item_id}")
def gov_resolve_expiry(item_id: int, body: S.ExpiryResolve, db: Session = Depends(get_db), user=Depends(get_current_user)):
    access.require_hr(user)
    i = db.get(DocumentExpiryItem, item_id)
    if i is None or i.organization_id != user.organization_id:
        raise HTTPException(404, "Not found")
    if body.status == "WAIVED" and not (body.note or "").strip():
        raise HTTPException(422, "Give a reason for waiving.")
    i.status, i.resolution_note = body.status, (body.note or None)
    i.resolved_by, i.resolved_at = (user.id, datetime.utcnow()) if body.status != "OPEN" else (None, None)
    db.commit()
    return {"id": i.id, "status": i.status}


@documents_router.get("/governance/supersessions")
def gov_supersessions(db: Session = Depends(get_db), user=Depends(get_current_user)):
    access.require_hr(user)
    rows = db.query(TemplateSupersession).filter(TemplateSupersession.owner_organization_id == user.organization_id) \
        .order_by(TemplateSupersession.id.desc()).limit(500).all()
    return {"items": [{"id": s.id, "canonical_id": s.canonical_id, "old_variant_id": s.old_variant_id, "old_version": s.old_version,
                       "new_variant_id": s.new_variant_id, "new_version": s.new_version, "action": s.action, "reason": s.reason,
                       "effective_at": s.effective_at, "decided_by": s.decided_by, "affected_in_progress": s.affected_in_progress,
                       "issued_unchanged": s.issued_unchanged} for s in rows], "total": len(rows)}


@documents_router.get("/governance/supersessions/{supersession_id}")
def gov_supersession(supersession_id: int, format: str = Fmt, db: Session = Depends(get_db), user=Depends(get_current_user)):
    access.require_hr(user)
    s = db.get(TemplateSupersession, supersession_id)
    if s is None or s.owner_organization_id != user.organization_id:
        raise HTTPException(404, "Not found")
    return _export(governance.supersession_record(db, s), format, user.organization, f"HR-DOC-018-{s.id}")


# ═══ /hr/me/generated-documents (self-service) ═════════════════════════════════════════════════════════════════════

def _mine(db, user, document_id: int) -> GeneratedDocument:
    doc = db.get(GeneratedDocument, document_id)
    if doc is None or doc.organization_id != user.organization_id or doc.recipient_employee_id != user.id \
            or doc.audience == "HR_INTERNAL" or doc.status not in access.POST_ISSUE + ("LEGAL_HOLD",):
        raise HTTPException(404, "Document not found")
    if doc.status != "LEGAL_HOLD" and not access.can_view(db, user, doc):
        raise HTTPException(404, "Document not found")
    return doc


def _ser_mine(db, doc: GeneratedDocument, user) -> dict:
    out = service.serialize(doc, viewer_is_hr=False)
    parties = signing.required_parties(doc)
    signed = signing.signed_parties(db, doc)
    out["my_action"] = None
    if doc.status == "ISSUED":
        if doc.execution_mode == "ACKNOWLEDGE":
            out["my_action"] = "acknowledge"
        elif "employee" in parties and "employee" not in signed:
            out["my_action"] = "sign"
    out["needs_otp"] = out["my_action"] == "sign" and signing.needs_otp(doc, "employee")
    return out


@ess_router.get("")
def my_documents(status: Optional[str] = Query(None, max_length=30), pending: bool = False, page: Optional[int] = None,
                 per_page: Optional[int] = None, db: Session = Depends(get_db), user=Depends(get_current_user)):
    q = db.query(GeneratedDocument).filter(GeneratedDocument.organization_id == user.organization_id,
                                           GeneratedDocument.recipient_employee_id == user.id,
                                           GeneratedDocument.audience != "HR_INTERNAL",
                                           GeneratedDocument.status.in_(access.POST_ISSUE))
    if status:
        q = q.filter(GeneratedDocument.status == status)
    if pending:
        q = q.filter(GeneratedDocument.status == "ISSUED", GeneratedDocument.execution_mode != "NONE")
    return _page(q.order_by(GeneratedDocument.id.desc()), page, per_page, lambda d: _ser_mine(db, d, user))


@ess_router.get("/pending-count")
def my_pending_count(db: Session = Depends(get_db), user=Depends(get_current_user)):
    n = db.query(GeneratedDocument).filter(GeneratedDocument.organization_id == user.organization_id,
                                           GeneratedDocument.recipient_employee_id == user.id, GeneratedDocument.status == "ISSUED",
                                           GeneratedDocument.execution_mode != "NONE", GeneratedDocument.audience != "HR_INTERNAL").count()
    return {"count": n}


@ess_router.get("/statements")
def my_statements():
    """The exact, versioned wording shown before an acknowledgement or a signature."""
    return {"acknowledgement": {"version": governance.ACK_VERSION, "text": governance.ACK_TEXT, "statement": governance.ACK_STATEMENT},
            "consent": {"version": governance.CONSENT_VERSION, "text": governance.CONSENT_TEXT}}


@ess_router.get("/signatory-queue")
def signatory_queue(db: Session = Depends(get_db), user=Depends(get_current_user)):
    """Documents waiting for the signed-in person as an authorised signatory: an L3 approval step or an employer signature."""
    from app.modules.doc_templates import approvals
    from app.modules.doc_templates.models import AuthorisedSignatory
    if not db.query(AuthorisedSignatory.id).filter(AuthorisedSignatory.organization_id == user.organization_id,
                                                   AuthorisedSignatory.employee_id == user.id).first():
        return {"items": [], "total": 0}
    rows = db.query(GeneratedDocument).filter(GeneratedDocument.organization_id == user.organization_id,
                                              GeneratedDocument.status.in_(["PENDING_APPROVAL", "HUMAN_APPROVED", "ISSUED"]))         .order_by(GeneratedDocument.id.desc()).limit(500).all()
    items = []
    for doc in rows:
        if not _holds_authority(db, user, doc):
            continue
        action = None
        if doc.status == "PENDING_APPROVAL":
            step = approvals.current_step(db, doc)
            if step is not None and "authorised_signatory" in (step.required_roles or []) and user.id != doc.requested_by:
                action = "approve"
        elif "employer" in signing.required_parties(doc) and "employer" not in signing.signed_parties(db, doc):
            others = [p for p in signing.required_parties(doc) if p != "employer"]
            first = signing._employer_signs_first(db, doc)
            if (doc.status == "ISSUED" and set(others) <= signing.signed_parties(db, doc)) or (first and doc.status in ("HUMAN_APPROVED", "ISSUED")):
                action = "sign"
        if action:
            items.append({**service.serialize(doc, viewer_is_hr=False), "my_action": action,
                          "needs_otp": action == "sign" and signing.needs_otp(doc, "employer")})
    return {"items": items, "total": len(items)}


@ess_router.get("/signatory-queue/{document_id}/preview")
def signatory_preview(document_id: int, db: Session = Depends(get_db), user=Depends(get_current_user)):
    doc = _signatory_doc(db, user, document_id)
    html = service.file_bytes(doc, "html").decode("utf-8")
    state.add_event(db, doc, "previewed", actor_id=user.id, detail={"as": "signatory"})
    db.commit()
    return {"html": html, "document_number": doc.document_number, "status": doc.status}


@ess_router.post("/signatory-queue/{document_id}/download-link")
def signatory_download_link(document_id: int, db: Session = Depends(get_db), user=Depends(get_current_user)):
    return _download_link(db, user, _signatory_doc(db, user, document_id), False)


@ess_router.get("/{document_id}")
def my_document(document_id: int, db: Session = Depends(get_db), user=Depends(get_current_user)):
    return _ser_mine(db, _mine(db, user, document_id), user)


@ess_router.get("/{document_id}/preview")
def my_document_preview(document_id: int, db: Session = Depends(get_db), user=Depends(get_current_user)):
    doc = _mine(db, user, document_id)
    html = service.file_bytes(doc, "html").decode("utf-8")
    signing.mark_viewed(db, doc, user.id)
    return {"html": html, "document_number": doc.document_number, "status": doc.status}


@ess_router.post("/{document_id}/download-link")
def my_download_link(document_id: int, db: Session = Depends(get_db), user=Depends(get_current_user)):
    doc = _mine(db, user, document_id)
    signing.mark_viewed(db, doc, user.id)
    return _download_link(db, user, doc, False)


@ess_router.post("/{document_id}/acknowledge")
def my_acknowledge(document_id: int, body: S.AcknowledgeRequest, request: Request, db: Session = Depends(get_db),
                   user=Depends(get_current_user)):
    doc = _mine(db, user, document_id)
    signing.acknowledge(db, doc, user, text_version=body.text_version, ip=get_client_ip(request), user_agent=_ua(request))
    return _ser_mine(db, doc, user)


@ess_router.post("/{document_id}/sign/otp")
@limiter.limit("5/minute")
def my_sign_otp(request: Request, document_id: int, db: Session = Depends(get_db), user=Depends(get_current_user)):
    doc = _mine(db, user, document_id)
    if "employee" not in signing.required_parties(doc) or doc.status != "ISSUED":
        raise HTTPException(409, "This document does not need your signature.")
    return signing.send_otp(db, doc, party="employee", signer_key=f"employee:{user.id}", email=user.work_email or user.email,
                            first_name=user.first_name)


@ess_router.post("/{document_id}/sign")
@limiter.limit("10/minute")
def my_sign(request: Request, document_id: int, body: S.SignRequest, db: Session = Depends(get_db), user=Depends(get_current_user)):
    doc = _mine(db, user, document_id)
    signing.sign(db, doc, party="employee", signer_employee=user, signer_email=user.work_email or user.email, typed_name=body.typed_name,
                 method=body.method, drawn=body.drawn_signature, consent_version=body.consent_version, otp_code=body.otp_code,
                 ip=get_client_ip(request), user_agent=_ua(request))
    return _ser_mine(db, doc, user)


@ess_router.post("/{document_id}/decline")
def my_decline(document_id: int, body: S.DeclineRequest, request: Request, db: Session = Depends(get_db), user=Depends(get_current_user)):
    doc = _mine(db, user, document_id)
    signing.decline(db, doc, party="employee", signer_employee=user, signer_email=user.work_email or user.email, reason=body.reason,
                    ip=get_client_ip(request), user_agent=_ua(request))
    return _ser_mine(db, doc, user)


# ═══ legal entities, signatories, worker jurisdiction ══════════════════════════════════════════════════════════════

@entities_router.get("/legal-entities")
def list_entities(db: Session = Depends(get_db), user=Depends(get_current_user)):
    items = entities.list_entities(db, user)
    return {"items": items, "total": len(items)}


@entities_router.post("/legal-entities", status_code=201)
def create_entity(body: S.EntityBody, db: Session = Depends(get_db), user=Depends(get_current_user)):
    return entities.serialize_entity(entities.create_entity(db, user, body.model_dump(exclude_unset=True)))


@entities_router.get("/legal-entities/signatories")
def list_signatories(entity_id: Optional[int] = None, db: Session = Depends(get_db), user=Depends(get_current_user)):
    items = entities.list_signatories(db, user, entity_id)
    return {"items": items, "total": len(items)}


@entities_router.post("/legal-entities/signatories", status_code=201)
def create_signatory(body: S.SignatoryCreate, db: Session = Depends(get_db), user=Depends(get_current_user)):
    return entities.serialize_signatory(db, entities.create_signatory(db, user, body.model_dump()))


@entities_router.put("/legal-entities/signatories/{signatory_id}")
def update_signatory(signatory_id: int, body: S.SignatoryUpdate, db: Session = Depends(get_db), user=Depends(get_current_user)):
    from app.modules.doc_templates.models import AuthorisedSignatory
    access.require_org_admin(user)
    s = db.get(AuthorisedSignatory, signatory_id)
    if s is None or s.organization_id != user.organization_id:
        raise HTTPException(404, "Signatory not found")
    return entities.serialize_signatory(db, entities.update_signatory(db, user, s, body.model_dump(exclude_unset=True)))


@entities_router.get("/legal-entities/jurisdiction-gaps")
def jurisdiction_gaps(db: Session = Depends(get_db), user=Depends(get_current_user)):
    return entities.jurisdiction_gaps(db, user)


@entities_router.get("/legal-entities/{entity_id}")
def get_entity(entity_id: int, db: Session = Depends(get_db), user=Depends(get_current_user)):
    access.require_hr(user)
    return entities.serialize_entity(entities.get_entity(db, user, entity_id))


@entities_router.put("/legal-entities/{entity_id}")
def update_entity(entity_id: int, body: S.EntityBody, db: Session = Depends(get_db), user=Depends(get_current_user)):
    e = entities.get_entity(db, user, entity_id)
    return entities.serialize_entity(entities.update_entity(db, user, e, body.model_dump(exclude_unset=True)))


@entities_router.post("/legal-entities/{entity_id}/default")
def default_entity(entity_id: int, db: Session = Depends(get_db), user=Depends(get_current_user)):
    return entities.serialize_entity(entities.set_default(db, user, entities.get_entity(db, user, entity_id)))


@entities_router.post("/legal-entities/{entity_id}/status")
def entity_status(entity_id: int, body: S.EntityStatus, db: Session = Depends(get_db), user=Depends(get_current_user)):
    return entities.serialize_entity(entities.set_status(db, user, entities.get_entity(db, user, entity_id), body.status))


def _employee(db, user, employee_id: int):
    from app.modules.employee.models import Employee
    access.require_hr(user)
    emp = db.get(Employee, employee_id)
    if emp is None or emp.organization_id != user.organization_id:
        raise HTTPException(404, "Employee not found")
    return emp


@entities_router.get("/employees/{employee_id}/jurisdiction")
def get_jurisdiction(employee_id: int, db: Session = Depends(get_db), user=Depends(get_current_user)):
    return entities.serialize_jurisdiction(_employee(db, user, employee_id))


@entities_router.put("/employees/{employee_id}/jurisdiction")
def put_jurisdiction(employee_id: int, body: S.JurisdictionUpdate, db: Session = Depends(get_db), user=Depends(get_current_user)):
    return entities.update_jurisdiction(db, user, _employee(db, user, employee_id), body.model_dump(exclude_unset=True))


# ═══ /hr/policy-distributions (HR-DOC-014) ═════════════════════════════════════════════════════════════════════════

@distributions_router.get("")
def list_distributions(status: Optional[str] = Query(None, max_length=20), page: Optional[int] = None, per_page: Optional[int] = None,
                       db: Session = Depends(get_db), user=Depends(get_current_user)):
    access.require_hr(user)
    q = db.query(PolicyDistribution).filter(PolicyDistribution.organization_id == user.organization_id)
    if status:
        q = q.filter(PolicyDistribution.status == status)
    return _page(q.order_by(PolicyDistribution.id.desc()), page, per_page, lambda d: distribution.serialize(db, d))


@distributions_router.post("", status_code=201)
def create_distribution(body: S.DistributionCreate, db: Session = Depends(get_db), user=Depends(get_current_user)):
    return distribution.serialize(db, distribution.create(db, user, body.model_dump()))


@distributions_router.get("/{distribution_id}")
def get_distribution(distribution_id: int, db: Session = Depends(get_db), user=Depends(get_current_user)):
    return distribution.serialize(db, distribution.get(db, user, distribution_id))


@distributions_router.put("/{distribution_id}")
def update_distribution(distribution_id: int, body: S.DistributionUpdate, db: Session = Depends(get_db), user=Depends(get_current_user)):
    d = distribution.get(db, user, distribution_id)
    return distribution.serialize(db, distribution.update(db, user, d, body.model_dump(exclude_unset=True)))


@distributions_router.post("/{distribution_id}/publish")
def publish_distribution(distribution_id: int, body: S.PublishRequest, db: Session = Depends(get_db), user=Depends(get_current_user)):
    d = distribution.get(db, user, distribution_id)
    result = distribution.publish(db, user, d, confirm_partial=body.confirm_partial)
    return {**result, "distribution": distribution.serialize(db, d)}


@distributions_router.post("/{distribution_id}/close")
def close_distribution(distribution_id: int, db: Session = Depends(get_db), user=Depends(get_current_user)):
    return distribution.serialize(db, distribution.close(db, user, distribution.get(db, user, distribution_id)))


# ═══ /public/documents ═════════════════════════════════════════════════════════════════════════════════════════════

def _public_view(db, doc: GeneratedDocument) -> dict:
    from app.modules.hr.models import Organization
    org = db.get(Organization, doc.organization_id)
    signed = signing.signed_parties(db, doc)
    return {"document_number": doc.document_number, "title": doc.title, "status": doc.status,
            "organization_name": getattr(org, "display_name", None) or getattr(org, "organization_name", ""),
            "organization_logo": getattr(org, "logo_url", None), "recipient_name": doc.recipient_name, "due_by": doc.due_by,
            "can_sign": doc.status == "ISSUED" and "candidate" in signing.required_parties(doc) and "candidate" not in signed,
            "needs_otp": True, "consent": {"version": governance.CONSENT_VERSION, "text": governance.CONSENT_TEXT}}


@public_router.get("/sign/{token}")
@limiter.limit("30/minute")
def public_sign_view(request: Request, token: str, db: Session = Depends(get_db)):
    doc, _ = signing.resolve_candidate_token(db, token)
    html = service.file_bytes(doc, "html").decode("utf-8")
    signing.mark_viewed(db, doc, None, actor_type="candidate")
    return {**_public_view(db, doc), "html": html}


@public_router.get("/sign/{token}/pdf")
@limiter.limit("30/minute")
def public_sign_pdf(request: Request, token: str, db: Session = Depends(get_db)):
    doc, _ = signing.resolve_candidate_token(db, token)
    data = service.file_bytes(doc, "original")
    state.add_event(db, doc, "downloaded", actor_type="candidate", detail={"file": "original"})
    db.commit()
    return _file_response(data, f"{doc.document_number}.pdf", inline=False)


@public_router.post("/sign/{token}/otp")
@limiter.limit("5/minute")
def public_sign_otp(request: Request, token: str, db: Session = Depends(get_db)):
    doc, tok = signing.resolve_candidate_token(db, token)
    if doc.status != "ISSUED":
        raise HTTPException(409, "This document can no longer be signed.")
    return signing.send_otp(db, doc, party="candidate", signer_key=f"email:{(doc.recipient_email or '').lower()}",
                            email=doc.recipient_email, first_name=(doc.recipient_name or "").split(" ")[0])


@public_router.post("/sign/{token}/sign")
@limiter.limit("10/minute")
def public_sign(request: Request, token: str, body: S.SignRequest, db: Session = Depends(get_db)):
    doc, tok = signing.resolve_candidate_token(db, token)
    signing.sign(db, doc, party="candidate", signer_employee=None, signer_email=doc.recipient_email, typed_name=body.typed_name,
                 method=body.method, drawn=body.drawn_signature, consent_version=body.consent_version, otp_code=body.otp_code,
                 ip=get_client_ip(request), user_agent=_ua(request), token=tok)
    return {"status": doc.status, "document_number": doc.document_number, "signed": True}


@public_router.post("/sign/{token}/decline")
@limiter.limit("10/minute")
def public_decline(request: Request, token: str, body: S.DeclineRequest, db: Session = Depends(get_db)):
    doc, tok = signing.resolve_candidate_token(db, token)
    signing.decline(db, doc, party="candidate", signer_email=doc.recipient_email, reason=body.reason, ip=get_client_ip(request),
                    user_agent=_ua(request), token=tok)
    return {"status": doc.status, "document_number": doc.document_number, "declined": True}


@public_router.get("/verify/{document_number}")
@limiter.limit("20/minute")
def public_verify(request: Request, document_number: str, h: str = Query(..., min_length=16, max_length=16, pattern="^[0-9a-fA-F]{16}$"),
                  db: Session = Depends(get_db)):
    """Is this the document we issued? Needs the first 16 hex characters of the file's SHA-256; reveals nothing else."""
    invalid = {"valid": False}
    if len(document_number) > 40:
        return invalid
    doc = db.query(GeneratedDocument).filter(GeneratedDocument.document_number == document_number).first()
    h = h.lower()
    if doc is None or doc.status not in access.POST_ISSUE + ("LEGAL_HOLD",) or doc.audience == "HR_INTERNAL":
        return invalid
    if not any((x or "")[:16] == h for x in (doc.pdf_sha256, doc.executed_pdf_sha256)):
        return invalid
    entity = db.get(EmployerEntity, doc.entity_id) if doc.entity_id else None
    return {"valid": True, "issuer_legal_name": getattr(entity, "legal_name", None), "template_title": doc.title,
            "issued_on": doc.issued_at.date().isoformat() if doc.issued_at else None,
            "status": doc.status if doc.status != "LEGAL_HOLD" else (doc.status_before_hold or "ISSUED")}
