import { useState, useCallback, useEffect } from "react";
import { Receipt, AlertTriangle, ExternalLink, FileDown, RefreshCw, Filter, Eye, ChevronLeft, ChevronRight, Building2 } from "lucide-react";
import PageHeader from "../../components/PageHeader";
import OrgPicker from "../../components/OrgPicker";
import { billingService } from "../../service/billingService";

const STATUS_TONES = {
  paid: "bg-emerald-50 text-emerald-700 border-emerald-200",
  open: "bg-blue-50 text-blue-700 border-blue-200",
  void: "bg-slate-100 text-slate-600 border-slate-200",
  uncollectible: "bg-red-50 text-red-700 border-red-200",
  draft: "bg-amber-50 text-amber-700 border-amber-200",
};

function formatCents(cents, currency = "USD") {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: (currency || "USD").toUpperCase(),
  }).format((cents || 0) / 100);
}

export default function BillingInvoicesPage() {
  const [selectedOrg, setSelectedOrg] = useState(null);
  const [statusFilter, setStatusFilter] = useState("");
  const [currencyFilter, setCurrencyFilter] = useState("");
  const [page, setPage] = useState(1);
  const [limit] = useState(20);

  const [invoices, setInvoices] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Detail Modal State
  const [activeInvoice, setActiveInvoice] = useState(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = {
        page,
        limit,
        organization_id: selectedOrg?.id || undefined,
        status: statusFilter || undefined,
        currency: currencyFilter || undefined,
      };
      const data = await billingService.getPlatformInvoices(params);
      setInvoices(data.list || []);
      setTotal(data.total || 0);
    } catch (e) {
      console.error("Failed to load platform invoices", e);
      setError(e.message || "Failed to load invoices.");
    } finally {
      setLoading(false);
    }
  }, [selectedOrg, statusFilter, currencyFilter, page, limit]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleClearFilters = () => {
    setSelectedOrg(null);
    setStatusFilter("");
    setCurrencyFilter("");
    setPage(1);
  };

  const totalPages = Math.ceil(total / limit) || 1;

  return (
    <div className="space-y-6 font-sans">
      <PageHeader
        title="Invoices"
        description="Cross-organization commercial invoices and Stripe mirrored statements."
        action={
          <button
            onClick={loadData}
            disabled={loading}
            className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition shadow-sm disabled:opacity-50"
            title="Refresh Invoices"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} /> Refresh
          </button>
        }
      />

      {/* Filter Bar */}
      <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-[0_4px_20px_rgba(0,0,0,0.02)] space-y-4">
        <div className="flex items-center gap-2 text-xs font-bold text-slate-500 uppercase tracking-wider">
          <Filter className="h-3.5 w-3.5" /> Filter Invoices
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Organization Filter</label>
            <OrgPicker
              selectedOrg={selectedOrg}
              onSelect={(org) => {
                setSelectedOrg(org);
                setPage(1);
              }}
              placeholder="All Organizations (or search by name...)"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Status</label>
            <select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setPage(1);
              }}
              className="w-full rounded-xl border border-slate-200 bg-white py-2.5 px-4 text-sm text-slate-800 outline-none focus:border-[#3B82F6] focus:ring-2 focus:ring-[#3B82F6]/20 transition"
            >
              <option value="">All Statuses</option>
              <option value="paid">Paid</option>
              <option value="open">Open / Unpaid</option>
              <option value="draft">Draft</option>
              <option value="uncollectible">Uncollectible</option>
              <option value="void">Void</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Currency</label>
            <select
              value={currencyFilter}
              onChange={(e) => {
                setCurrencyFilter(e.target.value);
                setPage(1);
              }}
              className="w-full rounded-xl border border-slate-200 bg-white py-2.5 px-4 text-sm text-slate-800 outline-none focus:border-[#3B82F6] focus:ring-2 focus:ring-[#3B82F6]/20 transition"
            >
              <option value="">All Currencies</option>
              <option value="USD">USD ($)</option>
              <option value="EUR">EUR (€)</option>
              <option value="GBP">GBP (£)</option>
              <option value="AED">AED (AED)</option>
              <option value="INR">INR (₹)</option>
            </select>
          </div>
        </div>

        {(selectedOrg || statusFilter || currencyFilter) && (
          <div className="flex items-center justify-between pt-2 border-t border-slate-100 text-xs">
            <span className="text-slate-500">
              Active filters applied. Showing results for {selectedOrg ? selectedOrg.name : "all orgs"}.
            </span>
            <button
              onClick={handleClearFilters}
              className="text-[#3B82F6] font-semibold hover:underline"
            >
              Clear all filters
            </button>
          </div>
        )}
      </div>

      {error && (
        <div className="rounded-3xl border border-red-200 bg-red-50 p-4 text-red-700 text-sm flex items-center gap-3">
          <AlertTriangle className="h-5 w-5 shrink-0" />
          <span>{error}</span>
          <button onClick={loadData} className="ml-auto text-red-600 underline text-xs font-semibold">Retry</button>
        </div>
      )}

      {/* Main Table */}
      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-[0_4px_20px_rgba(0,0,0,0.02)]">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
            <Receipt className="h-5 w-5 text-[#3B82F6]" /> Commercial Invoices ({total})
          </h3>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-[#3B82F6] border-t-transparent" />
          </div>
        ) : invoices.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/60 p-12 text-center">
            <Receipt className="mx-auto mb-3 h-10 w-10 text-slate-300" />
            <p className="text-sm font-semibold text-slate-600">No invoices match the selected criteria.</p>
            <p className="mt-1 text-xs text-slate-400">Try adjusting your status or organization filters.</p>
            {(selectedOrg || statusFilter || currencyFilter) && (
              <button
                onClick={handleClearFilters}
                className="mt-4 inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 shadow-sm"
              >
                Reset Filters
              </button>
            )}
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-100 text-xs font-semibold uppercase tracking-wider text-slate-500 bg-slate-50/50">
                    <th className="py-3 px-4">Organization</th>
                    <th className="py-3 px-4">Invoice #</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4">Amount Due</th>
                    <th className="py-3 px-4">Amount Paid</th>
                    <th className="py-3 px-4">Service Period</th>
                    <th className="py-3 px-4">Created</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {invoices.map((inv) => (
                    <tr key={inv.id} className="text-sm hover:bg-slate-50/50 transition group">
                      <td className="py-4 px-4 font-medium text-slate-800">
                        <div className="flex items-center gap-2">
                          <Building2 className="h-4 w-4 text-slate-400 shrink-0" />
                          <div>
                            <p className="font-semibold text-slate-800 text-xs">{inv.organization_name || `Org #${inv.organization_id}`}</p>
                            <span className="text-[10px] text-slate-400 font-mono">ID: {inv.organization_id}</span>
                          </div>
                        </div>
                      </td>
                      <td className="py-4 px-4 font-mono text-xs text-slate-600">{inv.stripe_invoice_id}</td>
                      <td className="py-4 px-4">
                        <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${STATUS_TONES[inv.status] || "bg-slate-50 text-slate-600 border-slate-200"}`}>
                          {inv.status}
                        </span>
                      </td>
                      <td className="py-4 px-4 font-semibold text-slate-800">{formatCents(inv.amount_due_cents, inv.currency)}</td>
                      <td className="py-4 px-4 text-slate-600">{formatCents(inv.amount_paid_cents, inv.currency)}</td>
                      <td className="py-4 px-4 text-xs text-slate-500">
                        {inv.period_start ? new Date(inv.period_start).toLocaleDateString() : "—"}
                        {" – "}
                        {inv.period_end ? new Date(inv.period_end).toLocaleDateString() : "—"}
                      </td>
                      <td className="py-4 px-4 text-xs text-slate-400">{inv.created_at ? new Date(inv.created_at).toLocaleDateString() : "—"}</td>
                      <td className="py-4 px-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => setActiveInvoice(inv)}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-[#3B82F6] hover:bg-blue-50 transition"
                            title="View Invoice Detail"
                          >
                            <Eye className="h-4 w-4" />
                          </button>
                          {inv.hosted_invoice_url && (
                            <a href={inv.hosted_invoice_url} target="_blank" rel="noreferrer" className="p-1.5 rounded-lg text-slate-400 hover:text-[#3B82F6] hover:bg-blue-50 transition" title="Hosted Invoice">
                              <ExternalLink className="h-4 w-4" />
                            </a>
                          )}
                          {inv.invoice_pdf_url && (
                            <a href={inv.invoice_pdf_url} target="_blank" rel="noreferrer" className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition" title="Download PDF">
                              <FileDown className="h-4 w-4" />
                            </a>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination Controls */}
            <div className="mt-6 pt-4 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
              <span>Showing {invoices.length} of {total} invoice(s)</span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1 || loading}
                  className="p-2 rounded-lg border border-slate-200 hover:bg-slate-50 disabled:opacity-40 transition"
                  title="Previous Page"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <span className="font-semibold text-slate-700">Page {page} of {totalPages}</span>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages || loading}
                  className="p-2 rounded-lg border border-slate-200 hover:bg-slate-50 disabled:opacity-40 transition"
                  title="Next Page"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Invoice Detail Modal */}
      {activeInvoice && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-3xl w-full max-w-xl shadow-2xl border border-slate-200 p-6 space-y-5">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-blue-50 text-[#3B82F6] flex items-center justify-center font-bold">
                  <Receipt className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-800 text-base">Invoice Details</h3>
                  <p className="text-xs text-slate-400 font-mono">{activeInvoice.stripe_invoice_id}</p>
                </div>
              </div>
              <span className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold ${STATUS_TONES[activeInvoice.status] || "bg-slate-50 text-slate-600 border-slate-200"}`}>
                {activeInvoice.status}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-4 text-xs bg-slate-50/70 p-4 rounded-2xl border border-slate-100">
              <div>
                <span className="text-slate-400 block font-medium">Customer Organization</span>
                <span className="font-semibold text-slate-800 text-sm">{activeInvoice.organization_name || `Org #${activeInvoice.organization_id}`}</span>
              </div>
              <div>
                <span className="text-slate-400 block font-medium">Organization ID</span>
                <span className="font-mono text-slate-700">{activeInvoice.organization_id}</span>
              </div>
              <div>
                <span className="text-slate-400 block font-medium">Amount Due</span>
                <span className="font-bold text-slate-900 text-sm">{formatCents(activeInvoice.amount_due_cents, activeInvoice.currency)}</span>
              </div>
              <div>
                <span className="text-slate-400 block font-medium">Amount Paid</span>
                <span className="font-semibold text-slate-700 text-sm">{formatCents(activeInvoice.amount_paid_cents, activeInvoice.currency)}</span>
              </div>
              <div>
                <span className="text-slate-400 block font-medium">Billing Period</span>
                <span className="text-slate-700">
                  {activeInvoice.period_start ? new Date(activeInvoice.period_start).toLocaleDateString() : "—"}
                  {" to "}
                  {activeInvoice.period_end ? new Date(activeInvoice.period_end).toLocaleDateString() : "—"}
                </span>
              </div>
              <div>
                <span className="text-slate-400 block font-medium">Created At</span>
                <span className="text-slate-700">{activeInvoice.created_at ? new Date(activeInvoice.created_at).toLocaleString() : "—"}</span>
              </div>
            </div>

            <div className="text-xs text-slate-400 bg-amber-50/60 border border-amber-100 p-3.5 rounded-xl">
              <strong>ZHR-COM-BILL-001 §I2 Compliance:</strong> Commercial invoices reflect aggregate workforce quantity bases only. Employee PII is excluded from invoice payloads.
            </div>

            <div className="flex items-center justify-between pt-2 border-t border-slate-100">
              <div className="flex items-center gap-2">
                {activeInvoice.hosted_invoice_url && (
                  <a
                    href={activeInvoice.hosted_invoice_url}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-1.5 rounded-xl border border-blue-200 bg-blue-50 px-3.5 py-2 text-xs font-semibold text-blue-700 hover:bg-blue-100 transition"
                  >
                    <ExternalLink className="h-3.5 w-3.5" /> Hosted Invoice
                  </a>
                )}
                {activeInvoice.invoice_pdf_url && (
                  <a
                    href={activeInvoice.invoice_pdf_url}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition shadow-sm"
                  >
                    <FileDown className="h-3.5 w-3.5" /> Download PDF
                  </a>
                )}
              </div>

              <button
                onClick={() => setActiveInvoice(null)}
                className="rounded-full bg-slate-900 px-5 py-2 text-xs font-semibold text-white hover:bg-slate-800 transition"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
