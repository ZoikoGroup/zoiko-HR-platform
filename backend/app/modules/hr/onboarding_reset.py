"""Reset one organisation's onboarding settings to fresh defaults.

Scope: configuration and setup made from Onboarding › Settings. New hires, issued documents, submitted forms, audit
history and released templates are never touched. Helpers that read these settings recreate their defaults lazily, so a
reset is a transaction of deletes plus small repairs rather than a call to each settings page.
"""
from __future__ import annotations

import json
import logging
from datetime import date, datetime

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.modules.doc_templates.models import AuthorisedSignatory
from app.modules.hr.docs_setup_models import (
    DocsSetupFile,
    DocsSetupProposal,
    DocsSetupSession,
    OrgDocumentRequestCategory,
    OrgFormOverride,
    OrgPackageDocument,
)
from app.modules.hr.models import OnboardingChecklist, OnboardingDocument, OnboardingSettings, Organization, OrganizationConfig

logger = logging.getLogger("zoiko.onboarding.reset")

# Only onboarding-settings keys. Recruitment privacy, bulk-job state and every other tenant config stay as they are.
CONFIG_KEYS = (
    "company_profile.config",
    "onboarding_package.config",
    "onboarding_profiles.config",
    "onboarding_custom_fields.config",
    "onboarding_doc_automation.config",
    "payroll.finance_viewer_ids",
)


def _delete(db: Session, model, organization_id: int) -> int:
    return db.query(model).filter(model.organization_id == organization_id).delete(synchronize_session=False)


def _storage_keys(db: Session, organization_id: int) -> set[str]:
    """Blobs owned by settings: package logo/signature and uploaded docs-setup files."""
    keys: set[str] = set()
    values = (db.query(OrganizationConfig.value)
              .filter(OrganizationConfig.organization_id == organization_id,
                      OrganizationConfig.key == "onboarding_package.config").all())
    for (raw,) in values:
        try:
            cfg = json.loads(raw or "{}") or {}
        except (TypeError, ValueError):
            continue
        for field in ("logo_key", "signature_key"):
            if cfg.get(field):
                keys.add(str(cfg[field]))
    for storage_key, chunks_key in (db.query(DocsSetupFile.storage_key, DocsSetupFile.chunks_key)
                                    .filter(DocsSetupFile.organization_id == organization_id).all()):
        if storage_key:
            keys.add(storage_key)
        if chunks_key:
            keys.add(chunks_key)
    return keys


def _reset_checklist_templates(db: Session, organization_id: int) -> int:
    """Soft-delete templates only; copies already assigned to hires keep their source template row."""
    query = (db.query(OnboardingChecklist)
             .filter(OnboardingChecklist.organization_id == organization_id,
                     OnboardingChecklist.onboarding_new_hire_id.is_(None),
                     OnboardingChecklist.is_deleted.is_(False)))
    count = query.count()
    query.update({OnboardingChecklist.is_deleted: True}, synchronize_session=False)
    return count


def _reset_request_categories(db: Session, organization_id: int) -> dict:
    """Restore the five built-ins; delete unused custom categories and deactivate ones used by hires' uploads."""
    from app.modules.hr import onboarding_org_settings as OS

    used = {key for (key,) in db.query(OnboardingDocument.category)
            .filter(OnboardingDocument.organization_id == organization_id).all()}
    system = dict(OS.SYSTEM_CATEGORIES)
    deleted = deactivated = restored = 0
    rows = (db.query(OrgDocumentRequestCategory)
            .filter(OrgDocumentRequestCategory.organization_id == organization_id).all())
    have = set()
    for row in rows:
        have.add(row.key)
        if row.key in system:
            row.label = system[row.key]
            row.description = None
            row.required_by_default = row.key in ("id_proof", "bank_details")
            row.accepted_types = list(OS.DEFAULT_TYPES)
            row.max_size_mb = 10
            row.sort_order = (list(system).index(row.key) + 1) * 10
            row.active = True
            row.is_system = True
            row.created_by_session_id = None
            restored += 1
        elif row.is_system or row.key in used or not row.active:
            row.active = False
            deactivated += 1
        else:
            db.delete(row)
            deleted += 1
    for i, (key, label) in enumerate(OS.SYSTEM_CATEGORIES):
        if key in have:
            continue
        db.add(OrgDocumentRequestCategory(organization_id=organization_id, key=key, label=label, is_system=True,
                                          active=True, required_by_default=key in ("id_proof", "bank_details"),
                                          accepted_types=list(OS.DEFAULT_TYPES), max_size_mb=10,
                                          sort_order=(i + 1) * 10))
        restored += 1
    return {"restored": restored, "deleted": deleted, "deactivated": deactivated}


def _reset_countersigners(db: Session, organization_id: int) -> int:
    """Remove only the onboarding package families from signatories; their other document authority stays."""
    from app.modules.hr import onboarding_countersign as CS

    fams = set(CS.package_families(organization_id))
    affected = 0
    signatories = (db.query(AuthorisedSignatory)
                   .filter(AuthorisedSignatory.organization_id == organization_id,
                           AuthorisedSignatory.status == "active").all())
    for signatory in signatories:
        scope = list(signatory.authority_scope or [])
        rest = [x for x in scope if x not in fams]
        if len(rest) == len(scope):
            continue
        affected += 1
        if rest:
            signatory.authority_scope = rest
        else:
            signatory.authority_scope = []
            signatory.status = "inactive"
            signatory.valid_to = date.today()
    return affected


def _reset_starter_set(db: Session, organization_id: int) -> str:
    """A fresh organisation starts from the starter set for its country, with the usual automatic trigger."""
    from app.modules.hr import onboarding_starter_sets as SS

    org = db.get(Organization, organization_id)
    set_key = SS.set_for_country(getattr(org, "country", None))
    row = (db.query(OrganizationConfig)
           .filter(OrganizationConfig.organization_id == organization_id,
                   OrganizationConfig.key == SS.MARKER_KEY).first())
    if row is None:
        row = OrganizationConfig(organization_id=organization_id, key=SS.MARKER_KEY, category="onboarding_package",
                                 description="The onboarding documents this organisation started with")
        db.add(row)
    row.value = json.dumps({"set": set_key, "country": (getattr(org, "country", "") or "").upper() or None,
                            "send_when": SS.DEFAULT_TRIGGER, "marked_at": datetime.utcnow().isoformat(),
                            "reason": "settings_reset"})
    return set_key


def reset(db: Session, organization_id: int) -> dict:
    """Wipe onboarding setup for one organisation and leave the defaults to be rebuilt on the next read."""
    if db.get(Organization, organization_id) is None:
        raise HTTPException(404, "Organisation not found.")
    keys = _storage_keys(db, organization_id)
    removed: dict = {
        "settings": _delete(db, OnboardingSettings, organization_id),
        "config_rows": (db.query(OrganizationConfig)
                        .filter(OrganizationConfig.organization_id == organization_id,
                                OrganizationConfig.key.in_(CONFIG_KEYS)).delete(synchronize_session=False)),
        "package_documents": _delete(db, OrgPackageDocument, organization_id),
        "form_overrides": _delete(db, OrgFormOverride, organization_id),
        "docs_setup_files": _delete(db, DocsSetupFile, organization_id),
        "docs_setup_proposals": _delete(db, DocsSetupProposal, organization_id),
        "docs_setup_sessions": _delete(db, DocsSetupSession, organization_id),
        "checklist_templates": _reset_checklist_templates(db, organization_id),
    }
    removed["request_categories"] = _reset_request_categories(db, organization_id)
    removed["countersigner_scopes"] = _reset_countersigners(db, organization_id)
    starter_set = _reset_starter_set(db, organization_id)
    db.commit()

    # Storage is outside the database transaction; only remove blobs once the reset has committed.
    if keys:
        from app.modules.hr import docs_setup
        for key in sorted(keys):
            docs_setup._forget(key)
    logger.info("onboarding settings reset for organisation %s: %s", organization_id, removed)
    return {"reset": True, "organization_id": organization_id, "starter_set": starter_set, "removed": removed}
