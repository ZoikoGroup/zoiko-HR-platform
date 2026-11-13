"""Company Profile (Settings): every organisation's own employer particulars — validation, tenant isolation, audit,
explicit prefill, the start-up backfill, and the offer-package settings reading/writing the fields it owns."""
from app.modules.hr import company_profile as CP
from app.modules.hr import onboarding_package as P
from app.modules.hr.models import Organization, OrganizationConfig

URL = "/hr/onboarding/company-profile"

VALID = {
    "legal_name": "Tenant A Industries Private Limited", "short_name": "Tenant A Industries Pvt Ltd",
    "address_line1": "17, 2nd Floor, 7th Main Road", "address_line2": "II Stage, Indiranagar", "city": "Bengaluru",
    "state": "Karnataka", "postal_code": "560038", "country": "IN",
    "cin": "L17110MH1973PLC019786", "gstin": "27AAPFU0939F1ZV", "pan": "AAPFU0939F",
    "hr_contact_name": "Harper People", "hr_contact_email": "hr@tenant-a.example.com",
    "signatory_name": "Avery Admin", "signatory_title": "Director",
    "jurisdiction_country": "IN", "jurisdiction_city": "Bengaluru",
    "notice_period_value": 15, "notice_period_unit": "business_days",
    "compliance_documents": ["PAN Card", "Bank Details"], "brands": ["Brand One"],
}


def _ok(r):
    assert r.status_code == 200, r.text
    return r.json()


def test_company_profile_crud_validation_and_isolation(world):
    empty = _ok(world.get("a_admin", URL))
    assert empty["profile"]["legal_name"] == "" and empty["completeness"]["complete"] is False
    assert {m["key"] for m in empty["completeness"]["missing"]} >= {"legal_name", "postal_code", "signatory_name"}

    saved = _ok(world.put("a_hr", URL, json=VALID))
    assert saved["completeness"] == {"percent": 100, "required": len(CP.REQUIRED), "missing": [], "complete": True}
    assert saved["profile"]["cin"] == "L17110MH1973PLC019786" and saved["profile"]["compliance_documents"] == ["PAN Card", "Bank Details"]
    assert "II Stage, Indiranagar" in saved["registered_address"] and "560038" in saved["registered_address"]

    # every field's problem is reported at once, and nothing is saved
    bad = world.put("a_hr", URL, json={"cin": "123", "gstin": "27AAPFU0939F1ZX", "pan": "ABC", "postal_code": "5600",
                                       "hr_contact_email": "not-an-email", "notice_period_unit": "fortnights",
                                       "pay_day_of_month": 31, "country": "India", "brand_primary": "blue", "nope": 1})
    assert bad.status_code == 422
    errors = bad.json()["detail"]["errors"] if "detail" in bad.json() else bad.json()["errors"]
    assert set(errors) >= {"cin", "gstin", "pan", "hr_contact_email", "notice_period_unit", "pay_day_of_month", "country",
                           "brand_primary", "nope"}
    assert _ok(world.get("a_hr", URL))["profile"]["cin"] == "L17110MH1973PLC019786"

    # tenant B sees only its own (empty) profile and cannot change tenant A's
    other = _ok(world.get("b_admin", URL))
    assert other["profile"]["legal_name"] == "" and "Tenant A" not in str(other)
    _ok(world.put("b_admin", URL, json={"legal_name": "Tenant B Ltd"}))
    assert _ok(world.get("a_admin", URL))["profile"]["legal_name"] == VALID["legal_name"]
    assert CP.get_profile(world.db, 2)["legal_name"] == "Tenant B Ltd"

    # employees cannot read or edit it
    assert world.get("a_emp", URL).status_code in (401, 403)
    assert world.put("a_emp", URL, json={"legal_name": "x"}).status_code in (401, 403)

    # the save is audited: which keys changed, with registration numbers masked
    from app.modules.super_admin.models import AuditLog
    ev = (world.db.query(AuditLog).filter(AuditLog.action_type == "settings.company_profile_updated", AuditLog.organization_id == 1)
          .order_by(AuditLog.id.desc()).first())
    assert ev is not None and "cin" in ev.details["changed_keys"]
    cin_change = next(c for c in ev.changes if c["field"] == "cin")
    assert cin_change["masked"] and "L17110" not in str(cin_change)


def test_prefill_proposes_but_never_saves(world):
    out = _ok(world.post("a_admin", f"{URL}/prefill"))
    assert out["saved"] is False
    assert out["proposal"]["legal_name"] == "Tenant A Employer Ltd"        # from the default employer entity
    assert out["proposal"]["address_line1"] == "1 Sample Street" and out["proposal"]["postal_code"] == "LS1 1AA"
    assert _ok(world.get("a_admin", URL))["profile"]["legal_name"] == ""   # nothing was saved
    _ok(world.put("a_admin", URL, json={"legal_name": "Chosen Name Ltd"}))
    assert "legal_name" not in _ok(world.post("a_admin", f"{URL}/prefill"))["proposal"], "only empty fields are proposed"


def test_every_organisation_has_a_profile_row(world):
    db = world.db
    db.query(OrganizationConfig).filter(OrganizationConfig.key == CP.PROFILE_KEY).delete()
    db.commit()
    created = CP.backfill_all(db)
    assert created == db.query(Organization).count()
    assert CP.backfill_all(db) == 0, "idempotent"
    for org in db.query(Organization).all():
        assert CP.get_profile(db, org.id)["legal_name"] == "", "a new profile is never filled from the organisation record"


def test_offer_package_settings_read_and_write_the_profile(world):
    # the v1 settings API still saves the employer particulars, now into the Company Profile
    r = world.put("a_admin", "/hr/onboarding/package/settings",
                  json={"legal_name": "Tenant A Employer Ltd", "registered_address": "1 Sample Street, Leeds LS1 1AA",
                        "signatory_name": "Avery Admin", "paper": "LETTER"})
    assert r.status_code == 200, r.text
    profile = CP.get_profile(world.db, 1)
    assert profile["legal_name"] == "Tenant A Employer Ltd" and profile["paper"] == "LETTER"
    assert profile["registered_address_text"] == "1 Sample Street, Leeds LS1 1AA"
    # and a change in the Company Profile is what the documents print
    _ok(world.put("a_admin", URL, json={"legal_name": "Renamed Employer Ltd", "address_line1": "2 New Road", "city": "Leeds",
                                        "postal_code": "LS2 2BB", "country": "GB"}))
    cfg = P.get_config(world.db, 1)
    assert cfg["legal_name"] == "Renamed Employer Ltd"
    assert cfg["registered_address"].startswith("2 New Road") and "LS2 2BB" in cfg["registered_address"]
    assert P.get_config(world.db, 2)["legal_name"] == ""


def test_existing_offer_package_values_move_into_the_profile_once(world):
    db = world.db
    P._write_config(db, 1, {**P.get_config(db, 1), "legal_name": "Legacy Employer Ltd", "registered_address": "9 Old Lane"})
    db.query(OrganizationConfig).filter(OrganizationConfig.key == CP.PROFILE_KEY, OrganizationConfig.organization_id == 1).delete()
    db.commit()
    profile = CP.get_profile(db, 1)
    assert profile["legal_name"] == "Legacy Employer Ltd" and profile["registered_address_text"] == "9 Old Lane"
    assert P.get_config(db, 1)["registered_address"] == "9 Old Lane"


def _seed_module():
    import importlib.util
    import os
    path = os.path.join(os.path.dirname(__file__), "..", "..", "scripts", "seed_company_profile.py")
    spec = importlib.util.spec_from_file_location("seed_company_profile", path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def test_zoiko_seed_is_data_validated_idempotent_and_tenant_scoped(world):
    import json
    seed = _seed_module()
    with open(seed.DEFAULT_FILE, encoding="utf-8") as f:
        data = json.load(f)
    db = world.db
    planned = seed.plan(db, 1, data)
    assert planned and CP.get_profile(db, 1)["legal_name"] == "", "a dry run changes nothing"
    assert seed.apply(db, 1, data) == planned
    profile = CP.get_profile(db, 1)
    assert profile["legal_name"] == "Zoiko Industries Private Limited" and profile["date_format"] == "DMY"
    assert profile["compliance_documents"][0] == "PAN Card" and profile["notice_period_unit"] == "business_days"
    from app.modules.hr import onboarding_profiles as PR
    eng = PR.engagement_for(db, 1, None)
    assert eng["slug"] == "zoiko-ascend-associate" and eng["party_term"] == "Ascend Associate"
    assert seed.plan(db, 1, data) == [] and seed.apply(db, 1, data) == [], "idempotent"
    # the other tenant gets nothing from the seed
    assert "zoiko" not in json.dumps(CP.get_profile(db, 2)).lower()
    assert PR.engagement_for(db, 2, None)["slug"] == "standard-employee"
    assert "ZOIKO" not in P.get_config(db, 2)["legal_name"].upper()
