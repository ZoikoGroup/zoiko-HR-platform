"""Settings › "Missing details": every value the organisation's onboarding documents still need, asked for in one place.

After "Set up with AI" (or at any time) the package is checked for every engagement profile exactly as a send would check it
(onboarding_setup_check.test_package, a sample hire, nothing saved). Each organisation-wide gap becomes one item with the
inputs that fill it:

    profile      a Company Profile field (validated and saved by company_profile.save_profile)
    package      an offer-package setting that is not part of the Company Profile (leave entitlement, benefits reference …)
    clause_token a merge field used inside clause wording (Company Profile › Clause details)
    clause       the clause wording itself (Settings › Offer package & clauses; saved with the organisation's attestation)

Gaps with no direct input (a role profile, a countersigner, a field the organisation has not defined) carry a link to the
section that fills them. Values each new hire provides are not asked here – except where Settings holds a default for them
(the default work location), which is offered as optional.

Saving writes through the same validated paths as the individual Settings cards and returns the refreshed list.
"""
from __future__ import annotations

import logging
from typing import Optional

from fastapi import HTTPException

logger = logging.getLogger("zoiko.onboarding.settings_gaps")

# document field → the setting fields that fill it (target, key)
FIELD_INPUTS: dict[str, list[tuple[str, str]]] = {
    "employer.legal_name": [("profile", "legal_name")],
    "employer.registered_address": [("profile", "address_line1"), ("profile", "city"), ("profile", "state"),
                                    ("profile", "postal_code"), ("profile", "country")],
    "employer.signatory_name": [("profile", "signatory_name")],
    "employer.signatory_title": [("profile", "signatory_title")],
    "employer.hr_contact": [("profile", "hr_contact_name"), ("profile", "hr_contact_email")],
    "employment.pay_frequency": [("profile", "pay_frequency")],
    "employment.country": [("profile", "jurisdiction_country")],
    "employment.employer_notice_text": [("profile", "employer_notice_value"), ("profile", "employer_notice_unit")],
    "employment.notice_text": [("profile", "notice_period_value"), ("profile", "notice_period_unit")],
    "employment.leave_entitlement": [("package", "leave_entitlement")],
    "employment.benefits_reference": [("package", "benefits_reference")],
    "agreement.post_employment_period": [("package", "post_employment_period")],
    "kpi.review_cycle": [("package", "kpi_review_cycle")],
    "company.legal_name": [("profile", "legal_name")],
    "company.short_name": [("profile", "short_name")],
    "company.group_name": [("profile", "group_name")],
    "company.group_name_caps": [("profile", "group_name")],
    "company.cin": [("profile", "cin")],
    "company.gstin": [("profile", "gstin")],
    "company.phone": [("profile", "phone")],
    "company.website": [("profile", "website")],
    "company.reports_email": [("profile", "reports_email")],
    "company.onboarding_return_email": [("profile", "hr_contact_email")],
    "company.jurisdiction_city": [("profile", "jurisdiction_city")],
    "company.sign_off": [("profile", "signatory_sign_off")],
    "company.confidentiality_duration": [("profile", "nda_confidentiality_duration")],
    "company.non_solicit_months": [("profile", "non_solicit_post_termination_months")],
    "company.nda_non_compete_months": [("profile", "nda_non_compete_months")],
    "company.nda_non_solicit_months": [("profile", "nda_non_solicit_months")],
    "company.task_system": [("profile", "task_system_name")],
    "company.time_tracking_tool": [("profile", "time_tracking_tool_name")],
    "company.copyright_line": [("profile", "copyright_holder")],
    "company.brands": [("profile", "brands")],
    "company.brand_label": [("profile", "brand_label")],
    "company.velocity_motto": [("profile", "velocity_motto")],
    "company.velocity_deadline": [("profile", "velocity_deadline_text")],
    "company.affidavit_hours": [("profile", "affidavit_submission_hours")],
    "company.affidavit_stamp_note": [("profile", "affidavit_stamp_paper_note")],
    "offer.compliance_documents": [("profile", "compliance_documents")],
}
# values each hire provides that Settings can give a default for (offered, never required here)
HIRE_DEFAULTS: dict[str, list[tuple[str, str]]] = {
    "employment.work_location": [("profile", "default_work_location")],
    "employment.employment_type": [("profile", "default_employment_type")],
}
PACKAGE_LABELS = {"leave_entitlement": ("Leave entitlement", "e.g. 24 days a year plus public holidays"),
                  "benefits_reference": ("Benefits reference", "e.g. the Benefits Schedule in the Employee Handbook"),
                  "post_employment_period": ("Period after employment ends", "e.g. two years"),
                  "kpi_review_cycle": ("KPI review cycle", "e.g. monthly")}


def _profile_spec() -> dict:
    from app.modules.hr import company_profile as CP
    return {f["key"]: f for f in CP.fields_spec()}


def _input(target: str, key: str, profile: dict, cfg: dict, spec: dict) -> Optional[dict]:
    if target == "profile":
        f = spec.get(key)
        if f is None:
            return None
        return {"target": "profile", "key": key, "label": f["label"], "kind": f["kind"], "options": f.get("options"),
                "hint": f.get("hint"), "value": profile.get(key), "field_id": f"cp-{key}"}
    if target == "package":
        label, hint = PACKAGE_LABELS.get(key, (key.replace("_", " ").capitalize(), None))
        return {"target": "package", "key": key, "label": label, "kind": "text", "options": None, "hint": hint,
                "value": cfg.get(key), "field_id": f"op-{key}"}
    return None


def _clause_token_input(token: str, profile: dict) -> dict:
    from app.modules.hr import onboarding_clause_tokens as T
    return {"target": "clause_token", "key": token, "label": T.label(token), "kind": "text", "options": None,
            "hint": "Used inside your clause wording", "value": profile.get(T.profile_key(token)),
            "field_id": f"cp-{T.profile_key(token)}"}


def gaps(db, organization_id: int) -> dict:
    """Every organisation-wide gap of the package, over all engagement profiles, with the inputs that fill it."""
    from app.modules.hr import company_profile as CP
    from app.modules.hr import onboarding_package as P
    from app.modules.hr import onboarding_package_content as C
    from app.modules.hr import onboarding_profiles as PR
    from app.modules.hr import onboarding_setup_check as SC
    profile = CP.get_profile(db, organization_id)
    cfg = P.get_config(db, organization_id)
    spec = _profile_spec()
    items: dict = {}
    clauses: dict = {}
    defaults: dict = {}
    docs_total, docs_blocked = set(), set()
    engs = [p["slug"] for p in PR.engagement_profiles(db, organization_id) if p.get("slug")] or [None]
    for slug in engs:
        tp = SC.test_package(db, organization_id, slug, None)
        for d in tp["documents"]:
            docs_total.add(d["category"])
            if not d["ready"]:
                docs_blocked.add(d["category"])
            for g in d["settings_gaps"]:
                it = items.setdefault(g["key"], {"key": g["key"], "meaning": g["meaning"], "source": g.get("source"),
                                                 "settings_path": g.get("settings_path"), "documents": [], "inputs": []})
                if d["title"] not in it["documents"]:
                    it["documents"].append(d["title"])
            for c in d["missing_clauses"]:
                cl = clauses.setdefault(c["key"], {"key": c["key"], "title": c["title"], "documents": [], "field_id": f"clause-{c['key']}",
                                                    "drafting_note": (C.CLAUSES.get(c["key"]) or ("", ""))[1]})
                if d["title"] not in cl["documents"]:
                    cl["documents"].append(d["title"])
            for g in d["per_hire"]:
                if g["key"] in HIRE_DEFAULTS:
                    df = defaults.setdefault(g["key"], {"key": g["key"], "meaning": g["meaning"], "documents": [], "inputs": []})
                    if d["title"] not in df["documents"]:
                        df["documents"].append(d["title"])
    for key, it in items.items():
        if key.startswith("clause."):
            it["inputs"] = [_clause_token_input(key.split(".", 1)[1], profile)]
        else:
            it["inputs"] = [x for x in (_input(t, k, profile, cfg, spec) for t, k in FIELD_INPUTS.get(key, [])) if x]
    for key, df in defaults.items():
        df["inputs"] = [x for x in (_input(t, k, profile, cfg, spec) for t, k in HIRE_DEFAULTS[key]) if x]
    fillable = [i for i in items.values() if i["inputs"]]
    linked = [i for i in items.values() if not i["inputs"]]
    return {"fields": fillable, "links": linked, "clauses": list(clauses.values()), "hire_defaults": list(defaults.values()),
            "documents_total": len(docs_total), "documents_ready": len(docs_total - docs_blocked),
            "complete": not items and not clauses}


def save(db, actor, data: dict) -> dict:
    """Save what was typed in the Missing details card. `data`: {profile: {...}, package: {...}, clause_tokens: {...},
    clauses: {key: wording}}. Every part is validated by the same code as its own Settings card."""
    from app.modules.doc_templates import access
    from app.modules.hr import company_profile as CP
    from app.modules.hr import onboarding_clause_tokens as T
    from app.modules.hr import onboarding_package as P
    access.require_hr(actor)
    data = data or {}
    if not isinstance(data, dict):
        raise HTTPException(422, "Send an object.")
    profile_data = dict(data.get("profile") or {})
    for token, value in (data.get("clause_tokens") or {}).items():
        if token not in T.CATALOG:
            raise HTTPException(422, f"Unknown clause detail {token}.")
        profile_data[T.profile_key(token)] = value
    profile_data = {k: v for k, v in profile_data.items() if v not in (None, "") or k in (data.get("profile") or {})}
    if profile_data:
        CP.save_profile(db, actor, profile_data, partial_keys=set(profile_data))
    package = {k: v for k, v in (data.get("package") or {}).items() if k in PACKAGE_LABELS}
    wording = {k: str(v or "").strip() for k, v in (data.get("clauses") or {}).items() if str(v or "").strip()}
    if package or wording:
        from app.modules.hr import onboarding_package_content as C
        unknown = [k for k in wording if k not in C.CLAUSES]
        if unknown:
            raise HTTPException(422, f"Unknown clause {', '.join(unknown)}.")
        current = P.get_config(db, actor.organization_id)
        clauses = {k: dict(v) for k, v in (current.get("clauses") or {}).items() if isinstance(v, dict)}
        for k, text in wording.items():
            clauses[k] = {**clauses.get(k, {}), "text": text, "not_applicable": False,
                          "counsel_reference": clauses.get(k, {}).get("counsel_reference")
                          or "Entered by the organisation admin in Settings › Missing details"}
        payload = dict(package)
        if wording:
            payload["clauses"] = clauses
        P.save_config(db, actor, payload)
    from app.modules.hr import onboarding_setup_check as SC
    SC._status_cache.clear()                 # the setup score reflects the new values at once
    return gaps(db, actor.organization_id)
