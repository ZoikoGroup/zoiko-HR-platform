import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  AlertTriangle, LayoutDashboard, CreditCard, CheckCircle, XCircle,
  ShieldAlert, Package, Percent, RefreshCw, ArrowRight, TrendingUp,
  Building2, Clock,
} from "lucide-react";
import { billingService } from "../../service/billingService";
import { superAdminService } from "../../service/superAdminService";

const PLAN_META = {
  core:       { label: "Core",       bg: "bg-blue-50",   text: "text-blue-700",   border: "border-blue-200",   dot: "bg-blue-500" },
  advanced:   { label: "Advanced",   bg: "bg-violet-50", text: "text-violet-700", border: "border-violet-200", dot: "bg-violet-500" },
  enterprise: { label: "Enterprise", bg: "bg-amber-50",  text: "text-amber-700",  border: "border-amber-200",  dot: "bg-amber-500" },
};

function PlanBadge({ code }) {
  const meta = PLAN_META[code?.toLowerCase()] || { label: code || "—", bg: "bg-slate-50", text: "text-slate-600", border: "border-slate-200", dot: "bg-slate-400" };
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold ${meta.bg} ${meta.text} border ${meta.border}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${meta.dot}`} />
      {meta.label}
    </span>
  );
}

function StatCard({ label, value, icon: Icon, iconBg, sub }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm hover:shadow-md transition-shadow">
      <div className="flex items-center justify-between mb-3">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ backgroundColor: iconBg }}>
          <Icon className="w-5 h-5 text-white" />
        </div>
        <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">{label}</span>
      </div>
      <p className="text-3xl font-extrabold text-slate-900 leading-none">{value ?? "—"}</p>
      {sub && <p className="mt-1 text-xs text-slate-400 font-medium">{sub}</p>}
    </div>
  );
}

export default function BillingOverviewPage() {
  const navigate = useNavigate();
  const [plans, setPlans] = useState([]);
  const [discounts, setDiscounts] = useState([]);
  const [orgs, setOrgs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [refreshing, setRefreshing] = useState(false);

  const loadAll = async (showRefresh = false) => {
    if (showRefresh) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      const [plansData, discountsData, orgsData] = await Promise.all([
        billingService.getPlans(),
        billingService.getDiscounts().catch(() => ({ list: [], total: 0 })),
        superAdminService.getOrganizations({ page: 1, page_size: 5 }).catch(() => ({ organizations: [], total: 0 })),
      ]);
      setPlans(plansData.list || []);
      setDiscounts(discountsData.list || []);
      setOrgs(orgsData.organizations || []);
    } catch (e) {
      console.error("Failed to load billing overview", e);
      setError(e.message || "Unable to load billing overview.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => { loadAll(); }, []);

  const activePlans = plans.filter(p => p.is_active);
  const contractPlans = plans.filter(p => p.is_contract_priced);
  const selfServePlans = plans.filter(p => p.is_self_serve_enabled);

  if (loading) {
    return (
      <div className="space-y-6 font-sans">
        <div className="flex items-center justify-between">
          <div>
            <div className="h-8 w-52 bg-slate-100 rounded-xl animate-pulse mb-2" />
            <div className="h-4 w-80 bg-slate-100 rounded-lg animate-pulse" />
          </div>
        </div>
        <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-28 bg-slate-100 rounded-2xl animate-pulse" />
          ))}
        </div>
        <div className="grid gap-6 lg:grid-cols-2">
          {[...Array(2)].map((_, i) => (
            <div key={i} className="h-64 bg-slate-100 rounded-3xl animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 font-sans">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-slate-900">Billing Overview</h1>
          <p className="mt-1 text-sm text-slate-500">Platform-wide billing dashboard — plan catalog, subscriptions, and discounts.</p>
        </div>
        <button
          onClick={() => loadAll(true)}
          disabled={refreshing}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-slate-200 bg-white text-sm font-semibold text-slate-600 hover:bg-slate-50 transition-colors shadow-sm disabled:opacity-50"
        >
          <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-red-700 text-sm flex items-center gap-3">
          <AlertTriangle className="h-5 w-5 flex-shrink-0" />
          <span>{error}</span>
          <button onClick={() => loadAll()} className="ml-auto text-red-600 underline hover:text-red-800 text-xs font-semibold">Retry</button>
        </div>
      )}

      {/* Stats */}
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        <StatCard label="Total Plans" value={plans.length} icon={Package} iconBg="#FF7A00" sub={`${activePlans.length} active`} />
        <StatCard label="Self-Serve Plans" value={selfServePlans.length} icon={TrendingUp} iconBg="#10B981" sub={`of ${plans.length} plans`} />
        <StatCard label="Enterprise Plans" value={contractPlans.length} icon={ShieldAlert} iconBg="#8B5CF6" sub="Contract priced" />
        <StatCard label="Discount Records" value={discounts.length} icon={Percent} iconBg="#3B82F6" sub="All orgs" />
      </div>

      {/* Content grid */}
      <div className="grid gap-6 lg:grid-cols-2">

        {/* Plan Catalog Card */}
        <div className="rounded-3xl border border-slate-200 bg-white shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-orange-50 flex items-center justify-center">
                <Package className="h-4 w-4 text-orange-500" />
              </div>
              <h3 className="text-base font-bold text-slate-800">Plan Catalog</h3>
            </div>
            <button
              onClick={() => navigate("/super-admin/billing/plans")}
              className="inline-flex items-center gap-1 text-xs font-semibold text-[#FF7A00] hover:text-[#e56e00] transition-colors"
            >
              Manage <ArrowRight className="h-3 w-3" />
            </button>
          </div>
          {plans.length === 0 ? (
            <div className="text-center py-12 text-slate-400">
              <Package className="h-10 w-10 mx-auto mb-3 opacity-30" />
              <p className="text-sm font-medium">No plans configured</p>
              <button onClick={() => navigate("/super-admin/billing/plans")} className="mt-3 text-xs font-semibold text-[#FF7A00] hover:underline">Add a plan →</button>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {plans.map((plan) => (
                <div key={plan.id} className="flex items-center justify-between px-6 py-4 hover:bg-slate-50/60 transition-colors">
                  <div className="flex items-center gap-3">
                    <div className={`w-9 h-9 rounded-xl flex items-center justify-center text-xs font-bold ${
                      plan.is_contract_priced ? "bg-amber-50 text-amber-600" : "bg-orange-50 text-orange-500"
                    }`}>
                      {plan.code?.charAt(0)?.toUpperCase() || "?"}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-slate-700">{plan.name || plan.code}</span>
                        <PlanBadge code={plan.code} />
                      </div>
                      <span className="text-[11px] text-slate-400 font-mono">v{plan.catalog_version}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-bold text-slate-800">
                      {plan.monthly_price != null && !Number.isNaN(Number(plan.monthly_price))
                        ? `$${plan.monthly_price}/mo`
                        : <span className="text-slate-400 text-[11px] italic">Pricing pending — contact sales</span>}
                    </span>
                    {plan.is_active
                      ? <CheckCircle className="h-4 w-4 text-green-500 shrink-0" />
                      : <XCircle className="h-4 w-4 text-red-400 shrink-0" />
                    }
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Recent Discounts Card */}
        <div className="rounded-3xl border border-slate-200 bg-white shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-blue-50 flex items-center justify-center">
                <Percent className="h-4 w-4 text-blue-500" />
              </div>
              <h3 className="text-base font-bold text-slate-800">Active Discounts</h3>
            </div>
            <button
              onClick={() => navigate("/super-admin/billing/discounts")}
              className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600 hover:text-blue-800 transition-colors"
            >
              Manage <ArrowRight className="h-3 w-3" />
            </button>
          </div>
          {discounts.length === 0 ? (
            <div className="text-center py-12 text-slate-400">
              <CreditCard className="h-10 w-10 mx-auto mb-3 opacity-30" />
              <p className="text-sm font-medium">No discount records</p>
              <button onClick={() => navigate("/super-admin/billing/discounts")} className="mt-3 text-xs font-semibold text-blue-600 hover:underline">Add a discount →</button>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {discounts.slice(0, 5).map((d) => (
                <div key={d.id} className="flex items-center justify-between px-6 py-4 hover:bg-slate-50/60 transition-colors">
                  <div>
                    <div className="text-sm font-semibold text-slate-700 truncate max-w-[180px]">{d.campaign_or_contract_id}</div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <Building2 className="h-3 w-3 text-slate-400" />
                      <span className="text-[11px] text-slate-400">Org #{d.organization_id}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold border ${
                      d.is_stackable
                        ? "bg-green-50 text-green-600 border-green-100"
                        : "bg-slate-50 text-slate-500 border-slate-100"
                    }`}>
                      {d.is_stackable ? "Stackable" : "Non-stackable"}
                    </span>
                    {d.effective_end && new Date(d.effective_end) < new Date() ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-red-50 text-red-500 border border-red-100">
                        <Clock className="h-2.5 w-2.5" /> Expired
                      </span>
                    ) : null}
                  </div>
                </div>
              ))}
              {discounts.length > 5 && (
                <div className="px-6 py-3 text-center">
                  <button onClick={() => navigate("/super-admin/billing/discounts")} className="text-xs font-semibold text-blue-600 hover:underline">
                    View all {discounts.length} discounts →
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Recent Organizations */}
      {orgs.length > 0 && (
        <div className="rounded-3xl border border-slate-200 bg-white shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-slate-100 flex items-center justify-center">
                <Building2 className="h-4 w-4 text-slate-500" />
              </div>
              <h3 className="text-base font-bold text-slate-800">Recent Organizations</h3>
            </div>
            <button
              onClick={() => navigate("/super-admin/organizations")}
              className="inline-flex items-center gap-1 text-xs font-semibold text-slate-500 hover:text-slate-700 transition-colors"
            >
              View all <ArrowRight className="h-3 w-3" />
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 divide-y sm:divide-y-0 sm:divide-x divide-slate-100">
            {orgs.slice(0, 5).map((org) => (
              <button
                key={org.id}
                onClick={() => navigate(`/super-admin/organizations/${org.id}`)}
                className="px-5 py-4 text-left hover:bg-slate-50/60 transition-colors"
              >
                <div className="text-sm font-semibold text-slate-700 truncate">{org.name}</div>
                <div className="text-[11px] text-slate-400 mt-0.5">{org.total_employees ?? 0} users</div>
                <span className={`mt-2 inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold border ${
                  org.status === "active" || org.status === "approved"
                    ? "bg-emerald-50 text-emerald-600 border-emerald-100"
                    : org.status === "suspended"
                    ? "bg-slate-100 text-slate-500 border-slate-200"
                    : "bg-amber-50 text-amber-600 border-amber-100"
                }`}>
                  {org.status || "—"}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
