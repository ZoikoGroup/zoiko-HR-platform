"""
modules/assistant/schemas.py
------------------------------
Pydantic request/response schemas for the assistant API.
"""

from datetime import date, datetime
from typing import Optional, Any

from pydantic import BaseModel, Field


class SuccessResponse(BaseModel):
    success: bool = True
    message: str = "OK"


# ── Conversations ─────────────────────────────────────────────────────────────

class ConversationCreate(BaseModel):
    title: Optional[str] = None


class ConversationResponse(BaseModel):
    id: int
    title: Optional[str]
    is_archived: bool
    created_at: datetime
    updated_at: Optional[datetime]

    class Config:
        from_attributes = True


class ConversationListResponse(BaseModel):
    total: int
    items: list[ConversationResponse]


class ConversationRename(BaseModel):
    title: str = Field(..., min_length=1, max_length=200)


# ── Turns ─────────────────────────────────────────────────────────────────────

class TurnCreate(BaseModel):
    text: str = Field(..., min_length=1, max_length=4000)
    # Manager/admin scope: ask about an authorized team member instead of self.
    # Authorization is re-checked server-side on every turn (WF-09) — the
    # client-supplied id is never trusted on its own.
    subject_employee_id: Optional[int] = None


class SourceRef(BaseModel):
    label: str
    knowledge_source_id: Optional[int] = None
    knowledge_source_version_id: Optional[int] = None
    hr_record_ref: Optional[str] = None
    excerpt: Optional[str] = None
    authority_tier: Optional[str] = None
    source_type: Optional[str] = None
    version_no: Optional[int] = None
    effective_from: Optional[date] = None
    effective_to: Optional[date] = None


class NextAction(BaseModel):
    type: str
    label: str
    workflow_id: Optional[int] = None


class TurnResponse(BaseModel):
    id: int
    conversation_id: int
    sequence_no: int
    user_input_text: str
    intent: Optional[str]
    status: str
    error_message: Optional[str] = None
    answer_text: Optional[str] = None
    answer_type: Optional[str] = None
    confidence_state: Optional[str] = None
    sources: list[SourceRef] = []
    next_actions: list[NextAction] = []
    workflow_id: Optional[int] = None
    subject_employee_id: Optional[int] = None
    subject_name: Optional[str] = None
    created_at: datetime
    completed_at: Optional[datetime] = None


class TurnListResponse(BaseModel):
    total: int
    items: list[TurnResponse]


# ── Manager/delegated scope ────────────────────────────────────────────────────

class TeamMember(BaseModel):
    id: int
    full_name: str
    job_title: Optional[str] = None


class TeamScopeResponse(BaseModel):
    members: list[TeamMember]


# ── Feedback ──────────────────────────────────────────────────────────────────

class FeedbackCreate(BaseModel):
    turn_id: int
    rating: str = Field(..., pattern="^(up|down)$")
    reason_code: Optional[str] = None
    comment: Optional[str] = None


# ── Handoff ───────────────────────────────────────────────────────────────────

class HandoffCreate(BaseModel):
    conversation_id: int
    turn_id: Optional[int] = None
    reason: str
    issue_summary: str


class HandoffResponse(BaseModel):
    id: int
    status: str
    ticket_reference: Optional[str]
    created_at: datetime

    class Config:
        from_attributes = True


# ── Workflow (action engine) ──────────────────────────────────────────────────

class WorkflowFieldOut(BaseModel):
    field_name: str
    field_value: Any
    is_valid: Optional[bool]
    validation_message: Optional[str]


class WorkflowResponse(BaseModel):
    id: int
    workflow_type: str
    status: str
    version: int
    fields: list[WorkflowFieldOut] = []
    validation_messages: list[str] = []
    confirmation_token: Optional[str] = None
    created_at: datetime
    updated_at: Optional[datetime]


class WorkflowConfirmRequest(BaseModel):
    confirmation_token: str


# ── Knowledge admin ────────────────────────────────────────────────────────────

class KnowledgeSourceCreate(BaseModel):
    title: str
    source_type: str = Field(..., pattern="^(policy|faq|sop|compliance|handbook|guide|form)$")
    authority_tier: str = Field("C", pattern="^[ABCD]$")
    content_text: str
    jurisdiction_code: Optional[str] = None
    worker_type: Optional[str] = None
    audience_role: Optional[str] = None
    effective_from: Optional[date] = None
    effective_to: Optional[date] = None


class KnowledgeSourceResponse(BaseModel):
    id: int
    title: str
    source_type: str
    authority_tier: str
    status: str
    created_at: datetime
    updated_at: Optional[datetime]

    class Config:
        from_attributes = True


class KnowledgeSourceVersionResponse(BaseModel):
    id: int
    version_no: int
    content_hash: str
    effective_from: Optional[date]
    effective_to: Optional[date]
    published_at: Optional[datetime]

    class Config:
        from_attributes = True


# ── Operational controls ──────────────────────────────────────────────────────

class OperationalControlUpdate(BaseModel):
    control_type: str = Field(..., pattern="^(generation_kill_switch|action_kill_switch)$")
    is_enabled: bool


class OperationalControlResponse(BaseModel):
    control_type: str
    is_enabled: bool
    updated_at: Optional[datetime]

    class Config:
        from_attributes = True


class CapabilitiesResponse(BaseModel):
    generation_enabled: bool
    actions_enabled: bool
    supported_workflow_types: list[str]
