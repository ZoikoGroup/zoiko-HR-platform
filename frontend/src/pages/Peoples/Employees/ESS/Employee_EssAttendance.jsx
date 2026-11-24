import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronLeft, ChevronRight, Download, RotateCcw, Search } from "lucide-react";
import EmployeePageShell from "../../../../components/employee/EmployeePageShell";
import PunchCard from "../../../../modules/zoiko-hr/attendance/components/PunchCard";
import ShiftInfoCard from "../../../../modules/zoiko-hr/attendance/components/ShiftInfoCard";
import AttendanceCalendar from "../../../../modules/zoiko-hr/attendance/components/AttendanceCalendar";
import AttendanceStatusChip from "../../../../modules/zoiko-hr/attendance/components/AttendanceStatusChip";
import DayDetailDrawer from "../../../../modules/zoiko-hr/attendance/components/DayDetailDrawer";
import { dayOffset, errorText, formatClockTime, formatMinutes, LEGEND, STATUS } from "../../../../modules/zoiko-hr/attendance/constants";
import NextDayHint from "../../../../modules/zoiko-hr/attendance/components/NextDayHint";
import ShiftNoticeBanner from "../../../../modules/zoiko-hr/attendance/components/ShiftNoticeBanner";
import {
  useEndBreak, useMyAttendanceMonth, useMyAttendanceToday, usePunchIn, usePunchOut, useStartBreak,
} from "../../../../modules/zoiko-hr/attendance/hooks/useMyAttendance";
import { formatDate } from "../../../../utils/dateTime";

const PAGE_SIZES = [10, 20];
const card = "rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-[#334155] dark:bg-[#1e293b]";
// one colour per meaning, readable in dark mode too; red only for a real problem
const TONE = {
  neutral: "text-slate-900 dark:text-white",
  warn: "text-amber-700 dark:text-amber-300",
  bad: "text-rose-700 dark:text-rose-300",
};

function shiftMonth(month, delta) {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function monthLabel(month) {
  const [y, m] = month.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("en-GB", { month: "long", year: "numeric" });
}

function Kpi({ label, value, hint, tone = "neutral" }) {
  return (
    <div className={`${card} flex h-full flex-col p-4 sm:p-5`}>
      <p className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">{label}</p>
      <p className={`mt-2 text-2xl font-black ${TONE[tone]}`}>{value}</p>
      {hint && <p className="mt-auto pt-1 text-[11px] font-medium text-slate-500 dark:text-slate-400">{hint}</p>}
    </div>
  );
}

function ErrorLine({ message, onRetry }) {
  return (
    <p role="alert" className="flex flex-wrap items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
      {message}
      <button type="button" onClick={onRetry} className="inline-flex items-center gap-1 font-semibold underline">
        <RotateCcw size={14} aria-hidden="true" /> Retry
      </button>
    </p>
  );
}

/**
 * Employee → My Attendance (attendance plan M3; cleaned up in the My Attendance plan, step 4): today (punch card and
 * shift, equal height), the month's summary with its period, a calendar that says each day's status in words, and
 * the month's records (status filter, search on the date as shown, sticky header, pages, cards on mobile). Times are
 * 12-hour; durations stay "7h 45m". Everything is the signed-in person's own data.
 */
export default function EmployeeEssAttendance() {
  const today = useMyAttendanceToday();
  const [month, setMonth] = useState(null);                     // null = the current month (server decides, by time zone)
  const monthQ = useMyAttendanceMonth(month);
  const data = monthQ.data;
  const thisMonth = data?.today?.slice(0, 7);                    // the server's current month, in the person's time zone
  const current = month || data?.month;
  const isCurrent = !month || month === thisMonth;
  const goMonth = (m) => setMonth(m && m === thisMonth ? null : m);
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [pageSize, setPageSize] = useState(PAGE_SIZES[0]);
  const [page, setPage] = useState(1);
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
  const tz = data?.timezone;
  const loadingOther = monthQ.isPlaceholderData;                  // another month is on its way: dim the old one
  const monthOptions = useMemo(() => {
    if (!thisMonth) return [];
    return Array.from({ length: 12 }, (_, i) => shiftMonth(thisMonth, -i));
  }, [thisMonth]);

  const rows = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return (data?.days || [])
      .filter((d) => !d.future && d.status)
      .filter((d) => filter === "all" || d.status === filter)
      .filter((d) => !needle || d.date.includes(needle) || formatDate(d.date).toLowerCase().includes(needle)
        || (STATUS[d.status]?.label || "").toLowerCase().includes(needle) || (d.shift || "").toLowerCase().includes(needle))
      .reverse();
  }, [data, filter, search]);
  useEffect(() => { setPage(1); }, [filter, search, pageSize, current]);
  const pages = Math.max(1, Math.ceil(rows.length / pageSize));
  const shown = rows.slice((page - 1) * pageSize, page * pageSize);
  const filterOptions = LEGEND.filter((s) => (data?.days || []).some((d) => d.status === s) || s === filter);

  const outText = (d) => {
    const t = formatClockTime(d.check_out, { empty: "" });
    return t && dayOffset(d.check_out_at, d.date, tz) > 0 ? `${t} (+1 day)` : t;
  };
  const exportCsv = () => {
    const cell = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const head = ["Date", "Status", "Shift", "Check in", "Check out", "Worked", "Breaks", "Late (min)", "Overtime"];
    const body = rows.map((d) => [d.date, STATUS[d.status]?.label || d.status, d.shift || "", formatClockTime(d.check_in, { empty: "" }), outText(d),
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

  const period = current ? `${monthLabel(current)}${isCurrent ? " so far" : ""}` : "This month";

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
        {/* today: punch card (2/3) and shift (1/3), the same height; placeholders the same size as the cards */}
        <div className="grid items-stretch gap-4 lg:grid-cols-3">
          <div className="min-h-[13rem] lg:col-span-2">
            {today.isError ? (
              <ErrorLine message={today.error?.message || "Today's attendance could not be loaded."} onRetry={() => today.refetch()} />
            ) : today.isLoading ? (
              <div className="h-full min-h-[13rem] motion-safe:animate-pulse rounded-2xl bg-slate-100 dark:bg-slate-800" aria-label="Loading today" />
            ) : (
              <PunchCard today={today.data} busy={busy} error={actionError}
                onPunchIn={act(punchIn)} onPunchOut={act(punchOut)} onStartBreak={act(startBreak)} onEndBreak={act(endBreak)} />
            )}
          </div>
          <div className="min-h-[13rem]">
            {today.data ? (
              <ShiftInfoCard shift={today.data.shift} timezone={today.data.timezone} requiredMinutes={today.data.required_minutes}
                nextChange={today.data.next_shift_change} />
            ) : today.isError ? (
              <p className={`${card} h-full p-5 text-sm text-slate-500`}>Your shift could not be loaded.</p>
            ) : (
              <div className="h-full min-h-[13rem] motion-safe:animate-pulse rounded-2xl bg-slate-100 dark:bg-slate-800" aria-label="Loading your shift" />
            )}
          </div>
        </div>

        {/* a shift notice to acknowledge (step 5): only while one is waiting */}
        <ShiftNoticeBanner notice={today.data?.pending_shift_notice} onAcknowledged={() => today.refetch()} />

        {/* the month's summary: one row, its period named, one definition per figure */}
        <section aria-labelledby="att-summary-title" className={loadingOther ? "opacity-60 transition-opacity" : "transition-opacity"}>
          <h2 id="att-summary-title" className="mb-3 text-sm font-semibold text-slate-700 dark:text-slate-200">{period}</h2>
          {monthQ.isError && !data ? (
            <ErrorLine message={monthQ.error?.message || "Your month could not be loaded."} onRetry={() => monthQ.refetch()} />
          ) : (
            <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6" aria-label={isCurrent ? "This month" : monthLabel(current)}>
              {/* B4/B5: attended working days of the days you were expected (approved leave excused); on-time punch-ins */}
              <Kpi label="Present days" value={k ? `${k.attended_days} / ${k.expected_days ?? k.working_days}` : "—"}
                hint={k?.attendance_rate != null ? `${k.attendance_rate}% of expected days${k.on_leave ? ` · ${k.on_leave} on leave` : ""}` : "No working days yet"} />
              <Kpi label="Absent days" value={k ? k.absent : "—"} tone={k?.absent ? "bad" : "neutral"}
                hint={k?.missed_punch ? `${k.missed_punch} missed punch-out` : null} />
              <Kpi label="Late arrivals" value={k ? k.late : "—"} tone={k?.late ? "warn" : "neutral"} />
              <Kpi label="Punctuality" value={k?.punctuality_rate != null ? `${k.punctuality_rate}%` : "—"}
                hint={k?.punched_days ? `${k.on_time_days} of ${k.punched_days} punch-ins on time` : null} />
              <Kpi label="Avg daily hours" value={k ? formatMinutes(k.avg_worked_minutes) : "—"} hint="Net of breaks" />
              {/* card and note read the same figure (overtime_minutes); approved overtime is a separate, smaller figure */}
              <Kpi label="Overtime" value={k ? formatMinutes(k.overtime_minutes) : "—"}
                hint={k ? `Beyond the standard day · ${formatMinutes(k.approved_overtime_minutes)} approved` : null} />
            </div>
          )}
        </section>

        <section aria-label="Month" className={`${card} p-4 sm:p-5 ${loadingOther ? "opacity-60" : ""}`}>
          <div className="mb-4 flex items-center justify-between">
            <button type="button" aria-label="Previous month" onClick={() => current && goMonth(shiftMonth(current, -1))}
              className="rounded-lg p-2 hover:bg-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:hover:bg-slate-700">
              <ChevronLeft size={18} aria-hidden="true" />
            </button>
            <h2 className="text-base font-semibold text-slate-900 dark:text-white" aria-live="polite">{current ? monthLabel(current) : "This month"}</h2>
            <button type="button" aria-label="Next month" disabled={!current || (data && current >= data.today.slice(0, 7))}
              onClick={() => current && goMonth(shiftMonth(current, 1))}
              className="rounded-lg p-2 hover:bg-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:opacity-30 dark:hover:bg-slate-700">
              <ChevronRight size={18} aria-hidden="true" />
            </button>
          </div>
          {monthQ.isError && !data ? (
            <ErrorLine message={monthQ.error?.message || "Your month could not be loaded."} onRetry={() => monthQ.refetch()} />
          ) : monthQ.isLoading ? (
            <div className="h-80 motion-safe:animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800" aria-label="Loading month" />
          ) : (
            <AttendanceCalendar days={data?.days} today={data?.today} timeZone={tz} selected={selected} onSelect={setSelected} />
          )}
        </section>

        <section aria-label="Attendance records" className={card}>
          <div className="flex flex-wrap items-end gap-3 border-b border-slate-100 p-4 dark:border-[#334155]">
            <h2 className="mr-auto text-base font-semibold text-slate-900 dark:text-white">History</h2>
            <label className="text-xs font-medium text-slate-600 dark:text-slate-300">Month
              <select value={current || ""} onChange={(e) => goMonth(e.target.value)} disabled={!monthOptions.length}
                className="mt-1 block rounded-lg border border-slate-200 bg-white px-2 py-2 text-sm dark:border-[#334155] dark:bg-[#0f172a]">
                {monthOptions.map((m) => <option key={m} value={m}>{monthLabel(m)}</option>)}
              </select>
            </label>
            <label className="text-xs font-medium text-slate-600 dark:text-slate-300">Status
              <select value={filter} onChange={(e) => setFilter(e.target.value)}
                className="mt-1 block rounded-lg border border-slate-200 bg-white px-2 py-2 text-sm dark:border-[#334155] dark:bg-[#0f172a]">
                <option value="all">All statuses</option>
                {filterOptions.map((s) => <option key={s} value={s}>{STATUS[s].label}</option>)}
              </select>
            </label>
            <label className="relative w-full text-xs font-medium text-slate-600 sm:w-auto dark:text-slate-300">Search
              <Search size={15} className="absolute bottom-2.5 left-2.5 text-slate-400" aria-hidden="true" />
              <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Date, status or shift"
                className="mt-1 block w-full rounded-lg border border-slate-200 bg-white py-2 pl-8 pr-3 text-sm sm:w-48 dark:border-[#334155] dark:bg-[#0f172a] focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500" />
            </label>
          </div>

          {monthQ.isError && !data ? (
            <div className="p-4"><ErrorLine message="The records could not be loaded." onRetry={() => monthQ.refetch()} /></div>
          ) : monthQ.isLoading ? (
            <div className="space-y-2 p-4" aria-label="Loading records">
              {Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-10 motion-safe:animate-pulse rounded-lg bg-slate-100 dark:bg-slate-800" />)}
            </div>
          ) : rows.length === 0 ? (
            <p className="p-8 text-center text-sm text-slate-500">
              {search || filter !== "all" ? "No records match. Try another status or search." : "No attendance records for this month yet."}
            </p>
          ) : (
            <>
              {/* desktop / tablet: a table with a sticky header */}
              <div className="hidden max-h-[32rem] overflow-auto md:block">
                <table className="min-w-full text-sm">
                  <thead className="sticky top-0 z-10 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500 dark:bg-[#0f172a] dark:text-slate-400">
                    <tr>
                      <th scope="col" className="px-4 py-3">Date</th><th scope="col" className="px-4 py-3">Shift</th>
                      <th scope="col" className="px-4 py-3">Check-in</th><th scope="col" className="px-4 py-3">Check-out</th>
                      <th scope="col" className="px-4 py-3">Break</th><th scope="col" className="px-4 py-3">Worked</th>
                      <th scope="col" className="px-4 py-3">Overtime</th><th scope="col" className="px-4 py-3">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-[#334155]">
                    {shown.map((d) => (
                      <tr key={d.date} className="cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/60" onClick={() => setSelected(d.date)}>
                        <td className="px-4 py-3"><button type="button" className="rounded font-medium text-blue-700 hover:underline dark:text-blue-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500" onClick={(e) => { e.stopPropagation(); setSelected(d.date); }}>{formatDate(d.date)}</button></td>
                        <td className="px-4 py-3 text-xs text-slate-600 dark:text-slate-300">{d.shift || "—"}</td>
                        <td className="whitespace-nowrap px-4 py-3 font-mono">
                          {formatClockTime(d.check_in)}
                          {d.late_minutes > 0 && <span className="ml-1 font-sans text-xs text-amber-700 dark:text-amber-300">{d.late_minutes}m late</span>}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 font-mono">
                          {formatClockTime(d.check_out)}
                          {dayOffset(d.check_out_at, d.date, tz) > 0 && <NextDayHint />}
                        </td>
                        <td className="px-4 py-3">{d.break_minutes ? formatMinutes(d.break_minutes) : "—"}</td>
                        <td className="px-4 py-3">{d.worked_minutes ? formatMinutes(d.worked_minutes) : "—"}</td>
                        <td className="px-4 py-3">{d.overtime_minutes ? formatMinutes(d.overtime_minutes) : "—"}</td>
                        <td className="px-4 py-3"><AttendanceStatusChip status={d.status} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {/* mobile: compact cards */}
              <ul aria-label="Attendance records list" className="divide-y divide-slate-100 md:hidden dark:divide-[#334155]">
                {shown.map((d) => (
                  <li key={d.date}>
                    <button type="button" onClick={() => setSelected(d.date)} className="flex w-full flex-col gap-1 px-4 py-3 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">
                      <span className="flex items-center justify-between gap-2">
                        <span className="font-medium text-slate-900 dark:text-white">{formatDate(d.date)}</span>
                        <AttendanceStatusChip status={d.status} />
                      </span>
                      <span className="text-xs text-slate-600 dark:text-slate-300">
                        {d.check_in ? `${formatClockTime(d.check_in)} – ${outText(d) || "—"}` : "No punches"}
                        {d.worked_minutes ? ` · ${formatMinutes(d.worked_minutes)}` : ""}
                        {d.shift ? ` · ${d.shift}` : ""}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
              <nav aria-label="Pages" className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 px-4 py-3 text-xs text-slate-600 dark:border-[#334155] dark:text-slate-300">
                <span>{(page - 1) * pageSize + 1}–{Math.min(page * pageSize, rows.length)} of {rows.length} days</span>
                <span className="flex items-center gap-2">
                  <label>Rows
                    <select value={pageSize} onChange={(e) => setPageSize(Number(e.target.value))}
                      className="ml-1 rounded border border-slate-200 bg-white px-1 py-1 dark:border-[#334155] dark:bg-[#0f172a]">
                      {PAGE_SIZES.map((n) => <option key={n} value={n}>{n}</option>)}
                      <option value={31}>All</option>
                    </select>
                  </label>
                  <button type="button" onClick={() => setPage((p) => p - 1)} disabled={page <= 1}
                    className="rounded border border-slate-200 px-2 py-1 disabled:opacity-40 dark:border-[#334155] focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">Previous</button>
                  <span>Page {page} of {pages}</span>
                  <button type="button" onClick={() => setPage((p) => p + 1)} disabled={page >= pages}
                    className="rounded border border-slate-200 px-2 py-1 disabled:opacity-40 dark:border-[#334155] focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">Next</button>
                </span>
              </nav>
            </>
          )}
        </section>
      </div>
      {selected && <DayDetailDrawer date={selected} onClose={() => setSelected(null)} />}
    </EmployeePageShell>
  );
}
