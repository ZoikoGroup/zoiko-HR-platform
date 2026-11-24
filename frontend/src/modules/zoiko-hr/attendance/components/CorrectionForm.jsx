import { useState } from "react";
import { Loader2, Plus, Send, X } from "lucide-react";
import { requestCorrection } from "../../../../service/workDocumentsService";

export const CORRECTION_KINDS = [
  ["missed_punch", "Missed punch", "I forgot to punch in or out"],
  ["time_change", "Wrong times", "My check-in or check-out time is wrong"],
  ["wrong_status", "Wrong status", "The day shows the wrong status"],
  ["break", "Breaks", "My breaks are wrong or missing"],
];
export const KIND_LABEL = Object.fromEntries(CORRECTION_KINDS.map(([v, l]) => [v, l]));
const STATUSES = [["present", "Present"], ["remote", "Worked remotely"], ["half_day", "Half day"]];
const REASONS = [["forgot", "Forgot to check in/out"], ["system_issue", "System issue"], ["off_site", "Working off-site"], ["other", "Other"]];
const input = "mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500";

/**
 * Ask for an attendance correction (attendance plan M4): a missed punch, wrong times, a wrong status or wrong breaks.
 * Times are your local times. The request goes to your manager or HR; the day changes only once it is approved, and
 * the original times are kept in the history.
 *
 * `initial` may carry {date, check_in, check_out, kind} to prefill from a calendar day. `hasRecord` false (a day
 * with no attendance record) makes the check-in required: there is no punch to keep.
 */
export default function CorrectionForm({ initial = {}, dateEditable = true, hasRecord, onSubmitted }) {
  const [form, setForm] = useState({
    date: initial.date || "", kind: initial.kind || "missed_punch",
    requested_check_in: initial.check_in || "", requested_check_out: initial.check_out || "",
    requested_status: "present", breaks: [{ start: "", end: "" }],
    reason: "forgot", reason_detail: "", confirm_accurate: false,
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const set = (patch) => setForm((f) => ({ ...f, ...patch }));
  const timesKind = form.kind === "missed_punch" || form.kind === "time_change";
  const ready = form.date && form.confirm_accurate && (form.reason !== "other" || form.reason_detail.trim())
    && (!timesKind || (form.requested_check_out && ((form.kind === "missed_punch" && hasRecord !== false) || form.requested_check_in)))
    && (form.kind !== "break" || form.breaks.every((b) => b.start && b.end));

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const body = { date: form.date, kind: form.kind, reason: form.reason, reason_detail: form.reason_detail || null,
      confirm_accurate: form.confirm_accurate };
    if (timesKind) {
      if (form.requested_check_in) body.requested_check_in = form.requested_check_in;
      body.requested_check_out = form.requested_check_out;
    }
    if (form.kind === "wrong_status") body.requested_status = form.requested_status;
    if (form.kind === "break") body.requested_breaks = form.breaks;
    try {
      const saved = await requestCorrection(body);
      onSubmitted?.(saved);
    } catch (err) {
      setError(err?.message || "The correction could not be sent.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} aria-label="Attendance correction" className="space-y-3 text-sm">
      <fieldset>
        <legend className="mb-1 font-medium">What is wrong?</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {CORRECTION_KINDS.map(([v, l, hint]) => (
            <label key={v} className={`flex cursor-pointer items-start gap-2 rounded-xl border p-2 ${form.kind === v ? "border-blue-500 bg-blue-50" : "border-slate-200"}`}>
              <input type="radio" name="kind" value={v} checked={form.kind === v} onChange={() => set({ kind: v })} className="mt-1 accent-blue-600" />
              <span><span className="font-semibold">{l}</span><span className="block text-xs text-slate-500">{hint}</span></span>
            </label>
          ))}
        </div>
      </fieldset>
      {dateEditable && (
        <label className="block">Date<input type="date" value={form.date} onChange={(e) => set({ date: e.target.value })} className={input} required /></label>
      )}
      {timesKind && (
        <div className="grid gap-2 sm:grid-cols-2">
          <label>Check-in{form.kind === "missed_punch" && hasRecord !== false ? " (leave empty to keep your punch)" : ""}
            <input type="time" value={form.requested_check_in} onChange={(e) => set({ requested_check_in: e.target.value })} className={input} /></label>
          <label>Check-out<input type="time" value={form.requested_check_out} onChange={(e) => set({ requested_check_out: e.target.value })} className={input} /></label>
        </div>
      )}
      {form.kind === "wrong_status" && (
        <label className="block">The day should be
          <select value={form.requested_status} onChange={(e) => set({ requested_status: e.target.value })} className={input}>
            {STATUSES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
          <span className="mt-1 block text-xs text-slate-500">For time off, apply for leave instead.</span>
        </label>
      )}
      {form.kind === "break" && (
        <fieldset>
          <legend className="mb-1 font-medium">Your breaks that day</legend>
          <ul className="space-y-2">
            {form.breaks.map((b, i) => (
              <li key={i} className="flex items-end gap-2">
                <label className="flex-1">From<input type="time" aria-label={`Break ${i + 1} start`} value={b.start}
                  onChange={(e) => set({ breaks: form.breaks.map((x, j) => (j === i ? { ...x, start: e.target.value } : x)) })} className={input} /></label>
                <label className="flex-1">To<input type="time" aria-label={`Break ${i + 1} end`} value={b.end}
                  onChange={(e) => set({ breaks: form.breaks.map((x, j) => (j === i ? { ...x, end: e.target.value } : x)) })} className={input} /></label>
                {form.breaks.length > 1 && (
                  <button type="button" aria-label={`Remove break ${i + 1}`} onClick={() => set({ breaks: form.breaks.filter((_, j) => j !== i) })}
                    className="mb-1 rounded-lg p-2 text-slate-500 hover:bg-slate-100"><X size={14} aria-hidden="true" /></button>
                )}
              </li>
            ))}
          </ul>
          {form.breaks.length < 6 && (
            <button type="button" onClick={() => set({ breaks: [...form.breaks, { start: "", end: "" }] })}
              className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-blue-700"><Plus size={12} aria-hidden="true" /> Add a break</button>
          )}
        </fieldset>
      )}
      <label className="block">Reason
        <select value={form.reason} onChange={(e) => set({ reason: e.target.value })} className={input}>
          {REASONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select></label>
      <label className="block">Details{form.reason === "other" ? " (required)" : " (optional)"}
        <input value={form.reason_detail} onChange={(e) => set({ reason_detail: e.target.value })} maxLength={1000} className={input} /></label>
      <label className="flex items-start gap-2"><input type="checkbox" checked={form.confirm_accurate} onChange={(e) => set({ confirm_accurate: e.target.checked })} className="mt-1 accent-blue-600" />
        I confirm the corrected details are accurate.</label>
      {error && <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-rose-800">{error}</p>}
      <button type="submit" disabled={busy || !ready}
        className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2 font-semibold text-white hover:bg-blue-700 disabled:opacity-50">
        {busy ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : <Send size={16} aria-hidden="true" />} Send correction
      </button>
    </form>
  );
}
