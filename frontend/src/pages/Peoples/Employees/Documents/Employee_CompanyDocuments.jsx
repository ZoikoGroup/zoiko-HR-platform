import { useEffect, useMemo, useState } from "react";
import { BookOpen, CheckCircle2, ClipboardList, FileText, GraduationCap, RefreshCw, Scale, Search, ShieldCheck } from "lucide-react";
import { EmployeeDocumentsLayout } from "../../../../modules/zoiko-hr/documents/ui";
import DocumentPreviewModal from "../../../../components/DocumentPreviewModal";
import DocumentRow from "../../../../components/documents/DocumentRow";
import DocumentEmptyState from "../../../../components/documents/DocumentEmptyState";
import DocumentErrorState from "../../../../components/documents/DocumentErrorState";
import IssuedDocumentsSection from "../../../../components/documents/IssuedDocumentsSection";
import { useDocumentFile } from "../../../../hooks/useDocumentFile";
import { acknowledgeCompanyDocument, getMyCompanyDocuments } from "../../../../service/documentsService";
import { formatDate } from "../../../../utils/dateTime";

// Company document categories (seeded keys) → icon and tint. Categories an organization adds get the neutral style.
const CATEGORY_STYLES = {
  company_policies: { icon: FileText, color: "#1D4ED8", bg: "#EFF6FF" },
  employee_handbook: { icon: BookOpen, color: "#059669", bg: "#ECFDF5" },
  forms_templates: { icon: ClipboardList, color: "#475569", bg: "#F1F5F9" },
  training: { icon: GraduationCap, color: "#DB2777", bg: "#FDF2F8" },
  compliance_legal: { icon: Scale, color: "#D97706", bg: "#FFFBEB" },
  health_safety: { icon: ShieldCheck, color: "#0E7490", bg: "#ECFEFF" },
};
const NEUTRAL = { icon: FileText, color: "#64748B", bg: "#F1F5F9" };
const ALL = "all";

/**
 * Employee → Company Documents (docs/new_docs/ZHR-DOCS-ARCH-001 §17 D3): only what the company's access rules share with
 * this person, grouped by category, with one toolbar and one Refresh. View-only files show a pill instead of Download, and
 * files that need a read-confirmation have an "I have read this" button. Documents issued to the person (offers, letters
 * to sign) stay at the top.
 */
export default function CompanyDocuments() {
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [category, setCategory] = useState(ALL);
  const [query, setQuery] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);
  const [issuedLoading, setIssuedLoading] = useState(true);
  const [acking, setAcking] = useState(null);
  const [notice, setNotice] = useState(null);
  // ?document=<id> (a read-confirmation in Documents to action links here): that file is highlighted.
  const focusId = Number(typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("document") : null) || null;

  const loadDocs = () => {
    setLoading(true);
    setError(null);
    getMyCompanyDocuments()
      .then((res) => setGroups(Array.isArray(res?.groups) ? res.groups : []))
      .catch((err) => { setError(err?.message || "Failed to load company documents"); setGroups([]); })
      .finally(() => setLoading(false));
  };
  useEffect(() => { loadDocs(); }, []);
  const refreshAll = () => { setRefreshKey((k) => k + 1); loadDocs(); };
  const pageLoading = loading || issuedLoading;

  const categories = useMemo(() => groups.map((g) => g.category).filter(Boolean), [groups]);
  const shownGroups = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return groups
      .filter((g) => category === ALL || String(g.category?.id ?? "") === category)
      .map((g) => ({ ...g, items: g.items.filter((i) => !needle || (i.title || "").toLowerCase().includes(needle)) }))
      .filter((g) => g.items.length > 0);
  }, [groups, category, query]);
  const total = shownGroups.reduce((n, g) => n + g.items.length, 0);
  const waiting = groups.reduce((n, g) => n + g.items.filter((i) => i.needs_ack).length, 0);

  const { preview, busyId, busyAction, fileError, view, download, closePreview, downloadFromPreview } = useDocumentFile();

  const acknowledge = async (item) => {
    setAcking(item.id);
    setNotice(null);
    try {
      const r = await acknowledgeCompanyDocument(item.id, item.version_id);
      setGroups((gs) => gs.map((g) => ({ ...g, items: g.items.map((i) => (i.id === item.id ? { ...i, needs_ack: false, acknowledged_at: r?.acknowledged_at || new Date().toISOString() } : i)) })));
      setNotice(`Thanks — you confirmed you have read “${item.title}”.`);
    } catch (e) {
      if (e?.code === "DOC_STALE_VERSION") { setNotice("This document was just updated. Here is the latest version."); loadDocs(); }
      else setNotice(e?.message || "That didn't work. Please try again.");
    } finally {
      setAcking(null);
    }
  };

  return (
    <EmployeeDocumentsLayout title="Company documents" subtitle="Documents the company has shared with you">
      <div className="space-y-6">
        <IssuedDocumentsSection embedded refreshKey={refreshKey} onLoadingChange={setIssuedLoading} />

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            <select value={category} onChange={(e) => setCategory(e.target.value)} aria-label="Filter by category"
              className="rounded-lg border border-doc-border bg-doc-surface px-3 py-2 text-sm text-doc-ink focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-doc-primary dark:border-[#334155] dark:bg-[#0f172a] dark:text-[#e2e8f0]">
              <option value={ALL}>All categories</option>
              {categories.map((c) => <option key={c.id} value={String(c.id)}>{c.name}</option>)}
            </select>
            <div className="relative">
              <Search size={15} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-doc-ink-soft dark:text-[#64748b]" aria-hidden="true" />
              <label htmlFor="company-docs-search" className="sr-only">Search documents</label>
              <input id="company-docs-search" type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search documents..."
                className="w-52 rounded-lg border border-doc-border bg-doc-surface py-2 pl-8 pr-3 text-sm text-doc-ink focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-doc-primary dark:border-[#334155] dark:bg-[#0f172a] dark:text-[#e2e8f0]" />
            </div>
          </div>
          <button type="button" onClick={refreshAll} disabled={pageLoading}
            className="flex items-center gap-1.5 self-start rounded-lg border border-doc-border bg-doc-surface px-4 py-2 text-sm font-medium text-doc-ink-soft hover:bg-doc-surface-soft focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-doc-primary sm:self-center dark:border-[#334155] dark:bg-[#1e293b] dark:text-[#94a3b8]">
            <RefreshCw size={14} aria-hidden="true" /> Refresh
          </button>
        </div>

        <DocumentErrorState message={error || fileError} />
        {notice && <p role="status" className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm">{notice}</p>}
        {pageLoading ? (
          <div role="status" className="flex items-center justify-center gap-3 py-20 text-doc-ink-soft dark:text-[#94a3b8]">
            <RefreshCw size={18} className="animate-spin text-doc-primary" aria-hidden="true" />
            <span className="text-sm">Loading documents...</span>
          </div>
        ) : error ? null : total > 0 ? (
          <>
            <p className="text-xs font-medium text-doc-ink-soft dark:text-[#94a3b8]">
              {total} document{total !== 1 ? "s" : ""}{waiting > 0 ? ` · ${waiting} waiting for your read-confirmation` : ""}
            </p>
            {shownGroups.map((g) => {
              const style = CATEGORY_STYLES[g.category?.key] || NEUTRAL;
              const label = g.category?.name || "Other";
              return (
                <section key={g.category?.id ?? "other"} aria-label={label} className="space-y-3">
                  <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200">{label}</h2>
                  {g.items.map((item) => (
                    <div key={item.id} className={focusId === item.id ? "rounded-xl ring-2 ring-blue-500" : undefined}>
                      <DocumentRow
                        icon={style.icon}
                        iconTone={{ bg: style.bg, color: style.color }}
                        title={item.title}
                        categoryBadge={{ label, color: style.color, bg: style.bg }}
                        meta={[item.updated_at ? `Updated ${formatDate(item.updated_at)}` : null,
                          item.expiry_date ? `Valid until ${formatDate(item.expiry_date)}` : null].filter(Boolean).join(" · ")}
                        onView={() => view(item.id)}
                        onDownload={item.can_download ? () => download(item.id) : undefined}
                        busy={busyId === item.id}
                        busyAction={busyAction}
                        actionsAfter={(
                          <>
                            {!item.can_download && (
                              <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600" title="The company shared this file to read online only">View only</span>
                            )}
                            {item.needs_ack ? (
                              <button type="button" onClick={() => acknowledge(item)} disabled={acking === item.id}
                                className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
                                aria-label={`I have read ${item.title}`}>
                                {acking === item.id ? "Saving…" : "I have read this"}
                              </button>
                            ) : item.acknowledged_at ? (
                              <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700">
                                <CheckCircle2 size={14} aria-hidden="true" /> Read {formatDate(item.acknowledged_at)}
                              </span>
                            ) : null}
                          </>
                        )}
                      />
                    </div>
                  ))}
                </section>
              );
            })}
          </>
        ) : (
          <DocumentEmptyState
            title={query || category !== ALL ? "No documents match your search." : "Nothing shared with you yet."}
            message={query || category !== ALL ? "Try adjusting your filters." : "Documents the company shares with you will appear here."}
          />
        )}

        <DocumentPreviewModal preview={preview} onClose={closePreview} onDownload={downloadFromPreview} />
      </div>
    </EmployeeDocumentsLayout>
  );
}
