// ESS "Company policies": every current policy that applies to me, its version and effective date, what changed since the
// version I acknowledged, and the versions I received before. Reading and acknowledging happens in the document viewer
// (Company documents → "Documents issued to you"), which records the exact version I acknowledged.
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { AlertCircle, CheckCircle2, FileText, History, Loader2 } from "lucide-react";
import EmployeePageShell from "../../../../components/employee/EmployeePageShell";
import { listMyPolicies } from "../../../../service/workDocumentsService";
import { formatDate } from "../../../../utils/dateTime";

const fmt = (v) => (v ? formatDate(v) : "—");

export default function EmployeeCompanyPolicies() {
  const [items, setItems] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    listMyPolicies().then((r) => setItems(r?.items || [])).catch((e) => setError(e?.message || "Your policies could not be loaded."));
  }, []);

  return (
    <EmployeePageShell title="Company policies" subtitle="The policies that apply to you, and the versions you have received.">
      {error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>}
      {!items && !error && <p className="flex items-center gap-2 text-sm text-slate-500"><Loader2 size={16} className="animate-spin" aria-hidden="true" /> Loading…</p>}
      {items && items.length === 0 && <p className="text-sm text-slate-600">No policies have been published to you yet.</p>}
      {items && items.length > 0 && (
        <ul className="space-y-4" aria-label="Company policies">
          {items.map((p) => (
            <li key={p.canonical_id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              {p.what_changed && (
                <div role="note" className="mb-3 rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900">
                  <p className="font-semibold">What changed in version {p.version}</p>
                  <p>{p.change_summary}</p>
                </div>
              )}
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-base font-semibold text-slate-900">{p.title}</h2>
                  <p className="text-sm text-slate-600">Version {p.version} · effective {fmt(p.effective_from)}{p.minor_change ? " · minor correction, no action needed" : ""}</p>
                </div>
                {p.action_required ? (
                  <Link to={`/employee/documents/company?generated=${p.document_id}`}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2">
                    <AlertCircle size={16} aria-hidden="true" /> Read and acknowledge{p.due_by ? ` by ${fmt(p.due_by)}` : ""}
                  </Link>
                ) : p.document_id ? (
                  <span className="inline-flex items-center gap-1 text-sm text-emerald-700"><CheckCircle2 size={16} aria-hidden="true" />
                    {p.acknowledged_version ? `You acknowledged version ${p.acknowledged_version}` : "Received"}</span>
                ) : null}
              </div>
              {p.history?.length > 0 && (
                <details className="mt-3">
                  <summary className="flex cursor-pointer items-center gap-1 text-sm font-medium text-slate-700"><History size={14} aria-hidden="true" /> Versions you received ({p.history.length})</summary>
                  <ul className="mt-2 divide-y divide-slate-100 text-sm">
                    {p.history.map((h) => (
                      <li key={h.document_id} className="flex items-center justify-between py-1.5">
                        <span className="flex items-center gap-2"><FileText size={14} className="text-slate-400" aria-hidden="true" /> Version {h.version} · {fmt(h.issued_at)}</span>
                        <Link to={`/employee/documents/company?generated=${h.document_id}`} className="text-xs font-semibold text-blue-700 hover:underline">Open</Link>
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </li>
          ))}
        </ul>
      )}
    </EmployeePageShell>
  );
}
