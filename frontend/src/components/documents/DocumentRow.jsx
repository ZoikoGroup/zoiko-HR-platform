import { Eye, Download, FileText, Loader2 } from "lucide-react";
import EmployeeStatusBadge from "../employee/EmployeeStatusBadge";

/**
 * Shared document row for every document list across the org-admin and
 * employee document pages. Presentation-only and data-agnostic: each page
 * keeps its own data-fetching and per-item mapping exactly as it was, and
 * just renders one of these per normalized item instead of hand-rolling its
 * own card markup.
 *
 * `icon`/`iconTone` are supplied by the caller because each page has its own
 * file/category taxonomy (payslip month vs. contract type vs. tax form) —
 * this component doesn't guess at one. Status stays on the existing
 * EmployeeStatusBadge (semantic colors); `categoryBadge` is a distinct,
 * caller-supplied tint (e.g. "Offer" / "Contract" / "Policy") kept separate
 * from status so the two badges are never visually confusable.
 */
export default function DocumentRow({
  icon: Icon = FileText,
  iconTone = { bg: "#F1F5F9", color: "#64748B" },
  title,
  meta,
  categoryBadge,
  status,
  onView,
  onDownload,
  busy = false,
  busyAction = null,
  viewLabel = "View",
  downloadLabel = "Download",
  actionsAfter,
  extra,
}) {
  return (
    <div
      role="group"
      aria-label={title}
      className="group flex flex-col gap-3 p-4 sm:p-5 rounded-xl bg-doc-surface dark:bg-[#1e293b] border border-doc-border dark:border-[#334155] hover:border-doc-primary/30 dark:hover:border-blue-800/50 transition-colors"
    >
      <div className="flex items-center gap-4 min-w-0">
        <div
          className="w-11 h-11 sm:w-12 sm:h-12 rounded-xl flex items-center justify-center shrink-0"
          style={{ background: iconTone.bg, color: iconTone.color }}
        >
          <Icon size={20} aria-hidden="true" />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-bold text-doc-ink dark:text-[#f1f5f9] truncate">{title}</p>
            {status && <EmployeeStatusBadge status={status} />}
          </div>
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            {categoryBadge && (
              <span
                className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold"
                style={{ color: categoryBadge.color, background: categoryBadge.bg }}
              >
                {categoryBadge.label}
              </span>
            )}
            {meta && <span className="text-xs text-doc-ink-soft dark:text-[#94a3b8]">{meta}</span>}
          </div>
        </div>

        <div className="shrink-0 flex items-center gap-2">
          {onView && (
            <button
              type="button"
              onClick={onView}
              disabled={busy}
              className="flex items-center gap-1.5 px-3.5 py-2 bg-doc-primary/10 hover:bg-doc-primary/15 dark:bg-blue-900/30 dark:hover:bg-blue-900/50 text-doc-primary dark:text-blue-300 text-xs sm:text-sm font-semibold rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-doc-primary"
            >
              {busy && busyAction === "view" ? <Loader2 size={14} className="animate-spin" /> : <Eye size={14} aria-hidden="true" />}
              <span className="hidden sm:inline">{viewLabel}</span>
            </button>
          )}
          {onDownload && (
            <button
              type="button"
              onClick={onDownload}
              disabled={busy}
              aria-label={`${downloadLabel} ${title || ""}`.trim()}
              className="flex items-center gap-1.5 px-3.5 py-2 bg-doc-surface-soft dark:bg-[#0f172a] hover:bg-doc-border/60 dark:hover:bg-[#1e293b] text-doc-ink dark:text-[#e2e8f0] text-xs sm:text-sm font-semibold rounded-lg border border-doc-border dark:border-[#334155] transition-colors disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-doc-primary"
            >
              {busy && busyAction === "download" ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} aria-hidden="true" />}
              <span className="hidden sm:inline">{downloadLabel}</span>
            </button>
          )}
          {actionsAfter}
        </div>
      </div>

      {extra && (
        <div className="pl-[3.75rem] sm:pl-16">
          {extra}
        </div>
      )}
    </div>
  );
}
