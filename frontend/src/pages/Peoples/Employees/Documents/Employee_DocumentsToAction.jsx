// ESS "Documents to action" (docs/new_docs/ZHR-DOCS-ARCH-001 §17 D1): every document waiting for me — signatures,
// read-confirmations, uploads HR asked for, reviews and assessments — with due dates, filtered by chip.
import { useMemo, useState } from "react";
import { CheckCircle2, Loader2, RefreshCw } from "lucide-react";
import { EmployeeDocumentsLayout } from "../../../../modules/zoiko-hr/documents/ui";
import { DocumentActionsList, useDocumentActions } from "../../../../components/documents/DocumentActionsWidget";

const CHIPS = [["all", "All"], ["sign", "Sign"], ["acknowledge", "Acknowledge"], ["upload", "Upload"]];
const chipOf = (item) => (["sign", "acknowledge", "upload"].includes(item.action) ? item.action : "other");

export default function EmployeeDocumentsToAction() {
  const [reloadKey, setReloadKey] = useState(0);
  const [chip, setChip] = useState("all");
  const { loading, error, items, overdue } = useDocumentActions(reloadKey);
  const counts = useMemo(() => {
    const c = { all: items.length, sign: 0, acknowledge: 0, upload: 0 };
    for (const i of items) if (c[chipOf(i)] !== undefined) c[chipOf(i)] += 1;
    return c;
  }, [items]);
  const shown = chip === "all" ? items : items.filter((i) => chipOf(i) === chip);

  return (
    <EmployeeDocumentsLayout title="Documents to action" subtitle="Signatures, read-confirmations, uploads and reviews that are waiting for you."
      actions={(
        <button type="button" onClick={() => setReloadKey((k) => k + 1)} disabled={loading}
          className="flex items-center gap-2 rounded-xl border border-white/20 bg-white/10 px-4 py-2.5 text-sm font-medium text-white hover:bg-white/15 disabled:opacity-60">
          <RefreshCw size={16} aria-hidden="true" /> Refresh
        </button>
      )}>
      <div className="space-y-4">
        <div role="tablist" aria-label="Filter by action" className="inline-flex flex-wrap gap-1 rounded-xl border border-slate-200 bg-white p-1">
          {CHIPS.map(([value, label]) => (
            <button key={value} type="button" role="tab" aria-selected={chip === value} onClick={() => setChip(value)}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${chip === value ? "bg-blue-600 text-white" : "text-slate-600 hover:bg-slate-100"}`}>
              {label} ({loading ? "—" : counts[value]})
            </button>
          ))}
        </div>
        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          {loading ? <p className="flex items-center gap-2 text-sm text-slate-500"><Loader2 size={16} className="animate-spin" aria-hidden="true" /> Loading…</p>
            : error ? <p role="alert" className="text-sm text-red-700">{error}</p>
              : shown.length === 0 ? <p className="flex items-center gap-2 text-sm text-emerald-700"><CheckCircle2 size={16} aria-hidden="true" /> {chip === "all" ? "Nothing is waiting for you." : "Nothing of this kind is waiting for you."}</p>
                : <>{overdue > 0 && chip === "all" && <p className="mb-2 text-sm font-semibold text-amber-700">{overdue} overdue</p>}<DocumentActionsList items={shown} /></>}
        </section>
      </div>
    </EmployeeDocumentsLayout>
  );
}
