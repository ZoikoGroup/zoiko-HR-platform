"""
modules/hr/org_config_router.py
--------------------------------
HTTP endpoints for per-organization configuration management.

  GET    /hr/config                  → List all config entries
  GET    /hr/config/{key}            → Get a single config value
  PUT    /hr/config/{key}            → Set/update a config value
  DELETE /hr/config/{key}            → Delete a config entry
  PUT    /hr/config/bulk             → Bulk update config entries
  POST   /hr/config/reset            → Reset all config to defaults
  GET    /hr/config/defaults         → List default config values
"""

from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.core.dependencies import get_current_user, get_current_org_admin
from app.modules.hr import org_config_service
from app.modules.hr.schemas import (
    OrgConfigCreate, OrgConfigUpdate, OrgConfigResponse, OrgConfigBulkUpdate,
    SuccessResponse,
)

org_config_router = APIRouter(prefix="/config", tags=["Organization Config"])


@org_config_router.get("", response_model=list[OrgConfigResponse], summary="List all config entries for my organization")
def list_configs(
    category: Optional[str] = Query(None, description="Filter by category"),
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    if current_user.organization_id is None:
        return []
    return org_config_service.get_all_configs(db, current_user.organization_id, category=category)


@org_config_router.get("/defaults", summary="List default config values")
def list_defaults(
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    return {"defaults": org_config_service.DEFAULTS}


@org_config_router.get("/{key}", summary="Get a config value by key")
def get_config(
    key: str,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    if current_user.organization_id is None:
        return {"key": key, "value": org_config_service.DEFAULTS.get(key, ""), "source": "default"}
    value = org_config_service.get_config_value_or_default(db, current_user.organization_id, key)
    entry = org_config_service.get_config(db, current_user.organization_id, key)
    return {
        "key": key,
        "value": value,
        "source": "custom" if entry else "default",
        "category": entry.category if entry else "general",
    }


@org_config_router.put("/bulk", response_model=list[OrgConfigResponse], summary="Bulk update config entries")
def bulk_update(
    data: OrgConfigBulkUpdate,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_org_admin),
):
    configs = [cfg.model_dump() for cfg in data.configs]
    return org_config_service.bulk_set_configs(db, current_user.organization_id, configs)


@org_config_router.put("/{key}", response_model=OrgConfigResponse, summary="Set or update a config value")
def set_config(
    key: str,
    data: OrgConfigUpdate,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_org_admin),
):
    return org_config_service.set_config(
        db,
        current_user.organization_id,
        key=key,
        value=data.value,
        description=data.description,
        category=data.category or "general",
    )


@org_config_router.delete("/{key}", response_model=SuccessResponse, summary="Delete a config entry")
def delete_config(
    key: str,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_org_admin),
):
    deleted = org_config_service.delete_config(db, current_user.organization_id, key)
    if not deleted:
        return {"message": f"Config key '{key}' not found."}
    return {"message": f"Config key '{key}' deleted."}


@org_config_router.post("/reset", response_model=SuccessResponse, summary="Reset all config to defaults")
def reset_configs(
    db: Session = Depends(get_db),
    current_user=Depends(get_current_org_admin),
):
    count = org_config_service.reset_to_defaults(db, current_user.organization_id)
    return {"message": f"Reset {count} config entries to defaults."}
