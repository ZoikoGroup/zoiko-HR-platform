import { Eye, Lock, ThumbsDown, ThumbsUp, RotateCcw } from "lucide-react";
import StatusChip from "./StatusChip";
import PrecheckBadge from "./PrecheckBadge";
import { WAITING_DAYS_RED } from "../constants";
import { formatDate } from "../../../../utils/dateTime";

const WHY = {
  self: "You uploaded this, so another approver must review it.",
  subject: "This document is about you, so another approver must review it.",
  locked: "Someone else is reviewing this right now.",
};
const ROLE = { hr_admin: "HR Admin", admin: "Org Admin" };

/**
 * One item of the approval queue or history (docs/new_docs/ZHR-DOCS-ARCH-001 §17 A4).
 *
 * @param {{ item: import('../types').ApprovalItem, selectable?: boolean, selected?: boolean, active?: boolean,
 *           onSelect?: (b:boolean)=>void, onPreview: ()=>void, onApprove?: ()=>void, onReject?: ()=>void,
 *           onReupload?: ()=>void }} props
 */
export default function ApprovalRow({ item, selectable, selected, active, onSelect, onPreview, onApprove, onReject, onReupload }) {
  const pending = item.status === "pending_approval";
  const late = pending && item.waiting_days > WAITING_DAYS_RED;
  const blocked = pending && !item.can_decide;
  return (
    <li className={`flex flex-col gap-3 rounded-2xl border bg-white p-4 shadow-sm sm:flex-row sm:items-center dark:bg-[#1e293b] ${active ? "border-blue-400 ring-2 ring-blue-100" : "border-gray-200/80 dark:border-[#334155]"}`}>
      {selectable && (
        <input type="checkbox" checked={Boolean(selected)} disabled={!item.can_decide} onChange={(e) => onSelect?.(e.target.checked)}
          aria-label={`Select ${item.title}`} className="h-4 w-4 rounded border-slate-300" />
      )}
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="truncate font-semibold text-slate-900 dark:text-[#f1f5f9]">{item.title}</p>
          <StatusChip status={item.status} />
          {item.category_name && <span className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-600">{item.category_name}</span>}
          <span className="rounded bg-slate-50 px-2 py-0.5 text-[11px] uppercase tracking-wide text-slate-500">{item.scope === "company" ? "Company" : "Employee"}</span>
        </div>
        <p className="mt-1 text-xs text-slate-600 dark:text-[#94a3b8]">
          {item.employee ? <><strong>{item.employee.name}</strong>{item.employee.employee_id_str && <span className="ml-1 font-mono">{item.employee.employee_id_str}</span>}</> : "Company document"}
          {item.submitted_at && <> · Submitted {formatDate(item.submitted_at)}</>}
          {pending && (
            <span className={`ml-2 font-semibold ${late ? "text-rose-700" : "text-slate-500"}`} data-testid="waiting">
              Waiting {item.waiting_days} day{item.waiting_days === 1 ? "" : "s"}
            </span>
          )}
        </p>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          {pending && <PrecheckBadge precheck={item.precheck} compact />}
          {item.file_available === false && (
            <span className="rounded bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-900" title="The record exists but its file is not on the server">
              File missing
            </span>
          )}
          {item.lock && !item.lock.mine && (
            <span className="inline-flex items-center gap-1 text-xs text-slate-500"><Lock size={12} aria-hidden="true" /> Being reviewed by {item.lock.by}</span>
          )}
          {!pending && item.decided_by && (
            <span className="text-xs text-slate-500">
              {item.status === "approved" ? "Approved" : "Decided"} by {item.decided_by.name}{item.decided_by.role && ` (${ROLE[item.decided_by.role] || item.decided_by.role})`}
              {item.decided_at && ` on ${formatDate(item.decided_at)}`}
            </span>
          )}
          {item.rejection_reason && !pending && <span className="text-xs text-rose-700">Reason: {item.rejection_reason}</span>}
        </div>
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-2">
        <button type="button" onClick={onPreview} aria-label={`Preview ${item.title}`}
          className="inline-flex items-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50 px-3 py-1.5 text-sm font-semibold text-blue-700 hover:bg-blue-100">
          <Eye size={16} aria-hidden="true" /> Preview
        </button>
        {pending && (
          <>
            <button type="button" onClick={onReject} disabled={blocked} title={blocked ? WHY[item.cannot_decide_reason] : undefined}
              className="inline-flex items-center gap-1.5 rounded-lg border border-rose-200 bg-rose-50 px-3 py-1.5 text-sm font-semibold text-rose-700 hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-50">
              <ThumbsDown size={16} aria-hidden="true" /> Reject
            </button>
            <button type="button" onClick={onReupload} disabled={blocked} title={blocked ? WHY[item.cannot_decide_reason] : undefined}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50">
              <RotateCcw size={16} aria-hidden="true" /> Re-upload
            </button>
            <button type="button" onClick={onApprove} disabled={blocked} title={blocked ? WHY[item.cannot_decide_reason] : undefined}
              className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-sm font-semibold text-emerald-700 hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-50">
              <ThumbsUp size={16} aria-hidden="true" /> Approve
            </button>
          </>
        )}
      </div>
      {blocked && <p className="text-xs text-slate-500 sm:hidden">{WHY[item.cannot_decide_reason]}</p>}
    </li>
  );
}

export { WHY as CANNOT_DECIDE_REASONS };
