"""Stored recruitment / onboarding / department values that break today's field rules (QA report #13, root cause E).

    python scripts/report_invalid_records.py [--org 37]                      # report only (the default, a dry run)
    python scripts/report_invalid_records.py --org 37 --delete-test-records  # QA tenants only: remove those rows

The report lists table, row id, field, the stored value and the rule's message, per organization. It prints stored values, so
run it against QA / test tenants, or keep the output private. In production invalid records are left for HR to correct: the
Edit forms re-check every field they show. --delete-test-records refuses to run unless HR_DEBUG is true (a non-production
environment) and needs --org. Departments are deactivated rather than deleted (employees and offers may point at them) and
new hires are soft-deleted the way the app does it.
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

# (model name, {field: rule}); phone numbers are stored in E.164, so they are checked as international numbers
CHECKS = (
    ("Department", {"name": "org_unit"}),
    ("RecruitmentRequisition", {"title": "job_title", "department": "org_unit", "location": "location"}),
    ("RecruitmentCandidate", {"name": "person_full_name", "position": "job_title", "location": "location", "email": "email",
                              "phone": "phone"}),
    ("RecruitmentInterview", {"candidate_name": "person_full_name", "position": "job_title", "location": "location",
                              "interviewer": "person_full_name"}),
    ("RecruitmentOffer", {"candidate_name": "person_full_name", "position": "job_title", "work_location": "location",
                          "work_pattern": "work_pattern", "equity": "equity"}),
    ("OnboardingNewHire", {"candidate_name": "person_full_name", "position": "job_title", "email": "email", "phone": "phone"}),
)


def _problem(rule, value):
    from app.core import field_rules
    if rule == "equity":
        from app.modules.hr.schemas import _equity
        try:
            _equity(value)
            return None
        except ValueError as e:
            return str(e)
    return field_rules.problem(rule, value)


def find(db, organization_id=None) -> list[dict]:
    """[{organization_id, table, id, field, value, message}] for every stored value its rule refuses."""
    from app.modules.hr import models
    out = []
    for model_name, spec in CHECKS:
        model = getattr(models, model_name)
        q = db.query(model)
        if organization_id is not None:
            q = q.filter(model.organization_id == organization_id)
        if hasattr(model, "is_deleted"):
            q = q.filter(model.is_deleted.is_(False))
        if model_name == "Department":
            q = q.filter(model.is_active.is_(True))   # a retired department is offered nowhere
        for row in q.order_by(model.organization_id, model.id).all():
            for field, rule in spec.items():
                value = getattr(row, field, None)
                if value in (None, ""):
                    continue
                message = _problem(rule, value)
                if message:
                    out.append({"organization_id": row.organization_id, "table": model.__tablename__, "id": row.id,
                                "field": field, "value": str(value), "message": message})
    return sorted(out, key=lambda f: (f["organization_id"] or 0, f["table"], f["id"]))


def delete_test_records(db, organization_id: int, findings: list[dict]) -> dict:
    """Removes the flagged rows of one QA organization. Refused unless HR_DEBUG is on."""
    from app.config import settings
    if not getattr(settings, "DEBUG", False):
        raise SystemExit("Refusing to delete: HR_DEBUG is false (production). Invalid records stay for HR to correct.")
    from app.modules.hr import models, recruitment_service

    ids: dict = {}
    for f in findings:
        if f["organization_id"] == organization_id:
            ids.setdefault(f["table"], set()).add(f["id"])
    done: dict = {}

    def count(key):
        done[key] = done.get(key, 0) + 1

    for row_id in sorted(ids.get("recruitment_interviews", ())):
        recruitment_service.delete_interview(db, row_id, organization_id)
        count("recruitment_interviews")
    Offer, Approval = models.RecruitmentOffer, models.RecruitmentOfferApproval
    for row_id in sorted(ids.get("recruitment_offers", ())):
        db.query(Approval).filter(Approval.offer_id == row_id).delete(synchronize_session=False)
        db.query(Offer).filter(Offer.amends_offer_id == row_id).update({Offer.amends_offer_id: None}, synchronize_session=False)
        db.query(Offer).filter(Offer.id == row_id, Offer.organization_id == organization_id).delete(synchronize_session=False)
        db.commit()
        count("recruitment_offers")
    for row_id in sorted(ids.get("recruitment_candidates", ())):
        try:
            recruitment_service.delete_candidate(db, row_id, organization_id)
            count("recruitment_candidates")
        except Exception as exc:                        # e.g. still being onboarded: reported, not forced
            db.rollback()
            print(f"  kept recruitment_candidates id={row_id}: {exc}")
    Hire = models.OnboardingNewHire
    for row_id in sorted(ids.get("onboarding_new_hires", ())):
        hire = db.query(Hire).filter(Hire.id == row_id, Hire.organization_id == organization_id).first()
        if hire is not None:
            hire.is_deleted = True                      # the app's own soft delete for new hires
            db.commit()
            count("onboarding_new_hires (soft-deleted)")
    Req, Cand = models.RecruitmentRequisition, models.RecruitmentCandidate
    for row_id in sorted(ids.get("recruitment_requisitions", ())):
        db.query(Cand).filter(Cand.requisition_id == row_id).update({Cand.requisition_id: None}, synchronize_session=False)
        db.query(Req).filter(Req.id == row_id, Req.organization_id == organization_id).delete(synchronize_session=False)
        db.commit()
        count("recruitment_requisitions")
    Dept = models.Department
    for row_id in sorted(ids.get("departments", ())):
        dept = db.query(Dept).filter(Dept.id == row_id, Dept.organization_id == organization_id).first()
        if dept is not None:
            dept.is_active = False                      # employees / offers may point at it: retired, not removed
            db.commit()
            count("departments (deactivated)")
    return done


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--org", type=int, default=None, help="one organization id")
    parser.add_argument("--dry-run", action="store_true", help="report only (the default)")
    parser.add_argument("--delete-test-records", action="store_true", help="QA tenants only (HR_DEBUG=true): remove the rows")
    args = parser.parse_args()
    if args.delete_test_records and args.org is None:
        raise SystemExit("--delete-test-records needs --org <id>.")
    from app.database import SessionLocal
    db = SessionLocal()
    try:
        findings = find(db, args.org)
        current = object()
        for f in findings:
            if f["organization_id"] != current:
                current = f["organization_id"]
                print(f"\norganization {current}")
            print(f"  {f['table']:<26} id={f['id']:<6} {f['field']:<15} {f['value']!r:<32} {f['message']}")
        print(f"\n{len(findings)} invalid value(s).")
        if args.delete_test_records and not args.dry_run:
            print("removed:", delete_test_records(db, args.org, findings))
    finally:
        db.close()


if __name__ == "__main__":
    main()
