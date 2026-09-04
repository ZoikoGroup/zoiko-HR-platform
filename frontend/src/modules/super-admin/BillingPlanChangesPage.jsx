import { useState, useEffect, useCallback } from "react";
import { useParams } from "react-router-dom";
import {
  ArrowUpRight, ArrowDownRight, Calendar, Clock, CheckCircle, XCircle,
  AlertTriangle, Ban, ChevronDown, ChevronRight, Shield,
  RefreshCcw, RotateCcw,
} from "lucide-react";
import { billingService } from "../../service/billingService";
import { useAuth } from "../../context/AuthContext";
import { ROLES } from "../../config/roles";
import PageHeader from "../../components/PageHeader";
import { Button } from "../../components/billing-ui";

const PLAN_OPTIONS = [
  { id: 2, code: "CORE", label: "Core Plan" },
  { id: 3, code: "ADVANCED", label: "Advanced Plan" },
  { id: 4, code: "ENTERPRISE", label: "Enterprise Plan" },
];

const STATUS_TONES = {
  scheduled: "bg-blue-50 text-blue-700 border-blue-200",
  executed: "bg-emerald-50 text-emerald-700 border-emerald-200",
  canceled: "bg-slate-50 text-slate-500 border-slate-200",
  blocked: "bg-red-50 text-red-700 border-red-200",
};

const BLOCKER_SEVERITY = {
  blocking: { bg: "bg-red-50 border-red-200 text-red-700", icon: Ban },
  warning:  { bg: "bg-amber-50 border-amber-200 text-amber-700", icon: AlertTriangle },
  error:    { bg: "bg-red-50 border-red-200 text-red-700", icon: XCircle },
};

function formatCents(cents) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format((cents || 0) / 100);
}

function BlockerBadge({ blocker }) {
  const tone = BLOCKER_SEVERITY[blocker.severity] || BLOCKER_SEVERITY.blocking;
  const Icon = tone.icon;
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold ${tone.bg}`}>
      <Icon size={12} />
      {blocker.category}: {blocker.message}
    </span>
  );
}

export default function BillingPlanChangesPage() {
  const { orgId } = useParams();
  const { role } = useAuth();
  const isAdmin = [ROLES.SUPER_ADMIN, ROLES.PLATFORM_ADMIN].includes(role);

  const [subscription, setSubscription] = useState(null);
  const [plans, setPlans] = useState([]);
  const [pendingChanges, setPendingChanges] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Preview state
  const [previewTarget, setPreviewTarget] = useState("");
  const [previewResult, setPreviewResult] = useState(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  // Schedule state
  const [scheduleTarget, setScheduleTarget] = useState("");
  const [scheduleLoading, setScheduleLoading] = useState(false);

  // Cancel state
  const [cancelLoading, setCancelLoading] = useState(null);
  const [confirmCancelId, setConfirmCancelId] = useState(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [subData, plansData, changesData] = await Promise.all([
        billingService.getSubscription(orgId).catch(() => null),
        billingService.getPlans({ page_size: 50 }).catch(() => ({ list: [] })),
        billingService.listPlanChanges(orgId).catch(() => ({ list: [] })),
      ]);
      setSubscription(subData);
      setPlans(plansData.list || []);
      setPendingChanges(changesData.list || []);
    } catch (e) {
      setError(e.message || "Failed to load plan changes");
    } finally {
      setLoading(false);
    }
  }, [orgId]);

  useEffect(() => { loadData(); }, [loadData]);

  const handlePreview = async () => {
    if (!previewTarget) return;
    setPreviewLoading(true);
    setPreviewResult(null);
    try {
      const result = await billingService.previewPlanChange(orgId, { plan_id: Number(previewTarget) });
      setPreviewResult(result);
    } catch (e) {
      setPreviewResult({ error: e.message || "Preview failed" });
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleSchedule = async () => {
    if (!scheduleTarget) return;
    setScheduleLoading(true);
    try {
      await billingService.schedulePlanChange(orgId, {
        plan_id: Number(scheduleTarget),
        billing_cycle: subscription?.billing_cycle || "monthly",
      });
      setScheduleTarget("");
      loadData();
    } catch (e) {
      setError(e.message || "Schedule failed");
    } finally {
      setScheduleLoading(false);
    }
  };

  const handleCancel = async (changeId) => {
    setCancelLoading(changeId);
    try {
      await billingService.cancelPlanChange(changeId, { cancel_reason: "Cancelled by admin" });
      setConfirmCancelId(null);
      loadData();
    } catch (e) {
      setError(e.message || "Cancel failed");
    } finally {
      setCancelLoading(null);
    }
  };

  const availablePlans = plans.filter(p => p.id !== subscription?.plan_id);

  if (loading) {
    return (
      <div className="space-y-6 font-sans">
        <PageHeader title="Plan Changes" description="Loading..." />
        <div className="flex items-center justify-center py-20">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-[#3B82F6] border-t-transparent" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 font-sans">
      <PageHeader
        title="Plan Changes"
        description={`Manage plan changes for organization ${orgId}`}
        icon={RefreshCcw}
      />

      {error && (
        <div className="rounded-3xl border border-red-200 bg-red-50 p-4 text-red-700 text-sm flex items-center gap-3">
          <AlertTriangle className="h-5 w-5 shrink-0" />
          <span>{error}</span>
          <button onClick={() => setError(null)} className="ml-auto text-red-600 underline text-xs font-semibold">Dismiss</button>
        </div>
      )}

      {/* Current Subscription */}
      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-[0_4px_20px_rgba(0,0,0,0.02)]">
        <h3 className="text-sm font-bold uppercase tracking-wider text-slate-500 mb-4">Current Subscription</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="rounded-2xl bg-slate-50 border border-slate-100 p-4">
            <p className="text-xs text-slate-400">Plan</p>
            <p className="text-sm font-bold text-slate-800 mt-1">{subscription?.plan_code?.toUpperCase() || "—"}</p>
          </div>
          <div className="rounded-2xl bg-slate-50 border border-slate-100 p-4">
            <p className="text-xs text-slate-400">Status</p>
            <p className="text-sm font-bold text-slate-800 mt-1 capitalize">{subscription?.status?.toLowerCase() || "—"}</p>
          </div>
          <div className="rounded-2xl bg-slate-50 border border-slate-100 p-4">
            <p className="text-xs text-slate-400">Billing Cycle</p>
            <p className="text-sm font-bold text-slate-800 mt-1 capitalize">{subscription?.billing_cycle || "—"}</p>
          </div>
          <div className="rounded-2xl bg-slate-50 border border-slate-100 p-4">
            <p className="text-xs text-slate-400">Next Renewal</p>
            <p className="text-sm font-bold text-slate-800 mt-1">
              {subscription?.renewal_anchor_date
                ? new Date(subscription.renewal_anchor_date).toLocaleDateString()
                : "—"}
            </p>
          </div>
        </div>
      </div>

      {/* Preview & Schedule */}
      {isAdmin && (
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-[0_4px_20px_rgba(0,0,0,0.02)]">
          <h3 className="text-sm font-bold uppercase tracking-wider text-slate-500 mb-4">Plan Change Wizard</h3>

          {/* Step 1: Select target plan */}
          <div className="mb-4">
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-500">
              Target Plan
            </label>
            <select
              value={previewTarget || scheduleTarget}
              onChange={(e) => { setPreviewTarget(e.target.value); setScheduleTarget(e.target.value); setPreviewResult(null); }}
              className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-3.5 pr-9 text-sm text-slate-700 focus:border-[#3B82F6] focus:outline-none focus:ring-2 focus:ring-[#3B82F6]/30"
            >
              <option value="">Select a plan...</option>
              {availablePlans.map(p => (
                <option key={p.id} value={p.id}>{p.name} ({p.code})</option>
              ))}
            </select>
          </div>

          {/* Step 2: Preview */}
          <div className="flex gap-3 mb-4">
            <Button
              variant="secondary"
              size="md"
              icon={ArrowDownRight}
              onClick={handlePreview}
              loading={previewLoading}
              disabled={!previewTarget}
            >
              Preview Changes
            </Button>
            <Button
              variant="primary"
              size="md"
              icon={ArrowUpRight}
              onClick={handleSchedule}
              loading={scheduleLoading}
              disabled={!scheduleTarget}
            >
              Schedule Change
            </Button>
          </div>

          {/* Preview Result */}
          {previewResult && !previewResult.error && (
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-bold text-slate-800">Preview Result</span>
                <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${
                  previewResult.eligible ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-red-50 text-red-700 border-red-200"
                }`}>
                  {previewResult.eligible ? "Eligible" : "Blocked"}
                </span>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                <div>
                  <span className="text-xs text-slate-400">Type</span>
                  <p className="font-semibold text-slate-700 capitalize">{previewResult.change_type || "—"}</p>
                </div>
                <div>
                  <span className="text-xs text-slate-400">From</span>
                  <p className="font-semibold text-slate-700">{previewResult.from_plan_code || "—"}</p>
                </div>
                <div>
                  <span className="text-xs text-slate-400">To</span>
                  <p className="font-semibold text-slate-700">{previewResult.to_plan_code || "—"}</p>
                </div>
                <div>
                  <span className="text-xs text-slate-400">Effective</span>
                  <p className="font-semibold text-slate-700">
                    {previewResult.effective_at ? new Date(previewResult.effective_at).toLocaleDateString() : "—"}
                  </p>
                </div>
              </div>

              {/* Proration */}
              {previewResult.proration_preview && (
                <div className="rounded-xl bg-white border border-slate-100 p-3">
                  <p className="text-xs font-semibold text-slate-500 mb-2">Proration Estimate</p>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div>
                      <span className="text-xs text-slate-400">Amount Due</span>
                      <p className="font-semibold text-slate-700">{formatCents(previewResult.proration_preview.amount_due)}</p>
                    </div>
                    <div>
                      <span className="text-xs text-slate-400">Credit</span>
                      <p className="font-semibold text-slate-700">{formatCents(previewResult.proration_preview.credit)}</p>
                    </div>
                  </div>
                </div>
              )}

              {/* Blockers */}
              {previewResult.blockers && previewResult.blockers.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-slate-500 mb-2">Blockers</p>
                  <div className="flex flex-wrap gap-2">
                    {previewResult.blockers.map((b, i) => (
                      <BlockerBadge key={i} blocker={b} />
                    ))}
                  </div>
                </div>
              )}

              {/* Entitlement Delta */}
              {previewResult.entitlement_delta && (
                <div className="rounded-xl bg-white border border-slate-100 p-3">
                  <p className="text-xs font-semibold text-slate-500 mb-2">Entitlement Changes</p>
                  <pre className="text-xs text-slate-600 whitespace-pre-wrap">
                    {JSON.stringify(previewResult.entitlement_delta, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          )}

          {previewResult?.error && (
            <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
              {previewResult.error}
            </div>
          )}
        </div>
      )}

      {/* Pending Changes */}
      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-[0_4px_20px_rgba(0,0,0,0.02)]">
        <h3 className="text-sm font-bold uppercase tracking-wider text-slate-500 mb-4">Pending Changes</h3>
        {pendingChanges.length === 0 ? (
          <div className="text-center py-8 text-slate-400 text-sm">No pending plan changes</div>
        ) : (
          <div className="space-y-3">
            {pendingChanges.map((change) => {
              const statusTone = STATUS_TONES[change.status] || STATUS_TONES.scheduled;
              return (
                <div key={change.id} className="rounded-2xl border border-slate-100 bg-slate-50/50 p-4 flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${statusTone}`}>
                        {change.status}
                      </span>
                      <span className="text-sm font-bold text-slate-800 capitalize">
                        {change.change_type}
                      </span>
                      <ChevronRight size={14} className="text-slate-400" />
                      <span className="text-sm font-semibold text-slate-600">
                        Plan #{change.to_plan_id}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 mt-1 text-xs text-slate-500">
                      <span className="flex items-center gap-1">
                        <Calendar size={12} />
                        Effective {new Date(change.effective_at).toLocaleDateString()}
                      </span>
                      {change.requested_by && <span>by {change.requested_by}</span>}
                      {change.blockers_snapshot && change.blockers_snapshot.length > 0 && (
                        <span className="flex items-center gap-1 text-amber-600">
                          <AlertTriangle size={12} />
                          {change.blockers_snapshot.length} blocker(s)
                        </span>
                      )}
                    </div>
                  </div>

                  {change.status === "scheduled" && isAdmin && (
                    <div className="flex gap-2">
                      {confirmCancelId === change.id ? (
                        <>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setConfirmCancelId(null)}
                          >
                            Never mind
                          </Button>
                          <Button
                            size="sm"
                            variant="danger"
                            icon={XCircle}
                            loading={cancelLoading === change.id}
                            onClick={() => handleCancel(change.id)}
                          >
                            Confirm Cancel
                          </Button>
                        </>
                      ) : (
                        <Button
                          size="sm"
                          variant="danger"
                          icon={XCircle}
                          onClick={() => setConfirmCancelId(change.id)}
                        >
                          Cancel
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
