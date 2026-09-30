"""ZHR-22: identity provider status is computed from real config, never faked."""

from app.modules.super_admin.router import compute_identity_providers


def _by_key(env):
    return {p["key"]: p for p in compute_identity_providers(env)}


def test_unconfigured_providers_are_not_configured():
    p = _by_key({})
    assert p["google"]["status"] == "Not configured"
    assert p["microsoft"]["status"] == "Not configured"
    assert p["google"]["client_id"] is None
    assert p["email"]["status"] == "Active"


def test_credentials_without_login_flow_is_never_active():
    p = _by_key({"GOOGLE_CLIENT_ID": "abcd1234efgh5678", "GOOGLE_CLIENT_SECRET": "s3cret"})
    assert p["google"]["status"] == "Configured, disabled"
    assert p["google"]["client_id"] == "abcd…5678"


def test_half_configured_is_not_configured():
    p = _by_key({"MICROSOFT_CLIENT_ID": "only-id-here"})
    assert p["microsoft"]["status"] == "Not configured"


def test_secret_never_returned():
    env = {"GOOGLE_CLIENT_ID": "abcd1234efgh5678", "GOOGLE_CLIENT_SECRET": "s3cret"}
    assert "s3cret" not in str(compute_identity_providers(env))
