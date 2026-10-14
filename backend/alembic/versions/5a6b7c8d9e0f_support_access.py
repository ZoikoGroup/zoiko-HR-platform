"""support access: requests, approvals, grants, break-glass, revocations (ZHR-PRIV-001 section 02, B03-B09, B11)

Revision ID: 5a6b7c8d9e0f
Revises: f7a8b9c0d1e2
Create Date: 2026-10-14

Control-plane tables only. A support request references tenant records by opaque id; no employee name, salary, bank or
medical value is ever copied into these tables. Reversible: downgrade drops exactly what this migration created.

On PostgreSQL two forms of defence-in-depth are added that the ORM cannot express:
  * a CHECK that a grant can never outlive its hard maximum (issued_at + 120 minutes);
  * a BEFORE INSERT trigger on the approvals table enforcing maker-checker in the database itself - the approver's
    person must differ from the requester's, and a TENANT approval must come from a currently designated authoriser of
    the same tenant.
Both are applied only when the database is PostgreSQL; SQLite (tests) relies on the application checks.
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "5a6b7c8d9e0f"
down_revision: Union[str, Sequence[str], None] = "f7a8b9c0d1e2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

TABLES = (
    "support_tenant_authorisers",
    "support_access_requests",
    "support_approvals",
    "support_grants",
    "support_breakglass_sessions",
    "support_revocation_events",
)

MAKER_CHECKER_TRIGGER = """
CREATE OR REPLACE FUNCTION zhr_support_approval_guard() RETURNS trigger AS $$
DECLARE
    v_requester integer;
    v_tenant    integer;
    v_is_authoriser boolean;
BEGIN
    SELECT requester_person_id, tenant_id INTO v_requester, v_tenant
      FROM support_access_requests WHERE id = NEW.request_id;
    IF v_requester IS NULL THEN
        RAISE EXCEPTION 'support approval references an unknown request';
    END IF;
    IF NEW.approver_person_id = v_requester THEN
        RAISE EXCEPTION 'maker-checker: an approver cannot approve their own request';
    END IF;
    IF NEW.approval_type = 'TENANT' THEN
        SELECT EXISTS (
            SELECT 1 FROM support_tenant_authorisers a
             WHERE a.tenant_id = v_tenant AND a.user_id = NEW.approver_person_id AND a.revoked_at IS NULL
        ) INTO v_is_authoriser;
        IF NOT v_is_authoriser THEN
            RAISE EXCEPTION 'tenant approval must come from a designated authoriser of that tenant';
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS zhr_support_approval_guard ON support_approvals;
CREATE TRIGGER zhr_support_approval_guard
    BEFORE INSERT ON support_approvals
    FOR EACH ROW EXECUTE FUNCTION zhr_support_approval_guard();
"""


def upgrade() -> None:
    bind = op.get_bind()
    insp = sa.inspect(bind)
    existing = set(insp.get_table_names())

    if "support_tenant_authorisers" not in existing:
        op.create_table(
            "support_tenant_authorisers",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("tenant_id", sa.Integer(), sa.ForeignKey("organizations.id"), nullable=False),
            sa.Column("user_id", sa.Integer(), sa.ForeignKey("employees.id"), nullable=False),
            sa.Column("designated_by", sa.Integer(), sa.ForeignKey("employees.id"), nullable=True),
            sa.Column("designated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
            sa.Column("revoked_at", sa.DateTime(), nullable=True),
            sa.Column("revoked_by", sa.Integer(), sa.ForeignKey("employees.id"), nullable=True),
            sa.Column("scope_limits", sa.JSON(), nullable=False),
            sa.Column("note", sa.Text(), nullable=True),
        )
        op.create_index("ix_support_tenant_authorisers_id", "support_tenant_authorisers", ["id"])
        op.create_index("ix_support_tenant_authorisers_tenant_id", "support_tenant_authorisers", ["tenant_id"])
        op.create_index("ix_support_tenant_authorisers_user_id", "support_tenant_authorisers", ["user_id"])
        op.create_index("ix_support_authorisers_tenant_active", "support_tenant_authorisers", ["tenant_id", "revoked_at"])
        op.create_index("ix_support_authorisers_user", "support_tenant_authorisers", ["user_id", "revoked_at"])

    if "support_access_requests" not in existing:
        op.create_table(
            "support_access_requests",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("reference", sa.String(32), nullable=False),
            sa.Column("tenant_id", sa.Integer(), sa.ForeignKey("organizations.id"), nullable=False),
            sa.Column("requester_person_id", sa.Integer(), sa.ForeignKey("employees.id"), nullable=False),
            sa.Column("requester_account_id", sa.Integer(), sa.ForeignKey("employees.id"), nullable=True),
            sa.Column("ticket_reference", sa.String(200), nullable=False),
            sa.Column("purpose", sa.Text(), nullable=False),
            sa.Column("purpose_category", sa.String(40), nullable=False),
            sa.Column("risk_level", sa.String(20), nullable=False, server_default="STANDARD"),
            sa.Column("status", sa.String(30), nullable=False, server_default="DRAFT"),
            sa.Column("requested_scope", sa.JSON(), nullable=False),
            sa.Column("requested_duration_minutes", sa.Integer(), nullable=False, server_default=sa.text("30")),
            sa.Column("legal_basis_reference", sa.String(300), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
            sa.Column("updated_at", sa.DateTime(), nullable=True),
            sa.Column("submitted_at", sa.DateTime(), nullable=True),
            sa.Column("closed_at", sa.DateTime(), nullable=True),
            sa.Column("close_reason", sa.String(200), nullable=True),
            sa.Column("approval_expires_at", sa.DateTime(), nullable=True),
            sa.Column("request_seq", sa.Integer(), nullable=True),
            sa.CheckConstraint(
                "requested_duration_minutes >= 1 AND requested_duration_minutes <= 120",
                name="ck_support_request_duration",
            ),
            sa.CheckConstraint("risk_level IN ('STANDARD','HIGH')", name="ck_support_request_risk"),
        )
        op.create_index("ix_support_access_requests_id", "support_access_requests", ["id"])
        op.create_index("ix_support_access_requests_reference", "support_access_requests", ["reference"], unique=True)
        op.create_index("ix_support_access_requests_tenant_id", "support_access_requests", ["tenant_id"])
        op.create_index("ix_support_access_requests_requester_person_id", "support_access_requests", ["requester_person_id"])
        op.create_index("ix_support_access_requests_status", "support_access_requests", ["status"])
        op.create_index("ix_support_requests_tenant_status", "support_access_requests", ["tenant_id", "status"])
        op.create_index("ix_support_requests_requester_status", "support_access_requests", ["requester_person_id", "status"])

    if "support_approvals" not in existing:
        op.create_table(
            "support_approvals",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("request_id", sa.Integer(), sa.ForeignKey("support_access_requests.id"), nullable=False),
            sa.Column("approval_type", sa.String(20), nullable=False),
            sa.Column("approver_person_id", sa.Integer(), sa.ForeignKey("employees.id"), nullable=False),
            sa.Column("approver_account_id", sa.Integer(), sa.ForeignKey("employees.id"), nullable=True),
            sa.Column("decision", sa.String(30), nullable=False),
            sa.Column("approved_scope", sa.JSON(), nullable=True),
            sa.Column("comment", sa.Text(), nullable=True),
            sa.Column("mfa_verified_at", sa.DateTime(), nullable=True),
            sa.Column("decided_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
            sa.CheckConstraint("approval_type IN ('TENANT','SECURITY','PRIVACY')", name="ck_support_approval_type"),
            sa.CheckConstraint(
                "decision IN ('APPROVED','APPROVED_NARROWED','REJECTED')", name="ck_support_approval_decision"
            ),
        )
        op.create_index("ix_support_approvals_id", "support_approvals", ["id"])
        op.create_index("ix_support_approvals_request_id", "support_approvals", ["request_id"])
        op.create_index("ix_support_approvals_approver_person_id", "support_approvals", ["approver_person_id"])
        op.create_index("ix_support_approvals_request_type", "support_approvals", ["request_id", "approval_type"])

    if "support_grants" not in existing:
        op.create_table(
            "support_grants",
            sa.Column("id", sa.String(36), primary_key=True),
            sa.Column("request_id", sa.Integer(), sa.ForeignKey("support_access_requests.id"), nullable=False),
            sa.Column("tenant_id", sa.Integer(), sa.ForeignKey("organizations.id"), nullable=False),
            sa.Column("grantee_person_id", sa.Integer(), sa.ForeignKey("employees.id"), nullable=False),
            sa.Column("grantee_account_id", sa.Integer(), sa.ForeignKey("employees.id"), nullable=True),
            sa.Column("kind", sa.String(20), nullable=False, server_default="STANDARD"),
            sa.Column("effective_scope", sa.JSON(), nullable=False),
            sa.Column("issued_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
            sa.Column("expires_at", sa.DateTime(), nullable=False),
            sa.Column("revoked_at", sa.DateTime(), nullable=True),
            sa.Column("revoke_reason", sa.String(200), nullable=True),
            sa.Column("revoked_by", sa.Integer(), sa.ForeignKey("employees.id"), nullable=True),
            sa.Column("revocation_version", sa.Integer(), nullable=False, server_default=sa.text("1")),
            sa.Column("session_id", sa.String(128), nullable=True),
            sa.Column("device_fingerprint", sa.String(128), nullable=True),
            sa.Column("policy_version", sa.String(40), nullable=False),
            sa.Column("token_jti", sa.String(64), nullable=False),
            sa.Column("last_access_at", sa.DateTime(), nullable=True),
            sa.CheckConstraint("revocation_version >= 1", name="ck_support_grant_revocation_version"),
            sa.CheckConstraint("expires_at >= issued_at", name="ck_support_grant_expiry_bounds"),
            sa.CheckConstraint("kind IN ('STANDARD','BREAK_GLASS')", name="ck_support_grant_kind"),
        )
        op.create_index("ix_support_grants_request_id", "support_grants", ["request_id"])
        op.create_index("ix_support_grants_tenant_id", "support_grants", ["tenant_id"])
        op.create_index("ix_support_grants_grantee_person_id", "support_grants", ["grantee_person_id"])
        op.create_index("ix_support_grants_grantee_account_id", "support_grants", ["grantee_account_id"])
        op.create_index("ix_support_grants_expires_at", "support_grants", ["expires_at"])
        op.create_index("ix_support_grants_token_jti", "support_grants", ["token_jti"], unique=True)
        op.create_index("ix_support_grants_tenant_active", "support_grants", ["tenant_id", "revoked_at", "expires_at"])
        op.create_index("ix_support_grants_grantee_active", "support_grants", ["grantee_person_id", "revoked_at", "expires_at"])

    if "support_breakglass_sessions" not in existing:
        op.create_table(
            "support_breakglass_sessions",
            sa.Column("id", sa.String(36), primary_key=True),
            sa.Column("incident_reference", sa.String(200), nullable=False),
            sa.Column("reason", sa.Text(), nullable=False),
            sa.Column("tenant_id", sa.Integer(), sa.ForeignKey("organizations.id"), nullable=False),
            sa.Column("initiator_person_id", sa.Integer(), sa.ForeignKey("employees.id"), nullable=False),
            sa.Column("second_responder_person_id", sa.Integer(), sa.ForeignKey("employees.id"), nullable=True),
            sa.Column("scope", sa.JSON(), nullable=False),
            sa.Column("status", sa.String(30), nullable=False, server_default="PENDING_CONFIRMATION"),
            sa.Column("started_at", sa.DateTime(), nullable=True),
            sa.Column("confirm_deadline", sa.DateTime(), nullable=True),
            sa.Column("expires_at", sa.DateTime(), nullable=True),
            sa.Column("ended_at", sa.DateTime(), nullable=True),
            sa.Column("ended_by", sa.Integer(), sa.ForeignKey("employees.id"), nullable=True),
            sa.Column("grant_id", sa.String(36), sa.ForeignKey("support_grants.id"), nullable=True),
            sa.Column("review_status", sa.String(30), nullable=False, server_default="PENDING_REVIEW"),
            sa.Column("reviewed_by", sa.Integer(), sa.ForeignKey("employees.id"), nullable=True),
            sa.Column("reviewed_at", sa.DateTime(), nullable=True),
            sa.Column("review_note", sa.Text(), nullable=True),
            sa.Column("customer_notice_status", sa.String(30), nullable=False, server_default="PENDING"),
            sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
            sa.CheckConstraint(
                "status IN ('PENDING_CONFIRMATION','ACTIVE','ENDED','LAPSED')", name="ck_breakglass_status"
            ),
            sa.CheckConstraint(
                "review_status IN ('PENDING_REVIEW','REVIEWED_OK','REVIEWED_ISSUE')", name="ck_breakglass_review"
            ),
        )
        op.create_index("ix_support_breakglass_sessions_tenant_id", "support_breakglass_sessions", ["tenant_id"])
        op.create_index("ix_support_breakglass_sessions_initiator_person_id", "support_breakglass_sessions", ["initiator_person_id"])
        op.create_index("ix_support_breakglass_sessions_status", "support_breakglass_sessions", ["status"])
        op.create_index("ix_breakglass_tenant_status", "support_breakglass_sessions", ["tenant_id", "status"])

    if "support_revocation_events" not in existing:
        op.create_table(
            "support_revocation_events",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("target_type", sa.String(20), nullable=False),
            sa.Column("target_ref", sa.String(100), nullable=True),
            sa.Column("tenant_id", sa.Integer(), sa.ForeignKey("organizations.id"), nullable=True),
            sa.Column("actor_person_id", sa.Integer(), sa.ForeignKey("employees.id"), nullable=True),
            sa.Column("reason", sa.String(300), nullable=False),
            sa.Column("requested_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
            sa.Column("propagated_at", sa.DateTime(), nullable=True),
            sa.Column("propagation_confirmed", sa.Boolean(), nullable=False, server_default=sa.false()),
            sa.Column("detail", sa.JSON(), nullable=True),
            sa.CheckConstraint("target_type IN ('GRANT','SESSION','PERSON','TENANT','GLOBAL')", name="ck_revocation_target"),
        )
        op.create_index("ix_support_revocation_events_id", "support_revocation_events", ["id"])
        op.create_index("ix_support_revocation_events_tenant_id", "support_revocation_events", ["tenant_id"])
        op.create_index("ix_revocation_target", "support_revocation_events", ["target_type", "target_ref"])

    if bind.dialect.name == "postgresql":
        op.execute(MAKER_CHECKER_TRIGGER)


def downgrade() -> None:
    bind = op.get_bind()
    insp = sa.inspect(bind)
    existing = set(insp.get_table_names())
    if bind.dialect.name == "postgresql":
        op.execute("DROP TRIGGER IF EXISTS zhr_support_approval_guard ON support_approvals")
        op.execute("DROP FUNCTION IF EXISTS zhr_support_approval_guard()")
    for name in reversed(TABLES):
        if name in existing:
            op.drop_table(name)
