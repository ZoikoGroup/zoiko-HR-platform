"""The organisation's welcome message for new hires (Onboarding › Settings), rendered once for every place it is shown.

The message is plain text that HR writes. It may use a small set of placeholders, filled on the server:

    {{company_name}}  {{employee_first_name}}  {{start_date}}  {{position}}  {{manager_name}}

Formatting is deliberately tiny: a line starting with "## " is a heading, a blank line starts a new paragraph and a single
line break stays a line break. Raw HTML is never rendered: blocks() returns plain strings (the e-mail template and the
React portal both escape them) and to_html() escapes everything it emits.

The same blocks are used by the offer-accepted e-mail, the pre-onboarding invite, the portal page and the Settings preview,
so the new hire reads the same words everywhere.
"""
from __future__ import annotations

import re
from datetime import date
from html import escape
from typing import Optional

from fastapi import HTTPException

MAX_MESSAGE = 2000
MAX_SIGNATURE = 120

PLACEHOLDERS = ("company_name", "employee_first_name", "start_date", "position", "manager_name")
PLACEHOLDER_LABELS = {
    "company_name": "Company name",
    "employee_first_name": "Employee first name",
    "start_date": "Start date",
    "position": "Position",
    "manager_name": "Manager name",
}
# what a placeholder reads when the value is not known for this hire
FALLBACKS = {
    "company_name": "our company",
    "employee_first_name": "there",
    "start_date": "your start date",
    "position": "your new role",
    "manager_name": "your manager",
}

DEFAULT_WELCOME_SIGNATURE = "Your People & Culture Team"

DEFAULT_WELCOME_MESSAGE = """## Welcome to the Team!
We're delighted to welcome you and excited to have you join us.

Your appointment marks the beginning of an important new chapter, and we look forward to the experience, ideas, and perspectives you'll bring. We believe that great achievements begin with great people, and we're committed to helping you feel welcomed, valued, and supported from your very first day.

## Your Journey Starts Here
To help you get off to a smooth and confident start, we've prepared a personalised pre-onboarding experience.

Please take a few moments to complete the steps outlined below. These may include confirming your personal information, submitting required documents, reviewing important policies, and completing essential onboarding tasks.

We encourage you to complete all required steps before your start date, or by any specific deadlines provided.

## We're Here to Support You
Your privacy and the security of your information are important to us. Please submit sensitive documents through your secure onboarding portal.

If you have questions, require assistance, or need an accessible alternative, our HR team is here to help.

We look forward to welcoming you, celebrating your achievements, and building a successful future together.

Once again, congratulations and welcome aboard!"""

# anything between double braces is a placeholder attempt: unknown names are refused on save
TOKEN = re.compile(r"\{\{\s*([^{}]*?)\s*\}\}")
HEADING = re.compile(r"^##\s+(.*)$")


# ── settings values ─────────────────────────────────────────────────────────────────────────────────────────────────
def message_for(settings) -> str:
    """The organisation's message, or the default when none is saved."""
    text = getattr(settings, "welcome_message", None) if settings is not None else None
    return text if text and text.strip() else DEFAULT_WELCOME_MESSAGE


def signature_for(settings) -> str:
    text = getattr(settings, "welcome_signature", None) if settings is not None else None
    return text.strip() if text and text.strip() else DEFAULT_WELCOME_SIGNATURE


def unknown_placeholders(text: Optional[str]) -> list[str]:
    seen: list[str] = []
    for name in TOKEN.findall(text or ""):
        if name not in PLACEHOLDERS and name not in seen:
            seen.append(name)
    return seen


def validate_message(text: Optional[str]) -> None:
    """422 when the message is too long or uses a placeholder that does not exist."""
    if text is None:
        return
    if len(text) > MAX_MESSAGE:
        raise HTTPException(422, f"The welcome message can be at most {MAX_MESSAGE} characters.")
    bad = unknown_placeholders(text)
    if bad:
        allowed = ", ".join("{{" + p + "}}" for p in PLACEHOLDERS)
        raise HTTPException(422, f"Unknown placeholder {', '.join('{{' + b + '}}' for b in bad)}. "
                                 f"You can use: {allowed}.")


def validate_signature(text: Optional[str]) -> None:
    if text is not None and len(text) > MAX_SIGNATURE:
        raise HTTPException(422, f"The signature can be at most {MAX_SIGNATURE} characters.")
    if text and TOKEN.search(text):
        raise HTTPException(422, "The signature cannot use placeholders.")


# ── values ──────────────────────────────────────────────────────────────────────────────────────────────────────────
def long_date(d: Optional[date]) -> Optional[str]:
    """Monday, 7 December 2026."""
    return f"{d:%A}, {d.day} {d:%B %Y}" if d else None


def values_for_hire(db, hire, company_name: Optional[str] = None) -> dict:
    from app.modules.hr.models import Organization
    if company_name is None:
        org = db.query(Organization).filter(Organization.id == hire.organization_id).first()
        company_name = ((org.organization_name or org.name) if org is not None else "") or ""
    first = (hire.candidate_name or "").strip().split(" ")[0] if hire.candidate_name else ""
    return {
        "company_name": company_name,
        "employee_first_name": first,
        "start_date": long_date(hire.joining_date),
        "position": hire.position,
        "manager_name": getattr(hire, "manager_name", None),
    }


SAMPLE_VALUES = {"company_name": "Acme Ltd", "employee_first_name": "Sam", "start_date": "Monday, 7 December 2026",
                 "position": "Product Designer", "manager_name": "Jordan Lee"}


# ── rendering ───────────────────────────────────────────────────────────────────────────────────────────────────────
def fill(text: str, values: dict) -> str:
    """Placeholders replaced by plain values (fallbacks for the unknown ones). Unknown names are dropped, never echoed."""
    def sub(m):
        name = m.group(1)
        if name not in PLACEHOLDERS:
            return ""
        value = values.get(name)
        value = str(value).strip() if value is not None else ""
        return value or FALLBACKS[name]
    return TOKEN.sub(sub, text or "")


def blocks(text: Optional[str], values: Optional[dict] = None) -> list[dict]:
    """[{"type": "heading", "text": str} | {"type": "paragraph", "lines": [str, ...]}] — plain strings, nothing escaped."""
    filled = fill(text or "", values or {}).replace("\r\n", "\n").replace("\r", "\n")
    out: list[dict] = []
    para: list[str] = []

    def flush():
        if para:
            out.append({"type": "paragraph", "lines": list(para)})
            para.clear()

    for raw in filled.split("\n"):
        line = raw.strip()
        if not line:
            flush()
            continue
        m = HEADING.match(line)
        if m:
            flush()
            if m.group(1).strip():
                out.append({"type": "heading", "text": m.group(1).strip()})
            continue
        para.append(line)
    flush()
    return out


def to_html(items: list[dict]) -> str:
    """Escaped HTML: <h2> for headings, <p> per paragraph, <br> for single line breaks."""
    parts = []
    for b in items:
        if b["type"] == "heading":
            parts.append(f"<h2>{escape(b['text'])}</h2>")
        else:
            parts.append("<p>" + "<br>".join(escape(line) for line in b["lines"]) + "</p>")
    return "\n".join(parts)


def to_text(items: list[dict]) -> str:
    parts = []
    for b in items:
        parts.append(b["text"] if b["type"] == "heading" else "\n".join(b["lines"]))
    return "\n\n".join(parts)


def render(text: Optional[str], values: Optional[dict] = None) -> dict:
    items = blocks(text, values)
    return {"blocks": items, "html": to_html(items), "text": to_text(items)}


def render_for_hire(db, hire, settings=None, company_name: Optional[str] = None) -> dict:
    """The hire's welcome message as blocks/html/text, plus the signature. Scoped to the hire's own organisation."""
    if settings is None:
        from app.modules.hr import onboarding_flow
        settings = onboarding_flow.get_settings(db, hire.organization_id)
    out = render(message_for(settings), values_for_hire(db, hire, company_name))
    out["signature"] = signature_for(settings)
    return out
