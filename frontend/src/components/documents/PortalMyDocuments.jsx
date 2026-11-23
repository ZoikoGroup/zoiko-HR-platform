/*
 * "My documents" on the new hire's portal: every document with its status, Preview (in-app viewer) and Download of their
 * own copy (issued, executed with certificate, acknowledged, or the filled form they submitted), "Download all (ZIP)", and
 * for rejected items the reason plus a resubmit action that reuses the portal's upload / fill-in flow.
 */
import { useEffect, useState } from "react";
import { AlertCircle, Download, Eye, FileText, FolderDown, RotateCcw, Upload } from "lucide-react";
import { getPortalMyDocumentFile, getPortalMyDocuments, getPortalMyDocumentsZip, uploadPortalDocument } from "../../service/hrService";
import { openFile } from "../../utils/fileViewer";
import FileInput from "../FileInput";
import { formatDate } from "../../utils/dateTime";

const CHIP = {
  requested: "bg-blue-50 text-blue-700 ring-blue-200",
  pending: "bg-amber-50 text-amber-700 ring-amber-200",
  approved: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  rejected: "bg-rose-50 text-rose-700 ring-rose-200",
};
const DEFAULT_LABEL = { requested: "To do", pending: "Submitted – HR to review", approved: "Done", rejected: "Returned" };

export function MyDocStatusChip({ status, label }) {
  return (
    <span data-testid="my-doc-status" className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold ring-1 ${CHIP[status] || "bg-slate-50 text-slate-600 ring-slate-200"}`}>
      {label || DEFAULT_LABEL[status] || status}
    </span>
  );
}

function ResubmitUpload({ token, doc, onDone, onError }) {
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const send = async () => {
    if (!file) return;
    setBusy(true);
    try {
      const view = await uploadPortalDocument(token, doc.id, file);
      onDone(view, `${doc.title} uploaded again. HR will review it.`);
    } catch (err) {
      onError(err?.message || "Upload failed. Please try again.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center">
      <FileInput ariaLabel={`New file for ${doc.title}`} file={file} onChange={setFile} size="sm" className="w-full" />
      <button type="button" onClick={send} disabled={!file || busy}
        className="inline-flex w-full shrink-0 items-center justify-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-700 disabled:bg-blue-300 sm:w-auto">
        <Upload className="h-3.5 w-3.5" />{busy ? "Uploading…" : "Upload again"}
      </button>
    </div>
  );
}

export default function PortalMyDocuments({ token, refreshKey, onUpdated, onError }) {
  const [items, setItems] = useState(null);
  const [busy, setBusy] = useState("");
  const [resubmitting, setResubmitting] = useState(null);

  useEffect(() => {
    let live = true;
    getPortalMyDocuments(token)
      .then((r) => { if (live) setItems(Array.isArray(r) ? r : r?.items || []); })
      .catch(() => { if (live) setItems((prev) => prev || []); });
    return () => { live = false; };
  }, [token, refreshKey]);

  if (!items || items.length === 0) return null;

  const fetchFile = async (doc, download) => {
    setBusy(`${doc.id}:${download ? "d" : "p"}`);
    try {
      const res = await getPortalMyDocumentFile(token, doc.id, download);
      openFile(res.blob, res.filename || `${doc.title}.pdf`, download ? "download" : "preview");
    } catch (err) {
      onError?.(err?.message || "Could not open the document.");
    } finally {
      setBusy("");
    }
  };

  const downloadAll = async () => {
    setBusy("zip");
    try {
      const res = await getPortalMyDocumentsZip(token);
      openFile(res.blob, res.filename || "my-onboarding-documents.zip", "download");
    } catch (err) {
      onError?.(err?.message || "Could not download your documents.");
    } finally {
      setBusy("");
    }
  };

  // the portal's own row for this document (upload / fill-in online) when it is on the page; otherwise an inline upload
  const resubmit = (doc) => {
    const row = typeof document !== "undefined" ? document.getElementById(`portal-doc-${doc.id}`) : null;
    if (row) {
      row.scrollIntoView?.({ behavior: "smooth", block: "center" });
      row.querySelector("button, input")?.focus?.();
      return;
    }
    setResubmitting((cur) => (cur === doc.id ? null : doc.id));
  };

  const anyDownload = items.some((d) => d.can_download);
  const btn = "inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold disabled:opacity-50";

  return (
    <section className="space-y-4 rounded-3xl border border-blue-100/90 bg-white p-5 shadow-sm sm:p-6" aria-labelledby="my-docs-title">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
        <div className="flex items-center gap-2">
          <span className="grid h-6 w-6 place-items-center rounded-lg bg-blue-50 text-blue-600"><FileText className="h-3.5 w-3.5" /></span>
          <h2 id="my-docs-title" className="text-base font-bold tracking-tight text-slate-900">My documents</h2>
          <span className="text-xs font-medium text-slate-400">{items.length} items</span>
        </div>
        {anyDownload && (
          <button type="button" onClick={downloadAll} disabled={busy === "zip"} className={`${btn} bg-blue-50 text-blue-700 hover:bg-blue-100`}>
            <FolderDown className="h-3.5 w-3.5" />{busy === "zip" ? "Preparing…" : "Download all (ZIP)"}
          </button>
        )}
      </div>
      <ul className="divide-y divide-slate-100">
        {items.map((doc) => (
          <li key={doc.id} data-testid="my-doc-row" className="py-3">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <p className="break-words text-sm font-semibold text-slate-800">{doc.title}</p>
                <p className="text-xs text-slate-500">{doc.submitted_at ? `Submitted ${formatDate(doc.submitted_at)}` : (doc.mode_label || "")}</p>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                <MyDocStatusChip status={doc.status} label={doc.status_label} />
                {doc.can_preview && (
                  <button type="button" onClick={() => fetchFile(doc, false)} disabled={busy === `${doc.id}:p`} aria-label={`Preview ${doc.title}`}
                    className={`${btn} text-blue-600 hover:bg-blue-50`}><Eye className="h-3.5 w-3.5" />Preview</button>
                )}
                {doc.can_download && (
                  <button type="button" onClick={() => fetchFile(doc, true)} disabled={busy === `${doc.id}:d`} aria-label={`Download ${doc.title}`}
                    className={`${btn} text-blue-600 hover:bg-blue-50`}><Download className="h-3.5 w-3.5" />Download</button>
                )}
                {doc.status === "rejected" && doc.can_resubmit && (
                  <button type="button" onClick={() => resubmit(doc)} aria-label={`Resubmit ${doc.title}`}
                    className={`${btn} bg-rose-600 text-white hover:bg-rose-700`}><RotateCcw className="h-3.5 w-3.5" />Resubmit</button>
                )}
              </div>
            </div>
            {doc.status === "rejected" && doc.rejection_reason && (
              <p className="mt-2 flex items-start gap-1.5 break-words rounded-lg border border-rose-100 bg-rose-50 p-2.5 text-xs text-rose-700">
                <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />Returned by HR: {doc.rejection_reason}
              </p>
            )}
            {resubmitting === doc.id && (
              <ResubmitUpload token={token} doc={doc} onError={(t) => onError?.(t)}
                onDone={(view, msg) => { setResubmitting(null); onUpdated?.(view, msg); }} />
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
