"""Notice in a clause ("{{probation_notice_calendar_days}} calendar days") is filled from the notice rule whatever unit the
rule uses (the Company Profile units are calendar_days / business_days / weeks / months)."""
from app.modules.hr import onboarding_clause_tokens as T


def _days(value, unit):
    out = T.resolve_all({}, {}, {}, {"during": (value, unit), "after": (value, unit)})
    return out["clause.probation_notice_calendar_days"], out["clause.confirmed_notice_calendar_days"]


def test_every_notice_unit_becomes_calendar_days():
    assert _days(30, "calendar_days") == ("30", "30")
    assert _days(15, "business_days") == ("21", "21")
    assert _days(4, "business_days") == ("6", "6"), "rounded up in the worker's favour"
    assert _days(2, "weeks") == ("14", "14")
    assert _days(1, "months") == ("30", "30")
    assert _days(None, "calendar_days") == (None, None)
    assert _days("x", "calendar_days") == (None, None)
