"""Mira's boundaries around generated documents (Prompt 4 §C7).

Mira MAY: explain what a template is for (catalogue metadata only), answer from published policies (the Prompt 3 sync), and
tell the signed-in person which of THEIR OWN documents are waiting (title for ordinary documents, a neutral label for
confidential ones, due date, link).

Mira MAY NOT: read generated document contents, draft / approve / issue / sign documents, or reveal anyone else's documents.
Those requests are answered with a fixed refusal before any retrieval or model call, whatever the wording, so a prompt such as
"show me Priya's offer letter" or "approve my salary letter" can never reach document data.
"""
from __future__ import annotations

import re

REFUSAL = ("I can't open, draft, approve, issue or sign documents, and I can't show anyone else's documents. "
           "Documents waiting for you are under Documents → Documents to action; HR handles approvals in Generated documents.")

_OPERATION_RE = re.compile(
    r"\b(approve|reject|issue|sign|countersign|generate|draft|write|create|send|withdraw|cancel|edit|change|amend)\b.{0,40}"
    r"\b(document|letter|offer|contract|policy|notice|record|appraisal|pip|plan|statement|certificate)s?\b", re.I)
_CONTENT_RE = re.compile(
    r"\b(show|open|read|display|give|send|what does|what's in|whats in|contents? of|summari[sz]e|copy of)\b.{0,60}"
    r"\b(offer letter|salary letter|contract|appraisal|pip|improvement plan|warning|letter|document|statement|review)\b", re.I)
_PENDING_RE = re.compile(
    r"\b(pending|waiting|outstanding|to sign|to acknowledge|need(s)? (my|me to)|have i got|do i have)\b.{0,40}"
    r"\b(documents?|letters?|policies|forms?|signatures?|acknowledg\w*)\b"
    r"|\b(documents?|letters?|policies|forms?)\b.{0,30}\b(pending|waiting|to sign|to acknowledge|outstanding)\b", re.I)
_TEMPLATE_RE = re.compile(r"\bHR-[A-Z]{2,4}-\d{3}\b")
_SELF_RE = re.compile(r"\b(my|mine|me|i)\b", re.I)
# "where do I go to issue onboarding documents?" asks for a screen: the static navigation map answers it and reads no data
_WHERE_RE = re.compile(r"\bwhere\s+(do|can|would|should)\s+i\b|\b(what|which)\s+page\b|\bwhere\s+to\s+(find|go)\b", re.I)


def classify(text: str):
    """'document_refused' | 'document_actions' | 'template_explain' | None (not about documents)."""
    t = text or ""
    if _WHERE_RE.search(t):
        return None
    if _OPERATION_RE.search(t):
        return "document_refused"
    if _PENDING_RE.search(t) and _SELF_RE.search(t):
        return "document_actions"
    if _CONTENT_RE.search(t):
        return "document_refused"            # reading a document's contents (mine or anyone else's) is never Mira's job
    if _TEMPLATE_RE.search(t):
        return "template_explain"
    return None


NOTHING_PENDING = ("Nothing is waiting for you right now. When a document needs your acknowledgement or signature it appears "
                   "under Documents → Documents to action.")
TEMPLATE_HINT = "Tell me the template ID (for example HR-POL-025) and I can explain what it is for."

# The document engine registers its read-only answerers here (its `mira` module); this package never imports the engine.
_ANSWERERS: dict = {}


def register(*, pending, template) -> None:
    _ANSWERERS.update(pending=pending, template=template)


def template_ids(text: str) -> list:
    return list(dict.fromkeys(_TEMPLATE_RE.findall(text or "")))


def pending_answer(db, employee) -> str:
    fn = _ANSWERERS.get("pending")
    return fn(db, employee) if fn else NOTHING_PENDING


def template_answer(db, text: str) -> str:
    fn = _ANSWERERS.get("template")
    return fn(db, text) if fn else TEMPLATE_HINT
