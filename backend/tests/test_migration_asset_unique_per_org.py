"""Migration e2f3a4b5c6d7: asset tags and category names go from unique-everywhere to unique-per-organization.

Runs on in-memory SQLite by default and on a real PostgreSQL when HR_TEST_PG_URL is set (in its own throwaway schema).
The tables are created the way the old models made them: a column-level UNIQUE on assets.asset_tag and asset_categories.name.
"""
import importlib.util
import pathlib

import pytest
import sqlalchemy as sa
from alembic.operations import Operations
from alembic.runtime.migration import MigrationContext

PATH = pathlib.Path(__file__).parent.parent / "alembic" / "versions" / "e2f3a4b5c6d7_asset_tag_and_category_unique_per_org.py"


def _load():
    spec = importlib.util.spec_from_file_location("asset_unique_per_org_mig", PATH)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def _db(assets=(), categories=()):
    from tests.db_backend import PG_URL
    if PG_URL:
        admin = sa.create_engine(PG_URL)
        with admin.begin() as conn:
            conn.execute(sa.text("DROP SCHEMA IF EXISTS migtest_assets CASCADE"))
            conn.execute(sa.text("CREATE SCHEMA migtest_assets"))
        admin.dispose()
        engine = sa.create_engine(PG_URL, connect_args={"options": "-csearch_path=migtest_assets"})
    else:
        engine = sa.create_engine("sqlite:///:memory:", poolclass=sa.pool.StaticPool)
    with engine.begin() as conn:
        conn.execute(sa.text("CREATE TABLE assets (id INTEGER PRIMARY KEY, name VARCHAR(150) NOT NULL, "
                             "asset_tag VARCHAR(100) NOT NULL UNIQUE, organization_id INTEGER NOT NULL, deleted_at TIMESTAMP NULL)"))
        conn.execute(sa.text("CREATE INDEX ix_assets_organization_id ON assets (organization_id)"))
        conn.execute(sa.text("CREATE TABLE asset_categories (id INTEGER PRIMARY KEY, name VARCHAR(100) NOT NULL UNIQUE, "
                             "organization_id INTEGER NOT NULL)"))
        for i, (tag, org, deleted) in enumerate(assets, start=1):
            conn.execute(sa.text("INSERT INTO assets (id, name, asset_tag, organization_id, deleted_at) VALUES (:i, 'x', :t, :o, :d)"),
                         {"i": i, "t": tag, "o": org, "d": "2026-01-01 00:00:00" if deleted else None})
        for i, (name, org) in enumerate(categories, start=1):
            conn.execute(sa.text("INSERT INTO asset_categories (id, name, organization_id) VALUES (:i, :n, :o)"), {"i": i, "n": name, "o": org})
    return engine


def _run(engine, fn):
    with engine.begin() as conn:
        with Operations.context(MigrationContext.configure(conn)):
            fn()


def _insert_asset(conn, i, tag, org, deleted=False):
    conn.execute(sa.text("INSERT INTO assets (id, name, asset_tag, organization_id, deleted_at) VALUES (:i, 'x', :t, :o, :d)"),
                 {"i": i, "t": tag, "o": org, "d": "2026-01-01 00:00:00" if deleted else None})


def test_before_the_migration_a_second_organization_cannot_reuse_a_tag():
    engine = _db(assets=[("LT-1", 1, False)])
    with engine.begin() as conn, pytest.raises(sa.exc.IntegrityError):
        _insert_asset(conn, 2, "LT-1", 2)


def test_upgrade_makes_tags_and_category_names_unique_per_organization_and_is_repeatable():
    mod = _load()
    engine = _db(assets=[("LT-1", 1, False), ("LT-2", 1, False)], categories=[("Laptops", 1)])
    _run(engine, mod.upgrade)
    _run(engine, mod.upgrade)                                   # a second run changes nothing and does not fail
    with engine.connect() as conn:
        assert mod.TAG_INDEX in mod._index_names(conn, "assets")
        assert mod.CATEGORY_INDEX in mod._index_names(conn, "asset_categories")
        assert "ix_assets_organization_id" in mod._index_names(conn, "assets")     # other indexes survive
        assert conn.execute(sa.text("SELECT count(*) FROM assets")).scalar() == 2    # and the data
    with engine.begin() as conn:
        _insert_asset(conn, 10, "LT-1", 2)                                          # another organization: allowed now
        conn.execute(sa.text("INSERT INTO asset_categories (id, name, organization_id) VALUES (10, 'Laptops', 2)"))
    with engine.begin() as conn, pytest.raises(sa.exc.IntegrityError):
        _insert_asset(conn, 11, "LT-1", 1)                                          # same organization: refused
    with engine.begin() as conn, pytest.raises(sa.exc.IntegrityError):
        conn.execute(sa.text("INSERT INTO asset_categories (id, name, organization_id) VALUES (11, 'LAPTOPS', 1)"))  # case-insensitive


def test_a_deleted_assets_tag_can_be_used_again_after_the_upgrade():
    mod = _load()
    engine = _db(assets=[("OLD-1", 1, True)])
    _run(engine, mod.upgrade)
    with engine.begin() as conn:
        _insert_asset(conn, 2, "OLD-1", 1)


def test_upgrade_stops_and_names_the_rows_when_categories_clash_ignoring_case():
    mod = _load()
    engine = _db(categories=[("Laptops", 1), ("laptops", 1), ("LAPTOPS", 2)])
    with pytest.raises(RuntimeError) as err:
        _run(engine, mod.upgrade)
    assert "organization 1: asset categories [1, 2]" in str(err.value)
    with engine.connect() as conn:                              # nothing was changed
        assert mod.CATEGORY_INDEX not in mod._index_names(conn, "asset_categories")


def test_downgrade_puts_the_global_rule_back_and_refuses_when_organizations_now_share_a_value():
    mod = _load()
    engine = _db(assets=[("LT-1", 1, False)], categories=[("Laptops", 1)])
    _run(engine, mod.upgrade)
    _run(engine, mod.downgrade)
    with engine.connect() as conn:
        assert mod.TAG_INDEX not in mod._index_names(conn, "assets")
    with engine.begin() as conn, pytest.raises(sa.exc.IntegrityError):
        _insert_asset(conn, 2, "LT-1", 2)
    _run(engine, mod.upgrade)
    with engine.begin() as conn:
        _insert_asset(conn, 3, "LT-1", 2)
    with pytest.raises(RuntimeError):
        _run(engine, mod.downgrade)
