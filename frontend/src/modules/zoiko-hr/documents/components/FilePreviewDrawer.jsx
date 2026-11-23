import { useEffect, useMemo, useRef, useState } from "react";
import { Download, FileWarning, Loader2, X } from "lucide-react";
import { PreviewBody } from "../../../../components/DocumentPreviewModal";
import DocumentErrorState from "../../../../components/documents/DocumentErrorState";
import { detectPreviewKind, fileExtension, humanFileSize, normalizePreviewBlob } from "../../../../utils/documentPreview";
import { saveBlobAs } from "../../../../utils/documents";
import { getDocumentFile } from "../../../../service/hrService";

/**
 * Preview of one document (or one version) as a right-hand drawer, or `inline` as a side panel (the Approval Workflow's
 * split view). Fetches with the signed-in user's token (the file route needs a Bearer token a plain <iframe src> cannot
 * send) and renders every format DocumentPreviewModal supports. Download is offered only when `canDownload`.
 *
 * Accessibility: role="dialog" + aria-modal in drawer mode, focus moves to the close button and back to the element that
 * opened it, Escape closes.
 *
 * A record whose file is gone from the server (410, QA R1-17 / R1-22) gets its own "file missing" state instead of the generic
 * error, with the way out the server named: `missingActions[recovery]` ({ label, onClick }) is shown as a button, e.g.
 * { upload_version: { label: "Upload it again", onClick } } for an admin on a company document.
 *
 * @param {{ open: boolean, documentId?: number, title?: string, canDownload?: boolean, inline?: boolean,
 *           fetcher?: () => Promise<{blob: Blob, filename: string}>, onClose: () => void,
 *           missingActions?: Record<string, { label: string, onClick: () => void }> }} props
 */
export default function FilePreviewDrawer({ open, documentId, title, canDownload = true, inline = false, fetcher, onClose, missingActions }) {
  const [state, setState] = useState({ status: "idle" });
  const closeRef = useRef(null);
  const returnFocus = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    let cancelled = false;
    let url = null;
    setState({ status: "loading" });
    const load = fetcher || (() => getDocumentFile(documentId));
    load()
      .then(({ blob, filename }) => {
        if (cancelled) return;
        const normalized = normalizePreviewBlob(blob, filename);
        url = URL.createObjectURL(normalized);
        setState({ status: "ready", blob: normalized, url, filename: filename || title || "document" });
      })
      .catch((e) => {
        if (cancelled) return;
        if (e?.status === 410) setState({ status: "missing", message: e.message, recovery: e.recovery || null });
        else setState({ status: "error", message: e?.message || "The file could not be opened." });
      });
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [open, documentId, fetcher, title]);

  useEffect(() => {
    if (!open || inline) return undefined;
    returnFocus.current = document.activeElement;
    closeRef.current?.focus();
    const onKey = (e) => { if (e.key === "Escape") onClose?.(); };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      if (returnFocus.current && typeof returnFocus.current.focus === "function") returnFocus.current.focus();
    };
  }, [open, inline, onClose]);

  const filename = state.filename || title || "document";
  const kind = useMemo(() => (state.blob ? detectPreviewKind(filename, state.blob.type, state.blob.type) : null), [state.blob, filename]);

  if (!open) return null;

  const panel = (
    <section
      role={inline ? "region" : "dialog"}
      aria-modal={inline ? undefined : "true"}
      aria-label={`Preview of ${filename}`}
      className={`flex h-full flex-col bg-white dark:bg-[#1e293b] ${inline ? "rounded-2xl border border-gray-200/80 dark:border-[#334155]" : "w-full max-w-3xl shadow-2xl"}`}
      onClick={(e) => e.stopPropagation()}
    >
      <header className="flex items-center justify-between gap-3 border-b border-gray-100 dark:border-[#334155] px-5 py-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-slate-900 dark:text-[#f1f5f9]">{title || filename}</p>
          {state.blob && (
            <p className="text-[11px] uppercase tracking-wide text-slate-500 dark:text-[#94a3b8]">
              {[fileExtension(filename).toUpperCase(), humanFileSize(state.blob.size)].filter(Boolean).join(" · ")}
            </p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {canDownload && state.status === "ready" && (
            <button type="button" onClick={() => saveBlobAs(state.blob, filename)}
              className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold text-blue-700 hover:bg-blue-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600">
              <Download size={14} aria-hidden="true" /> Download
            </button>
          )}
          <button ref={closeRef} type="button" onClick={onClose} aria-label="Close preview"
            className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600">
            <X size={18} aria-hidden="true" />
          </button>
        </div>
      </header>
      <div className="min-h-0 flex-1 overflow-auto p-4">
        {state.status === "loading" && (
          <div role="status" className="flex items-center justify-center gap-2 py-20 text-sm text-slate-500">
            <Loader2 size={18} className="animate-spin" aria-hidden="true" /> Opening…
          </div>
        )}
        {state.status === "error" && <DocumentErrorState message={state.message} />}
        {state.status === "missing" && <MissingFile message={state.message} action={missingActions?.[state.recovery]} />}
        {state.status === "ready" && (
          <PreviewBody key={`${filename}:${kind}`} kind={kind} blob={state.blob} url={state.url} filename={filename} />
        )}
      </div>
    </section>
  );

  if (inline) return panel;
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40" onClick={onClose} data-testid="preview-drawer-overlay">
      {panel}
    </div>
  );
}

/** The record is fine but its file is not on the server: say so plainly and offer the one thing that fixes it. */
export function MissingFile({ message, action }) {
  return (
    <div role="alert" data-testid="file-missing" className="flex flex-col items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 px-6 py-10 text-center text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-900/30 dark:text-amber-200">
      <FileWarning size={28} aria-hidden="true" />
      <p className="font-semibold">File missing on the server</p>
      <p className="max-w-sm">{message || "The file for this document is missing on the server."}</p>
      {action && (
        <button type="button" onClick={action.onClick}
          className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600">
          {action.label}
        </button>
      )}
    </div>
  );
}
