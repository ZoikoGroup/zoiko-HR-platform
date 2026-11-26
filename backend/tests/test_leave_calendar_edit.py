"""Bug 27: HR can move a leave to other dates from the leave calendar (PUT /hr/leaves/{id} with new dates).

- the dates move, the day count follows, the status stays as it was, the employee is told
- the end before the start, a rejected leave, or an overlap with another of the person's leaves is refused with why
- the calendar lists a leave in every month it touches (one moved across a month end shows in both)
"""
from datetime import date, timedelta

from test_leave_notifications_a5 import _no_rate_limit, apply, as_, env, inbox, review  # noqa: F401  (fixtures)


def _move(env, leave_id, start, end):
    as_(env, env.admin)
    return env.put(f"/hr/leaves/{leave_id}", json={"start_date": start.isoformat(), "end_date": end.isoformat()})


def test_hr_moves_an_approved_leave_and_the_employee_is_told(env):
    start = date.today() + timedelta(days=10)
    leave = apply(env, start=start, days=1)                     # 2 days
    review(env, leave["id"], "approved")
    new_start = start + timedelta(days=14)
    r = _move(env, leave["id"], new_start, new_start + timedelta(days=2))
    assert r.status_code == 200, r.text
    body = r.json()
    assert (body["start_date"], body["end_date"], body["days"]) == (new_start.isoformat(), (new_start + timedelta(days=2)).isoformat(), 3)
    assert body["status"] == "approved", "moving a leave does not undo its approval"
    titles = [i["title"] for i in inbox(env, env.emp)["items"]]
    assert "Leave dates changed" in titles
    assert "Leave dates changed" not in [i["title"] for i in inbox(env, env.other)["items"]]


def test_impossible_or_clashing_dates_are_refused_with_the_reason(env):
    start = date.today() + timedelta(days=10)
    first = apply(env, start=start, days=1)
    second = apply(env, start=start + timedelta(days=20), days=1)
    backwards = _move(env, first["id"], start + timedelta(days=3), start)
    assert backwards.status_code == 400 and "end date cannot be before" in backwards.text
    clash = _move(env, first["id"], start + timedelta(days=21), start + timedelta(days=22))
    assert clash.status_code == 400 and "overlap another leave" in clash.text
    review(env, second["id"], "rejected")
    assert _move(env, second["id"], start + timedelta(days=40), start + timedelta(days=41)).status_code == 400
    # once the clashing leave is gone, the same move is accepted
    assert _move(env, first["id"], start + timedelta(days=21), start + timedelta(days=22)).status_code == 200


def test_a_leave_across_a_month_end_shows_in_both_months(env):
    today = date.today()
    first_next = (today.replace(day=1) + timedelta(days=40)).replace(day=1)       # 1st of a month at least a month away
    last_prev = first_next - timedelta(days=1)
    leave = apply(env, start=last_prev - timedelta(days=1), days=3)               # two days in each month
    as_(env, env.admin)
    for d in (last_prev, first_next):
        ids = [e["id"] for e in env.get(f"/hr/leaves/calendar?year={d.year}&month={d.month}").json()]
        assert leave["id"] in ids, f"missing in {d:%B %Y}"
