"""System automation rules (ZHR-DOCS-ARCH-001 §13.1). Seeded per organization; they can be paused but not deleted.

Decision Q10 (2026-11-19): seeded PAUSED for organizations that existed before the automation layer (they opt in), ACTIVE
for organizations created afterwards. Payslip publishing is not seeded: payroll ingestion is deferred (decision Q1).
"""
from typing import Optional

from sqlalchemy.orm import Session

from app.modules.hr.documents.automation.models import AutomationRule, RuleStatus

SYSTEM_RULES = (
    {
        "key": "sys.onboarding_checklist", "name": "Onboarding checklist", "trigger_event": "employee.created",
        "description": "When someone joins, ask them to upload every required document, with reminders.",
        "definition": {"feature": "onboarding", "conditions": {"all": []},
                       "actions": [{"type": "create_upload_tasks", "due_in_days": 14}]},
    },
    {
        "key": "sys.upload_review_notice", "name": "New upload to review", "trigger_event": "document.uploaded",
        "description": "Tell HR admins when an employee uploads a document that needs review.",
        "definition": {"conditions": {"all": [{"field": "data.source", "op": "eq", "value": "employee"}]},
                       "actions": [{"type": "notify_upload_for_review"}]},
    },
    {
        "key": "sys.decision_notify_approved", "name": "Tell the employee: approved", "trigger_event": "document.approved",
        "description": "Tell the person when their document is approved.",
        "definition": {"conditions": {"all": [{"field": "data.scope", "op": "eq", "value": "employee"}]},
                       "actions": [{"type": "notify_document_decision"}]},
    },
    {
        "key": "sys.decision_notify_rejected", "name": "Tell the employee: not approved", "trigger_event": "document.rejected",
        "description": "Tell the person when their document is rejected or a new copy is requested, with the reason, and open a re-upload task.",
        "definition": {"conditions": {"all": []}, "actions": [{"type": "notify_document_decision", "due_in_days": 7}]},
    },
    {
        "key": "sys.role_change_reassign", "name": "Role change: re-check required documents", "trigger_event": "employee.role_changed",
        "description": "When someone's role, department or designation changes, stop asking for documents that no longer apply and ask for newly required ones.",
        "definition": {"feature": "onboarding", "conditions": {"all": []},
                       "actions": [{"type": "reassess_requirements", "due_in_days": 14}]},
    },
    {
        "key": "sys.expiry_reupload", "name": "Expired document: ask for a new copy", "trigger_event": "document.expired",
        "description": "When an approved document expires, ask the person for a valid copy.",
        "definition": {"feature": "expiry", "conditions": {"all": [{"field": "data.kind", "op": "eq", "value": "uploaded"}]},
                       "actions": [{"type": "open_renew_task", "due_in_days": 14}]},
    },
)


def seed_org(db: Session, organization_id: int, *, status: str = RuleStatus.ACTIVE.value,
             created_by: Optional[int] = None) -> int:
    """Create any missing system rule for the organization (idempotent; existing rules keep their status and edits)."""
    have = {k for (k,) in db.query(AutomationRule.key).filter(AutomationRule.organization_id == organization_id)}
    added = 0
    for spec in SYSTEM_RULES:
        if spec["key"] in have:
            continue
        db.add(AutomationRule(organization_id=organization_id, key=spec["key"], name=spec["name"],
                              description=spec["description"], trigger_event=spec["trigger_event"],
                              definition=spec["definition"], status=status, is_system=True, created_by=created_by))
        added += 1
    if added:
        db.flush()
    return added
