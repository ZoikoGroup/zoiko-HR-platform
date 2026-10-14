"""The immutable, tamper-evident audit chain (ZHR-PRIV-001 Phase 9; T13-T17).

Every support-access action leaves a link that commits to the one before it. An edit or a deletion, even one made
directly in SQL, breaks the chain and `verify_chain` names the first row that no longer matches.
"""
from __future__ import annotations

import sqlalchemy as sa

from app.modules.support_access import audit
from tests.privacy.test_support_access_flow import (
    ENFORCED,
    PLATFORM,
    SUPPORT_COOKIE,
    _grant_employee_read,
    mfa_token,
)


def _count(world) -> int:
    return world.db.query(audit.PrivacyAuditEvent).count()


def test_T13_a_full_flow_leaves_an_intact_chain(world):
    plt, _rid, cookie = _grant_employee_read(world)
    emp = world.u["a_emp1"].id
    assert world.client.get(f"{ENFORCED}/tenants/1/employees/{emp}", headers=plt, cookies={SUPPORT_COOKIE: cookie}).status_code == 200

    assert _count(world) > 0
    ok, first_bad = audit.verify_chain(world.db)
    assert ok is True and first_bad is None


def test_T14_an_edited_row_breaks_the_chain(world):
    _grant_employee_read(world)
    rows = world.db.query(audit.PrivacyAuditEvent).order_by(audit.PrivacyAuditEvent.id.asc()).all()
    assert len(rows) >= 2
    target = rows[1].id
    # a raw edit, as an attacker with UPDATE on the table would make
    world.db.execute(sa.text("UPDATE privacy_audit_events SET event_type = 'TAMPERED' WHERE id = :i"), {"i": target})
    world.db.commit()
    world.db.expire_all()

    ok, first_bad = audit.verify_chain(world.db)
    assert ok is False
    assert first_bad == target


def test_T15_a_deleted_row_breaks_the_chain(world):
    _grant_employee_read(world)
    rows = world.db.query(audit.PrivacyAuditEvent).order_by(audit.PrivacyAuditEvent.id.asc()).all()
    assert len(rows) >= 3
    world.db.execute(sa.text("DELETE FROM privacy_audit_events WHERE id = :i"), {"i": rows[0].id})
    world.db.commit()
    world.db.expire_all()

    ok, _first_bad = audit.verify_chain(world.db)
    assert ok is False


def test_T16_a_denied_read_is_audited(world):
    plt, _rid, cookie = _grant_employee_read(world)
    before = world.db.query(audit.PrivacyAuditEvent).filter(audit.PrivacyAuditEvent.event_type == "ACCESS_DENIED").count()
    # a record outside the granted list
    denied = world.client.get(f"{ENFORCED}/tenants/1/employees/{world.u['a_emp2'].id}", headers=plt, cookies={SUPPORT_COOKIE: cookie})
    assert denied.status_code == 403
    after = world.db.query(audit.PrivacyAuditEvent).filter(audit.PrivacyAuditEvent.event_type == "ACCESS_DENIED").count()
    assert after == before + 1
    ok, _ = audit.verify_chain(world.db)
    assert ok is True


def test_T17_the_platform_can_verify_the_chain(world):
    _grant_employee_read(world)
    r = world.client.get(f"{PLATFORM}/audit/verify", headers=mfa_token(world.u["platform"]))
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["ok"] is True
    assert body["count"] >= 1
    assert body["head_hash"] != body["genesis"]


def test_T18_a_tenant_user_may_not_read_the_platform_audit_view(world):
    r = world.client.get(f"{PLATFORM}/audit/verify", headers=mfa_token(world.u["a_admin"]))
    assert r.status_code in (403, 404)
