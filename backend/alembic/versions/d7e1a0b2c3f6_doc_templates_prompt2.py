"""doc_templates Prompt 2: starters, recruitment / workforce / onboarding document data

Revision ID: d7e1a0b2c3f6
Revises: d7e1a0b2c3f5
Create Date: 2026-10-21

* template_starters, template_starter_clauses: versioned Zoiko starter content (loaded by seeds/load_starters.py at startup).
* job_descriptions (HR-ORG-005) and onboarding_form_submissions (HR-ONB-001/003/017; financial values encrypted).
* Offer letter terms, approvals and outcomes on recruitment_offers; requisition authorization and scorecard criteria; structured
  interview scorecards on recruitment_interview_feedback; approval fields on wf_headcounts, wf_successions and designations;
  owner / mandatory / exception fields on onboarding_checklist_items; jurisdiction_packs.requirements; variant starter revision;
  decision_receipts.source_ref (blocked attempts visible per record).
* OfferStatus gains EXPIRED (Postgres enum value).
* Data: offers whose free-text entity name matches an employer entity of the same organization (case-insensitive legal or
  trading name) are linked to it. Nothing else is guessed; the free-text entity columns stay, read-only, for one release.

Guarded and reversible (the enum value is left in place on downgrade: Postgres cannot drop an enum value).
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "d7e1a0b2c3f6"
down_revision: Union[str, Sequence[str], None] = "d7e1a0b2c3f5"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

NEW_TABLES = ("template_starters", "template_starter_clauses", "job_descriptions", "onboarding_form_submissions")

_ADDED_COLUMNS = {
    "recruitment_requisitions": [
        lambda: sa.Column("hiring_manager_id", sa.Integer(), sa.ForeignKey("employees.id"), nullable=True),
        lambda: sa.Column("employment_type", sa.String(30), nullable=True),
        lambda: sa.Column("reason", sa.String(20), nullable=True),
        lambda: sa.Column("replaces_employee_id", sa.Integer(), sa.ForeignKey("employees.id"), nullable=True),
        lambda: sa.Column("budget_min", sa.Numeric(14, 2), nullable=True),
        lambda: sa.Column("budget_max", sa.Numeric(14, 2), nullable=True),
        lambda: sa.Column("currency", sa.String(3), nullable=True),
        lambda: sa.Column("target_start_date", sa.Date(), nullable=True),
        lambda: sa.Column("headcount_id", sa.Integer(), sa.ForeignKey("wf_headcounts.id"), nullable=True),
        lambda: sa.Column("justification", sa.String(None), nullable=True),
        lambda: sa.Column("job_description_id", sa.Integer(), sa.ForeignKey("job_descriptions.id"), nullable=True),
        lambda: sa.Column("scorecard_criteria", sa.JSON(), nullable=True),
        lambda: sa.Column("decided_by", sa.Integer(), sa.ForeignKey("employees.id"), nullable=True),
        lambda: sa.Column("decided_at", sa.DateTime(), nullable=True),
        lambda: sa.Column("decision_comment", sa.String(None), nullable=True),
    ],
    "recruitment_candidates": [
        lambda: sa.Column("rejection_note", sa.String(None), nullable=True),
        lambda: sa.Column("stage_reached", sa.String(20), nullable=True),
    ],
    "recruitment_offers": [
        lambda: sa.Column("created_by", sa.Integer(), sa.ForeignKey("employees.id"), nullable=True),
        lambda: sa.Column("department_id", sa.Integer(), sa.ForeignKey("departments.id"), nullable=True),
        lambda: sa.Column("reporting_manager_id", sa.Integer(), sa.ForeignKey("employees.id"), nullable=True),
        lambda: sa.Column("employer_entity_id", sa.Integer(), sa.ForeignKey("employer_entities.id"), nullable=True),
        lambda: sa.Column("work_location", sa.String(200), nullable=True),
        lambda: sa.Column("work_region", sa.String(100), nullable=True),
        lambda: sa.Column("work_arrangement", sa.String(10), nullable=True),
        lambda: sa.Column("hours_per_week", sa.Numeric(5, 2), nullable=True),
        lambda: sa.Column("work_pattern", sa.String(200), nullable=True),
        lambda: sa.Column("contract_end_date", sa.Date(), nullable=True),
        lambda: sa.Column("internship_end_date", sa.Date(), nullable=True),
        lambda: sa.Column("fixed_term_reason", sa.String(300), nullable=True),
        lambda: sa.Column("probation_months", sa.Integer(), nullable=True),
        lambda: sa.Column("response_deadline", sa.Date(), nullable=True),
        lambda: sa.Column("conditions", sa.JSON(), nullable=True),
        lambda: sa.Column("benefits_summary", sa.String(None), nullable=True),
        lambda: sa.Column("components", sa.JSON(), nullable=True),
        lambda: sa.Column("learning_objectives", sa.JSON(), nullable=True),
        lambda: sa.Column("mentor_id", sa.Integer(), sa.ForeignKey("employees.id"), nullable=True),
        lambda: sa.Column("academic_institution", sa.String(200), nullable=True),
        lambda: sa.Column("approved_by", sa.Integer(), sa.ForeignKey("employees.id"), nullable=True),
        lambda: sa.Column("approved_at", sa.DateTime(), nullable=True),
        lambda: sa.Column("issued_at", sa.DateTime(), nullable=True),
        lambda: sa.Column("accepted_at", sa.DateTime(), nullable=True),
        lambda: sa.Column("decline_reason", sa.String(None), nullable=True),
        lambda: sa.Column("document_id", sa.Integer(), sa.ForeignKey("generated_documents.id"), nullable=True),
        lambda: sa.Column("amends_offer_id", sa.Integer(), sa.ForeignKey("recruitment_offers.id"), nullable=True),
        lambda: sa.Column("withdrawal_reason_category", sa.String(30), nullable=True),
        lambda: sa.Column("withdrawal_reason_note", sa.String(None), nullable=True),
        lambda: sa.Column("withdrawal_condition", sa.String(300), nullable=True),
        lambda: sa.Column("withdrawal_legal_review", sa.Boolean(), nullable=True),
        lambda: sa.Column("withdrawal_requested_by", sa.Integer(), sa.ForeignKey("employees.id"), nullable=True),
    ],
    "recruitment_interview_feedback": [
        lambda: sa.Column("scores", sa.JSON(), nullable=True),
        lambda: sa.Column("weighted_total", sa.Numeric(6, 2), nullable=True),
        lambda: sa.Column("questions", sa.JSON(), nullable=True),
        lambda: sa.Column("evidence_notes", sa.String(None), nullable=True),
        lambda: sa.Column("concerns", sa.String(None), nullable=True),
        lambda: sa.Column("adjustments_provided", sa.String(None), nullable=True),
        lambda: sa.Column("recommendation", sa.String(20), nullable=True),
        lambda: sa.Column("recommendation_reason", sa.String(None), nullable=True),
        lambda: sa.Column("stage", sa.String(50), nullable=True),
    ],
    "wf_headcounts": [
        lambda: sa.Column("status", sa.String(20), nullable=False, server_default="draft"),
        lambda: sa.Column("rationale", sa.String(None), nullable=True),
        lambda: sa.Column("plan_id", sa.Integer(), sa.ForeignKey("wf_plans.id"), nullable=True),
        lambda: sa.Column("requested_by", sa.Integer(), sa.ForeignKey("employees.id"), nullable=True),
        lambda: sa.Column("decided_by", sa.Integer(), sa.ForeignKey("employees.id"), nullable=True),
        lambda: sa.Column("decided_at", sa.DateTime(), nullable=True),
        lambda: sa.Column("decision_comment", sa.String(None), nullable=True),
    ],
    "wf_successions": [
        lambda: sa.Column("development_actions", sa.String(None), nullable=True),
        lambda: sa.Column("owner_id", sa.Integer(), sa.ForeignKey("employees.id"), nullable=True),
        lambda: sa.Column("status", sa.String(20), nullable=False, server_default="draft"),
        lambda: sa.Column("requested_by", sa.Integer(), sa.ForeignKey("employees.id"), nullable=True),
        lambda: sa.Column("decided_by", sa.Integer(), sa.ForeignKey("employees.id"), nullable=True),
        lambda: sa.Column("decided_at", sa.DateTime(), nullable=True),
        lambda: sa.Column("decision_comment", sa.String(None), nullable=True),
    ],
    "designations": [
        lambda: sa.Column("approval_status", sa.String(20), nullable=True),
        lambda: sa.Column("position_reason", sa.String(None), nullable=True),
        lambda: sa.Column("reports_to_designation_id", sa.Integer(), sa.ForeignKey("designations.id"), nullable=True),
        lambda: sa.Column("pay_grade_id", sa.Integer(), sa.ForeignKey("pay_grades.id"), nullable=True),
        lambda: sa.Column("employment_type", sa.String(30), nullable=True),
        lambda: sa.Column("location", sa.String(200), nullable=True),
        lambda: sa.Column("job_description_id", sa.Integer(), sa.ForeignKey("job_descriptions.id"), nullable=True),
        lambda: sa.Column("requested_by", sa.Integer(), sa.ForeignKey("employees.id"), nullable=True),
        lambda: sa.Column("decided_by", sa.Integer(), sa.ForeignKey("employees.id"), nullable=True),
        lambda: sa.Column("decided_at", sa.DateTime(), nullable=True),
        lambda: sa.Column("decision_comment", sa.String(None), nullable=True),
    ],
    "onboarding_checklist_items": [
        lambda: sa.Column("owner_role", sa.String(20), nullable=True),
        lambda: sa.Column("mandatory", sa.Boolean(), nullable=False, server_default=sa.false()),
        lambda: sa.Column("item_key", sa.String(40), nullable=True),
        lambda: sa.Column("blocked_action", sa.String(300), nullable=True),
        lambda: sa.Column("exception_reason", sa.String(None), nullable=True),
        lambda: sa.Column("exception_owner_id", sa.Integer(), sa.ForeignKey("employees.id"), nullable=True),
        lambda: sa.Column("exception_due_date", sa.Date(), nullable=True),
    ],
    "jurisdiction_packs": [
        lambda: sa.Column("requirements", sa.JSON(), nullable=True),
    ],
    "template_variants": [
        lambda: sa.Column("starter_revision", sa.Integer(), nullable=True),
    ],
    "decision_receipts": [
        lambda: sa.Column("source_ref", sa.String(80), nullable=True),
    ],
}


def _create_tables(insp) -> None:
    if not insp.has_table("template_starters"):
        op.create_table(
            "template_starters",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("canonical_id", sa.String(20), sa.ForeignKey("template_definitions.canonical_id"), nullable=False),
            sa.Column("revision", sa.Integer(), nullable=False),
            sa.Column("checksum", sa.String(64), nullable=False),
            sa.Column("payload", sa.JSON(), nullable=False),
            sa.Column("source_path", sa.String(255), nullable=True),
            sa.Column("loaded_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
            sa.UniqueConstraint("canonical_id", "revision", name="uq_template_starter_revision"),
        )
        op.create_index("ix_template_starters_canonical_id", "template_starters", ["canonical_id"])
    if not insp.has_table("template_starter_clauses"):
        op.create_table(
            "template_starter_clauses",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("clause_key", sa.String(80), nullable=False),
            sa.Column("revision", sa.Integer(), nullable=False),
            sa.Column("checksum", sa.String(64), nullable=False),
            sa.Column("title", sa.String(200), nullable=True),
            sa.Column("text", sa.String(None), nullable=False),
            sa.Column("note", sa.String(None), nullable=True),
            sa.Column("loaded_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
            sa.UniqueConstraint("clause_key", "revision", name="uq_template_starter_clause_revision"),
        )
        op.create_index("ix_template_starter_clauses_clause_key", "template_starter_clauses", ["clause_key"])
    if not insp.has_table("job_descriptions"):
        op.create_table(
            "job_descriptions",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("organization_id", sa.Integer(), sa.ForeignKey("organizations.id"), nullable=False),
            sa.Column("designation_id", sa.Integer(), sa.ForeignKey("designations.id"), nullable=True),
            sa.Column("title", sa.String(200), nullable=False),
            sa.Column("purpose", sa.String(None), nullable=True),
            sa.Column("key_responsibilities", sa.JSON(), nullable=True),
            sa.Column("requirements_essential", sa.JSON(), nullable=True),
            sa.Column("requirements_desirable", sa.JSON(), nullable=True),
            sa.Column("department_id", sa.Integer(), sa.ForeignKey("departments.id"), nullable=True),
            sa.Column("reporting_to_designation_id", sa.Integer(), sa.ForeignKey("designations.id"), nullable=True),
            sa.Column("direct_reports_summary", sa.String(None), nullable=True),
            sa.Column("work_location", sa.String(200), nullable=True),
            sa.Column("work_arrangement", sa.String(10), nullable=True),
            sa.Column("pay_grade_id", sa.Integer(), sa.ForeignKey("pay_grades.id"), nullable=True),
            sa.Column("physical_requirements", sa.String(None), nullable=True),
            sa.Column("version", sa.Integer(), nullable=False),
            sa.Column("status", sa.String(20), nullable=False),
            sa.Column("previous_version_id", sa.Integer(), sa.ForeignKey("job_descriptions.id"), nullable=True),
            sa.Column("created_by", sa.Integer(), sa.ForeignKey("employees.id"), nullable=True),
            sa.Column("decided_by", sa.Integer(), sa.ForeignKey("employees.id"), nullable=True),
            sa.Column("decided_at", sa.DateTime(), nullable=True),
            sa.Column("decision_comment", sa.String(None), nullable=True),
            sa.Column("language_flags", sa.JSON(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
            sa.Column("updated_at", sa.DateTime(), nullable=True, server_default=sa.func.now()),
        )
        op.create_index("ix_job_descriptions_id", "job_descriptions", ["id"])
        op.create_index("ix_job_descriptions_organization_id", "job_descriptions", ["organization_id"])
    if not insp.has_table("onboarding_form_submissions"):
        op.create_table(
            "onboarding_form_submissions",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("organization_id", sa.Integer(), sa.ForeignKey("organizations.id"), nullable=False),
            sa.Column("new_hire_id", sa.Integer(), sa.ForeignKey("onboarding_new_hires.id"), nullable=True),
            sa.Column("employee_id", sa.Integer(), sa.ForeignKey("employees.id"), nullable=True),
            sa.Column("canonical_id", sa.String(20), nullable=False),
            sa.Column("data", sa.JSON(), nullable=True),
            sa.Column("data_encrypted", sa.String(None), nullable=True),
            sa.Column("status", sa.String(20), nullable=False),
            sa.Column("submitted_at", sa.DateTime(), nullable=True),
            sa.Column("verified_by", sa.Integer(), sa.ForeignKey("employees.id"), nullable=True),
            sa.Column("verified_at", sa.DateTime(), nullable=True),
            sa.Column("return_reason", sa.String(None), nullable=True),
            sa.Column("document_id", sa.Integer(), sa.ForeignKey("generated_documents.id"), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
            sa.Column("updated_at", sa.DateTime(), nullable=True, server_default=sa.func.now()),
        )
        op.create_index("ix_onboarding_form_submissions_employee_id", "onboarding_form_submissions", ["employee_id"])
        op.create_index("ix_onboarding_form_submissions_id", "onboarding_form_submissions", ["id"])
        op.create_index("ix_onboarding_form_submissions_new_hire_id", "onboarding_form_submissions", ["new_hire_id"])
        op.create_index("ix_onboarding_form_submissions_organization_id", "onboarding_form_submissions", ["organization_id"])


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
    if bind.dialect.name == "postgresql":
        with op.get_context().autocommit_block():
            op.execute("ALTER TYPE offerstatus ADD VALUE IF NOT EXISTS 'EXPIRED'")
    _link_offer_entities(bind)


def _link_offer_entities(bind) -> None:
    rows = bind.execute(sa.text(
        "SELECT o.id, e.id FROM recruitment_offers o JOIN employer_entities e ON e.organization_id = o.organization_id "
        "WHERE o.employer_entity_id IS NULL AND o.entity_name IS NOT NULL AND o.entity_name <> '' "
        "AND (lower(trim(o.entity_name)) = lower(trim(e.legal_name)) OR lower(trim(o.entity_name)) = lower(trim(e.trading_name)))"
    )).fetchall()
    seen = set()
    for offer_id, entity_id in rows:
        if offer_id in seen:
            continue                                   # two entities match: ambiguous, leave it for HR
        seen.add(offer_id)
        if sum(1 for o, _ in rows if o == offer_id) == 1:
            bind.execute(sa.text("UPDATE recruitment_offers SET employer_entity_id = :e WHERE id = :o"), {"e": entity_id, "o": offer_id})


def downgrade() -> None:
    bind = op.get_bind()
    insp = sa.inspect(bind)
    for table, makers in reversed(list(_ADDED_COLUMNS.items())):
        existing = _cols(insp, table) or set()
        for make in reversed(makers):
            name = make().name
            if name in existing:
                op.drop_column(table, name)
    for table in reversed(NEW_TABLES):
        if sa.inspect(bind).has_table(table):
            op.drop_table(table)
