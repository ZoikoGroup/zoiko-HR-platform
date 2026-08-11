import { useEffect, useRef, useState, useCallback } from "react";
import EmployeePageShell from "../../../../components/employee/EmployeePageShell";
import EmployeeStatusBadge from "../../../../components/employee/EmployeeStatusBadge";
import { uploadDocument, getDocuments, deleteDocument } from "../../../../service/employee";
import { API_BASE_URL } from "../../../../service/api";
import {
  UploadCloud, FileText, X, Check,
  Clock, AlertCircle, Download, RefreshCw, CloudUpload, Trash2
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

const STATUS_META = {
  pending:  { Icon: Clock },
  approved: { Icon: Check },
  rejected: { Icon: X },
  expired:  { Icon: AlertCircle },
};

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
    pdf: "#DC2626", jpg: "#7C3AED", jpeg: "#7C3AED", png: "#7C3AED",
    doc: "#2563EB", docx: "#2563EB", xls: "#059669", xlsx: "#059669",
    csv: "#D97706", txt: "#6B7280",
  };
  return map[ext] || "#4F46E5";
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
          file_url: d.file_url || d.url || d.download_url || null,
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
          <div
            className="flex items-center gap-3 px-5 py-4 rounded-2xl border"
            style={{ background: "#D1FAE5", borderColor: "#6EE7B7" }}
          >
            <span
              className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
              style={{ background: "#059669" }}
            >
              <Check size={16} className="text-white" />
            </span>
            <div>
              <p className="text-sm font-semibold" style={{ color: "#065F46" }}>File uploaded successfully!</p>
              <p className="text-xs" style={{ color: "#047857" }}>Your document has been submitted and is pending HR review.</p>
            </div>
            <button onClick={() => setUploadSuccess(false)} className="ml-auto text-emerald-600 hover:text-emerald-800">
              <X size={16} />
            </button>
          </div>
        )}

        {/* DELETE ERROR BANNER */}
        {deleteError && (
          <div
            className="flex items-center gap-3 px-5 py-4 rounded-2xl border"
            style={{ background: "#FEF2F2", borderColor: "#FCA5A5" }}
          >
            <AlertCircle size={16} style={{ color: "#DC2626" }} className="flex-shrink-0" />
            <p className="text-sm" style={{ color: "#DC2626" }}>{deleteError}</p>
            <button onClick={() => setDeleteError(null)} className="ml-auto" style={{ color: "#DC2626" }}>
              <X size={16} />
            </button>
          </div>
        )}

        {/* UPLOAD CARD */}
        <div className="bg-white dark:bg-[#1e293b] rounded-3xl border border-gray-200 dark:border-[#334155] shadow-sm overflow-hidden">
          {/* header */}
          <div
            className="px-8 pt-8 pb-6 border-b border-gray-100"
            style={{ background: "linear-gradient(135deg, #F8F5FF 0%, #EEF2FF 100%)" }}
          >
            <div className="flex items-center gap-4">
              <div
                className="w-12 h-12 rounded-2xl flex items-center justify-center"
                style={{ background: "linear-gradient(135deg, #6C3BFF, #4F46E5)" }}
              >
                <CloudUpload size={22} className="text-white" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-gray-900 dark:text-[#f1f5f9]">Upload Document</h2>
                <p className="text-sm text-gray-500 dark:text-[#94a3b8] mt-0.5">
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
                className="relative flex flex-col items-center justify-center gap-4 rounded-2xl border-2 border-dashed cursor-pointer transition-all duration-200"
                style={{
                  borderColor: dragActive ? "#6C3BFF" : "#D1D5DB",
                  background: dragActive
                    ? "linear-gradient(135deg, #F3EEFF 0%, #EEF2FF 100%)"
                    : "#FAFAFA",
                  minHeight: "220px",
                }}
              >
                <div
                  className="w-20 h-20 rounded-full flex items-center justify-center transition-transform duration-200"
                  style={{
                    background: dragActive ? "#6C3BFF22" : "#F3F4F6",
                    transform: dragActive ? "scale(1.12)" : "scale(1)",
                  }}
                >
                  <UploadCloud
                    size={36}
                    style={{ color: dragActive ? "#6C3BFF" : "#9CA3AF" }}
                  />
                </div>

                <div className="text-center">
                  <p className="text-base font-semibold text-gray-700 dark:text-[#e2e8f0]">
                    {dragActive ? "Drop file here" : "Drag & drop your file here"}
                  </p>
                  <p className="text-sm text-gray-400 dark:text-[#94a3b8] mt-1">or</p>
                  <span
                    className="inline-block mt-2 px-5 py-2 rounded-xl text-sm font-semibold text-white"
                    style={{ background: "linear-gradient(135deg, #6C3BFF, #4F46E5)" }}
                  >
                    Browse Files
                  </span>
                </div>

                <p className="text-xs text-gray-400 dark:text-[#64748b]">
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
              <div
                className="flex items-center gap-4 px-5 py-4 rounded-2xl border"
                style={{ background: "#F8F5FF", borderColor: "#C4B5FD" }}
              >
                <div
                  className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0"
                  style={{
                    background: fileTypeColor(selectedFile.name) + "18",
                    color: fileTypeColor(selectedFile.name)
                  }}
                >
                  <FileText size={22} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-900 dark:text-[#f1f5f9] truncate">{selectedFile.name}</p>
                  <p className="text-xs text-gray-500 dark:text-[#94a3b8] mt-0.5">{formatBytes(selectedFile.size)}</p>
                </div>
                <button
                  onClick={clearFile}
                  className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-gray-200 dark:hover:bg-[#334155] transition"
                >
                  <X size={14} className="text-gray-500" />
                </button>
              </div>
            )}

            {/* Document type selector */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 dark:text-[#e2e8f0] mb-2">
                Document Type
              </label>
              <select
                value={docType}
                onChange={(e) => setDocType(e.target.value)}
                className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-[#334155] text-sm bg-white dark:bg-[#0f172a] focus:outline-none focus:ring-2 focus:ring-indigo-400 text-gray-800 dark:text-[#e2e8f0]"
              >
                {DOC_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </div>

            {/* Upload error */}
            {uploadError && (
              <div
                className="flex items-center gap-2 px-4 py-3 rounded-xl border text-sm"
                style={{ background: "#FEF2F2", borderColor: "#FCA5A5", color: "#DC2626" }}
              >
                <AlertCircle size={15} className="flex-shrink-0" />
                {uploadError}
              </div>
            )}

            {/* Upload button */}
            <button
              onClick={handleUpload}
              disabled={!selectedFile || uploading}
              className="w-full flex items-center justify-center gap-2.5 py-3.5 rounded-xl text-sm font-semibold text-white transition-all duration-150 disabled:opacity-50 disabled:cursor-not-allowed"
              style={{
                background: selectedFile && !uploading
                  ? "linear-gradient(135deg, #6C3BFF, #4F46E5)"
                  : "#A5B4FC",
                boxShadow: selectedFile && !uploading
                  ? "0 4px 20px rgba(108, 59, 255, 0.35)"
                  : "none",
              }}
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

            <p className="text-xs text-center text-gray-400 dark:text-[#64748b]">
              Uploaded files will be reviewed by HR &middot; Your data is encrypted &amp; secure
            </p>
          </div>
        </div>

        {/* UPLOADED FILES LIST */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-base font-bold text-gray-900 dark:text-[#f1f5f9]">
              Your Uploaded Files
              {uploads.length > 0 && (
                <span className="ml-2 px-2 py-0.5 rounded-full text-xs font-semibold bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300">
                  {uploads.length}
                </span>
              )}
            </h3>
            <button
              onClick={loadUploads}
              className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-[#94a3b8] hover:text-indigo-600 dark:hover:text-indigo-400 transition font-medium px-3 py-1.5 rounded-lg hover:bg-indigo-50 dark:hover:bg-indigo-900/20"
            >
              <RefreshCw size={12} />
              Refresh
            </button>
          </div>

          {loading ? (
            <div className="flex items-center justify-center gap-3 py-14 text-gray-400 dark:text-[#94a3b8]">
              <RefreshCw size={18} className="animate-spin text-indigo-400" />
              <span className="text-sm">Loading your files&hellip;</span>
            </div>
          ) : fetchError ? (
            <div
              className="flex items-center gap-2 px-4 py-3 rounded-xl border text-sm"
              style={{ background: "#FEF2F2", borderColor: "#FCA5A5", color: "#DC2626" }}
            >
              <AlertCircle size={15} />
              {fetchError}
            </div>
          ) : uploads.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 py-16 bg-white dark:bg-[#1e293b] rounded-2xl border border-dashed border-gray-200 dark:border-[#334155]">
              <div className="w-16 h-16 rounded-2xl bg-gray-100 dark:bg-[#0f172a] flex items-center justify-center">
                <FileText size={28} className="text-gray-300 dark:text-[#475569]" />
              </div>
              <p className="text-sm font-semibold text-gray-500 dark:text-[#94a3b8]">No files uploaded yet</p>
              <p className="text-xs text-gray-400 dark:text-[#64748b]">Upload your first document using the panel above.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {uploads.map((f) => {
                const name = f.title || f.name || f.document_type || "Untitled";
                const iconColor = fileTypeColor(name);
                const statusKey = (f.status || "pending").toLowerCase();
                const meta = STATUS_META[statusKey] || STATUS_META.pending;
                const StatusIcon = meta.Icon;
                const downloadUrl = f.file_url || f.url
                  || (f.file_path ? (API_BASE_URL + "/" + f.file_path.replace(/\\/g, "/")) : null);
                const dateLabel = f.created_at ? formatDate(f.created_at)
                  : f.updated_at ? formatDate(f.updated_at) : "";
                const isDeleting = deletingId === f.id;

                return (
                  <div
                    key={f.id || name}
                    className="flex items-center gap-4 px-5 py-4 bg-white dark:bg-[#1e293b] rounded-2xl border border-gray-100 dark:border-[#334155] shadow-sm hover:shadow-md hover:border-indigo-100 dark:hover:border-indigo-800 transition-all duration-200"
                    style={{ opacity: isDeleting ? 0.5 : 1 }}
                  >
                    {/* file type icon */}
                    <div
                      className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0"
                      style={{ background: iconColor + "15", color: iconColor }}
                    >
                      <FileText size={20} />
                    </div>

                    {/* info */}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-gray-900 dark:text-[#f1f5f9] truncate">{name}</p>
                      <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                        {f.document_type && f.document_type !== name && (
                          <span className="text-xs text-gray-400 dark:text-[#94a3b8]">{f.document_type}</span>
                        )}
                        {dateLabel && (
                          <span className="text-xs text-gray-400 dark:text-[#94a3b8]">{dateLabel}</span>
                        )}
                      </div>
                    </div>

                    {/* status badge */}
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      <StatusIcon size={11} className="dark:text-[#94a3b8]" />
                      <EmployeeStatusBadge status={statusKey} />
                    </div>

                    {/* download */}
                    {downloadUrl && (
                      <a
                        href={downloadUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="w-9 h-9 flex items-center justify-center rounded-xl border border-gray-200 dark:border-[#334155] text-gray-400 dark:text-[#64748b] hover:text-indigo-600 dark:hover:text-indigo-400 hover:border-indigo-300 dark:hover:border-indigo-700 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 transition-all flex-shrink-0"
                        title="Download"
                      >
                        <Download size={15} />
                      </a>
                    )}

                    {/* delete */}
                    <button
                      onClick={() => handleDelete(f.id, name)}
                      disabled={isDeleting}
                      className="w-9 h-9 flex items-center justify-center rounded-xl border transition-all flex-shrink-0 disabled:cursor-not-allowed"
                      style={{
                        borderColor: isDeleting ? "#FCA5A5" : "#FEE2E2",
                        background: isDeleting ? "#FEF2F2" : "white",
                        color: isDeleting ? "#FCA5A5" : "#EF4444",
                      }}
                      onMouseEnter={e => {
                        if (!isDeleting) {
                          e.currentTarget.style.background = "#FEF2F2";
                          e.currentTarget.style.borderColor = "#F87171";
                        }
                      }}
                      onMouseLeave={e => {
                        if (!isDeleting) {
                          e.currentTarget.style.background = "white";
                          e.currentTarget.style.borderColor = "#FEE2E2";
                        }
                      }}
                      title="Delete file"
                    >
                      {isDeleting
                        ? <RefreshCw size={14} className="animate-spin" />
                        : <Trash2 size={15} />
                      }
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>

      </div>
    </EmployeePageShell>
  );
}
