"""Who may do what in the documents module (ZHR-DOCS-ARCH-001 §5). The only place that knows role strings.

The frontend mirrors this map in frontend/src/modules/zoiko-hr/documents/permissions.js; tests/documents/test_permissions.py
fails when the two drift apart. Super admins never reach these routes (get_current_user refuses the data plane).
"""
from enum import Enum
from typing import Callable

from fastapi import Depends

from app.core.dependencies import get_current_user
from app.core.exceptions import ForbiddenException

ORG_ADMIN = "admin"
HR_ADMIN = "hr_admin"
MANAGER = "manager"
EMPLOYEE = "employee"
ADMINS = frozenset({ORG_ADMIN, HR_ADMIN})
EVERYONE = frozenset({ORG_ADMIN, HR_ADMIN, MANAGER, EMPLOYEE})


class DocAction(str, Enum):
    EMP_DOCS_VIEW = "emp_docs.view"
    EMP_DOCS_REMIND = "emp_docs.remind"
    EMP_DOCS_EXPORT = "emp_docs.export"
    CATEGORY_MANAGE = "category.manage"
    COMPANY_MANAGE = "company.manage"
    COMPANY_SHARE = "company.share"
    APPROVAL_QUEUE = "approval.queue"
    APPROVAL_DECIDE = "approval.decide"
    AUDIT_VIEW = "audit.view"
    AUTOMATION_MANAGE = "automation.manage"
    AUTOMATION_GLOBAL = "automation.global"      # org-wide pause, quiet hours, rate limits
    ME_UPLOAD = "me.upload"
    ME_VIEW = "me.view"
    SYSTEM_ISSUE = "system.issue"                # deferred (Q1): no role holds it yet


DOC_PERMISSIONS: dict[DocAction, frozenset[str]] = {
    DocAction.EMP_DOCS_VIEW: ADMINS,
    DocAction.EMP_DOCS_REMIND: ADMINS,
    DocAction.EMP_DOCS_EXPORT: ADMINS,
    DocAction.CATEGORY_MANAGE: ADMINS,
    DocAction.COMPANY_MANAGE: ADMINS,
    DocAction.COMPANY_SHARE: ADMINS,
    DocAction.APPROVAL_QUEUE: ADMINS,
    DocAction.APPROVAL_DECIDE: ADMINS,
    DocAction.AUDIT_VIEW: ADMINS,
    DocAction.AUTOMATION_MANAGE: ADMINS,
    DocAction.AUTOMATION_GLOBAL: frozenset({ORG_ADMIN}),
    DocAction.ME_UPLOAD: EVERYONE,
    DocAction.ME_VIEW: EVERYONE,
    DocAction.SYSTEM_ISSUE: frozenset(),
}


def role_of(user) -> str:
    role = getattr(user, "role", None)
    return str(getattr(role, "value", role) or "")


def has_doc_permission(user, action: DocAction) -> bool:
    return role_of(user) in DOC_PERMISSIONS.get(action, frozenset())


def assert_doc_permission(user, action: DocAction) -> None:
    if not has_doc_permission(user, action):
        raise ForbiddenException("You don't have permission to do this.")


def require_doc_permission(action: DocAction) -> Callable:
    """FastAPI dependency: the signed-in user, if their role holds `action`; otherwise 403."""
    def _dependency(current_user=Depends(get_current_user)):
        assert_doc_permission(current_user, action)
        return current_user
    _dependency.__name__ = f"require_{action.value.replace('.', '_')}"
    return _dependency


def is_document_admin(user) -> bool:
    return role_of(user) in ADMINS


def export_matrix() -> dict[str, list[str]]:
    """The map as plain JSON-able data (frontend parity test)."""
    return {a.value: sorted(roles) for a, roles in DOC_PERMISSIONS.items()}
