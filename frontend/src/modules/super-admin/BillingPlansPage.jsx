import { useState, useEffect, useCallback, useMemo } from "react";
import PageHeader from "../../components/PageHeader";
import {
  AlertTriangle, Package, Plus, Save, X, Edit3, CheckCircle, XCircle,
  Loader2, RefreshCw, Info, Send, Lock,
} from "lucide-react";
import { billingService } from "../../service/billingService";
import { catalogService } from "../../service/catalogService";
import { PRICING_PENDING_TEXT } from "../../utils/catalogPriceUtil";

// Section 17: no HR plan has an approved numeric price today. A null-price
// state must render a clear "pricing pending" notice — NEVER a raw null/blank
// cell or NaN. Only truly-priced (self-serve) plans show a real dollar amount.
function PriceCell({ price }) {
  const hasPrice = price != null && !Number.isNaN(Number(price));
  if (!hasPrice) {
    return (
      <span className="text-[11px] font-medium text-amber-600 bg-amber-50 border border-amber-100 rounded-full px-2 py-0.5 inline-block">
        {PRICING_PENDING_TEXT}
      </span>
    );
  }
  return <span className="font-semibold text-slate-700">${Number(price).toLocaleString()}</span>;
}

function FieldLabel({ children, required }) {
  return (
    <label className="block text-sm font-semibold text-slate-700 mb-1">
      {children}{required && <span className="text-red-500 ml-0.5">*</span>}
    </label>
  );
}

function Input({ ...props }) {
  return (
    <input
      className="w-full rounded-xl border border-slate-200 bg-white py-2.5 px-4 text-sm text-slate-800 outline-none focus:border-[#FF7A00] focus:ring-2 focus:ring-[#FF7A00]/20 transition"
      {...props}
    />
  );
}

function Select({ children, ...props }) {
  return (
    <select
      className="w-full rounded-xl border border-slate-200 bg-white py-2.5 px-4 text-sm text-slate-800 outline-none focus:border-[#FF7A00] focus:ring-2 focus:ring-[#FF7A00]/20 transition"
      {...props}
    >
      {children}
    </select>
  );
}

const BLANK_FORM = {
  code: "core",
  name: "",
  catalog_version: "ZHR-COM-BILL-001-v1",
  billing_metric: "active_workforce",
  is_active: true,
  is_contract_priced: false,
  monthly_price: "",
  annual_price: "",
  currency: "USD",
  description: "",
};

export default function BillingPlansPage() {
  const [plans, setPlans] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [formError, setFormError] = useState(null);
  const [editing, setEditing] = useState(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState(BLANK_FORM);

  // Publish flow (Section 17, append-only + typed confirmation)
  const [publishOpen, setPublishOpen] = useState(false);
  const [publishVersion, setPublishVersion] = useState("");
  const [publishConfirm, setPublishConfirm] = useState("");
  const [publishing, setPublishing] = useState(false);
  const [publishError, setPublishError] = useState(null);

  // Distinct catalog versions present in the current data, and which are
  // fully published vs draft.
  const versions = useMemo(() => {
    const map = new Map();
    for (const p of plans) {
      if (!map.has(p.catalog_version)) {
        map.set(p.catalog_version, { total: 0, published: 0 });
      }
      const e = map.get(p.catalog_version);
      e.total += 1;
      if (p.is_published) e.published += 1;
    }
    return Array.from(map.entries()).map(([v, e]) => ({ version: v, ...e }));
  }, [plans]);

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

  const set = (key, val) => setForm(f => ({ ...f, [key]: val }));

  const openCreate = () => {
    setCreating(true);
    setEditing(null);
    setFormError(null);
    setForm(BLANK_FORM);
  };

  const openEdit = (plan) => {
    setEditing(plan);
    setCreating(false);
    setFormError(null);
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

  const closeModal = () => {
    setEditing(null);
    setCreating(false);
    setFormError(null);
  };

  const handleSave = async () => {
    setFormError(null);
    if (!form.catalog_version.trim()) {
      setFormError("Catalog version is required.");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        ...form,
        monthly_price: form.monthly_price !== "" ? Number(form.monthly_price) : null,
        annual_price: form.annual_price !== "" ? Number(form.annual_price) : null,
      };
      if (editing) {
        // PlanUpdateRequest does not include code
        const { code, ...updatePayload } = payload;
        await billingService.updatePlan(editing.id, updatePayload);
      } else {
        await billingService.createPlan(payload);
      }
      closeModal();
      loadPlans();
    } catch (e) {
      setFormError(e.message || "Failed to save plan.");
    } finally {
      setSaving(false);
    }
  };

  const openPublish = (version) => {
    setPublishError(null);
    setPublishVersion(version);
    setPublishConfirm("");
    setPublishOpen(true);
  };

  const closePublish = () => {
    setPublishOpen(false);
    setPublishVersion("");
    setPublishConfirm("");
    setPublishError(null);
  };

  const handlePublish = async () => {
    setPublishError(null);
    // Lightweight confirmation: the typed string MUST match the version.
    if (publishConfirm.trim() !== publishVersion) {
      setPublishError("Confirmation does not match the catalog version. Publication is irreversible.");
      return;
    }
    setPublishing(true);
    try {
      await catalogService.publishCatalogVersion(publishVersion);
      closePublish();
      loadPlans();
    } catch (e) {
      setPublishError(e.message || "Failed to publish catalog version.");
    } finally {
      setPublishing(false);
    }
  };

  const isOpen = editing || creating;

  if (loading) {
    return (
      <div className="space-y-6 font-sans">
        <PageHeader title="Plans & Catalog" description="Manage the billing plan catalog" />
        <div className="flex items-center justify-center py-24">
          <Loader2 className="h-8 w-8 animate-spin text-[#FF7A00]" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 font-sans">
      <PageHeader
        title="Plans & Catalog"
        description={`${total} plan${total !== 1 ? "s" : ""} in catalog`}
        action={
          <div className="flex items-center gap-2">
            <button
              onClick={loadPlans}
              className="p-2 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-500 transition"
              title="Refresh"
            >
              <RefreshCw className="h-4 w-4" />
            </button>
            <button
              onClick={() => openPublish(versions.find(v => v.published < v.total)?.version || plans[0]?.catalog_version || "")}
              disabled={versions.length === 0}
              className="flex items-center gap-2 rounded-full border border-[#FF7A00] text-[#FF7A00] px-4 py-2.5 text-sm font-semibold hover:bg-orange-50 transition disabled:opacity-40 disabled:cursor-not-allowed"
              title="Publish a catalog version (irreversible, confirms by typed version)"
            >
              <Send className="h-4 w-4" /> Publish Version
            </button>
            <button
              onClick={openCreate}
              className="flex items-center gap-2 rounded-full bg-[#FF7A00] hover:bg-[#e56e00] text-white px-4 py-2.5 text-sm font-semibold transition shadow-[0_4px_14px_rgba(255,122,0,0.3)]"
            >
              <Plus className="h-4 w-4" /> Add Plan
            </button>
          </div>
        }
      />

      {error && (
        <div className="rounded-3xl border border-red-200 bg-red-50 p-4 text-red-700 text-sm flex items-center gap-3">
          <AlertTriangle className="h-5 w-5 flex-shrink-0" />
          <span>{error}</span>
          <button onClick={loadPlans} className="ml-auto text-red-600 underline text-xs font-semibold">Retry</button>
        </div>
      )}

      <div className="rounded-3xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        {plans.length === 0 ? (
          <div className="text-center py-16 text-slate-400">
            <Package className="h-12 w-12 mx-auto mb-3 opacity-30" />
            <p className="font-medium">No plans configured yet.</p>
            <p className="text-xs mt-1">Plans are seeded automatically on first server startup.</p>
            <button onClick={openCreate} className="mt-4 text-sm font-semibold text-[#FF7A00] hover:underline">+ Add a plan manually</button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-100 text-xs font-semibold uppercase tracking-wider text-slate-400 bg-slate-50/50">
                  <th className="py-3.5 px-5">Plan</th>
                  <th className="py-3.5 px-5">Billing Metric</th>
                  <th className="py-3.5 px-5">Monthly</th>
                  <th className="py-3.5 px-5">Annual</th>
                  <th className="py-3.5 px-5">Version</th>
                  <th className="py-3.5 px-5">Published</th>
                  <th className="py-3.5 px-5">Self-Serve</th>
                  <th className="py-3.5 px-5">Active</th>
                  <th className="py-3.5 px-5" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {plans.map((plan) => (
                  <tr key={plan.id} className="text-sm hover:bg-slate-50/50 transition group">
                    <td className="py-4 px-5">
                      <div className="flex items-center gap-2.5">
                        <div className={`w-8 h-8 rounded-xl flex items-center justify-center text-xs font-bold shrink-0 ${
                          plan.is_contract_priced
                            ? "bg-amber-50 text-amber-600"
                            : "bg-orange-50 text-[#FF7A00]"
                        }`}>
                          {plan.code?.charAt(0)?.toUpperCase() || "?"}
                        </div>
                        <div>
                          <p className="font-semibold text-slate-800">{plan.name || "—"}</p>
                          <span className={`text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-md ${
                            plan.is_contract_priced
                              ? "bg-amber-50 text-amber-600"
                              : "bg-orange-50 text-[#FF7A00]"
                          }`}>
                            {plan.code}
                          </span>
                        </div>
                      </div>
                    </td>
                    <td className="py-4 px-5 text-slate-500 capitalize text-[13px]">
                      {plan.billing_metric?.replace(/_/g, " ")}
                    </td>
                    <td className="py-4 px-5">
                      <PriceCell price={plan.monthly_price} />
                    </td>
                    <td className="py-4 px-5">
                      <PriceCell price={plan.annual_price} />
                    </td>
                    <td className="py-4 px-5">
                      <span className="text-[11px] font-mono text-slate-400 bg-slate-100 px-2 py-0.5 rounded-md">{plan.catalog_version}</span>
                    </td>
                    <td className="py-4 px-5">
                      {plan.is_published ? (
                        <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold bg-green-50 text-green-600 border border-green-100">
                          <CheckCircle className="h-3 w-3" /> Published
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold bg-slate-100 text-slate-500 border border-slate-200">
                          <Lock className="h-3 w-3" /> Draft
                        </span>
                      )}
                    </td>
                    <td className="py-4 px-5">
                      {plan.is_self_serve_enabled ? (
                        <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold bg-green-50 text-green-600 border border-green-100">
                          <CheckCircle className="h-3 w-3" /> Yes
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold bg-slate-50 text-slate-400 border border-slate-100">
                          <XCircle className="h-3 w-3" /> No
                        </span>
                      )}
                    </td>
                    <td className="py-4 px-5">
                      {plan.is_active
                        ? <CheckCircle className="h-4 w-4 text-green-500" />
                        : <XCircle className="h-4 w-4 text-red-400" />
                      }
                    </td>
                    <td className="py-4 px-5">
                      <button
                        onClick={() => openEdit(plan)}
                        className="p-1.5 rounded-lg text-slate-300 hover:text-[#FF7A00] hover:bg-orange-50 opacity-0 group-hover:opacity-100 transition"
                        title="Edit plan"
                      >
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

      {/* Create / Edit Modal */}
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-3xl w-full max-w-lg shadow-2xl border border-slate-200 max-h-[90vh] overflow-y-auto">
            {/* Modal header */}
            <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-orange-50 flex items-center justify-center">
                  <Package className="h-5 w-5 text-[#FF7A00]" />
                </div>
                <h3 className="text-base font-bold text-slate-800">
                  {creating ? "Add Plan" : `Edit: ${editing?.name || editing?.code}`}
                </h3>
              </div>
              <button onClick={closeModal} className="p-1.5 hover:bg-slate-100 rounded-lg transition">
                <X className="h-5 w-5 text-slate-400" />
              </button>
            </div>

            <div className="px-6 py-5 space-y-4">
              {formError && (
                <div className="flex items-center gap-2 bg-red-50 text-red-600 rounded-xl px-4 py-3 text-sm border border-red-100">
                  <AlertTriangle className="h-4 w-4 flex-shrink-0" />
                  {formError}
                </div>
              )}

              {/* Self-serve info note */}
              <div className="flex items-start gap-2 bg-amber-50 text-amber-700 rounded-xl px-4 py-3 text-xs border border-amber-100">
                <Info className="h-4 w-4 flex-shrink-0 mt-0.5" />
                <span><strong>Self-serve</strong> is computed automatically: it enables when both monthly & annual prices are set and <strong>Contract Priced</strong> is off.</span>
              </div>

              {creating && (
                <div>
                  <FieldLabel required>Code</FieldLabel>
                  <Select value={form.code} onChange={e => set("code", e.target.value)}>
                    <option value="core">Core</option>
                    <option value="advanced">Advanced</option>
                    <option value="enterprise">Enterprise</option>
                  </Select>
                </div>
              )}

              <div>
                <FieldLabel>Name</FieldLabel>
                <Input
                  type="text"
                  value={form.name}
                  onChange={e => set("name", e.target.value)}
                  placeholder="e.g. Core Plan"
                />
              </div>

              <div>
                <FieldLabel required>Catalog Version</FieldLabel>
                <Input
                  type="text"
                  value={form.catalog_version}
                  onChange={e => set("catalog_version", e.target.value)}
                  placeholder="e.g. ZHR-COM-BILL-001-v1"
                />
              </div>

              <div>
                <FieldLabel>Billing Metric</FieldLabel>
                <Select value={form.billing_metric} onChange={e => set("billing_metric", e.target.value)}>
                  <option value="active_workforce">Active Workforce</option>
                  <option value="committed_workforce">Committed Workforce</option>
                  <option value="contract_defined">Contract Defined</option>
                </Select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <FieldLabel>Monthly Price</FieldLabel>
                  <div className="relative">
                    <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 text-sm">$</span>
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      value={form.monthly_price}
                      onChange={e => set("monthly_price", e.target.value)}
                      placeholder="0.00"
                      style={{ paddingLeft: "1.75rem" }}
                    />
                  </div>
                </div>
                <div>
                  <FieldLabel>Annual Price</FieldLabel>
                  <div className="relative">
                    <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 text-sm">$</span>
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      value={form.annual_price}
                      onChange={e => set("annual_price", e.target.value)}
                      placeholder="0.00"
                      style={{ paddingLeft: "1.75rem" }}
                    />
                  </div>
                </div>
              </div>

              <div>
                <FieldLabel>Currency</FieldLabel>
                <Select value={form.currency} onChange={e => set("currency", e.target.value)}>
                  <option value="USD">USD</option>
                  <option value="EUR">EUR</option>
                  <option value="GBP">GBP</option>
                  <option value="AED">AED</option>
                  <option value="INR">INR</option>
                </Select>
              </div>

              <div>
                <FieldLabel>Description</FieldLabel>
                <textarea
                  rows={2}
                  value={form.description}
                  onChange={e => set("description", e.target.value)}
                  placeholder="Brief description of this plan…"
                  className="w-full rounded-xl border border-slate-200 bg-white py-2.5 px-4 text-sm text-slate-800 outline-none focus:border-[#FF7A00] focus:ring-2 focus:ring-[#FF7A00]/20 transition resize-none"
                />
              </div>

              <div className="flex items-center gap-6 pt-1">
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={form.is_active}
                    onChange={e => set("is_active", e.target.checked)}
                    className="w-4 h-4 rounded border-slate-300 accent-[#FF7A00]"
                  />
                  <span className="text-sm font-medium text-slate-700">Active</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={form.is_contract_priced}
                    onChange={e => set("is_contract_priced", e.target.checked)}
                    className="w-4 h-4 rounded border-slate-300 accent-[#FF7A00]"
                  />
                  <span className="text-sm font-medium text-slate-700">Contract Priced</span>
                </label>
              </div>
            </div>

            {/* Modal footer */}
            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-slate-100 bg-slate-50/50">
              <button
                onClick={closeModal}
                className="px-4 py-2 rounded-full border border-slate-200 text-sm text-slate-600 hover:bg-slate-100 font-medium transition"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex items-center gap-2 px-5 py-2 rounded-full bg-[#FF7A00] text-white text-sm font-semibold hover:bg-[#e56e00] disabled:opacity-60 transition shadow-sm"
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                {creating ? "Create Plan" : "Save Changes"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Publish Version Modal (Section 17: append-only, typed confirmation) */}
      {publishOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-3xl w-full max-w-md shadow-2xl border border-slate-200">
            <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-orange-50 flex items-center justify-center">
                  <Send className="h-5 w-5 text-[#FF7A00]" />
                </div>
                <h3 className="text-base font-bold text-slate-800">Publish Catalog Version</h3>
              </div>
              <button onClick={closePublish} className="p-1.5 hover:bg-slate-100 rounded-lg transition">
                <X className="h-5 w-5 text-slate-400" />
              </button>
            </div>

            <div className="px-6 py-5 space-y-4">
              <div className="flex items-start gap-2 bg-red-50 text-red-600 rounded-xl px-4 py-3 text-xs border border-red-100">
                <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5" />
                <span><strong>Publishing is irreversible & append-only.</strong> Once published, prices can never be edited — create a new catalog version instead. Type the version below to confirm.</span>
              </div>

              <div>
                <FieldLabel required>Catalog Version to Publish</FieldLabel>
                <Select value={publishVersion} onChange={e => setPublishVersion(e.target.value)}>
                  {versions.map(v => (
                    <option key={v.version} value={v.version}>
                      {v.version} ({v.published}/{v.total} published)
                    </option>
                  ))}
                </Select>
              </div>

              <div>
                <FieldLabel required>Type the exact version to confirm</FieldLabel>
                <Input
                  type="text"
                  value={publishConfirm}
                  onChange={e => setPublishConfirm(e.target.value)}
                  placeholder={publishVersion}
                />
              </div>

              {publishError && (
                <div className="flex items-center gap-2 bg-red-50 text-red-600 rounded-xl px-4 py-3 text-sm border border-red-100">
                  <AlertTriangle className="h-4 w-4 flex-shrink-0" />
                  {publishError}
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-slate-100 bg-slate-50/50">
              <button
                onClick={closePublish}
                className="px-4 py-2 rounded-full border border-slate-200 text-sm text-slate-600 hover:bg-slate-100 font-medium transition"
              >
                Cancel
              </button>
              <button
                onClick={handlePublish}
                disabled={publishing}
                className="flex items-center gap-2 px-5 py-2 rounded-full bg-[#FF7A00] text-white text-sm font-semibold hover:bg-[#e56e00] disabled:opacity-60 transition shadow-sm"
              >
                {publishing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                Publish Version
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
