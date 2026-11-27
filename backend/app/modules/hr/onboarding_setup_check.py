"""Is this organisation ready to generate its onboarding documents? ("Test package" and the setup score.)

Test package
    Builds a sample new hire in memory (never saved: no row, no e-mail, no document number) for a chosen engagement and
    role profile, and checks every document of the organisation's package exactly as a real send would. Each document's
    gaps are split into
      * fix in Settings – organisation-wide values, clause wording, profiles, a countersigner (these block every hire);
      * typed per hire  – values HR or the new hire provides for each person (expected to be empty for a sample).
    A watermarked preview of each document is rendered with the per-hire values filled with "[sample]" text.

Setup score
    Company Profile → employment types & roles → documents → wording & values → countersignature → automation, each with
    its state and where to fix it. The Onboarding dashboard and Settings show it.
"""
from __future__ import annotations

import logging
from datetime import date, timedelta
from typing import Optional

from fastapi import HTTPException

from app.modules.hr.models import OnboardingNewHire

logger = logging.getLogger("zoiko.onboarding.setup_check")

SAMPLE_NAME = "Sample New Hire"
SAMPLE_EMAIL = "sample.new.hire@example.invalid"
SAMPLE_ID = 0                     # never a real row: every per-hire lookup by id finds nothing
SAMPLE_ADDRESS = "[sample] 1 Sample Street, Sample City"


def _per_hire_key(db, organization_id: int, key: str) -> bool:
    from app.modules.hr import onboarding_custom_fields as CF
    from app.modules.hr import onboarding_package as P
    if CF.is_custom_token(key):
        f = CF.field(db, organization_id, key)
        return f is not None and f.get("source") in ("hr", "candidate")
    return (key in P.HIRE_INPUT_FIELDS or key == P.ADDRESS_INPUT or key.startswith("worker.")
            or key in ("employment.start_date", "employment.position_title", "employment.department", "employment.reports_to"))


def _sample_hire(db, organization_id: int, engagement: Optional[str], role: Optional[str], fills: dict) -> OnboardingNewHire:
    from app.modules.hr import onboarding_package_org as ORG
    from app.modules.hr import onboarding_profiles as PR
    title = "Sample role"
    r = PR.role_for(db, organization_id, role, None) if role else None
    if r:
        title = r.get("title") or title
    eng = PR.engagement_for(db, organization_id, engagement) if engagement else None
    inputs = {k: v for k, v in fills.items() if not k.startswith("_portal:")}
    if engagement:
        inputs["engagement_profile_slug"] = engagement
    if role:
        inputs["role_profile_slug"] = role
    portal = {k.split(":", 1)[1]: v for k, v in fills.items() if k.startswith("_portal:")}
    hire = OnboardingNewHire(organization_id=organization_id, candidate_name=SAMPLE_NAME, email=SAMPLE_EMAIL, position=title,
                             joining_date=date.today() + timedelta(days=14), status="offer_accepted",
                             employment_type=(eng or {}).get("employment_type") or "full_time",
                             work_country=ORG._org_country(db, organization_id),
                             profile_details={"_package_inputs": inputs, "custom_fields": portal}, is_deleted=False)
    hire.id = SAMPLE_ID
    return hire


def _sample_value(db, organization_id: int, key: str, meaning: str):
    from app.modules.hr import onboarding_custom_fields as CF
    if CF.is_custom_token(key):
        f = CF.field(db, organization_id, key) or {}
        t = f.get("type")
        v = {"date": (date.today() + timedelta(days=14)).isoformat(), "number": "1", "money": "1000",
             "yes_no": "yes"}.get(t) or ((f.get("options") or [None])[0] if t == "choice" else f"[sample {meaning.lower()}]")
        if f.get("source") == "candidate":
            return "_portal:" + (f.get("portal_field") or f"custom_{f['key']}"), v
        return key, v
    if key == "employment.probation_months":
        return key, "3"
    if key == "document.issue_date":
        return key, date.today().isoformat()
    if key == "employment.start_date":
        return key, (date.today() + timedelta(days=14)).isoformat()
    if key == "employment.base_pay":
        return key, "[sample pay]"
    return key, (SAMPLE_ADDRESS if key == "worker.postal_address" else f"[sample {meaning.lower()}]")


def _check(db, organization_id: int, engagement: Optional[str], role: Optional[str], fills: dict) -> tuple:
    from app.modules.hr import onboarding_package as P
    from app.modules.hr import onboarding_package_org as ORG
    hire = _sample_hire(db, organization_id, engagement, role, fills)
    with P.values_cache(db):
        cfg = P._config_for(db, organization_id)
        out = []
        for d in ORG.documents_for_hire(db, hire):
            cat = d["category"]
            ctx = P.render_context(db, hire, cat, cfg=cfg, final=True, fresh=True)
            gaps = P.with_countersign_gap(db, hire, d, P.readiness(ctx, cat))
            out.append((d, gaps))
    return hire, out


def _resolve_profiles(db, organization_id: int, engagement: Optional[str], role: Optional[str]) -> tuple:
    from app.modules.hr import onboarding_profiles as PR
    engs = [p for p in PR.engagement_profiles(db, organization_id) if p.get("slug")]
    if engagement and not any(p["slug"] == engagement for p in engs):
        raise HTTPException(422, f"No engagement profile '{engagement}' in this organisation.")
    engagement = engagement or next((p["slug"] for p in engs if p.get("default")), engs[0]["slug"] if engs else None)
    roles = [p for p in PR.role_profiles(db, organization_id) if p.get("slug")]
    if role and not any(p["slug"] == role for p in roles):
        raise HTTPException(422, f"No role profile '{role}' in this organisation.")
    role = role or (roles[0]["slug"] if roles else None)
    return engagement, role, engs, roles


def test_package(db, organization_id: int, engagement: Optional[str] = None, role: Optional[str] = None) -> dict:
    from app.modules.hr import onboarding_package as P
    from app.modules.hr import onboarding_package_content as C
    engagement, role, engs, roles = _resolve_profiles(db, organization_id, engagement, role)
    _hire, first = _check(db, organization_id, engagement, role, {})
    fills: dict = {}
    for _d, gaps in first:                               # fill what each hire provides, so only Settings gaps remain
        for k in P._reported_missing(gaps["missing_fields"]):
            if _per_hire_key(db, organization_id, k):
                key, v = _sample_value(db, organization_id, k, P._missing_field(db, organization_id, k)["meaning"])
                fills[key] = v
    _hire, second = _check(db, organization_id, engagement, role, fills)
    per_hire = {d["category"]: [k for k in P._reported_missing(g["missing_fields"]) if _per_hire_key(db, organization_id, k)]
                for d, g in first}
    docs = []
    for d, gaps in second:
        settings_gaps = [P._missing_field(db, organization_id, k) for k in P._reported_missing(gaps["missing_fields"])
                         if not _per_hire_key(db, organization_id, k)]
        docs.append({"category": d["category"], "title": d["title"], "mode": d["mode"],
                     "mode_label": C.MODE_LABELS.get(d["mode"], d["mode"]), "source": d.get("source", "platform"),
                     "ready": not settings_gaps and not gaps["missing_clauses"],
                     "settings_gaps": settings_gaps,
                     "missing_clauses": [{"key": k, "title": C.CLAUSES[k][0]} for k in gaps["missing_clauses"]],
                     "per_hire": [P._missing_field(db, organization_id, k) for k in per_hire.get(d["category"], [])]})
    ready = sum(1 for x in docs if x["ready"])
    return {"engagement": engagement, "role": role,
            "engagement_profiles": [{"slug": p["slug"], "name": p.get("name") or p["slug"]} for p in engs],
            "role_profiles": [{"slug": p["slug"], "name": p.get("title") or p["slug"]} for p in roles],
            "documents": docs, "ready": ready, "total": len(docs), "all_ready": bool(docs) and ready == len(docs)}


def test_preview_pdf(db, organization_id: int, category: str, engagement: Optional[str] = None,
                     role: Optional[str] = None) -> bytes:
    """A watermarked preview of one document for the sample hire (per-hire values filled with sample text)."""
    from app.modules.hr import onboarding_package as P
    from app.modules.hr import onboarding_package_org as ORG
    from app.modules.hr import onboarding_package_render as R
    engagement, role, _e, _r = _resolve_profiles(db, organization_id, engagement, role)
    _hire, first = _check(db, organization_id, engagement, role, {})
    if not any(d["category"] == category for d, _g in first):
        raise HTTPException(404, "This document is not in the package for the chosen profiles.")
    fills: dict = {}
    for _d, gaps in first:
        for k in P._reported_missing(gaps["missing_fields"]):
            if _per_hire_key(db, organization_id, k):
                key, v = _sample_value(db, organization_id, k, P._missing_field(db, organization_id, k)["meaning"])
                fills[key] = v
    hire = _sample_hire(db, organization_id, engagement, role, fills)
    with P.values_cache(db):
        if not any(d["category"] == category for d in ORG.documents_for_hire(db, hire)):
            raise HTTPException(404, "This document is not in the package for the chosen profiles.")
        ctx = P.render_context(db, hire, category, final=False, fresh=True)
        ctx.draft = True                                   # always watermarked: a sample, never a real document
        return R.render_pdf(category, ctx)


# ── setup score ──────────────────────────────────────────────────────────────────────────────────────────────────────
STATUS_TTL = 20                       # seconds: the dashboard asks on every visit; the check renders every document
_status_cache: dict = {}


def setup_status(db, organization_id: int, *, fresh: bool = False) -> dict:
    import time
    key = (organization_id, id(db.get_bind()))
    hit = _status_cache.get(key)
    if not fresh and hit and time.monotonic() - hit[0] < STATUS_TTL:
        return hit[1]
    out = _setup_status(db, organization_id)
    _status_cache[key] = (time.monotonic(), out)
    return out


def _setup_status(db, organization_id: int) -> dict:
    from app.modules.hr import company_profile as CP
    from app.modules.hr import onboarding_countersign as CS
    from app.modules.hr import onboarding_custom_fields as CF
    from app.modules.hr import onboarding_doc_automation as AUTO
    from app.modules.hr import onboarding_package_org as ORG
    from app.modules.hr import onboarding_profiles as PR
    base = "/zoiko-hr/onboarding/settings#"
    steps = []

    comp = CP.completeness(CP.get_profile(db, organization_id))
    steps.append({"key": "company", "title": "Company profile", "done": comp["complete"], "required": True,
                  "detail": "Complete" if comp["complete"] else f"{len(comp['missing'])} required detail(s) missing: "
                  + ", ".join(m["label"] for m in comp["missing"][:4]) + ("…" if len(comp["missing"]) > 4 else ""),
                  "path": base + "company-profile"})

    roles = [p for p in PR.role_profiles(db, organization_id) if p.get("slug")]
    engs = [p for p in PR.engagement_profiles(db, organization_id) if p.get("slug")]
    steps.append({"key": "profiles", "title": "Employment types & roles", "done": bool(roles), "required": False,
                  "detail": f"{len(engs)} employment type(s), {len(roles)} role profile(s)"
                  + ("" if roles else " – without a role profile, job duties come from the requisition or neutral wording"),
                  "path": base + "onboarding-profiles"})

    rows = ORG.rows_for(db, organization_id)
    on = [r for r in rows if r.enabled]
    unreleased = [r for r in on if r.source == "org_template" and ORG.resolve_org_variant(db, r) is None]
    steps.append({"key": "documents", "title": "Documents in the package", "done": bool(on) and not unreleased, "required": True,
                  "detail": f"{len(on)} document(s) switched on" + (f"; {len(unreleased)} of your own not released yet"
                                                                    if unreleased else ""),
                  "path": base + "package-documents"})

    try:
        tp = test_package(db, organization_id)
        blocking = [x for x in tp["documents"] if not x["ready"]]
        detail = ("Every document can be generated" if not blocking else
                  f"{len(blocking)} of {tp['total']} document(s) need settings or clause wording: "
                  + ", ".join(x["title"] for x in blocking[:3]) + ("…" if len(blocking) > 3 else ""))
        steps.append({"key": "wording", "title": "Values & clause wording", "done": not blocking, "required": True,
                      "detail": detail, "path": base + ("test-package" if not blocking else "missing-details")})
    except Exception:
        logger.exception("test package failed for organisation %s", organization_id)
        steps.append({"key": "wording", "title": "Values & clause wording", "done": False, "required": True,
                      "detail": "The package could not be checked. Open Test package to see why.", "path": base + "test-package"})

    needs = [r for r in on if r.mode == "SIGN" and "employer" in (r.signers or [])]
    signers = CS.summary(db, organization_id)["signatories"]
    steps.append({"key": "countersign", "title": "Employer countersignature", "done": not needs or bool(signers),
                  "required": bool(needs),
                  "detail": ("Not used – only the new hire signs" if not needs else
                             f"{len(signers)} countersigner(s)" if signers else
                             f"{len(needs)} document(s) need an employer signature but nobody can countersign"),
                  "path": base + "countersign"})

    auto = AUTO.settings(db, organization_id)
    triggered = [r for r in on if (r.send_when or "manual") != "manual"]
    steps.append({"key": "automation", "title": "Automatic preparation", "done": bool(triggered), "required": False,
                  "detail": (f"{len(triggered)} document(s) prepared automatically – "
                             + ("sent as soon as ready" if auto["mode"] == "auto" else "HR reviews and sends")
                             if triggered else "Off – HR sends every document from the new hire's panel"),
                  "path": base + "package-documents"})

    steps.append({"key": "fields", "title": "Your document fields", "done": True, "required": False,
                  "detail": f"{len(CF.fields(db, organization_id))} field(s) of your own", "path": base + "custom-fields"})

    required = [s for s in steps if s["required"]]
    done = sum(1 for s in required if s["done"])
    return {"steps": steps, "done": done, "required": len(required), "ready": done == len(required),
            "percent": round(100 * done / len(required)) if required else 100}
