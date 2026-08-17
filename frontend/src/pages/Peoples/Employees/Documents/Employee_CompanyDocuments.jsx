import { useMemo, useState, useEffect } from "react";
import EmployeePageShell from "../../../../components/employee/EmployeePageShell";
import DocumentPreviewModal from "../../../../components/DocumentPreviewModal";
import { useDocumentFile } from "../../../../hooks/useDocumentFile";
import { getMyAssignedDocuments } from "../../../../service/hrService";
import {
  Search,
  FileText,
  ShieldCheck,
  BookOpen,
  Eye,
  Download,
  RefreshCw,
} from "lucide-react";

const CATEGORY_STYLES = {
  Policy: {
    icon: FileText,
    badge: "bg-blue-50 text-blue-700",
    tile: "bg-blue-50 text-blue-600",
  },
  Compliance: {
    icon: ShieldCheck,
    badge: "bg-amber-50 text-amber-700",
    tile: "bg-amber-50 text-amber-600",
  },
  Handbook: {
    icon: BookOpen,
    badge: "bg-emerald-50 text-emerald-700",
    tile: "bg-emerald-50 text-emerald-600",
  },
};

const CATEGORIES = ["All categories", "Policy", "Compliance", "Handbook"];

function normalizeCategory(doc) {
  const raw = String(doc.document_type || doc.type || doc.category || "").toLowerCase();
  if (raw.includes("policy")) return "Policy";
  if (raw.includes("compliance") || raw.includes("regulation")) return "Compliance";
  if (raw.includes("handbook") || raw.includes("guide") || raw.includes("manual")) return "Handbook";
  return "Policy";
}

function documentId(doc) {
  // Assigned-document rows carry the DocumentAssignment's own `id` at the
  // top level; the underlying HrDocument id (what /hr/documents/{id}/file
  // expects) is `document_id`. Falling back to `id` only applies when a doc
  // is the real HrDocument record itself (no assignment wrapper).
  return doc.document_id ?? doc.id;
}

function getFileType(doc) {
  const name = doc.file_name || doc.document_title || doc.title || doc.name || "";
  const ext = name.split(".").pop()?.toLowerCase();
  const map = { pdf: "PDF", doc: "DOCX", docx: "DOCX", xls: "XLSX", xlsx: "XLSX", png: "PNG", jpg: "JPG", jpeg: "JPG" };
  return map[ext] || "DOC";
}

function formatDate(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  return isNaN(d) ? "" : d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function DocumentCard({ doc, onView, onDownload, busy }) {
  const category = normalizeCategory(doc);
  const style = CATEGORY_STYLES[category];
  const Icon = style.icon;
  const name = doc.document_title || doc.title || doc.name || "Untitled";
  const fileType = getFileType(doc);
  const dateLabel = formatDate(doc.assigned_at || doc.created_at);

  return (
    <div className="bg-white dark:bg-[#1e293b] border border-gray-200 dark:border-[#334155] rounded-xl p-4 flex flex-col h-full">
      <div className="flex items-center justify-between mb-3">
        <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${style.tile}`}>
          <Icon size={18} aria-hidden="true" />
        </div>
        <span className={`text-xs px-2 py-0.5 rounded-md font-medium ${style.badge}`}>
          {category}
        </span>
      </div>

      <p className="font-medium text-sm text-gray-900 dark:text-[#f1f5f9] mb-1 line-clamp-2 min-h-[2.5rem]">{name}</p>
      <p className="text-xs text-gray-400 dark:text-[#94a3b8] mb-4">
        {fileType}{dateLabel ? ` \u00B7 ${dateLabel}` : ""}
      </p>

      <div className="mt-auto flex gap-2">
        <button
          onClick={() => onView(doc)}
          disabled={busy}
          className="flex-1 flex items-center justify-center gap-1.5 text-sm font-medium border border-gray-200 dark:border-[#334155] rounded-lg h-9 hover:bg-gray-50 dark:hover:bg-[#1e293b] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Eye size={15} aria-hidden="true" />
          View
        </button>
        <button
          onClick={() => onDownload(doc)}
          disabled={busy}
          aria-label={`Download ${name}`}
          className="w-9 h-9 flex items-center justify-center border border-gray-200 dark:border-[#334155] rounded-lg hover:bg-gray-50 dark:hover:bg-[#1e293b] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Download size={15} aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}

export default function CompanyDocuments() {
  const [docs, setDocs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [category, setCategory] = useState("All categories");
  const [query, setQuery] = useState("");

  const loadDocs = () => {
    setLoading(true);
    setError(null);
    getMyAssignedDocuments()
      .then((res) => {
        const raw = res?.data;
        const items = Array.isArray(raw) ? raw : raw?.items || raw?.data || [];
        setDocs(items);
      })
      .catch((err) => {
        setError(err?.message || "Failed to load company documents");
        setDocs([]);
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadDocs();
  }, []);

  const filtered = useMemo(() => {
    return docs.filter((doc) => {
      const docCategory = normalizeCategory(doc);
      const matchesCategory =
        category === "All categories" || docCategory === category;
      const name = doc.document_title || doc.title || doc.name || "";
      const matchesQuery = name.toLowerCase().includes(query.toLowerCase());
      return matchesCategory && matchesQuery;
    });
  }, [docs, category, query]);

  const { preview, busyId, fileError, view, download, closePreview, downloadFromPreview } = useDocumentFile();

  return (
    <EmployeePageShell
      title="Company documents"
      subtitle="Documents shared with you by the company"
    >
      <div className="space-y-6">

        {/* Toolbar */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-center gap-2 flex-wrap">
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="text-sm border border-gray-200 dark:border-[#334155] rounded-lg px-3 py-2 bg-white dark:bg-[#0f172a] focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-300 text-gray-800 dark:text-[#e2e8f0]"
            >
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>

            <div className="relative">
              <Search
                size={15}
                className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 dark:text-[#64748b]"
                aria-hidden="true"
              />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search documents..."
                className="text-sm border border-gray-200 dark:border-[#334155] rounded-lg pl-8 pr-3 py-2 w-52 bg-white dark:bg-[#0f172a] focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-300 text-gray-800 dark:text-[#e2e8f0]"
              />
            </div>
          </div>

          <button
            onClick={loadDocs}
            className="flex items-center gap-1.5 text-sm font-medium text-slate-600 dark:text-[#94a3b8] border border-gray-200 dark:border-[#334155] bg-white dark:bg-[#1e293b] px-4 py-2 rounded-lg hover:bg-gray-50 dark:hover:bg-[#0f172a] self-start sm:self-center"
          >
            <RefreshCw size={14} />
            Refresh
          </button>
        </div>

        {/* Content */}
        {(error || fileError) && (
          <div className="text-center py-4 text-rose-500 text-sm font-medium bg-rose-50 dark:bg-red-900/30 rounded-xl border border-rose-100 dark:border-red-800 dark:text-red-300 p-6">
            {error || fileError}
          </div>
        )}
        {loading ? (
          <div className="flex items-center justify-center gap-3 py-20 text-gray-400 dark:text-[#94a3b8]">
            <RefreshCw size={18} className="animate-spin text-blue-400" />
            <span className="text-sm">Loading documents...</span>
          </div>
        ) : error ? null : filtered.length > 0 ? (
          <>
            <p className="text-xs text-slate-400 dark:text-[#94a3b8] font-medium">
              {filtered.length} document{filtered.length !== 1 ? "s" : ""}
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {filtered.map((doc) => (
                <DocumentCard
                  key={doc.id || doc.document_title}
                  doc={doc}
                  busy={busyId === documentId(doc)}
                  onView={(d) => view(documentId(d))}
                  onDownload={(d) => download(documentId(d))}
                />
              ))}
            </div>
          </>
        ) : (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="w-16 h-16 rounded-2xl bg-gray-100 dark:bg-[#0f172a] flex items-center justify-center mb-3">
              <FileText size={28} className="text-gray-300 dark:text-[#475569]" />
            </div>
            <p className="text-sm font-semibold text-gray-500 dark:text-[#94a3b8]">
              {query || category !== "All categories"
                ? "No documents match your search."
                : "No company documents yet."}
            </p>
            <p className="text-xs text-gray-400 dark:text-[#64748b] mt-1">
              {query || category !== "All categories"
                ? "Try adjusting your filters."
                : "Documents shared by the company will appear here."}
            </p>
          </div>
        )}

        <DocumentPreviewModal preview={preview} onClose={closePreview} onDownload={downloadFromPreview} />
      </div>
    </EmployeePageShell>
  );
}
