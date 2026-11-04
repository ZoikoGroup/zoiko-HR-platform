"""TENANT_ATTESTED content lifecycle through the API: packs, clauses, variants, separation of duties, immutability, withdrawal."""
import pytest

from app.modules.doc_templates import starters
from app.modules.doc_templates.models import (GeneratedDocument, ImmutableContentViolation, TemplateApprovalRecord,
                                              TemplateSupersession, TemplateVariant)
from tests.doc_templates.conftest import BASIC_CONTENT, BASIC_FIELDS, BASIC_RULES, gen, implement


@pytest.fixture
def starter(monkeypatch):
    """These lifecycle tests use a small fixed starter for HR-ONB-007 instead of its real one."""
    basic = {"content": BASIC_CONTENT, "field_contract": BASIC_FIELDS, "clause_rules": BASIC_RULES, "options": {}, "revision": None}
    real = starters.latest
    monkeypatch.setattr(starters, "latest", lambda db, cid: dict(basic) if cid == "HR-ONB-007" else real(db, cid))


def _pack(w):
    p = w.post("a_hr", "/hr/templates/packs", json={"country": "GB"}).json()
    assert w.post("a_hr", f"/hr/templates/packs/{p['id']}/submit").status_code == 200
    assert w.post("a_hr", f"/hr/templates/packs/{p['id']}/activate", json={"accepted": True}).status_code == 403  # hr_admin
    r = w.post("a_admin", f"/hr/templates/packs/{p['id']}/activate", json={"accepted": True})
    assert r.status_code == 200 and r.json()["status"] == "ACTIVE", r.text
    return p


def _clause(w, pack_id):
    c = w.post("a_hr", "/hr/templates/clauses", json={"clause_key": "notice_and_termination", "pack_id": pack_id,
                                                       "text": "Notice applies to {{worker.first_name}}."}).json()
    w.post("a_hr", f"/hr/templates/clauses/{c['id']}/submit")
    assert w.post("a_hr", f"/hr/templates/clauses/{c['id']}/approve", json={"attestation_accepted": True}).status_code == 403
    assert w.post("a_admin", f"/hr/templates/clauses/{c['id']}/approve", json={"attestation_accepted": True}).status_code == 200
    assert w.post("a_admin", f"/hr/templates/clauses/{c['id']}/release").status_code == 403, "approver cannot release"
    assert w.post("a_admin2", f"/hr/templates/clauses/{c['id']}/release").json()["status"] == "ACTIVE"
    return c


def _release(w, pack, *, reason="first version"):
    v = w.post("a_hr", "/hr/templates/HR-ONB-007/variants", json={"pack_id": pack["id"]})
    assert v.status_code == 201, v.text
    v = v.json()
    assert w.put("a_hr", f"/hr/templates/variants/{v['id']}", json={"change_reason": reason}).status_code == 200
    assert w.post("a_hr", f"/hr/templates/variants/{v['id']}/submit-review").json()["status"] == "LEGAL_REVIEW"
    approval = {"attestation_accepted": True, "signed_name": "Harper People"}
    assert w.post("a_hr", f"/hr/templates/variants/{v['id']}/approve-legal", json=approval).status_code == 403
    r = w.post("a_admin", f"/hr/templates/variants/{v['id']}/approve-legal", json={**approval, "signed_name": "Avery Admin"})
    assert r.status_code == 200, r.text
    assert w.post("a_admin", f"/hr/templates/variants/{v['id']}/release").json()["detail"]["code"] == "SEPARATION_OF_DUTIES"
    r = w.post("a_admin2", f"/hr/templates/variants/{v['id']}/release")
    assert r.status_code == 200 and r.json()["status"] == "ACTIVE", r.text
    return v


def test_tenant_attested_lifecycle_end_to_end(world, starter):
    implement(world.db, "HR-ONB-007")
    pack = _pack(world)
    _clause(world, pack["id"])
    v = _release(world, pack)
    rec = world.db.query(TemplateApprovalRecord).one()
    assert rec.variant_id == v["id"] and rec.record_pdf_sha256 and "accept responsibility" in rec.review["attestation"]
    doc = gen(world).json()
    assert doc["release_mode"] == "TENANT_ATTESTED" and doc["tenant_approved_template"] is True
    world.post("a_hr", f"/hr/generated-documents/{doc['id']}/issue")
    mine = world.get("a_emp", f"/hr/me/generated-documents/{doc['id']}").json()
    assert "release_mode" not in mine and "tenant_approved_template" not in mine, "nothing misleading on the employee side"
    html = world.get("a_emp", f"/hr/me/generated-documents/{doc['id']}/preview").json()["html"]
    assert "Zoiko" not in html


def test_unknown_field_is_rejected_at_save_and_locked_blocks_stay(world, starter):
    implement(world.db, "HR-ONB-007")
    pack = _pack(world)
    v = world.post("a_hr", "/hr/templates/HR-ONB-007/variants", json={"pack_id": pack["id"]}).json()
    bad = BASIC_CONTENT + [{"type": "paragraph", "text": "Salary {{worker.secret_salary}}"}]
    r = world.put("a_hr", f"/hr/templates/variants/{v['id']}", json={"content": bad})
    assert r.status_code == 422 and any("worker.secret_salary" in p for p in r.json()["detail"]["problems"])
    no_lock = [b for b in BASIC_CONTENT if not b.get("locked")]
    r = world.put("a_hr", f"/hr/templates/variants/{v['id']}", json={"content": no_lock})
    assert r.status_code == 422 and any("locked" in p for p in r.json()["detail"]["problems"])
    reordered = list(reversed(BASIC_CONTENT))
    assert world.put("a_hr", f"/hr/templates/variants/{v['id']}", json={"content": reordered}).status_code == 200


def test_content_is_frozen_after_draft(world, starter):
    implement(world.db, "HR-ONB-007")
    pack = _pack(world)
    _clause(world, pack["id"])
    v = _release(world, pack)
    assert world.put("a_hr", f"/hr/templates/variants/{v['id']}", json={"change_reason": "x"}).status_code == 409
    row = world.db.get(TemplateVariant, v["id"])
    row.content = [{"type": "heading", "text": "changed"}]
    with pytest.raises(ImmutableContentViolation):
        world.db.commit()
    world.db.rollback()


def test_new_version_supersedes_and_suspension_blocks_drafts_but_not_issued_documents(world, starter):
    implement(world.db, "HR-ONB-007")
    pack = _pack(world)
    _clause(world, pack["id"])
    v1 = _release(world, pack)
    issued = gen(world).json()
    world.post("a_hr", f"/hr/generated-documents/{issued['id']}/issue")
    draft = gen(world).json()
    v2 = _release(world, pack, reason="clarified wording")
    world.db.expire_all()
    assert world.db.get(TemplateVariant, v1["id"]).status == "RETIRED"
    sup = world.db.query(TemplateSupersession).one()
    assert sup.action == "SUPERSEDED" and sup.new_variant_id == v2["id"] and sup.affected_in_progress == 1 and sup.issued_unchanged
    r = world.post("a_hr", f"/hr/generated-documents/{draft['id']}/issue")
    assert r.status_code == 409 and r.json()["detail"]["code"] == "VARIANT_NO_LONGER_ACTIVE"
    assert world.db.get(GeneratedDocument, issued["id"]).status == "ISSUED"
    diff = world.get("a_hr", f"/hr/templates/variants/{v1['id']}/diff/{v2['id']}").json()
    assert diff["from_version"] == 1 and diff["to_version"] == 2
    r = world.post("a_hr", f"/hr/templates/variants/{v2['id']}/suspend", json={"reason": "law changed"})
    assert r.status_code == 200 and r.json()["status"] == "SUSPENDED"
    assert gen(world).json()["detail"]["reasons"] == ["NO_ACTIVE_VARIANT"]


def test_platform_content_is_read_only_and_tenant_content_is_private(world, starter):
    from tests.doc_templates.conftest import make_pack, make_variant
    implement(world.db, "HR-ONB-007")
    platform_pack = make_pack(world.db, "GB")
    pv = make_variant(world.db, "HR-ONB-007", platform_pack)
    assert world.put("a_hr", f"/hr/templates/variants/{pv.id}", json={"change_reason": "x"}).status_code == 403
    assert world.post("a_hr", f"/hr/templates/packs/{platform_pack.id}/suspend").status_code == 403
    pack = _pack(world)
    v = world.post("a_hr", "/hr/templates/HR-ONB-007/variants", json={"pack_id": pack["id"]}).json()
    assert world.get("b_hr", f"/hr/templates/variants/{v['id']}").status_code == 404
    assert world.get("b_hr", f"/hr/templates/packs/{pack['id']}").status_code == 404
    assert all(p["owner"] == "platform" for p in world.get("b_hr", "/hr/templates/packs").json()["items"])


def test_preview_uses_synthetic_data_only(world, starter):
    implement(world.db, "HR-ONB-007")
    pack = _pack(world)
    v = world.post("a_hr", "/hr/templates/HR-ONB-007/variants", json={"pack_id": pack["id"]}).json()
    out = world.post("a_hr", f"/hr/templates/variants/{v['id']}/preview", json={}).json()
    assert "Alex Example" in out["html"] and "Canaryworker" not in out["html"]
    assert out["missing_clauses"] == ["notice_and_termination"]
