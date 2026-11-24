/* My Exit → Exit Documents: letters issued for the exit (acknowledgement, relieving / experience letter, settlement). */
import { useEffect, useState } from "react";
import { Download, FileText, Info, Loader2 } from "lucide-react";
import { downloadMyExitDocument, errorMessage, getMyExitDocuments } from "../../../../../service/offboardingService";
import { formatDate } from "../../../../../utils/dateTime";
import MyExitLayout from "./MyExitLayout";

function DocumentsTab() {
  const [items, setItems] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(null);
  useEffect(() => {
    getMyExitDocuments().then((r) => setItems(r?.items || [])).catch((e) => setError(errorMessage(e, "Your documents could not be loaded.")));
  }, []);
  const download = async (doc) => {
    setBusy(doc.id); setError(null);
    try { await downloadMyExitDocument(doc); } catch (e) { setError(errorMessage(e, "The download failed.")); } finally { setBusy(null); }
  };
  return (
    <div className="space-y-3">
      <p className="flex gap-2 rounded-xl border border-blue-100 bg-blue-50 p-3 text-sm text-blue-900">
        <Info size={18} className="shrink-0" aria-hidden="true" />
        After your last working day you cannot sign in, so we e-mail you a download link for each document.
      </p>
      {error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>}
      {items === null && !error && <p role="status" className="text-sm text-slate-600">Loading…</p>}
      {items && items.length === 0 && <p className="rounded-2xl border border-slate-200 bg-white p-5 text-sm text-slate-600">No documents issued yet.</p>}
      {items && items.length > 0 && (
        <ul className="divide-y divide-slate-100 rounded-2xl border border-slate-200 bg-white">
          {items.map((d) => (
            <li key={d.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
              <span className="flex items-center gap-3">
                <FileText size={20} className="text-slate-400" aria-hidden="true" />
                <span><span className="block font-medium text-slate-900">{d.title}</span>
                  <span className="text-xs text-slate-500">Issued {formatDate(d.issued_at)}</span></span>
              </span>
              <button type="button" onClick={() => download(d)} disabled={busy === d.id} aria-label={`Download ${d.title}`}
                className="inline-flex items-center gap-2 rounded-xl border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60">
                {busy === d.id ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : <Download size={16} aria-hidden="true" />} Download
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function ExitDocuments() {
  return <MyExitLayout tab="documents"><DocumentsTab /></MyExitLayout>;
}
