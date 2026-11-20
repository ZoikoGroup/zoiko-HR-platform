"""Post-submission onboarding: one submission pipeline (row, activity, HR digest, checklist) for uploads, package forms,
structured forms, acknowledgements and signatures; review; the admin list / detail / files / ZIP; the new hire's own
documents; tenant and hire isolation; masked bank data; details changed after sending."""
import io
import zipfile
from datetime import date, datetime, timedelta

import pytest

from app.modules.doc_templates import renderer, storage
from app.modules.hr import onboarding_package as P
from app.modules.hr import onboarding_submissions as S
from app.modules.hr.models import (OnboardingActivity, OnboardingChecklist, OnboardingDocument, OnboardingFormSubmission,
                                   OnboardingNewHire)
from tests.doc_templates.conftest import _no_rate_limit, world  # noqa: F401  (fixtures)
from tests.doc_templates.p2_support import code
from tests.doc_templates.test_dt_offer_package import GOVERNING_LAW, INPUTS, SETTINGS, _all_clauses, _v2_terms  # noqa: F401

BANK = "GB29NWBK60161331926819"
BANK_VALUES = {"account_holder": "Nora Newstarter", "bank_name": "Example Bank", "account_number": BANK, "routing_code": "601613"}
STARTER = {"legal_first_name": "Nora", "legal_last_name": "Newstarter", "date_of_birth": "1995-06-01",
           "personal_email": "nora.newstarter@example.com", "mobile_phone": "+44 7911 123456", "address_line1": "5 River Road",
           "city": "York", "postal_code": "YO1 1AA", "country": "United Kingdom", "preferred_language": "en"}


def _text(pdf: bytes) -> str:
    return " ".join(renderer.pdf_text(pdf).split())


def _hire(world, name="Nora Newstarter", email="nora.newstarter@example.com", org=1):
    h = OnboardingNewHire(organization_id=org, candidate_name=name, email=email, position="Analyst",
                          joining_date=date.today() + timedelta(days=14), status="offer_accepted", work_country="GB",
                          manager_id=world.u["a_manager"].id if org == 1 else None)
    world.db.add(h)
    world.db.commit()
    from app.modules.hr import onboarding_flow
    url = onboarding_flow.issue_portal_link(world.db, h, send=False)["url"]
    return h, url.rsplit("/", 1)[1]


def _request_upload(world, h, category="id_proof"):
    from app.modules.hr import onboarding_flow
    return onboarding_flow.request_documents(world.db, h, [category], notify=False)[0]


def _upload(world, token, doc_id, content=b"%PDF-1.4 passport scan", name="passport.pdf"):
    return world.client.post(f"/public/onboarding/{token}/documents/{doc_id}", files={"file": (name, content, "application/pdf")})


def _items(world, h):
    world.db.expire_all()
    cl = world.db.query(OnboardingChecklist).filter_by(onboarding_new_hire_id=h.id, name=P.CHECKLIST_NAME, is_deleted=False).one()
    return {i.item_key: i for i in cl.items if not i.is_deleted}, cl


def _digests(world):
    return [m for m in world.mail if m[1] == "onboarding_submissions_digest.html"]


def _send_package(world, h):
    assert world.put("a_admin", "/hr/onboarding/package/settings", json={**SETTINGS, "clauses": {
        **_all_clauses(), "governing_law": {"text": GOVERNING_LAW}}}).status_code == 200
    assert world.put("a_admin", f"/hr/onboarding/new-hires/{h.id}/package/inputs", json={"values": INPUTS}).status_code == 200
    body = world.post("a_admin", f"/hr/onboarding/new-hires/{h.id}/send-package").json()
    return {i["category"] for i in body["issued"]}


def _rows(world, h):
    world.db.expire_all()
    return {r.category: r for r in world.db.query(OnboardingDocument).filter_by(onboarding_new_hire_id=h.id, is_deleted=False)}


def _list(world, who="a_admin", **params):
    r = world.get(who, "/hr/onboarding/documents", params=params)
    assert r.status_code == 200, r.text
    return r.json()


# ── uploads ──────────────────────────────────────────────────────────────────────────────────────────────────────────
def test_upload_creates_row_log_digest_and_checklist_and_review_drives_the_item(world):
    h, token = _hire(world)
    req = _request_upload(world, h)
    r = _upload(world, token, req.id)
    assert r.status_code == 200, r.text
    row = _rows(world, h)["id_proof"]
    assert row.status == "pending" and row.submitted_at and row.version == 1 and row.kind == "upload"
    assert row.file_path.startswith("t1/"), "uploads go to the document store under the tenant"
    assert world.db.query(OnboardingActivity).filter_by(onboarding_new_hire_id=h.id, action="Document Submitted").count() == 1
    assert len(_digests(world)) >= 1 and _digests(world)[0][2]["candidate_name"] == "Nora Newstarter"
    items, _cl = _items(world, h)
    it = items[f"doc_{row.id}"]
    assert it.title == "Upload " + row.title and it.description == "Submitted – HR to review" and not it.completed

    # admin list: hire name, filters, pending first
    listed = _list(world, hire_id=h.id)
    assert listed[0]["id"] == row.id and listed[0]["hire_name"] == "Nora Newstarter" and listed[0]["position"] == "Analyst"
    assert listed[0]["kind"] == "upload" and listed[0]["board_state"] == "needs_review" and listed[0]["version"] == 1
    assert listed[0]["submitted_at"]
    assert _list(world, status="approved", hire_id=h.id) == []
    assert [d["id"] for d in _list(world, type="id_proof", hire_id=h.id)] == [row.id]

    # reject needs a reason (422); with one, the item says Returned – reason
    assert world.post("a_admin", f"/hr/onboarding/documents/{row.id}/review", json={"decision": "reject"}).status_code == 422
    r = world.post("a_admin", f"/hr/onboarding/documents/{row.id}/review", json={"decision": "reject", "reason": "Blurred scan."})
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "rejected" and r.json()["reviewed_by_name"] == "Avery Admin"
    items, _cl = _items(world, h)
    assert items[f"doc_{row.id}"].description == "Returned – Blurred scan." and not items[f"doc_{row.id}"].completed

    # resubmission: version 2 with history
    assert _upload(world, token, req.id, b"%PDF-1.4 sharp scan").status_code == 200
    row = _rows(world, h)["id_proof"]
    assert row.version == 2 and row.status == "pending"
    det = world.get("a_admin", f"/hr/onboarding/documents/{row.id}/detail").json()
    assert [x["version"] for x in det["history"]] == [1, 2]
    assert det["history"][0]["rejection_reason"] == "Blurred scan." and det["history"][0]["reviewed_by_name"] == "Avery Admin"
    assert det["answers"] is None and det["can_reveal"] is False

    r = world.post("a_admin", f"/hr/onboarding/documents/{row.id}/review", json={"decision": "approve"})
    assert r.status_code == 200 and r.json()["status"] == "approved" and r.json()["board_state"] == "completed"
    items, cl = _items(world, h)
    assert items[f"doc_{row.id}"].completed and items[f"doc_{row.id}"].completed_at and items[f"doc_{row.id}"].description == "Done"
    assert cl.status == "completed"

    f = world.get("a_admin", f"/hr/onboarding/documents/{row.id}/file?download=1")
    assert f.status_code == 200 and f.content == b"%PDF-1.4 sharp scan"
    assert f.headers["content-disposition"].startswith("attachment") and f.headers["content-type"] == "application/pdf"
    assert world.get("a_admin", f"/hr/onboarding/documents/{row.id}/file").headers["content-disposition"].startswith("inline")


def test_digest_is_throttled_to_one_per_hire_per_ten_minutes(world):
    h, token = _hire(world)
    a, b = _request_upload(world, h, "id_proof"), _request_upload(world, h, "education_certificates")
    assert _upload(world, token, a.id).status_code == 200
    assert _upload(world, token, b.id).status_code == 200
    admins = {m[0] for m in _digests(world)}
    assert len(_digests(world)) == len(admins), "one digest per admin, the second submission within 10 minutes is held"
    world.db.refresh(h)
    later = datetime.fromisoformat(h.profile_details[S.DIGEST_KEY]) + timedelta(minutes=11)
    assert S.send_digest(world.db, h, now=later - timedelta(minutes=2)) == 0, "still inside the 10-minute window"
    n = len(_digests(world))
    assert S.send_digest(world.db, h, now=later) == len(admins), "the held submission goes out in the next digest"
    held = _digests(world)[n:]
    assert all([i["title"] for i in m[2]["items"]] == [b.title] for m in held)
    assert S.send_digest(world.db, h, now=later + timedelta(minutes=11)) == 0, "nothing new since the last digest"


# ── structured forms ─────────────────────────────────────────────────────────────────────────────────────────────────
def test_structured_forms_get_a_row_with_a_masked_filled_pdf_and_verify_marks_done(world):
    h, token = _hire(world)
    r = world.client.post(f"/public/onboarding/{token}/forms/HR-ONB-017/submit",
                          json={"values": BANK_VALUES, "declaration_accepted": True})
    assert r.status_code == 200, r.text
    row = _rows(world, h)["bank_details"]
    assert row.kind == "form" and row.status == "pending" and row.form_submission_id == r.json()["id"]
    assert P.mode_of(row) is None and S.mode_for(row) == "COMPLETE"
    pdf = _text(storage.get_store().get(row.file_path))
    assert "****6819" in pdf and BANK not in pdf and "Nora Newstarter" in pdf and "Example Bank" not in pdf
    assert world.db.query(OnboardingActivity).filter_by(onboarding_new_hire_id=h.id, action="Form Submitted").count() == 1
    assert _digests(world)
    items, _cl = _items(world, h)
    assert items[f"doc_{row.id}"].description == "Submitted – HR to review"
    # not shown as an upload on the portal page; listed under My documents
    assert not any(d["id"] == row.id for d in world.client.get(f"/public/onboarding/{token}").json()["documents"])
    mine = {d["id"]: d for d in world.client.get(f"/public/onboarding/{token}/my-documents").json()}
    assert mine[row.id]["kind"] == "form" and mine[row.id]["can_download"] and mine[row.id]["status_label"] == "Submitted – HR to review"

    listed = next(d for d in _list(world, hire_id=h.id) if d["id"] == row.id)
    assert listed["package_mode"] == "COMPLETE" or listed["kind"] == "form"
    det = world.get("a_hr", f"/hr/onboarding/documents/{row.id}/detail").json()
    acct = next(a for a in det["answers"] if a["label"].lower().startswith("account number"))
    assert acct["masked"] and acct["value"] == "****6819" and BANK not in str(det)
    assert det["evidence"]["method"] == "typed declaration" and det["can_reveal"] is False
    assert world.get("a_hr", f"/hr/onboarding/documents/{row.id}/detail?reveal=1").status_code == 403
    revealed = world.get("a_admin", f"/hr/onboarding/documents/{row.id}/detail?reveal=1")
    assert revealed.status_code == 200 and BANK in revealed.text
    assert world.db.query(OnboardingActivity).filter_by(onboarding_new_hire_id=h.id, action="Details revealed").count() == 1

    # bank approval needs finance permission; with it, approving verifies the submission and ticks the item
    assert world.post("a_hr", f"/hr/onboarding/documents/{row.id}/review", json={"decision": "approve"}).status_code == 403
    assert world.put("a_admin", "/hr/onboarding/finance-viewers", json={"employee_ids": [world.u["a_hr2"].id]}).status_code == 200
    r = world.post("a_hr2", f"/hr/onboarding/documents/{row.id}/review", json={"decision": "approve"})
    assert r.status_code == 200 and r.json()["status"] == "approved", r.text
    world.db.expire_all()
    assert world.db.get(OnboardingFormSubmission, row.form_submission_id).status == "VERIFIED"
    items, _cl = _items(world, h)
    assert items[f"doc_{row.id}"].completed


def test_returning_a_structured_form_shows_returned_and_resubmission_is_version_two(world):
    h, token = _hire(world)
    assert world.client.post(f"/public/onboarding/{token}/forms/HR-ONB-001/submit",
                             json={"values": STARTER, "declaration_accepted": True}).status_code == 200
    row = _rows(world, h)["starter_info"]
    # the existing verify / return endpoints move the row too
    r = world.post("a_hr", f"/hr/onboarding/forms/{row.form_submission_id}/return", json={"reason": "Wrong postcode."})
    assert r.status_code == 200, r.text
    row = _rows(world, h)["starter_info"]
    assert row.status == "rejected" and row.rejection_reason == "Wrong postcode."
    items, _cl = _items(world, h)
    assert items[f"doc_{row.id}"].description == "Returned – Wrong postcode."
    mine = {d["id"]: d for d in world.client.get(f"/public/onboarding/{token}/my-documents").json()}
    assert mine[row.id]["can_resubmit"] and mine[row.id]["rejection_reason"] == "Wrong postcode."
    assert world.client.post(f"/public/onboarding/{token}/forms/HR-ONB-001/submit",
                             json={"values": {**STARTER, "postal_code": "YO1 7HH"}, "declaration_accepted": True}).status_code == 200
    row = _rows(world, h)["starter_info"]
    assert row.version == 2 and row.status == "pending"
    assert "YO1 7HH" in _text(world.get("a_admin", f"/hr/onboarding/documents/{row.id}/file").content)
    r = world.post("a_hr", f"/hr/onboarding/forms/{row.form_submission_id}/verify")
    assert r.status_code == 200, r.text
    row = _rows(world, h)["starter_info"]
    items, _cl = _items(world, h)
    assert row.status == "approved" and items[f"doc_{row.id}"].completed


# ── package documents: acknowledge, package form, sign ───────────────────────────────────────────────────────────────
def test_package_acknowledge_form_and_sign_go_through_the_pipeline_and_board_matches_checklist(world):
    h, token = _hire(world)
    issued = _send_package(world, h)
    assert {"job_description", "self_disclosure", "offer_letter"} <= issued
    rows = _rows(world, h)

    # acknowledge: ACK rows store a document-store key; the admin file endpoint must serve it (was 410)
    jd = rows["job_description"]
    assert world.get("a_admin", f"/hr/onboarding/documents/{jd.id}/file").status_code == 200
    a = world.client.post(f"/public/onboarding/{token}/documents/{jd.id}/acknowledge", json={"text_version": P.ACK_TEXT_VERSION})
    assert a.status_code == 200, a.text
    jd = _rows(world, h)["job_description"]
    assert jd.submitted_at and jd.status == "approved"
    assert world.db.query(OnboardingActivity).filter_by(onboarding_new_hire_id=h.id, action="Document acknowledged").count() == 1
    det = world.get("a_admin", f"/hr/onboarding/documents/{jd.id}/detail").json()
    assert det["evidence"]["acknowledged_at"] and det["evidence"]["method"] == "acknowledgement"
    assert world.post("a_admin", f"/hr/onboarding/documents/{jd.id}/review", json={"decision": "approve"}).status_code == 400

    # package form: filled PDF in the store, with answers, signed name and date
    form = world.client.get(f"/public/onboarding/{token}/package-forms/self_disclosure").json()
    ans = form["answers"]
    for it in form["items"]:
        if it["type"] == "choice":
            ans[it["id"]] = "No"
        elif it["type"] == "text":
            ans[it["id"]] = "Nothing to add."
        elif it["type"] == "signature":
            ans[it["id"]] = {"name": "Nora Newstarter", "confirmed": True}
    r = world.client.post(f"/public/onboarding/{token}/package-forms/self_disclosure/submit", json={"answers": ans})
    assert r.status_code == 200, r.text
    sd = _rows(world, h)["self_disclosure"]
    assert sd.file_path.startswith("t1/") and sd.status == "pending" and sd.submitted_at
    for url in (f"/hr/onboarding/documents/{sd.id}/file",):
        text = _text(world.get("a_admin", url).content)
        assert "Nothing to add." in text and "Nora Newstarter" in text and "Signed electronically" in text
    portal_pdf = world.client.get(f"/public/onboarding/{token}/my-documents/{sd.id}/file?download=1")
    assert portal_pdf.status_code == 200 and "Nothing to add." in _text(portal_pdf.content)
    assert portal_pdf.headers["content-disposition"].startswith("attachment")
    det = world.get("a_admin", f"/hr/onboarding/documents/{sd.id}/detail").json()
    assert any(x["value"] == "Nothing to add." for x in det["answers"])
    assert any(x["label"] == "Signed by" and x["value"] == "Nora Newstarter" for x in det["answers"])

    # sign the offer letter: the executed copy (with certificate) is what admin and portal get
    offer = _rows(world, h)["offer_letter"]
    view = world.client.get(f"/public/onboarding/{token}").json()
    sign_url = next(d for d in view["documents"] if d["id"] == offer.id)["sign_url"]
    sig_tok = sign_url.rsplit("/", 1)[1]
    v = world.client.get(f"/public/documents/sign/{sig_tok}").json()
    world.client.post(f"/public/documents/sign/{sig_tok}/otp")
    s = world.client.post(f"/public/documents/sign/{sig_tok}/sign", json={"typed_name": "Nora Newstarter",
                          "consent_version": v["consent"]["version"], "otp_code": code(world)})
    assert s.status_code == 200, s.text
    offer = _rows(world, h)["offer_letter"]
    assert offer.status == "approved" and offer.submitted_at
    assert world.db.query(OnboardingActivity).filter_by(onboarding_new_hire_id=h.id, action="Document Signed").count() == 1
    executed = world.get("a_admin", f"/hr/onboarding/documents/{offer.id}/file")
    mine = world.client.get(f"/public/onboarding/{token}/my-documents/{offer.id}/file")
    assert executed.status_code == 200 and executed.content == mine.content
    assert "certificate" in _text(executed.content).lower()
    det = world.get("a_admin", f"/hr/onboarding/documents/{offer.id}/detail").json()
    assert det["evidence"]["signed_by"] == "Nora Newstarter" and det["evidence"]["signed_at"]

    # board and checklist agree on every package document (one rule for done; needs_review is not done)
    board = world.get("a_admin", "/hr/onboarding/package/status-board").json() \
        if world.get("a_admin", "/hr/onboarding/package/status-board").status_code == 200 else None
    data = board or P.status_board(world.db, 1)
    hire_row = next(x for x in data["hires"] if x["new_hire_id"] == h.id)
    items, _cl = _items(world, h)
    for cat, cell in hire_row["documents"].items():
        doc_id = cell["onboarding_document_id"]
        if doc_id and f"doc_{doc_id}" in items:
            assert items[f"doc_{doc_id}"].completed == S.is_done(cell["state"]), cat
    assert hire_row["documents"]["self_disclosure"]["state"] == "needs_review"
    assert hire_row["done"] == sum(1 for c in hire_row["documents"].values() if S.is_done(c["state"]))

    # ZIPs: admin per hire, portal for the hire
    z = world.get("a_admin", f"/hr/onboarding/new-hires/{h.id}/documents.zip")
    assert z.status_code == 200 and z.headers["content-type"] == "application/zip"
    names = zipfile.ZipFile(io.BytesIO(z.content)).namelist()
    assert len(names) >= 4 and any("Offer Letter" in n for n in names)
    pz = world.client.get(f"/public/onboarding/{token}/my-documents.zip")
    assert pz.status_code == 200 and len(zipfile.ZipFile(io.BytesIO(pz.content)).namelist()) == len(names)
    assert world.get("b_admin", f"/hr/onboarding/new-hires/{h.id}/documents.zip").status_code == 404


# ── isolation ────────────────────────────────────────────────────────────────────────────────────────────────────────
def test_tenant_and_hire_isolation_for_files(world):
    h, token = _hire(world)
    other, other_token = _hire(world, name="Omar Other", email="omar.other@example.com")
    req = _request_upload(world, h)
    assert _upload(world, token, req.id).status_code == 200
    assert world.get("b_admin", f"/hr/onboarding/documents/{req.id}/file").status_code == 404, "org B cannot fetch org A's file"
    assert world.get("b_admin", f"/hr/onboarding/documents/{req.id}/detail").status_code == 404
    assert world.post("b_admin", f"/hr/onboarding/documents/{req.id}/review", json={"decision": "approve"}).status_code == 404
    assert world.client.get(f"/public/onboarding/{other_token}/my-documents/{req.id}/file").status_code == 404, \
        "hire B's link cannot fetch hire A's document"
    assert all(d["id"] != req.id for d in world.client.get(f"/public/onboarding/{other_token}/my-documents").json())
    assert all(d["hire_name"] != "Nora Newstarter" for d in _list(world, "b_admin"))
    # a row pointing at another tenant's store key is never served
    row = world.db.get(OnboardingDocument, req.id)
    key_b = storage.get_store().put(2, "foreign.pdf", b"%PDF-1.4 tenant b")
    row.file_path = key_b
    world.db.commit()
    assert world.get("a_admin", f"/hr/onboarding/documents/{req.id}/file").status_code == 410


def test_legacy_disk_uploads_are_still_served(world, tmp_path):
    h, token = _hire(world)
    req = _request_upload(world, h)
    folder = tmp_path / "t1"
    folder.mkdir()
    path = folder / "legacy.png"
    path.write_bytes(b"\x89PNG legacy")
    row = world.db.get(OnboardingDocument, req.id)
    row.file_path, row.status = str(path), "pending"
    world.db.commit()
    r = world.get("a_admin", f"/hr/onboarding/documents/{req.id}/file")
    assert r.status_code == 200 and r.content == b"\x89PNG legacy" and r.headers["content-type"] == "image/png"


# ── checklist backfill and details changed ───────────────────────────────────────────────────────────────────────────
def test_backfill_is_idempotent_and_creates_rows_for_submitted_forms(world):
    h, token = _hire(world)
    assert world.client.post(f"/public/onboarding/{token}/forms/HR-ONB-001/submit",
                             json={"values": STARTER, "declaration_accepted": True}).status_code == 200
    req = _request_upload(world, h)
    # simulate pre-pipeline data: drop the form row and the checklist
    world.db.query(OnboardingDocument).filter_by(onboarding_new_hire_id=h.id, kind="form").delete()
    for cl in world.db.query(OnboardingChecklist).filter_by(onboarding_new_hire_id=h.id).all():
        cl.is_deleted = True
    world.db.commit()
    first = S.backfill(world.db, organization_id=1)
    assert first["form_rows_created"] == 1
    items, _cl = _items(world, h)
    rows = _rows(world, h)
    assert {f"doc_{rows['starter_info'].id}", f"doc_{req.id}"} <= set(items)
    assert items[f"doc_{req.id}"].description == "Open"
    second = S.backfill(world.db, organization_id=1)
    assert second["form_rows_created"] == 0
    items2, _cl = _items(world, h)
    assert set(items2) == set(items)


def test_sent_unsigned_documents_are_flagged_when_the_hire_changes_details(world):
    h, token = _hire(world)
    _send_package(world, h)
    r = world.client.put(f"/public/onboarding/{token}/details",
                         json={"address": "5 River Road", "city": "York", "postal_code": "YO1 1AA", "country": "United Kingdom"})
    assert r.status_code == 200, r.text
    rows = _rows(world, h)
    nda_pdf = storage.get_store().get(world.db.get(P.GeneratedDocument, rows["nda"].document_id).pdf_path)
    r = world.client.put(f"/public/onboarding/{token}/details",
                         json={"address": "9 New Street", "city": "Leeds", "postal_code": "LS1 4AP", "country": "United Kingdom"})
    assert r.status_code == 200, r.text
    rows = _rows(world, h)
    assert rows["nda"].details_changed, "sent, unsigned, printed the old address"
    assert storage.get_store().get(world.db.get(P.GeneratedDocument, rows["nda"].document_id).pdf_path) == nda_pdf, \
        "a sent document is never altered"
    listed = {d["id"]: d for d in _list(world, hire_id=h.id)}
    assert listed[rows["nda"].id]["details_changed"] is True


def test_a_rendered_placeholder_holds_the_document(world, monkeypatch):
    h, _token = _hire(world)
    real = renderer.pdf_text
    monkeypatch.setattr(renderer, "pdf_text", lambda data: real(data) + " {{worker.full_name}}")
    assert world.put("a_admin", "/hr/onboarding/package/settings", json={**SETTINGS, "clauses": {
        **_all_clauses(), "governing_law": {"text": GOVERNING_LAW}}}).status_code == 200
    assert world.put("a_admin", f"/hr/onboarding/new-hires/{h.id}/package/inputs", json={"values": INPUTS}).status_code == 200
    body = world.post("a_admin", f"/hr/onboarding/new-hires/{h.id}/send-package").json()
    assert body["issued"] == [] and all("unfilled placeholder" in x["missing_fields"] for x in body["held"]
                                        if x["missing_fields"] == ["unfilled placeholder"])
    assert any(x["missing_fields"] == ["unfilled placeholder"] for x in body["held"])


def test_the_by_employee_status_update_uses_the_same_review_logic(world):
    """PUT /hr/onboarding/documents/{id} with approved / rejected: reason required, history, structured form returned /
    verified, checklist follows (the same path as POST …/review)."""
    h, token = _hire(world)
    req = _request_upload(world, h)
    assert _upload(world, token, req.id).status_code == 200
    assert world.put("a_admin", f"/hr/onboarding/documents/{req.id}", json={"status": "rejected"}).status_code in (400, 422)
    r = world.put("a_admin", f"/hr/onboarding/documents/{req.id}", json={"status": "rejected", "rejection_reason": "Expired."})
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "rejected" and r.json()["reviewed_by_name"] == "Avery Admin"
    row = _rows(world, h)["id_proof"]
    assert row.history and row.history[-1]["rejection_reason"] == "Expired."
    items, _cl = _items(world, h)
    assert items[f"doc_{row.id}"].description == "Returned – Expired."
    assert _upload(world, token, req.id).status_code == 200
    r = world.put("a_admin", f"/hr/onboarding/documents/{req.id}", json={"status": "approved"})
    assert r.status_code == 200 and r.json()["version"] == 2 and r.json()["board_state"] == "completed"
    items, _cl = _items(world, h)
    assert items[f"doc_{row.id}"].completed

    # a structured form: PUT rejected returns the submission to the hire; PUT approved verifies it
    assert world.client.post(f"/public/onboarding/{token}/forms/HR-ONB-017/submit",
                             json={"values": BANK_VALUES, "declaration_accepted": True}).status_code == 200
    form = _rows(world, h)["bank_details"]
    r = world.put("a_admin", f"/hr/onboarding/documents/{form.id}", json={"status": "rejected", "rejection_reason": "Wrong bank."})
    assert r.status_code == 200, r.text
    world.db.expire_all()
    assert world.db.get(OnboardingFormSubmission, form.form_submission_id).status == "RETURNED"
    assert world.client.post(f"/public/onboarding/{token}/forms/HR-ONB-017/submit",
                             json={"values": BANK_VALUES, "declaration_accepted": True}).status_code == 200
    assert world.put("a_hr", f"/hr/onboarding/documents/{form.id}", json={"status": "approved"}).status_code == 403, \
        "bank details: finance permission"
    r = world.put("a_admin", "/hr/onboarding/finance-viewers", json={"employee_ids": [world.u["a_admin"].id]})
    assert r.status_code == 200
    r = world.put("a_admin", f"/hr/onboarding/documents/{form.id}", json={"status": "approved"})
    assert r.status_code == 200 and r.json()["status"] == "approved" and r.json()["version"] == 2, r.text
    world.db.expire_all()
    assert world.db.get(OnboardingFormSubmission, form.form_submission_id).status == "VERIFIED"
