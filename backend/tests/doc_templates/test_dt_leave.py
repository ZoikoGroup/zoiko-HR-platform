"""Prompt 3 leave: decision records and letters, the sick-reason canary, refusal reasons, balance snapshots, family leave
confirmation and bereavement."""
from datetime import date, timedelta

from app.modules.doc_templates.models import DecisionReceipt
from app.modules.hr.models import EmployeeLifecycle, LeaveBalance, LeaveRequest, LeaveType
from tests.doc_templates.p3_support import activate, all_mail_text, docs, text_of

SICK_CANARY = "CANARY-MIGRAINE-DIAGNOSIS-5521"


def _leave(world, who="a_emp", **body):
    start = date.today() + timedelta(days=10)
    payload = {"leave_type": "annual", "start_date": start.isoformat(), "end_date": (start + timedelta(days=4)).isoformat(),
               "reason": "Family holiday booked months ago", **body}
    r = world.post(who, "/hr/leaves", json=payload)
    assert r.status_code == 201, r.text
    return world.db.get(LeaveRequest, r.json()["id"])


def _balance(world, total=25, used=5, leave_type=LeaveType.ANNUAL):
    world.db.add(LeaveBalance(employee_id=world.u["a_emp"].id, organization_id=1, leave_type=leave_type, total_days=total, used_days=used,
                              pending_days=0, year=(date.today() + timedelta(days=10)).year))
    world.db.commit()


def test_annual_leave_decision_record_and_notice_with_balance_snapshot(world):
    for cid in ("HR-LEV-001", "HR-LEV-018"):
        activate(world.db, cid)
    _balance(world)
    lv = _leave(world, handover_note="Sam covers the weekly report.")
    r = world.put("a_hr", f"/hr/leaves/{lv.id}/review", json={"status": "approved"})
    assert r.status_code == 200, r.text
    world.db.refresh(lv)
    assert (float(lv.balance_before), float(lv.balance_after)) == (20.0, 15.0) and lv.decided_by == world.u["a_hr"].id
    record, notice = docs(world.db, "HR-LEV-001")[0], docs(world.db, "HR-LEV-018")[0]
    assert record.status == "ISSUED" and notice.status == "ISSUED" and lv.document_id == record.id
    t = text_of(record)
    assert "Leave Request — annual leave" in t and "Sam covers the weekly report" in t and "Balance after (if approved) 15" in t
    assert "does not affect any minimum leave entitlement" in t
    n = text_of(notice)
    assert "has been approved by Harper People" in n and "remaining balance after this leave is 15 days" in n
    # the balance printed is the snapshot, not a later recalculation
    b = world.db.query(LeaveBalance).filter_by(employee_id=world.u["a_emp"].id).one()
    b.total_days = 40
    world.db.commit()
    assert "15" in text_of(world.db.get(type(notice), notice.id))
    status = world.get("a_emp", f"/hr/leave-documents/{lv.id}").json()
    assert {d["canonical_id"] for d in status["documents"]} == {"HR-LEV-001", "HR-LEV-018"}


def test_refusal_needs_a_reason_and_nobody_decides_their_own_leave(world):
    activate(world.db, "HR-LEV-018")
    lv = _leave(world)
    r = world.put("a_hr", f"/hr/leaves/{lv.id}/review", json={"status": "rejected"})
    assert r.status_code == 400 and "reason" in r.text.lower()
    own = _leave(world, who="a_hr", start_date=(date.today() + timedelta(days=30)).isoformat(),
                 end_date=(date.today() + timedelta(days=31)).isoformat())
    assert world.put("a_hr", f"/hr/leaves/{own.id}/review", json={"status": "approved"}).status_code == 403
    r = world.put("a_hr", f"/hr/leaves/{lv.id}/review", json={"status": "rejected", "decision_reason": "Peak period cover",
                                                              "alternative_dates": "the week after"})
    assert r.status_code == 200, r.text
    world.db.refresh(lv)
    assert lv.reason == "Family holiday booked months ago", "a review never overwrites the employee's own reason"
    t = text_of(docs(world.db, "HR-LEV-018")[0])
    assert "has been refused" in t and "Reason: Peak period cover" in t and "the week after" in t


def test_sick_reason_never_appears_in_documents_emails_or_manager_responses(world):
    for cid in ("HR-LEV-003", "HR-LEV-018"):
        activate(world.db, cid)
    lv = _leave(world, leave_type="sick", reason=SICK_CANARY, start_date=date.today().isoformat(),
                end_date=(date.today() + timedelta(days=2)).isoformat())
    world.db.refresh(lv)
    assert lv.reason is None and lv.reason_encrypted and SICK_CANARY not in lv.reason_encrypted
    letter = docs(world.db, "HR-LEV-003")[0]
    t = text_of(letter)
    assert letter.status == "ISSUED" and "We have received your sickness absence notification" in t
    assert "You do not need to tell your manager your diagnosis" in t and "we may ask for evidence" in t
    for who in ("a_manager", "a_hr"):
        body = world.get(who, f"/hr/leaves/{lv.id}").text + world.get(who, "/hr/leaves").text
        body += world.get(who, f"/hr/leave-documents/{lv.id}").text
        assert SICK_CANARY not in body, who
    assert world.get("a_manager", f"/hr/leave-documents/{lv.id}/sensitive-reason").status_code == 404
    assert world.get("a_hr", f"/hr/leave-documents/{lv.id}/sensitive-reason").json()["reason"] == SICK_CANARY
    world.put("a_hr", f"/hr/leaves/{lv.id}/review", json={"status": "approved"})
    for d in docs(world.db, "HR-LEV-003") + docs(world.db, "HR-LEV-018"):
        assert SICK_CANARY not in text_of(d)
    assert SICK_CANARY not in all_mail_text(world)
    receipts = " ".join(str(r.inputs) for r in world.db.query(DecisionReceipt).all())
    assert SICK_CANARY not in receipts


def test_sick_notice_needs_no_reason_and_bereavement_asks_for_no_details(world):
    for cid in ("HR-LEV-013", "HR-LEV-018"):
        activate(world.db, cid)
    world.put("a_hr", "/hr/policies/settings", json={"eap_contact": "Example EAP, 0800 000 000"})
    lv = _leave(world, leave_type="bereavement", reason=None, details={"relationship": "prefer not to say"},
                start_date=date.today().isoformat(), end_date=(date.today() + timedelta(days=2)).isoformat())
    assert any(t == "leave_decision_needed.html" and "bereavement" not in str(c).lower() for (_, t, c) in world.mail)
    world.put("a_hr", f"/hr/leaves/{lv.id}/review", json={"status": "approved"})
    t = text_of(docs(world.db, "HR-LEV-013")[0])
    assert "We are very sorry for your loss" in t and "prefer not to say" in t and "Support: Example EAP" in t


def test_family_leave_confirmation_record_and_return_reminder(world):
    for cid in ("HR-LEV-007", "HR-LEV-018"):
        activate(world.db, cid)
    start = date.today() + timedelta(days=60)
    lv = _leave(world, leave_type="maternity", reason="Expecting our first child", start_date=start.isoformat(),
                end_date=(start + timedelta(days=180)).isoformat(),
                details={"parental_type": "maternity", "expected_date": (start + timedelta(days=14)).isoformat(), "kit_days_interest": True})
    r = world.post("a_emp", f"/hr/leave-documents/{lv.id}/confirm-family-leave", json={"expected_return": (start + timedelta(days=181)).isoformat()})
    assert r.status_code == 403
    r = world.post("a_hr", f"/hr/leave-documents/{lv.id}/confirm-family-leave",
                   json={"expected_return": (start + timedelta(days=181)).isoformat(), "pay_summary": "As set out in the family leave policy"})
    assert r.status_code == 200, r.text
    doc = docs(world.db, "HR-LEV-007")[0]
    assert doc.status == "ISSUED" and doc.requested_by == world.u["a_emp"].id and world.u["a_hr"].id in (doc.approved_by or [])
    t = text_of(doc)
    assert "Family Leave Request" in t and "Maternity" in t and "Harper People" in t and "not be treated unfavourably" in t
    world.db.refresh(lv)
    assert lv.status.value == "approved"
    assert world.db.query(EmployeeLifecycle).filter_by(employee_id=world.u["a_emp"].id, event_type="return_to_work").count() == 1
