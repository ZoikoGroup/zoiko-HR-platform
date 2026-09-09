import { useEffect, useMemo, useState } from "react";
import { CreditCard, TrendingDown, Wallet, Receipt } from "lucide-react";
import EmployeePageShell from "../../../../components/employee/EmployeePageShell";
import DocumentPreviewModal from "../../../../components/DocumentPreviewModal";
import DocumentRow from "../../../../components/documents/DocumentRow";
import DocumentEmptyState from "../../../../components/documents/DocumentEmptyState";
import DocumentErrorState from "../../../../components/documents/DocumentErrorState";
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

  // NOTE: this fallback chain (gross || gross_pay || parseCurrency(amount))
  // reflects several inconsistent upstream payslip data shapes and is left
  // as-is per this pass's scope (visual/structural consistency only, not a
  // data-mapping rewrite) — see PR description.
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
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-doc-primary" />
          <span className="ml-3 text-doc-ink-soft dark:text-[#94a3b8]">Loading payslips...</span>
        </div>
      </EmployeePageShell>
    );
  }

  return (
    <EmployeePageShell title="My Payslips" subtitle="Download your monthly salary slips.">
      <DocumentErrorState message={error} />
      <div className="h-4" />
      <DocumentErrorState message={fileError} />

      {!error && (
        <>
          {/* Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-7">
            {[
              { label: "Last Month CTC", value: stats.gross, icon: CreditCard, color: "text-doc-primary dark:text-blue-400", badgeBg: "bg-doc-primary/10 dark:bg-blue-500/10" },
              { label: "Last Deductions", value: stats.deductions, icon: TrendingDown, color: "text-rose-600 dark:text-rose-400", badgeBg: "bg-rose-50 dark:bg-rose-500/10" },
              { label: "Last Net Pay", value: stats.net, icon: Wallet, color: "text-emerald-600 dark:text-emerald-400", badgeBg: "bg-emerald-50 dark:bg-emerald-500/10" },
            ].map((s) => (
              <div key={s.label} className="p-6 rounded-2xl bg-doc-surface dark:bg-[#1e293b] border border-doc-border dark:border-[#334155] shadow-sm transition hover:border-doc-primary/30 dark:hover:border-[#475569]">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-medium uppercase tracking-wider text-doc-ink-soft dark:text-[#94a3b8]">{s.label}</span>
                  <div className={`p-2 rounded-lg ${s.badgeBg} ${s.color}`}>
                    <s.icon className="w-5 h-5" />
                  </div>
                </div>
                <div className={`text-2xl font-bold ${s.color}`}>{s.value}</div>
              </div>
            ))}
          </div>

          {/* List */}
          {payslips.length === 0 ? (
            <DocumentEmptyState icon={Receipt} title="No payslips found" message="Payslips assigned to you will appear here." />
          ) : (
            <div className="space-y-3">
              {payslips.map((p) => (
                <DocumentRow
                  key={p.id || p.month}
                  icon={Receipt}
                  title={p.month}
                  status={p.status}
                  meta={`Gross ${p.gross} · Deductions ${p.deductions} · Net ${p.net}`}
                  onView={() => view(p.id)}
                  onDownload={() => download(p.id)}
                  busy={busyId === p.id}
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
