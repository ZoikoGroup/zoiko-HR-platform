import { useMemo, useState, useEffect } from "react";
import EmployeePageShell from "../../../../components/employee/EmployeePageShell";
import DocumentPreviewModal from "../../../../components/DocumentPreviewModal";
import DocumentRow from "../../../../components/documents/DocumentRow";
import DocumentEmptyState from "../../../../components/documents/DocumentEmptyState";
import DocumentErrorState from "../../../../components/documents/DocumentErrorState";
import { useDocumentFile } from "../../../../hooks/useDocumentFile";
import { getMyAssignedDocuments } from "../../../../service/hrService";
import { Search, FileText, ShieldCheck, BookOpen, RefreshCw } from "lucide-react";

const CATEGORY_STYLES = {
  Policy: { icon: FileText, color: "#1D4ED8", bg: "#EFF6FF" },
  Compliance: { icon: ShieldCheck, color: "#D97706", bg: "#FFFBEB" },
  Handbook: { icon: BookOpen, color: "#059669", bg: "#ECFDF5" },
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

function formatDate(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  return isNaN(d) ? "" : d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
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

  const { preview, busyId, busyAction, fileError, view, download, closePreview, downloadFromPreview } = useDocumentFile();

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
              aria-label="Filter by category"
              className="text-sm border border-doc-border dark:border-[#334155] rounded-lg px-3 py-2 bg-doc-surface dark:bg-[#0f172a] focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-doc-primary text-doc-ink dark:text-[#e2e8f0]"
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
                className="absolute left-2.5 top-1/2 -translate-y-1/2 text-doc-ink-soft dark:text-[#64748b]"
                aria-hidden="true"
              />
              <label htmlFor="company-docs-search" className="sr-only">Search documents</label>
              <input
                id="company-docs-search"
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search documents..."
                className="text-sm border border-doc-border dark:border-[#334155] rounded-lg pl-8 pr-3 py-2 w-52 bg-doc-surface dark:bg-[#0f172a] focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-doc-primary text-doc-ink dark:text-[#e2e8f0]"
              />
            </div>
          </div>

          <button
            onClick={loadDocs}
            className="flex items-center gap-1.5 text-sm font-medium text-doc-ink-soft dark:text-[#94a3b8] border border-doc-border dark:border-[#334155] bg-doc-surface dark:bg-[#1e293b] px-4 py-2 rounded-lg hover:bg-doc-surface-soft dark:hover:bg-[#0f172a] self-start sm:self-center focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-doc-primary"
          >
            <RefreshCw size={14} />
            Refresh
          </button>
        </div>

        {/* Content */}
        <DocumentErrorState message={error || fileError} />
        {loading ? (
          <div className="flex items-center justify-center gap-3 py-20 text-doc-ink-soft dark:text-[#94a3b8]">
            <RefreshCw size={18} className="animate-spin text-doc-primary" />
            <span className="text-sm">Loading documents...</span>
          </div>
        ) : error ? null : filtered.length > 0 ? (
          <>
            <p className="text-xs text-doc-ink-soft dark:text-[#94a3b8] font-medium">
              {filtered.length} document{filtered.length !== 1 ? "s" : ""}
            </p>
            <div className="space-y-3">
              {filtered.map((doc) => {
                const category = normalizeCategory(doc);
                const style = CATEGORY_STYLES[category];
                const id = documentId(doc);
                const name = doc.document_title || doc.title || doc.name || "Untitled";
                const dateLabel = formatDate(doc.assigned_at || doc.created_at);
                return (
                  <DocumentRow
                    key={doc.id || doc.document_title}
                    icon={style.icon}
                    iconTone={{ bg: style.bg, color: style.color }}
                    title={name}
                    categoryBadge={{ label: category, color: style.color, bg: style.bg }}
                    meta={dateLabel}
                    onView={() => view(id)}
                    onDownload={() => download(id)}
                    busy={busyId === id}
                    busyAction={busyAction}
                  />
                );
              })}
            </div>
          </>
        ) : (
          <DocumentEmptyState
            title={query || category !== "All categories" ? "No documents match your search." : "No company documents yet."}
            message={query || category !== "All categories" ? "Try adjusting your filters." : "Documents shared by the company will appear here."}
          />
        )}

        <DocumentPreviewModal preview={preview} onClose={closePreview} onDownload={downloadFromPreview} />
      </div>
    </EmployeePageShell>
  );
}
