import { useEffect, useId, useRef, useState } from "react";
import { Loader2, X } from "lucide-react";
import { localDateValue, reminderSchedule } from "../validation";

/**
 * Send a reminder to upload missing documents (docs/new_docs/ZHR-DOCS-ARCH-001 §17 A2), now or at a chosen date and time
 * (QA R1-15: leave both empty to send now). One reminder per person per document per 24 hours: the server leaves out the
 * documents reminded about recently and refuses when nothing is left; its message is shown as-is.
 *
 * @param {{ open: boolean, who: string, what?: string,
 *           onSubmit: (v: { message?: string, scheduledFor?: string }) => Promise<any>, onClose: () => void }} props
 */
export default function ReminderDialog({ open, who, what, onSubmit, onClose }) {
  const titleId = useId();
  const [message, setMessage] = useState("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [errors, setErrors] = useState({});
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const first = useRef(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    if (!open) return undefined;
    setMessage(""); setDate(""); setTime(""); setErrors({}); setError(null); setBusy(false);
    const back = document.activeElement;
    first.current?.focus();
    const onKey = (e) => { if (e.key === "Escape") closeRef.current?.(); };
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("keydown", onKey); back?.focus?.(); };
  }, [open]);

  if (!open) return null;
  const scheduling = Boolean(date || time);
  const submit = async (e) => {
    e.preventDefault();
    const { scheduledFor, errors: found } = reminderSchedule(date, time);
    setErrors(found);
    if (found.schedule) return;
    setBusy(true);
    setError(null);
    try {
      await onSubmit({ message: message.trim() || undefined, scheduledFor: scheduledFor || undefined });
      closeRef.current?.();
    } catch (err) {
      setError(err?.message || "The reminder could not be sent.");
    } finally {
      setBusy(false);
    }
  };
  const field = "mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-[#334155] dark:bg-[#0f172a]";
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <form role="dialog" aria-modal="true" aria-labelledby={titleId} onSubmit={submit} onClick={(e) => e.stopPropagation()} noValidate
        className="w-full max-w-md rounded-2xl border border-gray-200/80 bg-white p-6 shadow-xl dark:border-[#334155] dark:bg-[#1e293b]">
        <div className="mb-3 flex items-start justify-between gap-3">
          <h2 id={titleId} className="text-lg font-semibold text-slate-900 dark:text-[#f1f5f9]">Send a reminder to {who}</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-lg p-1 text-slate-500 hover:bg-slate-100"><X size={18} aria-hidden="true" /></button>
        </div>
        <p className="mb-3 text-sm text-slate-600">{what || "They will be asked to upload every required document that is missing or needs a new copy."}</p>
        <label htmlFor={`${titleId}-msg`} className="block text-sm font-medium text-slate-700">Note (optional)</label>
        <textarea id={`${titleId}-msg`} ref={first} rows={3} maxLength={500} value={message} onChange={(e) => setMessage(e.target.value)}
          className={field} />
        <fieldset className="mt-3" aria-describedby={`${titleId}-when-help`}>
          <legend className="text-sm font-medium text-slate-700">Send on (optional)</legend>
          <div className="mt-1 grid grid-cols-1 gap-2 sm:grid-cols-2">
            <label className="text-xs text-slate-600" htmlFor={`${titleId}-date`}>Date
              <input id={`${titleId}-date`} type="date" value={date} min={localDateValue(new Date())}
                onChange={(e) => { setDate(e.target.value); setErrors({}); }} className={field}
                aria-invalid={Boolean(errors.schedule)} />
            </label>
            <label className="text-xs text-slate-600" htmlFor={`${titleId}-time`}>Time
              <input id={`${titleId}-time`} type="time" value={time} onChange={(e) => { setTime(e.target.value); setErrors({}); }}
                className={field} aria-invalid={Boolean(errors.schedule)} />
            </label>
          </div>
          <p id={`${titleId}-when-help`} className="mt-1 text-xs text-slate-500">
            {scheduling ? "Sent at this time, in your time zone." : "Leave empty to send it now."}
            {scheduling && (
              <button type="button" onClick={() => { setDate(""); setTime(""); setErrors({}); }} className="ml-2 font-semibold text-blue-700 hover:underline">
                Send now instead
              </button>
            )}
          </p>
          {errors.schedule && <p role="alert" className="mt-1 text-xs text-rose-700">{errors.schedule}</p>}
        </fieldset>
        {error && <p role="alert" className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-800">{error}</p>}
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">Cancel</button>
          <button type="submit" disabled={busy} className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60">
            {busy && <Loader2 size={16} className="animate-spin" aria-hidden="true" />} {scheduling ? "Schedule reminder" : "Send reminder"}
          </button>
        </div>
      </form>
    </div>
  );
}
