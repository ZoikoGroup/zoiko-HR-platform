import { useState, useEffect, useCallback } from "react";
import { useParams } from "react-router-dom";
import {
  ArrowUpRight, ArrowDownRight, Calendar, Clock, CheckCircle, XCircle,
  AlertTriangle, Ban, ChevronRight, RefreshCcw, Search, Filter, Plus,
  GitBranch, Building2, ShieldCheck, Layers, RefreshCw, X
} from "lucide-react";
import { billingService } from "../../service/billingService";
import { useAuth } from "../../context/AuthContext";
import { ROLES } from "../../config/roles";
import PageHeader from "../../components/PageHeader";
import OrgPicker from "../../components/OrgPicker";

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

// Fallback mock records if backend returns empty list (ensures page is rich & informative)
const SAMPLE_PLAN_CHANGES = [
  {
    id: 101,
    organization_id: 1,
    organization_name: "Acme Corporation",
    from_plan_id: 1,
    from_plan_code: "core",
    to_plan_id: 2,
    to_plan_code: "advanced",
    change_type: "upgrade",
    status: "scheduled",
    effective_at: new Date(Date.now() + 86400000 * 12).toISOString(),
    requested_by: "admin@acme.com",
    created_at: new Date(Date.now() - 86400000 * 2).toISOString(),
    blockers_snapshot: [],
  },
  {
    id: 102,
    organization_id: 2,
    organization_name: "Global Tech Ltd",
    from_plan_id: 2,
    from_plan_code: "advanced",
    to_plan_id: 1,
    to_plan_code: "core",
    change_type: "downgrade",
    status: "blocked",
    effective_at: new Date(Date.now() + 86400000 * 5).toISOString(),
    requested_by: "ops@globaltech.io",
    created_at: new Date(Date.now() - 86400000 * 4).toISOString(),
    blockers_snapshot: [{ category: "headcount", severity: "blocking", message: "Workforce size exceeds Core limit (25 max)" }],
  },
];

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

export default function BillingPlanChangesPage() {
  const { orgId } = useParams();
  const { role } = useAuth();
  const isAdmin = [ROLES.SUPER_ADMIN, ROLES.PLATFORM_ADMIN].includes(role);

  const [selectedOrg, setSelectedOrg] = useState(null);
  const activeOrgId = orgId || selectedOrg?.id;

  const [subscription, setSubscription] = useState(null);
  const [plans, setPlans] = useState([]);
  const [changesList, setChangesList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Filter state
  const [typeFilter, setTypeFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  // Schedule / Wizard Modal State
  const [wizardOpen, setWizardOpen] = useState(false);
  const [wizardOrg, setWizardOrg] = useState(null);
  const [targetPlanId, setTargetPlanId] = useState("");
  const [previewResult, setPreviewResult] = useState(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [scheduleLoading, setScheduleLoading] = useState(false);
  const [wizardError, setWizardError] = useState(null);

  // Cancel state
  const [cancelLoading, setCancelLoading] = useState(null);
  const [confirmCancelId, setConfirmCancelId] = useState(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [subData, plansData, changesData] = await Promise.all([
        activeOrgId ? billingService.getSubscription(activeOrgId).catch(() => null) : Promise.resolve(null),
        billingService.getPlans({ page_size: 50 }).catch(() => ({ list: [] })),
        billingService.listPlanChanges(activeOrgId).catch(() => ({ list: [] })),
      ]);

      setSubscription(subData);
      setPlans(plansData.list || []);
      setChangesList(changesData.list || []);
    } catch (e) {
      console.error("Failed to load plan changes", e);
      setError(e.message || "Failed to load plan changes");
    } finally {
      setLoading(false);
    }
  }, [activeOrgId]);

  useEffect(() => { loadData(); }, [loadData]);

  const handlePreview = async () => {
    const orgToPreview = activeOrgId || wizardOrg?.id;
    if (!targetPlanId || !orgToPreview) {
      setWizardError("Please select an organization and target plan first.");
      return;
    }
    setPreviewLoading(true);
    setWizardError(null);
    setPreviewResult(null);
    try {
      const result = await billingService.previewPlanChange(orgToPreview, { plan_id: Number(targetPlanId) });
      setPreviewResult(result);
    } catch (e) {
      setPreviewResult({ error: e.message || "Preview dry-run failed" });
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleSchedule = async () => {
    const orgToSchedule = activeOrgId || wizardOrg?.id;
    if (!targetPlanId || !orgToSchedule) {
      setWizardError("Please select an organization and target plan.");
      return;
    }
    setScheduleLoading(true);
    setWizardError(null);
    try {
      await billingService.schedulePlanChange(orgToSchedule, {
        plan_id: Number(targetPlanId),
        billing_cycle: "monthly",
      });
      setWizardOpen(false);
      setTargetPlanId("");
      setPreviewResult(null);
      loadData();
    } catch (e) {
      setWizardError(e.message || "Scheduling plan change failed.");
    } finally {
      setScheduleLoading(false);
    }
  };

  const handleCancel = async (changeId) => {
    setCancelLoading(changeId);
    try {
      await billingService.cancelPlanChange(changeId, { cancel_reason: "Cancelled by Super Admin" });
      setConfirmCancelId(null);
      loadData();
    } catch (e) {
      setError(e.message || "Cancel failed");
    } finally {
      setCancelLoading(null);
    }
  };

  const filteredChanges = changesList.filter((c) => {
    if (typeFilter && c.change_type !== typeFilter) return false;
    if (statusFilter && c.status !== statusFilter) return false;
    return true;
  });

  const scheduledCount = changesList.filter(c => c.status === "scheduled").length;
  const upgradeCount = changesList.filter(c => c.change_type === "upgrade").length;
  const downgradeCount = changesList.filter(c => c.change_type === "downgrade").length;
  const blockerCount = changesList.filter(c => c.status === "blocked" || (c.blockers_snapshot && c.blockers_snapshot.length > 0)).length;

  return (
    <div className="space-y-6 font-sans">
      <PageHeader
        title="Plan Changes"
        description="Platform-wide tracking of subscription upgrades, downgrades, and dry-run blocker checks."
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
                onClick={() => { setWizardOpen(true); setWizardError(null); setPreviewResult(null); }}
                className="flex items-center gap-2 rounded-full bg-[#3B82F6] hover:bg-[#2563EB] text-white px-4 py-2 text-xs font-semibold transition shadow-sm"
              >
                <Plus className="h-4 w-4" /> Schedule Plan Change
              </button>
            )}
          </div>
        }
      />

      {/* KPI Stats Strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Scheduled Changes" value={scheduledCount} icon={Calendar} color="bg-blue-500" sub="Pending execution" />
        <StatCard label="Upgrades Scheduled" value={upgradeCount} icon={ArrowUpRight} color="bg-emerald-500" sub="Expansion requests" />
        <StatCard label="Downgrades Scheduled" value={downgradeCount} icon={ArrowDownRight} color="bg-amber-500" sub="Contraction requests" />
        <StatCard label="Blocker Warnings" value={blockerCount} icon={AlertTriangle} color={blockerCount > 0 ? "bg-red-500" : "bg-slate-400"} sub={blockerCount > 0 ? "Requires resolution" : "Clear"} />
      </div>

      {/* Scope & Filter Controls */}
      <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-[0_4px_20px_rgba(0,0,0,0.02)] space-y-4">
        <div className="flex items-center gap-2 text-xs font-bold text-slate-500 uppercase tracking-wider">
          <Filter className="h-3.5 w-3.5" /> Scope & Filters
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Organization Scope</label>
            <OrgPicker
              selectedOrg={selectedOrg}
              onSelect={setSelectedOrg}
              placeholder="All Platform Organizations (search...)"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Change Type</label>
            <select
              value={typeFilter}
              onChange={e => setTypeFilter(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-white py-2.5 px-4 text-sm text-slate-800 outline-none focus:border-[#3B82F6] transition"
            >
              <option value="">All Change Types</option>
              <option value="upgrade">Upgrade ↑</option>
              <option value="downgrade">Downgrade ↓</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Status</label>
            <select
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-white py-2.5 px-4 text-sm text-slate-800 outline-none focus:border-[#3B82F6] transition"
            >
              <option value="">All Statuses</option>
              <option value="scheduled">Scheduled</option>
              <option value="executed">Executed</option>
              <option value="blocked">Blocked</option>
              <option value="canceled">Canceled</option>
            </select>
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

      {/* Main Table */}
      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-[0_4px_20px_rgba(0,0,0,0.02)]">
        <h3 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
          <GitBranch className="h-5 w-5 text-[#3B82F6]" /> Scheduled & Historical Plan Changes ({filteredChanges.length})
        </h3>

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-[#3B82F6] border-t-transparent" />
          </div>
        ) : filteredChanges.length === 0 ? (
          <div className="text-center py-12 text-slate-400 text-sm">No plan changes match your filters</div>
        ) : (
          <div className="space-y-3">
            {filteredChanges.map((change) => {
              const statusTone = STATUS_TONES[change.status] || STATUS_TONES.scheduled;
              const isUpgrade = change.change_type === "upgrade";
              return (
                <div key={change.id} className="rounded-2xl border border-slate-100 bg-slate-50/50 p-4 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                  <div className="min-w-0 space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold capitalize ${statusTone}`}>
                        {change.status}
                      </span>
                      <span className={`inline-flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded-md ${
                        isUpgrade ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"
                      }`}>
                        {isUpgrade ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
                        {change.change_type?.toUpperCase()}
                      </span>
                      <span className="text-xs font-bold text-slate-700">
                        {change.organization_name || `Org #${change.organization_id}`}
                      </span>
                    </div>

                    <div className="flex items-center gap-2 text-sm">
                      <span className="font-semibold text-slate-600 capitalize">{change.from_plan_code || `Plan #${change.from_plan_id || "?"}`}</span>
                      <ChevronRight size={16} className="text-slate-400" />
                      <span className="font-bold text-slate-900 capitalize">{change.to_plan_code || `Plan #${change.to_plan_id}`}</span>
                    </div>

                    <div className="flex items-center gap-4 text-xs text-slate-400 flex-wrap">
                      <span className="flex items-center gap-1">
                        <Calendar size={12} /> Effective {change.effective_at ? new Date(change.effective_at).toLocaleDateString() : "—"}
                      </span>
                      {change.requested_by && <span>Requested by {change.requested_by}</span>}
                    </div>

                    {change.blockers_snapshot && change.blockers_snapshot.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-2">
                        {change.blockers_snapshot.map((b, i) => (
                          <BlockerBadge key={i} blocker={b} />
                        ))}
                      </div>
                    )}
                  </div>

                  {change.status === "scheduled" && isAdmin && (
                    <div className="flex items-center gap-2 shrink-0">
                      {confirmCancelId === change.id ? (
                        <>
                          <button
                            onClick={() => setConfirmCancelId(null)}
                            className="px-3 py-1.5 rounded-full border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-100"
                          >
                            Cancel
                          </button>
                          <button
                            onClick={() => handleCancel(change.id)}
                            disabled={cancelLoading === change.id}
                            className="px-3 py-1.5 rounded-full bg-red-600 text-white text-xs font-semibold hover:bg-red-700 disabled:opacity-50"
                          >
                            {cancelLoading === change.id ? "Canceling..." : "Confirm Cancel"}
                          </button>
                        </>
                      ) : (
                        <button
                          onClick={() => setConfirmCancelId(change.id)}
                          className="px-3 py-1.5 rounded-full border border-red-200 bg-red-50 text-xs font-semibold text-red-600 hover:bg-red-100"
                        >
                          Cancel Change
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Schedule Wizard Modal */}
      {wizardOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-3xl w-full max-w-lg shadow-2xl border border-slate-200 p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-base font-bold text-slate-800 flex items-center gap-2">
                <GitBranch className="h-5 w-5 text-[#3B82F6]" /> Schedule Subscription Plan Change
              </h3>
              <button onClick={() => setWizardOpen(false)} className="p-1 hover:bg-slate-100 rounded-lg">
                <X className="h-5 w-5 text-slate-400" />
              </button>
            </div>

            {wizardError && (
              <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700 flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                {wizardError}
              </div>
            )}

            {!activeOrgId && (
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Target Organization *</label>
                <OrgPicker selectedOrg={wizardOrg} onSelect={setWizardOrg} placeholder="Select target organization..." />
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Target Plan *</label>
              <select
                value={targetPlanId}
                onChange={e => { setTargetPlanId(e.target.value); setPreviewResult(null); }}
                className="w-full rounded-xl border border-slate-200 bg-white py-2.5 px-4 text-sm text-slate-800 outline-none focus:border-[#3B82F6]"
              >
                <option value="">Select Target Plan...</option>
                {plans.map(p => (
                  <option key={p.id} value={p.id}>{p.name || p.code} ({p.code?.toUpperCase()} - v{p.catalog_version})</option>
                ))}
              </select>
            </div>

            <div className="flex gap-2 pt-2">
              <button
                onClick={handlePreview}
                disabled={!targetPlanId || previewLoading}
                className="flex-1 py-2 rounded-full border border-[#3B82F6] text-[#3B82F6] text-xs font-semibold hover:bg-blue-50 disabled:opacity-50"
              >
                {previewLoading ? "Running Dry-Run..." : "Preview Dry-Run Blockers"}
              </button>
            </div>

            {previewResult && (
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 space-y-3 text-xs">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-800">Dry-Run Evaluation</span>
                  <span className={`px-2.5 py-0.5 rounded-full font-bold uppercase ${
                    previewResult.eligible ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"
                  }`}>
                    {previewResult.eligible ? "Eligible" : "Blocked"}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-slate-600">
                  <div>Change Type: <strong className="capitalize">{previewResult.change_type || "—"}</strong></div>
                  <div>Target: <strong>{previewResult.to_plan_code || "—"}</strong></div>
                </div>
                {previewResult.blockers && previewResult.blockers.length > 0 && (
                  <div className="space-y-1">
                    <p className="font-semibold text-slate-700">Blockers:</p>
                    {previewResult.blockers.map((b, i) => (
                      <BlockerBadge key={i} blocker={b} />
                    ))}
                  </div>
                )}
              </div>
            )}

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
              <button onClick={() => setWizardOpen(false)} className="px-4 py-2 rounded-full border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-50">
                Cancel
              </button>
              <button
                onClick={handleSchedule}
                disabled={!targetPlanId || scheduleLoading}
                className="px-5 py-2 rounded-full bg-[#3B82F6] text-white text-xs font-semibold hover:bg-[#2563EB] disabled:opacity-50 shadow-sm"
              >
                {scheduleLoading ? "Scheduling..." : "Schedule Plan Change"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
