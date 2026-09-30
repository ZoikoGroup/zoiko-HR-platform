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
    BillingPlan,
    CommercialCatalogStatus,
    CommercialCatalogVersion,
    CommercialSku,
    CommercialSkuType,
    FeatureDefinition,
    FeatureEnforcementMode,
    FeatureSensitivity,
    FeatureStatus,
    PlanCode,
)
from app.modules.billing.service import role_value, suggest_next_catalog_version

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


# ── BillingPlan publication (Section 17) ────────────────────────────────────
# Distinct from publish_catalog_version() above, which governs the Section 25
# commercial_catalog_version / commercial_sku snapshot. This one publishes the
# BillingPlan rows the Plans & Catalog page manages: it stamps published_at,
# which is what freezes them via ensure_plan_mutable().

def publish_billing_plans(db: Session, version: str, actor_email: str | None = None) -> list[BillingPlan]:
    """Publish every BillingPlan in `version`. Irreversible and append-only.

    Refuses rather than freezing a broken catalog: every non-contract-priced
    plan in the version must carry both prices, and inactive plans are never
    published (an unpublished/inactive line must not become customer-visible).
    """
    clean = (version or "").strip()
    if not clean:
        raise BadRequestException("catalog_version is required.")

    plans = (
        db.query(BillingPlan)
        .filter(BillingPlan.catalog_version == clean)
        .order_by(BillingPlan.id)
        .all()
    )
    if not plans:
        raise NotFoundException("BillingPlan catalog_version", clean)

    # A published version is the live catalog. The customer-facing readers
    # (catalog endpoint, registration page) serve the LATEST PUBLISHED version,
    # so a partial set would silently drop the missing plans from the storefront.
    # A new version must therefore be complete before it can become visible.
    expected = {c.value for c in PlanCode}
    present = {role_value(p.code) for p in plans}
    if present != expected:
        missing = ", ".join(sorted(expected - present))
        extra = ", ".join(sorted(present - expected)) or "none"
        raise BadRequestException(
            f"Cannot publish '{clean}': this is not a complete plan set. "
            f"Missing: {missing}. Unexpected: {extra}. Clone the current published "
            "version to get a complete draft, then re-price it."
        )

    unpriced = [
        p for p in plans
        if not p.is_contract_priced and (p.monthly_price is None or p.annual_price is None)
    ]
    if unpriced:
        detail = ", ".join(f"{role_value(p.code)} (plan #{p.id})" for p in unpriced)
        raise BadRequestException(
            f"Cannot publish '{clean}': {detail} is not contract-priced and is missing a "
            "monthly or annual price. Set both prices (or enable Contract Priced) first — "
            "publishing freezes the version forever."
        )

    inactive = [p for p in plans if not p.is_active]
    if inactive:
        detail = ", ".join(f"{role_value(p.code)} (plan #{p.id})" for p in inactive)
        raise BadRequestException(
            f"Cannot publish '{clean}': {detail} is inactive. Activate or remove it first."
        )

    now = datetime.now(timezone.utc)
    for p in plans:
        if p.published_at is None:
            p.published_at = now
    db.commit()
    for p in plans:
        db.refresh(p)

    logger.info("[catalog] PUBLISHED billing plans for version %s (%d plans, by=%s).",
                clean, len(plans), actor_email)
    return plans


def catalog_plan_to_dict(plan: BillingPlan, include_provider_ids: bool = True) -> dict:
    """Project a BillingPlan for CatalogPlanResponse.

    `include_provider_ids=False` omits the Stripe product/price ids. Required
    for any pre-auth/public route: those ids are internal provisioning detail
    and must never reach an unauthenticated caller. Matches
    CatalogPlanResponse either way — omitted fields serialise as null.

    Prices stay nullable on purpose: a plan with no approved numeric price must
    reach the client as null so the UI renders its "pricing pending" state —
    never a raw blank or NaN.
    """
    data = {
        "id": plan.id,
        "code": role_value(plan.code),
        "name": plan.name,
        "catalog_version": plan.catalog_version,
        "billing_metric": role_value(plan.billing_metric),
        "is_active": bool(plan.is_active),
        "is_contract_priced": bool(plan.is_contract_priced),
        "is_self_serve_enabled": bool(plan.is_self_serve_enabled),
        "is_published": bool(plan.is_published),
        "monthly_price": float(plan.monthly_price) if plan.monthly_price is not None else None,
        "annual_price": float(plan.annual_price) if plan.annual_price is not None else None,
        "currency": plan.currency,
        "description": plan.description,
        "tax_category": role_value(plan.tax_category),
        "published_at": plan.published_at,
        "created_at": plan.created_at,
        "updated_at": plan.updated_at,
    }
    if include_provider_ids:
        data["stripe_product_id"] = plan.stripe_product_id
        data["stripe_monthly_price_id"] = plan.stripe_monthly_price_id
        data["stripe_annual_price_id"] = plan.stripe_annual_price_id
    return data


def get_customer_visible_plans(db: Session, version: str | None = None) -> list[BillingPlan]:
    """Published AND active plans only.

    Section 17 core rule: a draft/unpublished or inactive price record is NEVER
    exposed to customers. When no version is requested, serve the newest
    published version so the storefront tracks the latest release.
    """
    q = db.query(BillingPlan).filter(
        BillingPlan.published_at.isnot(None),
        BillingPlan.is_active.is_(True),
    )
    if version:
        q = q.filter(BillingPlan.catalog_version == version)
    else:
        latest = get_latest_published_catalog_version(db)
        if latest:
            q = q.filter(BillingPlan.catalog_version == latest)
    return q.order_by(BillingPlan.id).all()


def get_latest_published_catalog_version(db: Session) -> str | None:
    """catalog_version string of the most recently published plan set."""
    row = (
        db.query(BillingPlan.catalog_version)
        .filter(BillingPlan.published_at.isnot(None))
        .order_by(BillingPlan.published_at.desc(), BillingPlan.id.desc())
        .first()
    )
    return row[0] if row else None


def clone_plan_version(db: Session, from_version: str | None = None,
                       actor: str | None = None) -> tuple[str, list[BillingPlan]]:
    """Create the next catalog version as a full DRAFT copy of `from_version`.

    Why a full copy: get_customer_visible_plans() serves only the single latest
    published version, so publishing a partial version would hide the plans it
    omits. Cloning keeps every new version a complete, self-contained set, which
    is what makes "publish a new version" safe later.

    Copies are UNPUBLISHED drafts (published_at stays NULL) and carry no Stripe
    price ids, so the new version cannot inherit a live billing commitment.
    """
    source = (from_version or "").strip() or get_latest_published_catalog_version(db)
    if not source:
        raise BadRequestException(
            "No published catalog version to clone from. Create the first plan set first."
        )

    src_plans = (
        db.query(BillingPlan)
        .filter(BillingPlan.catalog_version == source)
        .order_by(BillingPlan.id)
        .all()
    )
    if not src_plans:
        raise NotFoundException("BillingPlan catalog_version", source)

    target = suggest_next_catalog_version(db, source)
    taken = (
        db.query(BillingPlan.id)
        .filter(BillingPlan.catalog_version == target)
        .first()
    )
    if taken is not None:
        raise AlreadyExistsException(
            f"Catalog version '{target}' already has plans. Pick a free version string."
        )

    created: list[BillingPlan] = []
    for src in src_plans:
        row = BillingPlan(
            code=src.code,
            name=src.name,
            description=src.description,
            catalog_version=target,
            billing_metric=src.billing_metric,
            currency=src.currency,
            tax_category=src.tax_category,
            monthly_price=src.monthly_price,
            annual_price=src.annual_price,
            is_contract_priced=src.is_contract_priced,
            is_active=src.is_active,
            # published_at intentionally NULL: a draft.
            # Stripe ids intentionally NOT copied: a new version needs its own
            # products/prices provisioned before it can go live.
        )
        db.add(row)
        created.append(row)
    db.commit()
    for row in created:
        db.refresh(row)

    logger.info("[catalog] cloned %d plans from %s into new draft version %s (by=%s).",
                len(created), source, target, actor)
    return target, created


def reprice_plan(db: Session, code, monthly_price=None, annual_price=None,
                 publish: bool = True, catalog_version: str | None = None,
                 actor: str | None = None) -> dict:
    """Change a plan's rates and make them the live customer-facing prices.

    Published plans are append-only, so this cannot edit v1 in place — and it
    must not: subscriptions already converted onto v1 keep the rate they
    agreed to. Instead the new rate lands in the next catalog version:

      1. target the newest UNPUBLISHED version if one already exists (so repeated
         edits accumulate), else clone the latest published version in full
      2. apply the new amounts to that plan code
      3. reconcile Stripe (mints a new Price; archives the superseded one)
      4. publish, so the customer catalog and registration page pick it up

    Stripe failures do NOT block the catalog change: the rate is what customers
    see, and `has_drift` + the checkout guard keep a stale Price from ever being
    charged. The drift is reported back so the UI can flag it.
    """
    plan_code = code.value if hasattr(code, "value") else str(code)
    clean_code = plan_code.strip().lower()

    # `code` arrives as free text from POST /billing/plans/reprice, so validate it
    # here: binding an unknown value against the PlanCode-typed column raises a
    # driver-level ValueError (HTTP 500) instead of a clean 400.
    valid_codes = {c.value for c in PlanCode}
    if clean_code not in valid_codes:
        raise BadRequestException(
            f"Unknown plan code '{clean_code}'. "
            f"Valid codes: {', '.join(sorted(valid_codes))}."
        )

    # 1. pick the target version
    target = (catalog_version or "").strip()
    if target:
        existing = (
            db.query(BillingPlan)
            .filter(BillingPlan.catalog_version == target)
            .order_by(BillingPlan.id)
            .first()
        )
        if existing is None:
            raise NotFoundException("BillingPlan catalog_version", target)
        if existing.published_at is not None:
            raise BadRequestException(
                f"Catalog version '{target}' is already published and is immutable. "
                "Re-pricing would change what existing subscribers agreed to. "
                "Re-price without catalog_version to cut the next draft version."
            )
    if not target:
        draft = (
            db.query(BillingPlan)
            .filter(BillingPlan.published_at.is_(None))
            .order_by(BillingPlan.id.desc())
            .first()
        )
        if draft is not None:
            target = draft.catalog_version
        else:
            target, _rows = clone_plan_version(db, actor=actor)

    plan = (
        db.query(BillingPlan)
        .filter(BillingPlan.catalog_version == target,
                BillingPlan.code == clean_code)
        .order_by(BillingPlan.id)
        .first()
    )
    if plan is None:
        raise NotFoundException(
            f"BillingPlan code '{clean_code}' in catalog version '{target}'")

    # 2. apply the new rates
    if monthly_price is not None and float(monthly_price) < 0:
        raise BadRequestException("monthly_price cannot be negative.")
    if annual_price is not None and float(annual_price) < 0:
        raise BadRequestException("annual_price cannot be negative.")
    if not plan.is_contract_priced:
        missing = [
            label for label, val in (("monthly", monthly_price), ("annual", annual_price))
            if val is None
        ]
        if missing:
            raise BadRequestException(
                f"A self-serve plan needs both rates; missing: {', '.join(missing)}. "
                "Send both, or mark the plan Contract Priced."
            )

    before = {"monthly_price": plan.monthly_price, "annual_price": plan.annual_price}
    if monthly_price is not None:
        plan.monthly_price = monthly_price
    if annual_price is not None:
        plan.annual_price = annual_price
    db.commit()
    db.refresh(plan)

    # 3. reconcile Stripe (best effort — never silently charge a stale price)
    stripe_result, drift = {"synced": False}, None
    try:
        from app.modules.billing.stripe_sync_service import (
            has_drift, stripe_enabled, sync_plan_to_stripe)
        if stripe_enabled():
            stripe_result = sync_plan_to_stripe(db, plan)
            db.refresh(plan)
            drift = has_drift(plan)
        else:
            drift = "stripe_disabled"
    except Exception as exc:
        logger.warning("[catalog] Stripe sync failed for %s in %s: %s",
                       clean_code, target, exc)
        drift = f"stripe_error: {exc}"

    # 4. publish so the customer catalog / registration page picks it up
    published = None
    if publish:
        published = [catalog_plan_to_dict(p)
                     for p in publish_billing_plans(db, version=target,
                                                    actor_email=actor)]

    # 5. make sure EVERY self-serve plan in the new version is purchasable.
    # A cloned version carries no Stripe ids, so the unchanged siblings would
    # otherwise be published with nothing to charge. Checkout would self-heal,
    # but leaving the live catalog unsellable until a buyer arrives is wrong.
    unsynced = []
    if publish:
        try:
            from app.modules.billing.stripe_sync_service import (
                stripe_enabled, sync_plan_to_stripe)
            if stripe_enabled():
                for sibling in (
                    db.query(BillingPlan)
                    .filter(BillingPlan.catalog_version == target,
                            BillingPlan.is_contract_priced.is_(False))
                    .order_by(BillingPlan.id)
                    .all()
                ):
                    if not sibling.stripe_monthly_price_id or not sibling.stripe_annual_price_id:
                        sync_plan_to_stripe(db, sibling)
                        db.refresh(sibling)
                        unsynced.append(role_value(sibling.code))
        except Exception as exc:
            # Never fail a published catalog over a provisioning hiccup; the
            # checkout guard re-syncs on demand.
            logger.warning("[catalog] sibling Stripe sync failed for %s: %s",
                           target, exc)

    # Coerce Decimal -> float: these values are returned to the router, which
    # hands `before`/`after` to log_billing_audit, and Decimal is not JSON
    # serialisable — it would blow up the audit INSERT after the change had
    # already committed.
    def _jsonable(value):
        return float(value) if value is not None else None

    before_json = {k: _jsonable(v) for k, v in before.items()}
    after_json = {k: _jsonable(getattr(plan, k)) for k in ("monthly_price", "annual_price")}

    logger.info("[catalog] REPRICED plan=%s version=%s %s -> %s (by=%s, published=%s)",
                clean_code, target, before_json, after_json, actor, bool(publish))

    return {
        "code": clean_code,
        "catalog_version": target,
        "before": before_json,
        "after": after_json,
        "stripe": stripe_result,
        "drift": drift,
        "published": published,
        "synced_siblings": unsynced,
        "plan": catalog_plan_to_dict(plan),
    }
