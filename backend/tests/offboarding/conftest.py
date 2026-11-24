"""Offboarding test world: organisation 1 with an admin, an HR admin, a manager, two employees reporting to the manager
(and an IT person), organisation 2 with one employee. The API client switches the signed-in person with `api.as_(who)`.
E-mails are captured in `api.mail`."""
from datetime import date
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.core.dependencies import get_current_user
from app.database import Base, get_db
import app.modules.integrations.models  # noqa: F401
from app.modules.employee.models import Employee, EmployeeStatus, EmploymentType, UserRole
from app.modules.hr.models import Organization, OrganizationStatus


def _person(org_id, key, role, **kw):
    return Employee(email=f"{key}@org{org_id}.example.com", hashed_password="x", employee_code=f"C-{org_id}-{key}", role=role,
                    first_name=key.title(), last_name="User", job_title="Engineer", employment_type=EmploymentType.FULL_TIME,
                    status=EmployeeStatus.ACTIVE, date_of_joining=date(2024, 1, 5), organization_id=org_id, **kw)


@pytest.fixture
def db():
    eng = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(eng)
    s = sessionmaker(bind=eng, expire_on_commit=False)()
    yield s
    s.close()
    eng.dispose()


@pytest.fixture
def world(db):
    for oid in (1, 2):
        db.add(Organization(id=oid, name=f"Org{oid}", organization_name=f"Org{oid} Ltd", status=OrganizationStatus.ACTIVE))
    db.commit()
    p = {"admin": _person(1, "admin", UserRole.ADMIN), "hr": _person(1, "hr", UserRole.HR_ADMIN),
         "mgr": _person(1, "mgr", UserRole.MANAGER), "it": _person(1, "it", UserRole.EMPLOYEE),
         "other": _person(2, "other", UserRole.EMPLOYEE)}
    db.add_all(p.values())
    db.commit()
    p["emp"] = _person(1, "emp", UserRole.EMPLOYEE, reporting_manager_id=p["mgr"].id, basic_salary=30000)
    p["emp2"] = _person(1, "emp2", UserRole.EMPLOYEE, reporting_manager_id=p["mgr"].id)
    db.add_all([p["emp"], p["emp2"]])
    db.commit()
    return SimpleNamespace(db=db, people=p)


@pytest.fixture
def api(world, monkeypatch):
    from app.main import app
    mail = []
    monkeypatch.setattr("app.services.email_service.send_approval_email",
                        lambda to, template, ctx, **k: mail.append({"to": to, "template": template, **ctx}) or True)
    box = {"user": world.people["emp"]}
    app.dependency_overrides[get_db] = lambda: world.db
    app.dependency_overrides[get_current_user] = lambda: box["user"]
    client = TestClient(app, raise_server_exceptions=False)
    client.db, client.people, client.mail = world.db, world.people, mail
    client.as_ = lambda who: box.__setitem__("user", world.people[who])
    from app.core.rate_limiter import limiter
    limiter.reset()
    yield client
    limiter.reset()
    app.dependency_overrides.pop(get_db, None)
    app.dependency_overrides.pop(get_current_user, None)
