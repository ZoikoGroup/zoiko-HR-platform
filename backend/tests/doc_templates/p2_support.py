"""Helpers for the Prompt 2 suites: activate a real starter as an ACTIVE platform variant in a GB pack, with every clause it
needs released (test text only for clauses that have no starter text — in production those must be written by counsel)."""
from __future__ import annotations

from datetime import date, datetime, timedelta

from app.modules.doc_templates import blocks, starters
from app.modules.doc_templates.models import JurisdictionPack, TemplateClause, TemplateVariant
from tests.doc_templates.conftest import implement

TEST_CLAUSE_TEXT = "Jurisdiction clause text for {key} (test fixture)."


def gb_pack(db) -> JurisdictionPack:
    p = db.query(JurisdictionPack).filter_by(scope_type="PLATFORM", country="GB", status="ACTIVE").first()
    if p is None:
        p = JurisdictionPack(scope_type="PLATFORM", owner_organization_id=None, country="GB", status="ACTIVE", created_at=datetime.utcnow(),
                             signed_off_by_name="Test Counsel", requirements={})
        db.add(p)
        db.commit()
    return p


def release_clause(db, pack, key, text=None):
    existing = db.query(TemplateClause).filter_by(clause_key=key, pack_id=pack.id, status="ACTIVE").first()
    if existing is not None:
        return existing
    starter = starters.STARTER_CLAUSES.get(key)
    text = text or (starter["text"] if starter else TEST_CLAUSE_TEXT.format(key=key))
    c = TemplateClause(clause_key=key, pack_id=pack.id, owner_organization_id=None, language="en", version=1, status="ACTIVE", text=text,
                       checksum=blocks.checksum(key, text, "en"))
    db.add(c)
    db.commit()
    return c


def activate(db, canonical_id, *, clauses=True, skip_clauses=()) -> TemplateVariant:
    implement(db, canonical_id)
    pack = gb_pack(db)
    s = starters.latest(db, canonical_id)
    rules = s["clause_rules"]
    if clauses:
        for key in rules["mandatory"] + rules["optional"]:
            if key not in skip_clauses:
                release_clause(db, pack, key)
    v = TemplateVariant(canonical_id=canonical_id, pack_id=pack.id, owner_organization_id=None, language="en", version=1, status="ACTIVE",
                        release_mode="PLATFORM_COUNSEL", content=s["content"], field_contract=s["field_contract"], clause_rules=rules,
                        options=s["options"], applicability=s.get("applicability"), effective_from=date.today() - timedelta(days=1))
    v.checksum = blocks.checksum(v.content, v.field_contract, v.clause_rules, v.applicability, v.options, v.language)
    db.add(v)
    db.commit()
    return v


def set_recruitment_privacy(world, retention=12):
    r = world.put("a_admin", "/hr/recruitment/privacy-settings",
                  json={"privacy_contact_email": "privacy@tenant-a.example.com", "candidate_data_retention_months": retention})
    assert r.status_code == 200, r.text
    return r.json()


def signatory(world, who="a_signer", risk="L3"):
    from app.modules.doc_templates.models import AuthorisedSignatory
    world.db.add(AuthorisedSignatory(organization_id=1, entity_id=1, employee_id=world.u[who].id, signatory_title="Director",
                                     authority_scope=["ALL"], max_risk_level=risk, valid_from=date.today() - timedelta(days=1),
                                     approved_by=world.u["a_admin"].id))
    world.db.commit()


def code(world):
    return [c for (_, t, c) in world.mail if t == "document_sign_code.html"][-1]["code"]
