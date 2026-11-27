"""The onboarding package's 10 documents as templates of the template engine.

* Platform starters: ``seeds/content/HR-PKG/PKG-<template id>.json`` (written once from the old Python builders by
  ``scripts/package_starters_generate.py``), loaded as ``template_starters`` rows like every other starter.
* Organisation versions: ordinary ``template_variants`` owned by the organisation, created with "Customise this document",
  reviewed, legally approved and released through the existing flow (content.py).

Canonical ids. The package documents keep their template ids (HR-HIR-011, HR-CON-101 …) on the documents a hire receives.
Their *template* rows use the id with a ``PKG-`` prefix (``PKG-HR-HIR-011``), because two of those ids (HR-HIR-011, HR-ORG-005)
are already templates in the 566 catalogue with different content (the recruitment offer letter and the job description
template). The prefix keeps the package's starters, variants and resolution separate from them.
"""
from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path
from typing import Optional

from app.modules.doc_templates import blocks as B
from app.modules.doc_templates import package_blocks as PB

PKG_PREFIX = "PKG-"
FAMILY = "HR-PKG"
STARTER_DIR = Path(__file__).parent / "seeds" / "content" / FAMILY
STARTER_META = ("category", "template_id", "title", "family_id", "doc_type", "risk", "sensitivity", "mode", "orientation",
                "pages", "signers", "initials", "optional_fields")


def canonical_for(template_id: str) -> str:
    return template_id if template_id.startswith(PKG_PREFIX) else PKG_PREFIX + template_id


def is_package(canonical_id: Optional[str]) -> bool:
    return bool(canonical_id) and str(canonical_id).startswith(PKG_PREFIX)


# ── starter files ────────────────────────────────────────────────────────────────────────────────────────────────────
@lru_cache(maxsize=1)
def starter_files() -> dict:
    """category -> starter payload (from the seed files)."""
    out = {}
    if not STARTER_DIR.exists():
        return out
    for path in sorted(STARTER_DIR.glob("*.json")):
        raw = json.loads(path.read_text(encoding="utf-8"))
        if raw.get("canonical_id") != path.stem:
            raise ValueError(f"{path}: canonical_id does not match the file name")
        out[raw["category"]] = raw
    return out


def starter_for(category: str) -> Optional[dict]:
    return starter_files().get(category)


def starter_by_canonical(canonical_id: str) -> Optional[dict]:
    return next((s for s in starter_files().values() if s["canonical_id"] == canonical_id), None)


@lru_cache(maxsize=32)
def _starter_package_blocks(category: str) -> tuple:
    s = starter_for(category)
    return tuple(PB.to_package(s["blocks"])) if s else ()


def starter_package_blocks(category: str) -> Optional[list]:
    """The platform default of a package document, as renderer blocks (a fresh copy each call)."""
    blocks = _starter_package_blocks(category)
    return json.loads(json.dumps(list(blocks))) if blocks else None


def starter_payload(s: dict) -> dict:
    """The TemplateStarter payload of a package starter (the shape starters.latest() returns)."""
    return {"canonical_id": s["canonical_id"], "meta": {"package": True, **{k: s.get(k) for k in STARTER_META}},
            "content": s["blocks"], "field_contract": {"required": [], "optional": []},
            "clause_rules": {"mandatory": [], "optional": [], "prohibited": []},
            "options": {"package": True, "email_attachment": False}, "applicability": None,
            "note": "Zoiko default onboarding package document."}


def starter_checksum(category: str) -> Optional[str]:
    s = starter_for(category)
    return B.checksum(starter_payload(s)) if s else None


# ── database rows (definitions and starter revisions) ────────────────────────────────────────────────────────────────
def ensure_definitions(db, only: Optional[str] = None) -> int:
    """A template definition per package document (outside the 566 register; family HR-PKG). Idempotent."""
    from app.modules.doc_templates.models import TemplateDefinition
    added = 0
    for s in starter_files().values():
        if only and s["canonical_id"] != only:
            continue
        d = db.get(TemplateDefinition, s["canonical_id"])
        if d is None:
            db.add(TemplateDefinition(
                canonical_id=s["canonical_id"], family_id=FAMILY, title=s["title"], kind=s["doc_type"], legal_risk=s["risk"],
                sensitivity=s["sensitivity"], catalogue_status="ONBOARDING_PACKAGE", implemented=True, output_mode="DOCUMENT",
                execution_mode="SIGN_CANDIDATE" if s["mode"] == "SIGN" else "NONE", audience="COUNTERPARTY",
                approval_policy=s["risk"], source_spec="HR-ONBOARDING-PACKAGE v2.0"))
            added += 1
    if added:
        db.flush()
    return added


def load_starters(db, only: Optional[str] = None) -> list:
    """Persist the package starters as versioned template_starters rows (a changed file adds a revision). `only`: one
    canonical id (what "Customise this document" needs) instead of all ten."""
    from app.modules.doc_templates.models import TemplateStarter
    ensure_definitions(db, only)
    added = []
    for s in starter_files().values():
        if only and s["canonical_id"] != only:
            continue
        payload = starter_payload(s)
        digest = B.checksum(payload)
        last = (db.query(TemplateStarter).filter(TemplateStarter.canonical_id == s["canonical_id"])
                .order_by(TemplateStarter.revision.desc()).first())
        if last is not None and last.checksum == digest:
            continue
        db.add(TemplateStarter(canonical_id=s["canonical_id"], revision=(last.revision + 1) if last else 1, checksum=digest,
                               payload=payload, source_path=f"seeds/content/{FAMILY}/{s['canonical_id']}.json"))
        added.append(s["canonical_id"])
    db.flush()
    return added


_REVISION_BY_CHECKSUM: dict = {}     # (canonical id, checksum) -> revision: a loaded starter's revision never changes


def starter_revision(db, category: str) -> Optional[int]:
    """The template_starters revision that matches the current starter file (None before it is loaded)."""
    s = starter_for(category)
    if s is None or db is None:
        return None
    key = (s["canonical_id"], starter_checksum(category))
    if key in _REVISION_BY_CHECKSUM:
        return _REVISION_BY_CHECKSUM[key]
    from app.modules.doc_templates.models import TemplateStarter
    row = (db.query(TemplateStarter.revision).filter(TemplateStarter.canonical_id == s["canonical_id"],
                                                     TemplateStarter.checksum == key[1])
           .order_by(TemplateStarter.revision.desc()).first())
    if row is None:
        return None                  # not loaded yet: asked again next time
    _REVISION_BY_CHECKSUM[key] = row[0]
    return row[0]
