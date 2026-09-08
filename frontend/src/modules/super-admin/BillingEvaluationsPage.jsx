import { useState, useCallback, useEffect } from "react";
import { Hourglass, AlertTriangle, Search, PlayCircle, Square, ArrowUpRight, Clock } from "lucide-react";
import PageHeader from "../../components/PageHeader";
import OrgPicker from "../../components/OrgPicker";
import { billingService } from "../../service/billingService";

// Must match app.modules.billing.models.DataClassification exactly (lowercase
// enum values) — this previously listed SYNTHETIC/PRODUCTION_LIKE/PRODUCTION,
// none of which the backend accepts, so every "Start Evaluation" submission
// failed with a 422 regardless of which option was picked.
const DATA_CLASSIFICATIONS = [
  { value: "synthetic", label: "Synthetic" },
  { value: "customer_controlled", label: "Customer Controlled" },
];

export default function BillingEvaluationsPage() {
  const [selectedOrg, setSelectedOrg] = useState(null);
  const [evaluations, setEvaluations] = useState([]);
  const [conversions, setConversions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(null);

  const [startModal, setStartModal] = useState(false);
  const [startForm, setStartForm] = useState({ evaluation_ends_at: "", approved_package_scope: "", data_classification: "synthetic", conversion_owner: "" });

  const [plans, setPlans] = useState([]);

  useEffect(() => {
    billingService.getPlans().then(res => setPlans(res.list || [])).catch(() => {});
  }, []);

  const [convertModal, setConvertModal] = useState(null);
  const [convertForm, setConvertForm] = useState({ plan_id: "", billing_cycle: "monthly", quantity_basis: "", commercial_effective_at: "", approver: "", order_form_reference: "" });


  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      if (selectedOrg) {
        const [evalData, convData] = await Promise.all([
          billingService.getEvaluations(selectedOrg.id),
          billingService.getConversions(selectedOrg.id),
        ]);
        setEvaluations(evalData.list || []);
        setConversions(convData.list || []);
      } else {
        const evalData = await billingService.getPlatformEvaluations();
        setEvaluations(evalData.list || []);
        setConversions([]);
      }
    } catch (e) {
      setError(e.message || "Failed to load evaluations");
    } finally {
      setLoading(false);
    }
  }, [selectedOrg]);

  useEffect(() => { loadData(); }, [loadData]);

  const handleStart = async () => {
    if (!selectedOrg || !startForm.evaluation_ends_at) return;
    setBusy("start");
    try {
      await billingService.startEvaluation({
        organization_id: selectedOrg.id,
        evaluation_ends_at: new Date(startForm.evaluation_ends_at).toISOString(),
        approved_package_scope: startForm.approved_package_scope || null,
        data_classification: startForm.data_classification,
        conversion_owner: startForm.conversion_owner || null,
      });
      setStartModal(false);
      setStartForm({ evaluation_ends_at: "", approved_package_scope: "", data_classification: "synthetic", conversion_owner: "" });
      loadData();
    } catch (e) {
      setError(e.message || "Failed to start evaluation");
    } finally {
      setBusy(null);
    }
  };

  const handleEnd = async (evaluationId) => {
    setBusy(evaluationId);
    try {
      await billingService.endEvaluation(evaluationId);
      loadData();
    } catch (e) {
      setError(e.message || "Failed to end evaluation");
    } finally {
      setBusy(null);
    }
  };

  const handleConvert = async () => {
    if (!convertModal) return;
    setBusy("convert");
    try {
      await billingService.convertEvaluation(convertModal.id, {
        plan_id: Number(convertForm.plan_id),
        billing_cycle: convertForm.billing_cycle,
        quantity_basis: convertForm.quantity_basis,
        commercial_effective_at: new Date(convertForm.commercial_effective_at).toISOString(),
        approver: convertForm.approver,
        order_form_reference: convertForm.order_form_reference || null,
      });
      setConvertModal(null);
      loadData();
    } catch (e) {
      setError(e.message || "Failed to convert evaluation");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-6 font-sans">
      <PageHeader
        title="Evaluations & Trials"
        description="Search for an organization to manage its evaluation lifecycle."
      />

      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-[0_4px_20px_rgba(0,0,0,0.02)]">
        <OrgPicker selectedOrg={selectedOrg} onSelect={setSelectedOrg} placeholder="Search organizations by name or code..." />
      </div>

      {error && (
        <div className="rounded-3xl border border-red-200 bg-red-50 p-4 text-red-700 text-sm flex items-center gap-3">
          <AlertTriangle className="h-5 w-5 shrink-0" />
          <span>{error}</span>
          <button onClick={() => setError(null)} className="ml-auto text-red-600 underline text-xs font-semibold">Dismiss</button>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-[#3B82F6] border-t-transparent" />
        </div>
      ) : (
        <>
          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-[0_4px_20px_rgba(0,0,0,0.02)]">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                <Hourglass className="h-5 w-5 text-[#3B82F6]" />{" "}
                {selectedOrg ? `Evaluations for ${selectedOrg.name}` : `All Platform Evaluations (${evaluations.length})`}
              </h3>
              {selectedOrg && (
                <button
                  onClick={() => setStartModal(true)}
                  className="flex items-center gap-2 rounded-full bg-[#3B82F6] px-4 py-2 text-sm font-semibold text-white hover:bg-[#2563EB]"
                >
                  <PlayCircle className="h-4 w-4" /> Start Evaluation
                </button>
              )}
            </div>

            {evaluations.length === 0 ? (
              <div className="text-center py-8 text-slate-400 text-sm">
                {selectedOrg ? "No evaluations for this organization yet" : "No active or historical evaluations found"}
              </div>
            ) : (
              <div className="space-y-3">
                {evaluations.map((ev) => {
                  // EvaluationStatus.ACTIVE.value on the backend is the
                  // lowercase string "active" (enum.value, not enum.name) —
                  // comparing against "ACTIVE" here never matched, so the
                  // badge always rendered gray and Convert/End never showed
                  // up for a real active evaluation.
                  const isActive = String(ev.status).toLowerCase() === "active";
                  return (
                  <div key={ev.id} className="rounded-2xl border border-slate-100 bg-slate-50/50 p-4 flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold capitalize ${isActive ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-slate-100 text-slate-600 border-slate-200"}`}>
                          {ev.status}
                        </span>
                        <span className="text-xs font-medium text-slate-500 capitalize">{String(ev.data_classification || "").replace(/_/g, " ")}</span>
                        {ev.organization_name ? (
                          <span className="text-xs font-bold text-slate-700 bg-slate-100 px-2 py-0.5 rounded-md">
                            {ev.organization_name}
                          </span>
                        ) : ev.organization_id ? (
                          <span className="text-xs font-bold text-slate-700 bg-slate-100 px-2 py-0.5 rounded-md">
                            Org #{ev.organization_id}
                          </span>
                        ) : null}
                      </div>
                      <div className="mt-1 flex items-center gap-3 text-xs text-slate-500">
                        <span className="flex items-center gap-1"><Clock size={12} /> Ends {ev.evaluation_ends_at ? new Date(ev.evaluation_ends_at).toLocaleString() : "—"}</span>
                        {ev.approved_package_scope && <span>Scope: {ev.approved_package_scope}</span>}
                        {ev.conversion_owner && <span>Owner: {ev.conversion_owner}</span>}
                      </div>
                    </div>
                    {isActive && (
                      <div className="flex gap-2 shrink-0">
                        <button
                          onClick={() => setConvertModal(ev)}
                          className="flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-100"
                        >
                          <ArrowUpRight size={14} /> Convert
                        </button>
                        <button
                          onClick={() => handleEnd(ev.id)}
                          disabled={busy === ev.id}
                          className="flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50"
                        >
                          <Square size={14} /> End
                        </button>
                      </div>
                    )}
                  </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-[0_4px_20px_rgba(0,0,0,0.02)]">
            <h3 className="text-lg font-bold text-slate-800 mb-4">Conversion History</h3>
            {conversions.length === 0 ? (
              <div className="text-center py-8 text-slate-400 text-sm">No conversions on record</div>
            ) : (
              <div className="space-y-2">
                {conversions.map((c) => (
                  <div key={c.id} className="flex items-center justify-between p-3 rounded-xl bg-slate-50 border border-slate-100 text-sm">
                    <div>
                      <span className="font-semibold text-slate-700">Catalog v{c.catalog_version}</span>
                      <span className="ml-2 text-xs text-slate-400">· {c.quantity_basis}</span>
                    </div>
                    <div className="text-xs text-slate-400">
                      {new Date(c.commercial_effective_at).toLocaleDateString()} · {c.approver}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}

      {/* Start Evaluation Modal */}
      {startModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-3xl p-6 w-full max-w-md shadow-xl border border-slate-200">
            <h3 className="text-lg font-bold text-slate-800 mb-4">Start Evaluation for {selectedOrg?.name}</h3>
            <div className="space-y-4">
              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-500">Evaluation Ends At *</label>
                <input
                  type="datetime-local"
                  value={startForm.evaluation_ends_at}
                  onChange={(e) => setStartForm((f) => ({ ...f, evaluation_ends_at: e.target.value }))}
                  className="w-full rounded-xl border border-slate-200 bg-white py-2.5 px-4 text-sm text-slate-700 outline-none focus:border-[#3B82F6]"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-500">Data Classification</label>
                <select
                  value={startForm.data_classification}
                  onChange={(e) => setStartForm((f) => ({ ...f, data_classification: e.target.value }))}
                  className="w-full rounded-xl border border-slate-200 bg-white py-2.5 px-4 text-sm text-slate-700 outline-none focus:border-[#3B82F6]"
                >
                  {DATA_CLASSIFICATIONS.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
                </select>
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-500">Approved Package Scope</label>
                <input
                  type="text"
                  value={startForm.approved_package_scope}
                  onChange={(e) => setStartForm((f) => ({ ...f, approved_package_scope: e.target.value }))}
                  className="w-full rounded-xl border border-slate-200 bg-white py-2.5 px-4 text-sm text-slate-700 outline-none focus:border-[#3B82F6]"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-500">Conversion Owner</label>
                <input
                  type="text"
                  value={startForm.conversion_owner}
                  onChange={(e) => setStartForm((f) => ({ ...f, conversion_owner: e.target.value }))}
                  className="w-full rounded-xl border border-slate-200 bg-white py-2.5 px-4 text-sm text-slate-700 outline-none focus:border-[#3B82F6]"
                />
              </div>
            </div>
            <div className="flex gap-3 mt-6 justify-end">
              <button onClick={() => setStartModal(false)} className="px-4 py-2 rounded-full border border-slate-200 text-sm text-slate-600 hover:bg-slate-50">Cancel</button>
              <button
                onClick={handleStart}
                disabled={!startForm.evaluation_ends_at || busy === "start"}
                className="px-4 py-2 rounded-full bg-[#3B82F6] text-white text-sm font-semibold hover:bg-[#2563EB] disabled:opacity-50"
              >
                {busy === "start" ? "Starting..." : "Start Evaluation"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Convert Evaluation Modal */}
      {convertModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-3xl p-6 w-full max-w-md shadow-xl border border-slate-200">
            <h3 className="text-lg font-bold text-slate-800 mb-4">Convert Evaluation → Commercial</h3>
            <div className="space-y-4">
              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-500">Plan *</label>
                <select
                  value={convertForm.plan_id}
                  onChange={(e) => setConvertForm((f) => ({ ...f, plan_id: e.target.value }))}
                  className="w-full rounded-xl border border-slate-200 bg-white py-2.5 px-4 text-sm text-slate-700 outline-none focus:border-[#3B82F6]"
                >
                  <option value="">Select a Plan...</option>
                  {plans.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name || p.code} ({p.code?.toUpperCase()} - v{p.catalog_version})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-500">Billing Cycle</label>
                <select value={convertForm.billing_cycle} onChange={(e) => setConvertForm((f) => ({ ...f, billing_cycle: e.target.value }))}
                  className="w-full rounded-xl border border-slate-200 bg-white py-2.5 px-4 text-sm text-slate-700 outline-none focus:border-[#3B82F6]">
                  <option value="monthly">Monthly</option>
                  <option value="annual">Annual</option>
                </select>
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-500">Quantity Basis *</label>
                <input type="text" value={convertForm.quantity_basis} onChange={(e) => setConvertForm((f) => ({ ...f, quantity_basis: e.target.value }))}
                  className="w-full rounded-xl border border-slate-200 bg-white py-2.5 px-4 text-sm text-slate-700 outline-none focus:border-[#3B82F6]" />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-500">Commercial Effective At *</label>
                <input type="datetime-local" value={convertForm.commercial_effective_at} onChange={(e) => setConvertForm((f) => ({ ...f, commercial_effective_at: e.target.value }))}
                  className="w-full rounded-xl border border-slate-200 bg-white py-2.5 px-4 text-sm text-slate-700 outline-none focus:border-[#3B82F6]" />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-500">Approver *</label>
                <input type="text" value={convertForm.approver} onChange={(e) => setConvertForm((f) => ({ ...f, approver: e.target.value }))}
                  className="w-full rounded-xl border border-slate-200 bg-white py-2.5 px-4 text-sm text-slate-700 outline-none focus:border-[#3B82F6]" />
              </div>
            </div>
            <div className="flex gap-3 mt-6 justify-end">
              <button onClick={() => setConvertModal(null)} className="px-4 py-2 rounded-full border border-slate-200 text-sm text-slate-600 hover:bg-slate-50">Cancel</button>
              <button
                onClick={handleConvert}
                disabled={!convertForm.plan_id || !convertForm.quantity_basis || !convertForm.commercial_effective_at || !convertForm.approver || busy === "convert"}
                className="px-4 py-2 rounded-full bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700 disabled:opacity-50"
              >
                {busy === "convert" ? "Converting..." : "Convert"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
