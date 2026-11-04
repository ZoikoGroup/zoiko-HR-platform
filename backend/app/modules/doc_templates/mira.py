"""What Mira may read from the document engine (Prompt 4 §C7): the caller's own pending documents and catalogue metadata.

The assistant package never imports the engine; this module registers its two read-only answerers into
`assistant.document_intents` instead (loaded from `golive`, which the app always imports). Nothing here reads document
contents, and nothing approves, issues, signs or sends.
"""
from __future__ import annotations

from app.modules.assistant import document_intents
from app.modules.doc_templates import access


def pending_answer(db, employee) -> str:
    """The caller's own documents waiting for an action. Titles only for C2; C3/C4 get a neutral label. No contents."""
    from app.modules.doc_templates.models import GeneratedDocument
    rows = (db.query(GeneratedDocument)
            .filter(access.list_filter(db, employee), GeneratedDocument.recipient_employee_id == employee.id,
                    GeneratedDocument.status == "ISSUED", GeneratedDocument.execution_mode != "NONE")
            .order_by(GeneratedDocument.due_by.is_(None), GeneratedDocument.due_by).limit(10).all())
    if not rows:
        return document_intents.NOTHING_PENDING
    lines = []
    for d in rows:
        label = d.title if d.sensitivity == "C2" else "Confidential document"
        due = f", due {d.due_by.strftime('%d %b %Y')}" if d.due_by else ""
        action = "acknowledge" if d.execution_mode == "ACKNOWLEDGE" else "sign"
        lines.append(f"- {label} ({d.document_number}): {action}{due} — /employee/documents/company?generated={d.id}")
    return "These documents are waiting for you:\n" + "\n".join(lines)


def template_answer(db, text: str) -> str:
    from app.modules.doc_templates.models import TemplateDefinition
    from app.modules.doc_templates.registry import FAMILIES
    out = []
    for cid in document_intents.template_ids(text):
        d = db.get(TemplateDefinition, cid)
        if d is None:
            out.append(f"{cid} is not in the template catalogue.")
            continue
        family = FAMILIES.get(d.family_id, (d.family_id,))[0]
        status = "available in Zoiko HR" if d.implemented else "not available yet"
        out.append(f"{cid} — {d.title}: a {d.kind.lower().replace('_', ' ')} in {family.lower()}, {status}. "
                   "Whether it can be used for you depends on your organization's released templates for your country.")
    return "\n".join(out) or document_intents.TEMPLATE_HINT


document_intents.register(pending=pending_answer, template=template_answer)
