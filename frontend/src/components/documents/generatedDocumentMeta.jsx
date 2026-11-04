// Shared display helpers for generated documents (the template engine's issued documents).
import { formatDate, formatDateTimeWithZone } from "../../utils/dateTime";

export const DOC_STATUS = {
  PENDING_APPROVAL: { label: "Waiting for approval", cls: "border-amber-200 bg-amber-50 text-amber-800" },
  HUMAN_APPROVED: { label: "Approved, not yet issued", cls: "border-blue-200 bg-blue-50 text-blue-800" },
  ISSUED: { label: "Issued", cls: "border-blue-200 bg-blue-50 text-blue-800" },
  ACKNOWLEDGED: { label: "Acknowledged", cls: "border-emerald-200 bg-emerald-50 text-emerald-800" },
  EXECUTED: { label: "Signed by everyone", cls: "border-emerald-200 bg-emerald-50 text-emerald-800" },
  DECLINED: { label: "Declined", cls: "border-red-200 bg-red-50 text-red-800" },
  EXPIRED: { label: "Expired", cls: "border-slate-200 bg-slate-100 text-slate-700" },
  CANCELLED: { label: "Cancelled", cls: "border-slate-200 bg-slate-100 text-slate-700" },
  CORRECTED: { label: "Replaced by a corrected version", cls: "border-slate-200 bg-slate-100 text-slate-700" },
  SUPERSEDED: { label: "Superseded", cls: "border-slate-200 bg-slate-100 text-slate-700" },
  RETAINED: { label: "Archived", cls: "border-slate-200 bg-slate-100 text-slate-700" },
  LEGAL_HOLD: { label: "On legal hold", cls: "border-purple-200 bg-purple-50 text-purple-800" },
};

// Status text for the person looking at the document: "Action needed" beats the raw status.
export function statusFor(doc) {
  if (doc?.my_action === "acknowledge") return { label: "Waiting for your acknowledgement", cls: "border-amber-200 bg-amber-50 text-amber-800" };
  if (doc?.my_action === "sign") return { label: "Waiting for your signature", cls: "border-amber-200 bg-amber-50 text-amber-800" };
  if (doc?.my_action === "approve") return { label: "Waiting for your approval", cls: "border-amber-200 bg-amber-50 text-amber-800" };
  if (doc?.status === "ISSUED" && doc?.execution_mode && doc.execution_mode !== "NONE" && doc.execution_mode !== "ACKNOWLEDGE") {
    return { label: "Waiting for other signatures", cls: "border-blue-200 bg-blue-50 text-blue-800" };
  }
  return DOC_STATUS[doc?.status] || { label: doc?.status || "Unknown", cls: "border-slate-200 bg-slate-100 text-slate-700" };
}

export function DocStatusPill({ doc }) {
  const s = statusFor(doc);
  return (
    <span className={`inline-flex items-center whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-semibold ${s.cls}`}>
      {s.label}
    </span>
  );
}

// Dates come from the API as ISO strings (UTC) or calendar days; shown in the viewer's own timezone.
export const showDate = (v) => (v ? formatDate(v) : "");
export const showDateTime = (v) => {
  if (!v) return "";
  const s = String(v);
  // A naive timestamp from the API is UTC.
  return formatDateTimeWithZone(/T/.test(s) && !/[zZ]|[+-]\d\d:?\d\d$/.test(s) ? `${s}Z` : s);
};

export function isOverdue(doc) {
  if (!doc?.due_by || !doc?.my_action) return false;
  const due = new Date(doc.due_by);
  return !isNaN(due.getTime()) && due.getTime() < Date.now();
}
