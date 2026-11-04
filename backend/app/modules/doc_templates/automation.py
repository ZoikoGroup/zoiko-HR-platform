"""Per-organization automation rules for module-triggered documents (Prompt 4 §C2).

Settings → Documents → Automation chooses, per template, what a trigger event does:

    off      nothing is generated (the skip is still audited)
    draft    a draft is generated for HR to review and issue
    auto     the document is issued automatically — allowed only for L1 templates whose execution is NONE or ACKNOWLEDGE
             (a document a person already approved in its module, e.g. an approved offer, is still issued)

With no rule the platform default applies: what Prompts 1–3 do today (L1 notices and records are issued, L2 and L3 documents
wait in the approvals queue). Every automated action records a document event with the triggering event and the mode.
"""
from __future__ import annotations

import logging
from typing import Optional

from fastapi import HTTPException

from app.modules.doc_templates import registry, state
from app.modules.doc_templates.models import DocTemplateSettings, GeneratedDocument

logger = logging.getLogger("zoiko.doc_templates")
MODES = ("off", "draft", "auto")
AUTO_EXECUTION = ("NONE", "ACKNOWLEDGE")


def _row(db, organization_id: int) -> Optional[DocTemplateSettings]:
    return db.query(DocTemplateSettings).filter(DocTemplateSettings.organization_id == organization_id).first()


def mode_for(db, organization_id: int, canonical_id: str) -> str:
    row = _row(db, organization_id)
    m = ((row.automation_rules or {}) if row else {}).get(canonical_id)
    return m if m in MODES else "default"


def may_auto_issue(doc_or_definition) -> bool:
    policy = getattr(doc_or_definition, "approval_policy", None) or getattr(doc_or_definition, "legal_risk", "L3")
    return policy == "L1" and getattr(doc_or_definition, "execution_mode", "SIGN_BOTH") in AUTO_EXECUTION


def record(db, doc: GeneratedDocument, trigger: Optional[str], mode: str) -> None:
    try:
        state.add_event(db, doc, "automation", actor_type="system",
                        detail={"trigger": trigger, "source_ref": doc.source_ref, "mode": mode})
        db.commit()
    except Exception:
        db.rollback()
        logger.warning("automation event failed for document id %s", doc.id)


def record_skip(db, organization_id: int, canonical_id: str, source_ref: Optional[str], trigger: Optional[str]) -> None:
    logger.info("automation off: %s not generated for %s (trigger %s, organization %s)", canonical_id, source_ref, trigger, organization_id)
    try:
        from app.modules.integrations.events import emit_event  # noqa: F401  (ids only; nothing is generated)
    except Exception:
        pass


def rules(db, organization_id: int) -> list[dict]:
    """Every implemented template a module can trigger, with its current mode and whether auto-issue is allowed."""
    from app.modules.doc_templates.models import TemplateDefinition
    row = _row(db, organization_id)
    configured = (row.automation_rules or {}) if row else {}
    out = []
    for d in (db.query(TemplateDefinition).filter(TemplateDefinition.implemented.is_(True)).order_by(TemplateDefinition.canonical_id).all()):
        if d.canonical_id in registry.SYSTEM_RECORDS:
            continue
        out.append({"canonical_id": d.canonical_id, "title": d.title, "approval_policy": d.approval_policy, "execution_mode": d.execution_mode,
                    "trigger": d.lifecycle_trigger, "mode": configured.get(d.canonical_id, "default"),
                    "auto_allowed": may_auto_issue(d),
                    "default_behaviour": "auto" if d.approval_policy == "L1" else "draft"})
    return out


def save(db, actor, changes: dict) -> list[dict]:
    from app.modules.doc_templates import access
    from app.modules.doc_templates.models import TemplateDefinition
    access.require_org_admin(actor)
    from app.modules.doc_templates import entitlements, preflight
    key = entitlements.feature_for("automation")
    if not preflight.entitled(db, actor.organization_id, key):
        raise HTTPException(402, {"code": "PLAN_FEATURE_REQUIRED", "feature_key": key,
                                  "message": "Document automation is not included in your plan. Upgrade to choose automation per template."})
    row = _row(db, actor.organization_id)
    if row is None:
        row = DocTemplateSettings(organization_id=actor.organization_id)
        db.add(row)
    current = dict(row.automation_rules or {})
    for cid, mode in (changes or {}).items():
        if cid == "_generation":
            if mode not in ("on", "off"):
                raise HTTPException(422, "_generation must be on or off.")
            current[cid] = mode
            continue
        d = db.get(TemplateDefinition, cid)
        if d is None or not d.implemented or cid in registry.SYSTEM_RECORDS:
            raise HTTPException(422, f"{cid} is not a template that can be automated.")
        if mode == "default":
            current.pop(cid, None)
            continue
        if mode not in MODES:
            raise HTTPException(422, f"Mode must be one of {', '.join(MODES)} or default.")
        if mode == "auto" and not may_auto_issue(d):
            raise HTTPException(422, {"code": "AUTO_ISSUE_NOT_ALLOWED",
                                      "message": f"{cid} needs approval or a signature, so it cannot be issued automatically."})
        current[cid] = mode
    row.automation_rules = current
    row.updated_by = actor.id
    db.commit()
    return rules(db, actor.organization_id)
