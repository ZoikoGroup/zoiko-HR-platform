import { useState, useEffect, useCallback, useRef } from "react";
import { useParams } from "react-router-dom";
import {
  AlertTriangle, CheckCircle, RotateCcw, Clock, Filter, DollarSign, Plus,
  RefreshCw, X, ChevronLeft, ChevronRight, Info,
} from "lucide-react";
import { billingService } from "../../service/billingService";
import { useAuth } from "../../context/AuthContext";
import { ROLES } from "../../config/roles";
import PageHeader from "../../components/PageHeader";
import OrgPicker from "../../components/OrgPicker";
import { formatDateTime } from "../../utils/dateTime";
import {
  REFUND_STATUSES, REFUND_TYPES, EMPTY_REFUND_FILTERS, buildRefundParams,
  hasActiveRefundFilters, formatMoney, dollarsToCents, validateRefundForm,
} from "../../utils/refundFilters";

const PAGE_SIZE = 20;

const STATUS_TONES = {
  pending_approval: "bg-amber-50 text-amber-700 border-amber-200",
  approved_and_processed: "bg-emerald-50 text-emerald-700 border-emerald-200",
  rejected: "bg-red-50 text-red-700 border-red-200",
};
const STATUS_LABELS = Object.fromEntries(REFUND_STATUSES.map((s) => [s.value, s.label]));
const TYPE_LABELS = Object.fromEntries(REFUND_TYPES.map((t) => [t.value, t.label]));

const inputCls =
  "w-full rounded-xl border border-slate-200 bg-white py-2 px-3 text-sm text-slate-800 outline-none focus:border-[#3B82F6]";

function WidgetError({ message, onRetry }) {
  return (
    <div role="alert" className="flex items-center gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
      <AlertTriangle className="h-5 w-5 shrink-0" />
      <span className="min-w-0 flex-1">{message}</span>
      <button onClick={onRetry} className="shrink-0 text-xs font-semibold underline">Retry</button>
    </div>
  );
}

function StatCard({ label, value, icon: Icon, color, sub }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-2 flex items-center justify-between">
        <div className={`flex h-9 w-9 items-center justify-center rounded-xl ${color}`}>
          <Icon className="h-5 w-5 text-white" />
        </div>
        <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">{label}</span>
      </div>
      <p className="text-2xl font-extrabold text-slate-900">{value}</p>
      {sub && <p className="mt-1 text-xs font-medium text-slate-400">{sub}</p>}
    </div>
  );
}

/** Stat cards — own request, own error state. */
function RefundStats({ organizationId, refreshKey, onWarning }) {
  const [summary, setSummary] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await billingService.getRefundSummary(organizationId ? { organization_id: organizationId } : {});
      setSummary(data);
      onWarning?.(data.provider_warning || null);
    } catch (e) {
      setError(e.message || "Failed to load summary");
    } finally {
      setLoading(false);
    }
  }, [organizationId, onWarning]);

  useEffect(() => { load(); }, [load, refreshKey]);

  if (error) return <WidgetError message={`Summary unavailable: ${error}`} onRetry={load} />;
  const s = summary || {};
  const dash = loading && !summary;
  const cur = s.currency || "USD";
  return (
    <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
      <StatCard label="Pending Approvals" value={dash ? "…" : s.pending_count ?? 0} icon={Clock}
        color={s.pending_count > 0 ? "bg-amber-500" : "bg-slate-400"}
        sub={s.pending_count > 0 ? "Requires review" : "All cleared"} />
      <StatCard label="Total Approved / Paid" value={dash ? "…" : formatMoney(s.approved_total_cents, cur)}
        icon={DollarSign} color="bg-emerald-500" sub="Executed adjustments" />
      <StatCard label="Total Credits Issued" value={dash ? "…" : formatMoney(s.credits_issued_cents, cur)}
        icon={RotateCcw} color="bg-indigo-500" sub="Account balance credits" />
      <StatCard label="Processed Requests" value={dash ? "…" : s.processed_count ?? 0} icon={CheckCircle}
        color="bg-blue-500" sub="Lifetime approved requests" />
    </div>
  );
}

export default function BillingRefundsPage() {
  const { orgId } = useParams();
  const { role } = useAuth();
  const isAdmin = [ROLES.SUPER_ADMIN, ROLES.PLATFORM_ADMIN].includes(role);

  const [selectedOrg, setSelectedOrg] = useState(null);
  const [filters, setFilters] = useState(EMPTY_REFUND_FILTERS);
  const [debounced, setDebounced] = useState(EMPTY_REFUND_FILTERS);
  const [page, setPage] = useState(1);
  const [refreshKey, setRefreshKey] = useState(0);
  const [warning, setWarning] = useState(null);
  const [notice, setNotice] = useState(null);

  const activeOrgId = orgId || selectedOrg?.id || "";

  // Table widget state
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Debounce every filter change (amount typing in particular) and reset paging.
  useEffect(() => {
    const t = setTimeout(() => { setDebounced(filters); setPage(1); }, 350);
    return () => clearTimeout(t);
  }, [filters]);


  const loadTable = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await billingService.listRefunds(
        buildRefundParams({ ...debounced, organizationId: activeOrgId }, { page, pageSize: PAGE_SIZE }),
      );
      setRows(data.list || []);
      setTotal(data.total || 0);
      setWarning(data.provider_warning || null);
    } catch (e) {
      setError(e.message || "Failed to load refund requests");
    } finally {
      setLoading(false);
    }
  }, [debounced, activeOrgId, page]);

  useEffect(() => { loadTable(); }, [loadTable, refreshKey]);

  const refreshAll = () => setRefreshKey((k) => k + 1);
  const setFilter = (key, value) => setFilters((f) => ({ ...f, [key]: value }));
  const clearFilters = () => { setFilters(EMPTY_REFUND_FILTERS); setSelectedOrg(null); };
  const filtersActive = hasActiveRefundFilters(filters) || (!orgId && !!selectedOrg);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  // ── New request dialog ───────────────────────────────────────────────────
  const [showRequest, setShowRequest] = useState(false);
  const [requestOrg, setRequestOrg] = useState(null);
  const [form, setForm] = useState({ amountDollars: "", reason: "", requestType: "refund" });
  const [requestBusy, setRequestBusy] = useState(false);
  const [modalError, setModalError] = useState(null);
  const requestInFlight = useRef(false);

  const openRequest = () => { setModalError(null); setShowRequest(true); };
  const closeRequest = () => { if (!requestInFlight.current) setShowRequest(false); };

  const submitRequest = async () => {
    if (requestInFlight.current) return;
    const targetOrg = activeOrgId || requestOrg?.id;
    const invalid = validateRefundForm({ amountDollars: form.amountDollars, reason: form.reason, orgId: targetOrg });
    if (invalid) { setModalError(invalid); return; }
    requestInFlight.current = true;
    setRequestBusy(true);
    setModalError(null);
    try {
      await billingService.requestRefund(targetOrg, {
        amount_cents: dollarsToCents(form.amountDollars),
        reason: form.reason.trim(),
        request_type: form.requestType,
      });
      setShowRequest(false);
      setForm({ amountDollars: "", reason: "", requestType: "refund" });
      setRequestOrg(null);
      setNotice("Request submitted and awaiting approval.");
      refreshAll();
    } catch (e) {
      setModalError(e.message || "Request submission failed");
    } finally {
      requestInFlight.current = false;
      setRequestBusy(false);
    }
  };

  // ── Approve / reject dialog ──────────────────────────────────────────────
  const [decision, setDecision] = useState(null); // { req, kind: "approve" | "reject" }
  const [rejectReason, setRejectReason] = useState("");
  const [decisionBusy, setDecisionBusy] = useState(false);
  const [decisionError, setDecisionError] = useState(null);
  const decisionInFlight = useRef(false);

  const openDecision = (req, kind) => { setDecisionError(null); setRejectReason(""); setDecision({ req, kind }); };
  const closeDecision = () => { if (!decisionInFlight.current) setDecision(null); };

  const submitDecision = async () => {
    if (!decision || decisionInFlight.current) return;
    decisionInFlight.current = true;
    setDecisionBusy(true);
    setDecisionError(null);
    try {
      if (decision.kind === "approve") {
        await billingService.approveRefund(decision.req.id);
        setNotice("Request approved and processed.");
      } else {
        await billingService.rejectRefund(decision.req.id, {
          rejection_reason: rejectReason.trim() || "Rejected by Super Admin",
        });
        setNotice("Request rejected.");
      }
      setDecision(null);
      refreshAll();
    } catch (e) {
      setDecisionError(e.message || "Action failed");
    } finally {
      decisionInFlight.current = false;
      setDecisionBusy(false);
    }
  };

  return (
    <div className="space-y-6 font-sans">
      <PageHeader
        title="Refunds & Credit Management"
        description="Platform-wide review and governance of customer refund requests, credit balances, and financial adjustments."
        icon={DollarSign}
        action={
          <div className="flex items-center gap-2">
            <button
              onClick={refreshAll}
              disabled={loading}
              className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-600 shadow-sm transition hover:bg-slate-50 disabled:opacity-50"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} /> Refresh
            </button>
            {isAdmin && (
              <button
                onClick={openRequest}
                className="flex items-center gap-2 rounded-full bg-[#3B82F6] px-4 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-[#2563EB]"
              >
                <Plus className="h-4 w-4" /> New Refund / Credit
              </button>
            )}
          </div>
        }
      />

      {warning && (
        <div role="status" className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          <Info className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{warning}</span>
        </div>
      )}

      {notice && (
        <div role="status" className="flex items-center gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
          <CheckCircle className="h-4 w-4 shrink-0" />
          <span>{notice}</span>
          <button onClick={() => setNotice(null)} className="ml-auto text-xs font-semibold underline">Dismiss</button>
        </div>
      )}

      <RefundStats organizationId={activeOrgId} refreshKey={refreshKey} onWarning={setWarning} />

      {/* Filters */}
      <div className="space-y-4 rounded-3xl border border-slate-200 bg-white p-5 shadow-[0_4px_20px_rgba(0,0,0,0.02)]">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-500">
            <Filter className="h-3.5 w-3.5" /> Filters
          </div>
          {filtersActive && (
            <button onClick={clearFilters} className="text-xs font-semibold text-[#3B82F6] hover:underline">
              Clear filters
            </button>
          )}
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {!orgId && (
            <div className="md:col-span-3">
              <label className="mb-1 block text-xs font-semibold text-slate-600">Organization</label>
              <OrgPicker selectedOrg={selectedOrg} onSelect={(o) => { setSelectedOrg(o); setPage(1); }}
                placeholder="All organizations (search...)" />
            </div>
          )}
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-600">Status</label>
            <select value={filters.status} onChange={(e) => setFilter("status", e.target.value)} className={inputCls}>
              <option value="">All statuses</option>
              {REFUND_STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-600">Type</label>
            <select value={filters.requestType} onChange={(e) => setFilter("requestType", e.target.value)} className={inputCls}>
              <option value="">Refunds &amp; credits</option>
              {REFUND_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>
          <div className="hidden md:block" />
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-600">From date</label>
            <input type="date" value={filters.dateFrom} max={filters.dateTo || undefined}
              onChange={(e) => setFilter("dateFrom", e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-600">To date (inclusive)</label>
            <input type="date" value={filters.dateTo} min={filters.dateFrom || undefined}
              onChange={(e) => setFilter("dateTo", e.target.value)} className={inputCls} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-600">Min amount ($)</label>
              <input type="number" min="0" step="0.01" value={filters.minAmount}
                onChange={(e) => setFilter("minAmount", e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-600">Max amount ($)</label>
              <input type="number" min="0" step="0.01" value={filters.maxAmount}
                onChange={(e) => setFilter("maxAmount", e.target.value)} className={inputCls} />
            </div>
          </div>
        </div>
      </div>

      {/* Table widget */}
      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-[0_4px_20px_rgba(0,0,0,0.02)]">
        <h3 className="mb-4 flex items-center gap-2 text-lg font-bold text-slate-800">
          <DollarSign className="h-5 w-5 text-[#3B82F6]" /> Refund &amp; Credit Requests ({total})
        </h3>

        {error ? (
          <WidgetError message={error} onRetry={loadTable} />
        ) : loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-[#3B82F6] border-t-transparent" />
          </div>
        ) : rows.length === 0 ? (
          <div className="py-12 text-center text-sm text-slate-400">
            {filtersActive
              ? "No refunds or credits match these filters."
              : "No refund or credit requests yet."}
            {filtersActive && (
              <button onClick={clearFilters} className="ml-2 font-semibold text-[#3B82F6] hover:underline">Clear filters</button>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {rows.map((req) => (
              <div key={req.id} className="rounded-2xl border border-slate-100 bg-slate-50/50 p-4">
                <div className="flex flex-col items-start justify-between gap-4 md:flex-row md:items-center">
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${STATUS_TONES[req.status] || STATUS_TONES.pending_approval}`}>
                        {STATUS_LABELS[req.status] || req.status}
                      </span>
                      <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs font-bold uppercase tracking-wider text-slate-500">
                        {TYPE_LABELS[req.request_type] || req.request_type}
                      </span>
                      <span className="text-sm font-bold text-slate-900">{formatMoney(req.amount_cents, req.currency)}</span>
                      <span className="text-xs font-bold text-slate-700">
                        {req.organization_name || `Org #${req.organization_id}`}
                      </span>
                    </div>
                    <p className="text-sm text-slate-700">{req.reason}</p>
                    <div className="flex flex-wrap items-center gap-4 text-xs text-slate-400">
                      <span className="flex items-center gap-1" title={req.created_at || ""}>
                        <Clock size={12} /> {req.created_at ? formatDateTime(req.created_at) : "—"}
                      </span>
                      {req.requested_by && <span>Requested by {req.requested_by}</span>}
                      {req.stripe_refund_id && <span className="font-mono">Stripe: {req.stripe_refund_id}</span>}
                    </div>
                    {req.rejection_reason && (
                      <p className="text-xs font-medium text-red-600">Rejection reason: {req.rejection_reason}</p>
                    )}
                    {req.approved_by && req.status === "approved_and_processed" && (
                      <p className="text-xs font-medium text-emerald-600">Approved by {req.approved_by}</p>
                    )}
                  </div>

                  {isAdmin && req.status === "pending_approval" && (
                    <div className="flex shrink-0 items-center gap-2">
                      <button onClick={() => openDecision(req, "approve")}
                        className="rounded-full bg-emerald-600 px-4 py-1.5 text-xs font-semibold text-white transition hover:bg-emerald-700">
                        Approve
                      </button>
                      <button onClick={() => openDecision(req, "reject")}
                        className="rounded-full border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-100">
                        Reject
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {!error && total > PAGE_SIZE && (
          <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-4 text-xs text-slate-500">
            <span>Page {page} of {totalPages}</span>
            <div className="flex items-center gap-2">
              <button disabled={page <= 1 || loading} onClick={() => setPage((p) => p - 1)}
                className="flex items-center gap-1 rounded-full border border-slate-200 px-3 py-1.5 font-semibold disabled:opacity-40">
                <ChevronLeft className="h-3.5 w-3.5" /> Previous
              </button>
              <button disabled={page >= totalPages || loading} onClick={() => setPage((p) => p + 1)}
                className="flex items-center gap-1 rounded-full border border-slate-200 px-3 py-1.5 font-semibold disabled:opacity-40">
                Next <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* New request dialog */}
      {showRequest && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md space-y-4 rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-base font-bold text-slate-800">New Refund or Credit Request</h3>
              <button onClick={closeRequest} disabled={requestBusy} aria-label="Close" className="rounded-lg p-1 hover:bg-slate-100">
                <X className="h-5 w-5 text-slate-400" />
              </button>
            </div>

            {modalError && (
              <div role="alert" className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> {modalError}
              </div>
            )}

            {!activeOrgId && (
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-600">Target Organization *</label>
                <OrgPicker selectedOrg={requestOrg} onSelect={setRequestOrg} placeholder="Select target organization..." />
              </div>
            )}

            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-600">Request Type *</label>
              <select value={form.requestType} onChange={(e) => setForm((f) => ({ ...f, requestType: e.target.value }))} className={inputCls}>
                <option value="refund">Refund (returned to original payment method)</option>
                <option value="credit">Credit (account balance adjustment)</option>
              </select>
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-600">Amount ($) *</label>
              <input type="number" step="0.01" min="0" value={form.amountDollars} placeholder="150.00"
                onChange={(e) => setForm((f) => ({ ...f, amountDollars: e.target.value }))} className={inputCls} />
              {form.requestType === "refund" && (
                <p className="mt-1 text-[11px] text-slate-400">A refund can't exceed what the organization has paid, less refunds already requested.</p>
              )}
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-600">Reason &amp; Audit Explanation *</label>
              <textarea value={form.reason} placeholder="Detailed reason for refund/credit..."
                onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))}
                className={`${inputCls} min-h-[80px] resize-none`} />
            </div>

            <div className="flex justify-end gap-3 border-t border-slate-100 pt-2">
              <button onClick={closeRequest} disabled={requestBusy}
                className="rounded-full border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50">
                Cancel
              </button>
              <button onClick={submitRequest}
                disabled={requestBusy || !form.amountDollars || !form.reason.trim()}
                className="rounded-full bg-[#3B82F6] px-5 py-2 text-xs font-semibold text-white shadow-sm hover:bg-[#2563EB] disabled:opacity-50">
                {requestBusy ? "Submitting..." : "Submit Request"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Approve / reject dialog */}
      {decision && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md space-y-4 rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl">
            <h3 className="text-base font-bold text-slate-800">
              {decision.kind === "approve" ? "Approve request" : "Reject request"}
            </h3>
            <p className="text-sm text-slate-600">
              {TYPE_LABELS[decision.req.request_type] || "Request"} of{" "}
              <strong>{formatMoney(decision.req.amount_cents, decision.req.currency)}</strong> for{" "}
              <strong>{decision.req.organization_name || `Org #${decision.req.organization_id}`}</strong>.
              {decision.kind === "approve" && " Approving executes it at the payment provider and cannot be undone."}
            </p>

            {decision.kind === "reject" && (
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-600">Rejection reason</label>
                <textarea value={rejectReason} onChange={(e) => setRejectReason(e.target.value)}
                  placeholder="Shown on the request and recorded in the audit log"
                  className={`${inputCls} min-h-[70px] resize-none`} />
              </div>
            )}

            {decisionError && (
              <div role="alert" className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> {decisionError}
              </div>
            )}

            <div className="flex justify-end gap-3 border-t border-slate-100 pt-2">
              <button onClick={closeDecision} disabled={decisionBusy}
                className="rounded-full border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50">
                Cancel
              </button>
              <button onClick={submitDecision} disabled={decisionBusy}
                className={`rounded-full px-5 py-2 text-xs font-semibold text-white shadow-sm disabled:opacity-50 ${decision.kind === "approve" ? "bg-emerald-600 hover:bg-emerald-700" : "bg-red-600 hover:bg-red-700"}`}>
                {decisionBusy ? "Working..." : decision.kind === "approve" ? "Confirm approve" : "Confirm reject"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
