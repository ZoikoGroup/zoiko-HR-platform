"""Attendance errors: {"success": false, "error": "<ATT_CODE>", "message": ...} through the platform exception handler."""
from typing import Optional

from app.core.exceptions import ZoikoException


class AttError(ZoikoException):
    def __init__(self, status_code: int, code: str, message: str, extra: Optional[dict] = None):
        super().__init__(status_code=status_code, error_code=code, message=message)
        self.extra = extra or {}


def conflict(code: str, message: str, **extra) -> AttError:
    return AttError(409, code, message, extra or None)


def forbidden(code: str, message: str) -> AttError:
    return AttError(403, code, message)


def invalid(message: str, field: Optional[str] = None) -> AttError:
    from app.modules.hr.attendance.constants import ERR_INVALID
    return AttError(422, ERR_INVALID, message, {"field": field} if field else None)


def not_found(what: str = "Attendance record") -> AttError:
    return AttError(404, "ATT_NOT_FOUND", f"{what} not found.")
