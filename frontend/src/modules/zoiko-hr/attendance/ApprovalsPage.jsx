import { useEffect, useRef, useState } from "react";
import { CheckCircle2, Clock, XCircle } from "lucide-react";
import HRPage from "../../../components/HRPage";
import AttendanceSubNav from "./components/AttendanceSubNav";
import Pager from "../documents/components/Pager";
import { correctionSummary, formatClockTime } from "./constants";
import { useAttendanceApprovals, useDecideAttendanceRequest } from "./hooks/useAttendanceApprovals";
import { formatDate, formatDateTime } from "../../../utils/dateTime";

const STATUS_TABS = [["pending", "Pending"], ["approved", "Approved"], ["rejected", "Refused"], ["all", "All"]];
const TYPES = [["all", "All"], ["correction", "Corrections"], ["overtime", "Overtime"]];
const REASONS = { forgot: "Forgot to check in/out", system_issue: "System issue", off_site: "Working off-site", other: "Other" };
const METHODS = [["per_policy", "As the policy says"], ["pay", "Paid"], ["time_off", "Time off in lieu"]];

function waited(hours) {
  if (hours == null) return null;
  if (hours < 1) return "under an hour";
  if (hours < 48) return `${Math.round(hours)} h`;
  return `${Math.round(hours / 24)} days`;
}

function what(r) {
  if (r.type === "overtime") return `Overtime ${formatClockTime(r.start_time)}–${formatClockTime(r.end_time)} · ${r.hours} h${r.emergency ? " · emergency" : ""}${r.pre_approved ? " · asked in advance" : ""}`;
  const was = r.original_check_in || r.original_check_out ? `Recorded ${formatClockTime(r.original_check_in)}–${formatClockTime(r.original_check_out)} → ` : "";
  return `${was}${correctionSummary(r)}`;
}

function DecideDialog({ request, approve, onClose, onDone }) {
  const decide = useDecideAttendanceRequest();
  const [reason, setReason] = useState("");
  const [method, setMethod] = useState("per_policy");
  const [error, setError] = useState(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") closeRef.current(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);
  const submit = async (e) => {
    e.preventDefault();
    setError(null);
    try {
      await decide.mutateAsync({ type: request.type, id: request.id, approve, reason: reason.trim(),
        compensation_method: request.type === "overtime" && approve ? method : undefined });
      onDone(approve ? "Approved. The attendance record was updated." : "Refused. The person is told why.");
    } catch (err) {
      setError(err?.message || "The decision was not saved.");
    }
  };
  const label = `${approve ? "Approve" : "Refuse"} ${request.type === "overtime" ? "overtime" : "correction"} for ${request.employee_name}`;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <form role="dialog" aria-modal="true" aria-label={label} onSubmit={submit} onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md space-y-3 rounded-2xl bg-white p-6 text-sm shadow-2xl">
        <h2 className="text-base font-semibold">{label}</h2>
        <p className="rounded-lg bg-slate-50 p-2 text-slate-700">{formatDate(request.date)} · {what(request)}</p>
        {request.type === "overtime" && approve && (
          <label className="block">Compensation
            <select value={method} onChange={(e) => setMethod(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2">
              {METHODS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select></label>
        )}
        <label className="block">{approve ? "Comment (optional)" : "Reason (required — the person sees it)"}
          <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} maxLength={1000}
            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2" /></label>
        {error && <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-rose-800">{error}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-xl border border-slate-200 px-4 py-2 font-medium">Cancel</button>
          <button type="submit" disabled={decide.isPending || (!approve && !reason.trim())}
            className={`rounded-xl px-4 py-2 font-semibold text-white disabled:opacity-50 ${approve ? "bg-emerald-600 hover:bg-emerald-700" : "bg-rose-600 hover:bg-rose-700"}`}>
            {approve ? "Approve" : "Refuse"}
          </button>
        </div>
      </form>
    </div>
  );
}

/**
 * Attendance → Approvals (attendance plan M7): correction and overtime requests in one queue, oldest waiting first.
 * Managers see their team, HR everyone; nobody decides their own request (the server enforces it too).
 */
export default function AttendanceApprovalsPage() {
  const [status, setStatus] = useState("pending");
  const [type, setType] = useState("all");
  const [page, setPage] = useState(1);
  const [deciding, setDeciding] = useState(null);       // { request, approve }
  const [notice, setNotice] = useState(null);
  const query = useAttendanceApprovals({ status, type, page, per_page: 25 });
  useEffect(() => { setPage(1); }, [status, type]);
  const data = query.data;
  const counts = data?.counts;
  const countFor = (t, s) => {
    if (!counts || s === "all") return null;
    return t === "all" ? counts.correction[s] + counts.overtime[s] : counts[t][s];
  };

  return (
    <HRPage title="Attendance Approvals" subtitle="Corrections and overtime waiting for a decision.">
      <AttendanceSubNav />
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div role="tablist" aria-label="Status" className="inline-flex rounded-lg border border-slate-200 bg-white p-1">
            {STATUS_TABS.map(([v, l]) => {
              const n = countFor(type, v);
              return (
                <button key={v} type="button" role="tab" aria-selected={status === v} onClick={() => setStatus(v)}
                  className={`rounded-md px-3 py-1.5 text-xs font-semibold ${status === v ? "bg-blue-600 text-white" : "text-slate-600"}`}>
                  {l}{n != null ? ` (${n})` : ""}
                </button>
              );
            })}
          </div>
          <div role="group" aria-label="Request type" className="inline-flex rounded-lg border border-slate-200 bg-white p-1">
            {TYPES.map(([v, l]) => (
              <button key={v} type="button" aria-pressed={type === v} onClick={() => setType(v)}
                className={`rounded-md px-3 py-1.5 text-xs font-semibold ${type === v ? "bg-slate-800 text-white" : "text-slate-600"}`}>{l}</button>
            ))}
          </div>
        </div>
        {notice && <p role="status" className="rounded-xl bg-emerald-50 px-4 py-2 text-sm text-emerald-900">{notice}</p>}
        {query.isError ? (
          <p role="alert" className="rounded-xl bg-rose-50 p-4 text-sm text-rose-800">{query.error?.message || "Requests could not be loaded."}{" "}
            <button type="button" className="underline" onClick={() => query.refetch()}>Retry</button></p>
        ) : query.isLoading ? (
          <div className="h-48 animate-pulse rounded-2xl bg-slate-100" aria-label="Loading requests" />
        ) : !data?.items.length ? (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-white py-12 text-center text-sm text-slate-500">
            {status === "pending" ? "All caught up — nothing is waiting for a decision." : "No requests here."}
          </div>
        ) : (
          <ul className="space-y-2" aria-label="Requests">
            {data.items.map((r) => (
              <li key={`${r.type}-${r.id}`} className="flex flex-wrap items-start justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="min-w-0 text-sm">
                  <p className="font-semibold text-slate-900">{r.employee_name} <span className="text-xs font-normal text-slate-500">{r.employee_code}{r.department ? ` · ${r.department}` : ""}</span></p>
                  <p className="text-slate-700">{formatDate(r.date)} · {what(r)}</p>
                  <p className="text-xs text-slate-500">
                    {r.type === "correction" ? REASONS[r.reason] || r.reason : r.reason}{r.reason_detail ? `: ${r.reason_detail}` : ""}
                    {r.status === "PENDING" && r.waiting_hours != null && <span className="ml-2 inline-flex items-center gap-1 text-amber-700"><Clock size={12} aria-hidden="true" /> waiting {waited(r.waiting_hours)}</span>}
                  </p>
                  {r.status !== "PENDING" && (
                    <p className="text-xs text-slate-500">{r.status === "APPROVED" ? "Approved" : "Refused"} by {r.decided_by_name || "—"}{r.decided_at ? ` · ${formatDateTime(r.decided_at)}` : ""}{r.decision_reason ? ` — ${r.decision_reason}` : ""}</p>
                  )}
                </div>
                {r.status === "PENDING" && (r.can_decide ? (
                  <div className="flex gap-2">
                    <button type="button" aria-label={`Approve ${r.type} for ${r.employee_name}`} onClick={() => setDeciding({ request: r, approve: true })}
                      className="inline-flex items-center gap-1 rounded-xl bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700"><CheckCircle2 size={14} aria-hidden="true" /> Approve</button>
                    <button type="button" aria-label={`Refuse ${r.type} for ${r.employee_name}`} onClick={() => setDeciding({ request: r, approve: false })}
                      className="inline-flex items-center gap-1 rounded-xl border border-rose-200 px-3 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-50"><XCircle size={14} aria-hidden="true" /> Refuse</button>
                  </div>
                ) : (
                  <span className="text-xs text-slate-500">{r.own ? "Your own request — someone else decides it" : "Not yours to decide"}</span>
                ))}
              </li>
            ))}
          </ul>
        )}
        {data && data.total > 0 && <Pager page={data.page} perPage={data.per_page} total={data.total} onPage={setPage} />}
      </div>
      {deciding && <DecideDialog request={deciding.request} approve={deciding.approve} onClose={() => setDeciding(null)}
        onDone={(text) => { setDeciding(null); setNotice(text); }} />}
    </HRPage>
  );
}
