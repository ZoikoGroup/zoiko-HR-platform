"""Documents Phase 1: upload pre-checks 1-3 and the encrypted store."""
import io
import zipfile

import pytest

from app.modules.hr.documents import scan, storage_service
from app.modules.hr.documents.precheck import COMPANY_EXTENSIONS, run_prechecks


def _pdf(pages=1, password=None) -> bytes:
    from pypdf import PdfWriter
    w = PdfWriter()
    for _ in range(pages):
        w.add_blank_page(width=200, height=200)
    if password:
        w.encrypt(password)
    buf = io.BytesIO()
    w.write(buf)
    return buf.getvalue()


def _png() -> bytes:
    from PIL import Image
    buf = io.BytesIO()
    Image.new("RGB", (4, 4), "white").save(buf, "PNG")
    return buf.getvalue()


def _docx(macro=False) -> bytes:
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as zf:
        zf.writestr("[Content_Types].xml", "<Types/>")
        zf.writestr("word/document.xml", "<w:document/>")
        if macro:
            zf.writestr("word/vbaProject.bin", b"\x00" * 10)
    return buf.getvalue()


@pytest.mark.parametrize("name,data", [("id.pdf", _pdf()), ("scan.png", _png()), ("cv.docx", _docx())],
                         ids=lambda v: v if isinstance(v, str) else "bytes")
def test_good_files_pass(name, data):
    assert run_prechecks(data, name).status == "pass"


@pytest.mark.parametrize("name,data,message", [
    ("run.exe", b"MZ....", "not accepted"),
    ("notes.txt", b"hello", "not accepted"),                      # employees: documents and images only
    ("empty.pdf", b"", "empty"),
    ("fake.pdf", b"MZ\x90\x00 this is an executable", "do not match"),
    ("fake.png", _pdf(), "do not match"),
    ("broken.pdf", b"%PDF-1.4\n garbage", "damaged"),
    ("locked.pdf", _pdf(password="secret"), "password"),
    ("macro.docx", _docx(macro=True), "macros"),
    ("big.pdf", b"%PDF" + b"0" * (10 * 1024 * 1024 + 1), "larger than"),
], ids=lambda v: v if isinstance(v, str) else "bytes")
def test_bad_files_are_blocked_with_a_reason(name, data, message):
    result = run_prechecks(data, name)
    assert result.status == "fail"
    assert message in result.failures[0].message


def test_company_documents_accept_the_wider_office_set():
    assert run_prechecks(b"a,b\n1,2\n", "list.csv", allowed_extensions=COMPANY_EXTENSIONS).status == "pass"


class _Infected:
    def scan(self, data, filename):
        return scan.ScanResult("infected", "Eicar-Test-Signature")


class _Down:
    def scan(self, data, filename):
        return scan.ScanResult("error", "scanner unavailable")


def test_infected_files_are_blocked_and_scanner_outages_warn():
    try:
        scan.set_scanner(_Infected())
        assert run_prechecks(_pdf(), "id.pdf").status == "fail"
        scan.set_scanner(_Down())
        result = run_prechecks(_pdf(), "id.pdf")
        assert result.status == "warn" and result.scan_status == "error"
    finally:
        scan.set_scanner(None)


def test_uploads_are_stored_encrypted_under_the_tenant(tmp_store):
    data = _pdf()
    stored = storage_service.store_upload(7, data, "../../etc/My Passport.pdf")
    assert stored.storage_key.startswith("t7/") and stored.storage_key.endswith(".pdf.henc")
    assert stored.file_name == "My Passport.pdf" and stored.is_encrypted and stored.size == len(data)
    on_disk = (tmp_store / stored.storage_key).read_bytes()
    assert b"%PDF" not in on_disk                                   # encrypted at rest
    assert storage_service.read_key(stored.storage_key) == data


def test_a_rejected_upload_writes_nothing(tmp_store):
    with pytest.raises(storage_service.UploadRejected) as exc:
        storage_service.store_upload(7, b"MZ executable", "id.pdf")
    assert exc.value.status_code == 422 and exc.value.error_code == "DOC_PRECHECK_FAILED"
    assert any(c["status"] == "fail" for c in exc.value.checks)
    assert not any(tmp_store.rglob("*.henc"))


def test_open_for_read_serves_new_and_legacy_files(tmp_store, tmp_path, monkeypatch):
    from types import SimpleNamespace
    stored = storage_service.store_upload(3, _png(), "a.png")
    assert storage_service.open_for_read(SimpleNamespace(storage_key=stored.storage_key)) == storage_service.read_key(stored.storage_key)

    legacy = tmp_path / "legacy" / "t3" / "old.pdf"
    legacy.parent.mkdir(parents=True)
    legacy.write_bytes(b"%PDF old")
    monkeypatch.setattr("app.modules.hr.file_storage.resolve_stored_file", lambda p: str(legacy))
    assert storage_service.open_for_read(SimpleNamespace(storage_key=None, file_path=str(legacy), organization_id=3)) == b"%PDF old"
    assert storage_service.open_for_read(SimpleNamespace(storage_key=None, file_path=str(legacy), organization_id=4)) is None
