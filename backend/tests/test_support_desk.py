"""ZHR-33/34: Super Admin support desk and org-scoped assistant admin tools."""

from datetime import date, datetime, timedelta

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.core.dependencies import get_current_super_admin, get_current_user, get_scoped_organization_id
from app.core.exceptions import (
    BadRequestException, ForbiddenException, NotFoundException, ZoikoException, zoiko_exception_handler,
)
from app.database import Base, get_db
from app.modules.assistant.handoff_router import handoff_admin_router
from app.modules.assistant.knowledge_router import knowledge_router
from app.modules.assistant.models import ChatConversation, ChatHandoff, ChatHandoffMessage, HandoffStatus
from app.modules.employee.models import Employee, EmployeeStatus, EmploymentType, UserRole
from app.modules.hr.models import Organization, OrganizationStatus
from app.modules.super_admin import support_router
from app.modules.super_admin.models import AuditLog, Notification


def _emp(db, email, role, org_id, first, last):
    e = Employee(
        email=email, hashed_password="x", employee_code=f"C-{email}", role=role, first_name=first, last_name=last,
        job_title="t", employment_type=EmploymentType.FULL_TIME, status=EmployeeStatus.ACTIVE, is_active=True,
        date_of_joining=date.today(), organization_id=org_id,
    )
    db.add(e)
    db.commit()
    return e


@pytest.fixture
def world():
    eng = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(eng)
    db = sessionmaker(bind=eng)()
    db.add_all([Organization(id=1, name="Acme", organization_name="Acme Ltd", status=OrganizationStatus.ACTIVE),
                Organization(id=2, name="Globex", organization_name="Globex Inc", status=OrganizationStatus.ACTIVE)])
    db.commit()
    p = {
        "sa": _emp(db, "root@example.com", UserRole.SUPER_ADMIN, None, "Root", "Admin"),
        "sa2": _emp(db, "sa2@example.com", UserRole.SUPER_ADMIN, None, "Sam", "Support"),
        "amy": _emp(db, "amy@example.com", UserRole.EMPLOYEE, 1, "Amy", "Adams"),
        "bob": _emp(db, "bob@example.com", UserRole.EMPLOYEE, 2, "Bob", "Brown"),
        "adm": _emp(db, "adm@example.com", UserRole.ADMIN, 1, "Olivia", "Owner"),
    }
    app = FastAPI()
    app.include_router(support_router.router)
    app.include_router(handoff_admin_router)
    app.include_router(knowledge_router)
    app.add_exception_handler(ZoikoException, zoiko_exception_handler)
    app.dependency_overrides[get_db] = lambda: db
    box = {"user": p["sa"]}
    app.dependency_overrides[get_current_user] = lambda: box["user"]
    return {"db": db, "c": TestClient(app), "p": p, "box": box}


def _ticket(db, emp, summary="Cannot find my payslip", status=HandoffStatus.SENT, priority="normal", days_ago=1, ref=None, assigned=None):
    conv = ChatConversation(organization_id=emp.organization_id, employee_id=emp.id, title="t")
    db.add(conv)
    db.commit()
    h = ChatHandoff(
        conversation_id=conv.id, organization_id=emp.organization_id, employee_id=emp.id, reason="user_requested",
        issue_summary=summary, status=status, ticket_reference=ref or f"HR-{emp.id}{days_ago}", priority=priority,
        created_at=datetime.utcnow() - timedelta(days=days_ago), assigned_to=assigned.id if assigned else None,
    )
    db.add(h)
    db.commit()
    return h


def _events(db):
    return [(l.details or {}).get("event") for l in db.query(AuditLog).all()]


# ───────────────────────── listing & filters ─────────────────────────

def test_empty_list(world):
    d = world["c"].get("/super-admin/support/tickets").json()
    assert d["total"] == 0 and d["tickets"] == []


def test_lists_tickets_from_every_organization(world):
    db, c, p = world["db"], world["c"], world["p"]
    _ticket(db, p["amy"], "Leave balance wrong", days_ago=3)
    _ticket(db, p["bob"], "Payroll question", days_ago=1)
    d = c.get("/super-admin/support/tickets").json()
    assert d["total"] == 2
    first = d["tickets"][0]
    assert first["organization_name"] == "Globex Inc" and first["requester_name"] == "Bob Brown"
    assert first["requester_email"] == "bob@example.com" and first["status"] == "new" and first["priority"] == "normal"
    assert first["subject"] == "Payroll question" and first["created_at"].endswith("Z") and first["reference"]


def test_every_filter_and_pagination(world):
    db, c, p = world["db"], world["c"], world["p"]
    _ticket(db, p["amy"], "Leave balance wrong", status=HandoffStatus.SENT, priority="high", days_ago=10, ref="HR-AAAA0001")
    _ticket(db, p["amy"], "Tax form", status=HandoffStatus.OPEN, priority="low", days_ago=6, ref="HR-AAAA0002", assigned=p["sa"])
    _ticket(db, p["bob"], "Payroll question", status=HandoffStatus.RESOLVED, priority="urgent", days_ago=2, ref="HR-BBBB0003")
    get = lambda **k: c.get("/super-admin/support/tickets", params=k).json()
    assert get(status="new")["total"] == 1 and get(status="in_progress")["total"] == 1 and get(status="resolved")["total"] == 1
    assert get(priority="urgent")["total"] == 1 and get(priority="high")["total"] == 1
    assert get(organization_id=1)["total"] == 2 and get(organization_id=2)["total"] == 1
    assert get(assignee_id=p["sa"].id)["total"] == 1 and get(assignee_id=0)["total"] == 2
    assert get(q="PAYROLL")["total"] == 1 and get(q="hr-aaaa")["total"] == 2 and get(q="bob@example")["total"] == 1
    assert get(q="amy adams")["total"] == 2 and get(q="nothing")["total"] == 0
    since = (datetime.utcnow() - timedelta(days=5)).isoformat()
    assert get(date_from=since)["total"] == 1 and get(date_to=since)["total"] == 2
    assert get(organization_id=1, status="new", priority="high", q="leave")["total"] == 1  # AND
    page = get(page=2, page_size=2)
    assert page["total"] == 3 and len(page["tickets"]) == 1
    assert c.get("/super-admin/support/tickets", params={"status": "weird"}).status_code == 400
    assert c.get("/super-admin/support/tickets", params={"priority": "weird"}).status_code == 400


# ───────────────────────── detail, reply, update ─────────────────────────

def test_detail_has_thread_with_the_original_request_first(world):
    db, c, p = world["db"], world["c"], world["p"]
    h = _ticket(db, p["amy"], "Cannot find my payslip")
    d = c.get(f"/super-admin/support/tickets/{h.id}").json()
    assert d["thread"] == [{"id": 0, "author_id": p["amy"].id, "author_name": "Amy Adams", "author_role": "requester",
                            "body": "Cannot find my payslip", "created_at": d["thread"][0]["created_at"]}]
    assert c.get("/super-admin/support/tickets/9999").status_code == 404


def test_reply_adds_message_moves_status_assigns_notifies_and_audits(world):
    db, c, p = world["db"], world["c"], world["p"]
    h = _ticket(db, p["amy"])
    r = c.post(f"/super-admin/support/tickets/{h.id}/reply", json={"body": "Found it - check the Documents tab."})
    assert r.status_code == 201, r.text
    d = r.json()
    assert d["status"] == "in_progress" and d["assignee_id"] == p["sa"].id and d["notified"] is True
    assert [m["author_role"] for m in d["thread"]] == ["requester", "staff"]
    assert d["thread"][1]["author_name"] == "Root Admin"
    note = db.query(Notification).one()
    assert "Found it" in note.message and h.ticket_reference in note.title
    assert note.target_user_id == p["amy"].id  # delivered to the requester only
    assert "support.ticket_replied" in _events(db)
    assert db.query(ChatHandoffMessage).count() == 1


def test_reply_validation_and_resolve_with_reply(world):
    db, c, p = world["db"], world["c"], world["p"]
    h = _ticket(db, p["amy"])
    url = f"/super-admin/support/tickets/{h.id}/reply"
    assert c.post(url, json={"body": ""}).status_code == 422
    assert c.post(url, json={"body": "   "}).status_code == 400
    ok = c.post(url, json={"body": "All fixed, closing this.", "resolve": True})
    assert ok.status_code == 201 and ok.json()["status"] == "resolved"
    assert ok.json()["resolution_note"] == "All fixed, closing this."
    again = c.post(url, json={"body": "one more thing"})
    assert again.status_code == 400 and "resolved" in again.json()["message"]
    assert c.post("/super-admin/support/tickets/9999/reply", json={"body": "x"}).status_code == 404


def test_update_status_priority_assignee_with_audit(world):
    db, c, p = world["db"], world["c"], world["p"]
    h = _ticket(db, p["amy"])
    url = f"/super-admin/support/tickets/{h.id}"
    d = c.patch(url, json={"priority": "urgent", "status": "in_progress", "assigned_to": p["sa2"].id}).json()
    assert (d["priority"], d["status"], d["assignee_name"]) == ("urgent", "in_progress", "Sam Support")
    ev = [l for l in db.query(AuditLog).all() if (l.details or {}).get("event") == "support.ticket_updated"][0]
    assert set(ev.details["changes"]) == {"priority", "status", "assignee"} and ev.performed_by == p["sa"].id
    d = c.patch(url, json={"status": "resolved", "resolution_note": "Done"}).json()
    assert d["status"] == "resolved" and d["resolved_at"] and d["resolution_note"] == "Done"
    d = c.patch(url, json={"status": "in_progress", "assigned_to": 0}).json()  # reopen + unassign
    assert d["status"] == "in_progress" and d["resolved_at"] is None and d["assignee_id"] is None
    n = db.query(AuditLog).count()
    c.patch(url, json={"priority": d["priority"]})  # no-op: nothing audited
    assert db.query(AuditLog).count() == n


def test_update_validation(world):
    db, c, p = world["db"], world["c"], world["p"]
    h = _ticket(db, p["amy"])
    url = f"/super-admin/support/tickets/{h.id}"
    assert c.patch(url, json={"status": "bogus"}).status_code == 400
    assert c.patch(url, json={"priority": "bogus"}).status_code == 400
    assert c.patch(url, json={"assigned_to": p["bob"].id}).status_code == 400  # only Super Admins can be assignees
    assert c.patch(url, json={"assigned_to": 99999}).status_code == 400
    assert c.patch("/super-admin/support/tickets/9999", json={"priority": "low"}).status_code == 404


def test_assignees_are_active_super_admins_only(world):
    names = [a["name"] for a in world["c"].get("/super-admin/support/assignees").json()["assignees"]]
    assert names == ["Root Admin", "Sam Support"]


def test_support_desk_requires_super_admin():
    from app.core.dependencies import get_current_super_admin as real

    assert real in [d.dependency for d in support_router.router.dependencies]
    for role in (UserRole.ADMIN, UserRole.HR_ADMIN, UserRole.EMPLOYEE):
        with pytest.raises(ForbiddenException):
            real(current_user=Employee(email="x@example.com", role=role))


# ───────────────────────── ZHR-33: org-scoped assistant admin tools ─────────────────────────

def test_assistant_admin_tools_work_for_super_admin_with_an_organization(world):
    db, c, p = world["db"], world["c"], world["p"]
    _ticket(db, p["amy"], "Org one ticket")
    _ticket(db, p["bob"], "Org two ticket")
    r = c.get("/assistant/admin/handoffs", params={"organization_id": 2})
    assert r.status_code == 200 and [t["issue_summary"] for t in r.json()] == ["Org two ticket"]
    assert c.get("/assistant/admin/knowledge/sources", params={"organization_id": 1}).json() == []
    missing = c.get("/assistant/admin/knowledge/sources")
    assert missing.status_code == 400 and "Select an organization" in missing.json()["message"]
    assert c.get("/assistant/admin/knowledge/sources", params={"organization_id": 999}).status_code == 404


def test_scoped_organization_dependency_rules(world):
    db, p = world["db"], world["p"]
    assert get_scoped_organization_id(1, p["sa"], db) == 1
    with pytest.raises(BadRequestException):
        get_scoped_organization_id(None, p["sa"], db)
    with pytest.raises(NotFoundException):
        get_scoped_organization_id(42, p["sa"], db)
    assert get_scoped_organization_id(None, p["adm"], db) == 1  # org users: always their own
    assert get_scoped_organization_id(1, p["adm"], db) == 1
    with pytest.raises(ForbiddenException):
        get_scoped_organization_id(2, p["adm"], db)  # cannot reach into another organization
