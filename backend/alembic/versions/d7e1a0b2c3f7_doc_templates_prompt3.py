"""doc_templates Prompt 3: policies, leave, working time and compensation document data

Revision ID: d7e1a0b2c3f7
Revises: d7e1a0b2c3f6
Create Date: 2026-10-21

* overtime_requests (HR-TIM-007), attendance_correction_requests (HR-TIM-013), shift_notices (HR-TIM-003/004) and
  compensation_statement_requests (HR-CMP-002).
* leave_requests: decision evidence (reason, decider, time), handover note, balance snapshot, family / bereavement answers,
  HR confirmation, the decision record, and `reason_encrypted` for sickness reasons (special-category data).
* attendance_records: authorised overtime; shifts: per-shift standard day; shift_rosters: notice evidence.
* salary_revisions: approval workflow fields (NULL status = recorded before approvals existed); allowances: award terms and
  approval; employee_compensations: base pay, currency, period and frequency; employee_benefits: provider and contributions;
  travel_expenses: decision evidence and second approver.
* template_variants: change_summary, minor_change; policy_distributions: re-acknowledgement link and knowledge-base sync;
  knowledge_sources: the policy (canonical id, version, audience, distribution) a source was published from.
* Data: salary_revisions.employee_id is filled from the compensation record; existing sickness reasons are moved out of the
  plain `reason` column into `reason_encrypted` (Fernet, the application key) so no manager-facing API can return them.

Guarded and reversible. Downgrade decrypts the sickness reasons back into `reason` before dropping the column.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "d7e1a0b2c3f7"
down_revision: Union[str, Sequence[str], None] = "d7e1a0b2c3f6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

NEW_TABLES = ("overtime_requests", "attendance_correction_requests", "shift_notices", "compensation_statement_requests")
_PURPOSE = b"zoiko-hr:leave-special-category"


def _fk_emp(name, nullable=True):
    return lambda: sa.Column(name, sa.Integer(), sa.ForeignKey("employees.id"), nullable=nullable)


_ADDED_COLUMNS = {
    "attendance_records": [
        lambda: sa.Column("overtime_authorized_hours", sa.Numeric(5, 2), nullable=True),
        lambda: sa.Column("overtime_request_id", sa.Integer(), nullable=True),
    ],
    "shifts": [lambda: sa.Column("standard_hours", sa.Numeric(4, 2), nullable=True)],
    "shift_rosters": [
        lambda: sa.Column("notified_at", sa.DateTime(), nullable=True),
        lambda: sa.Column("document_id", sa.Integer(), nullable=True),
        lambda: sa.Column("notice_id", sa.Integer(), nullable=True),
    ],
    "leave_requests": [
        lambda: sa.Column("decision_reason", sa.String(None), nullable=True),
        _fk_emp("decided_by"),
        lambda: sa.Column("decided_at", sa.DateTime(), nullable=True),
        lambda: sa.Column("handover_note", sa.String(None), nullable=True),
        lambda: sa.Column("alternative_dates", sa.String(None), nullable=True),
        lambda: sa.Column("balance_before", sa.Numeric(6, 2), nullable=True),
        lambda: sa.Column("balance_after", sa.Numeric(6, 2), nullable=True),
        lambda: sa.Column("reason_encrypted", sa.String(None), nullable=True),
        lambda: sa.Column("details", sa.JSON(), nullable=True),
        lambda: sa.Column("confirmation", sa.JSON(), nullable=True),
        lambda: sa.Column("document_id", sa.Integer(), nullable=True),
    ],
    "employee_compensations": [
        lambda: sa.Column("base_amount", sa.Numeric(12, 2), nullable=True),
        lambda: sa.Column("currency", sa.String(3), nullable=True),
        lambda: sa.Column("pay_period", sa.String(20), nullable=True),
        lambda: sa.Column("pay_frequency", sa.String(20), nullable=True),
        lambda: sa.Column("document_id", sa.Integer(), nullable=True),
    ],
    "salary_revisions": [
        _fk_emp("employee_id"),
        lambda: sa.Column("revision_type", sa.String(30), nullable=True),
        lambda: sa.Column("percentage_change", sa.Numeric(7, 2), nullable=True),
        lambda: sa.Column("currency", sa.String(3), nullable=True),
        lambda: sa.Column("status", sa.String(20), nullable=True),
        lambda: sa.Column("reason_statement", sa.String(None), nullable=True),
        _fk_emp("requested_by"), _fk_emp("approved_by"),
        lambda: sa.Column("approved_at", sa.DateTime(), nullable=True),
        lambda: sa.Column("decision_comment", sa.String(None), nullable=True),
        lambda: sa.Column("communicated_document_id", sa.Integer(), nullable=True),
    ],
    "allowances": [
        lambda: sa.Column("currency", sa.String(3), nullable=True),
        lambda: sa.Column("frequency", sa.String(20), nullable=True),
        lambda: sa.Column("end_date", sa.Date(), nullable=True),
        lambda: sa.Column("review_date", sa.Date(), nullable=True),
        lambda: sa.Column("eligibility_reason", sa.String(None), nullable=True),
        lambda: sa.Column("conditions", sa.String(None), nullable=True),
        lambda: sa.Column("status", sa.String(20), nullable=True),
        _fk_emp("requested_by"), _fk_emp("approved_by"),
        lambda: sa.Column("approved_at", sa.DateTime(), nullable=True),
        lambda: sa.Column("document_id", sa.Integer(), nullable=True),
    ],
    "employee_benefits": [
        lambda: sa.Column("provider", sa.String(200), nullable=True),
        lambda: sa.Column("employer_contribution", sa.String(60), nullable=True),
        lambda: sa.Column("employee_contribution", sa.String(60), nullable=True),
    ],
    "travel_expenses": [
        lambda: sa.Column("approved_amount", sa.Numeric(12, 2), nullable=True),
        _fk_emp("decided_by"),
        lambda: sa.Column("decided_at", sa.DateTime(), nullable=True),
        lambda: sa.Column("decision_reason", sa.String(None), nullable=True),
        _fk_emp("first_approver_id"),
        lambda: sa.Column("first_approved_at", sa.DateTime(), nullable=True),
        lambda: sa.Column("within_policy", sa.Boolean(), nullable=True),
        lambda: sa.Column("document_id", sa.Integer(), nullable=True),
    ],
    "template_variants": [
        lambda: sa.Column("change_summary", sa.String(None), nullable=True),
        lambda: sa.Column("minor_change", sa.Boolean(), nullable=False, server_default=sa.false()),
    ],
    "policy_distributions": [
        lambda: sa.Column("previous_distribution_id", sa.Integer(), sa.ForeignKey("policy_distributions.id"), nullable=True),
        lambda: sa.Column("kb_source_id", sa.Integer(), nullable=True),
        lambda: sa.Column("kb_sync_status", sa.String(20), nullable=True),
        lambda: sa.Column("kb_synced_at", sa.DateTime(), nullable=True),
    ],
    "knowledge_sources": [
        lambda: sa.Column("policy_canonical_id", sa.String(20), nullable=True),
        lambda: sa.Column("policy_version", sa.Integer(), nullable=True),
        lambda: sa.Column("policy_audience", sa.JSON(), nullable=True),
        lambda: sa.Column("policy_distribution_id", sa.Integer(), nullable=True),
    ],
}


def _org():
    return sa.Column("organization_id", sa.Integer(), sa.ForeignKey("organizations.id"), nullable=False)


def _stamps():
    return [sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
            sa.Column("updated_at", sa.DateTime(), nullable=True, server_default=sa.func.now())]


def _create_tables(insp) -> None:
    if not insp.has_table("overtime_requests"):
        op.create_table(
            "overtime_requests",
            sa.Column("id", sa.Integer(), primary_key=True), _org(),
            sa.Column("employee_id", sa.Integer(), sa.ForeignKey("employees.id"), nullable=False),
            sa.Column("date", sa.Date(), nullable=False),
            sa.Column("start_time", sa.String(5), nullable=False), sa.Column("end_time", sa.String(5), nullable=False),
            sa.Column("hours", sa.Numeric(5, 2), nullable=False), sa.Column("reason", sa.String(None), nullable=False),
            sa.Column("pre_approved", sa.Boolean(), nullable=False), sa.Column("emergency", sa.Boolean(), nullable=False),
            sa.Column("status", sa.String(20), nullable=False),
            sa.Column("requested_by", sa.Integer(), sa.ForeignKey("employees.id"), nullable=False),
            sa.Column("decided_by", sa.Integer(), sa.ForeignKey("employees.id"), nullable=True),
            sa.Column("decided_at", sa.DateTime(), nullable=True), sa.Column("decision_reason", sa.String(None), nullable=True),
            sa.Column("compensation_method", sa.String(20), nullable=True),
            sa.Column("attendance_record_id", sa.Integer(), sa.ForeignKey("attendance_records.id"), nullable=True),
            sa.Column("document_id", sa.Integer(), nullable=True), *_stamps(),
        )
        for col in ("id", "organization_id", "employee_id"):
            op.create_index(f"ix_overtime_requests_{col}", "overtime_requests", [col])
    if not insp.has_table("attendance_correction_requests"):
        op.create_table(
            "attendance_correction_requests",
            sa.Column("id", sa.Integer(), primary_key=True), _org(),
            sa.Column("employee_id", sa.Integer(), sa.ForeignKey("employees.id"), nullable=False),
            sa.Column("attendance_record_id", sa.Integer(), sa.ForeignKey("attendance_records.id"), nullable=True),
            sa.Column("date", sa.Date(), nullable=False),
            sa.Column("original_check_in", sa.DateTime(), nullable=True), sa.Column("original_check_out", sa.DateTime(), nullable=True),
            sa.Column("requested_check_in", sa.DateTime(), nullable=False), sa.Column("requested_check_out", sa.DateTime(), nullable=False),
            sa.Column("reason", sa.String(40), nullable=False), sa.Column("reason_detail", sa.String(None), nullable=True),
            sa.Column("evidence_file", sa.String(500), nullable=True), sa.Column("declared_at", sa.DateTime(), nullable=True),
            sa.Column("requested_by", sa.Integer(), sa.ForeignKey("employees.id"), nullable=False),
            sa.Column("status", sa.String(20), nullable=False),
            sa.Column("decided_by", sa.Integer(), sa.ForeignKey("employees.id"), nullable=True),
            sa.Column("decided_at", sa.DateTime(), nullable=True), sa.Column("decision_reason", sa.String(None), nullable=True),
            sa.Column("applied_at", sa.DateTime(), nullable=True), sa.Column("document_id", sa.Integer(), nullable=True), *_stamps(),
        )
        for col in ("id", "organization_id", "employee_id"):
            op.create_index(f"ix_attendance_correction_requests_{col}", "attendance_correction_requests", [col])
    if not insp.has_table("shift_notices"):
        op.create_table(
            "shift_notices",
            sa.Column("id", sa.Integer(), primary_key=True), _org(),
            sa.Column("employee_id", sa.Integer(), sa.ForeignKey("employees.id"), nullable=False),
            sa.Column("kind", sa.String(20), nullable=False),
            sa.Column("shift_id", sa.Integer(), sa.ForeignKey("shifts.id"), nullable=True),
            sa.Column("start_date", sa.Date(), nullable=False), sa.Column("end_date", sa.Date(), nullable=True),
            sa.Column("pattern", sa.JSON(), nullable=True), sa.Column("changes", sa.JSON(), nullable=True),
            sa.Column("location", sa.String(200), nullable=True), sa.Column("reason", sa.String(None), nullable=True),
            sa.Column("short_notice_reason", sa.String(None), nullable=True), sa.Column("notice_days_given", sa.Integer(), nullable=True),
            sa.Column("created_by", sa.Integer(), sa.ForeignKey("employees.id"), nullable=True),
            sa.Column("notified_at", sa.DateTime(), nullable=True), sa.Column("document_id", sa.Integer(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        )
        for col in ("id", "organization_id", "employee_id"):
            op.create_index(f"ix_shift_notices_{col}", "shift_notices", [col])
    if not insp.has_table("compensation_statement_requests"):
        op.create_table(
            "compensation_statement_requests",
            sa.Column("id", sa.Integer(), primary_key=True), _org(),
            sa.Column("employee_id", sa.Integer(), sa.ForeignKey("employees.id"), nullable=False),
            sa.Column("period_label", sa.String(40), nullable=False),
            sa.Column("requested_by", sa.Integer(), sa.ForeignKey("employees.id"), nullable=False),
            sa.Column("source", sa.String(20), nullable=False), sa.Column("document_id", sa.Integer(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        )
        for col in ("id", "organization_id", "employee_id"):
            op.create_index(f"ix_compensation_statement_requests_{col}", "compensation_statement_requests", [col])


def _cols(insp, table):
    return {c["name"] for c in insp.get_columns(table)} if insp.has_table(table) else None


def _fernet():
    from app.core.crypto import fernet_for
    return fernet_for(_PURPOSE)


def _protect_sick_reasons(bind) -> None:
    rows = bind.execute(sa.text(
        "SELECT id, reason FROM leave_requests WHERE lower(CAST(leave_type AS VARCHAR(40))) = 'sick' "
        "AND reason IS NOT NULL AND reason <> '' AND reason_encrypted IS NULL")).fetchall()
    if not rows:
        return
    f = _fernet()
    for rid, reason in rows:
        token = f.encrypt(reason.strip().encode("utf-8")).decode("ascii")
        bind.execute(sa.text("UPDATE leave_requests SET reason_encrypted = :t, reason = NULL WHERE id = :i"), {"t": token, "i": rid})


def _backfill_revision_employee(bind) -> None:
    bind.execute(sa.text(
        "UPDATE salary_revisions SET employee_id = (SELECT c.employee_id FROM employee_compensations c "
        "WHERE c.id = salary_revisions.employee_compensation_id) WHERE employee_id IS NULL"))


def upgrade() -> None:
    bind = op.get_bind()
    insp = sa.inspect(bind)
    _create_tables(insp)
    insp = sa.inspect(bind)
    for table, makers in _ADDED_COLUMNS.items():
        existing = _cols(insp, table)
        if existing is None:
            continue
        for make in makers:
            col = make()
            if col.name not in existing:
                op.add_column(table, col)
    _backfill_revision_employee(bind)
    _protect_sick_reasons(bind)


def downgrade() -> None:
    bind = op.get_bind()
    insp = sa.inspect(bind)
    if "reason_encrypted" in (_cols(insp, "leave_requests") or set()):
        rows = bind.execute(sa.text("SELECT id, reason_encrypted FROM leave_requests WHERE reason_encrypted IS NOT NULL")).fetchall()
        if rows:
            f = _fernet()
            for rid, token in rows:
                bind.execute(sa.text("UPDATE leave_requests SET reason = :r WHERE id = :i"),
                             {"r": f.decrypt(token.encode("ascii")).decode("utf-8"), "i": rid})
    for table, makers in reversed(list(_ADDED_COLUMNS.items())):
        existing = _cols(insp, table) or set()
        for make in reversed(makers):
            name = make().name
            if name in existing:
                op.drop_column(table, name)
    for table in reversed(NEW_TABLES):
        if sa.inspect(bind).has_table(table):
            op.drop_table(table)
