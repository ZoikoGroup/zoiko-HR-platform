"""Zoiko Connect: Slack and Twilio channel config, validation, status and sending.

Config is one encrypted JSON blob per channel (core.crypto). Secrets are never
returned in full or logged; provider calls use httpx (no vendor SDKs)."""

import json
import re
from datetime import datetime
from typing import Optional

import httpx
from sqlalchemy.orm import Session

from app.core.crypto import decrypt_secret, encrypt_secret
from app.core.exceptions import BadRequestException, ZoikoException
from app.modules.integrations.models import ConnectChannel

SLACK_URL_RE = re.compile(r"^https://hooks\.slack\.com/services/[A-Za-z0-9_-]+/[A-Za-z0-9_-]+/[A-Za-z0-9_-]+$")
E164_RE = re.compile(r"^\+[1-9]\d{6,14}$")
TWILIO_SID_RE = re.compile(r"^AC[0-9a-fA-F]{32}$")
TWILIO_MSG_SID_RE = re.compile(r"^MG[0-9a-fA-F]{32}$")

# field -> is_secret
FIELDS = {
    "slack": {"webhook_url": True, "channel_label": False},
    "twilio": {"account_sid": False, "auth_token": True, "from_number": False, "messaging_service_sid": False},
}
CHANNEL_NAMES = {"slack": "Slack Notifications", "twilio": "Twilio SMS Gateway"}
HTTP_TIMEOUT = 10.0


def mask(value: Optional[str]) -> Optional[str]:
    if not value:
        return None
    return "••••" + value[-4:]


def _load(row: ConnectChannel) -> dict:
    raw = decrypt_secret(row.config_encrypted)
    try:
        return json.loads(raw) if raw else {}
    except ValueError:
        return {}


def get_config(db: Session, channel: str) -> Optional[dict]:
    row = db.query(ConnectChannel).filter(ConnectChannel.channel == channel).first()
    return _load(row) if row else None


def validate_config(channel: str, cfg: dict) -> dict:
    """Validate a full (merged) config; return the cleaned dict or raise 400."""
    if channel == "slack":
        url = (cfg.get("webhook_url") or "").strip()
        if not SLACK_URL_RE.match(url):
            raise BadRequestException("Slack webhook URL must look like https://hooks.slack.com/services/T…/B…/….")
        return {"webhook_url": url, "channel_label": (cfg.get("channel_label") or "").strip()[:80]}
    sid = (cfg.get("account_sid") or "").strip()
    token = (cfg.get("auth_token") or "").strip()
    from_number = (cfg.get("from_number") or "").strip()
    msg_sid = (cfg.get("messaging_service_sid") or "").strip()
    if not TWILIO_SID_RE.match(sid):
        raise BadRequestException("Twilio Account SID must start with AC followed by 32 hex characters.")
    if len(token) < 16:
        raise BadRequestException("Twilio Auth Token is required.")
    if not from_number and not msg_sid:
        raise BadRequestException("Provide a sender number or a Messaging Service SID.")
    if from_number and not E164_RE.match(from_number):
        raise BadRequestException("Sender number must be in E.164 format, e.g. +14155552671.")
    if msg_sid and not TWILIO_MSG_SID_RE.match(msg_sid):
        raise BadRequestException("Messaging Service SID must start with MG followed by 32 hex characters.")
    return {"account_sid": sid, "auth_token": token, "from_number": from_number, "messaging_service_sid": msg_sid}


def save_config(db: Session, channel: str, incoming: dict, actor_id: Optional[int]) -> ConnectChannel:
    """Blank/missing fields keep the current value (so secrets are never re-sent)."""
    if channel not in FIELDS:
        raise BadRequestException("Unknown channel.")
    row = db.query(ConnectChannel).filter(ConnectChannel.channel == channel).first()
    merged = dict(_load(row)) if row else {}
    for field in FIELDS[channel]:
        value = incoming.get(field)
        if value is not None and str(value).strip() != "":
            merged[field] = str(value).strip()
    clean = validate_config(channel, merged)
    blob = encrypt_secret(json.dumps(clean))
    if row is None:
        row = ConnectChannel(channel=channel, config_encrypted=blob)
        db.add(row)
    else:
        row.config_encrypted = blob
    # New credentials invalidate the previous test result.
    row.last_tested_at = None
    row.last_test_result = None
    row.last_error = None
    row.updated_by = actor_id
    db.flush()
    return row


def compute_status(row: Optional[ConnectChannel]) -> str:
    if row is None:
        return "Not configured"
    if row.last_test_result == "success":
        return "Connected"
    if row.last_test_result == "failure":
        return "Error"
    return "Configured (untested)"


def channel_view(channel: str, row: Optional[ConnectChannel]) -> dict:
    cfg = _load(row) if row else {}
    details = {}
    for field, secret in FIELDS[channel].items():
        if cfg.get(field):
            details[field] = mask(cfg[field]) if secret else cfg[field]
    return {
        "key": channel,
        "name": CHANNEL_NAMES[channel],
        "status": compute_status(row),
        "details": details,
        "last_tested_at": row.last_tested_at.isoformat() + "Z" if row and row.last_tested_at else None,
        "last_error": row.last_error if row else None,
        "editable": True,
    }


def smtp_view(db: Session) -> dict:
    """Read-only email channel: status from real SMTP settings + delivery log."""
    from app.services.email_service import _get_smtp_settings
    from app.modules.super_admin.models import EmailDeliveryLog

    smtp = _get_smtp_settings(db=db)
    configured = bool(smtp.get("host") and smtp.get("username") and smtp.get("password"))
    last = db.query(EmailDeliveryLog).order_by(EmailDeliveryLog.id.desc()).first()
    if not configured:
        status, err = "Not configured", None
    elif last is None:
        status, err = "Configured (untested)", None
    elif last.status == "sent":
        status, err = "Connected", None
    else:
        status, err = "Error", last.error_message
    return {
        "key": "smtp",
        "name": "SMTP Email Server",
        "status": status,
        "details": {"host": smtp.get("host"), "port": str(smtp.get("port")), "from": smtp.get("from_email")} if configured else {},
        "last_tested_at": last.sent_at.isoformat() + "Z" if last is not None and last.sent_at else None,
        "last_error": err,
        "editable": False,
        "note": "Configured through server environment variables (SMTP_*).",
    }


def _provider_error(status: int, message: str) -> ZoikoException:
    code = 400 if 400 <= status < 500 else 502
    return ZoikoException(code, "CHANNEL_PROVIDER_ERROR", message)


def send_slack(cfg: dict, text: str, transport=None) -> None:
    try:
        with httpx.Client(timeout=HTTP_TIMEOUT, transport=transport, follow_redirects=False) as c:
            r = c.post(cfg["webhook_url"], json={"text": text})
    except httpx.HTTPError as e:
        raise ZoikoException(502, "CHANNEL_UNREACHABLE", f"Could not reach Slack: {type(e).__name__}")
    if r.status_code != 200:
        body = (r.text or "").strip()[:200]
        hint = {"invalid_token": "Invalid webhook", "no_service": "Webhook is disabled or was revoked",
                "channel_not_found": "Channel not found", "channel_is_archived": "Channel is archived"}.get(body, body)
        raise _provider_error(r.status_code, f"Slack rejected the message: {hint or r.status_code}")


def send_sms(cfg: dict, to: str, text: str, transport=None) -> None:
    if not E164_RE.match(to or ""):
        raise BadRequestException("Recipient must be a phone number in E.164 format, e.g. +14155552671.")
    data = {"To": to, "Body": text[:1500]}
    if cfg.get("messaging_service_sid"):
        data["MessagingServiceSid"] = cfg["messaging_service_sid"]
    else:
        data["From"] = cfg["from_number"]
    url = f"https://api.twilio.com/2010-04-01/Accounts/{cfg['account_sid']}/Messages.json"
    try:
        with httpx.Client(timeout=HTTP_TIMEOUT, transport=transport, follow_redirects=False) as c:
            r = c.post(url, data=data, auth=(cfg["account_sid"], cfg["auth_token"]))
    except httpx.HTTPError as e:
        raise ZoikoException(502, "CHANNEL_UNREACHABLE", f"Could not reach Twilio: {type(e).__name__}")
    if r.status_code in (200, 201):
        return
    try:
        body = r.json()
        msg = body.get("message") or "Unknown error"
        code = body.get("code")
    except ValueError:
        msg, code = "Unknown error", None
    if r.status_code == 401:
        msg = "Invalid Twilio Account SID or Auth Token"
    raise _provider_error(r.status_code, f"Twilio error{f' {code}' if code else ''}: {msg}")


def send_test(db: Session, channel: str, to: Optional[str], message: Optional[str], transport=None) -> str:
    """Send a test message, persist the outcome, return a success message.
    Raises the provider's readable error (after recording it) on failure."""
    row = db.query(ConnectChannel).filter(ConnectChannel.channel == channel).first()
    if row is None:
        raise BadRequestException("This channel is not configured yet.")
    cfg = _load(row)
    text = (message or "").strip() or "Test message from Zoiko HR (Zoiko Connect)."
    try:
        if channel == "slack":
            send_slack(cfg, text, transport)
        else:
            send_sms(cfg, (to or "").strip(), text, transport)
    except ZoikoException as e:
        if e.error_code != "BAD_REQUEST":
            row.last_tested_at = datetime.utcnow()
            row.last_test_result = "failure"
            row.last_error = e.message[:500]
            db.flush()
        raise
    row.last_tested_at = datetime.utcnow()
    row.last_test_result = "success"
    row.last_error = None
    db.flush()
    return "Test message sent to Slack." if channel == "slack" else f"Test SMS sent to {to}."


def deliver(db: Session, channel: str, to: Optional[str], text: str, transport=None) -> None:
    """Send a real (non-test) message using the saved config; used by workflow steps."""
    cfg = get_config(db, channel)
    if cfg is None:
        raise BadRequestException(f"{CHANNEL_NAMES[channel]} is not configured.")
    if channel == "slack":
        send_slack(cfg, text, transport)
    else:
        send_sms(cfg, to or "", text, transport)
