import { useEffect, useMemo, useState } from "react";
import EmployeePageShell from "../../../../components/employee/EmployeePageShell";
import { getDocuments } from "../../../../service/employee";
import { useDocumentFile } from "../../../../hooks/useDocumentFile";
import DocumentPreviewModal from "../../../../components/DocumentPreviewModal";
import { Download, Eye, Loader2, ShieldCheck, Info, FileText } from "lucide-react";

const TYPE_META = {
  "form 16":      { icon: "📄", color: "#3B82F6", bg: "#EFF6FF", label: "Form 16" },
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
  const { preview, busyId, busyAction, view, download, closePreview, downloadFromPreview } = useDocumentFile();

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
      const meta = resolveTypeMeta(type);
      return { id, name, year, type, meta };
    });
  }, [rawDocs]);

  if (loading) {
    return (
      <EmployeePageShell title="Tax & Compliance" subtitle="Access your Form 16, TDS certificates, and investment declarations.">
        <div className="flex flex-col items-center justify-center py-20 gap-3">
          <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
          <span className="text-sm text-gray-500 dark:text-[#94a3b8]">Loading tax documents...</span>
        </div>
      </EmployeePageShell>
    );
  }

  return (
    <EmployeePageShell title="Tax & Compliance" subtitle="Access your Form 16, TDS certificates, and investment declarations.">
      {error && (
        <div className="mb-6 px-5 py-4 rounded-xl bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 text-sm flex items-center gap-2">
          {error}
        </div>
      )}

      {!error && (
        <>
          {/* Info Banner */}
          <div className="mb-6 px-5 py-4 rounded-xl bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 border border-blue-200/60 dark:border-blue-800/40 flex items-start gap-3">
            <div className="p-1.5 rounded-lg bg-blue-100 dark:bg-blue-900/40 shrink-0 mt-0.5">
              <Info size={16} className="text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <p className="text-sm font-medium text-blue-900 dark:text-blue-200 m-0">Tax Filing Notice</p>
              <p className="text-xs text-blue-700 dark:text-blue-400 m-0 mt-1">
                Form 16 for FY 2025-26 will be available by July 15, 2026. Please consult your tax advisor for filing.
              </p>
            </div>
          </div>

          {/* Document List */}
          {taxDocs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="w-16 h-16 rounded-2xl bg-gray-100 dark:bg-gray-800 flex items-center justify-center mb-4">
                <ShieldCheck size={28} className="text-gray-300 dark:text-gray-600" />
              </div>
              <p className="text-base font-semibold text-gray-700 dark:text-gray-300 mb-1">No tax documents yet</p>
              <p className="text-sm text-gray-400 dark:text-gray-500">Tax documents assigned to you will appear here.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {taxDocs.map((d) => (
                <div
                  key={d.id}
                  className="group p-5 rounded-xl bg-white dark:bg-[#1e293b] border border-gray-200 dark:border-[#334155] hover:border-blue-200 dark:hover:border-blue-800/50 hover:shadow-md transition-all"
                >
                  <div className="flex items-center gap-4">
                    {/* Icon */}
                    <div
                      className="w-12 h-12 rounded-xl flex items-center justify-center text-xl shrink-0"
                      style={{ background: d.meta.bg, color: d.meta.color }}
                    >
                      {d.meta.icon}
                    </div>

                    {/* Info */}
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-bold text-gray-900 dark:text-[#f1f5f9] m-0 truncate">{d.name}</p>
                      <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                        <span
                          className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold"
                          style={{ color: d.meta.color, background: d.meta.bg }}
                        >
                          {d.meta.label}
                        </span>
                        {d.year && (
                          <>
                            <span className="text-gray-300 dark:text-gray-600">·</span>
                            <span className="text-xs text-gray-400 dark:text-gray-500">FY {d.year}</span>
                          </>
                        )}
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        onClick={() => view(d.id)}
                        disabled={busyId === d.id}
                        className="flex items-center gap-1.5 px-4 py-2 bg-blue-50 dark:bg-blue-900/30 hover:bg-blue-100 dark:hover:bg-blue-900/50 text-blue-700 dark:text-blue-300 rounded-lg text-xs font-semibold transition-colors disabled:opacity-50 border border-blue-100 dark:border-blue-800/30"
                      >
                        {busyId === d.id && busyAction === "view" ? <Loader2 size={14} className="animate-spin" /> : <Eye size={14} />}
                        View
                      </button>
                      <button
                        onClick={() => download(d.id)}
                        disabled={busyId === d.id}
                        className="flex items-center gap-1.5 px-4 py-2 bg-gray-100 dark:bg-[#0f172a] hover:bg-gray-200 dark:hover:bg-[#1e293b] text-gray-700 dark:text-[#e2e8f0] rounded-lg text-xs font-semibold transition-colors disabled:opacity-50 border border-gray-200 dark:border-[#334155]"
                      >
                        {busyId === d.id && busyAction === "download" ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
                        Download
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
      <DocumentPreviewModal preview={preview} onClose={closePreview} onDownload={downloadFromPreview} />
    </EmployeePageShell>
  );
}
