"""Employer legal entities, authorised signatories and worker jurisdiction facts.

* Organization admins manage entities and signatories; HR admins can read them. Every change is written to the organization
  activity log.
* A signatory's appointment is approved by someone other than the signatory.
* Worker jurisdiction facts (work country/region/city, employing entity, worker category, contract end date) are edited by
  HR only, and every change is written to employee_history.
* Nothing is ever invented: the default entity created by the migration copies only what the organization record holds, and
  `profile_gaps` tells the admin what is still missing.
"""
from __future__ import annotations

from datetime import date, datetime
from typing import Optional

from fastapi import HTTPException

from app.core import business_ids, regions
from app.modules.doc_templates import access, registry
from app.modules.doc_templates.models import AuthorisedSignatory, EmployerEntity

ENTITY_FIELDS = ("legal_name", "trading_name", "registration_type", "registration_number", "tax_id", "country", "region", "city",
                 "postal_code", "address_lines", "phone", "email", "logo_file")
JURISDICTION_FIELDS = ("work_country", "work_region", "work_city", "employing_entity_id", "worker_category", "contract_end_date")


def _audit(db, actor, action_type, entity_type, entity_id, target_name, changes=None):
    try:
        from app.modules.super_admin.activity_service import record_activity
        record_activity(db, action_type=action_type, actor=actor, organization_id=actor.organization_id, entity_type=entity_type,
                        entity_id=entity_id, target_name=target_name, changes=changes or None, commit=True)
    except Exception:                                    # the activity log must never undo the change itself
        pass


def profile_gaps(e: EmployerEntity) -> list[str]:
    gaps = []
    for key, label in (("legal_name", "legal name"), ("country", "country"), ("address_lines", "registered address"),
                       ("registration_number", "registration number")):
        if not getattr(e, key):
            gaps.append(label)
    return gaps


def serialize_entity(e: EmployerEntity) -> dict:
    return {**{k: getattr(e, k) for k in ("id",) + ENTITY_FIELDS + ("is_default", "status", "created_at", "updated_at")},
            "country_name": regions.country_name(e.country) if e.country else None,
            "registration_label": business_ids.id_type(e.country, e.registration_type).get("label") if e.registration_type else None,
            "profile_gaps": profile_gaps(e)}


def _clean_entity(data: dict) -> dict:
    out = {k: data[k] for k in ENTITY_FIELDS if k in data}
    if "country" in out:
        c = (out["country"] or "").upper() or None
        if c and not regions.country_name(c):
            raise HTTPException(422, "Choose a valid ISO country code.")
        out["country"] = c
    if out.get("address_lines") is not None:
        lines = out["address_lines"]
        if isinstance(lines, str):
            lines = [l for l in lines.splitlines()]
        out["address_lines"] = [str(l).strip()[:200] for l in lines if str(l).strip()][:6]
    for k in ("legal_name", "trading_name", "registration_number", "tax_id", "city", "postal_code", "phone", "email", "region"):
        if k in out and isinstance(out[k], str):
            out[k] = out[k].strip() or None
    return out


def _check_registration(country, rtype, number):
    if not number:
        return
    if rtype and not any(i["key"] == rtype for i in business_ids.format_for(country)["ids"]):
        raise HTTPException(422, f"{rtype} is not a registration type used in {country or 'this country'}.")
    problem = business_ids.validate_id(country, rtype, number)
    if problem:
        raise HTTPException(422, problem)


def list_entities(db, actor) -> list[dict]:
    access.require_hr(actor)
    rows = db.query(EmployerEntity).filter(EmployerEntity.organization_id == actor.organization_id) \
        .order_by(EmployerEntity.is_default.desc(), EmployerEntity.id).all()
    return [serialize_entity(e) for e in rows]


def get_entity(db, actor, entity_id: int) -> EmployerEntity:
    e = db.get(EmployerEntity, entity_id)
    if e is None or e.organization_id != actor.organization_id:
        raise HTTPException(404, "Legal entity not found")
    return e


def create_entity(db, actor, data: dict) -> EmployerEntity:
    access.require_org_admin(actor)
    clean = _clean_entity(data)
    if not clean.get("legal_name"):
        raise HTTPException(422, "The legal name is required.")
    _check_registration(clean.get("country"), clean.get("registration_type"), clean.get("registration_number"))
    first = db.query(EmployerEntity).filter(EmployerEntity.organization_id == actor.organization_id).count() == 0
    e = EmployerEntity(organization_id=actor.organization_id, created_by=actor.id, status="active",
                       is_default=bool(data.get("is_default")) or first, **clean)
    if e.is_default:
        _clear_default(db, actor.organization_id)
    db.add(e)
    db.commit()
    _audit(db, actor, "legal_entity.created", "EmployerEntity", e.id, e.legal_name)
    return e


def update_entity(db, actor, e: EmployerEntity, data: dict) -> EmployerEntity:
    access.require_org_admin(actor)
    clean = _clean_entity(data)
    if "legal_name" in clean and not clean["legal_name"]:
        raise HTTPException(422, "The legal name cannot be empty.")
    _check_registration(clean.get("country", e.country), clean.get("registration_type", e.registration_type),
                        clean.get("registration_number", e.registration_number))
    changes = []
    for k, v in clean.items():
        if getattr(e, k) != v:
            changes.append({"field": k, "before": getattr(e, k), "after": v})
            setattr(e, k, v)
    db.commit()
    _audit(db, actor, "legal_entity.updated", "EmployerEntity", e.id, e.legal_name, changes)
    return e


def _clear_default(db, organization_id):
    db.query(EmployerEntity).filter(EmployerEntity.organization_id == organization_id, EmployerEntity.is_default.is_(True)) \
        .update({EmployerEntity.is_default: False}, synchronize_session=False)


def set_default(db, actor, e: EmployerEntity) -> EmployerEntity:
    access.require_org_admin(actor)
    if e.status != "active":
        raise HTTPException(409, "Only an active entity can be the default.")
    _clear_default(db, actor.organization_id)
    e.is_default = True
    db.commit()
    _audit(db, actor, "legal_entity.default_set", "EmployerEntity", e.id, e.legal_name)
    return e


def set_status(db, actor, e: EmployerEntity, status: str) -> EmployerEntity:
    access.require_org_admin(actor)
    if status not in ("active", "inactive"):
        raise HTTPException(422, "Status must be active or inactive.")
    e.status = status
    if status == "inactive":
        e.is_default = False
    db.commit()
    _audit(db, actor, f"legal_entity.{'reactivated' if status == 'active' else 'deactivated'}", "EmployerEntity", e.id, e.legal_name)
    return e


# ── signatories ──────────────────────────────────────────────────────────────────────────────────────────────────────

def serialize_signatory(db, s: AuthorisedSignatory) -> dict:
    from app.modules.employee.models import Employee
    emp = db.get(Employee, s.employee_id)
    return {"id": s.id, "entity_id": s.entity_id, "employee_id": s.employee_id,
            "employee_name": f"{emp.first_name} {emp.last_name}" if emp else None, "signatory_title": s.signatory_title,
            "authority_scope": s.authority_scope, "max_risk_level": s.max_risk_level, "valid_from": s.valid_from,
            "valid_to": s.valid_to, "approved_by": s.approved_by, "status": s.status,
            "in_force": s.status == "active" and s.valid_from <= date.today() and (s.valid_to is None or s.valid_to >= date.today())}


def _clean_scope(scope) -> list:
    scope = scope or ["ALL"]
    if not isinstance(scope, list):
        raise HTTPException(422, "authority_scope must be a list.")
    out = []
    for item in scope:
        item = str(item).strip().upper()
        if item == "ALL" or item in registry.FAMILIES or any(e["id"] == item for e in registry.load_register()):
            out.append(item)
        else:
            raise HTTPException(422, f"Unknown template or family in authority scope: {item}")
    return sorted(set(out))


def list_signatories(db, actor, entity_id: Optional[int] = None) -> list[dict]:
    access.require_hr(actor)
    q = db.query(AuthorisedSignatory).filter(AuthorisedSignatory.organization_id == actor.organization_id)
    if entity_id:
        q = q.filter(AuthorisedSignatory.entity_id == entity_id)
    return [serialize_signatory(db, s) for s in q.order_by(AuthorisedSignatory.id).all()]


def create_signatory(db, actor, data: dict) -> AuthorisedSignatory:
    access.require_org_admin(actor)
    from app.modules.employee.models import Employee
    entity = get_entity(db, actor, int(data.get("entity_id") or 0))
    emp = db.get(Employee, int(data.get("employee_id") or 0))
    if emp is None or emp.organization_id != actor.organization_id:
        raise HTTPException(404, "Employee not found")
    if emp.id == actor.id:
        raise HTTPException(403, {"code": "SEPARATION_OF_DUTIES",
                                  "message": "Another organization admin must appoint you as a signatory."})
    risk = data.get("max_risk_level") or "L1"
    if risk not in registry.RISKS:
        raise HTTPException(422, "max_risk_level must be L1, L2 or L3.")
    title = (data.get("signatory_title") or "").strip()
    if not title:
        raise HTTPException(422, "The signatory title is required.")
    valid_from = data.get("valid_from") or date.today()
    valid_to = data.get("valid_to")
    if valid_to and valid_to < valid_from:
        raise HTTPException(422, "valid_to must be after valid_from.")
    s = AuthorisedSignatory(organization_id=actor.organization_id, entity_id=entity.id, employee_id=emp.id, signatory_title=title[:150],
                            authority_scope=_clean_scope(data.get("authority_scope")), max_risk_level=risk, valid_from=valid_from,
                            valid_to=valid_to, approved_by=actor.id, status="active", created_by=actor.id)
    db.add(s)
    db.commit()
    _audit(db, actor, "signatory.appointed", "AuthorisedSignatory", s.id, f"{emp.first_name} {emp.last_name}")
    return s


def update_signatory(db, actor, s: AuthorisedSignatory, data: dict) -> AuthorisedSignatory:
    access.require_org_admin(actor)
    if s.employee_id == actor.id:
        raise HTTPException(403, {"code": "SEPARATION_OF_DUTIES", "message": "You cannot change your own signing authority."})
    if "authority_scope" in data:
        s.authority_scope = _clean_scope(data["authority_scope"])
    if data.get("max_risk_level"):
        if data["max_risk_level"] not in registry.RISKS:
            raise HTTPException(422, "max_risk_level must be L1, L2 or L3.")
        s.max_risk_level = data["max_risk_level"]
    for k in ("signatory_title", "valid_to"):
        if k in data:
            setattr(s, k, data[k])
    if data.get("status") in ("active", "revoked"):
        s.status = data["status"]
    s.approved_by = actor.id
    db.commit()
    _audit(db, actor, "signatory.updated", "AuthorisedSignatory", s.id, s.signatory_title)
    return s


# ── worker jurisdiction facts ────────────────────────────────────────────────────────────────────────────────────────

def normalise_region(country: Optional[str], value: Optional[str]) -> Optional[str]:
    """Regions are stored by name, exactly as core/business_ids.REGIONS spells them (the repo has no subdivision codes).
    For a country with a known list the value must be on it (case-insensitive); otherwise any short name is kept."""
    v = " ".join((value or "").split())[:100] or None
    if v is None:
        return None
    known = business_ids.REGIONS.get((country or "").upper())
    if known is None:
        return v
    match = next((k for k in known if k.casefold() == v.casefold()), None)
    if match is None:
        raise HTTPException(422, f"{v} is not a region of {country}.")
    return match


def serialize_jurisdiction(emp) -> dict:
    return {"employee_id": emp.id, **{k: getattr(emp, k) for k in JURISDICTION_FIELDS},
            "work_country_name": regions.country_name(emp.work_country) if emp.work_country else None}


def update_jurisdiction(db, actor, emp, data: dict) -> dict:
    """HR-only edit of where someone works. Each changed field becomes one employee_history row."""
    from app.modules.hr.models import EmployeeHistory
    access.require_hr(actor)
    if emp.organization_id != actor.organization_id:
        raise HTTPException(404, "Employee not found")
    clean: dict = {}
    if "work_country" in data:
        c = (data["work_country"] or "").upper() or None
        if c and not regions.country_name(c):
            raise HTTPException(422, "Choose a valid ISO country code.")
        clean["work_country"] = c
    if "work_region" in data:
        clean["work_region"] = normalise_region(clean.get("work_country", emp.work_country), data["work_region"])
    if "work_city" in data:
        clean["work_city"] = (data["work_city"] or "").strip()[:100] or None
    if "employing_entity_id" in data:
        eid = data["employing_entity_id"]
        if eid:
            e = db.get(EmployerEntity, int(eid))
            if e is None or e.organization_id != actor.organization_id or e.status != "active":
                raise HTTPException(422, "Choose an active legal entity of your organization.")
        clean["employing_entity_id"] = eid or None
    if "worker_category" in data:
        wc = data["worker_category"] or None
        if wc and wc not in registry.WORKER_CATEGORIES:
            raise HTTPException(422, f"worker_category must be one of {', '.join(registry.WORKER_CATEGORIES)}.")
        clean["worker_category"] = wc
    if "contract_end_date" in data:
        clean["contract_end_date"] = data["contract_end_date"] or None
    reason = (data.get("change_reason") or "").strip()[:500] or "Jurisdiction facts updated"
    for k, v in clean.items():
        old = getattr(emp, k)
        if old != v:
            db.add(EmployeeHistory(employee_id=emp.id, organization_id=emp.organization_id, field_name=k,
                                   old_value=None if old is None else str(old), new_value=None if v is None else str(v),
                                   changed_by=actor.id, change_reason=reason))
            setattr(emp, k, v)
    db.commit()
    return serialize_jurisdiction(emp)


def jurisdiction_gaps(db, actor) -> dict:
    """What stops documents being generated: people with no work country, entities with an incomplete profile."""
    from app.modules.employee.models import Employee, EmployeeStatus
    access.require_hr(actor)
    missing = (db.query(Employee).filter(Employee.organization_id == actor.organization_id, Employee.work_country.is_(None),
                                         Employee.status.notin_([EmployeeStatus.TERMINATED, EmployeeStatus.ARCHIVED]))
               .order_by(Employee.id).limit(500).all())
    entities = db.query(EmployerEntity).filter(EmployerEntity.organization_id == actor.organization_id).all()
    return {
        "employees_without_work_country": [{"id": e.id, "name": f"{e.first_name} {e.last_name}", "employee_code": e.employee_code,
                                            "recorded_country": e.country} for e in missing],
        "entities_with_gaps": [{"id": e.id, "legal_name": e.legal_name, "gaps": profile_gaps(e)} for e in entities if profile_gaps(e)],
        "has_default_entity": any(e.is_default and e.status == "active" for e in entities),
    }
