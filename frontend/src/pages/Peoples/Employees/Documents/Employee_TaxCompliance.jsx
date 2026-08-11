import { useEffect, useMemo, useState } from "react";
import EmployeePageShell from "../../../../components/employee/EmployeePageShell";
import { getDocuments } from "../../../../service/employee";

const statusColor = {
  Available: { color: "text-emerald-700 dark:text-emerald-300", bg: "bg-emerald-50 dark:bg-emerald-900/30" },
  Submitted: { color: "text-indigo-700 dark:text-indigo-300", bg: "bg-indigo-50 dark:bg-indigo-900/30" },
  Pending: { color: "text-amber-700 dark:text-amber-300", bg: "bg-amber-50 dark:bg-amber-900/30" },
};

function resolveStatusColor(status) {
  return statusColor[status] || { color: "text-gray-700 dark:text-gray-300", bg: "bg-gray-100 dark:bg-gray-800/30" };
}

function normalizeStatus(s) {
  const t = String(s || "").toLowerCase();
  if (t.includes("available") || t.includes("generated") || t.includes("ready")) return "Available";
  if (t.includes("submit") || t.includes("filed") || t.includes("done")) return "Submitted";
  if (t.includes("pending") || t.includes("processing")) return "Pending";
  return "Available";
}

export default function TaxCompliance() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [rawDocs, setRawDocs] = useState([]);

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
      const name = d.title || d.name || d.document_type || d.id || "Tax Document";
      const year = d.year || d.financial_year || d.fy || (d.created_at ? String(d.created_at).slice(0, 7) : "-");
      const type = d.type || d.document_type || d.category || "Tax";
      const status = normalizeStatus(d.status || d.document_status);
      const id = d.id || d.document_id || name;
      return { id, name, year, type, status };
    });
  }, [rawDocs]);

  if (loading) {
    return (
      <EmployeePageShell title="Tax & Compliance" subtitle="Access your Form 16, TDS certificates, and investment declarations.">
        <div className="flex justify-center items-center py-20">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
          <span className="ml-3 text-gray-500 dark:text-[#94a3b8]">Loading tax documents...</span>
        </div>
      </EmployeePageShell>
    );
  }

  return (
    <EmployeePageShell title="Tax & Compliance" subtitle="Access your Form 16, TDS certificates, and investment declarations.">
      {error && (
        <div className="mb-4 px-4 py-3 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 rounded-lg">{error}</div>
      )}

      {!error && (
        <>
          {/* Info Banner */}
          <div className="mb-6 px-5 py-4 rounded-xl bg-indigo-50 dark:bg-indigo-900/30 border border-indigo-200 dark:border-indigo-800 flex items-center gap-3">
            <span className="text-lg">&#x2139;&#xFE0F;</span>
            <p className="text-sm text-indigo-800 dark:text-indigo-300 m-0">
              Form 16 for FY 2025-26 will be available by July 15, 2026. Please consult your tax advisor for filing.
            </p>
          </div>

          {/* Document List */}
          <div className="space-y-3">
            {taxDocs.length === 0 ? (
              <div className="text-center py-12 text-gray-500 dark:text-[#94a3b8]">No tax documents found.</div>
            ) : (
              taxDocs.map((d) => {
                const sc = resolveStatusColor(d.status);
                return (
                  <div
                    key={d.id}
                    className="px-6 py-4.5 rounded-xl bg-white dark:bg-[#1e293b] border border-gray-200 dark:border-[#334155] flex justify-between items-center"
                  >
                    <div>
                      <p className="text-sm font-bold text-gray-900 dark:text-[#f1f5f9] m-0 mb-1">{d.name}</p>
                      <div className="flex gap-2 items-center text-xs text-gray-400 dark:text-[#94a3b8]">
                        <span>FY {d.year}</span>
                        <span>&middot;</span>
                        <span className="font-semibold text-gray-500">{d.type}</span>
                      </div>
                    </div>
                    <div className="flex gap-2.5 items-center">
                      <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${sc.color} ${sc.bg}`}>
                        {d.status}
                      </span>
                      <button className="px-3.5 py-1.5 bg-gray-100 dark:bg-[#0f172a] hover:bg-gray-200 dark:hover:bg-[#1e293b] text-gray-700 dark:text-[#e2e8f0] border-none rounded-lg text-xs font-semibold cursor-pointer">
                        Download
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </>
      )}
    </EmployeePageShell>
  );
}
