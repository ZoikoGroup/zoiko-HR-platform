"""
tests/test_super_admin_bootstrap.py
------------------------------------
Regression coverage for the setup-key gate on POST /super-admin/bootstrap.
This is the only endpoint that can create the platform's first Super Admin,
so its gate must be provably closed when SUPER_ADMIN_SETUP_KEY is unset and
provably open only to the correct key.

Requires a real database (HR_DATABASE_URL) — the app's lifespan creates
tables on startup in development mode. Run against a disposable Postgres
instance, e.g. the `pgvector/pgvector:pg16` service used in CI.
"""

import pytest
from fastapi.testclient import TestClient

from app.config import settings
from app.main import app


@pytest.fixture
def client():
    with TestClient(app) as c:
        yield c


def test_bootstrap_disabled_when_setup_key_unset(client, monkeypatch):
    monkeypatch.setattr(settings, "SUPER_ADMIN_SETUP_KEY", "")
    response = client.post(
        "/super-admin/bootstrap",
        json={"setup_key": "anything", "email": "sa1@example.com", "password": "pw"},
    )
    assert response.status_code == 401


def test_bootstrap_rejects_wrong_key(client, monkeypatch):
    monkeypatch.setattr(settings, "SUPER_ADMIN_SETUP_KEY", "correct-key")
    response = client.post(
        "/super-admin/bootstrap",
        json={"setup_key": "wrong-key", "email": "sa2@example.com", "password": "pw"},
    )
    assert response.status_code == 401


def test_bootstrap_succeeds_with_correct_key(client, monkeypatch):
    monkeypatch.setattr(settings, "SUPER_ADMIN_SETUP_KEY", "correct-key")
    response = client.post(
        "/super-admin/bootstrap",
        json={"setup_key": "correct-key", "email": "sa3@example.com", "password": "pw"},
    )
    assert response.status_code == 200
    assert response.json()["created"] is True
