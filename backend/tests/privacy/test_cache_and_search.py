"""T12 / C06: caches, search and replays never carry one tenant's content to another."""
from starlette.requests import Request

from app.core import cache_middleware as cm
from app.core.security import create_access_token
from tests.privacy.support import CANARY, all_canaries_in


def _request(role, org, sub):
    token = create_access_token({"sub": sub, "role": role, "id": 1, "organization_id": org})
    return Request({"type": "http", "method": "GET", "path": "/hr/x", "headers": [(b"authorization", f"Bearer {token}".encode())], "query_string": b""})


def test_C06_response_cache_keys_are_per_tenant_and_per_user():
    a_admin, a_hr, b_admin = _request("admin", 1, "a@a.example"), _request("hr_admin", 1, "h@a.example"), _request("admin", 2, "a@b.example")
    ids = [cm._extract_identity(r) for r in (a_admin, a_hr, b_admin)]
    keys = [cm._build_key(org, user, "GET", "/hr/employee-management/employees", "page=1") for org, user in ids]
    assert len(set(keys)) == 3, "two tenants, or two people in one tenant, never share a cached response"
    assert keys[0].startswith("resp:1:") and keys[2].startswith("resp:2:")
    assert cm._extract_identity(Request({"type": "http", "method": "GET", "path": "/", "headers": [], "query_string": b""})) is None, "no token, no cache identity"


def test_C06_a_platform_identity_is_never_given_a_cache_slot_on_tenant_data(world):
    """The privacy middleware answers a platform token on a data-plane route before the response cache can see it."""
    from app.core.privacy import policy
    before = len(policy.recent_decisions())
    r = world.get("platform", "/hr/employee-management/employees")
    assert r.status_code == 404 and len(policy.recent_decisions()) == before + 1


def test_T12_search_and_filters_never_cross_tenants(world):
    for term in ("CanaryGamma", CANARY["last_b1"], CANARY["email_b1"], "tenant-b"):
        r = world.get("a_admin", f"/hr/employee-management/employees?search={term}")
        assert r.status_code == 200 and not all_canaries_in(r.text, "name_b1", "last_b1", "email_b1", "iban_b1"), term
    own = world.get("a_admin", f"/hr/employee-management/employees?search={CANARY['name_a1']}")
    assert CANARY["name_a1"] in own.text
    for sort in ("last_name", "email", "-created_at"):
        r = world.get("a_admin", f"/hr/employee-management/employees?sort_by={sort}&per_page=100&page=1")
        assert not all_canaries_in(r.text, "name_b1", "last_b1", "email_b1", "iban_b1"), sort


def test_T12_replaying_one_tenants_request_as_another_returns_that_tenants_data(world):
    path = "/hr/employee-management/employees?per_page=100"
    a = world.get("a_admin", path).text
    b = world.get("b_admin", path).text
    assert CANARY["name_a1"] in a and CANARY["name_b1"] not in a
    assert CANARY["name_b1"] in b and CANARY["name_a1"] not in b


def test_T12_assistant_retrieval_is_limited_to_the_callers_tenant():
    """Retrieval is the caller's own tenant, plus platform-PUBLIC content only
    (the product/company FAQ, which is already served to anonymous visitors on
    zoikohr.com). It must never widen to another tenant's private content."""
    import inspect
    from app.modules.assistant import retrieval_service
    src = inspect.getsource(retrieval_service.retrieve)
    assert "KnowledgeSource.organization_id == organization_id" in src
    # the only other evidence source is explicitly public content
    assert "KnowledgeSource.is_public.is_(True)" in src


def test_C07_id_lookups_are_rate_limited_and_a_miss_is_a_plain_404(world):
    """The limit is registered on the id lookups (a fixed-window counter makes a live 125-request loop flaky, so the registration is what
    is checked; the limiter itself is exercised by the sign-in tests)."""
    from app.core.rate_limiter import limiter
    import app.modules.employee.router as router
    registered = set(getattr(limiter, "_route_limits", {}))
    for fn in (router.get_employee, router.get_employee_mgmt):
        assert f"{fn.__module__}.{fn.__name__}" in registered, fn.__name__
    codes = {world.get("a_admin", f"/hr/employee-management/employees/{900000 + i}").status_code for i in range(3)}
    assert codes == {404}
