"""
modules/billing/catalog_service.py
----------------------------------
Phase 10 — durable governance for the Section 14 tables that previously had
model definitions but no service layer:

  feature_definition            → the durable, governable registry of every
                                  keys in FEATURE_KEYS (the frozenset in
                                  feature_keys.py stays the runtime gate;
                                  this table is the auditable description).
  commercial_catalog_version    → versioned, immutable-after-publish catalog
                                  snapshot (Section 25.1: published catalogs
                                  are never edited).
  commercial_sku                → rated catalog line. amount_cents is nullable
                                  by design and MUST stay null until pricing is
                                  approved (P0 posture: live use is forbidden
                                  when a required value is absent).

Live-use gate — a catalog is usable only when it has been published AND every
subscription SKU on it is fully priced (amount_cents NOT NULL). Publishing a
DRAFT locks it permanently; SKU/catalog mutation after publish is refused.

Non-negotiables honored here:
  - No numeric price defaults in code.
  - No silent feature-key renames (keys come from FEATURE_KEYS verbatim).
  - Mapping tables remain data-side, never auto-populated.
"""

import hashlib
import json
import logging
from datetime import datetime, timezone
from typing import Iterable

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.exceptions import BadRequestException, AlreadyExistsException, NotFoundException
from app.modules.billing.feature_keys import FEATURE_KEYS
from app.modules.billing.models import (
    CommercialCatalogStatus,
    CommercialCatalogVersion,
    CommercialSku,
    CommercialSkuType,
    FeatureDefinition,
    FeatureEnforcementMode,
    FeatureSensitivity,
    FeatureStatus,
)

logger = logging.getLogger("zoiko.billing.catalog")


def _checksum_of(version: CommercialCatalogVersion) -> str:
    """Deterministic integrity digest over version + canonical SKU rows.
    JSON keys are sorted so re-hashing the same catalog is idempotent."""
    skus = sorted(
        (
            {
                "code": s.code,
                "type": s.type,
                "interval": s.interval,
                "currency": s.currency,
                "amount_cents": s.amount_cents,
                "tax_code": s.tax_code,
                "provider_product_id": s.provider_product_id,
                "provider_price_id": s.provider_price_id,
                "is_active": s.is_active,
            }
            for s in version.skus or []
        ),
        key=lambda s: s["code"],
    )
    payload = json.dumps(
        {"version": version.version, "skus": skus},
        sort_keys=True,
        separators=(",", ":"),
    )
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


# ── feature_definition ───────────────────────────────────────────────────────

def _domain_of(feature_key: str) -> str:
    """Derive the governance domain from the stable key prefix (hr.ai.* -> ai)."""
    parts = feature_key.split(".")
    return parts[1] if len(parts) > 2 else "hr"


def sync_feature_definitions(db: Session, feature_keys: Iterable[str] | None = None) -> dict:
    """Upsert every registry key into feature_definition. Idempotent: existing
    rows keep their governance posture; only missing keys are inserted. Returns
    {inserted, updated_none, total} for the startup/CLI log."""
    target = feature_keys if feature_keys is not None else FEATURE_KEYS
    existing = {
        row.key: row
        for row in db.query(FeatureDefinition).filter(FeatureDefinition.key.in_(target)).all()
    }
    inserted = 0
    for key in sorted(target):
        if key in existing:
            continue
        db.add(FeatureDefinition(
            key=key,
            domain=_domain_of(key),
            description="Managed by billing.feature_keys registry (ZHR-COM-ENT-001 Appendix A).",
            sensitivity=FeatureSensitivity.INTERNAL,
            enforcement_mode=FeatureEnforcementMode.REPORT_ONLY,
            status=FeatureStatus.ACTIVE,
        ))
        inserted += 1
    if inserted:
        db.commit()
    logger.info("[catalog] feature_definition sync: %d inserted, %d already present.",
                inserted, len(existing))
    return {"inserted": inserted, "existing": len(existing), "total": len(target)}


def get_feature_definition(db: Session, feature_key: str) -> FeatureDefinition | None:
    return db.query(FeatureDefinition).filter(FeatureDefinition.key == feature_key).first()


# ── commercial_catalog_version ───────────────────────────────────────────────

def _get_version(db: Session, catalog_version_id: int) -> CommercialCatalogVersion:
    row = db.query(CommercialCatalogVersion).filter(
        CommercialCatalogVersion.id == catalog_version_id,
    ).first()
    if row is None:
        raise NotFoundException("CommercialCatalogVersion", catalog_version_id)
    return row


def _assert_editable(version: CommercialCatalogVersion) -> None:
    if version.status == CommercialCatalogStatus.PUBLISHED:
        raise AlreadyExistsException(
            f"Catalog version '{version.version}' is published and immutable "
            "(Section 25.1: published catalogs are never edited)."
        )
    if version.status == CommercialCatalogStatus.RETIRED:
        raise AlreadyExistsException(
            f"Catalog version '{version.version}' is retired and cannot be mutated."
        )


def ensure_plan_mutable(plan) -> None:
    """Section 17: a BillingPlan becomes published once published_at is set,
    and a published plan is append-only — refuse any field mutation rather
    than silently succeeding. No-ops for a plan that was never published."""
    if plan.is_published:
        raise AlreadyExistsException(
            f"BillingPlan '{plan.code}' was published at {plan.published_at.isoformat()} "
            "and is immutable (Section 17: append-only publication)."
        )


def create_catalog_version(db: Session, version: str, effective_from: datetime | None = None) -> CommercialCatalogVersion:
    """Create a DRAFT catalog snapshot. The live-use gate is at publish time."""
    clean = (version or "").strip()
    if not clean:
        raise BadRequestException("catalog version is required")
    existing = db.query(CommercialCatalogVersion).filter(
        CommercialCatalogVersion.version == clean,
    ).first()
    if existing is not None:
        raise AlreadyExistsException(f"Catalog version '{clean}' already exists.")
    row = CommercialCatalogVersion(
        version=clean,
        status=CommercialCatalogStatus.DRAFT,
        effective_from=effective_from,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    logger.info("[catalog] created DRAFT version %s (id=%d).", clean, row.id)
    return row


def add_sku(
    db: Session,
    catalog_version_id: int,
    code: str,
    *,
    type: CommercialSkuType = CommercialSkuType.SUBSCRIPTION,
    interval: str | None = None,
    currency: str | None = None,
    amount_cents: int | None = None,
    tax_code: str | None = None,
    provider_product_id: str | None = None,
    provider_price_id: str | None = None,
    is_active: bool = True,
) -> CommercialSku:
    """Add a rated line to a DRAFT catalog. amount_cents MAY be None (unpriced)
    while drafting — publish refuses an unpriced subscription SKU."""
    version = _get_version(db, catalog_version_id)
    _assert_editable(version)
    clean_code = (code or "").strip()
    if not clean_code:
        raise BadRequestException("sku code is required")
    sku = CommercialSku(
        catalog_version_id=version.id,
        code=clean_code,
        type=type,
        interval=interval,
        currency=currency,
        amount_cents=amount_cents,
        tax_code=tax_code,
        provider_product_id=provider_product_id,
        provider_price_id=provider_price_id,
        is_active=is_active,
    )
    db.add(sku)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise AlreadyExistsException(
            f"SKU '{clean_code}' already exists on catalog version '{version.version}'."
        )
    db.refresh(sku)
    logger.info("[catalog] added SKU %s to version %s.", clean_code, version.version)
    return sku


def publish_catalog_version(
    db: Session,
    catalog_version_id: int,
    approved_by: str | None = None,
) -> CommercialCatalogVersion:
    """Approve + publish a DRAFT catalog. Locks it forever:
      - Stores the canonical idempotent checksum for integrity auditing.
      - Refuses publication while any SUBSCRIPTION SKU is unpriced
        (amount_cents NULL → forbidden live use).
      - After publish the version is immutable."""
    version = _get_version(db, catalog_version_id)
    if version.status != CommercialCatalogStatus.DRAFT:
        raise AlreadyExistsException(
            f"Catalog version '{version.version}' is already '{version.status}'; "
            "only DRAFT catalogs can be published."
        )
    skus = version.skus or []
    subscription_skus = [s for s in skus if s.type == CommercialSkuType.SUBSCRIPTION]
    unpriced = [s for s in subscription_skus if s.amount_cents is None]
    if unpriced:
        codes = ", ".join(s.code for s in unpriced)
        raise BadRequestException(
            f"Cannot publish '{version.version}': subscription SKU(s) {codes} are "
            "unpriced (amount_cents NULL). P0 posture forbids live use of unpriced lines."
        )
    if not skus:
        raise BadRequestException(
            f"Cannot publish '{version.version}': no SKUs on the catalog."
        )
    version.status = CommercialCatalogStatus.PUBLISHED
    version.approved_by = approved_by
    version.published_at = version.published_at or datetime.now(timezone.utc)
    version.checksum = _checksum_of(version)
    db.commit()
    db.refresh(version)
    logger.info("[catalog] PUBLISHED version %s (approved_by=%s, checksum=%s).",
                version.version, approved_by, version.checksum)
    return version


def get_live_catalog_version(db: Session) -> CommercialCatalogVersion | None:
    """Most recently PUBLISHED catalog, or None when nothing is live."""
    return (
        db.query(CommercialCatalogVersion)
        .filter(CommercialCatalogVersion.status == CommercialCatalogStatus.PUBLISHED)
        .order_by(CommercialCatalogVersion.published_at.desc())
        .first()
    )


def list_skus(db: Session, catalog_version_id: int) -> list[CommercialSku]:
    version = _get_version(db, catalog_version_id)
    return sorted((version.skus or []), key=lambda s: s.code)
