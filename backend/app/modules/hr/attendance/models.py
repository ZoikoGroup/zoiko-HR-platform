"""New attendance tables (attendance plan §4). The record itself stays in hr/models.AttendanceRecord."""
from sqlalchemy import JSON, BigInteger, Column, Date, DateTime, ForeignKey, Index, Integer, String, Text, UniqueConstraint
from sqlalchemy.sql import func

from app.database import Base

_BIGINT = BigInteger().with_variant(Integer, "sqlite")      # SQLite autoincrements INTEGER PRIMARY KEY only


class AttendanceBreak(Base):
    """One break inside a day's record. start/end are UTC instants; end is NULL while the break is running."""
    __tablename__ = "attendance_breaks"
    __table_args__ = (Index("ix_att_break_record", "attendance_id"),)

    id              = Column(Integer, primary_key=True)
    organization_id = Column(Integer, ForeignKey("organizations.id"), nullable=False, index=True)
    attendance_id   = Column(Integer, ForeignKey("attendance_records.id", ondelete="CASCADE"), nullable=False)
    start_at        = Column(DateTime, nullable=False)
    end_at          = Column(DateTime, nullable=True)
    source          = Column(String(12), nullable=False, default="web", server_default="web")
    created_at      = Column(DateTime, nullable=False, server_default=func.now())


class EmployeeShift(Base):
    """A person's usual shift over a period. A roster entry for a specific date wins over this; this wins over the
    organization's default shift (attendance.default_shift_id)."""
    __tablename__ = "employee_shifts"
    __table_args__ = (Index("ix_emp_shift_lookup", "organization_id", "employee_id", "effective_from"),)

    id              = Column(Integer, primary_key=True)
    organization_id = Column(Integer, ForeignKey("organizations.id"), nullable=False)
    employee_id     = Column(Integer, ForeignKey("employees.id"), nullable=False)
    shift_id        = Column(Integer, ForeignKey("shifts.id"), nullable=False)
    effective_from  = Column(Date, nullable=False)
    effective_to    = Column(Date, nullable=True)          # inclusive; NULL = open-ended
    assigned_by     = Column(Integer, nullable=True)
    created_at      = Column(DateTime, nullable=False, server_default=func.now())


class AttendanceAuditLog(Base):
    """Append-only trail of every attendance change: punches, breaks, admin edits, corrections, automatic marking."""
    __tablename__ = "attendance_audit_log"
    __table_args__ = (Index("ix_att_audit_record", "organization_id", "attendance_id"),
                      Index("ix_att_audit_person_day", "organization_id", "employee_id", "work_date"))

    id              = Column(_BIGINT, primary_key=True)
    organization_id = Column(Integer, ForeignKey("organizations.id"), nullable=False)
    attendance_id   = Column(Integer, nullable=True)       # no FK: the trail outlives a deleted record
    employee_id     = Column(Integer, nullable=False)
    work_date       = Column(Date, nullable=False)
    action          = Column(String(30), nullable=False)   # punch_in | punch_out | break_start | break_end | created |
                                                           # updated | deleted | auto_marked | corrected | recomputed | merged
    actor_id        = Column(Integer, nullable=True)
    actor_type      = Column(String(12), nullable=False, default="user", server_default="user")   # user | system
    source          = Column(String(12), nullable=True)
    before          = Column(JSON, nullable=True)
    after           = Column(JSON, nullable=True)
    reason          = Column(Text, nullable=True)
    ip_address      = Column(String(45), nullable=True)
    user_agent      = Column(String(255), nullable=True)
    created_at      = Column(DateTime, nullable=False, server_default=func.now())


class AttendanceDayClosure(Base):
    """A work day the end-of-day job has finished for an organization (attendance plan M8). A second run skips it."""
    __tablename__ = "attendance_day_closures"
    __table_args__ = (UniqueConstraint("organization_id", "work_date", name="uq_att_day_closure"),)

    id              = Column(Integer, primary_key=True)
    organization_id = Column(Integer, ForeignKey("organizations.id"), nullable=False, index=True)
    work_date       = Column(Date, nullable=False)
    closed_at       = Column(DateTime, nullable=False, server_default=func.now())
    records_written = Column(Integer, nullable=False, default=0, server_default="0")
    records_updated = Column(Integer, nullable=False, default=0, server_default="0")
    missed_punches  = Column(Integer, nullable=False, default=0, server_default="0")
