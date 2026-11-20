"""Shared attendance vocabulary. The frontend mirrors these in modules/zoiko-hr/attendance/constants.js."""
from app.modules.hr.models import AttendanceStatus as S

# statuses that mean the person worked (half day counts 0.5 in day totals)
ATTENDED = frozenset({S.PRESENT, S.LATE, S.REMOTE, S.HALF_DAY})
# statuses that carry no times
NO_TIME = frozenset({S.ABSENT, S.ON_LEAVE, S.HOLIDAY, S.WEEKLY_OFF})
# statuses that are not working days for the "x / y days" KPI
NON_WORKING = frozenset({S.HOLIDAY, S.WEEKLY_OFF})

SOURCES = ("web", "mobile", "manual", "biometric", "system", "correction")
CORRECTION_KINDS = ("missed_punch", "wrong_status", "break", "time_change")
WEEKDAYS = ("mon", "tue", "wed", "thu", "fri", "sat", "sun")

# limits
MAX_SHIFT_MINUTES = 20 * 60          # a punch-out more than 20 h after the punch-in is refused
DEFAULT_STANDARD_MINUTES = 8 * 60

# error codes returned with 4xx responses (frontend shows a friendly message per code)
ERR_ALREADY_IN = "ATT_ALREADY_IN"
ERR_NOT_IN = "ATT_NOT_IN"
ERR_ALREADY_OUT = "ATT_ALREADY_OUT"
ERR_ON_BREAK = "ATT_ON_BREAK"
ERR_NOT_ON_BREAK = "ATT_NOT_ON_BREAK"
ERR_DAY_CLOSED = "ATT_DAY_CLOSED"
ERR_PUNCH_DISABLED = "ATT_PUNCH_DISABLED"
ERR_LOCKED = "ATT_LOCKED"
ERR_EXISTS = "ATT_EXISTS"
ERR_INVALID = "ATT_INVALID"
