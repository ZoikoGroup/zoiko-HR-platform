import { Clock3 } from "lucide-react";
import { formatClockTime, timeIn } from "../constants";

/** The person's shift today: timing, grace and break allowance, and when the day is expected to end. */
export default function ShiftInfoCard({ shift, timezone, policy }) {
  return (
    <section aria-label="My shift" className="h-full rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-[#334155] dark:bg-[#1e293b]">
      <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-400"><Clock3 size={14} aria-hidden="true" /> My shift</p>
      {shift ? (
        <>
          <p className="mt-2 text-lg font-bold text-slate-900 dark:text-white">{shift.name}</p>
          <p className="font-mono text-sm text-slate-700 dark:text-slate-200">{formatClockTime(shift.start)} – {formatClockTime(shift.end)}{shift.crosses_midnight ? " (next day)" : ""}</p>
          <ul className="mt-3 space-y-1 text-xs text-slate-600 dark:text-slate-300">
            <li>{shift.grace_minutes} min grace before you count as late</li>
            {shift.break_minutes > 0 && <li>{shift.break_minutes} min break allowance</li>}
            <li>Standard day: {Math.round((shift.standard_minutes / 60) * 10) / 10} h</li>
            {shift.expected_end && <li>Expected end today: <span className="font-mono">{timeIn(shift.expected_end, timezone)}</span></li>}
          </ul>
        </>
      ) : (
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
          No shift is assigned to you, so nobody marks you late. Your hours count against a {Math.round(((policy?.standard_minutes || 480) / 60) * 10) / 10} h day.
          Ask HR if you work a fixed shift.
        </p>
      )}
    </section>
  );
}
