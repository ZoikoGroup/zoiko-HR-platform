"""Support-access control plane (ZHR-PRIV-001 section 02, B03-B09, B11).

The rule this module exists to enforce: Super Admin has NO standing access to tenant data. The only route in is a
support grant that is requested by a named engineer, approved by a tenant-designated authoriser, independently
co-approved by Security/Privacy when high-risk, and issued as a short-lived, single-tenant, action- and
field-limited capability.

These are CONTROL-plane tables. They describe a tenant's records by opaque IDs only. A support request NEVER copies an
employee name, salary, bank, medical or any other tenant value into this plane; the tenant plane is what renders those
so the authoriser can see exactly what is being asked for.

Status is never written directly: it moves only through `app.modules.support_access.state`. A test scans for stray direct
status assignments outside that module.
"""
from __future__ import annotations

import enum
import uuid
from datetime import datetime

from sqlalchemy import (
    JSON,
    Boolean,
    CheckConstraint,
    Column,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
    false,
)
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.database import Base


def new_uuid() -> str:
    return str(uuid.uuid4())


# ── vocabulary ──────────────────────────────────────────────────────────────────────────────────────────────────────
class PurposeCategory(str, enum.Enum):
    TROUBLESHOOTING = "TROUBLESHOOTING"
    DATA_CORRECTION_ASSIST = "DATA_CORRECTION_ASSIST"
    INCIDENT = "INCIDENT"
    MIGRATION_ASSIST = "MIGRATION_ASSIST"
    OTHER = "OTHER"


class RiskLevel(str, enum.Enum):
    STANDARD = "STANDARD"
    HIGH = "HIGH"


class RequestStatus(str, enum.Enum):
    DRAFT = "DRAFT"
    PENDING_TENANT = "PENDING_TENANT"
    PENDING_INDEPENDENT = "PENDING_INDEPENDENT"
    APPROVED = "APPROVED"
    ACTIVE = "ACTIVE"
    CLOSED = "CLOSED"
    EXPIRED = "EXPIRED"
    REVOKED = "REVOKED"
    REJECTED = "REJECTED"
    CANCELLED = "CANCELLED"


class ApprovalType(str, enum.Enum):
    TENANT = "TENANT"
    SECURITY = "SECURITY"
    PRIVACY = "PRIVACY"


class ApprovalDecision(str, enum.Enum):
    APPROVED = "APPROVED"
    APPROVED_NARROWED = "APPROVED_NARROWED"
    REJECTED = "REJECTED"


class GrantKind(str, enum.Enum):
    STANDARD = "STANDARD"
    BREAK_GLASS = "BREAK_GLASS"


class RevocationTarget(str, enum.Enum):
    GRANT = "GRANT"
    SESSION = "SESSION"
    PERSON = "PERSON"
    TENANT = "TENANT"
    GLOBAL = "GLOBAL"


class BreakGlassStatus(str, enum.Enum):
    PENDING_CONFIRMATION = "PENDING_CONFIRMATION"
    ACTIVE = "ACTIVE"
    ENDED = "ENDED"
    LAPSED = "LAPSED"


class BreakGlassReview(str, enum.Enum):
    PENDING_REVIEW = "PENDING_REVIEW"
    REVIEWED_OK = "REVIEWED_OK"
    REVIEWED_ISSUE = "REVIEWED_ISSUE"


class NoticeStatus(str, enum.Enum):
    NOT_REQUIRED = "NOT_REQUIRED"
    PENDING = "PENDING"
    SENT = "SENT"
    ACKNOWLEDGED = "ACKNOWLEDGED"


# Actions a grant may carry. `update` is special-cased in the flow (DATA_CORRECTION_ASSIST + extra approval).
# `impersonate` is deliberately absent: it can never be granted.
GRANTABLE_ACTIONS = frozenset({"list", "read", "search", "export", "download", "bulk_read", "update"})
# Actions that on their own push a request to HIGH risk (exports, downloads, bulk reads, writes).
HIGH_RISK_ACTIONS = frozenset({"export", "download", "bulk_read", "update"})

DEFAULT_DURATION_MINUTES = 30
MAX_DURATION_MINUTES = 120
BREAKGLASS_MAX_MINUTES = 60
APPROVAL_WINDOW_HOURS = 24


# ── tables ──────────────────────────────────────────────────────────────────────────────────────────────────────────
class TenantAuthoriser(Base):
    """A tenant-plane user the tenant has designated to approve support access on its behalf.

    Only TENANT_OWNER / TENANT_ADMIN may designate, the act itself is audited and needs fresh MFA, and `scope_limits`
    records which data categories this authoriser may approve. The default excludes SPECIAL_CATEGORY: a tenant must opt
    in explicitly before one of its authorisers can approve access to special-category data.
    """

    __tablename__ = "support_tenant_authorisers"

    id = Column(Integer, primary_key=True, index=True)
    tenant_id = Column(Integer, ForeignKey("organizations.id"), nullable=False, index=True)
    user_id = Column(Integer, ForeignKey("employees.id"), nullable=False, index=True)
    designated_by = Column(Integer, ForeignKey("employees.id"), nullable=True)
    designated_at = Column(DateTime, nullable=False, server_default=func.now())
    revoked_at = Column(DateTime, nullable=True)
    revoked_by = Column(Integer, ForeignKey("employees.id"), nullable=True)
    # e.g. ["PLATFORM_META", "TENANT_AGGREGATE", "PERSONAL_BASIC", "PERSONAL_CONFIDENTIAL", "FINANCIAL",
    #       "TENANT_FILE", "TENANT_BUSINESS_FINANCE", "TENANT_CUSTOMER"]
    scope_limits = Column(JSON, nullable=False)
    note = Column(Text, nullable=True)

    __table_args__ = (
        Index("ix_support_authorisers_tenant_active", "tenant_id", "revoked_at"),
        Index("ix_support_authorisers_user", "user_id", "revoked_at"),
    )

    @property
    def active(self) -> bool:
        return self.revoked_at is None


class SupportAccessRequest(Base):
    """An engineer's request for time-limited access to one tenant's records. Creating one grants nothing."""

    __tablename__ = "support_access_requests"

    id = Column(Integer, primary_key=True, index=True)
    reference = Column(String(32), unique=True, nullable=False, index=True)
    tenant_id = Column(Integer, ForeignKey("organizations.id"), nullable=False, index=True)
    requester_person_id = Column(Integer, ForeignKey("employees.id"), nullable=False, index=True)
    # The platform account used to make the request. Always owned by the same person.
    requester_account_id = Column(Integer, ForeignKey("employees.id"), nullable=True)
    ticket_reference = Column(String(200), nullable=False)
    purpose = Column(Text, nullable=False)
    purpose_category = Column(String(40), nullable=False)
    risk_level = Column(String(20), nullable=False, server_default=RiskLevel.STANDARD.value)
    status = Column(String(30), nullable=False, server_default=RequestStatus.DRAFT.value, index=True)
    requested_scope = Column(JSON, nullable=False)
    requested_duration_minutes = Column(Integer, nullable=False, server_default=str(DEFAULT_DURATION_MINUTES))
    # Required only when the request touches SPECIAL_CATEGORY data (E10): points at a documented Privacy/Legal assessment.
    legal_basis_reference = Column(String(300), nullable=True)
    created_at = Column(DateTime, nullable=False, server_default=func.now())
    updated_at = Column(DateTime, nullable=True, onupdate=func.now())
    submitted_at = Column(DateTime, nullable=True)
    closed_at = Column(DateTime, nullable=True)
    close_reason = Column(String(200), nullable=True)
    # Requests auto-expire when nobody decides within the configured window.
    approval_expires_at = Column(DateTime, nullable=True)
    # One-at-a-time rule: this is the engineer's sequence per tenant, so a new request can be refused while one is open.
    request_seq = Column(Integer, nullable=True)

    approvals = relationship("Approval", back_populates="request", cascade="all, delete-orphan")
    grants = relationship("SupportGrant", back_populates="request", cascade="all, delete-orphan")

    __table_args__ = (
        CheckConstraint(
            f"requested_duration_minutes >= 1 AND requested_duration_minutes <= {MAX_DURATION_MINUTES}",
            name="ck_support_request_duration",
        ),
        CheckConstraint("risk_level IN ('STANDARD','HIGH')", name="ck_support_request_risk"),
        Index("ix_support_requests_tenant_status", "tenant_id", "status"),
        Index("ix_support_requests_requester_status", "requester_person_id", "status"),
    )


class Approval(Base):
    """One person's decision on one request. A narrowed approval may only SHRINK the requested scope."""

    __tablename__ = "support_approvals"

    id = Column(Integer, primary_key=True, index=True)
    request_id = Column(Integer, ForeignKey("support_access_requests.id"), nullable=False, index=True)
    approval_type = Column(String(20), nullable=False)
    approver_person_id = Column(Integer, ForeignKey("employees.id"), nullable=False, index=True)
    approver_account_id = Column(Integer, ForeignKey("employees.id"), nullable=True)
    decision = Column(String(30), nullable=False)
    approved_scope = Column(JSON, nullable=True)
    comment = Column(Text, nullable=True)
    mfa_verified_at = Column(DateTime, nullable=True)
    decided_at = Column(DateTime, nullable=False, server_default=func.now())

    request = relationship("SupportAccessRequest", back_populates="approvals")

    __table_args__ = (
        CheckConstraint("approval_type IN ('TENANT','SECURITY','PRIVACY')", name="ck_support_approval_type"),
        CheckConstraint(
            "decision IN ('APPROVED','APPROVED_NARROWED','REJECTED')", name="ck_support_approval_decision"
        ),
        Index("ix_support_approvals_request_type", "request_id", "approval_type"),
    )


class SupportGrant(Base):
    """An issued capability: signed, single-tenant, action- and field-limited, short-lived, revocable."""

    __tablename__ = "support_grants"

    id = Column(String(36), primary_key=True, default=new_uuid)
    request_id = Column(Integer, ForeignKey("support_access_requests.id"), nullable=True, index=True)
    tenant_id = Column(Integer, ForeignKey("organizations.id"), nullable=False, index=True)
    grantee_person_id = Column(Integer, ForeignKey("employees.id"), nullable=False, index=True)
    grantee_account_id = Column(Integer, ForeignKey("employees.id"), nullable=True, index=True)
    kind = Column(String(20), nullable=False, server_default=GrantKind.STANDARD.value)
    effective_scope = Column(JSON, nullable=False)
    issued_at = Column(DateTime, nullable=False, server_default=func.now())
    expires_at = Column(DateTime, nullable=False, index=True)
    revoked_at = Column(DateTime, nullable=True)
    revoke_reason = Column(String(200), nullable=True)
    revoked_by = Column(Integer, ForeignKey("employees.id"), nullable=True)
    # Bumped on every material change (revoke, scope change); enforcement compares it against the token.
    revocation_version = Column(Integer, nullable=False, server_default="1")
    session_id = Column(String(128), nullable=True)
    device_fingerprint = Column(String(128), nullable=True)
    policy_version = Column(String(40), nullable=False)
    token_jti = Column(String(64), unique=True, nullable=False, index=True)
    last_access_at = Column(DateTime, nullable=True)

    request = relationship("SupportAccessRequest", back_populates="grants")

    __table_args__ = (
        CheckConstraint("revocation_version >= 1", name="ck_support_grant_revocation_version"),
        CheckConstraint("expires_at >= issued_at", name="ck_support_grant_expiry_bounds"),
        CheckConstraint("kind IN ('STANDARD','BREAK_GLASS')", name="ck_support_grant_kind"),
        Index("ix_support_grants_tenant_active", "tenant_id", "revoked_at", "expires_at"),
        Index("ix_support_grants_grantee_active", "grantee_person_id", "revoked_at", "expires_at"),
    )


class BreakGlassSession(Base):
    """Emergency access, two-person controlled, read-only by default, non-renewable, reviewed afterwards."""

    __tablename__ = "support_breakglass_sessions"

    id = Column(String(36), primary_key=True, default=new_uuid)
    incident_reference = Column(String(200), nullable=False)
    reason = Column(Text, nullable=False)
    tenant_id = Column(Integer, ForeignKey("organizations.id"), nullable=False, index=True)
    initiator_person_id = Column(Integer, ForeignKey("employees.id"), nullable=False, index=True)
    second_responder_person_id = Column(Integer, ForeignKey("employees.id"), nullable=True)
    scope = Column(JSON, nullable=False)
    status = Column(String(30), nullable=False, server_default=BreakGlassStatus.PENDING_CONFIRMATION.value, index=True)
    started_at = Column(DateTime, nullable=True)
    confirm_deadline = Column(DateTime, nullable=True)   # a second responder must confirm before this, else it lapses
    expires_at = Column(DateTime, nullable=True)
    ended_at = Column(DateTime, nullable=True)
    ended_by = Column(Integer, ForeignKey("employees.id"), nullable=True)
    grant_id = Column(String(36), ForeignKey("support_grants.id"), nullable=True)
    review_status = Column(String(30), nullable=False, server_default=BreakGlassReview.PENDING_REVIEW.value)
    reviewed_by = Column(Integer, ForeignKey("employees.id"), nullable=True)
    reviewed_at = Column(DateTime, nullable=True)
    review_note = Column(Text, nullable=True)
    customer_notice_status = Column(String(30), nullable=False, server_default=NoticeStatus.PENDING.value)
    created_at = Column(DateTime, nullable=False, server_default=func.now())

    __table_args__ = (
        CheckConstraint(
            "status IN ('PENDING_CONFIRMATION','ACTIVE','ENDED','LAPSED')", name="ck_breakglass_status"
        ),
        CheckConstraint(
            "review_status IN ('PENDING_REVIEW','REVIEWED_OK','REVIEWED_ISSUE')", name="ck_breakglass_review"
        ),
        Index("ix_breakglass_tenant_status", "tenant_id", "status"),
    )


class RevocationEvent(Base):
    """Every revocation: what was killed, by whom, why, and whether it has propagated everywhere."""

    __tablename__ = "support_revocation_events"

    id = Column(Integer, primary_key=True, index=True)
    target_type = Column(String(20), nullable=False)          # GRANT | SESSION | PERSON | TENANT | GLOBAL
    target_ref = Column(String(100), nullable=True)           # grant id / session id / person id / tenant id, NULL for GLOBAL
    tenant_id = Column(Integer, ForeignKey("organizations.id"), nullable=True, index=True)
    actor_person_id = Column(Integer, ForeignKey("employees.id"), nullable=True)
    reason = Column(String(300), nullable=False)
    requested_at = Column(DateTime, nullable=False, server_default=func.now())
    propagated_at = Column(DateTime, nullable=True)
    propagation_confirmed = Column(Boolean, nullable=False, server_default=false())
    detail = Column(JSON, nullable=True)

    __table_args__ = (
        CheckConstraint(
            "target_type IN ('GRANT','SESSION','PERSON','TENANT','GLOBAL')", name="ck_revocation_target"
        ),
        Index("ix_revocation_target", "target_type", "target_ref"),
    )
