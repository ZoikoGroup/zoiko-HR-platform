"""Phase 4: organisation-specific portal forms and editable document request categories."""
from datetime import date, timedelta

import pytest

from app.modules.hr.models import OnboardingDocument, OnboardingFormSubmission, OnboardingNewHire
from tests.doc_templates.test_dt_portal_forms_validation import GOOD_001


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


TSHIRT = {"label": "T-shirt size", "type": "select", "options": ["S", "M", "L", "XL"], "required": True}
LICENCE = {"label": "Driving licence number", "type": "text", "rule": "tax_id_person"}


def _form(world, token, cid="HR-ONB-001"):
    return next(f for f in world.client.get(f"/public/onboarding/{token}/forms").json()["items"] if f["canonical_id"] == cid)


def test_core_fields_cannot_be_hidden_and_optional_ones_can(world):
    r = world.put("a_admin", "/hr/onboarding/forms/HR-ONB-001/settings", json={"hidden_keys": ["date_of_birth"]})
    assert r.status_code == 422 and "cannot be hidden" in r.text
    r = world.put("a_admin", "/hr/onboarding/forms/HR-ONB-001/settings", json={"hidden_keys": ["nationality"]})
    assert r.status_code == 422, "a field a jurisdiction pack can require is never hidden"
    r = world.put("a_admin", "/hr/onboarding/forms/HR-ONB-003/settings", json={"hidden_keys": ["contact1_phone"]})
    assert r.status_code == 422
    assert world.put("a_admin", "/hr/onboarding/forms/HR-ONB-017/settings", json={}).status_code == 404, "bank form stays platform"
    r = world.put("a_admin", "/hr/onboarding/forms/HR-ONB-001/settings", json={"hidden_keys": ["preferred_name", "address_line2"]})
    assert r.status_code == 200, r.text
    view = r.json()
    assert view["version"] == 1 and {f["key"] for f in view["fields"] if f["hidden"]} == {"preferred_name", "address_line2"}
    assert next(f for f in view["fields"] if f["key"] == "legal_first_name")["locked"]


def test_custom_fields_are_validated_added_to_the_portal_and_kept_out_of_core_columns(world, portal):
    h, token = portal
    too_many = [{"label": f"Extra {i}"} for i in range(21)]
    assert world.put("a_admin", "/hr/onboarding/forms/HR-ONB-001/settings", json={"added_fields": too_many}).status_code == 422
    assert world.put("a_admin", "/hr/onboarding/forms/HR-ONB-001/settings",
                     json={"added_fields": [{"label": "Size", "type": "select"}]}).status_code == 422, "a list needs options"
    assert world.put("a_admin", "/hr/onboarding/forms/HR-ONB-001/settings",
                     json={"added_fields": [{"label": "X", "rule": "made_up"}]}).status_code == 422
    r = world.put("a_admin", "/hr/onboarding/forms/HR-ONB-001/settings",
                  json={"hidden_keys": ["preferred_name"], "added_fields": [TSHIRT, LICENCE]})
    assert r.status_code == 200, r.text
    keys = [f["key"] for f in r.json()["added_fields"]]
    assert keys == ["custom_t_shirt_size", "custom_driving_licence_number"]

    form = _form(world, token)
    fkeys = [f["key"] for f in form["fields"]]
    assert "preferred_name" not in fkeys and "custom_t_shirt_size" in fkeys and "legal_first_name" in fkeys

    bad = world.client.put(f"/public/onboarding/{token}/forms/HR-ONB-001", json={"values": {"custom_t_shirt_size": "XXXL"}})
    assert bad.status_code == 422 and "custom_t_shirt_size" in bad.json()["detail"]["errors"]
    r = world.client.post(f"/public/onboarding/{token}/forms/HR-ONB-001/submit", json={"values": GOOD_001, "declaration_accepted": True})
    assert r.status_code == 422 and "T-shirt size" in r.text, "a required custom field must be answered"
    r = world.client.post(f"/public/onboarding/{token}/forms/HR-ONB-001/submit",
                          json={"values": {**GOOD_001, "custom_t_shirt_size": "M"}, "declaration_accepted": True})
    assert r.status_code == 200, r.text
    assert r.json()["form_version"] == 1

    # the organisation changes the form again: the submitted form keeps the fields it was submitted with
    world.put("a_admin", "/hr/onboarding/forms/HR-ONB-001/settings", json={"added_fields": [LICENCE]})
    sub = world.db.query(OnboardingFormSubmission).filter_by(new_hire_id=h.id, canonical_id="HR-ONB-001").one()
    assert sub.data["_form_version"] == 1 and any(f["key"] == "custom_t_shirt_size" for f in sub.data["_fields"])
    hr_view = world.get("a_admin", f"/hr/onboarding/new-hires/{h.id}/forms").json()
    item = next(i for i in (hr_view.get("items") or hr_view) if i["canonical_id"] == "HR-ONB-001")
    assert any(f["key"] == "custom_t_shirt_size" for f in item["fields"])

    r = world.post("a_admin", f"/hr/onboarding/forms/{sub.id}/verify")
    assert r.status_code == 200, r.text
    world.db.expire_all()
    details = world.db.get(OnboardingNewHire, h.id).profile_details
    assert details["custom_fields"] == {"custom_t_shirt_size": "M"}
    assert "custom_t_shirt_size" not in (details.get("verified") or {})


def test_categories_are_seeded_editable_and_used_everywhere(world, portal):
    h, token = portal
    view = world.get("a_admin", "/hr/onboarding/request-categories").json()
    keys = [c["key"] for c in view["categories"]]
    assert keys == ["id_proof", "education_certificates", "experience_letters", "bank_details", "other"]
    assert all(c["is_system"] for c in view["categories"])
    r = world.post("a_admin", "/hr/onboarding/request-categories",
                   json={"label": "Driving licence", "description": "Both sides of your licence", "accepted_types": ["pdf", "png"],
                         "max_size_mb": 2, "required_by_default": True})
    assert r.status_code == 200, r.text
    lic = next(c for c in r.json()["categories"] if c["key"] == "driving_licence")
    assert world.post("a_admin", "/hr/onboarding/request-categories", json={"label": "Driving licence"}).status_code == 409
    sys_id = next(c["id"] for c in r.json()["categories"] if c["key"] == "id_proof")
    assert world.put("a_admin", f"/hr/onboarding/request-categories/{sys_id}", json={"key": "passport"}).status_code == 422
    r = world.put("a_admin", f"/hr/onboarding/request-categories/{sys_id}", json={"label": "Passport or national ID"})
    assert r.status_code == 200

    # another organisation never sees or uses it
    assert "driving_licence" not in [c["key"] for c in world.get("b_admin", "/hr/onboarding/request-categories").json()["categories"]]
    assert world.put("b_admin", f"/hr/onboarding/request-categories/{lic['id']}", json={"label": "x"}).status_code == 404

    r = world.post("a_admin", f"/hr/onboarding/new-hires/{h.id}/document-requests", json={"categories": ["driving_licence", "id_proof"]})
    assert r.status_code in (200, 201), r.text
    assert {d["title"] for d in r.json()} == {"Driving licence", "Passport or national ID"}
    assert world.post("a_admin", f"/hr/onboarding/new-hires/{h.id}/document-requests",
                      json={"categories": ["made_up"]}).status_code == 400

    portal_doc = next(d for d in world.client.get(f"/public/onboarding/{token}").json()["documents"] if d["category"] == "driving_licence")
    assert portal_doc["accepted_types"] == ["pdf", "png"] and portal_doc["description"] == "Both sides of your licence"
    r = world.client.post(f"/public/onboarding/{token}/documents/{portal_doc['id']}",
                          files={"file": ("licence.jpg", b"\xff\xd8\xff\xe0" + b"0" * 100, "image/jpeg")})
    assert r.status_code == 400 and "PDF" in r.text, "the category's accepted types apply"

    # a used category can be deactivated but not deleted; an unused one is removed
    r = world.delete("a_admin", f"/hr/onboarding/request-categories/{lic['id']}")
    assert r.json()["deactivated"] is True and r.json()["deleted"] is False
    assert world.post("a_admin", f"/hr/onboarding/new-hires/{h.id}/document-requests",
                      json={"categories": ["driving_licence"]}).status_code == 400, "inactive categories cannot be requested"
    r = world.post("a_admin", "/hr/onboarding/request-categories", json={"label": "Visa"})
    visa = next(c for c in r.json()["categories"] if c["key"] == "visa")
    assert world.delete("a_admin", f"/hr/onboarding/request-categories/{visa['id']}").json()["deleted"] is True
    assert world.db.query(OnboardingDocument).filter_by(onboarding_new_hire_id=h.id, category="driving_licence").count() == 1
