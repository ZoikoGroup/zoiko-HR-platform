"""Recruitment insights for the redesigned Recruitment screens (dashboard, requisitions, interviews, offers).

Every number is computed from the organization's own rows; nothing is estimated. Each KPI carries:

    value       the figure shown on the card (a count "now", or a rate/average over the stated window)
    current     the same measure for the comparison window that ends today
    previous    the window of the same length just before it
    change_pct  (current - previous) / previous, or None when previous is 0 (no honest percentage exists)
    window      what the comparison covers, e.g. "30d" (last 30 days vs the 30 before) or "week" (this week vs last)
    series      8 weekly points ending this week (for the sparkline), oldest first
    better      "up" or "down": which direction is good (time to hire and cancellation rate are better when lower)

GET /hr/recruitment/insights?section=dashboard|requisitions|interviews|offers — read access as the recruitment screens.
"""
from __future__ import annotations

from collections import Counter, defaultdict
from datetime import date, datetime, timedelta
from typing import Iterable, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.modules.hr.models import (InterviewStatus, OfferStatus, RecruitmentCandidate, RecruitmentCandidateStatus,
                                   RecruitmentInterview, RecruitmentInterviewFeedback, RecruitmentOffer,
                                   RecruitmentRequisition, RequisitionStatus)
from app.modules.hr.recruitment_router import get_recruitment_reader

router = APIRouter(prefix="/hr/recruitment", tags=["Recruitment insights"])

WEEKS = 8
SECTIONS = ("dashboard", "requisitions", "candidates", "interviews", "offers", "onboarding")
FEEDBACK_DUE_DAYS = 2           # feedback is "overdue" this many days after the interview


# ── small helpers ────────────────────────────────────────────────────────────────────────────────────────────────────

def _day(v) -> Optional[date]:
    if v is None:
        return None
    return v.date() if isinstance(v, datetime) else v


def _val(e):
    return getattr(e, "value", e)


def _week_start(d: date) -> date:
    return d - timedelta(days=d.weekday())


def _pct(cur, prev) -> Optional[float]:
    if cur is None or prev in (None, 0):
        return None
    return round((cur - prev) * 100.0 / prev, 1)


def _kpi(value, current, previous, series, window="30d", better="up") -> dict:
    return {"value": value, "current": current, "previous": previous, "change_pct": _pct(current, previous),
            "window": window, "series": series, "better": better}


def _in(d: Optional[date], start: date, end: date) -> bool:
    """start inclusive, end exclusive."""
    return d is not None and start <= d < end


def _windows(today: date):
    """(current 30 days, previous 30 days) as (start, end) pairs, end exclusive."""
    cur = (today - timedelta(days=29), today + timedelta(days=1))
    prev = (today - timedelta(days=59), today - timedelta(days=29))
    return cur, prev


def _weekly_counts(days: Iterable[Optional[date]], today: date) -> list[int]:
    first = _week_start(today) - timedelta(weeks=WEEKS - 1)
    out = [0] * WEEKS
    for d in days:
        if d is None or d < first or d > today + timedelta(days=6 - today.weekday()):
            continue
        out[min((d - first).days // 7, WEEKS - 1)] += 1
    return out


def _weekly_avg(pairs: Iterable[tuple[Optional[date], float]], today: date) -> list[Optional[float]]:
    first = _week_start(today) - timedelta(weeks=WEEKS - 1)
    sums, counts = [0.0] * WEEKS, [0] * WEEKS
    for d, v in pairs:
        if d is None or d < first:
            continue
        i = min((d - first).days // 7, WEEKS - 1)
        sums[i] += v
        counts[i] += 1
    return [round(sums[i] / counts[i], 1) if counts[i] else None for i in range(WEEKS)]


def _count_in(days: Iterable[Optional[date]], window) -> int:
    return sum(1 for d in days if _in(d, *window))


def _names(db, ids: Iterable[Optional[int]]) -> dict:
    from app.modules.employee.models import Employee
    wanted = {i for i in ids if i}
    if not wanted:
        return {}
    rows = db.query(Employee.id, Employee.first_name, Employee.last_name).filter(Employee.id.in_(wanted)).all()
    return {r.id: " ".join(p for p in (r.first_name, r.last_name) if p).strip() or f"#{r.id}" for r in rows}


# ── loaders (one query per table, organization-scoped) ──────────────────────────────────────────────────────────────

_LOADERS = {
    "reqs": lambda db, org: db.query(RecruitmentRequisition).filter(RecruitmentRequisition.organization_id == org).all(),
    "cands": lambda db, org: db.query(RecruitmentCandidate).filter(RecruitmentCandidate.organization_id == org).all(),
    "ivs": lambda db, org: db.query(RecruitmentInterview).filter(RecruitmentInterview.organization_id == org).all(),
    "offers": lambda db, org: db.query(RecruitmentOffer).filter(RecruitmentOffer.organization_id == org).all(),
    "feedback": lambda db, org: (db.query(RecruitmentInterviewFeedback.interview_id, RecruitmentInterviewFeedback.interviewer_id)
                                 .filter(RecruitmentInterviewFeedback.organization_id == org).all()),
}


def _load(db, org: int, *tables: str) -> dict:
    """Only the tables a section uses: against a distant database every query costs a round trip."""
    return {t: _LOADERS[t](db, org) for t in tables}


def _feedback_map(data) -> dict:
    out = defaultdict(set)
    for iid, who in data["feedback"]:
        out[iid].add(who)
    return out


def _has_feedback(iv, fb) -> bool:
    return bool(fb.get(iv.id)) or bool((iv.feedback or "").strip()) or iv.rating is not None


# ── metrics shared by several screens ────────────────────────────────────────────────────────────────────────────────

def _time_to_hire(cands, today):
    hires = [(c.hired_at, max(((c.hired_at - c.applied_at).total_seconds() / 86400), 0))
             for c in cands if _val(c.status) == "hired" and c.hired_at and c.applied_at]
    cur_w, prev_w = _windows(today)
    def avg(rows):
        rows = list(rows)
        return round(sum(v for _, v in rows) / len(rows), 1) if rows else None
    value = avg(hires)
    cur = avg((h, v) for h, v in hires if _in(_day(h), *cur_w))
    prev = avg((h, v) for h, v in hires if _in(_day(h), *prev_w))
    return _kpi(value, cur, prev, _weekly_avg(((_day(h), v) for h, v in hires), today), better="down") | {"measured": len(hires)}


def _decided_offers(offers):
    """(decision day, accepted?) for offers the candidate answered."""
    out = []
    for o in offers:
        st = _val(o.status)
        if st == "accepted":
            out.append((_day(o.accepted_at or o.updated_at), True))
        elif st == "rejected":
            out.append((_day(o.updated_at), False))
    return out


def _acceptance(offers, today):
    decided = _decided_offers(offers)
    cur_w, prev_w = _windows(today)
    def rate(rows):
        rows = list(rows)
        return round(sum(1 for _, a in rows if a) * 100.0 / len(rows), 1) if rows else None
    first = _week_start(today) - timedelta(weeks=WEEKS - 1)
    series = []
    for i in range(WEEKS):
        s = first + timedelta(weeks=i)
        series.append(rate((d, a) for d, a in decided if _in(d, s, s + timedelta(days=7))))
    return _kpi(rate(decided), rate((d, a) for d, a in decided if _in(d, *cur_w)),
                rate((d, a) for d, a in decided if _in(d, *prev_w)), series) | {"decided": len(decided)}


def _week_bounds(today):
    start = _week_start(today)
    return (start, start + timedelta(days=7)), (start - timedelta(days=7), start)


# ── sections ─────────────────────────────────────────────────────────────────────────────────────────────────────────

def dashboard(db, org: int, today: date) -> dict:
    d = _load(db, org, "reqs", "cands", "ivs", "offers")
    reqs, cands, ivs, offers = d["reqs"], d["cands"], d["ivs"], d["offers"]
    cur_w, prev_w = _windows(today)
    this_week, last_week = _week_bounds(today)

    req_created = [_day(r.created_at) for r in reqs]
    applied = [_day(c.applied_at or c.created_at) for c in cands]
    iv_days = [iv.interview_date for iv in ivs if _val(iv.status) != "cancelled"]
    offer_created = [_day(o.created_at) for o in offers]
    in_progress = ("draft", "pending", "approved", "countered")

    kpis = {
        "open_requisitions": _kpi(sum(1 for r in reqs if _val(r.status) == "open"), _count_in(req_created, cur_w),
                                  _count_in(req_created, prev_w), _weekly_counts(req_created, today)),
        "active_candidates": _kpi(sum(1 for c in cands if _val(c.status) not in ("hired", "rejected")),
                                  _count_in(applied, cur_w), _count_in(applied, prev_w), _weekly_counts(applied, today)),
        "interviews_this_week": _kpi(_count_in(iv_days, this_week), _count_in(iv_days, this_week), _count_in(iv_days, last_week),
                                     _weekly_counts(iv_days, today), window="week"),
        "offers_in_progress": _kpi(sum(1 for o in offers if _val(o.status) in in_progress), _count_in(offer_created, cur_w),
                                   _count_in(offer_created, prev_w), _weekly_counts(offer_created, today)),
        "time_to_hire": _time_to_hire(cands, today),
        "offer_acceptance_rate": _acceptance(offers, today),
    }

    by_status = Counter(_val(c.status) for c in cands)
    total = len(cands)
    pipeline = [{"key": "sourced", "label": "Sourced", "count": total}] + [
        {"key": k, "label": k.capitalize(), "count": by_status.get(k, 0)} for k in ("applied", "screening", "interview", "offer", "hired")]
    for p in pipeline:
        p["pct"] = round(p["count"] * 100.0 / total) if total else 0

    # requisition health per department: open with nobody past screening / in progress (interview or offer) / filled
    late = defaultdict(int)
    for c in cands:
        if c.requisition_id and _val(c.status) in ("interview", "offer"):
            late[c.requisition_id] += 1
    health = defaultdict(lambda: {"open": 0, "in_progress": 0, "filled": 0})
    for r in reqs:
        dept = (r.department or "Unassigned").strip() or "Unassigned"
        filled = (r.openings or 0) > 0 and (r.filled or 0) >= (r.openings or 0)
        if filled:
            health[dept]["filled"] += 1
        elif _val(r.status) == "open":
            health[dept]["in_progress" if late.get(r.id) else "open"] += 1
    requisition_health = sorted(({"department": k, **v} for k, v in health.items()),
                                key=lambda x: -(x["open"] + x["in_progress"] + x["filled"]))[:8]

    upcoming = sorted((iv for iv in ivs if _val(iv.status) == "scheduled" and iv.interview_date and iv.interview_date >= today),
                      key=lambda iv: (iv.interview_date, iv.start_time or ""))[:6]
    names = _names(db, [iv.interviewer_id for iv in upcoming])
    upcoming_interviews = [{"id": iv.id, "candidate_id": iv.candidate_id, "candidate_name": iv.candidate_name, "position": iv.position,
                            "interviewer": names.get(iv.interviewer_id) or iv.interviewer, "date": iv.interview_date,
                            "start_time": iv.start_time, "end_time": iv.end_time, "meeting_link": iv.meeting_link,
                            "interview_type": iv.interview_type} for iv in upcoming]

    events = []
    for o in offers:
        if _val(o.status) == "accepted" and o.accepted_at:
            events.append({"type": "offer_accepted", "at": o.accepted_at, "title": "Offer accepted",
                           "detail": f"{o.candidate_name} accepted the offer for {o.position}"})
    for c in cands:
        if c.created_at:
            events.append({"type": "candidate_added", "at": c.created_at, "title": "New candidate added",
                           "detail": f"{c.name} applied for {c.position}"})
        if _val(c.status) == "offer" and c.updated_at:
            events.append({"type": "moved_to_offer", "at": c.updated_at, "title": "Candidate moved to Offer",
                           "detail": f"{c.name} moved to the offer stage for {c.position}"})
    for iv in ivs:
        if iv.created_at:
            events.append({"type": "interview_scheduled", "at": iv.created_at, "title": "Interview scheduled",
                           "detail": f"{iv.candidate_name} for {iv.position}"})
    for r in reqs:
        if r.created_at:
            events.append({"type": "requisition_created", "at": r.created_at, "title": "Requisition created",
                           "detail": f"{r.title}{' (' + r.department + ')' if r.department else ''}"})
    recent_activity = sorted(events, key=lambda e: e["at"], reverse=True)[:8]

    sources = Counter(((c.source or "").strip() or "Other") for c in cands)
    top = sources.most_common(5)
    rest = total - sum(n for _, n in top)
    top_sources = [{"source": s, "count": n, "pct": round(n * 100.0 / total) if total else 0} for s, n in top]
    if rest > 0:
        top_sources.append({"source": "Other", "count": rest, "pct": round(rest * 100.0 / total)})

    return {"kpis": kpis, "pipeline": pipeline, "requisition_health": requisition_health,
            "upcoming_interviews": upcoming_interviews, "recent_activity": recent_activity, "top_sources": top_sources}


def requisitions(db, org: int, today: date) -> dict:
    d = _load(db, org, "reqs", "cands")
    reqs, cands = d["reqs"], d["cands"]
    cur_w, prev_w = _windows(today)
    month = (today.replace(day=1), today + timedelta(days=1))
    prev_month_end = today.replace(day=1)
    prev_month = ((prev_month_end - timedelta(days=1)).replace(day=1), prev_month_end)
    created = [_day(r.created_at) for r in reqs]
    def created_with(status):
        return [_day(r.created_at) for r in reqs if _val(r.status) == status]
    hires = [_day(c.hired_at) for c in cands if c.requisition_id and _val(c.status) == "hired" and c.hired_at]
    seats = sum(max((r.openings or 0) - (r.filled or 0), 0) for r in reqs if _val(r.status) == "open")
    by_status = Counter(_val(r.status) for r in reqs)
    kpis = {
        "open": _kpi(by_status.get("open", 0), _count_in(created_with("open"), cur_w), _count_in(created_with("open"), prev_w),
                     _weekly_counts(created_with("open"), today)),
        "pending_approval": _kpi(by_status.get("pending", 0), _count_in(created_with("pending"), cur_w),
                                 _count_in(created_with("pending"), prev_w), _weekly_counts(created_with("pending"), today)),
        "positions_to_fill": _kpi(seats, _count_in(created, cur_w), _count_in(created, prev_w), _weekly_counts(created, today)),
        "filled_this_month": _kpi(_count_in(hires, month), _count_in(hires, month), _count_in(hires, prev_month),
                                  _weekly_counts(hires, today), window="month"),
        "on_hold": _kpi(by_status.get("on_hold", 0), _count_in(created_with("on_hold"), cur_w),
                        _count_in(created_with("on_hold"), prev_w), _weekly_counts(created_with("on_hold"), today), better="down"),
    }
    counts = {"all": len(reqs), **{s.value: by_status.get(s.value, 0) for s in RequisitionStatus}}
    managers = _names(db, [r.hiring_manager_id for r in reqs])
    return {"kpis": kpis, "status_counts": counts,
            "hiring_managers": [{"id": i, "name": n} for i, n in sorted(managers.items(), key=lambda x: x[1])],
            "departments": sorted({r.department for r in reqs if r.department}),
            "locations": sorted({r.location for r in reqs if r.location})}


def interviews(db, org: int, today: date) -> dict:
    d = _load(db, org, "ivs", "feedback")
    ivs, fb = d["ivs"], _feedback_map(d)
    this_week, last_week = _week_bounds(today)
    month = (today.replace(day=1), today + timedelta(days=1))
    prev_month_end = today.replace(day=1)
    prev_month = ((prev_month_end - timedelta(days=1)).replace(day=1), prev_month_end)
    live = [iv for iv in ivs if _val(iv.status) != "cancelled"]
    live_days = [iv.interview_date for iv in live]
    same_day_last_week = today - timedelta(days=7)

    def pending(iv):
        return iv.interview_date and iv.interview_date <= today and _val(iv.status) in ("completed", "scheduled", "in_progress") \
            and not _has_feedback(iv, fb)
    pend = [iv for iv in ivs if pending(iv)]
    week_ago = today - timedelta(days=7)
    completed = [iv.interview_date for iv in ivs if _val(iv.status) == "completed"]

    def cancel_rate(window):
        rows = [iv for iv in ivs if _in(iv.interview_date, *window) and iv.interview_date <= today]
        return round(sum(1 for iv in rows if _val(iv.status) == "cancelled") * 100.0 / len(rows), 1) if rows else None
    first = _week_start(today) - timedelta(weeks=WEEKS - 1)
    rate_series = [cancel_rate((first + timedelta(weeks=i), first + timedelta(weeks=i + 1))) for i in range(WEEKS)]

    kpis = {
        "scheduled_today": _kpi(sum(1 for x in live_days if x == today), sum(1 for x in live_days if x == today),
                                sum(1 for x in live_days if x == same_day_last_week), _weekly_counts(live_days, today), window="day"),
        "scheduled_this_week": _kpi(_count_in(live_days, this_week), _count_in(live_days, this_week),
                                    _count_in(live_days, last_week), _weekly_counts(live_days, today), window="week"),
        "pending_feedback": _kpi(len(pend), sum(1 for iv in pend if iv.interview_date > week_ago),
                                 sum(1 for iv in pend if week_ago - timedelta(days=7) < iv.interview_date <= week_ago),
                                 _weekly_counts((iv.interview_date for iv in pend), today), window="week", better="down"),
        "completed": _kpi(_count_in(completed, month), _count_in(completed, month), _count_in(completed, prev_month),
                          _weekly_counts(completed, today), window="month"),
        "cancel_rate": _kpi(cancel_rate(month), cancel_rate(month), cancel_rate(prev_month), rate_series,
                            window="month", better="down"),
    }

    ids = {iv.interviewer_id for iv in ivs} | {w for s in fb.values() for w in s}
    names = _names(db, ids)
    panels = {}
    for iv in ivs[-500:]:
        people = ([iv.interviewer_id] if iv.interviewer_id else []) + sorted(w for w in fb.get(iv.id, set()) if w != iv.interviewer_id)
        panel = [names.get(p) for p in people if names.get(p)] or ([iv.interviewer] if iv.interviewer else [])
        panels[iv.id] = {"members": panel, "feedback_count": len(fb.get(iv.id, set())) + (1 if (iv.feedback or "").strip() and not fb.get(iv.id) else 0)}

    agenda = sorted((iv for iv in ivs if iv.interview_date == today), key=lambda iv: iv.start_time or "")
    today_agenda = [{"id": iv.id, "time": iv.start_time, "candidate_name": iv.candidate_name, "position": iv.position,
                     "interview_type": iv.interview_type, "status": _val(iv.status)} for iv in agenda]

    horizon = (today - timedelta(days=30), today + timedelta(days=31))
    load = Counter(iv.interviewer_id or iv.interviewer for iv in live if _in(iv.interview_date, *horizon) and (iv.interviewer_id or iv.interviewer))
    top_load = load.most_common(5)
    peak = top_load[0][1] if top_load else 0
    workload = [{"interviewer": names.get(k, k) if isinstance(k, int) else k, "count": n,
                 "pct": round(n * 100.0 / peak) if peak else 0} for k, n in top_load]

    done = [iv for iv in ivs if _val(iv.status) == "completed" or (iv.interview_date and iv.interview_date < today and _val(iv.status) != "cancelled")]
    with_fb = sum(1 for iv in done if _has_feedback(iv, fb))
    overdue = sum(1 for iv in done if not _has_feedback(iv, fb) and iv.interview_date
                  and (today - iv.interview_date).days > FEEDBACK_DUE_DAYS)
    completion = {"completed": with_fb, "pending": len(done) - with_fb - overdue, "overdue": overdue,
                  "pct": round(with_fb * 100.0 / len(done)) if done else None, "due_days": FEEDBACK_DUE_DAYS}
    return {"kpis": kpis, "panels": panels, "today_agenda": today_agenda, "interviewer_workload": workload,
            "feedback_completion": completion}


def offers(db, org: int, today: date) -> dict:
    from app.modules.doc_templates.models import DocumentEvent
    d = _load(db, org, "offers")
    rows = d["offers"]
    cur_w, prev_w = _windows(today)
    st = lambda o: _val(o.status)
    def kp(pred, day_of, better="up"):
        days = [day_of(o) for o in rows if pred(o)]
        return _kpi(sum(1 for o in rows if pred(o)), _count_in(days, cur_w), _count_in(days, prev_w), _weekly_counts(days, today),
                    better=better)
    kpis = {
        "drafts": kp(lambda o: st(o) == "draft", lambda o: _day(o.created_at)),
        "ready_to_send": kp(lambda o: st(o) == "approved" and not o.issued_at, lambda o: _day(o.approved_at or o.updated_at)),
        "sent": kp(lambda o: o.issued_at is not None, lambda o: _day(o.issued_at)),
        "awaiting_response": kp(lambda o: st(o) in ("pending", "countered") and o.issued_at is not None, lambda o: _day(o.issued_at)),
        "accepted": kp(lambda o: st(o) == "accepted", lambda o: _day(o.accepted_at or o.updated_at)),
        "declined": kp(lambda o: st(o) == "rejected", lambda o: _day(o.updated_at), better="down"),
    }

    # per offer: delivery (sent / link opened) and the last thing that happened, from the letter's evidence events
    doc_ids = {o.document_id: o.id for o in rows if o.document_id}
    evs = defaultdict(list)
    if doc_ids:
        for e in (db.query(DocumentEvent.document_id, DocumentEvent.event_type, DocumentEvent.created_at)
                  .filter(DocumentEvent.organization_id == org, DocumentEvent.document_id.in_(list(doc_ids)))
                  .order_by(DocumentEvent.created_at).all()):
            evs[e.document_id].append(e)
    labels = {"emailed": "Email sent", "delivered": "Email delivered", "viewed": "Letter opened", "signed": "Letter signed",
              "reminded": "Reminder sent", "previewed": "Previewed by HR", "approved": "Letter approved", "rendered": "Letter generated",
              "approval_waived": "Generated without approval", "issued": "Letter sent"}
    approvers = _names(db, [o.approved_by for o in rows])
    activity = {}
    for o in rows:
        e = [x for x in evs.get(o.document_id, []) if x.event_type in labels]
        sent = next((x.created_at for x in e if x.event_type in ("emailed", "delivered")), None) or o.issued_at
        opened = next((x.created_at for x in e if x.event_type == "viewed"), None)
        last = e[-1] if e else None
        fallback = (("Offer accepted", o.accepted_at) if o.accepted_at else ("Letter sent", o.issued_at) if o.issued_at
                    else ("Offer approved", o.approved_at) if o.approved_at else ("Draft updated", o.updated_at or o.created_at))
        last_label, last_at = (labels[last.event_type], last.created_at) if last and (not fallback[1] or last.created_at >= fallback[1]) else fallback
        activity[o.id] = {"last_activity": {"label": last_label, "at": last_at}, "delivery": {"sent_at": sent, "opened_at": opened},
                          "approved_by_name": approvers.get(o.approved_by)}

    entities = sorted({o.entity_name for o in rows if o.entity_name})
    managers = _names(db, [o.reporting_manager_id for o in rows])
    return {"kpis": kpis, "activity": activity, "entities": entities,
            "hiring_managers": [{"id": i, "name": n} for i, n in sorted(managers.items(), key=lambda x: x[1])]}


def candidates(db, org: int, today: date) -> dict:
    """The whole candidate pool by stage (the list screen pages through at most 100 rows, so it cannot count them itself)."""
    cands = _load(db, org, "cands")["cands"]
    cur_w, prev_w = _windows(today)
    applied = [_day(c.applied_at or c.created_at) for c in cands]
    by_status = Counter(_val(c.status) for c in cands)

    def stage(key):          # a count "now" — no honest previous value exists for a stage, so no trend is claimed
        return {"value": by_status.get(key, 0), "current": None, "previous": None, "change_pct": None, "window": None,
                "series": None, "better": "up"}
    kpis = {"total": _kpi(len(cands), _count_in(applied, cur_w), _count_in(applied, prev_w), _weekly_counts(applied, today)),
            "active": {**stage("_"), "value": sum(1 for c in cands if _val(c.status) not in ("hired", "rejected"))},
            "interview": stage("interview"), "offer": stage("offer"), "hired": stage("hired"), "rejected": stage("rejected")}
    return {"kpis": kpis, "sources": sorted({(c.source or "").strip() for c in cands if (c.source or "").strip()})}


ACTIVE_HIRE = ("offer_sent", "offer_accepted", "in_progress")


def _live(db, model, org):
    q = db.query(model).filter(model.organization_id == org)
    return q.filter(model.is_deleted.is_(False)) if hasattr(model, "is_deleted") else q


def onboarding(db, org: int, today: date) -> dict:
    """The Onboarding screens: new hires by stage, joiners, pre-boarding, documents, checklists, payroll forms, orientation."""
    from app.modules.hr.models import (OnboardingActivity, OnboardingChecklist, OnboardingChecklistItem, OnboardingDocument,
                                       OnboardingFormSubmission, OnboardingNewHire, OnboardingOrientation,
                                       OnboardingOrientationAttendee, OnboardingPreboardingTask)
    hires = _live(db, OnboardingNewHire, org).all()
    tasks = _live(db, OnboardingPreboardingTask, org).all()
    docs = _live(db, OnboardingDocument, org).all()
    checklists = _live(db, OnboardingChecklist, org).all()
    items = _live(db, OnboardingChecklistItem, org).all()
    forms = _live(db, OnboardingFormSubmission, org).all()
    cur_w, prev_w = _windows(today)
    month = (today.replace(day=1), today + timedelta(days=1))
    prev_month_end = today.replace(day=1)
    prev_month = ((prev_month_end - timedelta(days=1)).replace(day=1), prev_month_end)
    next_month_start = (today.replace(day=28) + timedelta(days=4)).replace(day=1)
    whole_month = (today.replace(day=1), next_month_start)

    created = [_day(h.created_at) for h in hires]
    active = [h for h in hires if h.status in ACTIVE_HIRE]
    joining = [h.joining_date for h in hires if h.status != "cancelled" and h.joining_date]
    done = [_day(h.completed_at) for h in hires if h.status == "completed" and h.completed_at]
    open_tasks = [t for t in tasks if not t.completed]
    pending_docs = [d for d in docs if (d.status or "pending") in ("pending", "uploaded", "submitted")]
    forms_waiting = [f for f in forms if f.status == "submitted"]
    item_done = [_day(i.completed_at) for i in items if i.completed and i.completed_at]
    task_days = [_day(t.created_at) for t in open_tasks]
    doc_days = [_day(d.created_at) for d in pending_docs]

    def rate(rows):
        rows = list(rows)
        return round(sum(1 for i in rows if i.completed) * 100.0 / len(rows), 1) if rows else None

    kpis = {
        "active_new_hires": _kpi(len(active), _count_in(created, cur_w), _count_in(created, prev_w), _weekly_counts(created, today)),
        "joining_this_month": _kpi(_count_in(joining, whole_month), _count_in(joining, whole_month), _count_in(joining, prev_month),
                                   _weekly_counts(joining, today), window="month"),
        "preboarding_open": _kpi(len(open_tasks), _count_in(task_days, cur_w), _count_in(task_days, prev_w),
                                 _weekly_counts(task_days, today), better="down"),
        "documents_pending": _kpi(len(pending_docs), _count_in(doc_days, cur_w), _count_in(doc_days, prev_w),
                                  _weekly_counts(doc_days, today), better="down"),
        "checklist_completion": _kpi(rate(items), _count_in(item_done, cur_w), _count_in(item_done, prev_w),
                                     _weekly_counts(item_done, today)),
        "completed": _kpi(_count_in(done, month), _count_in(done, month), _count_in(done, prev_month), _weekly_counts(done, today),
                          window="month"),
        # a count "now": no honest previous value, so no trend is claimed
        "payroll_to_verify": {"value": len(forms_waiting), "current": None, "previous": None, "change_pct": None, "window": None,
                              "series": None, "better": "down"},
    }

    by_status = Counter(h.status for h in hires)
    stages = [{"key": k, "label": label, "count": by_status.get(k, 0)} for k, label in
              (("offer_sent", "Offer sent"), ("offer_accepted", "Offer accepted"), ("in_progress", "Onboarding"),
               ("completed", "Completed"), ("cancelled", "Cancelled"))]

    # per new hire: checklist progress (items of their checklists), open pre-boarding tasks, pending documents
    lists_of = defaultdict(list)
    for c in checklists:
        lists_of[c.onboarding_new_hire_id].append(c.id)
    items_of = defaultdict(list)
    for i in items:
        items_of[i.checklist_id].append(i)
    progress = {}
    for h in hires:
        mine = [i for cid in lists_of.get(h.id, []) for i in items_of.get(cid, [])]
        finished = sum(1 for i in mine if i.completed)
        progress[h.id] = {"items": len(mine), "done": finished, "pct": round(finished * 100.0 / len(mine)) if mine else None,
                          "overdue": sum(1 for i in mine if not i.completed and i.due_date and i.due_date < today),
                          "open_tasks": sum(1 for t in open_tasks if t.onboarding_new_hire_id == h.id),
                          "pending_documents": sum(1 for d in pending_docs if d.onboarding_new_hire_id == h.id)}

    managers = _names(db, [h.manager_id for h in hires])
    upcoming = sorted((h for h in hires if h.status in ACTIVE_HIRE and h.joining_date and h.joining_date >= today),
                      key=lambda h: h.joining_date)[:8]
    upcoming_joiners = [{"id": h.id, "name": h.candidate_name, "position": h.position, "joining_date": h.joining_date,
                         "status": h.status, "manager": managers.get(h.manager_id), **progress[h.id]} for h in upcoming]

    sessions = (_live(db, OnboardingOrientation, org).filter(OnboardingOrientation.date >= today)
                .order_by(OnboardingOrientation.date, OnboardingOrientation.time).limit(5).all())
    counts = Counter(a.session_id for a in _live(db, OnboardingOrientationAttendee, org).all())
    orientation = [{"id": o.id, "title": o.title, "date": o.date, "time": o.time, "presenter": o.presenter, "status": o.status,
                    "meeting_link": o.meeting_link, "location": o.location, "attendees": counts.get(o.id, 0)} for o in sessions]

    acts = (db.query(OnboardingActivity).filter(OnboardingActivity.organization_id == org)
            .order_by(OnboardingActivity.created_at.desc()).limit(8).all())
    names = {h.id: h.candidate_name for h in hires}
    recent_activity = [{"action": a.action, "description": a.description, "at": a.created_at,
                        "new_hire": names.get(a.onboarding_new_hire_id)} for a in acts]
    overdue = {"checklist_items": sum(1 for i in items if not i.completed and i.due_date and i.due_date < today),
               "preboarding_tasks": sum(1 for t in open_tasks if t.due_date and t.due_date < today)}
    return {"kpis": kpis, "stages": stages, "progress": progress, "upcoming_joiners": upcoming_joiners,
            "orientation": orientation, "recent_activity": recent_activity, "overdue": overdue}


@router.get("/insights")
def get_insights(section: str = Query("dashboard"), db: Session = Depends(get_db), user=Depends(get_recruitment_reader)):
    if section not in SECTIONS:
        raise HTTPException(422, f"section must be one of {', '.join(SECTIONS)}")
    fn = {"dashboard": dashboard, "requisitions": requisitions, "candidates": candidates, "interviews": interviews,
          "offers": offers, "onboarding": onboarding}[section]
    return {"section": section, "as_of": date.today(), **fn(db, user.organization_id, date.today())}
