"""Retention policies per document category (ZHR-DOCS-ARCH-001 §12.1 retention sweep, Phase 7).

Default when no policy exists: keep everything. Archive is the normal action; "delete" may be chosen only by the Org Admin
(decision Q-D), and even then the sweep only removes a file `review_days` after telling HR, never one on legal hold.
"""
from datetime import datetime
from typing import Optional

from sqlalchemy.orm import Session

from app.modules.hr.documents import audit_service, errors
from app.modules.hr.documents.automation.models import RetentionPolicy
from app.modules.hr.documents.models import HrCompanyDocumentCategory, HrEmployeeDocumentCategory
from app.modules.hr.documents.permissions import ORG_ADMIN, role_of

CLOCKS = ("from_upload", "from_exit", "from_expiry")
ACTIONS = ("flag", "archive", "delete")


def _categories(db: Session, org: int) -> list[dict]:
    out = [{"scope": "employee", "key": c.key, "name": c.name}
           for c in db.query(HrEmployeeDocumentCategory).filter(HrEmployeeDocumentCategory.organization_id == org)
           .order_by(HrEmployeeDocumentCategory.sort_order)]
    out += [{"scope": "company", "key": c.key, "name": c.name}
            for c in db.query(HrCompanyDocumentCategory).filter(HrCompanyDocumentCategory.organization_id == org)
            .order_by(HrCompanyDocumentCategory.sort_order)]
    return out


def serialize(p: Optional[RetentionPolicy]) -> Optional[dict]:
    if p is None:
        return None
    return {"retain_years": p.retain_years, "clock": p.clock, "action": p.action, "review_days": p.review_days,
            "updated_at": p.updated_at.isoformat() if p.updated_at else None}


def list_policies(db: Session, actor) -> dict:
    org = actor.organization_id
    have = {(p.scope, p.category_key): p for p in db.query(RetentionPolicy).filter(RetentionPolicy.organization_id == org)}
    return {"items": [{**c, "policy": serialize(have.get((c["scope"], c["key"])))} for c in _categories(db, org)],
            "clocks": list(CLOCKS), "actions": list(ACTIONS), "can_delete": role_of(actor) == ORG_ADMIN}


def put_policy(db: Session, actor, scope: str, key: str, *, retain_years: int, clock: str, action: str,
               review_days: int = 30) -> dict:
    org = actor.organization_id
    if scope not in ("employee", "company") or not any(c["scope"] == scope and c["key"] == key for c in _categories(db, org)):
        raise errors.not_found("Category")
    if clock not in CLOCKS:
        raise errors.invalid("Choose when the retention period starts.", field="clock")
    if action not in ACTIONS:
        raise errors.invalid("Choose flag, archive or delete.", field="action")
    if clock == "from_exit" and scope != "employee":
        raise errors.invalid("Company documents have no exit date.", field="clock")
    if not 1 <= retain_years <= 100 or not 7 <= review_days <= 365:
        raise errors.invalid("Keep files 1–100 years, with a review window of 7–365 days.", field="retain_years")
    if action == "delete" and role_of(actor) != ORG_ADMIN:
        raise errors.forbidden("Only the Org Admin can choose to delete files at the end of the retention period.")
    row = (db.query(RetentionPolicy).filter(RetentionPolicy.organization_id == org, RetentionPolicy.scope == scope,
                                            RetentionPolicy.category_key == key).first())
    before = serialize(row)
    if row is None:
        row = RetentionPolicy(organization_id=org, scope=scope, category_key=key, retain_years=retain_years, clock=clock)
        db.add(row)
    row.retain_years, row.clock, row.action, row.review_days = retain_years, clock, action, review_days
    row.updated_by, row.updated_at = actor.id, datetime.utcnow()
    db.flush()
    audit_service.record(db, org_id=org, actor=actor, action="retention_policy_saved", target_type="retention_policy",
                         target_id=row.id, before=before, after={"scope": scope, "key": key, **serialize(row)})
    db.commit()
    return serialize(row)


def delete_policy(db: Session, actor, scope: str, key: str) -> None:
    org = actor.organization_id
    row = (db.query(RetentionPolicy).filter(RetentionPolicy.organization_id == org, RetentionPolicy.scope == scope,
                                            RetentionPolicy.category_key == key).first())
    if row is None:
        return
    if row.action == "delete" and role_of(actor) != ORG_ADMIN:
        raise errors.forbidden("Only the Org Admin can change a policy that deletes files.")
    row_id, before = row.id, serialize(row)
    db.delete(row)
    audit_service.record(db, org_id=org, actor=actor, action="retention_policy_removed", target_type="retention_policy",
                         target_id=row_id, before=before)
    db.commit()
