import { useState, useCallback, useEffect } from "react";
import { Hourglass, AlertTriangle, PlayCircle, Square, ArrowUpRight, Clock, X } from "lucide-react";
import PageHeader from "../../components/PageHeader";
import OrgPicker from "../../components/OrgPicker";
import { billingService } from "../../service/billingService";
import { formatDate, formatDateTime } from "../../utils/dateTime";

// Must match app.modules.billing.models.DataClassification exactly (lowercase
// enum values) — this previously listed SYNTHETIC/PRODUCTION_LIKE/PRODUCTION,
// none of which the backend accepts, so every "Start Evaluation" submission
// failed with a 422 regardless of which option was picked.
const DATA_CLASSIFICATIONS = [
  { value: "synthetic", label: "Synthetic" },
  { value: "customer_controlled", label: "Customer Controlled" },
];

const STATUS_PILLS = {
  active: "bg-[#E0F2FE] text-cyan-800 border-[#BAE6FD]",
  evaluation_ended: "bg-slate-100 text-slate-600 border-slate-200",
  converted: "bg-[#EFF6FF] text-blue-700 border-[#BFDBFE]",
  expired: "bg-slate-100 text-slate-500 border-slate-200",
};

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

  const inputClass =
    "w-full rounded-lg border border-[#CBD5E1] bg-white py-2.5 px-3.5 text-sm text-[#475569] placeholder:text-slate-400 outline-none transition-all duration-200 ease-in-out hover:border-blue-400 focus:border-[#2563EB] focus:ring-2 focus:ring-blue-500/20";

  const labelClass =
    "mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-500";

  return (
    <div className="min-h-full space-y-6 bg-[#F8FAFC] p-6 font-sans">
      <PageHeader
        title="Evaluations & Trials"
        description="Search for an organization to manage its evaluation lifecycle."
      />

      <div className="rounded-2xl border border-[#E2E8F0] bg-white p-6 shadow-[0_1px_3px_rgba(15,23,42,0.04),0_4px_16px_rgba(15,23,42,0.06)] transition-all duration-200 ease-in-out">
        <OrgPicker selectedOrg={selectedOrg} onSelect={setSelectedOrg} placeholder="Search organizations by name or code..." />
      </div>

      {error && (
        <div className="flex items-center gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 shadow-sm">
          <AlertTriangle className="h-5 w-5 shrink-0" />
          <span className="text-[#475569]">{error}</span>
          <button onClick={() => setError(null)} className="ml-auto flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-red-600 underline underline-offset-2 transition-colors duration-200 hover:text-red-700">
            <X className="h-3.5 w-3.5" /> Dismiss
          </button>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-[#2563EB] border-t-transparent" />
        </div>
      ) : (
        <>
          <div className="rounded-2xl border border-[#E2E8F0] bg-white shadow-[0_1px_3px_rgba(15,23,42,0.04),0_4px_16px_rgba(15,23,42,0.06)] transition-all duration-200 ease-in-out">
            <div className="flex items-center justify-between gap-4 border-b border-[#EDF2F7] px-6 py-4">
              <h3 className="flex items-center gap-2.5 text-lg font-bold text-[#0F172A]">
                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#EFF6FF] text-[#2563EB]">
                  <Hourglass className="h-5 w-5" />
                </span>
                <span className="text-[#334155]">
                  {selectedOrg ? `Evaluations for ${selectedOrg.name}` : `All Platform Evaluations (${evaluations.length})`}
                </span>
              </h3>
              {selectedOrg && (
                <button
                  onClick={() => setStartModal(true)}
                  className="flex items-center gap-2 rounded-lg bg-[#2563EB] px-4 py-2 text-sm font-semibold text-white shadow-sm transition-all duration-200 ease-in-out hover:bg-blue-700 hover:shadow-md active:translate-y-0.5"
                >
                  <PlayCircle className="h-4 w-4" /> Start Evaluation
                </button>
              )}
            </div>

            {evaluations.length === 0 ? (
              <div className="px-6 py-10 text-center text-sm text-[#475569]/70">
                {selectedOrg ? "No evaluations for this organization yet" : "No active or historical evaluations found"}
              </div>
            ) : (
              <div className="space-y-3 p-6">
                {evaluations.map((ev) => {
                  // EvaluationStatus.ACTIVE.value on the backend is the
                  // lowercase string "active" (enum.value, not enum.name) —
                  // comparing against "ACTIVE" here never matched, so the
                  // badge always rendered gray and Convert/End never showed
                  // up for a real active evaluation.
                  const isActive = String(ev.status).toLowerCase() === "active";
                  const pill = STATUS_PILLS[String(ev.status).toLowerCase()] || STATUS_PILLS.evaluation_ended;
                  return (
                  <div
                    key={ev.id}
                    className={`flex items-start justify-between gap-4 rounded-xl border border-[#E2E8F0] bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition-all duration-200 ease-in-out hover:-translate-y-0.5 hover:border-blue-200 hover:bg-blue-50/50 hover:shadow-lg ${isActive ? "border-l-[3px] border-l-[#2563EB]" : ""}`}
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-bold capitalize transition-all duration-200 ${pill}`}>
                          {ev.status.replace(/_/g, " ")}
                        </span>
                        <span className="text-xs font-medium uppercase tracking-wider text-slate-500">{String(ev.data_classification || "").replace(/_/g, " ")}</span>
                        {ev.organization_name ? (
                          <span className="rounded-md bg-[#EFF6FF] px-2 py-0.5 text-xs font-bold text-[#1E293B]">
                            {ev.organization_name}
                          </span>
                        ) : ev.organization_id ? (
                          <span className="rounded-md bg-[#EFF6FF] px-2 py-0.5 text-xs font-bold text-[#1E293B]">
                            Org #{ev.organization_id}
                          </span>
                        ) : null}
                      </div>
                      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-[#475569] transition-colors duration-200">
                        <span className="flex items-center gap-1.5"><Clock size={12} className="text-slate-400" /> Ends <span className="font-medium text-[#334155]">{ev.evaluation_ends_at ? formatDateTime(ev.evaluation_ends_at) : "—"}</span></span>
                        {ev.approved_package_scope && <span>Scope: {ev.approved_package_scope}</span>}
                        {ev.conversion_owner && <span>Owner: {ev.conversion_owner}</span>}
                      </div>
                    </div>
                    {isActive && (
                      <div className="flex shrink-0 items-center gap-2">
                        <button
                          onClick={() => setConvertModal(ev)}
                          className="flex items-center gap-1.5 rounded-lg border border-[#E2E8F0] bg-white px-3 py-2 text-xs font-semibold text-[#334155] shadow-sm transition-all duration-200 ease-in-out hover:border-blue-300 hover:bg-[#EFF6FF] hover:text-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20 active:translate-y-0.5"
                        >
                          <ArrowUpRight size={14} /> Convert
                        </button>
                        <button
                          onClick={() => handleEnd(ev.id)}
                          disabled={busy === ev.id}
                          className="flex items-center gap-1.5 rounded-lg border border-[#E2E8F0] bg-white px-3 py-2 text-xs font-semibold text-slate-600 shadow-sm transition-all duration-200 ease-in-out hover:border-blue-300 hover:bg-[#EFF6FF] hover:text-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20 active:translate-y-0.5 disabled:opacity-50"
                        >
                          <Square size={14} /> {busy === ev.id ? "Ending..." : "End"}
                        </button>
                      </div>
                    )}
                  </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="rounded-2xl border border-[#E2E8F0] bg-white shadow-[0_1px_3px_rgba(15,23,42,0.04),0_4px_16px_rgba(15,23,42,0.06)] transition-all duration-200 ease-in-out">
            <h3 className="border-b border-[#EDF2F7] px-6 py-4 text-lg font-bold text-[#0F172A]">Conversion History</h3>
            {conversions.length === 0 ? (
              <div className="px-6 py-10 text-center text-sm text-[#475569]/70">No conversions on record</div>
            ) : (
              <div className="p-6">
                <div className="overflow-hidden rounded-xl border border-[#E2E8F0]">
                  <div className="hidden grid-cols-12 gap-3 bg-[#F1F5F9] px-5 py-3 text-xs font-semibold uppercase tracking-wider text-slate-500 md:grid">
                    <div className="col-span-3">Catalog</div>
                    <div className="col-span-3">Quantity Basis</div>
                    <div className="col-span-3 text-right">Effective Date</div>
                    <div className="col-span-3 text-right">Approver</div>
                  </div>
                  {conversions.map((c) => (
                    <div key={c.id} className="grid grid-cols-2 gap-3 border-b border-[#EDF2F7] bg-white px-5 py-3.5 text-sm transition-all duration-200 ease-in-out last:border-b-0 hover:bg-blue-50/50 md:grid-cols-12">
                      <div className="col-span-2 md:col-span-3">
                        <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 md:hidden">Catalog</span>
                        <span className="font-semibold text-[#1E293B]">Catalog v{c.catalog_version}</span>
                      </div>
                      <div className="col-span-2 md:col-span-3">
                        <span className="mr-1.5 text-xs font-semibold uppercase tracking-wider text-slate-500 md:hidden">Basis</span>
                        <span className="text-[#475569]">{c.quantity_basis}</span>
                      </div>
                      <div className="col-span-1 text-right md:col-span-3">
                        <span className="mr-1.5 text-xs font-semibold uppercase tracking-wider text-slate-500 md:hidden">Effective</span>
                        <span className="text-[#334155]">{formatDate(c.commercial_effective_at)}</span>
                      </div>
                      <div className="col-span-1 text-right md:col-span-3">
                        <span className="mr-1.5 text-xs font-semibold uppercase tracking-wider text-slate-500 md:hidden">Approver</span>
                        <span className="text-[#475569]">{c.approver}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </>
      )}

      {/* Start Evaluation Modal */}
      {startModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-[#E2E8F0] bg-white p-6 shadow-[0_1px_3px_rgba(15,23,42,0.08),0_16px_40px_rgba(15,23,42,0.18)]">
            <h3 className="mb-5 text-lg font-bold text-[#0F172A]">Start Evaluation for {selectedOrg?.name}</h3>
            <div className="space-y-4">
              <div>
                <label className={labelClass}>Evaluation Ends At *</label>
                <input
                  type="datetime-local"
                  value={startForm.evaluation_ends_at}
                  onChange={(e) => setStartForm((f) => ({ ...f, evaluation_ends_at: e.target.value }))}
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>Data Classification</label>
                <select
                  value={startForm.data_classification}
                  onChange={(e) => setStartForm((f) => ({ ...f, data_classification: e.target.value }))}
                  className={inputClass}
                >
                  {DATA_CLASSIFICATIONS.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
                </select>
              </div>
              <div>
                <label className={labelClass}>Approved Package Scope</label>
                <input
                  type="text"
                  value={startForm.approved_package_scope}
                  onChange={(e) => setStartForm((f) => ({ ...f, approved_package_scope: e.target.value }))}
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>Conversion Owner</label>
                <input
                  type="text"
                  value={startForm.conversion_owner}
                  onChange={(e) => setStartForm((f) => ({ ...f, conversion_owner: e.target.value }))}
                  className={inputClass}
                />
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-3">
              <button onClick={() => setStartModal(false)} className="rounded-lg border border-[#E2E8F0] bg-white px-4 py-2 text-sm font-medium text-[#334155] transition-all duration-200 ease-in-out hover:border-blue-300 hover:bg-[#EFF6FF] hover:text-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20 active:translate-y-0.5">
                Cancel
              </button>
              <button
                onClick={handleStart}
                disabled={!startForm.evaluation_ends_at || busy === "start"}
                className="rounded-lg bg-[#2563EB] px-4 py-2 text-sm font-semibold text-white shadow-sm transition-all duration-200 ease-in-out hover:bg-blue-700 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-blue-500/30 active:translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {busy === "start" ? "Starting..." : "Start Evaluation"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Convert Evaluation Modal */}
      {convertModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-[#E2E8F0] bg-white p-6 shadow-[0_1px_3px_rgba(15,23,42,0.08),0_16px_40px_rgba(15,23,42,0.18)]">
            <h3 className="mb-5 text-lg font-bold text-[#0F172A]">Convert Evaluation → Commercial</h3>
            <div className="space-y-4">
              <div>
                <label className={labelClass}>Plan *</label>
                <select
                  value={convertForm.plan_id}
                  onChange={(e) => setConvertForm((f) => ({ ...f, plan_id: e.target.value }))}
                  className={inputClass}
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
                <label className={labelClass}>Billing Cycle</label>
                <select value={convertForm.billing_cycle} onChange={(e) => setConvertForm((f) => ({ ...f, billing_cycle: e.target.value }))}
                  className={inputClass}>
                  <option value="monthly">Monthly</option>
                  <option value="annual">Annual</option>
                </select>
              </div>
              <div>
                <label className={labelClass}>Quantity Basis *</label>
                <input type="text" value={convertForm.quantity_basis} onChange={(e) => setConvertForm((f) => ({ ...f, quantity_basis: e.target.value }))}
                  className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>Commercial Effective At *</label>
                <input type="datetime-local" value={convertForm.commercial_effective_at} onChange={(e) => setConvertForm((f) => ({ ...f, commercial_effective_at: e.target.value }))}
                  className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>Approver *</label>
                <input type="text" value={convertForm.approver} onChange={(e) => setConvertForm((f) => ({ ...f, approver: e.target.value }))}
                  className={inputClass} />
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-3">
              <button onClick={() => setConvertModal(null)} className="rounded-lg border border-[#E2E8F0] bg-white px-4 py-2 text-sm font-medium text-[#334155] transition-all duration-200 ease-in-out hover:border-blue-300 hover:bg-[#EFF6FF] hover:text-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20 active:translate-y-0.5">
                Cancel
              </button>
              <button
                onClick={handleConvert}
                disabled={!convertForm.plan_id || !convertForm.quantity_basis || !convertForm.commercial_effective_at || !convertForm.approver || busy === "convert"}
                className="rounded-lg bg-[#2563EB] px-4 py-2 text-sm font-semibold text-white shadow-sm transition-all duration-200 ease-in-out hover:bg-blue-700 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-blue-500/30 active:translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-50"
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