"""Renders offer-package documents (onboarding_package_content blocks) to PDF and to HTML from one source.

Global formatting standards applied here, once, for all 10 documents:
* 2.54 cm margins; portrait, or landscape for the Daily Work Report and the Project Velocity Report; A4 or US Letter.
* Body Helvetica (metric-compatible with Arial) 11 pt, 1.15 line spacing, 6 pt after; H1 18 pt bold in the brand primary colour,
  H2 14 pt bold, H3 12 pt bold, no underlining.
* Tables: brand-primary header row with white bold text, 0.5 pt light-grey borders, alternating grey rows, 4 pt padding,
  header row repeated on each page.
* Every page: header "<ORG> | HR" left, document title right, a marked logo placeholder box; footer template ID and version,
  "Private and Confidential", "Page X of Y" (counted per document).
* A document-control block on page 1 of every document; a diagonal "DRAFT – NOT FOR ISSUE" watermark on every draft page.
* {{placeholders}} highlighted yellow when unresolved; clause hooks followed by a grey italic drafting note.
"""
from __future__ import annotations

import html as _html
import io
import re
from dataclasses import dataclass, field
from typing import Optional
from xml.sax.saxutils import escape

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from reportlab.lib.pagesizes import A4, LETTER, landscape, portrait
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import cm
from reportlab.pdfgen import canvas as rl_canvas
from reportlab.platypus import (BaseDocTemplate, CondPageBreak, Flowable, Frame, KeepTogether, NextPageTemplate, PageBreak,
                                PageTemplate, Paragraph, Spacer, Table, TableStyle)

from app.modules.hr import onboarding_package_content as C

MARGIN = 2.54 * cm
HIGHLIGHT = "#FFF176"
GREY_TEXT = "#5F6B7A"
BORDER = colors.HexColor("#C8CED6")
ROW_ALT = colors.HexColor("#F2F4F7")
DRAFT_STATUS = "PRE-LEGAL-REVIEW DRAFT – DO NOT ISSUE"
WATERMARK = "DRAFT – NOT FOR ISSUE"
BOX = "☐"

US_SPELLING = [
    ("organisation", "organization"), ("Organisation", "Organization"), ("prioritise", "prioritize"),
    ("licences", "licenses"), ("Licences", "Licenses"), ("licence", "license"), ("authorised", "authorized"),
    ("Authorised", "Authorized"), ("recognised", "recognized"), ("colour", "color"), ("behaviour", "behavior"),
    ("programme", "program"), ("summarise", "summarize"), ("utilise", "utilize"), ("judgement", "judgment"),
]


@dataclass
class RenderContext:
    """What a render needs. mode 'template' shows every placeholder; 'issue' fills them from `values` and `clauses`."""
    mode: str = "template"
    values: dict = field(default_factory=dict)                 # field key -> display string (None = missing)
    clauses: dict = field(default_factory=dict)                # clause key -> {"text": str, "not_applicable": bool}
    optional: set = field(default_factory=set)                 # field keys optional in this document
    activities: Optional[dict] = None                          # {"none": bool, "rows": [{organisation, role, hours, paid, approved}]}
    org_label: str = ""                                        # header label from the onboarding settings ("" -> just "HR")
    primary: str = "#0B3D91"
    accent: str = "#00A3E0"
    paper: str = "A4"
    spelling: str = "UK"
    effective_date: str = ""
    status_text: Optional[str] = None                          # None -> draft status
    draft: bool = True
    esign: bool = False                                        # issued for in-app e-signature
    version: str = C.PACKAGE_VERSION
    logo_png: Optional[bytes] = None                           # the organisation's uploaded logo (PNG); None -> no logo
                                                               # (the dashed "insert logo" box is shown on the template set only)

    @property
    def header_text(self) -> str:
        return f"{self.org_label} | HR" if self.org_label else "HR"

    @property
    def show_placeholders(self) -> bool:
        """Layout placeholders (logo box, document-control block) belong to the blank template set, never to an issued
        document a real employee receives."""
        return self.mode == "template"

    # ── resolution ─────────────────────────────────────────────────────────────────────────────────────────────────
    def field_value(self, key: str) -> Optional[str]:
        if self.mode == "template":
            return None
        v = self.values.get(key)
        if v not in (None, ""):
            return str(v)
        meaning, _src, required, fallback = C.FIELDS.get(key, ("", "", True, None))
        if fallback is not None and not required:
            return fallback
        if key in self.optional:
            return ""
        return None

    def clause_value(self, key: str):
        """('text', str) | ('na', None) | None (unresolved)."""
        if self.mode == "template":
            return None
        c = self.clauses.get(key) or {}
        if c.get("not_applicable"):
            return ("na", None)
        if (c.get("text") or "").strip():
            return ("text", c["text"].strip())
        if not C.CLAUSES.get(key, ("", "", True))[2]:
            return ("na", None)
        return None

    def spell(self, text: str) -> str:
        if self.spelling != "US":
            return text
        for uk, us in US_SPELLING:
            text = re.sub(rf"\b{uk}\b", us, text)
        return text


# ── inline markup (shared by PDF and HTML) ───────────────────────────────────────────────────────────────────────────
_SPLIT = re.compile(r"(\{\{\s*[a-z_]+(?::[a-z_]+|\.[a-z_]+)?\s*\}\}|\*\*|<br/>)")


def _hook_token(key: str) -> str:
    return "{{required_clause_block}}" if key == "required_clause_block" else "{{clause:%s}}" % key


def inline(text: str, ctx: RenderContext, fmt: str = "pdf") -> tuple[str, list[str]]:
    """Text with tokens -> (markup, drafting notes to print after it)."""
    out, notes, bold = [], [], False
    esc = escape if fmt == "pdf" else (lambda s: _html.escape(s, quote=False))

    def mark(tok: str) -> str:
        if fmt == "pdf":
            return f'<font backColor="{HIGHLIGHT}">{escape(tok)}</font>'
        return f'<mark class="ph">{_html.escape(tok)}</mark>'

    for part in _SPLIT.split(text or ""):
        if not part:
            continue
        if part == "**":
            out.append("</b>" if bold else "<b>")
            bold = not bold
        elif part == "<br/>":
            out.append("<br/>")
        elif part.startswith("{{"):
            tok = part.strip("{} ").strip()
            ck = C.clause_key(tok)
            if ck:
                res = ctx.clause_value(ck)
                if res is None:
                    out.append(mark(_hook_token(ck)))
                    notes.append(C.CLAUSES[ck][1])
                elif res[0] == "na":
                    out.append(esc("Not used."))
                else:
                    out.append("<br/>".join(esc(line) for line in res[1].splitlines() if line.strip()))
            else:
                v = ctx.field_value(tok)
                out.append(mark("{{%s}}" % tok) if v is None else esc(v))
        else:
            out.append(esc(ctx.spell(part)))
    if bold:
        out.append("</b>")
    return "".join(out), notes


# ── PDF ──────────────────────────────────────────────────────────────────────────────────────────────────────────────
def _styles(ctx: RenderContext) -> dict:
    primary = colors.HexColor(ctx.primary)
    body = ParagraphStyle("b", fontName="Helvetica", fontSize=11, leading=12.65, spaceAfter=6, textColor=colors.HexColor("#1F2933"))
    return {
        "body": body,
        "small": ParagraphStyle("s", parent=body, fontSize=9, leading=10.6, spaceAfter=3),
        "h1": ParagraphStyle("h1", parent=body, fontName="Helvetica-Bold", fontSize=18, leading=22, textColor=primary,
                             spaceBefore=4, spaceAfter=8),
        "h2": ParagraphStyle("h2", parent=body, fontName="Helvetica-Bold", fontSize=14, leading=17, spaceBefore=10, spaceAfter=6),
        "h3": ParagraphStyle("h3", parent=body, fontName="Helvetica-Bold", fontSize=12, leading=14.5, spaceBefore=8, spaceAfter=4),
        "center": ParagraphStyle("c", parent=body, fontName="Helvetica-Bold", fontSize=16, leading=20, alignment=TA_CENTER,
                                 spaceBefore=6, spaceAfter=12, textColor=primary),
        "note": ParagraphStyle("n", parent=body, fontName="Helvetica-Oblique", fontSize=9, leading=11, textColor=colors.HexColor(GREY_TEXT),
                               spaceAfter=6),
        "cell": ParagraphStyle("td", parent=body, fontSize=9.5, leading=11.5, spaceAfter=0),
        "cell_c": ParagraphStyle("tdc", parent=body, fontSize=8.5, leading=10, spaceAfter=0),
        "th": ParagraphStyle("th", parent=body, fontName="Helvetica-Bold", fontSize=9.5, leading=11.5, textColor=colors.white,
                             spaceAfter=0),
        "th_c": ParagraphStyle("thc", parent=body, fontName="Helvetica-Bold", fontSize=8.5, leading=10, textColor=colors.white,
                               spaceAfter=0),
        "ex": ParagraphStyle("ex", parent=body, fontName="Helvetica-Oblique", fontSize=8.5, leading=10, spaceAfter=0,
                             textColor=colors.HexColor(GREY_TEXT)),
        "label": ParagraphStyle("lb", parent=body, fontName="Helvetica-Bold", fontSize=9.5, leading=11.5, spaceAfter=2),
        "ctrl": ParagraphStyle("ct", parent=body, fontSize=8, leading=9.6, spaceAfter=0),
        "ctrl_b": ParagraphStyle("ctb", parent=body, fontName="Helvetica-Bold", fontSize=8, leading=9.6, spaceAfter=0),
        "cover": ParagraphStyle("cv", parent=body, fontName="Helvetica-Bold", fontSize=26, leading=32, alignment=TA_CENTER,
                                textColor=primary, spaceAfter=18),
        "cover_sub": ParagraphStyle("cvs", parent=body, fontSize=13, leading=17, alignment=TA_CENTER, spaceAfter=8),
    }


def _grid_style(ctx: RenderContext, n_rows: int, header=True, total=False) -> TableStyle:
    cmds = [
        ("GRID", (0, 0), (-1, -1), 0.5, BORDER),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("TOPPADDING", (0, 0), (-1, -1), 4), ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
        ("LEFTPADDING", (0, 0), (-1, -1), 4), ("RIGHTPADDING", (0, 0), (-1, -1), 4),
    ]
    start = 1 if header else 0
    if header:
        cmds.append(("BACKGROUND", (0, 0), (-1, 0), colors.HexColor(ctx.primary)))
    for r in range(start, n_rows):
        if (r - start) % 2 == 1:
            cmds.append(("BACKGROUND", (0, r), (-1, r), ROW_ALT))
    if total:
        cmds += [("BACKGROUND", (0, n_rows - 1), (-1, n_rows - 1), colors.HexColor("#E3E8EF")),
                 ("FONTNAME", (0, n_rows - 1), (-1, n_rows - 1), "Helvetica-Bold")]
    return TableStyle(cmds)


class _DocMarker(Flowable):
    """Zero-size flowable: tells the canvas which document the following pages belong to."""
    def __init__(self, info: dict):
        super().__init__()
        self.info = info
        self.width = self.height = 0

    def wrap(self, *_):
        return 0, 0

    def draw(self):
        self.canv._zdoc = self.info


def _canvas_class(ctx_for: dict):
    class _Canvas(rl_canvas.Canvas):
        def __init__(self, *a, **k):
            super().__init__(*a, **k)
            self._pages = []
            self._zdoc = None

        def showPage(self):
            self._pages.append((dict(self.__dict__), self._zdoc))
            self._startPage()

        def save(self):
            counts: dict = {}
            for _, info in self._pages:
                key = (info or {}).get("key")
                counts[key] = counts.get(key, 0) + 1
            seen: dict = {}
            for state, info in self._pages:
                self.__dict__.update(state)
                key = (info or {}).get("key")
                seen[key] = seen.get(key, 0) + 1
                _decorate(self, info or {}, seen[key], counts[key], ctx_for)
                super().showPage()
            super().save()
    return _Canvas


def _decorate(c, info: dict, page: int, total: int, ctx_for: dict) -> None:
    ctx: RenderContext = ctx_for["ctx"]
    w, h = c._pagesize
    primary = colors.HexColor(ctx.primary)
    c.saveState()
    if info.get("draft", ctx.draft):
        c.setFillColor(colors.Color(0.55, 0.58, 0.62, alpha=0.13))
        c.setFont("Helvetica-Bold", 54 if w < h else 64)
        c.translate(w / 2, h / 2)
        c.rotate(35)
        c.drawCentredString(0, -18, WATERMARK)
        c.rotate(-35)
        c.translate(-w / 2, -h / 2)
    # header
    top = h - MARGIN + 30
    c.setFillColor(primary)
    c.setFont("Helvetica-Bold", 9.5)
    c.drawString(MARGIN, top, ctx.header_text)
    c.setFillColor(colors.HexColor("#1F2933"))
    c.setFont("Helvetica", 9)
    c.drawRightString(w - MARGIN, top, info.get("title", ""))
    box_w, box_h = 168, 15
    bx = MARGIN + c.stringWidth(ctx.header_text, "Helvetica-Bold", 9.5) + 14
    logo = _logo_reader(ctx)
    if logo is not None:
        lw, lh = _fit(logo, 120, 20)
        c.drawImage(logo, bx, top - 6, width=lw, height=lh, mask="auto")
    elif ctx.show_placeholders:
        c.setStrokeColor(colors.HexColor("#9AA5B1"))
        c.setDash(2, 2)
        c.rect(bx, top - 4, box_w, box_h, stroke=1, fill=0)
        c.setDash()
        c.setFont("Helvetica", 6.5)
        c.setFillColor(colors.HexColor(GREY_TEXT))
        c.drawCentredString(bx + box_w / 2, top + 1, f"[{(ctx.org_label or 'COMPANY').split(' ')[0]} LOGO – insert approved asset]")
    c.setStrokeColor(primary)
    c.setLineWidth(0.8)
    c.line(MARGIN, top - 9, w - MARGIN, top - 9)
    # footer
    fy = MARGIN - 34
    c.setStrokeColor(BORDER)
    c.setLineWidth(0.5)
    c.line(MARGIN, fy + 12, w - MARGIN, fy + 12)
    c.setFillColor(colors.HexColor("#3E4C59"))
    c.setFont("Helvetica", 8)
    c.drawString(MARGIN, fy, f"{info.get('template_id', 'HR-PKG')} | v{ctx.version}")
    c.drawCentredString(w / 2, fy, "Private and Confidential")
    c.drawRightString(w - MARGIN, fy, f"Page {page} of {total}")
    c.restoreState()


def _logo_reader(ctx: RenderContext):
    if not ctx.logo_png:
        return None
    from reportlab.lib.utils import ImageReader
    try:
        return ImageReader(io.BytesIO(ctx.logo_png))
    except Exception:
        return None


def _fit(reader, max_w: float, max_h: float) -> tuple[float, float]:
    w, h = reader.getSize()
    scale = min(max_w / w, max_h / h, 1.0 if w <= max_w and h <= max_h else 10)
    return w * scale, h * scale


def _logo_data_uri(ctx: RenderContext) -> Optional[str]:
    if not ctx.logo_png:
        return None
    import base64
    return "data:image/png;base64," + base64.b64encode(ctx.logo_png).decode("ascii")


class PdfBuilder:
    """Accumulates one or more documents into a single PDF (each starts on a new page)."""

    def __init__(self, ctx: RenderContext):
        self.ctx = ctx
        self.s = _styles(ctx)
        self.story: list = []
        self.first_orientation: Optional[str] = None
        self._anchor_prefix = ""
        self._current_orient = "portrait"
        self._width_override: Optional[float] = None

    # helpers
    def _para(self, text, style="body", extra_notes=True) -> list:
        markup, notes = inline(text, self.ctx)
        out = [Paragraph(markup, self.s[style])]
        if extra_notes:
            out += [Paragraph(escape(n), self.s["note"]) for n in notes]
        return out

    def _cell(self, v, style="cell"):
        if isinstance(v, dict) and "raw" in v:          # placeholder names shown literally (dictionary appendix)
            return Paragraph(f'<font backColor="{HIGHLIGHT}">{escape(v["raw"])}</font>', self.s[style])
        if isinstance(v, dict) and "ex" in v:
            return Paragraph(escape(self.ctx.spell(v["ex"])), self.s["ex"])
        markup, notes = inline(str(v or ""), self.ctx)
        if not notes:
            return Paragraph(markup, self.s[style])
        return [Paragraph(markup, self.s[style])] + [Paragraph(escape(n), self.s["note"]) for n in notes]

    @property
    def width(self) -> float:
        if self._width_override:
            return self._width_override
        return self._page_size(self._current_orient)[0] - 2 * MARGIN

    def _page_size(self, orient: str):
        base = LETTER if self.ctx.paper == "LETTER" else A4
        return landscape(base) if orient == "landscape" else portrait(base)

    def _choice_grid(self, opts: list) -> Table:
        """Tick-box options laid out in even columns: each box always stays on the same line as its own label."""
        style = ParagraphStyle("ck", parent=self.s["body"], fontSize=10, leading=13, spaceAfter=0, leftIndent=12, firstLineIndent=-12)
        longest = max((len(str(o)) for o in opts), default=0)
        cols = 4 if longest <= 16 else 3 if longest <= 26 else 2 if longest <= 48 else 1
        cols = max(1, min(cols, len(opts)))
        cells = [Paragraph(f"{_box_pdf()}&nbsp;{inline(o, self.ctx)[0]}", style) for o in opts]
        cells += [""] * (-len(cells) % cols)
        rows = [cells[i:i + cols] for i in range(0, len(cells), cols)]
        t = Table(rows, colWidths=[self.width / cols] * cols, hAlign="LEFT")
        t.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP"), ("LEFTPADDING", (0, 0), (-1, -1), 0),
                               ("RIGHTPADDING", (0, 0), (-1, -1), 6), ("TOPPADDING", (0, 0), (-1, -1), 1),
                               ("BOTTOMPADDING", (0, 0), (-1, -1), 3)]))
        return t

    def _control_block(self, d: dict) -> Table:
        status = self.ctx.status_text or DRAFT_STATUS
        rows = [
            ("Template ID", d["template_id"]), ("Template version", f"v{self.ctx.version}"),
            ("Document type", d["doc_type"]), ("Legal risk level", d["risk"]), ("Sensitivity level", d["sensitivity"]),
            ("Owner", "HR"), ("Effective date", self.ctx.effective_date or "—"), ("Status", status),
        ]
        cells = [(Paragraph(escape(k), self.s["ctrl_b"]), Paragraph(escape(v), self.s["ctrl"])) for k, v in rows]
        wide = self._current_orient == "landscape"
        if wide:   # label/value pairs side by side, so landscape one-pagers keep their height
            data = [[*cells[i], *cells[i + 4]] for i in range(4)]
            t = Table(data, colWidths=[100, 150, 100, 240], hAlign="LEFT")
            status_cell, label_cols = (3, 3), (0, 2)
        else:
            data = [list(c) for c in cells]
            t = Table(data, colWidths=[110, 210], hAlign="LEFT")
            status_cell, label_cols = (1, 7), (0,)
        cmds = [("GRID", (0, 0), (-1, -1), 0.5, BORDER),
                ("TOPPADDING", (0, 0), (-1, -1), 2), ("BOTTOMPADDING", (0, 0), (-1, -1), 2),
                ("LEFTPADDING", (0, 0), (-1, -1), 4), ("RIGHTPADDING", (0, 0), (-1, -1), 4)]
        cmds += [("BACKGROUND", (c, 0), (c, -1), colors.HexColor("#EEF2F7")) for c in label_cols]
        if self.ctx.draft:
            cmds.append(("TEXTCOLOR", status_cell, status_cell, colors.HexColor("#B42318")))
        t.setStyle(TableStyle(cmds))
        return t

    def _table(self, headers, rows, widths=None, total=None, compact=False) -> Table:
        n = len(headers)
        widths = widths or [1.0 / n] * n
        cw = [self.width * f for f in widths]
        th, td = ("th_c", "cell_c") if compact else ("th", "cell")
        data = [[Paragraph(escape(self.ctx.spell(h)), self.s[th]) for h in headers]]
        data += [[self._cell(v, td) for v in r] for r in rows]
        if total:
            data.append([self._cell(f"**{v}**" if v else "", td) for v in total])
        min_h = 14 if compact else 20
        heights = [None] + [None if any(r) else min_h for r in rows] + ([None] if total else [])
        t = Table(data, colWidths=cw, repeatRows=1, rowHeights=heights)
        st = _grid_style(self.ctx, len(data), total=bool(total))
        if compact:
            st.add("TOPPADDING", (0, 0), (-1, -1), 3)
            st.add("BOTTOMPADDING", (0, 0), (-1, -1), 3)
        t.setStyle(st)
        return t

    # blocks
    def add_document(self, d: dict, blocks: list[dict], *, draft: Optional[bool] = None) -> None:
        orient = d.get("orientation", "portrait")
        if self.first_orientation is None:
            self.first_orientation = orient
        else:
            self.story += [NextPageTemplate(orient), PageBreak()]
        self._current_orient = orient
        self._anchor_prefix = d.get("category", "doc")
        self.story.append(_DocMarker({"key": d.get("category"), "title": d["title"], "template_id": d["template_id"],
                                      "draft": self.ctx.draft if draft is None else draft}))
        if d.get("control", True) and self.ctx.show_placeholders:
            self.story += [self._control_block(d), Spacer(1, 4 if orient == "landscape" else 10)]
        self.story += self._flow(blocks)

    def _flow(self, blocks: list[dict]) -> list:
        """Flowables for blocks; a heading stays on the same page as the small table or form that follows it."""
        out, i = [], 0
        while i < len(blocks):
            b = blocks[i]
            nxt = blocks[i + 1] if i + 1 < len(blocks) else None
            if not self._width_override and b["t"] in ("h2", "h3") and nxt and nxt["t"] in ("table", "kv", "fields", "textbox", "checks")                     and len(nxt.get("rows", [])) <= 14:
                head = [f for f in self._block(b) if not isinstance(f, CondPageBreak)]
                body = []
                for f in self._block(nxt):          # nested KeepTogether mis-measures; flatten it into this one
                    body += list(f._content) if isinstance(f, KeepTogether) else [f]
                out.append(KeepTogether(head + body))
                i += 2
                continue
            out += self._block(b)
            i += 1
        return out

    def _block(self, b: dict) -> list:
        t, s, ctx = b["t"], self.s, self.ctx
        if t in ("h1", "h2", "h3"):
            lead = [CondPageBreak(60)] if t != "h1" and not self._width_override else []
            return lead + self._para(b["text"], t)
        if t == "p":
            return self._para(b["text"], b.get("style", "body"))
        if t == "center":
            return self._para(b["text"], "center")
        if t == "note":
            return [Paragraph(escape(ctx.spell(b["text"])), s["note"])]
        if t in ("bullets", "numbered"):
            out = []
            for i, item in enumerate(b["items"], 1):
                lead = f"{i}." if t == "numbered" else "•"
                text = item if item else "________________________________________________"
                markup, notes = inline(text, ctx)
                st = ParagraphStyle("li", parent=s["body"], leftIndent=18, bulletIndent=4, spaceAfter=3)
                out.append(Paragraph(markup, st, bulletText=lead))
                out += [Paragraph(escape(n), ParagraphStyle("lin", parent=s["note"], leftIndent=18)) for n in notes]
            return out + [Spacer(1, 3)]
        if t == "kv":
            data = [[Paragraph(f"<b>{escape(ctx.spell(k))}</b>", s["cell"]), self._cell(v)] for k, v in b["rows"]]
            tb = Table(data, colWidths=[self.width * 0.3, self.width * 0.7])
            st = _grid_style(ctx, len(data), header=False)
            st.add("BACKGROUND", (0, 0), (0, -1), colors.HexColor("#E8EEF7"))
            tb.setStyle(st)
            return [tb, Spacer(1, 8)]
        if t == "table":
            gap = 4 if (self._width_override or self._current_orient == "landscape") else 8
            return [self._table(b["headers"], b["rows"], b.get("widths"), b.get("total"), b.get("compact")), Spacer(1, gap)]
        if t == "hook":
            return self._hook(b["key"])
        if t == "notice":
            inner = []
            for item in b["items"]:
                inner += self._hook(item["key"], small=True) if isinstance(item, dict) else self._para(item, "small")
            tb = Table([[inner]], colWidths=[self.width])
            tb.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#E6F4FB")),
                                    ("BOX", (0, 0), (-1, -1), 1, colors.HexColor(ctx.accent)),
                                    ("TOPPADDING", (0, 0), (-1, -1), 8), ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
                                    ("LEFTPADDING", (0, 0), (-1, -1), 10), ("RIGHTPADDING", (0, 0), (-1, -1), 10)]))
            return [tb, Spacer(1, 10)]
        if t == "checks":
            opts = list(b["options"])
            out = self._para(f"**{b['label']}**", "label")
            if b.get("hook"):
                res = ctx.clause_value(b["hook"])
                if res is None:
                    out += self._hook(b["hook"])
                elif res[0] == "text":
                    opts = [ln.strip() for ln in res[1].splitlines() if ln.strip()] + opts
                elif res[0] == "na":
                    return out + [Paragraph("Not collected for this role.", s["note"])]
            return out + [self._choice_grid(opts), Spacer(1, 4)]
        if t == "fields":
            return [self._fields(b["rows"], b.get("cols", 2)), Spacer(1, 6)]
        if t == "textbox":
            hint = Paragraph(escape(ctx.spell(b.get("hint") or "")), s["ex"])
            box = Table([[hint]], colWidths=[self.width], rowHeights=[max(1, b.get("lines", 3)) * 15 + 8])
            box.setStyle(TableStyle([("BOX", (0, 0), (-1, -1), 0.5, BORDER), ("VALIGN", (0, 0), (-1, -1), "TOP")]))
            parts = self._para(f"**{b['label']}**", "label") + [box]
            return (parts if self._width_override else [KeepTogether(parts)]) + [Spacer(1, 8)]
        if t == "consent":
            markup, _ = inline(b["text"], ctx)
            out = [Paragraph(f"{_box_pdf()}&nbsp;&nbsp;{markup}", ParagraphStyle("cs", parent=s["body"], leftIndent=16, firstLineIndent=-16))]
            for a in b.get("after", []):
                out += self._para(a, "small")
            return out
        if t == "signature":
            return self._signature(b)
        if t == "clause":
            return self._clause(b)
        if t == "pagebreak":
            return [PageBreak()]
        if t == "anchor":
            return [Paragraph(f'<a name="{self._anchor_prefix}-{b["name"]}"/>', s["small"])]
        if t == "toc":
            out = []
            for num, title in b["entries"]:
                anchor = f"cl{num}" if num else ("sched1" if title.startswith("Schedule") else "signatures")
                label = f"{num}&nbsp;&nbsp;{escape(title)}" if num else escape(title)
                out.append(Paragraph(f'<a href="#{self._anchor_prefix}-{anchor}" color="{ctx.primary}">{label}</a>',
                                     ParagraphStyle("toc", parent=s["body"], spaceAfter=2, leftIndent=0 if num else 0)))
            return out
        if t == "cover":
            lines = b["lines"]
            out = [Spacer(1, 120)] + self._para(lines[0], "cover")
            for ln in lines[1:]:
                out += self._para(ln, "cover_sub")
            return out + [PageBreak()]
        if t == "letterhead":
            left = self._para("**{{employer.legal_name}}**", "h3") + self._para("{{employer.registered_address}}", "small")
            reader = _logo_reader(ctx)
            if reader is not None:
                from reportlab.platypus import Image as RLImage
                lw, lh = _fit(reader, 150, 46)
                logo = RLImage(io.BytesIO(ctx.logo_png), width=lw, height=lh)
                logo.hAlign = "RIGHT"
            elif ctx.show_placeholders:
                logo = Table([[Paragraph(f"[{(ctx.org_label or 'COMPANY').split(' ')[0]} LOGO – insert approved asset]", s["ex"])]],
                             colWidths=[150], rowHeights=[46])
                logo.setStyle(TableStyle([("BOX", (0, 0), (-1, -1), 0.8, colors.HexColor("#9AA5B1")),
                                          ("VALIGN", (0, 0), (-1, -1), "MIDDLE"), ("ALIGN", (0, 0), (-1, -1), "CENTER")]))
            else:
                logo = ""                                            # no logo uploaded: the letterhead is just the company
            tb = Table([[left, logo]], colWidths=[self.width - 160, 160])
            tb.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP"), ("ALIGN", (1, 0), (1, 0), "RIGHT"),
                                    ("LINEBELOW", (0, 0), (-1, 0), 1, colors.HexColor(ctx.primary)),
                                    ("BOTTOMPADDING", (0, 0), (-1, -1), 8)]))
            return [tb, Spacer(1, 10)]
        if t == "activities":
            return self._activities()
        if t == "columns":
            gap = 14
            col_w = (self.width - gap) / 2
            saved, self._width_override = self._width_override, col_w
            try:
                left, right = self._flow(b["left"]), self._flow(b["right"])
            finally:
                self._width_override = saved
            tb = Table([[left, "", right]], colWidths=[col_w, gap, col_w])
            tb.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP"), ("LEFTPADDING", (0, 0), (-1, -1), 0),
                                    ("RIGHTPADDING", (0, 0), (-1, -1), 0), ("TOPPADDING", (0, 0), (-1, -1), 0)]))
            return [tb]
        if t == "chart":
            inner = [Paragraph(f"<b>{escape(b['title'])}</b>", s["cell"]), Spacer(1, 4), Paragraph(escape(b["note"]), s["ex"])]
            tb = Table([[inner]], colWidths=[self.width], rowHeights=[130])
            tb.setStyle(TableStyle([("BOX", (0, 0), (-1, -1), 0.8, colors.HexColor("#9AA5B1")),
                                    ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#FAFBFC")),
                                    ("VALIGN", (0, 0), (-1, -1), "MIDDLE"), ("LEFTPADDING", (0, 0), (-1, -1), 12)]))
            return [tb, Spacer(1, 10)]
        raise ValueError(f"unknown block {t}")

    def _hook(self, key: str, small=False) -> list:
        res = self.ctx.clause_value(key)
        style = "small" if small else "body"
        if res is None:
            mark = f'<font backColor="{HIGHLIGHT}">{escape(_hook_token(key))}</font>'
            return [Paragraph(mark, self.s[style]), Paragraph(escape(C.CLAUSES[key][1]), self.s["note"])]
        if res[0] == "na":
            return [Paragraph("Not used.", self.s[style])]
        return [Paragraph(escape(p.strip()).replace("\n", "<br/>"), self.s[style]) for p in re.split(r"\n\s*\n", res[1]) if p.strip()]

    def _clause(self, b: dict) -> list:
        num, s = b["num"], self.s
        anchor = f'<a name="{self._anchor_prefix}-{b["anchor"]}"/>' if b.get("anchor") else ""
        head = f"{anchor}{num}&nbsp;&nbsp;{escape(self.ctx.spell(b['title']))}" if num else f"{anchor}{escape(b['title'])}"
        out = [CondPageBreak(70), Paragraph(head, s["h3"])]
        sub = 0
        for item in b["items"]:
            if isinstance(item, str):
                if num:
                    sub += 1
                    markup, notes = inline(item, self.ctx)
                    st = ParagraphStyle("sc", parent=s["body"], leftIndent=30, firstLineIndent=-30)
                    out.append(Paragraph(f"{num}.{sub}&nbsp;&nbsp;&nbsp;{markup}", st))
                    out += [Paragraph(escape(n), ParagraphStyle("scn", parent=s["note"], leftIndent=30)) for n in notes]
                else:
                    out += self._para(item)
            elif item.get("t") == "hook" and num:
                sub += 1
                inner = self._hook(item["key"])
                st = ParagraphStyle("sch", parent=s["body"], leftIndent=30, firstLineIndent=-30)
                first = inner[0]
                out.append(Paragraph(f"{num}.{sub}&nbsp;&nbsp;&nbsp;{first.text}", st))
                for extra in inner[1:]:
                    extra.style = ParagraphStyle("sci", parent=extra.style, leftIndent=30)
                    out.append(extra)
            else:
                for f in self._block(item):
                    if isinstance(f, Paragraph):        # the bullet moves with its text (it stayed at the margin before)
                        f.style = ParagraphStyle("ind", parent=f.style, leftIndent=f.style.leftIndent + 30,
                                                 bulletIndent=(f.style.bulletIndent or 0) + 30)
                    out.append(f)
        return out

    def _fields(self, rows, cols) -> Table:
        s, cells = self.s, []
        for label, value, example in rows:
            if "{{" in value:
                markup, _ = inline(value, self.ctx)
                val = Paragraph(markup, s["cell"])
            else:
                val = Paragraph(escape(self.ctx.spell(value)), s["ex"])
            box = Table([[val]], colWidths=[self.width / cols - 14], rowHeights=[20])
            box.setStyle(TableStyle([("BOX", (0, 0), (-1, -1), 0.5, BORDER), ("VALIGN", (0, 0), (-1, -1), "MIDDLE")]))
            cell = [Paragraph(escape(self.ctx.spell(label)), s["label"]), box]
            if example:
                cell.append(Paragraph(escape(self.ctx.spell(example)), s["ex"]))
            cells.append(cell)
        while len(cells) % cols:
            cells.append("")
        grid = [cells[i:i + cols] for i in range(0, len(cells), cols)]
        tb = Table(grid, colWidths=[self.width / cols] * cols)
        tb.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP"), ("LEFTPADDING", (0, 0), (-1, -1), 0),
                                ("BOTTOMPADDING", (0, 0), (-1, -1), 6)]))
        return tb

    def _signature(self, b: dict) -> list:
        s, ctx = self.s, self.ctx
        out = []
        if b.get("statement"):
            out += self._para(b["statement"])
        data = [[Paragraph(h, s["th"]) for h in ("Party", "Name", "Title", "Signature", "Date")]]
        for party, name, title, dt in b["rows"]:
            employer = party.startswith("For ")
            sig_note = ""
            if ctx.esign and ctx.mode == "issue":
                sig_note = "Issued electronically by the employer" if employer else "Electronic signature – see execution certificate"
            data.append([self._cell(party), self._cell(name), self._cell(title),
                         Paragraph(escape(sig_note), s["ex"]), self._cell(dt)])
        # rows grow with their content (a long company name or date never spills out of its cell); the bottom padding
        # leaves room to sign by hand
        tb = Table(data, colWidths=[self.width * f for f in (0.22, 0.21, 0.19, 0.2, 0.18)], repeatRows=1)
        tb.setStyle(_grid_style(ctx, len(data)))
        tb.setStyle(TableStyle([("BOTTOMPADDING", (0, 1), (-1, -1), 10), ("VALIGN", (0, 1), (-1, -1), "TOP")]))
        return (out + [tb] if self._width_override else [KeepTogether(out + [tb])]) + [Spacer(1, 10)]

    def _activities(self) -> list:
        ctx, s = self.ctx, self.s
        headers = ["Organisation", "Role", "Hours per week", "Paid / unpaid", "Approved (Y/N)"]
        widths = [0.28, 0.24, 0.16, 0.16, 0.16]
        acts = ctx.activities if ctx.mode == "issue" else None
        out = []
        if acts is None:
            if ctx.mode == "issue":
                out.append(Paragraph(f'<font backColor="{HIGHLIGHT}">{{{{worker.outside_activities}}}}</font>', s["small"]))
            rows = blank_rows(3, 5)
        elif acts.get("none"):
            rows = [["None declared", "—", "—", "—", "—"]]
        else:
            rows = [[r.get("organisation", ""), r.get("role", ""), str(r.get("hours", "")), r.get("paid", ""),
                     "Y" if r.get("approved") else "N"] for r in acts.get("rows", [])] or [["None declared", "—", "—", "—", "—"]]
        return out + [self._table(headers, rows, widths), Spacer(1, 6)]

    def build(self) -> bytes:
        buf = io.BytesIO()
        first = self.first_orientation or "portrait"
        order = [first] + [o for o in ("portrait", "landscape") if o != first]
        templates = []
        for o in order:
            size = self._page_size(o)
            frame = Frame(MARGIN, MARGIN, size[0] - 2 * MARGIN, size[1] - 2 * MARGIN, id=f"f-{o}",
                          leftPadding=0, rightPadding=0, topPadding=0, bottomPadding=0)
            templates.append(PageTemplate(id=o, frames=[frame], pagesize=size))
        doc = BaseDocTemplate(buf, pagesize=self._page_size(first), leftMargin=MARGIN, rightMargin=MARGIN, topMargin=MARGIN,
                              bottomMargin=MARGIN, pageTemplates=templates, title="Offer package", author=self.ctx.org_label or "HR")
        doc.build(self.story, canvasmaker=_canvas_class({"ctx": self.ctx}))
        return buf.getvalue()


_CHECKBOX = {"path": None}
_CHECKBOX_LOCK = __import__("threading").Lock()


def _checkbox_png() -> str:
    """Path of a crisp empty checkbox image, made once per process in a private temporary folder (mkdtemp: unpredictable,
    owner-only), under a lock so concurrent first renders never see a half-written file."""
    if _CHECKBOX["path"]:
        return _CHECKBOX["path"]
    with _CHECKBOX_LOCK:
        if not _CHECKBOX["path"]:
            import os
            import tempfile
            from PIL import Image, ImageDraw
            img = Image.new("RGBA", (96, 96), (255, 255, 255, 0))
            ImageDraw.Draw(img).rectangle([6, 6, 89, 89], fill=(255, 255, 255, 255), outline=(31, 41, 51, 255), width=7)
            path = os.path.join(tempfile.mkdtemp(prefix="zhr-pkg-"), "checkbox.png")
            img.save(path, "PNG")
            _CHECKBOX["path"] = path
    return _CHECKBOX["path"]


def _box_pdf() -> str:
    """Paragraph markup for an empty checkbox (the image is made on first use, so importing never touches the disk)."""
    return f'<img src="{_checkbox_png()}" width="8.5" height="8.5" valign="-1"/>'


def blank_rows(n, cols):
    return [[""] * cols for _ in range(n)]


def render_pdf(category: str, ctx: RenderContext) -> bytes:
    d = C.DOCS[category]
    b = PdfBuilder(ctx)
    b.add_document(d, C.blocks_for(category))
    return b.build()


def render_affidavit_schedule(ctx: RenderContext, declared_at: str = "") -> bytes:
    """Schedule A of the Affidavit of Employment Exclusivity: the deponent's own declaration, made when signing."""
    d = dict(C.DOCS["exclusivity_affidavit"], title="Affidavit of Employment Exclusivity – Schedule A", control=False)
    b = PdfBuilder(ctx)
    b.add_document(d, [
        C.H2("Schedule A – Disclosed outside activities"),
        C.P("Declared by {{worker.full_name}} as part of signing the Affidavit of Employment Exclusivity"
            + (f" on {declared_at}." if declared_at else ".")),
        {"t": "activities"},
        C.NOTE("This schedule forms part of the affidavit. Approval of any listed activity is recorded separately by the employer."),
    ])
    return b.build()


def render_template_set(ctx: RenderContext) -> bytes:
    """Cover sheet + all 10 templates (placeholders shown) + Placeholder Dictionary appendix, as one PDF."""
    b = PdfBuilder(ctx)
    cover = {"category": "_cover", "title": "Offer Package – Template Set", "template_id": "HR-PKG-000", "orientation": "portrait",
             "control": False}
    rows = [[str(i), d["title"], d["template_id"], d["doc_type"], d["pages"], d["signers"]]
            for i, d in enumerate(C.documents(), 1)]
    b.add_document(cover, [
        C.H1("Offer Package – Template Set"),
        C.P(f"{(ctx.org_label.title() + ' ') if ctx.org_label else ''}HR offer-package templates, version {ctx.version}. Each document starts on a new page with "
           "its own document-control block."),
        {"t": "table", "headers": ["#", "Document", "Template ID", "Type", "Pages (est.)", "Who signs"], "rows": rows,
         "widths": [0.05, 0.3, 0.13, 0.17, 0.11, 0.24], "compact": True},
        C.H3("Placeholder conventions"),
        {"t": "table", "headers": ["Convention", "Meaning"], "widths": [0.32, 0.68], "rows": [
            [{"raw": "{{object.field}}"}, "Data filled from the HR system. Highlighted in yellow until it is filled."],
            [{"raw": "{{clause:topic}}"}, "Wording local employment counsel must supply. A grey italic drafting note follows each hook."],
            [{"raw": "{{required_clause_block}}"}, "A group of jurisdiction-specific conditions or rights."],
        ]},
        {"t": "note", "text": "Acknowledgement of receipt, signature of an agreement and consent to optional data processing are "
                              "always captured separately."},
    ], draft=True)
    for d in C.documents():
        b.add_document(d, C.blocks_for(d["category"]))
    appendix = {"category": "_dictionary", "title": "Placeholder Dictionary", "template_id": "HR-PKG-000",
                "orientation": "portrait", "control": False}
    drows = [[r["placeholder"], r["meaning"], r["source"], "Y" if r["required"] else "N", ", ".join(r["used_in"])]
             for r in C.dictionary()]
    b.add_document(appendix, [
        C.H1("Appendix – Placeholder Dictionary"),
        {"t": "table", "headers": ["Placeholder", "Meaning", "Data source", "Required (Y/N)", "Used in documents"],
         "rows": [[{"raw": r[0]}] + r[1:] for r in drows], "widths": [0.3, 0.3, 0.12, 0.1, 0.18], "compact": True},
    ], draft=True)
    return b.build()


# ── HTML (what the candidate reads before signing) ──────────────────────────────────────────────────────────────────
def render_html(category: str, ctx: RenderContext, *, document_number: str = "") -> str:
    d = C.DOCS[category]
    hx = _Html(ctx)
    body = "".join(hx.block(b) for b in C.blocks_for(category))
    status = ctx.status_text or DRAFT_STATUS
    ctrl = "" if not ctx.show_placeholders else "".join(f"<tr><th>{_html.escape(k)}</th><td>{_html.escape(v)}</td></tr>" for k, v in [
        ("Template ID", d["template_id"]), ("Template version", f"v{ctx.version}"), ("Document type", d["doc_type"]),
        ("Legal risk level", d["risk"]), ("Sensitivity level", d["sensitivity"]), ("Owner", "HR"),
        ("Effective date", ctx.effective_date or "—"), ("Status", status)])
    wm = f'<div class="wm">{WATERMARK}</div>' if ctx.draft else ""
    p, a = ctx.primary, ctx.accent
    return f"""<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>{_html.escape(d['title'])}</title><style>
body{{font-family:Calibri,Arial,Helvetica,sans-serif;font-size:11pt;line-height:1.15;color:#1F2933;margin:0;background:#fff}}
.page{{max-width:{'1000' if d['orientation'] == 'landscape' else '760'}px;margin:0 auto;padding:24px;position:relative}}
header.run{{display:flex;justify-content:space-between;align-items:center;gap:12px;border-bottom:1px solid {p};padding-bottom:6px;margin-bottom:14px;font-size:9pt}}
header.run b{{color:{p}}} .logo{{border:1px dashed #9AA5B1;color:{GREY_TEXT};font-size:7pt;padding:3px 8px}}
footer.run{{display:flex;justify-content:space-between;border-top:1px solid #C8CED6;margin-top:18px;padding-top:6px;font-size:8pt;color:#3E4C59}}
h1{{font-size:18pt;color:{p};margin:6px 0 8px}} h2{{font-size:14pt;margin:14px 0 6px}} h3{{font-size:12pt;margin:10px 0 4px}}
p{{margin:0 0 6pt}} .center{{text-align:center;font-weight:bold;font-size:16pt;color:{p}}}
table{{border-collapse:collapse;width:100%;margin:4px 0 10px;font-size:10pt}} td,th{{border:.5pt solid #C8CED6;padding:4pt;vertical-align:top;text-align:left}}
table.grid thead th{{background:{p};color:#fff}} table.grid tbody tr:nth-child(even){{background:#F2F4F7}}
table.grid tr.total td{{background:#E3E8EF;font-weight:bold}} table.kv th{{background:#E8EEF7;width:30%}}
table.ctrl{{width:auto;font-size:8pt}} table.ctrl th{{background:#EEF2F7}} table.ctrl tr:last-child td{{color:{'#B42318' if ctx.draft else '#1F2933'};font-weight:bold}}
mark.ph{{background:{HIGHLIGHT};padding:0 2px}} .note{{font-style:italic;color:{GREY_TEXT};font-size:9pt}} .ex{{font-style:italic;color:{GREY_TEXT}}}
.notice{{background:#E6F4FB;border:1px solid {a};padding:10px 12px;margin:8px 0 12px;font-size:9.5pt}}
.box{{border:.5pt solid #C8CED6;min-height:20px;padding:3px 6px}} .fields{{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:8px 14px;margin-bottom:8px}}
.lbl{{font-weight:bold;font-size:9.5pt;margin-bottom:2px}} .clause{{margin-left:30px;text-indent:-30px}} .indent{{margin-left:30px}}
.chart{{border:1px solid #9AA5B1;background:#FAFBFC;padding:30px 14px;margin:8px 0}}
.wm{{position:fixed;top:45%;left:50%;transform:translate(-50%,-50%) rotate(-35deg);font-size:60px;font-weight:bold;color:rgba(140,148,158,.15);pointer-events:none;white-space:nowrap;z-index:0}}
.toc a{{color:{p};text-decoration:none}}
</style></head><body>{wm}<div class="page">
<header class="run"><b>{_html.escape(ctx.header_text)}</b>{(f'<img src="{_logo_data_uri(ctx)}" alt="{_html.escape(ctx.org_label or "Company")} logo" style="max-height:28px;max-width:160px">') if ctx.logo_png else (f'<span class="logo">[{_html.escape((ctx.org_label or "COMPANY").split(" ")[0])} LOGO – insert approved asset]</span>' if ctx.show_placeholders else '<span></span>')}<span>{_html.escape(d['title'])}</span></header>
{f'<table class="ctrl">{ctrl}</table>' if ctrl else ''}
{body}
<footer class="run"><span>{d['template_id']} | v{_html.escape(ctx.version)}{(' · ' + _html.escape(document_number)) if document_number else ''}</span><span>Private and Confidential</span><span></span></footer>
</div></body></html>"""


class _Html:
    def __init__(self, ctx):
        self.ctx = ctx

    def il(self, text):
        markup, notes = inline(text, self.ctx, "html")
        return markup + "".join(f'<div class="note">{_html.escape(n)}</div>' for n in notes)

    def cell(self, v):
        if isinstance(v, dict) and "ex" in v:
            return f'<span class="ex">{_html.escape(self.ctx.spell(v["ex"]))}</span>'
        return self.il(str(v or "")) or "&nbsp;"

    def hook(self, key):
        res = self.ctx.clause_value(key)
        if res is None:
            return f'<p><mark class="ph">{_html.escape(_hook_token(key))}</mark></p><div class="note">{_html.escape(C.CLAUSES[key][1])}</div>'
        if res[0] == "na":
            return "<p>Not used.</p>"
        return "".join(f"<p>{_html.escape(p.strip()).replace(chr(10), '<br/>')}</p>" for p in re.split(r"\n\s*\n", res[1]) if p.strip())

    def table(self, headers, rows, total=None):
        th = "".join(f"<th>{_html.escape(self.ctx.spell(h))}</th>" for h in headers)
        trs = "".join("<tr>" + "".join(f"<td>{self.cell(v)}</td>" for v in r) + "</tr>" for r in rows)
        if total:
            trs += '<tr class="total">' + "".join(f"<td>{_html.escape(v)}</td>" for v in total) + "</tr>"
        return f'<table class="grid"><thead><tr>{th}</tr></thead><tbody>{trs}</tbody></table>'

    def block(self, b) -> str:
        t, ctx = b["t"], self.ctx
        if t in ("h1", "h2", "h3"):
            return f"<{t}>{self.il(b['text'])}</{t}>"
        if t == "p":
            return f"<p>{self.il(b['text'])}</p>"
        if t == "center":
            return f'<p class="center">{self.il(b["text"])}</p>'
        if t == "note":
            return f'<div class="note">{_html.escape(ctx.spell(b["text"]))}</div>'
        if t in ("bullets", "numbered"):
            tag = "ol" if t == "numbered" else "ul"
            return f"<{tag}>" + "".join(f"<li>{self.il(i) if i else '&nbsp;'}</li>" for i in b["items"]) + f"</{tag}>"
        if t == "kv":
            return '<table class="kv">' + "".join(f"<tr><th>{_html.escape(ctx.spell(k))}</th><td>{self.cell(v)}</td></tr>"
                                                  for k, v in b["rows"]) + "</table>"
        if t == "table":
            return self.table(b["headers"], b["rows"], b.get("total"))
        if t == "hook":
            return self.hook(b["key"])
        if t == "notice":
            return '<div class="notice">' + "".join(self.hook(i["key"]) if isinstance(i, dict) else f"<p>{self.il(i)}</p>"
                                                    for i in b["items"]) + "</div>"
        if t == "checks":
            opts, extra = list(b["options"]), ""
            if b.get("hook"):
                res = ctx.clause_value(b["hook"])
                if res is None:
                    extra = self.hook(b["hook"])
                elif res[0] == "text":
                    opts = [ln.strip() for ln in res[1].splitlines() if ln.strip()] + opts
                else:
                    return f'<p class="lbl">{self.il(b["label"])}</p><div class="note">Not collected for this role.</div>'
            return (f'<p class="lbl">{self.il(b["label"])}</p>{extra}<p>' +
                    " &nbsp; ".join(f"{BOX} {self.il(o)}" for o in opts) + "</p>")
        if t == "fields":
            cells = []
            for label, value, example in b["rows"]:
                val = self.il(value) if "{{" in value else f'<span class="ex">{_html.escape(ctx.spell(value))}</span>'
                ex = f'<div class="ex">{_html.escape(ctx.spell(example))}</div>' if example else ""
                cells.append(f'<div><div class="lbl">{_html.escape(ctx.spell(label))}</div><div class="box">{val}</div>{ex}</div>')
            return f'<div class="fields">{"".join(cells)}</div>'
        if t == "textbox":
            h = max(1, b.get("lines", 3)) * 18
            return (f'<div class="lbl">{_html.escape(ctx.spell(b["label"]))}</div>'
                    f'<div class="box" style="min-height:{h}px"><span class="ex">{_html.escape(ctx.spell(b.get("hint") or ""))}</span></div>')
        if t == "consent":
            return f"<p>{BOX} {self.il(b['text'])}</p>" + "".join(f"<p>{self.il(a)}</p>" for a in b.get("after", []))
        if t == "signature":
            st = f"<p>{self.il(b['statement'])}</p>" if b.get("statement") else ""
            rows = []
            for party, name, title, dt in b["rows"]:
                note = ""
                if ctx.esign and ctx.mode == "issue":
                    note = "Issued electronically by the employer" if party.startswith("For ") else "Electronic signature – see execution certificate"
                rows.append([party, name, title, {"ex": note}, dt])
            return st + self.table(["Party", "Name", "Title", "Signature", "Date"], rows)
        if t == "clause":
            num = b["num"]
            out = [f'<h3 id="{b.get("anchor") or ""}">{num + "&nbsp;&nbsp;" if num else ""}{_html.escape(ctx.spell(b["title"]))}</h3>']
            sub = 0
            for item in b["items"]:
                if isinstance(item, str):
                    if num:
                        sub += 1
                        out.append(f'<p class="clause">{num}.{sub}&nbsp;&nbsp;&nbsp;{self.il(item)}</p>')
                    else:
                        out.append(f"<p>{self.il(item)}</p>")
                elif item.get("t") == "hook" and num:
                    sub += 1
                    out.append(f'<div class="clause">{num}.{sub}&nbsp;&nbsp;&nbsp;</div><div class="indent">{self.hook(item["key"])}</div>')
                else:
                    out.append(f'<div class="indent">{self.block(item)}</div>')
            return "".join(out)
        if t == "pagebreak":
            return '<hr style="border:none;border-top:1px dashed #C8CED6;margin:18px 0">'
        if t == "anchor":
            return f'<a id="{b["name"]}"></a>'
        if t == "toc":
            items = []
            for num, title in b["entries"]:
                anchor = f"cl{num}" if num else ("sched1" if title.startswith("Schedule") else "signatures")
                items.append(f'<li><a href="#{anchor}">{(str(num) + "&nbsp;&nbsp;") if num else ""}{_html.escape(title)}</a></li>')
            return f'<ul class="toc" style="list-style:none;padding-left:0">{"".join(items)}</ul>'
        if t == "cover":
            lines = b["lines"]
            return (f'<div style="text-align:center;padding:40px 0"><h1 style="font-size:26pt">{self.il(lines[0])}</h1>' +
                    "".join(f"<p>{self.il(ln)}</p>" for ln in lines[1:]) + "</div>")
        if t == "letterhead":
            return (f'<div style="display:flex;justify-content:space-between;border-bottom:1px solid {ctx.primary};padding-bottom:8px;margin-bottom:10px">'
                    f'<div><h3 style="margin:0">{self.il("{{employer.legal_name}}")}</h3><div>{self.il("{{employer.registered_address}}")}</div></div>'
                    + (f'<img src="{_logo_data_uri(ctx)}" alt="logo" style="max-height:60px;max-width:180px"></div>' if ctx.logo_png else
                       f'<div class="logo" style="padding:14px">[{_html.escape((ctx.org_label or "COMPANY").split(" ")[0])} LOGO – insert approved asset]</div></div>'
                       if ctx.show_placeholders else '</div>'))
        if t == "activities":
            acts = ctx.activities if ctx.mode == "issue" else None
            headers = ["Organisation", "Role", "Hours per week", "Paid / unpaid", "Approved (Y/N)"]
            if acts is None:
                pre = '<p><mark class="ph">{{worker.outside_activities}}</mark></p>' if ctx.mode == "issue" else ""
                return pre + self.table(headers, blank_rows(3, 5))
            if acts.get("none") or not acts.get("rows"):
                return self.table(headers, [["None declared", "—", "—", "—", "—"]])
            return self.table(headers, [[r.get("organisation", ""), r.get("role", ""), str(r.get("hours", "")), r.get("paid", ""),
                                         "Y" if r.get("approved") else "N"] for r in acts["rows"]])
        if t == "columns":
            return ('<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:14px">'
                    f'<div>{"".join(self.block(x) for x in b["left"])}</div><div>{"".join(self.block(x) for x in b["right"])}</div></div>')
        if t == "chart":
            return f'<div class="chart"><b>{_html.escape(b["title"])}</b><div class="ex">{_html.escape(b["note"])}</div></div>'
        return ""
