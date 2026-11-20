"""The whitelisted context a rule's conditions and actions can see (ZHR-DOCS-ARCH-001 §15.1).

`data.*` is the event payload (ids only). `employee.*`, `category.*` and `org.*` are looked up here, from ids in the payload,
and only these fields are exposed: no names, contact details or identity numbers.
"""
from datetime import date
from typing import Optional

from sqlalchemy.orm import Session


def _employee_ctx(db: Session, organization_id: int, employee_id: Optional[int]) -> dict:
    if not employee_id:
        return {}
    from app.modules.employee.models import Employee
    emp = (db.query(Employee).filter(Employee.id == employee_id, Employee.organization_id == organization_id).first())
    if emp is None:
        return {}
    role = getattr(emp.role, "value", emp.role)
    joined = getattr(emp, "date_of_joining", None)
    status = getattr(emp.status, "value", emp.status)
    emp_type = getattr(getattr(emp, "employment_type", None), "value", getattr(emp, "employment_type", None))
    return {
        "id": emp.id, "role": role, "department_id": getattr(emp, "department_id", None),
        "designation_id": getattr(emp, "designation_id", None), "employment_type": emp_type,
        "location_id": getattr(emp, "location_id", None), "status": status, "is_active": bool(emp.is_active),
        "days_since_joining": (date.today() - joined).days if isinstance(joined, date) else None,
    }


def _category_ctx(db: Session, organization_id: int, key: Optional[str]) -> dict:
    if not key:
        return {}
    from app.modules.hr.documents.models import HrEmployeeDocumentCategory
    cat = (db.query(HrEmployeeDocumentCategory)
           .filter(HrEmployeeDocumentCategory.organization_id == organization_id, HrEmployeeDocumentCategory.key == key)
           .first())
    if cat is None:
        return {"key": key}
    return {"key": cat.key, "is_required": bool(cat.is_required), "uploader": cat.uploader}


def build_context(db: Session, envelope: dict) -> dict:
    org = envelope.get("organization_id")
    data = dict(envelope.get("data") or {})
    employee_id = data.get("employee_id") or data.get("recipient_employee_id")
    return {
        "event": {"id": envelope.get("id"), "type": envelope.get("type"), "created_at": envelope.get("created_at")},
        "data": data,
        "employee": _employee_ctx(db, org, employee_id),
        "category": _category_ctx(db, org, data.get("category_key")),
        "org": {"id": org},
    }
