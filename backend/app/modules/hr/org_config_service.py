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


def set_config(
    db: Session,
    organization_id: int,
    key: str,
    value: Optional[str] = None,
    description: Optional[str] = None,
    category: str = "general",
) -> OrganizationConfig:
    """Create or update a config entry for an organization."""
    if not key or not key.strip():
        raise BadRequestException("Config key cannot be empty.")

    key = key.strip()

    existing = get_config(db, organization_id, key)
    if existing:
        if value is not None:
            existing.value = value
        if description is not None:
            existing.description = description
        if category:
            existing.category = category
        db.commit()
        db.refresh(existing)
        return existing

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
    return entry


def bulk_set_configs(
    db: Session,
    organization_id: int,
    configs: List[Dict[str, Any]],
) -> List[OrganizationConfig]:
    """Create or update multiple config entries at once."""
    results = []
    for cfg in configs:
        entry = set_config(
            db,
            organization_id,
            key=cfg["key"],
            value=cfg.get("value"),
            description=cfg.get("description"),
            category=cfg.get("category", "general"),
        )
        results.append(entry)
    return results


def delete_config(db: Session, organization_id: int, key: str) -> bool:
    """Delete a config entry. Returns True if deleted, False if not found."""
    entry = get_config(db, organization_id, key)
    if not entry:
        return False
    db.delete(entry)
    db.commit()
    return True


def reset_to_defaults(db: Session, organization_id: int) -> int:
    """Delete all custom config for an organization, reverting to defaults.
    Returns the number of entries deleted."""
    count = db.query(OrganizationConfig).filter(
        OrganizationConfig.organization_id == organization_id,
    ).delete()
    db.commit()
    return count
