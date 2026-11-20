import { LEGEND, STATUS } from "../constants";

const WEEK = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/**
 * Month grid (Monday first) coloured by each day's status, with a legend. Clicking a past or current day opens its
 * details. `days` is the month view from the API ([{date, status, future, …}]).
 */
export default function AttendanceCalendar({ days = [], today, onSelect, selected }) {
  if (!days.length) return null;
  const first = new Date(`${days[0].date}T00:00:00`);
  const lead = (first.getDay() + 6) % 7;                    // blanks before the 1st (Monday = 0)
  return (
    <div>
      <div role="grid" aria-label="Attendance calendar" className="grid grid-cols-7 gap-1.5">
        {WEEK.map((w) => <div key={w} role="columnheader" className="pb-1 text-center text-[11px] font-bold uppercase text-slate-400">{w}</div>)}
        {Array.from({ length: lead }).map((_, i) => <div key={`b${i}`} aria-hidden="true" />)}
        {days.map((d) => {
          const meta = STATUS[d.status];
          const dayNum = Number(d.date.slice(8, 10));
          const isToday = d.date === today;
          const label = `${d.date}: ${meta ? meta.label : d.future ? "upcoming" : "no record"}`;
          return (
            <button key={d.date} type="button" role="gridcell" aria-label={label} aria-selected={selected === d.date}
              disabled={d.future} onClick={() => onSelect?.(d.date)}
              className={`relative flex h-14 flex-col items-center justify-center rounded-xl border text-sm transition-colors ${
                selected === d.date ? "border-blue-500 ring-2 ring-blue-200" : isToday ? "border-blue-400" : "border-slate-200"
              } ${d.future ? "cursor-default bg-slate-50 text-slate-300" : "bg-white text-slate-800 hover:bg-slate-50"}`}>
              <span className="font-semibold">{dayNum}</span>
              {meta && <span aria-hidden="true" className={`mt-1 h-2 w-6 rounded-full ${meta.cell}`} />}
            </button>
          );
        })}
      </div>
      <ul aria-label="Legend" className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600">
        {LEGEND.map((k) => (
          <li key={k} className="flex items-center gap-1.5"><span aria-hidden="true" className={`h-2 w-4 rounded-full ${STATUS[k].cell}`} />{STATUS[k].label}</li>
        ))}
      </ul>
    </div>
  );
}
