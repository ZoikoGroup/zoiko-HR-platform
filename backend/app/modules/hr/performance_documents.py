"""Probation, appraisals and performance improvement plans (Prompt 4 §A): HR-PRF-002 / 003 / 004 / 005 / 007 / 010 / 011 / 013.

* Probation reviews (`probation_reviews`) are completed by the reviewer (the manager chain or HR) from the review tasks of the
  probation schedule (HR-ONB-020). The employee adds comments; then the review record is issued for acknowledgement.
* Probation outcomes are lifecycle requests decided through change_documents (approver ≠ initiator): an extension
  (`probation_extended`, HR-PRF-003, L2, HR approves), confirmation (`confirmation`, HR-PRF-004) and an unsuccessful outcome
  (`probation_end`, HR-PRF-005, L3, blocking checklist). Issuing a letter never ends employment, changes status, access or pay.
* Appraisals: self-assessment (HR-PRF-010), manager assessment with evidence for every rating (HR-PRF-011, C3, shared when the
  appraisal is finalised), and the final appraisal (HR-PRF-007, C3) after optional calibration by someone else.
* PIPs (`performance_improvement_plans`, HR-PRF-013, C3, L2): DRAFT → PENDING_HR_APPROVAL → ACTIVE (HR ≠ manager) → review notes →
  outcome. A PIP never changes employment status or pay.
"""
from __future__ import annotations

import logging
from datetime import date, datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.core.dependencies import get_current_user
from app.database import get_db
from app.modules.doc_templates import access, formatting, hooks, service as doc_service
from app.modules.hr import change_documents, work_settings
from app.modules.hr.models import (Appraisal, AppraisalStatus, EmployeeLifecycle, OnboardingChecklistItem, PerformanceImprovementPlan,
                                   ProbationReview)
from app.modules.hr.recruitment_documents import _try_generate, documents_for_source

logger = logging.getLogger("zoiko.doc_templates")

RECOMMENDATIONS = {"on_track": "On track", "concerns": "Concerns raised", "recommend_confirm": "Recommend confirmation",
                   "recommend_extend": "Recommend extension", "recommend_end": "Recommend ending employment"}
PROGRESS = {"meets": "Meets", "partly": "Partly meets", "not_yet": "Not yet"}
PIP_STATUSES = ("DRAFT", "PENDING_HR_APPROVAL", "ACTIVE", "EXTENDED", "COMPLETED_SUCCESSFUL", "COMPLETED_UNSUCCESSFUL", "CANCELLED")
PRF_IDS = ("HR-PRF-002", "HR-PRF-003", "HR-PRF-004", "HR-PRF-005", "HR-PRF-007", "HR-PRF-010", "HR-PRF-011", "HR-PRF-013")


def _emp(db, organization_id, employee_id):
    return change_documents._emp(db, organization_id, employee_id)


_name = change_documents._name


def in_chain(db, user, employee_id: int) -> bool:
    """HR, or the employee's manager chain (direct manager and one level up)."""
    return access.is_hr(user) or employee_id in access.chain_report_ids(db, user)


def _require_chain(db, user, employee_id: int) -> None:
    if not in_chain(db, user, employee_id):
        raise HTTPException(404, "Employee not found")


def _d(v):
    return formatting.format_date(v, "en", None) if v else ""


# ── probation reviews (HR-PRF-002) ───────────────────────────────────────────────────────────────────────────────────

def _probation_event(db, employee_id: int) -> Optional[EmployeeLifecycle]:
    return (db.query(EmployeeLifecycle).filter(EmployeeLifecycle.employee_id == employee_id, EmployeeLifecycle.event_type == "probation_start")
            .order_by(EmployeeLifecycle.id.desc()).first())


def submit_review(db, user, data: dict) -> ProbationReview:
    emp = _emp(db, user.organization_id, data["employee_id"])
    _require_chain(db, user, emp.id)
    if user.id == emp.id:
        raise HTTPException(403, "You cannot review your own probation.")
    rec = data.get("recommendation")
    if rec not in RECOMMENDATIONS:
        raise HTTPException(422, f"recommendation must be one of {', '.join(RECOMMENDATIONS)}.")
    if rec in ("concerns", "recommend_extend", "recommend_end") and not ((data.get("concerns") or "").strip() and (data.get("support_agreed") or "").strip()):
        raise HTTPException(422, "Concerns must be specific, with examples, and the support offered. Describe both.")
    progress = []
    for o in data.get("objectives_progress") or []:
        if o.get("rating") not in PROGRESS or not (o.get("objective") or "").strip():
            raise HTTPException(422, "Each objective needs a name and a progress rating (meets, partly or not_yet).")
        progress.append({"objective": o["objective"].strip()[:300], "rating": o["rating"], "evidence": (o.get("evidence") or "").strip()[:1000]})
    ev = _probation_event(db, emp.id)
    number = data.get("review_number") or (db.query(ProbationReview).filter(ProbationReview.employee_id == emp.id).count() + 1)
    r = ProbationReview(organization_id=user.organization_id, employee_id=emp.id, probation_event_id=getattr(ev, "id", None),
                        checklist_item_id=data.get("checklist_item_id"), review_number=number, scheduled_date=data.get("scheduled_date"),
                        held_on=data.get("held_on") or date.today(), reviewer_id=user.id, objectives_progress=progress,
                        strengths=(data.get("strengths") or "").strip() or None, concerns=(data.get("concerns") or "").strip() or None,
                        support_agreed=(data.get("support_agreed") or "").strip() or None, recommendation=rec, status="SUBMITTED")
    db.add(r)
    if r.checklist_item_id:
        item = db.get(OnboardingChecklistItem, r.checklist_item_id)
        if item is not None and item.organization_id == user.organization_id:
            item.completed = True
    db.commit()
    return r


def employee_comment(db, user, r: ProbationReview, comments: Optional[str]) -> ProbationReview:
    """The employee adds comments (or none); the review record is then issued for their acknowledgement."""
    if r.employee_id != user.id:
        raise HTTPException(404, "Review not found")
    if r.status != "SUBMITTED":
        raise HTTPException(409, "This review has already been issued.")
    r.employee_comments = (comments or "").strip() or None
    r.employee_commented_at = datetime.utcnow()
    db.commit()
    return issue_review(db, r)


def issue_review(db, r: ProbationReview) -> ProbationReview:
    reviewer = _emp(db, r.organization_id, r.reviewer_id) if r.reviewer_id else None
    doc = _try_generate(db, reviewer, canonical_id="HR-PRF-002", subject_type="employee", subject_id=r.employee_id,
                        source_ref=f"probation_review:{r.id}", trigger="probation_review.completed")
    r = db.get(ProbationReview, r.id)
    if doc is not None:
        r.document_id, r.status = doc.id, "ISSUED"
        db.commit()
    return r


def _review_context(ctx) -> None:
    r = ctx.source
    if r is None or type(r).__name__ != "ProbationReview" or r.employee_id != getattr(ctx.subject, "id", None):
        ctx.denials.append("REVIEW_SOURCE_MISMATCH")
        return
    ev = ctx.db.get(EmployeeLifecycle, r.probation_event_id) if r.probation_event_id else None
    end = (ev.new_value or {}).get("end_date") if ev else None
    ctx.extra.update({
        "probation.review_number": r.review_number, "probation.review_date": r.held_on, "probation.reviewer": _name(ctx.db, r.reviewer_id),
        "probation.objectives_progress": [[o["objective"], PROGRESS.get(o["rating"], o["rating"]), o.get("evidence") or ""]
                                          for o in r.objectives_progress or []] or None,
        "probation.strengths": r.strengths, "probation.concerns": r.concerns, "probation.support_agreed": r.support_agreed,
        "probation.recommendation_label": RECOMMENDATIONS.get(r.recommendation), "probation.end_date": date.fromisoformat(end) if end else None,
    })
    ctx.form_values = {"employee_comments": r.employee_comments or "No comments added."}


hooks.context(["HR-PRF-002"], _review_context)


# ── probation outcomes (lifecycle requests) ──────────────────────────────────────────────────────────────────────────

def _latest_review(db, employee_id: int, recommendation: Optional[str] = None) -> Optional[ProbationReview]:
    q = db.query(ProbationReview).filter(ProbationReview.employee_id == employee_id)
    if recommendation:
        q = q.filter(ProbationReview.recommendation == recommendation)
    return q.order_by(ProbationReview.id.desc()).first()


def _months_between(a: date, b: date) -> float:
    return (b.year - a.year) * 12 + (b.month - a.month) + (b.day - a.day) / 31


def request_outcome(db, user, employee_id: int, kind: str, data: dict) -> EmployeeLifecycle:
    """kind: probation_extended | confirmation | probation_end. Requested by the manager chain or HR; decided by HR."""
    emp = _emp(db, user.organization_id, employee_id)
    _require_chain(db, user, emp.id)
    start_ev = _probation_event(db, emp.id)
    nv: dict = {}
    if kind == "probation_extended":
        if not data.get("new_end_date") or not (data.get("extension_reason") or "").strip():
            raise HTTPException(422, "Give the new end date and the reason for the extension.")
        nv = {"new_end_date": data["new_end_date"].isoformat(), "extension_reason": data["extension_reason"].strip(),
              "extension_objectives": [x for x in data.get("extension_objectives") or [] if str(x).strip()],
              "next_review_dates": data.get("next_review_dates"), "review_id": data.get("review_id")}
    elif kind == "confirmation":
        nv = {"confirmation_date": (data.get("confirmation_date") or date.today()).isoformat(), "review_id": data.get("review_id")}
    elif kind == "probation_end":
        cl = data.get("checklist") or {}
        nv = {"decision": "not_confirmed", "final_meeting_date": data["final_meeting_date"].isoformat() if data.get("final_meeting_date") else None,
              "decision_reasons": (data.get("decision_reasons") or "").strip() or None, "checklist": {
                  "response_opportunity_date": str(cl.get("response_opportunity_date") or "") or None,
                  "adjustments": cl.get("adjustments"), "adjustments_reason": (cl.get("adjustments_reason") or "").strip() or None,
                  "hr_reviewed_by": cl.get("hr_reviewed_by"), "hr_reviewed_on": str(cl.get("hr_reviewed_on") or "") or None,
                  "protected_status": bool(cl.get("protected_status")), "legal_review_cleared": bool(cl.get("legal_review_cleared"))}}
    else:
        raise HTTPException(422, "Unknown probation outcome.")
    ev = EmployeeLifecycle(employee_id=emp.id, organization_id=user.organization_id, event_type=kind, event_date=date.today(),
                           effective_date=data.get("new_end_date") or data.get("confirmation_date") or date.today(),
                           previous_value={"probation_event_id": getattr(start_ev, "id", None),
                                           **({"start_date": (start_ev.new_value or {}).get("start_date"),
                                               "end_date": (start_ev.new_value or {}).get("end_date")} if start_ev else {})},
                           new_value=nv, reason=(data.get("reason") or "").strip() or None, initiated_by=user.id, status="pending")
    db.add(ev)
    db.commit()
    return ev


def _on_extension(db, approver, ev):
    change_documents.letter(db, approver, ev, "HR-PRF-003")


def _on_confirmation(db, approver, ev):
    # replaces the generic lifecycle e-mail: the employee is told through the confirmation letter
    change_documents.letter(db, approver, ev, "HR-PRF-004")


def _on_probation_end(db, approver, ev):
    change_documents.letter(db, approver, ev, "HR-PRF-005")


change_documents.register("probation_extended", _on_extension)
change_documents.register("confirmation", _on_confirmation)
change_documents.register("probation_end", _on_probation_end)


def _outcome_context(ctx) -> None:
    ev = ctx.source
    if ev is None or type(ev).__name__ != "EmployeeLifecycle" or ev.employee_id != getattr(ctx.subject, "id", None):
        ctx.denials.append("PROBATION_SOURCE_MISMATCH")
        return
    if ev.status not in ("approved", "completed"):
        ctx.denials.append("PROBATION_DECISION_NOT_APPROVED")
    db, nv, pv, cid = ctx.db, ev.new_value or {}, ev.previous_value or {}, ctx.canonical_id
    if cid == "HR-PRF-003":
        if ev.event_type != "probation_extended":
            ctx.denials.append("PROBATION_SOURCE_MISMATCH")
            return
        review = _latest_review(db, ev.employee_id, "recommend_extend")
        if review is None:
            ctx.denials.append("PROBATION_EXTENSION_NOT_RECOMMENDED")
        clause = ctx.clauses.get("probation_extension_rules")
        params = (getattr(clause, "parameters", None) or {}) if clause is not None else {}
        new_end = date.fromisoformat(nv["new_end_date"]) if nv.get("new_end_date") else None
        if clause is not None:
            if "max_probation_months" not in params:
                ctx.denials.append("PROBATION_LIMIT_NOT_CONFIGURED")     # the releaser must state the limit (or null: no statutory limit)
            elif params["max_probation_months"] is not None and pv.get("start_date") and new_end and \
                    _months_between(date.fromisoformat(pv["start_date"]), new_end) > float(params["max_probation_months"]):
                ctx.denials.append("PROBATION_LIMIT_EXCEEDED")
        ctx.evidence["extension_review_id"] = getattr(review, "id", None)
        ctx.extra.update({"probation.review_date": getattr(review, "held_on", None), "probation.new_end_date": new_end,
                          "probation.extension_reason": nv.get("extension_reason"),
                          "probation.extension_objectives": nv.get("extension_objectives") or None,
                          "probation.support_agreed": getattr(review, "support_agreed", None),
                          "probation.next_review_dates": nv.get("next_review_dates")})
    elif cid == "HR-PRF-004":
        if ev.event_type != "confirmation":
            ctx.denials.append("PROBATION_SOURCE_MISMATCH")
            return
        ctx.extra["probation.confirmation_date"] = date.fromisoformat(nv["confirmation_date"]) if nv.get("confirmation_date") else None
    elif cid == "HR-PRF-005":
        if ev.event_type != "probation_end" or nv.get("decision") != "not_confirmed":
            ctx.denials.append("PROBATION_SOURCE_MISMATCH")
            return
        cl = nv.get("checklist") or {}
        reviews = db.query(ProbationReview).filter(ProbationReview.employee_id == ev.employee_id).all()
        checks = {
            "review_with_concerns_and_support": any(r.concerns and r.support_agreed for r in reviews),
            "chance_to_respond": bool(cl.get("response_opportunity_date")),
            "adjustments_considered": cl.get("adjustments") == "yes" or (cl.get("adjustments") == "not_applicable" and bool(cl.get("adjustments_reason"))),
            "hr_reviewed": bool(cl.get("hr_reviewed_by") and cl.get("hr_reviewed_on")),
            "legal_review_if_protected": (not cl.get("protected_status")) or bool(cl.get("legal_review_cleared")),
        }
        for k, ok in checks.items():
            if not ok:
                ctx.denials.append(f"PROBATION_CHECKLIST_INCOMPLETE:{k}")
        ctx.evidence["probation_end_checklist"] = checks
        ctx.extra.update({"probation.final_meeting_date": date.fromisoformat(nv["final_meeting_date"]) if nv.get("final_meeting_date") else None,
                          "probation.decision_reasons": nv.get("decision_reasons")})


hooks.context(["HR-PRF-003", "HR-PRF-004", "HR-PRF-005"], _outcome_context)


# ── appraisals (HR-PRF-007 / 010 / 011) ──────────────────────────────────────────────────────────────────────────────

def _appraisal(db, user, appraisal_id: int) -> Appraisal:
    a = db.get(Appraisal, appraisal_id)
    if a is None or a.organization_id != user.organization_id:
        raise HTTPException(404, "Appraisal not found")
    if a.employee_id == user.id or in_chain(db, user, a.employee_id) or user.id == a.reviewer_id:
        return a
    raise HTTPException(404, "Appraisal not found")


def _goal_titles(db, a: Appraisal) -> list[str]:
    from app.modules.hr.models import PerformanceGoal
    return [g.title for g in db.query(PerformanceGoal).filter(PerformanceGoal.employee_id == a.employee_id).order_by(PerformanceGoal.id).all()]


def self_assessment(db, user, a: Appraisal, data: dict) -> Appraisal:
    if a.employee_id != user.id:
        raise HTTPException(403, "Only the employee completes their self-assessment.")
    if a.finalised_at:
        raise HTTPException(409, "This appraisal is final.")
    if not (data.get("went_well") or "").strip():
        raise HTTPException(422, "Describe what went well.")
    a.self_assessment = {k: data.get(k) for k in ("goals", "went_well", "difficult", "support", "development", "wellbeing")}
    a.self_submitted_at = datetime.utcnow()
    db.commit()
    _try_generate(db, user, canonical_id="HR-PRF-010", subject_type="employee", subject_id=a.employee_id,
                  source_ref=f"appraisal:{a.id}", trigger="appraisal.self_assessment_submitted")
    return a


def _rated(rows, what) -> list[dict]:
    out = []
    for r in rows or []:
        name = (r.get("goal") or r.get("name") or "").strip()
        if not name or not (r.get("rating") or "").strip():
            raise HTTPException(422, f"Each {what} needs a name and a rating.")
        if not (r.get("evidence") or "").strip():
            raise HTTPException(422, f"Give the evidence for the rating of “{name}”. Every rating needs evidence.")
        out.append({**r, "goal" if what == "goal" else "name": name})
    return out


def manager_assessment(db, user, a: Appraisal, data: dict) -> Appraisal:
    if a.employee_id == user.id or not (in_chain(db, user, a.employee_id) or user.id == a.reviewer_id):
        raise HTTPException(404, "Appraisal not found")
    if a.finalised_at:
        raise HTTPException(409, "This appraisal is final.")
    goals = _rated(data.get("goals"), "goal")
    if not goals:
        raise HTTPException(422, "Rate at least one goal.")
    comps = _rated(data.get("competencies"), "competency")
    if not (data.get("overall_recommendation") or "").strip():
        raise HTTPException(422, "Give an overall recommendation.")
    a.manager_assessment = {"goals": goals, "competencies": comps, "overall_recommendation": data["overall_recommendation"].strip(),
                            "strengths": data.get("strengths"), "development_needs": data.get("development_needs"), "by": user.id}
    a.manager_submitted_at = datetime.utcnow()
    a.status = AppraisalStatus.SUBMITTED
    db.commit()
    # C3, shared with the employee only when the appraisal is finalised: generated now, issued at finalisation
    _try_generate(db, user, canonical_id="HR-PRF-011", subject_type="employee", subject_id=a.employee_id,
                  source_ref=f"appraisal:{a.id}", trigger="appraisal.manager_assessment_submitted", issue=False)
    return a


def calibrate(db, user, a: Appraisal) -> Appraisal:
    """Calibration by the next-level manager or HR: never the manager who assessed."""
    if not a.manager_submitted_at:
        raise HTTPException(409, "The manager assessment is not submitted yet.")
    if user.id in ((a.manager_assessment or {}).get("by"), a.employee_id):
        raise HTTPException(403, {"code": "SEPARATION_OF_DUTIES", "message": "Calibration is done by someone other than the assessing manager."})
    if not (access.is_hr(user) or a.employee_id in access.chain_report_ids(db, user)):
        raise HTTPException(404, "Appraisal not found")
    a.calibrated_by, a.calibrated_at = user.id, datetime.utcnow()
    db.commit()
    return a


def finalise(db, user, a: Appraisal, data: dict) -> Appraisal:
    if a.employee_id == user.id or not (in_chain(db, user, a.employee_id) or user.id == a.reviewer_id):
        raise HTTPException(404, "Appraisal not found")
    if a.finalised_at:
        raise HTTPException(409, "This appraisal is already final.")
    if not a.manager_submitted_at:
        raise HTTPException(409, "Submit the manager assessment first.")
    if work_settings.get(db, a.organization_id, "performance.calibration_required") and not a.calibrated_by:
        raise HTTPException(409, "Your organization requires calibration before an appraisal is finalised.")
    ma = a.manager_assessment or {}
    a.goals_assessment = _rated(data.get("goals") or [{"goal": g["goal"], "weight": g.get("weight"), "result": g.get("result"),
                                                       "rating": g["rating"], "evidence": g["evidence"]} for g in ma.get("goals") or []], "goal")
    a.competencies = _rated(data.get("competencies") if data.get("competencies") is not None else ma.get("competencies"), "competency")
    if not (data.get("overall_rating_label") or "").strip() or not (data.get("manager_summary") or "").strip():
        raise HTTPException(422, "Give the overall rating and a summary.")
    a.overall_rating_label, a.manager_summary = data["overall_rating_label"].strip(), data["manager_summary"].strip()
    a.development_priorities = [x for x in data.get("development_priorities") or [] if str(x).strip()]
    a.employee_comments = (data.get("employee_comments") or a.employee_comments)
    a.status, a.finalised_at, a.finalised_by = AppraisalStatus.APPROVED, datetime.utcnow(), user.id
    db.commit()
    doc = _try_generate(db, user, canonical_id="HR-PRF-007", subject_type="employee", subject_id=a.employee_id,
                        source_ref=f"appraisal:{a.id}", trigger="appraisal.finalised")
    from app.modules.doc_templates.models import GeneratedDocument
    pending = (db.query(GeneratedDocument).filter(GeneratedDocument.source_ref == f"appraisal:{a.id}", GeneratedDocument.canonical_id == "HR-PRF-011",
                                                  GeneratedDocument.status == "RENDERED_DRAFT").all())
    for d in pending:
        try:
            doc_service.issue(db, d, user, system_trigger="appraisal.finalised")
        except HTTPException:
            db.rollback()
    a = db.get(Appraisal, a.id)
    a.document_id = getattr(doc, "id", None)
    db.commit()
    return a


def employee_appraisal_comments(db, user, a: Appraisal, comments: str) -> Appraisal:
    if a.employee_id != user.id:
        raise HTTPException(404, "Appraisal not found")
    if a.finalised_at:
        raise HTTPException(409, "This appraisal is final; raise any disagreement through the appraisal review process.")
    a.employee_comments = (comments or "").strip()[:4000] or None
    db.commit()
    return a


def _appraisal_context(ctx) -> None:
    a = ctx.source
    if a is None or type(a).__name__ != "Appraisal" or a.employee_id != getattr(ctx.subject, "id", None):
        ctx.denials.append("APPRAISAL_SOURCE_MISMATCH")
        return
    e, cid = ctx.extra, ctx.canonical_id
    e["appraisal.period_label"] = a.cycle
    if cid == "HR-PRF-010":
        sa = a.self_assessment or {}
        if not sa:
            ctx.denials.append("SELF_ASSESSMENT_NOT_SUBMITTED")
        e["appraisal.self_goal_rows"] = [[g.get("goal") or "", g.get("achievement") or ""] for g in sa.get("goals") or []] or None
        ctx.form_values = {k: sa.get(k) for k in ("went_well", "difficult", "support", "development", "wellbeing")}
    elif cid == "HR-PRF-011":
        ma = a.manager_assessment or {}
        if not ma:
            ctx.denials.append("MANAGER_ASSESSMENT_NOT_SUBMITTED")
        e["appraisal.manager_goal_rows"] = [[g["goal"], g["rating"], g["evidence"]] for g in ma.get("goals") or []] or None
        e["appraisal.manager_competency_rows"] = [[c["name"], c["rating"], c["evidence"]] for c in ma.get("competencies") or []] or None
        ctx.form_values = {k: ma.get(k) for k in ("overall_recommendation", "strengths", "development_needs")}
    elif cid == "HR-PRF-007":
        if not a.finalised_at:
            ctx.denials.append("APPRAISAL_NOT_FINAL")
        e.update({"appraisal.goals": [[g["goal"], str(g.get("weight") or ""), g.get("result") or "", g["rating"], g["evidence"]]
                                      for g in a.goals_assessment or []] or None,
                  "appraisal.competencies": [[c["name"], c["rating"], c["evidence"]] for c in a.competencies or []] or None,
                  "appraisal.overall_rating_label": a.overall_rating_label, "appraisal.manager_summary": a.manager_summary,
                  "appraisal.development_priorities": a.development_priorities or None,
                  "appraisal.calibrated_by": _name(ctx.db, a.calibrated_by)})
        ctx.form_values = {"employee_comments": a.employee_comments or "No comments added."}


hooks.context(["HR-PRF-007", "HR-PRF-010", "HR-PRF-011"], _appraisal_context)


# ── performance improvement plans (HR-PRF-013) ───────────────────────────────────────────────────────────────────────

def _ser_pip(db, p: PerformanceImprovementPlan) -> dict:
    return {"id": p.id, "employee_id": p.employee_id, "employee_name": _name(db, p.employee_id), "manager_id": p.manager_id,
            "hr_owner_id": p.hr_owner_id, "start_date": p.start_date, "end_date": p.end_date, "objectives": p.objectives, "support": p.support,
            "review_dates": p.review_dates, "adjustments_considered": p.adjustments_considered, "status": p.status, "created_by": p.created_by,
            "hr_approved_by": p.hr_approved_by, "outcomes_log": p.outcomes_log or [], "employee_comments": p.employee_comments,
            "outcome": p.outcome, "document_id": p.document_id}


def create_pip(db, user, data: dict) -> PerformanceImprovementPlan:
    emp = _emp(db, user.organization_id, data["employee_id"])
    _require_chain(db, user, emp.id)
    if user.id == emp.id:
        raise HTTPException(403, "You cannot create a plan for yourself.")
    if data["end_date"] <= data["start_date"]:
        raise HTTPException(422, "The plan must end after it starts.")
    objectives = []
    for o in data.get("objectives") or []:
        if not all((o.get(k) or "").strip() for k in ("objective", "standard", "evidence_of_gap", "success_measure")):
            raise HTTPException(422, "Every objective needs the expected standard, examples of the current gap and how success is measured.")
        objectives.append({k: o[k].strip()[:1000] for k in ("objective", "standard", "evidence_of_gap", "success_measure")})
    if not objectives:
        raise HTTPException(422, "Add at least one objective.")
    if not (data.get("adjustments_considered") or "").strip():
        raise HTTPException(422, "Record whether reasonable adjustments were considered (or why they do not apply).")
    manager_id = emp.reporting_manager_id or user.id
    p = PerformanceImprovementPlan(organization_id=user.organization_id, employee_id=emp.id, manager_id=manager_id,
                                   hr_owner_id=data.get("hr_owner_id"), start_date=data["start_date"], end_date=data["end_date"],
                                   objectives=objectives, support=[s for s in data.get("support") or [] if str(s).strip()],
                                   review_dates=[{"date": r["date"].isoformat() if isinstance(r["date"], date) else str(r["date"]),
                                                  "with_id": r.get("with_id") or manager_id} for r in data.get("review_dates") or [] if r.get("date")],
                                   adjustments_considered=data["adjustments_considered"].strip(), status="DRAFT", created_by=user.id)
    db.add(p)
    db.commit()
    return p


def submit_pip(db, user, p: PerformanceImprovementPlan) -> PerformanceImprovementPlan:
    if p.status != "DRAFT" or user.id not in (p.created_by, p.manager_id) and not access.is_hr(user):
        raise HTTPException(409, "Only a draft plan can be sent for HR approval.")
    p.status = "PENDING_HR_APPROVAL"
    db.commit()
    return p


def approve_pip(db, user, p: PerformanceImprovementPlan, *, approve: bool, comment: Optional[str]) -> PerformanceImprovementPlan:
    access.require_hr(user)
    if p.status != "PENDING_HR_APPROVAL":
        raise HTTPException(409, "This plan is not waiting for HR approval.")
    if user.id in (p.manager_id, p.created_by, p.employee_id):
        raise HTTPException(403, {"code": "SEPARATION_OF_DUTIES", "message": "HR approval must come from someone other than the manager."})
    if not approve:
        if not (comment or "").strip():
            raise HTTPException(422, "Give the reason for sending the plan back.")
        p.status = "DRAFT"
        p.outcomes_log = list(p.outcomes_log or []) + [{"date": date.today().isoformat(), "by": user.id, "note": f"Returned by HR: {comment.strip()}"}]
        db.commit()
        return p
    p.status, p.hr_approved_by, p.hr_approved_at = "ACTIVE", user.id, datetime.utcnow()
    p.hr_owner_id = p.hr_owner_id or user.id
    db.commit()
    creator = _emp(db, p.organization_id, p.created_by)
    prior = [{"approver_id": user.id, "decided_at": datetime.utcnow(), "source": "PIP HR approval"}]
    doc = _try_generate(db, creator, canonical_id="HR-PRF-013", subject_type="employee", subject_id=p.employee_id, source_ref=f"pip:{p.id}",
                        trigger="pip.approved", issue=False, prior_approvals=prior)
    if doc is not None and doc.status == "HUMAN_APPROVED":
        try:
            doc = doc_service.issue(db, doc, user, system_trigger="pip.approved")
        except HTTPException:
            db.rollback()
    p = db.get(PerformanceImprovementPlan, p.id)
    p.document_id = getattr(doc, "id", None)
    db.commit()
    return p


def pip_review_note(db, user, p: PerformanceImprovementPlan, note: str) -> PerformanceImprovementPlan:
    _require_chain(db, user, p.employee_id)
    if p.status not in ("ACTIVE", "EXTENDED"):
        raise HTTPException(409, "Review notes are added while the plan is active.")
    p.outcomes_log = list(p.outcomes_log or []) + [{"date": date.today().isoformat(), "by": user.id, "note": note.strip()[:4000]}]
    db.commit()
    return p


def pip_outcome(db, user, p: PerformanceImprovementPlan, outcome: str, note: Optional[str], new_end: Optional[date] = None):
    """Record how a plan ended. Nothing else changes: employment status and pay are untouched."""
    access.require_hr(user)
    if p.status not in ("ACTIVE", "EXTENDED"):
        raise HTTPException(409, "Only an active plan can be extended or closed.")
    if outcome == "EXTENDED":
        if not new_end or new_end <= p.end_date:
            raise HTTPException(422, "Give a new end date after the current one.")
        p.end_date, p.status = new_end, "EXTENDED"
    elif outcome in ("COMPLETED_SUCCESSFUL", "COMPLETED_UNSUCCESSFUL", "CANCELLED"):
        p.status, p.outcome, p.completed_at = outcome, outcome, datetime.utcnow()
    else:
        raise HTTPException(422, "Unknown outcome.")
    p.outcomes_log = list(p.outcomes_log or []) + [{"date": date.today().isoformat(), "by": user.id, "note": f"{outcome}: {(note or '').strip()}"}]
    db.commit()
    return p


def _pip_context(ctx) -> None:
    p = ctx.source
    if p is None or type(p).__name__ != "PerformanceImprovementPlan" or p.employee_id != getattr(ctx.subject, "id", None):
        ctx.denials.append("PIP_SOURCE_MISMATCH")
        return
    if p.status not in ("ACTIVE", "EXTENDED") or not p.hr_approved_by:
        ctx.denials.append("PIP_NOT_APPROVED")
    rows = []
    for r in p.review_dates or []:
        rows.append([_d(date.fromisoformat(r["date"])), _name(ctx.db, r.get("with_id")) or ""])
    ctx.extra.update({"pip.hr_contact": _name(ctx.db, p.hr_owner_id or p.hr_approved_by), "pip.start_date": p.start_date, "pip.end_date": p.end_date,
                      "pip.objectives": [[o["objective"], o["standard"], o["evidence_of_gap"], o["success_measure"]] for o in p.objectives or []] or None,
                      "pip.support": p.support or None, "pip.adjustments_considered": p.adjustments_considered, "pip.review_dates": rows or None})
    ctx.form_values = {"employee_comments": p.employee_comments or "To be added at the first review."}


hooks.context(["HR-PRF-013"], _pip_context)


# ── HTTP ─────────────────────────────────────────────────────────────────────────────────────────────────────────────

router = APIRouter(prefix="/hr/performance-documents", tags=["Probation, appraisal and PIP documents"])
me_router = APIRouter(prefix="/hr/me/performance", tags=["Probation and appraisals (self-service)"])


class ReviewIn(BaseModel):
    employee_id: int
    checklist_item_id: Optional[int] = None
    review_number: Optional[int] = Field(None, ge=1, le=20)
    scheduled_date: Optional[date] = None
    held_on: Optional[date] = None
    objectives_progress: list[dict] = Field(default_factory=list)
    strengths: Optional[str] = Field(None, max_length=4000)
    concerns: Optional[str] = Field(None, max_length=4000)
    support_agreed: Optional[str] = Field(None, max_length=4000)
    recommendation: str


class CommentIn(BaseModel):
    comments: Optional[str] = Field(None, max_length=4000)


class OutcomeIn(BaseModel):
    kind: str = Field(..., pattern="^(probation_extended|confirmation|probation_end)$")
    review_id: Optional[int] = None
    new_end_date: Optional[date] = None
    extension_reason: Optional[str] = Field(None, max_length=4000)
    extension_objectives: list[str] = Field(default_factory=list)
    next_review_dates: Optional[str] = Field(None, max_length=500)
    confirmation_date: Optional[date] = None
    final_meeting_date: Optional[date] = None
    decision_reasons: Optional[str] = Field(None, max_length=4000)
    checklist: dict = Field(default_factory=dict)
    reason: Optional[str] = Field(None, max_length=2000)


class AssessmentIn(BaseModel):
    goals: list[dict] = Field(default_factory=list)
    competencies: list[dict] = Field(default_factory=list)
    overall_recommendation: Optional[str] = Field(None, max_length=300)
    strengths: Optional[str] = Field(None, max_length=4000)
    development_needs: Optional[str] = Field(None, max_length=4000)


class SelfIn(BaseModel):
    goals: list[dict] = Field(default_factory=list)
    went_well: Optional[str] = Field(None, max_length=4000)
    difficult: Optional[str] = Field(None, max_length=4000)
    support: Optional[str] = Field(None, max_length=4000)
    development: Optional[str] = Field(None, max_length=4000)
    wellbeing: Optional[str] = Field(None, max_length=4000)


class FinaliseIn(BaseModel):
    goals: Optional[list[dict]] = None
    competencies: Optional[list[dict]] = None
    overall_rating_label: str = Field(..., max_length=60)
    manager_summary: str = Field(..., max_length=6000)
    development_priorities: list[str] = Field(default_factory=list)


class PipIn(BaseModel):
    employee_id: int
    hr_owner_id: Optional[int] = None
    start_date: date
    end_date: date
    objectives: list[dict]
    support: list[str] = Field(default_factory=list)
    review_dates: list[dict] = Field(default_factory=list)
    adjustments_considered: str = Field(..., max_length=2000)


class PipDecisionIn(BaseModel):
    approve: bool
    comment: Optional[str] = Field(None, max_length=2000)


class NoteIn(BaseModel):
    note: str = Field(..., min_length=3, max_length=4000)


class PipOutcomeIn(BaseModel):
    outcome: str = Field(..., pattern="^(EXTENDED|COMPLETED_SUCCESSFUL|COMPLETED_UNSUCCESSFUL|CANCELLED)$")
    note: Optional[str] = Field(None, max_length=2000)
    new_end_date: Optional[date] = None


def _review(db, user, rid: int) -> ProbationReview:
    r = db.get(ProbationReview, rid)
    if r is None or r.organization_id != user.organization_id or not (r.employee_id == user.id or in_chain(db, user, r.employee_id)):
        raise HTTPException(404, "Review not found")
    return r


def _pip(db, user, pid: int) -> PerformanceImprovementPlan:
    p = db.get(PerformanceImprovementPlan, pid)
    if p is None or p.organization_id != user.organization_id or not (in_chain(db, user, p.employee_id) or p.created_by == user.id):
        raise HTTPException(404, "Plan not found")
    return p


def _ser_review(db, r: ProbationReview) -> dict:
    return {"id": r.id, "employee_id": r.employee_id, "employee_name": _name(db, r.employee_id), "review_number": r.review_number,
            "held_on": r.held_on, "reviewer_id": r.reviewer_id, "objectives_progress": r.objectives_progress, "strengths": r.strengths,
            "concerns": r.concerns, "support_agreed": r.support_agreed, "recommendation": r.recommendation,
            "employee_comments": r.employee_comments, "status": r.status, "document_id": r.document_id}


@router.get("/probation-reviews")
def list_reviews(employee_id: Optional[int] = None, db: Session = Depends(get_db), user=Depends(get_current_user)):
    q = db.query(ProbationReview).filter(ProbationReview.organization_id == user.organization_id)
    if not access.is_hr(user):
        q = q.filter(ProbationReview.employee_id.in_(list(access.chain_report_ids(db, user)) or [-1]))
    if employee_id:
        q = q.filter(ProbationReview.employee_id == employee_id)
    return {"items": [_ser_review(db, r) for r in q.order_by(ProbationReview.id.desc()).limit(500).all()]}


@router.post("/probation-reviews", status_code=201)
def new_review(body: ReviewIn, db: Session = Depends(get_db), user=Depends(get_current_user)):
    return _ser_review(db, submit_review(db, user, body.model_dump()))


@router.post("/probation-reviews/{review_id}/issue")
def issue_review_now(review_id: int, db: Session = Depends(get_db), user=Depends(get_current_user)):
    """HR issues a review whose employee has not commented (for example after the comment window)."""
    access.require_hr(user)
    r = _review(db, user, review_id)
    if r.status != "SUBMITTED":
        raise HTTPException(409, "This review has already been issued.")
    return _ser_review(db, issue_review(db, r))


@router.post("/probation/{employee_id}/outcome", status_code=201)
def probation_outcome(employee_id: int, body: OutcomeIn, db: Session = Depends(get_db), user=Depends(get_current_user)):
    data = body.model_dump()
    return change_documents.serialize(db, request_outcome(db, user, employee_id, data.pop("kind"), data))


@router.post("/appraisals/{appraisal_id}/manager-assessment")
def appraisal_manager(appraisal_id: int, body: AssessmentIn, db: Session = Depends(get_db), user=Depends(get_current_user)):
    a = manager_assessment(db, user, _appraisal(db, user, appraisal_id), body.model_dump())
    return {"id": a.id, "status": getattr(a.status, "value", a.status), "manager_submitted_at": a.manager_submitted_at}


@router.post("/appraisals/{appraisal_id}/calibrate")
def appraisal_calibrate(appraisal_id: int, db: Session = Depends(get_db), user=Depends(get_current_user)):
    a = calibrate(db, user, _appraisal(db, user, appraisal_id))
    return {"id": a.id, "calibrated_by": a.calibrated_by}


@router.post("/appraisals/{appraisal_id}/finalise")
def appraisal_finalise(appraisal_id: int, body: FinaliseIn, db: Session = Depends(get_db), user=Depends(get_current_user)):
    a = finalise(db, user, _appraisal(db, user, appraisal_id), body.model_dump())
    return {"id": a.id, "status": getattr(a.status, "value", a.status), "document_id": a.document_id}


@router.get("/appraisals/{appraisal_id}/documents")
def appraisal_documents(appraisal_id: int, db: Session = Depends(get_db), user=Depends(get_current_user)):
    a = _appraisal(db, user, appraisal_id)
    out = documents_for_source(db, user.organization_id, f"appraisal:{a.id}")
    if not access.is_hr(user):
        from app.modules.doc_templates.models import GeneratedDocument
        ok = {d.id for d in db.query(GeneratedDocument).filter(GeneratedDocument.source_ref == f"appraisal:{a.id}").all() if access.can_view(db, user, d)}
        out = {"documents": [d for d in out["documents"] if d["id"] in ok], "blocked": []}
    return out


@router.get("/pips")
def list_pips(status: Optional[str] = None, db: Session = Depends(get_db), user=Depends(get_current_user)):
    q = db.query(PerformanceImprovementPlan).filter(PerformanceImprovementPlan.organization_id == user.organization_id)
    if not access.is_hr(user):
        q = q.filter(PerformanceImprovementPlan.employee_id.in_(list(access.chain_report_ids(db, user)) or [-1]))
    if status:
        q = q.filter(PerformanceImprovementPlan.status == status)
    return {"items": [_ser_pip(db, p) for p in q.order_by(PerformanceImprovementPlan.id.desc()).limit(500).all()]}


@router.post("/pips", status_code=201)
def new_pip(body: PipIn, db: Session = Depends(get_db), user=Depends(get_current_user)):
    return _ser_pip(db, create_pip(db, user, body.model_dump()))


@router.post("/pips/{pip_id}/submit")
def pip_submit(pip_id: int, db: Session = Depends(get_db), user=Depends(get_current_user)):
    return _ser_pip(db, submit_pip(db, user, _pip(db, user, pip_id)))


@router.post("/pips/{pip_id}/decision")
def pip_decision(pip_id: int, body: PipDecisionIn, db: Session = Depends(get_db), user=Depends(get_current_user)):
    return _ser_pip(db, approve_pip(db, user, _pip(db, user, pip_id), approve=body.approve, comment=body.comment))


@router.post("/pips/{pip_id}/reviews")
def pip_note(pip_id: int, body: NoteIn, db: Session = Depends(get_db), user=Depends(get_current_user)):
    return _ser_pip(db, pip_review_note(db, user, _pip(db, user, pip_id), body.note))


@router.post("/pips/{pip_id}/outcome")
def pip_close(pip_id: int, body: PipOutcomeIn, db: Session = Depends(get_db), user=Depends(get_current_user)):
    return _ser_pip(db, pip_outcome(db, user, _pip(db, user, pip_id), body.outcome, body.note, body.new_end_date))


@me_router.get("/probation-reviews")
def my_reviews(db: Session = Depends(get_db), user=Depends(get_current_user)):
    rows = db.query(ProbationReview).filter(ProbationReview.organization_id == user.organization_id, ProbationReview.employee_id == user.id,
                                            ProbationReview.status.in_(["SUBMITTED", "ISSUED"])).order_by(ProbationReview.id.desc()).all()
    return {"items": [_ser_review(db, r) for r in rows]}


@me_router.post("/probation-reviews/{review_id}/comments")
def my_review_comments(review_id: int, body: CommentIn, db: Session = Depends(get_db), user=Depends(get_current_user)):
    return _ser_review(db, employee_comment(db, user, _review(db, user, review_id), body.comments))


@me_router.post("/appraisals/{appraisal_id}/self-assessment")
def my_self_assessment(appraisal_id: int, body: SelfIn, db: Session = Depends(get_db), user=Depends(get_current_user)):
    a = self_assessment(db, user, _appraisal(db, user, appraisal_id), body.model_dump())
    return {"id": a.id, "self_submitted_at": a.self_submitted_at}


@me_router.post("/appraisals/{appraisal_id}/comments")
def my_appraisal_comments(appraisal_id: int, body: CommentIn, db: Session = Depends(get_db), user=Depends(get_current_user)):
    a = employee_appraisal_comments(db, user, _appraisal(db, user, appraisal_id), body.comments or "")
    return {"id": a.id, "employee_comments": a.employee_comments}
