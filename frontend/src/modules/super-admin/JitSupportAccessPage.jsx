import { useState, useCallback, useEffect } from "react";
import { ShieldCheck, AlertTriangle, KeyRound, RefreshCw, Radio } from "lucide-react";
import PageHeader from "../../components/PageHeader";
import { supportAccessService } from "../../service/supportAccessService";
import { formatDateTime } from "../../utils/dateTime";

const SEVERITY_STYLE = {
  critical: "border-red-300 bg-red-50 text-red-700",
  high: "border-orange-200 bg-orange-50 text-orange-700",
  medium: "border-amber-200 bg-amber-50 text-amber-700",
  low: "border-slate-200 bg-slate-50 text-slate-600",
};

// The platform view of Prompt 2: the live just-in-time grants, what needs a human now, and the emergency stop.
// It only ever shows grant METADATA and the SHAPE of a scope - never a tenant field value.
export default function JitSupportAccessPage() {
  const [grants, setGrants] = useState([]);
  const [detections, setDetections] = useState([]);
  const [revocations, setRevocations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [killModal, setKillModal] = useState(false);
  const [killForm, setKillForm] = useState({ scope: "GLOBAL", target: "", reason: "" });
  const [notice, setNotice] = useState(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [g, d, r] = await Promise.all([
        supportAccessService.grants().catch(() => []),
        supportAccessService.detections().catch(() => []),
        supportAccessService.revocations().catch(() => []),
      ]);
      setGrants(Array.isArray(g) ? g : []);
      setDetections(Array.isArray(d) ? d : []);
      setRevocations(Array.isArray(r) ? r : []);
    } catch (e) {
      setError(e.message || "Failed to load support access");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const handleRevoke = async (grantId) => {
    setBusy(true);
    try {
      await supportAccessService.revokeGrant(grantId, "revoked by platform operator");
      setNotice(`Grant ${grantId} revoked. The capability is refused from the next request.`);
      loadData();
    } catch (e) {
      setError(e.message || "Failed to revoke");
    } finally {
      setBusy(false);
    }
  };

  const handleKill = async () => {
    if (!killForm.reason.trim()) return;
    if (killForm.scope !== "GLOBAL" && !String(killForm.target).trim()) return;
    setBusy(true);
    try {
      const res = await supportAccessService.killSwitch({
        scope: killForm.scope,
        target: killForm.scope === "GLOBAL" ? null : String(killForm.target).trim(),
        reason: killForm.reason,
      });
      setNotice(`Kill switch (${res.scope}) revoked ${res.revoked} live grant(s).`);
      setKillModal(false);
      setKillForm({ scope: "GLOBAL", target: "", reason: "" });
      loadData();
    } catch (e) {
      setError(e.message || "Failed to run the kill switch");
    } finally {
      setBusy(false);
    }
  };

  const isActive = (g) => g.status === "ACTIVE";

  return (
    <div className="space-y-6 font-sans">
      <PageHeader
        title="Just-in-time support access"
        description="Live platform capabilities, the emergency stop, and everything that needs a human now."
        action={
          <div className="flex items-center gap-2">
            <button
              onClick={loadData}
              className="flex items-center gap-2 rounded-full border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50"
            >
              <RefreshCw className="h-4 w-4" /> Refresh
            </button>
            <button
              onClick={() => setKillModal(true)}
              className="flex items-center gap-2 rounded-full bg-red-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-red-700"
            >
              <Radio className="h-4 w-4" /> Kill switch
            </button>
          </div>
        }
      />

      {error && (
        <div className="rounded-3xl border border-red-200 bg-red-50 p-4 text-red-700 text-sm flex items-center gap-3">
          <AlertTriangle className="h-5 w-5 shrink-0" />
          <span>{error}</span>
          <button onClick={() => setError(null)} className="ml-auto text-red-600 underline text-xs font-semibold">Dismiss</button>
        </div>
      )}
      {notice && (
        <div className="rounded-3xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-700 text-sm flex items-center gap-3">
          <ShieldCheck className="h-5 w-5 shrink-0" />
          <span>{notice}</span>
          <button onClick={() => setNotice(null)} className="ml-auto text-emerald-700 underline text-xs font-semibold">Dismiss</button>
        </div>
      )}

      {/* Detections */}
      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-[0_4px_20px_rgba(0,0,0,0.02)]">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-500 mb-4">Needs attention now</h3>
        {loading ? (
          <div className="text-center py-8 text-slate-400">Loading...</div>
        ) : detections.length === 0 ? (
          <div className="text-center py-8 text-slate-400 flex flex-col items-center gap-2">
            <ShieldCheck className="h-8 w-8 opacity-40" /> Nothing flagged
          </div>
        ) : (
          <ul className="space-y-2">
            {detections.map((f, i) => (
              <li key={i} className={`flex items-center gap-3 rounded-2xl border p-3 text-sm ${SEVERITY_STYLE[f.severity] || SEVERITY_STYLE.low}`}>
                <span className="text-xs font-bold uppercase tracking-wider">{f.severity}</span>
                <span className="font-semibold">{f.kind}</span>
                <span className="text-slate-600">{f.summary}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Live grants */}
      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-[0_4px_20px_rgba(0,0,0,0.02)]">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-500 mb-4">Live capabilities</h3>
        {loading ? (
          <div className="text-center py-8 text-slate-400">Loading...</div>
        ) : grants.length === 0 ? (
          <div className="text-center py-8 text-slate-400 flex flex-col items-center gap-2">
            <KeyRound className="h-8 w-8 opacity-40" /> No live capabilities
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-100 text-xs font-semibold uppercase tracking-wider text-slate-500">
                  <th className="py-3 px-4">Tenant</th>
                  <th className="py-3 px-4">Kind</th>
                  <th className="py-3 px-4">Scope</th>
                  <th className="py-3 px-4">Issued</th>
                  <th className="py-3 px-4">Expires</th>
                  <th className="py-3 px-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {grants.map((g) => (
                  <tr key={g.id} className="text-sm hover:bg-slate-50/50">
                    <td className="py-4 px-4 font-semibold text-slate-700">#{g.tenant_id}</td>
                    <td className="py-4 px-4 text-slate-600">{g.kind}</td>
                    <td className="py-4 px-4 text-slate-600">
                      {g.scope ? `${(g.scope.resources || []).join(", ")} · ${g.scope.record_count ?? 0} rec · ${(g.scope.actions || []).join("/")}` : "—"}
                    </td>
                    <td className="py-4 px-4 text-xs text-slate-400">{g.issued_at ? formatDateTime(g.issued_at) : "—"}</td>
                    <td className="py-4 px-4 text-xs text-slate-400">{g.expires_at ? formatDateTime(g.expires_at) : "—"}</td>
                    <td className="py-4 px-4 text-right">
                      {isActive(g) && (
                        <button
                          onClick={() => handleRevoke(g.id)}
                          disabled={busy}
                          className="text-xs font-semibold text-red-600 hover:underline disabled:opacity-50"
                        >
                          Revoke
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

      {/* Revocations */}
      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-[0_4px_20px_rgba(0,0,0,0.02)]">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-500 mb-4">Revocations</h3>
        {revocations.length === 0 ? (
          <div className="text-center py-6 text-slate-400">None recorded</div>
        ) : (
          <ul className="space-y-2">
            {revocations.map((r) => (
              <li key={r.id} className="flex items-center gap-3 rounded-2xl border border-slate-200 p-3 text-sm">
                <span className="font-semibold text-slate-700">{r.target_type}</span>
                <span className="text-slate-500">{r.target_ref || "—"}</span>
                <span className="text-slate-600 truncate">{r.reason}</span>
                <span className={`ml-auto text-xs font-semibold ${r.propagation_confirmed ? "text-emerald-600" : "text-amber-600"}`}>
                  {r.propagation_confirmed ? "propagated" : "pending"}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Kill switch modal */}
      {killModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-3xl p-6 w-full max-w-md shadow-xl border border-slate-200">
            <div className="flex items-center gap-3 mb-2">
              <div className="h-10 w-10 rounded-full bg-red-100 flex items-center justify-center">
                <Radio className="h-5 w-5 text-red-600" />
              </div>
              <h3 className="text-lg font-bold text-slate-800">Kill switch</h3>
            </div>
            <p className="text-xs text-slate-500 mb-4">Revokes every live capability the scope names. It cannot be undone.</p>
            <div className="space-y-4">
              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-500">Scope *</label>
                <select
                  value={killForm.scope}
                  onChange={(e) => setKillForm((f) => ({ ...f, scope: e.target.value }))}
                  className="w-full rounded-xl border border-slate-200 bg-white py-2.5 px-4 text-sm text-slate-700 outline-none focus:border-[#3B82F6]"
                >
                  <option value="GLOBAL">GLOBAL — everything</option>
                  <option value="TENANT">TENANT</option>
                  <option value="PERSON">PERSON</option>
                  <option value="SESSION">SESSION</option>
                </select>
              </div>
              {killForm.scope !== "GLOBAL" && (
                <div>
                  <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-500">Target *</label>
                  <input
                    value={killForm.target}
                    onChange={(e) => setKillForm((f) => ({ ...f, target: e.target.value }))}
                    placeholder={killForm.scope === "TENANT" ? "tenant id" : "id"}
                    className="w-full rounded-xl border border-slate-200 bg-white py-2.5 px-4 text-sm text-slate-700 outline-none focus:border-[#3B82F6]"
                  />
                </div>
              )}
              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-500">Reason *</label>
                <textarea
                  value={killForm.reason}
                  onChange={(e) => setKillForm((f) => ({ ...f, reason: e.target.value }))}
                  placeholder="Why is access being stopped?"
                  className="w-full rounded-xl border border-slate-200 bg-white py-2.5 px-4 text-sm text-slate-700 outline-none focus:border-[#3B82F6] min-h-[80px] resize-y"
                />
              </div>
            </div>
            <div className="flex gap-3 mt-6 justify-end">
              <button onClick={() => setKillModal(false)} className="px-4 py-2 rounded-full border border-slate-200 text-sm text-slate-600 hover:bg-slate-50">Cancel</button>
              <button
                onClick={handleKill}
                disabled={busy || !killForm.reason.trim() || (killForm.scope !== "GLOBAL" && !killForm.target.trim())}
                className="px-4 py-2 rounded-full bg-red-600 text-white text-sm font-semibold hover:bg-red-700 disabled:opacity-50"
              >
                {busy ? "Revoking..." : "Revoke all in scope"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
