"""ZHR-22: identity provider status is computed from real config, never faked.

The login-flow question is answered by reading the route table of the running
app, not by a maintained flag."""

from app.modules.super_admin.router import compute_identity_providers


def _by_key(env, **kw):
    return {p["key"]: p for p in compute_identity_providers(env, **kw)}


def test_unconfigured_providers_are_not_configured():
    p = _by_key({})
    assert p["google"]["status"] == "Not configured"
    assert "microsoft" not in p, "Google is the only single sign-on provider"
    assert p["google"]["client_id"] is None


def test_credentials_without_login_flow_is_never_active():
    p = _by_key({"GOOGLE_CLIENT_ID": "abcd1234efgh5678", "GOOGLE_CLIENT_SECRET": "s3cret"}, paths={"/auth/login"})
    assert p["google"]["status"] == "Configured, disabled"
    assert p["google"]["client_id"] == "abcd…5678"


def test_the_real_app_serves_google_sign_in_so_configured_credentials_report_active():
    p = _by_key({"GOOGLE_CLIENT_ID": "abcd1234efgh5678", "GOOGLE_CLIENT_SECRET": "s3cret"})
    assert p["google"]["status"] == "Active"
    assert "/auth/google/callback" in p["google"]["login_routes"]
    assert _by_key({})["google"]["status"] == "Not configured"


def test_served_login_route_makes_provider_active():
    """No flag to flip: registering the callback route is what turns it on."""
    paths = {"/auth/login", "/auth/google/start", "/auth/google/callback"}
    p = _by_key({"GOOGLE_CLIENT_ID": "abcd1234efgh5678", "GOOGLE_CLIENT_SECRET": "s3cret"}, paths=paths)
    assert p["google"]["status"] == "Active"
    assert p["google"]["login_routes"] == ["/auth/google/callback", "/auth/google/start"]


def test_unrelated_route_is_not_a_login_flow():
    p = _by_key({"GOOGLE_CLIENT_ID": "id-1234", "GOOGLE_CLIENT_SECRET": "s3cret"}, paths={"/super-admin/google-reports"})
    assert p["google"]["status"] == "Configured, disabled"
    assert p["google"]["login_routes"] == []


def test_builtin_email_reports_real_route():
    p = _by_key({}, paths={"/auth/login"})
    assert p["email"]["status"] == "Active"
    assert p["email"]["login_routes"] == ["/auth/login"]


def test_builtin_email_without_login_route_is_not_available():
    p = _by_key({}, paths=set())
    assert p["email"]["status"] == "Not available"


def test_half_configured_is_not_configured():
    p = _by_key({"GOOGLE_CLIENT_ID": "only-id-here"})
    assert p["google"]["status"] == "Not configured"


def test_secret_never_returned():
    env = {"GOOGLE_CLIENT_ID": "abcd1234efgh5678", "GOOGLE_CLIENT_SECRET": "s3cret"}
    assert "s3cret" not in str(compute_identity_providers(env))