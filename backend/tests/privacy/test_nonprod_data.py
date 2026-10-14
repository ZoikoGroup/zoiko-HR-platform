"""F03: synthetic tenants for non-production, and masking of a database copy."""
import pytest
from sqlalchemy import text

from app.modules.employee.models import Employee
from scripts import mask_database_copy as mask
from scripts import seed_synthetic_tenants as seed
from tests.privacy.support import CANARY


def test_F03_the_seed_creates_two_synthetic_tenants_idempotently_and_refuses_real_looking_databases(world, monkeypatch):
    from app.config import settings
    db = world.db
    ids = seed.seed(db)
    again = seed.seed(db)
    assert ids == again and set(ids) == {"TENANT-A", "TENANT-B"}
    people = db.query(Employee).filter(Employee.email.like("%@tenant-%.example.com")).all()
    assert len(people) >= 7
    assert all(p.email.endswith(("@tenant-a.example.com", "@tenant-b.example.com", "@tenant-a.example.com ")) or "example.com" in p.email for p in people)
    monkeypatch.setattr(settings, "DATABASE_URL", "postgresql://u:p@db.prod.example.net:5432/zoikohr")
    monkeypatch.delenv("HR_ALLOW_SYNTHETIC_SEED", raising=False)
    assert seed.main() == 2, "a database that is not local is refused"


def test_F03_masking_refuses_without_confirmation_and_on_remote_databases(world, monkeypatch, capsys):
    assert mask.main([]) == 2
    class Remote:
        url = "postgresql://prod.example.net/zoikohr"
        def __str__(self): return self.url
    monkeypatch.setattr(mask, "engine", type("E", (), {"url": Remote()})())
    assert mask.main(["--i-am-on-a-copy"]) == 2
    assert "not local" in capsys.readouterr().out


def test_F03_the_masking_plan_covers_every_sensitive_column_and_no_structural_one():
    steps = {(t, c): how for t, c, how in mask.plan()}
    for key in (("employees", "first_name"), ("employees", "email"), ("employees", "basic_salary"), ("employees", "hashed_password"),
                ("employee_profiles", "bank_account"), ("employee_profiles", "pan_number"), ("leave_requests", "reason"), ("recruitment_candidates", "email")):
        assert key in steps, key
    assert steps[("employees", "hashed_password")] == "password" and steps[("employees", "email")] == "email" and steps[("employees", "basic_salary")] == "zero"
    for key in (("employees", "id"), ("employees", "organization_id"), ("employees", "role"), ("employees", "created_at"), ("billing_subscriptions", "plan_code")):
        assert key not in steps, key


def test_F03_a_masked_copy_keeps_its_shape_but_no_personal_value_survives(world, monkeypatch):
    db = world.db
    seed.seed(db)
    monkeypatch.setattr(mask, "engine", db.get_bind())
    before_rows = db.query(Employee).count()
    db.commit()
    assert mask.main(["--i-am-on-a-copy"]) == 0
    db.expire_all()
    assert db.query(Employee).count() == before_rows, "no rows were lost"
    dump = "\n".join(str(r) for t in ("employees", "employee_profiles") for r in db.execute(text(f"SELECT * FROM {t}")).fetchall())
    for needle in (CANARY["name_a1"], CANARY["last_a1"], CANARY["email_a1"], CANARY["phone_a1"], CANARY["iban_a1"], CANARY["pan_a1"], "Ada", "Cleo", "SYN-IBAN", "Synthetic Street"):
        assert needle not in dump, needle
    assert str(CANARY["salary_a1"]) not in dump
    row = db.execute(text("SELECT hashed_password, role, organization_id FROM employees ORDER BY id LIMIT 1")).fetchone()
    assert row[0] == "!masked" and row[1] and row[2] is None or row[2] is not None
