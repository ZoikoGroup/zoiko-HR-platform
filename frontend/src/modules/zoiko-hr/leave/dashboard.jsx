import { useState, useEffect, useMemo } from "react";
import { NavLink } from "react-router-dom";
import { Calendar, Clock, CheckCircle, XCircle, CalendarDays, TrendingUp, Users, Briefcase, Home, Minus, TrendingDown, BarChart3 } from "lucide-react";
import HRPage from "../../../components/HRPage";
import { getLeaveDashboard, getLeaveBalances, getLeaveRequests } from "../../../service/hrService";

const NAV_ITEMS = [
  { label: "Dashboard", href: "/zoiko-hr/leave" },
  { label: "Requests", href: "/zoiko-hr/leave/requests" },
  { label: "Calendar", href: "/zoiko-hr/leave/calendar" },
  { label: "Reports", href: "/zoiko-hr/leave/reports" },
];

const typeColors = {
  annual: "bg-blue-500", sick: "bg-pink-500", casual: "bg-orange-500", earned: "bg-teal-500",
  maternity: "bg-purple-500", paternity: "bg-indigo-500", unpaid: "bg-gray-500", study: "bg-cyan-500", emergency: "bg-red-500",
};

const typeIconColors = {
  annual: "text-blue-600 bg-blue-50", sick: "text-pink-600 bg-pink-50", casual: "text-orange-600 bg-orange-50",
  earned: "text-teal-600 bg-teal-50", maternity: "text-purple-600 bg-purple-50", paternity: "text-indigo-600 bg-indigo-50",
  unpaid: "text-gray-600 bg-gray-100", study: "text-cyan-600 bg-cyan-50", emergency: "text-red-600 bg-red-50",
};

const typeIcons = {
  annual: Calendar, sick: Clock, casual: CalendarDays, earned: TrendingUp,
  maternity: Users, paternity: Users, unpaid: Briefcase, study: Clock, emergency: XCircle,
};

function SubNav() {
  return (
    <div className="flex gap-1 overflow-x-auto pb-1 mb-6 border-b border-gray-100">
      {NAV_ITEMS.map((item) => (
        <NavLink key={item.href} to={item.href} end={item.href === "/zoiko-hr/leave"}
          className={({ isActive }) =>
            `whitespace-nowrap px-3 py-2 text-sm font-medium rounded-t-lg transition-colors ${
              isActive ? "text-teal-600 border-b-2 border-teal-600 bg-teal-50/50" : "text-gray-500 hover:text-gray-700 hover:bg-gray-50"
            }`
          }>
          {item.label}
        </NavLink>
      ))}
    </div>
  );
}

const STAT_CONFIG = [
  { key: "total_requests",   title: "Total Requests", icon: Calendar,     gradient: "from-teal-500 to-teal-600",   light: "bg-teal-50",   text: "text-teal-600"   },
  { key: "pending_requests", title: "Pending",        icon: Clock,         gradient: "from-amber-500 to-amber-600", light: "bg-amber-50",   text: "text-amber-600"  },
  { key: "approved_requests",title: "Approved",       icon: CheckCircle,   gradient: "from-emerald-500 to-emerald-600", light: "bg-emerald-50", text: "text-emerald-600" },
  { key: "rejected_requests",title: "Rejected",       icon: XCircle,       gradient: "from-red-500 to-red-600",    light: "bg-red-50",    text: "text-red-600"    },
  { key: "total_days_taken", title: "Total Days",     icon: CalendarDays,  gradient: "from-blue-500 to-blue-600",   light: "bg-blue-50",   text: "text-blue-600"   },
  { key: "approvalRate",     title: "Approval Rate",  icon: BarChart3,      gradient: "from-violet-500 to-violet-600", light: "bg-violet-50", text: "text-violet-600" },
];

function StatCard({ title, value, icon: Icon, gradient, light, text, loading }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm hover:shadow-md transition-all duration-200">
      <div className="flex items-start justify-between mb-3">
        <div className={`p-2.5 rounded-xl ${light}`}>
          {Icon && <Icon className={`w-5 h-5 ${text}`} />}
        </div>
      </div>
      {loading ? (
        <div className="space-y-2">
          <div className="h-7 w-16 bg-gray-200 rounded-lg animate-pulse" />
          <div className="h-3.5 w-24 bg-gray-100 rounded animate-pulse" />
        </div>
      ) : (
        <>
          <p className="text-2xl font-extrabold text-gray-900 leading-none mb-1">{value ?? "—"}</p>
          <p className="text-xs font-medium text-gray-500">{title}</p>
        </>
      )}
    </div>
  );
}

function SkeletonRow() {
  return (
    <tr className="border-b border-gray-50">
      {[1,2,3,4,5,6].map(i => (
        <td key={i} className="px-4 py-3">
          <div className="h-4 bg-gray-100 rounded animate-pulse" style={{ width: `${60 + i * 10}%` }} />
        </td>
      ))}
    </tr>
  );
}

function InitialsAvatar({ name, size = "sm" }) {
  const parts = (name || "?").trim().split(" ");
  const initials = parts.length >= 2 ? parts[0][0] + parts[parts.length - 1][0] : parts[0]?.[0] || "?";
  const colors = ["bg-teal-500","bg-blue-500","bg-violet-500","bg-emerald-500","bg-amber-500","bg-rose-500"];
  const idx = (name || "").charCodeAt(0) % colors.length;
  const sz = size === "sm" ? "w-7 h-7 text-xs" : "w-9 h-9 text-sm";
  return (
    <div className={`${sz} ${colors[idx]} rounded-full flex items-center justify-center text-white font-bold flex-shrink-0`}>
      {initials.toUpperCase()}
    </div>
  );
}

function formatDate(dateStr) {
  if (!dateStr) return "—";
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

const STATUS_BADGE = {
  approved:  "bg-emerald-100 text-emerald-700 border border-emerald-200",
  pending:   "bg-amber-100 text-amber-700 border border-amber-200",
  rejected:  "bg-red-100 text-red-700 border border-red-200",
  cancelled: "bg-gray-100 text-gray-600 border border-gray-200",
};

export default function LeaveDashboard() {
  const [dbStats, setDbStats] = useState(null);
  const [balances, setBalances] = useState([]);
  const [upcoming, setUpcoming] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let mounted = true;
    const fetch = async () => {
      setLoading(true);
      setError(null);
      try {
        const [statsData, balanceData, upcomingData] = await Promise.all([
          getLeaveDashboard(),
          getLeaveBalances(),
          getLeaveRequests(null, { status: "approved" }),
        ]);
        if (!mounted) return;
        setDbStats(statsData);
        setBalances(Array.isArray(balanceData) ? balanceData : []);
        const now = new Date().toISOString().split("T")[0];
        const upcoming = (Array.isArray(upcomingData) ? upcomingData : [])
          .filter((r) => r.end_date >= now)
          .slice(0, 5);
        setUpcoming(upcoming);
      } catch (err) {
        if (mounted) setError(err.message || "Failed to load dashboard");
      } finally {
        if (mounted) setLoading(false);
      }
    };
    fetch();
    return () => { mounted = false; };
  }, []);

  const stats = dbStats || {
    total_requests: 0, pending_requests: 0, approved_requests: 0, rejected_requests: 0,
    total_days_taken: 0, on_leave_today: 0, employee_count: 0,
  };
  const approvalRate = stats.total_requests > 0
    ? Math.round((stats.approved_requests / stats.total_requests) * 100) : 0;

  const teamOverview = {
    working: Math.max(0, (stats.employee_count || 0) - (stats.on_leave_today || 0)),
    onLeave: stats.on_leave_today || 0,
    wfh: stats.wfh || 0,
    pending: stats.pending_requests || 0,
    total: stats.employee_count || 0,
  };

  const statValues = { ...stats, approvalRate: `${approvalRate}%` };

  return (
    <HRPage title="Leave Dashboard" subtitle="Leave overview, balances, and team availability">
      <SubNav />
      <div className="space-y-6">

        {/* Error banner */}
        {error && (
          <div className="flex items-center gap-2 px-4 py-3 bg-red-50 border border-red-200 text-red-700 rounded-xl text-sm">
            <XCircle className="w-4 h-4 flex-shrink-0" /> {error}
          </div>
        )}

        {/* Team Overview Hero */}
        <div className="relative bg-gradient-to-br from-teal-600 via-teal-700 to-emerald-700 rounded-2xl shadow-lg p-6 text-white overflow-hidden">
          <div className="absolute top-0 right-0 w-48 h-48 bg-white/5 rounded-full -translate-y-1/2 translate-x-1/4 pointer-events-none" />
          <div className="absolute bottom-0 left-1/3 w-32 h-32 bg-white/5 rounded-full translate-y-1/2 pointer-events-none" />
          <div className="relative flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div>
              <p className="text-teal-200 text-sm font-semibold uppercase tracking-wide mb-1">Team Overview — Today</p>
              {loading ? (
                <div className="h-10 w-32 bg-white/20 rounded-xl animate-pulse mt-1" />
              ) : (
                <p className="text-5xl font-extrabold font-mono leading-none">
                  {teamOverview.working}<span className="text-2xl text-teal-300 font-bold">/{teamOverview.total}</span>
                </p>
              )}
              <p className="text-teal-200 text-sm mt-1">employees currently working</p>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-1 gap-2 text-sm min-w-[160px]">
              {[
                { icon: Users, label: "On Leave", value: teamOverview.onLeave, color: "text-blue-200" },
                { icon: Home, label: "WFH", value: teamOverview.wfh, color: "text-emerald-200" },
                { icon: Clock, label: "Pending Requests", value: teamOverview.pending, color: "text-amber-200" },
              ].map(({ icon: Icon, label, value, color }) => (
                <div key={label} className="flex items-center gap-2">
                  <Icon className={`w-4 h-4 ${color}`} />
                  <span className="text-teal-100">{loading ? "—" : value} {label}</span>
                </div>
              ))}
            </div>
          </div>
          {/* Progress bar */}
          {!loading && teamOverview.total > 0 && (
            <div className="relative mt-5">
              <div className="w-full bg-white/20 rounded-full h-2">
                <div
                  className="bg-white h-2 rounded-full transition-all duration-700"
                  style={{ width: `${(teamOverview.working / teamOverview.total) * 100}%` }}
                />
              </div>
              <p className="text-teal-200 text-xs mt-1">
                {Math.round((teamOverview.working / teamOverview.total) * 100)}% of team active
              </p>
            </div>
          )}
        </div>

        {/* KPI Stat Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {STAT_CONFIG.map((s) => (
            <StatCard
              key={s.key}
              title={s.title}
              value={statValues[s.key]}
              icon={s.icon}
              gradient={s.gradient}
              light={s.light}
              text={s.text}
              loading={loading}
            />
          ))}
        </div>

        {/* Leave Balances */}
        <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm">
          <div className="flex items-center gap-2 mb-5">
            <div className="p-2 bg-teal-50 rounded-xl"><BarChart3 className="w-4 h-4 text-teal-600" /></div>
            <h2 className="text-base font-bold text-gray-900">Leave Balances</h2>
          </div>
          {loading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {[1,2,3].map(i => (
                <div key={i} className="bg-gray-50 rounded-xl p-4 border border-gray-100 space-y-3">
                  <div className="h-4 w-24 bg-gray-200 rounded animate-pulse" />
                  <div className="h-2 w-full bg-gray-200 rounded-full animate-pulse" />
                  <div className="h-3 w-20 bg-gray-100 rounded animate-pulse" />
                </div>
              ))}
            </div>
          ) : balances.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <div className="w-14 h-14 rounded-2xl bg-gray-100 flex items-center justify-center mb-3">
                <CalendarDays className="w-7 h-7 text-gray-300" />
              </div>
              <p className="text-gray-500 font-medium">No leave balances found</p>
              <p className="text-gray-400 text-sm mt-1">Balances will appear once leaves are assigned</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {balances.map((b) => {
                const t = b.leave_type || "other";
                const Icon = typeIcons[t] || Calendar;
                const used = b.used_days || 0;
                const total = b.total_days || 0;
                const pct = total > 0 ? Math.round((used / total) * 100) : 0;
                const remaining = total - used;
                const iconCls = typeIconColors[t] || "text-gray-600 bg-gray-100";
                return (
                  <div key={`${b.employee_id}-${t}`} className="bg-gray-50 rounded-xl p-4 border border-gray-100 hover:border-teal-200 hover:shadow-sm transition-all">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <div className={`p-1.5 rounded-lg ${iconCls}`}>
                          <Icon className="w-4 h-4" />
                        </div>
                        <span className="text-sm font-semibold text-gray-800 capitalize">{t}</span>
                      </div>
                      <span className="text-xs font-medium text-gray-400 bg-white px-2 py-0.5 rounded-full border border-gray-200">
                        {used}/{total} used
                      </span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2 mb-2">
                      <div
                        className={`${typeColors[t] || "bg-gray-500"} h-2 rounded-full transition-all duration-500`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <div className="flex items-center justify-between">
                      <p className="text-xs text-gray-500">{remaining} days remaining</p>
                      <p className="text-xs font-semibold text-gray-600">{pct}%</p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Bottom row: Upcoming Leave + Team Availability */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Upcoming Leave Table */}
          <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm">
            <div className="flex items-center gap-2 mb-5">
              <div className="p-2 bg-blue-50 rounded-xl"><CalendarDays className="w-4 h-4 text-blue-600" /></div>
              <h2 className="text-base font-bold text-gray-900">Upcoming Leave</h2>
            </div>
            {loading ? (
              <div className="space-y-3">
                {[1,2,3].map(i => <SkeletonRow key={i} />)}
              </div>
            ) : upcoming.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 text-center">
                <div className="w-12 h-12 rounded-2xl bg-gray-100 flex items-center justify-center mb-3">
                  <Calendar className="w-6 h-6 text-gray-300" />
                </div>
                <p className="text-gray-400 text-sm">No upcoming leave</p>
              </div>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-gray-100">
                <table className="min-w-full">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-100">
                      <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase">Employee</th>
                      <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase">Type</th>
                      <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase">Dates</th>
                      <th className="px-4 py-2.5 text-center text-xs font-semibold text-gray-500 uppercase">Days</th>
                      <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {upcoming.map((l, i) => (
                      <tr key={l.id || i} className="hover:bg-teal-50/40 transition-colors">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <InitialsAvatar name={l.employee_name || `Employee #${l.employee_id}`} />
                            <span className="text-sm font-medium text-gray-800 truncate max-w-[100px]">
                              {l.employee_name || `#${l.employee_id}`}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-semibold capitalize text-white ${typeColors[l.leave_type] || "bg-gray-400"}`}>
                            {l.leave_type}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-xs text-gray-500">
                          <span>{formatDate(l.start_date)}</span>
                          <span className="mx-1 text-gray-300">→</span>
                          <span>{formatDate(l.end_date)}</span>
                        </td>
                        <td className="px-4 py-3 text-center text-sm font-semibold text-gray-700">{l.days || "—"}</td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold capitalize ${STATUS_BADGE[l.status] || "bg-gray-100 text-gray-600"}`}>
                            {l.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Team Availability */}
          <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm">
            <div className="flex items-center gap-2 mb-5">
              <div className="p-2 bg-violet-50 rounded-xl"><Users className="w-4 h-4 text-violet-600" /></div>
              <h2 className="text-base font-bold text-gray-900">Team Availability</h2>
            </div>
            <div className="space-y-5">
              {[
                { label: "Working", value: teamOverview.working, color: "bg-emerald-500", textColor: "text-emerald-600" },
                { label: "On Leave",        value: teamOverview.onLeave,  color: "bg-blue-500",   textColor: "text-blue-600"   },
                { label: "WFH",             value: teamOverview.wfh,      color: "bg-violet-500", textColor: "text-violet-600" },
                { label: "Pending Requests",value: teamOverview.pending,  color: "bg-amber-500",  textColor: "text-amber-600"  },
              ].map(({ label, value, color, textColor }) => {
                const pct = teamOverview.total > 0 ? (value / teamOverview.total) * 100 : 0;
                return (
                  <div key={label}>
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-sm text-gray-600 font-medium">{label}</span>
                      <div className="flex items-center gap-2">
                        <span className={`text-sm font-bold ${textColor}`}>{loading ? "—" : value}</span>
                        {!loading && teamOverview.total > 0 && (
                          <span className="text-xs text-gray-400">({Math.round(pct)}%)</span>
                        )}
                      </div>
                    </div>
                    <div className="w-full bg-gray-100 rounded-full h-2">
                      <div
                        className={`${color} h-2 rounded-full transition-all duration-700`}
                        style={{ width: loading ? "0%" : `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </HRPage>
  );
}
