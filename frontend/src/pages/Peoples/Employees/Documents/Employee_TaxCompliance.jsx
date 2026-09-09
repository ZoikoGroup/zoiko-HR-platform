import { useEffect, useMemo, useState } from "react";
import EmployeePageShell from "../../../../components/employee/EmployeePageShell";
import { getDocuments } from "../../../../service/employee";
import { useDocumentFile } from "../../../../hooks/useDocumentFile";
import DocumentPreviewModal from "../../../../components/DocumentPreviewModal";
import DocumentRow from "../../../../components/documents/DocumentRow";
import DocumentEmptyState from "../../../../components/documents/DocumentEmptyState";
import DocumentErrorState from "../../../../components/documents/DocumentErrorState";
import { Loader2, ShieldCheck, Info, FileText } from "lucide-react";

const TYPE_META = {
  "form 16":      { icon: "📄", color: "#1D4ED8", bg: "#EFF6FF", label: "Form 16" },
  "tds":          { icon: "🏛️", color: "#7C3AED", bg: "#F5F3FF", label: "TDS Certificate" },
  "investment":   { icon: "📊", color: "#059669", bg: "#ECFDF5", label: "Investment Declaration" },
  "tax":          { icon: "📋", color: "#D97706", bg: "#FFFBEB", label: "Tax Document" },
  "compliance":   { icon: "🛡️", color: "#DC2626", bg: "#FEF2F2", label: "Compliance" },
};

function resolveTypeMeta(type) {
  const t = String(type || "").toLowerCase();
  for (const [key, meta] of Object.entries(TYPE_META)) {
    if (t.includes(key)) return meta;
  }
  return { icon: "📎", color: "#64748B", bg: "#F8FAFC", label: type || "Tax" };
}

export default function TaxCompliance() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [rawDocs, setRawDocs] = useState([]);
  const { preview, busyId, busyAction, fileError, view, download, closePreview, downloadFromPreview } = useDocumentFile();

  useEffect(() => {
    let mounted = true;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const res = await getDocuments({ category: "tax" });
        const data = res?.data || res?.items || res?.data?.items || [];
        if (mounted) setRawDocs(Array.isArray(data) ? data : []);
      } catch (e) {
        if (!mounted) return;
        setError(e?.message || "Failed to load tax documents");
        setRawDocs([]);
      } finally {
        if (mounted) setLoading(false);
      }
    }
    load();
    return () => { mounted = false; };
  }, []);

  const taxDocs = useMemo(() => {
    return rawDocs.map((d) => {
      const name = d.title || d.name || d.document_type || "Tax Document";
      const year = d.year || d.financial_year || d.fy || (d.created_at ? String(d.created_at).slice(0, 4) : "");
      const type = d.document_type || d.type || d.category || "tax";
      const id = d.id || d.document_id;
      const status = d.status;
      const meta = resolveTypeMeta(type);
      return { id, name, year, type, meta, status };
    });
  }, [rawDocs]);

  if (loading) {
    return (
      <EmployeePageShell title="Tax & Compliance" subtitle="Access your Form 16, TDS certificates, and investment declarations.">
        <div className="flex flex-col items-center justify-center py-20 gap-3">
          <Loader2 className="w-8 h-8 animate-spin text-doc-primary" />
          <span className="text-sm text-doc-ink-soft dark:text-[#94a3b8]">Loading tax documents...</span>
        </div>
      </EmployeePageShell>
    );
  }

  return (
    <EmployeePageShell title="Tax & Compliance" subtitle="Access your Form 16, TDS certificates, and investment declarations.">
      <div className="space-y-3 mb-6">
        <DocumentErrorState message={error} />
        <DocumentErrorState message={fileError} />
      </div>

      {!error && (
        <>
          {/* Info Banner */}
          <div className="mb-6 px-5 py-4 rounded-xl bg-doc-primary/5 dark:from-blue-900/20 dark:to-indigo-900/20 dark:bg-gradient-to-r border border-doc-primary/20 dark:border-blue-800/40 flex items-start gap-3">
            <div className="p-1.5 rounded-lg bg-doc-primary/10 dark:bg-blue-900/40 shrink-0 mt-0.5">
              <Info size={16} className="text-doc-primary dark:text-blue-400" />
            </div>
            <div>
              <p className="text-sm font-medium text-doc-ink dark:text-blue-200 m-0">Tax Filing Notice</p>
              <p className="text-xs text-doc-ink-soft dark:text-blue-400 m-0 mt-1">
                Form 16 for FY 2025-26 will be available by July 15, 2026. Please consult your tax advisor for filing.
              </p>
            </div>
          </div>

          {/* Document List */}
          {taxDocs.length === 0 ? (
            <DocumentEmptyState icon={ShieldCheck} title="No tax documents yet" message="Tax documents assigned to you will appear here." />
          ) : (
            <div className="space-y-3">
              {taxDocs.map((d) => (
                <DocumentRow
                  key={d.id}
                  icon={FileText}
                  iconTone={{ bg: d.meta.bg, color: d.meta.color }}
                  title={d.name}
                  status={d.status}
                  categoryBadge={{ label: d.meta.label, color: d.meta.color, bg: d.meta.bg }}
                  meta={d.year ? `FY ${d.year}` : ""}
                  onView={() => view(d.id)}
                  onDownload={() => download(d.id)}
                  busy={busyId === d.id}
                  busyAction={busyAction}
                />
              ))}
            </div>
          )}
        </>
      )}
      <DocumentPreviewModal preview={preview} onClose={closePreview} onDownload={downloadFromPreview} />
    </EmployeePageShell>
  );
}
