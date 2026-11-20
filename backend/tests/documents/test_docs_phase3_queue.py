"""Documents Phase 3: the approval queue / history / summary, the audit trail and CSV, pre-checks 4/5/7 and the SLA job."""
from datetime import date, datetime, timedelta

import pytest

from app.modules.hr.documents import id_validators
from app.modules.hr.documents.automation import jobs
from app.modules.hr.documents.category_service import employee_category_by_key
from app.modules.hr.models import DocumentApprovalStep, HrDocumentVersion
from test_docs_phase2_flows import _notified, _pdf, _upload, api  # noqa: F401  (fixture re-used)


def test_the_queue_lists_pending_items_with_who_and_how_long(api):
    a = _upload(api).json()
    b = _upload(api, key="education", who="emp2", name="degree.pdf").json()
    api.as_("hr")
    page = api.get("/hr/documents/approvals").json()
    assert page["total"] == 2 and {i["document_id"] for i in page["items"]} == {a["id"], b["id"]}
    item = next(i for i in page["items"] if i["document_id"] == a["id"])
    assert item["employee"]["name"] == "Emp User" and item["category_key"] == "identity_proof"
    assert item["waiting_days"] == 0 and item["can_decide"] is True
    assert [s["role"] for s in item["steps"]] == ["hr_admin", "admin"]


def test_the_queue_says_why_someone_cannot_decide(api):
    own = _upload(api, who="hr").json()
    api.as_("hr")
    item = next(i for i in api.get("/hr/documents/approvals").json()["items"] if i["document_id"] == own["id"])
    assert (item["can_decide"], item["cannot_decide_reason"]) == (False, "self")
    other = _upload(api).json()
    api.as_("admin")
    api.post(f"/hr/documents/{other['id']}/review-lock")
    api.as_("hr")
    item = next(i for i in api.get("/hr/documents/approvals").json()["items"] if i["document_id"] == other["id"])
    assert item["cannot_decide_reason"] == "locked" and item["lock"]["by"] == "Admin User"


def test_cards_and_pending_tab_count_the_same_thing(api):
    a = _upload(api).json()
    _upload(api, key="education", name="degree.pdf")
    api.as_("hr")
    api.post(f"/hr/documents/{a['id']}/decision/approve", json={})
    summary = api.get("/hr/documents/approvals/summary").json()
    pending = api.get("/hr/documents/approvals").json()
    assert summary["awaiting_review"] == pending["total"] == 1
    assert summary["approved"] == 1


@pytest.mark.parametrize("params,expected", [
    ({"search": "Emp2"}, 1), ({"search": "C-1-emp2"}, 1), ({"search": "degree"}, 1),
    ({"category_key": "identity_proof"}, 1), ({"source": "company"}, 0),
])
def test_queue_filters(api, params, expected):
    _upload(api)
    _upload(api, key="education", who="emp2", name="degree.pdf", title="Degree")
    api.as_("hr")
    assert api.get("/hr/documents/approvals", params=params).json()["total"] == expected


def test_history_shows_who_decided(api):
    a = _upload(api).json()
    api.as_("hr")
    api.post(f"/hr/documents/{a['id']}/decision/reject", json={"reason_code": "illegible", "note": "Too blurry to read"})
    item = api.get("/hr/documents/approvals", params={"tab": "all", "status": "rejected"}).json()["items"][0]
    assert item["decided_by"] == {"name": "Hr User", "role": "hr_admin"} and item["rejection_reason"] == "Too blurry to read"


@pytest.mark.parametrize("who,code", [("emp", 403), ("mgr", 403), ("hr", 200)])
def test_only_approvers_see_the_queue_and_the_audit_trail(api, who, code):
    api.as_(who)
    assert api.get("/hr/documents/approvals").status_code == code
    assert api.get("/hr/documents/approvals/summary").status_code == code
    assert api.get("/hr/documents/audit").status_code == code


def test_the_audit_trail_is_filterable_and_exports_safely(api):
    a = _upload(api, title="=HYPERLINK(evil)").json()
    api.as_("hr")
    api.post(f"/hr/documents/{a['id']}/decision/approve", json={})
    rows = api.get("/hr/documents/audit", params={"action": ["approved"]}).json()["items"]
    assert [r["action"] for r in rows] == ["approved"] and rows[0]["actor"]["name"] == "Hr User"
    csv_text = api.get("/hr/documents/audit.csv").text
    assert csv_text.splitlines()[0].startswith("at,action,actor_type")
    assert "'=HYPERLINK" in csv_text and ",=HYPERLINK" not in csv_text       # no spreadsheet formula injection
    exported = api.get("/hr/documents/audit", params={"action": ["exported"]}).json()["items"]
    assert len(exported) == 1


# ── pre-checks 4, 5, 7 ─────────────────────────────────────────────────────────────────────────────────────────────

def test_the_same_file_twice_is_flagged(api):
    data = _pdf()
    first = _upload(api, data=data).json()
    api.as_("hr")
    api.post(f"/hr/documents/{first['id']}/decision/reject", json={"reason_code": "illegible", "note": "Too blurry to read"})
    second = _upload(api, data=data, replaces_document_id=first["id"]).json()
    codes = {c["code"] for c in second["precheck"]["checks"]}
    assert second["precheck"]["status"] == "warn" and "duplicate" in codes
    other = _upload(api, who="emp2", data=data).json()
    assert "duplicate_other_person" in {c["code"] for c in other["precheck"]["checks"]}


@pytest.mark.parametrize("key,value,ok", [
    ("in.aadhaar", "1234 5678 9012", False), ("in.aadhaar", "2345 678", False), ("in.pan", "ABCDE1234F", False),
    ("in.pan", "ABCPE1234F", True), ("passport", "K1234567", True), ("passport", "12", False),
])
def test_id_number_validators(key, value, ok):
    assert (id_validators.validate(key, value) is None) is ok


def test_a_valid_aadhaar_passes_the_verhoeff_checksum():
    base = "23456789012"
    valid = [d for d in "0123456789" if id_validators.verhoeff_valid(base + d)]
    assert len(valid) == 1                                          # exactly one check digit fits
    good = base + valid[0]
    bad = base + str((int(valid[0]) + 1) % 10)
    assert id_validators.validate("in.aadhaar", good) is None
    assert "checksum" in id_validators.validate("in.aadhaar", bad)
    assert id_validators.mask(good) == "••••••••" + good[-4:]


def test_a_category_with_an_id_check_warns_on_a_bad_number_and_stores_it_masked(api):
    cat = employee_category_by_key(api.db, 1, "identity_proof")
    cat.id_number_field = "in.pan"
    api.db.commit()
    body = _upload(api, id_number="ABCDE1234F").json()
    check = next(c for c in body["precheck"]["checks"] if c["code"] == "id_number")
    assert check["status"] == "warn"
    v = api.db.get(HrDocumentVersion, body["version_id"])
    assert "ABCDE1234F" not in str(v.precheck) and "••••••234F" in str(v.precheck)


def test_an_expiry_within_30_days_is_flagged(api):
    body = _upload(api, expiry_date=(date.today() + timedelta(days=10)).isoformat()).json()
    assert "expiry_soon" in {c["code"] for c in body["precheck"]["checks"]}
    api.as_("hr")
    assert api.get("/hr/documents/approvals", params={"precheck": "warn"}).json()["total"] == 1
    assert api.get("/hr/documents/approvals", params={"precheck": "pass"}).json()["total"] == 0


# ── SLA ────────────────────────────────────────────────────────────────────────────────────────────────────────────

def test_overdue_reviews_remind_hr_then_the_org_admin_once_each(api):
    body = _upload(api).json()
    v = api.db.get(HrDocumentVersion, body["version_id"])
    start = v.created_at
    assert jobs.approval_sla(api.db, 1, start + timedelta(hours=10)) == 0
    assert jobs.approval_sla(api.db, 1, start + timedelta(hours=73)) == 1       # HR admin
    assert jobs.approval_sla(api.db, 1, start + timedelta(hours=80)) == 0
    assert jobs.approval_sla(api.db, 1, start + timedelta(hours=145)) == 1      # Org admin
    assert "Document to review" in _notified(api, "admin")
    step = api.db.query(DocumentApprovalStep).filter_by(version_id=v.id, step_order=1).one()
    assert step.sla_level == 2
    api.as_("hr")
    assert api.get("/hr/documents/approvals/summary").json()["overdue"] == 0  # created just now in real time
