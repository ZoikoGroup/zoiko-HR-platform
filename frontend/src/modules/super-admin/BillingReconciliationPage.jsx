import { useState, useCallback, useEffect, useMemo } from "react";
import {
  Scale, AlertTriangle, PlayCircle, CheckCircle2, RefreshCw, Eye, Check, X,
  ShieldCheck, XCircle, FileSearch,
} from "lucide-react";
import PageHeader from "../../components/PageHeader";
import OrgPicker from "../../components/OrgPicker";
import { billingService } from "../../service/billingService";

const BLUE = "#3B82F6";
const BLUE_DEEP = "#2563EB";
const BLUE_100 = "#DBEAFE";
const BLUE_50 = "#EFF6FF";
const EMERALD = "#10B981";
const EMERALD_100 = "#D1FAE5";
const AMBER = "#F59E0B";
const AMBER_100 = "#FEF3C7";
const RED = "#EF4444";
const RED_100 = "#FEE2E2";
const SLATE = "#64748B";
const SLATE_100 = "#F1F5F9";
const INK = "#0A1128";
const INK_SOFT = "#475569";
const LINE = "#E4EAF5";

const STATUS_META = {
  open: { label: "Open", color: AMBER, bg: AMBER_100, Icon: AlertTriangle },
  investigating: { label: "Investigating", color: BLUE_DEEP, bg: BLUE_100, Icon: FileSearch },
  resolved: { label: "Resolved", color: EMERALD, bg: EMERALD_100, Icon: CheckCircle2 },
  dismissed: { label: "Dismissed", color: SLATE, bg: SLATE_100, Icon: XCircle },
  matched: { label: "Matched", color: EMERALD, bg: EMERALD_100, Icon: CheckCircle2 },
};

function statusMeta(status) {
  return STATUS_META[status] || { label: status, color: SLATE, bg: SLATE_100, Icon: Scale };
}

function StatTile({ icon: Icon, color, bg, label, value }) {
  return (
    <div className="rounded-2xl border bg-white p-4 shadow-[0_1px_2px_rgba(10,17,40,0.04),0_8px_24px_-12px_rgba(37,99,235,0.10)]" style={{ borderColor: LINE }}>
      <div className="flex items-center gap-2.5 mb-2">
        <div className="w-8 h-8 rounded-[9px] flex items-center justify-center" style={{ background: bg }}>
          <Icon className="w-4 h-4" strokeWidth={2.5} style={{ color }} />
        </div>
        <span className="text-[11.5px] font-semibold" style={{ color: INK_SOFT }}>{label}</span>
      </div>
      <p className="text-[22px] font-bold tracking-[-0.01em]" style={{ color: INK }}>{value}</p>
    </div>
  );
}

function StatusBadge({ status }) {
  const meta = statusMeta(status);
  const Icon = meta.Icon;
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-bold"
      style={{ background: meta.bg, color: meta.color, borderColor: "transparent" }}
    >
      <Icon className="w-3 h-3" strokeWidth={3} />
      {meta.label}
    </span>
  );
}

export default function BillingReconciliationPage() {
  const [selectedOrg, setSelectedOrg] = useState(null);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [successMsg, setSuccessMsg] = useState(null);

  const [cases, setCases] = useState([]);
  const [casesLoading, setCasesLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("all");
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

  const counts = useMemo(() => {
    const c = { open: 0, investigating: 0, resolved: 0, dismissed: 0 };
    for (const item of cases) {
      if (c[item.status] !== undefined) c[item.status] += 1;
    }
    return c;
  }, [cases]);

  const notify = (message, type = "error") => {
    if (type === "error") setError(message);
    else setSuccessMsg(message);
    setTimeout(() => (type === "error" ? setError(null) : setSuccessMsg(null)), 5000);
  };

  const handleRun = async () => {
    if (!selectedOrg) return;
    setRunning(true);
    setError(null);
    setResult(null);
    try {
      const data = await billingService.reconcileSubscription(selectedOrg.id);
      setResult(data);
      if (data.status === "open") {
        notify(`Reconciliation case #${data.id} opened for ${selectedOrg.name || `Org #${selectedOrg.id}`}`, "success");
      } else {
        notify(`Subscription state matches Stripe cleanly for ${selectedOrg.name || `Org #${selectedOrg.id}`}`, "success");
      }
      await loadCases();
    } catch (e) {
      notify(e.message || "Reconciliation failed", "error");
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
      notify(`Reconciliation case #${resolvingCase.id} resolved.`, "success");
      setResolvingCase(null);
      setResolveNotes("");
      if (selectedCase && selectedCase.id === resolvingCase.id) setSelectedCase(null);
      await loadCases();
    } catch (err) {
      notify(err.message || "Failed to resolve reconciliation case", "error");
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
        <div className="flex items-center gap-3 rounded-2xl border p-4 text-sm" style={{ borderColor: "#FECACA", background: RED_100, color: "#991B1B" }}>
          <AlertTriangle className="h-5 w-5 shrink-0" />
          <span>{error}</span>
          <button onClick={() => setError(null)} className="ml-auto text-xs font-bold underline cursor-pointer" style={{ color: "#991B1B" }}>Dismiss</button>
        </div>
      )}
      {successMsg && (
        <div className="flex items-center gap-3 rounded-2xl border p-4 text-sm" style={{ borderColor: "#A7F3D0", background: EMERALD_100, color: "#065F46" }}>
          <CheckCircle2 className="h-5 w-5 shrink-0" />
          <span>{successMsg}</span>
          <button onClick={() => setSuccessMsg(null)} className="ml-auto text-xs font-bold underline cursor-pointer" style={{ color: "#065F46" }}>Dismiss</button>
        </div>
      )}

      {/* Summary stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatTile icon={AlertTriangle} color={AMBER} bg={AMBER_100} label="Open" value={counts.open} />
        <StatTile icon={FileSearch} color={BLUE_DEEP} bg={BLUE_100} label="Investigating" value={counts.investigating} />
        <StatTile icon={CheckCircle2} color={EMERALD} bg={EMERALD_100} label="Resolved" value={counts.resolved} />
        <StatTile icon={XCircle} color={SLATE} bg={SLATE_100} label="Dismissed" value={counts.dismissed} />
      </div>

      {/* Live Check Card */}
      <div
        className="rounded-[20px] p-6 space-y-4"
        style={{
          background: `linear-gradient(135deg, ${BLUE_50} 0%, #FFFFFF 55%)`,
          border: `1px solid ${LINE}`,
          boxShadow: "0 1px 2px rgba(10,17,40,0.04), 0 12px 32px -16px rgba(37,99,235,0.18)",
        }}
      >
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-[11px] flex items-center justify-center" style={{ background: BLUE_100 }}>
            <PlayCircle className="h-4.5 w-4.5" style={{ color: BLUE_DEEP }} />
          </div>
          <div>
            <p className="text-[15px] font-bold" style={{ color: INK }}>Live Organization Reconciliation Check</p>
            <p className="text-[12px]" style={{ color: INK_SOFT }}>
              Select an organization to re-fetch its live Stripe subscription state and compare it against local records.
            </p>
          </div>
        </div>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between pt-1">
          <OrgPicker selectedOrg={selectedOrg} onSelect={(org) => { setSelectedOrg(org); setResult(null); }} placeholder="Search organizations by name or code..." />
          <button
            onClick={handleRun}
            disabled={!selectedOrg || running}
            className="flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50 shrink-0 cursor-pointer transition-all shadow-sm hover:shadow-md"
            style={{ background: `linear-gradient(135deg, ${BLUE} 0%, ${BLUE_DEEP} 100%)` }}
          >
            <PlayCircle className="h-4 w-4" /> {running ? "Checking..." : "Run Reconciliation"}
          </button>
        </div>
      </div>

      {/* Live Result Display */}
      {result && (
        <div className="rounded-[20px] border bg-white p-6 shadow-[0_1px_2px_rgba(10,17,40,0.04),0_8px_24px_-12px_rgba(37,99,235,0.10)] space-y-4" style={{ borderColor: LINE }}>
          <div className="flex items-center justify-between border-b pb-3" style={{ borderColor: LINE }}>
            <h3 className="text-[15px] font-bold flex items-center gap-2" style={{ color: INK }}>
              <Scale className="h-4.5 w-4.5" style={{ color: BLUE_DEEP }} /> Reconciliation Check Result
            </h3>
            <StatusBadge status={result.status} />
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-[12.5px]">
            <div>
              <span className="block" style={{ color: "#94A3B8" }}>Case ID</span>
              <span className="font-semibold" style={{ color: INK }}>{result.id ? `#${result.id}` : "—"}</span>
            </div>
            <div>
              <span className="block" style={{ color: "#94A3B8" }}>Reason</span>
              <span className="font-semibold capitalize" style={{ color: INK }}>{(result.reason || "—").replace(/_/g, " ")}</span>
            </div>
            <div>
              <span className="block" style={{ color: "#94A3B8" }}>Opened By</span>
              <span className="font-semibold" style={{ color: INK }}>{result.opened_by || "—"}</span>
            </div>
            <div>
              <span className="block" style={{ color: "#94A3B8" }}>Created At</span>
              <span className="font-semibold" style={{ color: INK }}>{result.created_at ? new Date(result.created_at).toLocaleString() : "Just now"}</span>
            </div>
          </div>

          {result.notes && (
            <div className="rounded-[14px] p-3 text-[12.5px]" style={{ background: SLATE_100, color: INK_SOFT }}>
              <span className="font-semibold block mb-1" style={{ color: "#94A3B8" }}>Notes / Discrepancies:</span>
              <p>{result.notes}</p>
            </div>
          )}
        </div>
      )}

      {/* Platform Reconciliation Cases Log Table */}
      <div className="rounded-[20px] border bg-white p-6 shadow-[0_1px_2px_rgba(10,17,40,0.04),0_8px_24px_-12px_rgba(37,99,235,0.10)] space-y-4" style={{ borderColor: LINE }}>
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between border-b pb-4" style={{ borderColor: LINE }}>
          <div className="flex items-center gap-3">
            <h3 className="text-[16px] font-bold flex items-center gap-2" style={{ color: INK }}>
              <Scale className="h-4.5 w-4.5" style={{ color: BLUE_DEEP }} /> Platform Discrepancy Cases ({cases.length})
            </h3>
            <button
              onClick={loadCases}
              disabled={casesLoading}
              className="p-1.5 rounded-lg border transition-colors disabled:opacity-50 cursor-pointer"
              style={{ borderColor: LINE, color: INK_SOFT }}
              title="Refresh"
            >
              <RefreshCw className={`h-4 w-4 ${casesLoading ? "animate-spin" : ""}`} />
            </button>
          </div>

          <div className="inline-flex rounded-xl p-1 text-xs font-semibold self-start md:self-auto" style={{ background: SLATE_100, color: INK_SOFT }}>
            {["all", "open", "resolved"].map((s) => (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className="px-3 py-1.5 rounded-lg transition-all capitalize cursor-pointer"
                style={
                  statusFilter === s
                    ? { background: "#FFFFFF", color: BLUE_DEEP, boxShadow: "0 1px 2px rgba(10,17,40,0.08)" }
                    : {}
                }
              >
                {s}
              </button>
            ))}
          </div>
        </div>

        {casesLoading && cases.length === 0 ? (
          <div className="text-center py-14 text-[13px]" style={{ color: "#94A3B8" }}>Loading reconciliation cases...</div>
        ) : cases.length === 0 ? (
          <div className="text-center py-14" style={{ color: "#94A3B8" }}>
            <div className="w-14 h-14 rounded-2xl mx-auto mb-3 flex items-center justify-center" style={{ background: BLUE_50 }}>
              <ShieldCheck className="h-7 w-7" style={{ color: BLUE }} />
            </div>
            <p className="text-[13px] font-semibold" style={{ color: INK_SOFT }}>No reconciliation cases found</p>
            <p className="text-[12px] mt-0.5">Run a check above to audit an organization's billing state.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="text-[11px] font-bold uppercase tracking-wider" style={{ color: "#94A3B8" }}>
                  <th className="py-3 px-4">Case ID</th>
                  <th className="py-3 px-4">Organization</th>
                  <th className="py-3 px-4">Reason</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Created At</th>
                  <th className="py-3 px-4">Resolution</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {cases.map((c) => (
                  <tr key={c.id} className="text-[13px] transition-colors" style={{ borderTop: `1px solid ${LINE}` }}>
                    <td className="py-4 px-4 font-mono text-[11.5px] font-bold" style={{ color: INK_SOFT }}>#{c.id}</td>
                    <td className="py-4 px-4 font-semibold" style={{ color: INK }}>
                      {c.organization_name || `Org #${c.organization_id}`}
                    </td>
                    <td className="py-4 px-4 text-[12px] font-medium capitalize" style={{ color: INK_SOFT }}>
                      {c.reason.replace(/_/g, " ")}
                    </td>
                    <td className="py-4 px-4"><StatusBadge status={c.status} /></td>
                    <td className="py-4 px-4 text-[12px]" style={{ color: "#94A3B8" }}>
                      {c.created_at ? new Date(c.created_at).toLocaleString() : "—"}
                    </td>
                    <td className="py-4 px-4 text-[12px]">
                      {c.status === "resolved" ? (
                        <div>
                          <span className="font-semibold" style={{ color: EMERALD }}>{c.resolved_by || "Resolved"}</span>
                          <p className="text-[11px]" style={{ color: "#94A3B8" }}>{c.resolved_at ? new Date(c.resolved_at).toLocaleDateString() : ""}</p>
                        </div>
                      ) : (
                        <span className="font-medium" style={{ color: AMBER }}>Pending Review</span>
                      )}
                    </td>
                    <td className="py-4 px-4 text-right space-x-2 whitespace-nowrap">
                      <button
                        onClick={() => setSelectedCase(c)}
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border text-xs font-semibold cursor-pointer transition-colors"
                        style={{ borderColor: LINE, color: INK_SOFT }}
                      >
                        <Eye size={13} /> Inspect
                      </button>
                      {c.status === "open" && (
                        <button
                          onClick={() => { setResolvingCase(c); setResolveNotes(""); }}
                          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer transition-colors"
                          style={{ background: EMERALD_100, color: "#047857" }}
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0A1128]/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-[24px] max-w-4xl w-full p-6 shadow-2xl space-y-4 max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between border-b pb-4" style={{ borderColor: LINE }}>
              <div>
                <h3 className="text-[15px] font-bold flex items-center gap-2" style={{ color: INK }}>
                  <Scale className="h-4.5 w-4.5" style={{ color: BLUE_DEEP }} /> Discrepancy Snapshots — Case #{selectedCase.id}
                </h3>
                <p className="text-[12px] mt-0.5" style={{ color: INK_SOFT }}>{selectedCase.organization_name || `Org #${selectedCase.organization_id}`}</p>
              </div>
              <button
                onClick={() => setSelectedCase(null)}
                className="p-1 rounded-full transition-colors cursor-pointer"
                style={{ color: "#94A3B8" }}
              >
                <X size={20} />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-4 text-[12px] p-3 rounded-2xl" style={{ background: BLUE_50 }}>
              <div>
                <span className="block" style={{ color: "#94A3B8" }}>Reason</span>
                <span className="font-semibold capitalize" style={{ color: INK }}>{selectedCase.reason.replace(/_/g, " ")}</span>
              </div>
              <div>
                <span className="block" style={{ color: "#94A3B8" }}>Opened By</span>
                <span className="font-semibold" style={{ color: INK }}>{selectedCase.opened_by || "—"}</span>
              </div>
            </div>

            {selectedCase.notes && (
              <div className="text-[12px] rounded-2xl p-3" style={{ background: AMBER_100, color: "#92400E", border: "1px solid #FDE68A" }}>
                <span className="font-bold block mb-1">Audit Notes:</span>
                {selectedCase.notes}
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 flex-1 overflow-y-auto min-h-[220px]">
              <div>
                <h4 className="text-[11px] font-bold uppercase tracking-wider mb-2" style={{ color: "#94A3B8" }}>Local DB Snapshot</h4>
                <pre className="rounded-2xl p-4 text-xs font-mono overflow-x-auto whitespace-pre-wrap" style={{ background: INK, color: "#CBD5E1" }}>
                  {selectedCase.local_snapshot ? JSON.stringify(selectedCase.local_snapshot, null, 2) : "—"}
                </pre>
              </div>
              <div>
                <h4 className="text-[11px] font-bold uppercase tracking-wider mb-2" style={{ color: "#94A3B8" }}>Stripe Subscription Snapshot</h4>
                <pre className="rounded-2xl p-4 text-xs font-mono overflow-x-auto whitespace-pre-wrap" style={{ background: INK, color: "#CBD5E1" }}>
                  {selectedCase.stripe_snapshot ? JSON.stringify(selectedCase.stripe_snapshot, null, 2) : "—"}
                </pre>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-3 border-t" style={{ borderColor: LINE }}>
              <button
                onClick={() => setSelectedCase(null)}
                className="px-4 py-2 text-xs font-semibold rounded-full border cursor-pointer"
                style={{ borderColor: LINE, color: INK_SOFT }}
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
                  className="flex items-center gap-1.5 px-5 py-2 text-xs font-semibold rounded-full text-white cursor-pointer"
                  style={{ background: `linear-gradient(135deg, ${EMERALD} 0%, #059669 100%)` }}
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0A1128]/50 backdrop-blur-sm p-4">
          <form onSubmit={handleResolveCase} className="bg-white rounded-[24px] max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b pb-3" style={{ borderColor: LINE }}>
              <h3 className="text-[15px] font-bold" style={{ color: INK }}>Resolve Case #{resolvingCase.id}</h3>
              <button
                type="button"
                onClick={() => setResolvingCase(null)}
                className="p-1 rounded-full transition-colors cursor-pointer"
                style={{ color: "#94A3B8" }}
              >
                <X size={18} />
              </button>
            </div>

            <p className="text-[12.5px]" style={{ color: INK_SOFT }}>
              Mark this reconciliation case as resolved. Add resolution notes explaining actions taken (e.g. Stripe sync updated, manual invoice adjustment).
            </p>

            <div>
              <label className="block text-xs font-semibold mb-1" style={{ color: INK }}>Resolution Notes</label>
              <textarea
                rows={3}
                placeholder="e.g. Manually aligned seat quantities with Stripe customer portal..."
                value={resolveNotes}
                onChange={(e) => setResolveNotes(e.target.value)}
                className="w-full text-xs rounded-xl border p-3 outline-none focus:ring-2"
                style={{ borderColor: LINE }}
                onFocus={(e) => (e.target.style.boxShadow = `0 0 0 2px ${BLUE}33`)}
                onBlur={(e) => (e.target.style.boxShadow = "none")}
              />
            </div>

            <div className="flex items-center justify-end gap-3 pt-3 border-t" style={{ borderColor: LINE }}>
              <button
                type="button"
                onClick={() => setResolvingCase(null)}
                className="px-4 py-2 text-xs font-semibold rounded-full border cursor-pointer"
                style={{ borderColor: LINE, color: INK_SOFT }}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={resolveSubmitting}
                className="flex items-center gap-1.5 px-5 py-2 text-xs font-semibold rounded-full text-white disabled:opacity-50 cursor-pointer"
                style={{ background: `linear-gradient(135deg, ${EMERALD} 0%, #059669 100%)` }}
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
