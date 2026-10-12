"""
modules/hr/org_config_service.py
---------------------------------
Service layer for per-organization configuration management.

Provides CRUD operations for OrganizationConfig key-value settings.
Each organization can store custom settings that override global defaults.
"""

from typing import Any, Dict, List, Optional

from sqlalchemy.orm import Session

from app.core.exceptions import BadRequestException, NotFoundException
from app.modules.hr.models import OrganizationConfig


# Default configuration values (fallback when org has no override)
DEFAULTS: Dict[str, str] = {
    "leave_year_start_month": "1",
    "default_currency": "INR",
    "timezone": "Asia/Kolkata",
    "date_format": "DD/MM/YYYY",
    "enable_self_service_leave": "true",
    "enable_attendance_geofencing": "false",
    "auto_approve_leave_below_days": "0",
    "max_leave_carry_forward_days": "0",
    "probation_period_months": "3",
    "notice_period_days": "30",
}


def get_config(db: Session, organization_id: int, key: str) -> Optional[OrganizationConfig]:
    """Get a single config entry by key for an organization."""
    return db.query(OrganizationConfig).filter(
        OrganizationConfig.organization_id == organization_id,
        OrganizationConfig.key == key,
    ).first()


def get_config_value(db: Session, organization_id: int, key: str) -> Optional[str]:
    """Get a config value by key, returning the string value or None."""
    entry = get_config(db, organization_id, key)
    return entry.value if entry else None


def get_config_value_or_default(db: Session, organization_id: int, key: str) -> str:
    """Get a config value by key, falling back to DEFAULTS if not set."""
    entry = get_config(db, organization_id, key)
    if entry and entry.value is not None:
        return entry.value
    return DEFAULTS.get(key, "")


def get_all_configs(db: Session, organization_id: int, category: Optional[str] = None) -> List[OrganizationConfig]:
    """Get all config entries for an organization, optionally filtered by category."""
    query = db.query(OrganizationConfig).filter(
        OrganizationConfig.organization_id == organization_id,
    )
    if category:
        query = query.filter(OrganizationConfig.category == category)
    return query.order_by(OrganizationConfig.key).all()


def get_config_map(db: Session, organization_id: int) -> Dict[str, str]:
    """Get all config entries as a flat {key: value} dict, with defaults merged."""
    result = dict(DEFAULTS)
    entries = db.query(OrganizationConfig).filter(
        OrganizationConfig.organization_id == organization_id,
    ).all()
    for entry in entries:
        if entry.value is not None:
            result[entry.key] = entry.value
    return result


def _record_setting(db: Session, action_type: str, actor, organization_id: int, *, key: Optional[str] = None,
                    changes=None, details=None) -> None:
    """Settings changes belong in the Super Admin activity feed. Values are masked
    by field name (a key containing "password"/"secret"/"token" never shows its value)."""
    from app.modules.hr.models import Organization
    from app.modules.super_admin import activity_service

    org = db.query(Organization).filter(Organization.id == organization_id).first()
    org_name = (org.organization_name or org.display_name or org.name) if org else None
    if isinstance(actor, int):
        from app.modules.employee.models import Employee

        actor = db.query(Employee).filter(Employee.id == actor).first()
    activity_service.record_activity(
        db, action_type=action_type, actor=actor, organization_id=organization_id, organization_name=org_name,
        target_name=key or org_name, entity_type="OrganizationConfig", changes=changes, details=details,
    )


def _upsert_config(
    db: Session,
    organization_id: int,
    key: str,
    value: Optional[str] = None,
    description: Optional[str] = None,
    category: str = "general",
):
    """Create or update one entry. Returns (entry, old_value, was_new); does not record."""
    if not key or not key.strip():
        raise BadRequestException("Config key cannot be empty.")

    key = key.strip()

    existing = get_config(db, organization_id, key)
    if existing:
        old_value = existing.value
        if value is not None:
            existing.value = value
        if description is not None:
            existing.description = description
        if category:
            existing.category = category
        db.commit()
        db.refresh(existing)
        return existing, old_value, False

    entry = OrganizationConfig(
        organization_id=organization_id,
        key=key,
        value=value,
        description=description,
        category=category,
    )
    db.add(entry)
    db.commit()
    db.refresh(entry)
    return entry, None, True


def set_config(
    db: Session,
    organization_id: int,
    key: str,
    value: Optional[str] = None,
    description: Optional[str] = None,
    category: str = "general",
    actor=None,
) -> OrganizationConfig:
    """Create or update a config entry for an organization."""
    from app.modules.super_admin.activity_service import diff

    entry, old_value, _was_new = _upsert_config(db, organization_id, key, value, description, category)
    _record_setting(db, "settings.updated", actor, organization_id, key=entry.key,
                    changes=diff({entry.key: old_value}, {entry.key: entry.value}))
    return entry


def bulk_set_configs(
    db: Session,
    organization_id: int,
    configs: List[Dict[str, Any]],
    actor=None,
) -> List[OrganizationConfig]:
    """Create or update multiple config entries at once; ONE grouped activity event."""
    from app.modules.super_admin.activity_service import diff

    results, changes = [], []
    for cfg in configs:
        entry, old_value, _was_new = _upsert_config(
            db,
            organization_id,
            key=cfg["key"],
            value=cfg.get("value"),
            description=cfg.get("description"),
            category=cfg.get("category", "general"),
        )
        changes.extend(diff({entry.key: old_value}, {entry.key: entry.value}))
        results.append(entry)
    if results:
        _record_setting(db, "settings.bulk_updated", actor, organization_id, changes=changes,
                        details={"keys_updated": len(results)})
    return results


def delete_config(db: Session, organization_id: int, key: str, actor=None) -> bool:
    """Delete a config entry. Returns True if deleted, False if not found."""
    from app.modules.super_admin.activity_service import diff

    entry = get_config(db, organization_id, key)
    if not entry:
        return False
    entry_key, old_value = entry.key, entry.value
    db.delete(entry)
    db.commit()
    _record_setting(db, "settings.deleted", actor, organization_id, key=entry_key,
                    changes=diff({entry_key: old_value}, {entry_key: None}))
    return True


def reset_to_defaults(db: Session, organization_id: int, actor=None) -> int:
    """Delete all custom config for an organization, reverting to defaults.
    Returns the number of entries deleted."""
    count = db.query(OrganizationConfig).filter(
        OrganizationConfig.organization_id == organization_id,
    ).delete()
    db.commit()
    if count:
        _record_setting(db, "settings.reset", actor, organization_id, details={"entries_removed": count})
    return count
