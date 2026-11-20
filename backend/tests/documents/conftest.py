"""Shared fixtures for the documents module tests (ZHR-DOCS-ARCH-001): an in-memory database with two organizations, an
admin, an HR admin, a manager and two employees in organization 1, and one employee in organization 2."""
from datetime import date
from types import SimpleNamespace

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base
import app.modules.integrations.models  # noqa: F401  (hub_webhooks / workflow tables used by emit_event)
from app.modules.employee.models import Employee, EmployeeStatus, EmploymentType, UserRole
from app.modules.hr.models import Organization, OrganizationStatus


def _person(org_id, key, role, **kw):
    return Employee(email=f"{key}@org{org_id}.example.com", hashed_password="x", employee_code=f"C-{org_id}-{key}", role=role,
                    first_name=key.title(), last_name="User", job_title="t", employment_type=EmploymentType.FULL_TIME,
                    status=EmployeeStatus.ACTIVE, date_of_joining=date(2026, 1, 5), organization_id=org_id, **kw)


@pytest.fixture
def engine():
    eng = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(eng)
    yield eng
    eng.dispose()


@pytest.fixture
def db(engine):
    s = sessionmaker(bind=engine, expire_on_commit=False)()
    yield s
    s.close()


@pytest.fixture
def world(db):
    for oid in (1, 2):
        db.add(Organization(id=oid, name=f"Org{oid}", organization_name=f"Org{oid}", status=OrganizationStatus.ACTIVE))
    db.commit()
    people = {
        "admin": _person(1, "admin", UserRole.ADMIN),
        "hr": _person(1, "hr", UserRole.HR_ADMIN),
        "mgr": _person(1, "mgr", UserRole.MANAGER),
        "emp": _person(1, "emp", UserRole.EMPLOYEE),
        "emp2": _person(1, "emp2", UserRole.EMPLOYEE),
        "other": _person(2, "other", UserRole.EMPLOYEE),
    }
    db.add_all(people.values())
    db.commit()
    from app.modules.hr.documents.category_service import seed_org_categories
    seed_org_categories(db, 1)
    seed_org_categories(db, 2)
    db.commit()
    return SimpleNamespace(db=db, people=people)


@pytest.fixture
def tmp_store(tmp_path):
    """Uploaded files go to a temporary encrypted store."""
    from app.modules.doc_templates.storage import LocalDocumentStore
    from app.modules.hr.documents import storage_service
    storage_service.set_store(LocalDocumentStore(root=str(tmp_path)))
    yield tmp_path
    storage_service.set_store(None)


@pytest.fixture(autouse=True)
def _no_rate_limit():
    """The app-wide limiter (60/minute per client) would count every test's requests against one TestClient address."""
    from app.core.rate_limiter import limiter
    limiter.reset()
    yield
    limiter.reset()
