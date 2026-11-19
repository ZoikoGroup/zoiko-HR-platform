"""Migration d1e2f3a4b5c6: lower-cases employee addresses, stops on collisions, adds the case-insensitive per-org indexes."""
import importlib.util
import pathlib

import pytest
import sqlalchemy as sa
from alembic.operations import Operations
from alembic.runtime.migration import MigrationContext

PATH = pathlib.Path(__file__).parent.parent / "alembic" / "versions" / "d1e2f3a4b5c6_employee_email_case_insensitive_per_org.py"


def _load():
    spec = importlib.util.spec_from_file_location("email_per_org_mig", PATH)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def _db(rows):
    from tests.db_backend import PG_URL
    if PG_URL:
        # a real PostgreSQL: the migration runs in its own throwaway schema, beside (not on) the test schema
        admin = sa.create_engine(PG_URL)
        with admin.begin() as conn:
            conn.execute(sa.text("DROP SCHEMA IF EXISTS migtest CASCADE"))
            conn.execute(sa.text("CREATE SCHEMA migtest"))
        admin.dispose()
        engine = sa.create_engine(PG_URL, connect_args={"options": "-csearch_path=migtest"})
    else:
        engine = sa.create_engine("sqlite:///:memory:")
    with engine.begin() as conn:
        conn.execute(sa.text("CREATE TABLE employees (id INTEGER PRIMARY KEY, email VARCHAR(255) NOT NULL, organization_id INTEGER)"))
        for i, (email, org) in enumerate(rows, start=1):
            conn.execute(sa.text("INSERT INTO employees (id, email, organization_id) VALUES (:i, :e, :o)"), {"i": i, "e": email, "o": org})
    return engine


def _run(engine, fn):
    with engine.begin() as conn:
        with Operations.context(MigrationContext.configure(conn)):
            fn()


def test_upgrade_lowercases_adds_the_indexes_and_is_repeatable():
    mod = _load()
    engine = _db([(" Sam@Acme.com ", 1), ("sam@acme.com", 2), ("ROOT@zoiko.com", None), ("lee@acme.com", 1)])
    _run(engine, mod.upgrade)
    _run(engine, mod.upgrade)                                   # a second run changes nothing and does not fail
    with engine.connect() as conn:
        assert [r[0] for r in conn.execute(sa.text("SELECT email FROM employees ORDER BY id"))] == \
            ["sam@acme.com", "sam@acme.com", "root@zoiko.com", "lee@acme.com"]
        names = mod._index_names(conn)
    assert {mod.ORG_INDEX, mod.PLATFORM_INDEX} <= names
    with engine.begin() as conn:
        conn.execute(sa.text("INSERT INTO employees (id, email, organization_id) VALUES (10, 'sam@acme.com', 3)"))  # another org: fine
        with pytest.raises(sa.exc.IntegrityError):
            conn.execute(sa.text("INSERT INTO employees (id, email, organization_id) VALUES (11, 'SAM@acme.com', 1)"))
    with engine.begin() as conn:
        with pytest.raises(sa.exc.IntegrityError):
            conn.execute(sa.text("INSERT INTO employees (id, email, organization_id) VALUES (12, 'Root@Zoiko.com', NULL)"))
    _run(engine, mod.downgrade)
    with engine.connect() as conn:
        assert not ({mod.ORG_INDEX, mod.PLATFORM_INDEX} & mod._index_names(conn))


@pytest.mark.parametrize("rows, org_text", [
    ([("Sam@Acme.com", 1), ("sam@acme.com ", 1)], "organization 1"),
    ([("Root@Zoiko.com", None), ("root@zoiko.com", None)], "NULL (platform)"),
])
def test_upgrade_stops_on_collisions_and_changes_nothing(rows, org_text):
    mod = _load()
    engine = _db(rows + [("other@acme.com", 2)])
    with pytest.raises(RuntimeError) as ei:
        _run(engine, mod.upgrade)
    assert org_text in str(ei.value) and "[1, 2]" in str(ei.value), "names the colliding ids for a human decision"
    with engine.connect() as conn:
        assert [r[0] for r in conn.execute(sa.text("SELECT email FROM employees ORDER BY id"))] == [e for e, _ in rows] + ["other@acme.com"]
        assert not ({mod.ORG_INDEX, mod.PLATFORM_INDEX} & mod._index_names(conn))
