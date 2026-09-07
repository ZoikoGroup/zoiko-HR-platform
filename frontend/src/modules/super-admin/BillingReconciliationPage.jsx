import { useState, useCallback, useEffect } from "react";
import { Scale, AlertTriangle, Info, PlayCircle, CheckCircle, RefreshCw, Eye, Check, X } from "lucide-react";
import PageHeader from "../../components/PageHeader";
import OrgPicker from "../../components/OrgPicker";
import { billingService } from "../../service/billingService";

const STATUS_TONES = {
  open: "bg-amber-50 text-amber-700 border-amber-200",
  resolved: "bg-emerald-50 text-emerald-700 border-emerald-200",
  matched: "bg-emerald-50 text-emerald-700 border-emerald-200",
};

export default function BillingReconciliationPage() {
  const [selectedOrg, setSelectedOrg] = useState(null);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [successMsg, setSuccessMsg] = useState(null);

  // Reconciliation Cases State
  const [cases, setCases] = useState([]);
  const [casesLoading, setCasesLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("all"); // all, open, resolved
  const [selectedCase, setSelectedCase] = useState(null);
  const [resolvingCase, setResolvingCase] = useState(null);
  const [resolveNotes, setResolveNotes] = useState("");
  const [resolveSubmitting, setResolveSubmitting] = useState(false);

  const loadCases = useCallback(async () => {
    setCasesLoading(true);
    try {
      const params = {};
      if (statusFilter !== "all") params.status = statusFilter;
      const data = await billingService.listReconciliationCases(params);
      setCases(data && Array.isArray(data.list) ? data.list : []);
    } catch (e) {
      console.error("Failed to load reconciliation cases:", e);
    } finally {
      setCasesLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    loadCases();
  }, [loadCases]);

  const handleRun = async () => {
    if (!selectedOrg) return;
    setRunning(true);
    setError(null);
    setResult(null);
    try {
      const data = await billingService.reconcileSubscription(selectedOrg.id);
      setResult(data);
      if (data.status === "open") {
        setSuccessMsg(`Reconciliation case #${data.id} opened for ${selectedOrg.name || `Org #${selectedOrg.id}`}`);
      } else {
        setSuccessMsg(`Subscription state matches Stripe cleanly for ${selectedOrg.name || `Org #${selectedOrg.id}`}`);
      }
      await loadCases();
    } catch (e) {
      setError(e.message || "Reconciliation failed");
    } finally {
      setRunning(false);
    }
  };

  const handleResolveCase = async (e) => {
    e.preventDefault();
    if (!resolvingCase) return;
    setResolveSubmitting(true);
    setError(null);
    try {
      await billingService.resolveReconciliationCase(resolvingCase.id, { notes: resolveNotes });
      setSuccessMsg(`Reconciliation case #${resolvingCase.id} resolved.`);
      setResolvingCase(null);
      setResolveNotes("");
      if (selectedCase && selectedCase.id === resolvingCase.id) {
        setSelectedCase(null);
      }
      await loadCases();
    } catch (err) {
      setError(err.message || "Failed to resolve reconciliation case");
    } finally {
      setResolveSubmitting(false);
    }
  };

  return (
    <div className="space-y-6 font-sans">
      <PageHeader
        title="Provider Reconciliation"
        description="Run live subscription audits against Stripe and manage billing discrepancy cases across all platform organizations."
      />

      {error && (
        <div className="rounded-3xl border border-red-200 bg-red-50 p-4 text-red-700 text-sm flex items-center gap-3">
          <AlertTriangle className="h-5 w-5 shrink-0" />
          <span>{error}</span>
          <button onClick={() => setError(null)} className="ml-auto text-red-600 underline text-xs font-semibold">Dismiss</button>
        </div>
      )}

      {successMsg && (
        <div className="rounded-3xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-800 text-sm flex items-center gap-3">
          <CheckCircle className="h-5 w-5 shrink-0 text-emerald-600" />
          <span>{successMsg}</span>
          <button onClick={() => setSuccessMsg(null)} className="ml-auto text-emerald-700 underline text-xs font-semibold">Dismiss</button>
        </div>
      )}

      {/* Live Check Card */}
      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-[0_4px_20px_rgba(0,0,0,0.02)] space-y-4">
        <div className="flex items-center gap-2 text-slate-800 font-bold text-base">
          <PlayCircle className="h-5 w-5 text-[#3B82F6]" /> Live Organization Reconciliation Check
        </div>
        <p className="text-xs text-slate-500">
          Select an organization to re-fetch its live Stripe subscription state, compare against local database records, and log discrepancy cases if mismatched.
        </p>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between pt-2">
          <OrgPicker selectedOrg={selectedOrg} onSelect={(org) => { setSelectedOrg(org); setResult(null); }} placeholder="Search organizations by name or code..." />
          <button
            onClick={handleRun}
            disabled={!selectedOrg || running}
            className="flex items-center gap-2 rounded-full bg-[#3B82F6] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#2563EB] disabled:opacity-50 shrink-0 shadow-sm"
          >
            <PlayCircle className="h-4 w-4" /> {running ? "Checking..." : "Run Reconciliation"}
          </button>
        </div>
      </div>

      {/* Live Result Display */}
      {result && (
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-[0_4px_20px_rgba(0,0,0,0.02)] space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <h3 className="text-base font-bold text-slate-800 flex items-center gap-2">
              <Scale className="h-5 w-5 text-[#3B82F6]" /> Reconciliation Check Result
            </h3>
            <span className={`inline-flex items-center rounded-full border px-3 py-0.5 text-xs font-semibold ${STATUS_TONES[result.status] || "bg-slate-100 text-slate-600 border-slate-200"}`}>
              {result.status}
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
            <div>
              <span className="block text-slate-400">Case ID</span>
              <span className="font-semibold text-slate-700">{result.id ? `#${result.id}` : "—"}</span>
            </div>
            <div>
              <span className="block text-slate-400">Reason</span>
              <span className="font-semibold text-slate-700">{result.reason}</span>
            </div>
            <div>
              <span className="block text-slate-400">Opened By</span>
              <span className="font-semibold text-slate-700">{result.opened_by || "—"}</span>
            </div>
            <div>
              <span className="block text-slate-400">Created At</span>
              <span className="font-semibold text-slate-700">{result.created_at ? new Date(result.created_at).toLocaleString() : "Just now"}</span>
            </div>
          </div>

          {result.notes && (
            <div className="bg-slate-50 rounded-2xl p-3 text-xs text-slate-600">
              <span className="font-semibold block text-slate-500 mb-1">Notes / Discrepancies:</span>
              <p>{result.notes}</p>
            </div>
          )}
        </div>
      )}

      {/* Platform Reconciliation Cases Log Table */}
      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-[0_4px_24px_rgba(0,0,0,0.03)] space-y-4">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between border-b border-slate-100 pb-4">
          <div className="flex items-center gap-3">
            <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
              <Scale className="h-5 w-5 text-[#3B82F6]" /> Platform Discrepancy Cases ({cases.length})
            </h3>
            <button
              onClick={loadCases}
              disabled={casesLoading}
              className="p-1.5 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 transition-colors disabled:opacity-50"
              title="Refresh"
            >
              <RefreshCw className={`h-4 w-4 ${casesLoading ? "animate-spin" : ""}`} />
            </button>
          </div>

          {/* Status Filter Tabs */}
          <div className="inline-flex rounded-xl bg-slate-100 p-1 text-xs font-semibold text-slate-600 self-start md:self-auto">
            <button
              onClick={() => setStatusFilter("all")}
              className={`px-3 py-1.5 rounded-lg transition-all ${statusFilter === "all" ? "bg-white text-slate-900 shadow-sm" : "hover:text-slate-900"}`}
            >
              All
            </button>
            <button
              onClick={() => setStatusFilter("open")}
              className={`px-3 py-1.5 rounded-lg transition-all ${statusFilter === "open" ? "bg-white text-amber-700 shadow-sm" : "hover:text-slate-900"}`}
            >
              Open
            </button>
            <button
              onClick={() => setStatusFilter("resolved")}
              className={`px-3 py-1.5 rounded-lg transition-all ${statusFilter === "resolved" ? "bg-white text-emerald-700 shadow-sm" : "hover:text-slate-900"}`}
            >
              Resolved
            </button>
          </div>
        </div>

        {casesLoading && cases.length === 0 ? (
          <div className="text-center py-12 text-slate-400">Loading reconciliation cases...</div>
        ) : cases.length === 0 ? (
          <div className="text-center py-12 text-slate-400">
            <Scale className="h-10 w-10 mx-auto mb-3 opacity-40" />
            No reconciliation cases found
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-100 text-xs font-semibold uppercase tracking-wider text-slate-500">
                  <th className="py-3 px-4">Case ID</th>
                  <th className="py-3 px-4">Organization</th>
                  <th className="py-3 px-4">Reason</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Created At</th>
                  <th className="py-3 px-4">Resolution</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {cases.map((c) => (
                  <tr key={c.id} className="text-sm hover:bg-slate-50/50 transition-colors">
                    <td className="py-4 px-4 font-mono text-xs font-bold text-slate-700">#{c.id}</td>
                    <td className="py-4 px-4 font-semibold text-slate-800">
                      {c.organization_name || `Org #${c.organization_id}`}
                    </td>
                    <td className="py-4 px-4 text-xs font-medium text-slate-600">
                      <span className="capitalize">{c.reason.replace(/_/g, " ")}</span>
                    </td>
                    <td className="py-4 px-4">
                      <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${STATUS_TONES[c.status] || "bg-slate-100 text-slate-600 border-slate-200"}`}>
                        {c.status}
                      </span>
                    </td>
                    <td className="py-4 px-4 text-xs text-slate-500">
                      {c.created_at ? new Date(c.created_at).toLocaleString() : "—"}
                    </td>
                    <td className="py-4 px-4 text-xs text-slate-500">
                      {c.status === "resolved" ? (
                        <div>
                          <span className="font-semibold text-emerald-700">{c.resolved_by || "Resolved"}</span>
                          <p className="text-[11px] text-slate-400">{c.resolved_at ? new Date(c.resolved_at).toLocaleDateString() : ""}</p>
                        </div>
                      ) : (
                        <span className="text-amber-600 font-medium">Pending Review</span>
                      )}
                    </td>
                    <td className="py-4 px-4 text-right space-x-2">
                      <button
                        onClick={() => setSelectedCase(c)}
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
                      >
                        <Eye size={13} /> Inspect
                      </button>
                      {c.status === "open" && (
                        <button
                          onClick={() => { setResolvingCase(c); setResolveNotes(""); }}
                          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-emerald-200 bg-emerald-50 text-xs font-semibold text-emerald-700 hover:bg-emerald-100 transition-colors"
                        >
                          <Check size={13} /> Resolve
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Inspect Case Modal */}
      {selectedCase && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-3xl max-w-4xl w-full p-6 shadow-2xl space-y-4 max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <div>
                <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <Scale className="h-5 w-5 text-[#3B82F6]" /> Discrepancy Snapshots — Case #{selectedCase.id}
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">{selectedCase.organization_name || `Org #${selectedCase.organization_id}`}</p>
              </div>
              <button
                onClick={() => setSelectedCase(null)}
                className="p-1 rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-4 text-xs bg-slate-50 p-3 rounded-2xl">
              <div>
                <span className="text-slate-400 block">Reason</span>
                <span className="font-semibold text-slate-800 capitalize">{selectedCase.reason.replace(/_/g, " ")}</span>
              </div>
              <div>
                <span className="text-slate-400 block">Opened By</span>
                <span className="font-semibold text-slate-800">{selectedCase.opened_by || "—"}</span>
              </div>
            </div>

            {selectedCase.notes && (
              <div className="text-xs text-slate-600 bg-amber-50 border border-amber-200 rounded-2xl p-3">
                <span className="font-bold text-amber-800 block mb-1">Audit Notes:</span>
                {selectedCase.notes}
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 flex-1 overflow-y-auto min-h-[220px]">
              <div>
                <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">Local DB Snapshot</h4>
                <pre className="rounded-2xl bg-slate-900 text-slate-200 p-4 text-xs font-mono overflow-x-auto whitespace-pre-wrap">
                  {selectedCase.local_snapshot ? JSON.stringify(selectedCase.local_snapshot, null, 2) : "—"}
                </pre>
              </div>
              <div>
                <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">Stripe Subscription Snapshot</h4>
                <pre className="rounded-2xl bg-slate-900 text-slate-200 p-4 text-xs font-mono overflow-x-auto whitespace-pre-wrap">
                  {selectedCase.stripe_snapshot ? JSON.stringify(selectedCase.stripe_snapshot, null, 2) : "—"}
                </pre>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
              <button
                onClick={() => setSelectedCase(null)}
                className="px-4 py-2 text-xs font-semibold rounded-full border border-slate-200 text-slate-600 hover:bg-slate-50"
              >
                Close
              </button>
              {selectedCase.status === "open" && (
                <button
                  onClick={() => {
                    const c = selectedCase;
                    setSelectedCase(null);
                    setResolvingCase(c);
                    setResolveNotes("");
                  }}
                  className="flex items-center gap-1.5 px-5 py-2 text-xs font-semibold rounded-full bg-emerald-600 text-white hover:bg-emerald-700"
                >
                  <Check size={14} /> Resolve Case
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Resolve Case Modal */}
      {resolvingCase && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4">
          <form onSubmit={handleResolveCase} className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-base font-bold text-slate-900">Resolve Case #{resolvingCase.id}</h3>
              <button
                type="button"
                onClick={() => setResolvingCase(null)}
                className="p-1 rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            <p className="text-xs text-slate-500">
              Mark this reconciliation case as resolved. Add resolution notes explaining actions taken (e.g. Stripe sync updated, manual invoice adjustment).
            </p>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Resolution Notes</label>
              <textarea
                rows={3}
                placeholder="e.g. Manually aligned seat quantities with Stripe customer portal..."
                value={resolveNotes}
                onChange={(e) => setResolveNotes(e.target.value)}
                className="w-full text-xs rounded-xl border border-slate-200 p-3 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setResolvingCase(null)}
                className="px-4 py-2 text-xs font-semibold rounded-full border border-slate-200 text-slate-600 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={resolveSubmitting}
                className="flex items-center gap-1.5 px-5 py-2 text-xs font-semibold rounded-full bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50"
              >
                <Check size={14} /> {resolveSubmitting ? "Resolving..." : "Confirm Resolve"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
