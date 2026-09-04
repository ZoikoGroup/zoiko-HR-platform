"""
modules/assistant/models.py
----------------------------
SQLAlchemy models for the HR Assistant (chatbot) module.

Follows the same convention as app.modules.hr.models: Integer autoincrement
PKs, organization_id FK for tenant scoping, created_at/updated_at timestamps.
Table names are prefixed `chat_`/`knowledge_` to keep them visually grouped
and to avoid any collision with existing HR tables.
"""

import enum

from sqlalchemy import (
    Column, Integer, String, Numeric, Boolean, Date, DateTime,
    Text, Enum, ForeignKey, JSON, UniqueConstraint, Index,
)
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from pgvector.sqlalchemy import Vector

from app.database import Base

EMBEDDING_DIM = 384  # BAAI/bge-small-en-v1.5


# ── Enums ────────────────────────────────────────────────────────────────────

class TurnStatus(str, enum.Enum):
    ACCEPTED = "accepted"
    CLASSIFYING = "classifying"
    RETRIEVING = "retrieving"
    GENERATING = "generating"
    VALIDATING = "validating"
    AWAITING_CONFIRMATION = "awaiting_confirmation"
    EXECUTING = "executing"
    COMPLETED = "completed"
    RECONCILIATION_REQUIRED = "reconciliation_required"
    RESTRICTED = "restricted"
    FAILED = "failed"


class AnswerType(str, enum.Enum):
    GROUNDED = "grounded"
    PARTIAL = "partial"
    NO_ANSWER = "no_answer"
    ACTION = "action"
    RESTRICTED = "restricted"


class ConfidenceState(str, enum.Enum):
    SUPPORTED = "supported"
    PARTIAL = "partial"
    NO_RELIABLE_ANSWER = "no_reliable_answer"
    CONFLICT = "conflict"
    RESTRICTED = "restricted"


class AttachmentScanStatus(str, enum.Enum):
    PENDING = "pending"
    CLEAN = "clean"
    INFECTED = "infected"
    REJECTED = "rejected"


class EligibilityState(str, enum.Enum):
    ELIGIBLE = "eligible"
    INELIGIBLE_SCOPE = "ineligible_scope"
    INELIGIBLE_STALE = "ineligible_stale"


class ProvenanceSourceType(str, enum.Enum):
    KNOWLEDGE = "knowledge"
    HR_RECORD = "hr_record"


class KnowledgeStatus(str, enum.Enum):
    DRAFT = "draft"
    REVIEW = "review"
    PUBLISHED = "published"
    SUPERSEDED = "superseded"
    RETIRED = "retired"


class WorkflowStatus(str, enum.Enum):
    DRAFT = "draft"
    VALIDATED = "validated"
    AWAITING_CONFIRMATION = "awaiting_confirmation"
    EXECUTING = "executing"
    COMPLETED = "completed"
    FAILED = "failed"
    RECONCILIATION_REQUIRED = "reconciliation_required"
    CANCELLED = "cancelled"


class HandoffStatus(str, enum.Enum):
    OPEN = "open"
    SENT = "sent"
    RESOLVED = "resolved"


class ControlType(str, enum.Enum):
    GENERATION_KILL_SWITCH = "generation_kill_switch"
    ACTION_KILL_SWITCH = "action_kill_switch"


class PrivacyRequestType(str, enum.Enum):
    EXPORT = "export"
    DELETE = "delete"
    RESTRICT = "restrict"


class PrivacyRequestStatus(str, enum.Enum):
    PENDING = "pending"
    COMPLETED = "completed"


# ── Conversation domain ──────────────────────────────────────────────────────

class ChatConversation(Base):
    __tablename__ = "chat_conversations"

    id              = Column(Integer, primary_key=True, index=True)
    organization_id = Column(Integer, ForeignKey("organizations.id"), nullable=False, index=True)
    employee_id     = Column(Integer, ForeignKey("employees.id"), nullable=False, index=True)
    title           = Column(String(200), nullable=True)
    is_archived     = Column(Boolean, default=False)
    created_at      = Column(DateTime, server_default=func.now())
    updated_at      = Column(DateTime, onupdate=func.now())

    employee = relationship("Employee", foreign_keys=[employee_id])
    turns    = relationship("ChatTurn", back_populates="conversation", order_by="ChatTurn.sequence_no")


class ChatTurn(Base):
    __tablename__ = "chat_turns"
    __table_args__ = (Index("ix_chat_turns_conversation_seq", "conversation_id", "sequence_no"),)

    id              = Column(Integer, primary_key=True, index=True)
    conversation_id = Column(Integer, ForeignKey("chat_conversations.id"), nullable=False, index=True)
    organization_id = Column(Integer, ForeignKey("organizations.id"), nullable=False, index=True)
    employee_id     = Column(Integer, ForeignKey("employees.id"), nullable=False, index=True)
    sequence_no     = Column(Integer, nullable=False)
    user_input_text = Column(Text, nullable=False)
    intent          = Column(String(50), nullable=True)
    status          = Column(Enum(TurnStatus), default=TurnStatus.ACCEPTED, nullable=False)
    error_message   = Column(Text, nullable=True)
    created_at      = Column(DateTime, server_default=func.now())
    completed_at    = Column(DateTime, nullable=True)

    conversation = relationship("ChatConversation", back_populates="turns")
    response     = relationship("ChatResponse", back_populates="turn", uselist=False)
    workflow     = relationship("ChatWorkflow", back_populates="turn", uselist=False)


class ChatResponse(Base):
    __tablename__ = "chat_responses"

    id               = Column(Integer, primary_key=True, index=True)
    turn_id          = Column(Integer, ForeignKey("chat_turns.id"), nullable=False, unique=True, index=True)
    answer_text      = Column(Text, nullable=True)
    answer_type      = Column(Enum(AnswerType), nullable=False)
    confidence_state = Column(Enum(ConfidenceState), nullable=False)
    next_actions     = Column(JSON, default=list, nullable=True)
    created_at       = Column(DateTime, server_default=func.now())

    turn = relationship("ChatTurn", back_populates="response")
    provenance = relationship("ChatResponseProvenance", back_populates="response")


class ChatModelRun(Base):
    __tablename__ = "chat_model_runs"

    id               = Column(Integer, primary_key=True, index=True)
    turn_id          = Column(Integer, ForeignKey("chat_turns.id"), nullable=False, index=True)
    provider         = Column(String(30), nullable=False, default="groq")
    model_name       = Column(String(100), nullable=False)
    purpose          = Column(String(30), nullable=False)  # classify | generate
    prompt_tokens    = Column(Integer, nullable=True)
    completion_tokens = Column(Integer, nullable=True)
    latency_ms       = Column(Integer, nullable=True)
    created_at       = Column(DateTime, server_default=func.now())


class ChatToolCall(Base):
    __tablename__ = "chat_tool_calls"

    id          = Column(Integer, primary_key=True, index=True)
    turn_id     = Column(Integer, ForeignKey("chat_turns.id"), nullable=False, index=True)
    tool_name   = Column(String(100), nullable=False)
    arguments   = Column(JSON, nullable=True)
    result_ref  = Column(String(200), nullable=True)
    created_at  = Column(DateTime, server_default=func.now())


# ── Attachments ──────────────────────────────────────────────────────────────

class ChatAttachment(Base):
    __tablename__ = "chat_attachments"

    id              = Column(Integer, primary_key=True, index=True)
    conversation_id = Column(Integer, ForeignKey("chat_conversations.id"), nullable=False, index=True)
    uploaded_by     = Column(Integer, ForeignKey("employees.id"), nullable=False)
    file_path       = Column(String(500), nullable=False)
    file_name       = Column(String(255), nullable=False)
    mime_type       = Column(String(100), nullable=True)
    size_bytes      = Column(Integer, nullable=False)
    scan_status     = Column(Enum(AttachmentScanStatus), default=AttachmentScanStatus.PENDING, nullable=False)
    created_at      = Column(DateTime, server_default=func.now())


class ChatAttachmentProcessing(Base):
    __tablename__ = "chat_attachment_processing"

    id            = Column(Integer, primary_key=True, index=True)
    attachment_id = Column(Integer, ForeignKey("chat_attachments.id"), nullable=False, index=True)
    stage         = Column(String(30), nullable=False)  # scan | extract | classify
    status        = Column(String(30), nullable=False)
    detail        = Column(Text, nullable=True)
    created_at    = Column(DateTime, server_default=func.now())


# ── Retrieval / knowledge ─────────────────────────────────────────────────────

class ChatRetrievalRun(Base):
    __tablename__ = "chat_retrieval_runs"

    id         = Column(Integer, primary_key=True, index=True)
    turn_id    = Column(Integer, ForeignKey("chat_turns.id"), nullable=False, index=True)
    query_text = Column(Text, nullable=False)
    created_at = Column(DateTime, server_default=func.now())

    hits = relationship("ChatRetrievalHit", back_populates="retrieval_run")


class ChatRetrievalHit(Base):
    __tablename__ = "chat_retrieval_hits"

    id                  = Column(Integer, primary_key=True, index=True)
    retrieval_run_id    = Column(Integer, ForeignKey("chat_retrieval_runs.id"), nullable=False, index=True)
    knowledge_fragment_id = Column(Integer, ForeignKey("knowledge_fragments.id"), nullable=False, index=True)
    rank                = Column(Integer, nullable=False)
    score                = Column(Numeric(6, 5), nullable=False)
    eligibility_state    = Column(Enum(EligibilityState), default=EligibilityState.ELIGIBLE, nullable=False)

    retrieval_run = relationship("ChatRetrievalRun", back_populates="hits")


class ChatResponseProvenance(Base):
    __tablename__ = "chat_response_provenance"

    id                        = Column(Integer, primary_key=True, index=True)
    response_id               = Column(Integer, ForeignKey("chat_responses.id"), nullable=False, index=True)
    source_type               = Column(Enum(ProvenanceSourceType), nullable=False)
    knowledge_source_version_id = Column(Integer, ForeignKey("knowledge_source_versions.id"), nullable=True)
    hr_record_ref             = Column(String(200), nullable=True)  # e.g. "leave_balances:employee_id=12"

    response = relationship("ChatResponse", back_populates="provenance")


class KnowledgeSource(Base):
    __tablename__ = "knowledge_sources"

    id              = Column(Integer, primary_key=True, index=True)
    organization_id = Column(Integer, ForeignKey("organizations.id"), nullable=False, index=True)
    title           = Column(String(255), nullable=False)
    source_type     = Column(String(30), nullable=False)  # policy | faq | sop | compliance | handbook | guide | form
    authority_tier  = Column(String(1), nullable=False, default="C")  # A | B | C | D
    status          = Column(Enum(KnowledgeStatus), default=KnowledgeStatus.DRAFT, nullable=False)
    owner_employee_id = Column(Integer, ForeignKey("employees.id"), nullable=True)
    # Visible to the public, unauthenticated assistant (zoikohr.com) regardless
    # of which organization owns/authors it — decoupled from organization_id
    # so public content never needs a fake tenant. See retrieval_service.retrieve_public().
    is_public       = Column(Boolean, nullable=False, default=False)
    created_at      = Column(DateTime, server_default=func.now())
    updated_at      = Column(DateTime, onupdate=func.now())

    versions = relationship("KnowledgeSourceVersion", back_populates="source", order_by="KnowledgeSourceVersion.version_no")


class KnowledgeSourceVersion(Base):
    __tablename__ = "knowledge_source_versions"
    __table_args__ = (UniqueConstraint("knowledge_source_id", "version_no", name="uq_knowledge_source_version"),)

    id                 = Column(Integer, primary_key=True, index=True)
    knowledge_source_id = Column(Integer, ForeignKey("knowledge_sources.id"), nullable=False, index=True)
    version_no         = Column(Integer, nullable=False)
    content_text       = Column(Text, nullable=False)
    content_hash       = Column(String(64), nullable=False)
    effective_from     = Column(Date, nullable=True)
    effective_to       = Column(Date, nullable=True)
    published_at       = Column(DateTime, nullable=True)
    published_by       = Column(Integer, ForeignKey("employees.id"), nullable=True)
    created_at         = Column(DateTime, server_default=func.now())

    source    = relationship("KnowledgeSource", back_populates="versions")
    applicability = relationship("KnowledgeApplicability", back_populates="version")
    fragments = relationship("KnowledgeFragment", back_populates="version")


class KnowledgeApplicability(Base):
    __tablename__ = "knowledge_applicability"

    id                          = Column(Integer, primary_key=True, index=True)
    knowledge_source_version_id = Column(Integer, ForeignKey("knowledge_source_versions.id"), nullable=False, index=True)
    jurisdiction_code           = Column(String(10), nullable=True)  # null = all
    worker_type                 = Column(String(30), nullable=True)  # null = all
    audience_role               = Column(String(30), nullable=True)  # null = all roles

    version = relationship("KnowledgeSourceVersion", back_populates="applicability")


class KnowledgeFragment(Base):
    __tablename__ = "knowledge_fragments"

    id                          = Column(Integer, primary_key=True, index=True)
    knowledge_source_version_id = Column(Integer, ForeignKey("knowledge_source_versions.id"), nullable=False, index=True)
    chunk_index                 = Column(Integer, nullable=False)
    text                        = Column(Text, nullable=False)
    embedding                   = Column(Vector(EMBEDDING_DIM), nullable=True)
    token_count                 = Column(Integer, nullable=True)
    created_at                  = Column(DateTime, server_default=func.now())

    version = relationship("KnowledgeSourceVersion", back_populates="fragments")


class KnowledgeIngestionRun(Base):
    __tablename__ = "knowledge_ingestion_runs"

    id                  = Column(Integer, primary_key=True, index=True)
    knowledge_source_id = Column(Integer, ForeignKey("knowledge_sources.id"), nullable=False, index=True)
    status              = Column(String(20), nullable=False, default="pending")  # pending|running|completed|failed
    started_at          = Column(DateTime, server_default=func.now())
    completed_at        = Column(DateTime, nullable=True)
    error_message       = Column(Text, nullable=True)


# ── Actions / workflow engine ─────────────────────────────────────────────────

class ChatWorkflow(Base):
    __tablename__ = "chat_workflows"

    id              = Column(Integer, primary_key=True, index=True)
    conversation_id = Column(Integer, ForeignKey("chat_conversations.id"), nullable=False, index=True)
    turn_id         = Column(Integer, ForeignKey("chat_turns.id"), nullable=False, unique=True, index=True)
    organization_id = Column(Integer, ForeignKey("organizations.id"), nullable=False, index=True)
    employee_id     = Column(Integer, ForeignKey("employees.id"), nullable=False, index=True)
    workflow_type   = Column(String(50), nullable=False)  # e.g. "book_leave"
    status          = Column(Enum(WorkflowStatus), default=WorkflowStatus.DRAFT, nullable=False)
    version         = Column(Integer, nullable=False, default=1)
    created_at      = Column(DateTime, server_default=func.now())
    updated_at      = Column(DateTime, onupdate=func.now())

    turn         = relationship("ChatTurn", back_populates="workflow")
    fields       = relationship("ChatWorkflowField", back_populates="workflow")
    validations  = relationship("ChatWorkflowValidation", back_populates="workflow")
    confirmation = relationship("ChatWorkflowConfirmation", back_populates="workflow", uselist=False)
    execution    = relationship("ChatWorkflowExecution", back_populates="workflow", uselist=False)


class ChatWorkflowField(Base):
    __tablename__ = "chat_workflow_fields"

    id          = Column(Integer, primary_key=True, index=True)
    workflow_id = Column(Integer, ForeignKey("chat_workflows.id"), nullable=False, index=True)
    field_name  = Column(String(100), nullable=False)
    field_value = Column(JSON, nullable=True)
    is_valid    = Column(Boolean, nullable=True)
    validation_message = Column(Text, nullable=True)

    workflow = relationship("ChatWorkflow", back_populates="fields")


class ChatWorkflowValidation(Base):
    __tablename__ = "chat_workflow_validations"

    id          = Column(Integer, primary_key=True, index=True)
    workflow_id = Column(Integer, ForeignKey("chat_workflows.id"), nullable=False, index=True)
    rule_name   = Column(String(100), nullable=False)
    passed      = Column(Boolean, nullable=False)
    message     = Column(Text, nullable=True)
    created_at  = Column(DateTime, server_default=func.now())

    workflow = relationship("ChatWorkflow", back_populates="validations")


class ChatWorkflowConfirmation(Base):
    __tablename__ = "chat_workflow_confirmations"

    id                = Column(Integer, primary_key=True, index=True)
    workflow_id       = Column(Integer, ForeignKey("chat_workflows.id"), nullable=False, unique=True, index=True)
    confirmation_token = Column(String(64), nullable=False)
    fingerprint_hash  = Column(String(64), nullable=False)
    workflow_version  = Column(Integer, nullable=False)
    confirmed_by      = Column(Integer, ForeignKey("employees.id"), nullable=False)
    confirmed_at      = Column(DateTime, server_default=func.now())

    workflow = relationship("ChatWorkflow", back_populates="confirmation")


class ChatWorkflowExecution(Base):
    __tablename__ = "chat_workflow_executions"

    id                = Column(Integer, primary_key=True, index=True)
    workflow_id       = Column(Integer, ForeignKey("chat_workflows.id"), nullable=False, unique=True, index=True)
    idempotency_key   = Column(String(100), nullable=False)
    target_record_type = Column(String(50), nullable=True)  # e.g. "leave_requests"
    target_record_id  = Column(Integer, nullable=True)
    status            = Column(String(30), nullable=False, default="pending")  # pending|completed|failed
    result            = Column(JSON, nullable=True)
    executed_at       = Column(DateTime, nullable=True)

    workflow = relationship("ChatWorkflow", back_populates="execution")


class ChatWorkflowReconciliation(Base):
    __tablename__ = "chat_workflow_reconciliations"

    id                    = Column(Integer, primary_key=True, index=True)
    workflow_execution_id = Column(Integer, ForeignKey("chat_workflow_executions.id"), nullable=False, index=True)
    status                = Column(String(30), nullable=False, default="unresolved")  # unresolved|resolved
    checked_at            = Column(DateTime, server_default=func.now())
    resolution            = Column(Text, nullable=True)


class ChatActionEvidence(Base):
    """Immutable audit trail for a consequential action. Never cascade-deleted
    with its conversation — evidence must survive conversation deletion."""
    __tablename__ = "chat_action_evidence"

    id           = Column(Integer, primary_key=True, index=True)
    workflow_id  = Column(Integer, nullable=False, index=True)  # no FK cascade on purpose
    organization_id = Column(Integer, ForeignKey("organizations.id"), nullable=False, index=True)
    evidence_type = Column(String(50), nullable=False)  # draft|validated|confirmed|executed|reconciled
    payload       = Column(JSON, nullable=True)
    created_at    = Column(DateTime, server_default=func.now())


# ── Support / governance ──────────────────────────────────────────────────────

class ChatHandoff(Base):
    __tablename__ = "chat_handoffs"

    id              = Column(Integer, primary_key=True, index=True)
    conversation_id = Column(Integer, ForeignKey("chat_conversations.id"), nullable=False, index=True)
    turn_id         = Column(Integer, ForeignKey("chat_turns.id"), nullable=True)
    organization_id = Column(Integer, ForeignKey("organizations.id"), nullable=False, index=True)
    employee_id     = Column(Integer, ForeignKey("employees.id"), nullable=False, index=True)
    reason          = Column(String(50), nullable=False)  # no_reliable_answer|restricted|user_requested
    issue_summary   = Column(Text, nullable=False)
    status          = Column(Enum(HandoffStatus), default=HandoffStatus.OPEN, nullable=False)
    ticket_reference = Column(String(50), nullable=True)
    resolution_note = Column(Text, nullable=True)
    resolved_by     = Column(Integer, ForeignKey("employees.id"), nullable=True)
    resolved_at     = Column(DateTime, nullable=True)
    created_at      = Column(DateTime, server_default=func.now())


class ChatFeedback(Base):
    __tablename__ = "chat_feedback"

    id          = Column(Integer, primary_key=True, index=True)
    turn_id     = Column(Integer, ForeignKey("chat_turns.id"), nullable=False, index=True)
    response_id = Column(Integer, ForeignKey("chat_responses.id"), nullable=True)
    employee_id = Column(Integer, ForeignKey("employees.id"), nullable=False)
    rating      = Column(String(10), nullable=False)  # up | down
    reason_code = Column(String(30), nullable=True)  # incorrect|outdated|not_enough_detail|other
    comment     = Column(Text, nullable=True)
    created_at  = Column(DateTime, server_default=func.now())


class ChatIdempotencyKey(Base):
    __tablename__ = "chat_idempotency_keys"
    __table_args__ = (
        UniqueConstraint("organization_id", "employee_id", "operation", "idempotency_key",
                          name="uq_chat_idempotency_key"),
    )

    id              = Column(Integer, primary_key=True, index=True)
    organization_id = Column(Integer, ForeignKey("organizations.id"), nullable=False, index=True)
    employee_id     = Column(Integer, ForeignKey("employees.id"), nullable=False)
    operation       = Column(String(50), nullable=False)
    idempotency_key = Column(String(100), nullable=False)
    response_snapshot = Column(JSON, nullable=True)
    created_at      = Column(DateTime, server_default=func.now())


class ChatAuditEvent(Base):
    """Append-only. Never updated or deleted."""
    __tablename__ = "chat_audit_events"

    id               = Column(Integer, primary_key=True, index=True)
    organization_id  = Column(Integer, ForeignKey("organizations.id"), nullable=False, index=True)
    actor_employee_id = Column(Integer, ForeignKey("employees.id"), nullable=True)
    event_type       = Column(String(50), nullable=False)
    entity_type      = Column(String(50), nullable=False)
    entity_id        = Column(Integer, nullable=True)
    payload          = Column(JSON, nullable=True)
    created_at       = Column(DateTime, server_default=func.now())


class ChatSafetyEvent(Base):
    """Append-only guardrail signal log: restricted-category hits, prompt-
    injection pattern detections, disclosure blocks, citation-validation
    failures, source conflicts. Feeds the production monitoring signals in
    the AI Guardrail spec (Section 32) — never stores raw message content,
    only category + minimal structured detail."""
    __tablename__ = "chat_safety_events"

    id              = Column(Integer, primary_key=True, index=True)
    organization_id = Column(Integer, ForeignKey("organizations.id"), nullable=False, index=True)
    turn_id         = Column(Integer, ForeignKey("chat_turns.id"), nullable=True, index=True)
    employee_id     = Column(Integer, ForeignKey("employees.id"), nullable=True)
    category        = Column(String(50), nullable=False, index=True)
    detail          = Column(JSON, nullable=True)
    created_at      = Column(DateTime, server_default=func.now())


class ChatOperationalControl(Base):
    __tablename__ = "chat_operational_controls"
    __table_args__ = (UniqueConstraint("organization_id", "control_type", name="uq_chat_control_org_type"),)

    id              = Column(Integer, primary_key=True, index=True)
    organization_id = Column(Integer, ForeignKey("organizations.id"), nullable=True, index=True)  # null = platform-wide
    control_type    = Column(Enum(ControlType), nullable=False)
    is_enabled      = Column(Boolean, default=False)  # True = kill switch ON (blocking)
    updated_by      = Column(Integer, ForeignKey("employees.id"), nullable=True)
    updated_at      = Column(DateTime, onupdate=func.now(), server_default=func.now())


class ChatPrivacyRequest(Base):
    __tablename__ = "chat_privacy_requests"

    id              = Column(Integer, primary_key=True, index=True)
    organization_id = Column(Integer, ForeignKey("organizations.id"), nullable=False, index=True)
    employee_id     = Column(Integer, ForeignKey("employees.id"), nullable=False, index=True)
    request_type    = Column(Enum(PrivacyRequestType), nullable=False)
    status          = Column(Enum(PrivacyRequestStatus), default=PrivacyRequestStatus.PENDING, nullable=False)
    created_at      = Column(DateTime, server_default=func.now())
    completed_at    = Column(DateTime, nullable=True)
