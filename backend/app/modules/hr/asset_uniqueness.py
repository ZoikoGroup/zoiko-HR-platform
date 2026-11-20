"""Asset tags and asset category names are unique within one organization, never across organizations.

The database enforces it with partial unique indexes (see models.Asset / models.AssetCategory and migration
e2f3a4b5c6d7): (organization_id, asset_tag) among assets that are not deleted, and (organization_id, lower(name)) for
categories. These checks give the friendly 409 first; commit_or_conflict() turns a race that slips past them into the same
409 instead of a 500. Messages never name or hint at another organization's values.
"""
from __future__ import annotations

from typing import Optional

from sqlalchemy import func
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.exceptions import ZoikoException
from app.modules.hr.models import Asset, AssetCategory

ASSET_TAG_INDEX = "uq_assets_org_asset_tag"
CATEGORY_NAME_INDEX = "uq_asset_categories_org_lower_name"

TAG_EXISTS_MESSAGE = "An asset with this tag already exists in this organization."
CATEGORY_EXISTS_MESSAGE = "An asset category with this name already exists in this organization."


def _conflict(message: str) -> ZoikoException:
    return ZoikoException(status_code=409, error_code="ALREADY_EXISTS", message=message)


def tag_conflict(db: Session, organization_id: Optional[int], asset_tag: str, *, exclude_id: Optional[int] = None) -> None:
    query = db.query(Asset.id).filter(Asset.organization_id == organization_id, Asset.asset_tag == asset_tag,
                                      Asset.deleted_at.is_(None))
    if exclude_id is not None:
        query = query.filter(Asset.id != exclude_id)
    if query.first():
        raise _conflict(TAG_EXISTS_MESSAGE)


def category_name_conflict(db: Session, organization_id: Optional[int], name: str, *, exclude_id: Optional[int] = None) -> None:
    query = db.query(AssetCategory.id).filter(AssetCategory.organization_id == organization_id,
                                              func.lower(AssetCategory.name) == (name or "").strip().lower())
    if exclude_id is not None:
        query = query.filter(AssetCategory.id != exclude_id)
    if query.first():
        raise _conflict(CATEGORY_EXISTS_MESSAGE)


def commit_or_conflict(db: Session) -> None:
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        text = str(getattr(exc, "orig", exc))
        if ASSET_TAG_INDEX in text or "assets.organization_id, assets.asset_tag" in text:
            raise _conflict(TAG_EXISTS_MESSAGE) from None
        if CATEGORY_NAME_INDEX in text or "asset_categories.organization_id" in text:
            raise _conflict(CATEGORY_EXISTS_MESSAGE) from None
        raise
