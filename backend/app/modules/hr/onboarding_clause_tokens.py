"""
modules/hr/onboarding_clause_tokens.py
--------------------------------------
Counsel clause wording (Settings › Offer package) is often written with merge fields: "seek guidance through
{{conflict_disclosure_channel}}", "for {{ip_assignment_term}} and within {{ip_assignment_territory}}". Before 2026-11-18 those
printed as raw braces in the documents a new hire signs. Now every merge field in clause wording is filled before printing:

  1. the organisation's own value, when it set one (Company Profile › Clause details: key "clause_<token>");
  2. otherwise a value the hire's records already hold (employer name and address, job title, start date, work location,
     reporting line, probation months, notice in calendar days, working pattern, hours and rest days from the engagement
     profile, ...);
  3. otherwise standard wording that reads correctly in any clause (contact channels -> "the HR team at <HR e-mail>",
     "all countries of the world", the leave year 1 January – 31 December, ...).

A merge field still without a value (an organisation-specific link, version or policy reference nobody has entered) holds the
document back: it is listed as missing data for that document, so a page with raw "{{…}}" is never sent. Unknown names are
treated the same way.
"""
from __future__ import annotations

import re
from typing import Callable, Optional

TOKEN = re.compile(r"\{\{\s*([A-Za-z0-9_.:]+)\s*\}\}")


def _hr_channel(src: dict) -> Optional[str]:
    email = src["profile"].get("hr_contact_email")
    return f"the HR team at {email}" if email else None


def _days(value_unit) -> Optional[str]:
    """(value, unit) of a notice rule -> calendar days as a number string ("30")."""
    if not value_unit or value_unit[0] is None:
        return None
    value, unit = value_unit
    unit = str(unit or "").lower()
    try:
        n = int(value)
    except (TypeError, ValueError):
        return None
    if unit in ("business_days", "business_day", "working_days", "working_day"):
        return str(-(-n * 7 // 5))                     # 5 business days = 7 calendar days, rounded up in the worker's favour
    per = {"calendar_days": 1, "days": 1, "day": 1, "weeks": 7, "week": 7, "months": 30, "month": 30}.get(unit)
    return str(n * per) if per else None


def _hours_between(eng: dict) -> Optional[float]:
    s, e = eng.get("start_time"), eng.get("end_time")
    try:
        sh, sm = (int(x) for x in str(s).split(":")[:2])
        eh, em = (int(x) for x in str(e).split(":")[:2])
    except (TypeError, ValueError):
        return None
    minutes = (eh * 60 + em) - (sh * 60 + sm)
    return minutes / 60 if minutes > 0 else None


def _num(x: Optional[float]) -> Optional[str]:
    return None if x is None else f"{x:g} hours"


_DAYS = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"]
_DAY_NAMES = {"MON": "Monday", "TUE": "Tuesday", "WED": "Wednesday", "THU": "Thursday", "FRI": "Friday", "SAT": "Saturday",
              "SUN": "Sunday"}


def _rest_days(eng: dict) -> Optional[str]:
    working = [d for d in _DAYS if d in (eng.get("working_days") or [])]
    if not working:
        return None
    rest = [_DAY_NAMES[d] for d in _DAYS if d not in working]
    if not rest:
        return None
    return rest[0] if len(rest) == 1 else ", ".join(rest[:-1]) + " and " + rest[-1]


def _per_week(src: dict) -> Optional[str]:
    offer_hours = src.get("offer_hours")
    if offer_hours:
        return f"{float(offer_hours):g} hours"
    per_day = _hours_between(src["eng"])
    days = len([d for d in _DAYS if d in (src["eng"].get("working_days") or [])])
    return _num(per_day * days) if per_day and days else None


def _v(key: str) -> Callable:
    return lambda src: src["values"].get(key)


def _first(*fns: Callable) -> Callable:
    def run(src):
        for fn in fns:
            out = fn(src)
            if out not in (None, ""):
                return out
        return None
    return run


# token -> (label shown in Settings / "missing data", how to derive it from the hire's records, standard wording, settings kind)
# Every token has a Company Profile field "clause_<token>" that, when filled, wins over the derived value and the standard one.
CATALOG: dict[str, tuple] = {
    # the hire and the employer (from records; no setting needed)
    "legal_employer_name": ("Employer legal name", _first(_v("employer.legal_name"), _v("company.legal_name")), None, "text"),
    "employer_registered_address": ("Employer registered address",
                                    _first(_v("company.address_inline"), _v("employer.registered_address")), None, "text"),
    "job_title": ("Job title", _v("employment.position_title"), None, "text"),
    "start_date": ("Start date", _v("employment.start_date"), None, "text"),
    "employment_category": ("Employment category", _v("employment.employment_type"), None, "text"),
    "reporting_line": ("Reporting line", _v("employment.reports_to"), None, "text"),
    "primary_work_location": ("Primary work location", _v("employment.work_location"), None, "text"),
    "primary_work_location_or_remote": ("Work location (or remote)",
                                        lambda s: "remote" if "remote" in str(s["values"].get("employment.work_arrangement") or "").lower()
                                        else s["values"].get("employment.work_location"), None, "text"),
    "state_or_union_territory": ("State / union territory", lambda s: s["profile"].get("state"), None, "text"),
    "contract_dispute_forum_city": ("City of the courts for disputes",
                                    _first(lambda s: s["profile"].get("jurisdiction_city"), _v("company.jurisdiction_city")), None, "text"),
    "probation_months": ("Probation (months)", _v("engagement.assessment_months"), None, "text"),
    "probation_notice_calendar_days": ("Notice during probation (calendar days)", lambda s: _days(s["notice"].get("during")), None, "text"),
    "confirmed_notice_calendar_days": ("Notice after probation (calendar days)", lambda s: _days(s["notice"].get("after")), None, "text"),
    "working_pattern": ("Working pattern", _first(_v("employment.work_pattern"), _v("engagement.work_schedule")), None, "text"),
    "regular_hours_per_day": ("Regular hours per day", lambda s: _num(_hours_between(s["eng"])), None, "text"),
    "regular_hours_per_week": ("Regular hours per week", _per_week, None, "text"),
    "weekly_rest_days": ("Weekly rest day(s)", lambda s: _rest_days(s["eng"]), None, "text"),
    # where people go (default: the HR contact)
    "speak_up_channel": ("Speak-up / whistleblowing channel", _hr_channel, None, "text"),
    "conflict_disclosure_channel": ("Where conflicts of interest are disclosed", _hr_channel, None, "text"),
    "grievance_channel": ("Grievance channel", _hr_channel, None, "text"),
    "leave_request_channel": ("Where leave is requested", _hr_channel, None, "text"),
    "absence_reporting_contact": ("Who sickness absence is reported to", _hr_channel, None, "text"),
    "policy_access_location": ("Where employment policies are available",
                               lambda s: f"the employee handbook shared by the HR team at {s['profile']['hr_contact_email']}"
                               if s["profile"].get("hr_contact_email") else None, None, "text"),
    "privacy_contact_email": ("Privacy contact (employees)", lambda s: s["profile"].get("hr_contact_email"), None, "email"),
    "recruitment_privacy_contact": ("Privacy contact (candidates)", lambda s: s["profile"].get("hr_contact_email"), None, "email"),
    # standard wording
    "ip_assignment_term": ("IP assignment term", None, "the full term of each right, including any renewals and extensions", "text"),
    "ip_assignment_territory": ("IP assignment territory", None, "all countries of the world", "text"),
    "ip_assignment_schedule": ("Where the IP assignment particulars are set out", None, "this agreement", "text"),
    "pre_existing_ip_schedule": ("Where pre-existing IP is declared", None,
                                 "a written list given to the Employer before the start date", "text"),
    "exclusivity_schedule": ("Where exclusivity terms are described", None, "the Exclusivity Affidavit", "text"),
    "offer_conditions_schedule": ("Where offer conditions are listed", None, "the Offer Letter", "text"),
    "leave_year_start": ("Leave year starts", None, "1 January", "text"),
    "leave_year_end": ("Leave year ends", None, "31 December", "text"),
    # the organisation's own documents (nothing to derive: entered once in Company Profile › Clause details)
    "employee_privacy_notice_url": ("Employee privacy notice link", None, None, "url"),
    "employee_privacy_notice_version": ("Employee privacy notice version", None, None, "text"),
    "applicant_privacy_notice_url": ("Applicant privacy notice link", None, None, "url"),
    "applicant_privacy_notice_version": ("Applicant privacy notice version", None, None, "text"),
    "higher_risk_data_notice_url": ("Special-category data notice link", None, None, "url"),
    "leave_policy_version": ("Leave schedule version", None, None, "text"),
    "state_leave_schedule_reference": ("Leave rules reference", None, None, "text"),
    "sickness_policy_reference": ("Sickness policy reference", None, None, "text"),
    "benefits_schedule_version": ("Benefits schedule (Schedule B) version", None, None, "text"),
}

PROFILE_PREFIX = "clause_"
VALUE_PREFIX = "clause."


def profile_key(token: str) -> str:
    return PROFILE_PREFIX + token


def label(token: str) -> str:
    entry = CATALOG.get(token)
    return entry[0] if entry else f"Clause detail “{token}”"


def standard_value(token: str) -> Optional[str]:
    entry = CATALOG.get(token)
    return entry[2] if entry else None


def resolve_all(profile: dict, values: dict, eng: Optional[dict], notice: Optional[dict], offer_hours=None) -> dict:
    """{"clause.<token>": value or None} for every catalogued token: the organisation's own value, else the hire's records,
    else the standard wording."""
    src = {"profile": profile or {}, "values": values or {}, "eng": eng or {}, "notice": notice or {}, "offer_hours": offer_hours}
    out = {}
    for token, (_label, derive, standard, _kind) in CATALOG.items():
        own = (profile or {}).get(profile_key(token))
        value = own if own not in (None, "") else None
        if value is None and derive is not None:
            try:
                value = derive(src)
            except Exception:                  # a malformed record never breaks a render; the field is just missing
                value = None
        if value in (None, ""):
            value = standard
        out[VALUE_PREFIX + token] = None if value in (None, "") else str(value)
    return out


def tokens_in(text: Optional[str]) -> list[str]:
    return list(dict.fromkeys(m.group(1) for m in TOKEN.finditer(text or "")))


def lookup(token: str, field_value: Callable[[str], Optional[str]]) -> Optional[str]:
    """A merge field's value: catalogued tokens by name, and any document field key written in full (company.legal_name)."""
    if token in CATALOG:
        return field_value(VALUE_PREFIX + token)
    if "." in token:
        return field_value(token)
    return None


def fill(text: str, field_value: Callable[[str], Optional[str]]) -> tuple[str, list[str]]:
    """(text with every known merge field replaced, the merge fields that have no value)."""
    missing: list[str] = []

    def sub(m):
        token = m.group(1)
        value = lookup(token, field_value)
        if value in (None, ""):
            if token not in missing:
                missing.append(token)
            return m.group(0)
        return str(value)
    return TOKEN.sub(sub, text or ""), missing
