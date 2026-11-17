"""Employee notice period rules in the Company Profile: validation, the fallback single notice, and the printed wording."""

from app.modules.hr import company_profile as CP
from app.modules.hr.onboarding_package import _employee_notice_text


def _clean(rules):
    errors = {}
    return CP._clean("notice_rules", rules, errors), errors


def test_rules_are_cleaned_and_bad_rows_named():
    rules, errors = _clean([{"employee_type": "All", "applies_when": "probation", "value": "14", "unit": "calendar_days"}])
    assert errors == {}
    assert rules == [{"employee_type": "all", "applies_when": "probation", "value": 14, "unit": "calendar_days", "active": True}]
    _, errors = _clean([{"employee_type": "all", "applies_when": "any", "value": 400, "unit": "weeks"}])
    assert "Rule 1" in errors["notice_rules"]
    _, errors = _clean([{"employee_type": "all", "applies_when": "any", "value": 1, "unit": "weeks"},
                        {"employee_type": "all", "applies_when": "any", "value": 2, "unit": "weeks"}])
    assert "already an active rule" in errors["notice_rules"]
    _, errors = _clean([{"employee_type": "all", "applies_when": "any", "value": 1, "unit": "weeks"},
                        {"employee_type": "all", "applies_when": "any", "value": 2, "unit": "weeks", "active": False}])
    assert errors == {}                                     # an inactive duplicate is allowed


def test_fallback_single_notice_follows_the_rules():
    profile = {"notice_rules": _clean([
        {"employee_type": "ascend", "applies_when": "any", "value": 15, "unit": "business_days"},
        {"employee_type": "all", "applies_when": "any", "value": 30, "unit": "calendar_days"}])[0]}
    CP._sync_notice_fallback(profile)
    assert (profile["notice_period_value"], profile["notice_period_unit"]) == (30, "calendar_days")
    profile["notice_rules"] = []
    CP._sync_notice_fallback(profile)
    assert profile["notice_period_value"] is None


def test_printed_notice_uses_the_hires_employee_type_and_stage():
    profile = {"notice_rules": _clean([
        {"employee_type": "all", "applies_when": "probation", "value": 14, "unit": "calendar_days"},
        {"employee_type": "all", "applies_when": "post_probation", "value": 30, "unit": "calendar_days"},
        {"employee_type": "ascend", "applies_when": "any", "value": 15, "unit": "business_days"}])[0]}
    assert _employee_notice_text(profile, {"slug": "standard-employee"}) == \
        "14 days' written notice during the Probation period and 30 days' written notice after it"
    assert _employee_notice_text(profile, {"slug": "ascend"}) == "15 business days' written notice"
    # no rules: the single notice period, as before
    assert _employee_notice_text({"notice_period_value": 1, "notice_period_unit": "months"}, {}) == "1 month's written notice"


def test_choice_fields_accept_the_dropdown_and_older_wording():
    errors = {}
    assert CP._clean("pay_frequency", "Monthly", errors) == "monthly"
    assert CP._clean("time_tracking_tool_name", "zoikotime", errors) == "ZoikoTime"
    assert CP._clean("nda_confidentiality_duration", "for as long as the law allows", errors) == "for as long as the law allows"
    assert errors == {}
    spec = {f["key"]: f for f in CP.fields_spec()}
    assert spec["pay_frequency"]["kind"] == "choice" and "weekly" in spec["pay_frequency"]["options"]
    assert spec["nda_confidentiality_duration"]["options"][0] == "indefinitely"
