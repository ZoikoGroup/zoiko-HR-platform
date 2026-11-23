"""Migration 5d2a8c4e1f3b: departments get a nullable head_employee_id; safe to run again; downgrade removes it."""
import importlib.util
import pathlib

import sqlalchemy as sa
from alembic.operations import Operations
from alembic.runtime.migration import MigrationContext

PATH = pathlib.Path(__file__).parent.parent / "alembic" / "versions" / "5d2a8c4e1f3b_department_head_employee.py"


def _run(engine, fn):
    with engine.begin() as conn:
        with Operations.context(MigrationContext.configure(conn)):
            fn()


def test_head_employee_id_is_added_once_and_removed_on_downgrade():
    spec = importlib.util.spec_from_file_location("dept_head_mig", PATH)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    assert mod.down_revision == "4c8e1f2a9b7d"
    engine = sa.create_engine("sqlite:///:memory:")
    with engine.begin() as conn:
        conn.execute(sa.text("CREATE TABLE departments (id INTEGER PRIMARY KEY, name VARCHAR(100), head VARCHAR(100))"))
        conn.execute(sa.text("INSERT INTO departments (id, name, head) VALUES (1, 'Design', 'peter')"))
    _run(engine, mod.upgrade)
    _run(engine, mod.upgrade)                                       # a second run changes nothing
    with engine.connect() as conn:
        assert conn.execute(sa.text("SELECT head, head_employee_id FROM departments")).one() == ("peter", None)
    _run(engine, mod.downgrade)
    assert {c["name"] for c in sa.inspect(engine).get_columns("departments")} == {"id", "name", "head"}
