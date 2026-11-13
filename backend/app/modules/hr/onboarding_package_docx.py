"""Word (.docx) copies of the onboarding package documents, for HR to download and edit.

Built from the same blocks and the same token resolution as the PDF and the HTML (`onboarding_package_render.inline`), so a
value prints the same way in all three. Bullets and numbered lists use Word's own list styles; the running header (logo,
"LABEL | HR", document title) and footer (template id, version, "Private and Confidential", Page X of Y fields) are real Word
header/footer parts. Drafts carry "DRAFT – NOT FOR ISSUE" in the header. The e-signed record is always the PDF.
"""
from __future__ import annotations

import html as _html
import io
import re

from docx import Document
from docx.enum.section import WD_ORIENT
from docx.enum.table import WD_TABLE_ALIGNMENT
from docx.enum.text import WD_ALIGN_PARAGRAPH, WD_BREAK, WD_COLOR_INDEX
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Cm, Pt, RGBColor

from app.modules.hr import onboarding_package_content as C
from app.modules.hr import onboarding_package_render as R

FONT = "Noto Sans"
BOX = "☐"
GREY = RGBColor(0x52, 0x60, 0x6D)
_TAG = re.compile(r'(<b>|</b>|<br/>|<mark class="ph">|</mark>)')
COMPACT = {"daily_work_report", "velocity_report"}          # forms: narrower margins


def _rgb(hex_colour: str) -> RGBColor:
    h = (hex_colour or "#0B3D91").lstrip("#")
    return RGBColor(int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16))


def _shade(cell, hex_colour: str) -> None:
    tc_pr = cell._tc.get_or_add_tcPr()
    shd = OxmlElement("w:shd")
    shd.set(qn("w:val"), "clear")
    shd.set(qn("w:color"), "auto")
    shd.set(qn("w:fill"), hex_colour.lstrip("#"))
    tc_pr.append(shd)


def _field(paragraph, code: str) -> None:
    """A Word field (PAGE / NUMPAGES) so page numbers stay right after HR edits the document."""
    run = paragraph.add_run()
    for kind, text in (("begin", None), (None, code), ("separate", None), (None, "1"), ("end", None)):
        if kind:
            el = OxmlElement("w:fldChar")
            el.set(qn("w:fldCharType"), kind)
        elif text == code:
            el = OxmlElement("w:instrText")
            el.set(qn("xml:space"), "preserve")
            el.text = f" {code} "
        else:
            el = OxmlElement("w:t")
            el.text = text
        run._r.append(el)


class _Docx:
    def __init__(self, category: str, ctx: R.RenderContext):
        self.cat, self.ctx, self.d = category, ctx, C.DOCS[category]
        self.doc = Document()
        self.primary = _rgb(ctx.primary)
        self._setup()

    # ── page, styles, header / footer ────────────────────────────────────────────────────────────────────────────────
    def _setup(self):
        sec = self.doc.sections[0]
        a4 = (self.ctx.paper or "A4").upper() != "LETTER"
        w, h = (Cm(21.0), Cm(29.7)) if a4 else (Cm(21.59), Cm(27.94))
        if self.d.get("orientation") == "landscape":
            sec.orientation = WD_ORIENT.LANDSCAPE
            w, h = h, w
        sec.page_width, sec.page_height = w, h
        m = Cm(1.5) if self.cat in COMPACT else Cm(2.2)
        sec.left_margin = sec.right_margin = sec.top_margin = sec.bottom_margin = m
        normal = self.doc.styles["Normal"]
        normal.font.name, normal.font.size = FONT, Pt(10.5)
        normal.element.rPr.rFonts.set(qn("w:eastAsia"), FONT)
        normal.paragraph_format.space_after = Pt(6)
        normal.paragraph_format.line_spacing = 1.2
        for name, size in (("Heading 1", 16), ("Heading 2", 12.5), ("Heading 3", 11)):
            st = self.doc.styles[name]
            st.font.name, st.font.size, st.font.bold = FONT, Pt(size), True
            st.font.color.rgb = self.primary if name == "Heading 1" else RGBColor(0x1F, 0x29, 0x33)
        self._header_footer(sec)

    def _header_footer(self, sec):
        hp = sec.header.paragraphs[0]
        if self.ctx.logo_png:
            try:
                hp.add_run().add_picture(io.BytesIO(self.ctx.logo_png), height=Cm(0.8))
                hp.add_run("   ")
            except Exception:
                pass
        r = hp.add_run(self.ctx.header_text)
        r.bold, r.font.size, r.font.color.rgb = True, Pt(9), self.primary
        r = hp.add_run(f"\t\t{self.d['title']}")
        r.font.size = Pt(9)
        if self.ctx.draft:
            p = sec.header.add_paragraph()
            r = p.add_run(R.WATERMARK)
            r.bold, r.font.size, r.font.color.rgb = True, Pt(9), RGBColor(0xB4, 0x23, 0x18)
        fp = sec.footer.paragraphs[0]
        r = fp.add_run(f"{self.d['template_id']} | v{self.ctx.version}    ·    Private and Confidential    ·    Page ")
        r.font.size = Pt(8)
        _field(fp, "PAGE")
        fp.add_run(" of ").font.size = Pt(8)
        _field(fp, "NUMPAGES")

    # ── text ───────────────────────────────────────────────────────────────────────────────────────────────────────
    def runs(self, paragraph, text: str, *, bold=False, italic=False, size=None, colour=None) -> list[str]:
        """Resolve tokens exactly as the PDF/HTML do, then write the result as runs. Returns the drafting notes."""
        markup, notes = R.inline(text or "", self.ctx, "html")
        b, mark = bold, False
        for part in _TAG.split(markup):
            if not part:
                continue
            if part == "<b>":
                b = True
            elif part == "</b>":
                b = bold
            elif part == '<mark class="ph">':
                mark = True
            elif part == "</mark>":
                mark = False
            elif part == "<br/>":
                paragraph.add_run().add_break(WD_BREAK.LINE)
            else:
                run = paragraph.add_run(_html.unescape(part))
                run.bold, run.italic = b, italic
                if size:
                    run.font.size = Pt(size)
                if colour is not None:
                    run.font.color.rgb = colour
                if mark:
                    run.font.highlight_color = WD_COLOR_INDEX.YELLOW
        return notes

    def para(self, text: str, style=None, **kw):
        p = self.doc.add_paragraph(style=style)
        notes = self.runs(p, text, **kw)
        for n in notes:
            self.note(n)
        return p

    def note(self, text: str):
        p = self.doc.add_paragraph()
        r = p.add_run(self.ctx.spell(text))
        r.italic, r.font.size, r.font.color.rgb = True, Pt(9), GREY

    def hook(self, key: str, container=None):
        res = self.ctx.clause_value(key)
        add = container.add_paragraph if container is not None else self.doc.add_paragraph
        if res is None:
            r = add().add_run(R._hook_token(key))
            r.font.highlight_color = WD_COLOR_INDEX.YELLOW
            self.note(C.CLAUSES[key][1])
            return
        if res[0] == "na":
            add("Not used.")
            return
        for chunk in re.split(r"\n\s*\n", res[1]):
            if chunk.strip():
                add(chunk.strip())

    # ── tables ─────────────────────────────────────────────────────────────────────────────────────────────────────
    def _cell_text(self, cell, value):
        cell.text = ""
        p = cell.paragraphs[0]
        if isinstance(value, dict) and "ex" in value:
            r = p.add_run(self.ctx.spell(value["ex"]))
            r.italic, r.font.color.rgb = True, GREY
        else:
            self.runs(p, str(value or ""), size=9.5)

    def table(self, headers, rows, total=None):
        t = self.doc.add_table(rows=1, cols=len(headers))
        t.style = "Table Grid"
        t.alignment = WD_TABLE_ALIGNMENT.LEFT
        for i, h in enumerate(headers):
            c = t.rows[0].cells[i]
            c.text = ""
            r = c.paragraphs[0].add_run(self.ctx.spell(h))
            r.bold, r.font.size, r.font.color.rgb = True, Pt(9.5), RGBColor(0xFF, 0xFF, 0xFF)
            _shade(c, self.ctx.primary)
        tr_pr = t.rows[0]._tr.get_or_add_trPr()
        rep = OxmlElement("w:tblHeader")                    # the header row repeats on every page
        rep.set(qn("w:val"), "true")
        tr_pr.append(rep)
        for n, row in enumerate(rows):
            cells = t.add_row().cells
            for i, v in enumerate(row[:len(headers)]):
                self._cell_text(cells[i], v)
                if n % 2:
                    _shade(cells[i], "#F2F4F7")
        if total:
            cells = t.add_row().cells
            for i, v in enumerate(total[:len(headers)]):
                cells[i].text = str(v)
                _shade(cells[i], "#E3E8EF")
        self.doc.add_paragraph()
        return t

    def kv(self, rows):
        t = self.doc.add_table(rows=0, cols=2)
        t.style = "Table Grid"
        for k, v in rows:
            cells = t.add_row().cells
            cells[0].text = ""
            self.runs(cells[0].paragraphs[0], k, bold=True, size=9.5)      # labels may hold tokens
            _shade(cells[0], "#E8EEF7")
            self._cell_text(cells[1], v)
        self.doc.add_paragraph()

    def boxed(self, paragraphs: list, fill="#E6F4FB"):
        t = self.doc.add_table(rows=1, cols=1)
        t.style = "Table Grid"
        cell = t.rows[0].cells[0]
        _shade(cell, fill)
        cell.text = ""
        first = True
        for item in paragraphs:
            if isinstance(item, dict):
                self.hook(item["key"], container=cell)
                continue
            p = cell.paragraphs[0] if first else cell.add_paragraph()
            first = False
            self.runs(p, item, size=9.5)
        self.doc.add_paragraph()

    # ── blocks ─────────────────────────────────────────────────────────────────────────────────────────────────────
    def block(self, b):
        t, ctx = b["t"], self.ctx
        if t in ("h1", "h2", "h3"):
            self.para(b["text"], style={"h1": "Heading 1", "h2": "Heading 2", "h3": "Heading 3"}[t])
        elif t == "p":
            self.para(b["text"])
        elif t == "center":
            p = self.para(b["text"], bold=True, size=14, colour=self.primary)
            p.alignment = WD_ALIGN_PARAGRAPH.CENTER
        elif t == "note":
            self.note(b["text"])
        elif t in ("bullets", "numbered"):
            style = "List Number" if t == "numbered" else "List Bullet"
            for item in b["items"]:
                self.para(item or " ", style=style)
        elif t == "kv":
            self.kv(b["rows"])
        elif t == "table":
            self.table(b["headers"], b["rows"], b.get("total"))
        elif t == "hook":
            self.hook(b["key"])
        elif t == "notice":
            self.boxed(b["items"])
        elif t == "checks":
            opts = list(b["options"])
            if b.get("hook"):
                res = ctx.clause_value(b["hook"])
                if res is None:
                    self.para(b["label"], bold=True)
                    self.hook(b["hook"])
                elif res[0] == "text":
                    opts = [ln.strip() for ln in res[1].splitlines() if ln.strip()] + opts
                else:
                    self.para(b["label"], bold=True)
                    self.note("Not collected for this role.")
                    return
            self.para(b["label"], bold=True)
            self.para("    ".join(f"{BOX} {o}" for o in opts))
        elif t == "fields":
            rows = [[label, value if "{{" in value else {"ex": value}] for label, value, _ex in b["rows"]]
            self.kv(rows)
        elif t == "textbox":
            self.para(b["label"], bold=True)
            self.boxed([b.get("hint") or ""] + [""] * max(0, b.get("lines", 3) - 1), fill="#FFFFFF")
        elif t == "consent":
            self.para(f"{BOX} {b['text']}")
            for a in b.get("after", []):
                self.para(a)
        elif t == "signature":
            if b.get("statement"):
                self.para(b["statement"])
            rows = []
            for party, name, title, dt in b["rows"]:
                note = ""
                if ctx.esign and ctx.mode == "issue":
                    note = ("Issued electronically by the employer" if party.startswith("For ")
                            else "Electronic signature – see execution certificate")
                rows.append([party, name, title, {"ex": note}, dt])
            self.table(["Party", "Name", "Title", "Signature", "Date"], rows)
        elif t == "clause":
            num = b["num"]
            self.para(f"{num + '  ' if num else ''}{b['title']}", style="Heading 3")
            sub = 0
            for item in b["items"]:
                if isinstance(item, str):
                    if num:
                        sub += 1
                        p = self.para(f"{num}.{sub}\t{item}")
                        p.paragraph_format.left_indent = Cm(1.1)
                        p.paragraph_format.first_line_indent = Cm(-1.1)
                    else:
                        self.para(item)
                elif item.get("t") == "hook" and num:
                    sub += 1
                    self.para(f"{num}.{sub}")
                    self.hook(item["key"])
                else:
                    self.block(item)
        elif t == "pagebreak":
            self.doc.add_paragraph().add_run().add_break(WD_BREAK.PAGE)
        elif t == "toc":
            for num, title in b["entries"]:
                self.doc.add_paragraph(f"{str(num) + '  ' if num else ''}{title}")
        elif t == "cover":
            lines = b["lines"]
            p = self.para(lines[0], bold=True, size=24, colour=self.primary)
            p.alignment = WD_ALIGN_PARAGRAPH.CENTER
            for ln in lines[1:]:
                self.para(ln).alignment = WD_ALIGN_PARAGRAPH.CENTER
        elif t == "letterhead":
            t_ = self.doc.add_table(rows=1, cols=2)
            left, right = t_.rows[0].cells
            left.text = ""
            self.runs(left.paragraphs[0], b.get("name", "{{employer.legal_name}}"), bold=True, size=12)
            self.runs(left.add_paragraph(), b.get("address", "{{employer.registered_address}}"), size=9.5)
            if ctx.logo_png:
                try:
                    right.paragraphs[0].add_run().add_picture(io.BytesIO(ctx.logo_png), height=Cm(1.6))
                    right.paragraphs[0].alignment = WD_ALIGN_PARAGRAPH.RIGHT
                except Exception:
                    pass
            self.doc.add_paragraph()
        elif t == "activities":
            acts = ctx.activities if ctx.mode == "issue" else None
            headers = ["Organisation", "Role", "Hours per week", "Paid / unpaid", "Approved (Y/N)"]
            if acts is None:
                self.table(headers, C.blank_rows(3, 5))
            elif acts.get("none") or not acts.get("rows"):
                self.table(headers, [["None declared", "—", "—", "—", "—"]])
            else:
                self.table(headers, [[r.get("organisation", ""), r.get("role", ""), str(r.get("hours", "")), r.get("paid", ""),
                                      "Y" if r.get("approved") else "N"] for r in acts["rows"]])
        elif t == "columns":
            for x in b["left"] + b["right"]:
                self.block(x)
        elif t == "chart":
            self.para(b["title"], bold=True)
            self.note(b["note"])

    def build(self) -> bytes:
        self.doc.core_properties.title = self.d["title"]
        for b in R.blocks(self.cat, self.ctx):
            self.block(b)
        buf = io.BytesIO()
        self.doc.save(buf)
        return buf.getvalue()


def render_docx(category: str, ctx: R.RenderContext) -> bytes:
    if category not in C.DOCS:
        raise KeyError(category)
    return _Docx(category, ctx).build()
