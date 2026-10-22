"""Prompt 2 workforce planning: job descriptions, headcount, position and succession authorizations and their records."""
from datetime import date

from app.modules.doc_templates import renderer, storage
from app.modules.doc_templates.models import GeneratedDocument
from app.modules.hr.models import Designation, WfHeadcount, WfSuccession
from tests.doc_templates.p2_support import activate


def _text(world, cid):
    doc = world.db.query(GeneratedDocument).filter_by(canonical_id=cid).order_by(GeneratedDocument.id.desc()).first()
    assert doc is not None, cid
    return doc, " ".join(renderer.pdf_text(storage.get_store().get(doc.pdf_path)).split())


def test_job_description_lifecycle_language_check_and_record(world):
    activate(world.db, "HR-ORG-005")
    body = {"title": "Data Analyst", "purpose": "Turn data into decisions for a young, energetic team.",
            "key_responsibilities": ["Build weekly reports"], "requirements_essential": ["SQL"], "requirements_desirable": ["Logistics"],
            "work_arrangement": "hybrid", "work_location": "Leeds"}
    jd = world.post("a_hr", "/hr/workforce/job-descriptions", json=body).json()
    flags = world.post("a_hr", f"/hr/workforce/job-descriptions/{jd['id']}/language-check").json()["flags"]
    assert {f["term"] for f in flags} >= {"young", "energetic"}
    assert world.post("a_hr", f"/hr/workforce/job-descriptions/{jd['id']}/submit").json()["status"] == "PENDING"
    assert world.post("a_hr", f"/hr/workforce/job-descriptions/{jd['id']}/decision", json={"approve": True}).status_code == 403
    r = world.post("a_admin", f"/hr/workforce/job-descriptions/{jd['id']}/decision", json={"approve": True})
    assert r.json()["status"] == "APPROVED"
    doc, t = _text(world, "HR-ORG-005")
    assert doc.status == "ISSUED" and "Job Description — Data Analyst" in t and "Build weekly reports" in t
    assert "We welcome applications from everyone" in t and "Version 1, approved" in t
    nv = world.post("a_hr", f"/hr/workforce/job-descriptions/{jd['id']}/new-version").json()
    assert nv["version"] == 2 and nv["status"] == "DRAFT"


def test_headcount_request_needs_a_different_approver_and_produces_the_record(world):
    activate(world.db, "HR-ORG-003")
    from app.modules.hr.models import Department
    d = Department(name="Operations", code="OPS1", organization_id=1)
    world.db.add(d)
    world.db.commit()
    h = WfHeadcount(organization_id=1, department_id=d.id, fiscal_year=2027, approved_positions=15, filled_positions=12, projected_cost=90000)
    world.db.add(h)
    world.db.commit()
    assert world.post("a_hr", f"/hr/workforce/headcount/{h.id}/submit", json={"rationale": "New contracts"}).json()["status"] == "submitted"
    assert world.post("a_hr", f"/hr/workforce/headcount/{h.id}/decision", json={"approve": True}).status_code == 403
    assert world.post("a_admin", f"/hr/workforce/headcount/{h.id}/decision", json={"approve": False}).status_code == 422
    r = world.post("a_admin", f"/hr/workforce/headcount/{h.id}/decision", json={"approve": True, "comment": "Budgeted"})
    assert r.json()["status"] == "approved"
    doc, t = _text(world, "HR-ORG-003")
    assert doc.status == "ISSUED" and "Headcount Authorization — Operations — FY 2027" in t and "+3" in t and "Approved" in t
    assert "Each hire still requires a hiring requisition" in t


def test_position_approval_setting_and_record(world):
    activate(world.db, "HR-ORG-004")
    r = world.put("a_admin", "/hr/designations/settings", json={"require_position_approval": True})
    assert r.status_code == 200, r.text
    r = world.post("a_admin", "/hr/designations", json={"title": "Data Analyst", "department_name": "Operations"})
    assert r.status_code == 201, r.text
    d = world.db.get(Designation, r.json()["id"])
    assert d.approval_status == "pending" and d.status == "inactive"
    world.post("a_hr", f"/hr/workforce/positions/{d.id}/request", json={"reason": "New service line", "location": "Leeds"})
    assert world.post("a_hr", f"/hr/workforce/positions/{d.id}/decision", json={"approve": True}).status_code == 403
    out = world.post("a_admin2", f"/hr/workforce/positions/{d.id}/decision", json={"approve": True}).json()
    assert out["approval_status"] == "approved" and out["status"] == "active"
    doc, t = _text(world, "HR-ORG-004")
    assert "Position Creation Request — Data Analyst" in t and "New service line" in t


def test_succession_plans_are_restricted_and_documented(world):
    activate(world.db, "HR-ORG-015")
    s = WfSuccession(organization_id=1, employee_id=world.u["a_manager"].id, successor_employee_id=world.u["a_emp"].id,
                     readiness_level="ready", risk_level="high", target_position="Operations Lead")
    world.db.add(s)
    world.db.commit()
    assert world.get("a_emp", "/hr/workforce/succession").json()["total"] == 0, "a named person does not see the plan"
    assert world.get("a_manager", f"/hr/workforce/succession/{s.id}").status_code == 404
    r = world.post("a_hr", f"/hr/workforce/succession/{s.id}/submit", json={"owner_id": world.u["a_emp"].id})
    assert r.status_code == 400, "a named person cannot own the plan"
    world.post("a_hr", f"/hr/workforce/succession/{s.id}/submit", json={"owner_id": world.u["a_emp2"].id, "development_actions": "Lead Q3 planning"})
    assert world.get("a_emp2", "/hr/workforce/succession").json()["total"] == 1, "the owner sees it"
    world.post("a_admin", f"/hr/workforce/succession/{s.id}/decision", json={"approve": True})
    doc, t = _text(world, "HR-ORG-015")
    assert doc.audience == "HR_INTERNAL" and "Succession Plan — Operations Lead" in t and "Lead Q3 planning" in t
    assert "is not a promise or a decision about promotion" in t
    assert world.get("a_emp", f"/hr/me/generated-documents/{doc.id}").status_code == 404
