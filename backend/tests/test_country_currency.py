"""Tests for country-based currency resolution for org admins and employee admins."""
from datetime import date
import pytest
from app.database import Base
from app.modules.employee.models import Employee, UserRole, EmploymentType, EmployeeStatus
from app.modules.hr.models import Organization
from app.modules.employee.schema import EmployeeResponse
from app.core import regions


def test_regions_currency_mapping():
    assert regions.currency_for("India") == "INR"
    assert regions.currency_for("IN") == "INR"
    assert regions.currency_for("United States") == "USD"
    assert regions.currency_for("US") == "USD"
    assert regions.currency_for("United Kingdom") == "GBP"
    assert regions.currency_for("GB") == "GBP"
    assert regions.currency_for("UK") == "GBP"
    assert regions.currency_for("United Arab Emirates") == "AED"
    assert regions.currency_for("AE") == "AED"
    assert regions.currency_for("Germany") == "EUR"
    assert regions.currency_for("DE") == "EUR"
    assert regions.currency_for("Australia") == "AUD"
    assert regions.currency_for("AU") == "AUD"
    assert regions.currency_for("Canada") == "CAD"
    assert regions.currency_for("CA") == "CAD"


def test_employee_response_derives_currency_from_model():
    emp = Employee(
        id=1,
        email="admin@example.in",
        hashed_password="x",
        employee_code="EMP001",
        role=UserRole.ADMIN,
        first_name="Admin",
        last_name="User",
        job_title="System Administrator",
        employment_type=EmploymentType.FULL_TIME,
        status=EmployeeStatus.ACTIVE,
        is_active=True,
        must_change_password=False,
        date_of_joining=date.today(),
        country="India",
        work_country="IN",
    )
    resp = EmployeeResponse.model_validate(emp)
    assert resp.currency == "INR"
    assert resp.work_country == "IN"

    # Test with employee having organization relationship with country/currency
    org = Organization(
        id=10,
        name="UK Corp",
        country="United Kingdom",
        currency="GBP",
    )
    emp_uk = Employee(
        id=2,
        email="manager@ukcorp.co.uk",
        hashed_password="x",
        employee_code="EMP002",
        role=UserRole.HR_ADMIN,
        first_name="UK",
        last_name="Manager",
        job_title="HR Admin",
        employment_type=EmploymentType.FULL_TIME,
        status=EmployeeStatus.ACTIVE,
        is_active=True,
        must_change_password=False,
        date_of_joining=date.today(),
        organization_id=10,
        country="United Kingdom",
    )
    emp_uk.organization = org
    resp_uk = EmployeeResponse.model_validate(emp_uk)
    assert resp_uk.currency == "GBP"
    assert resp_uk.organization_country == "United Kingdom"
    assert resp_uk.work_country == "GB"


def test_org_currency_helper():
    from app.modules.hr.service import _org_currency
    from unittest.mock import MagicMock

    # Mock DB query
    db = MagicMock()
    mock_org = MagicMock()
    mock_org.currency = None
    mock_org.country = "United Arab Emirates"
    db.query().filter().first.return_value = mock_org

    cur = _org_currency(db, 1)
    assert cur == "AED"

    # When currency is explicitly set
    mock_org.currency = "EUR"
    cur = _org_currency(db, 1)
    assert cur == "EUR"


def test_get_organization_details_plan_limit():
    from app.modules.hr.service import get_organization_details
    from unittest.mock import MagicMock
    from datetime import datetime

    db = MagicMock()
    mock_org = MagicMock()
    mock_org.id = 1
    mock_org.uuid = "uuid-1"
    mock_org.name = "Acme Inc"
    mock_org.code = "ACME"
    mock_org.organization_code = "ACME001"
    mock_org.organization_name = "Acme Inc"
    mock_org.display_name = "Acme Inc"
    mock_org.language = "en"
    mock_org.website = None
    mock_org.logo_url = None
    mock_org.status = "ACTIVE"
    mock_org.is_active = True
    mock_org.domain = None
    mock_org.address = None
    mock_org.country = "India"
    mock_org.state = None
    mock_org.city = None
    mock_org.timezone = "Asia/Kolkata"
    mock_org.currency = "INR"
    mock_org.industry = None
    mock_org.created_at = datetime.now()
    mock_org.updated_at = None

    # Side effect for query().filter().first(): 1st call is Org, 2nd is Admin, 3rd is Evaluation
    mock_admin = MagicMock(full_name="Admin", email="a@a.com", phone="123")
    mock_eval = MagicMock(approved_package_scope="core", evaluation_ends_at=datetime.now())

    query_mock = MagicMock()
    filter_mock = MagicMock()
    filter_mock.first.side_effect = [mock_org, mock_admin, mock_eval]
    filter_mock.count.return_value = 5
    query_mock.filter.return_value = filter_mock
    db.query.return_value = query_mock

    res = get_organization_details(db, 1)
    assert res["subscription_plan"] == "CORE"
    assert res["max_users"] == 50
