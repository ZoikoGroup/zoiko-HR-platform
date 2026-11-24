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
    signer_names: dict = field(default_factory=dict)  # party -> name printed under the signature line (e.g. the candidate)
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
            # parties: (party, pre-signed text or ""). A pre-signed line ("Name, Title - authorised signatory for X")
            # already names its signer; everyone else gets their name printed under the line, because the executed copy
            # keeps these pages unchanged (the signature itself is stamped onto the line when the document is executed).
            out.append(El("signatures", data={"parties": [(p, inp.signatures.get(p) or "") for p in block["parties"]],
                                              "names": {p: inp.signer_names[p] for p in block["parties"]
                                                        if inp.signer_names.get(p) and not inp.signatures.get(p)},
                                              "issued_on": _safe_value(inp, "document.date"),
                                              "employer_name": (inp.letterhead or {}).get("legal_name") or "",
                                              "employer_signatory": (inp.letterhead or {}).get("signatory_name") or "",
                                              "employer_signatory_title": (inp.letterhead or {}).get("signatory_title") or ""}))
        elif t == "page_break":
            out.append(El("page_break"))
    # an acceptance statement belongs above the lines it is signed on, not under them
    for i in range(len(out) - 1):
        if out[i].kind == "signatures" and out[i + 1].kind == "declaration":
            out[i], out[i + 1] = out[i + 1], out[i]
    return out


def _safe_value(inp: RenderInput, key: str) -> str:
    try:
        return inp.value_of(key) or ""
    except Exception:
        return ""


OFFER_LETTER_IDS = frozenset({"HR-HIR-011", "HR-HIR-012", "HR-HIR-014", "HR-HIR-015", "HR-HIR-016", "HR-HIR-017"})
SIGNATURE_ANCHOR = "zsig-{party}"           # named destination on each party's signature line (see stamp_signatures)
DATE_ANCHOR = "zdate-{party}"               # named destination on each party's date line


def party_label(party: str, employer_name: str = "") -> str:
    if party == "employer" and employer_name:
        return f"For and on behalf of {employer_name}"
    return PARTY_LABELS.get(party, party.replace("_", " ").title())


def split_presigned(text: str) -> tuple[str, str]:
    """'Jo Boss, CEO - authorised signatory for Acme' -> ('Jo Boss', 'CEO - authorised signatory for Acme')."""
    name, _, role = (text or "").partition(", ")
    return name.strip(), role.strip()


_SEP_RE = re.compile(r"(?:\s*·\s*){2,}")


def tidy_line(text: str) -> str:
    """Drop the separators an empty optional value leaves behind ('· · ', a leading '·', a trailing ', ')."""
    t = _SEP_RE.sub(" · ", text or "")
    t = re.sub(r"^\s*·\s*|\s*·\s*$", "", t)
    t = re.sub(r"[,\s]+$", "", t)
    return t.strip()


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


def _logo_uri(data: Optional[bytes]) -> str:
    """A self-contained data URI for the letterhead logo (the HTML carries no external assets)."""
    if not data:
        return ""
    import base64
    head = data[:12]
    mime = ("image/png" if head.startswith(bytes([0x89, 0x50, 0x4E, 0x47])) else
            "image/jpeg" if head.startswith(bytes([0xFF, 0xD8])) else
            "image/gif" if head.startswith(b"GIF") else "image/webp" if head[8:12] == b"WEBP" else "")
    return f"data:{mime};base64,{base64.b64encode(data).decode('ascii')}" if mime else ""


def _check_note(state) -> str:
    if not state:
        return ""
    bits = [f"completed {state['on']}" if state.get("done") and state.get("on") else "", state.get("note") or ""]
    return "; ".join(b for b in bits if b)


def _html_runs(runs: list[Run]) -> str:
    return "".join(_E(r.text) for r in runs)


def _offer_roles(elements: list) -> dict:
    """Letter furniture before the title: the 'date · reference' line and the recipient block. id(El) -> 'meta' | 'recipient'."""
    lead = []
    for el in elements:
        if el.kind == "heading":
            break
        if el.kind == "paragraph":
            lead.append(el)
    roles = {}
    if len(lead) >= 2:
        roles[id(lead[0])], roles[id(lead[1])] = "meta", "recipient"
    elif len(lead) == 1:
        roles[id(lead[0])] = "meta" if "·" in "".join(r.text for r in lead[0].runs) else "recipient"
    return roles


def _signature_parts(data: dict, party: str, presigned: str) -> dict:
    """What a party's sign-off shows: label, the text in the signature space, then name / role / date under the line."""
    names = data.get("names") or {}
    if presigned:
        name, role = split_presigned(presigned)
        return {"label": party_label(party, data.get("employer_name", "")), "mark": "Issued electronically",
                "name": name, "role": role, "date": data.get("issued_on") or ""}
    if party == "employer":
        # QA bug 17: the employer's side names the authorised signatory (Company Profile) and is dated the day the letter
        # is issued; it was a blank "Name:" and a blank date
        return {"label": party_label(party, data.get("employer_name", "")), "mark": "",
                "name": names.get(party) or data.get("employer_signatory", ""), "role": data.get("employer_signatory_title", ""),
                "date": data.get("issued_on") or ""}
    # the other parties date their own signature when they sign: their date stays a line to complete
    return {"label": party_label(party, data.get("employer_name", "")), "mark": "", "name": names.get(party, ""),
            "role": "", "date": ""}


def _html_signatures(data: dict) -> str:
    cols = []
    for p, presigned in data["parties"]:
        s = _signature_parts(data, p, presigned)
        blank = '<span style="display:inline-block;min-width:150px;border-bottom:1px solid #94a3b8;">&nbsp;</span>'
        cols.append(
            '<div style="display:inline-block;width:46%;margin:0 3% 0 0;vertical-align:top;">'
            f'<div style="font-size:11px;font-weight:700;letter-spacing:.4px;text-transform:uppercase;color:#52677a;">{_E(s["label"])}</div>'
            f'<div style="height:56px;display:flex;align-items:flex-end;font-style:italic;font-size:12px;color:#64748b;">{_E(s["mark"])}</div>'
            '<div style="border-top:1px solid #334155;margin:4px 0 6px;"></div>'
            + (f'<div style="font-size:12px;">Name: <span style="font-weight:700;color:#102a43;font-size:13px;">{_E(s["name"])}</span></div>'
               if s["name"] else f'<div style="font-size:12px;">Name: {blank}</div>')
            + (f'<div style="font-size:12px;color:#52677a;">{_E(s["role"])}</div>' if s["role"] else "")
            + f'<div style="font-size:12px;margin-top:6px;">Date: {_E(s["date"]) if s["date"] else blank}</div>'
            + "</div>")
    return f'<div style="margin:28px 0 8px;">{"".join(cols)}</div>'


def render_html(inp: RenderInput, elements: Optional[list] = None) -> str:
    elements = layout(inp) if elements is None else elements
    offer_design = inp.visual_profile == "offer_letter"
    parts: list[str] = []
    lists = {"bullet": "ul", "number": "ol", "check": "ul"}
    offer_roles = _offer_roles(elements) if offer_design else {}
    if offer_design:
        parts.append('<div aria-hidden="true" style="height:5px;background:#0f4c5c;border-radius:3px;margin:0 0 24px;"></div>')
    for el in elements:
        k = el.kind
        if k == "letterhead":
            d = el.data
            letterhead_style = (_CSS["lh"] + "border-bottom-color:#0f4c5c;padding-bottom:16px;margin-bottom:22px;") if offer_design else _CSS["lh"]
            name_style = (_CSS["lh_name"] + "font-size:21px;color:#102a43;letter-spacing:-.2px;") if offer_design else _CSS["lh_name"]
            logo_uri = _logo_uri(d.get("logo_bytes"))
            if logo_uri:
                letterhead_style += "display:flex;align-items:center;justify-content:space-between;gap:16px;"
            parts.append(f'<div style="{letterhead_style}"><div>')
            parts.append(f'<p style="{name_style}">{_E(d.get("legal_name") or "")}</p>')
            if d.get("trading_name") and d.get("trading_name") != d.get("legal_name"):
                parts.append(f'<p style="{_CSS["lh_meta"]}">Trading as {_E(d["trading_name"])}</p>')
            for key in ("address", "registration"):
                if d.get(key):
                    parts.append(f'<p style="{_CSS["lh_meta"]}">{_E(d[key])}</p>')
            parts.append("</div>" + (f'<img src="{logo_uri}" alt="" style="max-width:170px;max-height:60px;height:auto;">'
                                     if logo_uri else "") + "</div>")
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
            role = offer_roles.get(id(el))
            if role == "meta":
                parts.append(f'<p style="{paragraph_style}font-size:11px;color:#64748b;letter-spacing:.15px;margin:0 0 16px;">'
                             f'{_E(tidy_line(paragraph_text))}</p>')
                continue
            if role == "recipient":
                name, _, address = tidy_line(paragraph_text).partition(", ")
                parts.append(f'<div style="margin:0 0 6px;"><div style="font-weight:700;color:#102a43;">{_E(name)}</div>'
                             + (f'<div style="color:#52677a;font-size:13px;">{_E(address)}</div>' if address.strip() else "")
                             + "</div>")
                continue
            if offer_design and paragraph_text.lstrip().startswith("Pay:"):
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
            parts.append(_html_signatures(el.data))
        elif k == "page_break":
            parts.append('<hr style="border:none;border-top:1px dashed #d1d5db;margin:24px 0;">')
    footer = [f"Document {_E(inp.document_number)}"] if inp.document_number else []
    if inp.confidential:
        footer.append("Confidential")
    if inp.verify_url and not offer_design:          # offer letters carry no verification line
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
        st["offer_h2"] = ParagraphStyle("offer_h2", parent=st["h2"], fontSize=11, leading=14, spaceBefore=0, spaceAfter=0,
                                         textColor=colors.HexColor("#0f4c5c"))
        st["offer_meta"] = ParagraphStyle("offer_meta", parent=st["small"], fontSize=8.5, leading=12,
                                           textColor=colors.HexColor("#64748b"), spaceAfter=10)
        st["offer_to"] = ParagraphStyle("offer_to", parent=base, fontName=f["bold"], fontSize=10.5, leading=14,
                                         textColor=colors.HexColor("#102a43"))
        st["offer_addr"] = ParagraphStyle("offer_addr", parent=base, fontSize=9, leading=12.5,
                                           textColor=colors.HexColor("#52677a"))
        st["offer_value"] = ParagraphStyle("offer_value", parent=st["cell_b"], fontSize=9.5, leading=13,
                                            textColor=colors.HexColor("#102a43"))
        st["offer_table_header"] = ParagraphStyle("offer_table_header", parent=st["cell_b"], fontSize=9, leading=12,
                                                   textColor=colors.white)
        st["offer_pay"] = ParagraphStyle("offer_pay", parent=base, fontName=f["bold"], fontSize=11.5, leading=16,
                                         textColor=colors.HexColor("#102a43"))
        st["offer_decl"] = ParagraphStyle("offer_decl", parent=base, fontSize=10, leading=14,
                                           textColor=colors.HexColor("#102a43"))
        st["lh_name"] = ParagraphStyle("offer_lh_name", parent=st["lh_name"], fontSize=16, leading=20,
                                        textColor=colors.HexColor("#102a43"))
    story = []
    grid = TableStyle([("GRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#d1d5db")),
                       ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#f9fafb")),
                       ("VALIGN", (0, 0), (-1, -1), "TOP"), ("LEFTPADDING", (0, 0), (-1, -1), 4), ("RIGHTPADDING", (0, 0), (-1, -1), 4)])
    page = _landscape(A4) if inp.landscape else A4
    width = page[0] - 40 * mm
    offer_roles = _offer_roles(elements) if offer_design else {}
    teal, ink = colors.HexColor("#0f4c5c"), colors.HexColor("#102a43")

    def band(content, *, size_style, bg, accent, pad=7, after=8, before=0):
        """A full-width shaded row with an accent bar: the same left edge as the text and tables around it."""
        t = Table([[Paragraph(content, size_style)]], colWidths=[width])
        t.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, -1), bg), ("LINEBEFORE", (0, 0), (0, -1), 3, accent),
                               ("LEFTPADDING", (0, 0), (-1, -1), 10), ("RIGHTPADDING", (0, 0), (-1, -1), 10),
                               ("TOPPADDING", (0, 0), (-1, -1), pad), ("BOTTOMPADDING", (0, 0), (-1, -1), pad)]))
        return [Spacer(1, before), t, Spacer(1, after)] if before else [t, Spacer(1, after)]

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
            logo = io.BytesIO(d["logo_bytes"]) if d.get("logo_bytes") else d.get("logo_path")
            img = None
            if logo:
                try:
                    img = Image(logo)
                    iw, ih = float(img.imageWidth or 1), float(img.imageHeight or 1)
                    scale = min(45 * mm / iw, 16 * mm / ih)            # fits a 45 x 16 mm box, aspect kept
                    img.drawWidth, img.drawHeight = iw * scale, ih * scale
                    img.hAlign = "RIGHT"
                except Exception:
                    img = None
            if img is not None:
                t = Table([[rows, img]], colWidths=[width - 50 * mm, 50 * mm])
            else:
                t = Table([[rows]], colWidths=[width])
            t.setStyle(TableStyle([("LINEBELOW", (0, 0), (-1, 0), 1.8 if offer_design else 1.2,
                                    colors.HexColor("#0f4c5c" if offer_design else "#1f2937")),
                                   ("VALIGN", (0, 0), (-1, -1), "MIDDLE"), ("LEFTPADDING", (0, 0), (-1, -1), 0),
                                   ("RIGHTPADDING", (0, 0), (-1, -1), 0), ("ALIGN", (-1, 0), (-1, 0), "RIGHT"),
                                   ("BOTTOMPADDING", (0, 0), (-1, -1), 8)]))
            story += [t, Spacer(1, 10)]
        elif k == "heading":
            level = el.data.get("level", 1)
            if offer_design and level == 2:
                parts = band(_xml_runs(el.runs), size_style=st["offer_h2"], bg=colors.HexColor("#f1f7f8"), accent=teal,
                             pad=5, after=7, before=8)
                parts[1].keepWithNext = True
                parts[-1].keepWithNext = True
                story += parts
            else:
                story.append(Paragraph(_xml_runs(el.runs), st["h" + str(level)]))
        elif k == "paragraph":
            style = el.data.get("style", "normal")
            paragraph_text = "".join(run.text for run in el.runs)
            role = offer_roles.get(id(el))
            if role == "meta":
                story.append(Paragraph(_xml(tidy_line(paragraph_text)), st["offer_meta"]))
            elif role == "recipient":
                name, _, address = tidy_line(paragraph_text).partition(", ")
                story.append(Paragraph(_xml(name), st["offer_to"]))
                if address.strip():
                    story.append(Paragraph(_xml(address), st["offer_addr"]))
                story.append(Spacer(1, 4))
            elif offer_design and paragraph_text.lstrip().startswith("Pay:"):
                story += band(_xml_runs(el.runs), size_style=st["offer_pay"], bg=colors.HexColor("#f1f7f8"), accent=teal,
                              pad=8, after=10, before=4)
            else:
                story.append(Paragraph(_xml_runs(el.runs), st["p" if style == "normal" else style]))
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
            if offer_design:
                story += band(_xml_runs(el.runs), size_style=st["offer_decl"], bg=colors.HexColor("#f6fafb"), accent=teal,
                              pad=9, after=4, before=6)
            else:
                story.append(Paragraph(_xml_runs(el.runs), st["decl"]))
        elif k == "signatures":
            story.append(KeepTogether([Spacer(1, 10), _pdf_signatures(el.data, width, st, f)]))
        elif k == "page_break":
            story.append(PageBreak())

    footer_bits = [inp.document_number] if inp.document_number else []
    confidential = inp.confidential
    verify = "" if offer_design else inp.verify_url          # offer letters carry no verification line

    class _Numbered(rl_canvas.Canvas):
        def __init__(self, *a, **kw):
            super().__init__(*a, **kw)
            self._pages = []
            self._zanchors = []                 # (name, x, y) named destinations drawn on the current page

        def showPage(self):
            self._pages.append(dict(self.__dict__))
            self._zanchors = []
            self._startPage()

        def save(self):
            total = len(self._pages)
            named = {}
            for state in self._pages:
                self.__dict__.update(state)
                self._footer(total)
                for name, x, y in state.get("_zanchors") or []:     # registered now, so they point at the right page
                    named[name] = self.bookmarkPage(name, fit="XYZ", left=round(x, 2), top=round(y, 2))
                super().showPage()
            if named:                                   # ReportLab only writes destinations something refers to
                from reportlab.pdfbase.pdfdoc import PDFDictionary
                self._doc.Catalog.Dests = PDFDictionary({n: named[n] for n in sorted(named)})
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
    # The frame pads its content by 6pt on each side: the margins absorb that, so text, tables and the header/footer rules
    # all start at 20 mm (full-width tables used to be 12pt wider than the frame and sat 6pt left of the text).
    doc = SimpleDocTemplate(buf, pagesize=page, leftMargin=20 * mm - 6, rightMargin=20 * mm - 6,
                            topMargin=23 * mm if offer_design else 18 * mm, bottomMargin=22 * mm,
                            title=inp.title, author=inp.author or "", subject=inp.document_number or "",
                            creator="Zoiko HR document engine", producer="Zoiko HR", keywords="", invariant=1)
    if not story:
        story = [Spacer(1, 1)]
    doc.build(story, canvasmaker=_Numbered)
    return buf.getvalue()


SIGN_SPACE = 15 * 2.834645669          # 15 mm of blank space above each signature line, where the signature goes


def _pdf_signatures(data: dict, width: float, st: dict, f: dict):
    """Two sign-offs per row. Each: party label, signature space, the line (a named destination marks it so the signature
    can be stamped on it at execution), then name, role and date under the line."""
    from reportlab.lib import colors
    from reportlab.lib.styles import ParagraphStyle
    from reportlab.platypus import Flowable, Paragraph, Spacer, Table, TableStyle

    class _Line(Flowable):
        def __init__(self, w, anchor, lead=""):
            super().__init__()
            self.w, self.anchor, self.lead = w, anchor, lead

        def wrap(self, *_):
            return self.w, 12 if self.lead else 2

        def draw(self):
            c = self.canv
            x0 = 0
            if self.lead:                                  # "Date:" followed by a short line
                c.setFont(f["regular"], 9)
                c.setFillColor(colors.HexColor("#334155"))
                c.drawString(0, 3, self.lead)
                x0 = c.stringWidth(self.lead, f["regular"], 9) + 4
            c.setStrokeColor(colors.HexColor("#334155"))
            c.setLineWidth(0.6 if self.lead else 0.9)
            c.line(x0, 1, self.w if not self.lead else min(self.w, x0 + 120), 1)
            ax, ay = c.absolutePosition(x0, 1)
            if self.anchor and hasattr(c, "_zanchors"):    # a "Name:" line carries no stamping anchor
                c._zanchors.append((self.anchor, ax, ay))

    label = ParagraphStyle("sig_label", parent=st["label"], fontName=f["bold"], fontSize=7.5, leading=10,
                           textColor=colors.HexColor("#52677a"))
    mark = ParagraphStyle("sig_mark", parent=st["label"], fontSize=8.5, leading=11, textColor=colors.HexColor("#64748b"))
    name = ParagraphStyle("sig_name", parent=st["cell_b"], fontSize=10, leading=13, textColor=colors.HexColor("#102a43"))
    role = ParagraphStyle("sig_role", parent=st["label"], fontSize=8.5, leading=11)
    gap = 14
    col = (width - gap) / 2
    cells = []
    for p, presigned in data["parties"]:
        s = _signature_parts(data, p, presigned)
        cell = [Paragraph(_xml(s["label"].upper()), label)]
        if s["mark"]:
            cell += [Spacer(1, SIGN_SPACE - 13), Paragraph("<i>" + _xml(s["mark"]) + "</i>", mark), Spacer(1, 2)]
        else:
            cell.append(Spacer(1, SIGN_SPACE))
        cell += [_Line(col, SIGNATURE_ANCHOR.format(party=p)), Spacer(1, 4)]
        cell.append(Paragraph(_xml("Name: ") + "<b>" + _xml(s["name"]) + "</b>", name) if s["name"]
                    else _Line(col, None, "Name:"))
        if s["role"]:
            cell.append(Paragraph(_xml(s["role"]), role))
        cell.append(Spacer(1, 6))
        cell.append(Paragraph(_xml("Date: " + s["date"]), role) if s["date"] else _Line(col, DATE_ANCHOR.format(party=p), "Date:"))
        cells.append(cell)
    rows = []
    for i in range(0, len(cells), 2):
        pair = cells[i:i + 2]
        rows.append([pair[0], "", pair[1] if len(pair) > 1 else ""])
    t = Table(rows, colWidths=[col, gap, col])
    t.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP"), ("LEFTPADDING", (0, 0), (-1, -1), 0),
                           ("RIGHTPADDING", (0, 0), (-1, -1), 0), ("TOPPADDING", (0, 0), (-1, -1), 0),
                           ("BOTTOMPADDING", (0, 0), (-1, -1), 14)]))
    return t


def stamp_signatures(pdf: bytes, marks: list[dict]) -> bytes:
    """Draw each signature on its party's signature line, and the signing date on its date line, in a copy of `pdf`.

    marks: [{"party", "image": png bytes or None, "typed": str, "date": str}]. Lines are found through the named
    destinations the renderer leaves on them; a document rendered before those existed (or a party with no line) is
    returned unchanged for that party."""
    from pypdf import PdfReader, PdfWriter
    from reportlab.lib import colors
    from reportlab.lib.utils import ImageReader
    from reportlab.pdfgen import canvas as rl_canvas

    reader = PdfReader(io.BytesIO(pdf))
    try:
        dests = reader.named_destinations
    except Exception:
        dests = {}

    def where(name):
        d = dests.get(name) or dests.get("/" + name)       # a /Dests key reads back as a PDF name
        if d is None:
            return None
        try:
            return reader.get_destination_page_number(d), float(d.left), float(d.top)
        except Exception:
            return None

    overlays: dict[int, list] = {}
    for m in marks:
        line = where(SIGNATURE_ANCHOR.format(party=m["party"]))
        if line:
            overlays.setdefault(line[0], []).append(("sig", line[1], line[2], m))
        date_line = where(DATE_ANCHOR.format(party=m["party"]))
        if date_line and m.get("date"):
            overlays.setdefault(date_line[0], []).append(("date", date_line[1], date_line[2], m))
    if not overlays:
        return pdf
    writer = PdfWriter(clone_from=reader)
    fonts = _fonts()
    for page_no, items in overlays.items():
        page = writer.pages[page_no]
        w, h = float(page.mediabox.width), float(page.mediabox.height)
        buf = io.BytesIO()
        c = rl_canvas.Canvas(buf, pagesize=(w, h), invariant=1)
        for kind, x, y, m in items:
            if kind == "date":
                c.setFont(fonts["regular"], 9)
                c.setFillColor(colors.HexColor("#102a43"))
                c.drawString(x + 2, y + 2.5, m["date"])
                continue
            box_w, box_h = 62 * 2.834645669, SIGN_SPACE - 6
            drawn = False
            if m.get("image"):
                try:
                    img = ImageReader(io.BytesIO(m["image"]))
                    iw, ih = img.getSize()
                    scale = min(box_w / max(iw, 1), box_h / max(ih, 1))
                    c.drawImage(img, x + 2, y + 2, width=iw * scale, height=ih * scale, mask="auto")
                    drawn = True
                except Exception:
                    drawn = False
            if not drawn and m.get("typed"):
                size = 20
                while size > 10 and c.stringWidth(m["typed"], "Times-Italic", size) > box_w:
                    size -= 1
                c.setFont("Times-Italic", size)
                c.setFillColor(colors.HexColor("#1e3a8a"))
                c.drawString(x + 2, y + 5, m["typed"])
        c.save()
        page.merge_page(PdfReader(io.BytesIO(buf.getvalue())).pages[0])
    out = io.BytesIO()
    writer.write(out)
    return out.getvalue()


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
