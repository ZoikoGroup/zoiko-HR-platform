"""The database a test runs on: in-memory SQLite by default, or a real PostgreSQL when HR_TEST_PG_URL is set.

    HR_TEST_PG_URL=postgresql+psycopg://postgres@127.0.0.1:55432/zoiko_hr_test  python -m pytest tests/...

On PostgreSQL the schema is created once per test process (dropping whatever is there: point it at a throwaway database only)
and every table is emptied before each test. When the server has no pgvector extension, the single vector column
(knowledge_fragments.embedding) is created as REAL[] so the rest of the schema can be built; no test here uses it.
"""
from __future__ import annotations

import os

from sqlalchemy import create_engine, text
from sqlalchemy.pool import StaticPool

PG_URL = (os.environ.get("HR_TEST_PG_URL") or "").strip()
_schema_ready = False
_engine = None


def on_postgres() -> bool:
    return bool(PG_URL)


def _vector_support(engine) -> None:
    with engine.connect() as conn:
        available = conn.execute(text("SELECT 1 FROM pg_available_extensions WHERE name = 'vector'")).first()
    if available:
        with engine.begin() as conn:
            conn.execute(text("CREATE EXTENSION IF NOT EXISTS vector"))
        return
    from pgvector.sqlalchemy import Vector
    from sqlalchemy.ext.compiler import compiles

    @compiles(Vector, "postgresql")
    def _as_real_array(type_, compiler, **kw):        # noqa: ARG001 - test-only stand-in, see module docstring
        return "REAL[]"


def _truncate_all(engine) -> None:
    # A previous test can leave a session open (a TestClient thread, a background e-mail job): end every other connection to
    # this throwaway database first, or TRUNCATE deadlocks with it and the next test starts on the last test's rows.
    engine.dispose()
    with engine.begin() as conn:
        conn.execute(text("SELECT pg_terminate_backend(pid) FROM pg_stat_activity "
                          "WHERE datname = current_database() AND pid <> pg_backend_pid()"))
    with engine.begin() as conn:
        names = [r[0] for r in conn.execute(text("SELECT tablename FROM pg_tables WHERE schemaname = 'public'"))]
        if names:
            conn.execute(text("TRUNCATE " + ", ".join(f'"{n}"' for n in names) + " RESTART IDENTITY CASCADE"))


def make_engine():
    """A ready, empty database with the full schema."""
    global _schema_ready, _engine
    from app.database import Base
    if not PG_URL:
        engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False}, poolclass=StaticPool)
        Base.metadata.create_all(engine)
        return engine
    if _engine is None:
        _engine = create_engine(PG_URL, pool_pre_ping=True)
    if not _schema_ready:
        import app.main  # noqa: F401  - registers every model (some only load with their routers) before the schema is built
        _vector_support(_engine)
        with _engine.begin() as conn:
            conn.execute(text("DROP SCHEMA public CASCADE"))
            conn.execute(text("CREATE SCHEMA public"))
        if _engine.dialect.name == "postgresql":
            _vector_support(_engine)                       # the extension (if any) went with the schema
        Base.metadata.create_all(_engine)
        _schema_ready = True
    _truncate_all(_engine)
    return _engine


def dispose(engine) -> None:
    """End of a test. The shared PostgreSQL engine is kept (the next test empties it); SQLite engines are dropped."""
    if engine is not _engine:
        engine.dispose()


def sync_sequences(db) -> None:
    """After rows were inserted with explicit ids (fixtures do), move each id sequence past them. SQLite needs nothing."""
    if db.get_bind().dialect.name != "postgresql":
        return
    rows = db.execute(text(
        "SELECT c.relname, a.attname, pg_get_serial_sequence(quote_ident(c.relname), a.attname) "
        "FROM pg_class c JOIN pg_attribute a ON a.attrelid = c.oid "
        "WHERE c.relkind = 'r' AND c.relnamespace = 'public'::regnamespace AND a.attnum > 0 "
        "AND pg_get_serial_sequence(quote_ident(c.relname), a.attname) IS NOT NULL")).fetchall()
    for table, column, seq in rows:
        db.execute(text(f"SELECT setval('{seq}', COALESCE((SELECT MAX(\"{column}\") FROM \"{table}\"), 0) + 1, false)"))
    db.commit()
