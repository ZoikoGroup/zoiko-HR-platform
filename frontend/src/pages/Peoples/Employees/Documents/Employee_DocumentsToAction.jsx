// ESS "Documents to action": every document, review or assessment waiting for me, with due dates and a direct link.
import { CheckCircle2, Loader2 } from "lucide-react";
import EmployeePageShell from "../../../../components/employee/EmployeePageShell";
import { DocumentActionsList, useDocumentActions } from "../../../../components/documents/DocumentActionsWidget";

export default function EmployeeDocumentsToAction() {
  const { loading, error, items, overdue } = useDocumentActions();
  return (
    <EmployeePageShell title="Documents to action" subtitle="Acknowledgements, signatures, reviews and forms that are waiting for you.">
      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        {loading ? <p className="flex items-center gap-2 text-sm text-slate-500"><Loader2 size={16} className="animate-spin" aria-hidden="true" /> Loading…</p>
          : error ? <p role="alert" className="text-sm text-red-700">{error}</p>
            : items.length === 0 ? <p className="flex items-center gap-2 text-sm text-emerald-700"><CheckCircle2 size={16} aria-hidden="true" /> Nothing is waiting for you.</p>
              : <>{overdue > 0 && <p className="mb-2 text-sm font-semibold text-amber-700">{overdue} overdue</p>}<DocumentActionsList items={items} /></>}
      </section>
    </EmployeePageShell>
  );
}
