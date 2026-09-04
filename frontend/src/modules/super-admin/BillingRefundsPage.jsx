import { useState, useEffect, useCallback } from "react";
import { useParams } from "react-router-dom";
import {
  AlertTriangle, CheckCircle, XCircle, RotateCcw, Clock,
  Filter, ChevronDown, DollarSign,
} from "lucide-react";
import { billingService } from "../../service/billingService";
import { useAuth } from "../../context/AuthContext";
import { ROLES } from "../../config/roles";
import PageHeader from "../../components/PageHeader";
import { Button } from "../../components/billing-ui";

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

function formatCents(cents) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format((cents || 0) / 100);
}

export default function BillingRefundsPage() {
  const { orgId } = useParams();
  const { role } = useAuth();
  const isAdmin = [ROLES.SUPER_ADMIN, ROLES.PLATFORM_ADMIN].includes(role);

  const [refundRequests, setRefundRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [statusFilter, setStatusFilter] = useState("");

  // Request modal state
  const [showRequestModal, setShowRequestModal] = useState(false);
  const [requestForm, setRequestForm] = useState({ amount_cents: "", reason: "", request_type: "refund" });
  const [requestLoading, setRequestLoading] = useState(false);

  // Approve/reject state
  const [actionLoading, setActionLoading] = useState(null);
  const [confirmAction, setConfirmAction] = useState(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await billingService.listRefundRequests(orgId);
      setRefundRequests(data.list || []);
    } catch (e) {
      setError(e.message || "Failed to load refund requests");
    } finally {
      setLoading(false);
    }
  }, [orgId]);

  useEffect(() => { loadData(); }, [loadData]);

  const handleRequestSubmit = async () => {
    if (!requestForm.amount_cents || !requestForm.reason.trim()) return;
    setRequestLoading(true);
    try {
      await billingService.requestRefund(orgId, {
        amount_cents: Number(requestForm.amount_cents),
        reason: requestForm.reason,
        request_type: requestForm.request_type,
      });
      setShowRequestModal(false);
      setRequestForm({ amount_cents: "", reason: "", request_type: "refund" });
      loadData();
    } catch (e) {
      setError(e.message || "Request failed");
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
      await billingService.rejectRefund(requestId, { rejection_reason: "Rejected by admin" });
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

  if (loading) {
    return (
      <div className="space-y-6 font-sans">
        <PageHeader title="Refund & Credit Management" description="Loading..." />
        <div className="flex items-center justify-center py-20">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-[#3B82F6] border-t-transparent" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 font-sans">
      <PageHeader
        title="Refund & Credit Management"
        description={`Manage refunds and credits for organization ${orgId}`}
        icon={DollarSign}
        actions={
          isAdmin && (
            <Button variant="primary" size="md" icon={DollarSign} onClick={() => setShowRequestModal(true)}>
              New Request
            </Button>
          )
        }
      />

      {error && (
        <div className="rounded-3xl border border-red-200 bg-red-50 p-4 text-red-700 text-sm flex items-center gap-3">
          <AlertTriangle className="h-5 w-5 shrink-0" />
          <span>{error}</span>
          <button onClick={() => setError(null)} className="ml-auto text-red-600 underline text-xs font-semibold">Dismiss</button>
        </div>
      )}

      {/* Filters */}
      <div className="flex items-center gap-3">
        <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Filter:</span>
        {["", "pending", "approved", "rejected", "processed"].map(s => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={`rounded-full border px-3 py-1 text-xs font-semibold transition-colors ${
              statusFilter === s
                ? "border-[#3B82F6] bg-[#3B82F6]/10 text-[#3B82F6]"
                : "border-slate-200 bg-white text-slate-500 hover:bg-slate-50"
            }`}
          >
            {s ? s.charAt(0).toUpperCase() + s.slice(1) : "All"}
          </button>
        ))}
      </div>

      {/* Refund List */}
      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-[0_4px_20px_rgba(0,0,0,0.02)]">
        {filtered.length === 0 ? (
          <div className="text-center py-8 text-slate-400 text-sm">No refund requests found</div>
        ) : (
          <div className="space-y-3">
            {filtered.map((req) => {
              const statusTone = STATUS_TONES[req.status] || STATUS_TONES.pending;
              const typeLabel = TYPE_LABELS[req.request_type] || req.request_type;
              return (
                <div key={req.id} className="rounded-2xl border border-slate-100 bg-slate-50/50 p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${statusTone}`}>
                          {req.status}
                        </span>
                        <span className="text-xs font-medium text-slate-500">{typeLabel}</span>
                        <span className="text-sm font-bold text-slate-800">{formatCents(req.amount_cents)}</span>
                      </div>
                      <p className="mt-1 text-sm text-slate-600">{req.reason}</p>
                      <div className="flex items-center gap-3 mt-1 text-xs text-slate-400">
                        <span className="flex items-center gap-1">
                          <Clock size={12} />
                          {new Date(req.created_at).toLocaleString()}
                        </span>
                        <span>Requested by {req.requested_by}</span>
                        {req.stripe_refund_id && <span className="font-mono text-xs">Stripe: {req.stripe_refund_id}</span>}
                      </div>
                      {req.rejection_reason && (
                        <p className="mt-1 text-xs text-red-600">Rejection reason: {req.rejection_reason}</p>
                      )}
                      {req.approved_by && (
                        <p className="mt-1 text-xs text-emerald-600">Approved by {req.approved_by}</p>
                      )}
                    </div>

                    {/* Approve/Reject for admins on pending requests */}
                    {isAdmin && req.status === "pending" && (
                      <div className="flex gap-2 shrink-0">
                        {confirmAction === req.id ? (
                          <>
                            <Button size="sm" variant="ghost" onClick={() => setConfirmAction(null)}>
                              Cancel
                            </Button>
                            <Button
                              size="sm"
                              variant="danger"
                              icon={XCircle}
                              loading={actionLoading === req.id}
                              onClick={() => handleReject(req.id)}
                            >
                              Reject
                            </Button>
                          </>
                        ) : (
                          <>
                            <Button
                              size="sm"
                              variant="primary"
                              icon={CheckCircle}
                              loading={actionLoading === req.id}
                              onClick={() => handleApprove(req.id)}
                            >
                              Approve
                            </Button>
                            <Button
                              size="sm"
                              variant="danger"
                              icon={XCircle}
                              onClick={() => setConfirmAction(req.id)}
                            >
                              Reject
                            </Button>
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-3xl p-6 w-full max-w-md shadow-xl border border-slate-200">
            <div className="flex items-center gap-3 mb-4">
              <div className="h-10 w-10 rounded-full bg-[#3B82F6]/10 flex items-center justify-center">
                <DollarSign className="h-5 w-5 text-[#3B82F6]" />
              </div>
              <h3 className="text-lg font-bold text-slate-800">Request Refund/Credit</h3>
            </div>
            <div className="space-y-4">
              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-500">Type</label>
                <select
                  value={requestForm.request_type}
                  onChange={(e) => setRequestForm(f => ({ ...f, request_type: e.target.value }))}
                  className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-3.5 pr-9 text-sm text-slate-700 focus:border-[#3B82F6] focus:outline-none focus:ring-2 focus:ring-[#3B82F6]/30"
                >
                  <option value="refund">Refund</option>
                  <option value="credit">Credit</option>
                </select>
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-500">Amount (cents)</label>
                <input
                  type="number"
                  value={requestForm.amount_cents}
                  onChange={(e) => setRequestForm(f => ({ ...f, amount_cents: e.target.value }))}
                  placeholder="e.g. 5000"
                  className="w-full rounded-xl border border-slate-200 bg-white py-2.5 px-4 text-sm text-slate-700 focus:border-[#3B82F6] focus:outline-none focus:ring-2 focus:ring-[#3B82F6]/30"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-500">Reason</label>
                <textarea
                  value={requestForm.reason}
                  onChange={(e) => setRequestForm(f => ({ ...f, reason: e.target.value }))}
                  placeholder="Reason for refund/credit..."
                  className="w-full rounded-xl border border-slate-200 bg-white py-2.5 px-4 text-sm text-slate-700 focus:border-[#3B82F6] focus:outline-none focus:ring-2 focus:ring-[#3B82F6]/30 min-h-[80px] resize-y"
                />
              </div>
            </div>
            <div className="flex gap-3 mt-6 justify-end">
              <button
                onClick={() => { setShowRequestModal(false); setRequestForm({ amount_cents: "", reason: "", request_type: "refund" }); }}
                className="px-4 py-2 rounded-full border border-slate-200 text-sm text-slate-600 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                onClick={handleRequestSubmit}
                disabled={!requestForm.amount_cents || !requestForm.reason.trim() || requestLoading}
                className="flex items-center gap-2 px-4 py-2 rounded-full bg-[#3B82F6] text-white text-sm font-semibold hover:bg-[#2563EB] disabled:opacity-50"
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
