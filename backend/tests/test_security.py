"""
tests/test_security.py
-----------------------
Regression coverage for password hashing and JWT issuance/verification
(app/core/security.py) — the primitives every auth/RBAC check ultimately
relies on. Pure logic, no database required.
"""

from datetime import timedelta

from app.core.security import (
    create_access_token,
    decode_access_token,
    hash_password,
    verify_password,
)


def test_password_hash_roundtrip():
    hashed = hash_password("correct-password")
    assert hashed != "correct-password"
    assert verify_password("correct-password", hashed)


def test_password_hash_rejects_wrong_password():
    hashed = hash_password("correct-password")
    assert not verify_password("wrong-password", hashed)


def test_access_token_roundtrip():
    token = create_access_token({"sub": "user@example.com", "role": "employee"})
    payload = decode_access_token(token)
    assert payload is not None
    assert payload["sub"] == "user@example.com"
    assert payload["role"] == "employee"


def test_expired_token_is_rejected():
    token = create_access_token({"sub": "user@example.com"}, expires_delta=timedelta(seconds=-1))
    assert decode_access_token(token) is None


def test_tampered_token_is_rejected():
    token = create_access_token({"sub": "user@example.com"})
    tampered = token[:-1] + ("A" if token[-1] != "A" else "B")
    assert decode_access_token(tampered) is None
