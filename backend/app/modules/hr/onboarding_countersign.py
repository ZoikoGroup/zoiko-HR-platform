"""Employer countersignature on onboarding package documents.

A package document whose signers include "employer" (Settings › Documents in your onboarding package › Who signs) is issued
as SIGN_BOTH: the new hire signs first, then an authorised signatory signs for the employer (from their "Documents waiting
for me" list, with OTP for high-risk documents). It is executed – and counts as complete – only when both have signed.

Who may countersign is the engine's own rule (approvals.signatory_covers): an active authorised signatory of the
organisation's default employer entity whose authority covers the document's family and legal risk. This module lets an
admin name those people for onboarding documents without the legal-entity screens:

* the default employer entity is created from the Company Profile when the organisation has none;
* each countersigner is one of the organisation's admins or HR admins; their authority is extended with the package
  families (and the organisation's own template family) up to L3. Other authority they hold is kept.

A document that needs the employer's signature is held (not sent) while nobody can countersign it, so a new hire is never
asked to sign something the employer cannot complete.
"""
from __future__ import annotations

import logging
from datetime import date
from typing import Optional

from fastapi import HTTPException

from app.modules.doc_templates.models import AuthorisedSignatory, EmployerEntity

logger = logging.getLogger("zoiko.onboarding.countersign")

GAP_KEY = "employer.countersigner"
MAX_RISK = "L3"


def package_families(organization_id: int) -> list[str]:
    from app.modules.hr import onboarding_package_content as C
    fams = sorted({d["family_id"] for d in C.documents()})
    return fams + [f"ORG{organization_id}"[:10]]


def default_entity(db, organization_id: int) -> Optional[EmployerEntity]:
    from app.modules.doc_templates import preflight
    return preflight.default_entity(db, organization_id)


def _ensure_entity(db, actor) -> EmployerEntity:
    e = default_entity(db, actor.organization_id)
    if e is not None:
        return e
    from app.modules.hr import company_profile as CP
    from app.modules.hr import onboarding_package_org as ORG
    profile = CP.get_profile(db, actor.organization_id)
    e = EmployerEntity(organization_id=actor.organization_id, is_default=True, status="active", created_by=actor.id,
                       legal_name=(profile.get("legal_name") or None), country=ORG._org_country(db, actor.organization_id),
                       email=profile.get("hr_contact_email") or None)
    db.add(e)
    db.flush()
    return e


def _covers(db, sig: AuthorisedSignatory, d: dict) -> bool:
    from app.modules.doc_templates import approvals
    return approvals.signatory_covers(sig, d.get("canonical_id") or d.get("template_id") or "", d.get("family_id") or "",
                                      d.get("risk") or "L1")


def _signatories(db, organization_id: int) -> list[AuthorisedSignatory]:
    e = default_entity(db, organization_id)
    if e is None:
        return []
    return (db.query(AuthorisedSignatory).filter(AuthorisedSignatory.organization_id == organization_id,
                                                 AuthorisedSignatory.entity_id == e.id,
                                                 AuthorisedSignatory.status == "active")
            .order_by(AuthorisedSignatory.id).all())


def needs_employer(d: dict) -> bool:
    return d.get("mode") == "SIGN" and "employer" in (d.get("party_signers") or [])


def can_countersign(db, organization_id: int, d: dict) -> bool:
    """Whether someone can sign `d` (a package document description) for the employer."""
    from app.modules.hr import onboarding_package as P
    sigs = P._cached(db, ("countersigners", organization_id), lambda: _signatories(db, organization_id))
    return any(_covers(db, s, d) for s in sigs)


def summary(db, organization_id: int) -> dict:
    from app.modules.employee.models import Employee
    from app.modules.hr import onboarding_package_content as C
    fams = set(package_families(organization_id))
    people = []
    for s in _signatories(db, organization_id):
        if not fams & set(s.authority_scope or []) and "ALL" not in (s.authority_scope or []):
            continue
        emp = db.get(Employee, s.employee_id)
        name = " ".join(p for p in (getattr(emp, "first_name", ""), getattr(emp, "last_name", "")) if p) if emp else ""
        covered = [d["title"] for d in C.documents() if _covers(db, s, {**d, "canonical_id": d["template_id"]})]
        people.append({"id": s.id, "employee_id": s.employee_id, "name": name or f"Employee {s.employee_id}",
                       "title": s.signatory_title, "max_risk": s.max_risk_level, "covers": covered})
    return {"signatories": people, "entity": bool(default_entity(db, organization_id))}


def candidates(db, organization_id: int) -> list[dict]:
    from app.modules.hr import offer_letter_setup as OLS
    return OLS._people(db, organization_id)


def add(db, actor, employee_id: int, title: str) -> dict:
    from app.modules.doc_templates import access
    access.require_hr(actor)
    org_id = actor.organization_id
    title = " ".join(str(title or "").split())[:150]
    if not title:
        raise HTTPException(422, "Give the countersigner's job title (it is printed under their signature).")
    if not any(p["id"] == employee_id for p in candidates(db, org_id)):
        raise HTTPException(422, "Choose the countersigner from your organisation's admins and HR admins.")
    e = _ensure_entity(db, actor)
    s = (db.query(AuthorisedSignatory).filter(AuthorisedSignatory.organization_id == org_id, AuthorisedSignatory.entity_id == e.id,
                                              AuthorisedSignatory.employee_id == employee_id,
                                              AuthorisedSignatory.status == "active").first())
    fams = package_families(org_id)
    if s is None:
        s = AuthorisedSignatory(organization_id=org_id, entity_id=e.id, employee_id=employee_id, signatory_title=title,
                                authority_scope=fams, max_risk_level=MAX_RISK, valid_from=date.today(),
                                approved_by=actor.id, status="active", created_by=actor.id)
        db.add(s)
    else:
        s.authority_scope = list(dict.fromkeys(list(s.authority_scope or []) + fams))
        s.max_risk_level = MAX_RISK
        s.signatory_title = title
    db.commit()
    from app.modules.hr import onboarding_package_org as ORG
    ORG.audit(db, actor, "onboarding_countersigner_added", {"employee_id": employee_id})
    return summary(db, org_id)


def remove(db, actor, signatory_id: int) -> dict:
    """The person no longer countersigns onboarding documents (authority for other documents is kept)."""
    from app.modules.doc_templates import access
    access.require_hr(actor)
    s = db.get(AuthorisedSignatory, signatory_id)
    if s is None or s.organization_id != actor.organization_id:
        raise HTTPException(404, "Countersigner not found.")
    fams = set(package_families(actor.organization_id))
    rest = [x for x in (s.authority_scope or []) if x not in fams]
    if rest:
        s.authority_scope = rest
    else:
        s.status = "inactive"
        s.valid_to = date.today()
    db.commit()
    from app.modules.hr import onboarding_package_org as ORG
    ORG.audit(db, actor, "onboarding_countersigner_removed", {"signatory_id": signatory_id})
    return summary(db, actor.organization_id)
