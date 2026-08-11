import { useEffect, useMemo, useState } from "react";
import EmployeePageShell from "../../../../components/employee/EmployeePageShell";
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

      {!error && (
        <>
          {/* Summary Cards */}
          <div className="grid grid-cols-3 gap-4 mb-7">
            {[
              { label: "Last Month CTC", value: stats.gross, color: "text-indigo-600" },
              { label: "Last Deductions", value: stats.deductions, color: "text-red-600" },
              { label: "Last Net Pay", value: stats.net, color: "text-emerald-600" },
            ].map((s) => (
              <div key={s.label} className="p-5 rounded-xl bg-white dark:bg-[#1e293b] border border-gray-200 dark:border-[#334155] text-center">
                <p className={`text-3xl font-extrabold ${s.color} m-0 mb-1`}>{s.value}</p>
                <p className="text-xs text-gray-500 dark:text-[#94a3b8] m-0">{s.label}</p>
              </div>
            ))}
          </div>

          {/* Table */}
          <div className="rounded-xl bg-white dark:bg-[#1e293b] border border-gray-200 dark:border-[#334155] overflow-hidden">
            {payslips.length === 0 ? (
              <div className="text-center py-12 text-gray-500 dark:text-[#94a3b8]">No payslips found.</div>
            ) : (
              <table className="w-full border-collapse">
                <thead>
                  <tr className="bg-gray-50 dark:bg-[#0f172a]">
                    {["Month", "Gross Pay", "Deductions", "Net Pay", "Action"].map((h) => (
                      <th key={h} className="px-5 py-3 text-left text-xs font-semibold text-gray-500 dark:text-[#94a3b8] uppercase">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {payslips.map((p) => (
                    <tr key={p.id || p.month} className="border-t border-gray-100 dark:border-[#334155]">
                      <td className="px-5 py-3.5 text-sm font-semibold text-gray-900 dark:text-[#f1f5f9]">{p.month}</td>
                      <td className="px-5 py-3.5 text-sm text-gray-700 dark:text-[#e2e8f0]">{p.gross}</td>
                      <td className="px-5 py-3.5 text-sm text-red-600 dark:text-red-400">{p.deductions}</td>
                      <td className="px-5 py-3.5 text-sm font-bold text-emerald-600">{p.net}</td>
                      <td className="px-5 py-3.5">
                        <button className="px-3.5 py-1.5 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-300 border-none rounded-md text-xs font-semibold cursor-pointer hover:bg-indigo-100 dark:hover:bg-indigo-900/50">
                          Download
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}
    </EmployeePageShell>
  );
}
