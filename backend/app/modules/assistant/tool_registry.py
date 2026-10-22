"""Mira's tool registry (ZHR-PRIV-001 D06).

Everything the assistant can DO on tenant data is listed here, with the resource it touches, the action, and the classes of data
involved. A tool runs only after `authorize()` says yes for the CALLING PERSON: the assistant has no identity or rights of its
own, a platform user cannot use it against tenant data (the assistant routes are closed to platform identities), and nothing a
person types or a document says can change the answer, because the decision is made from the signed account, never from text.

Adding a tool means adding it here; `tests/privacy/test_mira.py` fails for an intent that has no registered tool.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Iterable, Optional

from app.core.privacy import policy
from app.core.privacy.policy import AI, Context, Resource, Subject

REFUSAL = "I can't help with that request."


@dataclass(frozen=True)
class Tool:
    name: str
    intent: str
    resource: str                      # a tenant table (the classification registry knows its fields)
    action: str
    fields: Optional[tuple]            # None = every field the answer might read; () = an aggregate (no field values)
    about_a_person: bool               # True: the record belongs to one employee, checked against the caller's scope


TOOLS: dict[str, Tool] = {t.intent: t for t in (
    Tool("leave_balance", "leave_balance", "leave_balances", "read", ("leave_type", "total_days", "used_days", "year"), True),
    Tool("attendance_status", "attendance_status", "attendance_records", "read", ("status", "check_in", "check_out"), True),
    Tool("org_headcount", "org_headcount", "employees", "count", (), False),
    Tool("department_directory", "department_directory", "employees", "list", ("first_name", "last_name", "job_title", "designation_id", "department_id"), False),
    Tool("employee_roster", "employee_roster", "employees", "list", ("first_name", "last_name", "job_title", "designation_id"), False),
    Tool("book_leave", "book_leave", "leave_requests", "create", ("leave_type", "start_date", "end_date", "days"), True),
    Tool("policy_qa", "policy_qa", "knowledge_sources", "read", ("title",), False),
    # the caller's own pending documents: number, title (C2 only), status and due date — never the document contents
    Tool("document_actions", "document_actions", "generated_documents", "read", ("document_number", "title", "status", "due_by"), True),
)}

# intents that call no tool (no tenant data): greetings, the hand-off prompt,
# and product-navigation guidance (a static screen map, no tenant record read)
NO_DATA_INTENTS = ("chitchat:greeting", "chitchat:thanks", "chitchat:farewell", "chitchat:ack", "handoff_request", "navigation_help",
                   # a fixed refusal of any document operation, and catalogue metadata (platform data, no tenant record)
                   "document_refused", "template_explain")


def tool_for(intent: str) -> Optional[Tool]:
    return TOOLS.get(intent)


def ai_subject(user, *, scope_employee_ids: Iterable[int] = ()) -> Subject:
    """The assistant acting for `user`. `scope_employee_ids` are people the user was already authorized to act for (a manager's
    reports, checked by the scope service before the turn started)."""
    caller = policy.subject_for_user(user, report_ids=tuple(scope_employee_ids))
    return Subject(actor_id=getattr(user, "id", None), plane=AI, on_behalf_of=caller)


def authorize_intent(user, intent: str, *, organization_id: Optional[int], target_employee_id: Optional[int] = None, department_id: Optional[int] = None,
                     scope_employee_ids: Iterable[int] = ()) -> policy.Decision:
    """May this person's assistant run the tool for `intent`? Unknown intents are refused (fail closed)."""
    if intent in NO_DATA_INTENTS:
        return policy.Decision(True, policy.ALLOWED)
    tool = tool_for(intent)
    if tool is None:
        return policy.deny(policy.UNKNOWN_RESOURCE)
    subject = ai_subject(user, scope_employee_ids=scope_employee_ids)
    resource = Resource(tool.resource, organization_id, entity_id=target_employee_id, owner_id=target_employee_id if tool.about_a_person else None,
                        department_id=department_id)
    fields = list(tool.fields) if tool.fields is not None else None
    return policy.authorize(subject, tool.action, resource, fields=fields, context=Context(source="ai"))
