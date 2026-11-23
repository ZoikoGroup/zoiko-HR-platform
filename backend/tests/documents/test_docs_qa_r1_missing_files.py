"""QA round 1, R1-17 (and the shared root cause of R1-22): a record whose file is gone from the server's disk (a redeploy, or
another instance, on a platform whose disk is not persistent) answers 410 DOC_FILE_MISSING with what the caller can do about
it, is flagged in the approval queue, cannot be approved unseen, and a deployment storing uploads on a temporary disk is
reported at startup.
"""
import os

from app.modules.hr.documents import storage_service
from app.modules.hr.documents.category_service import company_category_by_key
from app.modules.hr.models import HrDocumentVersion
from test_docs_phase2_flows import _pdf, _upload as _employee_upload, api  # noqa: F401


def _cat(api, key="onboarding"):
    return company_category_by_key(api.db, 1, key)


def _company_upload(api, title="Job Description", key="onboarding"):
    api.as_("hr")
    r = api.post(f"/hr/documents/company-categories/{_cat(api, key).id}/files", data={"title": title},
                 files={"file": ("jd.pdf", _pdf(), "application/pdf")})
    assert r.status_code == 201, r.text
    return r.json()


def _lose_file(api, document_id):
    """What a redeploy does to a file on the container's disk: the record stays, the bytes are gone."""
    store = storage_service.get_store()
    for v in api.db.query(HrDocumentVersion).filter(HrDocumentVersion.document_id == document_id):
        if v.storage_key and store.exists(v.storage_key):
            os.remove(store._path(v.storage_key))


# ── R1-17: file missing on the server ────────────────────────────────────────────────────────────────────────

def test_an_employee_document_whose_file_is_gone_cannot_be_approved_unseen(api):
    body = _employee_upload(api, key="identity_proof").json()
    _lose_file(api, body["id"])
    api.as_("hr")
    queue = api.get("/hr/documents/approvals", params={"tab": "pending"}).json()["items"]
    item = next(i for i in queue if i["document_id"] == body["id"])
    assert item["file_available"] is False
    r = api.get(f"/hr/documents/{body['id']}/file")
    assert r.status_code == 410 and r.json()["recovery"] == "request_reupload"
    refused = api.post(f"/hr/documents/{body['id']}/decision/approve", json={})
    assert refused.status_code == 409 and refused.json()["error"] == "DOC_FILE_MISSING"
    # asking for a new copy is the way out
    asked = api.post(f"/hr/documents/{body['id']}/request-reupload", json={"reason_code": "illegible", "note": "The file was lost"})
    assert asked.status_code == 200, asked.text
    # the employee sees the same 410, told to upload it again
    api.as_("emp")
    assert api.get(f"/hr/documents/{body['id']}/file").json()["recovery"] == "upload_again"


def test_a_legacy_row_whose_encrypted_copy_is_gone_still_serves_its_original_file(api, tmp_path):
    doc = _company_upload(api)
    original = tmp_path / "legacy-original.pdf"
    original.write_bytes(_pdf())
    for v in api.db.query(HrDocumentVersion).filter(HrDocumentVersion.document_id == doc["id"]):
        v.file_path = str(original)            # what scripts/encrypt_hr_documents.py leaves behind (originals kept)
    api.db.commit()
    _lose_file(api, doc["id"])
    api.as_("hr")
    assert api.get(f"/hr/documents/{doc['id']}/file").status_code == 200


def test_storage_on_a_temporary_disk_is_reported_in_production(monkeypatch):
    monkeypatch.setenv("ENVIRONMENT", "production")
    monkeypatch.delenv("UPLOAD_BASE_DIR", raising=False)
    monkeypatch.delenv("HR_DOCUMENT_UPLOAD_DIR", raising=False)
    assert storage_service.storage_config_problems()
    monkeypatch.setenv("ENVIRONMENT", "testing")
    assert storage_service.storage_config_problems() == []
