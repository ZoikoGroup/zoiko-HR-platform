import { useState, useCallback, useEffect } from "react";
import { ShieldCheck, AlertTriangle, KeyRound, RefreshCw, FileText, Radio } from "lucide-react";
import PageHeader from "../../components/PageHeader";
import { supportAccessService } from "../../service/supportAccessService";
import { formatDateTime } from "../../utils/dateTime";

// The tenant's own view of platform access to their data: approve or reject a request, revoke a live capability now,
// and read the full history. It shows the SHAPE of a scope (resources, counts, actions) - never a field value.
export default function SupportAccessPage() {
  const [requests, setRequests] = useState([]);
  const [grants, setGrants] = useState([]);
  const [breakglass, setBreakglass] = useState([]);
  const [revocations, setRevocations] = useState([]);
  const [activity, setActivity] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [rq, gr, bg, rv, act] = await Promise.all([
        supportAccessService.tenantRequests().catch(() => []),
        supportAccessService.tenantGrants().catch(() => []),
        supportAccessService.tenantBreakGlass().catch(() => []),
        supportAccessService.tenantRevocations().catch(() => []),
        supportAccessService.tenantActivity().catch(() => null),
      ]);
      setRequests(Array.isArray(rq) ? rq : []);
      setGrants(Array.isArray(gr) ? gr : []);
      setBreakglass(Array.isArray(bg) ? bg : []);
      setRevocations(Array.isArray(rv) ? rv : []);
      setActivity(act);
    } catch (e) {
      setError(e.message || "Failed to load support access");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const decide = async (id, decision) => {
    setBusy(true);
    try {
      const fn = decision === "APPROVED" ? supportAccessService.tenantApprove : supportAccessService.tenantReject;
      await fn(id, { decision });
      setNotice(`Request ${id} ${decision.toLowerCase()}.`);
      loadData();
    } catch (e) {
      setError(e.message || "Failed to record the decision");
    } finally {
      setBusy(false);
    }
  };

  const revokeNow = async (grantId) => {
    setBusy(true);
    try {
      await supportAccessService.tenantRevoke(grantId, "revoked by tenant");
      setNotice("Access revoked. It is refused from the next request.");
      loadData();
    } catch (e) {
      setError(e.message || "Failed to revoke");
    } finally {
      setBusy(false);
    }
  };

  const pending = requests.filter((r) => r.status === "PENDING_TENANT" || r.status === "PENDING_INDEPENDENT");

  return (
    <div className="space-y-6 font-sans">
      <PageHeader
        title="Support access"
        description="Every time a platform engineer asks to see your organization's data, and the controls to stop it."
        action={
          <button
            onClick={loadData}
            className="flex items-center gap-2 rounded-full border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50"
          >
            <RefreshCw className="h-4 w-4" /> Refresh
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
      {notice && (
        <div className="rounded-3xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-700 text-sm flex items-center gap-3">
          <ShieldCheck className="h-5 w-5 shrink-0" />
          <span>{notice}</span>
          <button onClick={() => setNotice(null)} className="ml-auto text-emerald-700 underline text-xs font-semibold">Dismiss</button>
        </div>
      )}

      {/* Pending requests */}
      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-[0_4px_20px_rgba(0,0,0,0.02)]">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-500 mb-4">Awaiting your decision</h3>
        {loading ? (
          <div className="text-center py-8 text-slate-400">Loading...</div>
        ) : pending.length === 0 ? (
          <div className="text-center py-8 text-slate-400">No requests are waiting</div>
        ) : (
          <ul className="space-y-3">
            {pending.map((r) => (
              <li key={r.id} className="rounded-2xl border border-slate-200 p-4">
                <div className="flex items-center gap-3">
                  <FileText className="h-4 w-4 text-slate-400" />
                  <span className="font-semibold text-slate-700">{r.reference}</span>
                  <span className="text-xs rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-slate-600">{r.risk_level}</span>
                  <span className="text-xs text-slate-400">{r.purpose_category}</span>
                  <span className="ml-auto text-xs text-slate-400">ticket {r.ticket_reference}</span>
                </div>
                <div className="mt-2 text-xs text-slate-500">
                  {r.requested_scope ? `${(r.requested_scope.resources || []).join(", ")} · ${r.requested_scope.record_count ?? 0} record(s) · ${(r.requested_scope.actions || []).join("/")}` : "—"}
                </div>
                <div className="mt-3 flex gap-2 justify-end">
                  <button
                    onClick={() => decide(r.id, "REJECTED")}
                    disabled={busy}
                    className="rounded-full border border-slate-200 px-4 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50"
                  >
                    Reject
                  </button>
                  <button
                    onClick={() => decide(r.id, "APPROVED")}
                    disabled={busy}
                    className="rounded-full bg-[#3B82F6] px-4 py-1.5 text-xs font-semibold text-white hover:bg-[#2563EB] disabled:opacity-50"
                  >
                    Approve
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Live capabilities */}
      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-[0_4px_20px_rgba(0,0,0,0.02)]">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-500 mb-4">Live access to your data</h3>
        {loading ? (
          <div className="text-center py-8 text-slate-400">Loading...</div>
        ) : grants.length === 0 ? (
          <div className="text-center py-8 text-slate-400 flex flex-col items-center gap-2">
            <KeyRound className="h-8 w-8 opacity-40" /> No one is looking right now
          </div>
        ) : (
          <ul className="space-y-2">
            {grants.map((g) => (
              <li key={g.id} className="flex items-center gap-3 rounded-2xl border border-slate-200 p-3 text-sm">
                <span className="font-semibold text-slate-700">{g.kind}</span>
                <span className="text-slate-600">
                  {g.scope ? `${(g.scope.resources || []).join(", ")} · ${g.scope.record_count ?? 0} rec · ${(g.scope.actions || []).join("/")}` : "—"}
                </span>
                <span className="text-xs text-slate-400">expires {g.expires_at ? formatDateTime(g.expires_at) : "—"}</span>
                {g.status === "ACTIVE" && (
                  <button
                    onClick={() => revokeNow(g.id)}
                    disabled={busy}
                    className="ml-auto text-xs font-semibold text-red-600 hover:underline disabled:opacity-50"
                  >
                    Revoke now
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Emergency sessions */}
      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-[0_4px_20px_rgba(0,0,0,0.02)]">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-500 mb-4 flex items-center gap-2">
          <Radio className="h-4 w-4" /> Emergency access
        </h3>
        {breakglass.length === 0 ? (
          <div className="text-center py-6 text-slate-400">No emergency sessions</div>
        ) : (
          <ul className="space-y-2">
            {breakglass.map((s) => (
              <li key={s.id} className="flex items-center gap-3 rounded-2xl border border-slate-200 p-3 text-sm">
                <span className="font-semibold text-slate-700">{s.incident_reference}</span>
                <span className={`text-xs rounded-full px-2 py-0.5 ${s.status === "ACTIVE" ? "bg-red-50 text-red-700 border border-red-200" : "bg-slate-50 text-slate-600 border border-slate-200"}`}>
                  {s.status}
                </span>
                <span className="text-xs text-slate-400">started {s.started_at ? formatDateTime(s.started_at) : "—"}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Revocations + activity summary */}
      <div className="grid gap-6 md:grid-cols-2">
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-[0_4px_20px_rgba(0,0,0,0.02)]">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-500 mb-4">Revocations</h3>
          {revocations.length === 0 ? (
            <div className="text-center py-6 text-slate-400">None recorded</div>
          ) : (
            <ul className="space-y-2">
              {revocations.map((r, i) => (
                <li key={i} className="flex items-center gap-3 rounded-2xl border border-slate-200 p-3 text-sm">
                  <span className="font-semibold text-slate-700">{r.target_type}</span>
                  <span className="text-slate-600 truncate">{r.reason}</span>
                  <span className="ml-auto text-xs text-slate-400">{r.requested_at ? formatDateTime(r.requested_at) : ""}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-[0_4px_20px_rgba(0,0,0,0.02)]">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-500 mb-4">History</h3>
          {!activity ? (
            <div className="text-center py-6 text-slate-400">No history</div>
          ) : (
            <dl className="grid grid-cols-2 gap-y-3 text-sm">
              <dt className="text-slate-500">Requests</dt><dd className="text-right font-semibold text-slate-700">{(activity.requests || []).length}</dd>
              <dt className="text-slate-500">Grants</dt><dd className="text-right font-semibold text-slate-700">{(activity.grants || []).length}</dd>
              <dt className="text-slate-500">Emergency sessions</dt><dd className="text-right font-semibold text-slate-700">{(activity.breakglass || []).length}</dd>
              <dt className="text-slate-500">Revocations</dt><dd className="text-right font-semibold text-slate-700">{(activity.revocations || []).length}</dd>
            </dl>
          )}
        </div>
      </div>
    </div>
  );
}
