"""Employee and company document categories: seeding the system set per organization, lookups."""
from typing import Optional

from sqlalchemy.orm import Session

from app.modules.hr.documents.constants import SYSTEM_COMPANY_CATEGORIES, SYSTEM_EMPLOYEE_CATEGORIES
from app.modules.hr.documents.models import HrCompanyDocumentCategory, HrEmployeeDocumentCategory


def seed_org_categories(db: Session, organization_id: int) -> tuple[int, int]:
    """Create any missing system category for one organization (idempotent). Returns (employee_added, company_added).

    Existing rows are never changed: an organization's edits (required flag, names) survive a re-seed."""
    have_emp = {k for (k,) in db.query(HrEmployeeDocumentCategory.key)
                .filter(HrEmployeeDocumentCategory.organization_id == organization_id)}
    have_comp = {k for (k,) in db.query(HrCompanyDocumentCategory.key)
                 .filter(HrCompanyDocumentCategory.organization_id == organization_id)}
    added_emp = added_comp = 0
    for key, name, required, uploader, expiry, sensitivity, human, order in SYSTEM_EMPLOYEE_CATEGORIES:
        if key in have_emp:
            continue
        db.add(HrEmployeeDocumentCategory(
            organization_id=organization_id, key=key, name=name, is_required=required, uploader=uploader,
            requires_expiry=expiry, sensitivity=sensitivity, human_approval_required=human, sort_order=order,
            is_system=True, is_active=True))
        added_emp += 1
    for key, name, icon, needs_approval, ack, order in SYSTEM_COMPANY_CATEGORIES:
        if key in have_comp:
            continue
        db.add(HrCompanyDocumentCategory(
            organization_id=organization_id, key=key, name=name, icon=icon, requires_approval=needs_approval,
            default_require_ack=ack, sort_order=order, is_system=True, is_active=True))
        added_comp += 1
    if added_emp or added_comp:
        db.flush()
    return added_emp, added_comp


def employee_category_by_key(db: Session, organization_id: int, key: str) -> Optional[HrEmployeeDocumentCategory]:
    return (db.query(HrEmployeeDocumentCategory)
            .filter(HrEmployeeDocumentCategory.organization_id == organization_id, HrEmployeeDocumentCategory.key == key)
            .first())


def company_category_by_key(db: Session, organization_id: int, key: str) -> Optional[HrCompanyDocumentCategory]:
    return (db.query(HrCompanyDocumentCategory)
            .filter(HrCompanyDocumentCategory.organization_id == organization_id, HrCompanyDocumentCategory.key == key)
            .first())
