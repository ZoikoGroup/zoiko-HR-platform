"""Load counsel-approved PLATFORM_COUNSEL content (Zoiko Legal) from a reviewed JSON bundle.

    python scripts/doc_templates_platform_content.py bundle.json            # validate only (dry run)
    python scripts/doc_templates_platform_content.py bundle.json --apply    # write and activate

There is deliberately no super-admin screen for this: platform accounts never reach tenant data routes, and legal content is
released through a reviewed change, not a click. The bundle names the jurisdiction, the counsel sign-off, and the three
different people who authored, reviewed and released it (separation of duties); the script refuses anything less.

    {
      "pack": {"country": "GB", "region": null, "effective_from": "2027-01-01",
               "signed_off_by_name": "...", "signed_off_by_role": "...", "signed_off_firm": "...",
               "source_references": [{"title": "...", "url": "...", "retrieved_on": "2026-12-01"}],
               "retention_rules": {"hr-onb.default": 6}},
      "people": {"author": "Name A", "reviewer": "Name B", "releaser": "Name C"},
      "clauses": [{"clause_key": "notice_and_termination", "text": "...", "source_references": [...]}],
      "variants": [{"canonical_id": "HR-ONB-007", "language": "en", "content": [...], "field_contract": {...},
                    "clause_rules": {...}, "options": {...}, "applicability": {...}, "change_reason": "..."}]
    }

Activating a pack makes its variants generatable for every tenant whose workers are in that jurisdiction. Each bundle creates
a NEW pack: suspend or retire the previous platform pack for the same jurisdiction separately (otherwise both stay ACTIVE and
preflight keeps choosing the older pack, which is tried first). Issued documents never change either way.
"""
from __future__ import annotations

import json
import sys
from datetime import date, datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))


def problems_of(bundle: dict) -> list[str]:
    from app.modules.doc_templates import blocks, content, registry
    out = []
    pack = bundle.get("pack") or {}
    people = bundle.get("people") or {}
    if not pack.get("country") or not pack.get("signed_off_by_name") or not pack.get("signed_off_firm"):
        out.append("pack needs country, signed_off_by_name and signed_off_firm (counsel sign-off)")
    names = [people.get(k) for k in ("author", "reviewer", "releaser")]
    if not all(names) or len({n.strip().casefold() for n in names if n}) != 3:
        out.append("people.author, people.reviewer and people.releaser must be three different named people")
    known = {e["id"] for e in registry.load_register()}
    for c in bundle.get("clauses") or []:
        out += [f"clause {c.get('clause_key')}: {p}" for p in content.validate_clause_text(c.get("text"))]
    for v in bundle.get("variants") or []:
        cid = v.get("canonical_id")
        if cid not in known:
            out.append(f"unknown template {cid}")
            continue
        if cid in registry.SYSTEM_RECORDS:
            out.append(f"{cid} is an engine record and has no variant content")
        out += [f"{cid}: {p}" for p in blocks.validate_content(v.get("content"), v.get("field_contract"), v.get("clause_rules"))]
        if not (v.get("change_reason") or "").strip():
            out.append(f"{cid}: change_reason is required")
    return out


def apply(db, bundle: dict) -> dict:
    from app.modules.doc_templates import blocks
    from app.modules.doc_templates.models import JurisdictionPack, TemplateClause, TemplateVariant
    p = bundle["pack"]
    review = {"reviewer_name": p["signed_off_by_name"], "reviewer_role": p.get("signed_off_by_role"),
              "reviewer_firm": p["signed_off_firm"], "people": bundle["people"], "loaded_at": datetime.utcnow().isoformat()}
    pack = JurisdictionPack(scope_type="PLATFORM", owner_organization_id=None, country=p["country"].upper(), region=p.get("region"),
                            status="ACTIVE", effective_from=date.fromisoformat(p["effective_from"]) if p.get("effective_from") else date.today(),
                            signed_off_by_name=p["signed_off_by_name"], signed_off_by_role=p.get("signed_off_by_role"),
                            signed_off_firm=p["signed_off_firm"], signed_off_at=datetime.utcnow(),
                            source_references=p.get("source_references") or [], retention_rules=p.get("retention_rules") or {},
                            notes=p.get("notes"), created_at=datetime.utcnow())
    db.add(pack)
    db.flush()
    for c in bundle.get("clauses") or []:
        db.add(TemplateClause(clause_key=c["clause_key"], pack_id=pack.id, owner_organization_id=None, language=c.get("language", "en"),
                              version=1, status="ACTIVE", title=c.get("title"), text=c["text"], source_references=c.get("source_references"),
                              checksum=blocks.checksum(c["clause_key"], c["text"], c.get("language", "en")), effective_from=pack.effective_from))
    created = []
    for v in bundle.get("variants") or []:
        row = TemplateVariant(canonical_id=v["canonical_id"], pack_id=pack.id, owner_organization_id=None, language=v.get("language", "en"),
                              version=1, status="ACTIVE", release_mode="PLATFORM_COUNSEL", applicability=v.get("applicability"),
                              content=v["content"], field_contract=v["field_contract"], clause_rules=v["clause_rules"],
                              options=v.get("options") or {}, effective_from=pack.effective_from, legal_review=review,
                              change_reason=v["change_reason"], status_changed_at=datetime.utcnow())
        row.checksum = blocks.checksum(row.content, row.field_contract, row.clause_rules, row.applicability, row.options, row.language)
        db.add(row)
        created.append(v["canonical_id"])
    db.commit()
    return {"pack_id": pack.id, "variants": created}


def main(argv) -> int:
    if len(argv) < 2:
        print(__doc__)
        return 2
    bundle = json.loads(Path(argv[1]).read_text(encoding="utf-8"))
    problems = problems_of(bundle)
    if problems:
        print("REFUSED:\n- " + "\n- ".join(problems))
        return 1
    if "--apply" not in argv:
        print("Valid. Dry run only: pass --apply to activate.")
        return 0
    from app.database import SessionLocal
    db = SessionLocal()
    try:
        print(apply(db, bundle))
        return 0
    finally:
        db.close()


if __name__ == "__main__":
    sys.exit(main(sys.argv))
