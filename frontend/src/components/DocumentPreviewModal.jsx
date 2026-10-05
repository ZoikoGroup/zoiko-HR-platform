import { useEffect, useMemo, useRef, useState } from "react";
import { Download, X, FileText, Loader2, AlertTriangle, ZoomIn, ZoomOut, RotateCcw } from "lucide-react";
import DOMPurify from "dompurify";
import {
  detectPreviewKind, renderSheet, renderSlides, renderText, renderWord,
  PDF, IMAGE, TEXT, MARKDOWN, HTML, SHEET, WORD, SLIDES, UNSUPPORTED,
  fileExtension, humanFileSize,
} from "../utils/documentPreview";

/**
 * Renders a fetched document blob inline instead of navigating to it —
 * browsers are inconsistent about respecting inline vs. attachment behavior
 * for blob: URLs opened via window.open/new tab, and the file endpoint needs
 * a Bearer token that a plain <a href>/<iframe src> can't attach, so the blob
 * is previewed in-page.
 *
 * ZHR 44: this used to handle only PDF and images and showed "Preview not
 * available for this file type" for everything else — which is most of what
 * HR actually stores (docx, xls/xlsx, csv, txt, rtf, odt, pptx). Format
 * detection and the renderers live in utils/documentPreview.js.
 *
 * `preview` shape: { url, filename, mimeType, blob } | null — `url` must be
 * an object URL built from a blob already fetched with auth (see
 * service/hrService.js#getDocumentFile).
 */
export default function DocumentPreviewModal({ preview, onClose, onDownload }) {
  const [zoom, setZoom] = useState(1);
  const blob = preview?.blob || null;
  const filename = preview?.filename || "document";
  const kind = useMemo(
    () => (preview ? detectPreviewKind(filename, preview.mimeType, blob?.type) : UNSUPPORTED),
    [preview, filename, blob],
  );
  const ext = fileExtension(filename);

  if (!preview) return null;

  return (
    <div
      className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4"
      onClick={onClose}
      data-testid="preview-overlay"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Preview of ${filename}`}
        className="bg-doc-surface dark:bg-[#1e293b] rounded-xl max-w-5xl w-full p-5 border border-doc-border dark:border-[#334155] shadow-lg flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-4 mb-4 shrink-0">
          <div className="min-w-0">
            <p className="font-medium text-sm text-doc-ink dark:text-[#f1f5f9] truncate">{filename}</p>
            <p className="text-[11px] text-doc-ink-soft dark:text-[#94a3b8] uppercase tracking-wide">
              {[ext.toUpperCase(), humanFileSize(blob?.size)].filter(Boolean).join(" · ")}
            </p>
          </div>
          <div className="flex items-center gap-3 flex-shrink-0">
            {kind === IMAGE && (
              <div className="flex items-center gap-1">
                <button onClick={() => setZoom((z) => Math.max(0.25, +(z - 0.25).toFixed(2)))}
                  aria-label="Zoom out" className="p-1 rounded-md text-doc-ink-soft hover:bg-doc-surface-soft">
                  <ZoomOut className="w-4 h-4" />
                </button>
                <button onClick={() => setZoom(1)} aria-label="Reset zoom"
                  className="text-[11px] tabular-nums text-doc-ink-soft hover:underline min-w-[42px]">
                  {Math.round(zoom * 100)}%
                </button>
                <button onClick={() => setZoom((z) => Math.min(5, +(z + 0.25).toFixed(2)))}
                  aria-label="Zoom in" className="p-1 rounded-md text-doc-ink-soft hover:bg-doc-surface-soft">
                  <ZoomIn className="w-4 h-4" />
                </button>
                <button onClick={() => setZoom(1)} aria-label="Fit to window"
                  className="p-1 rounded-md text-doc-ink-soft hover:bg-doc-surface-soft">
                  <RotateCcw className="w-4 h-4" />
                </button>
              </div>
            )}
            {onDownload && (
              <button
                onClick={onDownload}
                className="inline-flex items-center gap-1.5 text-xs font-medium text-doc-primary dark:text-blue-300 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-doc-primary rounded"
              >
                <Download className="w-3.5 h-3.5" />
                Download
              </button>
            )}
            <button
              onClick={onClose}
              aria-label="Close preview"
              className="text-doc-ink-soft dark:text-[#94a3b8] hover:text-doc-ink dark:hover:text-gray-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-doc-primary rounded"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-auto">
          <PreviewBody
            key={`${filename}:${kind}`}
            kind={kind}
            blob={blob}
            url={preview.url}
            filename={filename}
            zoom={zoom}
          />
        </div>
      </div>
    </div>
  );
}

function PreviewBody({ kind, blob, url, filename, zoom }) {
  if (kind === PDF) {
    return (
      <div className="border border-doc-border dark:border-[#334155] rounded-lg overflow-hidden bg-white" style={{ height: "72vh" }}>
        <iframe src={url} title={filename} data-testid="preview-pdf" className="w-full h-full border-0" />
      </div>
    );
  }

  if (kind === IMAGE) {
    return (
      <div
        className="border border-doc-border dark:border-[#334155] rounded-lg overflow-auto flex items-center justify-center bg-doc-surface-soft dark:bg-[#0f172a]"
        style={{ minHeight: "200px", maxHeight: "72vh" }}
      >
        <img
          src={url}
          alt={filename}
          data-testid="preview-image"
          className="object-contain"
          style={{ width: `${zoom * 100}%`, maxWidth: zoom <= 1 ? "100%" : "none" }}
        />
      </div>
    );
  }

  if (kind === HTML) {
    return (
      <iframe
        src={url}
        title={filename}
        data-testid="preview-html"
        sandbox=""
        referrerPolicy="no-referrer"
        className="w-full border border-doc-border dark:border-[#334155] rounded-lg bg-white"
        style={{ height: "72vh" }}
      />
    );
  }

  if (kind === TEXT || kind === MARKDOWN || kind === SHEET ||
      kind === WORD || kind === SLIDES) {
    if (blob) return <AsyncPreview kind={kind} blob={blob} filename={filename} />;
  }

  return (
    <div className="border border-dashed border-doc-border dark:border-[#334155] rounded-lg h-64 flex flex-col items-center justify-center text-sm text-doc-ink-soft dark:text-[#94a3b8] gap-2 text-center px-6">
      <FileText size={32} className="text-slate-300 dark:text-[#475569]" />
      <p>Preview not available for this file type</p>
      <p className="text-xs">
        {fileExtension(filename)
          ? `.${fileExtension(filename)} files are not previewable in the browser.`
          : "The file type could not be determined."}{" "}
        Download it below to open in another application.
      </p>
    </div>
  );
}

function AsyncPreview({ kind, blob, filename }) {
  const [state, setState] = useState({ status: "loading" });
  const [activeSheet, setActiveSheet] = useState(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    setState({ status: "loading" });

    (async () => {
      try {
        if (kind === TEXT || kind === MARKDOWN) {
          const { text, truncated } = await renderText(blob);
          return { kind, text, truncated };
        }
        if (kind === SHEET) {
          return { kind, ...(await renderSheet(blob, filename)) };
        }
        if (kind === WORD) {
          return { kind, ...(await renderWord(blob, filename)) };
        }
        if (kind === SLIDES) {
          return { kind, ...(await renderSlides(blob, filename)) };
        }
        return { kind, error: "Unsupported preview type." };
      } catch (error) {
        return { kind, error: error?.message || "Could not render this document" };
      }
    })().then((result) => {
      if (cancelled || !mounted.current) return;
      setState({ status: "done", ...result });
      if (result.kind === SHEET) setActiveSheet(result.activeSheet || result.sheets?.[0]?.name || null);
    });

    return () => { cancelled = true; };
  }, [kind, blob, filename]);

  if (state.status === "loading") {
    return (
      <div className="h-64 flex flex-col items-center justify-center gap-3 text-doc-ink-soft" data-testid="preview-loading">
        <Loader2 className="w-6 h-6 animate-spin text-doc-primary" />
        <span className="text-sm font-medium">Preparing preview…</span>
      </div>
    );
  }

  if (state.error) {
    return (
      <div className="border border-rose-200 bg-rose-50 text-rose-700 rounded-lg p-4 flex items-start gap-3" data-testid="preview-error">
        <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-semibold">This document could not be previewed</p>
          <p className="text-xs mt-1">{state.error}</p>
          <p className="text-xs mt-1">Download it below to open it in another application.</p>
        </div>
      </div>
    );
  }

  if (state.kind === SHEET) {
    const sheet = state.sheets.find((s) => s.name === activeSheet) || state.sheets[0];
    if (!sheet) return null;
    return (
      <div className="space-y-3" data-testid="preview-sheet">
        {state.sheets.length > 1 && (
          <div className="flex flex-wrap gap-2" role="tablist" aria-label="Worksheets">
            {state.sheets.map((s) => (
              <button
                key={s.name}
                role="tab"
                aria-selected={s.name === sheet.name}
                onClick={() => setActiveSheet(s.name)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                  s.name === sheet.name
                    ? "bg-doc-primary text-white border-doc-primary"
                    : "bg-doc-surface border-doc-border text-doc-ink-soft hover:bg-doc-surface-soft"}`}
              >
                {s.name}
              </button>
            ))}
          </div>
        )}
        <div className="border border-doc-border dark:border-[#334155] rounded-lg overflow-auto" style={{ maxHeight: "62vh" }}>
          <table className="w-full text-xs border-collapse">
            <tbody>
              {sheet.rows.map((row, r) => (
                <tr key={r} className={r === 0 && !state.dense ? "bg-doc-surface-soft font-semibold" : "border-t border-doc-border/60"}>
                  {row.map((cell, c) => (
                    <td key={c} className="px-3 py-1.5 whitespace-pre-wrap break-words align-top">
                      {String(cell ?? "")}
                    </td>
                  ))}
                </tr>
              ))}
              {!sheet.rows.length && (
                <tr><td className="px-3 py-6 text-center text-doc-ink-soft">This sheet is empty</td></tr>
              )}
            </tbody>
          </table>
        </div>
        {sheet.truncated && (
          <p className="text-[11px] text-doc-ink-soft">
            Showing the first {sheet.rows.length} of {sheet.totalRows} rows — download the file for the full sheet.
          </p>
        )}
      </div>
    );
  }

  if (state.kind === WORD) {
    if (state.legacy || !state.html) {
      return (
        <div className="border border-amber-200 bg-amber-50 text-amber-800 rounded-lg p-4 flex items-start gap-3" data-testid="preview-legacy">
          <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold">This format cannot be rendered here</p>
            <p className="text-xs mt-1">{state.message || "No readable content was found in this file."}</p>
          </div>
        </div>
      );
    }
    return (
      <div className="space-y-2">
        <article
          data-testid="preview-word"
          className="prose-sm max-w-none border border-doc-border dark:border-[#334155] rounded-lg p-5 bg-white dark:bg-[#0f172a] text-slate-800 dark:text-slate-200 overflow-auto"
          style={{ maxHeight: "62vh" }}
          dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(state.html) }}
        />
        {state.messages?.length > 0 && (
          <p className="text-[11px] text-doc-ink-soft">
            Some formatting could not be reproduced: {state.messages.join("; ")}
          </p>
        )}
      </div>
    );
  }

  if (state.kind === SLIDES) {
    if (state.legacy || !state.slides?.length) {
      return (
        <div className="border border-amber-200 bg-amber-50 text-amber-800 rounded-lg p-4 flex items-start gap-3" data-testid="preview-legacy">
          <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold">This presentation cannot be rendered here</p>
            <p className="text-xs mt-1">{state.message || "No slide text could be extracted."}</p>
          </div>
        </div>
      );
    }
    return (
      <div className="space-y-3" data-testid="preview-slides">
        {state.slides.map((slide, i) => (
          <section key={slide.name || i} className="border border-doc-border dark:border-[#334155] rounded-lg p-4 bg-white dark:bg-[#0f172a]">
            <h3 className="text-xs font-bold uppercase tracking-wide text-doc-primary mb-2">Slide {i + 1}</h3>
            <pre className="whitespace-pre-wrap break-words text-sm text-slate-800 dark:text-slate-200 font-sans">
              {slide.text || "(no text on this slide)"}
            </pre>
          </section>
        ))}
      </div>
    );
  }

  if (state.kind === HTML) {
    return (
      <iframe
        src={url}
        title={filename}
        data-testid="preview-html"
        sandbox=""
        referrerPolicy="no-referrer"
        className="w-full border border-doc-border dark:border-[#334155] rounded-lg bg-white"
        style={{ height: "72vh" }}
      />
    );
  }

  return (
    <div className="space-y-2">
      <pre
        data-testid="preview-text"
        className="border border-doc-border dark:border-[#334155] rounded-lg p-4 bg-white dark:bg-[#0f172a] text-slate-800 dark:text-slate-200 text-xs whitespace-pre-wrap break-words overflow-auto"
        style={{ maxHeight: "62vh" }}
      >
        {state.text?.trim() || "(this file is empty)"}
      </pre>
      {state.truncated && (
        <p className="text-[11px] text-doc-ink-soft">
          This file is large — only the first 2 MB is shown. Download it to read everything.
        </p>
      )}
    </div>
  );
}