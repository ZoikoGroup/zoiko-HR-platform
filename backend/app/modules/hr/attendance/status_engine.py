"""The attendance status rules (attendance plan §3). Pure: no database, no clock. Callers gather a DayContext (policy,
shift, holiday, leave, the record's punches) and get back the status and the minute totals to store.

Order of precedence:
    not employed that day -> no status
    admin-locked status   -> kept as is (totals still recomputed)
    holiday               -> HOLIDAY (unless they worked: PRESENT, flagged worked_on_off_day)
    not a working day     -> WEEKLY_OFF (unless they worked: PRESENT, flagged)
    approved leave        -> ON_LEAVE (work-from-home leave: REMOTE; half-day leave with a punch: HALF_DAY)
    no punch-in           -> ABSENT once the day is closed (still open: no status yet)
    punched in, no punch-out, day closed -> MISSED_PUNCH (0 hours until a correction is approved)
    net worked < half-day threshold      -> HALF_DAY
    check-in after shift start + grace   -> LATE
    otherwise                            -> PRESENT
"""
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta
from typing import Optional

from app.modules.hr.models import AttendanceStatus as S


@dataclass(frozen=True)
class ShiftInfo:
    shift_id: Optional[int]
    name: str
    start: tuple                      # (h, m) local
    end: tuple                        # (h, m) local; earlier than start = crosses midnight
    grace_minutes: int = 0
    break_minutes: int = 60           # allowance shown to the employee (not deducted automatically)
    standard_minutes: int = 480
    half_day_min_minutes: Optional[int] = None
    working_days: Optional[tuple] = None      # ("mon", ...) or None = organization working days

    @property
    def crosses_midnight(self) -> bool:
        return self.end <= self.start

    def start_on(self, day: date) -> datetime:
        return datetime(day.year, day.month, day.day, *self.start)

    def end_on(self, day: date) -> datetime:
        end = datetime(day.year, day.month, day.day, *self.end)
        return end + timedelta(days=1) if self.crosses_midnight else end


@dataclass(frozen=True)
class LeaveInfo:
    leave_type: str
    half_day: bool = False


@dataclass
class DayContext:
    work_date: date
    employed: bool = True
    holiday: bool = False
    working_day: bool = True
    leave: Optional[LeaveInfo] = None
    shift: Optional[ShiftInfo] = None
    grace_minutes: int = 10           # used when there is no shift
    standard_minutes: int = 480       # used when there is no shift
    half_day_min_minutes: int = 240
    check_in_local: Optional[datetime] = None
    check_out_local: Optional[datetime] = None
    check_in_utc: Optional[datetime] = None
    check_out_utc: Optional[datetime] = None
    breaks_utc: list = field(default_factory=list)    # [(start, end|None)], UTC
    day_closed: bool = False          # the work day is over (the end-of-day job, or a past date)
    locked_status: Optional[S] = None # an admin-set status
    now_utc: Optional[datetime] = None  # for a running day: counts time up to now


@dataclass
class Resolution:
    status: Optional[S]
    late_minutes: int = 0
    worked_minutes: int = 0
    break_minutes: int = 0
    overtime_minutes: int = 0
    worked_on_off_day: bool = False


def _minutes(a: Optional[datetime], b: Optional[datetime]) -> int:
    if a is None or b is None or b <= a:
        return 0
    return int((b - a).total_seconds() // 60)


def compute_minutes(check_in_utc, check_out_utc, breaks_utc, now_utc=None) -> tuple[int, int]:
    """(worked_minutes net of breaks, break_minutes). A running day counts up to `now_utc`; a running break counts up
    to the check-out (or now). Breaks are clipped to the worked span and never make the total negative."""
    end = check_out_utc or now_utc
    if check_in_utc is None or end is None:
        return 0, 0
    span = _minutes(check_in_utc, end)
    taken = 0
    for start, stop in breaks_utc or []:
        s = max(start, check_in_utc)
        e = min(stop or end, end)
        taken += _minutes(s, e)
    taken = min(taken, span)
    return span - taken, taken


def resolve(ctx: DayContext) -> Resolution:
    if not ctx.employed:
        return Resolution(status=None)
    ongoing = ctx.check_out_utc is None and not ctx.day_closed
    worked, taken = compute_minutes(ctx.check_in_utc, ctx.check_out_utc, ctx.breaks_utc,
                                    now_utc=ctx.now_utc if ongoing else None)
    shift = ctx.shift
    standard = shift.standard_minutes if shift else ctx.standard_minutes
    half_min = (shift.half_day_min_minutes if shift and shift.half_day_min_minutes is not None else ctx.half_day_min_minutes)
    grace = shift.grace_minutes if shift else ctx.grace_minutes
    has_in = ctx.check_in_utc is not None
    missed_out = has_in and ctx.check_out_utc is None and ctx.day_closed
    if missed_out:
        worked, taken = 0, 0
    overtime = max(0, worked - standard) if has_in and ctx.check_out_utc is not None else 0

    late = 0
    if has_in and shift and ctx.check_in_local is not None:
        late = max(0, _minutes(shift.start_on(ctx.work_date) + timedelta(minutes=grace), ctx.check_in_local))

    out = Resolution(status=None, late_minutes=late, worked_minutes=worked, break_minutes=taken, overtime_minutes=overtime)

    if ctx.locked_status is not None:
        out.status = ctx.locked_status
        return out
    if ctx.holiday or not ctx.working_day:
        if has_in:
            out.worked_on_off_day = True
            out.overtime_minutes = worked if ctx.check_out_utc is not None else 0   # the whole day is extra
            out.late_minutes = 0
            out.status = S.MISSED_PUNCH if missed_out else S.PRESENT
        else:
            out.status = S.HOLIDAY if ctx.holiday else S.WEEKLY_OFF
        return out
    if ctx.leave is not None:
        if ctx.leave.leave_type == "work_from_home":
            out.status = S.REMOTE
        elif ctx.leave.half_day and has_in:
            out.status = S.HALF_DAY
        else:
            out.status = S.ON_LEAVE
            out.late_minutes = 0
        return out
    if not has_in:
        out.status = S.ABSENT if ctx.day_closed else None
        return out
    if missed_out:
        out.status = S.MISSED_PUNCH
        return out
    if ongoing:
        out.status = S.LATE if late > 0 else S.PRESENT      # provisional while the day runs
        return out
    if worked < half_min:
        out.status = S.HALF_DAY
        return out
    out.status = S.LATE if late > 0 else S.PRESENT
    return out
