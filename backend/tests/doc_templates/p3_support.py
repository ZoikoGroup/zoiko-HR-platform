"""Helpers for the Prompt 3 suites (policies, leave, working time, compensation)."""
from __future__ import annotations

from datetime import date, timedelta

from app.modules.doc_templates import blocks, renderer, storage
from app.modules.doc_templates.models import GeneratedDocument, TemplateVariant
from tests.doc_templates.p2_support import activate  # noqa: F401  (re-exported for the suites)

FAKE_DIM = 384


def fake_embeddings(monkeypatch):
    """Local embeddings need a model download; the suites only check eligibility, so any vector will do."""
    from app.modules.assistant import embeddings
    monkeypatch.setattr(embeddings, "embed_batch", lambda texts: [[0.01] * FAKE_DIM for _ in texts])
    monkeypatch.setattr(embeddings, "embed_text", lambda text: [0.01] * FAKE_DIM)


def policy_settings(world, **extra):
    r = world.put("a_hr", "/hr/policies/settings", json={"owner_name": "Head of People", "contact": "people@tenant-a.example.com", **extra})
    assert r.status_code == 200, r.text
    return r.json()


def publish(world, cid, audience, who="a_hr", requires="ACKNOWLEDGE"):
    d = world.post(who, "/hr/policy-distributions", json={"canonical_id": cid, "audience": audience, "requires": requires})
    assert d.status_code == 201, d.text
    r = world.post(who, f"/hr/policy-distributions/{d.json()['id']}/publish", json={"confirm_partial": False})
    assert r.status_code == 200, r.text
    return r.json()


def new_version(db, previous: TemplateVariant, *, minor=False, summary="Clarified the conflicts of interest section.") -> TemplateVariant:
    """A released next version of a platform variant (the tenant release lifecycle itself is covered by test_dt_variants)."""
    v = TemplateVariant(canonical_id=previous.canonical_id, pack_id=previous.pack_id, owner_organization_id=None, language="en",
                        version=previous.version + 1, status="ACTIVE", release_mode="PLATFORM_COUNSEL", content=previous.content,
                        field_contract=previous.field_contract, clause_rules=previous.clause_rules, options=previous.options,
                        effective_from=date.today() - timedelta(days=1), previous_version_id=previous.id, change_summary=summary,
                        minor_change=minor)
    v.checksum = blocks.checksum(v.content, v.field_contract, v.clause_rules, v.applicability, v.options, v.language, v.version)
    previous.status = "RETIRED"
    db.add(v)
    db.commit()
    return v


def docs(db, cid, **filters):
    q = db.query(GeneratedDocument).filter(GeneratedDocument.canonical_id == cid)
    for k, v in filters.items():
        q = q.filter(getattr(GeneratedDocument, k) == v)
    return q.order_by(GeneratedDocument.id).all()


def text_of(doc) -> str:
    return " ".join(renderer.pdf_text(storage.get_store().get(doc.pdf_path)).split())


def all_mail_text(world) -> str:
    return " ".join(f"{to} {t} {ctx}" for (to, t, ctx) in world.mail)
