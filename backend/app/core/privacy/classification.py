"""Data classification registry (ZHR-PRIV-001 A03, E01-E05, G07).

Every column of every table that holds tenant data has exactly one classification. A table is registered either by an
explicit entry in TABLES or by a name prefix in PREFIX_DEFAULTS; a column takes its table's default unless COLUMN_RULES
(a name pattern) or an explicit per-column override says it is more sensitive. A table that matches nothing is
UNCLASSIFIED, and the system check / unit test fail, so a new HR table or field cannot ship without a decision.

A second guard catches under-classification: a column whose NAME looks sensitive (salary, bank, iban, medical...) can
never be classified below the level that name implies, whatever its table default says.
"""
from __future__ import annotations

import re
from enum import Enum
from typing import Iterable


class Level(str, Enum):
    PLATFORM_META = "PLATFORM_META"                    # tenant existence, plan, subscription, entitlement, service/provisioning status
    TENANT_AGGREGATE = "TENANT_AGGREGATE"              # counts and statistics, disclosure-safe only
    PERSONAL_BASIC = "PERSONAL_BASIC"                  # names, work email, phone, photo, employee id, title, department, manager
    PERSONAL_CONFIDENTIAL = "PERSONAL_CONFIDENTIAL"    # home address, personal email, DOB, emergency contacts, contracts, performance
    FINANCIAL = "FINANCIAL"                            # salary, pay history, bank, tax ids, benefits
    SPECIAL_CATEGORY = "SPECIAL_CATEGORY"              # health, disability, absence reason, disciplinary, grievance, ...
    TENANT_BUSINESS_FINANCE = "TENANT_BUSINESS_FINANCE"  # the tenant's own invoices, vendors, customers' balances, accounting
    TENANT_CUSTOMER = "TENANT_CUSTOMER"                # the tenant's customers, contacts, applicants
    TENANT_FILE = "TENANT_FILE"                        # uploaded documents and attachments
    SECRET = "SECRET"                                  # passwords, hashes, tokens, keys: never returned, never logged


# How sensitive each level is, for "at or below" questions. Levels that are about different kinds of data (customer,
# file, finance) share ranks with the personal level of similar harm.
RANK = {
    Level.PLATFORM_META: 0,
    Level.TENANT_AGGREGATE: 1,
    Level.PERSONAL_BASIC: 2,
    Level.PERSONAL_CONFIDENTIAL: 3,
    Level.TENANT_CUSTOMER: 3,
    Level.TENANT_FILE: 3,
    Level.FINANCIAL: 4,
    Level.TENANT_BUSINESS_FINANCE: 4,
    Level.SPECIAL_CATEGORY: 5,
    Level.SECRET: 6,
}

# Levels a platform (super admin) subject may ever see. Everything else is tenant data-plane data.
PLATFORM_VISIBLE = frozenset({Level.PLATFORM_META, Level.TENANT_AGGREGATE})

UNCLASSIFIED = "UNCLASSIFIED"

L = Level

# ── table level ─────────────────────────────────────────────────────────────────────────────────────────────────────
# Explicit entries win over prefixes. The value is the default level of every column of the table.
TABLES: dict[str, Level] = {
    # people
    "employees": L.PERSONAL_BASIC,
    "employee_profiles": L.PERSONAL_CONFIDENTIAL,
    "employee_history": L.PERSONAL_CONFIDENTIAL,
    "employee_lifecycle": L.PERSONAL_CONFIDENTIAL,
    "employee_reporting": L.PERSONAL_BASIC,
    "security_action_tokens": L.SECRET,
    # money
    "employee_compensations": L.FINANCIAL, "employee_benefits": L.FINANCIAL, "benefits": L.FINANCIAL, "allowances": L.FINANCIAL,
    "pay_grades": L.FINANCIAL, "compensation_bands": L.FINANCIAL, "salary_components": L.FINANCIAL, "salary_revisions": L.FINANCIAL,
    "salary_structures": L.FINANCIAL, "travel_expenses": L.FINANCIAL, "travel_receipts": L.TENANT_FILE,
    # time and leave
    "attendance_records": L.PERSONAL_CONFIDENTIAL, "leave_requests": L.PERSONAL_CONFIDENTIAL, "leave_balances": L.PERSONAL_CONFIDENTIAL,
    "shifts": L.PERSONAL_BASIC, "holidays": L.PERSONAL_BASIC, "leave_settings": L.PERSONAL_BASIC, "leave_type_configs": L.PERSONAL_BASIC,
    # organisation structure and tenant configuration
    "departments": L.PERSONAL_BASIC, "designations": L.PERSONAL_BASIC, "designation_settings": L.PERSONAL_BASIC,
    "organization_configs": L.PERSONAL_BASIC, "organization_evaluations": L.PLATFORM_META,
    "asset_categories": L.PERSONAL_BASIC, "asset_settings": L.PERSONAL_BASIC, "assets": L.PERSONAL_BASIC,
    "asset_maintenance_requests": L.PERSONAL_BASIC, "asset_reports": L.PERSONAL_BASIC, "asset_requests": L.PERSONAL_BASIC,
    "ess_requests": L.PERSONAL_CONFIDENTIAL, "engagement_surveys": L.PERSONAL_CONFIDENTIAL,
    # documents
    "hr_documents": L.TENANT_FILE, "hr_document_folders": L.TENANT_FILE, "hr_document_versions": L.TENANT_FILE,
    "onboarding_documents": L.TENANT_FILE, "recruitment_documents": L.TENANT_FILE, "knowledge_sources": L.TENANT_FILE,
    # cases and conduct
    "compliance_violations": L.SPECIAL_CATEGORY, "compliance_corrective_actions": L.SPECIAL_CATEGORY,
    "compliance_audits": L.PERSONAL_CONFIDENTIAL, "compliance_records": L.PERSONAL_CONFIDENTIAL,
    "compliance_regulations": L.PERSONAL_BASIC, "compliance_risks": L.PERSONAL_BASIC,
    "performance_appraisals": L.PERSONAL_CONFIDENTIAL, "performance_feedback": L.PERSONAL_CONFIDENTIAL,
    "performance_goals": L.PERSONAL_CONFIDENTIAL, "performance_kpis": L.PERSONAL_CONFIDENTIAL, "performance_reviews": L.PERSONAL_CONFIDENTIAL,
    # platform-held records about a tenant (Zoiko's own subscription billing, evaluation, support, logs)
    "super_admin_audit_logs": L.PERSONAL_BASIC,           # carries actor names and target labels: minimised before the platform sees it
    "super_admin_login_activities": L.PERSONAL_BASIC,
    "super_admin_email_delivery_logs": L.PERSONAL_BASIC,
    "super_admin_security_events": L.PLATFORM_META,
    "super_admin_incidents": L.PLATFORM_META,
    "super_admin_approval_history": L.PERSONAL_CONFIDENTIAL,
    "super_admin_expense_budgets": L.TENANT_BUSINESS_FINANCE,
    "privacy_approval_requests": L.PLATFORM_META,
    "super_admin_support_tickets": L.PERSONAL_CONFIDENTIAL,
    "workflow_executions": L.PERSONAL_BASIC,
    "workflow_workspaces": L.PLATFORM_META,
    # assistant (Mira) conversations hold what people typed
    "chat_audit_events": L.PLATFORM_META, "chat_idempotency_keys": L.PLATFORM_META, "chat_operational_controls": L.PLATFORM_META,
    "chat_safety_events": L.PLATFORM_META, "chat_action_evidence": L.PERSONAL_CONFIDENTIAL,
    "chat_privacy_requests": L.PERSONAL_CONFIDENTIAL,
    # child tables of tenant tables (no organization_id of their own)
    "billable_workforce_snapshots": L.TENANT_AGGREGATE, "downgrade_impact_item": L.PLATFORM_META, "workflow_workflows": L.PLATFORM_META,
    "connect_channels": L.PLATFORM_META, "hub_webhooks": L.PLATFORM_META, "hub_webhook_deliveries": L.PERSONAL_CONFIDENTIAL,
    "compensation_items": L.FINANCIAL, "structure_components": L.FINANCIAL, "shift_rosters": L.PERSONAL_BASIC,
    "document_approval_logs": L.TENANT_FILE, "document_approval_steps": L.TENANT_FILE, "document_assignments": L.TENANT_FILE,
    "knowledge_applicability": L.TENANT_FILE, "knowledge_fragments": L.TENANT_FILE, "knowledge_ingestion_runs": L.TENANT_FILE,
    "knowledge_source_versions": L.TENANT_FILE,
}

# (prefix, level) — first match wins, after the explicit table above.
PREFIX_DEFAULTS: list[tuple[str, Level]] = [
    ("billing_", L.PLATFORM_META),            # Zoiko's own subscription billing for the tenant (NOT the tenant's own finance)
    ("commercial_", L.PLATFORM_META),
    ("chat_", L.PERSONAL_CONFIDENTIAL),
    ("recruitment_", L.TENANT_CUSTOMER),      # applicants and candidates are the tenant's customers/contacts
    ("onboarding_", L.PERSONAL_CONFIDENTIAL),
    ("learning_", L.PERSONAL_BASIC),
    ("travel_", L.PERSONAL_CONFIDENTIAL),
    ("wf_", L.PERSONAL_BASIC),                # workforce planning
    ("workforce_", L.PERSONAL_BASIC),
    ("super_admin_", L.PLATFORM_META),
    # Zoiko's own record of a tenant's support access (grants, approvals, break-glass, revocations). Control-plane
    # metadata about the tenant, not the tenant's own data: the same level as billing_ and super_admin_.
    ("support_", L.PLATFORM_META),
]

# ── column level ────────────────────────────────────────────────────────────────────────────────────────────────────
# (pattern, level): a column whose name matches is at least this sensitive (checked most sensitive first).
COLUMN_RULES: list[tuple[re.Pattern, Level]] = [(re.compile(p, re.I), lvl) for p, lvl in [
    (r"(^|_)(hashed_password|password|passwd|pwd|secret|token|api_key|apikey|otp|mfa_secret|private_key|signing)(_|$)", L.SECRET),
    (r"(medical|health|disab|sick|illness|diagnos|disciplin|grievance|safeguard|ethnic|religion|trade_union|union_member|pregnan|absence_reason)", L.SPECIAL_CATEGORY),
    (r"(^|_)(reason|rejection_reason)$", L.SPECIAL_CATEGORY),            # why someone was absent / refused: can reveal health or conduct
    (r"(salary|(^|_)ctc($|_)|basic_pay|gross|net_pay|bonus|bank|iban|ifsc|swift|account_number|(^|_)pan(_|$)|aadhar|aadhaar|(^|_)uan(_|$)|esic|(^|_)pf_|"
     r"(^|_)ssn(_|$)|national_insurance|tax_id|tax_number|payslip|hike|(^|_)amount$|(^|_)cost$|reimburs)", L.FINANCIAL),
    (r"(date_of_birth|(^|_)dob(_|$)|personal_email|home_address|(^|_)address|current_address|permanent_address|pincode|emergency|passport|visa|work_permit|"
     r"marital|blood_group|nationality|gender|performance|rating|appraisal|(^|_)score|comments$|(^|_)notes?$)", L.PERSONAL_CONFIDENTIAL),
    (r"(file_path|file_url|storage_key|s3_key|object_key|receipt_url|resume_link|attachment)", L.TENANT_FILE),
    (r"((^|_)first_name|last_name|full_name|(^|_)name$|(^|_)email$|work_email|(^|_)phone|profile_picture|photo|employee_id|employee_code|legacy_code|job_title|"
     r"department|designation|reporting_manager|performed_by_email|actor_name|target_label|ip_address)", L.PERSONAL_BASIC),
]]

# Explicit per-column levels where a table default or the name rules would be wrong.
COLUMN_OVERRIDES: dict[str, Level] = {
    "employees.hashed_password": L.SECRET,
    "employees.role": L.PLATFORM_META,                    # which role someone holds is account-management data
    "employees.is_active": L.PLATFORM_META,
    "employees.status": L.PLATFORM_META,
    "employees.organization_id": L.PLATFORM_META,
    "employees.email_verified": L.PLATFORM_META,
    "employees.must_change_password": L.PLATFORM_META,
    "employees.notification_preferences": L.PERSONAL_BASIC,
    "employees.timezone": L.PERSONAL_BASIC,
    "employees.language": L.PERSONAL_BASIC,
    "employees.travel_preferences": L.PERSONAL_BASIC,
    "super_admin_audit_logs.action": L.PLATFORM_META,
    "super_admin_audit_logs.action_type": L.PLATFORM_META,
    "super_admin_audit_logs.entity_type": L.PLATFORM_META,
    "super_admin_audit_logs.actor_role": L.PLATFORM_META,
    "super_admin_audit_logs.status": L.PLATFORM_META,
    "super_admin_audit_logs.created_at": L.PLATFORM_META,
    "super_admin_audit_logs.organization_id": L.PLATFORM_META,
    "super_admin_audit_logs.details": L.PERSONAL_CONFIDENTIAL,
    "super_admin_audit_logs.changes": L.PERSONAL_CONFIDENTIAL,
    "super_admin_audit_logs.error_message": L.PERSONAL_CONFIDENTIAL,
    "super_admin_audit_logs.entity_id": L.PERSONAL_BASIC,
}

# Columns that are structural and carry no information of their own.
STRUCTURAL = re.compile(r"^(id|created_at|updated_at|created_by|updated_by|organization_id|.*_id|deleted_at|is_deleted|sort_order|version)$", re.I)


def table_default(table: str) -> Level | str:
    if table in TABLES:
        return TABLES[table]
    for prefix, level in PREFIX_DEFAULTS:
        if table.startswith(prefix):
            return level
    return UNCLASSIFIED


def _name_floor(table: str, column: str) -> Level | None:
    """The least sensitive level the column NAME allows (None when the name says nothing)."""
    for pattern, level in COLUMN_RULES:
        if pattern.search(column):
            return level
    return None


def classify(table: str, column: str) -> Level | str:
    """The classification of table.column: an override, else the stricter of the table default and the name rule."""
    key = f"{table}.{column}"
    if key in COLUMN_OVERRIDES:
        return COLUMN_OVERRIDES[key]
    base = table_default(table)
    if base == UNCLASSIFIED:
        return UNCLASSIFIED
    # Foreign keys and bookkeeping columns carry no information: keep them at the lowest level the table has.
    if STRUCTURAL.match(column) and not _name_floor(table, column):
        return L.PLATFORM_META if column in ("id", "created_at", "updated_at", "organization_id", "deleted_at", "is_deleted", "sort_order", "version") else (
            L.PLATFORM_META if base in (L.PLATFORM_META, L.TENANT_AGGREGATE) else L.PERSONAL_BASIC)
    floor = _name_floor(table, column)
    if floor is None:
        return base
    return floor if RANK[floor] > RANK[base] else base


def rank(level: Level | str) -> int:
    return RANK[Level(level)] if level != UNCLASSIFIED else 99


def sensitivity_of(model, field: str) -> Level | str:
    """Classification of a SQLAlchemy model's (or table name's) field."""
    table = model if isinstance(model, str) else model.__table__.name
    return classify(table, field)


def fields_at_or_below(model, level: Level) -> list[str]:
    """Names of the model's columns whose classification is no more sensitive than `level` (unclassified: never)."""
    table = model if isinstance(model, str) else model.__table__.name
    cols = [c.name for c in model.__table__.c] if not isinstance(model, str) else []
    out = []
    for col in cols:
        c = classify(table, col)
        if c != UNCLASSIFIED and rank(c) <= RANK[Level(level)]:
            out.append(col)
    return out


def is_tenant_table(table) -> bool:
    return "organization_id" in table.c


def tenant_data_tables(metadata) -> list:
    """Tables that hold tenant data: they carry organization_id, or reference a table that does (transitive children)."""
    direct = {t.name for t in metadata.tables.values() if is_tenant_table(t)}
    out = set(direct)
    changed = True
    while changed:                                                   # children of children
        changed = False
        for t in metadata.tables.values():
            if t.name in out:
                continue
            if any(fk.column.table.name in out for fk in t.foreign_keys):
                out.add(t.name)
                changed = True
    return [metadata.tables[n] for n in sorted(out) if n != "organizations"]


def audit(metadata) -> list[str]:
    """Problems with the registry: tables or columns with no classification, and names classified below their floor."""
    problems = []
    for table in tenant_data_tables(metadata):
        base = table_default(table.name)
        if base == UNCLASSIFIED:
            problems.append(f"{table.name}: table is not classified (add it to TABLES or PREFIX_DEFAULTS in app/core/privacy/classification.py)")
            continue
        for col in table.c:
            c = classify(table.name, col.name)
            if c == UNCLASSIFIED:
                problems.append(f"{table.name}.{col.name}: unclassified")
                continue
            floor = _name_floor(table.name, col.name)
            if floor is not None and f"{table.name}.{col.name}" not in COLUMN_OVERRIDES and RANK[floor] > RANK[Level(c)]:
                problems.append(f"{table.name}.{col.name}: classified {Level(c).value} but its name implies at least {floor.value}")
    return problems


def render_markdown(metadata) -> str:
    lines = ["# Data classification (generated)", "",
             "Generated by `python scripts/privacy_classification_doc.py` from `app/core/privacy/classification.py`. Do not edit by hand.", "",
             "Levels: " + ", ".join(f"`{l.value}`" for l in Level), "",
             "Platform (super admin) subjects may only ever see `PLATFORM_META` and `TENANT_AGGREGATE`.", ""]
    for table in tenant_data_tables(metadata):
        cols = [(c.name, classify(table.name, c.name)) for c in table.c]
        top = max((rank(c) for _, c in cols), default=0)
        lines.append(f"## `{table.name}` (default {table_default(table.name).value if table_default(table.name) != UNCLASSIFIED else UNCLASSIFIED}; most sensitive column rank {top})")
        by: dict[str, list[str]] = {}
        for name, c in cols:
            by.setdefault(c.value if c != UNCLASSIFIED else UNCLASSIFIED, []).append(name)
        for level in sorted(by, key=lambda x: rank(x) if x != UNCLASSIFIED else 99):
            lines.append(f"- **{level}**: " + ", ".join(f"`{n}`" for n in by[level]))
        lines.append("")
    return "\n".join(lines)
