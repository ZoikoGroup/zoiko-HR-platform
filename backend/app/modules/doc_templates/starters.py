"""Zoiko starter content for business templates.

Source of truth: `seeds/content/<FAMILY>/<ID>.json` (one file per template) and `seeds/content/clauses*.json` (starter clause
text). `seeds/load_starters.py` persists them as versioned `template_starters` / `template_starter_clauses` rows; a starter is
never ACTIVE and never issued. Tenants (TENANT_ATTESTED) and Zoiko Legal (PLATFORM_COUNSEL) create variants from it.

Seed file shape:

    {"canonical_id", "output_mode", "execution_mode", "audience", "approval_policy",
     "field_contract": {"required": [], "optional": []},
     "clause_rules": {"mandatory": [], "optional": [], "prohibited": []},
     "blocks": [...], "locked_block_ids": [...], "email_attachment_allowed": bool,
     "reminder_days": [3, 1], "response_days": 7, "applicability": {...}, "employer_signs_first": false}

Letterheads, signature blocks, declarations and blocks whose id starts with `rights_` or `privacy_` are always locked.
tests/doc_templates/test_dt_starters.py validates every starter against the field registry and block grammar.
"""
from __future__ import annotations

import copy
import json
from pathlib import Path
from typing import Optional

CONTENT_DIR = Path(__file__).parent / "seeds" / "content"
STARTER_NOTE = "Starter draft. Review and adapt to your jurisdiction, contracts and policies before release."
LOCKED_TYPES = {"letterhead", "signature_block", "declaration"}
LOCKED_PREFIXES = ("rights_", "privacy_")
META_KEYS = ("output_mode", "execution_mode", "audience", "approval_policy")


def _normalise(raw: dict) -> dict:
    blocks = copy.deepcopy(raw["blocks"])
    locked_ids = set(raw.get("locked_block_ids") or [])
    for i, b in enumerate(blocks):
        b.setdefault("id", f"b{i + 1}")
        if b["type"] in LOCKED_TYPES or str(b["id"]).startswith(LOCKED_PREFIXES) or b["id"] in locked_ids:
            b["locked"] = True
    options = {"email_attachment": bool(raw.get("email_attachment_allowed")),
               "reminder_days": list(raw.get("reminder_days") or []),
               "response_days": raw.get("response_days")}
    if raw.get("employer_signs_first"):
        options["employer_signs_first"] = True
    return {
        "canonical_id": raw["canonical_id"],
        "meta": {k: raw[k] for k in META_KEYS if raw.get(k)},
        "content": blocks,
        "field_contract": {"required": list(raw["field_contract"].get("required") or []),
                           "optional": list(raw["field_contract"].get("optional") or [])},
        "clause_rules": {k: list((raw.get("clause_rules") or {}).get(k) or []) for k in ("mandatory", "optional", "prohibited")},
        "options": {k: v for k, v in options.items() if v not in (None, [])} | {"email_attachment": options["email_attachment"]},
        "applicability": raw.get("applicability"),
        "note": STARTER_NOTE,
    }


def load_files() -> dict:
    out = {}
    if not CONTENT_DIR.exists():
        return out
    for path in sorted(CONTENT_DIR.glob("HR-*/*.json")):
        raw = json.loads(path.read_text(encoding="utf-8"))
        if raw.get("canonical_id") != path.stem:
            raise ValueError(f"{path}: canonical_id does not match the file name")
        out[path.stem] = {**_normalise(raw), "source_path": str(path.relative_to(CONTENT_DIR.parent.parent)).replace("\\", "/")}
    return out


def load_clause_file() -> tuple[dict, list]:
    """Every `clauses*.json` (one per prompt) merged: starter clause text, and the keys that deliberately have none."""
    starter_text, none = {}, []
    for path in sorted(CONTENT_DIR.glob("clauses*.json")) if CONTENT_DIR.exists() else []:
        data = json.loads(path.read_text(encoding="utf-8"))
        for key, value in (data.get("starter_text") or {}).items():
            if key in starter_text:
                raise ValueError(f"{path.name}: clause {key} has starter text in more than one file")
            starter_text[key] = value
        none += [k for k in data.get("no_starter_text") or [] if k not in none]
    return starter_text, none


STARTERS: dict[str, dict] = load_files()
STARTER_CLAUSES, NO_STARTER_TEXT = load_clause_file()


def latest(db, canonical_id: str) -> Optional[dict]:
    """The newest starter revision for a template: the database copy when loaded, else the seed file (dev and tests)."""
    if db is not None:
        from app.modules.doc_templates.models import TemplateStarter
        row = (db.query(TemplateStarter).filter(TemplateStarter.canonical_id == canonical_id)
               .order_by(TemplateStarter.revision.desc()).first())
        if row is not None:
            return {**row.payload, "revision": row.revision}
    s = STARTERS.get(canonical_id)
    return {**s, "revision": None} if s else None


def starter_clause(db, clause_key: str) -> Optional[dict]:
    if db is not None:
        from app.modules.doc_templates.models import TemplateStarterClause
        row = (db.query(TemplateStarterClause).filter(TemplateStarterClause.clause_key == clause_key)
               .order_by(TemplateStarterClause.revision.desc()).first())
        if row is not None:
            return {"clause_key": clause_key, "title": row.title, "text": row.text, "note": row.note, "revision": row.revision}
    c = STARTER_CLAUSES.get(clause_key)
    return {"clause_key": clause_key, **c, "revision": None} if c else None
