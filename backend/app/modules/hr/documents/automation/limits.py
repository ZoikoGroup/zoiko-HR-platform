"""What may run, and when (ZHR-DOCS-ARCH-001 §16): global pause, organization pause, feature flags, quiet hours.

* Global pause: env HR_AUTOMATION_PAUSED=1, or the platform setting `automation.paused` = true. Runs stay queued.
* Organization pause: automation_settings.paused. Runs stay queued.
* Features: automation_settings.features[<name>]; a missing key means the feature's default (FEATURE_DEFAULTS).
* Quiet hours: email / SMS steps that fall inside the organization's quiet window wait until it ends. In-app is never held.
"""
import logging
import os
from datetime import datetime, time, timedelta, timezone
from typing import Optional

from sqlalchemy.orm import Session

from app.modules.hr.documents.automation.models import AutomationSettings

logger = logging.getLogger("zoiko.documents.automation")

FEATURES = ("onboarding", "reminders", "expiry", "payslip_publish", "sla", "prechecks", "policy_auto", "digest",
            "esign_autofile", "ocr", "offboarding", "rules_ui")
# OCR needs a binary that may not be installed; everything else is on unless an organization turns it off.
FEATURE_DEFAULTS = {name: name not in ("ocr",) for name in FEATURES}
HELD_CHANNELS = ("email", "sms")
PLATFORM_PAUSE_KEY = "automation.paused"


def globally_paused(db: Optional[Session] = None) -> bool:
    if os.environ.get("HR_AUTOMATION_PAUSED", "").strip().lower() in ("1", "true", "yes", "on"):
        return True
    if db is None:
        return False
    try:
        from app.modules.super_admin.models import PlatformSetting
        row = db.query(PlatformSetting).filter(PlatformSetting.key == PLATFORM_PAUSE_KEY).first()
        value = getattr(row, "value", None) if row else None
        return str(value).strip().lower() in ("1", "true", "yes", "on")
    except Exception:            # the setting is optional; an unreadable one does not pause anything
        return False


def org_settings(db: Session, organization_id: int) -> Optional[AutomationSettings]:
    return db.query(AutomationSettings).filter(AutomationSettings.organization_id == organization_id).first()


def feature_enabled(settings: Optional[AutomationSettings], feature: str) -> bool:
    flags = (settings.features or {}) if settings else {}
    if feature in flags:
        return bool(flags[feature])
    return FEATURE_DEFAULTS.get(feature, False)


def automation_enabled(db: Session, organization_id: int, feature: Optional[str] = None) -> bool:
    """True when automation may act for this organization now (and for `feature`, when given)."""
    if globally_paused(db):
        return False
    settings = org_settings(db, organization_id)
    if settings is not None and settings.paused:
        return False
    return feature is None or feature_enabled(settings, feature)


def _parse_hhmm(value: str) -> Optional[time]:
    try:
        hh, mm = str(value).split(":")
        return time(int(hh), int(mm))
    except (ValueError, TypeError):
        return None


def quiet_defer_until(settings: Optional[AutomationSettings], channel: str, now: Optional[datetime] = None) -> Optional[datetime]:
    """When an email/SMS sent `now` (UTC) falls inside the organization's quiet hours: the UTC time they end. Else None."""
    if channel not in HELD_CHANNELS or settings is None or not settings.quiet_hours:
        return None
    qh = settings.quiet_hours
    start, end = _parse_hhmm(qh.get("start")), _parse_hhmm(qh.get("end"))
    if start is None or end is None or start == end:
        return None
    try:
        from zoneinfo import ZoneInfo
        tz = ZoneInfo(qh.get("tz") or "UTC")
    except Exception:
        tz = timezone.utc
    now_utc = (now or datetime.utcnow()).replace(tzinfo=timezone.utc)
    local = now_utc.astimezone(tz)
    t = local.time()
    inside = (start <= t < end) if start < end else (t >= start or t < end)   # a window may cross midnight
    if not inside:
        return None
    end_local = local.replace(hour=end.hour, minute=end.minute, second=0, microsecond=0)
    if end_local <= local:
        end_local += timedelta(days=1)
    return end_local.astimezone(timezone.utc).replace(tzinfo=None)
