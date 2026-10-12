import { useEffect, useState, useCallback } from "react";
import EmployeePageShell from "../../../../components/employee/EmployeePageShell";
import DocumentPreviewModal from "../../../../components/DocumentPreviewModal";
import DocumentRow from "../../../../components/documents/DocumentRow";
import DocumentEmptyState from "../../../../components/documents/DocumentEmptyState";
import DocumentErrorState from "../../../../components/documents/DocumentErrorState";
import { useDocumentFile } from "../../../../hooks/useDocumentFile";
import { getDocuments } from "../../../../service/employee";
import {
  UploadCloud, FileText, X, Check,
  RefreshCw, CloudUpload, Trash2, Loader2
} from "lucide-react";

// ── helpers ────────────────────────────────────────────────────────────────

const ACCEPT_TYPES = [
  "image/*",
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/plain",
  ".csv",
];

const DOC_TYPES = [
  { value: "Identity",    label: "Identity Document" },
  { value: "Education",   label: "Education Certificate" },
  { value: "Employment",  label: "Employment Document" },
  { value: "Financial",   label: "Financial Record" },
  { value: "Medical",     label: "Medical Document" },
  { value: "Other",       label: "Other" },
];

function formatBytes(bytes) {
  if (!bytes || bytes === 0) return "";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
}

function formatDate(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  return isNaN(d) ? iso : d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

function fileTypeColor(filename) {
  const ext = ((filename || "").split(".").pop() || "").toLowerCase();
  const map = {
    pdf: "#DC2626", jpg: "#3B82F6", jpeg: "#3B82F6", png: "#3B82F6",
    doc: "#2563EB", docx: "#2563EB", xls: "#059669", xlsx: "#059669",
    csv: "#D97706", txt: "#64748B",
  };
  return map[ext] || "#64748B";
}

function documentId(doc) {
  return doc.id ?? doc.document_id;
}

// ── main component ────────────────────────────────────────────────────────

export default function MyFiles() {
  /* history state */
  const [uploads,    setUploads]    = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [fetchError, setFetchError] = useState(null);

  /* authenticated view/download — the ONE correct pattern (see useDocumentFile.js) */
  const { preview, busyId, busyAction, fileError, view, download, closePreview, downloadFromPreview } = useDocumentFile();

  // fetch uploaded docs ─────────────────────────────────────────────────────
  const loadUploads = useCallback(async () => {
    setLoading(true);
    setFetchError(null);
    try {
      const res = await getDocuments({ category: "employee" });
      const raw = res?.data ?? res;
      const payload = Array.isArray(raw)
        ? raw
        : Array.isArray(raw?.value) ? raw.value
        : Array.isArray(raw?.items) ? raw.items
        : Array.isArray(raw?.data) ? raw.data
        : [];

      const normalized = payload
        .filter(Boolean)
        .map((d) => ({
          ...d,
          id: d.id ?? d.document_id,
          title: d.title || d.name || d.file_name || "Untitled",
          document_type: d.document_type || d.type || "Other",
          category: d.category || d.document_category || "employee",
          status: d.status || "pending",
        }))
        .filter((d) => {
          const category = String(d.category || "").toLowerCase();
          if (category === "company") return false;
          if (d.is_company === true) return false;
          return true;
        });

      setUploads(normalized);
    } catch (e) {
      setFetchError(e?.message || "Failed to load your documents");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadUploads(); }, [loadUploads]);

  // render ───────────────────────────────────────────────────────────────────
  return (
    <EmployeePageShell title="My Files" subtitle="Documents your organization has shared with you. View and download only.">
      <div className="max-w-4xl mx-auto space-y-8">

        {/* UPLOADED FILES LIST */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-base font-bold text-doc-ink dark:text-[#f1f5f9]">
              Your Files
              {uploads.length > 0 && (
                <span className="ml-2 px-2 py-0.5 rounded-full text-xs font-semibold bg-doc-primary/10 dark:bg-blue-900/30 text-doc-primary dark:text-blue-300">
                  {uploads.length}
                </span>
              )}
            </h3>
            <button
              onClick={loadUploads}
              className="flex items-center gap-1.5 text-xs text-doc-ink-soft dark:text-[#94a3b8] hover:text-doc-primary dark:hover:text-blue-400 transition font-medium px-3 py-1.5 rounded-lg hover:bg-doc-primary/5 dark:hover:bg-blue-900/20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-doc-primary"
            >
              <RefreshCw size={12} />
              Refresh
            </button>
          </div>

          <DocumentErrorState message={fileError} />

          {loading ? (
            <div className="flex items-center justify-center gap-3 py-14 text-doc-ink-soft dark:text-[#94a3b8]">
              <RefreshCw size={18} className="animate-spin text-doc-primary" />
              <span className="text-sm">Loading your files&hellip;</span>
            </div>
          ) : fetchError ? (
            <DocumentErrorState message={fetchError} onRetry={loadUploads} />
          ) : uploads.length === 0 ? (
            <DocumentEmptyState
              title="No files yet"
              message="Documents your organization shares with you will appear here."
            />
          ) : (
            <div className="space-y-3 mt-3">
              {uploads.map((f) => {
                const id = documentId(f);
                const name = f.title || f.name || f.document_type || "Untitled";
                const iconColor = fileTypeColor(name);
                const dateLabel = f.created_at ? formatDate(f.created_at)
                  : f.updated_at ? formatDate(f.updated_at) : "";

                return (
                  <DocumentRow
                    key={id || name}
                    icon={FileText}
                    iconTone={{ bg: iconColor + "15", color: iconColor }}
                    title={name}
                    meta={[f.document_type && f.document_type !== name ? f.document_type : null, dateLabel].filter(Boolean).join(" · ")}
                    onView={() => view(id)}
                    onDownload={() => download(id)}
                    busy={busyId === id}
                    busyAction={busyAction}
                  />
                );
              })}
            </div>
          )}
        </div>

      </div>
      <DocumentPreviewModal preview={preview} onClose={closePreview} onDownload={downloadFromPreview} />
    </EmployeePageShell>
  );
}
