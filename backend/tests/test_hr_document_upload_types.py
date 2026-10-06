"""ZHR-44: every document type HR keeps must be uploadable, so it can be previewed."""

import io

import pytest
from fastapi import HTTPException, UploadFile

from app.modules.hr.router import ALLOWED_EXTENSIONS, _validate_upload_file


def _file(name, content_type=None):
    return UploadFile(file=io.BytesIO(b"x"), filename=name, headers={"content-type": content_type} if content_type else None)


@pytest.mark.parametrize("name,ctype", [
    ("offer.pdf", "application/pdf"),
    ("contract.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"),
    ("old.doc", "application/msword"),
    ("pay.xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"),
    ("pay.xls", "application/vnd.ms-excel"),
    ("people.csv", "text/csv"),
    ("people.tsv", "text/tab-separated-values"),
    ("notes.txt", "text/plain"),
    ("letter.rtf", "application/rtf"),
    ("deck.pptx", "application/vnd.openxmlformats-officedocument.presentationml.presentation"),
    ("deck.ppt", "application/vnd.ms-powerpoint"),
    ("doc.odt", "application/vnd.oasis.opendocument.text"),
    ("sheet.ods", "application/vnd.oasis.opendocument.spreadsheet"),
    ("slides.odp", "application/vnd.oasis.opendocument.presentation"),
    ("scan.png", "image/png"), ("scan.JPG", "image/jpeg"), ("anim.gif", "image/gif"), ("pic.webp", "image/webp"), ("pic.bmp", "image/bmp"),
    # clients often label Office files generically; the extension is the gate
    ("contract.docx", "application/octet-stream"),
    ("report.PDF", "application/x-pdf"),
])
def test_previewable_types_are_accepted(name, ctype):
    _validate_upload_file(_file(name, ctype))


@pytest.mark.parametrize("name", ["run.exe", "script.js", "page.html", "image.svg", "archive.zip", "macro.xlsm", "noextension"])
def test_executables_and_active_content_are_rejected(name):
    with pytest.raises(HTTPException) as exc:
        _validate_upload_file(_file(name, "application/octet-stream"))
    assert exc.value.status_code == 400


def test_allowlist_has_no_active_content_types():
    assert not ({".exe", ".js", ".html", ".htm", ".svg", ".xlsm", ".bat", ".sh"} & ALLOWED_EXTENSIONS)


# ── ZHR-46: only organization admins upload; employees are read-only ─────────

import pathlib
from datetime import date

from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.core.dependencies import get_current_user
from app.database import Base, get_db
from app.modules.employee.models import Employee, EmployeeStatus, EmploymentType, UserRole
from app.modules.hr.models import Organization, OrganizationStatus


@pytest.fixture
def upload_client(tmp_path, monkeypatch):
    from app.main import app
    from app.modules.hr import router as hr_router

    monkeypatch.setattr(hr_router, "_DOCUMENT_UPLOAD_DIR", str(tmp_path))
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(engine)
    s = sessionmaker(bind=engine, expire_on_commit=False)()
    s.add(Organization(id=1, name="Acme", organization_name="Acme", status=OrganizationStatus.ACTIVE))
    s.commit()
    people = {}
    for key, role in (("admin", UserRole.ADMIN), ("hr", UserRole.HR_ADMIN), ("emp", UserRole.EMPLOYEE), ("mgr", UserRole.MANAGER)):
        e = Employee(email=f"{key}@example.com", hashed_password="x", employee_code=f"C-{key}", role=role, first_name=key.title(),
                     last_name="User", job_title="t", employment_type=EmploymentType.FULL_TIME, status=EmployeeStatus.ACTIVE,
                     date_of_joining=date.today(), organization_id=1)
        s.add(e)
        people[key] = e
    s.commit()
    box = {"user": people["admin"]}
    app.dependency_overrides[get_db] = lambda: s
    app.dependency_overrides[get_current_user] = lambda: box["user"]
    c = TestClient(app, raise_server_exceptions=False)
    c.box, c.people, c.dir = box, people, tmp_path
    yield c
    app.dependency_overrides.pop(get_db, None)
    app.dependency_overrides.pop(get_current_user, None)
    s.close()
    engine.dispose()


def _post(c, name="policy.pdf", data=b"%PDF-1.4 real bytes"):
    return c.post("/hr/documents/upload", data={"title": "Policy", "category": "company"},
                  files={"file": (name, data, "application/pdf")})


def test_admins_can_upload_and_it_is_not_left_pending(upload_client):
    r = _post(upload_client)
    assert r.status_code == 201, r.text
    assert r.json()["status"] == "approved"  # nothing to approve: an admin uploaded it


@pytest.mark.parametrize("who", ["emp", "mgr"])
def test_employees_and_managers_cannot_upload(upload_client, who):
    upload_client.box["user"] = upload_client.people[who]
    r = _post(upload_client)
    assert r.status_code == 403
    assert "organization admin" in r.json()["message"]
    assert list(pathlib.Path(upload_client.dir).iterdir()) == []  # nothing was written to disk


def test_hr_admin_keeps_upload_access(upload_client):
    upload_client.box["user"] = upload_client.people["hr"]
    assert _post(upload_client).status_code == 201


def test_employees_cannot_create_folders_or_upload_versions(upload_client):
    doc_id = _post(upload_client).json()["id"]
    upload_client.box["user"] = upload_client.people["emp"]
    assert upload_client.post("/hr/document-folders", data={"name": "HR"}).status_code == 403
    r = upload_client.post(f"/hr/documents/{doc_id}/versions", files={"file": ("v2.pdf", b"new bytes", "application/pdf")})
    assert r.status_code == 403


def test_a_new_version_keeps_its_file_contents(upload_client):
    doc_id = _post(upload_client).json()["id"]
    r = upload_client.post(f"/hr/documents/{doc_id}/versions", files={"file": ("v2.pdf", b"version two bytes", "application/pdf")})
    assert r.status_code == 201, r.text
    saved = [p for p in pathlib.Path(upload_client.dir).iterdir() if p.read_bytes() == b"version two bytes"]
    assert saved, "the version file was saved empty (the upload stream was read twice)"


# ── ZHR-47: a document must be served with a content type the browser can render ──

from app.modules.hr.file_storage import effective_media_type


@pytest.mark.parametrize("name,stored,expected", [
    ("offer.pdf", "application/octet-stream", "application/pdf"),
    ("offer.PDF", None, "application/pdf"),
    ("offer.pdf", "", "application/pdf"),
    ("contract.docx", "binary/octet-stream", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"),
    ("scan.png", "application/octet-stream", "image/png"),
    ("sheet.csv", "application/force-download", "text/csv"),
    ("offer.pdf", "application/pdf", "application/pdf"),
    ("photo.jpg", "image/jpeg; charset=binary", "image/jpeg"),
    ("mystery.bin", "application/octet-stream", "application/octet-stream"),
])
def test_effective_media_type(name, stored, expected):
    assert effective_media_type(name, stored) == expected


def test_a_pdf_uploaded_as_octet_stream_is_stored_and_served_as_a_pdf(upload_client):
    r = upload_client.post("/hr/documents/upload", data={"title": "Policy", "category": "company"},
                           files={"file": ("policy.pdf", b"%PDF-1.4 bytes", "application/octet-stream")})
    assert r.status_code == 201, r.text
    assert r.json()["mime_type"] == "application/pdf"  # fixed at upload...
    doc_id = r.json()["id"]
    served = upload_client.get(f"/hr/documents/{doc_id}/file")
    assert served.status_code == 200
    assert served.headers["content-type"].startswith("application/pdf")
    assert "inline" in served.headers["content-disposition"]


def test_documents_already_stored_with_a_generic_type_are_still_served_correctly(upload_client):
    from app.modules.hr.models import HrDocument

    doc_id = upload_client.post("/hr/documents/upload", data={"title": "Old", "category": "company"},
                                files={"file": ("old.pdf", b"%PDF-1.4 bytes", "application/pdf")}).json()["id"]
    from app.database import get_db
    session = upload_client.app.dependency_overrides[get_db]()
    row = session.query(HrDocument).filter(HrDocument.id == doc_id).one()
    row.mime_type = "application/octet-stream"  # how rows written by older clients look
    session.commit()
    served = upload_client.get(f"/hr/documents/{doc_id}/file")
    assert served.headers["content-type"].startswith("application/pdf")
