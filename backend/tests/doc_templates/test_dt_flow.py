"""The L1 happy path end to end, and the invariants that must hold on it."""
import hashlib
import re

from app.modules.doc_templates import storage
from app.modules.doc_templates.models import (DecisionReceipt, DocumentAcknowledgement, DocumentEvent, DocumentNumberSequence,
                                              DocumentSignature, GeneratedDocument)
from app.modules.employee.models import Employee
from tests.doc_templates.conftest import CANARY_CLAUSE, CANARY_NAME, gen, ready


def _employee_state(db, emp_id):
    e = db.get(Employee, emp_id)
    db.refresh(e)
    return {c.name: getattr(e, c.name) for c in Employee.__table__.columns if c.name not in ("updated_at",)}


def test_generate_issue_acknowledge(world):
    ready(world.db)
    emp = world.u["a_emp"]
    before = _employee_state(world.db, emp.id)

    r = gen(world)
    assert r.status_code == 201, r.text
    doc = r.json()
    assert doc["status"] == "RENDERED_DRAFT"
    assert re.fullmatch(r"TA-\d{4}-000001", doc["document_number"])
    assert doc["release_mode"] == "PLATFORM_COUNSEL" and doc["tenant_approved_template"] is False

    # the employee cannot see a draft
    assert world.get("a_emp", f"/hr/me/generated-documents/{doc['id']}").status_code == 404
    preview = world.get("a_hr", f"/hr/generated-documents/{doc['id']}/preview").json()["html"]
    assert CANARY_NAME in preview and CANARY_CLAUSE in preview and "Tenant A Employer Ltd" in preview

    r = world.post("a_hr", f"/hr/generated-documents/{doc['id']}/issue")
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "ISSUED"
    assert any(t == "document_action_required.html" for _, t, _ in world.mail)

    mine = world.get("a_emp", "/hr/me/generated-documents").json()
    assert mine["total"] == 1 and mine["items"][0]["my_action"] == "acknowledge"
    assert world.get("a_emp", "/hr/me/generated-documents/pending-count").json() == {"count": 1}
    # the issued PDF also appears in the existing documents screen
    hd = world.get("a_emp", "/hr/documents", params={"employee_id": emp.id}).json()
    assert any("TA-" in d.get("title", "") for d in (hd if isinstance(hd, list) else hd.get("items", [])))

    statements = world.get("a_emp", "/hr/me/generated-documents/statements").json()
    r = world.post("a_emp", f"/hr/me/generated-documents/{doc['id']}/acknowledge",
                   json={"text_version": statements["acknowledgement"]["version"]})
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "ACKNOWLEDGED"

    db = world.db
    assert db.query(DocumentAcknowledgement).count() == 1
    assert db.query(DocumentSignature).count() == 0, "an acknowledgement is never stored as a signature"
    row = db.get(GeneratedDocument, doc["id"])
    assert db.get(DecisionReceipt, row.decision_receipt_id).outcome == "ALLOW"
    data = storage.get_store().get(row.pdf_path)
    assert hashlib.sha256(data).hexdigest() == row.pdf_sha256
    assert _employee_state(db, emp.id) == before, "generating, issuing and acknowledging a document never changes HR state"


def test_acknowledging_twice_or_someone_elses_document_is_refused(world):
    ready(world.db)
    doc = gen(world).json()
    world.post("a_hr", f"/hr/generated-documents/{doc['id']}/issue")
    ver = world.get("a_emp", "/hr/me/generated-documents/statements").json()["acknowledgement"]["version"]
    assert world.post("a_emp2", f"/hr/me/generated-documents/{doc['id']}/acknowledge", json={"text_version": ver}).status_code == 404
    assert world.post("a_emp", f"/hr/me/generated-documents/{doc['id']}/acknowledge", json={"text_version": "old"}).status_code == 422
    assert world.post("a_emp", f"/hr/me/generated-documents/{doc['id']}/acknowledge", json={"text_version": ver}).status_code == 200
    assert world.post("a_emp", f"/hr/me/generated-documents/{doc['id']}/acknowledge", json={"text_version": ver}).status_code == 409


def test_document_numbers_are_sequential_and_a_denied_request_consumes_none(world):
    ready(world.db)
    first = gen(world).json()["document_number"]
    world.u["a_emp2"].work_country = None
    world.db.commit()
    denied = gen(world, subject="a_emp2")
    assert denied.status_code == 422
    second = gen(world).json()["document_number"]
    assert first.endswith("000001") and second.endswith("000002")
    assert world.db.query(DocumentNumberSequence).one().last_value == 2


def test_rendering_is_deterministic(world):
    ready(world.db)
    a = world.db.get(GeneratedDocument, gen(world).json()["id"])
    from app.modules.doc_templates import service
    html_a = service.file_bytes(a, "html")
    b = world.db.get(GeneratedDocument, gen(world).json()["id"])
    html_b = service.file_bytes(b, "html")
    assert html_a.replace(a.document_number.encode(), b"N") == html_b.replace(b.document_number.encode(), b"N")


def test_timeline_and_events_carry_no_document_contents(world):
    ready(world.db)
    doc = gen(world).json()
    world.post("a_hr", f"/hr/generated-documents/{doc['id']}/issue")
    tl = world.get("a_hr", f"/hr/generated-documents/{doc['id']}/timeline").json()
    kinds = [e["event_type"] for e in tl["items"]]
    assert kinds[:4] == ["requested", "context_validated", "rendered", "human_approved"] and "issued" in kinds
    blob = repr([(e.event_type, e.detail) for e in world.db.query(DocumentEvent).all()])
    assert CANARY_NAME not in blob and CANARY_CLAUSE not in blob
    for _, template, ctx in world.mail:
        assert CANARY_CLAUSE not in repr(ctx)


def test_download_link_is_short_lived_signed_and_logged(world):
    ready(world.db)
    doc = gen(world).json()
    link = world.post("a_hr", f"/hr/generated-documents/{doc['id']}/download-link").json()
    assert link["expires_in"] <= 300 and link["url"].startswith("/hr/generated-documents/files/")
    r = world.client.get(link["url"])
    assert r.status_code == 200 and r.content.startswith(b"%PDF") and r.headers["cache-control"] == "private, no-store"
    assert world.client.get(link["url"][:-3] + "abc").status_code == 404
    assert any(e.event_type == "downloaded" for e in world.db.query(DocumentEvent).all())


def test_cancel_and_correct_never_rewrite_an_issued_document(world):
    ready(world.db)
    doc = gen(world).json()
    world.post("a_hr", f"/hr/generated-documents/{doc['id']}/issue")
    row = world.db.get(GeneratedDocument, doc["id"])
    original = storage.get_store().get(row.pdf_path)
    r = world.post("a_hr", f"/hr/generated-documents/{doc['id']}/correct", json={"reason": "start date was wrong"})
    assert r.status_code == 201, r.text
    new = r.json()
    world.db.expire_all()
    old = world.db.get(GeneratedDocument, doc["id"])
    assert old.status == "CORRECTED" and old.corrected_by_document_id == new["id"]
    assert storage.get_store().get(old.pdf_path) == original
    assert new["corrects_document_id"] == doc["id"] and new["status"] == "RENDERED_DRAFT"
    assert world.post("a_hr", f"/hr/generated-documents/{new['id']}/cancel", json={"reason": "not needed"}).json()["status"] == "CANCELLED"


def test_legal_hold_freezes_the_document(world):
    ready(world.db)
    doc = gen(world).json()
    world.post("a_hr", f"/hr/generated-documents/{doc['id']}/issue")
    assert world.post("a_hr", f"/hr/generated-documents/{doc['id']}/legal-hold", json={"reason": "litigation"}).json()["status"] == "LEGAL_HOLD"
    assert world.post("a_hr", f"/hr/generated-documents/{doc['id']}/cancel", json={"reason": "x"}).status_code == 409
    assert world.post("a_hr", f"/hr/generated-documents/{doc['id']}/correct", json={"reason": "x"}).status_code == 409
    assert world.post("a_hr", f"/hr/generated-documents/{doc['id']}/release-hold").json()["status"] == "ISSUED"


def test_hard_deleting_someone_with_document_evidence_is_refused(world):
    ready(world.db)
    gen(world)
    from app.modules.employee import service as emp_service
    import pytest
    from app.core.exceptions import BadRequestException
    with pytest.raises(BadRequestException):
        emp_service.hard_delete_employee(world.db, world.u["a_emp"].id, organization_id=1)
