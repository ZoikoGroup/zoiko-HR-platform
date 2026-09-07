import { useState, useCallback, useEffect } from "react";
import { KeyRound, AlertTriangle, Plus, XCircle, X } from "lucide-react";
import PageHeader from "../../components/PageHeader";
import OrgPicker from "../../components/OrgPicker";
import { billingService } from "../../service/billingService";

export default function SupportAccessPage() {
  const [filterOrg, setFilterOrg] = useState(null);
  const [grants, setGrants] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [grantModal, setGrantModal] = useState(false);
  const [grantOrg, setGrantOrg] = useState(null);
  const [grantForm, setGrantForm] = useState({ reason: "", ttl_hours: 24 });
  const [busy, setBusy] = useState(false);
  const [newToken, setNewToken] = useState(null);

  const [revokeConfirm, setRevokeConfirm] = useState(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await billingService.listSupportAccess(filterOrg?.id);
      setGrants(data.list || []);
    } catch (e) {
      setError(e.message || "Failed to load support access grants");
    } finally {
      setLoading(false);
    }
  }, [filterOrg]);

  useEffect(() => { loadData(); }, [loadData]);

  const handleGrant = async () => {
    if (!grantOrg || !grantForm.reason.trim()) return;
    setBusy(true);
    try {
      const res = await billingService.createSupportAccess({
        organization_id: grantOrg.id,
        reason: grantForm.reason,
        ttl_hours: Number(grantForm.ttl_hours) || 24,
      });
      setNewToken(res);
      setGrantModal(false);
      setGrantOrg(null);
      setGrantForm({ reason: "", ttl_hours: 24 });
      loadData();
    } catch (e) {
      setError(e.message || "Failed to grant access");
    } finally {
      setBusy(false);
    }
  };

  const handleRevoke = async (grantId) => {
    setBusy(true);
    try {
      await billingService.revokeSupportAccess(grantId);
      setRevokeConfirm(null);
      loadData();
    } catch (e) {
      setError(e.message || "Failed to revoke access");
    } finally {
      setBusy(false);
    }
  };

  const isActive = (g) => !g.revoked_at && (g.expires_at ? new Date(g.expires_at).getTime() > Date.now() : true);

  return (
    <div className="space-y-6 font-sans">
      <PageHeader
        title="Support Access Grants"
        description="Time-bounded Billing Ops support-access grants across every organization."
        action={
          <button
            onClick={() => setGrantModal(true)}
            className="flex items-center gap-2 rounded-full bg-[#3B82F6] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#2563EB]"
          >
            <Plus className="h-4 w-4" /> Grant Access
          </button>
        }
      />

      {error && (
        <div className="rounded-3xl border border-red-200 bg-red-50 p-4 text-red-700 text-sm flex items-center gap-3">
          <AlertTriangle className="h-5 w-5 shrink-0" />
          <span>{error}</span>
          <button onClick={() => setError(null)} className="ml-auto text-red-600 underline text-xs font-semibold">Dismiss</button>
        </div>
      )}

      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-[0_4px_20px_rgba(0,0,0,0.02)]">
        <div className="flex items-center gap-3 mb-4">
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Filter by organization:</span>
          <OrgPicker selectedOrg={filterOrg} onSelect={setFilterOrg} placeholder="All organizations — search to filter..." />
        </div>

        {loading ? (
          <div className="text-center py-12 text-slate-400">Loading...</div>
        ) : grants.length === 0 ? (
          <div className="text-center py-12 text-slate-400">
            <KeyRound className="h-10 w-10 mx-auto mb-3 opacity-40" />
            No support-access grants found
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-100 text-xs font-semibold uppercase tracking-wider text-slate-500">
                  <th className="py-3 px-4">Organization</th>
                  <th className="py-3 px-4">Granted By</th>
                  <th className="py-3 px-4">Reason</th>
                  <th className="py-3 px-4">Expires</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {grants.map((g) => {
                  const active = isActive(g);
                  return (
                    <tr key={g.id} className="text-sm hover:bg-slate-50/50">
                      <td className="py-4 px-4 font-semibold text-slate-700">#{g.organization_id}</td>
                      <td className="py-4 px-4 text-slate-600">{g.granted_by}</td>
                      <td className="py-4 px-4 text-slate-600 max-w-xs truncate" title={g.reason || ""}>{g.reason || "—"}</td>
                      <td className="py-4 px-4 text-xs text-slate-400">{g.expires_at ? new Date(g.expires_at).toLocaleString() : "—"}</td>
                      <td className="py-4 px-4">
                        {active ? (
                          <span className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-700">Active</span>
                        ) : g.revoked_at ? (
                          <span className="inline-flex items-center rounded-full border border-slate-200 bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-600">Revoked by {g.revoked_by || "—"}</span>
                        ) : (
                          <span className="inline-flex items-center rounded-full border border-slate-200 bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-600">Expired</span>
                        )}
                      </td>
                      <td className="py-4 px-4 text-right">
                        {active && (
                          revokeConfirm === g.id ? (
                            <div className="inline-flex items-center gap-2">
                              <button onClick={() => setRevokeConfirm(null)} className="text-xs font-semibold text-slate-500 hover:underline">Cancel</button>
                              <button
                                onClick={() => handleRevoke(g.id)}
                                disabled={busy}
                                className="flex items-center gap-1 rounded-full bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-50"
                              >
                                <XCircle size={12} /> Confirm Revoke
                              </button>
                            </div>
                          ) : (
                            <button onClick={() => setRevokeConfirm(g.id)} className="text-xs font-semibold text-red-600 hover:underline">Revoke</button>
                          )
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

      {/* Grant Access Modal */}
      {grantModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-3xl p-6 w-full max-w-md shadow-xl border border-slate-200">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-slate-800">Grant Billing Ops Access</h3>
              <button onClick={() => setGrantModal(false)} className="text-slate-400 hover:text-slate-600"><X size={18} /></button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-500">Organization *</label>
                <OrgPicker selectedOrg={grantOrg} onSelect={setGrantOrg} />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-500">Reason *</label>
                <textarea
                  value={grantForm.reason}
                  onChange={(e) => setGrantForm((f) => ({ ...f, reason: e.target.value }))}
                  placeholder="Reason for granting support access..."
                  className="w-full rounded-xl border border-slate-200 bg-white py-2.5 px-4 text-sm text-slate-700 outline-none focus:border-[#3B82F6] min-h-[80px] resize-y"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-500">Expiry (hours)</label>
                <input
                  type="number"
                  min="1"
                  value={grantForm.ttl_hours}
                  onChange={(e) => setGrantForm((f) => ({ ...f, ttl_hours: e.target.value }))}
                  className="w-full rounded-xl border border-slate-200 bg-white py-2.5 px-4 text-sm text-slate-700 outline-none focus:border-[#3B82F6]"
                />
              </div>
            </div>
            <div className="flex gap-3 mt-6 justify-end">
              <button onClick={() => setGrantModal(false)} className="px-4 py-2 rounded-full border border-slate-200 text-sm text-slate-600 hover:bg-slate-50">Cancel</button>
              <button
                onClick={handleGrant}
                disabled={!grantOrg || !grantForm.reason.trim() || busy}
                className="px-4 py-2 rounded-full bg-[#3B82F6] text-white text-sm font-semibold hover:bg-[#2563EB] disabled:opacity-50"
              >
                {busy ? "Granting..." : "Grant Access"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* New token result (shown once) */}
      {newToken && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-3xl p-6 w-full max-w-lg shadow-xl border border-slate-200">
            <div className="flex items-center gap-3 mb-4">
              <div className="h-10 w-10 rounded-full bg-emerald-100 flex items-center justify-center">
                <KeyRound className="h-5 w-5 text-emerald-600" />
              </div>
              <h3 className="text-lg font-bold text-slate-800">Support Access Token</h3>
            </div>
            <p className="text-xs text-slate-500 mb-2">Copy this now — the raw token is shown once and cannot be retrieved again.</p>
            <pre className="bg-slate-900 text-emerald-300 rounded-xl p-4 text-xs whitespace-pre-wrap break-all font-mono select-all">{newToken.token}</pre>
            <div className="flex gap-3 mt-6 justify-end">
              <button onClick={() => setNewToken(null)} className="px-4 py-2 rounded-full bg-[#3B82F6] text-white text-sm font-semibold hover:bg-[#2563EB]">Done</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
