/*
 * In-app file viewer: PDFs in an iframe of a blob URL (page and zoom controls through the PDF open parameters), images
 * inline with zoom, anything else with a Download button. Opened through utils/fileViewer.js#openFile.
 */
import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, Download, FileText, X, ZoomIn, ZoomOut } from "lucide-react";
import { closeFileViewer, downloadBlob, getOpenFile, registerFileViewerHost, subscribeFileViewer } from "../utils/fileViewer.js";

const extOf = (name = "") => (/\.([a-z0-9]+)$/i.exec(name)?.[1] || "").toLowerCase();
export const viewerKind = (name, type = "") => {
  const ext = extOf(name);
  if (type === "application/pdf" || ext === "pdf") return "pdf";
  if (type.startsWith("image/") || ["png", "jpg", "jpeg", "gif", "webp"].includes(ext)) return "image";
  return "other";
};

const ctrl = "grid h-8 w-8 place-items-center rounded-lg text-slate-600 hover:bg-slate-100 disabled:opacity-40";

export default function FileViewerModal({ file, onClose }) {
  const [page, setPage] = useState(1);
  const [zoom, setZoom] = useState(100);
  useEffect(() => { setPage(file?.page || 1); setZoom(100); }, [file?.url, file?.page]);
  useEffect(() => {
    if (!file) return undefined;
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [file, onClose]);
  if (!file) return null;
  const kind = viewerKind(file.name, file.type);
  const pdfSrc = `${file.url}#page=${page}&zoom=${zoom}`;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-2 sm:p-4" data-testid="file-viewer">
      <div aria-hidden="true" className="absolute inset-0 bg-slate-900/50" onClick={onClose} />
      <div role="dialog" aria-modal="true" aria-label={`Preview of ${file.name}`}
        className="relative flex h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <header className="flex flex-wrap items-center gap-2 border-b border-slate-200 px-3 py-2 sm:px-4">
          <FileText className="h-4 w-4 shrink-0 text-blue-600" aria-hidden="true" />
          <p className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-900" title={file.name}>{file.name}</p>
          {kind === "pdf" && (
            <div className="flex items-center gap-1" aria-label="Page">
              <button type="button" className={ctrl} aria-label="Previous page" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
                <ChevronLeft className="h-4 w-4" />
              </button>
              <span className="min-w-[56px] text-center text-xs tabular-nums text-slate-600">Page {page}</span>
              <button type="button" className={ctrl} aria-label="Next page" onClick={() => setPage((p) => p + 1)}>
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          )}
          {kind !== "other" && (
            <div className="flex items-center gap-1">
              <button type="button" className={ctrl} aria-label="Zoom out" disabled={zoom <= 50} onClick={() => setZoom((z) => Math.max(50, z - 25))}>
                <ZoomOut className="h-4 w-4" />
              </button>
              <button type="button" onClick={() => setZoom(100)} aria-label="Reset zoom" className="min-w-[44px] text-xs tabular-nums text-slate-600 hover:underline">{zoom}%</button>
              <button type="button" className={ctrl} aria-label="Zoom in" disabled={zoom >= 300} onClick={() => setZoom((z) => Math.min(300, z + 25))}>
                <ZoomIn className="h-4 w-4" />
              </button>
            </div>
          )}
          <button type="button" onClick={() => downloadBlob(file.blob, file.name)}
            className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-semibold text-blue-600 hover:bg-blue-50">
            <Download className="h-3.5 w-3.5" />Download
          </button>
          <button type="button" onClick={onClose} aria-label="Close preview" className={ctrl}><X className="h-4 w-4" /></button>
        </header>
        <div className="min-h-0 flex-1 overflow-auto bg-slate-100">
          {kind === "pdf" && (
            <iframe key={pdfSrc} src={pdfSrc} title={`Preview of ${file.name}`} className="h-full w-full border-0 bg-white" />
          )}
          {kind === "image" && (
            <div className="flex min-h-full items-center justify-center p-3">
              <img src={file.url} alt={file.name} style={{ width: `${zoom}%`, maxWidth: zoom <= 100 ? "100%" : "none" }} className="h-auto rounded-lg bg-white shadow" />
            </div>
          )}
          {kind === "other" && (
            <div className="grid h-full place-items-center p-6 text-center text-sm text-slate-600">
              <div>
                <p>No preview for this file type.</p>
                <button type="button" onClick={() => downloadBlob(file.blob, file.name)}
                  className="mt-3 inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700">
                  <Download className="h-4 w-4" />Download {file.name}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/** Draws whatever openFile(…, "preview") opened. Mount once (it is also auto-mounted on first use). */
export function FileViewerHost() {
  const [file, setFile] = useState(getOpenFile());
  useEffect(() => {
    const unregister = registerFileViewerHost();
    const unsubscribe = subscribeFileViewer(setFile);
    setFile(getOpenFile());
    return () => { unsubscribe(); unregister(); };
  }, []);
  return <FileViewerModal file={file} onClose={closeFileViewer} />;
}
