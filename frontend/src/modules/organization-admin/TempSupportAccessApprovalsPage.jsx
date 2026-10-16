import { useState, useCallback, useEffect } from "react";
import {
  ShieldCheck, AlertTriangle, KeyRound, RefreshCw, Clock, Ban, Eye, X, CheckCircle2, XCircle, Loader2, Lock,
} from "lucide-react";
import PageHeader from "../../components/PageHeader";
import { supportLoginService, supportSessionClaims } from "../../service/supportLoginService";
import { formatDateTime } from "../../utils/dateTime";

// The organization's side of just-in-time support access: Zoiko support asks for temporary read-only access, an admin
// approves or rejects it, can end a live session at any moment, and can see every page the session opened.

const STATUS_STYLE = {
  PENDING: "border-amber-200 bg-amber-50 text-amber-700",
  APPROVED: "border-blue-200 bg-blue-50 text-blue-700",
  ACTIVE: "border-emerald-200 bg-emerald-50 text-emerald-700",
  COMPLETED: "border-slate-200 bg-slate-50 text-slate-600",
  REVOKED: "border-red-200 bg-red-50 text-red-700",
  REJECTED: "border-red-200 bg-red-50 text-red-700",
  CANCELLED: "border-slate-200 bg-slate-50 text-slate-500",
  EXPIRED: "border-slate-200 bg-slate-50 text-slate-500",
};
const STATUS_LABEL = {
  PENDING: "Awaiting your decision",
  APPROVED: "Approved (not used yet)",
  ACTIVE: "Live now",
  COMPLETED: "Completed",
  REVOKED: "Revoked",
  REJECTED: "Rejected",
  CANCELLED: "Withdrawn",
  EXPIRED: "Expired",
};

const cardCls = "rounded-3xl border border-slate-200 bg-white p-6 shadow-[0_4px_20px_rgba(0,0,0,0.02)]";
const inputCls = "w-full rounded-xl border border-slate-200 bg-white py-2.5 px-4 text-sm text-slate-700 outline-none focus:border-[#3B82F6]";
const btnGhost = "px-4 py-1.5 rounded-full border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50";
const btnPrimary = "flex items-center gap-1.5 px-4 py-1.5 rounded-full bg-[#3B82F6] text-xs font-semibold text-white hover:bg-[#2563EB] disabled:opacity-50";
const btnDanger = "flex items-center gap-1.5 px-4 py-1.5 rounded-full bg-red-600 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-50";

function Pill({ status }) {
  return (
    <span className={`inline-flex items-center whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-semibold ${STATUS_STYLE[status] || STATUS_STYLE.CANCELLED}`}>
      {STATUS_LABEL[status] || status}
    </span>
  );
}

function toMs(value) {
  if (!value) return null;
  const s = String(value);
  return Date.parse(/[zZ]|[+-]\d\d:?\d\d$/.test(s) ? s : `${s}Z`);
}

function useNow() {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  return now;
}

function ActivityModal({ request, onClose }) {
  const [rows, setRows] = useState(null);
  const [error, setError] = useState(null);
  useEffect(() => {
    supportLoginService.activity(request.id).then((d) => setRows(Array.isArray(d) ? d : [])).catch((e) => setError(e.message || "Failed to load"));
  }, [request.id]);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div role="dialog" aria-modal="true" className="flex max-h-[85vh] w-full max-w-2xl flex-col rounded-3xl border border-slate-200 bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <div className="flex items-center gap-3">
            <Eye className="h-5 w-5 text-[#3B82F6]" />
            <h3 className="text-lg font-bold text-slate-800">What the session opened · {request.reference}</h3>
          </div>
          <button onClick={onClose} aria-label="Close" className="text-slate-400 hover:text-slate-600"><X size={18} /></button>
        </div>
        <div className="overflow-y-auto px-6 py-4">
          {error ? <div className="text-sm text-red-600">{error}</div>
            : rows === null ? <div className="py-6 text-center text-slate-400">Loading...</div>
            : rows.length === 0 ? <div className="py-6 text-center text-slate-400">Nothing was opened.</div>
            : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 text-left text-xs uppercase tracking-wider text-slate-400">
                    <th className="py-2 pr-3">Time</th><th className="py-2 pr-3">Action</th><th className="py-2 pr-3">Page / data</th><th className="py-2">Result</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr key={i} className="border-b border-slate-50">
                      <td className="py-2 pr-3 text-xs text-slate-500 whitespace-nowrap">{formatDateTime(r.at)}</td>
                      <td className="py-2 pr-3 text-xs font-semibold text-slate-600">{r.method === "GET" ? "Viewed" : r.method}</td>
                      <td className="py-2 pr-3 font-mono text-xs text-slate-700 break-all">{r.path}</td>
                      <td className="py-2 text-xs">{r.outcome === "blocked_write"
                        ? <span className="text-red-600">Change blocked</span>
                        : <span className="text-slate-500">Allowed</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
        </div>
      </div>
    </div>
  );
}

export default function TempSupportAccessApprovalsPage() {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [notes, setNotes] = useState({});
  const [rejecting, setRejecting] = useState(null);
  const [activityFor, setActivityFor] = useState(null);
  const now = useNow();
  const viewingAsSupport = !!supportSessionClaims();

  const load = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    try {
      const data = await supportLoginService.orgRequests();
      setRequests(Array.isArray(data) ? data : []);
      if (!quiet) setError(null);
    } catch (e) {
      if (!quiet) setError(e.message || "Failed to load support access requests");
    } finally {
      if (!quiet) setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const t = setInterval(() => load(true), 15000);
    return () => clearInterval(t);
  }, [load]);

  const run = async (id, fn, okText) => {
    setBusyId(id);
    setError(null);
    try {
      await fn();
      setNotice(okText);
      setRejecting(null);
      await load(true);
    } catch (e) {
      setError(e.message || "The action failed");
    } finally {
      setBusyId(null);
    }
  };

  const pending = requests.filter((r) => r.status === "PENDING");
  const live = requests.filter((r) => r.status === "ACTIVE" || r.status === "APPROVED");
  const history = requests.filter((r) => !["PENDING", "ACTIVE", "APPROVED"].includes(r.status));

  return (
    <div className="space-y-6 font-sans">
      <PageHeader
        title="Support Access"
        description="Zoiko support can only see your organization when an admin approves it: read-only, time-limited, and fully logged."
        action={
          <button onClick={() => load()} className="flex items-center gap-2 rounded-full border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50">
            <RefreshCw className="h-4 w-4" /> Refresh
          </button>
        }
      />

      {error && (
        <div className="flex items-center gap-3 rounded-3xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          <AlertTriangle className="h-5 w-5 shrink-0" /><span>{error}</span>
          <button onClick={() => setError(null)} className="ml-auto text-xs font-semibold text-red-600 underline">Dismiss</button>
        </div>
      )}
      {notice && (
        <div className="flex items-center gap-3 rounded-3xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700">
          <ShieldCheck className="h-5 w-5 shrink-0" /><span>{notice}</span>
          <button onClick={() => setNotice(null)} className="ml-auto text-xs font-semibold text-emerald-700 underline">Dismiss</button>
        </div>
      )}

      {/* awaiting decision */}
      <div className={cardCls}>
        <h3 className="mb-4 text-sm font-semibold uppercase tracking-wider text-slate-500">Awaiting your decision</h3>
        {loading ? (
          <div className="py-8 text-center text-slate-400">Loading...</div>
        ) : pending.length === 0 ? (
          <div className="py-8 text-center text-slate-400">No requests are waiting</div>
        ) : (
          <ul className="space-y-3">
            {pending.map((r) => {
              const busy = busyId === r.id;
              return (
                <li key={r.id} className="rounded-2xl border border-amber-200 bg-amber-50/40 p-4">
                  <div className="flex flex-wrap items-center gap-3">
                    <KeyRound className="h-4 w-4 text-amber-600" />
                    <span className="font-semibold text-slate-800">{r.requested_by_email}</span>
                    <span className="text-xs text-slate-500">from Zoiko support asks for</span>
                    <span className="rounded-full bg-white px-2.5 py-0.5 text-xs font-semibold text-slate-700 border border-slate-200">{r.duration_minutes} minutes · read-only</span>
                    <span className="ml-auto font-mono text-xs text-slate-400">{r.reference}</span>
                  </div>
                  <p className="mt-2 text-sm text-slate-700">{r.justification}</p>
                  <div className="mt-1 text-xs text-slate-400">
                    {r.ticket_reference && <>Ticket {r.ticket_reference} · </>}Asked {formatDateTime(r.created_at)} · expires unanswered {formatDateTime(r.pending_expires_at)}
                  </div>
                  {rejecting === r.id ? (
                    <div className="mt-3 space-y-2">
                      <input autoFocus value={notes[r.id] || ""} onChange={(e) => setNotes({ ...notes, [r.id]: e.target.value })}
                        placeholder="Why are you rejecting it? (shown to support)" className={inputCls} maxLength={1000} />
                      <div className="flex justify-end gap-2">
                        <button onClick={() => setRejecting(null)} className={btnGhost}>Back</button>
                        <button disabled={busy || viewingAsSupport || !(notes[r.id] || "").trim()}
                          onClick={() => run(r.id, () => supportLoginService.reject(r.id, notes[r.id].trim()), `Request ${r.reference} rejected.`)}
                          className={btnDanger}>
                          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <XCircle className="h-3.5 w-3.5" />} Reject request
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="mt-3 flex flex-wrap items-center justify-end gap-2">
                      <input value={notes[r.id] || ""} onChange={(e) => setNotes({ ...notes, [r.id]: e.target.value })}
                        placeholder="Optional note" className="mr-auto min-w-[200px] flex-1 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-sm" maxLength={1000} />
                      <button onClick={() => setRejecting(r.id)} disabled={busy || viewingAsSupport} className={btnGhost}>Reject</button>
                      <button disabled={busy || viewingAsSupport}
                        onClick={() => run(r.id, () => supportLoginService.approve(r.id, notes[r.id]), `Request ${r.reference} approved. Support can now sign in read-only for ${r.duration_minutes} minutes.`)}
                        className={btnPrimary}>
                        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />} Approve
                      </button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* approved / live */}
      <div className={cardCls}>
        <h3 className="mb-4 text-sm font-semibold uppercase tracking-wider text-slate-500">Approved and live access</h3>
        {live.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-8 text-center text-slate-400">
            <Lock className="h-8 w-8 opacity-40" /> No one from support has access right now
          </div>
        ) : (
          <ul className="space-y-3">
            {live.map((r) => {
              const busy = busyId === r.id;
              const ms = r.session ? toMs(r.session.expires_at) : null;
              const secs = ms ? Math.max(Math.floor((ms - now) / 1000), 0) : null;
              return (
                <li key={r.id} className="rounded-2xl border border-slate-200 p-4">
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="font-semibold text-slate-800">{r.requested_by_email}</span>
                    <Pill status={r.status} />
                    <span className="font-mono text-xs text-slate-400">{r.reference}</span>
                    {r.status === "ACTIVE" && secs !== null && (
                      <span className="flex items-center gap-1 rounded-full bg-emerald-50 px-3 py-1 font-mono text-sm font-semibold text-emerald-700">
                        <Clock className="h-4 w-4" /> {Math.floor(secs / 60)}:{String(secs % 60).padStart(2, "0")} left
                      </span>
                    )}
                    <div className="ml-auto flex gap-2">
                      {r.status === "ACTIVE" && (
                        <>
                          <button onClick={() => setActivityFor(r)} className={btnGhost}>See activity</button>
                          <button disabled={busy || viewingAsSupport}
                            onClick={() => run(r.id, () => supportLoginService.revoke(r.id), "Session ended. Support was signed out immediately.")}
                            className={btnDanger}>
                            <Ban className="h-3.5 w-3.5" /> End session now
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                  <p className="mt-2 text-sm text-slate-600">{r.justification}</p>
                  <div className="mt-1 text-xs text-slate-400">
                    Approved by {r.decided_by_email} {formatDateTime(r.decided_at)}
                    {r.status === "APPROVED" && <> · support has not started the session yet (approval lapses {formatDateTime(r.approval_expires_at)})</>}
                    {r.status === "ACTIVE" && r.session && <> · {r.session.first_login_at ? `signed in ${formatDateTime(r.session.first_login_at)}` : "not signed in yet"} · {r.session.request_count} request(s)</>}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* history */}
      <div className={cardCls}>
        <h3 className="mb-4 text-sm font-semibold uppercase tracking-wider text-slate-500">History</h3>
        {history.length === 0 ? (
          <div className="py-6 text-center text-slate-400">No history yet</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-left text-xs uppercase tracking-wider text-slate-400">
                  <th className="py-2 pr-4">Reference</th><th className="py-2 pr-4">Requested by</th><th className="py-2 pr-4">Reason</th>
                  <th className="py-2 pr-4">Duration</th><th className="py-2 pr-4">Outcome</th><th className="py-2 pr-4">Asked</th><th className="py-2" />
                </tr>
              </thead>
              <tbody>
                {history.map((r) => (
                  <tr key={r.id} className="border-b border-slate-50 align-top">
                    <td className="py-2.5 pr-4 font-mono text-xs text-slate-500">{r.reference}</td>
                    <td className="py-2.5 pr-4 text-slate-700">{r.requested_by_email}</td>
                    <td className="py-2.5 pr-4 max-w-xs text-slate-600">{r.justification}</td>
                    <td className="py-2.5 pr-4 text-slate-600">{r.duration_minutes} min</td>
                    <td className="py-2.5 pr-4"><Pill status={r.status} />
                      {r.decided_by_email && <div className="mt-1 text-xs text-slate-400">by {r.decided_by_email}</div>}
                    </td>
                    <td className="py-2.5 pr-4 text-xs text-slate-500">{formatDateTime(r.created_at)}</td>
                    <td className="py-2.5 text-right">
                      {r.session && <button onClick={() => setActivityFor(r)} className="text-xs font-semibold text-[#2563EB] hover:underline">Activity</button>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {activityFor && <ActivityModal request={activityFor} onClose={() => setActivityFor(null)} />}
    </div>
  );
}
