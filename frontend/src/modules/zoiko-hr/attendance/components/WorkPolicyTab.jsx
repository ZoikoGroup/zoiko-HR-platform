import { useEffect, useState } from "react";
import { getTimeSettings, updateTimeSettings } from "../../../../service/workDocumentsService";
import { getShifts } from "../../../../service/hrService";
import { formatClockTime } from "../constants";
import { PrimaryButton, inputCls } from "../../documents/generated/docUi";

const NUMBERS = ["standard_workday_hours", "half_day_min_hours", "min_present_hours", "grace_minutes", "edit_lock_days",
  "shift_change_notice_days", "default_shift_id"];
const SWITCHES = ["overtime_requires_approval", "auto_close_punch_out", "allow_web_punch"];
const asList = (r) => (Array.isArray(r) ? r : r?.items || r?.data || []);

/**
 * Shifts & Work Policy → Work policy (My Attendance plan step 6): the organization's attendance rules in one place —
 * the standard day, half-day and minimum-present thresholds, grace, default shift, overtime approval, closing missed
 * punch-outs, web punching, the edit lock and the notice for shift changes. A shift can override the day-level ones.
 * Saved through the existing /hr/time/settings (moved here from Working time requests → Settings).
 */
export default function WorkPolicyTab({ onToast }) {
  const [v, setV] = useState(null);
  const [fallback, setFallback] = useState(8);
  const [shifts, setShifts] = useState([]);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    getTimeSettings().then((r) => {
      setFallback(r.fallback_standard_workday_hours);
      // the three switches default to on (hr/work_settings.py)
      setV(Object.fromEntries([...NUMBERS.map((k) => [k, r[k] ?? ""]), ...SWITCHES.map((k) => [k, r[k] ?? true])]));
    }).catch((e) => { onToast?.("error", e?.message || "The work policy could not be loaded."); setV({}); });
    getShifts().then((r) => setShifts(asList(r).filter((s) => s.is_active !== false))).catch(() => setShifts([]));
  }, [onToast]);
  if (!v) return <div className="h-64 animate-pulse rounded-2xl bg-slate-100" aria-label="Loading the work policy" />;

  const set = (k, x) => setV((o) => ({ ...o, [k]: x }));
  const num = (x) => (x === "" || x === null || x === undefined ? null : Number(x));
  const thresholdError = v.min_present_hours !== "" && v.half_day_min_hours !== "" && Number(v.min_present_hours) > Number(v.half_day_min_hours)
    ? "The minimum to count the day cannot be more than the half-day threshold." : "";
  const save = async () => {
    if (thresholdError) { onToast("error", thresholdError); return; }
    setBusy(true);
    try {
      await updateTimeSettings({ ...Object.fromEntries(NUMBERS.map((k) => [k, num(v[k])])), ...Object.fromEntries(SWITCHES.map((k) => [k, Boolean(v[k])])) });
      onToast("success", "Work policy saved.");
    } catch (e) { onToast("error", e?.message || "The work policy was not saved."); }
    finally { setBusy(false); }
  };
  const field = (k, label, hint, props = {}) => (
    <label className="block text-sm">{label}
      <input type="number" min="0" value={v[k]} onChange={(e) => set(k, e.target.value)} className={inputCls} {...props} />
      {hint && <span className={`text-xs ${props["aria-invalid"] ? "text-rose-600" : "text-slate-500"}`}>{hint}</span>}
    </label>
  );
  const toggle = (k, label, hint) => (
    <label className="flex items-start gap-2 text-sm">
      <input type="checkbox" className="mt-0.5 accent-blue-600" checked={Boolean(v[k])} onChange={(e) => set(k, e.target.checked)} />
      <span>{label}<span className="block text-xs text-slate-500">{hint}</span></span>
    </label>
  );

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <section aria-label="Working day" className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 dark:border-[#334155] dark:bg-[#1e293b]">
        <h2 className="text-base font-semibold">Working day</h2>
        {field("standard_workday_hours", "Standard working day for timekeeping (hours)",
          `Used for overtime figures (a shift can override it). Until set, overtime analytics use ${fallback} hours.`, { step: "0.25" })}
        {field("half_day_min_hours", "Half-day threshold (hours)", "A finished day with less net work than this counts as a half day.", { step: "0.25" })}
        {field("min_present_hours", "Minimum worked time for the day to count (hours)",
          thresholdError || "A finished day with less net work than this counts as absent; from here up to the half-day threshold it is a half day.",
          { step: "0.25", "aria-invalid": thresholdError ? "true" : undefined })}
        {field("grace_minutes", "Grace before a check-in is late (minutes)", "Used when the shift sets no grace of its own.")}
        <label className="block text-sm">Default shift
          <select value={v.default_shift_id ?? ""} onChange={(e) => set("default_shift_id", e.target.value)} className={inputCls}>
            <option value="">None (nobody is late without a shift)</option>
            {shifts.map((s) => <option key={s.id} value={s.id}>{s.name} ({formatClockTime(s.start_time)} – {formatClockTime(s.end_time)})</option>)}
          </select>
          <span className="text-xs text-slate-500">For people with no roster entry or assigned shift.</span>
        </label>
      </section>
      <section aria-label="Rules" className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 dark:border-[#334155] dark:bg-[#1e293b]">
        <h2 className="text-base font-semibold">Rules</h2>
        {toggle("overtime_requires_approval", "Overtime counts only when approved", "Time beyond the standard day is overtime once an overtime request is approved.")}
        {toggle("auto_close_punch_out", "Close missed punch-outs at the end of the day", "Days with no punch-out become Missed punch-out (0 hours) until corrected.")}
        {toggle("allow_web_punch", "Employees may punch in the browser", "Turn off if attendance comes only from devices or HR.")}
        {field("edit_lock_days", "Lock past attendance after (days)", "Empty: past days can always be edited (with a reason).")}
        {field("shift_change_notice_days", "Normal notice for a shift change (days)", "A change on shorter notice needs a reason and an HR approver before the notice is sent.")}
        <PrimaryButton loading={busy} onClick={save}>Save</PrimaryButton>
      </section>
    </div>
  );
}
