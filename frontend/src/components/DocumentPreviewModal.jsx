import { Download, X, FileText } from "lucide-react";

/**
 * Renders a fetched document blob inline (PDF/image) instead of navigating
 * to it — browsers are inconsistent about respecting inline vs. attachment
 * behavior for blob: URLs opened via window.open/new tab, so previewing is
 * done in-page via <iframe>/<img> instead.
 *
 * `preview` shape: { url, filename, mimeType } | null — `url` must be an
 * object URL built from a blob already fetched with auth (see
 * service/hrService.js#getDocumentFile).
 */
export default function DocumentPreviewModal({ preview, onClose, onDownload }) {
  if (!preview) return null;
  const { url, filename, mimeType } = preview;
  const isPdf = mimeType === "application/pdf" || /\.pdf$/i.test(filename || "");
  const isImage = mimeType?.startsWith("image/") || /\.(png|jpe?g|gif|webp)$/i.test(filename || "");

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white dark:bg-[#1e293b] rounded-xl max-w-2xl w-full p-5" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <p className="font-medium text-sm text-gray-900 dark:text-[#f1f5f9] truncate pr-4">{filename}</p>
          <div className="flex items-center gap-3 flex-shrink-0">
            {onDownload && (
              <button
                onClick={onDownload}
                className="inline-flex items-center gap-1.5 text-xs font-medium text-[#3B82F6] dark:text-blue-300 hover:underline"
              >
                <Download className="w-3.5 h-3.5" />
                Download
              </button>
            )}
            <button onClick={onClose} aria-label="Close preview" className="text-gray-400 dark:text-[#94a3b8] hover:text-gray-600 dark:hover:text-gray-300">
              <X size={18} />
            </button>
          </div>
        </div>

        {isPdf ? (
          <div className="border border-gray-200 dark:border-[#334155] rounded-lg overflow-hidden" style={{ height: "70vh" }}>
            <iframe src={url} title={filename} className="w-full h-full border-0" />
          </div>
        ) : isImage ? (
          <div className="border border-gray-200 dark:border-[#334155] rounded-lg overflow-hidden flex items-center justify-center bg-gray-50 dark:bg-[#0f172a]" style={{ minHeight: "200px" }}>
            <img src={url} alt={filename} className="max-w-full max-h-[70vh] object-contain" />
          </div>
        ) : (
          <div className="border border-dashed border-gray-200 dark:border-[#334155] rounded-lg h-64 flex flex-col items-center justify-center text-sm text-gray-400 dark:text-[#94a3b8] gap-2">
            <FileText size={32} className="text-gray-300 dark:text-[#475569]" />
            <p>Preview not available for this file type</p>
          </div>
        )}
      </div>
    </div>
  );
}
