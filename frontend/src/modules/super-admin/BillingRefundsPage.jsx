import { useState, useEffect, useCallback } from "react";
import { useParams } from "react-router-dom";
import {
  AlertTriangle, CheckCircle, XCircle, RotateCcw, Clock,
  Filter, DollarSign, Search, Plus, Building2, ShieldCheck, RefreshCw, X
} from "lucide-react";
import { billingService } from "../../service/billingService";
import { useAuth } from "../../context/AuthContext";
import { ROLES } from "../../config/roles";
import PageHeader from "../../components/PageHeader";
import OrgPicker from "../../components/OrgPicker";

const STATUS_TONES = {
  pending: "bg-amber-50 text-amber-700 border-amber-200",
  approved: "bg-emerald-50 text-emerald-700 border-emerald-200",
  rejected: "bg-red-50 text-red-700 border-red-200",
  processed: "bg-blue-50 text-blue-700 border-blue-200",
};

const TYPE_LABELS = {
  refund: "Refund",
  credit: "Credit",
  write_off: "Write-off",
};

const SAMPLE_REFUND_REQUESTS = [
  {
    id: 1,
    organization_id: 1,
    organization_name: "Acme Corporation",
    amount_cents: 15000,
    currency: "USD",
    reason: "Mid-cycle seat reduction adjustment per approved ticket #8841",
    request_type: "refund",
    status: "pending",
    requested_by: "admin@acme.com",
    created_at: new Date(Date.now() - 86400000 * 1).toISOString(),
    stripe_refund_id: null,
  },
  {
    id: 2,
    organization_id: 2,
    organization_name: "Global Tech Ltd",
    amount_cents: 50000,
    currency: "USD",
    reason: "Enterprise contract SLA uptime credit for July maintenance window",
    request_type: "credit",
    status: "approved",
    requested_by: "ops@globaltech.io",
    approved_by: "superadmin@zoikoone.com",
    created_at: new Date(Date.now() - 86400000 * 5).toISOString(),
    stripe_refund_id: "cn_1N3X9vE3lUB9ETl30099",
  },
  {
    id: 3,
    organization_id: 3,
    organization_name: "Apex Systems",
    amount_cents: 7500,
    currency: "USD",
    reason: "Duplicate charge adjustment on initial onboarding invoice",
    request_type: "refund",
    status: "processed",
    requested_by: "finance@apex.com",
    approved_by: "superadmin@zoikoone.com",
    created_at: new Date(Date.now() - 86400000 * 12).toISOString(),
    stripe_refund_id: "re_1N3X9vE3lUB9ETl30055",
  },
];

function formatCents(cents) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format((cents || 0) / 100);
}

function StatCard({ label, value, icon: Icon, color, sub }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between mb-2">
        <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${color}`}>
          <Icon className="w-5 h-5 text-white" />
        </div>
        <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">{label}</span>
      </div>
      <p className="text-2xl font-extrabold text-slate-900">{value}</p>
      {sub && <p className="mt-1 text-xs text-slate-400 font-medium">{sub}</p>}
    </div>
  );
}

export default function BillingRefundsPage() {
  const { orgId } = useParams();
  const { role } = useAuth();
  const isAdmin = [ROLES.SUPER_ADMIN, ROLES.PLATFORM_ADMIN].includes(role);

  const [selectedOrg, setSelectedOrg] = useState(null);
  const activeOrgId = orgId || selectedOrg?.id;

  const [refundRequests, setRefundRequests] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [statusFilter, setStatusFilter] = useState("");

  // Request modal state
  const [showRequestModal, setShowRequestModal] = useState(false);
  const [requestOrg, setRequestOrg] = useState(null);
  const [requestForm, setRequestForm] = useState({ amount_dollars: "", reason: "", request_type: "refund" });
  const [requestLoading, setRequestLoading] = useState(false);
  const [modalError, setModalError] = useState(null);

  // Approve/reject state
  const [actionLoading, setActionLoading] = useState(null);
  const [confirmAction, setConfirmAction] = useState(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await billingService.listRefundRequests(activeOrgId);
      setRefundRequests(data.list || []);
    } catch (e) {
      console.error("Failed to load refund requests", e);
      setError(e.message || "Failed to load refund requests");
    } finally {
      setLoading(false);
    }
  }, [activeOrgId]);

  useEffect(() => { loadData(); }, [loadData]);

  const handleRequestSubmit = async () => {
    const orgToSubmit = activeOrgId || requestOrg?.id;
    if (!requestForm.amount_dollars || !requestForm.reason.trim() || !orgToSubmit) {
      setModalError("Please select an organization, enter an amount, and provide a reason.");
      return;
    }
    setRequestLoading(true);
    setModalError(null);
    try {
      const amountCents = Math.round(parseFloat(requestForm.amount_dollars) * 100);
      await billingService.requestRefund(orgToSubmit, {
        amount_cents: amountCents,
        reason: requestForm.reason.trim(),
        request_type: requestForm.request_type,
      });
      setShowRequestModal(false);
      setRequestForm({ amount_dollars: "", reason: "", request_type: "refund" });
      loadData();
    } catch (e) {
      setModalError(e.message || "Request submission failed");
    } finally {
      setRequestLoading(false);
    }
  };

  const handleApprove = async (requestId) => {
    setActionLoading(requestId);
    try {
      await billingService.approveRefund(requestId);
      setConfirmAction(null);
      loadData();
    } catch (e) {
      setError(e.message || "Approve failed");
    } finally {
      setActionLoading(null);
    }
  };

  const handleReject = async (requestId) => {
    setActionLoading(requestId);
    try {
      await billingService.rejectRefund(requestId, { rejection_reason: "Rejected by Super Admin" });
      setConfirmAction(null);
      loadData();
    } catch (e) {
      setError(e.message || "Reject failed");
    } finally {
      setActionLoading(null);
    }
  };

  const filtered = statusFilter
    ? refundRequests.filter(r => r.status === statusFilter)
    : refundRequests;

  const pendingCount = refundRequests.filter(r => r.status === "pending").length;
  const totalRefundedCents = refundRequests
    .filter(r => r.status === "approved" || r.status === "processed")
    .reduce((acc, r) => acc + (r.amount_cents || 0), 0);
  const totalCreditsCents = refundRequests
    .filter(r => r.request_type === "credit" && (r.status === "approved" || r.status === "processed"))
    .reduce((acc, r) => acc + (r.amount_cents || 0), 0);
  const totalProcessedCount = refundRequests.filter(r => r.status === "approved" || r.status === "processed").length;

  return (
    <div className="space-y-6 font-sans">
      <PageHeader
        title="Refunds & Credit Management"
        description="Platform-wide review and governance of customer refund requests, credit balances, and financial adjustments."
        icon={DollarSign}
        action={
          <div className="flex items-center gap-2">
            <button
              onClick={loadData}
              disabled={loading}
              className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition shadow-sm disabled:opacity-50"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} /> Refresh
            </button>
            {isAdmin && (
              <button
                onClick={() => { setShowRequestModal(true); setModalError(null); }}
                className="flex items-center gap-2 rounded-full bg-[#3B82F6] hover:bg-[#2563EB] text-white px-4 py-2 text-xs font-semibold transition shadow-sm"
              >
                <Plus className="h-4 w-4" /> New Refund / Credit
              </button>
            )}
          </div>
        }
      />

      {/* KPI Stats Strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Pending Approvals" value={pendingCount} icon={Clock} color={pendingCount > 0 ? "bg-amber-500" : "bg-slate-400"} sub={pendingCount > 0 ? "Requires review" : "All cleared"} />
        <StatCard label="Total Approved / Paid" value={formatCents(totalRefundedCents)} icon={DollarSign} color="bg-emerald-500" sub="Executed adjustments" />
        <StatCard label="Total Credits Issued" value={formatCents(totalCreditsCents)} icon={RotateCcw} color="bg-indigo-500" sub="Account balance credits" />
        <StatCard label="Processed Requests" value={totalProcessedCount} icon={CheckCircle} color="bg-blue-500" sub="Lifetime approved requests" />
      </div>

      {/* Scope & Filter Controls */}
      <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-[0_4px_20px_rgba(0,0,0,0.02)] space-y-4">
        <div className="flex items-center gap-2 text-xs font-bold text-slate-500 uppercase tracking-wider">
          <Filter className="h-3.5 w-3.5" /> Scope & Status Filters
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Organization Scope</label>
            <OrgPicker
              selectedOrg={selectedOrg}
              onSelect={setSelectedOrg}
              placeholder="All Platform Organizations (search...)"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Filter by Status</label>
            <div className="flex items-center gap-2 flex-wrap pt-0.5">
              {["", "pending", "approved", "rejected", "processed"].map(s => (
                <button
                  key={s}
                  onClick={() => setStatusFilter(s)}
                  className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                    statusFilter === s
                      ? "border-[#3B82F6] bg-[#3B82F6] text-white shadow-sm"
                      : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  {s ? s.charAt(0).toUpperCase() + s.slice(1) : "All Statuses"}
                </button>
              ))}
            </div>
          </div>
        </div>

        {selectedOrg && (
          <div className="flex items-center justify-between text-xs pt-1 border-t border-slate-100">
            <span className="text-slate-500">Filtered for organization: <strong>{selectedOrg.name}</strong></span>
            <button onClick={() => setSelectedOrg(null)} className="text-[#3B82F6] font-semibold hover:underline">
              Clear organization filter
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

      {/* Main List */}
      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-[0_4px_20px_rgba(0,0,0,0.02)]">
        <h3 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
          <DollarSign className="h-5 w-5 text-[#3B82F6]" /> Refund & Credit Requests ({filtered.length})
        </h3>

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-[#3B82F6] border-t-transparent" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-12 text-slate-400 text-sm">No refund requests found for the selected criteria</div>
        ) : (
          <div className="space-y-3">
            {filtered.map((req) => {
              const statusTone = STATUS_TONES[req.status] || STATUS_TONES.pending;
              const typeLabel = TYPE_LABELS[req.request_type] || req.request_type;
              return (
                <div key={req.id} className="rounded-2xl border border-slate-100 bg-slate-50/50 p-4">
                  <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                    <div className="min-w-0 space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold capitalize ${statusTone}`}>
                          {req.status}
                        </span>
                        <span className="text-xs font-bold uppercase tracking-wider text-slate-500 bg-slate-100 px-2 py-0.5 rounded-md">{typeLabel}</span>
                        <span className="text-sm font-bold text-slate-900">{formatCents(req.amount_cents)}</span>
                        <span className="text-xs font-bold text-slate-700">
                          {req.organization_name || `Org #${req.organization_id}`}
                        </span>
                      </div>
                      <p className="text-sm text-slate-700">{req.reason}</p>
                      <div className="flex items-center gap-4 text-xs text-slate-400 flex-wrap">
                        <span className="flex items-center gap-1">
                          <Clock size={12} /> {req.created_at ? new Date(req.created_at).toLocaleString() : "—"}
                        </span>
                        {req.requested_by && <span>Requested by {req.requested_by}</span>}
                        {req.stripe_refund_id && <span className="font-mono text-xs">Stripe: {req.stripe_refund_id}</span>}
                      </div>
                      {req.rejection_reason && (
                        <p className="text-xs text-red-600 font-medium">Rejection reason: {req.rejection_reason}</p>
                      )}
                      {req.approved_by && (
                        <p className="text-xs text-emerald-600 font-medium">Approved by {req.approved_by}</p>
                      )}
                    </div>

                    {/* Approve/Reject for Super Admin on pending requests */}
                    {isAdmin && req.status === "pending" && (
                      <div className="flex items-center gap-2 shrink-0">
                        {confirmAction === req.id ? (
                          <>
                            <button
                              onClick={() => setConfirmAction(null)}
                              className="px-3 py-1.5 rounded-full border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-100"
                            >
                              Cancel
                            </button>
                            <button
                              onClick={() => handleReject(req.id)}
                              disabled={actionLoading === req.id}
                              className="px-3 py-1.5 rounded-full bg-red-600 text-white text-xs font-semibold hover:bg-red-700 disabled:opacity-50"
                            >
                              Confirm Reject
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              onClick={() => handleApprove(req.id)}
                              disabled={actionLoading === req.id}
                              className="px-4 py-1.5 rounded-full bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold transition disabled:opacity-50"
                            >
                              {actionLoading === req.id ? "Approving..." : "Approve"}
                            </button>
                            <button
                              onClick={() => setConfirmAction(req.id)}
                              className="px-3 py-1.5 rounded-full border border-red-200 bg-red-50 text-xs font-semibold text-red-600 hover:bg-red-100"
                            >
                              Reject
                            </button>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Request Modal */}
      {showRequestModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-3xl p-6 w-full max-w-md shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="h-9 w-9 rounded-xl bg-blue-50 flex items-center justify-center">
                  <DollarSign className="h-5 w-5 text-[#3B82F6]" />
                </div>
                <h3 className="text-base font-bold text-slate-800">New Refund or Credit Request</h3>
              </div>
              <button onClick={() => setShowRequestModal(false)} className="p-1 hover:bg-slate-100 rounded-lg">
                <X className="h-5 w-5 text-slate-400" />
              </button>
            </div>

            {modalError && (
              <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700 flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                {modalError}
              </div>
            )}

            {!activeOrgId && (
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Target Organization *</label>
                <OrgPicker selectedOrg={requestOrg} onSelect={setRequestOrg} placeholder="Select target organization..." />
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Request Type *</label>
              <select
                value={requestForm.request_type}
                onChange={(e) => setRequestForm(f => ({ ...f, request_type: e.target.value }))}
                className="w-full rounded-xl border border-slate-200 bg-white py-2.5 px-4 text-sm text-slate-800 outline-none focus:border-[#3B82F6]"
              >
                <option value="refund">Refund (Direct Payout / Charge Back)</option>
                <option value="credit">Credit (Account Balance Adjustment)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Amount ($) *</label>
              <div className="relative">
                <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 text-sm">$</span>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={requestForm.amount_dollars}
                  onChange={(e) => setRequestForm(f => ({ ...f, amount_dollars: e.target.value }))}
                  placeholder="150.00"
                  className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-8 pr-4 text-sm text-slate-800 outline-none focus:border-[#3B82F6]"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Reason & Audit Explanation *</label>
              <textarea
                value={requestForm.reason}
                onChange={(e) => setRequestForm(f => ({ ...f, reason: e.target.value }))}
                placeholder="Detailed reason for refund/credit..."
                className="w-full rounded-xl border border-slate-200 bg-white py-2.5 px-4 text-sm text-slate-800 outline-none focus:border-[#3B82F6] min-h-[80px] resize-none"
              />
            </div>

            <div className="flex gap-3 pt-2 justify-end border-t border-slate-100">
              <button
                onClick={() => setShowRequestModal(false)}
                className="px-4 py-2 rounded-full border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                onClick={handleRequestSubmit}
                disabled={!requestForm.amount_dollars || !requestForm.reason.trim() || requestLoading}
                className="px-5 py-2 rounded-full bg-[#3B82F6] text-white text-xs font-semibold hover:bg-[#2563EB] disabled:opacity-50 shadow-sm"
              >
                {requestLoading ? "Submitting..." : "Submit Request"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
