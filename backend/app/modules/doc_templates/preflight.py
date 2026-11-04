"""Preflight: the normative order of ZHR-ELT-TPL-001 §5.1. Fail closed at every step.

    1 actor        authenticated, in the tenant, holds a role allowed for the family, passes authorize() for the subject
    2 definition   exists, implemented, not an engine-only record, plan entitlement
    3 jurisdiction work country/region from facts (never nationality); entity country vs work country
    4 pack         tenant ACTIVE pack → platform ACTIVE pack → DENY NO_ACTIVE_PACK
    5 variant      exactly one ACTIVE, effective, applicable variant for template + pack + language
    6 clauses      every mandatory clause resolvable and ACTIVE; nothing prohibited
    7 fields       every required field resolves; language approved for the variant
    8 recipient    recipient, channel, signatory and approvers exist
    9 evidence     decision receipt + field snapshot persisted (generate only; the dry run persists nothing)

The result lists every reason, so the UI can tell HR exactly what to fix.
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field
from datetime import date, datetime
from typing import Any, Optional

from sqlalchemy import or_

from app.core import regions
from app.modules.doc_templates import access, approvals, fields, registry, resolver
from app.modules.doc_templates.blocks import references
from app.modules.doc_templates.models import (DecisionReceipt, DocTemplateSettings, EmployerEntity, JurisdictionPack,
                                              TemplateClause, TemplateDefinition, TemplateVariant)

ALLOW, DENY, NEEDS_LEGAL_REVIEW = "ALLOW", "DENY", "NEEDS_LEGAL_REVIEW"
FEATURE_KEY = "hr.documents.templates"
_SOURCE_REF = re.compile(r"^[a-z_]{2,40}:\d{1,12}$")


@dataclass
class PreflightResult:
    outcome: str = ALLOW
    reasons: list = field(default_factory=list)
    missing_fields: list = field(default_factory=list)
    steps: list = field(default_factory=list)
    definition: Any = None
    subject: Any = None
    entity: Any = None
    signatory: Any = None
    pack: Any = None
    variant: Any = None
    clauses: dict = field(default_factory=dict)          # key -> TemplateClause
    ctx: Any = None
    policy: str = "L1"
    chain: list = field(default_factory=list)
    recipient: dict = field(default_factory=dict)
    work_country: Optional[str] = None
    work_region: Optional[str] = None
    inputs: dict = field(default_factory=dict)

    @property
    def allowed(self) -> bool:
        return self.outcome == ALLOW

    def step(self, name: str, ok: bool, detail: Optional[str] = None):
        self.steps.append({"step": name, "outcome": "PASS" if ok else "FAIL", **({"detail": detail} if detail else {})})

    def fail(self, name: str, reason: str, outcome: str = DENY, detail: Optional[str] = None):
        self.reasons.append(reason)
        if self.outcome != DENY:                          # DENY wins over NEEDS_LEGAL_REVIEW
            self.outcome = outcome
        self.step(name, False, detail or reason)

    def as_dict(self) -> dict:
        return {
            "outcome": self.outcome, "reasons": self.reasons, "missing_fields": self.missing_fields, "steps": self.steps,
            "canonical_id": getattr(self.definition, "canonical_id", None),
            "pack": ({"id": self.pack.id, "scope_type": self.pack.scope_type, "country": self.pack.country, "region": self.pack.region}
                     if self.pack else None),
            "variant": ({"id": self.variant.id, "version": self.variant.version, "release_mode": self.variant.release_mode,
                         "language": self.variant.language} if self.variant else None),
            "work_country": self.work_country, "work_region": self.work_region,
            "approval_policy": self.policy, "approval_chain": self.chain,
            "recipient": {k: v for k, v in self.recipient.items() if k in ("channel", "type", "has_email", "has_portal_account")},
            "signatory": ({"employee_id": self.signatory.employee_id, "title": self.signatory.signatory_title} if self.signatory else None),
        }


# ── loaders ──────────────────────────────────────────────────────────────────────────────────────────────────────────

def load_subject(db, organization_id: int, subject_type: str, subject_id: Optional[int]):
    if subject_type in ("org", "position") or subject_id is None:
        return None
    from app.modules.employee.models import Employee
    from app.modules.hr.models import OnboardingNewHire, RecruitmentCandidate
    model = {"employee": Employee, "candidate": RecruitmentCandidate, "new_hire": OnboardingNewHire}.get(subject_type)
    if model is None:
        return None
    row = db.get(model, subject_id)
    return row if row is not None and row.organization_id == organization_id else None


def source_object(db, organization_id: int, source_ref: Optional[str]):
    """`recruitment_offer:123`-style references to the record that caused the document (Prompts 2–4 bind more)."""
    if not source_ref or not _SOURCE_REF.match(source_ref):
        return None
    kind, _, rid = source_ref.partition(":")
    from app.modules.hr import models as hr_models
    model = {
        "recruitment_offer": hr_models.RecruitmentOffer,
        "recruitment_requisition": hr_models.RecruitmentRequisition,
        "recruitment_interview_feedback": hr_models.RecruitmentInterviewFeedback,
        "recruitment_candidate": hr_models.RecruitmentCandidate,
        "wf_headcount": hr_models.WfHeadcount,
        "wf_succession": hr_models.WfSuccession,
        "designation": hr_models.Designation,
        "job_description": hr_models.JobDescription,
        "onboarding_new_hire": hr_models.OnboardingNewHire,
        "onboarding_form_submission": hr_models.OnboardingFormSubmission,
        "employee_lifecycle": hr_models.EmployeeLifecycle,
        "asset": hr_models.Asset,
        "leave_request": hr_models.LeaveRequest,
        "overtime_request": hr_models.OvertimeRequest,
        "attendance_correction": hr_models.AttendanceCorrectionRequest,
        "shift_notice": hr_models.ShiftNotice,
        "salary_revision": hr_models.SalaryRevision,
        "employee_compensation": hr_models.EmployeeCompensation,
        "allowance": hr_models.Allowance,
        "travel_expense": hr_models.TravelExpense,
        "compensation_statement": hr_models.CompensationStatementRequest,
        "probation_review": hr_models.ProbationReview,
        "appraisal": hr_models.Appraisal,
        "pip": hr_models.PerformanceImprovementPlan,
        "learning_enrollment": hr_models.LearningEnrollment,
        "learning_certification": hr_models.LearningCertification,
    }.get(kind)
    if model is None:
        return None
    row = db.get(model, int(rid))
    return row if row is not None and getattr(row, "organization_id", None) == organization_id else None


def templates_enabled(db, organization_id: int) -> bool:
    """Release gate R6: HR_TEMPLATES_ENABLED (global) and the per-tenant switch. Off = no new documents; reading stays."""
    from app.config import settings as app_settings
    if not getattr(app_settings, "TEMPLATES_ENABLED", True):
        return False
    row = db.query(DocTemplateSettings).filter(DocTemplateSettings.organization_id == organization_id).first()
    return not (row is not None and (row.automation_rules or {}).get("_generation") == "off")


def default_entity(db, organization_id: int) -> Optional[EmployerEntity]:
    return (db.query(EmployerEntity).filter(EmployerEntity.organization_id == organization_id, EmployerEntity.status == "active")
            .order_by(EmployerEntity.is_default.desc(), EmployerEntity.id).first())


def resolve_entity(db, organization_id: int, subject, entity_id: Optional[int]) -> Optional[EmployerEntity]:
    wanted = entity_id or getattr(subject, "employing_entity_id", None)
    if wanted:
        e = db.get(EmployerEntity, wanted)
        return e if e is not None and e.organization_id == organization_id and e.status == "active" else None
    return default_entity(db, organization_id)


def org_settings(db, organization_id: int) -> DocTemplateSettings:
    row = db.query(DocTemplateSettings).filter(DocTemplateSettings.organization_id == organization_id).first()
    return row or DocTemplateSettings(organization_id=organization_id, tenant_attestation_enabled=True,
                                      prefer_tenant_variants=True, expiry_warning_days=30)


def entitled(db, organization_id: int, key: str = FEATURE_KEY) -> bool:
    """Same rule as the entitlement middleware: an organization with no billing subscription has no plan to measure."""
    from app.modules.billing import entitlement_middleware as em
    from app.modules.billing.models import BillingSubscription
    if db.query(BillingSubscription.id).filter(BillingSubscription.organization_id == organization_id).first() is None:
        return True
    try:
        return em.check_entitlement(db, organization_id, key).get("state") == em.ENTITLED_AVAILABLE
    except Exception:
        return False


def tenant_attestation_allowed(db, organization_id: int, risk: str) -> bool:
    from app.config import settings
    if not settings.TEMPLATES_TENANT_ATTESTATION_ENABLED:
        return False
    if risk == "L3" and not settings.TEMPLATES_TENANT_ATTESTATION_L3_ENABLED:
        return False
    if not org_settings(db, organization_id).tenant_attestation_enabled:
        return False
    return entitled(db, organization_id, "hr.documents.tenant_attestation")


def _effective(row, on: date) -> bool:
    return (row.effective_from is None or row.effective_from <= on) and (row.effective_to is None or row.effective_to >= on)


def candidate_packs(db, organization_id: int, country: str, region: Optional[str], on: date) -> list[JurisdictionPack]:
    """ACTIVE, effective packs for the work location, most specific first: tenant region, tenant country, platform region,
    platform country. A region pack never covers another region; a country pack (no region) covers the whole country."""
    rows = (db.query(JurisdictionPack)
            .filter(JurisdictionPack.status == "ACTIVE", JurisdictionPack.country == country,
                    or_(JurisdictionPack.owner_organization_id == organization_id,
                        JurisdictionPack.owner_organization_id.is_(None)))
            .all())
    rows = [p for p in rows if _effective(p, on) and (p.region is None or (region and p.region == region))
            and ((p.scope_type == "TENANT" and p.owner_organization_id == organization_id)
                 or (p.scope_type == "PLATFORM" and p.owner_organization_id is None))]
    return sorted(rows, key=lambda p: (p.scope_type != "TENANT", p.region is None, p.id))


def _applies(variant: TemplateVariant, facts: dict) -> bool:
    a = variant.applicability or {}
    for key, fact in (("employment_types", "employment_type"), ("worker_categories", "worker_category"),
                      ("regions", "work_region"), ("entity_ids", "entity_id")):
        allowed = a.get(key)
        if allowed and facts.get(fact) not in allowed:
            return False
    return True


def find_clause(db, organization_id: int, key: str, pack_id: int, language: str, on: date) -> Optional[TemplateClause]:
    rows = (db.query(TemplateClause)
            .filter(TemplateClause.clause_key == key, TemplateClause.pack_id == pack_id, TemplateClause.language == language,
                    TemplateClause.status == "ACTIVE",
                    or_(TemplateClause.owner_organization_id == organization_id, TemplateClause.owner_organization_id.is_(None)))
            .order_by(TemplateClause.version.desc()).all())
    rows = [c for c in rows if _effective(c, on)]
    tenant = [c for c in rows if c.owner_organization_id == organization_id]
    return (tenant or [c for c in rows if c.owner_organization_id is None] or [None])[0]


# ── preflight ────────────────────────────────────────────────────────────────────────────────────────────────────────

def run_preflight(db, *, organization_id: int, actor, canonical_id: str, subject_type: str, subject_id: Optional[int],
                  source_ref: Optional[str] = None, language: str = "en", effective_date: Optional[date] = None,
                  entity_id: Optional[int] = None, signatory_id: Optional[int] = None, extra: Optional[dict] = None,
                  organization=None, system_trigger: Optional[str] = None, min_policy: Optional[str] = None,
                  waive_approval: Optional[str] = None) -> PreflightResult:
    """system_trigger: the module event that produced this request (e.g. "recruitment_requisition.decided"). The module already
    authorised the human action behind it, so the request-role matrix and subject check are not repeated; everything else is.
    min_policy: a module may require a stricter approval policy for this one document (e.g. a shift change on short notice
    needs L2); it can never make the policy looser.
    waive_approval: the reason an organization switched off the separate approval for this L2 document (e.g. its "offer letters
    without approval" setting). The document is then handled as L1 (whoever issues it approves it) and the waiver is kept on the
    decision receipt. L3 documents can never be waived."""
    r = PreflightResult()
    on = effective_date or date.today()
    language = (language or "en").strip() or "en"
    r.inputs = {"tenant": organization_id, "subject_type": subject_type, "subject_id": subject_id, "source_ref": source_ref,
                "language": language, "effective_date": on.isoformat(), "canonical_id": canonical_id,
                **({"trigger": system_trigger} if system_trigger else {})}

    # 1 — actor
    definition = db.get(TemplateDefinition, canonical_id) if canonical_id else None
    r.definition = definition
    if actor is None or getattr(actor, "organization_id", None) != organization_id:
        r.fail("actor", "ACTOR_NOT_IN_TENANT")
        return r
    role = access.role_of(actor)
    family = definition.family_id if definition else None
    if subject_type not in registry.SUBJECT_TYPES:
        r.fail("actor", "UNKNOWN_SUBJECT_TYPE")
        return r
    if definition is not None and not system_trigger and role not in registry.request_roles(family):
        r.fail("actor", "ROLE_NOT_ALLOWED", detail=f"{role} cannot request {family} documents")
        return r
    subject = load_subject(db, organization_id, subject_type, subject_id)
    if subject_type in ("employee", "candidate", "new_hire") and subject is None:
        r.fail("actor", "SUBJECT_NOT_FOUND")
        return r
    r.subject = subject
    if not system_trigger:
        decision = access.authorize_subject(db, actor, subject_type, subject_id,
                                            sensitivity=definition.sensitivity if definition else "C2")
        if not decision.allow:
            r.fail("actor", "SUBJECT_NOT_AUTHORISED", detail=decision.reason_code)
            return r
    r.step("actor", True, f"system trigger {system_trigger}" if system_trigger else None)

    # 2 — definition
    if definition is None:
        r.fail("definition", "UNKNOWN_TEMPLATE")
        return r
    if not definition.implemented:
        r.fail("definition", "NOT_IMPLEMENTED")
        return r
    if canonical_id in registry.SYSTEM_RECORDS:
        r.fail("definition", "ENGINE_RECORD_ONLY", detail="Governance records are produced by the engine, not generated on request")
        return r
    if not entitled(db, organization_id):
        r.fail("definition", "NOT_ENTITLED")
        return r
    from app.modules.doc_templates import entitlements
    for key in entitlements.required_features(definition)[1:]:
        if not entitled(db, organization_id, key):
            r.fail("definition", f"PLAN_FEATURE_REQUIRED:{key}")
            return r
    if not templates_enabled(db, organization_id):
        r.fail("definition", "TEMPLATES_DISABLED")
        return r
    r.policy = approvals.effective_policy(db, organization_id, definition)
    if min_policy in registry.RISKS:
        r.policy = registry.stricter(r.policy, min_policy)
    if waive_approval and r.policy == "L2":
        r.inputs["approval_waived"] = {"policy": "L2", "reason": waive_approval[:200]}
        r.policy = "L1"
    r.step("definition", True)

    # 3 — jurisdiction facts (where the person works, never nationality)
    source = source_object(db, organization_id, source_ref)
    if subject_type == "candidate":
        own_offer = getattr(source, "candidate_id", None) == subject_id
        work_country = getattr(source, "work_country", None) if own_offer else None
        work_region = getattr(source, "work_region", None) if own_offer else None
    else:
        work_country = getattr(subject, "work_country", None)
        work_region = getattr(subject, "work_region", None)
    entity = resolve_entity(db, organization_id, subject, entity_id or getattr(source, "employer_entity_id", None))
    if subject_type in ("org", "position"):
        # organization-level records sit in the employing entity's jurisdiction
        org = organization or _org(db, organization_id)
        work_country = getattr(entity, "country", None) or regions.country_code_strict(getattr(org, "country", None))
        work_region = getattr(entity, "region", None)
    elif subject_type == "candidate" and not own_offer:
        # before any offer exists (privacy notice, interview records, rejection) a candidate has no work location yet: the
        # recruiting employer's jurisdiction applies. Once an offer names the work country, that country decides.
        work_country = getattr(entity, "country", None)
        work_region = getattr(entity, "region", None)
    r.entity = entity
    r.work_country, r.work_region = (work_country or None), (work_region or None)
    r.inputs.update({"work_country": r.work_country, "work_region": r.work_region, "entity_id": getattr(entity, "id", None),
                     "entity_country": getattr(entity, "country", None),
                     "employment_type": _val(getattr(subject, "employment_type", None)),
                     "worker_category": getattr(subject, "worker_category", None)})
    if entity is None:
        r.fail("jurisdiction", "NO_EMPLOYER_ENTITY")
        return r
    if not entity.legal_name or not entity.country:
        r.fail("jurisdiction", "EMPLOYER_ENTITY_INCOMPLETE")
        return r
    if not r.work_country:
        r.fail("jurisdiction", "WORK_COUNTRY_UNKNOWN", NEEDS_LEGAL_REVIEW)
        return r
    cross_border = entity.country != r.work_country
    r.step("jurisdiction", True, f"{r.work_country}{('-' + r.work_region) if r.work_region else ''}"
                                 f"{' (cross-border from ' + entity.country + ')' if cross_border else ''}")

    # 4 — pack
    packs = candidate_packs(db, organization_id, r.work_country, r.work_region, on)
    if not packs:
        r.fail("pack", "NO_ACTIVE_PACK")
        return r
    r.step("pack", True, ", ".join(f"{p.scope_type}:{p.id}" for p in packs))

    # 5 — variant
    facts = {"employment_type": r.inputs["employment_type"], "worker_category": r.inputs["worker_category"],
             "work_region": r.work_region, "entity_id": entity.id}
    use_tenant = tenant_attestation_allowed(db, organization_id, definition.legal_risk) and \
        org_settings(db, organization_id).prefer_tenant_variants
    chosen, expired_seen, tenant_blocked = None, False, False
    for pack in packs:
        rows = (db.query(TemplateVariant)
                .filter(TemplateVariant.canonical_id == canonical_id, TemplateVariant.pack_id == pack.id,
                        TemplateVariant.language == language, TemplateVariant.status == "ACTIVE",
                        or_(TemplateVariant.owner_organization_id == organization_id, TemplateVariant.owner_organization_id.is_(None)))
                .all())
        live = [v for v in rows if _effective(v, on)]
        expired_seen = expired_seen or (len(live) < len(rows))
        live = [v for v in live if _applies(v, facts)]
        if cross_border:
            live = [v for v in live if entity.country in ((v.applicability or {}).get("cross_border_from") or [])]
        tenant_rows = [v for v in live if v.release_mode == "TENANT_ATTESTED" and v.owner_organization_id == organization_id]
        platform_rows = [v for v in live if v.release_mode == "PLATFORM_COUNSEL" and v.owner_organization_id is None]
        if tenant_rows and not use_tenant:
            tenant_blocked = True
        pool = (tenant_rows if use_tenant and tenant_rows else platform_rows)
        if len(pool) > 1:
            r.fail("variant", "AMBIGUOUS_VARIANT", detail=f"{len(pool)} ACTIVE variants match in pack {pack.id}")
            return r
        if pool:
            chosen = pool[0]
            r.pack = pack
            break
    if chosen is None:
        if cross_border:
            r.fail("variant", "CROSS_BORDER_UNRESOLVED", NEEDS_LEGAL_REVIEW,
                   detail=f"No ACTIVE variant covers an employer in {entity.country} and work in {r.work_country}")
        elif expired_seen:
            r.fail("variant", "VARIANT_EXPIRED")
        elif tenant_blocked:
            r.fail("variant", "TENANT_VARIANTS_DISABLED")
        else:
            r.fail("variant", "NO_ACTIVE_VARIANT")
        return r
    r.variant = chosen
    r.step("variant", True, f"variant {chosen.id} v{chosen.version} ({chosen.release_mode})")

    # 6 — clauses
    rules = chosen.clause_rules or {}
    refs = references(chosen.content)
    prohibited = set(rules.get("prohibited") or [])
    used_prohibited = sorted(refs["clauses"] & prohibited)
    if used_prohibited:
        for key in used_prohibited:
            r.fail("clauses", f"PROHIBITED_CLAUSE:{key}")
        return r
    clause_problem = False
    for key in rules.get("mandatory") or []:
        c = find_clause(db, organization_id, key, chosen.pack_id, chosen.language, on)
        if c is None:
            r.fail("clauses", f"CLAUSE_UNRESOLVED:{key}")
            clause_problem = True
        else:
            r.clauses[key] = c
    for key in (rules.get("optional") or []):
        c = find_clause(db, organization_id, key, chosen.pack_id, chosen.language, on)
        if c is not None:
            r.clauses[key] = c
    if clause_problem:
        return r
    for key, c in r.clauses.items():
        nested = resolver.clause_keys(c.text)
        if nested & prohibited:
            r.fail("clauses", f"PROHIBITED_CLAUSE:{sorted(nested & prohibited)[0]}")
            return r
    r.step("clauses", True, ", ".join(f"{k}@v{c.version}" for k, c in sorted(r.clauses.items())) or "none required")

    # 7 — fields and language
    signatory = _choose_signatory(db, organization_id, entity, definition, subject_type, subject_id, signatory_id)
    r.signatory = signatory
    ctx = fields.FieldContext(db=db, organization=organization or _org(db, organization_id), subject_type=subject_type,
                              subject=subject, entity=entity, signatory=signatory, requester=actor, language=chosen.language,
                              extra=dict(extra or {}))
    from datetime import timedelta
    response_days = int((chosen.options or {}).get("response_days") or 14)
    ctx.document = {"date": on, "title": definition.title, "response_deadline": on + timedelta(days=response_days)}
    ctx.source = source
    ctx.canonical_id = canonical_id
    ctx.variant = chosen
    ctx.clauses = dict(r.clauses)
    from app.modules.doc_templates import hooks
    hooks.provide(ctx, canonical_id)
    r.ctx = ctx
    if ctx.evidence:
        r.inputs["module_checks"] = ctx.evidence
    if ctx.denials:
        # the owning module refuses this document for this record (e.g. a salary decrease on an increase letter)
        for code in dict.fromkeys(ctx.denials):
            r.fail("fields", code)
        return r
    contract = chosen.field_contract or {}
    required = [k for k in contract.get("required") or [] if not k.startswith("document.") and k != "generated_at"]
    clause_fields = set()
    for c in r.clauses.values():
        clause_fields |= resolver.field_keys(c.text)
    unknown = sorted(k for k in set(required) | clause_fields if not fields.is_known(k))
    if unknown:
        for k in unknown:
            r.fail("fields", f"UNKNOWN_FIELD:{k}")
        return r
    missing = fields.required_missing(ctx, required)
    if missing:
        r.missing_fields = missing
        for k in missing:
            r.fail("fields", f"MISSING_FIELD:{k}")
        return r
    if chosen.language != language:
        r.fail("fields", "LANGUAGE_NOT_APPROVED")
        return r
    r.step("fields", True, f"{len(required)} required fields resolved")

    # 8 — recipient, channel, signatory, approvers
    audience = definition.audience
    if audience == "CANDIDATE":
        email = getattr(subject, "email", None)
        r.recipient = {"type": "candidate", "channel": "email_link", "email": email, "name": fields._full_name(subject),
                       "has_email": bool(email)}
        if not email:
            r.fail("recipient", "RECIPIENT_EMAIL_MISSING")
            return r
    elif audience in ("EMPLOYEE", "MANAGER"):
        from app.modules.employee.models import Employee
        if audience == "MANAGER":
            # issued to the subject's reporting manager (e.g. the manager onboarding checklist)
            mid = getattr(subject, "reporting_manager_id", None) or getattr(subject, "manager_id", None)
            person = db.get(Employee, mid) if mid else None
            if person is not None and person.organization_id != organization_id:
                person = None
        elif subject_type == "employee":
            person = subject
        elif subject_type == "new_hire" and getattr(subject, "employee_id", None):
            person = db.get(Employee, subject.employee_id)
        else:
            person = None
        if person is None:
            r.fail("recipient", "RECIPIENT_NOT_AN_EMPLOYEE")
            return r
        email = getattr(person, "work_email", None) or getattr(person, "email", None)
        r.recipient = {"type": "employee", "channel": "portal", "employee_id": person.id, "email": email,
                       "name": fields._full_name(person), "has_email": bool(email), "has_portal_account": bool(person.is_active)}
        if not person.is_active:
            r.fail("recipient", "RECIPIENT_HAS_NO_PORTAL_ACCOUNT")
            return r
    else:
        r.recipient = {"type": "internal", "channel": "none"}
    needs_employer = definition.execution_mode == "SIGN_BOTH" or "employer.signatory_name" in (set(required) | refs["fields"])
    if needs_employer and signatory is None:
        r.fail("recipient", "NO_AUTHORISED_SIGNATORY")
        return r
    chain, problem = approvals.plan_chain(db, organization_id=organization_id, definition=definition, policy=r.policy,
                                          requester_id=actor.id,
                                          subject_employee_id=subject_id if subject_type == "employee" else None,
                                          entity_id=entity.id)
    r.chain = chain
    if problem:
        r.fail("recipient", problem, detail=approvals.HOW_TO_FIX)
        return r
    r.step("recipient", True, r.recipient.get("channel"))
    return r


def _choose_signatory(db, organization_id, entity, definition, subject_type, subject_id, signatory_id):
    if entity is None:
        return None
    exclude = {subject_id} if subject_type == "employee" and subject_id else set()
    sigs = approvals.eligible_signatories(db, organization_id, entity.id, definition.canonical_id, definition.family_id,
                                          definition.legal_risk, exclude)
    if signatory_id:
        return next((s for s in sigs if s.id == signatory_id), None)
    return sigs[0] if sigs else None


def _org(db, organization_id):
    from app.modules.hr.models import Organization
    return db.get(Organization, organization_id)


def _val(v):
    return getattr(v, "value", v)


def persist_receipt(db, r: PreflightResult, *, organization_id: int, requested_by: Optional[int],
                    document_id: Optional[int] = None) -> DecisionReceipt:
    """Step 9: the immutable record of how the engine decided (append-only)."""
    receipt = DecisionReceipt(
        organization_id=organization_id, document_id=document_id, canonical_id=r.inputs.get("canonical_id") or "?",
        requested_by=requested_by, source_ref=r.inputs.get("source_ref"), inputs=r.inputs, resolved_pack_id=getattr(r.pack, "id", None),
        variant_id=getattr(r.variant, "id", None), variant_version=getattr(r.variant, "version", None),
        variant_checksum=getattr(r.variant, "checksum", None),
        clauses=[{"key": k, "id": c.id, "version": c.version, "checksum": c.checksum} for k, c in sorted(r.clauses.items())],
        steps=list(r.steps) + [{"step": "evidence", "outcome": "PASS" if r.allowed else "SKIPPED"}],
        reasons=list(r.reasons) or None, outcome=r.outcome, engine_version=registry.ENGINE_VERSION,
        created_at=datetime.utcnow(),
    )
    db.add(receipt)
    db.flush()
    return receipt
