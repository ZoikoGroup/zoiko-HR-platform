"""Engagement / Role Profiles and the v2 per-hire values: tenant isolation, never borrowing another role's text, computed
weekdays and money, structured addresses, consistency warnings, and two hires never sharing values."""
from datetime import date, timedelta

from app.modules.hr import onboarding_package as P
from app.modules.hr import onboarding_profiles as PR
from app.modules.hr.models import OnboardingNewHire, RecruitmentCandidate, RecruitmentOffer

ROLE = {"title": "Associate – AI Web Engineer / Full-Stack Associate",
        "about": ["Builds and maintains the platform's web applications."],
        "responsibility_groups": [{"heading": "Full-Stack Web Development", "bullets": ["Build features end to end."]}],
        "offer_responsibilities": ["Full-Stack Development: build and ship web features."],
        "contract_duties": "The Associate builds, tests and maintains full-stack web applications.",
        "required_skills": ["Python", "JavaScript"],
        "kpi_areas": [{"title": "Delivery", "bullets": ["Ship planned tasks."], "success": "Tasks closed on time."}]}
ENGAGEMENT = {"name": "Programme Associate", "default": True, "programme_name": "Example Talent Programme",
              "programme_short": "Example Programme", "party_term": "Programme Associate", "engagement_term": "Programme Engagement",
              "assessment_months": 6, "assessment_label": "Performance Assessment Period", "remuneration_type": "stipend",
              "remuneration_label": "Monthly Stipend", "working_days": ["MON", "TUE", "WED", "THU", "FRI"],
              "start_time": "10:30", "end_time": "20:15", "timezone_label": "IST",
              "leave_rule": "Leave taken in the first six months is unpaid, with no pro-rata adjustments.",
              "leave_accrual_days_per_month": 1.25}
PROFILE = {"legal_name": "Tenant A Industries Private Limited", "address_line1": "17, 2nd Floor, 7th Main Road",
           "address_line2": "II stage, Indiranagar.", "city": "Bengaluru", "state": "Karnataka", "postal_code": "560038",
           "country": "IN", "currency": "INR", "number_grouping": "indian", "stipend_gross_label": True, "pay_day_of_month": 15,
           "notice_period_value": 15, "notice_period_unit": "business_days", "employer_notice_value": 2,
           "employer_notice_unit": "weeks", "non_solicit_post_termination_months": 12, "nda_non_solicit_months": 6,
           "jurisdiction_country": "IN", "jurisdiction_city": "Bengaluru", "reports_email": "reports@tenant-a.example.com",
           "reports_channel_text": "the designated reports group", "compliance_documents": ["PAN Card", "Bank Details"]}


def _ok(r):
    assert r.status_code == 200, r.text
    return r.json()


def _hire(world, name, position, salary, start, address, org=1):
    db = world.db
    h = OnboardingNewHire(organization_id=org, candidate_name=name, email=f"{name.split()[0].lower()}@example.com",
                          position=position, joining_date=start, status="offer_accepted", work_country="IN",
                          profile_details=address)
    db.add(h)
    db.commit()
    cand = RecruitmentCandidate(organization_id=org, name=name, email=h.email, position=position, onboarding_new_hire_id=h.id)
    db.add(cand)
    db.commit()
    db.add(RecruitmentOffer(organization_id=org, candidate_id=cand.id, candidate_name=name, position=position, salary=salary, currency="INR",
                            pay_period="monthly", joining_date=start))
    db.commit()
    return h


def _setup_tenant_a(world):
    _ok(world.put("a_admin", "/hr/onboarding/company-profile", json=PROFILE))
    _ok(world.put("a_admin", "/hr/onboarding/profiles/role/ai-web-associate", json=ROLE))
    _ok(world.put("a_admin", "/hr/onboarding/profiles/engagement/programme-associate", json=ENGAGEMENT))


def test_profiles_crud_isolation_and_builtin_standard(world):
    view = _ok(world.get("b_admin", "/hr/onboarding/profiles"))
    assert [p["slug"] for p in view["engagement_profiles"]] == ["standard-employee"] and view["role_profiles"] == []
    std = view["engagement_profiles"][0]
    assert (std["party_term"], std["assessment_label"], std["default"]) == ("Employee", "Probation", True)

    _setup_tenant_a(world)
    a = _ok(world.get("a_admin", "/hr/onboarding/profiles"))
    assert [p["slug"] for p in a["engagement_profiles"]] == ["standard-employee", "programme-associate"]
    assert [p["default"] for p in a["engagement_profiles"]] == [False, True]
    assert _ok(world.get("b_admin", "/hr/onboarding/profiles"))["role_profiles"] == [], "tenant B never sees tenant A's roles"

    assert world.put("a_admin", "/hr/onboarding/profiles/engagement/standard-employee",
                     json={"party_term": "Staff"}).status_code == 409, "the built-in profile is read-only"
    bad = world.put("a_admin", "/hr/onboarding/profiles/engagement/x1", json={"name": "X", "start_time": "25:00",
                                                                              "working_days": ["MON", "FUNDAY"]})
    assert bad.status_code == 422
    assert world.put("a_admin", "/hr/onboarding/profiles/role/BAD SLUG", json=ROLE).status_code == 422
    assert world.put("a_emp", "/hr/onboarding/profiles/role/x", json=ROLE).status_code in (401, 403)

    # deleting a profile an unsent hire uses is refused
    h = _hire(world, "Ravuri Rugvedh", ROLE["title"], 12000, date(2026, 8, 1), {})
    P.save_hire_inputs(world.db, h, {"role_profile_slug": "ai-web-associate"})
    assert world.client.delete("/hr/onboarding/profiles/role/ai-web-associate", headers=world._h("a_admin")).status_code == 409


def test_role_profile_required_and_never_borrowed(world):
    _setup_tenant_a(world)
    h = _hire(world, "Sam Other", "Data Analyst", 30000, date(2026, 8, 3), {})
    values = P.build_values(world.db, h, P.get_config(world.db, 1))
    assert values["role.title"] is None and values["employment.duties_paragraph"] is None, "no matching role: nothing borrowed"
    assert any(w["code"] == "no_role_profile" for w in P.consistency_warnings(world.db, h))
    # matched by title (case / dash insensitive), or chosen explicitly
    h2 = _hire(world, "Ravuri Rugvedh", "associate - ai web engineer / full-stack associate", 12000, date(2026, 8, 3), {})
    v2 = P.build_values(world.db, h2, P.get_config(world.db, 1))
    assert v2["role.title"] == ROLE["title"] and "full-stack web applications" in v2["employment.duties_paragraph"]
    assert world.put("a_admin", f"/hr/onboarding/new-hires/{h.id}/package/inputs",
                     json={"values": {"role_profile_slug": "missing-role"}}).status_code == 422


def test_v2_values_weekday_money_address_and_notice(world):
    _setup_tenant_a(world)
    address = {"house": "Flat-704, Block-B", "building": "Bhavyas Tulasi Vanam", "street": "Ushamullapudi Road",
               "landmark": "Opp Yellammabanda Cheruvu", "locality": "Kukatpally", "city": "Hyderabad",
               "district": "Medchal-Malkajgiri", "state": "Telangana", "postal_code": "500072", "country": "India"}
    h = _hire(world, "ravuri rugvedh", ROLE["title"], 12000, date(2026, 8, 1), address)
    P.save_hire_inputs(world.db, h, {"document.issue_date": "2026-07-06", "offer.candidate_fit_summary": "Strong Python work."})
    v = P.build_values(world.db, h, P.get_config(world.db, 1))
    assert v["employment.start_date_long"] == "Saturday, 1 August 2026"
    assert v["document.issue_date"] == "6 July 2026" and v["document.issue_date_legal"] == "6th day of July, 2026"
    assert v["employment.pay_amount"] == "₹12,000"
    assert v["employment.pay_statement"] == "₹12,000 per month (gross), paid on the 15th of each month for the preceding period"
    assert v["employment.notice_text"] == "15 business days' written notice"
    assert v["worker.full_name_caps"] == "RAVURI RUGVEDH" and v["worker.initials"] == "RR"
    assert v["worker.address_block"].splitlines()[-1] == "PIN Code: 500072"
    assert "District: Medchal-Malkajgiri, State: Telangana" in v["worker.address_block"]
    assert "II Stage, Indiranagar" in v["company.address_block"] and "PIN Code: 560038" in v["company.address_block"]
    assert v["company.governing_law"] == "the laws of India; the courts at Bengaluru have exclusive jurisdiction"
    assert v["engagement.party_term"] == "Programme Associate"
    assert v["engagement.work_schedule"] == "Monday to Friday, 10:30 AM IST to 8:15 PM IST"
    assert v["company.reports_channel"] == " and the designated reports group"
    assert v["offer.candidate_fit_summary"] == "Strong Python work." and v["offer.compliance_documents"] == ["PAN Card", "Bank Details"]
    assert v["document.reference"] == f"RR-{h.id}"


def test_ravuri_golden_package_renders_all_ten_personalized_documents(world):
    import io
    import zipfile
    from app.modules.doc_templates import renderer
    from app.modules.hr import onboarding_package_content as C

    _setup_tenant_a(world)
    address = {"house": "Flat-704, Block-B", "building": "Bhavyas Tulasi Vanam", "street": "Ushamullapudi Road",
               "landmark": "Opp Yellammabanda Cheruvu", "locality": "Kukatpally", "district": "Medchal-Malkajgiri",
               "city": "Hyderabad", "state": "Telangana", "postal_code": "500072", "country": "India"}
    hire = _hire(world, "Ravuri Rugvedh", ROLE["title"], 12000, date(2026, 8, 1), address)
    P.save_hire_inputs(world.db, hire, {"document.issue_date": "2026-07-06", "offer.candidate_fit_summary": "Strong Python work."})
    ctx_values = P.build_values(world.db, hire, P.get_config(world.db, 1))
    assert ctx_values["employment.start_date_long"] == "Saturday, 1 August 2026"
    assert ctx_values["document.issue_date_legal"] == "6th day of July, 2026"
    assert ctx_values["employment.pay_amount"] == "₹12,000"
    assert any(w["code"] == "start_on_non_working_day" for w in P.consistency_warnings(world.db, hire))

    generated = []
    for category in C.CATEGORIES:
        pdf, filename, state = P.document_file(world.db, hire, category)
        text = renderer.pdf_text(pdf)
        assert pdf.startswith(b"%PDF") and "Ravuri Rugvedh" in text, (category, text)
        assert state == "draft", "missing signatory particulars keep these unsent documents in draft"
        generated.append(filename)
    assert "RR_RAVURI_RUGVEDH_OFFER_LETTER.pdf" in generated
    archive, _ = P.package_zip(world.db, hire, "pdf")
    with zipfile.ZipFile(io.BytesIO(archive)) as zf:
        assert len(zf.namelist()) == 10
        assert "RR_RAVURI_RUGVEDH_OFFER_LETTER.pdf" in zf.namelist()


def test_weekday_is_computed_and_non_working_start_warns(world):
    _setup_tenant_a(world)
    h = _hire(world, "Ravuri Rugvedh", ROLE["title"], 12000, date(2026, 8, 1), {})       # a Saturday
    codes = {w["code"] for w in P.consistency_warnings(world.db, h)}
    assert "start_on_non_working_day" in codes
    h.joining_date = date(2026, 8, 3)                                                      # a Monday
    world.db.commit()
    assert "start_on_non_working_day" not in {w["code"] for w in P.consistency_warnings(world.db, h)}


def test_consistency_warnings(world):
    _setup_tenant_a(world)
    h = _hire(world, "Ravuri Rugvedh", ROLE["title"], 12000, date.today() - timedelta(days=3), {})
    codes = {w["code"] for w in P.consistency_warnings(world.db, h)}
    assert {"notice_mismatch", "non_solicit_mismatch", "leave_rule_conflict", "start_before_issue"} <= codes
    view = _ok(world.get("a_admin", f"/hr/onboarding/new-hires/{h.id}/package"))
    assert {w["code"] for w in view["warnings"]} == codes
    groups = {g["group"]: {r["key"]: r["value"] for r in g["values"]} for g in view["printed_values"]}
    assert groups["Pay & dates"]["employment.pay_amount"] == "₹12,000"
    assert groups["Company"]["company.legal_name"] == PROFILE["legal_name"]


def test_two_hires_never_leak_into_each_other(world):
    _setup_tenant_a(world)
    one = _hire(world, "Ravuri Rugvedh", ROLE["title"], 12000, date(2026, 8, 3),
                {"address": "Flat 704", "city": "Hyderabad", "postal_code": "500072", "country": "India"})
    two = _hire(world, "Meera Iyer", "Data Analyst", 45000, date(2026, 9, 1),
                {"address": "12 Lake View", "city": "Chennai", "postal_code": "600001", "country": "India"})
    cfg = P.get_config(world.db, 1)
    v1, v2 = P.build_values(world.db, one, cfg), P.build_values(world.db, two, cfg)
    text1, text2 = repr(v1), repr(v2)
    for own, other in ((text1, text2), (text2, text1)):
        assert own != other
    assert "Meera" not in text1 and "Chennai" not in text1 and "45,000" not in text1
    assert "Ravuri" not in text2 and "Hyderabad" not in text2 and "12,000" not in text2 and "full-stack" not in text2.lower()


def test_other_tenant_gets_none_of_tenant_a_values(world):
    _setup_tenant_a(world)
    h = _hire(world, "Rowan Bee", "Analyst", 1000, date(2026, 8, 3), {}, org=2)
    v = P.build_values(world.db, h, P.get_config(world.db, 2))
    text = repr(v)
    assert "Tenant A" not in text and "Programme Associate" not in text and "Bengaluru" not in text
    assert v["engagement.party_term"] == "Employee" and v["engagement.assessment_label"] == "Probation"
