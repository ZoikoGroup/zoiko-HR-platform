import { FileText } from "lucide-react";

/**
 * Shared empty state for every document list on the org-admin and employee
 * document pages (see DocumentRow.jsx / DocumentErrorState.jsx siblings).
 * Kept deliberately quiet — no color, no border-radius competing with the
 * interactive elements above it (upload button, active tab).
 */
export default function DocumentEmptyState({
  icon: Icon = FileText,
  title = "No documents yet",
  message = "Documents will appear here once available.",
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
      <div className="w-14 h-14 rounded-2xl bg-doc-surface-soft dark:bg-[#0f172a] flex items-center justify-center">
        <Icon size={26} className="text-slate-300 dark:text-[#475569]" aria-hidden="true" />
      </div>
      <p className="text-sm font-semibold text-doc-ink dark:text-[#f1f5f9]">{title}</p>
      <p className="text-xs text-doc-ink-soft dark:text-[#94a3b8] max-w-xs">{message}</p>
    </div>
  );
}
