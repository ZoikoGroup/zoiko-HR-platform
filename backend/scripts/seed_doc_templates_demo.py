"""Demo and QA data for the document template engine (Prompt 4 §C12).

    HR_DEBUG=true python scripts/seed_synthetic_tenants.py          # first: the synthetic tenants (TENANT-A, TENANT-B)
    HR_DEBUG=true python scripts/seed_doc_templates_demo.py [TENANT-A]

Gives one synthetic tenant (default TENANT-A) everything needed to see every implemented document without real data:

* an ACTIVE tenant jurisdiction pack for one country (GB), a default employer entity and an authorised signatory;
* a released TENANT_ATTESTED variant for every implemented template (all 72 business templates; the 10 governance records are
  produced by the engine), built from the starter text;
* every clause key released in that pack: starter text where it exists, otherwise placeholder text that says
  "DEMO — NOT LEGAL TEXT" so nobody mistakes it for counsel-approved wording;
* synthetic candidates, new hires, leave, overtime, appraisals and change requests in different states.

Same safety rule as seed_synthetic_tenants.py: refuses to run against anything that does not look like a development database.
Idempotent: running it again adds nothing that already exists.
"""
import os
import sys
from datetime import date, datetime, timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "scripts"))
os.environ.setdefault("ENVIRONMENT", "development")

DEMO_CLAUSE = "DEMO — NOT LEGAL TEXT. Placeholder for the {key} clause. Replace it with wording written for your jurisdiction."
COUNTRY = "GB"


def seed(db, organization) -> dict:
    from app.modules.doc_templates import blocks, bootstrap, registry, starters
    from app.modules.doc_templates.models import (AuthorisedSignatory, EmployerEntity, JurisdictionPack, TemplateClause, TemplateDefinition,
                                                  TemplateVariant)
    from app.modules.employee.models import Employee, UserRole
    bootstrap.seed(db)
    org_id = organization.id
    out = {"variants": 0, "clauses": 0, "records": 0}
    entity = db.query(EmployerEntity).filter_by(organization_id=org_id, is_default=True).first()
    if entity is None:
        entity = EmployerEntity(organization_id=org_id, legal_name=f"{organization.organization_name or organization.name} Ltd (demo)",
                                country=COUNTRY, city="Leeds", postal_code="LS1 1AA", address_lines=["1 Demo Street"],
                                registration_type="company_number", registration_number="00000000", is_default=True, status="active")
        db.add(entity)
        db.commit()
    pack = db.query(JurisdictionPack).filter_by(scope_type="TENANT", owner_organization_id=org_id, country=COUNTRY).first()
    if pack is None:
        pack = JurisdictionPack(scope_type="TENANT", owner_organization_id=org_id, country=COUNTRY, status="ACTIVE", created_at=datetime.utcnow(),
                                requirements={}, signed_off_by_name="DEMO — not legal advice")
        db.add(pack)
        db.commit()
    people = db.query(Employee).filter(Employee.organization_id == org_id, Employee.is_active.is_(True)).all()
    admin = next((p for p in people if p.role == UserRole.ADMIN), None)
    for p in people:
        if not p.work_country:
            p.work_country, p.employing_entity_id = COUNTRY, entity.id
    db.commit()
    if admin and not db.query(AuthorisedSignatory).filter_by(organization_id=org_id, entity_id=entity.id).first():
        db.add(AuthorisedSignatory(organization_id=org_id, entity_id=entity.id, employee_id=admin.id, signatory_title="Director (demo)",
                                   authority_scope=["ALL"], max_risk_level="L3", valid_from=date.today() - timedelta(days=1), approved_by=admin.id))
        db.commit()
    keys = set(starters.STARTER_CLAUSES) | set(starters.NO_STARTER_TEXT)
    for key in sorted(keys):
        if db.query(TemplateClause).filter_by(clause_key=key, pack_id=pack.id, status="ACTIVE").first():
            continue
        text = (starters.STARTER_CLAUSES.get(key) or {}).get("text") or DEMO_CLAUSE.format(key=key)
        params = {"max_probation_months": 6} if key == "probation_extension_rules" else None
        db.add(TemplateClause(clause_key=key, pack_id=pack.id, owner_organization_id=org_id, language="en", version=1, status="ACTIVE", text=text,
                              checksum=blocks.checksum(key, text, "en"), parameters=params))
        out["clauses"] += 1
    db.commit()
    for d in db.query(TemplateDefinition).filter(TemplateDefinition.implemented.is_(True)).all():
        if d.canonical_id in registry.SYSTEM_RECORDS:
            continue
        if db.query(TemplateVariant).filter_by(canonical_id=d.canonical_id, pack_id=pack.id, status="ACTIVE").first():
            continue
        s = starters.latest(db, d.canonical_id)
        if s is None:
            continue
        v = TemplateVariant(canonical_id=d.canonical_id, pack_id=pack.id, owner_organization_id=org_id, language="en", version=1, status="ACTIVE",
                            release_mode="TENANT_ATTESTED", content=s["content"], field_contract=s["field_contract"],
                            clause_rules=s["clause_rules"], options=s["options"], applicability=s.get("applicability"),
                            effective_from=date.today() - timedelta(days=1), legal_review={"demo": True, "note": "DEMO — NOT LEGAL TEXT"},
                            change_reason="Demo seed", starter_revision=s.get("revision"))
        v.checksum = blocks.checksum(v.content, v.field_contract, v.clause_rules, v.applicability, v.options, v.language)
        db.add(v)
        out["variants"] += 1
    db.commit()
    out["records"] = _records(db, org_id, people)
    return out


def _records(db, org_id, people) -> int:
    """Synthetic candidates, hires, leave, overtime, appraisals and changes in different states (only when none exist yet)."""
    from app.modules.employee.models import UserRole
    from app.modules.hr.models import (Appraisal, AppraisalStatus, EmployeeLifecycle, LeaveRequest, LeaveType, OnboardingNewHire, OvertimeRequest,
                                       RecruitmentCandidate, RecruitmentCandidateStatus, RequestStatus)
    if db.query(RecruitmentCandidate).filter_by(organization_id=org_id).filter(RecruitmentCandidate.email.like("%@demo.example.com")).first():
        return 0
    staff = [p for p in people if p.role == UserRole.EMPLOYEE] or people
    hr = next((p for p in people if p.role in (UserRole.HR_ADMIN, UserRole.ADMIN)), people[0])
    n = 0
    for i, status in enumerate(RecruitmentCandidateStatus):
        db.add(RecruitmentCandidate(name=f"Demo Candidate {i + 1}", email=f"candidate{i + 1}@demo.example.com", position="Analyst",
                                    organization_id=org_id, status=status))
        n += 1
    for i, status in enumerate(("offer_accepted", "in_progress")):
        db.add(OnboardingNewHire(organization_id=org_id, candidate_name=f"Demo Starter {i + 1}", email=f"starter{i + 1}@demo.example.com",
                                 position="Analyst", joining_date=date.today() + timedelta(days=14 + i), status=status, work_country=COUNTRY))
        n += 1
    emp = staff[0]
    start = date.today() + timedelta(days=20)
    for i, (lt, st) in enumerate(((LeaveType.ANNUAL, RequestStatus.PENDING), (LeaveType.ANNUAL, RequestStatus.APPROVED),
                                  (LeaveType.CASUAL, RequestStatus.REJECTED), (LeaveType.BEREAVEMENT, RequestStatus.PENDING))):
        db.add(LeaveRequest(employee_id=emp.id, organization_id=org_id, leave_type=lt, start_date=start + timedelta(days=7 * i),
                            end_date=start + timedelta(days=7 * i), days=1, reason="Demo leave request" if lt != LeaveType.BEREAVEMENT else None,
                            status=st, decision_reason="Demo: cover not available" if st == RequestStatus.REJECTED else None))
        n += 1
    db.add(OvertimeRequest(organization_id=org_id, employee_id=emp.id, date=date.today() - timedelta(days=1), start_time="17:00", end_time="19:00",
                           hours=2, reason="Demo month-end close", pre_approved=False, status="PENDING", requested_by=emp.id))
    db.add(Appraisal(employee_id=emp.id, reviewer_id=hr.id, cycle=str(date.today().year), organization_id=org_id, status=AppraisalStatus.DRAFT))
    db.add(EmployeeLifecycle(employee_id=emp.id, organization_id=org_id, event_type="promotion", event_date=date.today(),
                             effective_date=date.today() + timedelta(days=30), previous_value={"title": emp.job_title},
                             new_value={"title": "Senior Analyst (demo)"}, initiated_by=hr.id, status="pending"))
    db.commit()
    return n + 3


def main() -> int:
    from seed_synthetic_tenants import _allowed
    if not _allowed():
        print("Refusing: this database does not look like a development one (set HR_ALLOW_SYNTHETIC_SEED=1 only for a throwaway copy).")
        return 1
    from app.database import SessionLocal
    from app.modules.hr.models import Organization
    name = sys.argv[1] if len(sys.argv) > 1 else "TENANT-A"
    db = SessionLocal()
    try:
        org = db.query(Organization).filter(Organization.name == name).first()
        if org is None:
            print(f"No organization named {name}. Run scripts/seed_synthetic_tenants.py first.")
            return 1
        print(seed(db, org))
        return 0
    finally:
        db.close()


if __name__ == "__main__":
    raise SystemExit(main())
