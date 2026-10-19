import { useState, useCallback, useEffect, useMemo } from "react";
import {
  ShieldCheck, AlertTriangle, KeyRound, RefreshCw, X, Plus, Clock, Copy, Check, Loader2, Eye, Hourglass, Ban, LogIn,
} from "lucide-react";
import PageHeader from "../../components/PageHeader";
import OrgPicker from "../../components/OrgPicker";
import { supportLoginService } from "../../service/supportLoginService";
import { formatDateTime } from "../../utils/dateTime";
import { AccessReasonSelect, ACCESS_REASON_GROUPS } from "./AccessReasonSelect";

// Just-in-time support access: ask an organization for temporary read-only access, wait for one of its admins to
// approve, then generate a one-time username and password that sign in to that organization for 5, 15 or 30 minutes.
// The password is shown once. Every write is refused by the server and every page opened is logged for the tenant.

const DURATIONS = [5, 15, 30];
const POLL_MS = 15000;

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
  PENDING: "Awaiting org approval",
  APPROVED: "Approved",
  ACTIVE: "Live",
  COMPLETED: "Completed",
  REVOKED: "Revoked by org",
  REJECTED: "Rejected",
  CANCELLED: "Cancelled",
  EXPIRED: "Expired",
};
const OPEN = new Set(["PENDING", "APPROVED", "ACTIVE"]);

const inputCls =
  "w-full rounded-xl border border-slate-200 bg-white py-2.5 px-4 text-sm text-slate-700 outline-none focus:border-[#3B82F6]";
const labelCls = "mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-500";
const cardCls = "rounded-3xl border border-slate-200 bg-white p-6 shadow-[0_4px_20px_rgba(0,0,0,0.02)]";
const btnGhost = "px-4 py-2 rounded-full border border-slate-200 text-sm text-slate-600 hover:bg-slate-50 disabled:opacity-50";
const btnPrimary = "flex items-center gap-2 px-4 py-2 rounded-full bg-[#3B82F6] text-white text-sm font-semibold hover:bg-[#2563EB] disabled:opacity-50";
const btnDanger = "flex items-center gap-2 px-4 py-2 rounded-full border border-red-200 text-red-600 text-sm font-semibold hover:bg-red-50 disabled:opacity-50";

function Pill({ status }) {
  return (
    <span className={`inline-flex items-center whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-semibold ${STATUS_STYLE[status] || STATUS_STYLE.CANCELLED}`}>
      {STATUS_LABEL[status] || status}
    </span>
  );
}

function useNow(intervalMs = 1000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}

function toMs(value) {
  if (!value) return null;
  const s = String(value);
  return Date.parse(/[zZ]|[+-]\d\d:?\d\d$/.test(s) ? s : `${s}Z`);
}

function remaining(expiresAt, now) {
  const ms = toMs(expiresAt);
  if (!ms) return null;
  const secs = Math.max(Math.floor((ms - now) / 1000), 0);
  return { secs, text: `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, "0")}` };
}

function Modal({ title, icon, onClose, children, footer }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div role="dialog" aria-modal="true" aria-label={title}
        className="flex max-h-[90vh] w-full max-w-lg flex-col rounded-3xl border border-slate-200 bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <div className="flex items-center gap-3">
            {icon}
            <h3 className="text-lg font-bold text-slate-800">{title}</h3>
          </div>
          <button onClick={onClose} aria-label="Close" className="text-slate-400 hover:text-slate-600"><X size={18} /></button>
        </div>
        <div className="overflow-y-auto px-6 py-4">{children}</div>
        {footer && <div className="flex justify-end gap-3 border-t border-slate-100 px-6 py-4">{footer}</div>}
      </div>
    </div>
  );
}

function CopyField({ label, value, mono = true }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* clipboard unavailable: the value is still selectable */ }
  };
  return (
    <div>
      <label className={labelCls}>{label}</label>
      <div className="flex items-center gap-2">
        <input readOnly value={value} onFocus={(e) => e.target.select()}
          className={`${inputCls} ${mono ? "font-mono" : ""} bg-slate-50`} />
        <button onClick={copy} className={btnGhost} aria-label={`Copy ${label}`}>
          {copied ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
        </button>
      </div>
    </div>
  );
}

// ── request form ─────────────────────────────────────────────────────────────────────────────────────────────────────
function NewRequestModal({ onClose, onCreated }) {
  const [org, setOrg] = useState(null);
  const [duration, setDuration] = useState(15);
  const [accessReasonValue, setAccessReasonValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [generatedTicket, setGeneratedTicket] = useState("");

  const valid = org && accessReasonValue.trim().length > 0;

  // Auto-generate ticket reference immediately when modal opens
  useEffect(() => {
    if (!generatedTicket) {
      const year = new Date().getFullYear();
      const suffix = Math.random().toString(36).substring(2, 8).toUpperCase();
      setGeneratedTicket(`ZHR-${year}-${suffix}`);
    }
  }, [generatedTicket]);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const created = await supportLoginService.createRequest({
        organization_id: org.id,
        justification: accessReasonValue.split(":").pop() || accessReasonValue,
        ticket_reference: generatedTicket,
        duration_minutes: duration,
      });
      onCreated(created);
    } catch (e) {
      setError(e.message || "The request could not be sent");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title="Request temporary access" icon={<KeyRound className="h-5 w-5 text-[#3B82F6]" />} onClose={onClose}
      footer={<>
        <button onClick={onClose} className={btnGhost}>Cancel</button>
        <button onClick={submit} disabled={!valid || busy} className={btnPrimary}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />} Send for approval
        </button>
      </>}>
      <div className="space-y-4">
        <div>
          <label className={labelCls}>Organization *</label>
          <OrgPicker selectedOrg={org} onSelect={setOrg} />
        </div>
        <div>
          <label className={labelCls}>Access duration *</label>
          <div className="grid grid-cols-3 gap-2">
            {DURATIONS.map((d) => (
              <button key={d} type="button" onClick={() => setDuration(d)}
                className={`rounded-xl border px-3 py-2.5 text-sm font-semibold ${duration === d ? "border-[#3B82F6] bg-[#EFF6FF] text-[#2563EB]" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}>
                {d} min
              </button>
            ))}
          </div>
          <p className="mt-1.5 text-xs text-slate-400">The clock starts when you generate the credentials, not when the org approves.</p>
        </div>
        <div>
          <label className={labelCls}>Access reason *</label>
          <AccessReasonSelect
            value={accessReasonValue}
            onChange={setAccessReasonValue}
            groups={ACCESS_REASON_GROUPS}
            placeholder="Select access reason"
          />
          <p className="mt-1 text-xs text-slate-400">The selected reason will be sent to the organization admin for approval</p>
        </div>
        <div>
          <label className={labelCls}>Support ticket</label>
          <input
            readOnly
            value={generatedTicket}
            placeholder="Auto-generated on organization selection"
            className={`${inputCls} bg-slate-50 font-mono text-blue-700 cursor-default`}
          />
          <p className="mt-1 text-xs text-slate-400">Auto-generated ticket reference for this request</p>
        </div>
        <div className="flex gap-2 rounded-2xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
          <Eye className="h-4 w-4 shrink-0 text-slate-400" />
          Access is read-only. The organization's admins are notified, must approve, can end the session at any time and see every page you open.
        </div>
        {error && <div className="rounded-2xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}
      </div>
    </Modal>
  );
}

// ── credentials (shown once) ─────────────────────────────────────────────────────────────────────────────────────────
function CredentialsModal({ request, onClose }) {
  const now = useNow();
  const creds = request.credentials;
  const left = remaining(creds.expires_at, now);
  const loginUrl = creds.login_url || `${window.location.origin}/login`;
  return (
    <Modal title="Temporary credentials" icon={<KeyRound className="h-5 w-5 text-emerald-600" />} onClose={onClose}
      footer={<button onClick={onClose} className={btnPrimary}>I have saved them</button>}>
      <div className="space-y-4">
        <div className="flex items-center justify-between rounded-2xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
          <span><strong>{request.organization_name}</strong> · read-only</span>
          <span className="flex items-center gap-1 font-mono font-semibold"><Clock className="h-4 w-4" /> {left ? left.text : "—"}</span>
        </div>
        <CopyField label="Username" value={creds.username} />
        <CopyField label="Password" value={creds.password} />
        <CopyField label="Sign-in page" value={loginUrl} mono={false} />
        <div className="flex gap-2 rounded-2xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <div>
            The password is shown <strong>only now</strong>. Open the sign-in page in a <strong>private / incognito window</strong> so
            your Super Admin session in this window is not replaced. The session ends automatically at {formatDateTime(creds.expires_at)}.
          </div>
        </div>
        <button onClick={() => window.open(loginUrl, "_blank", "noopener")} className={`${btnGhost} flex items-center gap-2`}>
          <LogIn className="h-4 w-4" /> Open sign-in page in a new tab
        </button>
      </div>
    </Modal>
  );
}

// ── page ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
export default function TempSupportAccessPage() {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [showNew, setShowNew] = useState(false);
  const [issued, setIssued] = useState(null);
  const [filter, setFilter] = useState("all");
  const now = useNow();

  const load = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    try {
      const data = await supportLoginService.listRequests();
      setRequests(Array.isArray(data) ? data : []);
      if (!quiet) setError(null);
    } catch (e) {
      if (!quiet) setError(e.message || "Failed to load support access requests");
    } finally {
      if (!quiet) setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);
  // pick up an approval (or a revocation) without a manual refresh
  useEffect(() => {
    const t = setInterval(() => load(true), POLL_MS);
    return () => clearInterval(t);
  }, [load]);

  // a live session whose time ran out moves to "Completed" on the next load
  const anyExpired = requests.some((r) => r.status === "ACTIVE" && r.session && remaining(r.session.expires_at, now)?.secs === 0);
  useEffect(() => { if (anyExpired) load(true); }, [anyExpired, load]);

  const act = async (id, fn, okText) => {
    setBusyId(id);
    setError(null);
    try {
      const out = await fn(id);
      if (out?.credentials) setIssued(out);
      if (okText) setNotice(okText);
      await load(true);
    } catch (e) {
      setError(e.message || "The action failed");
      load(true);
    } finally {
      setBusyId(null);
    }
  };

  const open = requests.filter((r) => OPEN.has(r.status));
  const history = useMemo(() => {
    const closed = requests.filter((r) => !OPEN.has(r.status));
    return filter === "all" ? closed : closed.filter((r) => r.status === filter);
  }, [requests, filter]);
  const counts = useMemo(() => ({
    pending: requests.filter((r) => r.status === "PENDING").length,
    approved: requests.filter((r) => r.status === "APPROVED").length,
    live: requests.filter((r) => r.status === "ACTIVE").length,
  }), [requests]);

  return (
    <div className="space-y-6 font-sans">
      <PageHeader
        title="Just-in-time Support Access"
        description="Temporary, read-only sign-ins to an organization, approved by that organization's admin."
        action={
          <div className="flex gap-2">
            <button onClick={() => load()} className="flex items-center gap-2 rounded-full border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50">
              <RefreshCw className="h-4 w-4" /> Refresh
            </button>
            <button onClick={() => setShowNew(true)} className={btnPrimary}>
              <Plus className="h-4 w-4" /> Request access
            </button>
          </div>
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

      {/* how it works + counters */}
      <div className="grid gap-4 md:grid-cols-4">
        {[
          { n: "1", t: "Request", d: "Pick an organization, a reason and 5, 15 or 30 minutes." },
          { n: "2", t: "Org admin approves", d: "Its admins are notified in-app and by email." },
          { n: "3", t: "Generate credentials", d: "A one-time username and password, shown once." },
          { n: "4", t: "Sign in read-only", d: "Writes are blocked; the session ends on its own." },
        ].map((s) => (
          <div key={s.n} className="rounded-3xl border border-slate-200 bg-white p-4">
            <div className="flex items-center gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#EFF6FF] text-xs font-bold text-[#2563EB]">{s.n}</span>
              <span className="text-sm font-semibold text-slate-700">{s.t}</span>
            </div>
            <p className="mt-1.5 text-xs text-slate-500">{s.d}</p>
          </div>
        ))}
      </div>

      {/* open requests */}
      <div className={cardCls}>
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-500">Open requests</h3>
          <span className="text-xs text-slate-400">{counts.pending} awaiting approval · {counts.approved} ready · {counts.live} live</span>
        </div>
        {loading ? (
          <div className="py-8 text-center text-slate-400">Loading...</div>
        ) : open.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-8 text-center text-slate-400">
            <KeyRound className="h-8 w-8 opacity-40" /> No open requests
            <button onClick={() => setShowNew(true)} className="mt-2 text-sm font-semibold text-[#2563EB] hover:underline">Request access to an organization</button>
          </div>
        ) : (
          <ul className="space-y-3">
            {open.map((r) => {
              const left = r.session ? remaining(r.session.expires_at, now) : null;
              const busy = busyId === r.id;
              return (
                <li key={r.id} className="rounded-2xl border border-slate-200 p-4">
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="font-semibold text-slate-800">{r.organization_name || `Organization #${r.organization_id}`}</span>
                    <Pill status={r.status} />
                    <span className="font-mono text-xs text-slate-400">{r.reference}</span>
                    {r.ticket_reference && <span className="font-mono text-xs font-semibold text-blue-600">Ticket: {r.ticket_reference}</span>}
                    <span className="text-xs text-slate-400">{r.duration_minutes} min · read-only</span>
                    {!r.is_mine && <span className="text-xs text-slate-400">by {r.requested_by_email}</span>}
                    {r.status === "ACTIVE" && left && (
                      <span className="ml-auto flex items-center gap-1 rounded-full bg-emerald-50 px-3 py-1 font-mono text-sm font-semibold text-emerald-700">
                        <Clock className="h-4 w-4" /> {left.text} left
                      </span>
                    )}
                  </div>
                  <p className="mt-2 text-sm text-slate-600">{r.justification}</p>
                  <div className="mt-1 text-xs text-slate-400">
                    {r.ticket_reference && <>Ticket {r.ticket_reference} · </>}
                    Requested {formatDateTime(r.created_at)}
                    {r.decided_by_email && <> · approved by {r.decided_by_email}{r.decision_note ? ` — "${r.decision_note}"` : ""}</>}
                  </div>

                  {r.status === "PENDING" && (
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <span className="flex items-center gap-1.5 text-xs text-amber-700"><Hourglass className="h-4 w-4" /> Waiting for an admin of this organization to approve (until {formatDateTime(r.pending_expires_at)}).</span>
                      {r.is_mine && <button onClick={() => act(r.id, supportLoginService.cancelRequest, "Request cancelled.")} disabled={busy} className={`${btnGhost} ml-auto`}>Cancel request</button>}
                    </div>
                  )}
                  {r.status === "APPROVED" && (
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <span className="text-xs text-blue-700">Approved. Generate the credentials when you are ready: the {r.duration_minutes}-minute clock starts then (available until {formatDateTime(r.approval_expires_at)}).</span>
                      {r.is_mine && (
                        <div className="ml-auto flex gap-2">
                          <button onClick={() => act(r.id, supportLoginService.cancelRequest, "Request cancelled.")} disabled={busy} className={btnGhost}>Cancel</button>
                          <button onClick={() => act(r.id, supportLoginService.issueCredentials)} disabled={busy} className={btnPrimary}>
                            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />} Generate credentials
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                  {r.status === "ACTIVE" && r.session && (
                    <div className="mt-3 flex flex-wrap items-center gap-3 rounded-xl bg-slate-50 p-3 text-xs text-slate-600">
                      <span>Username <span className="font-mono text-slate-800">{r.session.username}</span></span>
                      <span>· {r.session.first_login_at ? `signed in ${formatDateTime(r.session.first_login_at)}` : "not signed in yet"}</span>
                      <span>· {r.session.request_count} request(s)</span>
                      <span>· ends {formatDateTime(r.session.expires_at)}</span>
                      {r.is_mine && (
                        <button onClick={() => act(r.id, supportLoginService.endSession, "Session ended.")} disabled={busy} className={`${btnDanger} ml-auto`}>
                          <Ban className="h-4 w-4" /> End session now
                        </button>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* history */}
      <div className={cardCls}>
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-500">History</h3>
          <select value={filter} onChange={(e) => setFilter(e.target.value)} className="ml-auto rounded-xl border border-slate-200 px-3 py-1.5 text-sm text-slate-600">
            <option value="all">All outcomes</option>
            {["COMPLETED", "REVOKED", "REJECTED", "CANCELLED", "EXPIRED"].map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
          </select>
        </div>
        {history.length === 0 ? (
          <div className="py-6 text-center text-slate-400">Nothing here yet</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-left text-xs uppercase tracking-wider text-slate-400">
                  <th className="py-2 pr-4">Reference</th>
                  <th className="py-2 pr-4">Organization</th>
                  <th className="py-2 pr-4">Requested by</th>
                  <th className="py-2 pr-4">Duration</th>
                  <th className="py-2 pr-4">Outcome</th>
                  <th className="py-2 pr-4">Decided by</th>
                  <th className="py-2">Requested</th>
                </tr>
              </thead>
              <tbody>
                {history.map((r) => (
                  <tr key={r.id} className="border-b border-slate-50 align-top">
                    <td className="py-2.5 pr-4 font-mono text-xs text-slate-500">{r.reference}</td>
                    <td className="py-2.5 pr-4 font-semibold text-slate-700">{r.organization_name || `#${r.organization_id}`}</td>
                    <td className="py-2.5 pr-4 text-slate-600">{r.requested_by_email}</td>
                    <td className="py-2.5 pr-4 text-slate-600">{r.duration_minutes} min</td>
                    <td className="py-2.5 pr-4">
                      <Pill status={r.status} />
                      {r.decision_note && r.status === "REJECTED" && <div className="mt-1 text-xs text-slate-500">"{r.decision_note}"</div>}
                      {r.session?.request_count > 0 && <div className="mt-1 text-xs text-slate-400">{r.session.request_count} request(s)</div>}
                    </td>
                    <td className="py-2.5 pr-4 text-slate-600">{r.decided_by_email || "—"}</td>
                    <td className="py-2.5 text-xs text-slate-500">{formatDateTime(r.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showNew && (
        <NewRequestModal
          onClose={() => setShowNew(false)}
          onCreated={(r) => {
            setShowNew(false);
            setNotice(`Request ${r.reference} sent. ${r.organization_name}'s admins have been notified.`);
            load(true);
          }}
        />
      )}
      {issued && <CredentialsModal request={issued} onClose={() => setIssued(null)} />}
    </div>
  );
}
