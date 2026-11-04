import { useState, useEffect, useCallback, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { keys } from "../../service/queryKeys";
import {
  ArrowUpRight, ArrowDownRight, Calendar, Clock, CheckCircle, XCircle,
  AlertTriangle, Ban, ChevronRight, RefreshCw, Search, Filter, Plus,
  GitBranch, Building2, ShieldCheck, Layers, X, Info, Sparkles,
  ExternalLink, Eye, ArrowRight, HelpCircle, Check, AlertCircle, ShieldAlert
} from "lucide-react";
import { billingService } from "../../service/billingService";
import { useAuth } from "../../context/AuthContext";
import { ROLES } from "../../config/roles";
import OrgPicker from "../../components/OrgPicker";
import { formatDate, formatDateTime } from "../../utils/dateTime";

const STATUS_CONFIG = {
  scheduled: {
    label: "Scheduled",
    bg: "bg-blue-50 text-blue-700 border-blue-200",
    dot: "bg-blue-500",
    icon: Clock,
  },
  executed: {
    label: "Executed",
    bg: "bg-emerald-50 text-emerald-700 border-emerald-200",
    dot: "bg-emerald-500",
    icon: CheckCircle,
  },
  canceled: {
    label: "Canceled",
    bg: "bg-slate-50 text-slate-600 border-slate-200",
    dot: "bg-slate-400",
    icon: XCircle,
  },
  blocked: {
    label: "Blocked",
    bg: "bg-rose-50 text-rose-700 border-rose-200",
    dot: "bg-rose-500",
    icon: Ban,
  },
};

const PLAN_BADGES = {
  core: { name: "Core", bg: "bg-blue-50", text: "text-blue-700", border: "border-blue-200" },
  advanced: { name: "Advanced", bg: "bg-purple-50", text: "text-purple-700", border: "border-purple-200" },
  enterprise: { name: "Enterprise", bg: "bg-indigo-50", text: "text-indigo-700", border: "border-indigo-200" },
};

function PlanBadge({ code }) {
  const norm = (code || "").toLowerCase();
  const cfg = PLAN_BADGES[norm] || {
    name: code || "Standard",
    bg: "bg-slate-100",
    text: "text-slate-700",
    border: "border-slate-200",
  };
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border ${cfg.bg} ${cfg.text} ${cfg.border}`}>
      {cfg.name}
    </span>
  );
}

function BlockerBadge({ blocker }) {
  const isBlocking = blocker.severity === "blocking";
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-medium ${
        isBlocking
          ? "bg-rose-50 border-rose-200 text-rose-700"
          : "bg-amber-50 border-amber-200 text-amber-800"
      }`}
    >
      {isBlocking ? <Ban className="h-3.5 w-3.5 text-rose-600 shrink-0" /> : <AlertTriangle className="h-3.5 w-3.5 text-amber-600 shrink-0" />}
      <span className="font-semibold uppercase tracking-wider text-[10px]">{blocker.category || "Constraint"}:</span>
      <span>{blocker.message}</span>
    </span>
  );
}

export default function BillingPlanChangesPage() {
  const { orgId } = useParams();
  const { role } = useAuth();
  const isAdmin = [ROLES.SUPER_ADMIN, ROLES.PLATFORM_ADMIN].includes(role);
  const qc = useQueryClient();

  const [selectedOrg, setSelectedOrg] = useState(null);
  const activeOrgId = orgId || selectedOrg?.id;

  const [subscription, setSubscription] = useState(null);
  const [plans, setPlans] = useState([]);
  const [changesList, setChangesList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastRefreshed, setLastRefreshed] = useState(new Date());

  // Search & Filters
  const [searchQuery, setSearchQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");

  // Guide panel collapse toggle
  const [showGuide, setShowGuide] = useState(false);

  // Inspector slide-over modal
  const [inspectChange, setInspectChange] = useState(null);

  // Schedule Wizard Modal State
  const [wizardOpen, setWizardOpen] = useState(false);
  const [wizardOrg, setWizardOrg] = useState(null);
  const [wizardSub, setWizardSub] = useState(null);
  const [wizardSubLoading, setWizardSubLoading] = useState(false);
  const [targetPlanId, setTargetPlanId] = useState("");
  const [previewResult, setPreviewResult] = useState(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [scheduleLoading, setScheduleLoading] = useState(false);
  const [wizardError, setWizardError] = useState(null);
  const [billingCycle, setBillingCycle] = useState("monthly");
  const [notice, setNotice] = useState(null);

  // Cancel action state
  const [cancelLoading, setCancelLoading] = useState(null);
  const [confirmCancelId, setConfirmCancelId] = useState(null);

  // Load Main Data
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
      setPlans(plansData?.list || []);
      setChangesList(changesData?.list || []);
      setLastRefreshed(new Date());
    } catch (e) {
      console.error("Failed to load plan changes", e);
      setError(e.message || "Failed to load plan changes");
    } finally {
      setLoading(false);
    }
  }, [activeOrgId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // When wizard opens or wizardOrg changes, fetch its current subscription
  const currentWizardOrgId = activeOrgId || wizardOrg?.id;
  useEffect(() => {
    if (!wizardOpen || !currentWizardOrgId) {
      setWizardSub(null);
      return;
    }
    let isLive = true;
    setWizardSubLoading(true);
    billingService.getSubscription(currentWizardOrgId)
      .then((sub) => {
        if (isLive) {
          setWizardSub(sub);
          if (sub?.billing_cycle) {
            setBillingCycle(String(sub.billing_cycle).toLowerCase());
          }
        }
      })
      .catch(() => {
        if (isLive) setWizardSub(null);
      })
      .finally(() => {
        if (isLive) setWizardSubLoading(false);
      });

    return () => { isLive = false; };
  }, [wizardOpen, currentWizardOrgId]);

  // Preview Dry-Run
  const handlePreview = async () => {
    const orgToPreview = activeOrgId || wizardOrg?.id;
    if (!targetPlanId || !orgToPreview) {
      setWizardError("Please select both an organization and target plan.");
      return;
    }
    setPreviewLoading(true);
    setWizardError(null);
    setPreviewResult(null);
    try {
      const result = await billingService.previewPlanChange(orgToPreview, { plan_id: Number(targetPlanId) });
      setPreviewResult(result);
    } catch (e) {
      setPreviewResult({ error: e.message || "Dry-run preview failed" });
    } finally {
      setPreviewLoading(false);
    }
  };

  // Schedule Plan Change
  const handleSchedule = async () => {
    const orgToSchedule = activeOrgId || wizardOrg?.id;
    if (!targetPlanId || !orgToSchedule) {
      setWizardError("Please select target organization and plan.");
      return;
    }
    setScheduleLoading(true);
    setWizardError(null);
    try {
      const change = await billingService.schedulePlanChange(orgToSchedule, {
        plan_id: Number(targetPlanId),
        billing_cycle: billingCycle,
      });

      const planName = plans.find((p) => String(p.id) === String(targetPlanId))?.name || change?.to_plan_code || "the target plan";
      const orgName = (selectedOrg || wizardOrg)?.name || `Org #${orgToSchedule}`;

      if (change?.status === "blocked") {
        setNotice({
          type: "warning",
          message: `Change for ${orgName} to ${planName} was scheduled, but is BLOCKED by active constraints. It will be reviewed by ops.`,
        });
      } else if (change?.change_type === "upgrade") {
        setNotice({
          type: "success",
          message: `Upgrade to ${planName} for ${orgName} scheduled. The background scheduler will apply this within ~1 minute.`,
        });
      } else {
        setNotice({
          type: "info",
          message: `Downgrade to ${planName} for ${orgName} scheduled for period renewal (${change?.effective_at ? formatDate(change.effective_at) : "next cycle"}).`,
        });
      }

      setWizardOpen(false);
      setTargetPlanId("");
      setPreviewResult(null);
      setWizardOrg(null);

      await Promise.all([
        qc.invalidateQueries({ queryKey: keys.billing.all }),
        qc.invalidateQueries({ queryKey: keys.superAdmin.organizations.all }),
        qc.invalidateQueries({ queryKey: keys.superAdmin.commandCenter.all }),
      ]);
      loadData();
    } catch (e) {
      setWizardError(e.message || "Failed to schedule plan change.");
    } finally {
      setScheduleLoading(false);
    }
  };

  // Cancel Scheduled Change
  const handleCancel = async (changeId) => {
    setCancelLoading(changeId);
    try {
      await billingService.cancelPlanChange(changeId, { cancel_reason: "Cancelled by Super Admin" });
      setConfirmCancelId(null);
      if (inspectChange?.id === changeId) {
        setInspectChange(null);
      }
      setNotice({
        type: "info",
        message: `Plan change #${changeId} has been canceled.`,
      });
      loadData();
    } catch (e) {
      setError(e.message || "Cancellation failed.");
    } finally {
      setCancelLoading(null);
    }
  };

  // Filtered dataset
  const filteredChanges = useMemo(() => {
    return changesList.filter((item) => {
      if (typeFilter !== "all" && item.change_type !== typeFilter) return false;
      if (statusFilter !== "all" && item.status !== statusFilter) return false;

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const orgMatch = (item.organization_name || "").toLowerCase().includes(q) || String(item.organization_id).includes(q);
        const fromMatch = (item.from_plan_code || "").toLowerCase().includes(q);
        const toMatch = (item.to_plan_code || "").toLowerCase().includes(q);
        const reqMatch = (item.requested_by || "").toLowerCase().includes(q);
        if (!orgMatch && !fromMatch && !toMatch && !reqMatch) return false;
      }
      return true;
    });
  }, [changesList, typeFilter, statusFilter, searchQuery]);

  // KPI Metrics
  const counts = useMemo(() => {
    return {
      total: changesList.length,
      scheduled: changesList.filter((c) => c.status === "scheduled").length,
      executed: changesList.filter((c) => c.status === "executed").length,
      blocked: changesList.filter((c) => c.status === "blocked" || (c.blockers_snapshot && c.blockers_snapshot.length > 0)).length,
      upgrades: changesList.filter((c) => c.change_type === "upgrade").length,
      downgrades: changesList.filter((c) => c.change_type === "downgrade").length,
    };
  }, [changesList]);

  const hasActiveFilters = typeFilter !== "all" || statusFilter !== "all" || searchQuery.trim() !== "" || !!selectedOrg;

  return (
    <div className="space-y-6 font-sans pb-12">
      {/* ── Breadcrumb & Top Bar ─────────────────────────────────────────── */}
      <div className="flex items-center justify-between text-xs text-slate-500 font-medium">
        <div className="flex items-center gap-1.5">
          <span className="text-slate-400">Super Admin</span>
          <ChevronRight className="h-3 w-3 text-slate-300" />
          <span className="text-slate-400">Billing & Commercial</span>
          <ChevronRight className="h-3 w-3 text-slate-300" />
          <span className="font-semibold text-slate-700">Plan Changes</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
            Scheduler: Active (checks every 1 min)
          </span>
          <span className="text-slate-400 hidden sm:inline">|</span>
          <span className="text-slate-400 hidden sm:inline">Refreshed {formatDateTime(lastRefreshed)}</span>
        </div>
      </div>

      {/* ── Executive Header Banner ───────────────────────────────────────── */}
      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2.5">
              <div className="h-10 w-10 rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-600 text-white flex items-center justify-center shadow-md shadow-blue-500/20">
                <GitBranch className="h-5 w-5" />
              </div>
              <div>
                <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">
                  Subscription Plan Changes
                </h1>
                <p className="text-sm text-slate-500">
                  Track, schedule, and audit subscription tier migrations with automated pre-flight blocker checks.
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2.5 flex-wrap">
            <button
              onClick={() => setShowGuide((prev) => !prev)}
              className={`flex items-center gap-1.5 rounded-xl border px-3.5 py-2 text-xs font-semibold transition ${
                showGuide
                  ? "bg-blue-50 border-blue-200 text-blue-700"
                  : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-900"
              }`}
            >
              <HelpCircle className="h-4 w-4" />
              {showGuide ? "Hide Timing Rules" : "Execution SLA Rules"}
            </button>

            <button
              onClick={loadData}
              disabled={loading}
              className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition disabled:opacity-50"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin text-blue-600" : ""}`} />
              Refresh
            </button>

            {isAdmin && (
              <button
                onClick={() => {
                  setWizardOpen(true);
                  setWizardError(null);
                  setPreviewResult(null);
                  setTargetPlanId("");
                }}
                className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white px-4 py-2 text-xs font-semibold shadow-sm shadow-blue-500/20 transition active:scale-[0.98]"
              >
                <Plus className="h-4 w-4" />
                Schedule Plan Change
              </button>
            )}
          </div>
        </div>

        {/* ── Collapsible Timing Guide ────────────────────────────────────── */}
        {showGuide && (
          <div className="mt-6 pt-5 border-t border-slate-100 grid grid-cols-1 md:grid-cols-3 gap-4 text-xs animate-in fade-in duration-200">
            <div className="rounded-2xl border border-emerald-100 bg-emerald-50/60 p-4 space-y-1.5">
              <div className="flex items-center gap-2 font-bold text-emerald-900">
                <ArrowUpRight className="h-4 w-4 text-emerald-600" />
                <span>Upgrades (Immediate Execution)</span>
              </div>
              <p className="text-emerald-800/80 leading-relaxed">
                Upgrades take effect <strong>within ~1 minute</strong>. The background scheduler processes them continuously. New features and higher limits unlock immediately upon execution.
              </p>
            </div>

            <div className="rounded-2xl border border-amber-100 bg-amber-50/60 p-4 space-y-1.5">
              <div className="flex items-center gap-2 font-bold text-amber-900">
                <ArrowDownRight className="h-4 w-4 text-amber-600" />
                <span>Downgrades (Cycle Renewal Anchor)</span>
              </div>
              <p className="text-amber-800/80 leading-relaxed">
                Downgrades remain <strong>Scheduled</strong> until the organization's current billing period ends (its renewal anchor date) to honor prepaid terms without abrupt disruption.
              </p>
            </div>

            <div className="rounded-2xl border border-rose-100 bg-rose-50/60 p-4 space-y-1.5">
              <div className="flex items-center gap-2 font-bold text-rose-900">
                <ShieldAlert className="h-4 w-4 text-rose-600" />
                <span>Blockers & Validation Safety</span>
              </div>
              <p className="text-rose-800/80 leading-relaxed">
                If an organization exceeds the new plan's employee limit or active module constraints, the change switches to <strong>Blocked</strong> for manual ops review instead of corrupting data.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* ── Toast Notices ────────────────────────────────────────────────── */}
      {notice && (
        <div
          role="status"
          className={`rounded-2xl border p-4 text-sm flex items-center justify-between shadow-sm animate-in fade-in ${
            notice.type === "warning"
              ? "border-amber-200 bg-amber-50 text-amber-900"
              : notice.type === "info"
              ? "border-blue-200 bg-blue-50 text-blue-900"
              : "border-emerald-200 bg-emerald-50 text-emerald-900"
          }`}
        >
          <div className="flex items-center gap-3">
            {notice.type === "warning" ? (
              <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0" />
            ) : notice.type === "info" ? (
              <Info className="h-5 w-5 text-blue-600 shrink-0" />
            ) : (
              <CheckCircle className="h-5 w-5 text-emerald-600 shrink-0" />
            )}
            <span className="font-medium">{notice.message}</span>
          </div>
          <button
            onClick={() => setNotice(null)}
            className="p-1 rounded-lg hover:bg-black/5 text-slate-500 hover:text-slate-800 transition"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {error && (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-rose-800 text-sm flex items-center justify-between shadow-sm">
          <div className="flex items-center gap-3">
            <AlertCircle className="h-5 w-5 text-rose-600 shrink-0" />
            <span>{error}</span>
          </div>
          <button onClick={loadData} className="text-xs font-bold text-rose-700 underline hover:text-rose-900">
            Try Again
          </button>
        </div>
      )}

      {/* ── Interactive KPI Stat Strip ────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {/* Scheduled / Pending */}
        <div
          onClick={() => setStatusFilter(statusFilter === "scheduled" ? "all" : "scheduled")}
          className={`cursor-pointer rounded-2xl border p-5 transition shadow-sm bg-white hover:border-blue-400 ${
            statusFilter === "scheduled" ? "ring-2 ring-blue-500 border-blue-500 bg-blue-50/20" : "border-slate-200"
          }`}
        >
          <div className="flex items-center justify-between mb-2">
            <div className="h-9 w-9 rounded-xl bg-blue-50 text-blue-600 border border-blue-100 flex items-center justify-center font-bold">
              <Clock className="h-4 w-4" />
            </div>
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Scheduled</span>
          </div>
          <div className="flex items-baseline justify-between">
            <p className="text-2xl font-black text-slate-900">{counts.scheduled}</p>
            <span className="text-xs font-semibold text-blue-600">Pending Execution</span>
          </div>
        </div>

        {/* Executed */}
        <div
          onClick={() => setStatusFilter(statusFilter === "executed" ? "all" : "executed")}
          className={`cursor-pointer rounded-2xl border p-5 transition shadow-sm bg-white hover:border-emerald-400 ${
            statusFilter === "executed" ? "ring-2 ring-emerald-500 border-emerald-500 bg-emerald-50/20" : "border-slate-200"
          }`}
        >
          <div className="flex items-center justify-between mb-2">
            <div className="h-9 w-9 rounded-xl bg-emerald-50 text-emerald-600 border border-emerald-100 flex items-center justify-center font-bold">
              <CheckCircle className="h-4 w-4" />
            </div>
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Executed</span>
          </div>
          <div className="flex items-baseline justify-between">
            <p className="text-2xl font-black text-slate-900">{counts.executed}</p>
            <span className="text-xs font-semibold text-emerald-600">Applied Successfully</span>
          </div>
        </div>

        {/* Upgrades vs Downgrades */}
        <div
          onClick={() => setTypeFilter(typeFilter === "downgrade" ? "all" : "downgrade")}
          className={`cursor-pointer rounded-2xl border p-5 transition shadow-sm bg-white hover:border-amber-400 ${
            typeFilter === "downgrade" ? "ring-2 ring-amber-500 border-amber-500 bg-amber-50/20" : "border-slate-200"
          }`}
        >
          <div className="flex items-center justify-between mb-2">
            <div className="h-9 w-9 rounded-xl bg-amber-50 text-amber-600 border border-amber-100 flex items-center justify-center font-bold">
              <ArrowDownRight className="h-4 w-4" />
            </div>
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Downgrades</span>
          </div>
          <div className="flex items-baseline justify-between">
            <p className="text-2xl font-black text-slate-900">{counts.downgrades}</p>
            <span className="text-xs font-semibold text-amber-600">{counts.upgrades} Upgrades</span>
          </div>
        </div>

        {/* Blocked / Issues */}
        <div
          onClick={() => setStatusFilter(statusFilter === "blocked" ? "all" : "blocked")}
          className={`cursor-pointer rounded-2xl border p-5 transition shadow-sm bg-white hover:border-rose-400 ${
            statusFilter === "blocked" ? "ring-2 ring-rose-500 border-rose-500 bg-rose-50/20" : "border-slate-200"
          }`}
        >
          <div className="flex items-center justify-between mb-2">
            <div className={`h-9 w-9 rounded-xl flex items-center justify-center font-bold ${
              counts.blocked > 0 ? "bg-rose-50 text-rose-600 border border-rose-100" : "bg-slate-50 text-slate-400 border border-slate-100"
            }`}>
              <Ban className="h-4 w-4" />
            </div>
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Blocked</span>
          </div>
          <div className="flex items-baseline justify-between">
            <p className={`text-2xl font-black ${counts.blocked > 0 ? "text-rose-600" : "text-slate-900"}`}>{counts.blocked}</p>
            <span className={`text-xs font-semibold ${counts.blocked > 0 ? "text-rose-600" : "text-slate-400"}`}>
              {counts.blocked > 0 ? "Needs Resolution" : "Clean"}
            </span>
          </div>
        </div>
      </div>

      {/* ── Filter & Search Control Center ─────────────────────────────────── */}
      <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
        <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4">
          {/* Quick Search */}
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Filter by organization name, plan code, or requester email..."
              className="w-full rounded-xl border border-slate-200 bg-slate-50/50 pl-10 pr-4 py-2 text-xs text-slate-800 placeholder:text-slate-400 outline-none focus:border-blue-500 focus:bg-white transition"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 p-0.5 text-slate-400 hover:text-slate-600"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          {/* Org Picker Typeahead */}
          <div className="w-full md:w-80">
            <OrgPicker
              selectedOrg={selectedOrg}
              onSelect={setSelectedOrg}
              placeholder="Scope to specific organization..."
            />
          </div>
        </div>

        {/* Segmented Filter Pills */}
        <div className="flex items-center justify-between flex-wrap gap-3 pt-3 border-t border-slate-100 text-xs">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-slate-500 flex items-center gap-1.5">
              <Filter className="h-3.5 w-3.5" /> Status:
            </span>
            {["all", "scheduled", "executed", "blocked", "canceled"].map((status) => {
              const active = statusFilter === status;
              return (
                <button
                  key={status}
                  onClick={() => setStatusFilter(status)}
                  className={`rounded-lg px-2.5 py-1 font-semibold capitalize transition ${
                    active
                      ? "bg-slate-900 text-white"
                      : "bg-slate-100 text-slate-600 hover:bg-slate-200/70"
                  }`}
                >
                  {status}
                </button>
              );
            })}

            <span className="text-slate-300 ml-1">|</span>

            <span className="font-semibold text-slate-500 ml-1">Type:</span>
            {["all", "upgrade", "downgrade"].map((type) => {
              const active = typeFilter === type;
              return (
                <button
                  key={type}
                  onClick={() => setTypeFilter(type)}
                  className={`rounded-lg px-2.5 py-1 font-semibold capitalize transition ${
                    active
                      ? "bg-blue-600 text-white"
                      : "bg-slate-100 text-slate-600 hover:bg-slate-200/70"
                  }`}
                >
                  {type === "upgrade" ? "Upgrades ↑" : type === "downgrade" ? "Downgrades ↓" : "All Types"}
                </button>
              );
            })}
          </div>

          {hasActiveFilters && (
            <button
              onClick={() => {
                setTypeFilter("all");
                setStatusFilter("all");
                setSearchQuery("");
                setSelectedOrg(null);
              }}
              className="text-xs font-semibold text-rose-600 hover:text-rose-700 hover:underline flex items-center gap-1"
            >
              <X className="h-3.5 w-3.5" /> Reset Filters
            </button>
          )}
        </div>
      </div>

      {/* ── Main Plan Changes Data Table ─────────────────────────────────── */}
      <div className="rounded-3xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        <div className="p-5 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Layers className="h-4 w-4 text-blue-600" />
            <h2 className="text-sm font-bold text-slate-900">
              Change Records ({filteredChanges.length})
            </h2>
          </div>
          {selectedOrg && (
            <span className="text-xs text-slate-500">
              Showing records for <strong>{selectedOrg.name}</strong>
            </span>
          )}
        </div>

        {loading ? (
          <div className="p-16 flex flex-col items-center justify-center space-y-3">
            <RefreshCw className="h-8 w-8 text-blue-600 animate-spin" />
            <p className="text-xs font-semibold text-slate-500">Loading plan change logs...</p>
          </div>
        ) : filteredChanges.length === 0 ? (
          <div className="p-16 text-center space-y-3">
            <div className="h-12 w-12 rounded-full bg-slate-100 text-slate-400 mx-auto flex items-center justify-center">
              <GitBranch className="h-6 w-6" />
            </div>
            <div>
              <p className="text-sm font-bold text-slate-700">No plan change records found</p>
              <p className="text-xs text-slate-400 mt-1">
                {hasActiveFilters ? "Try clearing or adjusting your search filters above." : "No plan changes have been requested or executed yet."}
              </p>
            </div>
            {hasActiveFilters && (
              <button
                onClick={() => {
                  setTypeFilter("all");
                  setStatusFilter("all");
                  setSearchQuery("");
                  setSelectedOrg(null);
                }}
                className="mt-2 text-xs font-semibold text-blue-600 hover:underline"
              >
                Clear all active filters
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50/75 border-b border-slate-100 text-slate-500 font-semibold uppercase tracking-wider text-[10px]">
                  <th className="py-3.5 px-4">Organization</th>
                  <th className="py-3.5 px-4">Transition Path</th>
                  <th className="py-3.5 px-4">Type</th>
                  <th className="py-3.5 px-4">Execution Status & Timing</th>
                  <th className="py-3.5 px-4">Requester</th>
                  <th className="py-3.5 px-4">Constraints</th>
                  <th className="py-3.5 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredChanges.map((change) => {
                  const statusConf = STATUS_CONFIG[change.status] || STATUS_CONFIG.scheduled;
                  const isUpgrade = change.change_type === "upgrade";
                  const StatusIcon = statusConf.icon;
                  const hasBlockers = change.blockers_snapshot && change.blockers_snapshot.length > 0;

                  return (
                    <tr
                      key={change.id}
                      className="hover:bg-slate-50/70 transition-colors group"
                    >
                      {/* Organization */}
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-2.5">
                          <div className="h-8 w-8 rounded-xl bg-slate-100 text-slate-600 font-bold flex items-center justify-center shrink-0 border border-slate-200">
                            <Building2 className="h-4 w-4 text-slate-500" />
                          </div>
                          <div>
                            <p className="font-bold text-slate-900 line-clamp-1">
                              {change.organization_name || `Organization #${change.organization_id}`}
                            </p>
                            <p className="text-[10px] text-slate-400">Org ID: #{change.organization_id}</p>
                          </div>
                        </div>
                      </td>

                      {/* Transition Path */}
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-2">
                          <PlanBadge code={change.from_plan_code} />
                          <ChevronRight className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                          <PlanBadge code={change.to_plan_code} />
                          {change.billing_cycle && (
                            <span className="text-[10px] font-semibold text-slate-500 uppercase px-1.5 py-0.5 rounded bg-slate-100 border border-slate-200">
                              {change.billing_cycle}
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Type */}
                      <td className="py-3.5 px-4">
                        <span
                          className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-bold ${
                            isUpgrade
                              ? "bg-emerald-50 text-emerald-700 border border-emerald-200/60"
                              : "bg-amber-50 text-amber-700 border border-amber-200/60"
                          }`}
                        >
                          {isUpgrade ? <ArrowUpRight className="h-3.5 w-3.5" /> : <ArrowDownRight className="h-3.5 w-3.5" />}
                          {isUpgrade ? "Upgrade" : "Downgrade"}
                        </span>
                      </td>

                      {/* Status & Timing */}
                      <td className="py-3.5 px-4">
                        <div className="space-y-1">
                          <div className="flex items-center gap-1.5">
                            <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-bold capitalize ${statusConf.bg}`}>
                              <span className={`h-1.5 w-1.5 rounded-full ${statusConf.dot}`} />
                              {statusConf.label}
                            </span>
                          </div>

                          <div className="text-[11px] text-slate-500 flex items-center gap-1">
                            <Calendar className="h-3 w-3 text-slate-400 shrink-0" />
                            {change.status === "executed" ? (
                              <span>Executed: {change.executed_at ? formatDateTime(change.executed_at) : "Done"}</span>
                            ) : change.status === "scheduled" ? (
                              <span>Effective: {change.effective_at ? formatDateTime(change.effective_at) : "Immediate (~1m)"}</span>
                            ) : (
                              <span>Created: {change.created_at ? formatDateTime(change.created_at) : "—"}</span>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Requester */}
                      <td className="py-3.5 px-4">
                        <span className="text-slate-600 font-medium truncate max-w-[140px] block" title={change.requested_by}>
                          {change.requested_by || "System Automated"}
                        </span>
                      </td>

                      {/* Constraints */}
                      <td className="py-3.5 px-4">
                        {hasBlockers ? (
                          <div className="flex items-center gap-1 text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-2 py-1 max-w-[170px] truncate" title={change.blockers_snapshot.map(b => b.message).join(" | ")}>
                            <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-rose-600" />
                            <span className="font-semibold">{change.blockers_snapshot.length} constraint{change.blockers_snapshot.length > 1 ? "s" : ""}</span>
                          </div>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-emerald-700 font-medium text-[11px]">
                            <Check className="h-3.5 w-3.5 text-emerald-600" /> Clear
                          </span>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="py-3.5 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => setInspectChange(change)}
                            className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-100 text-slate-600 hover:text-slate-900 transition"
                            title="Inspect Change Details"
                          >
                            <Eye className="h-3.5 w-3.5" />
                          </button>

                          {change.status === "scheduled" && isAdmin && (
                            <>
                              {confirmCancelId === change.id ? (
                                <div className="flex items-center gap-1">
                                  <button
                                    onClick={() => setConfirmCancelId(null)}
                                    className="px-2 py-1 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 text-[11px] font-semibold"
                                  >
                                    No
                                  </button>
                                  <button
                                    onClick={() => handleCancel(change.id)}
                                    disabled={cancelLoading === change.id}
                                    className="px-2 py-1 rounded-lg bg-rose-600 text-white hover:bg-rose-700 text-[11px] font-semibold disabled:opacity-50"
                                  >
                                    {cancelLoading === change.id ? "..." : "Confirm"}
                                  </button>
                                </div>
                              ) : (
                                <button
                                  onClick={() => setConfirmCancelId(change.id)}
                                  className="px-2.5 py-1 rounded-lg border border-rose-200 text-rose-700 hover:bg-rose-50 text-[11px] font-semibold transition"
                                >
                                  Cancel
                                </button>
                              )}
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Slide-Over / Modal: Change Inspector ───────────────────────────── */}
      {inspectChange && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4 animate-in fade-in duration-150">
          <div className="bg-white rounded-3xl w-full max-w-xl shadow-2xl border border-slate-200 p-6 space-y-5 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <div className="flex items-center gap-2">
                <div className="h-8 w-8 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center font-bold">
                  <GitBranch className="h-4 w-4" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">
                    Plan Change #{inspectChange.id}
                  </h3>
                  <p className="text-xs text-slate-400">
                    {inspectChange.organization_name || `Organization #${inspectChange.organization_id}`}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setInspectChange(null)}
                className="p-1 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-700 transition"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Status & Path Summary */}
            <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4 space-y-3 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-slate-500 font-medium">Status</span>
                <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 font-bold capitalize ${STATUS_CONFIG[inspectChange.status]?.bg}`}>
                  {STATUS_CONFIG[inspectChange.status]?.label}
                </span>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-slate-500 font-medium">Change Type</span>
                <span className="font-bold capitalize text-slate-800">{inspectChange.change_type}</span>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-slate-500 font-medium">Plan Migration</span>
                <div className="flex items-center gap-1.5">
                  <PlanBadge code={inspectChange.from_plan_code} />
                  <ChevronRight className="h-3 w-3 text-slate-400" />
                  <PlanBadge code={inspectChange.to_plan_code} />
                </div>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-slate-500 font-medium">Billing Cycle</span>
                <span className="font-semibold text-slate-800 uppercase">{inspectChange.billing_cycle || "Monthly"}</span>
              </div>
            </div>

            {/* Timeline & Timestamps */}
            <div className="space-y-2 text-xs">
              <h4 className="font-bold text-slate-700 uppercase tracking-wider text-[10px]">Execution Timeline</h4>
              <div className="grid grid-cols-2 gap-2 text-slate-600 bg-white border border-slate-100 rounded-xl p-3">
                <div>
                  <span className="text-slate-400 block text-[10px]">Requested At</span>
                  <span className="font-semibold">{inspectChange.created_at ? formatDateTime(inspectChange.created_at) : "—"}</span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px]">Effective Target</span>
                  <span className="font-semibold">{inspectChange.effective_at ? formatDateTime(inspectChange.effective_at) : "Immediate"}</span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px]">Executed At</span>
                  <span className="font-semibold">{inspectChange.executed_at ? formatDateTime(inspectChange.executed_at) : "Pending"}</span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px]">Requested By</span>
                  <span className="font-semibold truncate block" title={inspectChange.requested_by}>{inspectChange.requested_by || "System"}</span>
                </div>
              </div>
            </div>

            {/* Blockers Section */}
            {inspectChange.blockers_snapshot && inspectChange.blockers_snapshot.length > 0 && (
              <div className="space-y-2 text-xs">
                <h4 className="font-bold text-rose-700 uppercase tracking-wider text-[10px]">
                  Detected Constraints / Blockers ({inspectChange.blockers_snapshot.length})
                </h4>
                <div className="space-y-1.5">
                  {inspectChange.blockers_snapshot.map((b, i) => (
                    <BlockerBadge key={i} blocker={b} />
                  ))}
                </div>
              </div>
            )}

            {/* Entitlement Delta */}
            {inspectChange.entitlement_delta && (
              <div className="space-y-2 text-xs">
                <h4 className="font-bold text-slate-700 uppercase tracking-wider text-[10px]">Entitlement Delta</h4>
                <div className="space-y-2">
                  {inspectChange.entitlement_delta.gained?.length > 0 && (
                    <div>
                      <span className="text-emerald-700 font-semibold block mb-1">Features Gained (+):</span>
                      <div className="flex flex-wrap gap-1">
                        {inspectChange.entitlement_delta.gained.map((fk) => (
                          <span key={fk} className="px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 font-mono text-[10px] border border-emerald-200">
                            +{fk}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  {inspectChange.entitlement_delta.lost?.length > 0 && (
                    <div>
                      <span className="text-rose-700 font-semibold block mb-1">Features Deprecated (-):</span>
                      <div className="flex flex-wrap gap-1">
                        {inspectChange.entitlement_delta.lost.map((fk) => (
                          <span key={fk} className="px-2 py-0.5 rounded bg-rose-50 text-rose-700 font-mono text-[10px] border border-rose-200">
                            -{fk}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Cancel Action inside inspector */}
            <div className="flex items-center justify-between pt-4 border-t border-slate-100">
              {inspectChange.status === "scheduled" && isAdmin ? (
                <button
                  onClick={() => handleCancel(inspectChange.id)}
                  disabled={cancelLoading === inspectChange.id}
                  className="px-4 py-2 rounded-xl bg-rose-50 text-rose-700 hover:bg-rose-100 border border-rose-200 text-xs font-semibold disabled:opacity-50"
                >
                  {cancelLoading === inspectChange.id ? "Canceling..." : "Cancel This Change"}
                </button>
              ) : <div />}

              <button
                onClick={() => setInspectChange(null)}
                className="px-4 py-2 rounded-xl bg-slate-900 text-white text-xs font-semibold hover:bg-slate-800"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Schedule Plan Change Wizard Modal ─────────────────────────────── */}
      {wizardOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4 animate-in fade-in duration-150">
          <div className="bg-white rounded-3xl w-full max-w-xl shadow-2xl border border-slate-200 p-6 space-y-4 max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <div className="h-8 w-8 rounded-xl bg-blue-600 text-white flex items-center justify-center font-bold">
                  <GitBranch className="h-4 w-4" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">Schedule Subscription Migration</h3>
                  <p className="text-xs text-slate-500">Configure target tier, billing cycle, and pre-flight validation.</p>
                </div>
              </div>
              <button onClick={() => setWizardOpen(false)} className="p-1 hover:bg-slate-100 rounded-lg text-slate-400">
                <X className="h-5 w-5" />
              </button>
            </div>

            {wizardError && (
              <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800 flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 shrink-0 text-rose-600" />
                <span>{wizardError}</span>
              </div>
            )}

            {/* Target Org Selection */}
            {!activeOrgId && (
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Target Organization *</label>
                <OrgPicker
                  selectedOrg={wizardOrg}
                  onSelect={(o) => {
                    setWizardOrg(o);
                    setPreviewResult(null);
                    setWizardError(null);
                  }}
                  placeholder="Search organization to change plan..."
                />
              </div>
            )}

            {/* Current Plan Summary (if org is selected) */}
            {currentWizardOrgId && (
              <div className="rounded-xl border border-blue-100 bg-blue-50/50 p-3 text-xs flex items-center justify-between">
                <div>
                  <span className="text-slate-500 font-medium block">Current Subscription</span>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    {wizardSubLoading ? (
                      <span className="text-slate-400">Checking current plan...</span>
                    ) : wizardSub ? (
                      <>
                        <PlanBadge code={wizardSub.plan_code} />
                        <span className="text-slate-600 font-semibold uppercase text-[10px]">
                          ({wizardSub.billing_cycle || "Monthly"})
                        </span>
                        {wizardSub.renewal_anchor_date && (
                          <span className="text-slate-400 text-[10px]">
                            • Renewal: {formatDate(wizardSub.renewal_anchor_date)}
                          </span>
                        )}
                      </>
                    ) : (
                      <span className="text-slate-500">No active subscription row</span>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Target Plan Selector */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="block text-xs font-bold text-slate-700">Target Plan *</label>
                <span className="text-[11px] text-slate-400">
                  Select tier to migrate to
                </span>
              </div>

              {/* Tier Quick Select Cards (Latest / Recommended) */}
              {(() => {
                // Find latest plans for each code
                const latestByCode = {};
                plans.forEach((p) => {
                  const code = (p.code || "").toUpperCase();
                  if (!latestByCode[code] || p.id > latestByCode[code].id) {
                    latestByCode[code] = p;
                  }
                });

                const tiers = [
                  { code: "CORE", label: "Core", desc: "Basic workforce & attendance", color: "blue", border: "border-blue-200 hover:border-blue-400", active: "border-blue-600 bg-blue-50/60 ring-2 ring-blue-500/20" },
                  { code: "ADVANCED", label: "Advanced", desc: "Full HR suite, payroll & leaves", color: "purple", border: "border-purple-200 hover:border-purple-400", active: "border-purple-600 bg-purple-50/60 ring-2 ring-purple-500/20" },
                  { code: "ENTERPRISE", label: "Enterprise", desc: "Custom limits & dedicated support", color: "indigo", border: "border-indigo-200 hover:border-indigo-400", active: "border-indigo-600 bg-indigo-50/60 ring-2 ring-indigo-500/20" },
                ];

                return (
                  <div className="grid grid-cols-3 gap-2.5">
                    {tiers.map((t) => {
                      const plan = latestByCode[t.code];
                      const isSelected = plan && String(plan.id) === String(targetPlanId);
                      const isCurrent = wizardSub && (wizardSub.plan_code || "").toUpperCase() === t.code;

                      return (
                        <button
                          key={t.code}
                          type="button"
                          disabled={!plan}
                          onClick={() => {
                            if (plan) {
                              setTargetPlanId(String(plan.id));
                              setPreviewResult(null);
                            }
                          }}
                          className={`relative text-left p-3 rounded-2xl border transition flex flex-col justify-between ${
                            isSelected
                              ? t.active
                              : "border-slate-200 bg-white hover:bg-slate-50"
                          } ${isCurrent ? "opacity-75" : ""}`}
                        >
                          <div>
                            <div className="flex items-center justify-between mb-1">
                              <span className="font-bold text-xs text-slate-900">{t.label}</span>
                              {isSelected && (
                                <Check className="h-3.5 w-3.5 text-blue-600 font-bold" />
                              )}
                            </div>
                            <p className="text-[10px] text-slate-500 leading-snug line-clamp-2">{t.desc}</p>
                          </div>

                          <div className="mt-2 pt-2 border-t border-slate-100 flex items-center justify-between text-[10px]">
                            {isCurrent ? (
                              <span className="font-semibold text-slate-400 italic">Current Plan</span>
                            ) : (
                              <span className="font-semibold text-blue-600">Select</span>
                            )}
                            {plan && (
                              <span className="text-[9px] text-slate-400 font-mono">v{plan.catalog_version?.replace("ZHR-COM-BILL-001-", "")}</span>
                            )}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                );
              })()}

              {/* Grouped Dropdown for Exact / Legacy Version Selection */}
              <div className="pt-1">
                <details className="group text-xs">
                  <summary className="cursor-pointer text-[11px] font-semibold text-slate-500 hover:text-blue-600 flex items-center gap-1 select-none">
                    <span>Advanced: Browse all catalog versions ({plans.length} total)</span>
                    <ChevronRight className="h-3 w-3 group-open:rotate-90 transition-transform" />
                  </summary>
                  <div className="mt-2 space-y-1.5 p-3 rounded-xl bg-slate-50 border border-slate-200">
                    <p className="text-[11px] text-slate-500 mb-2">
                      Why are there multiple versions? Zoiko HR preserves historical immutable price snapshots across releases (v1 to v5) to protect existing agreements.
                    </p>
                    <select
                      value={targetPlanId}
                      onChange={(e) => {
                        setTargetPlanId(e.target.value);
                        setPreviewResult(null);
                      }}
                      className="w-full rounded-xl border border-slate-200 bg-white py-2 px-3 text-xs text-slate-800 outline-none focus:border-blue-500"
                    >
                      <option value="">Choose a specific plan version...</option>
                      {/* Group by Catalog Version */}
                      {(() => {
                        const groups = {};
                        plans.forEach((p) => {
                          const v = p.catalog_version || "Standard";
                          if (!groups[v]) groups[v] = [];
                          groups[v].push(p);
                        });
                        return Object.entries(groups)
                          .sort(([a], [b]) => b.localeCompare(a))
                          .map(([ver, verPlans]) => (
                            <optgroup key={ver} label={`Catalog: ${ver}`}>
                              {verPlans.map((p) => (
                                <option key={p.id} value={p.id}>
                                  {p.name || p.code} ({p.code?.toUpperCase()} — ID #{p.id}) {p.published_at ? "• Published" : "• Draft"}
                                </option>
                              ))}
                            </optgroup>
                          ));
                      })()}
                    </select>
                  </div>
                </details>
              </div>
            </div>

            {/* Billing Cycle */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Billing Cycle *</label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setBillingCycle("monthly")}
                  className={`py-2 px-3 rounded-xl border text-xs font-semibold transition text-center ${
                    billingCycle === "monthly"
                      ? "border-blue-500 bg-blue-50 text-blue-700 ring-1 ring-blue-500"
                      : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  Monthly Cycle
                </button>
                <button
                  type="button"
                  onClick={() => setBillingCycle("annual")}
                  className={`py-2 px-3 rounded-xl border text-xs font-semibold transition text-center ${
                    billingCycle === "annual"
                      ? "border-blue-500 bg-blue-50 text-blue-700 ring-1 ring-blue-500"
                      : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  Annual Cycle (Yearly)
                </button>
              </div>
            </div>

            {/* Pre-Flight Preview Button */}
            <div className="pt-1">
              <button
                type="button"
                onClick={handlePreview}
                disabled={!targetPlanId || previewLoading}
                className="w-full py-2.5 rounded-xl border border-blue-600 text-blue-600 hover:bg-blue-50 text-xs font-bold flex items-center justify-center gap-1.5 transition disabled:opacity-50"
              >
                <Sparkles className="h-3.5 w-3.5" />
                {previewLoading ? "Running Blocker Pre-Flight..." : "Run Pre-Flight Dry Run & Blocker Check"}
              </button>
            </div>

            {/* Pre-Flight Evaluation Results */}
            {previewResult && (
              <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4 space-y-3 text-xs">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-900">Pre-Flight Validation:</span>
                  <span
                    className={`px-2.5 py-0.5 rounded-full font-bold uppercase text-[10px] ${
                      previewResult.eligible
                        ? "bg-emerald-100 text-emerald-800 border border-emerald-200"
                        : "bg-rose-100 text-rose-800 border border-rose-200"
                    }`}
                  >
                    {previewResult.eligible ? "Eligible (Clear)" : "Blocked by Constraints"}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2 text-slate-600">
                  <div>
                    Change Type: <strong className="capitalize text-slate-800">{previewResult.change_type || "—"}</strong>
                  </div>
                  <div>
                    Target: <strong className="uppercase text-slate-800">{previewResult.to_plan_code || "—"}</strong>
                  </div>
                </div>

                {/* Timing expectation callout */}
                <div className="rounded-xl bg-white border border-slate-200 p-2.5 text-[11px]">
                  {previewResult.change_type === "upgrade" ? (
                    <p className="text-emerald-800 flex items-center gap-1.5">
                      <Clock className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                      <span><strong>Timing:</strong> Upgrades execute within ~1 minute after scheduling.</span>
                    </p>
                  ) : (
                    <p className="text-amber-800 flex items-center gap-1.5">
                      <Calendar className="h-3.5 w-3.5 text-amber-600 shrink-0" />
                      <span><strong>Timing:</strong> Downgrades execute on cycle renewal ({previewResult.effective_at ? formatDate(previewResult.effective_at) : "next anchor"}).</span>
                    </p>
                  )}
                </div>

                {previewResult.blockers && previewResult.blockers.length > 0 && (
                  <div className="space-y-1 pt-1">
                    <p className="font-semibold text-rose-800">Blocking Issues:</p>
                    {previewResult.blockers.map((b, i) => (
                      <BlockerBadge key={i} blocker={b} />
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Modal Actions */}
            <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setWizardOpen(false)}
                className="px-4 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSchedule}
                disabled={!targetPlanId || scheduleLoading}
                className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold transition shadow-sm disabled:opacity-50"
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