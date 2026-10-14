"""The policy decision point and the classification registry.

A03 / G07  every field of every tenant-data table is classified; a new one cannot ship without a decision.
A05 / T17  an error, an unknown resource, an unclassified field or a missing tenant is a DENY.
A07 / E02 / E06 / E07 / E09  roles are separated; field groups are masked; actions never imply each other.
T05  a role without finance permission asking for bank / medical fields gets them masked, never raw.
T16  a token minted for another product is not a Zoiko HR token.
T13  the AI agent has no scope of its own.
"""
import pytest

from app.core.privacy import classification as c
from app.core.privacy import policy as p
from app.core.privacy.context import PLATFORM, SERVICE, TENANT
from app.core.privacy.policy import AI, Context, Resource, Role, Subject, authorize
from app.database import Base


# ── classification ───────────────────────────────────────────────────────────────────────────────────────────────────
def _models():
    import app.main  # noqa: F401  (imports every model)
    return Base.metadata


def test_A03_every_tenant_table_and_column_is_classified():
    problems = c.audit(_models())
    assert problems == [], "\n".join(problems)


def test_G07_a_new_table_or_an_under_classified_name_fails_the_audit():
    from sqlalchemy import Column, Integer, MetaData, String, Table
    md = MetaData()
    Table("brand_new_hr_thing", md, Column("id", Integer, primary_key=True), Column("organization_id", Integer), Column("whatever", String))
    assert any("brand_new_hr_thing: table is not classified" in x for x in c.audit(md))
    md2 = MetaData()
    Table("departments", md2, Column("id", Integer, primary_key=True), Column("organization_id", Integer), Column("bank_iban", String))
    assert c.classify("departments", "bank_iban") == c.Level.FINANCIAL, "a sensitive NAME lifts a column above its table default"


def test_A03_known_fields_have_the_right_level():
    expect = {("employees", "first_name"): "PERSONAL_BASIC", ("employees", "basic_salary"): "FINANCIAL", ("employees", "hashed_password"): "SECRET",
              ("employee_profiles", "bank_account"): "FINANCIAL", ("employee_profiles", "pan_number"): "FINANCIAL", ("employee_profiles", "blood_group"): "PERSONAL_CONFIDENTIAL",
              ("leave_requests", "reason"): "SPECIAL_CATEGORY", ("recruitment_candidates", "email"): "TENANT_CUSTOMER", ("hr_documents", "file_path"): "TENANT_FILE",
              ("billing_subscriptions", "plan_code"): "PLATFORM_META", ("compliance_violations", "violation"): "SPECIAL_CATEGORY"}
    for (t, col), level in expect.items():
        assert c.classify(t, col).value == level, (t, col)


def test_helpers_sensitivity_of_and_fields_at_or_below():
    from app.modules.employee.models import Employee
    assert c.sensitivity_of(Employee, "ctc") == c.Level.FINANCIAL
    low = set(c.fields_at_or_below(Employee, c.Level.PERSONAL_BASIC))
    assert "first_name" in low and "email" in low and "basic_salary" not in low and "hashed_password" not in low and "date_of_birth" not in low
    assert c.rank(c.Level.SPECIAL_CATEGORY) > c.rank(c.Level.FINANCIAL) > c.rank(c.Level.PERSONAL_BASIC)


def test_the_generated_classification_doc_is_in_sync():
    import pathlib
    doc = pathlib.Path(__file__).resolve().parents[3] / "docs" / "privacy" / "data_classification.md"
    assert doc.exists(), "run scripts/privacy_classification_doc.py"
    assert doc.read_text(encoding="utf-8") == c.render_markdown(_models()), "docs/privacy/data_classification.md is stale: run scripts/privacy_classification_doc.py"


# ── subjects ─────────────────────────────────────────────────────────────────────────────────────────────────────────
A, B = 1, 2


def tenant(role, tid=A, pid=10, **kw):
    return Subject(actor_id=pid, plane=TENANT, roles=frozenset({role}), tenant_ids=frozenset({tid}), person_id=pid, **kw)


PLATFORM_SUBJECT = Subject(actor_id=99, plane=PLATFORM, roles=frozenset({Role.PLATFORM_ADMIN}), person_id=99)
EMP = Resource("employees", A, entity_id=11, owner_id=11)
PROFILE = Resource("employee_profiles", A, entity_id=11, owner_id=11)
FIN_FIELDS = ("bank_account", "pan_number")


@pytest.fixture(autouse=True)
def _quiet_sink():
    prior = p.set_audit_sink(p.AuditSink())
    prior_emit = p.AuditSink.emit
    p.AuditSink.emit = lambda self, e: None
    yield
    p.AuditSink.emit = prior_emit
    p.set_audit_sink(prior)


# ── A01 / D02: platform ──────────────────────────────────────────────────────────────────────────────────────────────
@pytest.mark.parametrize("action", sorted(p.ACTIONS - {"impersonate"}))
@pytest.mark.parametrize("resource", [EMP, PROFILE, Resource("employee_compensations", A), Resource("hr_documents", A), Resource("recruitment_candidates", A),
                                      Resource("leave_requests", A), Resource("super_admin_expense_budgets", A)])
def test_A01_the_platform_is_denied_every_action_on_every_data_plane_resource(action, resource):
    d = authorize(PLATFORM_SUBJECT, action, resource)
    assert not d.allow and d.reason_code in (p.PLATFORM_DATA_PLANE_DENIED, p.FIELD_CLASSIFICATION_DENIED) and d.allowed_fields == ()


def test_A01_the_platform_may_read_control_plane_tables_only_through_platform_fields():
    d = authorize(PLATFORM_SUBJECT, "read", Resource("billing_subscriptions", A))
    assert d.allow and "plan_code" in d.allowed_fields
    assert not authorize(PLATFORM_SUBJECT, "export", Resource("billing_subscriptions", A)).allow
    assert not authorize(PLATFORM_SUBJECT, "read", Resource("employees", A), fields=["email"]).allow
    assert not authorize(PLATFORM_SUBJECT, "count", Resource("employees", A)).allow, "even a count of identifiable people is refused"


def test_impersonation_is_denied_for_everyone():
    for s in (PLATFORM_SUBJECT, tenant(Role.TENANT_ADMIN), tenant(Role.EMPLOYEE)):
        assert authorize(s, "impersonate", EMP).reason_code == p.IMPERSONATION_DENIED


def test_the_support_grant_hook_denies_today():
    assert p._evaluate_support_grant(PLATFORM_SUBJECT, "read", EMP, [], Context()) is None
    assert not authorize(PLATFORM_SUBJECT, "read", EMP).allow


# ── C01: tenancy ─────────────────────────────────────────────────────────────────────────────────────────────────────
def test_C01_a_tenant_subject_cannot_touch_another_tenant_whatever_their_role():
    for role in (Role.TENANT_OWNER, Role.TENANT_ADMIN, Role.HR_MANAGER, Role.PAYROLL_ADMIN, Role.MANAGER, Role.EMPLOYEE):
        d = authorize(tenant(role, tid=A), "read", Resource("employees", B, entity_id=11, owner_id=11))
        assert not d.allow and d.reason_code == p.NO_TENANT_MEMBERSHIP, role


# ── A07 / E02 / E06 / E09: roles, fields, actions ────────────────────────────────────────────────────────────────────
def test_T05_a_role_without_finance_permission_gets_bank_fields_masked_never_raw():
    mgr = tenant(Role.MANAGER, report_ids=frozenset({11}))
    d = authorize(mgr, "read", PROFILE, fields=["emergency_contact_name", *FIN_FIELDS, "religion"])
    assert not d.allow or (set(FIN_FIELDS) <= set(d.masked_fields) and not set(FIN_FIELDS) & set(d.allowed_fields))
    d2 = authorize(mgr, "read", EMP, fields=["first_name", "basic_salary", "ctc", "date_of_birth"])
    assert d2.allow and set(d2.allowed_fields) == {"first_name", "date_of_birth"} and set(d2.masked_fields) == {"basic_salary", "ctc"}
    data = {"first_name": "X", "basic_salary": 5, "ctc": 6, "date_of_birth": "d", "unnamed": 1}
    out = p.apply_decision(data, d2)
    assert out["first_name"] == "X" and out["basic_salary"] == p.MASK and out["ctc"] == p.MASK and "unnamed" not in out
    assert sorted(out["redacted"]) == ["basic_salary", "ctc"]
    assert 5 not in out.values()


def test_E02_special_category_needs_an_explicit_role():
    payroll = tenant(Role.PAYROLL_ADMIN)
    d = authorize(payroll, "read", Resource("leave_requests", A, entity_id=1, owner_id=11), fields=["reason", "days"])
    assert "reason" not in d.allowed_fields
    admin = authorize(tenant(Role.TENANT_ADMIN), "read", Resource("leave_requests", A), fields=["reason", "days"])
    assert admin.allow and "reason" in admin.allowed_fields


def test_E06_read_never_implies_export_download_print_or_update():
    mgr = tenant(Role.MANAGER, report_ids=frozenset({11}))
    assert authorize(mgr, "read", EMP, fields=["first_name"]).allow
    for action in ("export", "download", "print", "update", "delete", "bulk_read", "create"):
        assert not authorize(mgr, action, EMP, fields=["first_name"]).allow, action
    emp = tenant(Role.EMPLOYEE, pid=11)
    assert authorize(emp, "read", EMP).allow and authorize(emp, "update", EMP).allow and not authorize(emp, "export", EMP).allow


def test_E07_abac_scopes_a_manager_to_reports_an_employee_to_self_a_delegate_to_departments():
    mgr = tenant(Role.MANAGER, report_ids=frozenset({11, 12}))
    assert authorize(mgr, "read", Resource("employees", A, entity_id=12, owner_id=12), fields=["date_of_birth"]).allow
    assert not authorize(mgr, "read", Resource("employees", A, entity_id=13, owner_id=13), fields=["date_of_birth"]).allow
    # the company directory (name, title, department) is readable by every member of the organization: written down, not implied
    assert authorize(mgr, "read", Resource("employees", A, entity_id=13, owner_id=13), fields=["first_name", "job_title"]).allow
    emp = tenant(Role.EMPLOYEE, pid=11)
    assert authorize(emp, "read", Resource("employees", A, entity_id=11, owner_id=11)).allow
    assert not authorize(emp, "read", Resource("employees", A, entity_id=12, owner_id=12)).allow
    dele = tenant(Role.AGENCY_DELEGATE, department_ids=frozenset({5}))
    assert authorize(dele, "read", Resource("employees", A, entity_id=12, owner_id=12, department_id=5), fields=["work_email"]).allow
    assert not authorize(dele, "read", Resource("employees", A, entity_id=12, owner_id=12, department_id=6), fields=["work_email"]).allow
    assert not authorize(dele, "read", Resource("employees", A, entity_id=12, owner_id=12, department_id=5), fields=["basic_salary"]).allow


def test_A07_billing_admin_has_no_people_data():
    b = tenant(Role.BILLING_ADMIN)
    assert not authorize(b, "read", EMP, fields=["first_name"]).allow
    assert authorize(b, "read", Resource("billing_subscriptions", A)).allow


def test_the_tenant_admin_keeps_full_access_to_their_own_tenant():
    admin = tenant(Role.TENANT_ADMIN)
    d = authorize(admin, "read", PROFILE)
    assert d.allow and "bank_account" in d.allowed_fields and not d.masked_fields
    e = authorize(admin, "read", EMP)
    assert e.allow and "basic_salary" in e.allowed_fields and "hashed_password" not in e.allowed_fields and "hashed_password" in e.masked_fields, "secrets are never returned, to anyone"
    for action in ("list", "read", "search", "count", "create", "update", "delete", "approve", "export", "download", "print", "bulk_read"):
        assert authorize(admin, action, EMP, fields=["first_name"]).allow, action


# ── A05 / T17: fail closed ───────────────────────────────────────────────────────────────────────────────────────────
def test_T17_unknown_resource_unknown_action_unclassified_field_missing_tenant_all_deny():
    admin = tenant(Role.TENANT_ADMIN)
    assert authorize(admin, "read", Resource("not_a_table", A)).reason_code == p.UNKNOWN_RESOURCE
    assert authorize(admin, "teleport", EMP).reason_code == p.UNKNOWN_ACTION
    assert authorize(admin, "read", EMP, fields=["a_field_nobody_classified"]).reason_code == p.UNCLASSIFIED_FIELD
    assert authorize(admin, "read", Resource("employees", None)).reason_code == p.NO_TENANT_MEMBERSHIP
    assert authorize(Subject(actor_id=1, plane="WEIRD"), "read", EMP).allow is False
    assert authorize(None, "read", EMP).reason_code == p.BAD_SUBJECT
    assert authorize(admin, "read", None).reason_code == p.BAD_SUBJECT
    assert authorize(Subject(actor_id=1, plane=TENANT, roles=frozenset({"made_up_role"}), tenant_ids=frozenset({A})), "read", EMP).allow is False


def test_T17_an_exception_inside_the_policy_is_a_deny_with_an_alert(monkeypatch, caplog):
    def boom(*a, **k):
        raise RuntimeError("simulated policy bug")
    monkeypatch.setattr(p, "_tenant", boom)
    with caplog.at_level("ERROR", logger="zoiko.privacy"):
        d = authorize(tenant(Role.TENANT_ADMIN), "read", EMP)
    assert not d.allow and d.reason_code == p.POLICY_ERROR
    assert any("ALERT" in r.message for r in caplog.records)
    assert "simulated policy bug" not in d.reason_code


def test_a_failing_audit_sink_never_turns_a_deny_into_an_allow_or_a_crash():
    class Broken(p.AuditSink):
        def emit(self, event):
            raise OSError("disk full")
    prior = p.set_audit_sink(Broken())
    try:
        assert not authorize(PLATFORM_SUBJECT, "read", EMP).allow
        assert authorize(tenant(Role.TENANT_ADMIN), "read", PROFILE).allow
    finally:
        p.set_audit_sink(prior)


def test_every_decision_carries_the_policy_version_and_denies_are_recorded_without_values():
    events = []
    class Capture(p.AuditSink):
        def emit(self, event):
            events.append(event)
    p.AuditSink.emit = Capture.emit            # noqa: the autouse fixture restores it
    d = authorize(PLATFORM_SUBJECT, "read", EMP)
    assert d.policy_version == p.POLICY_VERSION
    authorize(tenant(Role.TENANT_ADMIN), "read", PROFILE)           # an ALLOW above PERSONAL_BASIC is recorded too
    authorize(tenant(Role.TENANT_ADMIN), "read", Resource("employees", A), fields=["first_name"])   # BASIC allow is not
    assert [e["decision"] for e in events] == ["DENY", "ALLOW"]
    assert all(set(e) >= {"actor_id", "tenant_id", "action", "resource_class", "decision", "reason", "policy_version", "correlation_id"} for e in events)
    assert not any("bank_account" in str(e) for e in events)


# ── T16 / T13 ────────────────────────────────────────────────────────────────────────────────────────────────────────
def test_T16_a_token_for_another_product_is_not_a_zoiko_hr_token():
    svc = Subject(actor_id=5, plane=SERVICE, tenant_ids=frozenset({A}), service_scopes=frozenset({"employees:read"}))
    assert authorize(svc, "read", EMP, fields=["first_name"], context=Context(source="integration", token_audience="zoiko-hr")).allow
    for aud in ("zoikotime", "zoiko-payroll", "zoiko-docs-pro", None, "zoiko-hr.evil"):
        assert authorize(svc, "read", EMP, fields=["first_name"], context=Context(source="integration", token_audience=aud)).reason_code == p.AUDIENCE_DENIED, aud
    assert authorize(svc, "update", EMP, fields=["first_name"], context=Context(token_audience="zoiko-hr")).reason_code == p.SCOPE_NOT_PERMITTED
    assert authorize(svc, "read", Resource("employees", B), fields=["first_name"], context=Context(token_audience="zoiko-hr")).reason_code == p.NO_TENANT_MEMBERSHIP


def test_T13_an_ai_agent_is_exactly_the_person_who_called_it():
    emp = tenant(Role.EMPLOYEE, pid=11)
    agent = Subject(actor_id=0, plane=AI, on_behalf_of=emp)
    assert authorize(agent, "read", Resource("employees", A, owner_id=11)).allow
    d = authorize(agent, "list", Resource("employee_compensations", A), fields=["effective_date"])
    assert not d.allow, "'list all salaries' is refused: an employee cannot list"
    assert authorize(Subject(actor_id=0, plane=AI), "read", EMP).reason_code == p.AI_NO_CALLER
    platform_agent = Subject(actor_id=0, plane=AI, on_behalf_of=PLATFORM_SUBJECT)
    assert not authorize(platform_agent, "read", EMP).allow, "Mira cannot be used against tenant data by a platform user"
    nested = Subject(actor_id=0, plane=AI, on_behalf_of=Subject(actor_id=0, plane=AI, on_behalf_of=emp))
    assert authorize(nested, "read", EMP).reason_code == p.AI_NO_CALLER
    assert not authorize(Subject(actor_id=0, plane=AI, on_behalf_of=emp), "read", Resource("employees", B, owner_id=11)).allow


def test_subject_for_user_takes_the_tenant_from_the_account_only():
    class U:
        id, organization_id = 7, 3
        role = type("R", (), {"value": "hr_admin"})()
    s = p.subject_for_user(U())
    assert s.plane == TENANT and s.tenant_ids == frozenset({3}) and Role.HR_MANAGER in s.roles
    class SA:
        id, organization_id = 1, None
        role = type("R", (), {"value": "super_admin"})()
    ps = p.subject_for_user(SA())
    assert ps.plane == PLATFORM and ps.tenant_ids == frozenset()
    class Odd:
        id, organization_id = 2, 3
        role = "nonsense"
    assert p.subject_for_user(Odd()).roles == frozenset()
