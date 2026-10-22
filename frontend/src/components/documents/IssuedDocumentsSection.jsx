import { useCallback, useEffect, useId, useRef, useState } from "react";
import { FileSignature, FileCheck2, Eye, Download, Loader2, RefreshCw, AlertTriangle, FileText } from "lucide-react";
import { Modal } from "../billing-ui";
import SandboxedHtmlPreview from "./SandboxedHtmlPreview";
import DocumentActionDialog from "./DocumentActionDialog";
import { DocStatusPill, showDate, showDateTime, isOverdue } from "./generatedDocumentMeta";
import {
  listMyGeneratedDocuments,
  myPendingDocumentCount,
  getMyGeneratedDocument,
  previewMyGeneratedDocument,
  downloadGeneratedDocument,
} from "../../service/docTemplatesService";

// "Documents issued to you": documents the template engine issued to the signed-in person (offer letters, contracts,
// policies to acknowledge...). Used on the ESS pages and the employee portal. Reads `?generated=<id>` from the URL
// (e-mail links) and opens that document straight away. Reads window.location directly so it also works on pages that
// are rendered outside a router (tests).

const PER_PAGE = 20;

function readGeneratedParam() {
  try {
    const v = new URLSearchParams(window.location.search).get("generated");
    return v && /^\d+$/.test(v) ? Number(v) : null;
  } catch {
    return null;
  }
}

function clearGeneratedParam() {
  try {
    const url = new URL(window.location.href);
    if (!url.searchParams.has("generated")) return;
    url.searchParams.delete("generated");
    window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
  } catch { /* ignore */ }
}

export function PendingDocumentsBadge({ count }) {
  if (!count) return null;
  return (
    <span className="inline-flex items-center rounded-full bg-amber-500 px-2 py-0.5 text-xs font-bold text-white">
      {count}
      <span className="sr-only"> {count === 1 ? "document needs" : "documents need"} your action</span>
    </span>
  );
}

function PreviewModal({ doc, onClose, onDownload }) {
  const [html, setHtml] = useState(null);
  const [error, setError] = useState(null);
  useEffect(() => {
    let alive = true;
    previewMyGeneratedDocument(doc.id)
      .then((r) => alive && setHtml(r?.html || ""))
      .catch((e) => alive && setError(e?.message || "The document could not be loaded."));
    return () => { alive = false; };
  }, [doc.id]);
  return (
    <Modal
      open
      onClose={onClose}
      size="xl"
      icon={FileText}
      title={doc.title || "Document"}
      description={doc.document_number}
      footer={
        <>
          <button type="button" onClick={() => onDownload(doc)} className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">
            <Download size={16} aria-hidden="true" /> Download PDF
          </button>
          <button type="button" onClick={onClose} className="rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2">
            Close
          </button>
        </>
      }
    >
      {error ? (
        <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</div>
      ) : html === null ? (
        <div role="status" className="flex items-center justify-center gap-2 py-16 text-sm text-slate-500">
          <Loader2 size={18} className="animate-spin" aria-hidden="true" /> Loading...
        </div>
      ) : (
        <SandboxedHtmlPreview html={html} title={`${doc.title || "Document"} preview`} height="min(70vh, 720px)" />
      )}
    </Modal>
  );
}

export default function IssuedDocumentsSection({ className = "", onPendingCount }) {
  const headingId = useId();
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pendingOnly, setPendingOnly] = useState(false);
  const [pending, setPending] = useState(0);
  const [loading, setLoading] = useState(true);
  const [hidden, setHidden] = useState(false);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [action, setAction] = useState(null); // { doc, mode }
  const [viewing, setViewing] = useState(null);
  const deepLinkHandled = useRef(false);
  const pendingCb = useRef(onPendingCount);
  pendingCb.current = onPendingCount;

  const load = useCallback(async (nextPage = 1, append = false) => {
    setLoading(true);
    setError(null);
    try {
      const [list, count] = await Promise.all([
        listMyGeneratedDocuments({ pending: pendingOnly ? true : undefined, page: nextPage, per_page: PER_PAGE }),
        myPendingDocumentCount().catch(() => null),
      ]);
      const rows = Array.isArray(list?.items) ? list.items : [];
      setItems((prev) => (append ? [...prev, ...rows] : rows));
      setTotal(list?.total ?? rows.length);
      setPage(nextPage);
      if (count && typeof count.count === "number") {
        setPending(count.count);
        pendingCb.current?.(count.count);
      }
    } catch (e) {
      // Not in the plan / not available for this account: the section simply is not shown.
      if (e?.status === 401 || e?.status === 403 || e?.status === 404) setHidden(true);
      else setError(e?.message || "Documents issued to you could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, [pendingOnly]);

  useEffect(() => { load(1); }, [load]);

  // Open the document named in ?generated=<id> once.
  useEffect(() => {
    if (deepLinkHandled.current) return;
    const id = readGeneratedParam();
    if (!id) { deepLinkHandled.current = true; return; }
    deepLinkHandled.current = true;
    getMyGeneratedDocument(id)
      .then((d) => {
        if (d?.my_action === "acknowledge") setAction({ doc: d, mode: "acknowledge" });
        else if (d?.my_action === "sign") setAction({ doc: d, mode: "sign" });
        else setViewing(d);
      })
      .catch(() => setError("The document in your link could not be opened. It may have been withdrawn, or it was issued to someone else."));
  }, []);

  const download = async (doc) => {
    setBusyId(doc.id);
    try {
      await downloadGeneratedDocument(doc.id, { self: true });
    } catch (e) {
      setError(e?.message || "The PDF could not be downloaded.");
    } finally {
      setBusyId(null);
    }
  };

  const closeAction = () => {
    setAction(null);
    clearGeneratedParam();
  };

  if (hidden) return null;
  // Nothing issued yet and nothing to say: keep the page as it was.
  if (!loading && !error && total === 0 && !pendingOnly && !action && !viewing) return null;

  return (
    <section aria-labelledby={headingId} className={`rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-[#334155] dark:bg-[#1e293b] ${className}`}>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <span className="rounded-lg bg-blue-50 p-2 text-blue-700"><FileSignature size={18} aria-hidden="true" /></span>
        <h2 id={headingId} className="text-lg font-semibold text-slate-900 dark:text-[#f1f5f9]">Documents issued to you</h2>
        <PendingDocumentsBadge count={pending} />
        <div className="ml-auto flex flex-wrap items-center gap-3">
          <label className="inline-flex items-center gap-2 text-sm text-slate-600 dark:text-[#94a3b8]">
            <input
              type="checkbox"
              checked={pendingOnly}
              onChange={(e) => setPendingOnly(e.target.checked)}
              className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-2 focus:ring-blue-500"
            />
            Needs my action only
          </label>
          <button
            type="button"
            onClick={() => load(1)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:border-[#334155] dark:text-[#cbd5e1]"
          >
            <RefreshCw size={14} aria-hidden="true" /> Refresh
          </button>
        </div>
      </div>

      {pending > 0 && (
        <p className="mb-3 text-sm text-amber-800" role="status">
          {pending === 1 ? "1 document needs" : `${pending} documents need`} your acknowledgement or signature.
        </p>
      )}
      {notice && (
        <div role="status" className="mb-3 flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
          <FileCheck2 size={16} aria-hidden="true" /> <span>{notice}</span>
          <button type="button" onClick={() => setNotice(null)} className="ml-auto text-xs font-semibold underline">Dismiss</button>
        </div>
      )}
      {error && (
        <div role="alert" className="mb-3 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" aria-hidden="true" /> <span>{error}</span>
          <button type="button" onClick={() => setError(null)} className="ml-auto text-xs font-semibold underline">Dismiss</button>
        </div>
      )}

      {loading && items.length === 0 ? (
        <div role="status" className="flex items-center justify-center gap-2 py-8 text-sm text-slate-500">
          <Loader2 size={18} className="animate-spin" aria-hidden="true" /> Loading...
        </div>
      ) : items.length === 0 ? (
        <p className="py-6 text-center text-sm text-slate-500">{pendingOnly ? "Nothing needs your action." : "No documents have been issued to you yet."}</p>
      ) : (
        <ul className="divide-y divide-slate-100 dark:divide-[#334155]">
          {items.map((d) => {
            const overdue = isOverdue(d);
            return (
              <li key={d.id} className="flex flex-col gap-3 py-3 sm:flex-row sm:items-center">
                <div className="min-w-0 flex-1">
                  <p className="break-words font-medium text-slate-900 dark:text-[#f1f5f9]">{d.title}</p>
                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500 dark:text-[#94a3b8]">
                    <DocStatusPill doc={d} />
                    <span className="font-mono">{d.document_number}</span>
                    {d.issued_at && <span>Issued {showDateTime(d.issued_at)}</span>}
                    {d.due_by && (
                      <span className={overdue ? "font-semibold text-red-700" : ""}>
                        {overdue ? "Overdue: was due " : "Due "}{showDate(d.due_by)}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {d.my_action === "acknowledge" && (
                    <button
                      type="button"
                      onClick={() => setAction({ doc: d, mode: "acknowledge" })}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
                    >
                      <FileCheck2 size={14} aria-hidden="true" /> Read & acknowledge<span className="sr-only">: {d.title}</span>
                    </button>
                  )}
                  {d.my_action === "sign" && (
                    <button
                      type="button"
                      onClick={() => setAction({ doc: d, mode: "sign" })}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
                    >
                      <FileSignature size={14} aria-hidden="true" /> Review & sign<span className="sr-only">: {d.title}</span>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setViewing(d)}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:border-[#334155] dark:text-[#cbd5e1]"
                  >
                    <Eye size={14} aria-hidden="true" /> View<span className="sr-only"> {d.title}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => download(d)}
                    disabled={busyId === d.id}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:opacity-50 dark:border-[#334155] dark:text-[#cbd5e1]"
                  >
                    {busyId === d.id ? <Loader2 size={14} className="animate-spin" aria-hidden="true" /> : <Download size={14} aria-hidden="true" />}
                    Download<span className="sr-only"> {d.title}</span>
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {items.length < total && (
        <div className="mt-3 text-center">
          <button
            type="button"
            onClick={() => load(page + 1, true)}
            disabled={loading}
            className="rounded-lg border border-slate-200 px-4 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:opacity-50"
          >
            {loading ? "Loading..." : `Show more (${total - items.length} more)`}
          </button>
        </div>
      )}

      {action && (
        <DocumentActionDialog
          doc={action.doc}
          mode={action.mode}
          onClose={closeAction}
          onDone={() => {
            setNotice(action.mode === "acknowledge" ? `"${action.doc.title}" acknowledged.` : `"${action.doc.title}" updated.`);
            load(1);
          }}
        />
      )}
      {viewing && (
        <PreviewModal
          doc={viewing}
          onDownload={download}
          onClose={() => { setViewing(null); clearGeneratedParam(); }}
        />
      )}
    </section>
  );
}
