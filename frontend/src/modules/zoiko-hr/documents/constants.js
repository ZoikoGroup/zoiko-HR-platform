/**
 * Display metadata for the documents module (docs/new_docs/ZHR-DOCS-ARCH-001 §9). Labels are jurisdiction-neutral.
 */
import { AccessVisibility, DocumentStatus, RejectReason } from "./types";

export const EXPIRY_SOON_DAYS = 30;
export const WAITING_DAYS_RED = 3;              // "waiting X days" turns red after this many days
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
export const EMPLOYEE_UPLOAD_EXTENSIONS = Object.freeze([".pdf", ".jpg", ".jpeg", ".png", ".doc", ".docx", ".xls", ".xlsx"]);

// tone: semantic colour family used by StatusChip (never the primary blue, which is reserved for actions)
export const STATUS_META = Object.freeze({
  [DocumentStatus.NOT_UPLOADED]: { label: "Not uploaded", tone: "slate" },
  [DocumentStatus.PENDING]: { label: "Pending approval", tone: "amber" },
  [DocumentStatus.APPROVED]: { label: "Approved", tone: "emerald" },
  [DocumentStatus.REJECTED]: { label: "Rejected", tone: "rose" },
  [DocumentStatus.REUPLOAD_REQUESTED]: { label: "Re-upload requested", tone: "orange" },
  [DocumentStatus.EXPIRED]: { label: "Expired", tone: "slate" },
  [DocumentStatus.SUPERSEDED]: { label: "Superseded", tone: "slate" },
  // employee-level summary statuses
  complete: { label: "Complete", tone: "emerald" },
  pending: { label: "Pending", tone: "amber" },
  needs_review: { label: "Needs review", tone: "violet" },
});

export const ACCESS_META = Object.freeze({
  [AccessVisibility.ADMIN_ONLY]: { label: "Admin only" },
  [AccessVisibility.ALL]: { label: "All employees" },
  [AccessVisibility.DEPARTMENTS]: { label: "Restricted" },
  [AccessVisibility.ROLES]: { label: "Restricted" },
  [AccessVisibility.EMPLOYEES]: { label: "Restricted" },
});

export const REJECT_REASONS = Object.freeze([
  { value: RejectReason.ILLEGIBLE, label: "Illegible or blurry" },
  { value: RejectReason.WRONG_DOCUMENT, label: "Wrong document" },
  { value: RejectReason.EXPIRED, label: "Document has expired" },
  { value: RejectReason.INCOMPLETE, label: "Incomplete (pages missing)" },
  { value: RejectReason.NAME_MISMATCH, label: "Name does not match" },
  { value: RejectReason.OTHER, label: "Other" },
]);

/** @param {string} status */
export function statusMeta(status) {
  return STATUS_META[status] || { label: status ? String(status).replace(/_/g, " ") : "Unknown", tone: "slate" };
}
