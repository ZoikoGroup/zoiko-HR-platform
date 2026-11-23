"""Company Documents P1: folders in every company category — clear name rules, no duplicate names in the same place
(any letter case), rename, delete only when empty, admins only, audit entries, and folder cards with counts."""
import pytest

from app.modules.hr.documents.models import HrDocumentAuditLog
from app.modules.hr.models import HrDocument, HrDocumentFolder
from test_docs_phase2_flows import api  # noqa: F401
from test_docs_phase5_company import _cat, _share, _upload


def _folder(api, name, key="onboarding", parent=None, who="hr"):
    api.as_(who)
    data = {"name": name, "company_category_id": str(_cat(api, key).id)}
    if parent:
        data["parent_id"] = str(parent)
    return api.post("/hr/document-folders", data=data)


@pytest.mark.parametrize("key", ["onboarding", "company_policies", "payslip_templates", "employee_handbook"])
def test_any_category_gets_folders_and_names_are_tidied(api, key):
    r = _folder(api, "  Joining   forms ", key)
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["name"] == "Joining forms" and body["company_category_id"] == _cat(api, key).id
    assert api.db.query(HrDocumentAuditLog).filter_by(action="folder_created", target_id=body["id"]).count() == 1


def test_duplicate_names_are_refused_in_the_same_place_only(api):
    first = _folder(api, "Joining forms").json()
    dup = _folder(api, "JOINING FORMS")
    assert dup.status_code == 409 and dup.json()["error"] == "DOC_FOLDER_EXISTS" and "already exists here" in dup.json()["message"]
    assert _folder(api, "Joining forms", key="company_policies").status_code == 201      # another category
    assert _folder(api, "Joining forms", parent=first["id"]).status_code == 201          # inside the folder


@pytest.mark.parametrize("name,code", [("", 422), ("   ", 422), ("a/b", 422), ('x"y', 422), ("x" * 101, 422)])
def test_bad_names(api, name, code):
    assert _folder(api, name).status_code == code


def test_rename_checks_duplicates_and_is_audited(api):
    a = _folder(api, "Forms").json()
    _folder(api, "Policies")
    assert api.patch(f"/hr/document-folders/{a['id']}", data={"name": "policies"}).status_code == 409
    r = api.patch(f"/hr/document-folders/{a['id']}", data={"name": "Joining forms"})
    assert r.status_code == 200 and r.json()["name"] == "Joining forms"
    entry = api.db.query(HrDocumentAuditLog).filter_by(action="folder_renamed", target_id=a["id"]).one()
    assert entry.before == {"name": "Forms"} and entry.after == {"name": "Joining forms"}
    assert api.patch(f"/hr/document-folders/{a['id']}", data={"name": "Joining forms"}).status_code == 200   # same name again is fine


def test_a_company_folder_must_be_empty_before_it_is_deleted(api):
    parent = _folder(api, "Joining forms").json()
    child = _folder(api, "Signed", parent=parent["id"]).json()
    doc = _upload(api, key="onboarding", title="NDA", folder_id=parent["id"])
    r = api.delete(f"/hr/document-folders/{parent['id']}")
    assert r.status_code == 409 and r.json()["error"] == "DOC_FOLDER_NOT_EMPTY"
    assert (r.json()["files"], r.json()["folders"]) == (1, 1) and "still has 1 file and 1 folder" in r.json()["message"]
    assert api.delete(f"/hr/document-folders/{child['id']}").status_code == 200
    api.as_("hr")
    assert api.delete(f"/hr/documents/company/{doc['id']}").status_code in (200, 204)
    assert api.delete(f"/hr/document-folders/{parent['id']}").status_code == 200
    assert api.db.query(HrDocumentFolder).filter_by(id=parent["id"]).count() == 0
    assert api.db.query(HrDocumentAuditLog).filter_by(action="folder_deleted").count() == 2
    assert api.delete(f"/hr/document-folders/{parent['id']}").status_code == 404


def test_other_folders_keep_moving_their_contents_up(api):
    api.as_("hr")
    legacy = HrDocumentFolder(name="Old", organization_id=1)
    api.db.add(legacy)
    api.db.commit()
    inner = HrDocumentFolder(name="Inner", organization_id=1, parent_id=legacy.id)
    api.db.add(inner)
    api.db.commit()
    assert api.delete(f"/hr/document-folders/{legacy.id}").status_code == 200
    api.db.refresh(inner)
    assert inner.parent_id is None


@pytest.mark.parametrize("who", ["emp", "mgr"])
def test_only_admins_manage_folders(api, who):
    f = _folder(api, "Joining forms").json()
    assert _folder(api, "Mine", who=who).status_code == 403
    api.as_(who)
    assert api.patch(f"/hr/document-folders/{f['id']}", data={"name": "x"}).status_code == 403
    assert api.delete(f"/hr/document-folders/{f['id']}").status_code == 403


def test_folder_cards_show_how_much_they_hold(api):
    parent = _folder(api, "Joining forms").json()
    _folder(api, "Signed", parent=parent["id"])
    _upload(api, key="onboarding", title="NDA", folder_id=parent["id"])
    _upload(api, key="onboarding", title="Bank form", folder_id=parent["id"])
    api.as_("hr")
    items = api.get(f"/hr/documents/company-categories/{_cat(api, 'onboarding').id}/items").json()
    card = next(f for f in items["folders"] if f["id"] == parent["id"])
    assert (card["file_count"], card["folder_count"]) == (2, 1)
    assert api.db.query(HrDocument).filter_by(folder_id=parent["id"]).count() == 2


# ── P2: bulk upload sends each file through the normal route; "notify" lets a batch stay quiet ─────────────────────

def test_bulk_files_can_skip_the_new_document_notification(api, monkeypatch):
    from app.modules.hr.documents import notify
    sent = []
    monkeypatch.setattr(notify, "send", lambda db, org, people, event, **kw: sent.append((event, kw.get("title"))))
    _share(api, "category", _cat(api, "forms_templates").id)
    _upload(api, title="Quiet one", notify=False)
    _upload(api, title="Loud one", notify=True)
    _upload(api, title="Default one")
    # one message per audience (employees and admins get different links), so compare the documents announced
    assert list(dict.fromkeys(t for e, t in sent if e == "document.issued")) == ["Loud one", "Default one"]


def test_quiet_upload_still_asks_for_read_confirmations(api, monkeypatch):
    from app.modules.hr.documents import notify
    sent = []
    monkeypatch.setattr(notify, "send", lambda db, org, people, event, **kw: sent.append(event))
    _share(api, "category", _cat(api, "company_policies").id, require_ack=True)
    _upload(api, key="company_policies", title="Code", notify=False)
    assert "document.to_acknowledge" in sent and "document.issued" not in sent
