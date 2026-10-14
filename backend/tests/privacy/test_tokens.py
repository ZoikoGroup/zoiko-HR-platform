"""T16 and D05: tokens between Zoiko products carry an audience and a scope; Zoiko HR accepts only its own."""
from datetime import datetime, timedelta, timezone

import pytest
from jose import jwt

from app.config import settings
from app.core.privacy import policy as p
from app.core.privacy.policy import Resource, authorize
from app.core.privacy.tokens import HR_AUDIENCE, ServiceTokenError, issue_service_token, service_context, verify_service_token
from app.core.security import create_access_token, decode_access_token


def _forge(aud, **extra):
    claims = {"sub": "svc:zoikotime", "typ": "service", "tenants": [1], "scope": ["employees:read"],
              "exp": datetime.now(timezone.utc) + timedelta(minutes=5), **extra}
    if aud is not None:
        claims["aud"] = aud
    return jwt.encode(claims, settings.SECRET_KEY, algorithm=settings.ALGORITHM)


def test_T16_a_token_for_another_product_is_refused_even_when_the_signing_key_is_shared():
    for aud in ("zoikotime", "zoiko-payroll", "zoiko-docs-pro", "zoikoid", "zoiko-one", None, ["zoiko-hr", "zoikotime"]):
        with pytest.raises(ServiceTokenError):
            verify_service_token(_forge(aud), resource="employees", action="read")


def test_T16_the_own_audience_and_scope_are_accepted_and_only_those():
    tok = issue_service_token("zoikotime", [1], ["employees:read"])
    subject = verify_service_token(tok, resource="employees", action="read")
    assert subject.plane == "SERVICE" and subject.tenant_ids == frozenset({1})
    with pytest.raises(ServiceTokenError):
        verify_service_token(tok, resource="employees", action="update")
    with pytest.raises(ServiceTokenError):
        verify_service_token(issue_service_token("zoikotime", [], ["employees:read"]))
    with pytest.raises(ServiceTokenError):
        verify_service_token("garbage")


def test_D05_a_role_never_travels_in_a_service_token_and_a_human_token_is_not_a_service_token():
    with pytest.raises(ServiceTokenError):
        verify_service_token(_forge(HR_AUDIENCE, role="super_admin"))
    human = create_access_token({"sub": "a@b.example", "role": "super_admin", "id": 1})
    with pytest.raises(ServiceTokenError):
        verify_service_token(human)
    assert decode_access_token(issue_service_token("zoikotime", [1], ["employees:read"])) is None, "a service token is not a signed-in person"


def test_D05_human_tokens_for_another_product_are_not_valid_here_but_older_tokens_still_are():
    assert decode_access_token(create_access_token({"sub": "a@b.example", "role": "admin", "id": 1}))["sub"] == "a@b.example"          # no aud: still fine
    assert decode_access_token(create_access_token({"sub": "a@b.example", "role": "admin", "id": 1, "aud": HR_AUDIENCE})) is not None
    assert decode_access_token(create_access_token({"sub": "a@b.example", "role": "admin", "id": 1, "aud": "zoikotime"})) is None


def test_T16_a_zoikotime_token_is_denied_by_every_hr_and_payroll_endpoint(world):
    tok = _forge("zoikotime")
    for url in ("/hr/employee-management/employees", "/hr/employees/me", "/hr/compensation/salary-structures", "/hr/admin/users"):
        r = world.client.get(url, headers={"Authorization": f"Bearer {tok}"})
        assert r.status_code == 401, (url, r.status_code)


def test_the_policy_agrees_for_service_subjects():
    subject = verify_service_token(issue_service_token("zoikotime", [1], ["employees:read"]), resource="employees", action="read")
    assert authorize(subject, "read", Resource("employees", 1), fields=["first_name"], context=service_context()).allow
    assert authorize(subject, "read", Resource("employees", 2), fields=["first_name"], context=service_context()).reason_code == p.NO_TENANT_MEMBERSHIP
    assert authorize(subject, "read", Resource("employees", 1), fields=["first_name"], context=p.Context(token_audience="zoikotime")).reason_code == p.AUDIENCE_DENIED
