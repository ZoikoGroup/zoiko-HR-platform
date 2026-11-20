"""Error responses of the documents module (ZHR-DOCS-ARCH-001 §7): {"error": <code>, "detail": <message>, ...extra}."""
from typing import Optional

from app.core.exceptions import ZoikoException


class DocError(ZoikoException):
    def __init__(self, status_code: int, code: str, message: str, extra: Optional[dict] = None):
        super().__init__(status_code=status_code, error_code=code, message=message)
        self.extra = extra or {}


def not_found(what: str = "Document") -> DocError:
    # Also used for records that exist but are not visible to the caller: existence is never revealed.
    return DocError(404, "DOC_NOT_FOUND", f"{what} not found.")


def forbidden(message: str = "You don't have permission to do this.") -> DocError:
    return DocError(403, "DOC_FORBIDDEN", message)


def self_approval() -> DocError:
    return DocError(409, "DOC_SELF_APPROVAL", "You can't decide on a document you uploaded or that is about you. Another approver must review it.")


def locked(by_name: str, until) -> DocError:
    return DocError(409, "DOC_LOCKED", f"{by_name} is reviewing this document.",
                    {"locked_by_name": by_name, "locked_until": until.isoformat() + "Z" if until else None})


def already_decided(status: str) -> DocError:
    return DocError(409, "DOC_ALREADY_DECIDED", f"This document has already been {status.replace('_', ' ')}.", {"status": status})


def stale_version() -> DocError:
    return DocError(409, "DOC_STALE_VERSION", "A newer version was uploaded. Refresh to review the latest one.")


def pending_exists() -> DocError:
    return DocError(409, "DOC_PENDING_EXISTS", "A copy of this document is already waiting for review. Remove it first to upload another.")


def no_eligible_approver() -> DocError:
    return DocError(409, "DOC_NO_ELIGIBLE_APPROVER", "No one else can approve this document.")


def category_closed(message: str = "You can't upload to this category.") -> DocError:
    return DocError(422, "DOC_CATEGORY_CLOSED", message)


def invalid(message: str, field: Optional[str] = None) -> DocError:
    return DocError(422, "DOC_INVALID", message, {"field": field} if field else None)
