/**
 * Who may do what in the documents module (ZHR-DOCS-ARCH-001 §5).
 *
 * Mirrors backend/app/modules/hr/documents/permissions.py DOC_PERMISSIONS exactly:
 * backend/tests/documents/test_docs_foundation.py fails when the two drift apart. The server enforces every rule; this map
 * only decides what the UI offers. Never trust it for security.
 */
import { useAuth } from "../../../context/AuthContext";

export const DOC_PERMISSIONS = Object.freeze({
  "emp_docs.view": ["admin", "hr_admin"],
  "emp_docs.remind": ["admin", "hr_admin"],
  "emp_docs.export": ["admin", "hr_admin"],
  "category.manage": ["admin", "hr_admin"],
  "company.manage": ["admin", "hr_admin"],
  "company.share": ["admin", "hr_admin"],
  "approval.queue": ["admin", "hr_admin"],
  "approval.decide": ["admin", "hr_admin"],
  "audit.view": ["admin", "hr_admin"],
  "automation.manage": ["admin", "hr_admin"],
  "automation.global": ["admin"],
  "me.upload": ["admin", "employee", "hr_admin", "manager"],
  "me.view": ["admin", "employee", "hr_admin", "manager"],
  "system.issue": [],
});

export const DOC_ACTIONS = Object.freeze(Object.keys(DOC_PERMISSIONS).reduce((acc, key) => {
  acc[key.replace(/[.]/g, "_").toUpperCase()] = key;
  return acc;
}, {}));

/** @param {string|undefined|null} role @param {string} action */
export function hasDocPermission(role, action) {
  return Boolean(role) && (DOC_PERMISSIONS[action] || []).includes(role);
}

/** @param {string} action @returns {boolean} */
export function useDocPermission(action) {
  const { role } = useAuth();
  return hasDocPermission(role, action);
}

/** Renders children only when the signed-in role holds `action`; otherwise `fallback` (default: nothing). */
export function DocPermissionGuard({ action, fallback = null, children }) {
  return useDocPermission(action) ? children : fallback;
}
