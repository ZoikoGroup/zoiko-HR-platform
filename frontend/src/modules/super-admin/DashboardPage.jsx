import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import {
  Building2, Users, CircleDollarSign, Rocket, ShieldCheck, AlertTriangle,
  RefreshCw, Download, Plus, ExternalLink,
} from "lucide-react";
import { superAdminService } from "../../service/superAdminService";
import StatTile from "./command-center/StatTile";
import NeedsAttentionTable from "./command-center/NeedsAttentionTable";
import CustomerHealthCard from "./command-center/CustomerHealthCard";
import CommercialHealthCard from "./command-center/CommercialHealthCard";
import OrgLifecycleFunnel from "./command-center/OrgLifecycleFunnel";
import PlatformHealthCard from "./command-center/PlatformHealthCard";
import SecurityAccessCard from "./command-center/SecurityAccessCard";
import GovernanceAuditCard from "./command-center/GovernanceAuditCard";
import { formatCurrencyFromCents, formatCompactNumber, BLUE, EMERALD, RED } from "./command-center/format";

const BANNER_META = {
  operational: { label: "Production operational", dot: "bg-emerald-500", bg: "bg-emerald-50", border: "border-emerald-200/60", text: "text-emerald-700" },
  degraded: { label: "Production degraded", dot: "bg-amber-500", bg: "bg-amber-50", border: "border-amber-200/60", text: "text-amber-700" },
  outage: { label: "Production outage", dot: "bg-red-500", bg: "bg-red-50", border: "border-red-200/60", text: "text-red-700" },
};

export default function SuperAdminDashboardPage() {
  const navigate = useNavigate();
  const platformHealthRef = useRef(null);

  const [days, setDays] = useState(30);
  const [overview, setOverview] = useState(null);
  const [attention, setAttention] = useState([]);
  const [customerHealth, setCustomerHealth] = useState(null);
  const [commercialHealth, setCommercialHealth] = useState(null);
  const [lifecycle, setLifecycle] = useState(null);
  const [platformHealth, setPlatformHealth] = useState([]);
  const [security, setSecurity] = useState(null);
  const [recentAudit, setRecentAudit] = useState([]);
  const [auditEventsCount, setAuditEventsCount] = useState(0);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastLoadedAt, setLastLoadedAt] = useState(null);

  const loadAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = { days };
      const [
        overviewData, attentionData, customerHealthData, commercialHealthData,
        lifecycleData, platformHealthData, securityData, auditLogsData,
      ] = await Promise.all([
        superAdminService.getCommandCenterOverview(params),
        superAdminService.getCommandCenterAttention(),
        superAdminService.getCommandCenterCustomerHealth(),
        superAdminService.getCommandCenterCommercialHealth(params),
        superAdminService.getCommandCenterLifecycle(),
        superAdminService.getCommandCenterPlatformHealth(),
        superAdminService.getCommandCenterSecurity(params),
        superAdminService.getAuditLogs({ limit: 8 }),
      ]);
      setOverview(overviewData);
      setAttention(attentionData?.items || []);
      setCustomerHealth(customerHealthData);
      setCommercialHealth(commercialHealthData);
      setLifecycle(lifecycleData);
      setPlatformHealth(platformHealthData || []);
      setSecurity(securityData);
      setRecentAudit(auditLogsData?.logs || []);
      setAuditEventsCount(auditLogsData?.total || 0);
      setLastLoadedAt(new Date());
    } catch (e) {
      console.error("Failed to load Platform Command Center", e);
      setError(e.message || "Unable to load the Platform Command Center.");
    } finally {
      setLoading(false);
    }
  }, [days]);

  useEffect(() => { loadAll(); }, [loadAll]);

  const handleUpdateServiceStatus = async (serviceName, status) => {
    try {
      const existing = platformHealth.find((s) => s.service_name === serviceName);
      const updated = await superAdminService.updateCommandCenterPlatformHealth(serviceName, {
        status,
        availability_pct: existing?.availability_pct ?? null,
        latency_p95_ms: existing?.latency_p95_ms ?? null,
        notes: existing?.notes ?? null,
      });
      setPlatformHealth((prev) => prev.map((s) => (s.service_name === serviceName ? updated : s)));
      loadAll();
    } catch (e) {
      console.error("Failed to update service health", e);
    }
  };

  const handleExport = () => {
    if (!overview) return;
    const rows = [
      ["Metric", "Value"],
      ["Active Organizations", overview.active_organizations?.value],
      ["Subscribed Workforce", overview.subscribed_workforce?.value],
      ["MRR (USD)", ((overview.mrr_cents?.value || 0) / 100).toFixed(2)],
      ["Activation Rate (%)", overview.activation_rate_pct?.value?.toFixed?.(1)],
      ["Platform Reliability (%)", overview.platform_reliability_pct ?? "N/A"],
      ["Critical Attention Items", overview.critical_attention_count],
      ["Active P1 Incidents", overview.active_p1_incidents],
    ];
    const csv = rows.map((r) => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `platform-command-center-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const banner = BANNER_META[overview?.banner_status || "operational"];
  const secondsAgo = lastLoadedAt ? Math.max(0, Math.round((Date.now() - lastLoadedAt.getTime()) / 1000)) : null;

  return (
    <div className="min-h-screen bg-slate-50/60 p-6 sm:p-10 text-slate-800 font-sans antialiased">
      <div className="max-w-7xl mx-auto space-y-6">

        {/* Header */}
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-[#0A192F] via-[#0F2942] to-[#1E3A8A] px-6 py-7 sm:px-8 text-white shadow-xl shadow-blue-900/10">
         <div className="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-5">
          <div className="min-w-0">
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
              Platform Command Center
            </h1>
            <p className="mt-1.5 text-sm font-medium text-slate-300">
              Commercial, customer, service, security and governance health across ZoikoHR.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2.5 lg:justify-end shrink-0">
            <LabeledSelect
              label="Period"
              value={`Last ${days} days`}
              options={["Last 7 days", "Last 30 days", "Last 90 days"]}
              onChange={(v) => setDays(parseInt(v.match(/\d+/)[0], 10))}
            />
            <button onClick={loadAll} aria-label="Refresh" className="h-10 w-10 flex items-center justify-center rounded-xl border border-white/20 bg-white/10 hover:bg-white/20 transition" title="Refresh">
              <RefreshCw className={`w-4 h-4 text-white ${loading ? "animate-spin" : ""}`} />
            </button>
            <button onClick={handleExport} className="h-10 flex items-center gap-1.5 px-3.5 rounded-xl border border-white/20 bg-white/10 hover:bg-white/20 transition text-sm font-semibold text-white">
              <Download className="w-4 h-4" /> Export
            </button>
            <button
              onClick={() => navigate("/super-admin/organizations")}
              className="h-10 flex items-center gap-1.5 px-4 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold shadow-lg shadow-blue-600/30 transition"
            >
              <Plus className="w-4 h-4" /> Create Organization
            </button>
          </div>
         </div>
         <div className="absolute -right-10 -bottom-24 w-72 h-72 rounded-full bg-blue-500/10 blur-2xl pointer-events-none" />
        </div>

        {error && (
          <div className="rounded-3xl border border-red-200 bg-red-50 p-4 text-red-700 text-sm flex items-center gap-3">
            <AlertTriangle className="h-5 w-5 flex-shrink-0" />
            <span>{error}</span>
            <button onClick={loadAll} className="ml-auto text-red-600 underline hover:text-red-800 text-xs font-semibold">Retry</button>
          </div>
        )}

        {/* Status banner */}
        <div className={`flex flex-wrap items-center gap-2 px-5 py-3 rounded-2xl border ${banner.bg} ${banner.border}`}>
          <span className={`w-2 h-2 rounded-full ${banner.dot}`} />
          <span className={`text-sm font-semibold ${banner.text}`}>{banner.label}</span>
          <span className="text-slate-400">•</span>
          <span className="text-sm font-medium text-slate-600">
            {overview?.active_p1_incidents ?? 0} active P1 incident{overview?.active_p1_incidents === 1 ? "" : "s"}
          </span>
          <span className="text-slate-400">•</span>
          <span className="text-sm font-medium text-slate-600">
            API {overview?.platform_reliability_pct != null ? `${overview.platform_reliability_pct}%` : "not yet recorded"}
          </span>
          {secondsAgo != null && (
            <>
              <span className="text-slate-400">•</span>
              <span className="text-sm font-medium text-slate-600">Updated {secondsAgo}s ago</span>
            </>
          )}
          <button
            onClick={() => platformHealthRef.current?.scrollIntoView({ behavior: "smooth", block: "center" })}
            className="ml-auto flex items-center gap-1 text-xs font-semibold text-blue-600 hover:text-blue-800"
          >
            View status page <ExternalLink className="w-3 h-3" />
          </button>
        </div>

        {/* KPI tiles */}
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4 [&>div]:min-w-0">
          <StatTile
            icon={Building2} iconGradient="from-blue-500 to-indigo-500" title="Active Organizations"
            valueDisplay={loading ? "—" : overview?.active_organizations?.value ?? 0}
            deltaPct={overview?.active_organizations?.delta_pct} series={overview?.active_organizations?.series}
            sparklineColor={BLUE}
          />
          <StatTile
            icon={Users} iconGradient="from-violet-500 to-purple-500" title="Subscribed Workforce"
            valueDisplay={loading ? "—" : formatCompactNumber(overview?.subscribed_workforce?.value)}
            deltaPct={overview?.subscribed_workforce?.delta_pct} series={overview?.subscribed_workforce?.series}
            sparklineColor="#8B5CF6"
          />
          <StatTile
            icon={CircleDollarSign} iconGradient="from-emerald-500 to-teal-500" title="MRR"
            valueDisplay={loading ? "—" : formatCurrencyFromCents(overview?.mrr_cents?.value)}
            deltaPct={overview?.mrr_cents?.delta_pct} series={overview?.mrr_cents?.series}
            sparklineColor={EMERALD}
          />
          <StatTile
            icon={Rocket} iconGradient="from-sky-500 to-blue-500" title="Activation Rate"
            valueDisplay={loading ? "—" : `${(overview?.activation_rate_pct?.value ?? 0).toFixed(1)}%`}
            deltaPct={overview?.activation_rate_pct?.delta_pct} series={overview?.activation_rate_pct?.series}
            sparklineColor="#0EA5E9"
          />
          <StatTile
            icon={ShieldCheck} iconGradient="from-emerald-500 to-green-600" title="Platform Reliability"
            valueDisplay={loading ? "—" : overview?.platform_reliability_pct != null ? `${overview.platform_reliability_pct}%` : "—"}
            deltaPct={null} series={null}
            sparklineColor={EMERALD}
          />
          <StatTile
            icon={AlertTriangle} iconGradient="from-red-500 to-rose-500" title="Critical Attention"
            valueDisplay={loading ? "—" : overview?.critical_attention_count ?? 0}
            deltaPct={null} series={null}
            sparklineColor={RED}
          />
        </div>

        {!overview?.mrr_pricing_configured && !loading && (
          <div className="rounded-2xl border border-amber-200/60 bg-amber-50 px-5 py-3 text-sm text-amber-700">
            Plan pricing hasn't been configured yet on the Billing Plans page, so MRR and other revenue figures are correctly showing as $0 — not a bug.
          </div>
        )}

        {/* Attention / Customer Health / Commercial Health */}
        {/* Row 1: what needs attention (wide) + customer health */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 [&>div]:min-w-0 [&>div>div]:h-full">
          <div className="lg:col-span-2"><NeedsAttentionTable items={attention} loading={loading} /></div>
          <div><CustomerHealthCard data={customerHealth} loading={loading} /></div>
        </div>

        {/* Row 2: revenue (wide) + organization lifecycle */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 [&>div]:min-w-0 [&>div>div]:h-full">
          <div className="lg:col-span-2"><CommercialHealthCard data={commercialHealth} loading={loading} pricingConfigured={overview?.mrr_pricing_configured} /></div>
          <div><OrgLifecycleFunnel data={lifecycle} loading={loading} /></div>
        </div>

        {/* Row 3: platform health, security, governance: three equal columns */}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 [&>div]:min-w-0 [&>div>div]:h-full">
          <div ref={platformHealthRef}>
            <PlatformHealthCard data={platformHealth} loading={loading} onUpdateStatus={handleUpdateServiceStatus} />
          </div>
          <div><SecurityAccessCard data={security} loading={loading} /></div>
          <div className="md:col-span-2 xl:col-span-1"><GovernanceAuditCard auditEventsCount={auditEventsCount} recentActivity={recentAudit} loading={loading} /></div>
        </div>
      </div>
    </div>
  );
}

function LabeledSelect({ label, value, options, onChange, disabled }) {
  return (
    <div className="h-10 flex items-center gap-2 px-3 rounded-xl border border-white/20 bg-white/10">
      <span className="text-[11px] font-semibold text-slate-300 uppercase tracking-wide">{label}</span>
      <select
        value={value}
        disabled={disabled}
        onChange={(e) => onChange?.(e.target.value)}
        className={`text-sm font-semibold text-white bg-transparent outline-none ${disabled ? "cursor-default appearance-none pr-0" : "cursor-pointer"}`}
      >
        {options.map((o) => (
          <option key={o} value={o} className="text-slate-800">{o}</option>
        ))}
      </select>
    </div>
  );
}
