"""Documents Phase 1 (foundation): categories, permissions, lifecycle, audit, events and the backfill."""
import json
import pathlib
import re
from datetime import date, datetime

import pytest
from sqlalchemy import text

from app.modules.hr.documents import audit_service, lifecycle, permissions
from app.modules.hr.documents.automation.models import AutomationRule, AutomationRun
from app.modules.hr.documents.category_service import employee_category_by_key, seed_org_categories
from app.modules.hr.documents.constants import SYSTEM_COMPANY_CATEGORIES, SYSTEM_EMPLOYEE_CATEGORIES, map_legacy_category
from app.modules.hr.documents.models import (
    AppendOnlyViolation, HrCompanyDocumentCategory, HrDocumentAccessRule, HrDocumentAuditLog, HrEmployeeDocumentCategory,
)
from app.modules.hr.models import (
    DocumentApprovalStep, ApprovalStepStatus, DocumentAssignment, HrDocument, HrDocumentCategory, HrDocumentStatus,
    HrDocumentVersion,
)

REPO = pathlib.Path(__file__).resolve().parents[3]


# ── categories ───────────────────────────────────────────────────────────────────────────────────────────────────────

def test_system_categories_are_seeded_once_per_org(world):
    db = world.db
    assert db.query(HrEmployeeDocumentCategory).filter_by(organization_id=1).count() == len(SYSTEM_EMPLOYEE_CATEGORIES)
    assert db.query(HrCompanyDocumentCategory).filter_by(organization_id=1).count() == len(SYSTEM_COMPANY_CATEGORIES)
    assert seed_org_categories(db, 1) == (0, 0)


def test_reseeding_keeps_an_orgs_edits(world):
    db = world.db
    cat = employee_category_by_key(db, 1, "bank_details")
    cat.is_required = False
    cat.name = "Bank account"
    db.commit()
    seed_org_categories(db, 1)
    db.refresh(cat)
    assert (cat.is_required, cat.name) == (False, "Bank account")


def test_identity_address_education_always_need_a_person(world):
    keys = {c.key for c in world.db.query(HrEmployeeDocumentCategory).filter_by(organization_id=1, human_approval_required=True)}
    assert keys == {"identity_proof", "address_proof", "education"}


def test_category_names_are_jurisdiction_neutral():
    names = " ".join(n for _, n, *_ in SYSTEM_EMPLOYEE_CATEGORIES + SYSTEM_COMPANY_CATEGORIES).lower()
    for local in ("aadhaar", "aadhar", "pan card", "form 16", "w-2", "p60"):
        assert local not in names


@pytest.mark.parametrize("category,title,doc_type,has_emp,expected", [
    ("EMPLOYEE", "Passport scan", None, True, ("employee", "identity_proof")),
    ("employee", "Degree certificate", None, True, ("employee", "education")),
    ("employee", "Something", None, True, ("employee", "medical_other")),
    ("CONTRACT", "x", None, True, ("employee", "offer_contracts")),
    ("payslip", "x", None, True, ("employee", "payslips")),
    ("TAX", "x", None, True, ("employee", "tax_compliance")),
    ("POLICY", "x", None, False, ("company", "company_policies")),
    ("COMPANY", "Employee Handbook 2026", None, False, ("company", "employee_handbook")),
    ("company", "Misc", None, False, ("company", "forms_templates")),
    ("OTHER", "Leave form", None, False, ("company", "forms_templates")),
    ("OTHER", "Rent agreement", None, True, ("employee", "address_proof")),
])
def test_legacy_category_mapping(category, title, doc_type, has_emp, expected):
    assert map_legacy_category(category, title, doc_type, has_emp) == expected


# ── permissions ──────────────────────────────────────────────────────────────────────────────────────────────────────

class _User:
    def __init__(self, role):
        self.role = role


@pytest.mark.parametrize("role,action,allowed", [
    ("admin", permissions.DocAction.APPROVAL_DECIDE, True),
    ("hr_admin", permissions.DocAction.APPROVAL_DECIDE, True),
    ("manager", permissions.DocAction.APPROVAL_DECIDE, False),
    ("employee", permissions.DocAction.EMP_DOCS_VIEW, False),
    ("employee", permissions.DocAction.ME_UPLOAD, True),
    ("manager", permissions.DocAction.ME_UPLOAD, True),
    ("hr_admin", permissions.DocAction.AUTOMATION_GLOBAL, False),
    ("admin", permissions.DocAction.AUTOMATION_GLOBAL, True),
    ("super_admin", permissions.DocAction.ME_VIEW, False),
    ("admin", permissions.DocAction.SYSTEM_ISSUE, False),
])
def test_permission_matrix(role, action, allowed):
    assert permissions.has_doc_permission(_User(role), action) is allowed


def test_frontend_permission_map_matches_the_backend():
    src = (REPO / "frontend/src/modules/zoiko-hr/documents/permissions.js").read_text(encoding="utf-8")
    block = re.search(r"DOC_PERMISSIONS\s*=\s*Object\.freeze\(\{(.*?)\}\);", src, re.S).group(1)
    frontend = {}
    for key, roles in re.findall(r'"([a-z_.]+)":\s*\[([^\]]*)\]', block):
        frontend[key] = sorted(re.findall(r'"([a-z_]+)"', roles))
    assert frontend == permissions.export_matrix()


# ── lifecycle ────────────────────────────────────────────────────────────────────────────────────────────────────────

def _doc(world, **kw):
    cat = employee_category_by_key(world.db, 1, "identity_proof")
    d = HrDocument(title="Passport", category=HrDocumentCategory.EMPLOYEE, status=HrDocumentStatus.PENDING,
                   employee_id=world.people["emp"].id, uploaded_by=world.people["emp"].id, organization_id=1,
                   scope="employee", employee_category_id=cat.id, source="employee", **kw)
    world.db.add(d)
    world.db.flush()
    return d


def _version(world, doc, n=1, **kw):
    return HrDocumentVersion(document_id=doc.id, version=n, file_name=f"v{n}.pdf", uploaded_by=doc.uploaded_by, **kw)


def test_upload_then_approve(world):
    db, hr = world.db, world.people["hr"]
    doc = _doc(world)
    v1 = lifecycle.apply_transition(db, _version(world, doc), lifecycle.Event.UPLOAD, world.people["emp"])
    assert v1.status == "pending_approval" and v1.organization_id == 1
    assert doc.status == HrDocumentStatus.PENDING
    lifecycle.apply_transition(db, v1, lifecycle.Event.APPROVE, hr)
    db.commit()
    assert v1.status == "approved" and v1.decided_by == hr.id and v1.decided_role == "hr_admin"
    assert doc.status == HrDocumentStatus.APPROVED and doc.approved_version_id == v1.id and doc.approved_by == hr.id


def test_a_newer_approved_version_supersedes_the_old_one(world):
    db, hr = world.db, world.people["hr"]
    doc = _doc(world)
    v1 = lifecycle.apply_transition(db, _version(world, doc, 1), lifecycle.Event.UPLOAD, world.people["emp"])
    lifecycle.apply_transition(db, v1, lifecycle.Event.APPROVE, hr)
    v2 = lifecycle.apply_transition(db, _version(world, doc, 2), lifecycle.Event.UPLOAD, world.people["emp"])
    assert doc.status == HrDocumentStatus.PENDING and doc.approved_version_id == v1.id   # v1 stays visible meanwhile
    lifecycle.apply_transition(db, v2, lifecycle.Event.APPROVE, world.people["admin"])
    db.commit()
    assert v1.status == "superseded" and v2.status == "approved" and doc.approved_version_id == v2.id


def test_reject_keeps_the_reason_and_rejected_history(world):
    db = world.db
    doc = _doc(world)
    v1 = lifecycle.apply_transition(db, _version(world, doc), lifecycle.Event.UPLOAD, world.people["emp"])
    lifecycle.apply_transition(db, v1, lifecycle.Event.REJECT, world.people["hr"], reason_code="illegible", note="Blurry")
    db.commit()
    assert (v1.status, v1.reason_code, v1.rejection_reason) == ("rejected", "illegible", "Blurry")
    assert doc.status == HrDocumentStatus.REJECTED and doc.rejection_reason == "Blurry"
    v2 = lifecycle.apply_transition(db, _version(world, doc, 2), lifecycle.Event.UPLOAD, world.people["emp"])
    assert v2.status == "pending_approval" and v1.status == "rejected"


@pytest.mark.parametrize("start,event", [
    ("rejected", lifecycle.Event.APPROVE),
    ("superseded", lifecycle.Event.APPROVE),
    ("expired", lifecycle.Event.REJECT),
    ("pending_approval", lifecycle.Event.EXPIRE),
    ("approved", lifecycle.Event.APPROVE),
])
def test_moves_that_do_not_exist_are_refused(world, start, event):
    doc = _doc(world)
    v = _version(world, doc, status=start, organization_id=1)
    world.db.add(v)
    world.db.flush()
    with pytest.raises(lifecycle.InvalidTransition):
        lifecycle.apply_transition(world.db, v, event, world.people["hr"])


def test_every_transition_is_audited_with_the_actor(world):
    db = world.db
    doc = _doc(world)
    v1 = lifecycle.apply_transition(db, _version(world, doc), lifecycle.Event.UPLOAD, world.people["emp"])
    lifecycle.apply_transition(db, v1, lifecycle.Event.APPROVE, world.people["hr"])
    db.commit()
    rows = db.query(HrDocumentAuditLog).filter_by(document_id=doc.id).order_by(HrDocumentAuditLog.id).all()
    assert [(r.action, r.actor_id, r.actor_type) for r in rows] == [
        ("uploaded", world.people["emp"].id, "user"), ("approved", world.people["hr"].id, "user")]


def test_system_transitions_are_audited_as_system(world):
    db = world.db
    doc = _doc(world)
    v = lifecycle.apply_transition(db, _version(world, doc), lifecycle.Event.AUTO_APPROVE, None, auto_reason="payroll")
    lifecycle.apply_transition(db, v, lifecycle.Event.EXPIRE, None)
    db.commit()
    rows = db.query(HrDocumentAuditLog).filter_by(document_id=doc.id).order_by(HrDocumentAuditLog.id).all()
    assert [(r.action, r.actor_type, r.actor_id) for r in rows] == [("auto_approved", "system", None), ("expired", "system", None)]
    assert rows[0].after["auto_reason"] == "payroll"


def test_audit_rows_are_append_only(world):
    db = world.db
    row = audit_service.record(db, org_id=1, actor=None, action="viewed", target_type="document", target_id=1)
    db.commit()
    row.action = "changed"
    with pytest.raises(AppendOnlyViolation):
        db.commit()
    db.rollback()


def test_audit_masks_identity_numbers(world):
    row = audit_service.record(world.db, org_id=1, action="category_changed", target_type="category", target_id=1,
                               before={"id_number": "123456789012"}, after={"name": "Passport"})
    assert row.before["id_number"].endswith("9012") and "12345678" not in row.before["id_number"]
    assert row.after["name"] == "Passport"


def test_view_logging_is_deduplicated(world):
    db = world.db
    assert audit_service.should_log_view(db, 5, 9)
    audit_service.record(db, org_id=1, actor=world.people["emp"], action="viewed", target_type="document", target_id=9, document_id=9)
    db.commit()
    assert not audit_service.should_log_view(db, world.people["emp"].id, 9)


# ── events are part of the business transaction ─────────────────────────────────────────────────────────────────────

def _rule(world, event, conditions=None, status="active"):
    r = AutomationRule(organization_id=1, name="r", trigger_event=event, status=status,
                       definition={"conditions": conditions or {"all": []}, "actions": [{"type": "log", "message": "hi"}]})
    world.db.add(r)
    world.db.commit()
    return r


def test_a_transition_queues_runs_in_the_same_transaction(world):
    db = world.db
    _rule(world, "document.uploaded")
    doc = _doc(world)
    lifecycle.apply_transition(db, _version(world, doc), lifecycle.Event.UPLOAD, world.people["emp"])
    db.commit()
    run = db.query(AutomationRun).one()
    assert run.event_type == "document.uploaded"
    assert run.trigger_payload["data"]["category_key"] == "identity_proof"
    assert "Passport" not in json.dumps(run.trigger_payload)          # ids only, never titles


def test_a_rolled_back_change_leaves_no_event(world):
    db = world.db
    _rule(world, "document.uploaded")
    doc = _doc(world)
    db.commit()
    lifecycle.apply_transition(db, _version(world, doc), lifecycle.Event.UPLOAD, world.people["emp"])
    db.rollback()
    assert db.query(AutomationRun).count() == 0


# ── backfill ─────────────────────────────────────────────────────────────────────────────────────────────────────────

def test_backfill_brings_legacy_rows_into_the_new_model(world, engine):
    from app.modules.hr.documents.backfill import run_all
    db, emp = world.db, world.people["emp"]
    passport = HrDocument(title="Passport", category=HrDocumentCategory.EMPLOYEE, status=HrDocumentStatus.APPROVED,
                          employee_id=emp.id, uploaded_by=world.people["admin"].id, organization_id=1, file_path="/x/p.pdf",
                          file_name="p.pdf", scope="employee")
    pending = HrDocument(title="Old contract", category=HrDocumentCategory.CONTRACT, status=HrDocumentStatus.PENDING,
                         employee_id=emp.id, uploaded_by=world.people["admin"].id, organization_id=1, file_path="/x/c.pdf")
    handbook = HrDocument(title="Handbook", category=HrDocumentCategory.COMPANY, status=HrDocumentStatus.APPROVED,
                          uploaded_by=world.people["admin"].id, organization_id=1, file_path="/x/h.pdf")
    secret = HrDocument(title="Board memo", category=HrDocumentCategory.COMPANY, status=HrDocumentStatus.APPROVED,
                        uploaded_by=world.people["admin"].id, organization_id=1, file_path="/x/b.pdf")
    db.add_all([passport, pending, handbook, secret])
    db.commit()
    db.add_all([DocumentAssignment(document_id=handbook.id, employee_id=emp.id),
                DocumentApprovalStep(document_id=pending.id, step_order=1, required_role="hr_admin", status=ApprovalStepStatus.PENDING)])
    db.commit()

    with engine.begin() as conn:
        first = run_all(conn)
    with engine.begin() as conn:
        second = run_all(conn)
    db.expire_all()

    assert first["versions_created"] == 4 and second["versions_created"] == 0 and second["access_rules"] == 0
    assert db.get(HrDocument, passport.id).employee_category_id == employee_category_by_key(db, 1, "identity_proof").id
    assert db.get(HrDocument, pending.id).source == "legacy_admin"
    assert db.get(HrDocument, handbook.id).scope == "company"
    v = db.query(HrDocumentVersion).filter_by(document_id=pending.id).one()
    assert (v.status, v.organization_id) == ("pending_approval", 1)
    assert db.get(HrDocument, passport.id).approved_version_id is not None
    assert db.get(HrDocument, pending.id).approved_version_id is None
    step = db.query(DocumentApprovalStep).filter_by(document_id=pending.id).one()
    assert step.organization_id == 1
    rules = {r.target_id: r for r in db.query(HrDocumentAccessRule).filter_by(target_type="document")}
    assert rules[handbook.id].visibility == "employees" and rules[handbook.id].employee_ids == [emp.id]
    assert rules[secret.id].visibility == "admin_only"          # nobody gains access through the migration
