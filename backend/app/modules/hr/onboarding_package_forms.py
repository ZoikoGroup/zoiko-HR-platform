"""Fill-in-online forms for the package's "Complete and return" documents (Self-Disclosure Declaration, Job Application Form).

The form the new hire fills in on their pre-onboarding page is derived from the document's own blocks, so it always matches
the printed document: tick-box questions become choices, blank tables become editable rows, text boxes become text areas,
the declaration is signed by typing the full name. Prefilled values (name, e-mail, role …) start filled in and can be
corrected. On submit the same document is rendered with the answers (PDF, and DOCX for HR), stored as the new hire's
returned document and put in HR's review queue exactly like an upload; HR sees the full filled document. A rejected form can
be corrected and submitted again; the earlier answers are kept as the starting point.

Answers are stored in OnboardingFormSubmission (canonical_id = the document's template id). Field ids are positions in the
expanded block list ("b12", "b12.r1.c3"), so they stay stable for a given document version and hire.
"""
from __future__ import annotations

import logging
import os
import re
import uuid
from datetime import datetime
from typing import Optional

from fastapi import HTTPException

from app.modules.doc_templates import storage
from app.modules.hr import onboarding_package as P
from app.modules.hr import onboarding_package_content as C
from app.modules.hr import onboarding_package_render as R
from app.modules.hr.models import OnboardingDocument, OnboardingFormSubmission

logger = logging.getLogger("zoiko.onboarding.forms")

FILLABLE_MODES = ("COMPLETE",)
TEXT_MAX, CELL_MAX, LINE_MAX = 4000, 300, 300
_TOKEN = re.compile(r"\{\{\s*([a-z_]+(?::[a-z_]+|\.[a-z_]+)?)\s*\}\}")
_HR_ONLY = re.compile(r"use only", re.I)
ANSWERABLE_HOOKS = {"criminal_record_question"}      # clause wording that asks the new hire something


def fillable(category: str) -> bool:
    """A package document can be filled in online when it was issued as "Complete and return" (checked on its row)."""
    from app.modules.hr import onboarding_package_org as ORG
    return ORG.is_package_category(category)


def _meta(db, hire, category: str) -> dict:
    row = P._rows(db, hire).get(category)
    meta = P.issued_meta(row) if row is not None else {}
    return meta if meta.get("template_id") else P.doc_meta(db, hire, category)


# ── reading the document ─────────────────────────────────────────────────────────────────────────────────────────────

def _expand_text(text, ctx) -> str:
    """Display text: placeholders replaced by the hire's values, bold markers removed."""
    if isinstance(text, dict):                       # EX("…") example values
        return ""
    def sub(m):
        tok = m.group(1)
        if C.clause_key(tok):
            res = ctx.clause_value(C.clause_key(tok))
            return res[1] if res and res[0] == "text" else ""
        return ctx.field_value(tok) or ""
    return _TOKEN.sub(sub, str(text or "")).replace("**", "").strip()


def _prefill(text, ctx) -> str:
    """A prefilled answer: only the hire's real values (never a printed fallback such as "Not provided")."""
    return _TOKEN.sub(lambda m: "" if C.clause_key(m.group(1)) else str(ctx.values.get(m.group(1)) or ""),
                      str(text or "")).replace("**", "").strip()


def _cell(value, ctx) -> dict:
    """A table / field cell: placeholders start filled in (editable), example text is a hint, blank is empty."""
    if isinstance(value, dict):
        return {"value": "", "placeholder": str(value.get("ex") or "")}
    s = str(value or "")
    if "{{" in s:
        return {"value": _prefill(s, ctx), "placeholder": ""}
    return {"value": "", "placeholder": s}


def _clause_choice_options(b, ctx) -> Optional[list]:
    opts = list(b["options"])
    if b.get("hook"):
        res = ctx.clause_value(b["hook"])
        if res is None:
            return opts
        if res[0] == "na":
            return None                              # not collected for this role
        opts = [ln.strip() for ln in res[1].splitlines() if ln.strip()] + opts
    return opts


def _context(db, hire, category: str):
    return P.render_context(db, hire, category, final=True)


def schema(db, hire, category: str) -> list[dict]:
    """The form, in document order. Items: heading | info | choice | text | table | fields | answer | signature."""
    ctx = _context(db, hire, category)
    items, hr_only = [], False
    for i, b in enumerate(R.blocks(category, ctx)):
        t, bid = b.get("t"), f"b{i}"
        if t in ("h1", "h2", "h3"):
            hr_only = bool(_HR_ONLY.search(b.get("text", "")))
            if not hr_only:
                items.append({"type": "heading", "level": int(t[1]), "text": _expand_text(b["text"], ctx)})
            continue
        if hr_only:
            continue                                  # "HR / Management Use Only": not the new hire's to fill
        if t in ("p", "note", "center"):
            text = _expand_text(b.get("text"), ctx)
            if text:
                items.append({"type": "info", "text": text})
        elif t in ("notice", "bullets", "numbered"):
            lines = [_expand_text(x, ctx) for x in b.get("items", []) if not isinstance(x, dict)]
            if any(lines):
                items.append({"type": "info", "lines": [x for x in lines if x], "list": t != "notice"})
        elif t == "kv":
            rows = []
            for label, value in b["rows"]:
                if isinstance(value, dict):          # an example value: the new hire fills it in
                    rows.append({"id": f"{bid}.{len(rows)}", "label": label, "editable": True,
                                 "value": "", "placeholder": value.get("ex", "")})
                else:
                    rows.append({"label": label, "editable": False, "value": _expand_text(value, ctx)})
            items.append({"type": "fields", "id": bid, "rows": rows, "readonly": not any(r["editable"] for r in rows)})
        elif t == "fields":
            rows = []
            for n, (label, value, example) in enumerate(b["rows"]):
                c = _cell(value, ctx)
                rows.append({"id": f"{bid}.{n}", "label": label, "editable": True, "value": c["value"],
                             "placeholder": c["placeholder"] or example})
            items.append({"type": "fields", "id": bid, "rows": rows, "readonly": False})
        elif t == "checks":
            opts = _clause_choice_options(b, ctx)
            if opts is not None:
                items.append({"type": "choice", "id": bid, "label": _expand_text(b["label"], ctx), "options": opts})
        elif t == "textbox":
            items.append({"type": "text", "id": bid, "label": _expand_text(b["label"], ctx), "hint": b.get("hint") or "",
                          "rows": max(2, min(10, int(b.get("lines") or 3)))})
        elif t == "table":
            rows = [[_cell(v, ctx) for v in r] for r in b["rows"]]
            items.append({"type": "table", "id": bid, "headers": list(b["headers"]), "rows": rows})
        elif t == "hook":
            res = ctx.clause_value(b["key"])
            if res and res[0] == "na":
                items.append({"type": "info", "text": "Not asked for this role – nothing to fill in here."})
            elif res and res[0] == "text":
                items.append({"type": "info", "text": res[1]})
                if b["key"] in ANSWERABLE_HOOKS:
                    items.append({"type": "answer", "id": bid, "label": "Your answer", "rows": 3})
        elif t == "signature":
            items.append({"type": "signature", "id": bid, "name": hire.candidate_name or "",
                          "statement": "I confirm that the information I have given is true and complete, and I sign this "
                                       "form by typing my full name."})
    return items


# ── answers ──────────────────────────────────────────────────────────────────────────────────────────────────────────

def _clean_text(v, limit: int) -> str:
    s = str(v or "").replace("\r\n", "\n").replace("\r", "\n")
    return "\n".join(line.rstrip()[:LINE_MAX * 4] for line in s.split("\n")).strip()[:limit]


def clean_answers(items: list[dict], raw: dict) -> dict:
    """Only answers for fields the form has, cut to size; unknown keys are dropped."""
    raw = raw if isinstance(raw, dict) else {}
    out = {}
    for it in items:
        t, fid = it["type"], it.get("id")
        if t in ("text", "answer"):
            out[fid] = _clean_text(raw.get(fid), TEXT_MAX)
        elif t == "choice":
            v = str(raw.get(fid) or "")
            out[fid] = v if v in it["options"] else ""
        elif t == "fields":
            for r in it["rows"]:
                if r.get("editable"):
                    out[r["id"]] = _clean_text(raw.get(r["id"]), CELL_MAX)
        elif t == "table":
            grid = raw.get(fid) if isinstance(raw.get(fid), list) else []
            rows = []
            for ri, row in enumerate(it["rows"]):
                given = grid[ri] if ri < len(grid) and isinstance(grid[ri], list) else []
                rows.append([_clean_text(given[ci] if ci < len(given) else "", CELL_MAX) for ci in range(len(row))])
            out[fid] = rows
        elif t == "signature":
            sig = raw.get(fid) if isinstance(raw.get(fid), dict) else {}
            out[fid] = {"name": _clean_text(sig.get("name"), 200), "confirmed": bool(sig.get("confirmed"))}
    return out


def with_defaults(items: list[dict], answers: Optional[dict]) -> dict:
    """The answers to show: saved answers, else the prefilled values."""
    answers = dict(answers or {})
    for it in items:
        t, fid = it["type"], it.get("id")
        if t == "fields":
            for r in it["rows"]:
                if r.get("editable") and r["id"] not in answers:
                    answers[r["id"]] = r.get("value") or ""
        elif t == "table" and fid not in answers:
            answers[fid] = [[c["value"] for c in row] for row in it["rows"]]
        elif t == "signature" and fid not in answers:
            answers[fid] = {"name": "", "confirmed": False}
        elif t in ("text", "answer", "choice") and fid not in answers:
            answers[fid] = ""
    return answers


def validate(items: list[dict], answers: dict) -> dict:
    """{field id: message} for what must be filled before submitting: every yes/no question and the signature."""
    errors = {}
    for it in items:
        fid = it.get("id")
        if it["type"] == "choice" and not answers.get(fid):
            errors[fid] = "Choose an answer."
        elif it["type"] == "signature":
            sig = answers.get(fid) or {}
            if not (sig.get("name") or "").strip():
                errors[fid] = "Type your full name to sign."
            elif not sig.get("confirmed"):
                errors[fid] = "Tick the box to confirm the declaration."
    return errors


# ── the filled document ──────────────────────────────────────────────────────────────────────────────────────────────

def _p(text: str) -> str:
    return R._plain(text)


def fill_blocks(blocks: list, answers: dict, signed_on: str = "") -> list:
    """The expanded blocks with the new hire's answers written in (only existing block types, so PDF, HTML and DOCX all
    render it). Called by onboarding_package_render.blocks when the context carries answers."""
    out, hr_only = [], False
    for i, b in enumerate(blocks):
        t, bid = b.get("t"), f"b{i}"
        if t in ("h1", "h2", "h3"):
            hr_only = bool(_HR_ONLY.search(b.get("text", "")))
        if hr_only:
            out.append(b)
            continue
        if t == "checks" and bid in answers:
            out.append({"t": "p", "text": f"**{b['label']}**"})
            out.append({"t": "p", "text": f"Answer: **{_p(answers[bid]) or '—'}**"})
        elif t == "textbox" and bid in answers:
            out.append({"t": "p", "text": f"**{b['label']}**"})
            lines = [ln for ln in str(answers[bid] or "").split("\n")] or [""]
            for ln in lines if any(x.strip() for x in lines) else ["—"]:
                out.append({"t": "p", "text": _p(ln) if ln.strip() else " "})
        elif t == "fields":
            rows = [(label, _p(answers.get(f"{bid}.{n}", "")) or "—") for n, (label, _v, _e) in enumerate(b["rows"])]
            out.append({"t": "kv", "rows": rows})
        elif t == "kv" and any(isinstance(v, dict) for _l, v in b["rows"]):
            rows = [(label, (_p(answers.get(f"{bid}.{n}", "")) or "—") if isinstance(v, dict) else v)
                    for n, (label, v) in enumerate(b["rows"])]
            out.append({**b, "rows": rows})
        elif t == "table" and bid in answers:
            grid = answers[bid]
            rows = [[_p(grid[ri][ci]) if ri < len(grid) and ci < len(grid[ri]) else "" for ci in range(len(r))]
                    for ri, r in enumerate(b["rows"])]
            filled = [r for r in rows if any(c.strip() for c in r)]
            out.append({**b, "rows": filled or rows[:1]})
        elif t == "hook" and b.get("key") in ANSWERABLE_HOOKS and bid in answers:
            out.append(b)
            if (answers[bid] or "").strip():
                out.append({"t": "p", "text": "**Answer:** " + _p(answers[bid]).replace("\n", " ")})
        elif t == "signature" and bid in answers:
            sig = answers[bid] or {}
            rows = [(party, name, title, signed_on or dt) for party, name, title, dt in b["rows"]]
            out.append({**b, "rows": rows})
            if sig.get("name"):
                out.append({"t": "note", "text": f"Signed electronically by typing the name \"{_p(sig['name'])}\" in the "
                                                 f"onboarding portal on {signed_on}, with the declaration confirmed."})
        else:
            out.append(b)
    return out


def filled_context(db, hire, category: str, submission: OnboardingFormSubmission):
    ctx = _context(db, hire, category)
    data = submission.data or {}
    ctx.answers = data.get("answers") or {}
    ctx.answers_signed_on = data.get("signed_on") or ""
    ctx.draft = False
    ctx.status_text = f"COMPLETED BY THE NEW HIRE – {data.get('signed_on') or ''}".strip(" –")
    return ctx


# ── storage and workflow ─────────────────────────────────────────────────────────────────────────────────────────────

def _row(db, hire, category: str) -> OnboardingDocument:
    row = P._rows(db, hire).get(category)
    if row is None or P.mode_of(row) not in FILLABLE_MODES:
        raise HTTPException(404, "This form has not been sent to you.")
    return row


def _submission(db, hire, category: str) -> Optional[OnboardingFormSubmission]:
    return (db.query(OnboardingFormSubmission)
            .filter(OnboardingFormSubmission.new_hire_id == hire.id,
                    OnboardingFormSubmission.organization_id == hire.organization_id,
                    OnboardingFormSubmission.canonical_id == _meta(db, hire, category)["template_id"])
            .order_by(OnboardingFormSubmission.id.desc()).first())


def submitted(db, hire, category: str) -> Optional[OnboardingFormSubmission]:
    sub = _submission(db, hire, category) if fillable(category) else None
    return sub if sub is not None and sub.status == "SUBMITTED" else None


def portal_form(db, hire, category: str) -> dict:
    with P.values_cache(db):          # one build of the hire's values per request
        return _portal_form(db, hire, category)


def _portal_form(db, hire, category: str) -> dict:
    if not fillable(category):
        raise HTTPException(404, "This document is not a form.")
    row = _row(db, hire, category)
    items = schema(db, hire, category)
    sub = _submission(db, hire, category)
    data = (sub.data or {}) if sub else {}
    editable = row.status in ("requested", "rejected")
    return {"category": category, "title": _meta(db, hire, category)["title"], "document_id": row.id, "status": row.status,
            "editable": editable, "rejection_reason": row.rejection_reason, "items": items,
            "answers": with_defaults(items, data.get("answers")), "submitted_at": data.get("submitted_at")}


def save_draft(db, hire, category: str, raw: dict) -> dict:
    with P.values_cache(db):          # one build of the hire's values per request
        return _save_draft(db, hire, category, raw)


def _save_draft(db, hire, category: str, raw: dict) -> dict:
    row = _row(db, hire, category)
    if row.status not in ("requested", "rejected"):
        raise HTTPException(400, "This form has already been submitted.")
    items = schema(db, hire, category)
    sub = _submission(db, hire, category)
    if sub is None:
        sub = OnboardingFormSubmission(organization_id=hire.organization_id, new_hire_id=hire.id,
                                       canonical_id=_meta(db, hire, category)["template_id"], status="DRAFT")
        db.add(sub)
    sub.data = {**(sub.data or {}), "category": category, "answers": clean_answers(items, raw),
                "saved_at": datetime.utcnow().isoformat()}
    if sub.status != "SUBMITTED":
        sub.status = "DRAFT"
    db.commit()
    return _portal_form(db, hire, category)


def submit(db, hire, category: str, raw: dict) -> dict:
    with P.values_cache(db):          # one build of the hire's values per request
        return _submit(db, hire, category, raw)


def _submit(db, hire, category: str, raw: dict) -> dict:
    """Validate, render the filled document, store it as the returned document and send it to HR for review."""
    from app.modules.hr import doc_formatting as F

    row = _row(db, hire, category)
    if row.status not in ("requested", "rejected"):
        raise HTTPException(400, "This form has already been submitted.")
    items = schema(db, hire, category)
    answers = clean_answers(items, raw)
    errors = validate(items, answers)
    if errors:
        raise HTTPException(422, {"message": "Some answers are missing.", "errors": errors})
    sub = _submission(db, hire, category)
    if sub is None:
        sub = OnboardingFormSubmission(organization_id=hire.organization_id, new_hire_id=hire.id,
                                       canonical_id=_meta(db, hire, category)["template_id"])
        db.add(sub)
    now = datetime.utcnow()
    signed_on = F.format_date(now.date(), P._config_for(db, hire.organization_id).get("date_format") or "DMY")
    sub.data = {"category": category, "answers": answers, "signed_on": signed_on, "submitted_at": now.isoformat(),
                "signed_name": next((a["name"] for a in answers.values() if isinstance(a, dict) and "name" in a), "")}
    sub.status, sub.submitted_at, sub.return_reason = "SUBMITTED", now, None
    db.flush()
    pdf = R.render_pdf(category, filled_context(db, hire, category, sub))
    # the filled form goes to the document store under the tenant (never a loose file on local disk)
    row.file_path = storage.get_store().put(hire.organization_id, f"onbfilled-{hire.id}-{P._slug(category)}-{uuid.uuid4().hex[:12]}.pdf", pdf)
    row.status, row.rejection_reason = "pending", None
    from app.modules.hr import onboarding_submissions
    onboarding_submissions.on_submitted(db, hire, "package_form", row)    # activity, HR digest, checklist, one commit
    return _portal_form(db, hire, category)


def returned(db, hire, category: str, reason: Optional[str]) -> None:
    """HR rejected the returned form: the answers stay as the starting point for the corrected one."""
    sub = _submission(db, hire, category) if fillable(category) else None
    if sub is not None and sub.status == "SUBMITTED":
        sub.status, sub.return_reason = "RETURNED", reason
        db.commit()


def filled_pdf(db, hire, category: str) -> Optional[bytes]:
    with P.values_cache(db):          # one build of the hire's values per request
        return _filled_pdf(db, hire, category)


def _filled_pdf(db, hire, category: str) -> Optional[bytes]:
    sub = submitted(db, hire, category)
    return R.render_pdf(category, filled_context(db, hire, category, sub)) if sub is not None else None


def submission_view(db, hire, category: str) -> Optional[dict]:
    with P.values_cache(db):          # one build of the hire's values per request
        return _submission_view(db, hire, category)


def _submission_view(db, hire, category: str) -> Optional[dict]:
    """HR's view of a submitted form: the questions with the new hire's answers (and the filled PDF via document_file)."""
    sub = submitted(db, hire, category)
    if sub is None:
        return None
    items = schema(db, hire, category)
    return {"category": category, "title": _meta(db, hire, category)["title"], "items": items,
            "answers": with_defaults(items, (sub.data or {}).get("answers")),
            "submitted_at": (sub.data or {}).get("submitted_at"), "signed_name": (sub.data or {}).get("signed_name")}
