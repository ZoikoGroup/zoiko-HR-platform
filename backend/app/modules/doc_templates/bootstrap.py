"""Idempotent catalogue bootstrap: the 566 definitions and the four SUSPENDED platform research packs.

Runs at startup (leader only) and from tests. It never activates anything and never touches tenant data.
"""
from __future__ import annotations

import logging
from datetime import datetime

from app.modules.doc_templates import registry
from app.modules.doc_templates.models import JurisdictionPack

logger = logging.getLogger("zoiko.doc_templates")

RESEARCH_NOTE = "research seed only — not activated (ZHR-ELT-TPL-001 §4.1). No counsel sign-off."
RESEARCH_PACKS = {
    "GB": [{"title": "Written statement of employment particulars",
            "url": "https://www.gov.uk/employment-contracts-and-conditions/written-statement-of-employment-particulars"}],
    "US": [{"title": "Form I-9 employment eligibility verification", "url": "https://www.uscis.gov/i-9"},
           {"title": "FMLA forms", "url": "https://www.dol.gov/agencies/whd/fmla/forms"}],
    "AU": [{"title": "Fair Work information statements",
            "url": "https://www.fairwork.gov.au/employment-conditions/information-statements"}],
    "SG": [{"title": "Key Employment Terms",
            "url": "https://www.mom.gov.sg/employment-practices/contract-of-service/key-employment-terms"},
           {"title": "Itemised payslips (Zoiko Payroll output, outside the HR catalogue)",
            "url": "https://www.mom.gov.sg/employment-practices/salary/itemised-payslips"}],
}


def seed(db) -> dict:
    touched = registry.sync_definitions(db)
    have = {p.country for p in db.query(JurisdictionPack).filter(JurisdictionPack.scope_type == "PLATFORM").all()}
    added = 0
    for country, sources in RESEARCH_PACKS.items():
        if country not in have:
            db.add(JurisdictionPack(scope_type="PLATFORM", owner_organization_id=None, country=country, status="SUSPENDED",
                                    source_references=sources, notes=RESEARCH_NOTE, created_at=datetime.utcnow()))
            added += 1
    db.commit()
    from app.modules.doc_templates.seeds.load_starters import load as load_starters
    loaded = load_starters(db)
    return {"definitions_touched": touched, "packs_added": added,
            "starters_added": len(loaded["starters_added"]), "starter_clauses_added": len(loaded["clauses_added"])}


def ensure_catalogue() -> None:
    from app.database import SessionLocal
    db = SessionLocal()
    try:
        result = seed(db)
        if any(result.values()):
            logger.info("[startup] template catalogue synced: %s", result)
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()
