"""Attendance M9: the demo-data script fills one organization with realistic, fully closed days, runs again without
duplicating anything, leaves other organizations alone, and refuses a database that is not on this machine."""
import importlib.util
import pathlib
from datetime import date

import pytest

from app.modules.hr.attendance.models import AttendanceDayClosure
from app.modules.hr.models import AttendanceCorrectionRequest, AttendanceRecord, AttendanceStatus, OvertimeRequest


def _script():
    path = pathlib.Path(__file__).resolve().parents[2] / "scripts" / "seed_attendance.py"
    spec = importlib.util.spec_from_file_location("seed_attendance", path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


@pytest.fixture(autouse=True)
def frozen(monkeypatch):
    from datetime import datetime
    monkeypatch.setattr("app.modules.hr.attendance.clock.utcnow", lambda: datetime(2026, 11, 18, 6, 0))


def test_demo_data_is_realistic_closed_and_idempotent(db, people):
    seed = _script().seed
    out = seed(db, 1, days=20, people=5, today=date(2026, 11, 18))
    assert out["records"] > 40 and out["days_closed"] == 20 and out["requests"] == 2
    statuses = {r.status for r in db.query(AttendanceRecord).filter_by(organization_id=1)}
    assert {AttendanceStatus.PRESENT, AttendanceStatus.LATE, AttendanceStatus.WEEKLY_OFF, AttendanceStatus.HOLIDAY,
            AttendanceStatus.ON_LEAVE} <= statuses
    assert db.query(AttendanceDayClosure).filter_by(organization_id=1).count() == 20
    assert db.query(AttendanceCorrectionRequest).count() == 1 and db.query(OvertimeRequest).count() == 1
    rows = db.query(AttendanceRecord).count()
    again = seed(db, 1, days=20, people=5, today=date(2026, 11, 18))
    assert (again["records"], again["days_closed"], again["requests"], again["leave"], again["holiday"]) == (0, 0, 0, 0, 0)
    assert db.query(AttendanceRecord).count() == rows
    assert db.query(AttendanceRecord).filter_by(organization_id=2).count() == 0


def test_only_local_databases_unless_forced():
    is_local = _script().is_local
    assert is_local("sqlite:///./dev.db")
    assert is_local("postgresql://user:x@localhost:5432/hr") and is_local("postgresql://u@127.0.0.1/hr")
    assert not is_local("postgresql://user:x@ep-cool-name.neon.tech/hr")
