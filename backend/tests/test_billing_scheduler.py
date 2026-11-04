from datetime import datetime

import pytest


def test_plan_change_scheduler_checks_every_minute():
    from app.modules.billing import scheduler

    if not scheduler._SCHEDULER_AVAILABLE:
        pytest.skip("APScheduler is not installed")

    job = scheduler._ensure_scheduler().get_job("plan_change_execution")
    now = datetime(2026, 1, 1, 12, 30, 30, tzinfo=job.trigger.timezone)

    assert job.trigger.get_next_fire_time(None, now) == now.replace(
        minute=31, second=0, microsecond=0
    )
