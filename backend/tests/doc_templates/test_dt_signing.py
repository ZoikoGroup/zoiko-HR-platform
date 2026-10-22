"""Approval chains with separation of duties, e-signature (employee, employer, candidate) and its evidence."""
from datetime import date, datetime, timedelta

from app.modules.doc_templates import renderer, storage
from app.modules.doc_templates.models import (AuthorisedSignatory, DocumentSignOtp, DocumentSignature, GeneratedDocument,
                                              GeneratedDocumentApproval, JurisdictionPack)
from tests.doc_templates.conftest import AGREEMENT_CONTENT, gen, implement, make_clause, make_pack, make_variant, ready

L2_FIELDS = {"required": ["worker.full_name", "worker.first_name", "employment.position_title", "employment.start_date"], "optional": []}


def _signatory(w, who="a_signer", risk="L3", scope=("ALL",)):
    w.db.add(AuthorisedSignatory(organization_id=1, entity_id=1, employee_id=w.u[who].id, signatory_title="Director",
                                 authority_scope=list(scope), max_risk_level=risk, valid_from=date.today() - timedelta(days=1),
                                 approved_by=w.u["a_admin"].id))
    w.db.commit()


def _agreement(w, canonical="HR-CHG-009", **opts):
    ready(w.db, canonical, content=AGREEMENT_CONTENT, field_contract=L2_FIELDS, options=opts or None)


def _code(w):
    return [c for (_, t, c) in w.mail if t == "document_sign_code.html"][-1]["code"]


def _consent(w):
    return w.get("a_emp", "/hr/me/generated-documents/statements").json()["consent"]["version"]


# ── approvals ────────────────────────────────────────────────────────────────────────────────────────────────────────

def test_L2_requester_cannot_approve_their_own_document_and_a_second_person_can(world):
    _signatory(world)
    _agreement(world)
    doc = gen(world, canonical_id="HR-CHG-009").json()
    assert doc["status"] == "PENDING_APPROVAL" and doc["approval_policy"] == "L2"
    r = world.post("a_hr", f"/hr/generated-documents/{doc['id']}/approve", json={})
    assert r.status_code == 403 and r.json()["detail"]["code"] == "SEPARATION_OF_DUTIES"
    assert world.post("a_hr", f"/hr/generated-documents/{doc['id']}/issue").status_code == 409
    r = world.post("a_hr2", f"/hr/generated-documents/{doc['id']}/approve", json={"comment": "checked"})
    assert r.status_code == 200 and r.json()["status"] == "HUMAN_APPROVED"
    step = world.db.query(GeneratedDocumentApproval).one()
    assert step.sod_check["passed"] and step.approver_id == world.u["a_hr2"].id


def test_L3_needs_hr_approver_and_signatory_and_an_admin_cannot_skip_the_second_step(world):
    _signatory(world)
    implement(world.db, "HR-CON-001")
    pack = make_pack(world.db, "GB")
    make_clause(world.db, pack)
    make_variant(world.db, "HR-CON-001", pack, content=AGREEMENT_CONTENT, field_contract=L2_FIELDS)
    doc = gen(world, canonical_id="HR-CON-001").json()
    assert doc["approval_policy"] == "L3" and doc["status"] == "PENDING_APPROVAL"
    r = world.post("a_admin", f"/hr/generated-documents/{doc['id']}/approve", json={})
    assert r.status_code == 200 and r.json()["status"] == "PENDING_APPROVAL", "an admin approval completes one step, never the chain"
    # the same admin cannot take the signatory step, and an HR admin without signing authority cannot either
    assert world.post("a_admin", f"/hr/generated-documents/{doc['id']}/approve", json={}).status_code == 403
    assert world.post("a_hr2", f"/hr/generated-documents/{doc['id']}/approve", json={}).status_code == 403
    queue = world.get("a_signer", "/hr/me/generated-documents/signatory-queue").json()
    assert [i["id"] for i in queue["items"]] == [doc["id"]] and queue["items"][0]["my_action"] == "approve"
    r = world.post("a_signer", f"/hr/generated-documents/{doc['id']}/approve", json={})
    assert r.status_code == 200 and r.json()["status"] == "HUMAN_APPROVED"
    steps = world.db.query(GeneratedDocumentApproval).order_by(GeneratedDocumentApproval.step_order).all()
    assert [s.decision for s in steps] == ["APPROVED", "APPROVED"] and len({s.approver_id for s in steps}) == 2


def test_L3_with_too_few_people_is_blocked_with_instructions(world):
    pack = make_pack(world.db, "GB")
    make_clause(world.db, pack)
    # an agreement the employer signs needs a signatory before anything else
    implement(world.db, "HR-CON-001")
    make_variant(world.db, "HR-CON-001", pack, content=AGREEMENT_CONTENT, field_contract=L2_FIELDS)
    assert gen(world, canonical_id="HR-CON-001").json()["detail"]["reasons"] == ["NO_AUTHORISED_SIGNATORY"]
    # an L3 document with no employer signature still needs an HR approver AND a different signatory
    implement(world.db, "HR-CON-002", execution_mode="NONE")
    make_variant(world.db, "HR-CON-002", pack, field_contract=L2_FIELDS, content=AGREEMENT_CONTENT[:4])
    r = gen(world, canonical_id="HR-CON-002")
    assert r.status_code == 422
    d = r.json()["detail"]
    assert d["reasons"] == ["INSUFFICIENT_APPROVERS"] and any("signatory" in s.get("detail", "") for s in d["steps"])
    _signatory(world, who="a_hr2")
    assert gen(world, canonical_id="HR-CON-002").status_code == 201, "an admin approves as HR while a_hr2 signs: two people"


def test_reject_needs_a_reason_and_is_final(world):
    _signatory(world)
    _agreement(world)
    doc = gen(world, canonical_id="HR-CHG-009").json()
    assert world.post("a_hr2", f"/hr/generated-documents/{doc['id']}/reject", json={}).status_code == 422
    assert world.post("a_hr2", f"/hr/generated-documents/{doc['id']}/reject", json={"comment": "wrong role"}).json()["status"] == "REJECTED"
    assert world.post("a_hr", f"/hr/generated-documents/{doc['id']}/issue").status_code == 409


def test_a_tenant_stricter_override_turns_L1_into_L2(world):
    ready(world.db)
    r = world.put("a_admin", "/hr/templates/settings", json={"approval_overrides": {"HR-ONB-007": "L2"}})
    assert r.status_code == 200, r.text
    assert gen(world).json()["status"] == "PENDING_APPROVAL"
    assert world.put("a_hr", "/hr/templates/settings", json={"approval_overrides": {}}).status_code == 403


# ── signing ──────────────────────────────────────────────────────────────────────────────────────────────────────────

def _issued_agreement(w):
    _signatory(w)
    _agreement(w)
    doc = gen(w, canonical_id="HR-CHG-009").json()
    w.post("a_hr2", f"/hr/generated-documents/{doc['id']}/approve", json={})
    assert w.post("a_hr", f"/hr/generated-documents/{doc['id']}/issue").json()["status"] == "ISSUED"
    return doc


def test_full_execution_with_otp_and_evidence_certificate(world):
    doc = _issued_agreement(world)
    mine = world.get("a_emp", f"/hr/me/generated-documents/{doc['id']}").json()
    assert mine["my_action"] == "sign" and mine["needs_otp"] is True
    body = {"typed_name": "Canaryworker Example", "consent_version": _consent(world), "method": "TYPED"}
    assert world.post("a_emp", f"/hr/me/generated-documents/{doc['id']}/sign", json=body).json()["detail"]["code"] == "OTP_EXPIRED"
    assert world.post("a_emp", f"/hr/me/generated-documents/{doc['id']}/sign/otp").status_code == 200
    r = world.post("a_emp", f"/hr/me/generated-documents/{doc['id']}/sign", json={**body, "otp_code": _code(world)})
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "ISSUED", "the employer still has to sign"
    # employer signature: queue, otp, sign
    queue = world.get("a_signer", "/hr/me/generated-documents/signatory-queue").json()["items"]
    assert queue and queue[0]["my_action"] == "sign"
    world.post("a_signer", f"/hr/generated-documents/{doc['id']}/employer-sign/otp")
    r = world.post("a_signer", f"/hr/generated-documents/{doc['id']}/employer-sign",
                   json={"typed_name": "Dana Director", "consent_version": _consent(world), "otp_code": _code(world)})
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "EXECUTED"
    row = world.db.get(GeneratedDocument, doc["id"])
    original = storage.get_store().get(row.pdf_path)
    executed = storage.get_store().get(row.executed_pdf_path)
    assert executed != original and row.executed_pdf_sha256 != row.pdf_sha256
    text = " ".join(renderer.pdf_text(executed).split())
    assert "Electronic Signature Evidence Certificate" in text and row.pdf_sha256 in text.replace(" ", "")
    assert "Canaryworker Example" in text and "Dana Director" in text and "ESIGN-CONSENT-1.0" in text
    sigs = world.db.query(DocumentSignature).all()
    assert {s.signer_party for s in sigs} == {"employee", "employer"} and all(s.otp_verified_at for s in sigs)
    assert all(s.signed_document_sha256 == row.pdf_sha256 for s in sigs)
    assert any(t == "document_executed.html" for _, t, _ in world.mail)


def test_otp_wrong_code_attempts_and_expiry(world, monkeypatch):
    doc = _issued_agreement(world)
    world.post("a_emp", f"/hr/me/generated-documents/{doc['id']}/sign/otp")
    body = {"typed_name": "Canaryworker Example", "consent_version": _consent(world)}
    for i in range(5):
        r = world.post("a_emp", f"/hr/me/generated-documents/{doc['id']}/sign", json={**body, "otp_code": "000000" if _code(world) != "000000" else "111111"})
        assert r.status_code == 422 and r.json()["detail"]["code"] == "OTP_INVALID", r.text
    r = world.post("a_emp", f"/hr/me/generated-documents/{doc['id']}/sign", json={**body, "otp_code": _code(world)})
    assert r.json()["detail"]["code"] in ("OTP_EXPIRED", "OTP_LOCKED"), "a code is dead after five wrong attempts"
    world.post("a_emp", f"/hr/me/generated-documents/{doc['id']}/sign/otp")
    otp = world.db.query(DocumentSignOtp).order_by(DocumentSignOtp.id.desc()).first()
    otp.expires_at = datetime.utcnow() - timedelta(seconds=1)
    world.db.commit()
    r = world.post("a_emp", f"/hr/me/generated-documents/{doc['id']}/sign", json={**body, "otp_code": _code(world)})
    assert r.json()["detail"]["code"] == "OTP_EXPIRED"


def test_name_must_match_unless_hr_overrides(world):
    doc = _issued_agreement(world)
    world.post("a_emp", f"/hr/me/generated-documents/{doc['id']}/sign/otp")
    body = {"typed_name": "Someone Else", "consent_version": _consent(world), "otp_code": _code(world)}
    r = world.post("a_emp", f"/hr/me/generated-documents/{doc['id']}/sign", json=body)
    assert r.json()["detail"]["code"] == "NAME_MISMATCH"
    assert world.post("a_hr", f"/hr/generated-documents/{doc['id']}/name-override",
                      json={"party": "employee", "name": "Someone Else", "reason": "legal name change"}).status_code == 200
    assert world.post("a_emp", f"/hr/me/generated-documents/{doc['id']}/sign", json=body).status_code == 200


def test_tampered_file_cannot_be_signed(world):
    doc = _issued_agreement(world)
    row = world.db.get(GeneratedDocument, doc["id"])
    store = storage.get_store()
    path = store._path(row.pdf_path)
    with open(path, "ab") as fh:
        fh.write(b"%tampered")
    world.post("a_emp", f"/hr/me/generated-documents/{doc['id']}/sign/otp")
    r = world.post("a_emp", f"/hr/me/generated-documents/{doc['id']}/sign",
                   json={"typed_name": "Canaryworker Example", "consent_version": _consent(world), "otp_code": _code(world)})
    assert r.status_code == 409 and r.json()["detail"]["code"] == "DOCUMENT_INTEGRITY_FAILED"
    assert world.db.query(DocumentSignature).count() == 0


def test_employer_cannot_sign_before_the_employee(world):
    doc = _issued_agreement(world)
    world.post("a_signer", f"/hr/generated-documents/{doc['id']}/employer-sign/otp")
    r = world.post("a_signer", f"/hr/generated-documents/{doc['id']}/employer-sign",
                   json={"typed_name": "Dana Director", "consent_version": _consent(world), "otp_code": _code(world)})
    assert r.status_code == 409


def test_decline_path(world):
    doc = _issued_agreement(world)
    assert world.post("a_emp", f"/hr/me/generated-documents/{doc['id']}/decline", json={"reason": " "}).status_code == 422
    r = world.post("a_emp", f"/hr/me/generated-documents/{doc['id']}/decline", json={"reason": "terms not agreed"})
    assert r.json()["status"] == "DECLINED"
    assert any(t == "document_declined.html" for _, t, _ in world.mail)
    sig = world.db.query(DocumentSignature).one()
    assert sig.decision == "DECLINED"
    mail_blob = repr([c for (_, t, c) in world.mail if t == "document_declined.html"])
    assert "terms not agreed" not in mail_blob, "the reason stays in the system, not in e-mail"


def test_drawn_signature_must_be_a_small_png(world):
    doc = _issued_agreement(world)
    world.post("a_emp", f"/hr/me/generated-documents/{doc['id']}/sign/otp")
    body = {"typed_name": "Canaryworker Example", "consent_version": _consent(world), "otp_code": _code(world), "method": "DRAWN",
            "drawn_signature": "data:image/png;base64,PHN2Zz4="}
    r = world.post("a_emp", f"/hr/me/generated-documents/{doc['id']}/sign", json=body)
    assert r.status_code == 422


# ── candidates ───────────────────────────────────────────────────────────────────────────────────────────────────────

def _candidate(w, email="casey.candidate@example.com"):
    from app.modules.hr.models import RecruitmentCandidate
    c = RecruitmentCandidate(name="Casey Candidate", email=email, position="Analyst", organization_id=1)
    w.db.add(c)
    w.db.commit()
    return c


def _offer(w, candidate):
    from app.modules.hr.models import RecruitmentOffer
    o = RecruitmentOffer(candidate_id=candidate.id, candidate_name=candidate.name, position="Analyst", organization_id=1, work_country="GB")
    w.db.add(o)
    w.db.commit()
    return o


def _candidate_doc(w):
    implement(w.db, "HR-HIR-011", execution_mode="SIGN_CANDIDATE", approval_policy="L1", legal_risk="L1")
    pack = make_pack(w.db, "GB")
    make_clause(w.db, pack)
    content = [{"type": "letterhead"}, {"type": "paragraph", "text": "Dear {{candidate.first_name}}"},
               {"type": "clause", "key": "notice_and_termination"}, {"type": "signature_block", "parties": ["candidate"]}]
    make_variant(w.db, "HR-HIR-011", pack, content=content, field_contract={"required": ["candidate.first_name"], "optional": []})
    c = _candidate(w)
    o = _offer(w, c)
    r = w.post("a_hr", "/hr/generated-documents/generate", json={"canonical_id": "HR-HIR-011", "subject_type": "candidate",
                                                                  "subject_id": c.id, "source_ref": f"recruitment_offer:{o.id}"})
    assert r.status_code == 201, r.text
    doc = r.json()
    w.post("a_hr", f"/hr/generated-documents/{doc['id']}/issue")
    link = [c for (_, t, c) in w.mail if t == "candidate_document_sign.html"][-1]["action_url"]
    return doc, link.rsplit("/", 1)[1]


def test_candidate_signs_through_a_single_use_link(world):
    doc, token = _candidate_doc(world)
    view = world.client.get(f"/public/documents/sign/{token}")
    assert view.status_code == 200 and view.json()["can_sign"] and "Casey" in view.json()["html"]
    assert world.client.get(f"/public/documents/sign/{token}/pdf").content.startswith(b"%PDF")
    assert world.client.post(f"/public/documents/sign/{token}/otp").status_code == 200
    body = {"typed_name": "casey  CANDIDATE", "consent_version": view.json()["consent"]["version"], "otp_code": _code(world)}
    r = world.client.post(f"/public/documents/sign/{token}/sign", json=body)
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "EXECUTED"
    assert world.client.get(f"/public/documents/sign/{token}").status_code == 404, "the link is used up"
    assert world.client.post(f"/public/documents/sign/{token}/sign", json=body).status_code == 404
    sig = world.db.query(DocumentSignature).one()
    assert sig.signer_party == "candidate" and sig.signer_employee_id is None and sig.otp_verified_at


def test_a_candidate_link_opens_only_its_own_document_and_dies_on_cancel(world):
    doc, token = _candidate_doc(world)
    assert world.client.get("/public/documents/sign/" + token[:-2] + "xx").status_code == 404
    world.post("a_hr", f"/hr/generated-documents/{doc['id']}/cancel", json={"reason": "offer withdrawn"})
    assert world.client.get(f"/public/documents/sign/{token}").status_code == 404


def test_public_verification_reveals_only_validity(world):
    ready(world.db)
    doc = gen(world).json()
    world.post("a_hr", f"/hr/generated-documents/{doc['id']}/issue")
    row = world.db.get(GeneratedDocument, doc["id"])
    ok = world.client.get(f"/public/documents/verify/{row.document_number}", params={"h": row.pdf_sha256[:16]}).json()
    assert ok == {"valid": True, "issuer_legal_name": "Tenant A Employer Ltd", "template_title": row.title,
                  "issued_on": row.issued_at.date().isoformat(), "status": "ISSUED"}
    assert world.client.get(f"/public/documents/verify/{row.document_number}", params={"h": "0" * 16}).json() == {"valid": False}
    assert world.client.get(f"/public/documents/verify/{row.document_number}").status_code == 422
