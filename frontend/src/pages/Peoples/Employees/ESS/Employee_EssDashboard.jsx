import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Calendar, Clock, AlertCircle, Award, Sparkles, PlusCircle, Receipt, Plane, User, FileText, ChevronRight, RefreshCw, Loader2, CheckCircle2,
} from "lucide-react";
import EmployeePageShell from "../../../../components/employee/EmployeePageShell";
import EmployeeStatusBadge from "../../../../components/employee/EmployeeStatusBadge";
import {
  getMyProfile, getLeaveBalances, getLeaveRequests, getAttendanceRecords, getEss, getHolidays, getTravel, getTravelExpenses,
} from "../../../../service/employee";
import { getStoredUser } from "../../../../service/api";
import { formatDate } from "../../../../utils/dateTime";
import { formatLeaveType } from "../../../../utils/leaveTypeUtils";
import {
  firstNameOf, greetingFor, monthStart, leaveTotals, attendanceSummary, pendingCount, upcomingHolidays, inDaysText, recentLeaves,
} from "../../../../utils/essDashboard";

const asList = (r) => (Array.isArray(r) ? r : r?.items || r?.data?.items || r?.data || []);
const ok = (settled) => (settled.status === "fulfilled" ? settled.value : null);

const card = "bg-white dark:bg-[#1e293b] rounded-2xl border border-slate-200 dark:border-[#334155] shadow-sm";

function Kpi({ icon: Icon, tint, label, children, foot }) {
  return (
    <div className={`${card} p-6 hover:shadow-md transition group`}>
      <div className="flex items-center justify-between">
        <span className="text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-[#94a3b8]">{label}</span>
        <div className={`p-2.5 rounded-xl group-hover:scale-110 transition ${tint}`}><Icon className="w-5 h-5" /></div>
      </div>
      <div className="mt-4">{children}</div>
      {foot}
    </div>
  );
}

function Bar({ pct, color }) {
  return (
    <div className="w-full bg-slate-100 dark:bg-[#0f172a] rounded-full h-2 mt-3 overflow-hidden" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
      <div className={`${color} h-2 rounded-full transition-all duration-500`} style={{ width: `${pct}%` }} />
    </div>
  );
}

function Shortcut({ icon: Icon, color, title, sub, onClick }) {
  return (
    <button type="button" onClick={onClick} className="p-4 rounded-xl bg-slate-50 dark:bg-[#0f172a] border border-slate-200 dark:border-[#334155] hover:border-blue-500 hover:bg-blue-50/50 dark:hover:bg-blue-500/10 text-left transition group">
      <Icon className={`w-5 h-5 mb-2 group-hover:scale-110 transition ${color}`} />
      <p className="text-xs font-bold text-slate-900 dark:text-[#f1f5f9]">{title}</p>
      <p className="text-[10px] text-slate-500 dark:text-[#94a3b8]">{sub}</p>
    </button>
  );
}

export default function EssDashboard() {
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [partial, setPartial] = useState(false);
  const mounted = useRef(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const me = getStoredUser()?.id;
    const settled = await Promise.allSettled([
      getMyProfile(),
      me ? getLeaveBalances(me) : Promise.resolve([]),
      me ? getLeaveRequests(me) : Promise.resolve([]),
      getAttendanceRecords({ employee_id: me, per_page: 100, date_from: monthStart() }),
      me ? getEss(me) : Promise.resolve([]),
      getHolidays(),
      me ? getTravel(me) : Promise.resolve([]),
      me ? getTravelExpenses(me) : Promise.resolve([]),
    ]);
    if (!mounted.current) return;
    const [profile, balances, leaves, attendance, ess, holidays, trips, claims] = settled.map(ok);
    if (!profile && settled[0].status === "rejected") {
      setError(settled[0].reason?.message || "Failed to load your dashboard");
      setLoading(false);
      return;
    }
    setPartial(settled.some((s) => s.status === "rejected"));
    setData({
      profile: profile?.data || profile || {},
      balances: asList(balances),
      leaves: asList(leaves),
      attendance: asList(attendance),
      ess: asList(ess),
      holidays: asList(holidays),
      trips: asList(trips),
      claims: asList(claims),
    });
    setLoading(false);
  }, []);

  useEffect(() => {
    mounted.current = true;
    load();
    return () => { mounted.current = false; };
  }, [load]);

  const view = useMemo(() => {
    if (!data) return null;
    const leave = leaveTotals(data.balances);
    const att = attendanceSummary(data.attendance);
    const waiting = pendingCount({ leaves: data.leaves, ess: data.ess, trips: data.trips, claims: data.claims });
    const holidays = upcomingHolidays(data.holidays);
    const leaves = recentLeaves(data.leaves);
    const activity = [
      ...data.ess.filter((r) => r.type || r.leave_type || r.requestType).map((r) => ({
        action: `${r.type || r.requestType || r.leave_type} request`, date: r.createdAt || r.created_at || r.raised, status: r.status,
      })),
      ...data.attendance.filter((r) => r.date).slice(0, 10).map((r) => ({
        action: `Attendance marked: ${String(r.status || "").replace("_", " ")}`, date: r.date, status: "Done",
      })),
    ].sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0)).slice(0, 6);
    return { leave, att, waiting, holidays, leaves, activity };
  }, [data]);

  const shell = (children) => (
    <EmployeePageShell variant="plain" title="Employee Self Service" subtitle="Your personal overview for today.">{children}</EmployeePageShell>
  );

  if (loading && !data) {
    return shell(
      <div className="flex justify-center items-center py-24" role="status">
        <Loader2 className="w-7 h-7 text-blue-600 animate-spin" />
        <span className="ml-3 text-sm text-slate-500 dark:text-[#94a3b8] font-medium">Loading your dashboard...</span>
      </div>
    );
  }

  if (error || !data) {
    return shell(
      <div role="alert" className="bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 px-4 py-4 rounded-xl text-sm font-medium flex items-center justify-between gap-4">
        <span>{error || "Your dashboard could not be loaded."}</span>
        <button type="button" onClick={load} className="inline-flex items-center gap-1.5 font-semibold underline"><RefreshCw className="w-4 h-4" /> Try again</button>
      </div>
    );
  }

  const first = firstNameOf(data.profile);
  const { leave, att, waiting, holidays, leaves, activity } = view;
  const next = holidays[0];

  return shell(
    <div className="space-y-8">
      {partial && (
        <div role="status" className="px-4 py-2.5 rounded-xl bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-300 text-xs font-medium flex items-center justify-between gap-3">
          <span>Some parts of this page could not be loaded, so a few numbers may be missing.</span>
          <button type="button" onClick={load} className="font-semibold underline">Refresh</button>
        </div>
      )}

      {/* Welcome banner */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-[#0A192F] via-[#0F2942] to-[#1E3A8A] p-8 text-white shadow-xl shadow-blue-900/10">
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-500/20 border border-blue-400/30 text-blue-200 text-xs font-medium backdrop-blur-md">
              <Sparkles className="w-3.5 h-3.5 text-blue-300" />
              {waiting > 0 ? `${waiting} request${waiting === 1 ? "" : "s"} awaiting a decision` : "You're all caught up"}
            </div>
            <h2 className="text-3xl font-bold tracking-tight">{greetingFor()}{first ? `, ${first}` : ""} <span aria-hidden="true">👋</span></h2>
            <p className="text-slate-300 text-sm max-w-xl">
              {waiting > 0
                ? <>You have <span className="font-semibold text-white underline underline-offset-4 decoration-blue-400">{waiting} pending request{waiting === 1 ? "" : "s"}</span>. We'll show the decision here as soon as it is made.</>
                : "Nothing needs your attention right now. Apply for leave or claim an expense whenever you need to."}
            </p>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <button type="button" onClick={() => navigate("/employee/leaves/apply")} className="px-4 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-sm font-semibold shadow-lg shadow-blue-600/30 transition flex items-center gap-2">
              <PlusCircle className="w-4 h-4" /> Apply for Leave
            </button>
            <button type="button" onClick={() => navigate("/employee/travel/expenses")} className="px-4 py-2.5 bg-white/10 hover:bg-white/20 text-white border border-white/20 rounded-xl text-sm font-semibold backdrop-blur-md transition flex items-center gap-2">
              <Receipt className="w-4 h-4" /> Claim Expense
            </button>
          </div>
        </div>
        <div className="absolute -right-10 -bottom-20 w-72 h-72 rounded-full bg-blue-500/10 blur-2xl pointer-events-none" />
        <div className="absolute top-0 right-1/3 w-48 h-48 rounded-full bg-indigo-500/10 blur-xl pointer-events-none" />
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
        <Kpi icon={Calendar} tint="bg-blue-50 dark:bg-blue-500/20 text-blue-600 dark:text-blue-300" label="Leave Balance"
          foot={<Bar pct={leave.pct} color="bg-blue-600" />}>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-extrabold text-slate-900 dark:text-[#f1f5f9]">{leave.remaining}</span>
            <span className="text-xs font-semibold text-slate-500 dark:text-[#94a3b8]">{leave.total ? `/ ${leave.total} days available` : "days available"}</span>
          </div>
        </Kpi>

        <Kpi icon={Clock} tint="bg-emerald-50 dark:bg-emerald-500/20 text-emerald-600 dark:text-emerald-300" label="Attendance"
          foot={<Bar pct={att.pct ?? 0} color="bg-emerald-500" />}>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-extrabold text-slate-900 dark:text-[#f1f5f9]">{att.pct == null ? "-" : `${att.pct}%`}</span>
            <span className="text-xs font-semibold text-slate-500 dark:text-[#94a3b8]">{att.recorded ? `${att.present} of ${att.recorded} days this month` : "No days recorded this month"}</span>
          </div>
        </Kpi>

        <Kpi icon={AlertCircle} tint="bg-amber-50 dark:bg-amber-500/20 text-amber-600 dark:text-amber-300" label="Pending Requests"
          foot={<p className="text-xs text-slate-500 dark:text-[#94a3b8] mt-3">Leave, travel and expense requests</p>}>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-extrabold text-slate-900 dark:text-[#f1f5f9]">{waiting}</span>
            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${waiting > 0 ? "text-amber-600 bg-amber-50 dark:bg-amber-500/20 dark:text-amber-300" : "text-emerald-600 bg-emerald-50 dark:bg-emerald-500/20 dark:text-emerald-300"}`}>
              {waiting > 0 ? "Awaiting decision" : "All clear"}
            </span>
          </div>
        </Kpi>

        <Kpi icon={Award} tint="bg-indigo-50 dark:bg-indigo-500/20 text-indigo-600 dark:text-indigo-300" label="Next Holiday"
          foot={next ? <p className="text-xs font-semibold text-indigo-600 dark:text-indigo-300 mt-2">{formatDate(next.date)} · {inDaysText(next.inDays)}</p> : null}>
          {next
            ? <span className="text-xl font-bold text-slate-900 dark:text-[#f1f5f9]">{next.name}</span>
            : <span className="text-sm font-medium text-slate-500 dark:text-[#94a3b8]">No upcoming holidays listed</span>}
        </Kpi>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left column */}
        <div className="lg:col-span-2 space-y-8">
          <section className={`${card} p-6`} aria-labelledby="ess-leaves">
            <div className="flex items-center justify-between pb-5 border-b border-slate-100 dark:border-[#334155]">
              <div>
                <h3 id="ess-leaves" className="text-lg font-bold text-slate-900 dark:text-[#f1f5f9]">My Leave Requests</h3>
                <p className="text-xs text-slate-500 dark:text-[#94a3b8]">Your latest requests and what was decided</p>
              </div>
              <button type="button" onClick={() => navigate("/employee/leaves/history")} className="text-xs font-semibold text-blue-600 hover:text-blue-700 flex items-center gap-1">
                View all <ChevronRight className="w-4 h-4" />
              </button>
            </div>
            {leaves.length === 0 ? (
              <p className="py-10 text-center text-sm text-slate-500 dark:text-[#94a3b8]">You have not applied for any leave yet.</p>
            ) : (
              <div className="mt-4 space-y-3">
                {leaves.map((l) => (
                  <div key={l.id} className="p-4 rounded-xl bg-slate-50 dark:bg-[#0f172a] border border-slate-100 dark:border-[#334155] flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3.5 min-w-0">
                      <div className="p-2.5 rounded-xl bg-blue-100 dark:bg-blue-500/20 text-blue-700 dark:text-blue-300"><Calendar className="w-5 h-5" /></div>
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-slate-900 dark:text-[#f1f5f9]">{formatLeaveType(l.leave_type || l.type)}</p>
                        <p className="text-xs text-slate-500 dark:text-[#94a3b8]">{formatDate(l.start_date)} → {formatDate(l.end_date)} · {l.days || 1} day{(l.days || 1) === 1 ? "" : "s"}</p>
                      </div>
                    </div>
                    <EmployeeStatusBadge status={l.status} />
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className={`${card} p-6`} aria-labelledby="ess-activity">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-[#334155]">
              <h3 id="ess-activity" className="text-lg font-bold text-slate-900 dark:text-[#f1f5f9]">Recent Activity</h3>
              <span className="text-xs text-slate-400 dark:text-[#64748b]">Latest first</span>
            </div>
            {activity.length === 0 ? (
              <p className="py-10 text-center text-sm text-slate-500 dark:text-[#94a3b8]">No recent activity</p>
            ) : (
              <div className="mt-2 divide-y divide-slate-100 dark:divide-[#334155]">
                {activity.map((a, i) => (
                  <div key={i} className="flex justify-between items-center py-3.5">
                    <div>
                      <p className="text-sm font-semibold text-slate-900 dark:text-[#f1f5f9] capitalize">{a.action}</p>
                      <p className="text-xs text-slate-500 dark:text-[#94a3b8]">{a.date ? formatDate(a.date) : "-"}</p>
                    </div>
                    <EmployeeStatusBadge status={a.status} />
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>

        {/* Right column */}
        <div className="space-y-8">
          <section className={`${card} p-6`} aria-labelledby="ess-shortcuts">
            <h3 id="ess-shortcuts" className="text-lg font-bold text-slate-900 dark:text-[#f1f5f9] mb-4">Quick Shortcuts</h3>
            <div className="grid grid-cols-2 gap-3">
              <Shortcut icon={Calendar} color="text-blue-600" title="Request Leave" sub="Apply for time off" onClick={() => navigate("/employee/leaves/apply")} />
              <Shortcut icon={Receipt} color="text-emerald-600" title="Claim Expense" sub="Submit a claim" onClick={() => navigate("/employee/travel/expenses")} />
              <Shortcut icon={Plane} color="text-amber-600" title="Travel Request" sub="Plan a business trip" onClick={() => navigate("/employee/travel/requests")} />
              <Shortcut icon={User} color="text-indigo-600" title="My Profile" sub="Details and bank info" onClick={() => navigate("/employee/profile")} />
            </div>
          </section>

          <section className={`${card} p-6`} aria-labelledby="ess-holidays">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-[#334155]">
              <h3 id="ess-holidays" className="text-lg font-bold text-slate-900 dark:text-[#f1f5f9]">Upcoming Holidays</h3>
              <button type="button" onClick={() => navigate("/employee/leaves/calendar")} className="text-xs font-semibold text-blue-600">Calendar</button>
            </div>
            {holidays.length === 0 ? (
              <p className="py-6 text-center text-sm text-slate-500 dark:text-[#94a3b8]">No upcoming holidays listed.</p>
            ) : (
              <div className="mt-4 space-y-3">
                {holidays.map((h) => (
                  <div key={`${h.name}-${h.date}`} className="p-3.5 rounded-xl bg-slate-50 dark:bg-[#0f172a] border border-slate-100 dark:border-[#334155] flex items-start justify-between">
                    <div>
                      <p className="text-xs font-bold text-slate-900 dark:text-[#f1f5f9]">{h.name}</p>
                      <p className="text-[11px] text-slate-500 dark:text-[#94a3b8] mt-0.5">{formatDate(h.date)}</p>
                    </div>
                    <span className="text-[10px] font-semibold bg-blue-100 dark:bg-blue-500/20 text-blue-700 dark:text-blue-300 px-2 py-0.5 rounded-md">{inDaysText(h.inDays)}</span>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="bg-gradient-to-br from-[#0A192F] to-[#1E3A8A] text-white rounded-2xl p-6 shadow-md" aria-labelledby="ess-attendance">
            <div className="flex items-center justify-between">
              <h4 id="ess-attendance" className="font-bold text-sm">Attendance Summary</h4>
              <span className="text-xs text-blue-300">This Month</span>
            </div>
            {att.last7.length === 0 ? (
              <p className="mt-6 text-xs text-slate-300 text-center">No attendance recorded yet this month.</p>
            ) : (
              <>
                <div className="mt-4 flex items-end justify-between h-20 gap-2 pt-2" role="img" aria-label="Your last recorded days">
                  {att.last7.map((d, i) => (
                    <div key={i} className="flex-1 flex flex-col items-center gap-1 h-full">
                      <div className="w-full bg-blue-500/20 rounded-t-md relative h-full flex items-end">
                        <div className={`w-full rounded-t-md transition-all duration-500 ${d.status === "absent" ? "bg-rose-400" : d.status === "late" || d.status === "half_day" ? "bg-amber-300" : "bg-blue-400"}`} style={{ height: `${d.height}%` }} title={`${formatDate(d.date)}: ${d.status.replace("_", " ")}`} />
                      </div>
                      <span className="text-[9px] text-slate-400">{new Date(d.date).toLocaleDateString("en-GB", { weekday: "narrow" })}</span>
                    </div>
                  ))}
                </div>
                <p className="text-xs text-slate-300 mt-4 text-center">{att.onTime} on-time day{att.onTime === 1 ? "" : "s"} recorded this month</p>
              </>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
