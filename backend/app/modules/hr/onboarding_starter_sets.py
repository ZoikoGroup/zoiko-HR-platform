"""Starter sets: which platform onboarding documents a NEW organisation starts with, by its country.

The platform's ten package documents were written for one company's way of working (an Indian exclusivity affidavit, a
daily work report, a velocity report, daily KPIs). An organisation registered from now on starts with the documents that
make sense for every employer in its country, prepared automatically when a new hire is created (and held for HR to review
and send – see onboarding_doc_automation). The rest stay in its package, switched off, ready to switch on.

Existing organisations are never changed: an organisation without a starter marker keeps today's behaviour (every document
on, sent when HR presses Send). An admin can choose to apply a starter set later from Settings; that changes only their own
organisation's platform documents and is audited.

The marker is one `organization_configs` row (MARKER_KEY) written when the organisation is registered.
"""
from __future__ import annotations

import json
import logging
from datetime import datetime
from typing import Optional

from fastapi import HTTPException

from app.modules.hr.models import OrganizationConfig

logger = logging.getLogger("zoiko.onboarding.starter_sets")

MARKER_KEY = "onboarding_package.starter"
SETS = {
    "standard": {
        "name": "Standard employment documents",
        "description": "Offer letter, job description, confidentiality agreement and employment contract.",
        "documents": ["offer_letter", "job_description", "nda", "employment_contract"],
    },
    "india": {
        "name": "Standard employment documents (India)",
        "description": "The standard set plus the job application form and the affidavit of employment exclusivity.",
        "documents": ["offer_letter", "job_description", "nda", "employment_contract", "job_application",
                      "exclusivity_affidavit"],
    },
    "full": {
        "name": "Every platform document",
        "description": "All ten documents, including daily KPIs, the daily work report and the velocity report.",
        "documents": None,                    # every document
    },
}
COUNTRY_SETS = {"IN": "india"}
DEFAULT_TRIGGER = "hire_created"


def set_for_country(country: Optional[str]) -> str:
    return COUNTRY_SETS.get((country or "").upper(), "standard")


def _row(db, organization_id: int):
    return db.query(OrganizationConfig).filter(OrganizationConfig.organization_id == organization_id,
                                               OrganizationConfig.key == MARKER_KEY).first()


def marker(db, organization_id: int) -> Optional[dict]:
    from app.modules.hr import onboarding_package as P

    def load():
        row = _row(db, organization_id)
        if row is None or not row.value:
            return None
        try:
            data = json.loads(row.value)
        except (TypeError, ValueError):
            return None
        return data if isinstance(data, dict) and data.get("set") in SETS else None
    return P._cached(db, ("starter_marker", organization_id), load)


def _documents(set_key: str) -> set:
    from app.modules.hr import onboarding_package_content as C
    docs = SETS[set_key]["documents"]
    return set(C.CATEGORIES) if docs is None else set(docs)


def starter_for(db, organization_id: int) -> Optional[dict]:
    """{documents, send_when} for an organisation that started from a starter set; None for every other organisation."""
    m = marker(db, organization_id)
    if m is None:
        return None
    return {"documents": _documents(m["set"]), "send_when": m.get("send_when", DEFAULT_TRIGGER), "set": m["set"]}


def _write_marker(db, organization_id: int, data: dict) -> None:
    row = _row(db, organization_id)
    if row is None:
        row = OrganizationConfig(organization_id=organization_id, key=MARKER_KEY, category="onboarding_package",
                                 description="The onboarding documents this organisation started with")
        db.add(row)
    row.value = json.dumps(data)


def mark_new_organisation(db, organization_id: int, country: Optional[str]) -> None:
    """Called once when an organisation is registered: it starts from its country's starter set. Never overwrites."""
    if _row(db, organization_id) is not None:
        return
    code = None
    if country:
        from app.core import regions
        code = (regions.country_code(country) or "").upper() or None
    _write_marker(db, organization_id, {"set": set_for_country(code), "country": code, "send_when": DEFAULT_TRIGGER,
                                        "marked_at": datetime.utcnow().isoformat(), "reason": "new_organisation"})
    db.commit()


def options(db, organization_id: int) -> dict:
    from app.modules.hr import onboarding_package_content as C
    from app.modules.hr import onboarding_package_org as ORG
    titles = {d["category"]: d["title"] for d in C.documents()}
    country = ORG._org_country(db, organization_id)
    m = marker(db, organization_id)
    return {"current": (m or {}).get("set"), "suggested": set_for_country(country), "country": country,
            "sets": [{"key": k, "name": v["name"], "description": v["description"],
                      "documents": [titles[c] for c in C.CATEGORIES if c in _documents(k)]} for k, v in SETS.items()]}


def apply(db, actor, set_key: str, *, send_when: Optional[str] = DEFAULT_TRIGGER) -> dict:
    """Switch the organisation's platform documents to a starter set: the set's documents on (prepared at `send_when`),
    the others off. The organisation's own documents are not touched. Documents already sent stay with each hire."""
    from app.modules.doc_templates import access
    from app.modules.hr import onboarding_document_rules as RULES
    from app.modules.hr import onboarding_package_org as ORG
    access.require_hr(actor)
    if set_key not in SETS:
        raise HTTPException(422, f"Choose one of: {', '.join(SETS)}.")
    send_when, _days = RULES.clean_trigger(send_when, None)
    if send_when == "days_before_start":
        raise HTTPException(422, "Choose when the new hire is created, when they submit their details, or when HR sends it.")
    org_id = actor.organization_id
    wanted = _documents(set_key)
    changed = []
    for r in ORG.ensure_rows(db, org_id):
        if r.source != "platform":
            continue
        on = r.category in wanted or r.mandatory
        trigger = send_when if on else r.send_when
        if r.enabled != on or r.send_when != trigger:
            changed.append(r.category)
        r.enabled, r.send_when = on, trigger
        r.updated_by = actor.id
    _write_marker(db, org_id, {"set": set_key, "country": ORG._org_country(db, org_id), "send_when": send_when,
                               "marked_at": datetime.utcnow().isoformat(), "reason": "applied_by_admin",
                               "applied_by": actor.id})
    db.commit()
    from app.modules.hr import onboarding_package as P
    cache = db.info.get(P._CACHE_KEY) or {}
    cache.pop(("starter_marker", org_id), None)
    cache.pop(("org_package_rows", org_id), None)
    ORG.audit(db, actor, "onboarding_starter_set_applied", {"set": set_key, "changed": changed, "send_when": send_when})
    return ORG.settings_documents(db, org_id)
