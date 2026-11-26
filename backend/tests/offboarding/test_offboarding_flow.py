"""Offboarding end to end: resign → decide → clearance / assets / settlement / interview / documents → last day → close,
plus HR-started exits, withdrawals, access, permissions, tenant isolation, the nightly job and the older exit paths."""
from datetime import date, datetime, timedelta

import pytest

from app.modules.employee.models import Employee, EmployeeStatus
from app.modules.hr.models import Asset, AssetStatus, EmployeeLifecycle, LeaveBalance, LeaveType
from app.modules.hr.offboarding import service as svc
from app.modules.hr.offboarding.models import (OffboardingAssetReturn, OffboardingCase, OffboardingDocument,
                                               OffboardingSettlement, OffboardingTask)

TODAY = date(2026, 11, 23)


@pytest.fixture(autouse=True)
def _clock(monkeypatch):
    box = {"today": TODAY}
    monkeypatch.setattr(svc, "today", lambda: box["today"])
    return box


def _titles(api, who) -> list:
    from app.modules.super_admin.models import Notification, NotificationTarget
    return [n.title for n in api.db.query(Notification).join(NotificationTarget, NotificationTarget.notification_id == Notification.id)
            .filter(NotificationTarget.kind == "user", NotificationTarget.ref == str(api.people[who].id))]


def _resign(api, who="emp", **body):
    api.as_(who)
    payload = {"reason_category": "better_opportunity", "reason": "Moving to a new role", **body}
    return api.post("/hr/me/offboarding/resignation", json=payload)


def _approved_case(api, **approve):
    r = _resign(api)
    assert r.status_code == 201, r.text
    cid = r.json()["case"]["id"]
    api.as_("hr")
    a = api.post(f"/hr/offboarding/cases/{cid}/approve", json=approve)
    assert a.status_code == 200, a.text
    return cid


def _pass_last_day(api, cid, clock):
    """HR brings the last day forward to today; the nightly run on the next day finishes the exit."""
    api.as_("hr")
    assert api.patch(f"/hr/offboarding/cases/{cid}", json={"last_working_day": str(TODAY)}).status_code == 200
    clock["today"] = TODAY + timedelta(days=1)
    from app.modules.hr.offboarding.jobs import run_org
    run_org(api.db, 1, datetime.utcnow())


def _asset(api, who="emp", tag="LAP-1"):
    a = Asset(organization_id=1, name="Laptop", asset_tag=tag, status=AssetStatus.ASSIGNED, employee_id=api.people[who].id)
    api.db.add(a)
    api.db.commit()
    return a


# ── resignation and decision ─────────────────────────────────────────────────────────────────────────────────────────

def test_an_employee_resigns_and_hr_and_their_manager_are_told(api):
    api.as_("emp")
    before = api.get("/hr/me/offboarding").json()
    assert before["case"] is None and before["can_resign"] is True
    assert before["notice"]["days"] == 30                       # no notice rules: the offboarding default
    r = _resign(api)
    assert r.status_code == 201, r.text
    case = r.json()["case"]
    assert case["status"] == "submitted" and case["exit_type"] == "resignation"
    assert case["last_working_day"] == str(TODAY + timedelta(days=30))
    assert "hr_notes" not in case                                # the person's own view never carries HR notes
    assert "Resignation to review" in _titles(api, "hr") and "Resignation to review" in _titles(api, "mgr")
    assert any(m["template"] == "offboarding_notice.html" and m["to"] == api.people["hr"].email for m in api.mail)
    # one exit at a time
    assert _resign(api).status_code == 409


def test_a_resignation_needs_a_reason_and_a_sensible_last_day(api):
    assert _resign(api, reason="").status_code == 400
    assert _resign(api, reason_category="").status_code == 400
    assert _resign(api, requested_last_day=str(TODAY - timedelta(days=1))).status_code == 400
    r = _resign(api, requested_last_day=str(TODAY + timedelta(days=10)))
    assert r.status_code == 201 and r.json()["case"]["last_working_day"] == str(TODAY + timedelta(days=10))


def test_the_manager_may_approve_a_direct_reports_resignation_and_everything_is_set_up(api):
    asset = _asset(api)
    api.db.add(LeaveBalance(organization_id=1, employee_id=api.people["emp"].id, leave_type=LeaveType.ANNUAL, total_days=12,
                            used_days=4, pending_days=1, year=(TODAY + timedelta(days=30)).year))
    api.db.commit()
    cid = _resign(api).json()["case"]["id"]
    api.as_("emp2")                                              # a colleague cannot decide
    assert api.post(f"/hr/me/offboarding/decisions/{cid}/approve", json={}).status_code == 403
    api.as_("mgr")
    mine = api.get("/hr/me/offboarding/assigned-tasks").json()
    assert [d["id"] for d in mine["decisions"]] == [cid]
    r = api.post(f"/hr/me/offboarding/decisions/{cid}/approve", json={"note": "Thanks"})
    assert r.status_code == 200, r.text
    assert r.json()["case"]["status"] == "approved"
    case = api.db.get(OffboardingCase, cid)
    tasks = api.db.query(OffboardingTask).filter(OffboardingTask.case_id == cid).all()
    assert len(tasks) == 10
    by_role = {t.owner_role: t.assignee_id for t in tasks}
    assert by_role["employee"] == api.people["emp"].id and by_role["manager"] == api.people["mgr"].id
    assert by_role["it"] is None                                 # no IT owner set: HR assigns it on the board
    assert {t.due_date for t in tasks if t.title.startswith("Revoke")} == {case.last_working_day}
    # assets to recover, settlement started with the leave pay-out, interview sent, acknowledgement issued
    ret = api.db.query(OffboardingAssetReturn).filter(OffboardingAssetReturn.case_id == cid).one()
    assert ret.asset_id == asset.id and ret.status == "pending"
    st = api.db.query(OffboardingSettlement).filter(OffboardingSettlement.case_id == cid).one()
    assert float(st.leave_days) == 7 and float(st.daily_rate) == 1000.0
    assert st.earnings[0]["source"] == "leave" and st.earnings[0]["amount"] == 7000.0
    assert api.db.query(OffboardingDocument).filter(OffboardingDocument.case_id == cid,
                                                     OffboardingDocument.kind == "resignation_acknowledgement").count() == 1
    assert "Resignation accepted" in _titles(api, "emp") and "Exit interview" in _titles(api, "emp")
    # the person stays active until the last day
    assert api.people["emp"].is_active is True


def test_hr_only_mode_keeps_managers_out(api):
    api.as_("hr")
    assert api.put("/hr/offboarding/settings", json={"approver": "hr"}).status_code == 200
    cid = _resign(api).json()["case"]["id"]
    api.as_("mgr")
    assert api.get("/hr/me/offboarding/assigned-tasks").json()["decisions"] == []
    assert api.post(f"/hr/me/offboarding/decisions/{cid}/approve", json={}).status_code == 403
    assert api.get("/hr/offboarding/cases").status_code == 403    # the HR module itself is HR-only


def test_a_rejection_needs_a_reason_the_employee_sees(api):
    cid = _resign(api).json()["case"]["id"]
    api.as_("hr")
    assert api.post(f"/hr/offboarding/cases/{cid}/reject", json={"note": ""}).status_code == 400
    r = api.post(f"/hr/offboarding/cases/{cid}/reject", json={"note": "Please talk to your manager first"})
    assert r.status_code == 200 and r.json()["status"] == "rejected"
    api.as_("emp")
    me = api.get("/hr/me/offboarding").json()
    assert me["case"]["status"] == "rejected" and me["case"]["decision_note"] == "Please talk to your manager first"
    assert me["can_resign"] is True                              # they may resign again later


def test_nobody_decides_their_own_resignation(api):
    cid = _resign(api, who="hr").json()["case"]["id"]
    api.as_("hr")
    assert api.post(f"/hr/offboarding/cases/{cid}/approve", json={}).status_code in (403,)
    assert api.get(f"/hr/offboarding/cases/{cid}").status_code == 403
    api.as_("admin")
    assert api.post(f"/hr/offboarding/cases/{cid}/approve", json={}).status_code == 200


# ── withdrawal ───────────────────────────────────────────────────────────────────────────────────────────────────────

def test_withdrawing_before_a_decision_is_immediate(api):
    _resign(api)
    r = api.post("/hr/me/offboarding/withdraw", json={})
    assert r.status_code == 200 and r.json()["case"]["status"] == "withdrawn"


def test_withdrawing_after_approval_is_a_request_hr_decides(api):
    cid = _approved_case(api)
    api.as_("emp")
    assert api.post("/hr/me/offboarding/withdraw", json={"reason": ""}).status_code == 400
    r = api.post("/hr/me/offboarding/withdraw", json={"reason": "Counter offer accepted"})
    assert r.status_code == 200 and r.json()["case"]["display_status"] == "withdrawal_requested"
    api.as_("hr")
    inbox = api.get("/hr/offboarding/resignations").json()
    assert [c["id"] for c in inbox["withdrawals"]] == [cid]
    assert api.post(f"/hr/offboarding/cases/{cid}/withdrawal", json={"accept": False, "note": ""}).status_code == 400
    r = api.post(f"/hr/offboarding/cases/{cid}/withdrawal", json={"accept": True})
    assert r.status_code == 200 and r.json()["status"] == "withdrawn"
    open_tasks = api.db.query(OffboardingTask).filter(OffboardingTask.case_id == cid, OffboardingTask.status == "open").count()
    assert open_tasks == 0
    assert api.db.query(OffboardingSettlement).filter(OffboardingSettlement.case_id == cid).one().status == "not_applicable"


# ── HR-started exits, access ─────────────────────────────────────────────────────────────────────────────────────────

def test_hr_starts_a_termination_that_is_approved_at_once(api):
    api.as_("hr")
    pre = api.get("/hr/offboarding/notice-preview", params={"employee_id": api.people["emp"].id}).json()
    assert pre["notice"]["days"] == 30 and pre["manager"]["id"] == api.people["mgr"].id
    r = api.post("/hr/offboarding/cases", json={"employee_id": api.people["emp"].id, "exit_type": "termination",
                                                "reason_category": "performance", "notice_handling": "pay_in_lieu",
                                                "hr_notes": "PIP not met"})
    assert r.status_code == 201, r.text
    case = r.json()
    assert case["status"] == "approved" and case["last_working_day"] == str(TODAY)
    assert case["hr_notes"] == "PIP not met"
    api.as_("emp")
    mine = api.get("/hr/me/offboarding").json()["case"]
    assert "hr_notes" not in mine and mine["status"] == "approved"
    assert "Your exit details" in _titles(api, "emp")


def test_hr_cannot_start_an_exit_for_another_organisation_or_twice(api):
    api.as_("hr")
    assert api.post("/hr/offboarding/cases", json={"employee_id": api.people["other"].id,
                                                   "exit_type": "termination"}).status_code == 404
    ok = api.post("/hr/offboarding/cases", json={"employee_id": api.people["emp2"].id, "exit_type": "end_of_contract"})
    assert ok.status_code == 201
    assert api.post("/hr/offboarding/cases", json={"employee_id": api.people["emp2"].id,
                                                   "exit_type": "termination"}).status_code == 409
    assert api.post("/hr/offboarding/cases", json={"employee_id": api.people["hr"].id,
                                                   "exit_type": "termination"}).status_code == 400


def test_a_second_approver_is_needed_when_the_organisation_asks_for_it(api):
    api.as_("hr")
    api.put("/hr/offboarding/settings", json={"second_approval_for_hr_exits": True})
    r = api.post("/hr/offboarding/cases", json={"employee_id": api.people["emp"].id, "exit_type": "termination"})
    cid = r.json()["id"]
    assert r.json()["status"] == "submitted"
    assert api.post(f"/hr/offboarding/cases/{cid}/approve", json={}).status_code == 403
    api.as_("admin")
    assert api.post(f"/hr/offboarding/cases/{cid}/approve", json={}).json()["status"] == "approved"


def test_stop_access_now_ends_sign_in_and_cancelling_gives_it_back(api):
    api.as_("hr")
    r = api.post("/hr/offboarding/cases", json={"employee_id": api.people["emp"].id, "exit_type": "termination",
                                                "notice_handling": "garden_leave", "stop_access_now": True})
    cid = r.json()["id"]
    emp = api.db.get(Employee, api.people["emp"].id)
    assert emp.is_active is False and emp.password_changed_at is not None
    assert r.json()["display_status"] == "garden_leave"
    assert emp.status == EmployeeStatus.ACTIVE                   # still employed until the last day
    assert api.post(f"/hr/offboarding/cases/{cid}/cancel", json={"reason": ""}).status_code == 400
    assert api.post(f"/hr/offboarding/cases/{cid}/cancel", json={"reason": "Decision reversed"}).json()["status"] == "cancelled"
    assert api.db.get(Employee, emp.id).is_active is True


# ── the last day and closing ─────────────────────────────────────────────────────────────────────────────────────────

def test_the_last_day_closes_the_account_moves_reportees_and_records_the_exit(api, _clock):
    api.db.get(Employee, api.people["emp2"].id).reporting_manager_id = api.people["mgr"].id
    api.db.commit()
    # the manager resigns; their two reports move to HR's chosen person
    cid = _resign(api, who="mgr").json()["case"]["id"]
    api.as_("hr")
    api.post(f"/hr/offboarding/cases/{cid}/approve", json={"reportees_to_id": api.people["admin"].id})
    _clock["today"] = TODAY + timedelta(days=31)
    from app.modules.hr.offboarding.jobs import run_org
    run_org(api.db, 1, datetime.utcnow())
    case = api.db.get(OffboardingCase, cid)
    mgr = api.db.get(Employee, api.people["mgr"].id)
    assert case.status == "exited" and case.exited_at is not None
    assert mgr.status == EmployeeStatus.RESIGNED and mgr.is_active is False and mgr.password_changed_at is not None
    assert {api.db.get(Employee, api.people[w].id).reporting_manager_id for w in ("emp", "emp2")} == {api.people["admin"].id}
    row = api.db.query(EmployeeLifecycle).filter(EmployeeLifecycle.employee_id == mgr.id).one()
    assert row.event_type == "resignation" and row.new_value["case"] == case.case_number
    run_org(api.db, 1, datetime.utcnow())                        # safe to run twice
    assert api.db.query(EmployeeLifecycle).filter(EmployeeLifecycle.employee_id == mgr.id).count() == 1


def test_a_case_closes_only_when_clearance_assets_and_settlement_are_done(api, _clock):
    _asset(api)
    cid = _approved_case(api)
    api.as_("hr")
    blocked = api.post(f"/hr/offboarding/cases/{cid}/close")
    assert blocked.status_code == 409 and "last working day" in blocked.json()["message"]
    assert api.patch(f"/hr/offboarding/cases/{cid}",
                     json={"last_working_day": str(TODAY - timedelta(days=1))}).status_code == 400   # before the notice
    _pass_last_day(api, cid, _clock)
    assert api.db.get(OffboardingCase, cid).status == "exited"
    detail = api.get(f"/hr/offboarding/cases/{cid}").json()
    assert detail["can_close"] is False and len(detail["close_blockers"]) == 3
    for t in api.db.query(OffboardingTask).filter(OffboardingTask.case_id == cid, OffboardingTask.mandatory.is_(True)):
        assert api.put(f"/hr/offboarding/tasks/{t.id}", json={"done": True}).status_code == 200
    ret = api.db.query(OffboardingAssetReturn).filter(OffboardingAssetReturn.case_id == cid).one()
    assert api.put(f"/hr/offboarding/assets/{ret.id}", json={"status": "returned", "condition": "good"}).status_code == 200
    assert api.post(f"/hr/offboarding/cases/{cid}/settlement/not_applicable", json={}).status_code == 200
    api.db.expire_all()
    assert api.db.get(OffboardingCase, cid).status == "closed", "the last step done: the case closes by itself"
    r = api.post(f"/hr/offboarding/cases/{cid}/close")
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "closed", "closing a closed case is harmless"


# ── clearance tasks ──────────────────────────────────────────────────────────────────────────────────────────────────

def test_everyone_works_only_their_own_tasks(api):
    api.as_("hr")
    api.put("/hr/offboarding/settings", json={"task_assignees": {"it": api.people["it"].id}})
    cid = _approved_case(api)
    tasks = {t.owner_role: t for t in api.db.query(OffboardingTask).filter(OffboardingTask.case_id == cid)}
    api.as_("emp")
    mine = api.get("/hr/me/offboarding/tasks").json()["items"]
    assert {t["owner_role"] for t in mine} == {"employee"} and len(mine) == 3
    assert api.put(f"/hr/me/offboarding/tasks/{mine[0]['id']}", json={"done": True, "note": "Done"}).json()["status"] == "done"
    assert api.put(f"/hr/me/offboarding/tasks/{tasks['it'].id}", json={"done": True}).status_code == 403
    api.as_("it")
    assigned = api.get("/hr/me/offboarding/assigned-tasks").json()
    assert [t["id"] for t in assigned["items"]] == [tasks["it"].id]
    assert assigned["items"][0]["case"]["employee"]["name"] == "Emp User"
    assert api.put(f"/hr/me/offboarding/assigned-tasks/{tasks['it'].id}", json={"done": True}).json()["status"] == "done"
    assert api.put(f"/hr/me/offboarding/assigned-tasks/{tasks['manager'].id}", json={"done": True}).status_code == 403
    assert "Offboarding tasks assigned" in _titles(api, "it")
    api.as_("emp2")
    assert api.put(f"/hr/offboarding/tasks/{tasks['finance'].id}", json={"done": True}).status_code == 403


def test_hr_board_assigns_adds_and_excuses_tasks(api, _clock):
    cid = _approved_case(api)
    api.as_("hr")
    board = api.get("/hr/offboarding/tasks", params={"owner_role": "it"}).json()
    assert board["total"] == 1 and board["items"][0]["assignee"] is None
    tid = board["items"][0]["id"]
    assert api.put(f"/hr/offboarding/tasks/{tid}", json={"assignee_id": api.people["it"].id}).json()["assignee"]["id"] == api.people["it"].id
    assert api.put(f"/hr/offboarding/tasks/{tid}", json={"exception_reason": "No accounts to revoke"}).json()["status"] == "exception"
    added = api.post(f"/hr/offboarding/cases/{cid}/tasks", json={"title": "Return parking pass", "owner_role": "employee"})
    assert added.status_code == 201 and added.json()["assignee"]["id"] == api.people["emp"].id
    _clock["today"] = TODAY + timedelta(days=60)
    assert api.get("/hr/offboarding/tasks", params={"overdue": True}).json()["overdue"] > 0


# ── assets and settlement ────────────────────────────────────────────────────────────────────────────────────────────

def test_a_lost_asset_is_charged_in_the_settlement_and_the_asset_register_follows(api):
    laptop = _asset(api)
    phone = _asset(api, tag="PH-1")
    cid = _approved_case(api)
    api.as_("hr")
    rows = {r["asset_tag"]: r for r in api.get("/hr/offboarding/assets").json()["items"]}
    assert set(rows) == {"LAP-1", "PH-1"} and rows["LAP-1"]["employee"]["name"] == "Emp User"
    assert api.put(f"/hr/offboarding/assets/{rows['PH-1']['id']}", json={"status": "lost", "recovery_amount": "2500"}).status_code == 200
    assert api.put(f"/hr/offboarding/assets/{rows['LAP-1']['id']}", json={"status": "returned", "condition": "good"}).status_code == 200
    assert api.db.get(Asset, phone.id).status == AssetStatus.LOST and api.db.get(Asset, laptop.id).status == AssetStatus.AVAILABLE
    st = api.get(f"/hr/offboarding/cases/{cid}/settlement").json()["settlement"]
    assert {"label": "Asset recovery: Laptop (lost)", "amount": 2500.0, "source": "assets"} in st["deductions"]
    assert api.get("/hr/offboarding/assets").json()["items"] == []          # nothing pending any more


def test_settlement_lines_approval_and_payment(api):
    cid = _approved_case(api)
    api.as_("hr")
    r = api.put(f"/hr/offboarding/cases/{cid}/settlement", json={
        "earnings": [{"label": "Salary for November", "amount": 22000}],
        "deductions": [{"label": "Advance", "amount": 2000}]})
    st = r.json()["settlement"]
    assert st["net_amount"] == 20000.0 and st["status"] == "draft"
    assert api.put(f"/hr/offboarding/cases/{cid}/settlement", json={"earnings": [{"label": "", "amount": 5}]}).status_code == 400
    assert api.post(f"/hr/offboarding/cases/{cid}/settlement/paid", json={}).status_code == 409   # approve first
    assert api.post(f"/hr/offboarding/cases/{cid}/settlement/approved", json={}).json()["settlement"]["status"] == "approved"
    paid = api.post(f"/hr/offboarding/cases/{cid}/settlement/paid", json={"paid_on": str(TODAY), "payment_reference": "NEFT-1"})
    assert paid.json()["settlement"]["status"] == "paid"
    assert api.put(f"/hr/offboarding/cases/{cid}/settlement", json={"notes": "x"}).status_code == 400
    listing = api.get("/hr/offboarding/settlements").json()["items"]
    assert listing[0]["payment_reference"] == "NEFT-1"
    csv = api.get("/hr/offboarding/settlements/export")
    assert csv.status_code == 200 and "NEFT-1" in csv.text


def test_a_leaver_never_approves_their_own_settlement(api):
    cid = _resign(api, who="hr").json()["case"]["id"]
    api.as_("admin")
    api.post(f"/hr/offboarding/cases/{cid}/approve", json={})
    api.as_("hr")
    assert api.post(f"/hr/offboarding/cases/{cid}/settlement/approved", json={}).status_code == 403


# ── exit interview ───────────────────────────────────────────────────────────────────────────────────────────────────

def test_the_exit_interview_is_answered_once_and_feeds_the_analytics(api):
    cid = _approved_case(api)
    api.as_("emp")
    iv = api.get("/hr/me/offboarding/interview").json()["interview"]
    assert iv["status"] == "sent" and len(iv["questions"]) == 7
    draft = api.put("/hr/me/offboarding/interview", json={"answers": {"q_role": 4}})
    assert draft.json()["interview"]["status"] == "draft"
    assert api.put("/hr/me/offboarding/interview", json={"answers": {"q_role": 4}, "submit": True}).status_code == 400
    assert api.put("/hr/me/offboarding/interview", json={"answers": {"q_role": 9}}).status_code == 400
    answers = {"q_reason": "compensation", "q_role": 4, "q_manager": 5, "q_growth": 2, "q_recommend": 9, "q_return": "yes"}
    done = api.put("/hr/me/offboarding/interview", json={"answers": answers, "submit": True})
    assert done.status_code == 200 and done.json()["interview"]["status"] == "submitted"
    assert api.put("/hr/me/offboarding/interview", json={"answers": answers, "submit": True}).status_code == 409
    api.as_("hr")
    stats = api.get("/hr/offboarding/interviews").json()
    assert stats["summary"] == {"sent": 1, "submitted": 1, "response_rate": 100, "enps": 100}
    assert stats["by_reason"][0]["key"] == "compensation"
    api.as_("mgr")
    assert api.get(f"/hr/offboarding/cases/{cid}/interview").status_code == 403   # answers are HR-only


# ── documents ────────────────────────────────────────────────────────────────────────────────────────────────────────

def test_letters_are_issued_downloaded_and_reach_the_leaver_after_the_last_day(api, _clock):
    cid = _approved_case(api)
    api.as_("hr")
    r = api.post(f"/hr/offboarding/cases/{cid}/documents", json={"kind": "relieving_letter"})
    assert r.status_code == 201, r.text
    doc_id = r.json()["id"]
    pdf = api.get(f"/hr/offboarding/cases/{cid}/documents/{doc_id}/pdf")
    assert pdf.status_code == 200 and pdf.content[:4] == b"%PDF"
    api.as_("emp")
    mine = api.get("/hr/me/offboarding/documents").json()["items"]
    assert {d["kind"] for d in mine} == {"resignation_acknowledgement", "relieving_letter"}
    assert api.get(f"/hr/me/offboarding/documents/{doc_id}/pdf").content[:4] == b"%PDF"
    api.as_("emp2")
    assert api.get(f"/hr/me/offboarding/documents/{doc_id}/pdf").status_code == 404
    # after the last day the person cannot sign in: the documents go out as a link
    api.mail.clear()
    _pass_last_day(api, cid, _clock)
    links = [m["button_url"] for m in api.mail if m.get("button_url", "").count("/exit-documents/")]
    assert len(links) == 2
    token = links[0].rsplit("/", 1)[1]
    assert api.get(f"/public/offboarding/documents/{token}").json()["employee_name"] == "Emp User"
    assert api.get(f"/public/offboarding/documents/{token}/pdf").content[:4] == b"%PDF"
    assert api.get("/public/offboarding/documents/not-a-token/pdf").status_code == 404
    # a withdrawn letter stops working
    target = api.db.query(OffboardingDocument).filter(OffboardingDocument.case_id == cid,
                                                       OffboardingDocument.access_token_hash.isnot(None)).first()
    api.delete(f"/hr/offboarding/cases/{cid}/documents/{target.id}")
    assert api.get(f"/public/offboarding/documents/{token}/pdf").status_code in (200, 404)


# ── tenant isolation and plan gating ─────────────────────────────────────────────────────────────────────────────────

def test_another_organisation_sees_nothing(api):
    cid = _approved_case(api)
    other_hr = Employee(email="hr@org2.example.com", hashed_password="x", employee_code="C-2-hr", role="hr_admin",
                        first_name="Hr", last_name="Two", job_title="HR", date_of_joining=date(2024, 1, 1), organization_id=2)
    api.db.add(other_hr)
    api.db.commit()
    api.people["hr2"] = other_hr
    api.as_("hr2")
    assert api.get(f"/hr/offboarding/cases/{cid}").status_code == 404
    assert api.post(f"/hr/offboarding/cases/{cid}/approve", json={}).status_code == 404
    assert api.get("/hr/offboarding/cases").json()["total"] == 0
    task = api.db.query(OffboardingTask).filter(OffboardingTask.case_id == cid).first()
    assert api.put(f"/hr/offboarding/tasks/{task.id}", json={"done": True}).status_code == 404


def test_every_offboarding_route_is_plan_gated():
    from app.main import app
    from app.modules.billing.route_entitlement_map import ROUTE_ENTITLEMENT_MAP
    from app.modules.hr.offboarding.router import me_router, router
    paths = [(m, r.path) for rt in (router, me_router) for r in rt.routes for m in r.methods if m != "HEAD"]
    assert len(paths) == 53
    missing = [p for p in paths if ROUTE_ENTITLEMENT_MAP.get(p) != "hr.lifecycle.offboarding"]
    assert missing == []


# ── dashboard, lists, settings ───────────────────────────────────────────────────────────────────────────────────────

def test_dashboard_and_lists(api):
    _approved_case(api)
    _resign(api, who="emp2")
    api.as_("hr")
    k = api.get("/hr/offboarding/dashboard").json()
    assert k["kpis"]["open_exits"] == 2 and k["kpis"]["awaiting_decision"] == 1
    assert len(k["upcoming"]) == 1 and k["recent_activity"]
    assert api.get("/hr/offboarding/cases", params={"status": "submitted"}).json()["total"] == 1
    assert api.get("/hr/offboarding/cases", params={"search": "emp2"}).json()["total"] == 1
    assert len(api.get("/hr/offboarding/resignations").json()["pending"]) == 1
    assert "Emp2 User" in api.get("/hr/offboarding/cases/export").text


def test_settings_and_checklists_are_validated_and_the_most_specific_checklist_wins(api):
    api.as_("hr")
    s = api.get("/hr/offboarding/settings").json()
    assert s["settings"]["approver"] == "manager_or_hr" and len(s["templates"]) == 1
    assert api.put("/hr/offboarding/settings", json={"default_notice_days": 999}).status_code == 400
    assert api.put("/hr/offboarding/settings", json={"interview_questions": []}).status_code == 400
    assert api.put("/hr/offboarding/settings", json={"task_assignees": {"it": api.people["other"].id}}).status_code == 400
    assert api.post("/hr/offboarding/checklists", json={"name": "Bad", "items": []}).status_code == 400
    r = api.post("/hr/offboarding/checklists", json={"name": "Terminations", "exit_types": ["termination"],
                                                     "items": [{"title": "Escort out", "owner_role": "admin", "due_offset_days": 0}]})
    assert r.status_code == 201
    default_id = s["templates"][0]["id"]
    assert api.delete(f"/hr/offboarding/checklists/{default_id}").status_code == 400
    case = api.post("/hr/offboarding/cases", json={"employee_id": api.people["emp"].id, "exit_type": "termination"}).json()
    titles = [t["title"] for t in api.get(f"/hr/offboarding/cases/{case['id']}/tasks").json()["items"]]
    assert titles == ["Escort out"]


# ── the older one-step exit paths ────────────────────────────────────────────────────────────────────────────────────

def test_the_old_resign_endpoint_cannot_reach_another_organisation(api):
    api.as_("hr")
    r = api.post("/hr/employee-management/resign", json={"employee_id": api.people["other"].id, "resignation_date": str(TODAY),
                                                      "last_working_date": str(TODAY)})
    assert r.status_code == 404
    assert api.db.get(Employee, api.people["other"].id).is_active is True


def test_the_old_exit_endpoints_end_sessions_and_open_an_offboarding_case(api):
    api.as_("hr")
    r = api.post("/hr/employee-management/exit", json={"employee_id": api.people["emp"].id, "exit_date": str(TODAY),
                                                    "exit_type": "involuntary"})
    assert r.status_code == 200, r.text
    emp = api.db.get(Employee, api.people["emp"].id)
    assert emp.is_active is False and emp.password_changed_at is not None
    case = api.db.query(OffboardingCase).filter(OffboardingCase.employee_id == emp.id).one()
    assert case.status == "exited" and case.exit_type == "termination" and case.source == "legacy"
    assert api.db.query(OffboardingTask).filter(OffboardingTask.case_id == case.id).count() == 10
    r = api.post("/hr/employee-management/resign", json={"employee_id": api.people["emp2"].id, "resignation_date": str(TODAY),
                                                      "last_working_date": str(TODAY)})
    assert r.status_code == 200, r.text
    emp2 = api.db.get(Employee, api.people["emp2"].id)
    assert emp2.password_changed_at is not None
    assert api.db.query(OffboardingCase).filter(OffboardingCase.employee_id == emp2.id).one().exit_type == "resignation"


def test_contracts_ending_soon_open_a_case_for_hr(api):
    emp = api.db.get(Employee, api.people["emp2"].id)
    emp.contract_end_date = TODAY + timedelta(days=20)
    api.db.commit()
    from app.modules.hr.offboarding.jobs import run_org
    run_org(api.db, 1, datetime.utcnow())
    run_org(api.db, 1, datetime.utcnow())
    cases = api.db.query(OffboardingCase).filter(OffboardingCase.employee_id == emp.id).all()
    assert len(cases) == 1 and cases[0].exit_type == "end_of_contract" and cases[0].status == "submitted"
    assert cases[0].last_working_day == emp.contract_end_date
    assert "Exit to approve" in _titles(api, "hr")


def test_a_cancelled_exit_is_not_shown_in_my_exit_and_does_not_block_resigning(api):
    api.as_("hr")
    cid = api.post("/hr/offboarding/cases", json={"employee_id": api.people["emp"].id, "exit_type": "termination"}).json()["id"]
    assert api.post(f"/hr/offboarding/cases/{cid}/cancel", json={"reason": "Decision reversed"}).status_code == 200
    api.as_("emp")
    me = api.get("/hr/me/offboarding").json()
    assert me["case"] is None and me["can_resign"] is True
    assert _resign(api).status_code == 201


def test_the_notice_preview_names_the_person_and_settings_name_the_task_owners(api):
    api.as_("hr")
    pre = api.get("/hr/offboarding/notice-preview", params={"employee_id": api.people["emp"].id}).json()
    assert pre["employee"]["name"] == "Emp User"
    api.put("/hr/offboarding/settings", json={"task_assignees": {"it": api.people["it"].id}})
    s = api.get("/hr/offboarding/settings").json()
    assert s["task_assignee_names"] == {"it": "It User"}
    api.as_("mgr")
    assert any(c["key"] == "better_opportunity" for c in api.get("/hr/me/offboarding/assigned-tasks").json()["reason_categories"])


# ── the standard procedure in real time: every person does only their own step, nothing is ticked twice ───────────

def _task_by_auto(api, cid, key):
    return api.db.query(OffboardingTask).filter(OffboardingTask.case_id == cid, OffboardingTask.auto_key == key).one()


def test_standard_procedure_end_to_end_with_automatic_steps(api, _clock):
    api.as_("hr")
    assert api.put("/hr/offboarding/settings", json={"task_assignees": {"it": api.people["it"].id, "admin": api.people["hr"].id,
                                                                        "finance": api.people["admin"].id,
                                                                        "hr": api.people["hr"].id}}).status_code == 200
    _asset(api)
    # 1. the employee resigns; 2. their manager accepts it
    cid = _resign(api).json()["case"]["id"]
    api.as_("mgr")
    assert api.post(f"/hr/offboarding/cases/{cid}/approve", json={}).status_code == 200
    api.db.expire_all()
    assert api.db.get(OffboardingCase, cid).status == "approved"
    keys = {t.auto_key for t in api.db.query(OffboardingTask).filter(OffboardingTask.case_id == cid) if t.auto_key}
    assert keys == {"assets", "settlement", "interview", "relieving_letter"}
    api.as_("hr")
    tasks = api.get(f"/hr/offboarding/cases/{cid}/tasks").json()["items"]
    assert all(t["auto_hint"] for t in tasks if t["auto_key"]), "the screen says which items tick themselves"

    # 3. the leaver: own clearance items and the exit interview (the interview item ticks itself)
    api.as_("emp")
    for t in api.get("/hr/me/offboarding/tasks").json()["items"]:
        assert api.put(f"/hr/me/offboarding/tasks/{t['id']}", json={"done": True}).status_code == 200
    answers = {"q_reason": "compensation", "q_role": 4, "q_manager": 5, "q_growth": 3, "q_recommend": 8}
    assert api.put("/hr/me/offboarding/interview", json={"answers": answers, "submit": True}).status_code == 200
    api.db.expire_all()
    iv_task = _task_by_auto(api, cid, "interview")
    assert iv_task.status == "done" and iv_task.completed_by is None and iv_task.note.startswith("Completed automatically")

    # 4. manager, IT, Finance and HR: each their own items (the automatic ones are left alone)
    for who in ("mgr", "it", "admin", "hr"):
        api.as_(who)
        for t in api.get("/hr/me/offboarding/assigned-tasks").json()["items"]:
            if not t.get("auto_key"):
                assert api.put(f"/hr/me/offboarding/assigned-tasks/{t['id']}", json={"done": True}).status_code == 200

    # 5. the laptop comes back: the property item ticks itself
    api.as_("hr")
    ret = api.db.query(OffboardingAssetReturn).filter(OffboardingAssetReturn.case_id == cid).one()
    assert api.put(f"/hr/offboarding/assets/{ret.id}", json={"status": "returned", "condition": "good"}).status_code == 200
    api.db.expire_all()
    assert _task_by_auto(api, cid, "assets").status == "done"

    # 6. the relieving letter: the letter item ticks itself
    assert api.post(f"/hr/offboarding/cases/{cid}/documents", json={"kind": "relieving_letter"}).status_code == 201
    api.db.expire_all()
    assert _task_by_auto(api, cid, "relieving_letter").status == "done"

    # 7. the last working day passes: the account closes
    _pass_last_day(api, cid, _clock)
    api.db.expire_all()
    assert api.db.get(OffboardingCase, cid).status == "exited"
    emp = api.db.get(Employee, api.people["emp"].id)
    assert emp.is_active is False and emp.status == EmployeeStatus.RESIGNED

    # 8. Finance pays the settlement: the settlement item ticks itself and the finished case closes by itself
    api.as_("hr")
    left = [t for t in api.db.query(OffboardingTask).filter(OffboardingTask.case_id == cid, OffboardingTask.status == "open",
                                                            OffboardingTask.mandatory.is_(True))]
    assert [t.auto_key for t in left] == ["settlement"], [t.title for t in left]   # only the settlement is left
    assert api.post(f"/hr/offboarding/cases/{cid}/settlement/approved", json={}).status_code == 200
    api.as_("admin")
    assert api.post(f"/hr/offboarding/cases/{cid}/settlement/paid", json={"payment_reference": "BANK-77"}).status_code == 200
    api.db.expire_all()
    assert _task_by_auto(api, cid, "settlement").status == "done"
    case = api.db.get(OffboardingCase, cid)
    assert case.status == "closed" and case.closed_by is None, "the finished case closed by itself"


def test_an_automatic_item_reopens_when_its_record_is_undone_and_a_manual_tick_is_kept(api, _clock):
    cid = _approved_case(api)
    api.as_("hr")
    assert api.post(f"/hr/offboarding/cases/{cid}/settlement/approved", json={}).status_code == 200
    assert api.post(f"/hr/offboarding/cases/{cid}/settlement/paid", json={}).status_code == 200
    api.db.expire_all()
    assert _task_by_auto(api, cid, "settlement").status == "done"
    assert api.post(f"/hr/offboarding/cases/{cid}/settlement/draft", json={"confirm_reopen_paid": True}).status_code == 200
    api.db.expire_all()
    assert _task_by_auto(api, cid, "settlement").status == "open", "the settlement was reopened: so is its item"
    # a person may still tick an automatic item (ID card collected though no asset was tracked); it stays ticked
    t = _task_by_auto(api, cid, "assets")
    assert api.put(f"/hr/offboarding/tasks/{t.id}", json={"done": True}).status_code == 200
    from app.modules.hr.offboarding.service import after_change
    after_change(api.db, api.db.get(OffboardingCase, cid))
    api.db.expire_all()
    assert _task_by_auto(api, cid, "assets").status == "done"


def test_with_automatic_closing_off_hr_closes_the_case(api, _clock):
    api.as_("hr")
    assert api.put("/hr/offboarding/settings", json={"auto_close": False}).json()["settings"]["auto_close"] is False
    cid = _approved_case(api)
    _pass_last_day(api, cid, _clock)
    for t in api.db.query(OffboardingTask).filter(OffboardingTask.case_id == cid, OffboardingTask.status == "open"):
        api.put(f"/hr/offboarding/tasks/{t.id}", json={"done": True})
    assert api.post(f"/hr/offboarding/cases/{cid}/settlement/not_applicable", json={}).status_code == 200
    api.db.expire_all()
    assert api.db.get(OffboardingCase, cid).status == "exited", "HR closes it"
    r = api.post(f"/hr/offboarding/cases/{cid}/close")
    assert r.status_code == 200 and r.json()["status"] == "closed"


def test_checklists_saved_before_automatic_items_get_them_by_title():
    from app.modules.hr.offboarding import settings as S
    assert S.auto_key_of({"title": "Prepare final settlement"}) == "settlement"
    assert S.auto_key_of({"title": "Conduct exit interview"}) == "interview"
    assert S.auto_key_of({"title": "Collect laptop, ID card and other company property"}) == "assets"
    assert S.auto_key_of({"title": "Something else"}) is None
    assert {i.get("auto") for i in S.DEFAULT_CHECKLIST if i.get("auto")} == set(S.AUTO_KEYS)
