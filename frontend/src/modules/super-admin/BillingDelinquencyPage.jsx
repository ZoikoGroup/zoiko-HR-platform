import { useState, useCallback, useEffect } from "react";
import { AlertTriangle, ShieldCheck, Clock, RefreshCw, ExternalLink, Filter, Building2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import PageHeader from "../../components/PageHeader";
import OrgPicker from "../../components/OrgPicker";
import { billingService } from "../../service/billingService";

const STAGE_META = {
  recovery: { label: "Recovery (Days 1–9)", badge: "bg-amber-50 text-amber-800 border-amber-200", desc: "Dunning retry active" },
  day_10: { label: "Expansion Restricted (Day 10+)", badge: "bg-orange-50 text-orange-800 border-orange-200", desc: "Commercial expansion blocked" },
  day_20: { label: "Controlled Restriction (Day 20+)", badge: "bg-red-50 text-red-800 border-red-200", desc: "Non-essential writes restricted" },
  day_45: { label: "Termination Pending (Day 45+)", badge: "bg-rose-900 text-white border-rose-900", desc: "Closure workflow initiated" },
};

function getStageMeta(stageStr) {
  const s = String(stageStr || "").toLowerCase();
  if (s.includes("45") || s.includes("termination")) return STAGE_META.day_45;
  if (s.includes("20")) return STAGE_META.day_20;
  if (s.includes("10")) return STAGE_META.day_10;
  return STAGE_META.recovery;
}

export default function BillingDelinquencyPage() {
  const navigate = useNavigate();
  const [selectedOrg, setSelectedOrg] = useState(null);
  const [cases, setCases] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      if (selectedOrg) {
        const single = await billingService.getDelinquencyStatus(selectedOrg.id);
        setCases(single.has_open_case ? [single] : []);
      } else {
        const data = await billingService.getPlatformDelinquency();
        setCases(data.list || []);
      }
    } catch (e) {
      console.error("Failed to load delinquency cases", e);
      setError(e.message || "Failed to load delinquency status");
    } finally {
      setLoading(false);
    }
  }, [selectedOrg]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  return (
    <div className="space-y-6 font-sans">
      <PageHeader
        title="Delinquency & Collections"
        description="Graduated dunning lifecycle tracking across platform organizations (ZHR-COM-BILL-001 §10 G1-G5)."
        action={
          <button
            onClick={loadData}
            disabled={loading}
            className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition shadow-sm disabled:opacity-50"
            title="Refresh Delinquency Cases"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} /> Refresh
          </button>
        }
      />

      {/* Filter Bar */}
      <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-[0_4px_20px_rgba(0,0,0,0.02)] space-y-3">
        <div className="flex items-center gap-2 text-xs font-bold text-slate-500 uppercase tracking-wider">
          <Filter className="h-3.5 w-3.5" /> Scope Filter
        </div>
        <div className="max-w-md">
          <OrgPicker
            selectedOrg={selectedOrg}
            onSelect={setSelectedOrg}
            placeholder="All Delinquent Organizations (or search by name...)"
          />
        </div>
        {selectedOrg && (
          <div className="flex items-center justify-between text-xs pt-1">
            <span className="text-slate-500">Filtered for organization: <strong>{selectedOrg.name}</strong></span>
            <button onClick={() => setSelectedOrg(null)} className="text-[#3B82F6] font-semibold hover:underline">
              Show all delinquent orgs
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

      {/* Delinquency Cases Table */}
      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-[0_4px_20px_rgba(0,0,0,0.02)]">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-500" /> Open Delinquency Cases ({cases.length})
          </h3>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-[#3B82F6] border-t-transparent" />
          </div>
        ) : cases.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-14 text-center rounded-2xl border border-emerald-100 bg-emerald-50/50 p-8 text-emerald-800">
            <div className="w-12 h-12 rounded-2xl bg-emerald-100 flex items-center justify-center mb-3">
              <ShieldCheck className="h-6 w-6 text-emerald-600" />
            </div>
            <p className="text-base font-bold text-emerald-900">No open delinquency cases</p>
            <p className="mt-1 text-xs text-emerald-700 max-w-md">
              {selectedOrg
                ? `${selectedOrg.name} is in good standing with no active payment failures.`
                : "All platform organizations are currently in good standing with no open payment failures."}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-100 text-xs font-semibold uppercase tracking-wider text-slate-500 bg-slate-50/50">
                  <th className="py-3.5 px-4">Organization</th>
                  <th className="py-3.5 px-4">Days Overdue</th>
                  <th className="py-3.5 px-4">Policy Stage</th>
                  <th className="py-3.5 px-4">Implication / Restriction</th>
                  <th className="py-3.5 px-4">Payment Failed At</th>
                  <th className="py-3.5 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {cases.map((c) => {
                  const meta = getStageMeta(c.stage);
                  return (
                    <tr key={c.organization_id} className="text-sm hover:bg-slate-50/50 transition">
                      <td className="py-4 px-4 font-semibold text-slate-800">
                        <div className="flex items-center gap-2">
                          <Building2 className="h-4 w-4 text-slate-400 shrink-0" />
                          <div>
                            <p className="font-semibold text-slate-800 text-xs">{c.organization_name || `Org #${c.organization_id}`}</p>
                            <span className="text-[10px] text-slate-400 font-mono">ID: {c.organization_id}</span>
                          </div>
                        </div>
                      </td>
                      <td className="py-4 px-4 font-bold text-red-600">
                        <span className="inline-flex items-center gap-1">
                          <Clock className="h-3.5 w-3.5 text-red-500" /> {c.days_elapsed ?? 0} day(s)
                        </span>
                      </td>
                      <td className="py-4 px-4">
                        <span className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold ${meta.badge}`}>
                          {meta.label}
                        </span>
                      </td>
                      <td className="py-4 px-4 text-xs text-slate-600 font-medium">
                        {meta.desc}
                      </td>
                      <td className="py-4 px-4 text-xs text-slate-400">
                        {c.failed_at ? new Date(c.failed_at).toLocaleString() : "—"}
                      </td>
                      <td className="py-4 px-4 text-right">
                        <button
                          onClick={() => navigate(`/super-admin/organizations/${c.organization_id}`)}
                          className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition shadow-sm"
                        >
                          Org Details <ExternalLink className="h-3 w-3" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
