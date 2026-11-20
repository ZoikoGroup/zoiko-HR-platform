import { useEffect, useRef, useState } from "react";
import { Plus, X } from "lucide-react";
import { STATUS } from "../constants";

const STATUS_CHOICES = ["present", "late", "half_day", "absent", "on_leave", "remote", "holiday", "weekly_off"];
const NO_TIME = ["absent", "on_leave", "holiday", "weekly_off"];
const input = "mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm";

/**
 * Add or edit an attendance record (attendance plan M5). Times are the employee's local times. Leaving "Status" on
 * "Work it out from the times" lets the rules decide (late, half day, …); choosing one locks it. A reason is required
 * and kept in the record's history.
 */
export default function RecordFormDialog({ mode, record, employees = [], onSubmit, onClose }) {
  const editing = mode === "edit";
  const [form, setForm] = useState(() => ({
    employee_id: record?.employee_id ? String(record.employee_id) : "", date: record?.date || "",
    status: editing && record?.status_locked ? record.status : "",
    check_in: record?.check_in_time || "", check_out: record?.check_out_time || "",
    breaks: (record?.breaks || []).map((b) => ({ start: b.start || "", end: b.end || "" })),
    notes: record?.notes || "", reason: "", unlock_status: false,
  }));
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const set = (patch) => setForm((f) => ({ ...f, ...patch }));
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") closeRef.current(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);
  const noTimes = NO_TIME.includes(form.status);
  const ready = form.reason.trim().length >= 3 && (editing || (form.employee_id && form.date));

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const body = { reason: form.reason.trim(), notes: form.notes || null };
    if (!editing) Object.assign(body, { employee_id: Number(form.employee_id), date: form.date });
    if (form.status) body.status = form.status;
    if (form.unlock_status) body.unlock_status = true;
    if (!noTimes) {
      body.check_in = form.check_in || null;
      body.check_out = form.check_out || null;
      body.breaks = form.breaks.filter((b) => b.start && b.end);
    }
    try {
      await onSubmit(body);
      onClose();
    } catch (err) {
      setError(err?.code === "ATT_EXISTS" ? "This person already has a record for that day. Edit it instead." : err?.message || "Not saved.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <form role="dialog" aria-modal="true" aria-label={editing ? "Edit attendance record" : "Add attendance record"} onSubmit={submit}
        onClick={(e) => e.stopPropagation()} className="max-h-[90vh] w-full max-w-lg space-y-3 overflow-auto rounded-2xl bg-white p-6 text-sm shadow-2xl">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold">{editing ? `Edit ${record?.employee_name || "record"} · ${record?.date}` : "Add attendance record"}</h2>
          <button type="button" aria-label="Close" onClick={onClose} className="rounded p-1 text-slate-500 hover:bg-slate-100"><X size={18} aria-hidden="true" /></button>
        </div>
        {!editing && (
          <div className="grid gap-3 sm:grid-cols-2">
            <label>Employee
              <select value={form.employee_id} onChange={(e) => set({ employee_id: e.target.value })} className={input} required>
                <option value="">Choose…</option>
                {employees.map((emp) => <option key={emp.id} value={emp.id}>{`${emp.first_name || ""} ${emp.last_name || ""}`.trim() || emp.email}</option>)}
              </select></label>
            <label>Date<input type="date" value={form.date} onChange={(e) => set({ date: e.target.value })} className={input} required /></label>
          </div>
        )}
        <label className="block">Status
          <select value={form.status} onChange={(e) => set({ status: e.target.value, unlock_status: false })} className={input}>
            <option value="">Work it out from the times</option>
            {STATUS_CHOICES.map((s) => <option key={s} value={s}>{STATUS[s]?.label || s}</option>)}
          </select>
          {form.status && <span className="mt-1 block text-xs text-slate-500">A chosen status is kept as is; automatic processing will not change it.</span>}
        </label>
        {editing && record?.status_locked && !form.status && (
          <label className="flex items-center gap-2"><input type="checkbox" checked={form.unlock_status} onChange={(e) => set({ unlock_status: e.target.checked })} />
            Go back to the status worked out from the times</label>
        )}
        {noTimes ? (
          <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">{STATUS[form.status]?.label} days have no check-in or breaks; any times are cleared.</p>
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-2">
              <label>Check-in<input type="time" value={form.check_in} onChange={(e) => set({ check_in: e.target.value })} className={input} /></label>
              <label>Check-out<input type="time" value={form.check_out} onChange={(e) => set({ check_out: e.target.value })} className={input} /></label>
            </div>
            <fieldset>
              <legend className="mb-1 font-medium">Breaks</legend>
              {form.breaks.map((b, i) => (
                <div key={i} className="mb-2 flex items-end gap-2">
                  <label className="flex-1">From<input type="time" aria-label={`Break ${i + 1} start`} value={b.start}
                    onChange={(e) => set({ breaks: form.breaks.map((x, j) => (j === i ? { ...x, start: e.target.value } : x)) })} className={input} /></label>
                  <label className="flex-1">To<input type="time" aria-label={`Break ${i + 1} end`} value={b.end}
                    onChange={(e) => set({ breaks: form.breaks.map((x, j) => (j === i ? { ...x, end: e.target.value } : x)) })} className={input} /></label>
                  <button type="button" aria-label={`Remove break ${i + 1}`} onClick={() => set({ breaks: form.breaks.filter((_, j) => j !== i) })}
                    className="mb-1 rounded p-2 text-slate-500 hover:bg-slate-100"><X size={14} aria-hidden="true" /></button>
                </div>
              ))}
              {form.breaks.length < 6 && (
                <button type="button" onClick={() => set({ breaks: [...form.breaks, { start: "", end: "" }] })}
                  className="inline-flex items-center gap-1 text-xs font-semibold text-blue-700"><Plus size={12} aria-hidden="true" /> Add a break</button>
              )}
            </fieldset>
          </>
        )}
        <label className="block">Notes<textarea value={form.notes} onChange={(e) => set({ notes: e.target.value })} rows={2} className={input} /></label>
        <label className="block">Reason for this {editing ? "change" : "record"} (required)
          <input value={form.reason} onChange={(e) => set({ reason: e.target.value })} maxLength={1000} className={input}
            placeholder="e.g. Badge reader was down" />
          <span className="mt-1 block text-xs text-slate-500">Kept in the record's history with your name.</span>
        </label>
        {error && <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-rose-800">{error}</p>}
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="rounded-xl border border-slate-200 px-4 py-2 font-medium">Cancel</button>
          <button type="submit" disabled={!ready || busy} className="rounded-xl bg-blue-600 px-4 py-2 font-semibold text-white hover:bg-blue-700 disabled:opacity-50">
            {editing ? "Save changes" : "Add record"}
          </button>
        </div>
      </form>
    </div>
  );
}
