"""Tables for temporary support sign-ins (see the package docstring)."""
from __future__ import annotations

import enum

from sqlalchemy import Column, DateTime, ForeignKey, Index, Integer, String, Text
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.database import Base


class LoginRequestStatus(str, enum.Enum):
    PENDING = "PENDING"            # waiting for an org admin
    APPROVED = "APPROVED"          # approved; the operator may generate credentials until approval_expires_at
    ACTIVE = "ACTIVE"              # credentials issued; the session runs until its expiry
    COMPLETED = "COMPLETED"        # the session ran out or the operator ended it
    REVOKED = "REVOKED"            # an org admin ended the session early
    REJECTED = "REJECTED"
    CANCELLED = "CANCELLED"        # withdrawn by the operator
    EXPIRED = "EXPIRED"            # nobody decided in time, or credentials were never generated after approval


OPEN_STATUSES = (LoginRequestStatus.PENDING.value, LoginRequestStatus.APPROVED.value, LoginRequestStatus.ACTIVE.value)
ALLOWED_DURATIONS = (5, 15, 30)


class SupportLoginRequest(Base):
    __tablename__ = "support_login_requests"

    id = Column(Integer, primary_key=True, index=True)
    reference = Column(String(30), unique=True, nullable=False)
    organization_id = Column(Integer, ForeignKey("organizations.id"), nullable=False, index=True)
    requested_by = Column(Integer, ForeignKey("employees.id"), nullable=False)
    requested_by_email = Column(String(255), nullable=True)
    justification = Column(Text, nullable=False)
    ticket_reference = Column(String(100), nullable=True)
    duration_minutes = Column(Integer, nullable=False)
    status = Column(String(20), nullable=False, default=LoginRequestStatus.PENDING.value, index=True)
    decided_by = Column(Integer, ForeignKey("employees.id"), nullable=True)
    decided_by_email = Column(String(255), nullable=True)
    decided_at = Column(DateTime, nullable=True)
    decision_note = Column(Text, nullable=True)
    pending_expires_at = Column(DateTime, nullable=False)
    approval_expires_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())

    session = relationship("SupportLoginSession", back_populates="request", uselist=False)


class SupportLoginSession(Base):
    """The temporary sign-in issued for an approved request. The password is stored only as a hash."""
    __tablename__ = "support_login_sessions"

    id = Column(Integer, primary_key=True, index=True)
    request_id = Column(Integer, ForeignKey("support_login_requests.id"), nullable=False, unique=True)
    organization_id = Column(Integer, ForeignKey("organizations.id"), nullable=False, index=True)
    acting_user_id = Column(Integer, ForeignKey("employees.id"), nullable=False)   # the approving admin whose view is shown
    username = Column(String(255), nullable=False, unique=True)
    password_hash = Column(String(255), nullable=False)
    issued_at = Column(DateTime, nullable=False)
    expires_at = Column(DateTime, nullable=False)
    first_login_at = Column(DateTime, nullable=True)
    last_seen_at = Column(DateTime, nullable=True)
    ended_at = Column(DateTime, nullable=True)
    ended_by_email = Column(String(255), nullable=True)
    end_cause = Column(String(40), nullable=True)            # expired | ended_by_operator | revoked_by_tenant
    request_count = Column(Integer, nullable=False, default=0, server_default="0")

    request = relationship("SupportLoginRequest", back_populates="session")


class SupportLoginAccessLog(Base):
    """One row per request a support session made: what the tenant's admins see under "what was viewed"."""
    __tablename__ = "support_login_access_log"
    __table_args__ = (Index("ix_support_login_access_log_session_at", "session_id", "at"),)

    id = Column(Integer, primary_key=True, index=True)
    session_id = Column(Integer, ForeignKey("support_login_sessions.id"), nullable=False)
    organization_id = Column(Integer, ForeignKey("organizations.id"), nullable=False, index=True)
    method = Column(String(10), nullable=False)
    path = Column(String(500), nullable=False)
    outcome = Column(String(20), nullable=False)              # allowed | blocked_write
    at = Column(DateTime, nullable=False)
