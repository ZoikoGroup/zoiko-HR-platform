import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import PageHeader from "../../components/PageHeader";
import { StatCard } from "../../components/DashboardWidgets";
import {
  AlertTriangle, LayoutDashboard, CreditCard, Users, Clock,
  CheckCircle, XCircle, ShieldAlert, AlertCircle, Package,
} from "lucide-react";
import { billingService } from "../../service/billingService";

const STATUS_STAT_CONFIG = {
  evaluation: { label: "Evaluations", icon: Clock, iconBg: "#F59E0B" },
  active: { label: "Active", icon: CheckCircle, iconBg: "#10B981" },
  past_due: { label: "Past Due", icon: AlertTriangle, iconBg: "#EF4444" },
  restricted: { label: "Restricted", icon: ShieldAlert, iconBg: "#64748B" },
  terminated: { label: "Terminated", icon: XCircle, iconBg: "#8B5CF6" },
  canceled: { label: "Canceled", icon: XCircle, iconBg: "#9CA3AF" },
};

export default function BillingOverviewPage() {
  const navigate = useNavigate();
  const [plans, setPlans] = useState([]);
  const [discounts, setDiscounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => { loadAll(); }, []);

  const loadAll = async () => {
    try {
      setError(null);
      setLoading(true);
      const [plansData, discountsData] = await Promise.all([
        billingService.getPlans(),
        billingService.getDiscounts().catch(() => ({ list: [], total: 0 })),
      ]);
      setPlans(plansData.list || []);
      setDiscounts(discountsData.list || []);
    } catch (e) {
      console.error("Failed to load billing overview", e);
      setError(e.message || "Unable to load billing overview.");
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-6 font-sans">
        <PageHeader title="Billing Overview" description="Cross-org billing dashboard" />
        <div className="flex items-center justify-center py-20 text-slate-400">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-[#FF7A00] border-t-transparent" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 font-sans">
      <PageHeader title="Billing Overview" description="Cross-org billing dashboard — plan catalog, subscription status distribution, and active discounts." />

      {error && (
        <div className="rounded-3xl border border-red-200 bg-red-50 p-4 text-red-700 text-sm flex items-center gap-3">
          <AlertTriangle className="h-5 w-5 flex-shrink-0" />
          <span>{error}</span>
          <button onClick={loadAll} className="ml-auto text-red-600 underline hover:text-red-800 text-xs font-semibold">Retry</button>
        </div>
      )}

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Total Plans" value={plans.length} icon={Package} iconBg="#FF7A00" />
        <StatCard label="Active Plans" value={plans.filter(p => p.is_active).length} icon={CheckCircle} iconBg="#10B981" />
        <StatCard label="Active Discounts" value={discounts.length} icon={CreditCard} iconBg="#8B5CF6" />
        <StatCard label="Enterprise Plans" value={plans.filter(p => p.is_contract_priced).length} icon={ShieldAlert} iconBg="#3B82F6" />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <h3 className="text-lg font-bold text-slate-800 mb-4">Plan Catalog</h3>
          {plans.length === 0 ? (
            <div className="text-center py-8 text-slate-400">
              <Package className="h-10 w-10 mx-auto mb-3 opacity-40" />
              No plans configured
            </div>
          ) : (
            <div className="space-y-3">
              {plans.map((plan) => (
                <div key={plan.id} className="flex items-center justify-between p-3 rounded-2xl bg-slate-50 border border-slate-100">
                  <div className="flex items-center gap-3">
                    <div className={`h-8 w-8 rounded-full flex items-center justify-center text-xs font-bold ${
                      plan.is_contract_priced ? "bg-purple-100 text-purple-600" : "bg-[#FF7A00]/10 text-[#FF7A00]"
                    }`}>
                      {plan.code?.charAt(0)?.toUpperCase() || "?"}
                    </div>
                    <div>
                      <span className="text-sm font-semibold text-slate-700">{plan.name || plan.code}</span>
                      <span className="ml-2 text-xs text-slate-400">v{plan.catalog_version}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-semibold text-slate-800">
                      {plan.monthly_price != null ? `$${plan.monthly_price}/mo` : "Not set"}
                    </span>
                    {!plan.is_active && (
                      <span className="text-xs text-red-500 font-semibold">Inactive</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <h3 className="text-lg font-bold text-slate-800 mb-4">Active Discounts</h3>
          {discounts.length === 0 ? (
            <div className="text-center py-8 text-slate-400">
              <CreditCard className="h-10 w-10 mx-auto mb-3 opacity-40" />
              No active discounts
            </div>
          ) : (
            <div className="space-y-3">
              {discounts.map((d) => (
                <div key={d.id} className="flex items-center justify-between p-3 rounded-2xl bg-slate-50 border border-slate-100">
                  <div>
                    <span className="text-sm font-semibold text-slate-700">{d.campaign_or_contract_id}</span>
                    <span className="ml-2 text-xs text-slate-400">Org #{d.organization_id}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${
                      d.is_stackable ? "bg-green-50 text-green-600 border border-green-100" : "bg-slate-50 text-slate-600 border border-slate-100"
                    }`}>
                      {d.is_stackable ? "Stackable" : "Non-stackable"}
                    </span>
                    <span className="text-xs text-slate-400">{d.currency}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
