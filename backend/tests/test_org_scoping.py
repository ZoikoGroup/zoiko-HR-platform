"""
Records that belong to an organization stay inside it: asset reports and settings, learning skills and the compliance
module (audits, regulations, risks, violations, corrective actions, dashboard counts). Before these fixes every
organization could list, open, edit or delete the others' rows.
"""
from datetime import date
from types import SimpleNamespace

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.core.exceptions import NotFoundException
from app.database import Base
from app.modules.employee.models import Employee, EmployeeStatus, EmploymentType, UserRole
from app.modules.hr import asset_service, learning_service, service
from app.modules.hr.models import AssetSetting, Organization, OrganizationStatus


@pytest.fixture
def db():
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(engine)
    s = sessionmaker(bind=engine)()
    yield s
    s.close()
    engine.dispose()


@pytest.fixture
def orgs(db):
    a = Organization(organization_name="Alpha", status=OrganizationStatus.ACTIVE)
    b = Organization(organization_name="Beta", status=OrganizationStatus.ACTIVE)
    db.add_all([a, b])
    db.flush()
    people = {}
    for org, tag in ((a, "a"), (b, "b")):
        e = Employee(email=f"hr@{tag}.example", hashed_password="x", employee_code=f"{tag.upper()}001", role=UserRole.HR_ADMIN,
                     first_name=tag, last_name="Admin", job_title="HR", employment_type=EmploymentType.FULL_TIME,
                     status=EmployeeStatus.ACTIVE, is_active=True, date_of_joining=date(2024, 1, 1), organization_id=org.id)
        db.add(e)
        db.flush()
        people[tag] = e
    db.commit()
    return SimpleNamespace(a=a.id, b=b.id, emp_a=people["a"].id, emp_b=people["b"].id)


def _data(**kw):
    """Stand-in for a pydantic payload: model_dump() returns the fields."""
    return SimpleNamespace(model_dump=lambda exclude_unset=False: dict(kw))


# ── learning skills ─────────────────────────────────────────────────────────

def test_skills_are_listed_read_changed_and_deleted_within_the_org_only(db, orgs):
    from app.modules.hr.schemas import SkillCreate, SkillUpdate
    sa = learning_service.create_skill(db, SkillCreate(employee_id=orgs.emp_a, skill_name="Python"), organization_id=orgs.a)
    sb = learning_service.create_skill(db, SkillCreate(employee_id=orgs.emp_b, skill_name="Excel"), organization_id=orgs.b)
    assert [s.skill_name for s in learning_service.get_skills(db, organization_id=orgs.a)] == ["Python"]
    assert {s.skill_name for s in learning_service.get_skills(db, organization_id=None)} == {"Python", "Excel"}   # super admin
    for call in (lambda: learning_service.get_skill_by_id(db, sb.id, orgs.a),
                 lambda: learning_service.update_skill(db, sb.id, SkillUpdate(skill_name="Hacked"), orgs.a),
                 lambda: learning_service.delete_skill(db, sb.id, orgs.a)):
        with pytest.raises(NotFoundException):
            call()
    db.refresh(sb)
    assert sb.skill_name == "Excel"
    assert learning_service.get_skill_by_id(db, sa.id, orgs.a).skill_name == "Python"


def test_a_skill_cannot_be_filed_for_another_orgs_employee(db, orgs):
    from app.modules.hr.schemas import SkillCreate
    with pytest.raises(NotFoundException):
        learning_service.create_skill(db, SkillCreate(employee_id=orgs.emp_b, skill_name="X"), organization_id=orgs.a)


# ── asset reports and settings ──────────────────────────────────────────────

def test_asset_reports_are_org_scoped(db, orgs):
    payload = SimpleNamespace(report_type="inventory", title="T", description=None, parameters=None)
    asset_service.create_asset_report(db, SimpleNamespace(**{**payload.__dict__, "title": "Alpha report"}), orgs.emp_a, organization_id=orgs.a)
    asset_service.create_asset_report(db, SimpleNamespace(**{**payload.__dict__, "title": "Beta report"}), orgs.emp_b, organization_id=orgs.b)
    assert [r.title for r in asset_service.get_asset_reports(db, organization_id=orgs.a)] == ["Alpha report"]
    rows, total = asset_service.get_asset_reports(db, page=1, per_page=10, organization_id=orgs.b)
    assert total == 1 and rows[0].title == "Beta report"
    assert len(asset_service.get_asset_reports(db, organization_id=None)) == 2


def test_asset_settings_fall_back_to_the_platform_default_and_writes_stay_in_the_org(db, orgs):
    db.add(AssetSetting(setting_key="depreciation_method", setting_value="straight_line"))   # legacy global row = default
    db.commit()
    as_map = lambda org: {s.setting_key: s.setting_value for s in asset_service.get_asset_settings(db, org)}
    assert as_map(orgs.a) == as_map(orgs.b) == {"depreciation_method": "straight_line"}
    # creating a setting used to raise TypeError (AssetSetting had no updated_by column); now it is the org's own row
    asset_service.update_asset_setting(db, "depreciation_method", "declining", orgs.emp_a, organization_id=orgs.a)
    asset_service.update_asset_setting(db, "currency", "EUR", orgs.emp_a, organization_id=orgs.a)
    assert as_map(orgs.a) == {"depreciation_method": "declining", "currency": "EUR"}
    assert as_map(orgs.b) == {"depreciation_method": "straight_line"}          # Beta untouched
    assert as_map(None) == {"depreciation_method": "straight_line"}            # the default itself unchanged


# ── compliance ──────────────────────────────────────────────────────────────

COMPLIANCE = [
    ("audit", service.create_audit, service.get_audits, service.get_audit_by_id, service.update_audit, service.delete_audit,
     dict(title="Q3 audit", auditor="Ann", score=80, status="completed")),
    ("risk", service.create_risk_assessment, service.get_risk_assessments, service.get_risk_assessment_by_id,
     service.update_risk_assessment, service.delete_risk_assessment, dict(title="Data risk", category="it", risk_score=5, status="open")),
    ("violation", service.create_compliance_violation, service.get_compliance_violations, service.get_compliance_violation_by_id,
     service.update_compliance_violation, service.delete_compliance_violation, dict(title="Breach", violation="v", policy="p", severity="high", status="open")),
    ("action", service.create_corrective_action, service.get_corrective_actions, service.get_corrective_action_by_id,
     service.update_corrective_action, service.delete_corrective_action, dict(title="Fix it", assigned_to="Bob", status="open")),
]


@pytest.mark.parametrize("name,create,listing,get,update,delete,fields", COMPLIANCE, ids=[c[0] for c in COMPLIANCE])
def test_compliance_records_stay_in_their_org(db, orgs, name, create, listing, get, update, delete, fields):
    mine = create(db, _data(**fields), organization_id=orgs.a)
    theirs = create(db, _data(**{**fields, "title": "Theirs"}), organization_id=orgs.b)
    assert [r["id"] for r in listing(db, organization_id=orgs.a)] == [mine["id"]]
    paged = listing(db, organization_id=orgs.a, page=1, per_page=10)
    assert paged["total"] == 1 and paged["items"][0]["id"] == mine["id"]
    for call in (lambda: get(db, theirs["id"], organization_id=orgs.a),
                 lambda: update(db, theirs["id"], _data(title="Hacked"), organization_id=orgs.a),
                 lambda: delete(db, theirs["id"], organization_id=orgs.a)):
        with pytest.raises(NotFoundException):
            call()
    assert get(db, theirs["id"], organization_id=orgs.b)["title"] == "Theirs"
    assert len(listing(db, organization_id=None)) == 2                        # platform super admin sees both


def test_regulations_are_org_scoped(db, orgs):
    service.create_regulatory_requirement(db, _data(name="GDPR", jurisdiction="EU", category="privacy", status="active"), organization_id=orgs.a)
    service.create_regulatory_requirement(db, _data(name="SOX", jurisdiction="US", category="finance", status="active"), organization_id=orgs.b)
    assert [r["name"] for r in service.get_regulatory_requirements(db, organization_id=orgs.b)] == ["SOX"]


def test_compliance_dashboard_counts_only_the_org(db, orgs):
    service.create_audit(db, _data(title="A", auditor="x", score=1, status="completed"), organization_id=orgs.a)
    service.create_audit(db, _data(title="B", auditor="x", score=1, status="completed"), organization_id=orgs.b)
    service.create_compliance_violation(db, _data(title="V", violation="v", policy="p", severity="high", status="open"), organization_id=orgs.b)
    stats = service.get_compliance_dashboard(db, organization_id=orgs.a)["stats"]
    assert stats["completedAudits"] == 1 and stats["openViolations"] == 0
