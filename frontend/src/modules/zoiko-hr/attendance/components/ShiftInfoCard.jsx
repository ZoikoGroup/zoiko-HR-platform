import { CalendarClock, Clock3 } from "lucide-react";
import { formatClockTime, formatMinutes, timeIn } from "../constants";
import { formatDate } from "../../../../utils/dateTime";

/** "General · 09:30 AM – 06:30 PM (next day)" pieces for a shift payload ({name, start, end, crosses_midnight}). */
function timing(s) {
  return `${formatClockTime(s.start)} – ${formatClockTime(s.end)}${s.crosses_midnight ? " (next day)" : ""}`;
}

/**
 * The person's shift today (My Attendance plan step 5): name and 12-hour timing, the hours today asks for, grace and
 * break allowance, when the day is expected to end, and the next shift change if one is scheduled. With no shift the
 * card says so plainly instead of showing figures that would look like a perfect record. Everything comes from the
 * server (`/hr/me/attendance/today`): nothing is recalculated here.
 *
 * @param {{ shift: object|null, timezone?: string, requiredMinutes?: number, nextChange?: {date: string, shift: object|null}|null }} props
 */
export default function ShiftInfoCard({ shift, timezone, requiredMinutes, nextChange }) {
  return (
    <section aria-label="My shift" className="flex h-full flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-[#334155] dark:bg-[#1e293b]">
      <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400"><Clock3 size={14} aria-hidden="true" /> My shift</p>
      {shift ? (
        <>
          <p className="mt-2 text-lg font-bold text-slate-900 dark:text-white">{shift.name}</p>
          <p className="font-mono text-sm text-slate-700 dark:text-slate-200">{timing(shift)}</p>
          <dl className="mt-3 grid grid-cols-[auto,1fr] gap-x-3 gap-y-1 text-xs text-slate-600 dark:text-slate-300">
            <dt>Required today</dt><dd className="font-semibold text-slate-800 dark:text-slate-100">{formatMinutes(requiredMinutes ?? shift.standard_minutes)}</dd>
            <dt>Grace</dt><dd>{shift.grace_minutes} min before you count as late</dd>
            {shift.break_minutes > 0 && (<><dt>Break</dt><dd>{shift.break_minutes} min allowance</dd></>)}
            {shift.expected_end && (<><dt>Expected end</dt><dd className="font-mono">{timeIn(shift.expected_end, timezone)}</dd></>)}
          </dl>
        </>
      ) : (
        <div className="mt-2 text-sm text-slate-700 dark:text-slate-200">
          <p className="font-semibold">No shift assigned yet. Contact HR.</p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Until then nobody marks you late, and your hours count against a {formatMinutes(requiredMinutes ?? 480)} day.
          </p>
        </div>
      )}
      {nextChange && (
        <p className="mt-auto flex items-start gap-2 border-t border-slate-100 pt-3 text-xs text-slate-700 dark:border-[#334155] dark:text-slate-200">
          <CalendarClock size={14} className="mt-0.5 shrink-0 text-blue-600" aria-hidden="true" />
          <span>
            <span className="font-semibold">From {formatDate(nextChange.date)}:</span>{" "}
            {nextChange.shift ? <>{nextChange.shift.name} · <span className="font-mono">{timing(nextChange.shift)}</span></> : "no shift assigned"}
          </span>
        </p>
      )}
    </section>
  );
}
