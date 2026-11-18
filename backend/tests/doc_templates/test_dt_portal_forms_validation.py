"""QA report #17 (onboarding portal, BUG-1…BUG-16): the structured forms follow the shared field rules on draft and submit,
nothing invalid is stored or verified, and the final submission waits for the contact details and both forms."""
from datetime import date, timedelta

import pytest

from app.modules.hr.models import OnboardingFormSubmission, OnboardingNewHire

PERSON = "Use letters only. Spaces, hyphens (-), apostrophes (') and full stops are allowed."
GOOD_001 = {"legal_first_name": "Anil", "legal_last_name": "Kumar", "date_of_birth": "1995-06-01", "personal_email": "anil.kumar@gmail.com",
            "mobile_phone": "+91 98765 43210", "address_line1": "12 MG Road", "city": "Hyderabad", "region": "Telangana",
            "postal_code": "500081", "country": "India", "preferred_language": "en"}
GOOD_017 = {"account_holder": "Anil Kumar", "bank_name": "State Bank of India", "account_number": "123456789012",
            "routing_code": "sbin0001234"}


@pytest.fixture
def portal(world):
    from app.modules.hr import onboarding_flow
    h = OnboardingNewHire(organization_id=1, candidate_name="Anil Kumar", email="anil.kumar@gmail.com", position="Analyst",
                          joining_date=date.today() + timedelta(days=14), status="offer_accepted", work_country="IN")
    world.db.add(h)
    world.db.commit()
    token = onboarding_flow.current_portal_url(world.db, h).rsplit("/", 1)[1]
    world.db.commit()
    return h, token


def _put(world, token, cid, values):
    return world.client.put(f"/public/onboarding/{token}/forms/{cid}", json={"values": values})


def _submit(world, token, cid, values):
    return world.client.post(f"/public/onboarding/{token}/forms/{cid}/submit", json={"values": values, "declaration_accepted": True})


def _errors(r):
    assert r.status_code == 422, r.text
    body = r.json()["detail"]
    assert body["code"] == "INVALID_FIELDS" and body["message"] == "Fix the highlighted fields."
    return body["errors"]


@pytest.mark.parametrize("cid,key,junk,expect", [
    ("HR-ONB-001", "legal_first_name", "##%^%^346", PERSON),                                     # BUG-1
    ("HR-ONB-001", "legal_last_name", "234567@#$%$", PERSON),                                    # BUG-2
    ("HR-ONB-001", "preferred_name", "@#$%234554", PERSON),                                      # BUG-3
    ("HR-ONB-001", "personal_email", "yash.pagidipalli95gmail.com", "Enter a valid email address"),   # BUG-4
    ("HR-ONB-001", "mobile_phone", "ggfghjkh#$%", "Enter a valid phone number for India."),      # BUG-5
    ("HR-ONB-001", "city", "345676$%$#", "Use letters only"),                                    # BUG-6
    ("HR-ONB-001", "region", "98765#$%%$", "Select a state/region."),                            # BUG-7
    ("HR-ONB-001", "postal_code", "sfgfgh#$%", "Enter a valid postal code for India"),           # BUG-8
    ("HR-ONB-001", "country", "#$%45", "Select a country."),                                     # BUG-9
    ("HR-ONB-001", "preferred_language", "@#$%$#4", "Choose a language from the list."),         # BUG-10
    ("HR-ONB-017", "account_holder", "4565", PERSON),                                            # BUG-11
    ("HR-ONB-017", "bank_name", "4323", "Enter your bank's name, for example State Bank of India."),   # BUG-12
    ("HR-ONB-017", "account_number", "jhhj", "Enter a valid bank account number"),               # BUG-13
    ("HR-ONB-017", "routing_code", "jh78", "Enter a valid IFSC code"),                           # BUG-14
])
def test_junk_is_refused_on_draft_and_submit_and_never_stored(world, portal, cid, key, junk, expect):
    _h, token = portal
    good = GOOD_001 if cid == "HR-ONB-001" else GOOD_017
    assert _errors(_put(world, token, cid, {**good, key: junk}))[key].startswith(expect)
    assert _errors(_submit(world, token, cid, {**good, key: junk}))[key].startswith(expect)
    sub = world.db.query(OnboardingFormSubmission).filter_by(canonical_id=cid).first()
    world.db.refresh(sub)
    from app.modules.hr.onboarding_documents import _values
    assert junk not in _values(sub).values(), "an invalid value is never stored, not even as a draft"
    assert junk not in str(_errors(_put(world, token, cid, {key: junk}))), "messages never echo the value"


def test_valid_indian_details_are_saved_clean_and_bank_values_stay_encrypted(world, portal):
    h, token = portal
    r = _submit(world, token, "HR-ONB-001", GOOD_001)
    assert r.status_code == 200, r.text
    vals = r.json()["values"]
    assert (vals["mobile_phone"], vals["country"], vals["preferred_language"]) == ("+919876543210", "India", "en")
    r = _submit(world, token, "HR-ONB-017", GOOD_017)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["values"]["account_number"] == "•••• 9012" and body["values"]["routing_code"] == "•••• 1234"
    sub = world.db.query(OnboardingFormSubmission).filter_by(canonical_id="HR-ONB-017").one()
    assert sub.data_encrypted and "123456789012" not in str(sub.data)
    from app.modules.hr.onboarding_documents import _values
    assert _values(sub)["routing_code"] == "SBIN0001234", "stored cleaned (upper-cased)"


def test_the_portal_lists_rules_inputs_and_shows_stored_junk_on_load(world, portal):
    h, token = portal
    # a draft saved before the rules existed
    from app.modules.hr.onboarding_documents import _get_or_create
    sub = _get_or_create(world.db, h, "HR-ONB-001")
    sub.data = {"legal_first_name": "##%^%^346", "city": "Hyderabad"}
    world.db.commit()
    forms = {f["canonical_id"]: f for f in world.client.get(f"/public/onboarding/{token}/forms").json()["items"]}
    starter = forms["HR-ONB-001"]
    by_key = {f["key"]: f for f in starter["fields"]}
    assert by_key["country"]["input"] == "country" and by_key["region"]["input"] == "region"
    assert by_key["preferred_language"]["input"] == "language" and by_key["mobile_phone"]["rule"] == "phone"
    assert starter["errors"] == {"legal_first_name": PERSON}


def test_verify_refuses_invalid_stored_values(world, portal):
    h, token = portal
    assert _submit(world, token, "HR-ONB-001", GOOD_001).status_code == 200
    sub = world.db.query(OnboardingFormSubmission).filter_by(canonical_id="HR-ONB-001").one()
    sub.data = {**sub.data, "city": "345676$%$#"}           # bad data that predates the rules
    world.db.commit()
    r = world.post("a_hr", f"/hr/onboarding/forms/{sub.id}/verify")
    assert r.status_code == 422 and r.json()["detail"]["errors"] == {"city": "Use letters only. Spaces, hyphens, apostrophes and full stops are allowed."}
    world.db.refresh(sub)
    assert sub.status == "SUBMITTED"


def test_submission_waits_for_contact_details_and_both_forms(world, portal):
    h, token = portal
    status = world.client.get(f"/public/onboarding/{token}").json()["submission"]
    assert {"title": "Your contact and address details", "action": "complete"} in status["outstanding"]
    assert {"title": "New starter information", "action": "complete and submit"} in status["outstanding"]
    assert {"title": "Bank and payroll details", "action": "complete and submit"} in status["outstanding"]
    assert not any(o["title"] == "Emergency contacts" for o in status["outstanding"]), "not shown on the portal"

    details = {"address": "12 MG Road", "city": "Hyderabad", "state": "Telangana", "postal_code": "500081", "country": "India"}
    world.client.put(f"/public/onboarding/{token}/details", json=details)                        # phone left blank
    r = world.client.post(f"/public/onboarding/{token}/submit-signed-package")
    assert r.status_code == 409 and r.json()["detail"]["code"] == "ONBOARDING_INCOMPLETE"
    assert {"title": "Your contact and address details", "action": "complete"} in r.json()["detail"]["outstanding"]

    assert world.client.put(f"/public/onboarding/{token}/details", json={**details, "phone": "+91 98765 43210", "submit": True}).status_code == 200
    assert _put(world, token, "HR-ONB-001", GOOD_001).status_code == 200                       # a draft is not enough
    out = world.client.post(f"/public/onboarding/{token}/submit-signed-package").json()["detail"]["outstanding"]
    assert {"title": "New starter information", "action": "complete and submit"} in out
    assert _submit(world, token, "HR-ONB-001", GOOD_001).status_code == 200
    assert _put(world, token, "HR-ONB-017", GOOD_017).status_code == 200                       # bank form still a draft
    out = world.client.post(f"/public/onboarding/{token}/submit-signed-package").json()["detail"]["outstanding"]
    assert out == [{"title": "Bank and payroll details", "action": "complete and submit"}]
    assert _submit(world, token, "HR-ONB-017", GOOD_017).status_code == 200
    r = world.client.post(f"/public/onboarding/{token}/submit-signed-package")
    assert r.status_code == 200 and r.json()["submitted_at"], r.text
