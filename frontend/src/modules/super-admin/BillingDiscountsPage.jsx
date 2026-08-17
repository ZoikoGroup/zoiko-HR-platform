import { useState, useEffect, useCallback } from "react";
import PageHeader from "../../components/PageHeader";
import {
  AlertTriangle, CreditCard, Plus, Save, X,
} from "lucide-react";
import { billingService } from "../../service/billingService";

export default function BillingDiscountsPage() {
  const [discounts, setDiscounts] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({
    organization_id: "", campaign_or_contract_id: "", approver: "",
    package_eligibility: "", currency: "USD",
    effective_start: "", effective_end: "", is_stackable: false,
  });

  const loadDiscounts = useCallback(async () => {
    setLoading(true);
    try {
      setError(null);
      const data = await billingService.getDiscounts();
      setDiscounts(data.list || []);
      setTotal(data.total || 0);
    } catch (e) {
      console.error("Failed to load discounts", e);
      setError(e.message || "Failed to load discounts.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadDiscounts(); }, [loadDiscounts]);

  const handleSave = async () => {
    try {
      await billingService.createDiscount({
        organization_id: Number(form.organization_id),
        campaign_or_contract_id: form.campaign_or_contract_id,
        approver: form.approver,
        package_eligibility: form.package_eligibility || null,
        currency: form.currency,
        effective_start: new Date(form.effective_start).toISOString(),
        effective_end: form.effective_end ? new Date(form.effective_end).toISOString() : null,
        is_stackable: form.is_stackable,
      });
      setCreating(false);
      loadDiscounts();
    } catch (e) {
      setError(e.message);
    }
  };

  if (loading) {
    return (
      <div className="space-y-6 font-sans">
        <PageHeader title="Discounts" description="Manage billing discounts" />
        <div className="flex items-center justify-center py-20 text-slate-400">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-[#FF7A00] border-t-transparent" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 font-sans">
      <PageHeader
        title="Discounts"
        description={`${total} discount records`}
        action={
          <button onClick={() => {
            setCreating(true);
            setForm({
              organization_id: "", campaign_or_contract_id: "", approver: "",
              package_eligibility: "", currency: "USD",
              effective_start: "", effective_end: "", is_stackable: false,
            });
          }} className="flex items-center gap-2 rounded-full bg-[#FF7A00] hover:bg-[#e56e00] text-white px-4 py-2.5 text-sm font-semibold transition shadow-[0_4px_14px_rgba(255,122,0,0.3)]">
            <Plus className="h-4 w-4" /> Add Discount
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
        {discounts.length === 0 ? (
          <div className="text-center py-12 text-slate-400">
            <CreditCard className="h-12 w-12 mx-auto mb-3 opacity-30" />
            <p>No discounts configured yet.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-100 text-xs font-semibold uppercase tracking-wider text-slate-500">
                  <th className="py-3 px-4">Campaign/Contract</th>
                  <th className="py-3 px-4">Org</th>
                  <th className="py-3 px-4">Approver</th>
                  <th className="py-3 px-4">Package</th>
                  <th className="py-3 px-4">Currency</th>
                  <th className="py-3 px-4">Start</th>
                  <th className="py-3 px-4">End</th>
                  <th className="py-3 px-4">Stackable</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {discounts.map((d) => (
                  <tr key={d.id} className="text-sm text-slate-650 hover:bg-slate-50/50 transition">
                    <td className="py-4 px-4 font-semibold text-slate-700">{d.campaign_or_contract_id}</td>
                    <td className="py-4 px-4 text-slate-500">#{d.organization_id}</td>
                    <td className="py-4 px-4 text-slate-500">{d.approver}</td>
                    <td className="py-4 px-4 text-slate-500">{d.package_eligibility || "—"}</td>
                    <td className="py-4 px-4 text-slate-500">{d.currency}</td>
                    <td className="py-4 px-4 text-slate-500">{d.effective_start ? new Date(d.effective_start).toLocaleDateString() : "—"}</td>
                    <td className="py-4 px-4 text-slate-500">{d.effective_end ? new Date(d.effective_end).toLocaleDateString() : "—"}</td>
                    <td className="py-4 px-4">
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${
                        d.is_stackable ? "bg-green-50 text-green-600 border border-green-100" : "bg-slate-50 text-slate-500 border border-slate-100"
                      }`}>
                        {d.is_stackable ? "Stackable" : "Non-stackable"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Create Modal */}
      {creating && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-3xl p-6 w-full max-w-lg shadow-xl border border-slate-200">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-bold text-slate-800">Add Discount</h3>
              <button onClick={() => setCreating(false)} className="p-1 hover:bg-slate-100 rounded-lg"><X className="h-5 w-5 text-slate-400" /></button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">Organization ID</label>
                <input type="number" value={form.organization_id} onChange={(e) => setForm(f => ({ ...f, organization_id: e.target.value }))}
                  className="w-full rounded-xl border border-slate-200 bg-white py-2.5 px-4 text-sm text-slate-800 outline-none focus:border-[#FF7A00]" />
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">Campaign / Contract ID</label>
                <input type="text" value={form.campaign_or_contract_id} onChange={(e) => setForm(f => ({ ...f, campaign_or_contract_id: e.target.value }))}
                  className="w-full rounded-xl border border-slate-200 bg-white py-2.5 px-4 text-sm text-slate-800 outline-none focus:border-[#FF7A00]" />
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">Approver</label>
                <input type="text" value={form.approver} onChange={(e) => setForm(f => ({ ...f, approver: e.target.value }))}
                  className="w-full rounded-xl border border-slate-200 bg-white py-2.5 px-4 text-sm text-slate-800 outline-none focus:border-[#FF7A00]" />
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">Package Eligibility</label>
                <input type="text" value={form.package_eligibility} onChange={(e) => setForm(f => ({ ...f, package_eligibility: e.target.value }))}
                  placeholder="Optional"
                  className="w-full rounded-xl border border-slate-200 bg-white py-2.5 px-4 text-sm text-slate-800 outline-none focus:border-[#FF7A00]" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1">Effective Start</label>
                  <input type="datetime-local" value={form.effective_start} onChange={(e) => setForm(f => ({ ...f, effective_start: e.target.value }))}
                    className="w-full rounded-xl border border-slate-200 bg-white py-2.5 px-4 text-sm text-slate-800 outline-none focus:border-[#FF7A00]" />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1">Effective End</label>
                  <input type="datetime-local" value={form.effective_end} onChange={(e) => setForm(f => ({ ...f, effective_end: e.target.value }))}
                    className="w-full rounded-xl border border-slate-200 bg-white py-2.5 px-4 text-sm text-slate-800 outline-none focus:border-[#FF7A00]" />
                </div>
              </div>
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input type="checkbox" checked={form.is_stackable} onChange={(e) => setForm(f => ({ ...f, is_stackable: e.target.checked }))} className="rounded border-slate-300" />
                Stackable
              </label>
            </div>
            <div className="flex gap-3 mt-6 justify-end">
              <button onClick={() => setCreating(false)} className="px-4 py-2 rounded-full border border-slate-200 text-sm text-slate-600 hover:bg-slate-50">Cancel</button>
              <button onClick={handleSave} className="flex items-center gap-2 px-4 py-2 rounded-full bg-[#FF7A00] text-white text-sm font-semibold hover:bg-[#e56e00]">
                <Save className="h-4 w-4" /> Create
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
