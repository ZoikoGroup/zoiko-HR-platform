"""Bug 21: typing a full name ("siddartha a") into an employee picker found nobody, because the whole text was matched
against first name, last name and email one at a time. Every typed word must now match some column."""

from datetime import date, timedelta

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base
from app.modules.employee import service
from app.modules.employee.models import Employee, EmployeeStatus, EmploymentType, UserRole
from app.modules.hr.models import Organization, OrganizationStatus


@pytest.fixture
def db():
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(engine)
    session = sessionmaker(bind=engine)()
    for oid in (1, 2):
        session.add(Organization(id=oid, name=f"Org {oid}", status=OrganizationStatus.ACTIVE, timezone="UTC"))
    session.commit()
    people = [(1, "Siddartha", "Arora", "sid@z.test"), (1, "Siddharth", "Menon", "menon@z.test"),
              (1, "Priya", "Arora", "priya@z.test"), (2, "Siddartha", "Arora", "other@z.test")]
    for n, (oid, first, last, email) in enumerate(people, 1):
        session.add(Employee(email=email, hashed_password="x", employee_code=f"EMP{n}", role=UserRole.EMPLOYEE,
                             first_name=first, last_name=last, job_title="Engineer",
                             employment_type=EmploymentType.FULL_TIME, status=EmployeeStatus.ACTIVE,
                             date_of_joining=date.today() - timedelta(days=10), organization_id=oid))
    session.commit()
    yield session
    session.close()
    engine.dispose()


def _names(result):
    return sorted(f"{e.first_name} {e.last_name}" for e in result["items"])


@pytest.mark.parametrize("fn", [service.get_all_employees, service.get_employees])
@pytest.mark.parametrize("term,expected", [
    ("siddartha a", ["Siddartha Arora"]),
    ("Siddartha Arora", ["Siddartha Arora"]),
    ("  arora   siddartha ", ["Siddartha Arora"]),
    ("arora", ["Priya Arora", "Siddartha Arora"]),
    ("sid", ["Siddartha Arora", "Siddharth Menon"]),   # a single word still matches as a substring
    ("siddartha x", []),
    ("100%", []),                                     # LIKE wildcards are literal
])
def test_every_typed_word_must_match(db, fn, term, expected):
    assert _names(fn(db, search=term, organization_id=1)) == expected


def test_blank_search_lists_everyone_in_the_org(db):
    assert service.get_all_employees(db, search="   ", organization_id=1)["total"] == 3
