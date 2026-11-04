"""doc_templates Prompt 4: probation reviews, PIPs, appraisal stages, training records, lifecycle approvals, go-live controls

Revision ID: d7e1a0b2c3f8
Revises: d7e1a0b2c3f7
Create Date: 2026-10-22

* probation_reviews (HR-PRF-002) and performance_improvement_plans (HR-PRF-013).
* performance_appraisals: structured goals and competencies, self and manager assessments, calibration and finalisation.
* learning_courses: is_mandatory, mandatory_audience, renewal_months, version; learning_enrollments: expires_on, document_id;
  learning_certifications: certificate_number, renewal requirements and history, reminders, document_id.
* employee_lifecycle: approval time and comment, second (HR) approval, completion, linked salary revision.
* hr_documents: is_legacy, canonical_id. Data: every existing upload is flagged legacy; its canonical id is set only where the
  document type maps to exactly one template (reporting only; nothing is re-rendered).
* doc_template_settings: retention_durations, automation_rules; template_clauses: parameters; generated_documents:
  idempotency_key (unique per organization when set).

Guarded and reversible.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "d7e1a0b2c3f8"
down_revision: Union[str, Sequence[str], None] = "d7e1a0b2c3f7"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

NEW_TABLES = ("probation_reviews", "performance_improvement_plans")
LEGACY_TYPE_MAP = {"employee_handbook": "HR-POL-001", "handbook": "HR-POL-001", "code_of_conduct": "HR-POL-002",
                   "confirmation_letter": "HR-PRF-004", "promotion_letter": "HR-CHG-004", "transfer_letter": "HR-CHG-007",
                   "pip": "HR-PRF-013", "salary_increase_letter": "HR-CMP-005", "appraisal": "HR-PRF-007"}


def _emp(name):
    return lambda: sa.Column(name, sa.Integer(), sa.ForeignKey("employees.id"), nullable=True)


_ADDED_COLUMNS = {
    "performance_appraisals": [
        lambda: sa.Column("goals_assessment", sa.JSON(), nullable=True),
        lambda: sa.Column("competencies", sa.JSON(), nullable=True),
        lambda: sa.Column("overall_rating_label", sa.String(60), nullable=True),
        lambda: sa.Column("manager_summary", sa.String(None), nullable=True),
        lambda: sa.Column("employee_comments", sa.String(None), nullable=True),
        lambda: sa.Column("development_priorities", sa.JSON(), nullable=True),
        lambda: sa.Column("self_assessment", sa.JSON(), nullable=True),
        lambda: sa.Column("self_submitted_at", sa.DateTime(), nullable=True),
        lambda: sa.Column("manager_assessment", sa.JSON(), nullable=True),
        lambda: sa.Column("manager_submitted_at", sa.DateTime(), nullable=True),
        _emp("calibrated_by"),
        lambda: sa.Column("calibrated_at", sa.DateTime(), nullable=True),
        lambda: sa.Column("finalised_at", sa.DateTime(), nullable=True),
        _emp("finalised_by"),
        lambda: sa.Column("document_id", sa.Integer(), nullable=True),
    ],
    "learning_courses": [
        lambda: sa.Column("is_mandatory", sa.Boolean(), nullable=False, server_default=sa.false()),
        lambda: sa.Column("mandatory_audience", sa.JSON(), nullable=True),
        lambda: sa.Column("renewal_months", sa.Integer(), nullable=True),
        lambda: sa.Column("version", sa.String(40), nullable=True),
    ],
    "learning_enrollments": [
        lambda: sa.Column("expires_on", sa.Date(), nullable=True),
        lambda: sa.Column("document_id", sa.Integer(), nullable=True),
    ],
    "learning_certifications": [
        lambda: sa.Column("certificate_number", sa.String(120), nullable=True),
        lambda: sa.Column("renewal_requirements", sa.String(None), nullable=True),
        lambda: sa.Column("renewal_history", sa.JSON(), nullable=True),
        lambda: sa.Column("reminders_sent", sa.JSON(), nullable=True),
        lambda: sa.Column("document_id", sa.Integer(), nullable=True),
    ],
    "employee_lifecycle": [
        lambda: sa.Column("approved_at", sa.DateTime(), nullable=True),
        lambda: sa.Column("decision_comment", sa.String(None), nullable=True),
        _emp("hr_approved_by"),
        lambda: sa.Column("hr_approved_at", sa.DateTime(), nullable=True),
        _emp("completed_by"),
        lambda: sa.Column("completed_at", sa.DateTime(), nullable=True),
        lambda: sa.Column("linked_salary_revision_id", sa.Integer(), sa.ForeignKey("salary_revisions.id"), nullable=True),
    ],
    "hr_documents": [
        lambda: sa.Column("is_legacy", sa.Boolean(), nullable=False, server_default=sa.false()),
        lambda: sa.Column("canonical_id", sa.String(20), nullable=True),
    ],
    "doc_template_settings": [
        lambda: sa.Column("retention_durations", sa.JSON(), nullable=True),
        lambda: sa.Column("automation_rules", sa.JSON(), nullable=True),
    ],
    "template_clauses": [lambda: sa.Column("parameters", sa.JSON(), nullable=True)],
    "generated_documents": [lambda: sa.Column("idempotency_key", sa.String(80), nullable=True)],
}


def _stamps():
    return [sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
            sa.Column("updated_at", sa.DateTime(), nullable=True, server_default=sa.func.now())]


def _create_tables(insp) -> None:
    if not insp.has_table("probation_reviews"):
        op.create_table(
            "probation_reviews",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("organization_id", sa.Integer(), sa.ForeignKey("organizations.id"), nullable=False),
            sa.Column("employee_id", sa.Integer(), sa.ForeignKey("employees.id"), nullable=False),
            sa.Column("probation_event_id", sa.Integer(), sa.ForeignKey("employee_lifecycle.id"), nullable=True),
            sa.Column("checklist_item_id", sa.Integer(), nullable=True),
            sa.Column("review_number", sa.Integer(), nullable=False),
            sa.Column("scheduled_date", sa.Date(), nullable=True), sa.Column("held_on", sa.Date(), nullable=True),
            sa.Column("reviewer_id", sa.Integer(), sa.ForeignKey("employees.id"), nullable=True),
            sa.Column("objectives_progress", sa.JSON(), nullable=True),
            sa.Column("strengths", sa.String(None), nullable=True), sa.Column("concerns", sa.String(None), nullable=True),
            sa.Column("support_agreed", sa.String(None), nullable=True), sa.Column("employee_comments", sa.String(None), nullable=True),
            sa.Column("employee_commented_at", sa.DateTime(), nullable=True), sa.Column("recommendation", sa.String(30), nullable=True),
            sa.Column("status", sa.String(20), nullable=False), sa.Column("document_id", sa.Integer(), nullable=True), *_stamps(),
        )
        for col in ("id", "organization_id", "employee_id"):
            op.create_index(f"ix_probation_reviews_{col}", "probation_reviews", [col])
    if not insp.has_table("performance_improvement_plans"):
        op.create_table(
            "performance_improvement_plans",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("organization_id", sa.Integer(), sa.ForeignKey("organizations.id"), nullable=False),
            sa.Column("employee_id", sa.Integer(), sa.ForeignKey("employees.id"), nullable=False),
            sa.Column("manager_id", sa.Integer(), sa.ForeignKey("employees.id"), nullable=False),
            sa.Column("hr_owner_id", sa.Integer(), sa.ForeignKey("employees.id"), nullable=True),
            sa.Column("start_date", sa.Date(), nullable=False), sa.Column("end_date", sa.Date(), nullable=False),
            sa.Column("objectives", sa.JSON(), nullable=False), sa.Column("support", sa.JSON(), nullable=True),
            sa.Column("review_dates", sa.JSON(), nullable=True), sa.Column("adjustments_considered", sa.String(None), nullable=True),
            sa.Column("status", sa.String(30), nullable=False),
            sa.Column("created_by", sa.Integer(), sa.ForeignKey("employees.id"), nullable=False),
            sa.Column("hr_approved_by", sa.Integer(), sa.ForeignKey("employees.id"), nullable=True),
            sa.Column("hr_approved_at", sa.DateTime(), nullable=True), sa.Column("outcomes_log", sa.JSON(), nullable=True),
            sa.Column("employee_comments", sa.String(None), nullable=True), sa.Column("outcome", sa.String(30), nullable=True),
            sa.Column("completed_at", sa.DateTime(), nullable=True), sa.Column("document_id", sa.Integer(), nullable=True), *_stamps(),
        )
        for col in ("id", "organization_id", "employee_id"):
            op.create_index(f"ix_performance_improvement_plans_{col}", "performance_improvement_plans", [col])


def _cols(insp, table):
    return {c["name"] for c in insp.get_columns(table)} if insp.has_table(table) else None


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
    insp = sa.inspect(bind)
    if "idempotency_key" in (_cols(insp, "generated_documents") or set()) and not any(
            ix["name"] == "uq_generated_documents_idempotency" for ix in insp.get_indexes("generated_documents")):
        op.create_index("uq_generated_documents_idempotency", "generated_documents", ["organization_id", "idempotency_key"], unique=True)
    if sa.inspect(bind).has_table("hr_documents"):
        bind.execute(sa.text("UPDATE hr_documents SET is_legacy = :t"), {"t": True})
        for doc_type, cid in LEGACY_TYPE_MAP.items():
            bind.execute(sa.text("UPDATE hr_documents SET canonical_id = :c WHERE lower(document_type) = :t AND canonical_id IS NULL"),
                         {"c": cid, "t": doc_type})


def downgrade() -> None:
    bind = op.get_bind()
    insp = sa.inspect(bind)
    if any(ix["name"] == "uq_generated_documents_idempotency" for ix in insp.get_indexes("generated_documents")):
        op.drop_index("uq_generated_documents_idempotency", table_name="generated_documents")
    for table, makers in reversed(list(_ADDED_COLUMNS.items())):
        existing = _cols(insp, table) or set()
        for make in reversed(makers):
            name = make().name
            if name in existing:
                op.drop_column(table, name)
    for table in reversed(NEW_TABLES):
        if sa.inspect(bind).has_table(table):
            op.drop_table(table)
