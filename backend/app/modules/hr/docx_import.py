"""Word (.docx) → onboarding package template content, with fidelity warnings and the placeholder checker.

Kept: paragraphs with heading levels (Title / Heading 1–3), bulleted and numbered lists, tables (the first row becomes the
column headings), bold (as **bold**), page breaks. Reported as fidelity warnings before saving, never silently dropped:
italic / underline, text boxes, images, headers and footers, multiple columns, footnotes and comments.

Placeholders: every ``{{ … }}`` must be a field of the package's Placeholder Dictionary or ``clause:<key>`` of the counsel
clause library. Unknown keys come back with "did you mean…?" suggestions; the import cannot be completed until each one is
fixed in the file or mapped to a known key.
"""
from __future__ import annotations

import difflib
import io
import re
from typing import Optional

from app.modules.hr import onboarding_package_content as C

PLACEHOLDER = re.compile(r"\{\{\s*([^{}]*?)\s*\}\}")
W = "{http://schemas.openxmlformats.org/wordprocessingml/2006/main}"
MAX_BLOCKS = 380


def body_items(body):
    """The paragraphs and tables of a Word body in reading order, including those inside content controls (the fill-in
    boxes of Word templates) and custom XML wrappers."""
    for child in body.iterchildren():
        if child.tag in (f"{W}p", f"{W}tbl"):
            yield child
        elif child.tag == f"{W}sdt":
            content = child.find(f"{W}sdtContent")
            if content is not None:
                yield from body_items(content)
        elif child.tag == f"{W}customXml":
            yield from body_items(child)


def known_key(key: str) -> bool:
    if key.startswith("clause:"):
        return key.split(":", 1)[1] in C.CLAUSES
    return key in C.FIELDS


def suggestions(key: str, n: int = 3) -> list[dict]:
    """Nearest known keys by spelling and by meaning (the dictionary's labels)."""
    norm = key.strip().lower().replace(" ", "_")
    if norm.startswith("clause:") or norm.startswith("clause."):
        pool = {f"clause:{k}": v[0] for k, v in C.CLAUSES.items()}
        target = "clause:" + norm.split(":", 1)[-1].split(".", 1)[-1]
    else:
        pool = {k: v[0] for k, v in C.FIELDS.items()}
        target = norm
    by_key = difflib.get_close_matches(target, list(pool), n=n, cutoff=0.5)
    words = set(re.split(r"[^a-z0-9]+", target)) - {""}
    scored = []
    for k, label in pool.items():
        lw = set(re.split(r"[^a-z0-9]+", f"{k} {label}".lower())) - {""}
        overlap = len(words & lw)
        if overlap:
            scored.append((overlap, k))
    by_label = [k for _o, k in sorted(scored, key=lambda x: (-x[0], x[1]))[:n]]
    out = list(dict.fromkeys(by_key + by_label))[:n]
    return [{"key": k, "label": pool[k]} for k in out]


def check_placeholders(content: list) -> list[dict]:
    """[{key, known, suggestions}] for every placeholder in the content, in first-use order."""
    from app.modules.doc_templates.blocks import _package_strings
    seen: dict = {}
    for text in _package_strings(content):
        for m in PLACEHOLDER.finditer(text):
            seen.setdefault(m.group(1).strip(), None)
    return [{"key": k, "known": known_key(k), "suggestions": [] if known_key(k) else suggestions(k)} for k in seen]


def apply_mapping(content: list, mapping: dict) -> list:
    """Replace unknown placeholder keys with the known keys the admin chose (`mapping`: {unknown: known})."""
    def fix(text: str) -> str:
        return PLACEHOLDER.sub(lambda m: "{{%s}}" % mapping.get(m.group(1).strip(), m.group(1).strip()), text)

    def walk(obj):
        if isinstance(obj, str):
            return fix(obj)
        if isinstance(obj, list):
            return [walk(x) for x in obj]
        if isinstance(obj, dict):
            return {k: (v if k in ("type", "id", "locked", "include_when", "key", "items_from") else walk(v)) for k, v in obj.items()}
        return obj
    return walk(content)


# ── conversion ───────────────────────────────────────────────────────────────────────────────────────────────────────
def _run_text(run) -> str:
    parts = []
    for child in run._r:
        tag = child.tag
        if tag == f"{W}t":
            parts.append(child.text or "")
        elif tag == f"{W}tab":
            parts.append(" ")
        elif tag in (f"{W}br", f"{W}cr") and child.get(f"{W}type") != "page":
            parts.append("<br/>")
    return "".join(parts)


def _clean_markup(text: str) -> str:
    """No bold markers inside placeholders; no empty bold pairs."""
    text = PLACEHOLDER.sub(lambda m: "{{" + m.group(1).replace("**", "").strip() + "}}", text)
    text = text.replace("****", "")
    return re.sub(r"\*\*(\s*)\*\*", r"\1", text)


def _paragraph_text(p, warn) -> tuple[str, bool]:
    """(text with **bold**, page break after)."""
    out, bold_open, page_break = [], False, False
    for run in p.runs:
        if any(br.get(f"{W}type") == "page" for br in run._r.iter(f"{W}br")):
            page_break = True
        txt = _run_text(run)
        if not txt:
            continue
        if run.italic or run.underline:
            warn("Italic and underlined text appears as normal text.")
        b = bool(run.bold)
        if b != bold_open:
            out.append("**")
            bold_open = b
        out.append(txt.replace("*", "∗") if "**" in txt else txt)
    if bold_open:
        out.append("**")
    text = "".join(out).replace(" ", " ")
    return _clean_markup(text).strip(), page_break


def _list_kind(p) -> Optional[str]:
    name = (p.style.name if p.style is not None else "") or ""
    num_pr = p._p.find(f"{W}pPr/{W}numPr")
    if "List Number" in name:
        return "number"
    if "List Bullet" in name or "List Paragraph" in name or num_pr is not None:
        # numbering format is not resolved; a numbered Word list keeps its items, shown as a bulleted list unless named
        return "number" if re.match(r"^\s*\d+[.)]\s", p.text or "") else "bullet"
    return None


def _heading_level(p) -> Optional[int]:
    name = ((p.style.name if p.style is not None else "") or "").lower()
    if name == "title":
        return 1
    m = re.match(r"heading (\d)", name)
    if m:
        return min(int(m.group(1)), 3)
    return None


def convert(data: bytes) -> dict:
    """{blocks, warnings, placeholders} for a .docx (already through docs_intake checks)."""
    from docx import Document
    doc = Document(io.BytesIO(data))
    warnings: list[str] = []

    def warn(msg: str):
        if msg not in warnings:
            warnings.append(msg)

    body = doc.element.body
    xml = body.xml if hasattr(body, "xml") else ""
    if "txbxContent" in xml:
        warn("Text inside text boxes is not included. Copy it into a normal paragraph if you need it.")
    if "<w:drawing" in xml or "<w:pict" in xml:
        warn("Your logo and letterhead are added from your Company Profile, so images in the file are not needed.")
    if "footnoteReference" in xml:
        warn("Footnotes are not included.")
    if "commentRangeStart" in xml or "commentReference" in xml:
        warn("Comments in the file are left out.")
    for section in doc.sections:
        cols = section._sectPr.find(f"{W}cols")
        if cols is not None and int(cols.get(f"{W}num") or 1) > 1:
            warn("Text in columns is shown in one column.")
        for part in (section.header, section.footer):
            try:
                if not part.is_linked_to_previous and any(p.text.strip() for p in part.paragraphs):
                    warn("Every document gets the standard header and footer with your company name, so the file's own header and footer are not needed.")
            except Exception:
                pass

    from docx.table import Table as DocxTable
    from docx.text.paragraph import Paragraph as DocxParagraph
    blocks: list = []
    pending_list: Optional[dict] = None

    def flush_list():
        nonlocal pending_list
        if pending_list and pending_list["items"]:
            blocks.append(pending_list)
        pending_list = None

    for child in body_items(body):
        if child.tag == f"{W}p":
            p = DocxParagraph(child, doc)
            text, page_break = _paragraph_text(p, warn)
            kind = _list_kind(p) if text else None
            level = _heading_level(p) if text else None
            if kind:
                item = re.sub(r"^\s*(?:\d+[.)]|[•▪◦-])\s*", "", text)
                if pending_list is None or pending_list["style"] != kind:
                    flush_list()
                    pending_list = {"type": "list", "style": kind, "items": []}
                pending_list["items"].append(item)
            else:
                flush_list()
                if level and text:
                    blocks.append({"type": "heading", "text": text.replace("**", ""), "level": level})
                elif text:
                    centred = p.alignment is not None and int(p.alignment) == 1 and text.startswith("**") and text.endswith("**")
                    if centred and len(text) < 120:
                        blocks.append({"type": "heading", "text": text.strip("*"), "level": 1, "style": "center"})
                    else:
                        blocks.append({"type": "paragraph", "text": text})
            if page_break:
                flush_list()
                blocks.append({"type": "page_break"})
        elif child.tag == f"{W}tbl":
            flush_list()
            t = DocxTable(child, doc)
            rows = []
            for r in t.rows:
                cells = []
                for c in r.cells:
                    cells.append(" ".join(_paragraph_text(pp, warn)[0] for pp in c.paragraphs if pp.text.strip()).replace("**", ""))
                rows.append(cells)
            width = max((len(r) for r in rows), default=0)
            rows = [r + [""] * (width - len(r)) for r in rows]
            if rows and width:
                head = rows[0] if any(rows[0]) else [f"Column {i + 1}" for i in range(width)]
                blocks.append({"type": "table", "columns": head, "rows": rows[1:] or [[""] * width]})
    flush_list()
    while blocks and blocks[-1]["type"] == "page_break":
        blocks.pop()
    if len(blocks) > MAX_BLOCKS:
        warn(f"The document is long: only the first {MAX_BLOCKS} parts were kept.")
        blocks = blocks[:MAX_BLOCKS]
    if not blocks:
        blocks = [{"type": "paragraph", "text": ""}]
        warn("No text was found in the document.")
    for i, b in enumerate(blocks, 1):
        b["id"] = f"u{i}"
    return {"blocks": blocks, "warnings": warnings, "placeholders": check_placeholders(blocks)}


def title_from(blocks: list, filename: str) -> str:
    for b in blocks:
        if b.get("type") == "heading" and b.get("text"):
            return b["text"].replace("**", "")[:200]
    stem = re.sub(r"\.[A-Za-z0-9]+$", "", filename or "Document")
    return re.sub(r"[_-]+", " ", stem).strip()[:200] or "Document"


def merge_with_locked(platform_blocks: list, uploaded: list) -> list:
    """An organisation version of a platform document: the uploaded text for the unlocked parts, the platform's locked blocks
    (signatures, declarations, statutory notices) kept unchanged and in their order after it."""
    locked = [b for b in platform_blocks if b.get("locked")]
    return [b for b in uploaded if not b.get("locked")] + locked
