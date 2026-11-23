"""Migration c2d3e4f5a6b7: company categories get is_hidden (default false for existing rows); downgrade removes it."""
import importlib.util
import pathlib

import sqlalchemy as sa
from alembic.operations import Operations
from alembic.runtime.migration import MigrationContext

PATH = pathlib.Path(__file__).parent.parent / "alembic" / "versions" / "c2d3e4f5a6b7_company_category_hidden.py"


def _load():
    spec = importlib.util.spec_from_file_location("company_category_hidden_mig", PATH)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def _run(engine, fn):
    with engine.begin() as conn:
        with Operations.context(MigrationContext.configure(conn)):
            fn()


def test_existing_categories_stay_visible_and_downgrade_removes_the_column():
    mod = _load()
    assert mod.down_revision == "c1d2e3f4a5b6"
    engine = sa.create_engine("sqlite:///:memory:")
    with engine.begin() as conn:
        conn.execute(sa.text("CREATE TABLE hr_company_document_categories (id INTEGER PRIMARY KEY, name VARCHAR(120) NOT NULL)"))
        conn.execute(sa.text("INSERT INTO hr_company_document_categories (id, name) VALUES (1, 'Company Policies')"))
    _run(engine, mod.upgrade)
    with engine.connect() as conn:
        assert conn.execute(sa.text("SELECT is_hidden FROM hr_company_document_categories WHERE id = 1")).scalar() in (0, False)
    _run(engine, mod.downgrade)
    cols = {c["name"] for c in sa.inspect(engine).get_columns("hr_company_document_categories")}
    assert cols == {"id", "name"}


def test_share_tables_are_created_after_the_hidden_flag_and_dropped_on_downgrade():
    spec = importlib.util.spec_from_file_location("document_email_shares_mig", PATH.parent / "a9d8c7b6e5f4_document_email_shares.py")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    assert mod.down_revision == "c2d3e4f5a6b7"
    engine = sa.create_engine("sqlite:///:memory:")
    with engine.begin() as conn:
        conn.execute(sa.text("CREATE TABLE organizations (id INTEGER PRIMARY KEY)"))
        conn.execute(sa.text("CREATE TABLE employees (id INTEGER PRIMARY KEY)"))
    _run(engine, mod.upgrade)
    tables = set(sa.inspect(engine).get_table_names())
    assert {"hr_document_shares", "hr_document_share_recipients"} <= tables
    cols = {c["name"] for c in sa.inspect(engine).get_columns("hr_document_share_recipients")}
    assert {"share_id", "kind", "employee_id", "email", "status", "error", "attempts", "sent_at"} <= cols
    _run(engine, mod.downgrade)
    assert not {"hr_document_shares", "hr_document_share_recipients"} & set(sa.inspect(engine).get_table_names())


def test_every_migration_has_its_own_revision_id():
    import re
    seen = {}
    for f in sorted(PATH.parent.glob("*.py")):
        m = re.search(r'^revision(?::\s*str)?\s*=\s*["\']([^"\']+)["\']', f.read_text(encoding="utf-8"), re.M)
        if m:
            assert m.group(1) not in seen, f"{f.name} reuses revision {m.group(1)} from {seen.get(m.group(1))}"
            seen[m.group(1)] = f.name
    assert {"c2d3e4f5a6b7", "a9d8c7b6e5f4"} <= set(seen)


def test_both_migrations_run_cleanly_when_a_development_boot_already_created_everything():
    """A development boot runs create_all (new tables) and _ensure_model_columns (is_hidden) before `alembic upgrade`:
    the migrations must then do nothing and not fail (this broke on the shared database on 2026-11-23)."""
    from app.modules.hr.documents.models import HrDocumentShare, HrDocumentShareRecipient
    hidden = _load()
    spec = importlib.util.spec_from_file_location("document_email_shares_mig2", PATH.parent / "a9d8c7b6e5f4_document_email_shares.py")
    shares = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(shares)
    engine = sa.create_engine("sqlite:///:memory:")
    with engine.begin() as conn:
        conn.execute(sa.text("CREATE TABLE organizations (id INTEGER PRIMARY KEY)"))
        conn.execute(sa.text("CREATE TABLE employees (id INTEGER PRIMARY KEY)"))
        conn.execute(sa.text("CREATE TABLE hr_company_document_categories (id INTEGER PRIMARY KEY, name VARCHAR(120), "
                             "is_hidden BOOLEAN NOT NULL DEFAULT 0)"))
    md = sa.MetaData()
    for t in (HrDocumentShare.__table__, HrDocumentShareRecipient.__table__):
        t.to_metadata(md)
    sa.Table("organizations", md, sa.Column("id", sa.Integer, primary_key=True), extend_existing=True)
    sa.Table("employees", md, sa.Column("id", sa.Integer, primary_key=True), extend_existing=True)
    md.create_all(engine, tables=[md.tables["hr_document_shares"], md.tables["hr_document_share_recipients"]])
    _run(engine, hidden.upgrade)
    _run(engine, shares.upgrade)
    _run(engine, shares.upgrade)                                   # and again: still nothing to do
    idx = {i["name"] for i in sa.inspect(engine).get_indexes("hr_document_shares")}
    assert {"ix_hr_document_shares_organization_id", "ix_hds_target"} <= idx


def test_the_category_table_is_topped_up_on_a_development_boot():
    from app import database
    assert "hr_company_document_categories" in database._SELF_HEALED_TABLES
