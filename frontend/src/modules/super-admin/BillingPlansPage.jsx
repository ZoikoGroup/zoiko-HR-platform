import { useState, useEffect, useCallback } from "react";
import PageHeader from "../../components/PageHeader";
import {
  AlertTriangle, Package, Plus, Save, X, Edit3, CheckCircle, XCircle,
} from "lucide-react";
import { billingService } from "../../service/billingService";

export default function BillingPlansPage() {
  const [plans, setPlans] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [editing, setEditing] = useState(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({
    code: "core", name: "", catalog_version: "v1", billing_metric: "active_workforce",
    is_active: true, is_contract_priced: false, monthly_price: "", annual_price: "",
    currency: "USD", description: "",
  });

  const loadPlans = useCallback(async () => {
    setLoading(true);
    try {
      setError(null);
      const data = await billingService.getPlans();
      setPlans(data.list || []);
      setTotal(data.total || 0);
    } catch (e) {
      console.error("Failed to load plans", e);
      setError(e.message || "Failed to load plans.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadPlans(); }, [loadPlans]);

  const openCreate = () => {
    setCreating(true);
    setForm({
      code: "core", name: "", catalog_version: "v1", billing_metric: "active_workforce",
      is_active: true, is_contract_priced: false, monthly_price: "", annual_price: "",
      currency: "USD", description: "",
    });
  };

  const openEdit = (plan) => {
    setEditing(plan);
    setForm({
      code: plan.code,
      name: plan.name || "",
      catalog_version: plan.catalog_version,
      billing_metric: plan.billing_metric,
      is_active: plan.is_active,
      is_contract_priced: plan.is_contract_priced,
      monthly_price: plan.monthly_price != null ? String(plan.monthly_price) : "",
      annual_price: plan.annual_price != null ? String(plan.annual_price) : "",
      currency: plan.currency || "USD",
      description: plan.description || "",
    });
  };

  const handleSave = async () => {
    try {
      const payload = {
        ...form,
        monthly_price: form.monthly_price !== "" ? Number(form.monthly_price) : null,
        annual_price: form.annual_price !== "" ? Number(form.annual_price) : null,
      };
      if (editing) {
        await billingService.updatePlan(editing.id, payload);
      } else {
        await billingService.createPlan(payload);
      }
      setEditing(null);
      setCreating(false);
      loadPlans();
    } catch (e) {
      setError(e.message);
    }
  };

  if (loading) {
    return (
      <div className="space-y-6 font-sans">
        <PageHeader title="Plans & Catalog" description="Manage the billing plan catalog" />
        <div className="flex items-center justify-center py-20 text-slate-400">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-[#FF7A00] border-t-transparent" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 font-sans">
      <PageHeader
        title="Plans & Catalog"
        description={`Manage billing plan catalog (${total} plans)`}
        action={
          <button onClick={openCreate} className="flex items-center gap-2 rounded-full bg-[#FF7A00] hover:bg-[#e56e00] text-white px-4 py-2.5 text-sm font-semibold transition shadow-[0_4px_14px_rgba(255,122,0,0.3)]">
            <Plus className="h-4 w-4" /> Add Plan
          </button>
        }
      />

      {error && (
        <div className="rounded-3xl border border-red-200 bg-red-50 p-4 text-red-700 text-sm flex items-center gap-3">
          <AlertTriangle className="h-5 w-5 flex-shrink-0" />
          <span>{error}</span>
          <button onClick={() => setError(null)} className="ml-auto text-red-600 underline text-xs font-semibold">Dismiss</button>
        </div>
      )}

      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        {plans.length === 0 ? (
          <div className="text-center py-12 text-slate-400">
            <Package className="h-12 w-12 mx-auto mb-3 opacity-30" />
            <p>No plans configured yet.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-100 text-xs font-semibold uppercase tracking-wider text-slate-500">
                  <th className="py-3 px-4">Code</th>
                  <th className="py-3 px-4">Name</th>
                  <th className="py-3 px-4">Metric</th>
                  <th className="py-3 px-4">Monthly Price</th>
                  <th className="py-3 px-4">Annual Price</th>
                  <th className="py-3 px-4">Version</th>
                  <th className="py-3 px-4">Self-Serve</th>
                  <th className="py-3 px-4">Active</th>
                  <th className="py-3 px-4"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {plans.map((plan) => (
                  <tr key={plan.id} className="text-sm text-slate-650 hover:bg-slate-50/50 transition">
                    <td className="py-4 px-4">
                      <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                        plan.is_contract_priced ? "bg-purple-50 text-purple-600 border border-purple-100" : "bg-[#FF7A00]/10 text-[#FF7A00] border border-[#FF7A00]/20"
                      }`}>
                        {plan.code?.toUpperCase()}
                      </span>
                    </td>
                    <td className="py-4 px-4 font-semibold text-slate-700">{plan.name || "—"}</td>
                    <td className="py-4 px-4 text-slate-500 capitalize">{plan.billing_metric?.replace(/_/g, " ")}</td>
                    <td className="py-4 px-4">
                      <span className={plan.monthly_price == null ? "text-slate-400 italic" : "font-semibold text-slate-700"}>
                        {plan.monthly_price != null ? `$${plan.monthly_price}` : "Not set"}
                      </span>
                    </td>
                    <td className="py-4 px-4">
                      <span className={plan.annual_price == null ? "text-slate-400 italic" : "font-semibold text-slate-700"}>
                        {plan.annual_price != null ? `$${plan.annual_price}` : "Not set"}
                      </span>
                    </td>
                    <td className="py-4 px-4 text-slate-500 font-mono text-xs">{plan.catalog_version}</td>
                    <td className="py-4 px-4">
                      {plan.is_self_serve_enabled ? (
                        <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold bg-green-50 text-green-600 border border-green-100">
                          <CheckCircle className="h-3 w-3" /> Enabled
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold bg-slate-50 text-slate-500 border border-slate-100">
                          <XCircle className="h-3 w-3" /> Disabled
                        </span>
                      )}
                    </td>
                    <td className="py-4 px-4">
                      {plan.is_active ? (
                        <CheckCircle className="h-4 w-4 text-green-500" />
                      ) : (
                        <XCircle className="h-4 w-4 text-red-400" />
                      )}
                    </td>
                    <td className="py-4 px-4">
                      <button onClick={() => openEdit(plan)} className="p-1.5 hover:text-[#FF7A00] hover:bg-white rounded-lg transition text-slate-400">
                        <Edit3 className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Create/Edit Modal */}
      {(editing || creating) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-3xl p-6 w-full max-w-lg shadow-xl border border-slate-200 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-bold text-slate-800">{creating ? "Add Plan" : `Edit: ${editing?.name || editing?.code}`}</h3>
              <button onClick={() => { setEditing(null); setCreating(false); }} className="p-1 hover:bg-slate-100 rounded-lg"><X className="h-5 w-5 text-slate-400" /></button>
            </div>
            <div className="space-y-4">
              {creating && (
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1">Code</label>
                  <select value={form.code} onChange={(e) => setForm(f => ({ ...f, code: e.target.value }))}
                    className="w-full rounded-xl border border-slate-200 bg-white py-2.5 px-4 text-sm text-slate-800 outline-none focus:border-[#FF7A00]">
                    <option value="core">Core</option>
                    <option value="advanced">Advanced</option>
                    <option value="enterprise">Enterprise</option>
                  </select>
                </div>
              )}
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">Name</label>
                <input type="text" value={form.name} onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="e.g. Core Plan"
                  className="w-full rounded-xl border border-slate-200 bg-white py-2.5 px-4 text-sm text-slate-800 outline-none focus:border-[#FF7A00]" />
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">Catalog Version</label>
                <input type="text" value={form.catalog_version} onChange={(e) => setForm(f => ({ ...f, catalog_version: e.target.value }))}
                  className="w-full rounded-xl border border-slate-200 bg-white py-2.5 px-4 text-sm text-slate-800 outline-none focus:border-[#FF7A00]" />
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">Billing Metric</label>
                <select value={form.billing_metric} onChange={(e) => setForm(f => ({ ...f, billing_metric: e.target.value }))}
                  className="w-full rounded-xl border border-slate-200 bg-white py-2.5 px-4 text-sm text-slate-800 outline-none focus:border-[#FF7A00]">
                  <option value="active_workforce">Active Workforce</option>
                  <option value="committed_workforce">Committed Workforce</option>
                  <option value="contract_defined">Contract Defined</option>
                </select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1">Monthly Price</label>
                  <input type="number" step="0.01" value={form.monthly_price} onChange={(e) => setForm(f => ({ ...f, monthly_price: e.target.value }))}
                    placeholder="null = not set"
                    className="w-full rounded-xl border border-slate-200 bg-white py-2.5 px-4 text-sm text-slate-800 outline-none focus:border-[#FF7A00]" />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1">Annual Price</label>
                  <input type="number" step="0.01" value={form.annual_price} onChange={(e) => setForm(f => ({ ...f, annual_price: e.target.value }))}
                    placeholder="null = not set"
                    className="w-full rounded-xl border border-slate-200 bg-white py-2.5 px-4 text-sm text-slate-800 outline-none focus:border-[#FF7A00]" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">Description</label>
                <textarea value={form.description} rows={2} onChange={(e) => setForm(f => ({ ...f, description: e.target.value }))}
                  className="w-full rounded-xl border border-slate-200 bg-white py-2.5 px-4 text-sm text-slate-800 outline-none focus:border-[#FF7A00]" />
              </div>
              <div className="flex items-center gap-4">
                <label className="flex items-center gap-2 text-sm text-slate-700">
                  <input type="checkbox" checked={form.is_active} onChange={(e) => setForm(f => ({ ...f, is_active: e.target.checked }))} className="rounded border-slate-300" />
                  Active
                </label>
                <label className="flex items-center gap-2 text-sm text-slate-700">
                  <input type="checkbox" checked={form.is_contract_priced} onChange={(e) => setForm(f => ({ ...f, is_contract_priced: e.target.checked }))} className="rounded border-slate-300" />
                  Contract Priced
                </label>
              </div>
            </div>
            <div className="flex gap-3 mt-6 justify-end">
              <button onClick={() => { setEditing(null); setCreating(false); }} className="px-4 py-2 rounded-full border border-slate-200 text-sm text-slate-600 hover:bg-slate-50">Cancel</button>
              <button onClick={handleSave} className="flex items-center gap-2 px-4 py-2 rounded-full bg-[#FF7A00] text-white text-sm font-semibold hover:bg-[#e56e00]">
                <Save className="h-4 w-4" /> {creating ? "Create" : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
