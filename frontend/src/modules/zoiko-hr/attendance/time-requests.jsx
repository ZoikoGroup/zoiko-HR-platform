// Working time requests (Prompt 3 §C): overtime authorizations and attendance corrections waiting for a decision, the
// decision records they produce, publishing a shift pattern to many people (with a preview of who would receive a notice),
// and changing someone's shifts. Nobody can decide their own request; the server enforces it and returns a plain message.
import { correctionSummary, formatClockTime } from "./constants";
import { useCallback, useEffect, useState } from "react";
import { Check, Clock, X } from "lucide-react";
import { Link } from "react-router-dom";
import HRPage from "../../../components/HRPage";
import { Modal } from "../../../components/billing-ui";
import RecordDocumentsPanel from "../../../components/documents/RecordDocumentsPanel";
import {
  decideCorrection, decideOvertime, getTimeRecordDocuments, listCorrections, listOvertime,
} from "../../../service/workDocumentsService";
import {
  ErrorBanner, PrimaryButton, SecondaryButton, Toast, fmtDate, fmtDateTime, inputCls, useToast,
} from "../documents/generated/docUi";

// shift notices and the working-time settings moved to Shifts & Work Policy (My Attendance plan step 6)
const TABS = [["overtime", "Overtime"], ["corrections", "Attendance corrections"]];
const STATUS_TEXT = { PENDING: "Waiting", APPROVED: "Approved", REJECTED: "Refused", CANCELLED: "Cancelled" };
const REASONS = { forgot: "Forgot to check in/out", system_issue: "System issue", off_site: "Working off-site", other: "Other" };
const hhmm = (v) => formatClockTime(v);

export default function TimeRequestsPage() {
  const [tab, setTab] = useState("overtime");
  const [toast, showToast] = useToast();
  return (
    <HRPage title="Working time requests" subtitle="Overtime and attendance corrections, each with its decision record.">
      <Toast toast={toast} />
      <div role="tablist" aria-label="Working time" className="mb-4 flex flex-wrap gap-2">
        {TABS.map(([k, label]) => (
          <button key={k} role="tab" type="button" aria-selected={tab === k} onClick={() => setTab(k)}
            className={`rounded-xl px-3 py-1.5 text-sm font-semibold ${tab === k ? "bg-blue-600 text-white" : "bg-white text-slate-700 border border-slate-200"}`}>{label}</button>
        ))}
      </div>
      {tab === "overtime" && <RequestList kind="overtime" onToast={showToast} />}
      {tab === "corrections" && <RequestList kind="corrections" onToast={showToast} />}
      <p className="mt-4 text-sm text-slate-600">
        Shift patterns, shift change notices and working-time settings are in{" "}
        <Link to="/zoiko-hr/attendance/shifts" className="font-semibold text-blue-700 underline">Shifts &amp; Work Policy</Link>.
      </p>
    </HRPage>
  );
}

function RequestList({ kind, onToast }) {
  const [status, setStatus] = useState("PENDING");
  const [items, setItems] = useState([]);
  const [error, setError] = useState(null);
  const [deciding, setDeciding] = useState(null);
  const [open, setOpen] = useState(null);
  const overtime = kind === "overtime";
  const load = useCallback(() => {
    setError(null);
    (overtime ? listOvertime : listCorrections)({ status }).then((r) => setItems(r?.items || [])).catch((e) => setError(e.message));
  }, [overtime, status]);
  useEffect(() => { load(); }, [load]);

  return (
    <div className="space-y-3">
      <label className="text-sm">Show
        <select value={status} onChange={(e) => setStatus(e.target.value)} className={`${inputCls} ml-2 inline-block w-auto`}>
          <option value="PENDING">Waiting for a decision</option><option value="APPROVED">Approved</option><option value="REJECTED">Refused</option><option value="">All</option>
        </select>
      </label>
      <ErrorBanner error={error} />
      <ul className="divide-y divide-slate-100 rounded-2xl border border-slate-200 bg-white" aria-label={overtime ? "Overtime requests" : "Corrections"}>
        {items.length === 0 && <li className="p-4 text-sm text-slate-500">Nothing here.</li>}
        {items.map((r) => (
          <li key={r.id} className="p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="text-sm">
                <p className="font-medium text-slate-900">Employee #{r.employee_id} · {fmtDate(r.date)}</p>
                {overtime ? (
                  <p className="text-slate-600">{formatClockTime(r.start_time)}–{formatClockTime(r.end_time)} ({r.hours} h) · {r.reason}
                    {!r.pre_approved && <span className="ml-1 rounded bg-amber-100 px-1.5 text-xs text-amber-900">Retrospective</span>}
                    {r.emergency && <span className="ml-1 rounded bg-red-100 px-1.5 text-xs text-red-900">Emergency</span>}</p>
                ) : (
                  <p className="text-slate-600">Recorded {hhmm(r.original_check_in)}–{hhmm(r.original_check_out)} → {correctionSummary(r)} · {REASONS[r.reason] || r.reason}{r.reason_detail ? `: ${r.reason_detail}` : ""}</p>
                )}
                <p className="text-xs text-slate-500">{STATUS_TEXT[r.status] || r.status}{r.decided_at ? ` · ${fmtDateTime(r.decided_at)}` : ""}{r.decision_reason ? ` · ${r.decision_reason}` : ""}</p>
              </div>
              <div className="flex gap-2">
                {r.status === "PENDING" && <>
                  <PrimaryButton icon={Check} onClick={() => setDeciding({ row: r, approve: true })}>Approve</PrimaryButton>
                  <SecondaryButton icon={X} tone="danger" onClick={() => setDeciding({ row: r, approve: false })}>Refuse</SecondaryButton>
                </>}
                {r.status !== "PENDING" && <SecondaryButton onClick={() => setOpen(open === r.id ? null : r.id)}>{open === r.id ? "Hide record" : "Decision record"}</SecondaryButton>}
              </div>
            </div>
            {open === r.id && (
              <div className="mt-3"><RecordDocumentsPanel title="Decision record" hrLink
                load={() => getTimeRecordDocuments(overtime ? "overtime_request" : "attendance_correction", r.id)} /></div>
            )}
          </li>
        ))}
      </ul>
      <DecisionModal state={deciding} overtime={overtime} onClose={() => setDeciding(null)}
        onDone={(msg) => { setDeciding(null); onToast("success", msg); load(); }} onError={(m) => onToast("error", m)} />
    </div>
  );
}

function DecisionModal({ state, overtime, onClose, onDone, onError }) {
  const [reason, setReason] = useState("");
  const [method, setMethod] = useState("per_policy");
  const [busy, setBusy] = useState(false);
  useEffect(() => { setReason(""); setMethod("per_policy"); setBusy(false); }, [state]);
  if (!state) return null;
  const submit = async () => {
    if (!state.approve && !reason.trim()) { onError("Give a reason when refusing."); return; }
    setBusy(true);
    try {
      const body = { approve: state.approve, reason: reason.trim() || null, ...(overtime && state.approve ? { compensation_method: method } : {}) };
      await (overtime ? decideOvertime : decideCorrection)(state.row.id, body);
      onDone(state.approve ? "Approved. The decision record was sent to the employee." : "Refused. The employee can see the reason.");
    } catch (e) { onError(e.message || "Could not record the decision."); setBusy(false); }
  };
  return (
    <Modal open onClose={busy ? undefined : onClose} icon={Clock} title={state.approve ? "Approve request" : "Refuse request"}
      footer={<><SecondaryButton onClick={onClose} disabled={busy}>Cancel</SecondaryButton><PrimaryButton loading={busy} onClick={submit}>Confirm</PrimaryButton></>}>
      {overtime && state.approve && (
        <label className="block text-sm">How is it compensated?
          <select value={method} onChange={(e) => setMethod(e.target.value)} className={inputCls}>
            <option value="per_policy">As set out in policy</option><option value="pay">Paid</option><option value="time_off">Time off in lieu</option>
          </select>
        </label>
      )}
      <label className="mt-3 block text-sm">{state.approve ? "Comment (optional)" : "Reason (required)"}
        <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} className={inputCls} />
      </label>
    </Modal>
  );
}
