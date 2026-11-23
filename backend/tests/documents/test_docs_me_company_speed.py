"""The employee's Company documents page (GET /hr/me/company-documents) used to make 2-4 database queries for every
published company document in the organization, which timed out on a remote database. It now makes a fixed number:
the same for 2 documents as for 12. The answer itself is unchanged (visibility, folders, read confirmations)."""
from sqlalchemy import event

from test_docs_phase2_flows import api  # noqa: F401
from test_docs_phase5_company import _cat, _share, _upload, _visible_titles


def _queries(api, path):
    count = {"n": 0}
    bind = api.db.get_bind()

    def on_exec(*_a, **_k):
        count["n"] += 1
    event.listen(bind, "before_cursor_execute", on_exec)
    try:
        r = api.get(path)
    finally:
        event.remove(bind, "before_cursor_execute", on_exec)
    assert r.status_code == 200, r.text
    return count["n"], r.json()


def _folder(api, name, cat_id, parent=None):
    api.as_("hr")
    data = {"name": name, "company_category_id": str(cat_id)}
    if parent:
        data["parent_id"] = str(parent)
    return api.post("/hr/document-folders", data=data).json()["id"]


def test_the_number_of_queries_does_not_grow_with_the_number_of_documents(api):
    shared, private = _cat(api, "company_policies"), _cat(api, "forms_templates")
    _share(api, "category", shared.id, require_ack=True)
    top = _folder(api, "Policies", shared.id)
    sub = _folder(api, "2026", shared.id, parent=top)
    _upload(api, key="company_policies", title="P0", folder_id=sub)
    _upload(api, key="forms_templates", title="F0")                       # admin only: not visible to the employee
    api.as_("emp")
    small, body = _queries(api, "/hr/me/company-documents")
    assert body["total"] == 1
    for i in range(1, 6):
        _upload(api, key="company_policies", title=f"P{i}", **({"folder_id": sub} if i % 2 else {}))
        _upload(api, key="forms_templates", title=f"F{i}")
    api.as_("emp")
    big, body = _queries(api, "/hr/me/company-documents")
    assert body["total"] == 6
    assert big == small, f"{small} queries for 2 documents but {big} for 12"
    item = next(i for g in body["groups"] for i in g["items"] if i["title"] == "P1")
    assert item["folder"]["path"] == "Policies / 2026" and item["needs_ack"] is True


def test_assigned_documents_are_still_visible_to_their_person_only(api):
    from app.modules.hr.models import DocumentAssignment
    doc = _upload(api, key="forms_templates", title="Bank form")             # admin only
    assert _visible_titles(api, "emp") == []
    api.db.add(DocumentAssignment(document_id=doc["id"], employee_id=api.people["emp"].id))
    api.db.commit()
    assert _visible_titles(api, "emp") == ["Bank form"]
    assert _visible_titles(api, "emp2") == []


# ── admins are sent to where they manage company documents ──────────────────────────────────────────────────────────

def _links(api, who):
    from app.modules.super_admin.models import Notification, NotificationTarget
    return [n.link for n in api.db.query(Notification).join(NotificationTarget, NotificationTarget.notification_id == Notification.id)
            .filter(NotificationTarget.kind == "user", NotificationTarget.ref == str(api.people[who].id))]


def test_a_published_company_document_links_admins_to_the_admin_page(api):
    _share(api, "category", _cat(api, "forms_templates").id)               # all employees, no read confirmation
    _upload(api, key="forms_templates", title="Leave form")
    assert "/employee/documents/company" in _links(api, "emp")
    assert "/zoiko-hr/documents/company-documents" in _links(api, "admin")
    assert "/employee/documents/company" not in _links(api, "admin")


def test_the_employee_page_tells_an_admin_where_to_manage_documents(api):
    api.as_("emp")
    assert api.get("/hr/me/company-documents").json()["viewer_is_admin"] is False
    api.as_("hr")
    assert api.get("/hr/me/company-documents").json()["viewer_is_admin"] is True
