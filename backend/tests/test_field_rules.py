"""B7-B13, B16-B38: the shared field rules. The same fixture runs against frontend/src/utils/fieldRules.js, so the browser and
the server accept and refuse exactly the same values with exactly the same messages."""
import json
from pathlib import Path

import pytest

from app.core import field_rules

CASES = json.loads((Path(__file__).parent / "fixtures" / "field_rules_cases.json").read_text(encoding="utf-8"))["cases"]


@pytest.mark.parametrize("case", CASES, ids=[f"{c['rule']}:{c['value']!r}:{c.get('country')}" for c in CASES])
def test_field_rules_shared_fixture(case, strict_emails):
    rule, value, country, id_key = case["rule"], case["value"], case.get("country"), case.get("id_key")
    if case["valid"]:
        out = field_rules.clean(rule, value, country, id_key=id_key)
        if "normalized" in case:
            assert out == case["normalized"]
        assert field_rules.problem(rule, value, country, id_key=id_key) is None
    else:
        with pytest.raises(field_rules.FieldRuleError) as err:
            field_rules.clean(rule, value, country, id_key=id_key)
        assert str(err.value) == case["message"]


def test_every_rule_in_the_table_has_fixture_cases():
    covered = {c["rule"] for c in CASES}
    assert set(field_rules.RULES) <= covered


def test_org_registration_uses_the_country_id_rules_with_check_digits():
    assert field_rules.problem("org_registration", "27AAPFU0939F1ZV", "IN", id_key="gstin") is None
    assert "check digit" in field_rules.problem("org_registration", "27AAPFU0939F1ZA", "IN", id_key="gstin")
    assert field_rules.problem("org_registration", "51 824 753 556", "AU", id_key="abn") is None
    assert field_rules.problem("org_registration", "hello!!", "IN", id_key="gstin")


def test_email_without_mail_servers_is_refused_but_a_dns_failure_is_not(monkeypatch):
    from app.config import settings
    from app.core import email_quality
    monkeypatch.setattr(settings, "EMAIL_REAL_ONLY", True)
    monkeypatch.setattr(settings, "EMAIL_DNS_CHECK", True)
    monkeypatch.setattr(email_quality, "_domain_receives_mail", lambda d: False)
    assert field_rules.email_deliverable("a@nomx-domain.com") == field_rules.MESSAGES["email_no_mail"]
    monkeypatch.setattr(email_quality, "_domain_receives_mail", lambda d: None)      # resolver down: accept
    assert field_rules.email_deliverable("a@whatever.com") is None


def test_the_browser_copy_of_the_rule_tables_is_up_to_date():
    """frontend/src/utils/fieldRulesData.js is generated from these tables; re-run scripts/export_field_rules_data.py."""
    import importlib.util
    script = Path(__file__).resolve().parents[1] / "scripts" / "export_field_rules_data.py"
    target = Path(__file__).resolve().parents[2] / "frontend" / "src" / "utils" / "fieldRulesData.js"
    if not target.exists():
        pytest.skip("frontend not checked out next to the backend")
    spec = importlib.util.spec_from_file_location("export_field_rules_data", script)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    assert target.read_text(encoding="utf-8").replace("\r\n", "\n") == mod.build(), "run: python scripts/export_field_rules_data.py"


def test_the_non_conforming_values_report_counts_per_org_and_field_without_personal_data():
    """Ground rule 4: legacy values are counted (no names, e-mails or values), never changed."""
    import importlib.util
    from datetime import date
    from sqlalchemy import create_engine
    from sqlalchemy.orm import sessionmaker
    from sqlalchemy.pool import StaticPool
    import app.main  # noqa: F401
    from app.database import Base
    from app.modules.employee.models import Employee, EmployeeStatus, EmploymentType, UserRole
    from app.modules.hr.models import Organization, OrganizationStatus

    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(engine)
    db = sessionmaker(bind=engine)()
    db.add(Organization(id=1, name="Acme", status=OrganizationStatus.ACTIVE))
    db.add(Employee(email="secret.person@acme-corp.com", hashed_password="x", employee_code="E1", role=UserRole.EMPLOYEE,
                    first_name="John123", last_name="Ok", job_title="t", city="City9", country="India",
                    employment_type=EmploymentType.FULL_TIME, status=EmployeeStatus.ACTIVE, date_of_joining=date.today(), organization_id=1))
    db.commit()
    script = Path(__file__).resolve().parents[1] / "scripts" / "field_rules_report.py"
    spec = importlib.util.spec_from_file_location("field_rules_report", script)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    report = mod.build(db)
    row = report["organizations"]["1"]
    assert row["non_conforming"]["first_name"] == 1 and row["non_conforming"]["city"] == 1
    assert "last_name" not in row["non_conforming"]
    text = json.dumps(report)
    assert "secret.person" not in text and "John123" not in text and "City9" not in text
    db.close()
    engine.dispose()
