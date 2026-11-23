"""Company Documents P4: emailing a company file, folder or category.

Portal link (employees only; files must be published and visible to every recipient, unless "also give them access" is
ticked, which assigns the files) or attachments (only download-allowed files, at most 10 MB; the only way to reach outside
addresses). Each recipient has a delivery status; failed ones can be retried. Admins only; nothing about SMTP leaks."""
import pytest

from app.modules.hr.documents import share_service
from app.modules.hr.documents.models import HrDocumentAuditLog, HrDocumentShareRecipient
from app.modules.hr.models import DocumentAssignment
from test_docs_phase2_flows import api  # noqa: F401
from test_docs_phase5_company import _cat, _share, _upload, _visible_titles, depts  # noqa: F401


@pytest.fixture
def mail(monkeypatch):
    """Email is configured; every send is captured. Put an address in `fail` to make its send fail once."""
    from app.services import email_service
    box = {"sent": [], "fail": set()}

    def fake_send(email, template_name, context, db=None, organization_id=None, attachments=None, error_out=None, wait=False, **kw):
        if email in box["fail"]:
            box["fail"].discard(email)
            if error_out is not None:
                error_out.append("550 mailbox unavailable")
            return False
        box["sent"].append({"to": email, "template": template_name, "context": dict(context), "attachments": attachments})
        return True

    monkeypatch.setattr(share_service, "email_configured", lambda db: True)
    monkeypatch.setattr(email_service, "send_approval_email", fake_send)
    return box


def _send(api, who="hr", **body):
    api.as_(who)
    return api.post("/hr/documents/shares/email", json=body)


def _people(api, *keys):
    return [api.people[k].id for k in keys]


def test_nothing_is_sent_when_email_is_not_set_up(api, monkeypatch):
    monkeypatch.setattr(share_service, "email_configured", lambda db: False)
    doc = _upload(api, title="Leave form")
    r = _send(api, target_type="document", target_id=doc["id"], employee_ids=_people(api, "emp"))
    assert r.status_code == 503 and r.json()["error"] == "DOC_EMAIL_NOT_CONFIGURED"
    status = api.get("/hr/documents/email-status").json()
    assert status["configured"] is False and set(status) == {"configured", "max_attachment_mb", "max_recipients", "max_external", "message"}


def test_a_portal_link_goes_to_employees_who_can_open_the_file(api, mail):
    _share(api, "category", _cat(api, "forms_templates").id)
    doc = _upload(api, title="Leave form")
    r = _send(api, target_type="document", target_id=doc["id"], employee_ids=_people(api, "emp", "emp2"), message="Please read <b>today</b>")
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["status"] == "sent" and body["counts"]["sent"] == 2 and body["files"] == [{"id": doc["id"], "title": "Leave form"}]
    assert sorted(m["to"] for m in mail["sent"]) == ["emp2@org1.example.com", "emp@org1.example.com"]
    one = mail["sent"][0]
    assert one["template"] == "document_share.html" and one["attachments"] is None
    assert one["context"]["action_url"].endswith("/employee/documents/company") and "Leave form" in one["context"]["subject"]
    assert api.db.query(HrDocumentAuditLog).filter_by(action="shared_by_email", document_id=doc["id"]).count() == 1


def test_people_who_cannot_open_it_are_named_unless_access_is_granted(api, mail):
    doc = _upload(api, title="Pay policy")                       # admin only
    r = _send(api, target_type="document", target_id=doc["id"], employee_ids=_people(api, "emp"))
    assert r.status_code == 422 and r.json()["error"] == "DOC_SHARE_NO_ACCESS" and r.json()["names"] == ["Emp User"]
    assert mail["sent"] == []
    r = _send(api, target_type="document", target_id=doc["id"], employee_ids=_people(api, "emp"), grant_portal_access=True)
    assert r.status_code == 201 and r.json()["grant_portal_access"] is True
    assert api.db.query(DocumentAssignment).filter_by(document_id=doc["id"], employee_id=api.people["emp"].id).count() == 1
    assert _visible_titles(api, "emp") == ["Pay policy"] and _visible_titles(api, "emp2") == []


def test_a_link_to_an_unpublished_file_is_refused(api, mail):
    _share(api, "category", _cat(api, "forms_templates").id)
    doc = _upload(api, title="Draft", publish_at="2031-01-01T09:00:00Z")
    r = _send(api, target_type="document", target_id=doc["id"], employee_ids=_people(api, "emp"))
    assert r.status_code == 422 and r.json()["error"] == "DOC_SHARE_NOT_PUBLISHED"


def test_outside_addresses_only_get_attachments_and_only_of_downloadable_files(api, mail):
    cat = _cat(api, "forms_templates")
    _share(api, "category", cat.id)                              # view only
    doc = _upload(api, title="Leave form")
    r = _send(api, target_type="document", target_id=doc["id"], emails=["auditor@example.org"])
    assert r.status_code == 422 and "only receive attachments" in r.json()["message"]
    r = _send(api, target_type="document", target_id=doc["id"], mode="attachment", emails=["auditor@example.org"])
    assert r.status_code == 422 and r.json()["error"] == "DOC_SHARE_VIEW_ONLY"
    _share(api, "category", cat.id, permission="download")
    r = _send(api, target_type="document", target_id=doc["id"], mode="attachment", emails=["Auditor@Example.org"],
              employee_ids=_people(api, "emp"))
    assert r.status_code == 201, r.text
    kinds = {x["email"]: x["kind"] for x in r.json()["recipients"]}
    assert kinds == {"auditor@example.org": "external", "emp@org1.example.com": "employee"}
    sent = next(m for m in mail["sent"] if m["to"] == "auditor@example.org")
    (name, data), = sent["attachments"]
    assert data.startswith(b"%PDF") and sent["context"]["action_url"] is None


def test_attachments_are_capped_at_ten_megabytes(api, mail, monkeypatch):
    cat = _cat(api, "forms_templates")
    _share(api, "category", cat.id, permission="download")
    doc = _upload(api, title="Big")
    monkeypatch.setattr(share_service, "MAX_ATTACHMENT_BYTES", 10)
    r = _send(api, target_type="document", target_id=doc["id"], mode="attachment", employee_ids=_people(api, "emp"))
    assert r.status_code == 422 and r.json()["error"] == "DOC_SHARE_TOO_LARGE"


@pytest.mark.parametrize("body,needle", [
    ({"emails": ["not-an-email"], "mode": "attachment"}, "not a valid email"),
    ({"employee_ids": "OTHER"}, "not active employees"),
    ({}, "at least one person"),
])
def test_bad_recipients(api, mail, body, needle):
    _share(api, "category", _cat(api, "forms_templates").id, permission="download")
    doc = _upload(api, title="Leave form")
    if body.get("employee_ids") == "OTHER":
        body = {"employee_ids": [api.people["other"].id]}
    r = _send(api, target_type="document", target_id=doc["id"], **body)
    assert r.status_code == 422 and needle in r.json()["message"]


def test_a_failed_delivery_can_be_retried_once_it_works(api, mail):
    _share(api, "category", _cat(api, "forms_templates").id)
    doc = _upload(api, title="Leave form")
    mail["fail"].add("emp2@org1.example.com")
    share = _send(api, target_type="document", target_id=doc["id"], employee_ids=_people(api, "emp", "emp2")).json()
    assert share["status"] == "partial"
    bad = next(x for x in share["recipients"] if x["email"] == "emp2@org1.example.com")
    assert bad["status"] == "failed" and "550" in bad["error"]
    again = api.post(f"/hr/documents/shares/{share['id']}/retry").json()
    assert again["status"] == "sent"
    assert api.db.query(HrDocumentShareRecipient).filter_by(email="emp2@org1.example.com").one().attempts == 2
    assert [m["to"] for m in mail["sent"]].count("emp@org1.example.com") == 1        # the one who got it is not re-sent
    assert api.post(f"/hr/documents/shares/{share['id']}/retry").status_code == 409


def test_a_folder_share_includes_sub_folders_and_departments_expand(api, mail, depts):
    cat = _cat(api, "onboarding")
    _share(api, "category", cat.id)
    api.as_("hr")
    top = api.post("/hr/document-folders", data={"name": "Joining", "company_category_id": str(cat.id)}).json()
    sub = api.post("/hr/document-folders", data={"name": "Signed", "parent_id": str(top["id"]), "company_category_id": str(cat.id)}).json()
    _upload(api, key="onboarding", title="NDA", folder_id=top["id"])
    _upload(api, key="onboarding", title="Bank form", folder_id=sub["id"])
    r = _send(api, target_type="folder", target_id=top["id"], department_ids=[depts["eng"]])
    assert r.status_code == 201, r.text
    assert sorted(f["title"] for f in r.json()["files"]) == ["Bank form", "NDA"]
    assert [m["to"] for m in mail["sent"]] == ["emp@org1.example.com"] and mail["sent"][0]["context"]["file_count"] == 2
    listed = api.get("/hr/documents/shares", params={"target_type": "folder", "target_id": top["id"]}).json()
    assert listed["total"] == 1 and listed["items"][0]["target_name"] == "Joining"


@pytest.mark.parametrize("who", ["emp", "mgr"])
def test_only_admins_share_by_email(api, mail, who):
    doc = _upload(api, title="Leave form")
    assert _send(api, who=who, target_type="document", target_id=doc["id"], employee_ids=_people(api, "emp")).status_code == 403
    api.as_(who)
    assert api.get("/hr/documents/shares").status_code == 403
    assert api.get("/hr/documents/email-status").status_code == 403


def test_the_email_renders_and_escapes_the_message(api):
    from app.services import email_service
    rendered = email_service.render_email("document_share.html", {
        "subject": "Hr User shared 2 documents with you", "first_name": "Emp", "sender_name": "Hr User", "target_name": "Onboarding",
        "files": [{"title": "NDA"}, {"title": "Bank form"}], "file_count": 2, "message": "Read <b>today</b>", "mode": "link",
        "action_url": "https://hr.example.com/employee/documents/company"}, organization_id=1, db=api.db)
    assert "Bank form" in rendered.html and "&lt;b&gt;today&lt;/b&gt;" in rendered.html and "<b>today</b>" not in rendered.html
    assert "https://hr.example.com/employee/documents/company" in rendered.html


# ── P5: the employee view knows which folder a file sits in ───────────────────────────────────────────────────────────

def test_employee_items_carry_their_folder_path(api):
    cat = _cat(api, "onboarding")
    _share(api, "category", cat.id)
    api.as_("hr")
    top = api.post("/hr/document-folders", data={"name": "Joining", "company_category_id": str(cat.id)}).json()
    sub = api.post("/hr/document-folders", data={"name": "Signed", "parent_id": str(top["id"]), "company_category_id": str(cat.id)}).json()
    _upload(api, key="onboarding", title="NDA", folder_id=sub["id"])
    _upload(api, key="onboarding", title="Welcome")
    api.as_("emp")
    items = {i["title"]: i for g in api.get("/hr/me/company-documents").json()["groups"] for i in g["items"]}
    assert items["NDA"]["folder"] == {"id": sub["id"], "name": "Signed", "path": "Joining / Signed"}
    assert items["Welcome"]["folder"] is None
