import { useState, useEffect, useCallback, useRef } from "react";
import PageHeader from "../../components/PageHeader";
import {
  AlertTriangle, CreditCard, Plus, Save, X, Loader2, RefreshCw,
  CheckCircle, Building2, Search, Clock, ChevronDown,
} from "lucide-react";
import { billingService } from "../../service/billingService";
import { superAdminService } from "../../service/superAdminService";

function FieldLabel({ children, required }) {
  return (
    <label className="block text-sm font-semibold text-slate-700 mb-1">
      {children}{required && <span className="text-red-500 ml-0.5">*</span>}
    </label>
  );
}

function InputField({ ...props }) {
  return (
    <input
      className="w-full rounded-xl border border-slate-200 bg-white py-2.5 px-4 text-sm text-slate-800 outline-none focus:border-[#FF7A00] focus:ring-2 focus:ring-[#FF7A00]/20 transition"
      {...props}
    />
  );
}

// Searchable org picker dropdown
function OrgPicker({ value, orgs, loading: orgsLoading, error: orgsError, onChange }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const containerRef = useRef(null);

  const selected = orgs.find(o => o.id === value);
  const filtered = orgs.filter(o =>
    !query ||
    o.name?.toLowerCase().includes(query.toLowerCase()) ||
    String(o.id).includes(query)
  );

  useEffect(() => {
    const handler = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false);
        setQuery("");
      }
    };
    if (open) document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => { setOpen(o => !o); setQuery(""); }}
        className="w-full rounded-xl border border-slate-200 bg-white py-2.5 px-4 text-sm text-slate-800 outline-none focus:border-[#FF7A00] focus:ring-2 focus:ring-[#FF7A00]/20 transition flex items-center justify-between gap-2"
      >
        <span className={selected ? "text-slate-800" : "text-slate-400"}>
          {selected
            ? <span className="flex items-center gap-1.5"><Building2 className="h-3.5 w-3.5 text-slate-400" />{selected.name} <span className="text-slate-400">#{selected.id}</span></span>
            : orgsLoading ? "Loading organizations…" : "Select organization…"
          }
        </span>
        <ChevronDown className={`h-4 w-4 text-slate-400 shrink-0 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="absolute z-50 mt-1.5 w-full bg-white rounded-2xl border border-slate-200 shadow-xl overflow-hidden">
          <div className="p-2 border-b border-slate-100">
            <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-50">
              <Search className="h-3.5 w-3.5 text-slate-400 shrink-0" />
              <input
                autoFocus
                type="text"
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="Search organizations…"
                className="flex-1 bg-transparent text-sm text-slate-800 outline-none"
              />
            </div>
          </div>
          <div className="max-h-52 overflow-y-auto">
            {orgsLoading ? (
              <div className="flex items-center justify-center py-6 text-slate-400 gap-2 text-sm">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading…
              </div>
            ) : orgsError ? (
              <div className="px-4 py-3 text-sm text-red-500">{orgsError}</div>
            ) : filtered.length === 0 ? (
              <div className="px-4 py-3 text-sm text-slate-400">No organizations found.</div>
            ) : (
              filtered.map(org => (
                <button
                  key={org.id}
                  type="button"
                  onClick={() => { onChange(org.id); setOpen(false); setQuery(""); }}
                  className={`w-full text-left px-4 py-3 hover:bg-slate-50 flex items-center gap-2.5 transition ${value === org.id ? "bg-orange-50/60" : ""}`}
                >
                  <div className="w-7 h-7 rounded-lg bg-slate-100 flex items-center justify-center shrink-0">
                    <Building2 className="h-3.5 w-3.5 text-slate-500" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-slate-700">{org.name}</p>
                    <p className="text-[11px] text-slate-400">ID: {org.id} · {org.status || "—"}</p>
                  </div>
                  {value === org.id && <CheckCircle className="h-4 w-4 text-[#FF7A00] ml-auto shrink-0" />}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

const BLANK_FORM = {
  organization_id: null,
  campaign_or_contract_id: "",
  approver: "",
  package_eligibility: "",
  currency: "USD",
  effective_start: "",
  effective_end: "",
  is_stackable: false,
};

function isExpired(dateStr) {
  if (!dateStr) return false;
  return new Date(dateStr) < new Date();
}

function formatDate(dateStr) {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleDateString(undefined, { dateStyle: "medium" });
}

export default function BillingDiscountsPage() {
  const [discounts, setDiscounts] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [formError, setFormError] = useState(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState(BLANK_FORM);

  // Org list for picker
  const [orgs, setOrgs] = useState([]);
  const [orgsLoading, setOrgsLoading] = useState(false);
  const [orgsError, setOrgsError] = useState(null);

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

  const loadOrgs = useCallback(async () => {
    setOrgsLoading(true);
    setOrgsError(null);
    try {
      const data = await superAdminService.getOrganizations({ page: 1, page_size: 200 });
      setOrgs(data.organizations || []);
    } catch (e) {
      setOrgsError("Could not load organizations. Please type the org ID manually.");
    } finally {
      setOrgsLoading(false);
    }
  }, []);

  useEffect(() => { loadDiscounts(); }, [loadDiscounts]);

  const set = (key, val) => setForm(f => ({ ...f, [key]: val }));

  const openCreate = () => {
    setCreating(true);
    setFormError(null);
    setForm(BLANK_FORM);
    if (orgs.length === 0) loadOrgs();
  };

  const closeModal = () => {
    setCreating(false);
    setFormError(null);
  };

  const handleSave = async () => {
    setFormError(null);
    if (!form.organization_id) {
      setFormError("Please select an organization.");
      return;
    }
    if (!form.campaign_or_contract_id.trim()) {
      setFormError("Campaign / Contract ID is required.");
      return;
    }
    if (!form.approver.trim()) {
      setFormError("Approver is required.");
      return;
    }
    if (!form.effective_start) {
      setFormError("Effective start date is required.");
      return;
    }
    setSaving(true);
    try {
      await billingService.createDiscount({
        organization_id: Number(form.organization_id),
        campaign_or_contract_id: form.campaign_or_contract_id.trim(),
        approver: form.approver.trim(),
        package_eligibility: form.package_eligibility.trim() || null,
        currency: form.currency,
        effective_start: new Date(form.effective_start).toISOString(),
        effective_end: form.effective_end ? new Date(form.effective_end).toISOString() : null,
        is_stackable: form.is_stackable,
      });
      closeModal();
      loadDiscounts();
    } catch (e) {
      setFormError(e.message || "Failed to create discount.");
    } finally {
      setSaving(false);
    }
  };

  // Build org name lookup map from the loaded orgs list
  const orgMap = Object.fromEntries(orgs.map(o => [o.id, o.name]));

  if (loading) {
    return (
      <div className="space-y-6 font-sans">
        <PageHeader title="Discounts" description="Manage billing discounts" />
        <div className="flex items-center justify-center py-24">
          <Loader2 className="h-8 w-8 animate-spin text-[#FF7A00]" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 font-sans">
      <PageHeader
        title="Discounts"
        description={`${total} discount record${total !== 1 ? "s" : ""}`}
        action={
          <div className="flex items-center gap-2">
            <button
              onClick={loadDiscounts}
              className="p-2 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-500 transition"
              title="Refresh"
            >
              <RefreshCw className="h-4 w-4" />
            </button>
            <button
              onClick={openCreate}
              className="flex items-center gap-2 rounded-full bg-[#FF7A00] hover:bg-[#e56e00] text-white px-4 py-2.5 text-sm font-semibold transition shadow-[0_4px_14px_rgba(255,122,0,0.3)]"
            >
              <Plus className="h-4 w-4" /> Add Discount
            </button>
          </div>
        }
      />

      {error && (
        <div className="rounded-3xl border border-red-200 bg-red-50 p-4 text-red-700 text-sm flex items-center gap-3">
          <AlertTriangle className="h-5 w-5 flex-shrink-0" />
          <span>{error}</span>
          <button onClick={loadDiscounts} className="ml-auto text-red-600 underline text-xs font-semibold">Retry</button>
        </div>
      )}

      <div className="rounded-3xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        {discounts.length === 0 ? (
          <div className="text-center py-16 text-slate-400">
            <CreditCard className="h-12 w-12 mx-auto mb-3 opacity-30" />
            <p className="font-medium">No discount records yet.</p>
            <p className="text-xs mt-1">Discounts are linked to specific campaign or contract IDs.</p>
            <button onClick={openCreate} className="mt-4 text-sm font-semibold text-[#FF7A00] hover:underline">+ Add a discount</button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-100 text-xs font-semibold uppercase tracking-wider text-slate-400 bg-slate-50/50">
                  <th className="py-3.5 px-5">Campaign / Contract</th>
                  <th className="py-3.5 px-5">Organization</th>
                  <th className="py-3.5 px-5">Approver</th>
                  <th className="py-3.5 px-5">Package</th>
                  <th className="py-3.5 px-5">Currency</th>
                  <th className="py-3.5 px-5">Effective Period</th>
                  <th className="py-3.5 px-5">Stackable</th>
                  <th className="py-3.5 px-5">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {discounts.map((d) => {
                  const expired = isExpired(d.effective_end);
                  return (
                    <tr key={d.id} className="text-sm hover:bg-slate-50/50 transition">
                      <td className="py-4 px-5">
                        <span className="font-semibold text-slate-800 block truncate max-w-[200px]" title={d.campaign_or_contract_id}>
                          {d.campaign_or_contract_id}
                        </span>
                        <span className="text-[11px] text-slate-400 font-mono">#{d.id}</span>
                      </td>
                      <td className="py-4 px-5">
                        <div className="flex items-center gap-1.5">
                          <Building2 className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                          <div>
                            <span className="font-medium text-slate-700 block">
                              {orgMap[d.organization_id] || `Org #${d.organization_id}`}
                            </span>
                            <span className="text-[11px] text-slate-400">ID: {d.organization_id}</span>
                          </div>
                        </div>
                      </td>
                      <td className="py-4 px-5 text-slate-600">{d.approver}</td>
                      <td className="py-4 px-5">
                        {d.package_eligibility
                          ? <span className="text-slate-600">{d.package_eligibility}</span>
                          : <span className="text-slate-300 italic text-xs">—</span>
                        }
                      </td>
                      <td className="py-4 px-5 text-slate-500">{d.currency || "USD"}</td>
                      <td className="py-4 px-5">
                        <span className="text-slate-600 text-[13px]">{formatDate(d.effective_start)}</span>
                        <span className="text-slate-400 mx-1">→</span>
                        <span className={`text-[13px] ${expired ? "text-red-400" : "text-slate-600"}`}>
                          {d.effective_end ? formatDate(d.effective_end) : "Ongoing"}
                        </span>
                      </td>
                      <td className="py-4 px-5">
                        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold border ${
                          d.is_stackable
                            ? "bg-green-50 text-green-600 border-green-100"
                            : "bg-slate-50 text-slate-400 border-slate-100"
                        }`}>
                          {d.is_stackable ? "Stackable" : "Non-stackable"}
                        </span>
                      </td>
                      <td className="py-4 px-5">
                        {expired ? (
                          <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold bg-red-50 text-red-500 border border-red-100">
                            <Clock className="h-2.5 w-2.5" /> Expired
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold bg-emerald-50 text-emerald-600 border border-emerald-100">
                            <CheckCircle className="h-2.5 w-2.5" /> Active
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Create Modal */}
      {creating && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-3xl w-full max-w-lg shadow-2xl border border-slate-200 max-h-[90vh] overflow-y-auto">
            {/* Modal header */}
            <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-blue-50 flex items-center justify-center">
                  <CreditCard className="h-5 w-5 text-blue-500" />
                </div>
                <h3 className="text-base font-bold text-slate-800">Add Discount</h3>
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

              <div>
                <FieldLabel required>Organization</FieldLabel>
                <OrgPicker
                  value={form.organization_id}
                  orgs={orgs}
                  loading={orgsLoading}
                  error={orgsError}
                  onChange={id => set("organization_id", id)}
                />
              </div>

              <div>
                <FieldLabel required>Campaign / Contract ID</FieldLabel>
                <InputField
                  type="text"
                  value={form.campaign_or_contract_id}
                  onChange={e => set("campaign_or_contract_id", e.target.value)}
                  placeholder="e.g. CAMPAIGN-2024-Q4"
                />
              </div>

              <div>
                <FieldLabel required>Approver</FieldLabel>
                <InputField
                  type="text"
                  value={form.approver}
                  onChange={e => set("approver", e.target.value)}
                  placeholder="Name or email of approver"
                />
              </div>

              <div>
                <FieldLabel>Package Eligibility</FieldLabel>
                <InputField
                  type="text"
                  value={form.package_eligibility}
                  onChange={e => set("package_eligibility", e.target.value)}
                  placeholder="Optional — e.g. core, advanced"
                />
              </div>

              <div>
                <FieldLabel>Currency</FieldLabel>
                <select
                  value={form.currency}
                  onChange={e => set("currency", e.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-white py-2.5 px-4 text-sm text-slate-800 outline-none focus:border-[#FF7A00] focus:ring-2 focus:ring-[#FF7A00]/20 transition"
                >
                  <option value="USD">USD</option>
                  <option value="EUR">EUR</option>
                  <option value="GBP">GBP</option>
                  <option value="AED">AED</option>
                  <option value="INR">INR</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <FieldLabel required>Effective Start</FieldLabel>
                  <InputField
                    type="datetime-local"
                    value={form.effective_start}
                    onChange={e => set("effective_start", e.target.value)}
                  />
                </div>
                <div>
                  <FieldLabel>Effective End</FieldLabel>
                  <InputField
                    type="datetime-local"
                    value={form.effective_end}
                    onChange={e => set("effective_end", e.target.value)}
                  />
                  <p className="text-[11px] text-slate-400 mt-1">Leave blank for ongoing discounts</p>
                </div>
              </div>

              <label className="flex items-center gap-2 cursor-pointer select-none pt-1">
                <input
                  type="checkbox"
                  checked={form.is_stackable}
                  onChange={e => set("is_stackable", e.target.checked)}
                  className="w-4 h-4 rounded border-slate-300 accent-[#FF7A00]"
                />
                <span className="text-sm font-medium text-slate-700">Stackable</span>
                <span className="text-[11px] text-slate-400 ml-1">(can combine with other discounts)</span>
              </label>
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
                Create Discount
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
