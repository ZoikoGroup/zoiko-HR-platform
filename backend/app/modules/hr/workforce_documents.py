"""Workforce planning ↔ document engine (Prompt 2: HR-ORG-003/004/005/015).

* Job descriptions (HR-ORG-005): structured, versioned, approved by someone other than their author after an
  inclusive-language check; requisitions and positions link to an APPROVED version.
* Headcount requests (HR-ORG-003), position requests (HR-ORG-004) and succession plans (HR-ORG-015) gain a submit → approve /
  reject step (the approver is never the requester). The decision produces the authorization record; the engine reuses it for
  its L2 step when separation of duties holds.
* Succession plans are restricted: admin, hr_admin and the plan owner only. Named people never see them by default.
"""
from __future__ import annotations

import re
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.core.dependencies import get_current_user
from app.database import get_db
from app.modules.doc_templates import access, service as doc_service
from app.modules.hr.models import Designation, JobDescription, OrganizationConfig, WfHeadcount, WfSuccession
from app.modules.hr.recruitment_documents import _try_generate, documents_for_source

JD_RECORD, HEADCOUNT_RECORD, POSITION_RECORD, SUCCESSION_RECORD = "HR-ORG-005", "HR-ORG-003", "HR-ORG-004", "HR-ORG-015"

# Words that often signal gender or age bias in job adverts. Organizations add their own (organization_configs key
# "workforce.inclusive_language_terms", comma separated). A flag is a prompt to review, not a block.
DEFAULT_FLAG_TERMS = (
    "rockstar", "ninja", "guru", "young", "youthful", "energetic", "digital native", "recent graduate", "fresh graduate",
    "manpower", "chairman", "salesman", "foreman", "workmanlike", "he", "she", "his", "her", "him", "guys", "aggressive",
    "dominant", "mature", "native speaker", "able-bodied",
)


def flag_terms(db, organization_id: int) -> list[str]:
    row = db.query(OrganizationConfig).filter(OrganizationConfig.organization_id == organization_id,
                                              OrganizationConfig.key == "workforce.inclusive_language_terms").first()
    extra = [t.strip().lower() for t in (row.value or "").split(",") if t.strip()] if row else []
    return sorted(set(DEFAULT_FLAG_TERMS) | set(extra))


def inclusive_language_flags(db, organization_id: int, jd: JobDescription) -> list[dict]:
    texts = [("title", jd.title), ("purpose", jd.purpose)] + \
            [(f"responsibility {i + 1}", t) for i, t in enumerate(jd.key_responsibilities or [])] + \
            [(f"essential {i + 1}", t) for i, t in enumerate(jd.requirements_essential or [])] + \
            [(f"desirable {i + 1}", t) for i, t in enumerate(jd.requirements_desirable or [])]
    flags = []
    for term in flag_terms(db, organization_id):
        pattern = re.compile(rf"\b{re.escape(term)}\b", re.I)
        for where, text in texts:
            if text and pattern.search(str(text)):
                flags.append({"term": term, "where": where})
    return flags


def _decide(row, actor, approve: bool, comment: Optional[str], requester_id: Optional[int]) -> None:
    access.require_hr(actor)
    if requester_id and requester_id == actor.id:
        raise HTTPException(403, {"code": "SEPARATION_OF_DUTIES", "message": "Someone other than the requester must decide this."})
    if not approve and not (comment or "").strip():
        raise HTTPException(422, "Give a reason for rejecting.")
    row.decided_by, row.decided_at = actor.id, datetime.utcnow()
    row.decision_comment = (comment or "").strip()[:2000] or None


def _record(db, row, requester_id, decider, canonical_id, kind) -> None:
    from app.modules.employee.models import Employee
    requester = db.get(Employee, requester_id) if requester_id else None
    actor = requester if requester is not None and requester.is_active else decider
    prior = [{"approver_id": decider.id, "decided_at": row.decided_at, "comment": row.decision_comment, "source": f"{kind} approval"}]
    doc = _try_generate(db, actor, canonical_id=canonical_id, subject_type="org", subject_id=None, source_ref=f"{kind}:{row.id}",
                        trigger=f"{kind}.decided", prior_approvals=prior, issue=False)
    if doc is not None and doc.status in ("HUMAN_APPROVED", "RENDERED_DRAFT"):
        try:
            doc_service.issue(db, doc, decider, system_trigger=f"{kind}.decided")
        except HTTPException:
            db.rollback()


# ── job descriptions ─────────────────────────────────────────────────────────────────────────────────────────────────

JD_FIELDS = ("designation_id", "title", "purpose", "key_responsibilities", "requirements_essential", "requirements_desirable", "department_id",
             "reporting_to_designation_id", "direct_reports_summary", "work_location", "work_arrangement", "pay_grade_id",
             "physical_requirements")


def _jd(db, actor, jd_id) -> JobDescription:
    jd = db.get(JobDescription, jd_id)
    if jd is None or jd.organization_id != actor.organization_id:
        raise HTTPException(404, "Job description not found")
    return jd


def serialize_jd(db, jd: JobDescription) -> dict:
    return {**{k: getattr(jd, k) for k in ("id",) + JD_FIELDS + ("version", "status", "previous_version_id", "created_by", "decided_by",
                                                                  "decided_at", "decision_comment", "language_flags", "created_at", "updated_at")},
            "reference": f"JD-{jd.id:05d}"}


def _clean_list(v):
    return [str(x).strip()[:500] for x in (v or []) if str(x).strip()][:40]


def save_jd(db, actor, data: dict, jd: Optional[JobDescription] = None) -> JobDescription:
    access.require_hr(actor)
    if jd is not None and jd.status != "DRAFT":
        raise HTTPException(409, "Only a draft can be edited. Create a new version of an approved job description.")
    if jd is None:
        if not (data.get("title") or "").strip():
            raise HTTPException(422, "The job title is required.")
        jd = JobDescription(organization_id=actor.organization_id, created_by=actor.id, status="DRAFT", version=1)
        db.add(jd)
    for k in JD_FIELDS:
        if k in data:
            v = data[k]
            if k in ("key_responsibilities", "requirements_essential", "requirements_desirable"):
                v = _clean_list(v)
            if k == "work_arrangement" and v not in (None, "onsite", "hybrid", "remote"):
                raise HTTPException(422, "Working arrangement must be onsite, hybrid or remote.")
            setattr(jd, k, v)
    db.commit()
    return jd


def submit_jd(db, actor, jd: JobDescription) -> JobDescription:
    access.require_hr(actor)
    if jd.status != "DRAFT":
        raise HTTPException(409, "Only a draft can be submitted.")
    if not (jd.purpose and jd.key_responsibilities and jd.requirements_essential):
        raise HTTPException(422, "Add the purpose, key responsibilities and essential requirements before submitting.")
    jd.language_flags = inclusive_language_flags(db, actor.organization_id, jd)
    jd.status = "PENDING"
    db.commit()
    return jd


def decide_jd(db, actor, jd: JobDescription, approve: bool, comment: Optional[str]) -> JobDescription:
    if jd.status != "PENDING":
        raise HTTPException(409, "This job description is not waiting for approval.")
    _decide(jd, actor, approve, comment, jd.created_by)
    if not approve:
        jd.status = "DRAFT"
        db.commit()
        return jd
    for old in db.query(JobDescription).filter(JobDescription.organization_id == jd.organization_id, JobDescription.status == "APPROVED",
                                               JobDescription.id != jd.id).all():
        if old.id == jd.previous_version_id or (jd.designation_id and old.designation_id == jd.designation_id):
            old.status = "RETIRED"
    jd.status = "APPROVED"
    db.commit()
    _try_generate(db, actor, canonical_id=JD_RECORD, subject_type="org", subject_id=None, source_ref=f"job_description:{jd.id}",
                  trigger="job_description.approved")
    return jd


def new_jd_version(db, actor, jd: JobDescription) -> JobDescription:
    access.require_hr(actor)
    if jd.status != "APPROVED":
        raise HTTPException(409, "Create new versions from the approved job description.")
    copy = JobDescription(organization_id=jd.organization_id, created_by=actor.id, status="DRAFT", version=jd.version + 1,
                          previous_version_id=jd.id, **{k: getattr(jd, k) for k in JD_FIELDS})
    db.add(copy)
    db.commit()
    return copy


# ── headcount, positions, succession ─────────────────────────────────────────────────────────────────────────────────

def _hc(db, actor, hc_id) -> WfHeadcount:
    h = db.get(WfHeadcount, hc_id)
    if h is None or h.organization_id != actor.organization_id or h.deleted_at is not None:
        raise HTTPException(404, "Headcount record not found")
    return h


def submit_headcount(db, actor, h: WfHeadcount, rationale: str, plan_id: Optional[int]) -> WfHeadcount:
    access.require_hr(actor)
    if h.status not in ("draft", "rejected"):
        raise HTTPException(409, "This headcount request was already submitted.")
    if not (rationale or "").strip():
        raise HTTPException(422, "Give the rationale for the headcount.")
    h.rationale, h.plan_id, h.requested_by, h.status = rationale.strip()[:5000], plan_id, actor.id, "submitted"
    h.decided_by = h.decided_at = h.decision_comment = None
    db.commit()
    return h


def decide_headcount(db, actor, h: WfHeadcount, approve: bool, comment: Optional[str]) -> WfHeadcount:
    if h.status != "submitted":
        raise HTTPException(409, "This headcount request is not waiting for a decision.")
    _decide(h, actor, approve, comment, h.requested_by)
    h.status = "approved" if approve else "rejected"
    db.commit()
    _record(db, h, h.requested_by, actor, HEADCOUNT_RECORD, "wf_headcount")
    return h


def _designation(db, actor, did) -> Designation:
    d = db.get(Designation, did)
    if d is None or d.organization_id != actor.organization_id:
        raise HTTPException(404, "Position not found")
    return d


def request_position(db, actor, d: Designation, data: dict) -> Designation:
    access.require_hr(actor)
    if not (data.get("reason") or "").strip():
        raise HTTPException(422, "Give the reason for the new position.")
    for k in ("reports_to_designation_id", "pay_grade_id", "employment_type", "location", "job_description_id"):
        if k in data:
            setattr(d, k, data[k])
    d.position_reason, d.requested_by, d.approval_status = data["reason"].strip()[:4000], actor.id, "pending"
    d.decided_by = d.decided_at = d.decision_comment = None
    d.status = "inactive"                                 # not usable until approved
    db.commit()
    return d


def decide_position(db, actor, d: Designation, approve: bool, comment: Optional[str]) -> Designation:
    if d.approval_status != "pending":
        raise HTTPException(409, "This position is not waiting for approval.")
    _decide(d, actor, approve, comment, d.requested_by or d.created_by)
    d.approval_status = "approved" if approve else "rejected"
    if approve:
        d.status = "active"
    db.commit()
    _record(db, d, d.requested_by or d.created_by, actor, POSITION_RECORD, "designation")
    return d


def can_see_succession(actor, s: WfSuccession) -> bool:
    return access.is_hr(actor) or (s.owner_id is not None and s.owner_id == actor.id)


def _succ(db, actor, sid) -> WfSuccession:
    s = db.get(WfSuccession, sid)
    if s is None or s.organization_id != actor.organization_id or s.deleted_at is not None or not can_see_succession(actor, s):
        raise HTTPException(404, "Succession plan not found")
    return s


def submit_succession(db, actor, s: WfSuccession, owner_id: Optional[int], development_actions: Optional[str]) -> WfSuccession:
    access.require_hr(actor)
    if s.status not in ("draft", "rejected"):
        raise HTTPException(409, "This succession plan was already submitted.")
    if owner_id is not None:
        from app.modules.employee.models import Employee
        owner = db.get(Employee, owner_id)
        if owner is None or owner.organization_id != actor.organization_id:
            raise HTTPException(400, "The plan owner was not found.")
        if owner_id in (s.employee_id, s.successor_employee_id):
            raise HTTPException(400, "A person named in the plan cannot own it.")
        s.owner_id = owner_id
    if development_actions is not None:
        s.development_actions = development_actions.strip()[:4000] or None
    s.requested_by, s.status = actor.id, "submitted"
    db.commit()
    return s


def decide_succession(db, actor, s: WfSuccession, approve: bool, comment: Optional[str]) -> WfSuccession:
    if s.status != "submitted":
        raise HTTPException(409, "This succession plan is not waiting for a decision.")
    _decide(s, actor, approve, comment, s.requested_by)
    s.status = "approved" if approve else "rejected"
    db.commit()
    _record(db, s, s.requested_by, actor, SUCCESSION_RECORD, "wf_succession")
    return s


# ── HTTP ─────────────────────────────────────────────────────────────────────────────────────────────────────────────

router = APIRouter(prefix="/hr/workforce", tags=["Workforce documents"])


class JDBody(BaseModel):
    designation_id: Optional[int] = None
    title: Optional[str] = Field(None, max_length=200)
    purpose: Optional[str] = Field(None, max_length=4000)
    key_responsibilities: Optional[list[str]] = Field(None, max_length=40)
    requirements_essential: Optional[list[str]] = Field(None, max_length=40)
    requirements_desirable: Optional[list[str]] = Field(None, max_length=40)
    department_id: Optional[int] = None
    reporting_to_designation_id: Optional[int] = None
    direct_reports_summary: Optional[str] = Field(None, max_length=2000)
    work_location: Optional[str] = Field(None, max_length=200)
    work_arrangement: Optional[str] = Field(None, max_length=10)
    pay_grade_id: Optional[int] = None
    physical_requirements: Optional[str] = Field(None, max_length=2000)


class Decision(BaseModel):
    approve: bool
    comment: Optional[str] = Field(None, max_length=2000)


class HeadcountSubmit(BaseModel):
    rationale: str = Field(..., min_length=1, max_length=5000)
    plan_id: Optional[int] = None


class PositionRequest(BaseModel):
    reason: str = Field(..., min_length=1, max_length=4000)
    reports_to_designation_id: Optional[int] = None
    pay_grade_id: Optional[int] = None
    employment_type: Optional[str] = Field(None, max_length=30)
    location: Optional[str] = Field(None, max_length=200)
    job_description_id: Optional[int] = None


class SuccessionSubmit(BaseModel):
    owner_id: Optional[int] = None
    development_actions: Optional[str] = Field(None, max_length=4000)


@router.get("/job-descriptions")
def list_jds(status: Optional[str] = Query(None, max_length=20), designation_id: Optional[int] = None, db: Session = Depends(get_db),
             user=Depends(get_current_user)):
    access.require_hr(user)
    q = db.query(JobDescription).filter(JobDescription.organization_id == user.organization_id)
    if status:
        q = q.filter(JobDescription.status == status)
    if designation_id:
        q = q.filter(JobDescription.designation_id == designation_id)
    rows = q.order_by(JobDescription.id.desc()).limit(500).all()
    return {"items": [serialize_jd(db, j) for j in rows], "total": len(rows)}


@router.post("/job-descriptions", status_code=201)
def create_jd(body: JDBody, db: Session = Depends(get_db), user=Depends(get_current_user)):
    return serialize_jd(db, save_jd(db, user, body.model_dump(exclude_unset=True)))


@router.get("/job-descriptions/{jd_id}")
def get_jd(jd_id: int, db: Session = Depends(get_db), user=Depends(get_current_user)):
    access.require_hr(user)
    jd = _jd(db, user, jd_id)
    return {**serialize_jd(db, jd), **documents_for_source(db, user.organization_id, f"job_description:{jd.id}")}


@router.put("/job-descriptions/{jd_id}")
def update_jd(jd_id: int, body: JDBody, db: Session = Depends(get_db), user=Depends(get_current_user)):
    return serialize_jd(db, save_jd(db, user, body.model_dump(exclude_unset=True), _jd(db, user, jd_id)))


@router.post("/job-descriptions/{jd_id}/language-check")
def jd_language_check(jd_id: int, db: Session = Depends(get_db), user=Depends(get_current_user)):
    access.require_hr(user)
    return {"flags": inclusive_language_flags(db, user.organization_id, _jd(db, user, jd_id))}


@router.post("/job-descriptions/{jd_id}/submit")
def submit_jd_route(jd_id: int, db: Session = Depends(get_db), user=Depends(get_current_user)):
    return serialize_jd(db, submit_jd(db, user, _jd(db, user, jd_id)))


@router.post("/job-descriptions/{jd_id}/decision")
def decide_jd_route(jd_id: int, body: Decision, db: Session = Depends(get_db), user=Depends(get_current_user)):
    return serialize_jd(db, decide_jd(db, user, _jd(db, user, jd_id), body.approve, body.comment))


@router.post("/job-descriptions/{jd_id}/new-version", status_code=201)
def jd_new_version(jd_id: int, db: Session = Depends(get_db), user=Depends(get_current_user)):
    return serialize_jd(db, new_jd_version(db, user, _jd(db, user, jd_id)))


@router.post("/headcount/{hc_id}/submit")
def submit_hc(hc_id: int, body: HeadcountSubmit, db: Session = Depends(get_db), user=Depends(get_current_user)):
    h = submit_headcount(db, user, _hc(db, user, hc_id), body.rationale, body.plan_id)
    return {"id": h.id, "status": h.status}


@router.post("/headcount/{hc_id}/decision")
def decide_hc(hc_id: int, body: Decision, db: Session = Depends(get_db), user=Depends(get_current_user)):
    h = decide_headcount(db, user, _hc(db, user, hc_id), body.approve, body.comment)
    return {"id": h.id, "status": h.status, **documents_for_source(db, user.organization_id, f"wf_headcount:{h.id}")}


@router.get("/headcount/{hc_id}/authorization")
def hc_authorization(hc_id: int, db: Session = Depends(get_db), user=Depends(get_current_user)):
    access.require_hr(user)
    h = _hc(db, user, hc_id)
    return {"id": h.id, "status": h.status, "rationale": h.rationale, "requested_by": h.requested_by, "decided_by": h.decided_by,
            "decided_at": h.decided_at, "decision_comment": h.decision_comment,
            **documents_for_source(db, user.organization_id, f"wf_headcount:{h.id}")}


@router.post("/positions/{designation_id}/request")
def position_request(designation_id: int, body: PositionRequest, db: Session = Depends(get_db), user=Depends(get_current_user)):
    d = request_position(db, user, _designation(db, user, designation_id), body.model_dump(exclude_unset=True))
    return {"id": d.id, "approval_status": d.approval_status, "status": d.status}


@router.post("/positions/{designation_id}/decision")
def position_decision(designation_id: int, body: Decision, db: Session = Depends(get_db), user=Depends(get_current_user)):
    d = decide_position(db, user, _designation(db, user, designation_id), body.approve, body.comment)
    return {"id": d.id, "approval_status": d.approval_status, "status": d.status,
            **documents_for_source(db, user.organization_id, f"designation:{d.id}")}


@router.get("/positions/{designation_id}/authorization")
def position_authorization(designation_id: int, db: Session = Depends(get_db), user=Depends(get_current_user)):
    access.require_hr(user)
    d = _designation(db, user, designation_id)
    return {"id": d.id, "approval_status": d.approval_status, "position_reason": d.position_reason, "requested_by": d.requested_by,
            "decided_by": d.decided_by, "decided_at": d.decided_at, "decision_comment": d.decision_comment,
            **documents_for_source(db, user.organization_id, f"designation:{d.id}")}


@router.post("/succession/{succ_id}/submit")
def succession_submit(succ_id: int, body: SuccessionSubmit, db: Session = Depends(get_db), user=Depends(get_current_user)):
    s = submit_succession(db, user, _succ(db, user, succ_id), body.owner_id, body.development_actions)
    return {"id": s.id, "status": s.status, "owner_id": s.owner_id}


@router.post("/succession/{succ_id}/decision")
def succession_decision(succ_id: int, body: Decision, db: Session = Depends(get_db), user=Depends(get_current_user)):
    s = decide_succession(db, user, _succ(db, user, succ_id), body.approve, body.comment)
    return {"id": s.id, "status": s.status, **documents_for_source(db, user.organization_id, f"wf_succession:{s.id}")}


@router.get("/succession/{succ_id}/plan-document")
def succession_document(succ_id: int, db: Session = Depends(get_db), user=Depends(get_current_user)):
    s = _succ(db, user, succ_id)
    return {"id": s.id, "status": s.status, "owner_id": s.owner_id, **documents_for_source(db, user.organization_id, f"wf_succession:{s.id}")}
