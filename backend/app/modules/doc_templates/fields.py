"""Field registry: every placeholder a template may use (docs/templates/field_registry.md is generated from this file).

Each field has a key, label, type, privacy classification, a source (a function of the FieldContext that reads the HR system)
and a synthetic sample used by the editor's live preview (never a real person). Unknown keys are rejected when a variant or
clause is saved, so a typo can never reach a rendered document.

Prompts 2–4 register their module fields (offer.*, leave.*, performance.*, …) with `register()` in this same file.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date, datetime
from typing import Any, Callable, Optional

from app.core import business_ids, regions
from app.core.privacy.classification import Level
from app.modules.doc_templates import formatting

L = Level


@dataclass(frozen=True)
class FieldDef:
    key: str
    label: str
    type: str                                   # text | date | datetime | money | number | list | bool | image | signature
    classification: Level
    source: Callable[["FieldContext"], Any]
    sample: Any = None
    group: str = ""
    system_only: bool = False                   # bound only by engine-generated governance records

    def describe(self) -> dict:
        return {"key": self.key, "label": self.label, "type": self.type, "classification": self.classification.value,
                "group": self.group or self.key.split(".")[0], "system_only": self.system_only}


REGISTRY: dict[str, FieldDef] = {}


def register(key, label, type_, classification, source, sample=None, *, system_only=False):
    REGISTRY[key] = FieldDef(key, label, type_, classification, source, sample, key.split(".")[0], system_only)


def is_known(key: str) -> bool:
    return key in REGISTRY


def catalogue(include_system: bool = False) -> list[dict]:
    return [f.describe() for f in REGISTRY.values() if include_system or not f.system_only]


# ── context ──────────────────────────────────────────────────────────────────────────────────────────────────────────

@dataclass
class FieldContext:
    """Everything a field source may read. Built once per generation; nothing is fetched twice."""
    db: Any
    organization: Any
    subject_type: str = "org"
    subject: Any = None                          # Employee | RecruitmentCandidate | OnboardingNewHire | None
    entity: Any = None                           # EmployerEntity
    signatory: Any = None                        # AuthorisedSignatory (with .employee loaded lazily)
    requester: Any = None                        # Employee who asked for the document
    document: dict = field(default_factory=dict)  # number, date, title, verify_url, response_deadline, sha256
    signatures: dict = field(default_factory=dict)  # party -> {"name", "signed_at", "method"} once signed
    extra: dict = field(default_factory=dict)    # values supplied by the calling module or a governance record
    canonical_id: str = ""                       # the template being resolved (set by preflight)
    source: Any = None                           # the record named by source_ref (offer, requisition, interview, ...)
    form_values: dict = field(default_factory=dict)      # FORM_RECORD: key -> display value (already masked where needed)
    checklist_state: dict = field(default_factory=dict)  # CHECKLIST_RECORD: item key -> {"done": bool, "on": "...", "note": "..."}
    variant: Any = None                          # the ACTIVE variant chosen by preflight (policy version, effective date)
    denials: list = field(default_factory=list)  # reason codes a module's context provider raises (e.g. SALARY_DECREASE_NOT_ALLOWED)
    clauses: dict = field(default_factory=dict)  # resolved clauses (key -> TemplateClause), e.g. to read a clause's parameters
    evidence: dict = field(default_factory=dict)  # checks a provider performed, recorded in the decision receipt (no contents)
    language: str = "en"
    sample: bool = False
    _cache: dict = field(default_factory=dict)

    # -- helpers used by sources --
    def employee(self):
        return self.subject if self.subject_type == "employee" else None

    def worker(self):
        """The person the document is about: an employee, or a new hire before their account exists."""
        return self.subject if self.subject_type in ("employee", "new_hire") else None

    def country(self) -> Optional[str]:
        return getattr(self.entity, "country", None) or regions.country_code_strict(getattr(self.organization, "country", None))

    def currency(self) -> Optional[str]:
        return getattr(self.organization, "currency", None)

    def cached(self, key, fn):
        if key not in self._cache:
            self._cache[key] = fn()
        return self._cache[key]

    def raw(self, key: str):
        if self.sample:
            return REGISTRY[key].sample
        # `extra` never overrides a field the registry reads from the HR system: only extra-sourced fields consult it.
        return REGISTRY[key].source(self)

    def formatted(self, key: str) -> str:
        fd = REGISTRY[key]
        value = self.raw(key)
        if fd.type == "signature":
            return _signature_text(value)
        if fd.type == "image":
            return ""
        return formatting.format_value(value, fd.type, self.language, self.country(), self.currency())


def _signature_text(value) -> str:
    if isinstance(value, dict) and value.get("signed_at"):
        when = value["signed_at"]
        when = when.strftime("%Y-%m-%d %H:%M UTC") if isinstance(when, datetime) else str(when)
        return f"Signed electronically by {value.get('name') or ''} on {when}"
    return "______________________________"


# ── sources ──────────────────────────────────────────────────────────────────────────────────────────────────────────

def _attr(obj, *names):
    for n in names:
        v = getattr(obj, n, None) if obj is not None else None
        if v not in (None, ""):
            return v.value if hasattr(v, "value") and not isinstance(v, (str, int)) else v
    return None


def _full_name(person):
    if person is None:
        return None
    if hasattr(person, "first_name"):
        return " ".join(p for p in (person.first_name, person.last_name) if p) or None
    return _attr(person, "candidate_name", "name")


def _first_name(person):
    if person is None:
        return None
    if hasattr(person, "first_name"):
        return person.first_name
    name = _attr(person, "candidate_name", "name")
    return name.split()[0] if name else None


def _entity_address(ctx):
    e = ctx.entity
    if e is None:
        return None
    parts = list(e.address_lines or [])
    tail = " ".join(p for p in (e.city, e.region, e.postal_code) if p)
    if tail:
        parts.append(tail)
    if e.country:
        parts.append(regions.country_name(e.country) or e.country)
    return ", ".join(p for p in parts if p) or None


def _registration_label(ctx):
    e = ctx.entity
    if e is None or not e.registration_number:
        return None
    return business_ids.id_type(e.country, e.registration_type).get("label") or e.registration_type


def _signatory_employee(ctx):
    s = ctx.signatory
    if s is None:
        return None
    from app.modules.employee.models import Employee
    return ctx.cached(("emp", s.employee_id), lambda: ctx.db.get(Employee, s.employee_id))


def _offer_src(ctx):
    """The recruitment offer behind a candidate document: candidates have no employee record, the offer holds the terms."""
    s = ctx.source
    return s if s is not None and type(s).__name__ == "RecruitmentOffer" else None


def _department(ctx):
    o = _offer_src(ctx)
    if o is not None and o.department_id:
        from app.modules.hr.models import Department
        return ctx.cached(("dept", o.department_id), lambda: ctx.db.get(Department, o.department_id))
    w = ctx.worker()
    if w is None or not getattr(w, "department_id", None):
        return None
    from app.modules.hr.models import Department
    return ctx.cached(("dept", w.department_id), lambda: ctx.db.get(Department, w.department_id))


def _manager(ctx):
    w = _offer_src(ctx) or ctx.worker()
    mid = getattr(w, "reporting_manager_id", None) or getattr(w, "manager_id", None)
    if not mid:
        return None
    from app.modules.employee.models import Employee
    return ctx.cached(("emp", mid), lambda: ctx.db.get(Employee, mid))


def _position_title(ctx):
    o = _offer_src(ctx)
    if o is not None:
        return o.position
    w = ctx.worker()
    if w is None:
        return _attr(ctx.subject, "position")
    if getattr(w, "designation_id", None):
        from app.modules.hr.models import Designation
        d = ctx.cached(("desig", w.designation_id), lambda: ctx.db.get(Designation, w.designation_id))
        if d is not None and d.title:
            return d.title
    return _attr(w, "job_title", "position")


def _work_country(ctx):
    return _attr(_offer_src(ctx), "work_country") or _attr(ctx.subject, "work_country")


def _work_location(ctx):
    o = _offer_src(ctx)
    if o is not None:
        parts = [o.work_location, o.work_region]
        return ", ".join(p for p in parts if p) or None
    s = ctx.subject
    if s is None:
        return None
    country = _work_country(ctx)
    parts = [_attr(s, "work_city"), _attr(s, "work_region"), regions.country_name(country) if country else None]
    return ", ".join(p for p in parts if p) or None


_EMPLOYMENT_TYPE_LABELS = {
    "full_time": "Full-time", "part_time": "Part-time", "contract": "Fixed-term / contract", "intern": "Internship",
    "internship": "Internship", "probation": "Probationary", "freelance": "Freelance",
}


def _employment_type(ctx):
    return _attr(_offer_src(ctx), "employment_type") or _attr(ctx.subject, "employment_type")


def _probation_end(ctx):
    w = ctx.employee()
    if w is None:
        return None
    from app.modules.hr.models import EmployeeLifecycle

    def load():
        row = (ctx.db.query(EmployeeLifecycle)
               .filter(EmployeeLifecycle.employee_id == w.id, EmployeeLifecycle.event_type == "probation_end")
               .order_by(EmployeeLifecycle.event_date.desc()).first())
        return (row.effective_date or row.event_date) if row else None
    return ctx.cached(("probation_end", w.id), load)


def _doc(key):
    return lambda ctx: ctx.document.get(key)


def _extra(key):
    return lambda ctx: ctx.extra.get(key)


def _sig(party):
    return lambda ctx: ctx.signatures.get(party)


SAMPLE_DATE = date(2026, 11, 2)

# organization and employer
register("org.display_name", "Organization name", "text", L.PERSONAL_BASIC,
         lambda c: _attr(c.organization, "display_name", "organization_name"), "Example Organisation")
register("org.logo", "Organization logo", "image", L.PERSONAL_BASIC, lambda c: _attr(c.organization, "logo_url"), None)
register("employer.legal_name", "Employer legal name", "text", L.PERSONAL_BASIC, lambda c: _attr(c.entity, "legal_name"),
         "Example Employer Ltd")
register("employer.trading_name", "Employer trading name", "text", L.PERSONAL_BASIC, lambda c: _attr(c.entity, "trading_name"),
         "Example")
register("employer.registered_address", "Employer registered address", "text", L.PERSONAL_BASIC, _entity_address,
         "1 Sample Street, Sample City, 00000, United Kingdom")
register("employer.registration_label", "Employer registration type", "text", L.PERSONAL_BASIC, _registration_label,
         "Company number")
register("employer.registration_number", "Employer registration number", "text", L.PERSONAL_BASIC,
         lambda c: _attr(c.entity, "registration_number"), "00000000")
register("employer.signatory_name", "Authorised signatory name", "text", L.PERSONAL_BASIC,
         lambda c: _full_name(_signatory_employee(c)), "Sam Signatory")
register("employer.signatory_title", "Authorised signatory title", "text", L.PERSONAL_BASIC,
         lambda c: _attr(c.signatory, "signatory_title"), "Head of People")
register("employer.hr_contact_name", "HR contact name", "text", L.PERSONAL_BASIC, lambda c: _full_name(c.requester), "Harper Contact")
register("employer.hr_contact_email", "HR contact e-mail", "text", L.PERSONAL_BASIC,
         lambda c: _attr(c.requester, "work_email", "email"), "hr@example.com")

# worker (employee or new hire)
register("worker.full_name", "Worker full name", "text", L.PERSONAL_BASIC, lambda c: _full_name(c.worker()), "Alex Example")
register("worker.first_name", "Worker first name", "text", L.PERSONAL_BASIC, lambda c: _first_name(c.worker()), "Alex")
register("worker.employee_code", "Employee code", "text", L.PERSONAL_BASIC, lambda c: _attr(c.employee(), "employee_code"), "EX-0001")
register("worker.work_email", "Worker work e-mail", "text", L.PERSONAL_BASIC,
         lambda c: _attr(c.worker(), "work_email", "email"), "alex.example@example.com")
register("worker.postal_address", "Worker postal address", "text", L.PERSONAL_CONFIDENTIAL,
         lambda c: _attr(c.employee(), "current_address", "address"), "2 Sample Road, Sample Town")

# candidate
register("candidate.full_name", "Candidate full name", "text", L.TENANT_CUSTOMER,
         lambda c: _full_name(c.subject) if c.subject_type == "candidate" else None, "Casey Candidate")
register("candidate.first_name", "Candidate first name", "text", L.TENANT_CUSTOMER,
         lambda c: _first_name(c.subject) if c.subject_type == "candidate" else None, "Casey")
register("candidate.email", "Candidate e-mail", "text", L.TENANT_CUSTOMER,
         lambda c: _attr(c.subject, "email") if c.subject_type == "candidate" else None, "casey.candidate@example.com")
register("candidate.postal_address", "Candidate postal address", "text", L.PERSONAL_CONFIDENTIAL,
         lambda c: _attr(c.subject, "location") if c.subject_type == "candidate" else None, "3 Sample Lane, Sample City")

# employment
register("employment.position_title", "Position title", "text", L.PERSONAL_BASIC, _position_title, "Senior Analyst")
register("employment.department", "Department", "text", L.PERSONAL_BASIC, lambda c: _attr(_department(c), "name"), "Operations")
register("employment.manager_name", "Manager name", "text", L.PERSONAL_BASIC, lambda c: _full_name(_manager(c)), "Morgan Manager")
register("employment.work_location", "Work location", "text", L.PERSONAL_BASIC, _work_location, "Sample City, United Kingdom")
register("employment.work_country_name", "Work country", "text", L.PERSONAL_BASIC,
         lambda c: regions.country_name(_work_country(c)), "United Kingdom")
register("employment.employment_type", "Employment type (code)", "text", L.PERSONAL_BASIC, _employment_type, "full_time")
register("employment.employment_type_label", "Employment type", "text", L.PERSONAL_BASIC,
         lambda c: _EMPLOYMENT_TYPE_LABELS.get(_employment_type(c) or "", _employment_type(c)), "Full-time")
register("employment.worker_category", "Worker category", "text", L.PERSONAL_BASIC, lambda c: _attr(c.subject, "worker_category"),
         "employee")
register("employment.start_date", "Start date", "date", L.PERSONAL_BASIC,
         lambda c: _attr(_offer_src(c), "joining_date") or _attr(c.worker(), "date_of_joining", "joining_date"), SAMPLE_DATE)
register("employment.contract_end_date", "Contract end date", "date", L.PERSONAL_BASIC,
         lambda c: _attr(_offer_src(c), "contract_end_date") or _attr(c.employee(), "contract_end_date"), None)
register("employment.probation_end_date", "Probation end date", "date", L.PERSONAL_BASIC, _probation_end, date(2027, 5, 2))
register("employment.work_pattern", "Work pattern", "text", L.PERSONAL_BASIC,
         lambda c: _attr(_offer_src(c), "work_pattern") or c.extra.get("employment.work_pattern"),
         "Monday to Friday, 37.5 hours per week")
register("employment.pay_summary", "Pay summary", "text", L.FINANCIAL, _extra("employment.pay_summary"), "GBP 42,000.00 per year")

# document
register("document.number", "Document number", "text", L.PLATFORM_META, _doc("number"), "EX-2026-000123")
register("document.date", "Document date", "date", L.PLATFORM_META, _doc("date"), SAMPLE_DATE)
register("document.title", "Document title", "text", L.PLATFORM_META, _doc("title"), "Sample document")
register("document.verify_url", "Verification link", "text", L.PLATFORM_META, _doc("verify_url"),
         "https://app.example.com/verify/EX-2026-000123")
register("document.response_deadline", "Response deadline", "date", L.PLATFORM_META, _doc("response_deadline"), date(2026, 11, 16))
register("document.sha256", "Document SHA-256", "text", L.PLATFORM_META, _doc("sha256"), "0" * 64)
register("generated_at", "Generated at", "date", L.PLATFORM_META, _doc("date"), SAMPLE_DATE)

# signatures (signature lines before execution, signed blocks after)
register("signature.employer", "Employer signature", "signature", L.PERSONAL_BASIC, _sig("employer"))
register("signature.employee", "Employee signature", "signature", L.PERSONAL_BASIC, _sig("employee"))
register("signature.candidate", "Candidate signature", "signature", L.PERSONAL_BASIC, _sig("candidate"))

# governance records (engine-bound; not offered in the field picker)
for _key, _label, _type in [
    ("template.canonical_id", "Template ID", "text"), ("template.title", "Template title", "text"),
    ("template.family", "Template family", "text"),
    ("variant.id", "Variant ID", "text"), ("variant.version", "Variant version", "number"), ("variant.language", "Variant language", "text"),
    ("variant.release_mode", "Release mode", "text"), ("variant.checksum", "Variant checksum", "text"),
    ("variant.status", "Variant status", "text"),
    ("pack.country", "Jurisdiction country", "text"), ("pack.region", "Jurisdiction region", "text"),
    ("review.reviewer_name", "Reviewer", "text"), ("review.reviewer_role", "Reviewer role", "text"),
    ("review.reviewer_firm", "Reviewer firm / organisation", "text"),
    ("review.qualification_statement", "Qualification statement", "text"), ("review.date", "Reviewed on", "date"),
    ("review.conditions", "Conditions / limitations", "text"),
    ("execution.completed_at", "Executed on", "datetime"), ("execution.consent_version", "Consent statement version", "text"),
    ("version.previous", "Previous version", "text"), ("version.next", "New version", "text"),
    ("version.change_reason", "Change reason", "text"), ("version.impact", "Requirements affected", "text"),
    ("approval.requested_by", "Proposed by", "text"), ("approval.released_by", "Released by", "text"),
    ("record.subject", "Record subject", "text"),
]:
    register(_key, _label, _type, L.PLATFORM_META, _extra(_key), system_only=True)


def required_missing(ctx: FieldContext, keys) -> list[str]:
    """Required keys whose value is empty for this context."""
    missing = []
    for key in keys:
        if REGISTRY[key].type in ("signature", "image"):
            continue                                      # rendered as a line / omitted, never "missing"
        v = ctx.raw(key)
        if v in (None, "", [], {}):
            missing.append(key)
    return missing


def snapshot(ctx: FieldContext, keys) -> dict:
    """JSON-safe raw values of the given keys (for the encrypted field snapshot)."""
    out = {}
    for key in sorted(keys):
        fd = REGISTRY[key]
        if fd.type in ("signature", "image"):
            continue
        v = ctx.raw(key)
        if isinstance(v, (date, datetime)):
            v = v.isoformat()
        elif v is not None and not isinstance(v, (str, int, float, bool, list, dict)):
            v = str(v)
        out[key] = v
    return out


# Module fields (recruitment, workforce planning, onboarding — Prompt 2). Imported last: they reuse the helpers above.
from app.modules.doc_templates import fields_hr  # noqa: E402,F401
# Policies, leave, working time and compensation (Prompt 3).
from app.modules.doc_templates import fields_work  # noqa: E402,F401
# Performance, probation, learning and employment changes (Prompt 4).
from app.modules.doc_templates import fields_perf  # noqa: E402,F401
