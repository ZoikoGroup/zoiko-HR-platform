import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronLeft, ChevronRight, Download, Search } from "lucide-react";
import EmployeePageShell from "../../../../components/employee/EmployeePageShell";
import PunchCard from "../../../../modules/zoiko-hr/attendance/components/PunchCard";
import ShiftInfoCard from "../../../../modules/zoiko-hr/attendance/components/ShiftInfoCard";
import AttendanceCalendar from "../../../../modules/zoiko-hr/attendance/components/AttendanceCalendar";
import AttendanceStatusChip from "../../../../modules/zoiko-hr/attendance/components/AttendanceStatusChip";
import DayDetailDrawer from "../../../../modules/zoiko-hr/attendance/components/DayDetailDrawer";
import { dayOffset, errorText, formatClockTime, formatMinutes, STATUS } from "../../../../modules/zoiko-hr/attendance/constants";
import NextDayHint from "../../../../modules/zoiko-hr/attendance/components/NextDayHint";
import {
  useEndBreak, useMyAttendanceMonth, useMyAttendanceToday, usePunchIn, usePunchOut, useStartBreak,
} from "../../../../modules/zoiko-hr/attendance/hooks/useMyAttendance";
import { formatDate } from "../../../../utils/dateTime";

const FILTERS = [["all", "All"], ["present", "Present"], ["late", "Late"], ["absent", "Absent"]];

function shiftMonth(month, delta) {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function monthLabel(month) {
  const [y, m] = month.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("en-GB", { month: "long", year: "numeric" });
}

function Kpi({ label, value, hint, tone = "text-slate-900" }) {
  return (
    <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm dark:border-[#334155] dark:bg-[#1e293b]">
      <p className="text-xs font-bold uppercase tracking-wider text-slate-400">{label}</p>
      <p className={`mt-2 text-2xl font-black ${tone} dark:text-white`}>{value}</p>
      {hint && <p className="mt-1 text-[11px] font-medium text-slate-500">{hint}</p>}
    </div>
  );
}

/**
 * Employee → My Attendance (attendance plan M3): punch in / out with breaks, the shift, KPIs over working days only, a
 * colour-coded month with day details, and the month's records. Everything is the signed-in person's own data.
 */
export default function EmployeeEssAttendance() {
  const today = useMyAttendanceToday();
  const [month, setMonth] = useState(null);                     // null = the current month (server decides, by time zone)
  const monthQ = useMyAttendanceMonth(month);
  const data = monthQ.data;
  const current = month || data?.month;
  const thisMonth = data?.today?.slice(0, 7);                    // the server's current month, in the person's time zone
  const goMonth = (m) => setMonth(m && m === thisMonth ? null : m);
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState(null);
  const [actionError, setActionError] = useState(null);
  const punchIn = usePunchIn();
  const punchOut = usePunchOut();
  const startBreak = useStartBreak();
  const endBreak = useEndBreak();
  const busy = punchIn.isPending || punchOut.isPending || startBreak.isPending || endBreak.isPending;
  const act = (m) => async () => {
    setActionError(null);
    try { await m.mutateAsync(); } catch (e) { setActionError(errorText(e)); }
  };

  const k = data?.kpis;
  const rows = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return (data?.days || [])
      .filter((d) => !d.future && d.status)
      .filter((d) => filter === "all" || d.status === filter)
      .filter((d) => !needle || d.date.includes(needle) || (STATUS[d.status]?.label || "").toLowerCase().includes(needle)
        || (d.shift || "").toLowerCase().includes(needle))
      .reverse();
  }, [data, filter, search]);

  const exportCsv = () => {
    const cell = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const head = ["Date", "Status", "Shift", "Check in", "Check out", "Worked", "Breaks", "Late (min)", "Beyond standard"];
    const out = (d) => {
      const t = formatClockTime(d.check_out, { empty: "" });
      return t && dayOffset(d.check_out_at, d.date, data?.timezone) > 0 ? `${t} (+1 day)` : t;
    };
    const body = rows.map((d) => [d.date, STATUS[d.status]?.label || d.status, d.shift || "", formatClockTime(d.check_in, { empty: "" }), out(d),
      formatMinutes(d.worked_minutes), formatMinutes(d.break_minutes), d.late_minutes || 0, formatMinutes(d.overtime_minutes)]);
    const csv = [head, ...body].map((r) => r.map(cell).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `my_attendance_${current || "month"}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <EmployeePageShell title="My Attendance" subtitle="Punch in and out, see your month and keep your record right."
      actions={(
        <div className="flex flex-wrap gap-2">
          <Link to="/employee/ess/time-requests" className="rounded-xl border border-white/20 bg-white/10 px-4 py-2.5 text-sm font-medium text-white hover:bg-white/15">Time Requests</Link>
          <button type="button" onClick={exportCsv} disabled={!rows.length}
            className="flex items-center gap-2 rounded-xl border border-white/20 bg-white/10 px-4 py-2.5 text-sm font-medium text-white hover:bg-white/15 disabled:opacity-50">
            <Download size={16} aria-hidden="true" /> Export CSV
          </button>
        </div>
      )}>
      <div className="space-y-6">
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="lg:col-span-2">
            {today.isError ? (
              <p role="alert" className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
                {today.error?.message || "Today's attendance could not be loaded."}{" "}
                <button type="button" className="underline" onClick={() => today.refetch()}>Retry</button>
              </p>
            ) : today.isLoading ? (
              <div className="h-48 animate-pulse rounded-2xl bg-slate-100" aria-label="Loading today" />
            ) : (
              <PunchCard today={today.data} busy={busy} error={actionError}
                onPunchIn={act(punchIn)} onPunchOut={act(punchOut)} onStartBreak={act(startBreak)} onEndBreak={act(endBreak)} />
            )}
          </div>
          {today.data ? (
            <ShiftInfoCard shift={today.data.shift} timezone={today.data.timezone} policy={data?.policy} />
          ) : today.isError ? (
            <p className="rounded-2xl border border-slate-200 bg-white p-5 text-sm text-slate-500">Your shift could not be loaded.</p>
          ) : (
            <div className="h-48 animate-pulse rounded-2xl bg-slate-100" aria-label="Loading your shift" />
          )}
        </div>

        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6" aria-label="This month">
          <Kpi label="Present days" value={k ? `${k.attended_days} / ${k.working_days}` : "—"} hint={k?.attendance_rate != null ? `${k.attendance_rate}% of working days` : "No working days yet"} />
          <Kpi label="Punctuality" value={k?.punctuality_rate != null ? `${k.punctuality_rate}%` : "—"} hint={k ? `${k.present + k.remote} on time` : null} />
          <Kpi label="Late arrivals" value={k ? k.late : "—"} tone={k?.late ? "text-amber-700" : "text-slate-900"} />
          <Kpi label="Absent days" value={k ? k.absent : "—"} tone={k?.absent ? "text-rose-700" : "text-slate-900"}
            hint={k?.missed_punch ? `${k.missed_punch} missed punch-out` : null} />
          <Kpi label="Avg daily hours" value={k ? formatMinutes(k.avg_worked_minutes) : "—"} hint="Net of breaks" />
          {/* card and note read the same figure (overtime_minutes); approved overtime is a separate, smaller figure */}
          <Kpi label="Overtime" value={k ? formatMinutes(k.overtime_minutes) : "—"}
            hint={k ? `Beyond the standard day · ${formatMinutes(k.approved_overtime_minutes)} approved` : null} />
        </div>

        <section aria-label="Month" className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-[#334155] dark:bg-[#1e293b]">
          <div className="mb-4 flex items-center justify-between">
            <button type="button" aria-label="Previous month" onClick={() => current && goMonth(shiftMonth(current, -1))} className="rounded-lg p-2 hover:bg-slate-100"><ChevronLeft size={18} aria-hidden="true" /></button>
            <h2 className="text-base font-semibold text-slate-900 dark:text-white">{current ? monthLabel(current) : "This month"}</h2>
            <button type="button" aria-label="Next month" disabled={!current || (data && current >= data.today.slice(0, 7))}
              onClick={() => current && goMonth(shiftMonth(current, 1))} className="rounded-lg p-2 hover:bg-slate-100 disabled:opacity-30"><ChevronRight size={18} aria-hidden="true" /></button>
          </div>
          {monthQ.isError ? (
            <p role="alert" className="text-sm text-rose-700">{monthQ.error?.message || "Your month could not be loaded."} <button type="button" className="underline" onClick={() => monthQ.refetch()}>Retry</button></p>
          ) : monthQ.isLoading ? (
            <div className="h-72 animate-pulse rounded-xl bg-slate-100" aria-label="Loading month" />
          ) : (
            <AttendanceCalendar days={data?.days} today={data?.today} selected={selected} onSelect={setSelected} />
          )}
        </section>

        <section aria-label="Attendance records" className="rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-[#334155] dark:bg-[#1e293b]">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 p-4">
            <div role="tablist" aria-label="Filter records" className="inline-flex rounded-lg border border-slate-200 p-1">
              {FILTERS.map(([v, l]) => (
                <button key={v} type="button" role="tab" aria-selected={filter === v} onClick={() => setFilter(v)}
                  className={`rounded-md px-3 py-1.5 text-xs font-semibold ${filter === v ? "bg-blue-600 text-white" : "text-slate-600"}`}>{l}</button>
              ))}
            </div>
            <label className="relative">
              <span className="sr-only">Search records</span>
              <Search size={15} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" aria-hidden="true" />
              <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search date, status, shift"
                className="w-56 rounded-lg border border-slate-200 py-2 pl-8 pr-3 text-sm" />
            </label>
          </div>
          {rows.length === 0 ? (
            <p className="p-8 text-center text-sm text-slate-500">{monthQ.isLoading ? "Loading…" : "No attendance records found for this month."}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                  <tr><th className="px-4 py-3">Date</th><th className="px-4 py-3">Shift</th><th className="px-4 py-3">Check in</th><th className="px-4 py-3">Check out</th>
                    <th className="px-4 py-3">Worked</th><th className="px-4 py-3">Breaks</th><th className="px-4 py-3">Status</th></tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {rows.map((d) => (
                    <tr key={d.date} className="cursor-pointer hover:bg-slate-50" onClick={() => setSelected(d.date)}>
                      <td className="px-4 py-3"><button type="button" className="font-medium text-blue-700 hover:underline" onClick={(e) => { e.stopPropagation(); setSelected(d.date); }}>{formatDate(d.date)}</button></td>
                      <td className="px-4 py-3 text-xs text-slate-600">{d.shift || "—"}</td>
                      <td className="px-4 py-3 font-mono">{formatClockTime(d.check_in)}</td>
                      <td className="px-4 py-3 font-mono">
                        {formatClockTime(d.check_out)}
                        {dayOffset(d.check_out_at, d.date, data?.timezone) > 0 && <NextDayHint />}
                      </td>
                      <td className="px-4 py-3">{d.worked_minutes ? formatMinutes(d.worked_minutes) : "—"}</td>
                      <td className="px-4 py-3">{d.break_minutes ? formatMinutes(d.break_minutes) : "—"}</td>
                      <td className="px-4 py-3"><AttendanceStatusChip status={d.status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
      {selected && <DayDetailDrawer date={selected} onClose={() => setSelected(null)} />}
    </EmployeePageShell>
  );
}
