"""Per-request DB stats (app/core/query_stats.py): the ContextVar holding the counter must follow a request into the
threadpool of a sync endpoint (Starlette copies the context), two requests must never pollute each other's counts, and
pool "checkout" events are attributed to the same per-request object. Slowest-statement tracking too."""

from contextlib import contextmanager

import pytest
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.core import query_stats as qs
from app.database import Base


@pytest.fixture
def stats_on(monkeypatch):
    monkeypatch.setattr(qs.settings, "LOG_QUERY_STATS", True)
    monkeypatch.setattr(qs.settings, "LOG_QUERY_SQL", True)
    assert qs.install()
    yield
    # Listeners stay attached (never detached) but inert while the flag is
    # off; turn it back so later tests pay nothing.
    monkeypatch.setattr(qs.settings, "LOG_QUERY_STATS", False)


@contextmanager
def _client():
    eng = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(eng)
    Session = sessionmaker(bind=eng)

    app = FastAPI()
    app.add_middleware(qs.QueryStatsMiddleware)

    # Sync endpoint -> runs in the threadpool; its DB queries must land in the
    # same per-request QueryStats the middleware started.
    def pulse(request: Request):
        with Session() as db:
            db.execute(text("SELECT 1"))
            db.execute(text("SELECT 2"))
        stats = qs.current()
        return JSONResponse(
            {"count": stats.count, "checkouts": stats.checkouts,
             "db_seconds": round(stats.db_seconds, 6), "has_started": bool(stats)}
        )

    app.get("/pulse")(pulse)
    with TestClient(app) as client:
        yield client


def test_counts_follow_request_into_threadpool_with_isolation(stats_on):
    with _client() as client:
        r1 = client.get("/pulse")
        assert r1.status_code == 200
        body1 = r1.json()
        assert body1["has_started"] is True
        assert body1["count"] == 2
        assert body1["checkouts"] == 1
        assert body1["db_seconds"] > 0

        # A second request starts from zero again — no cross-request leakage.
        r2 = client.get("/pulse")
        assert r2.status_code == 200
        body2 = r2.json()
        assert body2["count"] == 2
        assert body2["checkouts"] == 1


def test_slowest_statement_is_captured_and_truncated(stats_on):
    # Build the schema BEFORE starting a stats context so DDL (hundreds of
    # CREATE TABLEs for the full Base) does not pollute the request's counts.
    eng = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(eng)
    qs.start()
    stats = qs.current()
    with sessionmaker(bind=eng)() as db:
        db.execute(text("SELECT 1"))
        db.execute(text("SELECT 2"))
    assert stats.count == 2
    assert stats.checkouts == 1
    assert stats.slowest_sql is not None
    assert len(stats.slowest_sql) <= 200
    assert "SELECT" in stats.slowest_sql