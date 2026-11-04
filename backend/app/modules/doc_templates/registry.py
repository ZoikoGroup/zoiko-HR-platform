"""The canonical catalogue and the engine's fixed vocabularies.

`load_register()` reads seeds/template_register.json (ZHR-ELT-MSPEC-001 v1.0, 566 entries). `definition_rows()` turns it into
`template_definitions` rows, applying the engine defaults below and the per-template overrides of the templates that are
actually implemented. Prompts 2–4 add their templates to IMPLEMENTED and TEMPLATE_OVERRIDES; nothing else needs to change.
"""
from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path

ENGINE_VERSION = "1.0.0"
SOURCE_SPEC = "ZHR-ELT-MSPEC-001 v1.0"
REGISTER_PATH = Path(__file__).parent / "seeds" / "template_register.json"
BLOCKED = "BLOCKED_PENDING_JURISDICTION_COUNSEL_SIGNOFF"

# Guide §2: the 23 controlled families and their definition counts (gate R0).
FAMILIES: dict[str, tuple[str, int]] = {
    "HR-GOV": ("Employer setup and HR governance", 20),
    "HR-ORG": ("Workforce planning and job architecture", 16),
    "HR-HIR": ("Hiring and employment offers", 21),
    "HR-VER": ("Screening, immigration and eligibility", 18),
    "HR-CON": ("Employment contracts and agreements", 30),
    "HR-ONB": ("Preboarding and onboarding", 22),
    "HR-POL": ("Employee handbook and policies", 46),
    "HR-REC": ("Employee records and privacy", 24),
    "HR-CMP": ("Compensation and financial terms", 24),
    "HR-TIM": ("Working time and attendance", 19),
    "HR-LEV": ("Leave, benefits and wellbeing", 30),
    "HR-PRF": ("Performance, probation and learning", 23),
    "HR-CHG": ("Employment changes and mobility", 24),
    "HR-ER": ("Employee relations and casework", 32),
    "HR-HSE": ("Occupational health and safety", 25),
    "HR-LBR": ("Labor relations and collective instruments", 18),
    "HR-MOB": ("Cross-border employment", 25),
    "HR-RST": ("Restructuring and workforce reduction", 25),
    "HR-SEP": ("Termination and offboarding", 34),
    "HR-POST": ("Post-employment and retirement", 15),
    "HR-STAT": ("Statutory documents and reporting", 28),
    "HR-SEC": ("Regulated employment sectors", 19),
    "HR-DOC": ("Document lifecycle governance", 28),
}
TOTAL_TEMPLATES = 566

KINDS = ("LETTER_NOTICE", "RECORD", "ASSESSMENT", "AGREEMENT", "FORM", "POLICY", "DECISION", "CHECKLIST", "OFFICIAL_EXTERNAL")
RISKS = ("L1", "L2", "L3")
SENSITIVITIES = ("C2", "C3", "C4")
OUTPUT_MODES = ("DOCUMENT", "FORM_RECORD", "CHECKLIST_RECORD", "POLICY")
EXECUTION_MODES = ("NONE", "ACKNOWLEDGE", "SIGN_EMPLOYEE", "SIGN_BOTH", "SIGN_CANDIDATE")
AUDIENCES = ("EMPLOYEE", "CANDIDATE", "MANAGER", "HR_INTERNAL")
SIGN_MODES = ("SIGN_EMPLOYEE", "SIGN_BOTH", "SIGN_CANDIDATE")

PACK_STATUSES = ("DRAFT", "LEGAL_REVIEW", "ACTIVE", "SUSPENDED", "RETIRED")
VARIANT_STATUSES = ("IN_DRAFT", "LEGAL_REVIEW", "LEGAL_APPROVED", "RELEASE_TESTED", "ACTIVE", "SUSPENDED", "RETIRED")
RELEASE_MODES = ("PLATFORM_COUNSEL", "TENANT_ATTESTED")
DOCUMENT_STATUSES = (
    "REQUESTED", "CONTEXT_VALIDATED", "RENDERED_DRAFT", "PENDING_APPROVAL", "HUMAN_APPROVED", "ISSUED", "ACKNOWLEDGED",
    "EXECUTED", "DECLINED", "REJECTED", "CANCELLED", "EXPIRED", "CORRECTED", "SUPERSEDED", "RETAINED", "LEGAL_HOLD",
)
SUBJECT_TYPES = ("employee", "candidate", "new_hire", "position", "org")
WORKER_CATEGORIES = ("employee", "intern", "apprentice", "contractor", "casual")

# Templates implemented by Prompts 1–4 (82 in total). Everything else is listed as "Not available yet".
GOVERNANCE_TEMPLATES = (
    "HR-DOC-001", "HR-DOC-003", "HR-DOC-004", "HR-DOC-008", "HR-DOC-010",
    "HR-DOC-012", "HR-DOC-013", "HR-DOC-014", "HR-DOC-016", "HR-DOC-018",
)
IMPLEMENTED: set[str] = set(GOVERNANCE_TEMPLATES)

# Governance records are produced by the engine itself from its own evidence, not from a jurisdiction variant
# (docs/templates/release_modes.md, "System records"). They are never issued to a worker.
SYSTEM_RECORDS: set[str] = set(GOVERNANCE_TEMPLATES)

# Per-template settings that differ from the kind defaults. Business templates take theirs from their starter seed file.
TEMPLATE_OVERRIDES: dict[str, dict] = {
    cid: {"output_mode": "DOCUMENT", "execution_mode": "NONE", "audience": "HR_INTERNAL", "approval_policy": "L1",
          "retention_rule_key": "document_governance"}
    for cid in GOVERNANCE_TEMPLATES
}


def _starter_templates() -> None:
    """Every template with a starter seed file (Prompts 2–4) is implemented, with the settings its seed declares."""
    from app.modules.doc_templates import starters
    for cid, s in starters.STARTERS.items():
        IMPLEMENTED.add(cid)
        TEMPLATE_OVERRIDES[cid] = {**TEMPLATE_OVERRIDES.get(cid, {}), **s["meta"]}


_starter_templates()

# Who may request a document of each family (on top of authorize() for the subject). Managers only where the access
# matrix lets them see the family at all (performance, attendance, leave), and only for their own reports.
DEFAULT_REQUEST_ROLES = frozenset({"admin", "hr_admin"})
FAMILY_REQUEST_ROLES: dict[str, frozenset] = {
    "HR-PRF": frozenset({"admin", "hr_admin", "manager"}),
    "HR-TIM": frozenset({"admin", "hr_admin", "manager"}),
    "HR-LEV": frozenset({"admin", "hr_admin", "manager"}),
}
MANAGER_VISIBLE_FAMILIES = frozenset({"HR-PRF", "HR-TIM", "HR-LEV"})
COMPENSATION_FAMILIES = frozenset({"HR-CMP"})
HR_ROLES = frozenset({"admin", "hr_admin"})


def request_roles(family_id: str) -> frozenset:
    return FAMILY_REQUEST_ROLES.get(family_id, DEFAULT_REQUEST_ROLES)


def _default_output_mode(kind: str) -> str:
    return {"POLICY": "POLICY", "FORM": "FORM_RECORD", "CHECKLIST": "CHECKLIST_RECORD"}.get(kind, "DOCUMENT")


def _default_execution_mode(kind: str, family: str) -> str:
    if kind == "AGREEMENT":
        return "SIGN_CANDIDATE" if family == "HR-HIR" else "SIGN_BOTH"
    if kind in ("POLICY", "LETTER_NOTICE"):
        return "ACKNOWLEDGE"
    return "NONE"


def _default_audience(kind: str, family: str) -> str:
    if family == "HR-DOC":
        return "HR_INTERNAL"
    if family == "HR-HIR":
        return "CANDIDATE"
    if kind in ("LETTER_NOTICE", "AGREEMENT", "POLICY", "FORM"):
        return "EMPLOYEE"
    return "HR_INTERNAL"


@lru_cache(maxsize=1)
def load_register() -> list[dict]:
    with open(REGISTER_PATH, encoding="utf-8") as fh:
        return json.load(fh)


def definition_rows() -> list[dict]:
    """template_definitions rows for every register entry (engine defaults + overrides)."""
    rows = []
    for entry in load_register():
        cid, family, kind = entry["id"], entry["family"], entry["kind"]
        row = {
            "canonical_id": cid,
            "family_id": family,
            "title": entry["title"],
            "kind": kind,
            "legal_risk": entry["risk"],
            "sensitivity": entry["sensitivity"],
            "lifecycle_trigger": entry.get("trigger"),
            "catalogue_status": entry.get("status") or BLOCKED,
            "implemented": cid in IMPLEMENTED,
            "output_mode": _default_output_mode(kind),
            "execution_mode": _default_execution_mode(kind, family),
            "audience": _default_audience(kind, family),
            "approval_policy": entry["risk"],
            "retention_rule_key": f"{family.lower()}.default",
            "schema_version": 1,
            "source_spec": SOURCE_SPEC,
            "template_json_ref": entry.get("template_json"),
        }
        row.update(TEMPLATE_OVERRIDES.get(cid, {}))
        rows.append(row)
    return rows


def sync_definitions(db) -> int:
    """Insert missing definitions and refresh engine-owned columns of existing ones. Idempotent; returns rows touched."""
    from app.modules.doc_templates.models import TemplateDefinition

    existing = {d.canonical_id: d for d in db.query(TemplateDefinition).all()}
    touched = 0
    for row in definition_rows():
        current = existing.get(row["canonical_id"])
        if current is None:
            db.add(TemplateDefinition(**row))
            touched += 1
            continue
        changed = False
        for key, value in row.items():
            if getattr(current, key) != value:
                setattr(current, key, value)
                changed = True
        touched += int(changed)
    db.flush()
    return touched


def stricter(a: str, b: str) -> str:
    """The stricter of two approval policies (L3 > L2 > L1)."""
    return max(a or "L1", b or "L1", key=lambda p: RISKS.index(p) if p in RISKS else 0)
