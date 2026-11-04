"""Module fields for recruitment, workforce planning and onboarding (Prompt 2). Registered into fields.REGISTRY.

Sources read the record named by the document's source_ref (`ctx.source`: an offer, requisition, interview feedback, headcount
request, position, job description, succession plan, onboarding form, lifecycle event) or values the integration module put on
the context (`ctx.extra`, filled by its context provider). List and table fields return display-ready strings / rows.
"""
from __future__ import annotations

from decimal import Decimal
from typing import Any

from app.core.privacy.classification import Level
from app.modules.doc_templates import formatting
from app.modules.doc_templates.fields import _attr, _full_name, register

L = Level

WORK_ARRANGEMENTS = {"onsite": "On site", "hybrid": "Hybrid", "remote": "Remote"}
PERIOD_LABELS = {"annual": "per year", "monthly": "per month", "weekly": "per week", "hourly": "per hour", "one_time": "one-off"}
REMUNERATION_LABELS = {"salary": "Salary", "stipend": "Stipend", "fee": "Fee"}
REQUISITION_REASONS = {"new_role": "New role", "replacement": "Replacement", "backfill": "Backfill", "growth": "Growth"}
EMPLOYMENT_TYPES = {"full_time": "Full-time", "part_time": "Part-time", "contract": "Fixed-term / contract", "internship": "Internship",
                    "intern": "Internship", "freelance": "Freelance"}
READINESS = {"not_ready": "Not ready", "moderately_ready": "3+ years", "ready": "1–2 years", "fully_ready": "Ready now"}
DECISIONS = {"approved": "Approved", "rejected": "Rejected", "open": "Approved", "closed": "Rejected"}


def _src(ctx, cls_name: str):
    s = ctx.source
    return s if s is not None and type(s).__name__ == cls_name else None


def _offer(ctx):
    return _src(ctx, "RecruitmentOffer")


def _emp(ctx, emp_id):
    if not emp_id:
        return None
    from app.modules.employee.models import Employee
    return ctx.cached(("emp", emp_id), lambda: ctx.db.get(Employee, emp_id))


def _dept_name(ctx, dept_id):
    if not dept_id:
        return None
    from app.modules.hr.models import Department
    d = ctx.cached(("dept", dept_id), lambda: ctx.db.get(Department, dept_id))
    return d.name if d else None


def _date(ctx, v):
    return formatting.format_date(v, ctx.language, ctx.country()) if v else ""


def _amount(v, currency, ctx):
    """'25,000.00' (the currency is printed separately where the template asks for it)."""
    if v in (None, ""):
        return None
    country = getattr(_offer(ctx), "work_country", None) or ctx.country()
    text = formatting.format_money(v, currency, ctx.language, country)
    return text.split(" ", 1)[1] if " " in text else text


def _x(key):
    return lambda c: c.extra.get(key)


def reg(key, label, type_, level, source, sample=None):
    register(key, label, type_, level, source, sample)


# ── offers ───────────────────────────────────────────────────────────────────────────────────────────────────────────

def _offer_ref(c):
    o = _offer(c)
    return f"OFR-{o.id:05d}" if o else None


reg("offer.reference", "Offer reference", "text", L.TENANT_CUSTOMER, _offer_ref, "OFR-00042")
reg("offer.pay_amount", "Pay amount", "text", L.FINANCIAL, lambda c: _amount(getattr(_offer(c), "salary", None), getattr(_offer(c), "currency", None), c),
    "42,000.00")
reg("offer.currency", "Currency", "text", L.FINANCIAL, lambda c: getattr(_offer(c), "currency", None), "GBP")
reg("offer.pay_period_label", "Pay period", "text", L.FINANCIAL, lambda c: PERIOD_LABELS.get(getattr(_offer(c), "pay_period", None) or ""),
    "per year")
reg("offer.remuneration_type_label", "Remuneration type", "text", L.FINANCIAL,
    lambda c: REMUNERATION_LABELS.get(getattr(_offer(c), "remuneration_type", None) or ""), "Salary")


def _components(c):
    o = _offer(c)
    rows = []
    for comp in (getattr(o, "components", None) or []):
        if isinstance(comp, dict) and comp.get("label"):
            rows.append([comp["label"], _amount(comp.get("amount"), o.currency, c) or "", PERIOD_LABELS.get(comp.get("frequency"), comp.get("frequency") or "")])
    return rows or None


reg("offer.components", "Pay components", "rows", L.FINANCIAL, _components, [["Travel allowance", "1,200.00", "per year"]])
reg("offer.benefits_summary", "Benefits summary", "text", L.FINANCIAL, lambda c: getattr(_offer(c), "benefits_summary", None),
    "Pension scheme and private medical cover")
reg("offer.equity", "Equity", "text", L.FINANCIAL, lambda c: getattr(_offer(c), "equity", None), None)


def _open_conditions(c):
    o = _offer(c)
    out = []
    for cond in (getattr(o, "conditions", None) or []):
        if isinstance(cond, dict) and cond.get("description") and cond.get("status", "open") != "cleared":
            due = cond.get("due_by")
            out.append(cond["description"] + (f" — to be completed by {_date(c, due)}" if due else ""))
    return out or None


reg("offer.conditions", "Open offer conditions", "list", L.TENANT_CUSTOMER, _open_conditions,
    ["Satisfactory references — to be completed by 16 November 2026"])
reg("offer.has_conditions", "Offer has open conditions", "bool", L.TENANT_CUSTOMER, lambda c: bool(_open_conditions(c)), True)
reg("offer.response_deadline", "Response deadline", "date", L.TENANT_CUSTOMER, lambda c: getattr(_offer(c), "response_deadline", None)
    or c.document.get("response_deadline"), None)
reg("offer.work_arrangement_label", "Working arrangement", "text", L.TENANT_CUSTOMER,
    lambda c: WORK_ARRANGEMENTS.get(getattr(_offer(c), "work_arrangement", None) or ""), "Hybrid")
reg("offer.hours_per_week", "Hours per week", "text", L.TENANT_CUSTOMER,
    lambda c: (f"{Decimal(_offer(c).hours_per_week).normalize():f}" if getattr(_offer(c), "hours_per_week", None) is not None else None), "22.5")
reg("offer.contract_end_date", "Fixed-term end date", "date", L.TENANT_CUSTOMER, lambda c: getattr(_offer(c), "contract_end_date", None), None)
reg("offer.internship_end_date", "Internship end date", "date", L.TENANT_CUSTOMER, lambda c: getattr(_offer(c), "internship_end_date", None), None)
reg("offer.fixed_term_reason", "Reason for fixed term", "text", L.TENANT_CUSTOMER, lambda c: getattr(_offer(c), "fixed_term_reason", None),
    "Cover for a parental leave absence")
reg("offer.probation_months", "Probation (months)", "number", L.TENANT_CUSTOMER, lambda c: getattr(_offer(c), "probation_months", None), None)
reg("offer.learning_objectives", "Learning objectives", "list", L.TENANT_CUSTOMER,
    lambda c: [x for x in (getattr(_offer(c), "learning_objectives", None) or []) if isinstance(x, str) and x.strip()] or None,
    ["Learn our analysis tools", "Deliver a supervised project"])
reg("offer.mentor_name", "Mentor", "text", L.PERSONAL_BASIC, lambda c: _full_name(_emp(c, getattr(_offer(c), "mentor_id", None))), "Morgan Mentor")
reg("offer.academic_institution", "Academic institution", "text", L.TENANT_CUSTOMER,
    lambda c: getattr(_offer(c), "academic_institution", None), None)
reg("offer.issue_date", "Offer date", "date", L.TENANT_CUSTOMER,
    lambda c: (getattr(_offer(c), "issued_at", None) or getattr(_offer(c), "created_at", None)), None)
reg("offer.accepted_at", "Accepted on", "date", L.TENANT_CUSTOMER, lambda c: getattr(_offer(c), "accepted_at", None), None)
reg("offer.previous_reference", "Previous offer reference", "text", L.TENANT_CUSTOMER, _x("offer.previous_reference"), "OFR-00041")
reg("offer.previous_date", "Previous offer date", "date", L.TENANT_CUSTOMER, _x("offer.previous_date"), None)
reg("offer.changes", "Offer changes", "rows", L.FINANCIAL, _x("offer.changes"), [["Start date", "2 November 2026", "16 November 2026"]])
reg("offer.withdrawal_reason_category", "Withdrawal reason (code)", "text", L.TENANT_CUSTOMER,
    lambda c: getattr(_offer(c), "withdrawal_reason_category", None), "role_cancelled")
reg("offer.withdrawal_reason_statement", "Withdrawal statement", "text", L.TENANT_CUSTOMER,
    lambda c: getattr(_offer(c), "withdrawal_reason_note", None), "We are sorry that the role is no longer available.")
reg("offer.condition_not_met", "Condition not met", "text", L.TENANT_CUSTOMER, lambda c: getattr(_offer(c), "withdrawal_condition", None), None)

# ── candidates and recruitment settings ──────────────────────────────────────────────────────────────────────────────

reg("candidate.stage_reached", "Stage reached", "text", L.TENANT_CUSTOMER,
    lambda c: getattr(c.subject, "stage_reached", None) if c.subject_type == "candidate" else None, "interview")
reg("candidate.personal_note", "Personal note", "text", L.TENANT_CUSTOMER,
    lambda c: getattr(c.subject, "rejection_note", None) if c.subject_type == "candidate" else None, None)


def _rec_setting(key):
    def source(c):
        from app.modules.hr import recruitment_documents as rd
        return rd.privacy_setting(c.db, c.organization.id, key)
    return source


reg("recruitment.privacy_contact_email", "Recruitment privacy contact", "text", L.PERSONAL_BASIC, _rec_setting("privacy_contact_email"),
    "privacy@example.com")
reg("recruitment.retention_months", "Candidate data retention (months)", "number", L.PLATFORM_META,
    _rec_setting("candidate_data_retention_months"), 12)
reg("recruitment.uses_cv_parsing", "Automated CV reading in use", "bool", L.PLATFORM_META, _rec_setting("uses_cv_parsing"), True)
reg("recruitment.talent_pool_opt_in_url", "Talent pool opt-in link", "text", L.PLATFORM_META, _rec_setting("talent_pool_opt_in_url"), None)

# ── requisitions ─────────────────────────────────────────────────────────────────────────────────────────────────────

def _req(c):
    return _src(c, "RecruitmentRequisition") or (getattr(c, "_requisition", None))


def _requisition_of(c):
    r = _src(c, "RecruitmentRequisition")
    if r is not None:
        return r
    fb = _src(c, "RecruitmentInterviewFeedback")
    from app.modules.hr.models import RecruitmentCandidate, RecruitmentInterview, RecruitmentRequisition
    cand = None
    if fb is not None:
        iv = c.cached(("iv", fb.interview_id), lambda: c.db.get(RecruitmentInterview, fb.interview_id))
        cand = c.cached(("cand", iv.candidate_id), lambda: c.db.get(RecruitmentCandidate, iv.candidate_id)) if iv and iv.candidate_id else None
    elif c.subject_type == "candidate":
        cand = c.subject
    if cand is not None and cand.requisition_id:
        return c.cached(("req", cand.requisition_id), lambda: c.db.get(RecruitmentRequisition, cand.requisition_id))
    return None


def _budget(c):
    r = _requisition_of(c)
    if r is None or (r.budget_min is None and r.budget_max is None):
        return None
    lo, hi = _amount(r.budget_min, r.currency, c), _amount(r.budget_max, r.currency, c)
    return f"{lo} – {hi}" if lo and hi else (lo or hi)


reg("requisition.reference", "Requisition reference", "text", L.PLATFORM_META, lambda c: f"REQ-{_requisition_of(c).id:05d}" if _requisition_of(c) else None,
    "REQ-00007")
reg("requisition.title", "Requisition title", "text", L.PERSONAL_BASIC,
    lambda c: getattr(_requisition_of(c), "title", None) or getattr(c.subject, "position", None), "Senior Analyst")
reg("requisition.department", "Department", "text", L.PERSONAL_BASIC, lambda c: getattr(_requisition_of(c), "department", None), "Operations")
reg("requisition.hiring_manager", "Hiring manager", "text", L.PERSONAL_BASIC,
    lambda c: _full_name(_emp(c, getattr(_requisition_of(c), "hiring_manager_id", None))), "Morgan Manager")
reg("requisition.headcount", "Number of positions", "number", L.PERSONAL_BASIC, lambda c: getattr(_requisition_of(c), "openings", None), 1)
reg("requisition.employment_type_label", "Employment type", "text", L.PERSONAL_BASIC,
    lambda c: EMPLOYMENT_TYPES.get(getattr(_requisition_of(c), "employment_type", None) or ""), "Full-time")
reg("requisition.work_location", "Work location", "text", L.PERSONAL_BASIC, lambda c: getattr(_requisition_of(c), "location", None), "Leeds")
reg("requisition.reason", "Reason", "text", L.PERSONAL_BASIC, lambda c: REQUISITION_REASONS.get(getattr(_requisition_of(c), "reason", None) or ""),
    "Growth")
reg("requisition.replaces_employee_ref", "Replaces (employee ID)", "text", L.PERSONAL_BASIC,
    lambda c: (f"Employee #{_requisition_of(c).replaces_employee_id}" if getattr(_requisition_of(c), "replaces_employee_id", None) else None), None)
reg("requisition.budget_range", "Budget range", "text", L.FINANCIAL, _budget, "38,000.00 – 45,000.00")
reg("requisition.currency", "Budget currency", "text", L.FINANCIAL, lambda c: getattr(_requisition_of(c), "currency", None), "GBP")
reg("requisition.target_start_date", "Target start date", "date", L.PERSONAL_BASIC, lambda c: getattr(_requisition_of(c), "target_start_date", None), None)
reg("requisition.headcount_plan_ref", "Headcount authorization", "text", L.PLATFORM_META,
    lambda c: (f"HC-{_requisition_of(c).headcount_id:05d}" if getattr(_requisition_of(c), "headcount_id", None) else None), None)
reg("requisition.justification", "Business justification", "text", L.PERSONAL_BASIC, lambda c: getattr(_requisition_of(c), "justification", None),
    "Demand in the region has doubled.")

# ── approvals on the source record (requisition, headcount, position, succession, job description) ─────────────────

def _decision(c):
    s = c.source
    if s is None:
        return None
    status = getattr(s, "approval_status", None) or getattr(s, "status", None)
    status = getattr(status, "value", status)
    return DECISIONS.get(str(status).lower()) if status else None


reg("approval.decision", "Decision", "text", L.PLATFORM_META, _decision, "Approved")
reg("approval.approver_name", "Approver", "text", L.PERSONAL_BASIC, lambda c: _full_name(_emp(c, getattr(c.source, "decided_by", None))), "Avery Admin")
reg("approval.decided_at", "Decided on", "date", L.PLATFORM_META, lambda c: getattr(c.source, "decided_at", None), None)
reg("approval.comment", "Approval comment", "text", L.PERSONAL_BASIC, lambda c: getattr(c.source, "decision_comment", None), None)

# ── interviews and scorecards ────────────────────────────────────────────────────────────────────────────────────────

def _fb(c):
    return _src(c, "RecruitmentInterviewFeedback")


def _iv(c):
    fb = _fb(c)
    if fb is None:
        return None
    from app.modules.hr.models import RecruitmentInterview
    return c.cached(("iv", fb.interview_id), lambda: c.db.get(RecruitmentInterview, fb.interview_id))


INTERVIEW_MODES = {"phone": "Phone", "video": "Video", "in_person": "In person", "technical": "Technical", "panel": "Panel", "hr": "HR"}
RECOMMENDATIONS = {"proceed": "Proceed", "hold": "Hold", "do_not_proceed": "Do not proceed"}

reg("interview.date", "Interview date", "date", L.TENANT_CUSTOMER, lambda c: getattr(_iv(c), "interview_date", None), None)
reg("interview.stage", "Interview stage", "text", L.TENANT_CUSTOMER,
    lambda c: getattr(_fb(c), "stage", None) or INTERVIEW_MODES.get(getattr(_iv(c), "interview_type", None) or ""), "First interview")
reg("interview.mode", "Interview mode", "text", L.TENANT_CUSTOMER, lambda c: INTERVIEW_MODES.get(getattr(_iv(c), "interview_type", None) or ""), "Video")
reg("interview.panel", "Interview panel", "text", L.PERSONAL_BASIC,
    lambda c: _full_name(_emp(c, getattr(_fb(c), "interviewer_id", None))) or getattr(_iv(c), "interviewer", None), "Morgan Manager")
reg("interview.questions_asked", "Questions asked", "list", L.TENANT_CUSTOMER,
    lambda c: [q for q in (getattr(_fb(c), "questions", None) or []) if isinstance(q, str) and q.strip()] or None,
    ["Tell us about a project you led."])
reg("interview.evidence_notes", "Evidence observed", "text", L.TENANT_CUSTOMER, lambda c: getattr(_fb(c), "evidence_notes", None), None)
reg("interview.strengths", "Strengths", "text", L.TENANT_CUSTOMER, lambda c: getattr(_fb(c), "strengths", None), None)
reg("interview.concerns", "Concerns", "text", L.TENANT_CUSTOMER, lambda c: getattr(_fb(c), "concerns", None), None)
reg("interview.adjustments_provided", "Adjustments provided", "text", L.TENANT_CUSTOMER, lambda c: getattr(_fb(c), "adjustments_provided", None), None)
reg("interview.recommendation", "Recommendation", "text", L.TENANT_CUSTOMER,
    lambda c: RECOMMENDATIONS.get(getattr(_fb(c), "recommendation", None) or ""), "Proceed")
reg("interview.recommendation_reason", "Reason for recommendation", "text", L.TENANT_CUSTOMER,
    lambda c: getattr(_fb(c), "recommendation_reason", None), None)


def _scores(c):
    fb = _fb(c)
    rows = []
    for s in (getattr(fb, "scores", None) or []):
        if isinstance(s, dict):
            rows.append([s.get("label") or s.get("criterion_key") or "", str(s.get("weight", "")), str(s.get("score", "")), s.get("evidence") or ""])
    return rows or None


reg("scorecard.scores", "Scores", "rows", L.TENANT_CUSTOMER, _scores, [["Communication", "2", "4", "Explained the trade-offs clearly."]])
reg("scorecard.weighted_total", "Weighted total", "text", L.TENANT_CUSTOMER,
    lambda c: (f"{Decimal(_fb(c).weighted_total).quantize(Decimal('0.01'))} / 5" if getattr(_fb(c), "weighted_total", None) is not None else None),
    "3.80 / 5")
reg("scorecard.interviewer", "Interviewer", "text", L.PERSONAL_BASIC, lambda c: _full_name(_emp(c, getattr(_fb(c), "interviewer_id", None))),
    "Morgan Manager")
reg("scorecard.submitted_at", "Submitted on", "date", L.PLATFORM_META, lambda c: getattr(_fb(c), "created_date", None), None)

# ── workforce planning ───────────────────────────────────────────────────────────────────────────────────────────────

def _hc(c):
    return _src(c, "WfHeadcount")


def _plan_title(c):
    h = _hc(c)
    if h is None or not h.plan_id:
        return None
    from app.modules.hr.models import WfPlan
    p = c.db.get(WfPlan, h.plan_id)
    return p.title if p else None


reg("headcount.plan_name", "Workforce plan", "text", L.PERSONAL_BASIC, _plan_title, "2027 growth plan")
reg("headcount.department", "Department", "text", L.PERSONAL_BASIC, lambda c: _dept_name(c, getattr(_hc(c), "department_id", None)), "Operations")
reg("headcount.period", "Period", "text", L.PERSONAL_BASIC, lambda c: (f"FY {_hc(c).fiscal_year}" if _hc(c) else None), "FY 2027")
reg("headcount.current", "Current headcount", "number", L.TENANT_AGGREGATE, lambda c: getattr(_hc(c), "filled_positions", None), 12)
reg("headcount.requested", "Requested headcount", "number", L.TENANT_AGGREGATE, lambda c: getattr(_hc(c), "approved_positions", None), 15)
reg("headcount.change", "Change", "text", L.TENANT_AGGREGATE,
    lambda c: (f"{(_hc(c).approved_positions or 0) - (_hc(c).filled_positions or 0):+d}" if _hc(c) else None), "+3")
reg("headcount.cost_estimate", "Estimated cost", "money", L.FINANCIAL,
    lambda c: ({"amount": _hc(c).projected_cost, "currency": c.currency()} if getattr(_hc(c), "projected_cost", None) is not None else None), None)
reg("headcount.rationale", "Rationale", "text", L.PERSONAL_BASIC, lambda c: getattr(_hc(c), "rationale", None), "New regional contracts.")


def _pos(c):
    return _src(c, "Designation")


def _designation_title(c, did):
    if not did:
        return None
    from app.modules.hr.models import Designation
    d = c.db.get(Designation, did)
    return d.title if d else None


def _grade(c, gid):
    if not gid:
        return None
    from app.modules.hr.models import PayGrade
    g = c.db.get(PayGrade, gid)
    return g.name if g else None


reg("position.title", "Position title", "text", L.PERSONAL_BASIC, lambda c: getattr(_pos(c), "title", None), "Data Analyst")
reg("position.department", "Department", "text", L.PERSONAL_BASIC, lambda c: getattr(_pos(c), "department_name", None), "Operations")
reg("position.grade", "Grade", "text", L.PERSONAL_BASIC, lambda c: _grade(c, getattr(_pos(c), "pay_grade_id", None)) or getattr(_pos(c), "level", None), "L4")
reg("position.reports_to", "Reports to", "text", L.PERSONAL_BASIC,
    lambda c: _designation_title(c, getattr(_pos(c), "reports_to_designation_id", None)), "Operations Manager")
reg("position.employment_type_label", "Employment type", "text", L.PERSONAL_BASIC,
    lambda c: EMPLOYMENT_TYPES.get(getattr(_pos(c), "employment_type", None) or ""), "Full-time")
reg("position.location", "Location", "text", L.PERSONAL_BASIC, lambda c: getattr(_pos(c), "location", None), "Leeds")


def _salary_range(c):
    p = _pos(c)
    if p is None or (p.min_salary is None and p.max_salary is None):
        return None
    lo, hi = _amount(p.min_salary, c.currency(), c), _amount(p.max_salary, c.currency(), c)
    return f"{lo} – {hi} {c.currency() or ''}".strip()


reg("position.salary_range", "Salary range", "text", L.FINANCIAL, _salary_range, "38,000.00 – 45,000.00 GBP")
reg("position.job_description_ref", "Job description", "text", L.PLATFORM_META,
    lambda c: (f"JD-{_pos(c).job_description_id:05d}" if getattr(_pos(c), "job_description_id", None) else None), None)
reg("position.reason", "Reason for the position", "text", L.PERSONAL_BASIC, lambda c: getattr(_pos(c), "position_reason", None), "New service line.")


def _jd(c):
    return _src(c, "JobDescription")


def _str_list(v):
    return [x for x in (v or []) if isinstance(x, str) and x.strip()] or None


reg("jd.title", "Job title", "text", L.PERSONAL_BASIC, lambda c: getattr(_jd(c), "title", None), "Data Analyst")
reg("jd.department", "Department", "text", L.PERSONAL_BASIC, lambda c: _dept_name(c, getattr(_jd(c), "department_id", None)), "Operations")
reg("jd.grade", "Grade", "text", L.PERSONAL_BASIC, lambda c: _grade(c, getattr(_jd(c), "pay_grade_id", None)), "Grade 4")
reg("jd.reports_to", "Reports to", "text", L.PERSONAL_BASIC,
    lambda c: _designation_title(c, getattr(_jd(c), "reporting_to_designation_id", None)), "Operations Manager")
reg("jd.purpose", "Purpose of the role", "text", L.PERSONAL_BASIC, lambda c: getattr(_jd(c), "purpose", None), "Turn operational data into decisions.")
reg("jd.responsibilities", "Key responsibilities", "list", L.PERSONAL_BASIC, lambda c: _str_list(getattr(_jd(c), "key_responsibilities", None)),
    ["Build weekly performance reports"])
reg("jd.essential", "Essential requirements", "list", L.PERSONAL_BASIC, lambda c: _str_list(getattr(_jd(c), "requirements_essential", None)),
    ["Experience with SQL"])
reg("jd.desirable", "Desirable requirements", "list", L.PERSONAL_BASIC, lambda c: _str_list(getattr(_jd(c), "requirements_desirable", None)),
    ["Experience in logistics"])
reg("jd.location", "Location", "text", L.PERSONAL_BASIC, lambda c: getattr(_jd(c), "work_location", None), "Leeds")
reg("jd.work_arrangement_label", "Working arrangement", "text", L.PERSONAL_BASIC,
    lambda c: WORK_ARRANGEMENTS.get(getattr(_jd(c), "work_arrangement", None) or ""), "Hybrid")
reg("jd.version", "Version", "number", L.PLATFORM_META, lambda c: getattr(_jd(c), "version", None), 1)
reg("jd.approved_on", "Approved on", "date", L.PLATFORM_META, lambda c: getattr(_jd(c), "decided_at", None), None)


def _succ(c):
    return _src(c, "WfSuccession")


def _succession_rows(c):
    s = _succ(c)
    if s is None:
        return None
    from app.modules.hr.models import WfSuccession
    rows = c.db.query(WfSuccession).filter(WfSuccession.organization_id == s.organization_id, WfSuccession.employee_id == s.employee_id,
                                           WfSuccession.deleted_at.is_(None)).order_by(WfSuccession.id).all()
    out = [[_full_name(_emp(c, r.successor_employee_id)) or "To be identified", READINESS.get(r.readiness_level or "", r.readiness_level or ""),
            r.development_actions or ""] for r in rows]
    return out or None


reg("succession.critical_role", "Critical role", "text", L.PERSONAL_CONFIDENTIAL,
    lambda c: getattr(_succ(c), "target_position", None) or getattr(_emp(c, getattr(_succ(c), "employee_id", None)), "job_title", None), "Head of Operations")
reg("succession.incumbent_ref", "Incumbent", "text", L.PERSONAL_CONFIDENTIAL,
    lambda c: _full_name(_emp(c, getattr(_succ(c), "employee_id", None))), "Alex Example")
reg("succession.risk_of_vacancy", "Risk of vacancy", "text", L.PERSONAL_CONFIDENTIAL,
    lambda c: (getattr(_succ(c), "risk_level", None) or "").capitalize() or None, "Medium")
reg("succession.candidates", "Potential successors", "rows", L.PERSONAL_CONFIDENTIAL, _succession_rows,
    [["Quinn Other", "1–2 years", "Lead the Q3 planning cycle"]])
reg("succession.review_date", "Next review", "date", L.PERSONAL_CONFIDENTIAL, lambda c: getattr(_succ(c), "review_date", None), None)
reg("succession.owner", "Plan owner", "text", L.PERSONAL_BASIC, lambda c: _full_name(_emp(c, getattr(_succ(c), "owner_id", None))), "Harper People")

# ── onboarding, assets, probation, policies (values prepared by the onboarding integration) ─────────────────────────

reg("onboarding.owner", "HR owner", "text", L.PERSONAL_BASIC, _x("onboarding.owner"), "Harper People")
reg("onboarding.checklist_items", "Checklist items", "rows", L.PERSONAL_BASIC, _x("onboarding.checklist_items"),
    [["IT accounts created", "hr", "Done", "30 October 2026"]])
reg("onboarding.exceptions", "Checklist exceptions", "rows", L.PERSONAL_CONFIDENTIAL, _x("onboarding.exceptions"), None)
reg("onboarding.completed_on", "Completed on", "date", L.PLATFORM_META, _x("onboarding.completed_on"), None)
reg("onboarding.closed_by_name", "Closed by", "text", L.PERSONAL_BASIC, _x("onboarding.closed_by_name"), "Harper People")
reg("asset.items", "Equipment issued", "rows", L.PERSONAL_BASIC, _x("asset.items"),
    [["Laptop", "AT-0001", "SN123", "New", "2 November 2026"]])
reg("asset.issued_by", "Issued by", "text", L.PERSONAL_BASIC, _x("asset.issued_by"), "Harper People")
reg("probation.start_date", "Probation start", "date", L.PERSONAL_CONFIDENTIAL, _x("probation.start_date"), None)
reg("probation.end_date", "Probation end", "date", L.PERSONAL_CONFIDENTIAL, _x("probation.end_date"), None)
reg("probation.review_dates", "Probation reviews", "rows", L.PERSONAL_CONFIDENTIAL, _x("probation.review_dates"),
    [["First review", "2 December 2026", "Morgan Manager"]])
reg("probation.objectives_summary", "Initial objectives", "text", L.PERSONAL_CONFIDENTIAL, _x("probation.objectives_summary"), None)
reg("probation.reviewer", "Reviewer", "text", L.PERSONAL_BASIC, _x("probation.reviewer"), "Morgan Manager")
reg("policy.version", "Policy version", "text", L.PLATFORM_META, _x("policy.version"), "3")
reg("policy.effective_from", "Policy effective from", "date", L.PLATFORM_META, _x("policy.effective_from"), None)
reg("policy.document_ref", "Policy document", "text", L.PLATFORM_META, _x("policy.document_ref"), "EX-2026-000099")
reg("employment.continuous_service_date", "Continuous service date", "date", L.PERSONAL_BASIC,
    lambda c: c.extra.get("employment.continuous_service_date") or _attr(c.worker(), "date_of_joining", "joining_date"), None)
