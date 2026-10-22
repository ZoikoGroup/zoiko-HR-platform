"""doc_templates Phase 1: employer legal entities, authorised signatories, worker jurisdiction facts

Revision ID: d7e1a0b2c3f4
Revises: b8c9d0e1f2a3
Create Date: 2026-10-21

* employer_entities, authorised_signatories (new).
* employees: work_country (ISO-2), work_region (name, as core/business_ids.REGIONS), work_city, employing_entity_id,
  worker_category, contract_end_date. onboarding_new_hires: work_country, work_region.
* security_action_tokens.reference: which document a candidate signing link is for (several live links per address).
* Data: one default entity per organization, copied ONLY from what the organization record holds (name, address, country,
  state, city, tax number, e-mail, phone). Nothing is invented: unknown values stay NULL and the app asks the admin to
  complete the profile.
* Data: employees.work_country from employees.country (strict name/code/alias match, never a city or free-text scan); when the
  employee has no country recorded at all, the organization's country. Values that do not map stay NULL and are listed by
  GET /hr/legal-entities/jurisdiction-gaps and scripts/doc_templates_jurisdiction_report.py. Every employee is linked to
  their organization's default entity.

Guarded and reversible (downgrade drops what upgrade added; backfilled values go with their columns).
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "d7e1a0b2c3f4"
down_revision: Union[str, Sequence[str], None] = "b8c9d0e1f2a3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_EMPLOYEE_COLUMNS = [
    lambda: sa.Column("work_country", sa.String(2), nullable=True),
    lambda: sa.Column("work_region", sa.String(100), nullable=True),
    lambda: sa.Column("work_city", sa.String(100), nullable=True),
    lambda: sa.Column("employing_entity_id", sa.Integer(), sa.ForeignKey("employer_entities.id"), nullable=True),
    lambda: sa.Column("worker_category", sa.String(20), nullable=True),
    lambda: sa.Column("contract_end_date", sa.Date(), nullable=True),
]
_HIRE_COLUMNS = [
    lambda: sa.Column("work_country", sa.String(2), nullable=True),
    lambda: sa.Column("work_region", sa.String(100), nullable=True),
]


def _cols(insp, table):
    return {c["name"] for c in insp.get_columns(table)} if insp.has_table(table) else None


def upgrade() -> None:
    bind = op.get_bind()
    insp = sa.inspect(bind)
    if not insp.has_table("employer_entities"):
        op.create_table(
            "employer_entities",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("organization_id", sa.Integer(), sa.ForeignKey("organizations.id"), nullable=False, index=True),
            sa.Column("legal_name", sa.String(255), nullable=True),
            sa.Column("trading_name", sa.String(255), nullable=True),
            sa.Column("registration_type", sa.String(40), nullable=True),
            sa.Column("registration_number", sa.String(100), nullable=True),
            sa.Column("tax_id", sa.String(100), nullable=True),
            sa.Column("country", sa.String(2), nullable=True),
            sa.Column("region", sa.String(100), nullable=True),
            sa.Column("city", sa.String(100), nullable=True),
            sa.Column("postal_code", sa.String(20), nullable=True),
            sa.Column("address_lines", sa.JSON(), nullable=True),
            sa.Column("phone", sa.String(50), nullable=True),
            sa.Column("email", sa.String(255), nullable=True),
            sa.Column("logo_file", sa.String(500), nullable=True),
            sa.Column("is_default", sa.Boolean(), nullable=False, server_default=sa.false()),
            sa.Column("status", sa.String(20), nullable=False, server_default="active"),
            sa.Column("created_by", sa.Integer(), sa.ForeignKey("employees.id"), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
            sa.Column("updated_at", sa.DateTime(), nullable=True, server_default=sa.func.now()),
        )
    if not insp.has_table("authorised_signatories"):
        op.create_table(
            "authorised_signatories",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("organization_id", sa.Integer(), sa.ForeignKey("organizations.id"), nullable=False, index=True),
            sa.Column("entity_id", sa.Integer(), sa.ForeignKey("employer_entities.id"), nullable=False, index=True),
            sa.Column("employee_id", sa.Integer(), sa.ForeignKey("employees.id"), nullable=False, index=True),
            sa.Column("signatory_title", sa.String(150), nullable=False),
            sa.Column("authority_scope", sa.JSON(), nullable=False),
            sa.Column("max_risk_level", sa.String(2), nullable=False, server_default="L1"),
            sa.Column("valid_from", sa.Date(), nullable=False),
            sa.Column("valid_to", sa.Date(), nullable=True),
            sa.Column("approved_by", sa.Integer(), sa.ForeignKey("employees.id"), nullable=False),
            sa.Column("status", sa.String(20), nullable=False, server_default="active"),
            sa.Column("created_by", sa.Integer(), sa.ForeignKey("employees.id"), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
            sa.Column("updated_at", sa.DateTime(), nullable=True, server_default=sa.func.now()),
        )
    insp = sa.inspect(bind)
    existing = _cols(insp, "employees") or set()
    for make in _EMPLOYEE_COLUMNS:
        col = make()
        if col.name not in existing:
            op.add_column("employees", col)
    existing = _cols(insp, "onboarding_new_hires")
    if existing is not None:
        for make in _HIRE_COLUMNS:
            col = make()
            if col.name not in existing:
                op.add_column("onboarding_new_hires", col)
    existing = _cols(insp, "security_action_tokens")
    if existing is not None and "reference" not in existing:
        op.add_column("security_action_tokens", sa.Column("reference", sa.String(100), nullable=True))
        op.create_index("ix_security_action_tokens_reference", "security_action_tokens", ["reference"])
    _backfill(bind)


def _backfill(bind) -> None:
    import sys
    from pathlib import Path
    sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
    from app.core import business_ids, regions                                           # static reference data only

    def region_name(country, value):
        known = business_ids.REGIONS.get(country or "")
        if not value or known is None:
            return None
        return next((k for k in known if k.casefold() == str(value).strip().casefold()), None)

    orgs = bind.execute(sa.text(
        "SELECT id, organization_name, address, country, state, city, tax_number, registered_email, phone FROM organizations")).fetchall()
    have = {r[0] for r in bind.execute(sa.text("SELECT DISTINCT organization_id FROM employer_entities")).fetchall()}
    entities = sa.table("employer_entities", sa.column("organization_id"), sa.column("legal_name"), sa.column("tax_id"),
                        sa.column("country"), sa.column("region"), sa.column("city"), sa.column("address_lines", sa.JSON),
                        sa.column("email"), sa.column("phone"), sa.column("is_default"), sa.column("status"))
    for org in orgs:
        if org.id in have:
            continue
        country = regions.country_code_strict(org.country)
        lines = [l.strip() for l in (org.address or "").splitlines() if l.strip()] or None
        bind.execute(entities.insert().values(
            organization_id=org.id, legal_name=(org.organization_name or None), tax_id=(org.tax_number or None), country=country,
            region=region_name(country, org.state) or (org.state or None), city=(org.city or None), address_lines=lines,
            email=(org.registered_email or None), phone=(org.phone or None), is_default=True, status="active"))

    default_entity = {r[0]: r[1] for r in bind.execute(sa.text(
        "SELECT organization_id, MIN(id) FROM employer_entities WHERE is_default = :t GROUP BY organization_id"), {"t": True}).fetchall()}
    org_country = {o.id: regions.country_code_strict(o.country) for o in orgs}
    rows = bind.execute(sa.text(
        "SELECT id, organization_id, country, state, city FROM employees WHERE work_country IS NULL")).fetchall()
    for e in rows:
        if e.country and str(e.country).strip():
            code = regions.country_code_strict(e.country)          # recorded but unmappable stays unknown: never guessed
        else:
            code = org_country.get(e.organization_id)
        bind.execute(sa.text(
            "UPDATE employees SET work_country = :c, work_region = :r, work_city = COALESCE(work_city, :city), "
            "employing_entity_id = COALESCE(employing_entity_id, :ent) WHERE id = :id"),
            {"c": code, "r": region_name(code, e.state), "city": (e.city or None), "ent": default_entity.get(e.organization_id), "id": e.id})


def downgrade() -> None:
    bind = op.get_bind()
    insp = sa.inspect(bind)
    existing = _cols(insp, "security_action_tokens")
    if existing is not None and "reference" in existing:
        op.drop_index("ix_security_action_tokens_reference", table_name="security_action_tokens")
        op.drop_column("security_action_tokens", "reference")
    existing = _cols(insp, "onboarding_new_hires") or set()
    for make in reversed(_HIRE_COLUMNS):
        name = make().name
        if name in existing:
            op.drop_column("onboarding_new_hires", name)
    existing = _cols(insp, "employees") or set()
    for make in reversed(_EMPLOYEE_COLUMNS):
        name = make().name
        if name in existing:
            op.drop_column("employees", name)
    for table in ("authorised_signatories", "employer_entities"):
        if sa.inspect(bind).has_table(table):
            op.drop_table(table)
