"""End to end with a real organisation's Word files (local only: skipped unless DOCS_SETUP_REAL_DIR points at a folder with
templates/ and docs/ sub-folders). The organisation starts with empty onboarding settings, uploads its templates and other
documents, applies, approves and releases as its one admin, and a new hire is sent exactly those documents, filled in."""
import os
import re

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
    hire, _token = _new_hire(world, email="ivy.new@example.com")
    pkg = world.get("a_admin", f"/hr/onboarding/new-hires/{hire.id}/package").json()
    print("HIRE PACKAGE", [(d["category"], d.get("title"), d.get("state"), d.get("missing")) for d in pkg["documents"]])
    held = [d for d in pkg["documents"] if d.get("missing")]
    # what HR is asked for when something is missing: the signatory, which these documents do not name
    r = world.put("a_admin", "/hr/onboarding/company-profile", json={"signatory_name": "Avery Admin", "signatory_title": "Director",
                                                                     "notice_period_value": 30, "notice_period_unit": "calendar_days"})
    assert r.status_code == 200, r.text
    # what HR types in the Send panel for this hire
    r = world.put("a_admin", f"/hr/onboarding/new-hires/{hire.id}/package/inputs", json={"values": {
        "worker.postal_address": "12 Lake View Road, Indiranagar, Bengaluru 560038", "employment.base_pay": "INR 6,00,000 per year",
        "employment.pay_frequency": "monthly", "employment.working_hours": "9:30 AM to 6:30 PM, Monday to Friday",
        "employment.leave_entitlement": "24", "employment.probation_months": "6", "employment.department": "Engineering", "employment.reports_to": "Morgan Manager"}})
    assert r.status_code == 200, r.text
    pkg = world.get("a_admin", f"/hr/onboarding/new-hires/{hire.id}/package").json()
    print("AFTER INPUTS", [(d["category"], d.get("missing")) for d in pkg["documents"]])
    sent = world.post("a_admin", f"/hr/onboarding/new-hires/{hire.id}/send-package").json()
    print("SENT", [i["category"] for i in sent.get("issued", [])], "HELD", sent.get("held"))
    assert len(sent.get("issued", [])) == len(templates), sent
    world.db.expire_all()
    for row in world.db.query(OnboardingDocument).filter_by(onboarding_new_hire_id=hire.id).all():
        if not row.document_id:
            print("NODOC", row.category, row.status, getattr(row, "file_path", None))
            continue
        gen = world.db.get(GeneratedDocument, row.document_id)
        text = " ".join(renderer.pdf_text(storage.get_store().get(gen.pdf_path)).split())
        print("DOC", row.category, "|", text)
        assert "{{" not in text and "}}" not in text, (row.category, re.findall(r".{0,40}\{\{.{0,40}", text))
        assert not re.search(r"\[[A-Za-z][^\]]{0,40}\]", text), (row.category, re.findall(r".{0,30}\[[A-Za-z][^\]]{0,40}\]", text))
    from app.modules.hr import onboarding_package as P
    for d in world.get("a_admin", f"/hr/onboarding/new-hires/{hire.id}/package").json()["documents"]:
        pdf = P.preview_pdf(world.db, hire, d["category"])
        text = " ".join(renderer.pdf_text(pdf).split())
        print("PREVIEW", d["category"], d.get("state"), "|", text[:2200])
        assert "{{" not in text and not re.search(r"\[[A-Za-z][^\]]{0,40}\]", text), (d["category"], text)
