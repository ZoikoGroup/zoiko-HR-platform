"""Shared fixtures for the attendance tests: an in-memory database with two organizations, an admin, an HR admin, a
manager with one report, two employees and someone in the other organization, and an API client whose signed-in user
can be switched with `api.as_(key)`."""
from datetime import date

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.core.dependencies import get_current_user
from app.database import Base, get_db
from app.modules.employee.models import Employee, EmployeeStatus, EmploymentType, UserRole
from app.modules.hr.models import Department, Organization, OrganizationStatus

PEOPLE = (  # key, role, org, reports to
    ("admin", UserRole.ADMIN, 1, None),
    ("hr", UserRole.HR_ADMIN, 1, None),
    ("mgr", UserRole.MANAGER, 1, None),
    ("emp", UserRole.EMPLOYEE, 1, "mgr"),
    ("emp2", UserRole.EMPLOYEE, 1, None),
    ("other", UserRole.EMPLOYEE, 2, None),
)


@pytest.fixture
def db():
    import app.modules.hr.documents.automation.models  # noqa: F401  (tables the app expects to exist)
    import app.modules.hr.documents.models  # noqa: F401
    import app.modules.integrations.models  # noqa: F401
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(engine)
    s = sessionmaker(bind=engine, expire_on_commit=False)()
    s.add_all([Organization(id=1, name="Acme", status=OrganizationStatus.ACTIVE, timezone="Asia/Kolkata"),
               Organization(id=2, name="Globex", status=OrganizationStatus.ACTIVE)])
    s.commit()
    s.add_all([Department(id=1, name="Engineering", code="ENG", organization_id=1),
               Department(id=2, name="Sales", code="SAL", organization_id=1)])
    s.commit()
    yield s
    s.close()
    engine.dispose()


@pytest.fixture
def people(db):
    out = {}
    for key, role, org, _ in PEOPLE:
        e = Employee(email=f"{key}@example.com", hashed_password="x", employee_code=f"C-{key}", role=role, first_name=key.title(),
                     last_name="Person", job_title="t", employment_type=EmploymentType.FULL_TIME, status=EmployeeStatus.ACTIVE,
                     date_of_joining=date(2025, 1, 1), organization_id=org, department_id=1 if org == 1 else None)
        db.add(e)
        out[key] = e
    db.commit()
    for key, _, _, boss in PEOPLE:
        if boss:
            out[key].reporting_manager_id = out[boss].id
    db.commit()
    return out


@pytest.fixture
def api(db, people):
    from app.main import app
    box = {"user": people["admin"]}
    app.dependency_overrides[get_db] = lambda: db
    app.dependency_overrides[get_current_user] = lambda: box["user"]
    client = TestClient(app, raise_server_exceptions=False)
    client.db, client.people = db, people
    client.as_ = lambda who: box.__setitem__("user", people[who])
    yield client
    app.dependency_overrides.pop(get_db, None)
    app.dependency_overrides.pop(get_current_user, None)


@pytest.fixture(autouse=True)
def _no_rate_limit():
    """The app-wide limiter (60/minute per client) would count every test's requests against one TestClient address."""
    from app.core.rate_limiter import limiter
    limiter.reset()
    yield
    limiter.reset()
