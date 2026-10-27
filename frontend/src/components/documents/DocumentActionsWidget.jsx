// "Documents to action": what waits for the signed-in person (acknowledgements, signatures, forms to complete) with due dates.
// The compact version sits on the ESS home; the full version is the /employee/documents/to-action page. Titles of confidential
// documents are never shown (the server sends a neutral label).
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, CheckCircle2, ClipboardList, Loader2 } from "lucide-react";
import { getMyDocumentActions } from "../../service/goLiveService";
import { formatDate } from "../../utils/dateTime";

const ACTION = { acknowledge: "Acknowledge", sign: "Sign", complete: "Complete", review: "Review" };

export function useDocumentActions() {
  const [state, setState] = useState({ loading: true, error: null, items: [], overdue: 0 });
  useEffect(() => {
    let alive = true;
    getMyDocumentActions()
      .then((r) => alive && setState({ loading: false, error: null, items: r?.items || [], overdue: r?.overdue || 0 }))
      .catch((e) => alive && setState({ loading: false, error: e?.message || "Could not load your documents.", items: [], overdue: 0 }));
    return () => { alive = false; };
  }, []);
  return state;
}

export function DocumentActionsList({ items, compact = false }) {
  const shown = compact ? items.slice(0, 4) : items;
  return (
    <ul className="divide-y divide-slate-100 dark:divide-[#334155]" aria-label="Documents to action">
      {shown.map((i) => (
        <li key={`${i.kind}-${i.document_id || i.id}`} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
          <span className="flex items-center gap-2 text-slate-800 dark:text-slate-200">
            {i.overdue ? <AlertTriangle size={16} className="text-amber-600" aria-label="Overdue" /> : <ClipboardList size={16} className="text-slate-400" aria-hidden="true" />}
            <span>{i.title}</span>
            {i.document_number && <span className="font-mono text-xs text-slate-500">{i.document_number}</span>}
          </span>
          <span className="flex items-center gap-3">
            {i.due_by && <span className={`text-xs ${i.overdue ? "font-semibold text-amber-700" : "text-slate-500"}`}>Due {formatDate(i.due_by)}</span>}
            <Link to={i.link} className="rounded-lg bg-blue-600 px-3 py-1 text-xs font-semibold text-white hover:bg-blue-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">
              {ACTION[i.action] || "Open"}
            </Link>
          </span>
        </li>
      ))}
    </ul>
  );
}

export default function DocumentActionsWidget({ hideIfEmpty = true }) {
  const { loading, error, items, overdue } = useDocumentActions();
  // On dashboards, only show this widget if there are actual actionable items!
  // If loading, error, or no items exist, don't show an empty or error card.
  if (loading) return null;
  if (error || !items || items.length === 0) {
    if (hideIfEmpty) return null;
    return (
      <section aria-label="Documents to action" className="bg-white dark:bg-[#1e293b] rounded-2xl border border-slate-200 dark:border-[#334155] shadow-sm p-6">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-base font-semibold text-slate-900 dark:text-[#f1f5f9]">Documents to action</h2>
        </div>
        {error ? (
          <p role="alert" className="text-sm text-red-700 dark:text-red-400">{error}</p>
        ) : (
          <p className="flex items-center gap-2 text-sm text-emerald-700 dark:text-emerald-400">
            <CheckCircle2 size={16} aria-hidden="true" /> Nothing is waiting for you.
          </p>
        )}
      </section>
    );
  }

  return (
    <section aria-label="Documents to action" className="bg-white dark:bg-[#1e293b] rounded-2xl border border-slate-200 dark:border-[#334155] shadow-sm p-6">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-base font-semibold text-slate-900 dark:text-[#f1f5f9]">Documents to action</h2>
        {items.length > 0 && (
          <Link to="/employee/documents/to-action" className="text-xs font-semibold text-blue-700 dark:text-blue-400 hover:underline">
            See all ({items.length})
          </Link>
        )}
      </div>
      {overdue > 0 && <p className="mb-1 text-xs font-semibold text-amber-700">{overdue} overdue</p>}
      <DocumentActionsList items={items} compact />
    </section>
  );
}
