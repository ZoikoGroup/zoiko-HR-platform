import { useEffect, useMemo, useState } from "react";
import EmployeePageShell from "../../../../components/employee/EmployeePageShell";
import { getDocuments } from "../../../../service/employee";
import { API_BASE_URL } from "../../../../service/api";
import { Download, Check, X, Clock, AlertCircle, MessageSquare } from "lucide-react";

const typeColor = {
  Offer: { color: "#4F46E5", bg: "#EEF2FF" },
  Contract: { color: "#059669", bg: "#ECFDF5" },
  Legal: { color: "#DC2626", bg: "#FEF2F2" },
  Appraisal: { color: "#D97706", bg: "#FFFBEB" },
};

const STATUS_META = {
  pending:  { label: "Pending",  bg: "bg-amber-50 dark:bg-amber-900/30",   text: "text-amber-700 dark:text-amber-300",  Icon: Clock },
  approved: { label: "Approved", bg: "bg-emerald-50 dark:bg-emerald-900/30",  text: "text-emerald-700 dark:text-emerald-300", Icon: Check },
  rejected: { label: "Rejected", bg: "bg-rose-50 dark:bg-red-900/30",    text: "text-rose-700 dark:text-red-300",   Icon: X },
  expired:  { label: "Expired",  bg: "bg-slate-100 dark:bg-slate-800/30",  text: "text-slate-500 dark:text-slate-400",  Icon: AlertCircle },
};

function normalizeType(type) {
  const t = String(type || "").toLowerCase();
  if (t.includes("offer")) return "Offer";
  if (t.includes("contract")) return "Contract";
  if (t.includes("nda") || t.includes("legal") || t.includes("agreement")) return "Legal";
  if (t.includes("appraisal")) return "Appraisal";
  return "Other";
}

function getDownloadUrl(d) {
  if (d.file_url) return d.file_url;
  if (d.url) return d.url;
  if (d.file_path) return `${API_BASE_URL}/${d.file_path.replace(/\\/g, "/")}`;
  return null;
}

export default function OfferContracts() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [docs, setDocs] = useState([]);

  useEffect(() => {
    let mounted = true;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const res = await getDocuments({ category: "employee" });
        const data = res?.data || res?.items || res?.data?.items || [];
        if (!mounted) return;

        const arr = Array.isArray(data) ? data : [];
        const filtered = arr.filter((d) => {
          const title = String(d.title || d.name || "");
          const docType = String(d.document_type || d.type || "");
          const blob = `${title} ${docType}`.toLowerCase();
          return (
            blob.includes("offer") ||
            blob.includes("contract") ||
            blob.includes("nda") ||
            blob.includes("agreement") ||
            blob.includes("appraisal")
          );
        });

        setDocs(filtered);
      } catch (e) {
        if (!mounted) return;
        setError(e?.message || "Failed to load contracts");
        setDocs([]);
      } finally {
        if (mounted) setLoading(false);
      }
    }

    load();
    return () => {
      mounted = false;
    };
  }, []);

  const items = useMemo(() => {
    return docs
      .map((d) => {
        const title = d.title || d.name || d.document_type || d.id;
        const type = normalizeType(d.document_type || d.type || d.category || "");
        const size = d.size || "";
        const date = d.created_at || d.uploaded_at || d.updated_at || d.expiry_date || "";
        return { id: d.id, name: title, type, date, size, raw: d };
      })
      .sort((a, b) => String(b.date).localeCompare(String(a.date)));
  }, [docs]);

  return (
    <EmployeePageShell title="Offer & Contracts" subtitle="Your employment agreements, offer letters, and legal documents.">
      {loading && (
        <div className="flex justify-center items-center py-20">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
          <span className="ml-3 text-gray-500 dark:text-[#94a3b8]">Loading contracts...</span>
        </div>
      )}

      {!loading && error && (
        <div className="mb-4 px-4 py-3 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 rounded-lg">{error}</div>
      )}

      {!loading && !error && (
        <div className="space-y-4">
          {items.length === 0 ? (
            <div className="text-center py-12 text-gray-500 dark:text-[#94a3b8]">No offer/contracts found.</div>
          ) : (
            items.map((d) => {
              const colors = typeColor[d.type] || { color: "#4F46E5", bg: "#EEF2FF" };
              const raw = d.raw || {};
              const statusMeta = STATUS_META[raw.status];
              const url = getDownloadUrl(raw);
              return (
                <div
                  key={d.id || d.name}
                  className="p-5 rounded-xl bg-white dark:bg-[#1e293b] border border-gray-200 dark:border-[#334155]"
                >
                  <div className="flex items-center gap-4 min-w-0">
                    <div
                      className="w-12 h-12 rounded-xl flex items-center justify-center text-xl"
                      style={{ background: colors.bg, color: colors.color }}
                    >
                      📃
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-bold text-gray-900 dark:text-[#f1f5f9] truncate">{d.name}</p>
                        {statusMeta && (
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${statusMeta.bg} ${statusMeta.text}`}>
                            <statusMeta.Icon size={11} />
                            {statusMeta.label}
                          </span>
                        )}
                      </div>
                      <div className="flex gap-2 items-center flex-wrap mt-1">
                        <span
                          className="text-xs font-semibold px-2 py-1 rounded-full"
                          style={{ color: colors.color, background: colors.bg }}
                        >
                          {d.type}
                        </span>
                        <span className="text-xs text-gray-500">
                          {d.date ? String(d.date).slice(0, 10) : "-"}
                          {d.size ? ` · ${d.size}` : ""}
                        </span>
                      </div>
                    </div>

                    {url && (
                      <a
                        href={url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="shrink-0 flex items-center gap-1.5 px-4 py-2 bg-gray-100 dark:bg-[#0f172a] hover:bg-gray-200 dark:hover:bg-[#1e293b] text-gray-700 dark:text-[#e2e8f0] text-sm font-semibold rounded-lg transition"
                      >
                        <Download size={14} /> Download
                      </a>
                    )}
                  </div>

                  {(raw.admin_feedback || raw.rejection_reason) && (
                    <div className="mt-3 flex items-start gap-1.5 bg-slate-50 dark:bg-[#0f172a] border border-slate-200 dark:border-[#334155] rounded-lg px-3 py-2">
                      <MessageSquare className="w-3.5 h-3.5 text-slate-400 dark:text-[#64748b] shrink-0 mt-0.5" />
                      <p className="text-xs text-slate-600 dark:text-[#94a3b8]"><strong>Admin feedback:</strong> {raw.admin_feedback || raw.rejection_reason}</p>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}
    </EmployeePageShell>
  );
}
