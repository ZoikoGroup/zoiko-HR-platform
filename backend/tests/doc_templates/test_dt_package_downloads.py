"""Package downloads: file names, one document as PDF or DOCX, and every document in one ZIP."""
import io
import zipfile
from datetime import date, timedelta

from docx import Document

from app.modules.hr import onboarding_package as P
from app.modules.hr import onboarding_package_content as C
from app.modules.hr.models import OnboardingNewHire


def _hire(world, name="Ravuri Rugvedh"):
    h = OnboardingNewHire(organization_id=1, candidate_name=name, email="ravuri@example.com", position="Analyst",
                          joining_date=date.today() + timedelta(days=14), status="offer_accepted", work_country="IN",
                          manager_id=world.u["a_manager"].id)
    world.db.add(h)
    world.db.commit()
    return h


def test_filenames():
    h = OnboardingNewHire(id=5, candidate_name="Ravuri Rugvedh")
    assert P.package_filename(h, "offer_letter") == "RR_RAVURI_RUGVEDH_OFFER_LETTER.pdf"
    assert P.package_filename(h, "employment_contract") == "RR_RAVURI_RUGVEDH_EMPLOYMENT_CONTRACT.pdf"
    assert P.package_filename(h, "nda") == "RR_RAVURI_RUGVEDH_NON-DISCLOSURE_AGREEMENT.pdf"
    assert P.package_filename(h, "daily_work_report") == "RR_RAVURI_RUGVEDH_DAILY_WORK_REPORT.pdf"
    assert P.package_filename(h, "velocity_report") == "RR_RAVURI_RUGVEDH_PROJECT_VELOCITY_REPORT.pdf"
    assert P.package_filename(h, "nda", "pdf", "signed") == "RR_RAVURI_RUGVEDH_NON-DISCLOSURE_AGREEMENT.pdf"
    assert P.package_filename(h, "nda", "docx", "draft") == "RR_RAVURI_RUGVEDH_NON-DISCLOSURE_AGREEMENT.docx"
    accented = OnboardingNewHire(id=6, candidate_name="José-María O'Núñez")
    assert P.package_filename(accented, "offer_letter") == "JMO_JOSE_MARIA_O_NUNEZ_OFFER_LETTER.pdf"


def test_filenames_and_zip(world):
    h = _hire(world)
    r = world.post("a_admin", f"/hr/onboarding/new-hires/{h.id}/send-package")      # documents without clause hooks go out
    assert r.status_code == 200, r.text
    sent = {i["category"] for i in r.json()["issued"]}
    assert sent

    z = world.get("a_admin", f"/hr/onboarding/new-hires/{h.id}/package/download.zip")
    assert z.status_code == 200 and z.headers["content-type"] == "application/zip"
    assert "filename*=UTF-8''RR_RAVURI_RUGVEDH_ONBOARDING_PACKAGE.zip" in z.headers["content-disposition"]
    names = zipfile.ZipFile(io.BytesIO(z.content)).namelist()
    assert len(names) == 10
    for cat in C.CATEGORIES:
        expected = P.package_filename(h, cat, "pdf", "issued" if cat in sent else "draft")
        assert expected in names, (cat, names)
    both = zipfile.ZipFile(io.BytesIO(world.get("a_admin", f"/hr/onboarding/new-hires/{h.id}/package/download.zip?format=both")
                                      .content)).namelist()
    assert len(both) == 20 and sum(n.endswith(".docx") for n in both) == 10

    one = world.get("a_admin", f"/hr/onboarding/new-hires/{h.id}/package/nda/download")
    assert one.status_code == 200 and one.content[:4] == b"%PDF"
    assert 'filename="RR_RAVURI_RUGVEDH_NON-DISCLOSURE_AGREEMENT.pdf"' in one.headers["content-disposition"]

    # the downloaded copy of a sent document is exactly what the new hire was sent
    issued_cat = sorted(sent)[0]
    from app.modules.doc_templates import storage
    world.db.refresh(h)
    stored = storage.get_store().get(P.package_file_key(h, issued_cat))
    assert world.get("a_admin", f"/hr/onboarding/new-hires/{h.id}/package/{issued_cat}/download").content == stored

    # tenant B can't download tenant A's hire
    assert world.get("b_admin", f"/hr/onboarding/new-hires/{h.id}/package/download.zip").status_code in (403, 404)
    assert world.get("a_admin", f"/hr/onboarding/new-hires/{h.id}/package/download.zip?format=xls").status_code == 422


def test_docx_download_is_a_word_document_with_the_hires_values(world):
    h = _hire(world)
    r = world.get("a_admin", f"/hr/onboarding/new-hires/{h.id}/package/offer_letter/download?format=docx")
    assert r.status_code == 200
    assert r.headers["content-type"].startswith("application/vnd.openxmlformats-officedocument.wordprocessingml.document")
    assert "RR_RAVURI_RUGVEDH_OFFER_LETTER.docx" in r.headers["content-disposition"]
    doc = Document(io.BytesIO(r.content))
    text = "\n".join(p.text for p in doc.paragraphs) + "\n".join(c.text for t in doc.tables for row in t.rows for c in row.cells)
    assert "Ravuri Rugvedh" in text
    header = "\n".join(p.text for p in doc.sections[0].header.paragraphs)
    assert "Offer Letter" in header and "DRAFT – NOT FOR ISSUE" in header
    footer_xml = doc.sections[0].footer._element.xml
    assert "Private and Confidential" in footer_xml and "NUMPAGES" in footer_xml


def test_bulk_generation_job(world):
    names = ["Ravuri Rugvedh", "Meera Iyer", "Sam Other"]
    hires = []
    for n in names:
        h = OnboardingNewHire(organization_id=1, candidate_name=n, email=f"{n.split()[0].lower()}@example.com", position="Analyst",
                              joining_date=date.today() + timedelta(days=14), status="offer_accepted", work_country="IN")
        world.db.add(h)
        world.db.commit()
        hires.append(h)
    r = world.post("a_admin", "/hr/onboarding/package/bulk-generate", json={"new_hire_ids": [h.id for h in hires]})
    assert r.status_code == 200, r.text
    job = r.json()
    status = world.get("a_admin", f"/hr/onboarding/package/jobs/{job['job_id']}").json()
    assert status["status"] == "completed" and status["done"] == 3 and status["failed"] == [] and status["download_ready"]
    z = zipfile.ZipFile(io.BytesIO(world.get("a_admin", f"/hr/onboarding/package/jobs/{job['job_id']}/download.zip").content))
    names_in_zip = z.namelist()
    assert len(names_in_zip) == 30
    for h in hires:
        folder = [n for n in names_in_zip if n.endswith(P.package_filename(h, "offer_letter", "pdf", "draft"))]
        assert len(folder) == 1 and folder[0].split("/")[0].endswith(f"_{h.id}")
    # isolation: another tenant can't see the job or generate for tenant A's hires
    assert world.get("b_admin", f"/hr/onboarding/package/jobs/{job['job_id']}").status_code == 404
    assert world.post("b_admin", "/hr/onboarding/package/bulk-generate", json={"new_hire_ids": [hires[0].id]}).status_code == 404
    assert world.post("a_admin", "/hr/onboarding/package/bulk-generate", json={"new_hire_ids": list(range(1, 60))}).status_code == 422


def test_issued_documents_keep_the_mode_and_version_they_were_issued_under(world, monkeypatch):
    """A later package version may change a document's mode (v2 turns the self-disclosure form into a declaration); a
    document already issued keeps behaving as it was issued."""
    h = _hire(world, "Keep Mode")
    r = world.post("a_admin", f"/hr/onboarding/new-hires/{h.id}/send-package")
    assert r.status_code == 200, r.text
    world.db.refresh(h)
    rows = P._rows(world.db, h)
    cat = next(c for c in ("daily_kpi", "daily_work_report", "velocity_report") if c in rows)
    row = rows[cat]
    meta = P.issued_meta(row)
    assert meta["version"] == C.PACKAGE_VERSION and meta["mode"] == C.DOCS[cat]["mode"]
    original = C.DOCS[cat]["mode"]
    monkeypatch.setitem(C.DOCS, cat, {**C.DOCS[cat], "mode": "SIGN" if original != "SIGN" else "INFO"})
    assert P.mode_of(cat) != original, "the package definition changed"
    assert P.mode_of(row) == original, "the issued document keeps its mode"
    legacy = type("Row", (), {"id": None, "category": cat, "new_hire": None})()
    assert P.mode_of(legacy) == C.DOCS[cat]["mode"], "rows issued before v2 fall back to the package definition"
