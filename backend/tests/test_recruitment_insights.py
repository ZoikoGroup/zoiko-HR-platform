"""Recruitment insights: every KPI, panel and list on the redesigned Recruitment screens comes from the organization's rows."""
from datetime import date, datetime, timedelta

from app.modules.hr.models import (InterviewStatus, OfferStatus, RecruitmentCandidate, RecruitmentCandidateStatus,
                                   RecruitmentInterview, RecruitmentInterviewFeedback, RecruitmentOffer, RecruitmentRequisition,
                                   RequisitionStatus)
from tests.test_recruitment_flow import env  # noqa: F401  (fixture)

TODAY = date.today()
NOW = datetime.utcnow()


def _seed(e):
    db = e.db
    reqs = [RecruitmentRequisition(title="Engineer", department="Engineering", location="Pune", openings=2, filled=0, priority="high",
                                   status=RequisitionStatus.OPEN, organization_id=1, created_at=NOW - timedelta(days=3),
                                   hiring_manager_id=e.interviewer.id),
            RecruitmentRequisition(title="Designer", department="Design", openings=1, filled=1, status=RequisitionStatus.OPEN,
                                   organization_id=1, created_at=NOW - timedelta(days=40)),
            RecruitmentRequisition(title="PM", department="Product", openings=1, filled=0, status=RequisitionStatus.PENDING,
                                   organization_id=1, created_at=NOW - timedelta(days=1))]
    db.add_all(reqs)
    db.flush()
    cands = [RecruitmentCandidate(name="Ana", email="ana@x.test", position="Engineer", source="LinkedIn", organization_id=1,
                                  status=RecruitmentCandidateStatus.INTERVIEW, requisition_id=reqs[0].id, applied_at=NOW - timedelta(days=5),
                                  created_at=NOW - timedelta(days=5)),
             RecruitmentCandidate(name="Ben", email="ben@x.test", position="Engineer", source="LinkedIn", organization_id=1,
                                  status=RecruitmentCandidateStatus.APPLIED, applied_at=NOW - timedelta(days=45), created_at=NOW - timedelta(days=45)),
             RecruitmentCandidate(name="Cy", email="cy@x.test", position="Designer", source=None, organization_id=1,
                                  status=RecruitmentCandidateStatus.HIRED, requisition_id=reqs[1].id,
                                  applied_at=NOW - timedelta(days=20), hired_at=NOW - timedelta(days=2), created_at=NOW - timedelta(days=20))]
    db.add_all(cands)
    db.flush()
    ivs = [RecruitmentInterview(candidate_id=cands[0].id, candidate_name="Ana", position="Engineer", interview_type="technical",
                                interview_date=TODAY, start_time="10:00", end_time="11:00", interviewer_id=e.interviewer.id,
                                status=InterviewStatus.SCHEDULED, organization_id=1, meeting_link="https://meet.example/x",
                                created_at=NOW - timedelta(days=1)),
           RecruitmentInterview(candidate_id=cands[0].id, candidate_name="Ana", position="Engineer", interview_type="hr",
                                interview_date=TODAY - timedelta(days=5), start_time="09:00", interviewer_id=e.interviewer.id,
                                status=InterviewStatus.COMPLETED, organization_id=1, created_at=NOW - timedelta(days=6)),
           RecruitmentInterview(candidate_id=cands[0].id, candidate_name="Ana", position="Engineer", interview_type="panel",
                                interview_date=TODAY - timedelta(days=1), interviewer_id=e.interviewer.id,
                                status=InterviewStatus.COMPLETED, organization_id=1, created_at=NOW - timedelta(days=3))]
    db.add_all(ivs)
    db.flush()
    db.add(RecruitmentInterviewFeedback(interview_id=ivs[2].id, interviewer_id=e.hr.id, rating=4, organization_id=1, feedback="good"))
    db.add_all([RecruitmentOffer(candidate_id=cands[0].id, candidate_name="Ana", position="Engineer", salary=100, status=OfferStatus.DRAFT,
                                 organization_id=1, entity_name="Acme India", created_at=NOW - timedelta(days=2)),
                RecruitmentOffer(candidate_id=cands[2].id, candidate_name="Cy", position="Designer", salary=100, status=OfferStatus.ACCEPTED,
                                 organization_id=1, issued_at=NOW - timedelta(days=6), accepted_at=NOW - timedelta(days=4),
                                 created_at=NOW - timedelta(days=8)),
                RecruitmentOffer(candidate_id=cands[1].id, candidate_name="Ben", position="Engineer", salary=100, status=OfferStatus.APPROVED,
                                 organization_id=1, approved_at=NOW - timedelta(days=1), created_at=NOW - timedelta(days=3))])
    db.commit()
    return reqs, cands, ivs


def _get(e, section):
    r = e.c.get("/hr/recruitment/insights", params={"section": section})
    assert r.status_code == 200, r.text
    return r.json()


def test_dashboard_numbers_come_from_the_rows(env):
    _seed(env)
    d = _get(env, "dashboard")
    k = d["kpis"]
    assert k["open_requisitions"]["value"] == 2 and k["active_candidates"]["value"] == 2
    assert k["interviews_this_week"]["window"] == "week" and k["interviews_this_week"]["value"] >= 1
    assert k["offers_in_progress"]["value"] == 2                         # draft + approved
    assert k["time_to_hire"]["value"] == 18.0 and k["time_to_hire"]["better"] == "down"
    assert k["offer_acceptance_rate"]["value"] == 100.0
    assert all(len(v["series"]) == 8 for v in k.values())
    assert k["active_candidates"]["previous"] == 1 and k["active_candidates"]["current"] == 2
    assert {p["key"]: p["count"] for p in d["pipeline"]} == {"sourced": 3, "applied": 1, "screening": 0, "interview": 1, "offer": 0, "hired": 1}
    health = {h["department"]: h for h in d["requisition_health"]}
    assert health["Engineering"]["in_progress"] == 1 and health["Design"]["filled"] == 1
    assert d["upcoming_interviews"][0]["candidate_name"] == "Ana" and d["upcoming_interviews"][0]["interviewer"] == "Lee T"
    assert {s["source"]: s["count"] for s in d["top_sources"]} == {"LinkedIn": 2, "Other": 1}
    assert {a["type"] for a in d["recent_activity"]} >= {"offer_accepted", "candidate_added", "interview_scheduled", "requisition_created"}


def test_no_percentage_is_invented_when_there_is_nothing_to_compare_with(env):
    d = _get(env, "dashboard")
    assert all(v["change_pct"] is None for v in d["kpis"].values())
    assert d["kpis"]["time_to_hire"]["value"] is None and d["kpis"]["offer_acceptance_rate"]["value"] is None


def test_requisitions_interviews_and_offers_sections(env):
    _seed(env)
    r = _get(env, "requisitions")
    assert r["kpis"]["open"]["value"] == 2 and r["kpis"]["pending_approval"]["value"] == 1
    assert r["kpis"]["positions_to_fill"]["value"] == 2 and r["kpis"]["filled_this_month"]["window"] == "month"
    assert r["status_counts"]["all"] == 3 and r["status_counts"]["open"] == 2
    assert r["hiring_managers"] == [{"id": env.interviewer.id, "name": "Lee T"}]

    i = _get(env, "interviews")
    assert i["kpis"]["scheduled_today"]["value"] == 1
    assert i["kpis"]["pending_feedback"]["value"] == 2                     # today's (no feedback yet) and 5 days ago
    assert i["feedback_completion"]["completed"] == 1 and i["feedback_completion"]["overdue"] == 1
    assert i["today_agenda"][0]["candidate_name"] == "Ana"
    assert i["interviewer_workload"][0] == {"interviewer": "Lee T", "count": 3, "pct": 100}
    panel = next(v for v in i["panels"].values() if v["feedback_count"] == 1)
    assert panel["members"] == ["Lee T", "Hana T"]

    o = _get(env, "offers")
    k = o["kpis"]
    assert (k["drafts"]["value"], k["ready_to_send"]["value"], k["sent"]["value"], k["accepted"]["value"]) == (1, 1, 1, 1)
    assert o["entities"] == ["Acme India"]
    assert all("last_activity" in v and "delivery" in v for v in o["activity"].values())


def test_unknown_section_is_refused(env):
    assert env.c.get("/hr/recruitment/insights", params={"section": "salaries"}).status_code == 422


def test_candidates_section_counts_the_whole_pool_by_stage(env):
    _seed(env)
    c = _get(env, "candidates")
    k = c["kpis"]
    assert (k["total"]["value"], k["active"]["value"], k["interview"]["value"], k["hired"]["value"]) == (3, 2, 1, 1)
    assert k["hired"]["change_pct"] is None and k["hired"]["window"] is None      # no trend is claimed for a stage count
    assert c["sources"] == ["LinkedIn"]


def test_onboarding_section_counts_new_hires_tasks_documents_and_checklists(env):
    from app.modules.hr.models import (OnboardingChecklist, OnboardingChecklistItem, OnboardingDocument, OnboardingNewHire,
                                       OnboardingPreboardingTask)
    db = env.db
    a = OnboardingNewHire(organization_id=1, candidate_name="Nia New", email="nia@x.test", position="Engineer", status="in_progress",
                          joining_date=TODAY + timedelta(days=5), manager_id=env.interviewer.id, created_at=NOW - timedelta(days=2))
    b = OnboardingNewHire(organization_id=1, candidate_name="Old Joiner", email="old@x.test", position="Analyst", status="completed",
                          joining_date=TODAY - timedelta(days=40), completed_at=NOW - timedelta(days=1), created_at=NOW - timedelta(days=50))
    db.add_all([a, b]); db.flush()
    cl = OnboardingChecklist(organization_id=1, onboarding_new_hire_id=a.id, name="Day one")
    db.add(cl); db.flush()
    db.add_all([OnboardingChecklistItem(organization_id=1, checklist_id=cl.id, title="Laptop", completed=True, completed_at=NOW),
                OnboardingChecklistItem(organization_id=1, checklist_id=cl.id, title="Badge", completed=False, due_date=TODAY - timedelta(days=1)),
                OnboardingPreboardingTask(organization_id=1, onboarding_new_hire_id=a.id, title="Sign NDA", completed=False),
                OnboardingDocument(organization_id=1, onboarding_new_hire_id=a.id, title="ID proof", category="identity", status="pending")])
    db.commit()
    d = _get(env, "onboarding")
    k = d["kpis"]
    assert (k["active_new_hires"]["value"], k["preboarding_open"]["value"], k["documents_pending"]["value"]) == (1, 1, 1)
    assert k["checklist_completion"]["value"] == 50.0 and k["completed"]["value"] == 1
    assert k["payroll_to_verify"]["window"] is None
    assert {s["key"]: s["count"] for s in d["stages"]}["in_progress"] == 1
    j = d["upcoming_joiners"][0]
    assert (j["name"], j["manager"], j["pct"], j["overdue"], j["open_tasks"], j["pending_documents"]) == ("Nia New", "Lee T", 50, 1, 1, 1)
    assert d["overdue"]["checklist_items"] == 1
