"""Outbound webhook delivery: HMAC signing, retries with backoff, auto-disable."""

import hashlib
import hmac
import json
import logging
import secrets
import time
import uuid
from datetime import datetime, timedelta
from typing import Optional

import httpx
from sqlalchemy.orm import Session

from app.core.crypto import decrypt_secret, encrypt_secret
from app.modules.integrations.models import Webhook, WebhookDelivery
from app.modules.integrations.ssrf import UnsafeURL, validate_webhook_url

logger = logging.getLogger("zoiko.integrations")

MAX_ATTEMPTS = 5
BACKOFF_SECONDS = [30, 120, 600, 3600]  # wait before attempt 2..5
AUTO_DISABLE_AFTER = 10  # consecutive failed attempts
HTTP_TIMEOUT = 10.0
BODY_EXCERPT = 1000


def new_secret() -> str:
    return "whsec_" + secrets.token_urlsafe(32)


def set_secret(webhook: Webhook, secret: str) -> None:
    webhook.secret_encrypted = encrypt_secret(secret)
    webhook.secret_hint = secret[-4:]


def sign(secret: str, timestamp: str, body: str) -> str:
    mac = hmac.new(secret.encode("utf-8"), f"{timestamp}.{body}".encode("utf-8"), hashlib.sha256)
    return "v1=" + mac.hexdigest()


def backoff_for(attempt_just_failed: int) -> Optional[timedelta]:
    """Delay before the next attempt, or None when attempts are exhausted."""
    if attempt_just_failed >= MAX_ATTEMPTS:
        return None
    return timedelta(seconds=BACKOFF_SECONDS[attempt_just_failed - 1])


def attempt_delivery(db: Session, delivery: WebhookDelivery, transport=None, now: Optional[datetime] = None) -> WebhookDelivery:
    """Make one signed POST attempt and record the outcome. Commits."""
    now = now or datetime.utcnow()
    wh = delivery.webhook
    secret = decrypt_secret(wh.secret_encrypted) or ""
    body = json.dumps(delivery.payload, separators=(",", ":"), sort_keys=True)
    ts = str(int(now.timestamp()))
    headers = {
        "Content-Type": "application/json",
        "User-Agent": "Zoiko-Webhooks/1.0",
        "X-Zoiko-Event": delivery.event_type,
        "X-Zoiko-Delivery": str(delivery.id),
        "X-Zoiko-Timestamp": ts,
        "X-Zoiko-Signature": sign(secret, ts, body),
    }
    delivery.attempt = (delivery.attempt or 0) + 1
    delivery.last_attempt_at = now
    ok, status_code, excerpt, error = False, None, None, None
    started = time.monotonic()
    try:
        validate_webhook_url(wh.url)
        with httpx.Client(timeout=HTTP_TIMEOUT, transport=transport, follow_redirects=False) as c:
            r = c.post(wh.url, content=body, headers=headers)
        status_code = r.status_code
        excerpt = (r.text or "")[:BODY_EXCERPT]
        ok = 200 <= r.status_code < 300
        if not ok:
            error = f"HTTP {r.status_code}"
    except UnsafeURL as e:
        error = f"Blocked: {e}"
    except httpx.HTTPError as e:
        error = f"{type(e).__name__}: {str(e)[:200]}"
    delivery.duration_ms = int((time.monotonic() - started) * 1000)
    delivery.response_status = status_code
    delivery.response_body = excerpt
    delivery.error = None if ok else error

    wh.last_delivery_at = now
    if ok:
        delivery.status = "success"
        delivery.next_attempt_at = None
        wh.last_delivery_status = "success"
        wh.consecutive_failures = 0
    else:
        wh.last_delivery_status = "failed"
        wh.consecutive_failures = (wh.consecutive_failures or 0) + 1
        wh.total_failures = (wh.total_failures or 0) + 1
        wait = backoff_for(delivery.attempt)
        if wait is None:
            delivery.status = "failed"
            delivery.next_attempt_at = None
        else:
            delivery.status = "pending"
            delivery.next_attempt_at = now + wait
        if wh.consecutive_failures >= AUTO_DISABLE_AFTER and wh.is_active:
            wh.is_active = False
            wh.auto_disabled = True
            logger.warning("Webhook %s auto-disabled after %s consecutive failures", wh.id, wh.consecutive_failures)
    db.commit()
    return delivery


def enqueue_test(db: Session, wh: Webhook) -> WebhookDelivery:
    now = datetime.utcnow()
    event_id = uuid.uuid4().hex
    d = WebhookDelivery(
        webhook_id=wh.id, event_id=event_id, event_type="webhook.test",
        payload={"id": event_id, "type": "webhook.test", "created_at": now.isoformat() + "Z",
                 "data": {"message": "This is a test event from Zoiko HR."}},
        status="pending", attempt=0, next_attempt_at=None,
    )
    db.add(d)
    db.flush()
    return d


def process_due_deliveries(db: Session, now: Optional[datetime] = None, transport=None, limit: int = 50) -> int:
    now = now or datetime.utcnow()
    due = (
        db.query(WebhookDelivery)
        .join(Webhook, Webhook.id == WebhookDelivery.webhook_id)
        .filter(WebhookDelivery.status == "pending",
                WebhookDelivery.next_attempt_at.isnot(None),
                WebhookDelivery.next_attempt_at <= now,
                Webhook.is_active.is_(True))
        .order_by(WebhookDelivery.next_attempt_at)
        .limit(limit)
        .all()
    )
    for d in due:
        try:
            attempt_delivery(db, d, transport=transport, now=now)
        except Exception:
            db.rollback()
            logger.exception("delivery %s crashed", d.id)
    return len(due)
