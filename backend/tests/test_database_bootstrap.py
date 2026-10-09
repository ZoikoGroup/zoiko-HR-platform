"""Boot-time schema work must not run on every startup.

Against a remote database, create_all's checkfirst pass reflects every mapped
table (minutes on Neon) and the ALTER list is one round trip per statement, so
both are gated behind a single cheap query. These tests pin that gating: no
create_all when the schema is complete, create_all when a table is absent.
"""

import contextlib

import pytest

import app.database as database


class _Inspector:
    def __init__(self, tables):
        self._tables = tables

    def get_table_names(self):
        return list(self._tables)


class _Conn:
    def __init__(self, tables=(), fail_on=()):
        self._tables = tables
        self._fail_on = fail_on

    def get_table_names(self):
        return list(self._tables)

    def execute(self, statement):
        text = str(statement)
        if any(needle in text for needle in self._fail_on):
            raise database.exc.ProgrammingError("SELECT", {}, Exception("column does not exist"))
        return None


class _Engine:
    def __init__(self, conn):
        self._conn = conn

    @contextlib.contextmanager
    def connect(self):
        yield self._conn

    @contextlib.contextmanager
    def begin(self):
        yield self._conn


@pytest.fixture
def no_side_effects(monkeypatch):
    """Skip the ALTER list, backfill and seed steps; this suite is about gating."""
    monkeypatch.setattr(database, "_schema_alterations_needed", lambda: False)
    monkeypatch.setattr(database.Base.metadata, "create_all", lambda **kwargs: None)


def test_skips_create_all_when_schema_complete(monkeypatch, no_side_effects):
    conn = _Conn(tables=list(database.Base.metadata.tables))
    monkeypatch.setattr(database, "engine", _Engine(conn))
    monkeypatch.setattr(database, "inspect", lambda c: _Inspector(conn.get_table_names()))

    called = []
    monkeypatch.setattr(
        database.Base.metadata, "create_all", lambda **kwargs: called.append(True)
    )

    database.initialize_database()

    assert called == [], "create_all ran even though every table already exists"


def test_creates_only_missing_tables(monkeypatch, no_side_effects):
    existing = [t for t in database.Base.metadata.tables if t != "holidays"]
    conn = _Conn(tables=existing)
    monkeypatch.setattr(database, "engine", _Engine(conn))
    monkeypatch.setattr(database, "inspect", lambda c: _Inspector(conn.get_table_names()))

    called = []
    monkeypatch.setattr(
        database.Base.metadata, "create_all", lambda **kwargs: called.append(True)
    )

    database.initialize_database()

    assert called == [True], "create_all did not run for the missing table"


def test_alter_gate_detects_missing_sentinel_column():
    engine = _Engine(_Conn(fail_on=("deleted_at",)))
    original = database.engine
    try:
        database.engine = engine
        assert database._schema_alterations_needed() is True
    finally:
        database.engine = original


def test_alter_gate_skips_when_sentinels_present():
    engine = _Engine(_Conn())
    original = database.engine
    try:
        database.engine = engine
        assert database._schema_alterations_needed() is False
    finally:
        database.engine = original


class TestNeonPoolerHost:
    """Part D: HR_USE_NEON_POOLER rewrites the host to Neon's PgBouncer-compatible endpoint."""

    def test_pooler_host_rewrite(self):
        url = "postgresql://user:pw@db-abc123.us-east-2.aws.neon.tech/neondb?sslmode=require"
        assert database._apply_neon_pooler(url, True) == \
            "postgresql://user:pw@db-abc123-pooler.us-east-2.aws.neon.tech/neondb?sslmode=require"

    def test_idempotent(self):
        pooled = "postgresql://user:pw@db-abc123-pooler.us-east-2.aws.neon.tech/neondb"
        assert database._apply_neon_pooler(pooled, True) == pooled

    def test_ignores_non_neon_host(self):
        url = "postgresql://user:pw@db.example.com/neondb"
        assert database._apply_neon_pooler(url, True) == url


class TestPoolSizingWarning:
    def test_warns_when_workers_times_pool_overruns_limit(self, monkeypatch, caplog):
        monkeypatch.setattr(database.settings, "USE_NEON_POOLER", False)
        monkeypatch.setattr(database, "_is_sqlite", False)   # the guard skips SQLite; the suite may run on it
        monkeypatch.setattr(database.settings, "WEB_CONCURRENCY", 4)
        monkeypatch.setenv("HR_DB_CONNECTION_LIMIT", "10")
        with caplog.at_level("WARNING", logger="zoiko.hr"):
            database._warn_on_pool_sizing()
        assert any("Pool sizing risk" in r.message for r in caplog.records)

    def test_silent_when_within_limit(self, monkeypatch, caplog):
        monkeypatch.setattr(database.settings, "USE_NEON_POOLER", False)
        monkeypatch.setattr(database, "_is_sqlite", False)   # the guard skips SQLite; the suite may run on it
        monkeypatch.setattr(database.settings, "WEB_CONCURRENCY", 1)
        monkeypatch.setenv("HR_DB_CONNECTION_LIMIT", "25")
        with caplog.at_level("WARNING", logger="zoiko.hr"):
            database._warn_on_pool_sizing()
        assert not any("Pool sizing risk" in r.message for r in caplog.records)