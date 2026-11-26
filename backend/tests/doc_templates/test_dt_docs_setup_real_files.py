"""End to end with a real organisation's Word files (local only: skipped unless DOCS_SETUP_REAL_DIR points at a folder with
templates/ and docs/ sub-folders). The organisation starts with empty onboarding settings, uploads its templates and other
documents, applies, approves and releases as its one admin, and a new hire is sent exactly those documents, filled in."""
import os
import pytest

from app.modules.doc_templates import renderer, storage
from app.modules.doc_templates.models import GeneratedDocument, TemplateVariant
from app.modules.hr import docs_setup as DS
from app.modules.hr.models import OnboardingDocument
from tests.doc_templates.test_dt_offer_package import _new_hire

REAL = os.environ.get("DOCS_SETUP_REAL_DIR")
pytestmark = pytest.mark.skipif(not REAL or not os.path.isdir(REAL or ""), reason="local real-file run only")
BASE = "/hr/onboarding/docs-setup"


@pytest.fixture(autouse=True)
def _on(monkeypatch):
    from app.config import settings
    monkeypatch.setattr(settings, "ONBOARDING_DOCS_SETUP", True)
    monkeypatch.setattr(settings, "ONBOARDING_DOCS_SETUP_ORGS", "")
    monkeypatch.setattr(DS, "ai_status", lambda db, org: {"on": False, "reason": "off in tests"})
    DS._RATE.clear()


def _files(sub):
    d = os.path.join(REAL, sub)
    return sorted((n, open(os.path.join(d, n), "rb").read()) for n in os.listdir(d) if n.lower().endswith(".docx"))


def test_real_templates_and_documents_to_a_new_hire(world):
    s = world.post("a_admin", f"{BASE}/sessions").json()
    sid = s["id"]
    templates, docs = _files("templates"), _files("docs")
    for name, data in templates:
        r = world.client.post(f"{BASE}/sessions/{sid}/files", data={"label": "tpl:auto"},
                              files={"file": (name, data, "application/octet-stream")}, headers=world._h("a_admin"))
        assert r.status_code == 200, (name, r.text)
    for name, data in docs:
        r = world.client.post(f"{BASE}/sessions/{sid}/files", files={"file": (name, data, "application/octet-stream")},
                              headers=world._h("a_admin"))
        assert r.status_code == 200, (name, r.text)
    s = world.post("a_admin", f"{BASE}/sessions/{sid}/analyse").json()
    for f in s["files"]:
        print("FILE", f["filename"], "| role", f.get("role"), "| mapping", f.get("mapping"), "| warnings", f.get("warnings"))
    props = world.get("a_admin", f"{BASE}/sessions/{sid}/proposals").json()
    print("PROPOSALS", len(props["items"]), "conflicts", props.get("unresolved_conflicts"))
    for p in props["items"]:
        print("  ", p["target"], p["target_key"], "=", p.get("proposed_value"), "|", p.get("decision"))
    for g in props.get("unresolved_conflicts") or []:
        first = next(p for p in props["items"] if p.get("conflict_group") == g)
        world.post("a_admin", f"{BASE}/sessions/{sid}/proposals/{first['id']}/decision", json={"decision": "accept"})
    summary = world.get("a_admin", f"{BASE}/sessions/{sid}/summary").json()
    print("PACKAGE AFTER", summary.get("package"))
    r = world.post("a_admin", f"{BASE}/sessions/{sid}/apply", headers={"Idempotency-Key": "real"})
    assert r.status_code == 200, r.text
    created = r.json()["summary"]["created"]
    print("CREATED", {k: v for k, v in created.items() if v})
    rel = world.post("a_admin", f"{BASE}/sessions/{sid}/approve-release",
                     json={"attestation_accepted": True, "signed_name": "Avery Admin"}).json()
    print("RELEASE", rel)
    assert rel["released"] == rel["total"] == len(templates), rel

    docs_settings = world.get("a_admin", "/hr/onboarding/package/documents").json()["documents"]
    print("SETTINGS DOCS", [(d["title"], d["enabled"], d.get("source"), d.get("template_state", {}).get("label")) for d in docs_settings])
    # Settings › Missing details: everything the setup could not find is asked for once, for the whole organisation
    from tests.doc_templates.test_dt_setup_with_ai_end_to_end import assert_all_issued_clean, fill_hire_values, fill_missing_details
    before = world.get("a_admin", "/hr/onboarding/settings-gaps").json()
    print("GAPS ASKED", [(i["key"], [x["key"] for x in i["inputs"]]) for i in before["fields"]], "CLAUSES", [c["key"] for c in before["clauses"]],
          "DEFAULTS", [d["key"] for d in before["hire_defaults"]], "LINKS", [l["key"] for l in before["links"]])
    gaps = fill_missing_details(world)
    assert gaps["complete"], gaps
    hire, _token = _new_hire(world, email="ivy.new@example.com")
    fill_hire_values(world, hire)                      # what HR types for this person in the documents panel
    texts = assert_all_issued_clean(world, hire, expected=len(templates))
    for cat, text in texts:
        print("DOC", cat, "|", text[:1500])
