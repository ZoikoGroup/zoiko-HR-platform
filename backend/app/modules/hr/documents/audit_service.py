"""The documents audit trail (ZHR-DOCS-ARCH-001 §16 / cross-cutting requirement 5).

Every view, download, upload, decision and access change is recorded with who, what, when, IP and before/after. Values are
masked before they are stored (no ID numbers, no file contents). Rows are append-only (documents/models.py).
"""
from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Any, Optional

from fastapi import Request
from sqlalchemy.orm import Session

from app.modules.hr.documents.models import HrDocumentAuditLog
from app.modules.hr.documents.permissions import role_of

# Keys whose values are never written to the audit trail as they are.
_SENSITIVE_KEYS = ("number", "aadhaar", "aadhar", "pan", "passport", "ssn", "account", "iban", "token", "secret", "password")


@dataclass
class RequestCtx:
    ip: Optional[str] = None
    user_agent: Optional[str] = None


def request_ctx(request: Request) -> RequestCtx:
    """FastAPI dependency: the caller's IP (proxy-aware, core/client_ip) and user agent."""
    try:
        from app.core.client_ip import get_client_ip
        ip = get_client_ip(request)
    except Exception:
        ip = request.client.host if request.client else None
    return RequestCtx(ip=(ip or None) and str(ip)[:45], user_agent=(request.headers.get("user-agent") or "")[:400] or None)


def mask_value(key: str, value: Any) -> Any:
    if value is None or not isinstance(value, (str, int)):
        return value
    if any(s in key.lower() for s in _SENSITIVE_KEYS):
        text = str(value)
        return ("•" * max(len(text) - 4, 0)) + text[-4:] if len(text) > 4 else "••••"
    return value


def mask(data: Optional[dict]) -> Optional[dict]:
    if not data:
        return data
    out = {}
    for k, v in data.items():
        if isinstance(v, dict):
            out[k] = mask(v)
        else:
            out[k] = mask_value(str(k), v)
    return out


def record(db: Session, *, org_id: int, actor=None, action: str, target_type: str, target_id: int,
           document_id: Optional[int] = None, employee_id: Optional[int] = None, before: Optional[dict] = None,
           after: Optional[dict] = None, ctx: Optional[RequestCtx] = None, actor_type: Optional[str] = None,
           run_id: Optional[int] = None, rule_id: Optional[int] = None) -> HrDocumentAuditLog:
    """Add one audit row to the session (committed with the business change)."""
    if actor_type is None:
        actor_type = "automation" if run_id is not None else ("user" if actor is not None else "system")
    row = HrDocumentAuditLog(
        organization_id=org_id, actor_type=actor_type, actor_id=getattr(actor, "id", None),
        actor_role=(role_of(actor) or None) if actor is not None else None, automation_run_id=run_id, rule_id=rule_id,
        action=action[:30], target_type=target_type[:15], target_id=target_id, document_id=document_id, employee_id=employee_id,
        ip_address=ctx.ip if ctx else None, user_agent=ctx.user_agent if ctx else None,
        before=mask(before), after=mask(after), created_at=datetime.utcnow())
    db.add(row)
    return row


def should_log_view(db: Session, actor_id: Optional[int], document_id: int, window_s: int = 300) -> bool:
    """False when the same person viewed the same document within the window (views are de-duplicated)."""
    if actor_id is None:
        return True
    since = datetime.utcnow() - timedelta(seconds=window_s)
    recent = (db.query(HrDocumentAuditLog.id)
              .filter(HrDocumentAuditLog.actor_id == actor_id, HrDocumentAuditLog.document_id == document_id,
                      HrDocumentAuditLog.action == "viewed", HrDocumentAuditLog.created_at >= since)
              .first())
    return recent is None
