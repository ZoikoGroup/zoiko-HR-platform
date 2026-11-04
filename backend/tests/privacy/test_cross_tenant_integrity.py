"""C03: a row of one tenant cannot reference a row of another. The report command finds existing ones; the composite keys stop new ones."""
from datetime import date

from sqlalchemy import text

from app.modules.hr.models import LeaveRequest
from scripts.privacy_check_cross_tenant import find


def test_C03_the_report_finds_a_cross_tenant_reference_and_changes_nothing(world):
    db = world.db
    ok = LeaveRequest(employee_id=world.u["a_emp1"].id, organization_id=1, leave_type="annual", start_date=date.today(), end_date=date.today(), days=1, reason="x", status="pending")
    bad = LeaveRequest(employee_id=world.u["b_emp1"].id, organization_id=1, leave_type="annual", start_date=date.today(), end_date=date.today(), days=1, reason="x", status="pending")
    db.add_all([ok, bad])
    db.commit()
    before = db.query(LeaveRequest).count()
    with db.get_bind().connect() as conn:
        report = find(conn)
    hits = [r for r in report if r.get("count") and r["child"] == "leave_requests" and r["column"] == "employee_id"]
    assert hits and hits[0]["count"] == 1 and hits[0]["examples"][0]["child_org"] == 1 and hits[0]["examples"][0]["parent_org"] == 2
    assert db.query(LeaveRequest).count() == before, "report only: nothing was changed or removed"
    assert not [r for r in report if r.get("count") and r["child"] != "leave_requests"], "everything else in the fixture is consistent"


def test_C03_a_clean_database_reports_nothing(world):
    with world.db.get_bind().connect() as conn:
        assert [r for r in find(conn) if r.get("count")] == []


def test_C03_every_pair_the_generator_covers_is_between_two_tenant_tables_with_a_single_column():
    import app.main  # noqa: F401
    from app.core.privacy import rls
    from app.database import Base
    pairs = rls.tenant_fk_pairs(Base.metadata)
    assert len(pairs) > 100
    for p in pairs:
        assert "organization_id" in Base.metadata.tables[p["child"]].c and "organization_id" in Base.metadata.tables[p["parent"]].c
    assert ("employees", "created_by") not in {(p["child"], p["column"]) for p in pairs}, "who-created-it references may point at a platform account"
    # a Super Admin deleting an organization cancels its subscription and is recorded as the billing actor
    covered = {(p["child"], p["column"]) for p in pairs}
    assert ("billing_audit_logs", "actor_id") not in covered and ("billing_confirmation_tokens", "actor_id") not in covered
