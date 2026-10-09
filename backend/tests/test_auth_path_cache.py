"""
The cached auth path (get_current_user + app.core.org_access) keeps every security rule, including while a decision is
cached and right after it is invalidated:

  * a deleted organization is refused at once, even when another worker made the delete (no invalidation reached us);
  * an evaluation that ends while a decision is cached stops access on the dot, not a TTL later;
  * ending / converting an evaluation through the normal write paths takes effect on the very next request;
  * a token issued before a password change is refused; must_change_password is enforced;
  * a token minted for another organization is refused;
  * the hot path runs a single query.
"""
from datetime import datetime, timedelta
from types import SimpleNamespace

import pytest
from sqlalchemy import create_engine, event, text
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.core import org_access
from app.core.cache import invalidate_cache
from app.core.dependencies import get_current_user
from app.core.exceptions import UnauthorizedException, ZoikoException
from app.core.security import create_access_token
from app.database import Base
from app.modules.billing import service as billing_service
from app.modules.billing.models import BillingSubscription, EvaluationStatus, OrganizationEvaluation, SubscriptionStatus
from app.modules.employee import service as employee_service
from app.modules.employee.models import Employee
from app.modules.employee.schema import LoginRequest, RegisterRequest
from app.modules.super_admin.organization_service import DELETED_ORG_MESSAGE


@pytest.fixture
def env():
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine)
    db = Session()
    data = RegisterRequest(name="Ada Admin", email="ada@auth-cache.example", password="SecurePass123!",
                           organization="Auth Cache Co", plan_code="core", billing_cycle="monthly")
    org_id = employee_service.register_enterprise(db, data)["organization_id"]
    token = employee_service.login_employee(db, LoginRequest(email=data.email, password=data.password))["access_token"]
    invalidate_cache("org_access:")
    statements = []
    event.listen(engine, "before_cursor_execute", lambda *a: statements.append(a[2]))
    yield SimpleNamespace(db=db, org_id=org_id, token=token, email=data.email, statements=statements, engine=engine)
    db.close()
    engine.dispose()
    invalidate_cache("org_access:")


def _auth(env, token=None, path="/hr/employees"):
    env.db.expire_all()
    return get_current_user(request=SimpleNamespace(url=SimpleNamespace(path=path)), token=token or env.token, db=env.db)


def _evaluation(env):
    return env.db.query(OrganizationEvaluation).filter(OrganizationEvaluation.organization_id == env.org_id).first()


def test_hot_path_is_one_query(env):
    _auth(env)                                   # cold: fills the cache
    env.statements.clear()
    assert _auth(env).email == env.email
    assert len(env.statements) == 1, env.statements


def test_deleted_org_is_refused_even_when_the_cache_still_says_active(env):
    _auth(env)                                   # cached: not deleted
    # Another worker deletes the org: its write never invalidates OUR cache. Simulate with raw SQL (no ORM events).
    with env.engine.begin() as conn:
        conn.execute(text("UPDATE organizations SET deleted_at = :t WHERE id = :i"), {"t": datetime.utcnow(), "i": env.org_id})
    assert org_access.get_org_access(env.db, env.org_id).deleted is False      # the cache really is stale
    with pytest.raises(UnauthorizedException) as e:
        _auth(env)
    assert DELETED_ORG_MESSAGE in str(e.value.detail if hasattr(e.value, "detail") else e.value)


def test_evaluation_that_ends_while_cached_blocks_on_the_dot(env, monkeypatch):
    ends = _evaluation(env).evaluation_ends_at
    _auth(env)                                   # cached 'allowed', allowed_until = ends
    assert org_access.get_org_access(env.db, env.org_id).allowed_until == ends.isoformat()

    later = ends + timedelta(seconds=1)          # time moves past the end; no write happens at all

    class _Clock(datetime):
        @classmethod
        def utcnow(cls):
            return later

    monkeypatch.setattr(org_access, "datetime", _Clock)
    monkeypatch.setattr(billing_service, "datetime", _Clock)
    with pytest.raises(UnauthorizedException):
        _auth(env)


def test_ending_the_evaluation_takes_effect_on_the_next_request(env):
    _auth(env)                                   # cached 'allowed'
    billing_service.end_evaluation(env.db, _evaluation(env).id)   # normal write path -> commit -> invalidation
    with pytest.raises(UnauthorizedException):
        _auth(env)


def test_converting_takes_effect_on_the_next_request(env):
    billing_service.end_evaluation(env.db, _evaluation(env).id)
    with pytest.raises(UnauthorizedException):
        _auth(env)                               # cached 'blocked'
    sub = env.db.query(BillingSubscription).filter(BillingSubscription.organization_id == env.org_id).first()
    sub.status = SubscriptionStatus.ACTIVE
    env.db.commit()                              # invalidates
    assert _auth(env).email == env.email


def test_bulk_expiry_job_invalidates(env, monkeypatch):
    _auth(env)                                   # cached 'allowed'
    ev = _evaluation(env)
    with env.engine.begin() as conn:            # move the end into the past without ORM events
        conn.execute(text("UPDATE organization_evaluations SET evaluation_ends_at = :t WHERE id = :i"),
                     {"t": datetime.utcnow() - timedelta(minutes=1), "i": ev.id})
    billing_service.expire_overdue_evaluations(env.db)
    assert _evaluation(env).status == EvaluationStatus.EVALUATION_ENDED
    with pytest.raises(UnauthorizedException):
        _auth(env)


def test_password_change_invalidates_old_tokens_while_cached(env):
    _auth(env)
    user = env.db.query(Employee).filter(Employee.email == env.email).first()
    user.password_changed_at = datetime.utcnow() + timedelta(seconds=5)
    env.db.commit()
    with pytest.raises(UnauthorizedException):
        _auth(env)


def test_must_change_password_gate_while_cached(env):
    _auth(env)
    user = env.db.query(Employee).filter(Employee.email == env.email).first()
    user.must_change_password = True
    env.db.commit()
    with pytest.raises(ZoikoException) as e:
        _auth(env, path="/hr/employees")
    assert "PASSWORD_CHANGE_REQUIRED" in str(e.value.__dict__) or getattr(e.value, "status_code", 0) == 403
    assert _auth(env, path="/auth/change-password").email == env.email


def test_token_for_another_org_is_refused(env):
    _auth(env)
    forged = create_access_token({"sub": env.email, "organization_id": env.org_id + 999})
    with pytest.raises(UnauthorizedException):
        _auth(env, token=forged)
