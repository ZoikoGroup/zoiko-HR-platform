"""ZHR-27/28/29: Super Admin document repository and approvals oversight."""

import io
from datetime import date, datetime, timedelta

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.core.dependencies import get_current_super_admin
from app.core.exceptions import ForbiddenException, ZoikoException, zoiko_exception_handler
from app.database import Base, get_db
from app.modules.employee.models import Employee, EmployeeStatus, EmploymentType, UserRole
from app.modules.hr.models import (
    HrDocument, LeaveBalance, LeaveRequest, LeaveType, Organization, OrganizationStatus, RequestStatus,
)
from app.modules.super_admin import approvals_router, documents_router
from app.modules.super_admin.models import AuditLog

PDF = b"%PDF-1.4\n%test\n"
PNG = b"\x89PNG\r\n\x1a\n" + b"0" * 32
ZIP = b"PK\x03\x04" + b"0" * 32


def _emp(db, email, role, org_id=None, first="Ann", last="Lee"):
    e = Employee(
        email=email, hashed_password="x", employee_code=f"C-{email}", role=role, first_name=first, last_name=last,
        job_title="t", employment_type=EmploymentType.FULL_TIME, status=EmployeeStatus.ACTIVE,
        date_of_joining=date.today(), organization_id=org_id,
    )
    db.add(e)
    db.commit()
    return e


@pytest.fixture
def world(tmp_path, monkeypatch):
    monkeypatch.setattr(documents_router, "_upload_dir", lambda: str(tmp_path))
    monkeypatch.setattr("app.services.email_service.send_leave_approved", lambda **k: True)
    monkeypatch.setattr("app.services.email_service.send_leave_rejected", lambda **k: True)
    eng = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(eng)
    db = sessionmaker(bind=eng)()
    acme = Organization(id=1, organization_name="Acme Ltd", status=OrganizationStatus.ACTIVE)
    globex = Organization(id=2, organization_name="Globex Inc", status=OrganizationStatus.ACTIVE)
    db.add_all([acme, globex])
    db.commit()
    sa = _emp(db, "root@z.test", UserRole.SUPER_ADMIN)
    app = FastAPI()
    app.include_router(documents_router.router)
    app.include_router(approvals_router.router)
    app.add_exception_handler(ZoikoException, zoiko_exception_handler)
    app.dependency_overrides[get_db] = lambda: db
    box = {"user": sa}

    def _admin():
        if box["user"].role != UserRole.SUPER_ADMIN:
            raise ForbiddenException("Super admin only")
        return box["user"]

    app.dependency_overrides[get_current_super_admin] = _admin
    return {"db": db, "c": TestClient(app), "box": box, "sa": sa, "dir": tmp_path}


def _upload(c, name="Handbook.pdf", data=PDF, ctype="application/pdf", org=1, **form):
    body = {"organization_id": str(org), **form}
    return c.post("/super-admin/documents", data=body, files={"file": (name, io.BytesIO(data), ctype)})


# ───────────────────────── Documents: upload ─────────────────────────

def test_upload_valid_pdf_records_metadata_and_audit(world):
    r = _upload(world["c"], title="Employee Handbook", description="v1", category="policy")
    assert r.status_code == 201, r.text
    d = r.json()
    assert d["title"] == "Employee Handbook" and d["organization_name"] == "Acme Ltd"
    assert d["file_name"] == "Handbook.pdf" and d["file_size"] == len(PDF) and len(d["checksum"]) == 64
    assert d["uploader_name"] == "Ann Lee" and d["category"] == "policy"
    stored = list(world["dir"].iterdir())
    assert len(stored) == 1 and stored[0].name.endswith(".pdf") and "Handbook" not in stored[0].name
    log = world["db"].query(AuditLog).one()
    assert log.details["event"] == "document.uploaded" and log.details["organization_id"] == 1


def test_upload_rejects_bad_type_mismatch_and_bad_content(world):
    c = world["c"]
    assert _upload(c, "run.exe", b"MZ", "application/octet-stream").status_code == 400
    assert _upload(c, "a.sql", b"select 1", "text/plain").status_code == 400
    r = _upload(c, "fake.pdf", b"not a pdf at all", "application/pdf")
    assert r.status_code == 400 and "not a valid PDF" in r.json()["message"]
    r = _upload(c, "a.pdf", PDF, "image/png")
    assert r.status_code == 400 and "does not match" in r.json()["message"]
    assert _upload(c, "empty.pdf", b"", "application/pdf").status_code == 400
    assert list(world["dir"].iterdir()) == []


def test_upload_rejects_oversized_and_cleans_up(world, monkeypatch):
    monkeypatch.setattr(documents_router, "MAX_FILE_SIZE_BYTES", 1024)
    r = _upload(world["c"], "big.pdf", PDF + b"0" * 4096)
    assert r.status_code == 400 and "too large" in r.json()["message"]
    assert list(world["dir"].iterdir()) == [] and world["db"].query(HrDocument).count() == 0


def test_upload_requires_valid_org_and_category(world):
    c = world["c"]
    assert _upload(c, org=999).status_code == 400
    assert _upload(c, category="nonsense").status_code == 400
    assert c.post("/super-admin/documents", files={"file": ("a.pdf", io.BytesIO(PDF), "application/pdf")}).status_code == 422


def test_upload_accepts_other_allowed_types(world):
    c = world["c"]
    assert _upload(c, "p.png", PNG, "image/png").status_code == 201
    assert _upload(c, "d.docx", ZIP, "application/vnd.openxmlformats-officedocument.wordprocessingml.document").status_code == 201
    assert _upload(c, "n.txt", b"hello", "text/plain").status_code == 201
    assert _upload(c, "n2.txt", b"he\x00llo", "text/plain").status_code == 400


def test_upload_sanitizes_filename_path(world):
    d = _upload(world["c"], "../../etc/passwd.pdf").json()
    assert d["file_name"] == "passwd.pdf"
    assert all(p.parent == world["dir"] for p in world["dir"].iterdir())


# ───────────────────────── Documents: download ─────────────────────────

def test_download_returns_original_bytes_and_attachment_filename(world):
    doc = _upload(world["c"], "Réport 2026.pdf", title="Q1").json()
    r = world["c"].get(f"/super-admin/documents/{doc['id']}/download")
    assert r.status_code == 200 and r.content == PDF
    cd = r.headers["content-disposition"]
    assert cd.startswith("attachment") and "R%C3%A9port%202026.pdf" in cd
    assert r.headers["content-type"].startswith("application/pdf")
    assert r.headers["x-content-type-options"] == "nosniff"
    events = [l.details["event"] for l in world["db"].query(AuditLog).all()]
    assert "document.downloaded" in events


def test_download_deleted_missing_and_unauthorized(world):
    c = world["c"]
    doc = _upload(c).json()
    c.delete(f"/super-admin/documents/{doc['id']}")
    assert c.get(f"/super-admin/documents/{doc['id']}/download").status_code == 404
    assert c.get("/super-admin/documents/9999/download").status_code == 404
    doc2 = _upload(c).json()
    for p in world["dir"].iterdir():
        p.unlink()
    r = c.get(f"/super-admin/documents/{doc2['id']}/download")
    assert r.status_code == 404 and "could not be found" in r.json()["message"]
    world["box"]["user"] = _emp(world["db"], "e@a.test", UserRole.EMPLOYEE, 1)
    assert c.get(f"/super-admin/documents/{doc2['id']}/download").status_code == 403
    assert c.get("/super-admin/documents").status_code == 403


# ───────────────────────── Documents: search / list / delete ─────────────────────────

def _seed_docs(c):
    _upload(c, "handbook.pdf", title="Employee Handbook", description="Onboarding guide", category="policy", org=1)
    _upload(c, "nda.pdf", title="Corporate NDA", description="Legal agreement", category="contract", org=2)
    _upload(c, "photo.png", PNG, "image/png", title="Office Photo", category="company", org=2)


def _titles(r):
    return sorted(d["title"] for d in r.json()["documents"])


def test_search_each_field_case_insensitive(world):
    c = world["c"]
    _seed_docs(c)
    assert _titles(c.get("/super-admin/documents", params={"q": "HANDBOOK"})) == ["Employee Handbook"]  # title/filename
    assert _titles(c.get("/super-admin/documents", params={"q": "nda.PDF"})) == ["Corporate NDA"]  # filename
    assert _titles(c.get("/super-admin/documents", params={"q": "onboarding"})) == ["Employee Handbook"]  # description
    assert _titles(c.get("/super-admin/documents", params={"q": "CONTRACT"})) == ["Corporate NDA"]  # category
    assert _titles(c.get("/super-admin/documents", params={"q": "globex"})) == ["Corporate NDA", "Office Photo"]  # org
    empty = c.get("/super-admin/documents", params={"q": "zzz-nothing"}).json()
    assert empty["total"] == 0 and empty["documents"] == []


def test_search_combines_with_filters_using_and(world):
    c = world["c"]
    _seed_docs(c)
    r = c.get("/super-admin/documents", params={"q": "globex", "category": "contract"})
    assert _titles(r) == ["Corporate NDA"]
    r = c.get("/super-admin/documents", params={"q": "globex", "file_type": "png"})
    assert _titles(r) == ["Office Photo"]
    r = c.get("/super-admin/documents", params={"organization_id": 1, "q": "nda"})
    assert r.json()["total"] == 0
    future = (datetime.utcnow() + timedelta(days=1)).isoformat()
    assert c.get("/super-admin/documents", params={"date_from": future}).json()["total"] == 0
    assert c.get("/super-admin/documents", params={"category": "bogus"}).status_code == 400


def test_list_pagination_and_org_attribution(world):
    c = world["c"]
    _seed_docs(c)
    page = c.get("/super-admin/documents", params={"page": 2, "page_size": 2}).json()
    assert page["total"] == 3 and len(page["documents"]) == 1
    orgs = {d["title"]: d["organization_name"] for d in c.get("/super-admin/documents").json()["documents"]}
    assert orgs == {"Employee Handbook": "Acme Ltd", "Corporate NDA": "Globex Inc", "Office Photo": "Globex Inc"}


def test_delete_soft_deletes_and_is_idempotent(world):
    c = world["c"]
    doc = _upload(c, title="Temp").json()
    r = c.delete(f"/super-admin/documents/{doc['id']}")
    assert r.status_code == 200 and r.json()["already_deleted"] is False
    assert c.get("/super-admin/documents").json()["total"] == 0
    assert c.get("/super-admin/documents", params={"q": "Temp"}).json()["total"] == 0
    row = world["db"].query(HrDocument).one()
    assert row.is_deleted is True  # kept for retention, not hard-deleted
    again = c.delete(f"/super-admin/documents/{doc['id']}")
    assert again.status_code == 200 and again.json()["already_deleted"] is True
    assert c.delete("/super-admin/documents/9999").status_code == 404
    deletes = [l for l in world["db"].query(AuditLog).all() if l.details["event"] == "document.deleted"]
    assert len(deletes) == 1


def test_delete_unauthorized(world):
    doc = _upload(world["c"]).json()
    world["box"]["user"] = _emp(world["db"], "e@a.test", UserRole.ADMIN, 1)
    assert world["c"].delete(f"/super-admin/documents/{doc['id']}").status_code == 403


# ───────────────────────── Approvals ─────────────────────────

def _leave(db, emp, days=2, status=RequestStatus.PENDING, created=None, reviewed_at=None):
    l = LeaveRequest(
        employee_id=emp.id, organization_id=emp.organization_id, leave_type=LeaveType.ANNUAL,
        start_date=date(2026, 7, 1), end_date=date(2026, 7, 1) + timedelta(days=days - 1), days=days,
        reason="Family trip", status=status, created_at=created or datetime.utcnow(), reviewed_at=reviewed_at,
    )
    db.add(l)
    db.add(LeaveBalance(employee_id=emp.id, organization_id=emp.organization_id, leave_type=LeaveType.ANNUAL,
                        total_days=20, used_days=0, pending_days=days, year=2026)) if not db.query(LeaveBalance).filter(
        LeaveBalance.employee_id == emp.id).first() else None
    db.commit()
    return l


@pytest.fixture
def people(world):
    db = world["db"]
    return {
        "a": _emp(db, "amy@acme.test", UserRole.EMPLOYEE, 1, "Amy", "Adams"),
        "b": _emp(db, "bob@globex.test", UserRole.EMPLOYEE, 2, "Bob", "Brown"),
    }


def test_approvals_empty_state(world):
    d = world["c"].get("/super-admin/approvals").json()
    assert d["total"] == 0 and d["approvals"] == []
    assert world["c"].get("/super-admin/approvals/summary").json() == {
        "pending": 0, "approved_this_month": 0, "rejected_this_month": 0}


def test_lists_real_leave_across_orgs_oldest_first(world, people):
    db, c = world["db"], world["c"]
    old = _leave(db, people["b"], created=datetime.utcnow() - timedelta(days=3))
    new = _leave(db, people["a"], created=datetime.utcnow() - timedelta(hours=1))
    d = c.get("/super-admin/approvals").json()
    assert [a["id"] for a in d["approvals"]] == [old.id, new.id]
    first = d["approvals"][0]
    assert first["employee_name"] == "Bob Brown" and first["organization_name"] == "Globex Inc"
    assert first["request_type"] == "leave" and first["leave_type"] == "annual" and first["days"] == 2
    assert first["start_date"] == "2026-07-01" and first["end_date"] == "2026-07-02"
    assert first["reason"] == "Family trip" and first["current_approver"] and first["submitted_at"].endswith("Z")


def test_filters_status_org_search_type_dates(world, people):
    db, c = world["db"], world["c"]
    _leave(db, people["a"])
    _leave(db, people["b"], status=RequestStatus.APPROVED, reviewed_at=datetime.utcnow())
    _leave(db, people["b"], status=RequestStatus.REJECTED, reviewed_at=datetime.utcnow())
    get = lambda **p: c.get("/super-admin/approvals", params=p).json()
    assert get()["total"] == 1
    assert get(status="approved")["total"] == 1 and get(status="rejected")["total"] == 1
    assert get(status="all")["total"] == 3
    assert get(status="all", organization_id=2)["total"] == 2
    assert get(status="all", q="amy")["total"] == 1 and get(status="all", q="BROWN")["total"] == 2
    assert get(status="all", q="bob@globex")["total"] == 2 and get(status="all", q="nobody")["total"] == 0
    assert get(status="all", request_type="expense")["total"] == 0
    assert get(status="all", date_from=(datetime.utcnow() + timedelta(days=1)).isoformat())["total"] == 0
    assert c.get("/super-admin/approvals", params={"status": "weird"}).status_code == 400
    assert get(status="all", page=2, page_size=2)["approvals"].__len__() == 1


def test_summary_counts_this_month_only(world, people):
    db, c = world["db"], world["c"]
    _leave(db, people["a"])
    _leave(db, people["a"], status=RequestStatus.APPROVED, reviewed_at=datetime.utcnow())
    _leave(db, people["a"], status=RequestStatus.APPROVED, reviewed_at=datetime.utcnow() - timedelta(days=90))
    _leave(db, people["b"], status=RequestStatus.REJECTED, reviewed_at=datetime.utcnow())
    assert c.get("/super-admin/approvals/summary").json() == {
        "pending": 1, "approved_this_month": 1, "rejected_this_month": 1}
    assert c.get("/super-admin/approvals/summary", params={"organization_id": 2}).json()["rejected_this_month"] == 1
    assert c.get("/super-admin/approvals/summary", params={"organization_id": 1}).json()["rejected_this_month"] == 0


def test_approve_updates_status_balance_and_audit(world, people):
    db, c = world["db"], world["c"]
    leave = _leave(db, people["b"], days=3)
    r = c.post(f"/super-admin/approvals/leave/{leave.id}/approve", json={"comment": "ok"})
    assert r.status_code == 200 and r.json()["status"] == "approved"
    assert r.json()["reviewed_by"] == "Ann Lee"
    db.refresh(leave)
    bal = db.query(LeaveBalance).filter(LeaveBalance.employee_id == people["b"].id).one()
    assert (bal.pending_days, bal.used_days) == (0, 3)  # same math as the org portal
    log = [l for l in db.query(AuditLog).all() if l.details["event"] == "approval.leave_approved"][0]
    assert log.details["organization_id"] == 2 and log.details["comment"] == "ok"


def test_reject_requires_comment_and_releases_pending_days(world, people):
    db, c = world["db"], world["c"]
    leave = _leave(db, people["a"], days=2)
    assert c.post(f"/super-admin/approvals/leave/{leave.id}/reject", json={}).status_code == 400
    assert c.post(f"/super-admin/approvals/leave/{leave.id}/reject", json={"comment": "  "}).status_code == 400
    r = c.post(f"/super-admin/approvals/leave/{leave.id}/reject", json={"comment": "Peak season"})
    assert r.status_code == 200 and r.json()["status"] == "rejected"
    bal = db.query(LeaveBalance).filter(LeaveBalance.employee_id == people["a"].id).one()
    assert (bal.pending_days, bal.used_days) == (0, 0)
    assert c.get("/super-admin/approvals").json()["total"] == 0


def test_cannot_decide_twice_or_unknown(world, people):
    db, c = world["db"], world["c"]
    leave = _leave(db, people["a"], days=2)
    assert c.post(f"/super-admin/approvals/leave/{leave.id}/approve", json={}).status_code == 200
    again = c.post(f"/super-admin/approvals/leave/{leave.id}/approve", json={})
    assert again.status_code == 400 and "already been decided" in again.json()["message"]
    bal = db.query(LeaveBalance).filter(LeaveBalance.employee_id == people["a"].id).one()
    assert bal.used_days == 2  # not double-counted
    assert c.post("/super-admin/approvals/leave/9999/approve", json={}).status_code == 404


def test_approvals_unauthorized(world, people):
    leave = _leave(world["db"], people["a"])
    world["box"]["user"] = people["a"]
    c = world["c"]
    assert c.get("/super-admin/approvals").status_code == 403
    assert c.get("/super-admin/approvals/summary").status_code == 403
    assert c.post(f"/super-admin/approvals/leave/{leave.id}/approve", json={}).status_code == 403


def test_organization_selector_lists_all_orgs(world):
    orgs = world["c"].get("/super-admin/documents/organizations").json()["organizations"]
    assert orgs == [{"id": 1, "name": "Acme Ltd"}, {"id": 2, "name": "Globex Inc"}]


@pytest.mark.parametrize("role", [UserRole.ADMIN, UserRole.HR_ADMIN, UserRole.MANAGER, UserRole.EMPLOYEE])
def test_real_super_admin_dependency_rejects_other_roles(role):
    from app.core.dependencies import get_current_super_admin as real

    with pytest.raises(ForbiddenException):
        real(current_user=Employee(email="x@example.com", role=role))


def test_every_new_router_is_guarded_at_router_level():
    from app.modules.integrations.router import connect_router, hub_router, workflow_router

    for r in (documents_router.router, approvals_router.router, connect_router, hub_router, workflow_router):
        deps = [d.dependency for d in r.dependencies]
        assert get_current_super_admin in deps, r.prefix
