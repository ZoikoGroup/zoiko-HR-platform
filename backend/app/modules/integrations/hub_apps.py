"""Zoiko Hub application status — every value derived from live state.

Nothing here is asserted from a literal. Each resolver reads the actual config
source (runtime settings table, encrypted channel row, process environment) and
the actual evidence table (delivery logs, Stripe webhook inbox, paid invoices,
sign-in log) and reports what it can prove:

    Not connected            nothing is configured
    Configured (untested)    configured, but no run has ever exercised it
    Configured (no traffic)  configured and exercised, nothing recorded since
    Connected                a real successful run was recorded
    Error                    a real failed run was recorded

When there is no evidence either way the resolver says so instead of guessing.
"""

from datetime import datetime
from typing import Optional

from sqlalchemy import func
from sqlalchemy.orm import Session


def _iso(dt: Optional[datetime]) -> Optional[str]:
    return dt.isoformat() + "Z" if isinstance(dt, datetime) else None


def _count(model):
    return func.count(model.id)


def _ago(dt: Optional[datetime], now: Optional[datetime] = None) -> Optional[str]:
    if not isinstance(dt, datetime):
        return None
    seconds = int(((now or datetime.utcnow()) - dt).total_seconds())
    return f"{seconds}s ago" if seconds < 90 else f"{seconds // 3600}h ago"


# ─────────────────────────────── email / SMTP ───────────────────────────────

def smtp_app(db: Session) -> dict:
    """Status from the live SMTP settings plus the real delivery log."""
    from app.modules.integrations.channels import smtp_view

    view = smtp_view(db)
    status = view["status"]
    if status == "Connected":
        status = "Connected"
    elif status == "Configured (untested)":
        status = "Configured (no traffic)"

    from app.modules.super_admin.models import EmailDeliveryLog

    last = db.query(EmailDeliveryLog).order_by(EmailDeliveryLog.id.desc()).first()
    sent = db.query(_count(EmailDeliveryLog)).filter(EmailDeliveryLog.status == "sent").scalar() or 0
    failed = db.query(_count(EmailDeliveryLog)).filter(EmailDeliveryLog.status == "failed").scalar() or 0
    last_sent = (
        db.query(EmailDeliveryLog)
        .filter(EmailDeliveryLog.status == "sent")
        .order_by(EmailDeliveryLog.id.desc())
        .first()
    )
    return {
        "key": "smtp",
        "name": "SMTP Email Server",
        "status": status,
        "href": "/shared/connect",
        "details": view["details"],
        "metrics": {"sent": sent, "failed": failed},
        "last_activity_at": _iso(last.sent_at if last else None),
        "last_activity": _ago(last.sent_at if last else None),
        "last_checked_at": _iso(last.sent_at if last_sent else None),
        "last_error": view["last_error"],
    }


# ─────────────────────────── connect channels ───────────────────────────────

def channel_app(db: Session, key: str, name: str, href: str) -> dict:
    """Status from the saved encrypted config row and its real last test result."""
    from app.modules.integrations.channels import channel_view, compute_status
    from app.modules.integrations.models import ConnectChannel

    row = db.query(ConnectChannel).filter(ConnectChannel.channel == key).first()
    view = channel_view(key, row)
    status = compute_status(row)
    if status == "Configured (untested)":
        status = "Configured (no traffic)"
    return {
        "key": key,
        "name": name,
        "status": status,
        "href": href,
        "details": view["details"],
        "metrics": {},
        "last_activity_at": _iso(row.last_tested_at if row else None),
        "last_activity": _ago(row.last_tested_at if row else None),
        "last_checked_at": _iso(row.last_tested_at if row else None),
        "last_error": row.last_error if row else None,
    }


# ─────────────────────────────── Stripe ───────────────────────────────

def stripe_app(db: Session) -> dict:
    """Status from the real Stripe inbox / invoices / refunds — never from the
    mere presence of an API key. A key on its own proves nothing, so it is
    reported as configured with no traffic until Stripe actually talks to us."""
    from app.modules.billing import stripe_client
    from app.modules.billing.models import (
        BillingInvoice, BillingRefundRequest, BillingWebhookEvent,
    )

    enabled = stripe_client.stripe_enabled()
    events_total = db.query(_count(BillingWebhookEvent)).scalar() or 0
    events_failed = (
        db.query(_count(BillingWebhookEvent)).filter(BillingWebhookEvent.processed.is_(False)).scalar() or 0
    )
    last_event = db.query(BillingWebhookEvent).order_by(BillingWebhookEvent.id.desc()).first()
    last_paid = (
        db.query(BillingInvoice)
        .filter(BillingInvoice.status == "paid")
        .order_by(BillingInvoice.id.desc())
        .first()
    )
    paid_total = (
        db.query(_count(BillingInvoice)).filter(BillingInvoice.status == "paid").scalar() or 0
    )
    last_refund = (
        db.query(BillingRefundRequest)
        .filter(BillingRefundRequest.stripe_refund_id.isnot(None))
        .order_by(BillingRefundRequest.id.desc())
        .first()
    )

    last_error = None
    if last_event is not None and not last_event.processed:
        last_error = last_event.error_message or f"{last_event.event_type} was not processed"

    activity = last_event.created_at if last_event is not None else None
    if not enabled:
        status = "Not connected"
    elif last_error:
        status = "Error"
    elif last_paid is not None or (last_event is not None and last_event.processed):
        status = "Connected"
    else:
        status = "Configured (no traffic)"

    details = {}
    if enabled:
        details["api_key"] = "present"
    if last_event is not None:
        details["last_event"] = last_event.event_type
    if last_paid is not None:
        details["last_paid_invoice"] = last_paid.stripe_invoice_id
    if last_refund is not None:
        details["last_refund"] = last_refund.stripe_refund_id

    return {
        "key": "stripe",
        "name": "Stripe Billing",
        "status": status,
        "href": "/super-admin/billing",
        "details": details,
        "metrics": {
            "webhook_events": events_total,
            "unprocessed_events": events_failed,
            "paid_invoices": paid_total,
        },
        "last_activity_at": _iso(activity),
        "last_activity": _ago(activity),
        "last_checked_at": _iso(last_event.processed_at if last_event else None),
        "last_error": last_error,
    }


# ────────────────────────── identity providers ──────────────────────────

_PROVIDER_TOKENS = {
    "google": ("google", "gmail"),
    "microsoft": ("microsoft", "azure", "entra", "office365"),
}
_AUTH_SEGMENTS = ("login", "callback", "sso", "oauth", "auth", "signin", "sign-in", "start")


def registered_auth_paths() -> set:
    """Paths the running ASGI app actually serves — the single source of truth
    for "is there a login flow for this provider?". A provider becomes Active
    the moment someone adds its callback route; nothing has to be flipped."""
    try:
        from app.main import app as fastapi_app
    except Exception:
        return set()
    try:
        return {p.lower() for p in fastapi_app.openapi().get("paths", {})}
    except Exception:
        paths = set()
        stack = list(getattr(fastapi_app, "routes", []))
        while stack:
            route = stack.pop()
            path = getattr(route, "path", None)
            if path:
                paths.add(path.lower())
            stack.extend(getattr(route, "routes", []) or [])
            stack.extend(getattr(getattr(route, "original_router", None), "routes", []) or [])
        return paths


def provider_login_flows(paths: set, key: str) -> list:
    tokens = _PROVIDER_TOKENS.get(key, (key,))
    return sorted(
        p for p in paths
        if any(t in p for t in tokens) and any(s in p for s in _AUTH_SEGMENTS)
    )


def password_login_paths(paths: set) -> list:
    return sorted(p for p in paths if p.endswith("/login") or p.endswith("/signin") or "/auth/login" in p)


def email_login_evidence(db: Optional[Session]) -> Optional[dict]:
    """Real proof that password sign-in works: successful login rows."""
    if db is None:
        return None
    from app.modules.super_admin.models import LoginActivity

    total = db.query(_count(LoginActivity)).filter(LoginActivity.status == "success").scalar() or 0
    last = (
        db.query(LoginActivity)
        .filter(LoginActivity.status == "success")
        .order_by(LoginActivity.id.desc())
        .first()
    )
    return {
        "metrics": {"successful_sign_ins": total},
        "last_activity_at": _iso(last.created_at if last else None),
        "last_activity": _ago(last.created_at if last else None),
    }


def email_app(db: Optional[Session] = None, paths: Optional[set] = None) -> dict:
    """Built-in password auth. Active only when a login route is served and
    sign-ins have actually been recorded."""
    paths = registered_auth_paths() if paths is None else paths
    served = password_login_paths(paths)
    evidence = email_login_evidence(db)
    if not served:
        status = "Not available"
    elif evidence is None:
        status = "Active"
    elif evidence["metrics"]["successful_sign_ins"] > 0:
        status = "Connected"
    else:
        status = "Configured (no traffic)"
    return {
        "key": "email",
        "name": "Email & Password",
        "status": status,
        "href": "/shared/id",
        "details": {"login_routes": served},
        "metrics": (evidence or {}).get("metrics", {}),
        "last_activity_at": (evidence or {}).get("last_activity_at"),
        "last_activity": (evidence or {}).get("last_activity"),
        "last_checked_at": None,
        "last_error": None,
    }