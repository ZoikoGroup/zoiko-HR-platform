"""Indexes for the Recruitment and Onboarding screens

Revision ID: a3b4c5d6e7f8
Revises: f2c3d4e5a6b7
Create Date: 2026-11-12

The lists behind Recruitment and Onboarding filter and join on these columns (checklist items by checklist, documents and
activities by new hire, interviews and offers by candidate, ...). Postgres does not index foreign keys by itself, so each of
those lookups was a full table scan that grows with every hire. IF NOT EXISTS keeps the migration safe where an index was
added by hand.
"""
from alembic import op

revision = "a3b4c5d6e7f8"
down_revision = "f2c3d4e5a6b7"
branch_labels = None
depends_on = None

INDEXES = [
    ("onboarding_checklist_items", "checklist_id"),
    ("onboarding_checklist_items", "assignee_employee_id"),
    ("onboarding_checklists", "onboarding_new_hire_id"),
    ("onboarding_documents", "onboarding_new_hire_id"),
    ("onboarding_documents", "document_id"),
    ("onboarding_activities", "onboarding_new_hire_id"),
    ("onboarding_preboarding_tasks", "onboarding_new_hire_id"),
    ("recruitment_interviews", "candidate_id"),
    ("recruitment_interviews", "interview_date"),
    ("recruitment_candidates", "status"),
    ("recruitment_offers", "candidate_id"),
    ("onboarding_new_hires", "status"),
]


def upgrade():
    for table, column in INDEXES:
        op.create_index(f"ix_{table}_{column}", table, [column], if_not_exists=True)


def downgrade():
    for table, column in reversed(INDEXES):
        op.drop_index(f"ix_{table}_{column}", table_name=table, if_exists=True)
