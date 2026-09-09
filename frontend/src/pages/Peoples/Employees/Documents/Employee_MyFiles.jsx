import { useEffect, useRef, useState, useCallback } from "react";
import EmployeePageShell from "../../../../components/employee/EmployeePageShell";
import DocumentPreviewModal from "../../../../components/DocumentPreviewModal";
import DocumentRow from "../../../../components/documents/DocumentRow";
import DocumentEmptyState from "../../../../components/documents/DocumentEmptyState";
import DocumentErrorState from "../../../../components/documents/DocumentErrorState";
import { useDocumentFile } from "../../../../hooks/useDocumentFile";
import { uploadDocument, getDocuments, deleteDocument } from "../../../../service/employee";
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
  /* upload state */
  const [selectedFile, setSelectedFile]   = useState(null);
  const [docType,      setDocType]        = useState("Other");
  const [uploading,    setUploading]      = useState(false);
  const [uploadError,  setUploadError]    = useState(null);
  const [uploadSuccess,setUploadSuccess]  = useState(false);
  const [dragActive,   setDragActive]     = useState(false);

  /* history state */
  const [uploads,    setUploads]    = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [fetchError, setFetchError] = useState(null);

  /* delete state */
  const [deletingId,  setDeletingId]  = useState(null);
  const [deleteError, setDeleteError] = useState(null);

  const inputRef = useRef(null);

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

  // drag handlers ────────────────────────────────────────────────────────────
  const handleDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(e.type === "dragenter" || e.type === "dragover");
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    const file = e.dataTransfer.files?.[0];
    if (file) pickFile(file);
  };

  const pickFile = (file) => {
    setSelectedFile(file);
    setUploadError(null);
    setUploadSuccess(false);
  };

  const handleFileInput = (e) => {
    const file = e.target.files?.[0];
    if (file) pickFile(file);
    if (inputRef.current) inputRef.current.value = "";
  };

  const clearFile = () => {
    setSelectedFile(null);
    setUploadError(null);
    setUploadSuccess(false);
  };

  // upload ───────────────────────────────────────────────────────────────────
  const handleUpload = async () => {
    if (!selectedFile) return;
    setUploading(true);
    setUploadError(null);
    setUploadSuccess(false);
    try {
      const form = new FormData();
      form.append("file", selectedFile);
      form.append("category", "employee");
      form.append("document_type", docType);
      form.append("title", selectedFile.name);

      const uploadResponse = await uploadDocument(form);
      const uploadedDoc = uploadResponse?.data ?? uploadResponse;

      if (uploadedDoc && typeof uploadedDoc === "object") {
        setUploads((prev) => {
          const normalizedDoc = {
            ...uploadedDoc,
            title: uploadedDoc.title || selectedFile.name,
            document_type: uploadedDoc.document_type || docType,
            status: uploadedDoc.status || "pending",
            category: uploadedDoc.category || "employee",
          };

          return [...prev.filter((item) => item.id !== normalizedDoc.id), normalizedDoc];
        });
      }

      setUploadSuccess(true);
      setSelectedFile(null);
      setDocType("Other");
    } catch (err) {
      setUploadError(err?.message || "Upload failed. Please try again.");
    } finally {
      setUploading(false);
    }
  };

  // delete single ────────────────────────────────────────────────────────────
  const handleDelete = async (id, name) => {
    if (!window.confirm(`Delete "${name}"? This cannot be undone.`)) return;
    setDeletingId(id);
    setDeleteError(null);
    try {
      await deleteDocument(id);
      setUploads(prev => prev.filter(f => f.id !== id));
    } catch (err) {
      setDeleteError(err?.message || "Delete failed. Please try again.");
    } finally {
      setDeletingId(null);
    }
  };

  // render ───────────────────────────────────────────────────────────────────
  return (
    <EmployeePageShell title="My Files" subtitle="Upload and manage your personal documents.">
      <div className="max-w-4xl mx-auto space-y-8">

        {/* SUCCESS BANNER */}
        {uploadSuccess && (
          <div className="flex items-center gap-3 px-5 py-4 rounded-2xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-900/30">
            <span className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 bg-emerald-600">
              <Check size={16} className="text-white" />
            </span>
            <div>
              <p className="text-sm font-semibold text-emerald-800 dark:text-emerald-300">File uploaded successfully!</p>
              <p className="text-xs text-emerald-700 dark:text-emerald-400">Your document has been submitted and is pending HR review.</p>
            </div>
            <button onClick={() => setUploadSuccess(false)} className="ml-auto text-emerald-600 hover:text-emerald-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-doc-primary rounded">
              <X size={16} />
            </button>
          </div>
        )}

        {/* DELETE ERROR */}
        <DocumentErrorState message={deleteError} />

        {/* UPLOAD CARD */}
        <div className="bg-doc-surface dark:bg-[#1e293b] rounded-3xl border border-doc-border dark:border-[#334155] shadow-sm overflow-hidden">
          {/* header */}
          <div className="px-8 pt-8 pb-6 border-b border-doc-border dark:border-[#334155] bg-doc-surface-soft dark:bg-[#0f172a]/40">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-2xl flex items-center justify-center bg-doc-primary">
                <CloudUpload size={22} className="text-white" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-doc-ink dark:text-[#f1f5f9]">Upload Document</h2>
                <p className="text-sm text-doc-ink-soft dark:text-[#94a3b8] mt-0.5">
                  Supports PDF, Word, Excel, Images and more &middot; Max 10 MB
                </p>
              </div>
            </div>
          </div>

          {/* body */}
          <div className="px-8 py-8 space-y-6">

            {/* Drop zone / selected file */}
            {!selectedFile ? (
              <div
                onDragEnter={handleDrag}
                onDragOver={handleDrag}
                onDragLeave={() => setDragActive(false)}
                onDrop={handleDrop}
                onClick={() => inputRef.current?.click()}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); inputRef.current?.click(); } }}
                role="button"
                tabIndex={0}
                className={`relative flex flex-col items-center justify-center gap-4 rounded-2xl border-2 border-dashed cursor-pointer transition-all duration-200 min-h-[220px] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-doc-primary ${
                  dragActive
                    ? "border-doc-primary bg-doc-primary/5"
                    : "border-doc-border dark:border-[#334155] bg-doc-surface-soft dark:bg-[#0f172a]/40"
                }`}
              >
                <div
                  className={`w-20 h-20 rounded-full flex items-center justify-center transition-transform duration-200 ${
                    dragActive ? "bg-doc-primary/10 scale-110" : "bg-doc-border/40 dark:bg-[#334155]/40"
                  }`}
                >
                  <UploadCloud size={36} className={dragActive ? "text-doc-primary" : "text-doc-ink-soft dark:text-[#64748b]"} />
                </div>

                <div className="text-center">
                  <p className="text-base font-semibold text-doc-ink dark:text-[#e2e8f0]">
                    {dragActive ? "Drop file here" : "Drag & drop your file here"}
                  </p>
                  <p className="text-sm text-doc-ink-soft dark:text-[#94a3b8] mt-1">or</p>
                  <span className="inline-block mt-2 px-5 py-2 rounded-xl text-sm font-semibold text-white bg-doc-primary">
                    Browse Files
                  </span>
                </div>

                <p className="text-xs text-doc-ink-soft dark:text-[#64748b]">
                  PDF &middot; Word &middot; Excel &middot; Image &middot; CSV &middot; TXT
                </p>

                <input
                  ref={inputRef}
                  type="file"
                  accept={ACCEPT_TYPES.join(",")}
                  onChange={handleFileInput}
                  className="sr-only"
                />
              </div>
            ) : (
              <div className="flex items-center gap-4 px-5 py-4 rounded-2xl border border-doc-primary/30 bg-doc-primary/5">
                <div
                  className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0"
                  style={{ background: fileTypeColor(selectedFile.name) + "18", color: fileTypeColor(selectedFile.name) }}
                >
                  <FileText size={22} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-doc-ink dark:text-[#f1f5f9] truncate">{selectedFile.name}</p>
                  <p className="text-xs text-doc-ink-soft dark:text-[#94a3b8] mt-0.5">{formatBytes(selectedFile.size)}</p>
                </div>
                <button
                  onClick={clearFile}
                  className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-doc-border/60 dark:hover:bg-[#334155] transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-doc-primary"
                >
                  <X size={14} className="text-doc-ink-soft" />
                </button>
              </div>
            )}

            {/* Document type selector */}
            <div>
              <label htmlFor="my-files-doc-type" className="block text-sm font-semibold text-doc-ink dark:text-[#e2e8f0] mb-2">
                Document Type
              </label>
              <select
                id="my-files-doc-type"
                value={docType}
                onChange={(e) => setDocType(e.target.value)}
                className="w-full px-4 py-3 rounded-xl border border-doc-border dark:border-[#334155] text-sm bg-doc-surface dark:bg-[#0f172a] focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-doc-primary text-doc-ink dark:text-[#e2e8f0]"
              >
                {DOC_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </div>

            <DocumentErrorState message={uploadError} />

            {/* Upload button */}
            <button
              onClick={handleUpload}
              disabled={!selectedFile || uploading}
              className="w-full flex items-center justify-center gap-2.5 py-3.5 rounded-xl text-sm font-semibold text-white transition-all duration-150 disabled:opacity-50 disabled:cursor-not-allowed bg-doc-primary hover:bg-doc-primary-deep focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-doc-primary-deep"
            >
              {uploading ? (
                <>
                  <RefreshCw size={16} className="animate-spin" />
                  Uploading&hellip;
                </>
              ) : (
                <>
                  <UploadCloud size={16} />
                  Upload Document
                </>
              )}
            </button>

            <p className="text-xs text-center text-doc-ink-soft dark:text-[#64748b]">
              Uploaded files will be reviewed by HR &middot; Your data is encrypted &amp; secure
            </p>
          </div>
        </div>

        {/* UPLOADED FILES LIST */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-base font-bold text-doc-ink dark:text-[#f1f5f9]">
              Your Uploaded Files
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
              title="No files uploaded yet"
              message="Upload your first document using the panel above."
            />
          ) : (
            <div className="space-y-3 mt-3">
              {uploads.map((f) => {
                const id = documentId(f);
                const name = f.title || f.name || f.document_type || "Untitled";
                const iconColor = fileTypeColor(name);
                const isDeleting = deletingId === id;
                const dateLabel = f.created_at ? formatDate(f.created_at)
                  : f.updated_at ? formatDate(f.updated_at) : "";

                return (
                  <DocumentRow
                    key={id || name}
                    icon={FileText}
                    iconTone={{ bg: iconColor + "15", color: iconColor }}
                    title={name}
                    meta={[f.document_type && f.document_type !== name ? f.document_type : null, dateLabel].filter(Boolean).join(" · ")}
                    status={f.status}
                    onView={() => view(id)}
                    onDownload={() => download(id)}
                    busy={busyId === id}
                    busyAction={busyAction}
                    actionsAfter={
                      <button
                        type="button"
                        onClick={() => handleDelete(id, name)}
                        disabled={isDeleting}
                        aria-label={`Delete ${name}`}
                        className="w-9 h-9 flex items-center justify-center rounded-lg border border-red-200 dark:border-red-800/60 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-500"
                      >
                        {isDeleting ? <Loader2 size={15} className="animate-spin" /> : <Trash2 size={15} />}
                      </button>
                    }
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
