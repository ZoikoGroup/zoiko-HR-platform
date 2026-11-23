import { useCallback, useEffect, useState } from "react";
import { Pencil, Plus, Trash2, X } from "lucide-react";
import { createShift, deleteShift, getShifts, updateShift } from "../../../../service/hrService";
import { formatClockTime, formatMinutes } from "../constants";
import { ErrorBanner, PrimaryButton, SecondaryButton, inputCls } from "../../documents/generated/docUi";

// the backend's shift types (hr/models.py ShiftType); "Rotational" was offered before and always refused
export const SHIFT_TYPES = [["general", "General"], ["morning", "Morning"], ["evening", "Evening"], ["night", "Night"], ["flexi", "Flexi"]];
const DAYS = [["mon", "Mon"], ["tue", "Tue"], ["wed", "Wed"], ["thu", "Thu"], ["fri", "Fri"], ["sat", "Sat"], ["sun", "Sun"]];
const EMPTY = { name: "", shift_type: "general", start_time: "09:00", end_time: "18:00", grace_time_minutes: 10, break_duration_minutes: 60,
  standard_hours: "", working_days: [], half_day_min_minutes: "", min_present_minutes: "", is_overtime_eligible: true, description: "" };
const asList = (r) => (Array.isArray(r) ? r : r?.items || r?.data || []);

/** "General · 09:00 AM – 06:00 PM (next day)" */
export function shiftTiming(s) {
  const night = s.end_time && s.start_time && s.end_time <= s.start_time;
  return `${formatClockTime(s.start_time)} – ${formatClockTime(s.end_time)}${night ? " (next day)" : ""}`;
}

function toForm(s) {
  return { ...EMPTY, ...s, standard_hours: s.standard_hours ?? "", working_days: s.working_days || [],
    half_day_min_minutes: s.half_day_min_minutes ?? "", min_present_minutes: s.min_present_minutes ?? "", description: s.description || "" };
}

function toBody(f) {
  const num = (v) => (v === "" || v === null || v === undefined ? null : Number(v));
  return { name: f.name.trim(), shift_type: f.shift_type, start_time: f.start_time, end_time: f.end_time,
    grace_time_minutes: Number(f.grace_time_minutes) || 0, break_duration_minutes: Number(f.break_duration_minutes) || 0,
    standard_hours: num(f.standard_hours), working_days: f.working_days.length ? f.working_days : null,
    half_day_min_minutes: num(f.half_day_min_minutes), min_present_minutes: num(f.min_present_minutes),
    is_overtime_eligible: Boolean(f.is_overtime_eligible), description: f.description.trim() || null };
}

function ShiftForm({ initial, onSaved, onCancel }) {
  const [f, setF] = useState(() => toForm(initial || {}));
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }));
  const save = async (e) => {
    e.preventDefault();
    if (!f.name.trim()) { setError("Give the shift a name."); return; }
    if (f.min_present_minutes !== "" && f.half_day_min_minutes !== "" && Number(f.min_present_minutes) > Number(f.half_day_min_minutes)) {
      setError("The minimum to count the day can't be more than the half-day threshold."); return;
    }
    setBusy(true); setError(null);
    try {
      const saved = initial?.id ? await updateShift(initial.id, toBody(f)) : await createShift(toBody(f));
      onSaved(saved, Boolean(initial?.id));
    } catch (err) { setError(err?.message || "The shift was not saved."); setBusy(false); }
  };
  return (
    <form onSubmit={save} aria-label={initial?.id ? `Edit ${initial.name}` : "New shift"} noValidate
      className="space-y-3 rounded-2xl border border-blue-200 bg-blue-50/40 p-4 dark:border-blue-900 dark:bg-blue-950/20">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">{initial?.id ? `Edit ${initial.name}` : "New shift"}</h3>
        <button type="button" onClick={onCancel} aria-label="Close" className="rounded p-1 hover:bg-white"><X size={16} aria-hidden="true" /></button>
      </div>
      <ErrorBanner error={error} />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="text-sm">Name<input value={f.name} onChange={(e) => set("name", e.target.value)} maxLength={100} className={inputCls} /></label>
        <label className="text-sm">Type<select value={f.shift_type} onChange={(e) => set("shift_type", e.target.value)} className={inputCls}>
          {SHIFT_TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
        <label className="text-sm">Starts<input type="time" value={f.start_time} onChange={(e) => set("start_time", e.target.value)} className={inputCls} /></label>
        <label className="text-sm">Ends<input type="time" value={f.end_time} onChange={(e) => set("end_time", e.target.value)} className={inputCls} />
          <span className="text-xs text-slate-500">{f.start_time && f.end_time ? shiftTiming(f) : ""}</span></label>
        <label className="text-sm">Required hours a day<input type="number" min="0.25" max="24" step="0.25" value={f.standard_hours}
          onChange={(e) => set("standard_hours", e.target.value)} placeholder="Organization's" className={inputCls} /></label>
        <label className="text-sm">Grace (minutes)<input type="number" min="0" value={f.grace_time_minutes} onChange={(e) => set("grace_time_minutes", e.target.value)} className={inputCls} /></label>
        <label className="text-sm">Break allowance (minutes)<input type="number" min="0" value={f.break_duration_minutes} onChange={(e) => set("break_duration_minutes", e.target.value)} className={inputCls} /></label>
        <label className="text-sm">Half day below (minutes)<input type="number" min="0" value={f.half_day_min_minutes}
          onChange={(e) => set("half_day_min_minutes", e.target.value)} placeholder="Organization's" className={inputCls} /></label>
        <label className="text-sm">Counts as absent below (minutes)<input type="number" min="0" value={f.min_present_minutes}
          onChange={(e) => set("min_present_minutes", e.target.value)} placeholder="Organization's" className={inputCls} /></label>
      </div>
      <fieldset className="text-sm">
        <legend className="font-medium">Working days <span className="font-normal text-slate-500">(none ticked = the organization's working days; the rest are weekly offs)</span></legend>
        <div className="mt-1 flex flex-wrap gap-3">
          {DAYS.map(([v, l]) => (
            <label key={v} className="flex items-center gap-1"><input type="checkbox" className="accent-blue-600" checked={f.working_days.includes(v)}
              onChange={(e) => set("working_days", e.target.checked ? [...f.working_days, v] : f.working_days.filter((d) => d !== v))} />{l}</label>
          ))}
        </div>
      </fieldset>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="accent-blue-600" checked={f.is_overtime_eligible}
        onChange={(e) => set("is_overtime_eligible", e.target.checked)} /> Overtime can be requested on this shift</label>
      <label className="block text-sm">Description (optional)<input value={f.description} onChange={(e) => set("description", e.target.value)} className={inputCls} /></label>
      <div className="flex gap-2">
        <PrimaryButton type="submit" loading={busy}>{initial?.id ? "Save shift" : "Create shift"}</PrimaryButton>
        <SecondaryButton type="button" onClick={onCancel}>Cancel</SecondaryButton>
      </div>
    </form>
  );
}

/**
 * Shifts & Work Policy → Shifts: create and edit shifts (timing, required hours, working days / weekly off, grace,
 * break allowance, half-day and minimum-present thresholds), activate / deactivate, and delete a shift nobody uses.
 */
export default function ShiftsTab({ onToast }) {
  const [shifts, setShifts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [editing, setEditing] = useState(null);                 // null | {} (new) | shift
  const load = useCallback(() => {
    setLoading(true); setError(null);
    getShifts().then((r) => setShifts(asList(r))).catch((e) => setError(e?.message || "Shifts could not be loaded.")).finally(() => setLoading(false));
  }, []);
  useEffect(() => { load(); }, [load]);

  const toggle = async (s) => {
    try { await updateShift(s.id, { is_active: !s.is_active }); onToast("success", `“${s.name}” is ${s.is_active ? "inactive" : "active"} now.`); load(); }
    catch (e) { onToast("error", e?.message || "That didn't work."); }
  };
  const remove = async (s) => {
    if (typeof window !== "undefined" && !window.confirm(`Delete the shift “${s.name}”?`)) return;
    try { await deleteShift(s.id); onToast("success", `“${s.name}” was deleted.`); load(); }
    catch (e) { onToast("error", e?.message || "The shift was not deleted."); }   // in use: the server says to deactivate instead
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-600 dark:text-slate-300">Each shift sets the day's timing and what it asks of people. Empty values use the organization's work policy.</p>
        {!editing && <PrimaryButton icon={Plus} onClick={() => setEditing({})}>New shift</PrimaryButton>}
      </div>
      {editing && <ShiftForm key={editing.id || "new"} initial={editing} onCancel={() => setEditing(null)}
        onSaved={(s, updated) => { setEditing(null); onToast("success", `Shift “${s.name}” ${updated ? "saved" : "created"}.`); load(); }} />}
      <ErrorBanner error={error} />
      {loading ? <div className="h-32 motion-safe:animate-pulse rounded-2xl bg-slate-100" aria-label="Loading shifts" /> : shifts.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">No shifts yet. Create the first one.</p>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white dark:border-[#334155] dark:bg-[#1e293b]">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500 dark:bg-[#0f172a]">
              <tr><th className="px-4 py-3">Shift</th><th className="px-4 py-3">Timing</th><th className="px-4 py-3">Required</th>
                <th className="px-4 py-3">Working days</th><th className="px-4 py-3">Grace / break</th><th className="px-4 py-3">Status</th>
                <th className="px-4 py-3"><span className="sr-only">Actions</span></th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-[#334155]">
              {shifts.map((s) => (
                <tr key={s.id}>
                  <td className="px-4 py-3"><span className="font-medium">{s.name}</span>
                    <span className="block text-xs text-slate-500">{SHIFT_TYPES.find(([v]) => v === s.shift_type)?.[1] || s.shift_type}</span></td>
                  <td className="whitespace-nowrap px-4 py-3 font-mono text-xs">{shiftTiming(s)}</td>
                  <td className="px-4 py-3">{s.standard_hours ? formatMinutes(Number(s.standard_hours) * 60) : <span className="text-slate-500">Organization's</span>}</td>
                  <td className="px-4 py-3 text-xs">{s.working_days?.length ? s.working_days.map((d) => d[0].toUpperCase() + d.slice(1)).join(", ") : <span className="text-slate-500">Organization's</span>}</td>
                  <td className="px-4 py-3 text-xs">{s.grace_time_minutes} min / {s.break_duration_minutes} min</td>
                  <td className="px-4 py-3">
                    <button type="button" onClick={() => toggle(s)} aria-label={`${s.is_active ? "Deactivate" : "Activate"} ${s.name}`}
                      className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${s.is_active ? "bg-emerald-50 text-emerald-800" : "bg-slate-100 text-slate-600"}`}>
                      {s.is_active ? "Active" : "Inactive"}</button>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button type="button" onClick={() => setEditing(s)} aria-label={`Edit ${s.name}`} className="rounded p-1.5 hover:bg-slate-100"><Pencil size={15} aria-hidden="true" /></button>
                    <button type="button" onClick={() => remove(s)} aria-label={`Delete ${s.name}`} className="rounded p-1.5 text-rose-700 hover:bg-rose-50"><Trash2 size={15} aria-hidden="true" /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
