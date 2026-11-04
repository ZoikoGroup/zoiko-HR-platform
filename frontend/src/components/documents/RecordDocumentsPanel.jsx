// The documents the engine produced for one HR record (a leave request, an overtime request, a salary revision...), and the
// latest blocked attempt per template in plain language. The record's module decides when documents are generated; this
// panel only shows the outcome. HR sees blocked attempts; others see only the documents they may open.
//
//   <RecordDocumentsPanel load={() => getLeaveDocuments(leave.id)} title="Decision records" />
import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, FileText, Loader2, RefreshCw } from "lucide-react";
import { DocStatusPill, showDateTime } from "./generatedDocumentMeta";
import { reasonText } from "../../service/docTemplatesService";
import { MODULE_REASON_TEXT } from "../../service/workDocumentsService";
import { PROMPT4_REASON_TEXT } from "../../service/goLiveService";

export const blockedText = (code) => {
  const head = String(code || "").split(":")[0];
  return MODULE_REASON_TEXT[head] || PROMPT4_REASON_TEXT[head] || reasonText(code);
};

export default function RecordDocumentsPanel({ load, title = "Documents", emptyText = "No documents have been produced for this record yet.",
  hrLink = false, refreshKey }) {
  const [state, setState] = useState({ loading: true, error: null, documents: [], blocked: [] });

  const refresh = useCallback(() => {
    setState((s) => ({ ...s, loading: true, error: null }));
    Promise.resolve(load())
      .then((r) => setState({ loading: false, error: null, documents: r?.documents || [], blocked: r?.blocked || [] }))
      .catch((e) => setState({ loading: false, error: e?.message || "The documents could not be loaded.", documents: [], blocked: [] }));
  }, [load]);

  useEffect(() => { refresh(); }, [refresh, refreshKey]);

  return (
    <section aria-label={title} className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-slate-800">{title}</h3>
        <button type="button" onClick={refresh} className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">
          <RefreshCw size={14} aria-hidden="true" /> Refresh
        </button>
      </div>
      {state.loading ? (
        <p className="flex items-center gap-2 text-sm text-slate-500"><Loader2 size={16} className="animate-spin" aria-hidden="true" /> Loading…</p>
      ) : state.error ? (
        <p role="alert" className="text-sm text-red-700">{state.error}</p>
      ) : (
        <>
          {state.documents.length === 0 && state.blocked.length === 0 && <p className="text-sm text-slate-500">{emptyText}</p>}
          {state.documents.length > 0 && (
            <ul className="divide-y divide-slate-100">
              {state.documents.map((d) => (
                <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <span className="flex items-center gap-2 text-sm text-slate-800">
                    <FileText size={16} className="text-slate-400" aria-hidden="true" />
                    <span>{d.title}</span>
                    <span className="font-mono text-xs text-slate-500">{d.document_number}</span>
                  </span>
                  <span className="flex items-center gap-2">
                    <DocStatusPill doc={d} />
                    {d.issued_at && <span className="text-xs text-slate-500">{showDateTime(d.issued_at)}</span>}
                    {hrLink && (
                      <Link to={`/zoiko-hr/documents/generated?document=${d.id}`} className="text-xs font-semibold text-blue-700 hover:underline">Open</Link>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          )}
          {state.blocked.length > 0 && (
            <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3">
              <p className="flex items-center gap-1.5 text-sm font-semibold text-amber-900"><AlertTriangle size={16} aria-hidden="true" /> Not produced yet</p>
              <ul className="mt-1 list-disc pl-5 text-sm text-amber-900">
                {state.blocked.map((b) => (
                  <li key={b.canonical_id}>
                    <span className="font-mono text-xs">{b.canonical_id}</span>: {(b.reasons || []).map(blockedText).join(" ") || b.outcome}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </section>
  );
}
