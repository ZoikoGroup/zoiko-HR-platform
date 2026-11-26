"""Word-layout templates: an organisation's own .docx kept as the master of its document, so issued documents keep its exact
letterhead, fonts, numbering, tables, headers and footers.

When an organisation uploads a Word file that becomes one of its own templates (Word import, or "Set up docs for your
organisation"), the original file is stored next to the template version (``options["docx_master"]``) with the checksum of
the content it was converted to. When a document is issued from that version:

1. the master is filled in place: every ``{{field}}``, ``{{custom.<key>}}`` and ``{{clause:<key>}}`` in body paragraphs,
   table cells, headers and footers is replaced with the hire's value (the mapping step's sample values and blanks are
   replaced by their fields first);
2. the filled Word file is converted to PDF with LibreOffice (``soffice --headless``) when the server has it;
3. that PDF becomes the issued document, and the filled Word file is kept for "Download Word".

The block renderer is used instead – exactly as before – whenever the Word route cannot give a complete document: no
LibreOffice on the server, the template's wording was edited after upload (content checksum differs), a placeholder is left
unfilled, a blank such as "[Name]" is left in the file, or anything fails. The readiness rules are the same either way: a
document is only issued when every value it prints is present.

Paragraph-level filling keeps each paragraph's style, numbering and alignment; a paragraph that contained a placeholder
takes the formatting of its first run.
"""
from __future__ import annotations

import hashlib
import io
import json
import logging
import os
import re
import shutil
import subprocess
import tempfile
from typing import Callable, Optional

from app.modules.doc_templates import storage

logger = logging.getLogger("zoiko.onboarding.docx_master")

OPTION = "docx_master"
TIMEOUT = 90
_TOKEN = re.compile(r"\{\{\s*([^{}]*?)\s*\}\}")
_BLANK = re.compile(r"\[[^\[\]\n]{1,40}\]|_{5,}")


# ── storing the master ───────────────────────────────────────────────────────────────────────────────────────────────
def content_checksum(content) -> str:
    return hashlib.sha256(json.dumps(content or [], sort_keys=True, ensure_ascii=False, default=str).encode("utf-8")).hexdigest()


def attach(db, variant, data: bytes, *, replacements: Optional[list] = None, filename: str = "") -> None:
    """Keep `data` (a .docx) as the master of `variant` (a draft the organisation owns). `replacements` are the mapping
    step's confirmed {text, key, before} placeholders, applied when the master is filled."""
    from app.modules.doc_templates import content as CT
    key = storage.get_store().put(variant.owner_organization_id, f"docx-master-{variant.canonical_id}-v{variant.version}.docx",
                                  data)
    options = dict(variant.options or {})
    options[OPTION] = {"key": key, "sha256": hashlib.sha256(data).hexdigest(), "content_checksum": content_checksum(variant.content),
                       "replacements": [r for r in (replacements or []) if isinstance(r, dict) and r.get("text") and r.get("key")],
                       "filename": (filename or "")[:200]}
    variant.options = options
    variant.checksum = CT.variant_checksum(variant)
    db.flush()


def master_of(db, source: Optional[dict]) -> Optional[dict]:
    """The Word master of the version a document resolves to, if it still matches that version's content."""
    if not source or source.get("kind") != "variant" or not source.get("variant_id"):
        return None
    from app.modules.doc_templates.models import TemplateVariant
    v = db.get(TemplateVariant, source["variant_id"])
    m = (v.options or {}).get(OPTION) if v is not None else None
    if not m or not m.get("key"):
        return None
    if m.get("content_checksum") != content_checksum(v.content):
        return None                                   # wording edited after upload: the Word file no longer matches
    return m


# ── filling ──────────────────────────────────────────────────────────────────────────────────────────────────────────
def _paragraphs(doc, with_context: bool = False):
    """Every paragraph of the document: body, tables (nested), headers and footers (with their tables). With
    `with_context`, (paragraph, prefix) where prefix is the row's earlier cells ("Position | ") – the label a blank in a
    table cell follows, as the mapping step read it."""
    def walk(container, prefix=""):
        for p in container.paragraphs:
            yield (p, prefix) if with_context else p
        for t in getattr(container, "tables", []):
            for row in t.rows:
                seen = []
                for cell in row.cells:
                    pre = (" | ".join(seen) + " | ") if seen else ""
                    yield from walk(cell, pre)
                    text = " ".join((cell.text or "").split())
                    if text and text not in seen:
                        seen.append(text)
    yield from walk(doc)
    for section in doc.sections:
        for part in (section.header, section.footer, section.first_page_header, section.first_page_footer,
                     section.even_page_header, section.even_page_footer):
            try:
                if part is not None and not part.is_linked_to_previous:
                    yield from walk(part)
            except Exception:
                continue


def _set_text(p, text: str) -> None:
    runs = p.runs
    if not runs:
        p.add_run(text)
        return
    runs[0].text = text
    for r in runs[1:]:
        r.text = ""


def _apply_replacements(text: str, replacements: list, prefix: str = "") -> str:
    if not replacements:
        return text
    from app.modules.hr import docs_setup as DS
    out = DS._apply_placeholders([{"type": "paragraph", "text": prefix + text}], replacements)[0]["text"]
    if not prefix:
        return out
    if out.startswith(prefix):
        return out[len(prefix):]
    return DS._apply_placeholders([{"type": "paragraph", "text": text}], replacements)[0]["text"]


def fill(data: bytes, value_of: Callable[[str], Optional[str]], replacements: Optional[list] = None) -> tuple[bytes, list]:
    """(filled .docx bytes, placeholders left unfilled). `value_of(token)` returns the printed value or None."""
    import docx
    doc = docx.Document(io.BytesIO(data))
    left: list = []
    for p, prefix in _paragraphs(doc, with_context=True):
        original = "".join(r.text for r in p.runs) if p.runs else p.text
        if not original:
            continue
        text = _apply_replacements(original, replacements or [], prefix)

        def sub(m):
            tok = m.group(1).strip()
            v = value_of(tok)
            if v is None:
                left.append(tok)
                return m.group(0)
            return str(v).replace("**", "")
        text = _TOKEN.sub(sub, text)
        if text != original:
            _set_text(p, text)
    buf = io.BytesIO()
    doc.save(buf)
    return buf.getvalue(), list(dict.fromkeys(left))


def leftover_blanks(data: bytes) -> list[str]:
    """Bracketed or underlined blanks still in a filled file ("[Name]", "______")."""
    import docx
    doc = docx.Document(io.BytesIO(data))
    found = []
    for p in _paragraphs(doc):
        found += _BLANK.findall(p.text or "")
    return found


# ── converting ───────────────────────────────────────────────────────────────────────────────────────────────────────
def soffice_path() -> Optional[str]:
    from app.config import settings
    configured = getattr(settings, "LIBREOFFICE_PATH", "") or os.environ.get("HR_LIBREOFFICE_PATH", "")
    if configured and os.path.exists(configured):
        return configured
    for name in ("soffice", "libreoffice"):
        found = shutil.which(name)
        if found:
            return found
    for guess in (r"C:\Program Files\LibreOffice\program\soffice.exe", "/usr/bin/soffice", "/usr/lib/libreoffice/program/soffice",
                  "/Applications/LibreOffice.app/Contents/MacOS/soffice"):
        if os.path.exists(guess):
            return guess
    return None


def available() -> bool:
    return soffice_path() is not None


def to_pdf(data: bytes) -> Optional[bytes]:
    """The .docx converted to PDF by LibreOffice, or None (not installed, timed out, failed)."""
    exe = soffice_path()
    if exe is None:
        return None
    with tempfile.TemporaryDirectory(prefix="zhr-docx-") as tmp:
        src = os.path.join(tmp, "document.docx")
        with open(src, "wb") as fh:
            fh.write(data)
        profile = "file:///" + os.path.join(tmp, "profile").replace("\\", "/").lstrip("/")
        try:
            subprocess.run([exe, f"-env:UserInstallation={profile}", "--headless", "--norestore", "--convert-to", "pdf",
                            "--outdir", tmp, src], check=True, timeout=TIMEOUT, stdout=subprocess.DEVNULL,
                           stderr=subprocess.DEVNULL)
        except (subprocess.SubprocessError, OSError):
            logger.exception("LibreOffice conversion failed")
            return None
        out = os.path.join(tmp, "document.pdf")
        if not os.path.exists(out):
            return None
        with open(out, "rb") as fh:
            return fh.read()


# ── issuing ──────────────────────────────────────────────────────────────────────────────────────────────────────────
def _value_of(ctx) -> Callable[[str], Optional[str]]:
    def value_of(tok: str) -> Optional[str]:
        if tok.startswith("clause:"):
            v = ctx.clause_value(tok.split(":", 1)[1])
            if v is None:
                return None
            return v[1] or ""
        return ctx.field_value(tok)
    return value_of


def render_for_issue(db, ctx) -> Optional[dict]:
    """{"pdf", "docx"} for a document issued from a Word-layout template, or None (use the block renderer)."""
    try:
        m = master_of(db, ctx.source)
        if m is None or not available():
            return None
        data = storage.get_store().get(m["key"])
        filled, left = fill(data, _value_of(ctx), m.get("replacements"))
        if left:
            logger.info("Word master of %s left %d placeholder(s) unfilled; block renderer used", ctx.source.get("canonical_id"),
                        len(left))
            return None
        if leftover_blanks(filled):
            return None
        pdf = to_pdf(filled)
        if not pdf:
            return None
        from app.modules.doc_templates import renderer
        if "{{" in renderer.pdf_text(pdf):
            return None
        return {"pdf": pdf, "docx": filled}
    except Exception:
        logger.exception("Word master could not be used for %s", (ctx.source or {}).get("canonical_id"))
        return None


def status(db, organization_id: int) -> dict:
    """For Settings: whether this server can issue Word-layout documents, and which templates have a Word master."""
    from app.modules.doc_templates.models import TemplateVariant
    rows = (db.query(TemplateVariant).filter(TemplateVariant.owner_organization_id == organization_id).all())
    with_master = sorted({v.canonical_id for v in rows if (v.options or {}).get(OPTION)})
    return {"converter_available": available(), "templates_with_word_layout": with_master}
