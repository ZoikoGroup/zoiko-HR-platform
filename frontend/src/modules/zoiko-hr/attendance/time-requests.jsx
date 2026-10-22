// Working time requests (Prompt 3 §C): overtime authorizations and attendance corrections waiting for a decision, the
// decision records they produce, publishing a shift pattern to many people (with a preview of who would receive a notice),
// and changing someone's shifts. Nobody can decide their own request; the server enforces it and returns a plain message.
import { useCallback, useEffect, useState } from "react";
import { CalendarClock, Check, Clock, Send, X } from "lucide-react";
import HRPage from "../../../components/HRPage";
import { Modal } from "../../../components/billing-ui";
import RecordDocumentsPanel, { blockedText } from "../../../components/documents/RecordDocumentsPanel";
import {
  changeShifts, decideCorrection, decideOvertime, getTimeRecordDocuments, getTimeSettings, listCorrections, listOvertime, publishRoster,
  updateTimeSettings,
} from "../../../service/workDocumentsService";
import { getShifts } from "../../../service/hrService";
import {
  EmployeePicker, ErrorBanner, PrimaryButton, SecondaryButton, Toast, fmtDate, fmtDateTime, inputCls, useToast,
} from "../documents/generated/docUi";

const TABS = [["overtime", "Overtime"], ["corrections", "Attendance corrections"], ["rosters", "Shift notices"], ["settings", "Settings"]];
const STATUS_TEXT = { PENDING: "Waiting", APPROVED: "Approved", REJECTED: "Refused", CANCELLED: "Cancelled" };
const REASONS = { forgot: "Forgot to check in/out", system_issue: "System issue", off_site: "Working off-site", other: "Other" };
const hhmm = (v) => (v ? String(v).slice(11, 16) : "—");

export default function TimeRequestsPage() {
  const [tab, setTab] = useState("overtime");
  const [toast, showToast] = useToast();
  return (
    <HRPage title="Working time requests" subtitle="Overtime, attendance corrections and shift notices, each with its decision record.">
      <Toast toast={toast} />
      <div role="tablist" aria-label="Working time" className="mb-4 flex flex-wrap gap-2">
        {TABS.map(([k, label]) => (
          <button key={k} role="tab" type="button" aria-selected={tab === k} onClick={() => setTab(k)}
            className={`rounded-xl px-3 py-1.5 text-sm font-semibold ${tab === k ? "bg-blue-600 text-white" : "bg-white text-slate-700 border border-slate-200"}`}>{label}</button>
        ))}
      </div>
      {tab === "overtime" && <RequestList kind="overtime" onToast={showToast} />}
      {tab === "corrections" && <RequestList kind="corrections" onToast={showToast} />}
      {tab === "rosters" && <RosterTools onToast={showToast} />}
      {tab === "settings" && <TimeSettings onToast={showToast} />}
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
                  <p className="text-slate-600">{r.start_time}–{r.end_time} ({r.hours} h) · {r.reason}
                    {!r.pre_approved && <span className="ml-1 rounded bg-amber-100 px-1.5 text-xs text-amber-900">Retrospective</span>}
                    {r.emergency && <span className="ml-1 rounded bg-red-100 px-1.5 text-xs text-red-900">Emergency</span>}</p>
                ) : (
                  <p className="text-slate-600">Recorded {hhmm(r.original_check_in)}–{hhmm(r.original_check_out)} → requested {hhmm(r.requested_check_in)}–{hhmm(r.requested_check_out)} · {REASONS[r.reason] || r.reason}{r.reason_detail ? `: ${r.reason_detail}` : ""}</p>
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

function RosterTools({ onToast }) {
  const [shifts, setShifts] = useState([]);
  const [form, setForm] = useState({ shift_id: "", employees: {}, start_date: "", end_date: "", weekdays: [0, 1, 2, 3, 4], location: "" });
  const [preview, setPreview] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [change, setChange] = useState({ employees: {}, new_shift_id: "", dates: "", reason: "", short_notice_reason: "" });
  useEffect(() => {
    getShifts().then((r) => setShifts(r?.items || r?.data || (Array.isArray(r) ? r : []))).catch(() => setShifts([]));
  }, []);
  const set = (k, v) => { setForm((f) => ({ ...f, [k]: v })); setPreview(null); };
  const body = () => ({ shift_id: Number(form.shift_id), employee_ids: Object.keys(form.employees).map(Number), start_date: form.start_date,
    end_date: form.end_date || null, weekdays: form.weekdays, location: form.location || null });

  const run = async (isPreview) => {
    if (!form.shift_id || !form.start_date || !Object.keys(form.employees).length) { setError("Choose a shift, a start date and at least one person."); return; }
    setBusy(true); setError(null);
    try {
      const r = await publishRoster({ ...body(), preview: isPreview });
      if (isPreview) setPreview(r);
      else { onToast("success", `Rostered and sent ${r.results.filter((x) => x.document_status === "ISSUED").length} shift notices.`); setPreview(null); }
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  };

  const submitChange = async () => {
    const ids = Object.keys(change.employees).map(Number);
    const dates = change.dates.split(",").map((s) => s.trim()).filter(Boolean);
    if (ids.length !== 1 || !change.new_shift_id || !dates.length || !change.reason.trim()) { setError("Choose one person, the new shift, the dates and a reason."); return; }
    setBusy(true); setError(null);
    try {
      const r = await changeShifts({ employee_id: ids[0], new_shift_id: Number(change.new_shift_id), dates, reason: change.reason,
        short_notice_reason: change.short_notice_reason || null });
      onToast("success", r.needs_approval ? "Short notice: the change notice is waiting for an HR approver." : "Shifts changed and the notice was sent.");
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  };

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <section className="rounded-2xl border border-slate-200 bg-white p-4" aria-label="Publish a shift pattern">
        <h2 className="mb-2 flex items-center gap-2 text-base font-semibold"><CalendarClock size={18} aria-hidden="true" /> Publish a shift pattern</h2>
        <ErrorBanner error={error} />
        <div className="grid gap-2 sm:grid-cols-2">
          <label className="text-sm">Shift<select value={form.shift_id} onChange={(e) => set("shift_id", e.target.value)} className={inputCls}>
            <option value="">Choose…</option>{shifts.map((s) => <option key={s.id} value={s.id}>{s.name} ({s.start_time}–{s.end_time})</option>)}</select></label>
          <label className="text-sm">Location<input value={form.location} onChange={(e) => set("location", e.target.value)} className={inputCls} /></label>
          <label className="text-sm">From<input type="date" value={form.start_date} onChange={(e) => set("start_date", e.target.value)} className={inputCls} /></label>
          <label className="text-sm">Until (optional)<input type="date" value={form.end_date} onChange={(e) => set("end_date", e.target.value)} className={inputCls} /></label>
        </div>
        <fieldset className="mt-2 flex flex-wrap gap-2 text-sm"><legend className="sr-only">Days</legend>
          {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d, i) => (
            <label key={d} className="flex items-center gap-1"><input type="checkbox" checked={form.weekdays.includes(i)} className="accent-blue-600"
              onChange={(e) => set("weekdays", e.target.checked ? [...form.weekdays, i].sort() : form.weekdays.filter((x) => x !== i))} />{d}</label>
          ))}
        </fieldset>
        <div className="mt-2"><EmployeePicker value={form.employees} onChange={(v) => set("employees", v)} idPrefix="roster-emp" /></div>
        {preview && (
          <div role="status" className="mt-2 rounded-lg border border-slate-200 bg-slate-50 p-2 text-sm">
            {preview.recipients} {preview.recipients === 1 ? "person" : "people"}; {preview.blocked ? `${preview.blocked} cannot receive a notice yet:` : "everyone can receive a notice."}
            <ul className="list-disc pl-5">{preview.results.filter((x) => x.outcome !== "ALLOW").map((x) => <li key={x.employee_id}>Employee #{x.employee_id}: {x.reasons.map(blockedText).join(" ")}</li>)}</ul>
          </div>
        )}
        <div className="mt-3 flex gap-2">
          <SecondaryButton loading={busy} onClick={() => run(true)}>Preview</SecondaryButton>
          <PrimaryButton loading={busy} icon={Send} disabled={!preview} onClick={() => run(false)}>Roster and send notices</PrimaryButton>
        </div>
      </section>
      <section className="rounded-2xl border border-slate-200 bg-white p-4" aria-label="Change shifts">
        <h2 className="mb-2 text-base font-semibold">Change someone's shifts</h2>
        <EmployeePicker value={change.employees} onChange={(v) => setChange((c) => ({ ...c, employees: v }))} idPrefix="change-emp" max={1} />
        <div className="mt-2 grid gap-2">
          <label className="text-sm">New shift<select value={change.new_shift_id} onChange={(e) => setChange((c) => ({ ...c, new_shift_id: e.target.value }))} className={inputCls}>
            <option value="">Choose…</option>{shifts.map((s) => <option key={s.id} value={s.id}>{s.name} ({s.start_time}–{s.end_time})</option>)}</select></label>
          <label className="text-sm">Dates (YYYY-MM-DD, comma separated)<input value={change.dates} onChange={(e) => setChange((c) => ({ ...c, dates: e.target.value }))} className={inputCls} /></label>
          <label className="text-sm">Reason<input value={change.reason} onChange={(e) => setChange((c) => ({ ...c, reason: e.target.value }))} className={inputCls} /></label>
          <label className="text-sm">Why the notice is short (needed when it is shorter than usual)<input value={change.short_notice_reason}
            onChange={(e) => setChange((c) => ({ ...c, short_notice_reason: e.target.value }))} className={inputCls} /></label>
        </div>
        <PrimaryButton className="mt-3" loading={busy} onClick={submitChange}>Change shifts and send notice</PrimaryButton>
      </section>
    </div>
  );
}

function TimeSettings({ onToast }) {
  const [v, setV] = useState({ standard_workday_hours: "", shift_change_notice_days: "" });
  const [fallback, setFallback] = useState(8);
  useEffect(() => {
    getTimeSettings().then((r) => { setFallback(r.fallback_standard_workday_hours); setV({ standard_workday_hours: r.standard_workday_hours ?? "", shift_change_notice_days: r.shift_change_notice_days ?? "" }); }).catch(() => {});
  }, []);
  const save = () => updateTimeSettings({ standard_workday_hours: v.standard_workday_hours === "" ? null : Number(v.standard_workday_hours),
    shift_change_notice_days: v.shift_change_notice_days === "" ? null : Number(v.shift_change_notice_days) })
    .then(() => onToast("success", "Working time settings saved.")).catch((e) => onToast("error", e.message));
  return (
    <section className="max-w-lg space-y-3 rounded-2xl border border-slate-200 bg-white p-4">
      <label className="block text-sm">Standard working day for timekeeping (hours)
        <input type="number" min="0" step="0.25" value={v.standard_workday_hours} onChange={(e) => setV({ ...v, standard_workday_hours: e.target.value })} className={inputCls} />
        <span className="text-xs text-slate-500">Used for overtime figures (a shift can override it). Until set, overtime analytics use {fallback} hours and the Working Hours Policy cannot be published.</span>
      </label>
      <label className="block text-sm">Normal notice for a shift change (days)
        <input type="number" min="0" value={v.shift_change_notice_days} onChange={(e) => setV({ ...v, shift_change_notice_days: e.target.value })} className={inputCls} />
        <span className="text-xs text-slate-500">A change on shorter notice needs a reason and an HR approver before the notice is sent.</span>
      </label>
      <PrimaryButton onClick={save}>Save</PrimaryButton>
    </section>
  );
}
