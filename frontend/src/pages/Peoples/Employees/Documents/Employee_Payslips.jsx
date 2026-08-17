import { useEffect, useMemo, useState } from "react";
import { CreditCard, TrendingDown, Wallet, Download, Eye } from "lucide-react";
import EmployeePageShell from "../../../../components/employee/EmployeePageShell";
import DocumentPreviewModal from "../../../../components/DocumentPreviewModal";
import { useDocumentFile } from "../../../../hooks/useDocumentFile";
import { getDocuments } from "../../../../service/employee";

function parseCurrency(str) {
  if (!str) return 0;
  const cleaned = String(str).replace(/[₹,\s]/g, "");
  const num = parseFloat(cleaned);
  return isNaN(num) ? 0 : num;
}

function formatCurrency(amount) {
  return `₹${Number(amount).toLocaleString("en-IN")}`;
}

export default function Payslips() {
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
        const res = await getDocuments({ category: "payslip" });
        const data = res?.data || res?.items || res?.data?.items || [];
        if (mounted) setRawDocs(Array.isArray(data) ? data : []);
      } catch (e) {
        if (!mounted) return;
        setError(e?.message || "Failed to load payslips");
        setRawDocs([]);
      } finally {
        if (mounted) setLoading(false);
      }
    }
    load();
    return () => { mounted = false; };
  }, []);

  const payslips = useMemo(() => {
    return rawDocs
      .map((d) => {
        const title = d.title || d.name || d.document_type || "";
        const gross = d.gross || d.gross_pay || parseCurrency(d.amount || 0) || "₹0";
        const deductions = d.deductions || d.total_deductions || "₹0";
        const net = d.net || d.net_pay || d.amount || "₹0";
        const status = d.status || d.document_status || "Generated";
        const month = d.month || d.period || title;
        const id = d.id || d.document_id || title;
        return { id, month, gross, deductions, net, status };
      })
      .sort((a, b) => String(b.month).localeCompare(String(a.month)));
  }, [rawDocs]);

  const stats = useMemo(() => {
    if (payslips.length === 0) {
      return { gross: "₹0", deductions: "₹0", net: "₹0" };
    }
    const latest = payslips[0];
    return {
      gross: latest.gross,
      deductions: latest.deductions,
      net: latest.net,
    };
  }, [payslips]);

  if (loading) {
    return (
      <EmployeePageShell title="My Payslips" subtitle="Download your monthly salary slips.">
        <div className="flex justify-center items-center py-20">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
          <span className="ml-3 text-gray-500 dark:text-[#94a3b8]">Loading payslips...</span>
        </div>
      </EmployeePageShell>
    );
  }

  return (
    <EmployeePageShell title="My Payslips" subtitle="Download your monthly salary slips.">
      {error && (
        <div className="mb-4 px-4 py-3 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 rounded-lg">{error}</div>
      )}

      {fileError && (
        <div className="mb-4 px-4 py-3 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 rounded-lg">{fileError}</div>
      )}

      {!error && (
        <>
          {/* Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-7">
            {[
              { label: "Last Month CTC", value: stats.gross, icon: CreditCard, color: "text-blue-600 dark:text-blue-400", badgeBg: "bg-blue-50 dark:bg-blue-500/10", badgeFg: "text-blue-600 dark:text-blue-400" },
              { label: "Last Deductions", value: stats.deductions, icon: TrendingDown, color: "text-rose-600 dark:text-rose-400", badgeBg: "bg-rose-50 dark:bg-rose-500/10", badgeFg: "text-rose-600 dark:text-rose-400" },
              { label: "Last Net Pay", value: stats.net, icon: Wallet, color: "text-emerald-600 dark:text-emerald-400", badgeBg: "bg-emerald-50 dark:bg-emerald-500/10", badgeFg: "text-emerald-600 dark:text-emerald-400" },
            ].map((s) => (
              <div key={s.label} className="p-6 rounded-2xl bg-white dark:bg-[#1e293b] border border-gray-200 dark:border-[#334155] shadow-sm transition hover:border-gray-300 dark:hover:border-[#475569]">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-[#94a3b8]">{s.label}</span>
                  <div className={`p-2 rounded-lg ${s.badgeBg} ${s.badgeFg}`}>
                    <s.icon className="w-5 h-5" />
                  </div>
                </div>
                <div className={`text-2xl font-bold ${s.color}`}>{s.value}</div>
              </div>
            ))}
          </div>

          {/* Table */}
          <div className="rounded-2xl bg-white dark:bg-[#1e293b] border border-gray-200 dark:border-[#334155] shadow-sm overflow-hidden">
            {payslips.length === 0 ? (
              <div className="text-center py-12 text-gray-500 dark:text-[#94a3b8]">No payslips found.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-gray-200 dark:border-[#334155] bg-gray-50 dark:bg-[#0f172a] text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-[#94a3b8]">
                      <th className="py-4 px-6">Month</th>
                      <th className="py-4 px-6">Gross Pay</th>
                      <th className="py-4 px-6">Deductions</th>
                      <th className="py-4 px-6">Net Pay</th>
                      <th className="py-4 px-6 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-[#334155] text-sm">
                    {payslips.map((p) => (
                      <tr key={p.id || p.month} className="hover:bg-gray-50 dark:hover:bg-[#0f172a]/60 transition-colors">
                        <td className="py-4 px-6 font-medium text-gray-900 dark:text-[#f1f5f9]">{p.month}</td>
                        <td className="py-4 px-6 text-blue-600 dark:text-blue-300 font-semibold">{p.gross}</td>
                        <td className="py-4 px-6 text-rose-600 dark:text-rose-400 font-semibold">{p.deductions}</td>
                        <td className="py-4 px-6 text-emerald-600 dark:text-emerald-400 font-semibold">{p.net}</td>
                        <td className="py-4 px-6 text-right">
                          <div className="inline-flex items-center gap-2">
                            <button
                              onClick={() => view(p.id)}
                              disabled={busyId === p.id}
                              className="inline-flex items-center gap-2 px-4 py-2 text-xs font-medium rounded-lg text-gray-600 dark:text-[#cbd5e1] bg-gray-100 dark:bg-[#334155]/40 border border-gray-200 dark:border-[#475569] hover:bg-gray-200 dark:hover:bg-[#334155]/70 transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              <Eye className="w-3.5 h-3.5" />
                              {busyId === p.id && busyAction === "view" ? "Opening…" : "View"}
                            </button>
                            <button
                              onClick={() => download(p.id)}
                              disabled={busyId === p.id}
                              className="inline-flex items-center gap-2 px-4 py-2 text-xs font-medium rounded-lg text-blue-600 dark:text-blue-300 bg-blue-50 dark:bg-blue-500/10 border border-blue-200 dark:border-blue-500/20 hover:bg-blue-100 dark:hover:bg-blue-500/20 hover:border-blue-300 dark:hover:border-blue-500/40 transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              <Download className="w-3.5 h-3.5" />
                              {busyId === p.id && busyAction === "download" ? "Downloading…" : "Download"}
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      <DocumentPreviewModal preview={preview} onClose={closePreview} onDownload={downloadFromPreview} />
    </EmployeePageShell>
  );
}
