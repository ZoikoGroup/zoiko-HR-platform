"""Time zones for attendance. Instants are stored as naive UTC (the platform convention); the work date and the
wall-clock times people see come from the employee's time zone, else the organization's, else UTC.

Durations are always computed between UTC instants, so a day with a daylight-saving change is 23 or 25 hours long
and nothing is double counted.
"""
from datetime import date, datetime, timezone
from typing import Optional
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

UTC = ZoneInfo("UTC")


def zone(name: Optional[str]) -> Optional[ZoneInfo]:
    if not name:
        return None
    try:
        return ZoneInfo(str(name).strip())
    except (ZoneInfoNotFoundError, ValueError):
        return None


def tz_for(employee=None, organization=None) -> ZoneInfo:
    """The employee's own time zone, else the organization's, else UTC."""
    return (zone(getattr(employee, "timezone", None)) or zone(getattr(organization, "timezone", None)) or UTC)


def utcnow() -> datetime:
    """Now, as naive UTC (how timestamps are stored)."""
    return datetime.now(timezone.utc).replace(tzinfo=None)


def to_local(utc_naive: Optional[datetime], tz: ZoneInfo) -> Optional[datetime]:
    """A stored UTC instant as naive local wall-clock time in `tz`."""
    if utc_naive is None:
        return None
    return utc_naive.replace(tzinfo=timezone.utc).astimezone(tz).replace(tzinfo=None)


def to_utc(local_naive: Optional[datetime], tz: ZoneInfo) -> Optional[datetime]:
    """A local wall-clock time in `tz` as naive UTC. An ambiguous time (clocks going back) is read as the first
    occurrence; a time that does not exist (clocks going forward) is moved past the gap, as zoneinfo does."""
    if local_naive is None:
        return None
    return local_naive.replace(tzinfo=tz, fold=0).astimezone(timezone.utc).replace(tzinfo=None)


def work_date_for(utc_naive: datetime, tz: ZoneInfo) -> date:
    """The calendar day a punch belongs to: the local date of that instant."""
    return to_local(utc_naive, tz).date()


def local_today(tz: ZoneInfo, now_utc: Optional[datetime] = None) -> date:
    return work_date_for(now_utc or utcnow(), tz)


def iso_utc(utc_naive: Optional[datetime]) -> Optional[str]:
    """For API responses: an explicit UTC instant ("2026-11-20T03:35:00Z")."""
    return utc_naive.replace(microsecond=0).isoformat() + "Z" if utc_naive else None


def parse_hhmm(value: Optional[str]):
    """'09:30' -> (9, 30); None when missing or malformed."""
    try:
        h, m = str(value).strip().split(":")[:2]
        h, m = int(h), int(m)
        return (h, m) if 0 <= h < 24 and 0 <= m < 60 else None
    except (ValueError, AttributeError):
        return None
