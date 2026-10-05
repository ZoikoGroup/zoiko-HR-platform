"""
tests/test_hr_document_file_resolution.py
------------------------------------------
ZHR 44 regression coverage for "cannot see the preview of documents"
(Organization Admin > Employee Documents).

Two distinct failure modes were behind that report, and both are covered here:

1. The bytes were on disk but the stored path did not resolve. Uploads record
   an absolute path in `hr_documents.file_path` written by whatever host/OS
   performed the upload. Rows created on Linux store POSIX separators
   (`/tmp/uploads/hr_documents/x.pdf`); rows created on Windows store mixed
   separators (`/tmp/uploads\\hr_documents\\x.pdf`). The endpoints did a bare
   `os.path.exists(stored_path)` and answered 404 "File not found on disk",
   which the UI rendered as an unexplained broken preview.

2. Genuinely missing files were indistinguishable from broken previews. Now a
   document whose file cannot be resolved carries `file_missing: true` in its
   API payload and the file endpoint answers 410 with an actionable message,
   so the UI can say "re-upload required" instead of opening a modal that can
   only fail.
"""

import os
import pathlib
import sys
from datetime import date, timedelta

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

sys.path.insert(0, str(pathlib.Path(__file__).parent))

from app.database import Base
from app.modules.hr import file_storage, service
from app.modules.hr.models import Organization, OrganizationStatus
from app.modules.employee.models import Employee, EmployeeStatus, EmploymentType, UserRole


# ── resolve_stored_file ────────────────────────────────────────────────────────

def test_resolves_path_stored_with_posix_separators(tmp_path, monkeypatch):
    target = tmp_path / "hr_documents"
    target.mkdir()
    f = target / "abc123.pdf"
    f.write_bytes(b"%PDF-1.4 test")
    monkeypatch.setenv("UPLOAD_BASE_DIR", str(tmp_path))

    assert file_storage.resolve_stored_file(f"/tmp/uploads/hr_documents/abc123.pdf") is not None


def test_resolves_path_stored_with_mixed_separators(tmp_path, monkeypatch):
    target = tmp_path / "hr_documents"
    target.mkdir()
    f = target / "abc123.pdf"
    f.write_bytes(b"%PDF-1.4 test")
    monkeypatch.setenv("UPLOAD_BASE_DIR", str(tmp_path))

    assert file_storage.resolve_stored_file(rf"/tmp/uploads\hr_documents\abc123.pdf") is not None


def test_resolves_absolute_native_path(tmp_path, monkeypatch):
    f = tmp_path / "hr_documents" / "abc123.pdf"
    f.parent.mkdir(parents=True)
    f.write_bytes(b"%PDF-1.4 test")
    monkeypatch.setenv("UPLOAD_BASE_DIR", str(tmp_path))

    assert file_storage.resolve_stored_file(str(f)) == os.path.abspath(str(f))


def test_returns_none_when_file_is_genuinely_gone(tmp_path, monkeypatch):
    monkeypatch.setenv("UPLOAD_BASE_DIR", str(tmp_path))
    assert file_storage.resolve_stored_file("/tmp/uploads/hr_documents/missing.pdf") is None


@pytest.mark.parametrize("value", [None, "", "   "])
def test_returns_none_for_empty_values(value):
    assert file_storage.resolve_stored_file(value) is None


def test_rejects_path_traversal(tmp_path, monkeypatch):
    secret = tmp_path / "secret.txt"
    secret.write_text("nope")
    monkeypatch.setenv("UPLOAD_BASE_DIR", str(tmp_path))

    assert file_storage.resolve_stored_file(f"{tmp_path}/../{secret.name}") is None
    assert file_storage.resolve_stored_file("/tmp/uploads/../../secret.txt") is None


def test_file_missing_helper(tmp_path, monkeypatch):
    monkeypatch.setenv("UPLOAD_BASE_DIR", str(tmp_path))
    assert file_storage.file_missing("/tmp/uploads/hr_documents/missing.pdf") is True
    assert file_storage.file_missing(None) is True


def test_ensure_upload_dir(tmp_path):
    created = file_storage.ensure_upload_dir(str(tmp_path / "nested" / "dir"))
    assert os.path.isdir(created)


# ── Service payload: file_missing flag ────────────────────────────────────────

@pytest.fixture
def db():
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False},
                           poolclass=StaticPool)
    Base.metadata.create_all(engine)
    session = sessionmaker(bind=engine)()
    yield session
    session.close()
    engine.dispose()


def _org(db):
    org = Organization(id=1, name="Org", status=OrganizationStatus.ACTIVE, timezone="UTC")
    db.add(org)
    db.commit()
    db.refresh(org)
    return org


def _employee(db, role=UserRole.ADMIN):
    emp = Employee(
        email="admin@z.test", hashed_password="x", employee_code="ADM0001", role=role,
        first_name="A", last_name="B", job_title="Lead", employment_type=EmploymentType.FULL_TIME,
        status=EmployeeStatus.ACTIVE, date_of_joining=date.today() - timedelta(days=5),
        organization_id=1,
    )
    db.add(emp)
    db.commit()
    db.refresh(emp)
    return emp


def _doc(db, admin, file_path):
    return service.upload_hr_document(
        db, title="Payslip", category="payslip", file_path=file_path,
        file_name="payslip.pdf", file_size=10, mime_type="application/pdf",
        organization_id=1, employee_id=admin.id, uploaded_by=admin.id,
    )


def test_listing_flags_missing_files(db, tmp_path, monkeypatch):
    monkeypatch.setenv("UPLOAD_BASE_DIR", str(tmp_path))
    upload_dir = tmp_path / "hr_documents"
    upload_dir.mkdir(parents=True, exist_ok=True)
    (upload_dir / "present.pdf").write_bytes(b"%PDF-1.4 hello")

    _org(db)
    admin = _employee(db)
    _doc(db, admin, str(upload_dir / "present.pdf"))
    _doc(db, admin, str(upload_dir / "absent.pdf"))

    rows = service.get_hr_documents(db, organization_id=1, current_user=admin)
    by_path = {r["file_path"]: r for r in rows}
    assert by_path[str(upload_dir / "present.pdf")]["file_missing"] is False
    assert by_path[str(upload_dir / "absent.pdf")]["file_missing"] is True


def test_get_by_id_flags_missing_file(db, tmp_path, monkeypatch):
    monkeypatch.setenv("UPLOAD_BASE_DIR", str(tmp_path))
    _org(db)
    admin = _employee(db)
    doc = _doc(db, admin, str(tmp_path / "hr_documents" / "absent.pdf"))

    assert service.get_hr_document_by_id(db, doc["id"], organization_id=1)["file_missing"] is True


# ── Endpoint behaviour ────────────────────────────────────────────────────────

class _Caller:
    def __init__(self, org_id=1, role="admin"):
        self.id = 1
        self.email = "admin@z.test"
        self.role = role
        self.organization_id = org_id


@pytest.fixture
def client(db, tmp_path, monkeypatch):
    monkeypatch.setenv("UPLOAD_BASE_DIR", str(tmp_path))
    from app.core.dependencies import get_current_user
    from app.database import get_db
    from app.main import app

    _org(db)
    admin = _employee(db)
    upload_dir = tmp_path / "hr_documents"
    upload_dir.mkdir(parents=True, exist_ok=True)
    (upload_dir / "present.pdf").write_bytes(b"%PDF-1.4 hello")

    present = _doc(db, admin, str(upload_dir / "present.pdf"))
    missing = _doc(db, admin, str(upload_dir / "absent.pdf"))

    def _db():
        yield db

    app.dependency_overrides[get_db] = _db
    app.dependency_overrides[get_current_user] = lambda: _Caller()
    c = TestClient(app, raise_server_exceptions=False)
    c.present_id = present["id"]
    c.missing_id = missing["id"]
    yield c
    app.dependency_overrides.pop(get_db, None)
    app.dependency_overrides.pop(get_current_user, None)


def test_file_endpoint_serves_an_existing_file(client):
    res = client.get(f"/hr/documents/{client.present_id}/file")
    assert res.status_code == 200
    assert res.content.startswith(b"%PDF")
    assert "inline" in res.headers.get("content-disposition", "")
    assert "payslip.pdf" in res.headers.get("content-disposition", "")


def test_file_endpoint_answers_410_for_a_missing_file(client):
    res = client.get(f"/hr/documents/{client.missing_id}/file")
    assert res.status_code == 410, "a missing file is not 'document does not exist'"
    assert "not available on the server" in res.json()["detail"]


def test_file_endpoint_still_404s_for_an_unknown_document(client):
    assert client.get("/hr/documents/999999/file").status_code == 404