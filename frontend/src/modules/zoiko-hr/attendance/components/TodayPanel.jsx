import { useEffect, useState } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { useAttendanceToday } from "../hooks/useAttendanceToday";
import { timeIn } from "../constants";

const TILES = [
  ["total", "Total", "text-slate-900"], ["present", "Present", "text-emerald-700"], ["late", "Late", "text-amber-700"],
  ["not_checked_in", "Not checked in", "text-rose-700"], ["on_leave", "On leave", "text-blue-700"], ["remote", "Remote", "text-teal-700"],
  ["on_break", "On a break", "text-slate-700"], ["off", "Off today", "text-slate-500"],
];

/**
 * Live "Today" (attendance plan M6): who is working, late, on leave, remote, off or not checked in, by department,
 * and the people expected who have not punched in (overdue first). Refreshes every minute.
 */
export default function TodayPanel() {
  const [departmentId, setDepartmentId] = useState("");
  const query = useAttendanceToday(departmentId ? { department_id: departmentId } : {});
  const t = query.data;
  // the department choices come from the unfiltered answer (no extra request)
  const [departments, setDepartments] = useState([]);
  useEffect(() => {
    if (t && !departmentId) setDepartments(t.by_department.filter((d) => d.department_id).map((d) => ({ id: d.department_id, name: d.department })));
  }, [t, departmentId]);
  return (
    <section aria-label="Today" className="mb-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-bold text-slate-900">Today</h2>
          <p className="text-xs text-slate-500">
            {t ? `${t.date} · ${t.timezone}${t.holiday ? " · Holiday" : ""} · updated ${timeIn(t.as_of, t.timezone)}` : "Live attendance"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select aria-label="Department for today" value={departmentId} onChange={(e) => setDepartmentId(e.target.value)}
            className="rounded-lg border border-slate-200 px-2 py-1.5 text-sm">
            <option value="">All departments</option>
            {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
          <button type="button" aria-label="Refresh today" onClick={() => query.refetch()} className="rounded-lg p-2 text-slate-600 hover:bg-slate-100">
            <RefreshCw size={16} className={query.isFetching ? "animate-spin" : ""} aria-hidden="true" />
          </button>
        </div>
      </div>
      {query.isError ? (
        <p role="alert" className="text-sm text-rose-700">{query.error?.message || "Today could not be loaded."}{" "}
          <button type="button" className="underline" onClick={() => query.refetch()}>Retry</button></p>
      ) : !t ? (
        <div className="h-24 animate-pulse rounded-xl bg-slate-100" aria-label="Loading today" />
      ) : (
        <div className="space-y-5">
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-8">
            {TILES.map(([k, label, tone]) => (
              <div key={k} className="rounded-xl bg-slate-50 p-3">
                <dt className="text-[11px] font-bold uppercase tracking-wider text-slate-500">{label}</dt>
                <dd className={`mt-1 text-2xl font-black ${tone}`}>{t[k] ?? 0}</dd>
              </div>
            ))}
          </dl>
          <p className="text-sm text-slate-600">
            {t.attendance_rate != null ? `${t.attendance_rate}% of the ${t.expected} people expected today are in.` : "Nobody is expected today."}
            {t.missed_punch > 0 && ` ${t.missed_punch} missed punch-out.`}
          </p>
          <p className="text-xs text-slate-500" aria-label="Last closed day">
            {t.last_closed
              ? `Last closed day: ${t.last_closed.date}${t.last_closed.missed_punches ? ` · ${t.last_closed.missed_punches} missed punch-out${t.last_closed.missed_punches === 1 ? "" : "s"}` : ""}. Absences, leave and days off are written automatically after each day ends.`
              : "No day has been closed yet. After each day ends, absences, leave and days off are written automatically."}
          </p>
          <div className="grid gap-5 lg:grid-cols-2">
            <div>
              <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-500">By department</h3>
              <ul className="space-y-2" aria-label="By department">
                {t.by_department.map((d) => {
                  const pct = d.total ? Math.round((100 * d.attended) / d.total) : 0;
                  return (
                    <li key={d.department} className="text-sm">
                      <div className="flex justify-between"><span className="font-medium">{d.department}</span>
                        <span className="text-slate-500">{d.attended}/{d.total} in{d.late ? ` · ${d.late} late` : ""}{d.on_leave ? ` · ${d.on_leave} on leave` : ""}{d.not_checked_in ? ` · ${d.not_checked_in} not in` : ""}</span></div>
                      <div className="mt-1 h-2 rounded-full bg-slate-100"><div className="h-2 rounded-full bg-emerald-500" style={{ width: `${pct}%` }} /></div>
                    </li>
                  );
                })}
              </ul>
            </div>
            <div>
              <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-500">Not checked in yet ({t.not_checked_in})</h3>
              {t.not_checked_in_list.length === 0 ? (
                <p className="text-sm text-emerald-700">Everyone expected so far has checked in.</p>
              ) : (
                <ul className="max-h-64 divide-y divide-slate-100 overflow-auto text-sm" aria-label="Not checked in yet">
                  {t.not_checked_in_list.map((w) => (
                    <li key={w.employee_id} className="flex items-center justify-between py-1.5">
                      <span>{w.overdue && <AlertTriangle size={14} className="mr-1 inline text-amber-600" aria-label="Overdue" />}{w.name}
                        <span className="ml-1 text-xs text-slate-500">{w.department}</span></span>
                      <span className="font-mono text-xs text-slate-500">{w.shift_start ? `shift ${w.shift_start}` : "no shift"}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
