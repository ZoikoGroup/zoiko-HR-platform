import { useId } from "react";
import { LEGEND, STATUS, dayOffset, formatClockTime, formatMinutes } from "../constants";

const WEEK = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/** What a cell shows: the day's status, or for a future day an approved leave or a holiday (shown, not counted). */
function shownStatus(d) {
  if (d.status) return d.status;
  if (d.future && d.holiday) return "holiday";
  if (d.future && d.leave_type) return "on_leave";
  return null;
}

/** "Late · In 09:40 AM · Out 06:00 PM · 7h 20m" (12-hour, "+1 day" for an overnight check-out). */
function tooltipText(d, status, timeZone) {
  const parts = [STATUS[status]?.label || (d.future ? "Upcoming" : "No record")];
  if (d.future && status) parts[0] = `${parts[0]} (planned)`;
  if (d.check_in) parts.push(`In ${formatClockTime(d.check_in)}`);
  if (d.check_out) parts.push(`Out ${formatClockTime(d.check_out)}${dayOffset(d.check_out_at, d.date, timeZone) > 0 ? " (+1 day)" : ""}`);
  if (d.worked_minutes) parts.push(formatMinutes(d.worked_minutes));
  return parts.join(" · ");
}

/**
 * Month grid (Monday first). Each day shows its status in words (and colour), today is ringed and labelled, and a
 * tooltip on hover or keyboard focus gives the 12-hour in / out times and hours. Future holidays and approved leave are
 * shown as planned. The legend lists only the statuses this month has. Clicking a past or current day opens it.
 * `days` is the month view from the API ([{date, status, future, holiday, leave_type, check_in, check_out, …}]).
 */
export default function AttendanceCalendar({ days = [], today, onSelect, selected, timeZone }) {
  const uid = useId();
  if (!days.length) return null;
  const first = new Date(`${days[0].date}T00:00:00`);
  const lead = (first.getDay() + 6) % 7;                    // blanks before the 1st (Monday = 0)
  const used = new Set(days.map(shownStatus).filter(Boolean));
  const legend = LEGEND.filter((k) => used.has(k));
  return (
    <div>
      <div role="grid" aria-label="Attendance calendar" className="grid grid-cols-7 gap-1 sm:gap-1.5">
        {WEEK.map((w) => <div key={w} role="columnheader" className="pb-1 text-center text-[11px] font-bold uppercase text-slate-400">{w}</div>)}
        {Array.from({ length: lead }).map((_, i) => <div key={`b${i}`} aria-hidden="true" />)}
        {days.map((d) => {
          const status = shownStatus(d);
          const meta = STATUS[status];
          const dayNum = Number(d.date.slice(8, 10));
          const isToday = d.date === today;
          const tipId = `${uid}-${d.date}`;
          const label = `${d.date}: ${STATUS[d.status]?.label || (d.future ? "upcoming" : "no record")}`;
          return (
            <div key={d.date} className="group relative">
              <button type="button" role="gridcell" aria-label={label} aria-selected={selected === d.date}
                aria-describedby={tipId} aria-current={isToday ? "date" : undefined}
                disabled={d.future} onClick={() => onSelect?.(d.date)}
                className={`flex h-14 w-full flex-col items-center justify-center rounded-xl border text-sm transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 sm:h-16 ${
                  selected === d.date ? "border-blue-500 ring-2 ring-blue-200" : isToday ? "border-blue-500 ring-1 ring-blue-500" : "border-slate-200 dark:border-[#334155]"
                } ${meta ? meta.tint : d.future ? "bg-slate-50 text-slate-300 dark:bg-slate-800/50" : "bg-white text-slate-800 dark:bg-[#1e293b] dark:text-slate-100"} ${
                  d.future ? "cursor-default opacity-80" : "hover:brightness-95"}`}>
                <span className="font-semibold leading-none">{dayNum}</span>
                {meta && <span className="mt-1 text-[10px] font-semibold uppercase leading-none tracking-wide sm:text-[11px]">{meta.short}</span>}
                {isToday && <span className="mt-0.5 text-[9px] font-bold uppercase leading-none text-blue-700 dark:text-blue-300">Today</span>}
              </button>
              <span id={tipId} role="tooltip"
                className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-1 hidden w-max max-w-[16rem] -translate-x-1/2 rounded-lg bg-slate-900 px-2.5 py-1.5 text-xs text-white shadow-lg group-hover:block group-focus-within:block">
                {tooltipText(d, status, timeZone)}
              </span>
            </div>
          );
        })}
      </div>
      {legend.length > 0 && (
        <ul aria-label="Legend" className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600 dark:text-slate-300">
          {legend.map((k) => (
            <li key={k} className="flex items-center gap-1.5">
              <span aria-hidden="true" className={`rounded px-1 text-[10px] font-semibold uppercase ${STATUS[k].tint}`}>{STATUS[k].short}</span>
              {STATUS[k].label}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
