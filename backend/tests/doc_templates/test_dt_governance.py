"""The ten governance outputs (HR-DOC-001/003/004/008/010/012/013/014/016/018), policy distribution, jobs, entities."""
from datetime import date, datetime, timedelta

import pytest

from app.modules.doc_templates import jobs, renderer, starters
from app.modules.doc_templates.models import (DocumentExpiryItem, EmployerEntity, GeneratedDocument, PolicyDistribution,
                                              TemplateSupersession)
from app.modules.hr.models import EmployeeHistory
from tests.doc_templates.conftest import BASIC_CONTENT, BASIC_FIELDS, BASIC_RULES, gen, implement, make_clause, make_pack, make_variant, ready
from tests.doc_templates.test_dt_signing import _issued_agreement, _code, _consent


def _pdf_text(resp):
    assert resp.status_code == 200, resp.text
    assert resp.content.startswith(b"%PDF")
    return " ".join(renderer.pdf_text(resp.content).split())


def test_HR_DOC_001_register_exports(world):
    t = _pdf_text(world.get("a_hr", "/hr/generated-documents/governance/register", params={"format": "pdf"}))
    assert "Template Register — Tenant A Ltd" in t and "HR-CON-001" in t.replace(" ", "")
    csv = world.get("a_hr", "/hr/generated-documents/governance/register", params={"format": "csv"}).text
    assert csv.count("\n") == 567 and csv.startswith("Canonical ID,Family,Title")


def test_HR_DOC_008_010_012_013_for_an_executed_agreement(world):
    doc = _issued_agreement(world)
    world.post("a_emp", f"/hr/me/generated-documents/{doc['id']}/sign/otp")
    world.post("a_emp", f"/hr/me/generated-documents/{doc['id']}/sign",
               json={"typed_name": "Canaryworker Example", "consent_version": _consent(world), "otp_code": _code(world)})
    t = _pdf_text(world.get("a_hr", f"/hr/generated-documents/governance/generation-instructions/{doc['id']}", params={"format": "pdf"}))
    assert "Document Generation Instruction" in t and "HR-CHG-009" in t and "employee:" in t and "Canaryworker" not in t
    t = _pdf_text(world.get("a_hr", f"/hr/generated-documents/governance/workflow-approvals/{doc['id']}", params={"format": "pdf"}))
    assert "Document Workflow Approval Record" in t and "passed" in t
    t = _pdf_text(world.get("a_hr", f"/hr/generated-documents/governance/signature-evidence/{doc['id']}", params={"format": "pdf"}))
    assert "Electronic Signature Evidence Certificate" in t and "not a qualified electronic signature" in t


def test_HR_DOC_013_acknowledgement_record(world):
    ready(world.db)
    doc = gen(world).json()
    world.post("a_hr", f"/hr/generated-documents/{doc['id']}/issue")
    world.post("a_emp", f"/hr/me/generated-documents/{doc['id']}/acknowledge", json={"text_version": "ACK-1.0"})
    ack = world.get("a_hr", "/hr/generated-documents/governance/acknowledgements").json()["items"][0]
    t = _pdf_text(world.get("a_hr", f"/hr/generated-documents/governance/acknowledgements/{ack['id']}", params={"format": "pdf"}))
    assert "It is not acceptance of contractual terms and does not waive any legal rights" in t and "ACK-1.0" in t


@pytest.fixture
def starter(monkeypatch):
    basic = {"content": BASIC_CONTENT, "field_contract": BASIC_FIELDS, "clause_rules": BASIC_RULES, "options": {}, "revision": None}
    real = starters.latest
    monkeypatch.setattr(starters, "latest", lambda db, cid: dict(basic) if cid == "HR-ONB-007" else real(db, cid))


def test_HR_DOC_003_004_018_from_the_content_lifecycle(world, starter):
    from tests.doc_templates.test_dt_content import _clause, _pack, _release
    implement(world.db, "HR-ONB-007")
    pack = _pack(world)
    _clause(world, pack["id"])
    v1 = _release(world, pack)
    v2 = _release(world, pack, reason="second wording")
    approvals = world.get("a_hr", "/hr/generated-documents/governance/approvals").json()["template_approvals"]
    t = _pdf_text(world.get("a_hr", f"/hr/generated-documents/governance/approvals/{approvals[-1]['id']}"))
    assert "Legal Template Approval Record" in t and "TENANT_ATTESTED" in t and "not been approved by Zoiko" in t
    t = _pdf_text(world.get("a_hr", "/hr/generated-documents/governance/versions", params={"variant_id": v2["id"], "format": "pdf"}))
    assert "Template Version History" in t and "Version transition v1 to v2" in t and "second wording" in t
    sup = world.db.query(TemplateSupersession).one()
    t = _pdf_text(world.get("a_hr", f"/hr/generated-documents/governance/supersessions/{sup.id}", params={"format": "pdf"}))
    assert "Template Supersession and Withdrawal Record" in t and "Previously issued documents remain unchanged" in t


def _policy(world):
    implement(world.db, "HR-POL-001")
    pack = make_pack(world.db, "GB")
    make_clause(world.db, pack)
    make_variant(world.db, "HR-POL-001", pack)


def test_HR_DOC_014_policy_distribution_and_new_joiners(world):
    _policy(world)
    world.u["a_emp2"].work_country = None
    world.db.commit()
    d = world.post("a_hr", "/hr/policy-distributions", json={"canonical_id": "HR-POL-001", "audience": {"type": "all"},
                                                             "due_date": (date.today() + timedelta(days=10)).isoformat()}).json()
    r = world.post("a_hr", f"/hr/policy-distributions/{d['id']}/publish", json={}).json()
    assert r["published"] is False and r["blocked"] >= 1, "one blocked recipient stops the whole publish until HR confirms"
    assert world.db.query(GeneratedDocument).count() == 0
    r = world.post("a_hr", f"/hr/policy-distributions/{d['id']}/publish", json={"confirm_partial": True}).json()
    assert r["published"] is True and r["ready"] >= 1
    issued = world.db.query(GeneratedDocument).filter(GeneratedDocument.distribution_id == d["id"]).all()
    assert issued and all(x.status == "ISSUED" for x in issued)
    assert any(t == "policy_published.html" for _, t, _ in world.mail)
    # a new joiner is picked up by the job
    world.u["a_emp2"].work_country = "GB"
    world.db.commit()
    before = len(issued)
    jobs.include_new_joiners(world.db)
    assert world.db.query(GeneratedDocument).filter(GeneratedDocument.distribution_id == d["id"]).count() == before + 1
    t = _pdf_text(world.get("a_hr", f"/hr/generated-documents/governance/distributions/{d['id']}", params={"format": "pdf"}))
    assert "Policy Distribution and Publication Record" in t


def test_HR_DOC_016_expiry_collection_reminders_expiry_and_retention(world):
    ready(world.db, options={"response_days": 2, "reminder_days": [1], "expires_days": 3})
    doc = gen(world).json()
    world.post("a_hr", f"/hr/generated-documents/{doc['id']}/issue")
    row = world.db.get(GeneratedDocument, doc["id"])
    assert jobs.collect_expiry_items(world.db) >= 1
    item = world.db.query(DocumentExpiryItem).filter_by(item_type="generated_document").one()
    r = world.put("a_hr", f"/hr/generated-documents/governance/expiries/{item.id}", json={"status": "WAIVED"})
    assert r.status_code == 422
    pass
    t = _pdf_text(world.get("a_hr", "/hr/generated-documents/governance/expiries", params={"format": "pdf"}))
    assert "Document Expiry and Renewal Record" in t and "OPEN" in t
    assert jobs.send_expiry_digest(world.db) >= 1, "counts only"
    digest = [c for (_, tpl, c) in world.mail if tpl == "documents_expiry_digest.html"][-1]
    assert set(digest) >= {"documents_count", "overdue_count"} and "Canaryworker" not in repr(digest)
    assert jobs.send_reminders(world.db, now=row.due_by - timedelta(days=1)) == 1
    assert jobs.send_reminders(world.db, now=row.due_by - timedelta(days=1)) == 0, "once a day"
    assert world.put("a_hr", f"/hr/generated-documents/governance/expiries/{item.id}", json={"status": "WAIVED", "note": "ok"}).status_code == 200
    assert jobs.expire_documents(world.db, now=row.expires_at + timedelta(minutes=1)) == 1
    world.db.expire_all()
    assert world.db.get(GeneratedDocument, doc["id"]).status == "EXPIRED"
    row = world.db.get(GeneratedDocument, doc["id"])
    row.retention_until = date.today() - timedelta(days=1)
    world.db.commit()
    assert jobs.flag_retention(world.db) == 1
    assert world.db.get(GeneratedDocument, doc["id"]).status == "EXPIRED", "retention flags for review; it never deletes"


# ── entities, signatories, jurisdiction facts ────────────────────────────────────────────────────────────────────────

def test_legal_entities_are_admin_managed_and_audited(world):
    assert world.post("a_hr", "/hr/legal-entities", json={"legal_name": "X"}).status_code == 403
    r = world.post("a_admin", "/hr/legal-entities", json={"legal_name": "Tenant A Services Ltd", "country": "GB",
                                                          "registration_type": "company_number", "registration_number": "12345678"})
    assert r.status_code == 201, r.text
    bad = world.post("a_admin", "/hr/legal-entities", json={"legal_name": "Y", "country": "GB", "registration_type": "company_number",
                                                            "registration_number": "??"})
    assert bad.status_code == 422
    assert world.post("a_admin", f"/hr/legal-entities/{r.json()['id']}/default").json()["is_default"] is True
    assert world.get("b_admin", f"/hr/legal-entities/{r.json()['id']}").status_code == 404
    gaps = world.get("a_hr", "/hr/legal-entities/jurisdiction-gaps").json()
    assert gaps["has_default_entity"] is True


def test_signatory_appointment_needs_another_admin(world):
    body = {"entity_id": 1, "employee_id": world.u["a_admin"].id, "signatory_title": "CEO", "max_risk_level": "L3"}
    assert world.post("a_admin", "/hr/legal-entities/signatories", json=body).json()["detail"]["code"] == "SEPARATION_OF_DUTIES"
    r = world.post("a_admin2", "/hr/legal-entities/signatories", json=body)
    assert r.status_code == 201 and r.json()["in_force"] is True
    assert world.post("a_admin2", "/hr/legal-entities/signatories", json={**body, "authority_scope": ["HR-NOPE"]}).status_code == 422


def test_jurisdiction_facts_are_hr_only_validated_and_written_to_history(world):
    emp = world.u["a_emp2"]
    assert world.put("a_emp2", f"/hr/employees/{emp.id}/jurisdiction", json={"work_country": "US"}).status_code == 403
    assert world.put("a_hr", f"/hr/employees/{emp.id}/jurisdiction", json={"work_country": "XX"}).status_code == 422
    assert world.put("a_hr", f"/hr/employees/{emp.id}/jurisdiction", json={"work_country": "US", "work_region": "Narnia"}).status_code == 422
    r = world.put("a_hr", f"/hr/employees/{emp.id}/jurisdiction", json={"work_country": "us", "work_region": "new jersey",
                                                                        "worker_category": "employee", "change_reason": "moved"})
    assert r.status_code == 200 and r.json()["work_country"] == "US" and r.json()["work_region"] == "New Jersey"
    hist = world.db.query(EmployeeHistory).filter(EmployeeHistory.employee_id == emp.id).all()
    assert {h.field_name for h in hist} >= {"work_country", "work_region", "worker_category"}
    assert all(h.organization_id == 1 and h.changed_by == world.u["a_hr"].id for h in hist)
    assert world.put("b_hr", f"/hr/employees/{emp.id}/jurisdiction", json={"work_city": "x"}).status_code == 404


def test_strict_country_lookup_never_guesses():
    from app.core import regions
    assert regions.country_code_strict("United Kingdom") == "GB"
    assert regions.country_code_strict("usa") == "US"
    assert regions.country_code_strict("London") is None
    assert regions.country_code_strict("Leeds, England") is None
    assert regions.country_code("London") == "GB", "the loose lookup is unchanged for its existing callers"
