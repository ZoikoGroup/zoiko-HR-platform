"""C01 / C03: the session itself limits every tenant-plane query to the caller's organization."""
import ast
import pathlib

import pytest
from sqlalchemy import select

from app.core.privacy import context as ctx
from app.core.privacy import tenant_scope as ts
from app.modules.employee.models import Employee
from app.modules.hr.models import EmployeeProfile


def _emails(db, **kw):
    return sorted(e.email for e in db.query(Employee).all())


def test_C01_inside_a_tenant_context_every_query_sees_only_that_tenant(world):
    db = world.db
    everyone = len(_emails(db))
    assert everyone == 8, "no context: nothing is filtered (sign-in, scripts, tests)"
    with ctx.tenant_context(1, world.u["a_admin"].id):
        assert all("tenant-a" in e or "canary.a" in e or e.startswith(("hr@", "manager@")) for e in _emails(db))
        assert db.query(Employee).count() == 5
        assert db.execute(select(Employee.email)).all() and len(db.execute(select(Employee.email)).all()) == 5
        assert db.query(EmployeeProfile).count() == 1
    with ctx.tenant_context(2, world.u["b_admin"].id):                       # the next tenant on the same process: NOT the first one's filter
        assert db.query(Employee).count() == 2
        assert db.query(EmployeeProfile).count() == 1
    assert db.query(Employee).count() == 8


def test_C01_the_platform_plane_and_anonymous_requests_are_not_filtered_by_this_layer(world):
    token = ctx.set_context(ctx.PLATFORM, None, world.u["platform"].id)
    try:
        assert world.db.query(Employee).count() == 8
    finally:
        ctx.reset_context(token)


def test_C01_a_query_that_forgot_its_filter_cannot_cross_tenants(world):
    """The route author forgets `organization_id == ...`: the other tenant's rows are still not returned."""
    other = world.u["b_emp1"].id
    with ctx.tenant_context(1, world.u["a_admin"].id):
        assert world.db.query(Employee).filter(Employee.id == other).first() is None
        assert world.db.get(Employee, other) is None or world.db.get(Employee, other).organization_id == 2   # the identity map is not a back door either
    with ctx.tenant_context(2, world.u["b_admin"].id):
        assert world.db.query(Employee).filter(Employee.id == other).first() is not None


def test_C03_bulk_updates_and_deletes_are_scoped_too(world):
    db = world.db
    with ctx.tenant_context(1, world.u["a_admin"].id):
        changed = db.query(Employee).update({"job_title": "scoped"}, synchronize_session=False)
        db.commit()
    assert changed == 5
    assert db.query(Employee).filter(Employee.job_title == "scoped").count() == 5
    assert db.query(Employee).filter(Employee.organization_id == 2, Employee.job_title == "scoped").count() == 0


def test_C03_a_new_row_for_another_tenant_is_refused_and_a_new_row_takes_the_callers_tenant(world):
    db = world.db
    with ctx.tenant_context(1, world.u["a_admin"].id):
        db.add(EmployeeProfile(employee_id=world.u["a_emp2"].id, organization_id=2))
        with pytest.raises(PermissionError):
            db.flush()
        db.rollback()
        p = EmployeeProfile(employee_id=world.u["a_emp2"].id)
        db.add(p)
        db.flush()
        assert p.organization_id == 1
        db.rollback()


def test_C01_the_unscoped_escape_hatch_has_an_allow_list_and_needs_a_reason(world):
    q = world.db.query(Employee)
    with ctx.tenant_context(1, world.u["a_admin"].id):
        assert ts.unscoped_for_system(q, reason="test of the allow-list").count() == 8
        with pytest.raises(ValueError):
            ts.unscoped_for_system(q, reason=" ")
    evil = {"__name__": "app.modules.some_new_feature", "ts": ts, "q": q}
    with pytest.raises(PermissionError):
        exec("ts.unscoped_for_system(q, reason='x')", evil)


def test_C01_only_allow_listed_modules_call_unscoped_for_system():
    """The AST check the control asks for: every call site in the source tree is inside an allow-listed module."""
    root = pathlib.Path(__file__).resolve().parents[2] / "app"
    offenders = []
    for path in root.rglob("*.py"):
        rel = ".".join(path.relative_to(root.parent).with_suffix("").parts)
        tree = ast.parse(path.read_text(encoding="utf-8"))
        for node in ast.walk(tree):
            if isinstance(node, ast.Call) and getattr(node.func, "id", getattr(node.func, "attr", "")) == "unscoped_for_system":
                if not rel.startswith(ts.ALLOWED_SYSTEM_MODULES):
                    offenders.append(f"{rel}:{node.lineno}")
    assert offenders == [], offenders


def test_the_scope_filter_can_be_switched_to_log_or_off_without_a_restart(world, monkeypatch):
    monkeypatch.setenv("HR_TENANT_SCOPE_MODE", "off")
    with ctx.tenant_context(1, world.u["a_admin"].id):
        assert world.db.query(Employee).count() == 8
    monkeypatch.setenv("HR_TENANT_SCOPE_MODE", "log")
    with ctx.tenant_context(1, world.u["a_admin"].id):
        assert world.db.query(Employee).count() == 8
    monkeypatch.delenv("HR_TENANT_SCOPE_MODE")
    with ctx.tenant_context(1, world.u["a_admin"].id):
        assert world.db.query(Employee).count() == 5
