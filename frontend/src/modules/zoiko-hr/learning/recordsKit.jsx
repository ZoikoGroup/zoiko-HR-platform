// Small shared pieces for the Learning record screens (enrollments, certifications, skills).

export const inputCls = "w-full border border-gray-200 dark:border-[#334155] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-[#0f172a] dark:text-[#f1f5f9]";
export const PER_PAGE = 10;

export const asPage = (res) => {
  if (Array.isArray(res)) return { items: res, total: res.length };
  const items = Array.isArray(res?.items) ? res.items : [];
  return { items, total: Number.isFinite(res?.total) ? res.total : items.length };
};

export function Banner({ message, tone = "error", onClose }) {
  if (!message) return null;
  const cls = tone === "ok" ? "bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800 text-green-800 dark:text-green-300" : "bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800 text-red-700 dark:text-red-300";
  return (
    <div role={tone === "ok" ? "status" : "alert"} className={`mb-4 px-4 py-3 border rounded-lg flex justify-between items-center ${cls}`}>
      <span>{message}</span>
      {onClose && <button type="button" onClick={onClose} aria-label="Dismiss" className="font-bold">&times;</button>}
    </div>
  );
}

export function Pager({ page, total, perPage = PER_PAGE, onPage }) {
  const pages = Math.max(1, Math.ceil(total / perPage));
  if (pages <= 1) return null;
  return (
    <div className="flex justify-between items-center px-4 py-3 border-t border-gray-100 dark:border-[#334155]">
      <span className="text-xs text-gray-400 dark:text-[#94a3b8]">Page {page} of {pages} · {total} record{total === 1 ? "" : "s"}</span>
      <div className="flex gap-1">
        <button type="button" onClick={() => onPage(page - 1)} disabled={page <= 1} className="px-3 py-1 text-xs border border-gray-200 dark:border-[#334155] rounded disabled:opacity-40 hover:bg-gray-50 dark:hover:bg-[#0f172a]">Prev</button>
        <button type="button" onClick={() => onPage(page + 1)} disabled={page >= pages} className="px-3 py-1 text-xs border border-gray-200 dark:border-[#334155] rounded disabled:opacity-40 hover:bg-gray-50 dark:hover:bg-[#0f172a]">Next</button>
      </div>
    </div>
  );
}

export function Dialog({ title, onClose, children }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div role="dialog" aria-label={title} className="bg-white dark:bg-[#1e293b] rounded-xl shadow-xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center px-6 py-4 border-b border-gray-100 dark:border-[#334155]">
          <h2 className="text-lg font-bold text-gray-800 dark:text-[#f1f5f9]">{title}</h2>
          <button type="button" aria-label="Close" onClick={onClose} className="text-gray-400 dark:text-[#94a3b8] hover:text-gray-600 text-xl leading-none">&times;</button>
        </div>
        <div className="p-6">{children}</div>
      </div>
    </div>
  );
}

export function DialogButtons({ busy, label, busyLabel, onCancel }) {
  return (
    <div className="flex justify-end gap-3 pt-4 border-t border-gray-100 dark:border-[#334155]">
      <button type="button" onClick={onCancel} className="px-4 py-2 text-sm border border-gray-200 dark:border-[#334155] rounded-lg hover:bg-gray-50 dark:hover:bg-[#0f172a]">Cancel</button>
      <button type="submit" disabled={busy} className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium disabled:bg-blue-400">
        {busy ? busyLabel : label}
      </button>
    </div>
  );
}

export function Table({ headers, children, empty }) {
  return (
    <div className="bg-white dark:bg-[#1e293b] rounded-xl border border-gray-100 dark:border-[#334155] shadow-sm overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 dark:bg-[#0f172a] border-b border-gray-100 dark:border-[#334155]">
            <tr>{headers.map((h) => <th key={h} className={`px-4 py-3 font-semibold text-gray-600 dark:text-[#cbd5e1] ${h === "Actions" ? "text-right" : "text-left"}`}>{h}</th>)}</tr>
          </thead>
          <tbody className="divide-y divide-gray-50 dark:divide-[#334155]">{children}</tbody>
        </table>
      </div>
      {empty}
    </div>
  );
}
