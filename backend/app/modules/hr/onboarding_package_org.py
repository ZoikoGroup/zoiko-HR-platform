"""The organisation's own onboarding package: which documents, which template version, for whom.

* ``org_package_documents`` lists the package per organisation. It is seeded on first use with the 10 platform documents
  exactly as before (all on, their usual modes). Offer Letter and Employment Contract are mandatory (cannot be switched off).
  The organisation can switch documents off, change their mode, limit them to some engagement profiles, reorder them, and
  add its own released templates (``source='org_template'``, category ``org:<canonical id>``).
* Which content a hire's document uses (resolution order):
    1. the version pinned on the package row, if it is released (ACTIVE);
    2. else the organisation's released version of that template (pack for the hire's country first);
    3. else the platform starter (seeds/content/HR-PKG).
  Drafts, suspended and retired versions are never used for a real hire (previews of a draft are watermarked).
* Version safety: what a document was issued from is recorded when it is issued (``source``); re-opening, re-rendering a filled
  form, downloading or signing always uses that recorded version, never the latest template.
"""
from __future__ import annotations

import hashlib
import json
import logging
from datetime import date, datetime
from typing import Optional

from fastapi import HTTPException
from sqlalchemy import or_

from app.modules.doc_templates import package_blocks as PB
from app.modules.doc_templates import package_templates as PT
from app.modules.doc_templates.models import JurisdictionPack, TemplateDefinition, TemplateStarter, TemplateVariant
from app.modules.hr import onboarding_package_content as C
from app.modules.hr.docs_setup_models import OrgPackageDocument

logger = logging.getLogger("zoiko.onboarding.package.org")

MANDATORY = {"offer_letter": "Every new hire needs an offer letter.",
             "employment_contract": "Every new hire needs an employment contract."}
MODES = ("SIGN", "ACKNOWLEDGE", "COMPLETE", "VOLUNTARY", "INFO")
SIGNER_PARTIES = ("employer", "candidate", "witness", "reviewer")
ORG_PREFIX = "org:"
LIVE = "ACTIVE"


def is_org_category(category: Optional[str]) -> bool:
    return bool(category) and str(category).startswith(ORG_PREFIX)


def is_package_category(category: Optional[str]) -> bool:
    return bool(category) and (category in C.DOCS or is_org_category(category))


def org_canonical_prefix(organization_id: int) -> str:
    return f"ORG{organization_id}-"


def is_org_template(canonical_id: Optional[str], organization_id: Optional[int] = None) -> bool:
    if not canonical_id or not str(canonical_id).startswith("ORG"):
        return False
    return organization_id is None or str(canonical_id).startswith(org_canonical_prefix(organization_id))


def _cache(db, key, build):
    from app.modules.hr import onboarding_package as P
    return P._cached(db, key, build)


# ── package rows ─────────────────────────────────────────────────────────────────────────────────────────────────────
def ensure_rows(db, organization_id: int, *, persist: bool = True) -> list[OrgPackageDocument]:
    """The organisation's package rows. A platform document with no saved row gets today's default (on, its usual mode).
    persist=True saves those defaults (before a change); reads use them unsaved, so opening a page never writes."""
    rows = (db.query(OrgPackageDocument).filter(OrgPackageDocument.organization_id == organization_id)
            .order_by(OrgPackageDocument.sort_order, OrgPackageDocument.id).all())
    have = {r.category for r in rows}
    added = False
    for i, d in enumerate(C.documents()):
        if d["category"] in have:
            continue
        row = OrgPackageDocument(organization_id=organization_id, source="platform", category=d["category"],
                                 canonical_id=PT.canonical_for(d["template_id"]), title=d["title"], mode=d["mode"], enabled=True,
                                 mandatory=d["category"] in MANDATORY, applies_to_engagement_slugs=[],
                                 excluded_engagement_slugs=[], sort_order=(i + 1) * 10)
        if persist:
            db.add(row)
            added = True
        rows.append(row)
    if added:
        db.commit()                        # the defaults become the organisation's saved package before it is changed
    rows.sort(key=lambda r: (r.sort_order, r.id or 0))
    return rows


def rows_for(db, organization_id: int) -> list[OrgPackageDocument]:
    return _cache(db, ("org_package_rows", organization_id), lambda: ensure_rows(db, organization_id, persist=False))


def row_for(db, organization_id: int, category: str) -> Optional[OrgPackageDocument]:
    return next((r for r in rows_for(db, organization_id) if r.category == category), None)


def _org_definition(db, canonical_id: str) -> Optional[TemplateDefinition]:
    return db.get(TemplateDefinition, canonical_id)


def meta(db, organization_id: int, category: str, row: Optional[OrgPackageDocument] = None) -> dict:
    """The document's description (like onboarding_package_content.DOCS[category]) with the organisation's mode."""
    row = row or row_for(db, organization_id, category)
    if category in C.DOCS:
        d = {k: v for k, v in C.DOCS[category].items() if k != "builder"}
        if row is not None:
            d["mode"] = row.mode
        d["canonical_id"] = PT.canonical_for(d["template_id"])
        d["source"] = "platform"
        return d
    if row is None or not is_org_category(category):
        raise HTTPException(404, "Unknown package document.")
    definition = _org_definition(db, row.canonical_id)
    title = row.title or (definition.title if definition else row.canonical_id)
    signers = ", ".join(s.title() for s in (row.signers or [])) or "—"
    return {"category": category, "title": title, "template_id": row.canonical_id, "canonical_id": row.canonical_id,
            "family_id": (definition.family_id if definition else "ORG"), "doc_type": (definition.kind if definition else "RECORD"),
            "risk": (definition.legal_risk if definition else "L1"), "sensitivity": (definition.sensitivity if definition else "C2"),
            "mode": row.mode, "orientation": "portrait", "pages": "", "signers": signers, "initials": False, "source": "org_template",
            "party_signers": list(row.signers or [])}


def documents_for_org(db, organization_id: int, *, include_disabled: bool = False) -> list[dict]:
    out = []
    for r in rows_for(db, organization_id):
        if not include_disabled and not r.enabled:
            continue
        if r.source == "org_template" and not include_disabled and resolve_org_variant(db, r) is None:
            continue                       # an org document whose template is not released (or was withdrawn): skipped
        try:
            out.append(meta(db, organization_id, r.category, r))
        except HTTPException:
            continue
    return out


def applies_to(row: OrgPackageDocument, engagement_slug: Optional[str]) -> bool:
    only = [s for s in (row.applies_to_engagement_slugs or []) if s]
    excluded = [s for s in (row.excluded_engagement_slugs or []) if s]
    if only and (engagement_slug or "") not in only:
        return False
    if excluded and (engagement_slug or "") in excluded:
        return False
    return True


def documents_for_hire(db, hire) -> list[dict]:
    """The documents this hire's package contains now: enabled, for the hire's engagement profile, template usable."""
    from app.modules.hr import onboarding_package as P

    def build():
        eng, _source = P.engagement_with_source(db, hire)
        slug = (eng or {}).get("slug")
        out = []
        for r in rows_for(db, hire.organization_id):
            if not r.enabled or not applies_to(r, slug):
                continue
            if r.source == "org_template" and resolve_org_variant(db, r) is None:
                continue
            out.append(meta(db, hire.organization_id, r.category, r))
        return out
    return _cache(db, ("hire_documents", hire.id), build)


def known_categories(db, organization_id: int) -> list[str]:
    """Every category the organisation's package has or had (rows already issued keep theirs even if switched off)."""
    cats = list(C.CATEGORIES)
    cats += [r.category for r in rows_for(db, organization_id) if r.category not in cats]
    return cats


# ── template resolution ──────────────────────────────────────────────────────────────────────────────────────────────
def _live(v: Optional[TemplateVariant], on: Optional[date] = None) -> bool:
    on = on or date.today()
    return (v is not None and v.status == LIVE and (v.effective_from is None or v.effective_from <= on)
            and (v.effective_to is None or v.effective_to >= on))


def _pack_ok(db, v: TemplateVariant) -> bool:
    p = db.get(JurisdictionPack, v.pack_id)
    return p is not None and p.status == "ACTIVE"


def released_variant(db, organization_id: int, canonical_id: str, country: Optional[str] = None) -> Optional[TemplateVariant]:
    """The organisation's released (ACTIVE, in effect, active pack) version of a package template; the pack for `country`
    first. Platform-owned rows are never package content (the platform default is the starter)."""
    vs = (db.query(TemplateVariant).filter(TemplateVariant.canonical_id == canonical_id,
                                           TemplateVariant.owner_organization_id == organization_id,
                                           TemplateVariant.status == LIVE, TemplateVariant.language == "en")
          .order_by(TemplateVariant.version.desc()).all())
    vs = [v for v in vs if _live(v) and _pack_ok(db, v)]
    if not vs:
        return None
    if country:
        for v in vs:
            p = db.get(JurisdictionPack, v.pack_id)
            if p is not None and (p.country or "").upper() == country.upper():
                return v
    return vs[0]


def resolve_org_variant(db, row: OrgPackageDocument, country: Optional[str] = None) -> Optional[TemplateVariant]:
    if row.variant_id:
        v = db.get(TemplateVariant, row.variant_id)
        if v is not None and v.owner_organization_id == row.organization_id and _live(v) and _pack_ok(db, v):
            return v
        if row.source == "org_template":
            return None                    # a pinned own document that is not released: never sent
    return released_variant(db, row.organization_id, row.canonical_id, country)


def _hire_country(db, hire) -> Optional[str]:
    from app.modules.hr import onboarding_package as P
    _cand, offer, _req = P._offer_for(db, hire)
    return (getattr(offer, "work_country", None) if offer is not None else None) or hire.work_country


def _content_checksum(blocks: list) -> str:
    return hashlib.sha256(json.dumps(blocks, sort_keys=True, ensure_ascii=False, default=str).encode("utf-8")).hexdigest()


def resolve(db, hire, category: str) -> tuple[Optional[list], dict]:
    """(renderer blocks, source) for a hire's document now. Blocks None = the platform default built in (v1 builders)."""
    def build():
        row = row_for(db, hire.organization_id, category)
        v = resolve_org_variant(db, row, _hire_country(db, hire)) if row is not None else None
        if v is not None:
            blocks = PB.to_package(v.content)
            return blocks, {"kind": "variant", "variant_id": v.id, "variant_version": v.version, "variant_checksum": v.checksum,
                            "canonical_id": v.canonical_id, "content_checksum": _content_checksum(blocks)}
        if is_org_category(category):
            raise HTTPException(409, "This document's template is not released.")
        blocks = C.blocks_for(category)
        return blocks, {"kind": "starter", "canonical_id": PT.canonical_for(C.DOCS[category]["template_id"]),
                        "starter_revision": PT.starter_revision(db, category), "starter_checksum": PT.starter_checksum(category),
                        "content_checksum": _content_checksum(blocks)}
    blocks, source = _cache(db, ("resolved", hire.id, category), build)
    return json.loads(json.dumps(blocks)), dict(source)


def content_for_source(db, category: str, source: Optional[dict]) -> Optional[list]:
    """The exact content a document was issued from (None: not recorded — issued before versions were recorded)."""
    if not source:
        return None
    if source.get("kind") == "variant" and source.get("variant_id"):
        v = db.get(TemplateVariant, source["variant_id"])
        return PB.to_package(v.content) if v is not None else None
    if source.get("kind") == "starter":
        if source.get("starter_checksum") == PT.starter_checksum(category):
            return C.blocks_for(category)
        row = (db.query(TemplateStarter).filter(TemplateStarter.canonical_id == source.get("canonical_id"),
                                                TemplateStarter.checksum == source.get("starter_checksum")).first())
        if row is not None:
            return PB.to_package(row.payload["content"])
    return None


# ── "Customise this document" and the state of each document's template ──────────────────────────────────────────────
def variant_state(db, organization_id: int, canonical_id: str) -> dict:
    """What the settings row says: Using Zoiko default / Your version vN – released / Draft in review."""
    vs = (db.query(TemplateVariant).filter(TemplateVariant.canonical_id == canonical_id,
                                           TemplateVariant.owner_organization_id == organization_id)
          .order_by(TemplateVariant.version.desc()).all())
    live = next((v for v in vs if _live(v) and _pack_ok(db, v)), None)
    working = next((v for v in vs if v.status in ("IN_DRAFT", "LEGAL_REVIEW", "LEGAL_APPROVED", "RELEASE_TESTED")), None)
    if live is not None:
        label = f"Your version v{live.version} – released"
    elif any(v.status == LIVE for v in vs):
        label = "Your version is released but its jurisdiction pack is not active"
    else:
        label = "Using Zoiko default"
    if working is not None:
        label += f" · v{working.version} " + {"IN_DRAFT": "draft", "LEGAL_REVIEW": "in legal review",
                                               "LEGAL_APPROVED": "approved – waiting for release",
                                               "RELEASE_TESTED": "being released"}[working.status]
    return {"label": label, "released_variant_id": live.id if live else None, "released_version": live.version if live else None,
            "working_variant_id": working.id if working else None, "working_status": working.status if working else None,
            "working_version": working.version if working else None}


def _org_country(db, organization_id: int) -> str:
    from app.core import regions
    from app.modules.hr import company_profile as CP
    from app.modules.hr.models import Organization
    profile = CP.get_profile(db, organization_id)
    for raw in (profile.get("jurisdiction_country"), profile.get("country"), getattr(db.get(Organization, organization_id), "country", None)):
        code = (regions.country_code(raw) or "").upper() if raw else ""
        if code and regions.country_name(code):
            return code
    return "GB"


def tenant_pack(db, actor, country: Optional[str] = None) -> JurisdictionPack:
    """The organisation's own jurisdiction pack for templates (created as a draft for its country when it has none)."""
    org_id = actor.organization_id
    country = (country or _org_country(db, org_id)).upper()
    packs = (db.query(JurisdictionPack).filter(JurisdictionPack.scope_type == "TENANT", JurisdictionPack.owner_organization_id == org_id,
                                               JurisdictionPack.status != "RETIRED").order_by(JurisdictionPack.id).all())
    for p in packs:
        if p.country == country:
            return p
    if packs:
        return packs[0]
    from app.modules.doc_templates import content
    return content.create_pack(db, actor, {"country": country, "notes": "Created for the organisation's onboarding documents."})


def customise_block(db, organization_id: int, category: str) -> Optional[str]:
    """Why the organisation cannot have its own version of this package document (None: it can). Organisation-approved
    templates follow the platform's rules: high-risk (L3) documents such as the contract and the NDA need the platform
    switch HR_TEMPLATES_TENANT_ATTESTATION_L3_ENABLED, and every risk level needs the plan feature and the setting."""
    from app.config import settings
    from app.modules.doc_templates import preflight
    if category not in C.DOCS:
        return None
    risk = C.DOCS[category]["risk"]
    if preflight.tenant_attestation_allowed(db, organization_id, risk):
        return None
    if not settings.TEMPLATES_TENANT_ATTESTATION_ENABLED:
        return "Organisation-approved templates are switched off on this platform."
    if risk == "L3" and not settings.TEMPLATES_TENANT_ATTESTATION_L3_ENABLED:
        return ("High-risk documents (employment contract, NDA, affidavit) cannot have an organisation version on this platform "
                "yet. Ask your platform administrator to allow organisation-approved high-risk templates. Until then the Zoiko "
                "version is used and your file only supplies settings.")
    if not preflight.org_settings(db, organization_id).tenant_attestation_enabled:
        return "Organisation-approved templates are switched off in your document template settings."
    return "Your plan does not include organisation-approved templates."


def customise(db, actor, category: str) -> TemplateVariant:
    """Start (or reopen) the organisation's own version of a package document, from its released version or the Zoiko
    default, as an IN_DRAFT variant that goes through review, legal approval and release."""
    from app.modules.doc_templates import access, content
    access.require_hr(actor)
    if category not in C.DOCS:
        raise HTTPException(404, "Unknown package document.")
    blocked = customise_block(db, actor.organization_id, category)
    if blocked:
        raise HTTPException(403, {"code": "CUSTOMISE_NOT_ALLOWED", "message": blocked})
    cid = PT.canonical_for(C.DOCS[category]["template_id"])
    PT.load_starters(db, only=cid)
    st = variant_state(db, actor.organization_id, cid)
    if st["working_variant_id"]:
        return db.get(TemplateVariant, st["working_variant_id"])
    pack = tenant_pack(db, actor)
    db.commit()
    return content.create_tenant_variant(db, actor, canonical_id=cid, pack_id=pack.id, language="en",
                                         from_variant_id=st["released_variant_id"])


# ── Settings › "Documents in your onboarding package" ────────────────────────────────────────────────────────────────
def _engagement_slugs(db, organization_id: int) -> set:
    from app.modules.hr import onboarding_profiles as PR
    return {p.get("slug") for p in PR.engagement_profiles(db, organization_id) if p.get("slug")}


def definition_exists(db, canonical_id: str) -> bool:
    return db.get(TemplateDefinition, canonical_id) is not None


def _row_view(db, organization_id: int, r: OrgPackageDocument) -> dict:
    if r.category in C.DOCS or definition_exists(db, r.canonical_id):
        d = meta(db, organization_id, r.category, r)
    else:
        d = {"title": r.title or r.canonical_id, "template_id": r.canonical_id}
    state = variant_state(db, organization_id, r.canonical_id)
    warning = None
    if r.source == "org_template" and resolve_org_variant(db, r) is None:
        warning = ("This document's template is not released (or was suspended or retired), so it is not sent to new "
                   "hires. Release a version to include it again.")
    return {"category": r.category, "canonical_id": r.canonical_id, "source": r.source, "title": d.get("title"),
            "template_id": d.get("template_id"), "mode": r.mode, "mode_label": C.MODE_LABELS.get(r.mode, r.mode),
            "enabled": bool(r.enabled), "mandatory": bool(r.mandatory), "mandatory_reason": MANDATORY.get(r.category),
            "applies_to_engagement_slugs": list(r.applies_to_engagement_slugs or []),
            "excluded_engagement_slugs": list(r.excluded_engagement_slugs or []), "signers": list(r.signers or []),
            "sort_order": r.sort_order, "variant_id": r.variant_id, "template_state": state, "warning": warning,
            "can_customise": r.source == "platform", "risk": d.get("risk"),
            "customise_blocked": customise_block(db, organization_id, r.category) if r.source == "platform" else None}


def settings_documents(db, organization_id: int) -> dict:
    from app.modules.hr import onboarding_profiles as PR
    rows = rows_for(db, organization_id)
    return {"documents": [_row_view(db, organization_id, r) for r in rows],
            "modes": [{"value": m, "label": C.MODE_LABELS[m]} for m in MODES],
            "signer_parties": list(SIGNER_PARTIES),
            "engagement_profiles": [{"slug": p.get("slug"), "name": p.get("name") or p.get("slug")}
                                    for p in PR.engagement_profiles(db, organization_id) if p.get("slug")],
            "addable_templates": addable_templates(db, organization_id)}


def _clean_slugs(value, known: set, label: str) -> list:
    if value in (None, ""):
        return []
    if not isinstance(value, list) or not all(isinstance(s, str) for s in value):
        raise HTTPException(422, f"{label} must be a list of engagement profile slugs.")
    unknown = [s for s in value if s not in known]
    if unknown:
        raise HTTPException(422, f"Unknown engagement profile: {', '.join(unknown)}.")
    return list(dict.fromkeys(value))


def _clean_signers(value) -> list:
    if value in (None, ""):
        return []
    if not isinstance(value, list) or any(s not in SIGNER_PARTIES for s in value):
        raise HTTPException(422, f"Signers must be chosen from {', '.join(SIGNER_PARTIES)}.")
    return list(dict.fromkeys(value))


BOTH_AUDIENCES = "Choose either 'only these' or 'all except these' engagement profiles, not both."


def update_documents(db, actor, items: list) -> dict:
    """Switch documents on/off, change their mode, audience and order. Affects future sends only: documents already sent stay
    with the hire. Offer Letter and Employment Contract cannot be switched off."""
    from app.modules.doc_templates import access
    access.require_hr(actor)
    org_id = actor.organization_id
    if not isinstance(items, list):
        raise HTTPException(422, "documents must be a list.")
    by_cat = {r.category: r for r in ensure_rows(db, org_id)}
    known = _engagement_slugs(db, org_id)
    changed = []
    for item in items:
        if not isinstance(item, dict) or item.get("category") not in by_cat:
            raise HTTPException(422, f"Unknown package document: {item.get('category') if isinstance(item, dict) else item!r}.")
        r = by_cat[item["category"]]
        name = r.title or r.category
        if "enabled" in item:
            on = bool(item["enabled"])
            if not on and r.mandatory:
                raise HTTPException(422, f"{name} cannot be switched off: {MANDATORY.get(r.category, 'it is mandatory')}")
            r.enabled = on
        if "mode" in item:
            if item["mode"] not in MODES:
                raise HTTPException(422, f"Mode must be one of {', '.join(MODES)}.")
            if r.mandatory and item["mode"] != "SIGN":
                raise HTTPException(422, f"{name} is always signed.")
            r.mode = item["mode"]
        if "applies_to_engagement_slugs" in item:
            r.applies_to_engagement_slugs = _clean_slugs(item["applies_to_engagement_slugs"], known, "Send to")
        if "excluded_engagement_slugs" in item:
            r.excluded_engagement_slugs = _clean_slugs(item["excluded_engagement_slugs"], known, "Send to all except")
        if r.mandatory and (r.applies_to_engagement_slugs or r.excluded_engagement_slugs):
            raise HTTPException(422, f"{name} goes to every new hire.")
        if r.applies_to_engagement_slugs and r.excluded_engagement_slugs:
            raise HTTPException(422, BOTH_AUDIENCES)
        if "signers" in item:
            r.signers = _clean_signers(item["signers"])
        if "sort_order" in item:
            try:
                r.sort_order = int(item["sort_order"])
            except (TypeError, ValueError):
                raise HTTPException(422, "sort_order must be a number.")
        r.updated_by = actor.id
        changed.append(r.category)
    db.commit()
    audit(db, actor, "onboarding_package_documents_updated", {"documents": changed})
    return settings_documents(db, org_id)


def audit(db, actor, action: str, details: dict) -> None:
    """One audit event (the organisation's audit log)."""
    try:
        from app.modules.super_admin.activity_service import record_activity
        record_activity(db, action_type=f"settings.{action}", actor=actor, organization_id=actor.organization_id,
                        target_name="Onboarding documents", entity_type="onboarding_settings", details=details)
    except Exception:
        logger.exception("audit %s by %s failed", action, getattr(actor, "id", None))


# ── the organisation's own documents ─────────────────────────────────────────────────────────────────────────────────
def org_definitions(db, organization_id: int) -> list:
    return (db.query(TemplateDefinition).filter(TemplateDefinition.family_id == f"ORG{organization_id}"[:10])
            .order_by(TemplateDefinition.canonical_id).all())


def addable_templates(db, organization_id: int) -> list:
    """The organisation's own templates, with whether each has a released version and is already in the package."""
    in_pkg = {r.canonical_id for r in rows_for(db, organization_id)}
    out = []
    for d in org_definitions(db, organization_id):
        st = variant_state(db, organization_id, d.canonical_id)
        out.append({"canonical_id": d.canonical_id, "title": d.title, "released": bool(st["released_variant_id"]),
                    "state": st["label"], "in_package": d.canonical_id in in_pkg,
                    "working_variant_id": st["working_variant_id"], "released_variant_id": st["released_variant_id"]})
    return out


def add_org_document(db, actor, data: dict, *, session_id: Optional[int] = None, allow_unreleased: bool = False) -> dict:
    """Add one of the organisation's own templates to the package. Normally it must be released first; the setup wizard adds
    drafts it created (allow_unreleased), which stay out of every send until they are released."""
    from app.modules.doc_templates import access
    access.require_hr(actor)
    org_id = actor.organization_id
    data = data or {}
    cid = str(data.get("canonical_id") or "")
    d = db.get(TemplateDefinition, cid)
    if d is None or not is_org_template(cid, org_id):
        raise HTTPException(404, "Template not found.")
    if not allow_unreleased and released_variant(db, org_id, cid) is None:
        raise HTTPException(409, "Release this template before adding it to the package.")
    rows = ensure_rows(db, org_id)
    category = ORG_PREFIX + cid
    if any(r.category == category for r in rows):
        raise HTTPException(409, "This document is already in the package.")
    mode = data.get("mode") or "ACKNOWLEDGE"
    if mode not in MODES:
        raise HTTPException(422, f"Mode must be one of {', '.join(MODES)}.")
    known = _engagement_slugs(db, org_id)
    only = _clean_slugs(data.get("applies_to_engagement_slugs"), known, "Send to")
    excluded = _clean_slugs(data.get("excluded_engagement_slugs"), known, "Send to all except")
    if only and excluded:
        raise HTTPException(422, BOTH_AUDIENCES)
    row = OrgPackageDocument(organization_id=org_id, source="org_template", category=category, canonical_id=cid, title=d.title,
                             mode=mode, enabled=True, mandatory=False, applies_to_engagement_slugs=only,
                             excluded_engagement_slugs=excluded,
                             signers=_clean_signers(data.get("signers")) or (["candidate"] if mode == "SIGN" else []),
                             sort_order=max([r.sort_order for r in rows] or [0]) + 10, updated_by=actor.id,
                             created_by_session_id=session_id)
    db.add(row)
    db.commit()
    audit(db, actor, "onboarding_package_document_added", {"canonical_id": cid, "mode": mode})
    return settings_documents(db, org_id)


def remove_org_document(db, actor, category: str) -> dict:
    """An own document leaves the package (documents already sent stay with the hires)."""
    from app.modules.doc_templates import access
    access.require_hr(actor)
    r = row_for(db, actor.organization_id, category)
    if r is None or r.source != "org_template":
        raise HTTPException(404, "Only your own added documents can be removed. Switch platform documents off instead.")
    db.delete(r)
    db.commit()
    audit(db, actor, "onboarding_package_document_removed", {"category": category})
    return settings_documents(db, actor.organization_id)


def next_org_canonical_id(db, organization_id: int) -> str:
    prefix = org_canonical_prefix(organization_id) + "DOC-"
    n = 0
    for d in org_definitions(db, organization_id):
        tail = d.canonical_id[len(prefix):] if d.canonical_id.startswith(prefix) else ""
        if tail.isdigit():
            n = max(n, int(tail))
    cid = f"{prefix}{n + 1:03d}"
    if len(cid) > 20:
        raise HTTPException(409, "Too many organisation templates.")
    return cid


def create_org_template(db, actor, *, title: str, content: list, risk: str = "L1", sensitivity: str = "C2",
                        kind: str = "RECORD", change_reason: str = "", commit: bool = True) -> TemplateVariant:
    """A new organisation template (its own canonical id, family ORG<org id>) with a first IN_DRAFT version. It is released
    only through review, legal approval and release, like every other template."""
    from app.modules.doc_templates import access
    from app.modules.doc_templates import blocks as B
    from app.modules.doc_templates import content as CT
    access.require_hr(actor)
    title = " ".join(str(title or "").split())[:255]
    if not title:
        raise HTTPException(422, "Give the document a title.")
    if risk not in ("L1", "L2", "L3") or sensitivity not in ("C1", "C2", "C3", "C4"):
        raise HTTPException(422, "Unknown risk or sensitivity level.")
    problems = B.validate_package_content(content)
    if problems:
        raise HTTPException(422, {"code": "INVALID_TEMPLATE", "problems": problems})
    org_id = actor.organization_id
    cid = next_org_canonical_id(db, org_id)
    db.add(TemplateDefinition(canonical_id=cid, family_id=f"ORG{org_id}"[:10], title=title, kind=kind, legal_risk=risk,
                              sensitivity=sensitivity, catalogue_status="ORGANISATION_TEMPLATE", implemented=True,
                              output_mode="DOCUMENT", execution_mode="NONE", audience="COUNTERPARTY", approval_policy=risk,
                              source_spec="ORGANISATION"))
    db.flush()
    pack = tenant_pack(db, actor)
    v = TemplateVariant(canonical_id=cid, pack_id=pack.id, owner_organization_id=org_id, language="en", version=1,
                        status="IN_DRAFT", release_mode="TENANT_ATTESTED", applicability=None, content=content,
                        field_contract={"required": [], "optional": []},
                        clause_rules={"mandatory": [], "optional": [], "prohibited": []},
                        options={"package": True, "email_attachment": False}, authored_by=actor.id,
                        change_reason=change_reason or None, status_changed_at=datetime.utcnow())
    v.checksum = CT.variant_checksum(v)
    db.add(v)
    if commit:
        db.commit()
    else:
        db.flush()
    return v
