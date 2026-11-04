"""Company policies end to end (Prompt 3 §A0): settings, the policy library, the employee policy hub, version changes and the
Mira (assistant knowledge base) sync. The engine owns variants, distributions and acknowledgements; this module only reacts.

* A policy variant is released (content lifecycle, author ≠ releaser) and then published through a policy distribution
  (HR-DOC-014). New joiners in the audience receive the current version automatically (distribution.include_new_joiners).
* Material change (a new released version): a DRAFT re-acknowledgement distribution is prepared with the same audience; publishing
  it closes the previous campaign. Minor change (`minor_change=true`): the published campaign moves to the new version with no new
  documents and no re-acknowledgement.
* Mira: when a version is published, its rendered text (policy text only, never employee data) becomes the published knowledge
  source for that policy (authority tier A, canonical id, version, effective date, audience); the previous version's source is
  retired at the same moment, as are the placeholder documents of scripts/seed_real_policy_docs.py that the policy replaces.
"""
from __future__ import annotations

import calendar
import hashlib
import logging
from datetime import date, datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.core.dependencies import get_current_user
from app.database import get_db
from app.modules.doc_templates import access, hooks, preflight, registry, renderer
from app.modules.doc_templates.models import (GeneratedDocument, PolicyDistribution, TemplateDefinition, TemplateVariant,
                                              DocumentExpiryItem)
from app.modules.hr import work_settings

logger = logging.getLogger("zoiko.doc_templates")

POLICY_IDS = ("HR-POL-001", "HR-POL-002", "HR-POL-004", "HR-POL-005", "HR-POL-019", "HR-POL-021", "HR-POL-025", "HR-POL-026",
              "HR-POL-027", "HR-POL-030", "HR-POL-031", "HR-POL-041", "HR-POL-042", "HR-POL-043")
POLICY_TITLES = {
    "HR-POL-001": "Employee Handbook", "HR-POL-002": "Code of Conduct", "HR-POL-004": "Attendance Policy",
    "HR-POL-005": "Probation Policy", "HR-POL-019": "Working Hours Policy", "HR-POL-021": "Remote Work Policy",
    "HR-POL-025": "Annual Leave Policy", "HR-POL-026": "Sick Leave Policy", "HR-POL-027": "Family and Parental Leave Policy",
    "HR-POL-030": "Employee Data Protection Policy", "HR-POL-031": "Acceptable Use Policy", "HR-POL-041": "Business Travel Policy",
    "HR-POL-042": "Expenses and Reimbursement Policy", "HR-POL-043": "Company Property Policy",
}
# Placeholder knowledge documents seeded from docs/ before policies were generated (scripts/seed_real_policy_docs.py), and the
# released policies that replace them. When one of these policies is published, the placeholder is retired so the policy hub and
# Mira can never disagree.
LEGACY_KB_TITLES = {
    "Employee Handbook & Code of Conduct": ("HR-POL-001", "HR-POL-002"),
    "Attendance & Leave Policy": ("HR-POL-004", "HR-POL-025", "HR-POL-026"),
    "Expense & Reimbursement Policy": ("HR-POL-042",),
    "Remote Work & WFH Policy": ("HR-POL-021",),
}
DONE = ("ACKNOWLEDGED", "EXECUTED", "RETAINED")
RECEIVED = ("ISSUED", "ACKNOWLEDGED", "EXECUTED", "RETAINED", "SUPERSEDED")


def is_policy(canonical_id: str) -> bool:
    return canonical_id in POLICY_IDS


def _add_months(d: date, months: int) -> date:
    y, m = divmod(d.month - 1 + months, 12)
    year, month = d.year + y, m + 1
    return date(year, month, min(d.day, calendar.monthrange(year, month)[1]))


# ── policy fields (hooks.context) ────────────────────────────────────────────────────────────────────────────────────

def _setting(db, org_id, canonical_id, short):
    if short in work_settings.PER_POLICY_FIELDS:
        v = work_settings.get(db, org_id, f"policies.{canonical_id}.{short}")
        if v not in (None, ""):
            return v
    return work_settings.get(db, org_id, f"policies.{short}")


def _leave_year_label(db, org_id) -> Optional[str]:
    from app.modules.hr.models import LeaveSetting
    s = db.query(LeaveSetting).filter(LeaveSetting.organization_id == org_id).first()
    start = getattr(s, "leave_year_start", None)
    if start:
        end = _add_months(date(2001, start.month, start.day), 12)
        end = date.fromordinal(end.toordinal() - 1)
        return f"{start.day} {calendar.month_name[start.month]} to {end.day} {calendar.month_name[end.month]}"
    return work_settings.get(db, org_id, "policies.leave_year_label")


def _annual_notice_days(db, org_id):
    v = work_settings.get(db, org_id, "policies.annual_leave_notice_days")
    if v is not None:
        return v
    from app.modules.hr.models import LeaveTypeConfig
    cfg = db.query(LeaveTypeConfig).filter(LeaveTypeConfig.organization_id == org_id, LeaveTypeConfig.code.in_(["annual", "ANNUAL"]),
                                           LeaveTypeConfig.is_active.is_(True)).first()
    return getattr(cfg, "min_notice_days", None)


def _travel(db, org_id):
    from app.modules.hr.models import TravelPolicy, TravelSetting
    s = db.query(TravelSetting).filter(TravelSetting.organization_id == org_id).first()
    pols = db.query(TravelPolicy).filter(TravelPolicy.organization_id == org_id, TravelPolicy.is_active.is_(True)).order_by(TravelPolicy.id).all()
    return s, pols


def _expense_limits(db, org, s, pols) -> Optional[str]:
    v = work_settings.get(db, org.id, "policies.expense_limits_summary")
    if v:
        return v
    cur = getattr(org, "currency", None) or ""
    parts = []
    if s is not None and s.expense_limit_per_day is not None:
        parts.append(f"up to {s.expense_limit_per_day:,.2f} {cur} per day".strip())
    for p in pols:
        if p.max_per_diem is not None:
            parts.append(f"{p.policy_name}: per diem up to {p.max_per_diem:,.2f} {cur}".strip())
    return ("; ".join(parts) + ".") if parts else None


def _travel_class_rules(db, org_id, pols) -> Optional[str]:
    v = work_settings.get(db, org_id, "policies.travel_class_rules")
    if v:
        return v
    described = [f"{p.policy_name}: {p.description.strip()}" for p in pols if (p.description or "").strip()]
    return " ".join(described) or None


def _policy_context(ctx) -> None:
    db, org = ctx.db, ctx.organization
    if db is None or org is None or ctx.variant is None:
        return
    cid, v, e = ctx.canonical_id, ctx.variant, ctx.extra
    effective = v.effective_from or date.today()
    months = work_settings.get(db, org.id, "policies.review_months") or 12
    e.update({
        "policy.title": POLICY_TITLES.get(cid) or getattr(db.get(TemplateDefinition, cid), "title", None),
        "policy.version": str(v.version),
        "policy.effective_from": effective,
        "policy.review_due": _add_months(effective, int(months)),
        "policy.change_summary": v.change_summary if v.previous_version_id else None,
        "policy.owner_name": _setting(db, org.id, cid, "owner_name"),
        "policy.contact": _setting(db, org.id, cid, "contact"),
        "policy.scope_statement": _setting(db, org.id, cid, "scope_statement"),
    })
    for short in ("privacy_contact", "absence_notification_rule", "default_probation_months", "remote_cost_support", "core_hours",
                  "self_certification_days", "travel_assistance_contact", "eap_contact", "claim_dispute_days"):
        e[f"policy.{short}"] = work_settings.get(db, org.id, f"policies.{short}")
    hours = work_settings.get(db, org.id, "attendance.standard_workday_hours")
    e["policy.standard_workday_hours"] = f"{hours.normalize():f}" if hours is not None else None
    e["policy.leave_year_label"] = _leave_year_label(db, org.id)
    e["policy.annual_leave_notice_days"] = _annual_notice_days(db, org.id)
    s, pols = _travel(db, org.id)
    e["policy.travel_class_rules"] = _travel_class_rules(db, org.id, pols)
    e["policy.expense_limits_summary"] = _expense_limits(db, org, s, pols)
    claim_days = work_settings.get(db, org.id, "policies.claim_deadline_days")
    e["policy.claim_deadline_days"] = claim_days if claim_days is not None else getattr(s, "reimbursement_deadline", None)


hooks.context(POLICY_IDS, _policy_context)


def _org_settings_context(ctx) -> None:
    """Non-policy templates that quote a policy setting (bereavement support contact, expense dispute window)."""
    if ctx.db is None or ctx.organization is None:
        return
    for short in ("eap_contact", "claim_dispute_days"):
        ctx.extra.setdefault(f"policy.{short}", work_settings.get(ctx.db, ctx.organization.id, f"policies.{short}"))


hooks.context(["HR-LEV-013", "HR-CMP-024"], _org_settings_context)


# ── audience ─────────────────────────────────────────────────────────────────────────────────────────────────────────

def audience_includes(employee, audience: Optional[dict]) -> bool:
    """Does this employee belong to a distribution audience? (the same rules as distribution.audience_employees)"""
    if not audience or audience.get("type", "all") == "all":
        return True
    t, ids = audience.get("type"), [str(i) for i in (audience.get("ids") or [])]
    if t == "departments":
        return str(getattr(employee, "department_id", None)) in ids
    if t == "designations":
        return str(getattr(employee, "designation_id", None)) in ids
    if t == "employment_types":
        et = getattr(employee, "employment_type", None)
        return str(getattr(et, "value", et)) in ids
    if t == "locations":
        return (getattr(employee, "work_country", None) or "").upper() in [i.upper() for i in ids] or \
            (getattr(employee, "work_city", None) or "") in ids
    if t == "employees":
        return str(employee.id) in ids
    return False


# ── Mira (assistant knowledge base) sync ─────────────────────────────────────────────────────────────────────────────

def _run_text(runs) -> str:
    return "".join(getattr(r, "text", "") for r in runs or [])


def policy_text(db, organization, variant: TemplateVariant, entity=None) -> str:
    """The policy as plain text, rendered from the released variant with organization-level values only (no person)."""
    from app.modules.doc_templates import fields, service
    entity = entity or preflight.default_entity(db, organization.id)
    ctx = fields.FieldContext(db=db, organization=organization, subject_type="org", entity=entity, language=variant.language)
    ctx.canonical_id, ctx.variant = variant.canonical_id, variant
    ctx.document = {"date": date.today(), "title": POLICY_TITLES.get(variant.canonical_id, "")}
    hooks.provide(ctx, variant.canonical_id)
    rules = variant.clause_rules or {}
    clauses = {}
    for key in (rules.get("mandatory") or []) + (rules.get("optional") or []):
        c = preflight.find_clause(db, organization.id, key, variant.pack_id, variant.language, date.today())
        if c is not None:
            clauses[key] = c
    inp = service.build_input(ctx, blocks=variant.content, clauses=clauses, required_clause_keys=list(rules.get("mandatory") or []),
                              number="", title=ctx.document["title"], sensitivity="C2", letterhead_info={}, author="")
    lines = []
    for el in renderer.layout(inp):
        if el.kind in ("heading", "paragraph", "declaration"):
            text = _run_text(el.runs).strip()
            if text:
                lines.append(text)
        elif el.kind == "list":
            lines.append("\n".join(f"- {_run_text(r).strip()}" for r in el.runs if _run_text(r).strip()))
        elif el.kind == "kv":
            lines.append("\n".join(f"{lbl}: {val}" for lbl, val in el.data.get("rows") or [] if val))
        elif el.kind == "table":
            lines.append("\n".join(" | ".join(str(c) for c in row) for row in [el.data["columns"]] + list(el.data["rows"])))
    return "\n\n".join(x for x in lines if x)


def _retire_sources(db, organization_id: int, canonical_id: str, keep_id: Optional[int] = None) -> int:
    from app.modules.assistant.models import KnowledgeSource, KnowledgeStatus
    n = 0
    rows = db.query(KnowledgeSource).filter(KnowledgeSource.organization_id == organization_id,
                                            KnowledgeSource.policy_canonical_id == canonical_id,
                                            KnowledgeSource.status != KnowledgeStatus.RETIRED).all()
    legacy = [t for t, ids in LEGACY_KB_TITLES.items() if canonical_id in ids]
    if legacy:
        rows += db.query(KnowledgeSource).filter(KnowledgeSource.organization_id == organization_id,
                                                 KnowledgeSource.policy_canonical_id.is_(None), KnowledgeSource.title.in_(legacy),
                                                 KnowledgeSource.status != KnowledgeStatus.RETIRED).all()
    today = date.today()
    for src in rows:
        if src.id == keep_id:
            continue
        src.status = KnowledgeStatus.RETIRED
        for ver in src.versions:
            if ver.effective_to is None or ver.effective_to >= today:
                ver.effective_to = date.fromordinal(today.toordinal() - 1)
        n += 1
    return n


def sync_knowledge(db, actor, d: PolicyDistribution) -> str:
    """Publish this distribution's policy version to Mira and retire every older source for it. Returns SYNCED or FAILED.

    Failure to embed the new text still retires the old sources: Mira then says it has no approved answer rather than quoting
    a superseded version. HR can retry from the policy library."""
    from app.modules.assistant import knowledge_service
    from app.modules.assistant.models import KnowledgeSource, KnowledgeSourceVersion, KnowledgeStatus
    v = db.get(TemplateVariant, d.variant_id) if d.variant_id else None
    if v is None:
        return "FAILED"
    org = actor.organization
    title = f"{POLICY_TITLES.get(d.canonical_id, d.title)} (version {v.version})"
    text = policy_text(db, org, v)
    src = KnowledgeSource(organization_id=d.organization_id, title=title[:255],
                          source_type="handbook" if d.canonical_id == "HR-POL-001" else "policy", authority_tier="A",
                          status=KnowledgeStatus.REVIEW, owner_employee_id=actor.id, policy_canonical_id=d.canonical_id,
                          policy_version=v.version, policy_audience=d.audience, policy_distribution_id=d.id)
    db.add(src)
    db.flush()
    ver = KnowledgeSourceVersion(knowledge_source_id=src.id, version_no=1, content_text=text,
                                 content_hash=hashlib.sha256(text.encode("utf-8")).hexdigest(), effective_from=v.effective_from,
                                 published_at=datetime.utcnow(), published_by=actor.id)
    db.add(ver)
    db.flush()
    _retire_sources(db, d.organization_id, d.canonical_id, keep_id=src.id)
    status = "SYNCED"
    try:
        knowledge_service._ingest_version(db, ver)      # embeds before writing any fragment; a failure leaves the run "failed"
        src.status = KnowledgeStatus.PUBLISHED
    except Exception:
        logger.warning("policy %s distribution %s: knowledge-base ingestion failed", d.canonical_id, d.id)
        status = "FAILED"
    d.kb_source_id, d.kb_sync_status, d.kb_synced_at = src.id, status, datetime.utcnow()
    db.commit()
    return status


def _track_review(db, actor, d: PolicyDistribution) -> None:
    """HR-DOC-016: the policy's review date becomes an expiry item owned by the publisher."""
    v = db.get(TemplateVariant, d.variant_id) if d.variant_id else None
    if v is None:
        return
    months = work_settings.get(db, d.organization_id, "policies.review_months") or 12
    due = _add_months(v.effective_from or date.today(), int(months))
    exists = db.query(DocumentExpiryItem.id).filter(DocumentExpiryItem.organization_id == d.organization_id,
                                                    DocumentExpiryItem.item_type == "template_variant", DocumentExpiryItem.ref_id == v.id,
                                                    DocumentExpiryItem.expiry_date == due).first()
    if exists is None:
        db.add(DocumentExpiryItem(organization_id=d.organization_id, item_type="template_variant", ref_id=v.id,
                                  title=f"{POLICY_TITLES.get(d.canonical_id, d.title)} v{v.version} review", owner_employee_id=actor.id,
                                  expiry_date=due, action_required="Review the policy and release a new version or confirm it",
                                  status="OPEN"))
        db.commit()


def _on_policy_published(db, actor, d: PolicyDistribution) -> None:
    if not is_policy(d.canonical_id):
        return
    if d.previous_distribution_id:
        prev = db.get(PolicyDistribution, d.previous_distribution_id)
        if prev is not None and prev.status == "PUBLISHED" and prev.organization_id == d.organization_id:
            prev.status, prev.closed_at = "CLOSED", datetime.utcnow()
            db.commit()
    sync_knowledge(db, actor, d)
    _track_review(db, actor, d)


hooks.subscribe("policy_published", _on_policy_published)


def _published(db, organization_id: Optional[int], canonical_id: str) -> list[PolicyDistribution]:
    q = db.query(PolicyDistribution).filter(PolicyDistribution.canonical_id == canonical_id, PolicyDistribution.status == "PUBLISHED")
    if organization_id is not None:
        q = q.filter(PolicyDistribution.organization_id == organization_id)
    return q.order_by(PolicyDistribution.id).all()


def _on_variant_released(db, actor, v: TemplateVariant, previous: Optional[TemplateVariant]) -> None:
    """A new version of a published policy: move the campaign (minor change) or prepare a re-acknowledgement (material change)."""
    if not is_policy(v.canonical_id) or previous is None:
        return
    for d in _published(db, v.owner_organization_id, v.canonical_id):
        if d.variant_id != previous.id:
            continue
        from app.modules.employee.models import Employee
        publisher = db.get(Employee, d.published_by) if d.published_by else None
        if v.minor_change:
            new = PolicyDistribution(organization_id=d.organization_id, canonical_id=d.canonical_id, title=d.title, audience=d.audience,
                                     requires=d.requires, due_date=None, reminder_days=d.reminder_days,
                                     auto_include_new_joiners=d.auto_include_new_joiners, status="PUBLISHED", variant_id=v.id,
                                     version=v.version, variant_checksum=v.checksum, published_by=actor.id if actor else d.published_by,
                                     published_at=datetime.utcnow(), previous_distribution_id=d.id, created_by=actor.id if actor else None,
                                     last_results=[])
            db.add(new)
            d.status, d.closed_at = "CLOSED", datetime.utcnow()
            db.commit()
            # the new text replaces the old one for Mira straight away; nobody is asked to acknowledge a typo fix
            if publisher is not None and publisher.organization_id == d.organization_id:
                sync_knowledge(db, publisher, new)
        else:
            exists = db.query(PolicyDistribution.id).filter(PolicyDistribution.previous_distribution_id == d.id,
                                                            PolicyDistribution.status == "DRAFT").first()
            if exists is None:
                db.add(PolicyDistribution(organization_id=d.organization_id, canonical_id=d.canonical_id, title=d.title,
                                          audience=d.audience, requires=d.requires, reminder_days=d.reminder_days,
                                          auto_include_new_joiners=d.auto_include_new_joiners, status="DRAFT",
                                          previous_distribution_id=d.id, created_by=actor.id if actor else None))
                db.commit()


hooks.subscribe("variant_released", _on_variant_released)


# ── library (HR) and hub (employees) ─────────────────────────────────────────────────────────────────────────────────

def _active_variants(db, organization_id: int, canonical_id: str) -> list[TemplateVariant]:
    from sqlalchemy import or_
    return (db.query(TemplateVariant).filter(TemplateVariant.canonical_id == canonical_id, TemplateVariant.status == "ACTIVE",
                                             or_(TemplateVariant.owner_organization_id == organization_id,
                                                 TemplateVariant.owner_organization_id.is_(None)))
            .order_by(TemplateVariant.id).all())


def library(db, actor) -> list[dict]:
    access.require_hr(actor)
    from app.modules.doc_templates import governance
    out = []
    for cid in POLICY_IDS:
        d = db.get(TemplateDefinition, cid)
        variants = _active_variants(db, actor.organization_id, cid)
        dists = (db.query(PolicyDistribution).filter(PolicyDistribution.organization_id == actor.organization_id,
                                                     PolicyDistribution.canonical_id == cid)
                 .order_by(PolicyDistribution.id.desc()).all())
        current = next((x for x in dists if x.status == "PUBLISHED"), None)
        months = work_settings.get(db, actor.organization_id, "policies.review_months") or 12
        out.append({
            "canonical_id": cid, "title": POLICY_TITLES[cid], "implemented": bool(d and d.implemented),
            "active_versions": [{"variant_id": v.id, "version": v.version, "release_mode": v.release_mode, "pack_id": v.pack_id,
                                 "effective_from": v.effective_from, "minor_change": bool(v.minor_change), "change_summary": v.change_summary,
                                 "review_due": _add_months(v.effective_from, int(months)) if v.effective_from else None}
                                for v in variants],
            "current_distribution": ({"id": current.id, "version": current.version, "published_at": current.published_at,
                                      "audience": current.audience, "requires": current.requires, "kb_sync_status": current.kb_sync_status,
                                      "stats": governance.distribution_stats(db, current)} if current else None),
            "draft_distributions": [{"id": x.id, "previous_distribution_id": x.previous_distribution_id, "created_at": x.created_at}
                                    for x in dists if x.status == "DRAFT"],
            "owner_name": _setting(db, actor.organization_id, cid, "owner_name"),
        })
    return out


def audience_preview(db, actor, canonical_id: str, audience: dict) -> dict:
    """Recipients count and how many would be blocked, before anything is created (the publish wizard's last step)."""
    access.require_hr(actor)
    from app.modules.doc_templates import distribution
    if not is_policy(canonical_id):
        raise HTTPException(422, "Choose a policy.")
    people = distribution.audience_employees(db, actor.organization_id, distribution._clean_audience(audience))
    sample = people[:200]
    blocked, reasons = 0, {}
    for emp in sample:
        r = preflight.run_preflight(db, organization_id=actor.organization_id, actor=actor, canonical_id=canonical_id,
                                    subject_type="employee", subject_id=emp.id, organization=actor.organization)
        if not r.allowed:
            blocked += 1
            for code in r.reasons:
                reasons[code] = reasons.get(code, 0) + 1
    return {"recipients": len(people), "checked": len(sample), "blocked": blocked, "ready": len(sample) - blocked,
            "reasons": [{"code": k, "count": n} for k, n in sorted(reasons.items(), key=lambda kv: -kv[1])]}


def my_policies(db, user) -> list[dict]:
    """The employee policy hub: every current policy that applies to them, with what they received before."""
    from app.modules.employee.models import Employee
    me = db.get(Employee, user.id)
    out = []
    for cid in POLICY_IDS:
        dists = _published(db, user.organization_id, cid)
        mine = (db.query(GeneratedDocument).filter(GeneratedDocument.organization_id == user.organization_id,
                                                   GeneratedDocument.canonical_id == cid, GeneratedDocument.subject_type == "employee",
                                                   GeneratedDocument.subject_id == user.id, GeneratedDocument.status.in_(RECEIVED))
                .order_by(GeneratedDocument.id.desc()).all())
        current = next((d for d in reversed(dists) if audience_includes(me, d.audience) or any(x.distribution_id == d.id for x in mine)), None)
        if current is None:
            continue
        v = db.get(TemplateVariant, current.variant_id) if current.variant_id else None
        current_doc = next((x for x in mine if x.distribution_id == current.id), None) or (mine[0] if mine else None)
        acked = [x for x in mine if x.status in DONE]
        last_acked = max((x.variant_version or 0) for x in acked) if acked else None
        version = current.version or (v.version if v else None)
        out.append({
            "canonical_id": cid, "title": POLICY_TITLES[cid], "version": version,
            "effective_from": getattr(v, "effective_from", None), "change_summary": getattr(v, "change_summary", None),
            "minor_change": bool(getattr(v, "minor_change", False)),
            "document_id": current_doc.id if current_doc else None, "document_status": current_doc.status if current_doc else None,
            "action_required": bool(current_doc and current_doc.status == "ISSUED" and current_doc.execution_mode != "NONE"),
            "due_by": current_doc.due_by if current_doc else None,
            "what_changed": bool(last_acked and version and version > last_acked and getattr(v, "change_summary", None)),
            "acknowledged_version": last_acked,
            "history": [{"document_id": x.id, "document_number": x.document_number, "version": x.variant_version, "status": x.status,
                         "issued_at": x.issued_at} for x in mine],
        })
    return out


# ── HTTP ─────────────────────────────────────────────────────────────────────────────────────────────────────────────

router = APIRouter(prefix="/hr/policies", tags=["Company policies"])
me_router = APIRouter(prefix="/hr/me/policies", tags=["Company policies (self-service)"])


class AudienceBody(BaseModel):
    canonical_id: str = Field(..., max_length=20)
    audience: dict = Field(default_factory=lambda: {"type": "all"})


@router.get("")
def list_policies(db: Session = Depends(get_db), user=Depends(get_current_user)):
    return {"items": library(db, user)}


@router.get("/settings")
def get_settings(db: Session = Depends(get_db), user=Depends(get_current_user)):
    access.require_hr(user)
    per_policy = {cid: {f: work_settings.get(db, user.organization_id, f"policies.{cid}.{f}") for f in work_settings.PER_POLICY_FIELDS}
                  for cid in POLICY_IDS}
    return {"settings": work_settings.group(db, user.organization_id, "policies"), "per_policy": per_policy}


@router.put("/settings")
def put_settings(body: dict, db: Session = Depends(get_db), user=Depends(get_current_user)):
    access.require_hr(user)
    per_policy = body.pop("per_policy", None) or {}
    work_settings.save(db, user, body, "policies")
    for cid, values in per_policy.items():
        if cid not in POLICY_IDS or not isinstance(values, dict):
            raise HTTPException(422, f"Unknown policy {cid}.")
        work_settings.save(db, user, {f"{cid}.{k}": v for k, v in values.items() if k in work_settings.PER_POLICY_FIELDS}, "policies")
    return get_settings(db, user)


@router.post("/audience-preview")
def preview_audience(body: AudienceBody, db: Session = Depends(get_db), user=Depends(get_current_user)):
    return audience_preview(db, user, body.canonical_id, body.audience)


@router.post("/distributions/{distribution_id}/knowledge-sync")
def retry_sync(distribution_id: int, db: Session = Depends(get_db), user=Depends(get_current_user)):
    from app.modules.doc_templates import distribution
    d = distribution.get(db, user, distribution_id)
    if d.status != "PUBLISHED" or not is_policy(d.canonical_id):
        raise HTTPException(409, "Only a published policy can be synced to the assistant.")
    return {"kb_sync_status": sync_knowledge(db, user, d)}


@me_router.get("")
def hub(db: Session = Depends(get_db), user=Depends(get_current_user)):
    return {"items": my_policies(db, user)}
