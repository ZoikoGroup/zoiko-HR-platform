"""Server-side rendering of structured content to HTML (preview, e-mail safe) and PDF (ReportLab Platypus).

Both outputs come from one resolved layout (`layout()`), so the preview and the PDF can never say different things.
Every piece of text is escaped on output: field values, clause text and template text alike. Nothing is evaluated.

* HTML: a self-contained page with inline styles only (no scripts, no external assets). It is built from escaped text and a
  fixed set of tags; the general-purpose `core/html_sanitizer` is not applied on top because its allow-list drops tables.
* PDF: embedded Noto Sans (Latin, Greek, Cyrillic) and Noto Sans Devanagari, per-script font runs, letterhead from the
  employer entity, footer with document number, page X of Y, a Confidential marker for C3/C4 and a verification line.
  ReportLab does not shape complex scripts: Devanagari conjuncts may render in their unshaped form, and scripts with no
  bundled font (CJK, Arabic, Hebrew, Thai) are not supported yet. See docs/templates/operations.md.
* Deterministic: same input → byte-identical HTML and PDF (`invariant=1`, fixed metadata, no timestamps of its own).
"""
from __future__ import annotations

import html
import io
import logging
import re
from dataclasses import dataclass, field
from pathlib import Path
from typing import Callable, Optional

from app.modules.doc_templates import conditions, fields, resolver
from app.modules.doc_templates.resolver import Run

logger = logging.getLogger("zoiko.doc_templates")

FONT_DIR = Path(__file__).parent / "fonts"
PARTY_LABELS = {"employer": "For and on behalf of the employer", "employee": "Employee", "candidate": "Candidate",
                "witness": "Witness", "reviewer": "Reviewer"}


@dataclass
class RenderInput:
    blocks: list
    value_of: Callable[[str], str]               # formatted value of a field
    raw_values: dict                             # raw values for include_when
    clause_text: Callable[[str], Optional[str]]
    required_clause_keys: list
    rows_of: Callable[[str], list] = lambda key: []
    items_of: Callable[[str], list] = lambda key: []      # list fields -> list of display strings
    form_values: dict = field(default_factory=dict)       # filled form records: key -> display value
    checklist_state: dict = field(default_factory=dict)   # checklist records: key -> {"done", "on", "note"}
    labels: dict = field(default_factory=dict)   # field key -> label (field_group)
    signatures: dict = field(default_factory=dict)   # party -> text shown on the signature line
    # document meta
    document_number: str = ""
    title: str = ""
    verify_url: str = ""
    confidential: bool = False
    language: str = "en"
    letterhead: dict = field(default_factory=dict)   # legal_name, trading_name, address, registration, logo_path
    author: str = ""
    landscape: bool = False                      # wide engine records (registers with many columns)
    visual_profile: str = "standard"             # presentation only; never changes template wording or data


# ── layout ───────────────────────────────────────────────────────────────────────────────────────────────────────────

@dataclass
class El:
    kind: str
    runs: list = field(default_factory=list)     # list[Run] or nested lists
    data: dict = field(default_factory=dict)


def _runs(text: str, inp: RenderInput, literal: bool = False) -> list[Run]:
    if literal:                                   # engine-built records: values are data, never parsed for placeholders
        return [Run(text or "")]
    return resolver.resolve(text, inp.value_of, inp.clause_text, inp.required_clause_keys)


def layout(inp: RenderInput) -> list[El]:
    out: list[El] = []
    for block in inp.blocks:
        cond = block.get("include_when")
        if cond is not None and not conditions.evaluate(cond, inp.raw_values):
            continue
        t = block["type"]
        lit = bool(block.get("literal"))
        if t == "letterhead":
            out.append(El("letterhead", data=dict(inp.letterhead)))
        elif t == "heading":
            out.append(El("heading", _runs(block["text"], inp, lit), {"level": block.get("level", 1)}))
        elif t == "paragraph":
            out.append(El("paragraph", _runs(block["text"], inp, lit), {"style": block.get("style") or "normal"}))
        elif t == "list":
            items = [str(i) for i in inp.items_of(block["items_from"])] if block.get("items_from") else block["items"]
            if not items:
                continue                                   # a bound list with nothing in it is left out, not printed empty
            lit_items = lit or bool(block.get("items_from"))    # bound items are data: never parsed for placeholders
            out.append(El("list", [_runs(i, inp, lit_items) for i in items], {"style": block.get("style", "bullet")}))
        elif t == "table":
            cols = [resolver.plain(_runs(c, inp, lit)) for c in block["columns"]]
            if block.get("rows_from"):
                rows = [[str(c) if c is not None else "" for c in r] for r in inp.rows_of(block["rows_from"])]
            else:
                rows = [[resolver.plain(_runs(c if isinstance(c, str) else ("" if c is None else str(c)), inp, lit)) for c in r]
                        for r in block["rows"]]
            out.append(El("table", data={"columns": cols, "rows": rows}))
        elif t == "field_group":
            if block.get("pairs") is not None:            # literal label/value pairs (engine-built records)
                out.append(El("kv", data={"rows": [(str(a), "" if b is None else str(b)) for a, b in block["pairs"]]}))
                continue
            labels = block.get("labels") or {}
            rows = [(labels.get(k) or inp.labels.get(k) or fields.REGISTRY[k].label, inp.value_of(k)) for k in block["fields"]]
            out.append(El("kv", data={"rows": rows}))
        elif t == "form_fields":
            out.append(El("form", data={"fields": block["fields"], "values": inp.form_values}))
        elif t == "checklist":
            out.append(El("checklist", data={"items": block["items"], "state": inp.checklist_state}))
        elif t == "clause":
            body = inp.clause_text(block["key"])
            if body is None:
                if block.get("required", True):
                    raise LookupError(f"CLAUSE_UNRESOLVED:{block['key']}")
                continue                                   # optional clause not resolved: omitted
            out.append(El("paragraph", [Run(r.text, "clause" if r.kind == "text" else r.kind)
                                        for r in resolver.resolve(body, inp.value_of, inp.clause_text, [], inside_clause=True)],
                          {"style": "normal"}))
        elif t == "declaration":
            out.append(El("declaration", _runs(block["text"], inp, lit), {"mode": block["mode"]}))
        elif t == "signature_block":
            out.append(El("signatures", data={"parties": [(p, inp.signatures.get(p) or "______________________________")
                                                          for p in block["parties"]]}))
        elif t == "page_break":
            out.append(El("page_break"))
    return out


# ── HTML ─────────────────────────────────────────────────────────────────────────────────────────────────────────────

_E = html.escape
_CSS = {
    "page": "font-family:'Noto Sans',Arial,Helvetica,sans-serif;color:#1f2937;font-size:14px;line-height:1.55;max-width:760px;margin:0 auto;padding:24px;",
    "lh": "border-bottom:2px solid #1f2937;padding-bottom:12px;margin-bottom:20px;",
    "lh_name": "font-size:18px;font-weight:700;margin:0;",
    "lh_meta": "font-size:12px;color:#4b5563;margin:2px 0 0;",
    "h1": "font-size:20px;margin:18px 0 8px;", "h2": "font-size:16px;margin:16px 0 6px;", "h3": "font-size:14px;margin:14px 0 4px;",
    "p": "margin:0 0 10px;white-space:pre-wrap;", "small": "margin:0 0 10px;font-size:12px;color:#4b5563;white-space:pre-wrap;",
    "notice": "margin:0 0 10px;padding:10px 12px;background:#f3f4f6;border-left:3px solid #6b7280;white-space:pre-wrap;",
    "table": "border-collapse:collapse;width:100%;margin:0 0 12px;font-size:13px;",
    "th": "border:1px solid #d1d5db;background:#f9fafb;text-align:left;padding:6px 8px;",
    "td": "border:1px solid #d1d5db;padding:6px 8px;vertical-align:top;",
    "kv_l": "padding:4px 12px 4px 0;color:#4b5563;vertical-align:top;width:38%;", "kv_v": "padding:4px 0;vertical-align:top;",
    "decl": "margin:12px 0;padding:12px;border:1px solid #9ca3af;white-space:pre-wrap;",
    "sig": "display:inline-block;width:46%;margin:18px 2% 0 0;vertical-align:top;",
    "footer": "margin-top:28px;padding-top:8px;border-top:1px solid #d1d5db;font-size:11px;color:#6b7280;",
}


def _check_note(state) -> str:
    if not state:
        return ""
    bits = [f"completed {state['on']}" if state.get("done") and state.get("on") else "", state.get("note") or ""]
    return "; ".join(b for b in bits if b)


def _html_runs(runs: list[Run]) -> str:
    return "".join(_E(r.text) for r in runs)


def render_html(inp: RenderInput, elements: Optional[list] = None) -> str:
    elements = layout(inp) if elements is None else elements
    offer_design = inp.visual_profile == "offer_letter"
    parts: list[str] = []
    lists = {"bullet": "ul", "number": "ol", "check": "ul"}
    offer_meta_pending = offer_design
    if offer_design:
        parts.append('<div aria-hidden="true" style="height:5px;background:#0f4c5c;border-radius:3px;margin:0 0 24px;"></div>')
    for el in elements:
        k = el.kind
        if k == "letterhead":
            d = el.data
            letterhead_style = (_CSS["lh"] + "border-bottom-color:#0f4c5c;padding-bottom:16px;margin-bottom:22px;") if offer_design else _CSS["lh"]
            name_style = (_CSS["lh_name"] + "font-size:21px;color:#102a43;letter-spacing:-.2px;") if offer_design else _CSS["lh_name"]
            parts.append(f'<div style="{letterhead_style}"><p style="{name_style}">{_E(d.get("legal_name") or "")}</p>')
            if d.get("trading_name") and d.get("trading_name") != d.get("legal_name"):
                parts.append(f'<p style="{_CSS["lh_meta"]}">Trading as {_E(d["trading_name"])}</p>')
            for key in ("address", "registration"):
                if d.get(key):
                    parts.append(f'<p style="{_CSS["lh_meta"]}">{_E(d[key])}</p>')
            parts.append("</div>")
        elif k == "heading":
            lvl = el.data.get("level", 1)
            heading_style = _CSS["h" + str(lvl)]
            if offer_design and lvl == 1:
                heading_style += "font-size:29px;line-height:1.2;color:#102a43;letter-spacing:-.6px;margin:26px 0 14px;"
            elif offer_design and lvl == 2:
                heading_style += "font-size:15px;line-height:1.35;color:#0f4c5c;border-left:3px solid #0f4c5c;background:#f1f7f8;padding:7px 10px;margin:22px 0 10px;"
            elif offer_design and lvl == 3:
                heading_style += "color:#0f4c5c;"
            parts.append(f'<h{lvl} style="{heading_style}">{_html_runs(el.runs)}</h{lvl}>')
        elif k == "paragraph":
            paragraph_text = "".join(run.text for run in el.runs)
            style_key = el.data.get("style", "normal") if el.data.get("style") != "normal" else "p"
            paragraph_style = _CSS[style_key]
            if offer_design and offer_meta_pending:
                paragraph_style += "font-size:11px;color:#64748b;letter-spacing:.15px;margin:0 0 8px;"
                offer_meta_pending = False
            elif offer_design and paragraph_text.lstrip().startswith("Pay:"):
                paragraph_style += "margin:14px 0;padding:12px 14px;background:#f1f7f8;border:1px solid #d7e8e9;border-left:4px solid #0f4c5c;border-radius:5px;font-size:15px;font-weight:600;color:#102a43;"
            parts.append(f'<p style="{paragraph_style}">{_html_runs(el.runs)}</p>')
        elif k == "list":
            tag = lists[el.data["style"]]
            marker = "list-style:none;padding-left:4px;" if el.data["style"] == "check" else ""
            items = "".join(f'<li style="margin:0 0 4px;">{"&#9744; " if el.data["style"] == "check" else ""}{_html_runs(r)}</li>'
                            for r in el.runs)
            parts.append(f'<{tag} style="margin:0 0 10px;{marker}">{items}</{tag}>')
        elif k == "table":
            if offer_design:
                head = "".join(f'<th style="border:0;border-bottom:2px solid #0f4c5c;background:#102a43;color:#fff;text-align:left;padding:9px 10px;font-size:12px;">{_E(c)}</th>' for c in el.data["columns"])
                body = "".join("<tr>" + "".join(f'<td style="border-bottom:1px solid #e2e8f0;background:{"#f8fafc" if i % 2 else "#fff"};padding:8px 10px;vertical-align:top;">{_E(c)}</td>' for c in r) + "</tr>" for i, r in enumerate(el.data["rows"]))
                table_style = _CSS["table"] + "border:1px solid #e2e8f0;border-radius:5px;overflow:hidden;margin:4px 0 16px;"
            else:
                head = "".join(f'<th style="{_CSS["th"]}">{_E(c)}</th>' for c in el.data["columns"])
                body = "".join("<tr>" + "".join(f'<td style="{_CSS["td"]}">{_E(c)}</td>' for c in r) + "</tr>" for r in el.data["rows"])
                table_style = _CSS["table"]
            parts.append(f'<table style="{table_style}"><thead><tr>{head}</tr></thead><tbody>{body}</tbody></table>')
        elif k == "kv":
            if offer_design:
                rows = "".join(f'<tr><td style="padding:8px 10px;border-bottom:1px solid #e2e8f0;background:#f8fafc;color:#52677a;vertical-align:top;width:38%;font-size:11px;">{_E(lbl)}</td><td style="padding:8px 10px;border-bottom:1px solid #e2e8f0;color:#102a43;vertical-align:top;font-weight:600;">{_E(val)}</td></tr>'
                               for lbl, val in el.data["rows"])
                parts.append(f'<table style="border-collapse:collapse;width:100%;margin:0 0 16px;border:1px solid #e2e8f0;">{rows}</table>')
            else:
                rows = "".join(f'<tr><td style="{_CSS["kv_l"]}">{_E(lbl)}</td><td style="{_CSS["kv_v"]}">{_E(val)}</td></tr>'
                               for lbl, val in el.data["rows"])
                parts.append(f'<table style="border-collapse:collapse;width:100%;margin:0 0 12px;">{rows}</table>')
        elif k == "form":
            vals = el.data.get("values") or {}
            rows = "".join(
                f'<tr><td style="{_CSS["kv_l"]}">{_E(f["label"])}{" *" if f.get("required") else ""}</td>'
                f'<td style="{_CSS["kv_v"]}">{_E(str(vals[f["key"]])) if vals.get(f["key"]) not in (None, "") else "______________________________"}</td></tr>'
                for f in el.data["fields"])
            parts.append(f'<table style="border-collapse:collapse;width:100%;margin:0 0 12px;">{rows}</table>')
        elif k == "checklist":
            st = el.data.get("state") or {}
            items = "".join(
                f'<li style="margin:0 0 4px;">{"&#9745;" if (st.get(it["key"]) or {}).get("done") else "&#9744;"} {_E(it["label"])}'
                f'{" (mandatory)" if it.get("mandatory") else ""}{" — owner: " + _E(it["owner_role"]) if it.get("owner_role") else ""}'
                f'{" — " + _E(_check_note(st.get(it["key"]))) if _check_note(st.get(it["key"])) else ""}</li>'
                for it in el.data["items"])
            parts.append(f'<ul style="margin:0 0 10px;list-style:none;padding-left:4px;">{items}</ul>')
        elif k == "declaration":
            declaration_style = _CSS["decl"]
            if offer_design:
                declaration_style += "border-color:#cbdde0;border-left:4px solid #0f4c5c;background:#f6fafb;border-radius:4px;padding:14px 16px;"
            parts.append(f'<div style="{declaration_style}">{_html_runs(el.runs)}</div>')
        elif k == "signatures":
            sig_style = _CSS["sig"] + ("border-top:1px solid #9fb7bf;padding-top:10px;margin-top:20px;" if offer_design else "")
            sigs = "".join(f'<div style="{sig_style}"><div style="font-size:12px;color:#4b5563;">{_E(PARTY_LABELS.get(p, p))}</div>'
                           f'<div style="margin-top:22px;">{_E(text)}</div></div>' for p, text in el.data["parties"])
            parts.append(f"<div>{sigs}</div>")
        elif k == "page_break":
            parts.append('<hr style="border:none;border-top:1px dashed #d1d5db;margin:24px 0;">')
    footer = [f"Document {_E(inp.document_number)}"] if inp.document_number else []
    if inp.confidential:
        footer.append("Confidential")
    if inp.verify_url:
        footer.append(f"Verify at {_E(inp.verify_url)}")
    body = "".join(parts)
    foot = f'<div style="{_CSS["footer"]}">{" · ".join(footer)}</div>' if footer else ""
    lang = _E(inp.language or "en")
    direction = text_direction(inp.language)
    page_style = _CSS["page"] + ("max-width:720px;padding:34px 42px 38px;color:#263746;line-height:1.68;" if offer_design else "")
    footer_style = _CSS["footer"] + ("border-top-color:#cbdde0;padding-top:12px;" if offer_design else "")
    if foot and offer_design:
        foot = f'<div style="{footer_style}">{" · ".join(footer)}</div>'
    return (f'<!DOCTYPE html><html lang="{lang}" dir="{direction}"><head><meta charset="utf-8"><title>{_E(inp.title)}</title></head>'
            f'<body style="margin:0;background:#ffffff;"><div dir="{direction}" style="{page_style}">{body}{foot}</div></body></html>')


RTL_LANGUAGES = {"ar", "he", "fa", "ur"}


def text_direction(language: Optional[str]) -> str:
    """Block direction for a variant language. Right-to-left packs (Arabic, Hebrew, Persian, Urdu) stay inactive until their
    fonts and shaping are bundled (docs/templates/operations.md); the direction is already honoured in HTML and PDF."""
    return "rtl" if (language or "en").split("-")[0].lower() in RTL_LANGUAGES else "ltr"


# ── PDF ──────────────────────────────────────────────────────────────────────────────────────────────────────────────

_FONTS_READY: Optional[dict] = None
_DEVANAGARI = re.compile(r"([ऀ-ॿ꣠-ꣿ᳐-᳿]+)")


def _fonts() -> dict:
    """Register the bundled fonts once. Falls back to Helvetica (Latin-1 only) if the files are missing."""
    global _FONTS_READY
    if _FONTS_READY is not None:
        return _FONTS_READY
    from reportlab.lib.fonts import addMapping
    from reportlab.pdfbase import pdfmetrics
    from reportlab.pdfbase.ttfonts import TTFont

    names = {"regular": "Helvetica", "bold": "Helvetica-Bold", "deva": None, "deva_bold": None}
    try:
        pdfmetrics.registerFont(TTFont("ZNoto", str(FONT_DIR / "NotoSans-Regular.ttf")))
        pdfmetrics.registerFont(TTFont("ZNoto-Bold", str(FONT_DIR / "NotoSans-Bold.ttf")))
        addMapping("ZNoto", 0, 0, "ZNoto")
        addMapping("ZNoto", 1, 0, "ZNoto-Bold")
        addMapping("ZNoto", 0, 1, "ZNoto")
        addMapping("ZNoto", 1, 1, "ZNoto-Bold")
        names.update(regular="ZNoto", bold="ZNoto-Bold")
    except Exception:                                     # pragma: no cover - only without the bundled files
        logger.warning("doc_templates: Noto Sans not found in %s; PDFs fall back to Helvetica", FONT_DIR)
    try:
        pdfmetrics.registerFont(TTFont("ZNotoDeva", str(FONT_DIR / "NotoSansDevanagari-Regular.ttf")))
        pdfmetrics.registerFont(TTFont("ZNotoDeva-Bold", str(FONT_DIR / "NotoSansDevanagari-Bold.ttf")))
        names.update(deva="ZNotoDeva", deva_bold="ZNotoDeva-Bold")
    except Exception:                                     # pragma: no cover
        logger.warning("doc_templates: Noto Sans Devanagari not found; Devanagari text will not render")
    _FONTS_READY = names
    return names


def _xml(text: str, bold: bool = False) -> str:
    """Escape for a ReportLab Paragraph and wrap non-Latin script runs in their font."""
    f = _fonts()
    out = []
    for i, piece in enumerate(_DEVANAGARI.split(text)):
        if not piece:
            continue
        esc = html.escape(piece, quote=False).replace("\n", "<br/>")
        if i % 2 == 1 and f["deva"]:
            out.append(f'<font name="{f["deva_bold"] if bold else f["deva"]}">{esc}</font>')
        else:
            out.append(esc)
    return "".join(out)


def _xml_runs(runs: list[Run]) -> str:
    return "".join(_xml(r.text) for r in runs)


def render_pdf(inp: RenderInput, elements: Optional[list] = None) -> bytes:
    from reportlab.lib import colors
    from reportlab.lib.enums import TA_LEFT
    from reportlab.lib.pagesizes import A4, landscape as _landscape
    from reportlab.lib.styles import ParagraphStyle
    from reportlab.lib.units import mm
    from reportlab.pdfgen import canvas as rl_canvas
    from reportlab.platypus import (Image, KeepTogether, ListFlowable, ListItem, PageBreak, Paragraph, SimpleDocTemplate,
                                    Spacer, Table, TableStyle)

    elements = layout(inp) if elements is None else elements
    offer_design = inp.visual_profile == "offer_letter"
    f = _fonts()
    from reportlab.lib.enums import TA_RIGHT
    align = TA_RIGHT if text_direction(inp.language) == "rtl" else TA_LEFT
    base = ParagraphStyle("base", fontName=f["regular"], fontSize=10, leading=14, alignment=align, textColor=colors.HexColor("#1f2937"))
    st = {
        "p": ParagraphStyle("p", parent=base, spaceAfter=6),
        "small": ParagraphStyle("small", parent=base, fontSize=8.5, leading=11.5, textColor=colors.HexColor("#4b5563"), spaceAfter=6),
        "notice": ParagraphStyle("notice", parent=base, backColor=colors.HexColor("#f3f4f6"), borderPadding=6, spaceAfter=10, spaceBefore=4),
        "h1": ParagraphStyle("h1", parent=base, fontName=f["bold"], fontSize=15, leading=19, spaceBefore=8, spaceAfter=6),
        "h2": ParagraphStyle("h2", parent=base, fontName=f["bold"], fontSize=12, leading=16, spaceBefore=8, spaceAfter=4),
        "h3": ParagraphStyle("h3", parent=base, fontName=f["bold"], fontSize=10.5, leading=14, spaceBefore=6, spaceAfter=3),
        "lh_name": ParagraphStyle("lh_name", parent=base, fontName=f["bold"], fontSize=13, leading=16),
        "lh_meta": ParagraphStyle("lh_meta", parent=base, fontSize=8.5, leading=11, textColor=colors.HexColor("#4b5563")),
        "cell": ParagraphStyle("cell", parent=base, fontSize=9, leading=12),
        "cell_b": ParagraphStyle("cell_b", parent=base, fontName=f["bold"], fontSize=9, leading=12),
        "label": ParagraphStyle("label", parent=base, fontSize=9, leading=12, textColor=colors.HexColor("#4b5563")),
        "decl": ParagraphStyle("decl", parent=base, borderColor=colors.HexColor("#9ca3af"), borderWidth=0.6, borderPadding=7,
                               spaceBefore=8, spaceAfter=12),
    }
    if offer_design:
        st["h1"] = ParagraphStyle("offer_h1", parent=st["h1"], fontSize=21, leading=27,
                                   textColor=colors.HexColor("#102a43"), spaceBefore=15, spaceAfter=12)
        st["h2"] = ParagraphStyle("offer_h2", parent=st["h2"], fontSize=11.5, leading=15,
                                   textColor=colors.HexColor("#0f4c5c"), backColor=colors.HexColor("#f1f7f8"),
                                   borderPadding=6, spaceBefore=13, spaceAfter=8)
        st["offer_meta"] = ParagraphStyle("offer_meta", parent=st["small"], fontSize=8.5, leading=12,
                                           textColor=colors.HexColor("#64748b"), spaceAfter=7)
        st["offer_value"] = ParagraphStyle("offer_value", parent=st["cell_b"], fontSize=9.5, leading=13,
                                            textColor=colors.HexColor("#102a43"))
        st["offer_table_header"] = ParagraphStyle("offer_table_header", parent=st["cell_b"], fontSize=9, leading=12,
                                                   textColor=colors.white)
        st["offer_pay"] = ParagraphStyle("offer_pay", parent=base, fontName=f["bold"], fontSize=11.5, leading=16,
                                         textColor=colors.HexColor("#102a43"), backColor=colors.HexColor("#f1f7f8"),
                                         borderColor=colors.HexColor("#d7e8e9"), borderWidth=0.6, borderPadding=8,
                                         spaceBefore=5, spaceAfter=12)
        st["offer_decl"] = ParagraphStyle("offer_decl", parent=st["decl"], backColor=colors.HexColor("#f6fafb"),
                                           borderColor=colors.HexColor("#9fb7bf"), borderWidth=0.8, borderPadding=9,
                                           spaceBefore=9, spaceAfter=13)
        st["lh_name"] = ParagraphStyle("offer_lh_name", parent=st["lh_name"], fontSize=16, leading=20,
                                        textColor=colors.HexColor("#102a43"))
    story = []
    grid = TableStyle([("GRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#d1d5db")),
                       ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#f9fafb")),
                       ("VALIGN", (0, 0), (-1, -1), "TOP"), ("LEFTPADDING", (0, 0), (-1, -1), 4), ("RIGHTPADDING", (0, 0), (-1, -1), 4)])
    page = _landscape(A4) if inp.landscape else A4
    width = page[0] - 40 * mm
    offer_meta_pending = offer_design
    for el in elements:
        k = el.kind
        if k == "letterhead":
            d = el.data
            rows = [Paragraph(_xml(d.get("legal_name") or ""), st["lh_name"])]
            if d.get("trading_name") and d.get("trading_name") != d.get("legal_name"):
                rows.append(Paragraph(_xml("Trading as " + d["trading_name"]), st["lh_meta"]))
            for key in ("address", "registration"):
                if d.get(key):
                    rows.append(Paragraph(_xml(d[key]), st["lh_meta"]))
            logo = d.get("logo_path")
            if logo:
                try:
                    img = Image(logo)
                    ratio = img.imageHeight / float(img.imageWidth or 1)
                    img.drawWidth, img.drawHeight = 28 * mm, 28 * mm * ratio
                    t = Table([[rows, img]], colWidths=[width - 32 * mm, 32 * mm])
                except Exception:
                    t = Table([[rows]], colWidths=[width])
            else:
                t = Table([[rows]], colWidths=[width])
            t.setStyle(TableStyle([("LINEBELOW", (0, 0), (-1, 0), 1.8 if offer_design else 1.2,
                                    colors.HexColor("#0f4c5c" if offer_design else "#1f2937")),
                                   ("VALIGN", (0, 0), (-1, -1), "TOP"), ("LEFTPADDING", (0, 0), (-1, -1), 0),
                                   ("BOTTOMPADDING", (0, 0), (-1, -1), 8)]))
            story += [t, Spacer(1, 10)]
        elif k == "heading":
            story.append(Paragraph(_xml_runs(el.runs), st["h" + str(el.data.get("level", 1))]))
        elif k == "paragraph":
            style = el.data.get("style", "normal")
            paragraph_text = "".join(run.text for run in el.runs)
            if offer_design and offer_meta_pending:
                paragraph_style = st["offer_meta"]
                offer_meta_pending = False
            elif offer_design and paragraph_text.lstrip().startswith("Pay:"):
                paragraph_style = st["offer_pay"]
            else:
                paragraph_style = st["p" if style == "normal" else style]
            story.append(Paragraph(_xml_runs(el.runs), paragraph_style))
        elif k == "list":
            if el.data["style"] == "check":
                for r in el.runs:
                    story.append(Paragraph("&#9744; " + _xml_runs(r), st["p"]))
            else:
                items = [ListItem(Paragraph(_xml_runs(r), st["p"]), leftIndent=12) for r in el.runs]
                story.append(ListFlowable(items, bulletType="1" if el.data["style"] == "number" else "bullet",
                                          start=None if el.data["style"] == "number" else "•",
                                          bulletFontName=f["regular"], bulletFontSize=9, leftIndent=12))
        elif k == "table":
            cols = el.data["columns"]
            header_style = st["offer_table_header"] if offer_design else st["cell_b"]
            data = [[Paragraph(_xml(c), header_style) for c in cols]] + \
                   [[Paragraph(_xml(c), st["cell"]) for c in r] for r in el.data["rows"]]
            t = Table(data, colWidths=[width / max(len(cols), 1)] * len(cols), repeatRows=1)
            if offer_design:
                t.setStyle(TableStyle([
                    ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#102a43")),
                    ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                    ("LINEBELOW", (0, 0), (-1, 0), 1.5, colors.HexColor("#0f4c5c")),
                    ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#f8fafc")]),
                    ("LINEBELOW", (0, 1), (-1, -1), 0.35, colors.HexColor("#e2e8f0")),
                    ("BOX", (0, 0), (-1, -1), 0.5, colors.HexColor("#d7e2e8")),
                    ("VALIGN", (0, 0), (-1, -1), "TOP"),
                    ("LEFTPADDING", (0, 0), (-1, -1), 7), ("RIGHTPADDING", (0, 0), (-1, -1), 7),
                    ("TOPPADDING", (0, 0), (-1, -1), 6), ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
                ]))
            else:
                t.setStyle(grid)
            story += [t, Spacer(1, 8)]
        elif k in ("kv", "form"):
            if k == "kv":
                value_style = st["offer_value"] if offer_design else st["cell"]
                data = [[Paragraph(_xml(lbl), st["label"]), Paragraph(_xml(val), value_style)] for lbl, val in el.data["rows"]]
            else:
                vals = el.data.get("values") or {}
                data = [[Paragraph(_xml(fd["label"] + (" *" if fd.get("required") else "")), st["label"]),
                         Paragraph(_xml(str(vals[fd["key"]])) if vals.get(fd["key"]) not in (None, "") else "_" * 40, st["cell"])]
                        for fd in el.data["fields"]]
            t = Table(data, colWidths=[width * 0.38, width * 0.62])
            if offer_design and k == "kv":
                t.setStyle(TableStyle([
                    ("BACKGROUND", (0, 0), (0, -1), colors.HexColor("#f8fafc")),
                    ("BACKGROUND", (1, 0), (1, -1), colors.white),
                    ("BOX", (0, 0), (-1, -1), 0.5, colors.HexColor("#d7e2e8")),
                    ("LINEBELOW", (0, 0), (-1, -1), 0.35, colors.HexColor("#e2e8f0")),
                    ("VALIGN", (0, 0), (-1, -1), "TOP"),
                    ("LEFTPADDING", (0, 0), (-1, -1), 7), ("RIGHTPADDING", (0, 0), (-1, -1), 7),
                    ("TOPPADDING", (0, 0), (-1, -1), 5), ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
                ]))
            else:
                t.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP"), ("LEFTPADDING", (0, 0), (-1, -1), 0),
                                       ("BOTTOMPADDING", (0, 0), (-1, -1), 3)]))
            story += [t, Spacer(1, 6)]
        elif k == "checklist":
            state_ = el.data.get("state") or {}
            for it in el.data["items"]:
                s_ = state_.get(it["key"]) or {}
                extra = (" (mandatory)" if it.get("mandatory") else "") + (f" — owner: {it['owner_role']}" if it.get("owner_role") else "")
                note = _check_note(s_)
                box = "&#9745; " if s_.get("done") else "&#9744; "
                story.append(Paragraph(box + _xml(it["label"] + extra + (f" — {note}" if note else "")), st["p"]))
        elif k == "declaration":
            story.append(Paragraph(_xml_runs(el.runs), st["offer_decl"] if offer_design else st["decl"]))
        elif k == "signatures":
            cells = [[Paragraph(_xml(PARTY_LABELS.get(p, p)), st["label"]), Spacer(1, 16), Paragraph(_xml(text), st["cell"])]
                     for p, text in el.data["parties"]]
            pairs = [cells[i:i + 2] for i in range(0, len(cells), 2)]
            rows = [[c for c in pair] + ([""] if len(pair) == 1 else []) for pair in pairs]
            t = Table(rows, colWidths=[width / 2] * 2)
            signature_style = [("VALIGN", (0, 0), (-1, -1), "TOP"), ("LEFTPADDING", (0, 0), (-1, -1), 0),
                               ("TOPPADDING", (0, 0), (-1, -1), 12)]
            if offer_design:
                signature_style.extend([("LINEABOVE", (0, 0), (-1, -1), 0.8, colors.HexColor("#9fb7bf")),
                                        ("RIGHTPADDING", (0, 0), (-1, -1), 14)])
            t.setStyle(TableStyle(signature_style))
            story.append(KeepTogether([Spacer(1, 6), t]))
        elif k == "page_break":
            story.append(PageBreak())

    footer_bits = [inp.document_number] if inp.document_number else []
    confidential = inp.confidential
    verify = inp.verify_url

    class _Numbered(rl_canvas.Canvas):
        def __init__(self, *a, **kw):
            super().__init__(*a, **kw)
            self._pages = []

        def showPage(self):
            self._pages.append(dict(self.__dict__))
            self._startPage()

        def save(self):
            total = len(self._pages)
            for state in self._pages:
                self.__dict__.update(state)
                self._footer(total)
                super().showPage()
            super().save()

        def _footer(self, total):
            self.saveState()
            if offer_design:
                self.setStrokeColor(colors.HexColor("#0f4c5c"))
                self.setLineWidth(1.7)
                self.line(20 * mm, page[1] - 11 * mm, page[0] - 20 * mm, page[1] - 11 * mm)
                self.setStrokeColor(colors.HexColor("#d7e2e8"))
                self.setLineWidth(0.6)
                self.line(20 * mm, 18 * mm, page[0] - 20 * mm, 18 * mm)
            self.setFont(f["regular"], 7.5)
            self.setFillColor(colors.HexColor("#6b7280"))
            left = "  ·  ".join(footer_bits + (["Confidential"] if confidential else []))
            self.drawString(20 * mm, 12 * mm, left)
            self.drawRightString(page[0] - 20 * mm, 12 * mm, f"Page {self._pageNumber} of {total}")
            if verify:
                self.drawString(20 * mm, 8 * mm, f"Verify at {verify}")
            self.restoreState()

    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=page, leftMargin=20 * mm, rightMargin=20 * mm,
                            topMargin=23 * mm if offer_design else 18 * mm, bottomMargin=22 * mm,
                            title=inp.title, author=inp.author or "", subject=inp.document_number or "",
                            creator="Zoiko HR document engine", producer="Zoiko HR", keywords="", invariant=1)
    if not story:
        story = [Spacer(1, 1)]
    doc.build(story, canvasmaker=_Numbered)
    return buf.getvalue()


def append_pdf(original: bytes, appendix: bytes) -> bytes:
    """original pages + appendix pages, as a new PDF (the original bytes are not modified)."""
    from pypdf import PdfReader, PdfWriter
    writer = PdfWriter()
    for src in (original, appendix):
        for page in PdfReader(io.BytesIO(src)).pages:
            writer.add_page(page)
    out = io.BytesIO()
    writer.write(out)
    return out.getvalue()


def pdf_text(data: bytes) -> str:
    from pypdf import PdfReader
    return "\n".join((p.extract_text() or "") for p in PdfReader(io.BytesIO(data)).pages)
