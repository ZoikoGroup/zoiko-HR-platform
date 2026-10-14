"""Support-access data model, scope schema, risk and state machine (ZHR-PRIV-001 section 02, B03-B09, B11).

Pure unit tests (no HTTP): the pieces every other phase depends on must be right before any request can be made.
"""
from __future__ import annotations

import pathlib
import re
from datetime import datetime, timedelta

import pytest

from app.core.privacy import classification as cls
from app.modules.support_access import scopes as sc
from app.modules.support_access import state as st
from app.modules.support_access.models import (
    BreakGlassSession,
    RequestStatus,
    RevocationEvent,
    SupportAccessRequest,
    SupportGrant,
    TenantAuthoriser,
)

# Real, registry-backed examples (checked in the classification doc): a basic field, a financial field, a
# special-category field and a secret field.
BASIC = {"resources": ["employees"], "fields": {"employees": ["first_name"]}, "actions": ["read"]}
FINANCIAL = {"resources": ["employee_profiles"], "fields": {"employee_profiles": ["bank_account"]}, "actions": ["read"]}
SPECIAL = {"resources": ["leave_requests"], "fields": {"leave_requests": ["reason"]}, "actions": ["read"]}


def _scope(**over):
    base = {**BASIC, "record_ids": [], "entity_ids": [], "department_ids": [], "jurisdictions": []}
    base.update(over)
    return base


# ── scope schema ─────────────────────────────────────────────────────────────────────────────────────────────────────
def test_rejects_unknown_top_level_key():
    with pytest.raises(sc.ScopeError):
        sc.validate_scope(_scope(all_records=True))


def test_rejects_unknown_resource():
    with pytest.raises(sc.ScopeError):
        sc.validate_scope(_scope(resources=["not_a_table"], fields={"not_a_table": ["x"]}))


def test_rejects_unknown_field():
    with pytest.raises(sc.ScopeError):
        sc.validate_scope(_scope(fields={"employees": ["not_a_column"]}))


def test_rejects_secret_field():
    with pytest.raises(sc.ScopeError):
        sc.validate_scope(_scope(fields={"employees": ["hashed_password"]}))


def test_fields_must_cover_every_resource():
    with pytest.raises(sc.ScopeError):
        sc.validate_scope(_scope(resources=["employees", "leave_requests"], fields={"employees": ["first_name"]}))


def test_rejects_empty_actions_and_resources():
    with pytest.raises(sc.ScopeError):
        sc.validate_scope(_scope(actions=[]))
    with pytest.raises(sc.ScopeError):
        sc.validate_scope(_scope(resources=[], fields={}))


def test_update_needs_data_correction_purpose():
    with pytest.raises(sc.ScopeError):
        sc.validate_scope(_scope(actions=["update"]))
    out = sc.validate_scope(_scope(actions=["update"]), purpose_category="DATA_CORRECTION_ASSIST")
    assert out["actions"] == ["update"]


def test_impersonate_can_never_be_requested():
    with pytest.raises(sc.ScopeError):
        sc.validate_scope(_scope(actions=["impersonate"]))


def test_empty_record_ids_means_no_records_not_all():
    out = sc.validate_scope(_scope(record_ids=[]))
    assert out["record_ids"] == []


def test_canonical_scope_is_sorted_and_deduped():
    out = sc.validate_scope(_scope(record_ids=[3, 1, 3, 2]))
    assert out["record_ids"] == [1, 2, 3]


def test_duration_bounds():
    assert sc.validate_duration(30) == 30
    assert sc.validate_duration("120") == 120
    with pytest.raises(sc.ScopeError):
        sc.validate_duration(0)
    with pytest.raises(sc.ScopeError):
        sc.validate_duration(121)


# ── narrowing and intersection ──────────────────────────────────────────────────────────────────────────────────────
def test_narrowing_is_allowed():
    req = sc.validate_scope(_scope(record_ids=[1, 2, 3], fields={"employees": ["first_name", "job_title"]}, actions=["read", "list"]))
    narrowed = sc.assert_narrowing(req, {**req, "record_ids": [2], "fields": {"employees": ["first_name"]}, "actions": ["read"]})
    assert narrowed["record_ids"] == [2]
    assert narrowed["fields"]["employees"] == ["first_name"]
    assert narrowed["actions"] == ["read"]


@pytest.mark.parametrize(
    "change",
    [
        {"record_ids": [1, 2, 3, 4]},                    # a record not requested
        {"resources": ["employees", "leave_requests"]},   # a resource not requested
        {"actions": ["read", "export"]},                  # an action not requested
        {"fields": {"employees": ["first_name", "job_title"]}},  # a field not requested
    ],
)
def test_widening_is_rejected(change):
    req = sc.validate_scope(_scope(record_ids=[1, 2, 3], fields={"employees": ["first_name"]}, actions=["read"]))
    approved = {**req, **change}
    if "resources" in change:
        approved["fields"] = {**req["fields"], "leave_requests": ["reason"]}
    with pytest.raises(sc.ScopeError):
        sc.assert_narrowing(req, approved)


def test_intersection_is_what_everyone_allowed():
    req = sc.validate_scope(_scope(record_ids=[1, 2, 3], fields={"employees": ["first_name", "job_title"]}, actions=["read", "list"]))
    a1 = sc.assert_narrowing(req, {**req, "record_ids": [1, 2], "fields": {"employees": ["first_name"]}, "actions": ["read"]})
    a2 = sc.assert_narrowing(req, {**req, "record_ids": [2, 3], "fields": {"employees": ["first_name", "job_title"]}, "actions": ["read"]})
    eff = sc.intersect([req, a1, a2])
    assert eff["record_ids"] == [2]
    assert eff["fields"]["employees"] == ["first_name"]
    assert eff["actions"] == ["read"]


# ── risk (computed server-side) ──────────────────────────────────────────────────────────────────────────────────────
def test_risk_standard_for_basic_read():
    assert sc.compute_risk(sc.validate_scope(BASIC)) == sc.RiskLevel.STANDARD


def test_risk_high_on_financial_field():
    assert sc.compute_risk(sc.validate_scope(FINANCIAL)) == sc.RiskLevel.HIGH


def test_risk_high_on_special_category_field():
    assert sc.compute_risk(sc.validate_scope(SPECIAL)) == sc.RiskLevel.HIGH


def test_risk_high_on_export_action():
    assert sc.compute_risk(sc.validate_scope(_scope(actions=["read", "export"]))) == sc.RiskLevel.HIGH


def test_risk_high_on_large_record_set():
    s = sc.validate_scope(_scope(record_ids=list(range(1, 40))))
    assert sc.compute_risk(s, record_threshold=25) == sc.RiskLevel.HIGH


def test_approval_routing():
    assert sc.requires_security_approval(sc.validate_scope(FINANCIAL)) is True
    assert sc.requires_privacy_approval(sc.validate_scope(SPECIAL)) is True
    assert sc.requires_security_approval(sc.validate_scope(SPECIAL)) is False
    assert sc.requires_privacy_approval(sc.validate_scope(BASIC)) is False


def test_summary_has_no_values_only_shape():
    s = sc.validate_scope(_scope(record_ids=[7, 8]))
    out = sc.summary(s)
    assert out["record_count"] == 2
    assert "first_name" not in str(out)          # a field NAME may appear; never a value
    assert set(out) == {"resources", "record_count", "department_count", "entity_count", "categories", "actions"}


# ── state machine ────────────────────────────────────────────────────────────────────────────────────────────────────
def test_state_machine_allows_the_happy_path():
    req = SupportAccessRequest(status=RequestStatus.DRAFT.value)
    st.transition(req, RequestStatus.PENDING_TENANT.value)
    st.transition(req, RequestStatus.PENDING_INDEPENDENT.value)
    st.transition(req, RequestStatus.APPROVED.value)
    st.transition(req, RequestStatus.ACTIVE.value)
    st.transition(req, RequestStatus.CLOSED.value)
    assert req.status == RequestStatus.CLOSED.value


def test_state_machine_refuses_the_shortcut():
    req = SupportAccessRequest(status=RequestStatus.DRAFT.value)
    with pytest.raises(st.TransitionError):
        st.transition(req, RequestStatus.ACTIVE.value)
    with pytest.raises(st.TransitionError):
        st.transition(req, RequestStatus.APPROVED.value)


def test_terminal_states_are_final():
    for terminal in (RequestStatus.CLOSED, RequestStatus.EXPIRED, RequestStatus.REVOKED, RequestStatus.REJECTED, RequestStatus.CANCELLED):
        req = SupportAccessRequest(status=terminal.value)
        for target in RequestStatus:
            if target is terminal:
                continue
            with pytest.raises(st.TransitionError):
                st.transition(req, target.value)


def test_status_is_only_written_by_the_state_module():
    """The only place that assigns a support-request status is the state machine."""
    root = pathlib.Path(__file__).resolve().parents[2] / "app" / "modules" / "support_access"
    offenders = []
    for path in root.glob("*.py"):
        if path.name == "state.py":
            continue
        for i, line in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
            if re.search(r"\.status\s*=(?!=)", line):
                offenders.append(f"{path.name}:{i}")
    assert offenders == [], f"status assigned outside the state machine: {offenders}"


# ── model registration and classification ───────────────────────────────────────────────────────────────────────────
def test_support_tables_are_registered_and_classified(world):
    from app.database import Base
    names = {t for t in Base.metadata.tables if t.startswith("support_")}
    assert {
        "support_tenant_authorisers",
        "support_access_requests",
        "support_approvals",
        "support_grants",
        "support_breakglass_sessions",
        "support_revocation_events",
    } <= names
    for name in names:
        assert cls.table_default(name) != cls.UNCLASSIFIED, name


def test_models_round_trip_on_sqlite(world):
    db = world.db
    authoriser = TenantAuthoriser(tenant_id=1, user_id=world.u["a_admin"].id, scope_limits=["PERSONAL_BASIC"])
    req = SupportAccessRequest(
        reference="SAR-2026-000001", tenant_id=1, requester_person_id=world.u["platform"].id,
        ticket_reference="T-1", purpose="Investigate a reported sync error", purpose_category="TROUBLESHOOTING",
        risk_level="STANDARD", status="DRAFT", requested_scope=BASIC, requested_duration_minutes=30,
    )
    db.add_all([authoriser, req])
    db.commit()
    grant = SupportGrant(
        request_id=req.id, tenant_id=1, grantee_person_id=world.u["platform"].id, effective_scope=BASIC,
        expires_at=datetime.utcnow() + timedelta(minutes=30),
        policy_version="test", token_jti="jti-1",
    )
    db.add(grant)
    db.commit()
    assert grant.id and len(grant.id) == 36
    assert grant.revocation_version == 1
    db.add(RevocationEvent(target_type="GRANT", target_ref=grant.id, actor_person_id=world.u["platform"].id, reason="expired"))
    db.add(BreakGlassSession(incident_reference="INC-1", reason="prod down", tenant_id=1,
                             initiator_person_id=world.u["platform"].id, scope=BASIC))
    db.commit()
    assert db.query(SupportAccessRequest).count() == 1
