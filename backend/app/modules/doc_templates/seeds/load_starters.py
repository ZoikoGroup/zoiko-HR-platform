"""Load the starter seed files into the database (idempotent, versioned).

    python -m app.modules.doc_templates.seeds.load_starters

A changed seed file adds a new starter revision; unchanged files do nothing. Existing revisions and every variant created from
them are never modified. Also runs at startup (bootstrap.seed).
"""
from __future__ import annotations

import sys

from app.modules.doc_templates import blocks, starters


def load(db) -> dict:
    from app.modules.doc_templates.models import TemplateStarter, TemplateStarterClause
    added, clauses_added = [], []
    for cid, s in starters.load_files().items():
        payload = {k: s[k] for k in ("canonical_id", "meta", "content", "field_contract", "clause_rules", "options", "applicability", "note")}
        digest = blocks.checksum(payload)
        last = (db.query(TemplateStarter).filter(TemplateStarter.canonical_id == cid)
                .order_by(TemplateStarter.revision.desc()).first())
        if last is not None and last.checksum == digest:
            continue
        db.add(TemplateStarter(canonical_id=cid, revision=(last.revision + 1) if last else 1, checksum=digest, payload=payload,
                               source_path=s.get("source_path")))
        added.append(cid)
    texts, _ = starters.load_clause_file()
    for key, c in texts.items():
        digest = blocks.checksum(key, c.get("text"), c.get("title"), c.get("note"))
        last = (db.query(TemplateStarterClause).filter(TemplateStarterClause.clause_key == key)
                .order_by(TemplateStarterClause.revision.desc()).first())
        if last is not None and last.checksum == digest:
            continue
        db.add(TemplateStarterClause(clause_key=key, revision=(last.revision + 1) if last else 1, checksum=digest,
                                     title=c.get("title"), text=c["text"], note=c.get("note")))
        clauses_added.append(key)
    db.commit()
    return {"starters_added": added, "clauses_added": clauses_added}


def main() -> int:
    from app.database import SessionLocal
    from app.modules.doc_templates import registry
    db = SessionLocal()
    try:
        registry.sync_definitions(db)
        print(load(db))
        return 0
    finally:
        db.close()


if __name__ == "__main__":
    sys.exit(main())
