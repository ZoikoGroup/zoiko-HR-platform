import { useState, useEffect, useCallback } from "react";
import { NavLink } from "react-router-dom";
import { Users, UserCheck, UserX, AlertTriangle, Luggage, Home, Clock, TrendingUp, TrendingDown, Minus, Download, Calendar, Filter, Loader2, BarChart3, Building2 } from "lucide-react";
import HRPage from "../../../components/HRPage";
import { getAttendanceDashboard, exportAttendanceCsv, exportAttendanceExcel } from "../../../service/hrService";

const NAV_ITEMS = [
  { label: "Dashboard", href: "/zoiko-hr/attendance" },
  { label: "Attendance Records", href: "/zoiko-hr/attendance/daily" },
  { label: "Holiday Calendar", href: "/zoiko-hr/attendance/holidays" },
  { label: "Attendance Analytics", href: "/zoiko-hr/attendance/analytics" },
];

function SubNav() {
  return (
    <div className="flex gap-1 overflow-x-auto pb-1 mb-6 border-b border-gray-100">
      {NAV_ITEMS.map((item) => (
        <NavLink key={item.href} to={item.href} end={item.href === "/zoiko-hr/attendance"}
          className={({ isActive }) =>
            `whitespace-nowrap px-4 py-2.5 text-sm font-bold rounded-t-xl transition-all ${isActive ? "text-orange-600 border-b-2 border-orange-600 bg-orange-50/50" : "text-gray-500 hover:text-gray-800 hover:bg-gray-50"}`
          }>
          {item.label}
        </NavLink>
      ))}
    </div>
  );
}

function StatCard({ title, value, icon: Icon, change, trend }) {
  const TrendIcon = trend === "up" ? TrendingUp : trend === "down" ? TrendingDown : Minus;
  const trendColor = trend === "up" ? "text-emerald-600" : trend === "down" ? "text-red-600" : "text-gray-400";
  const trendBg = trend === "up" ? "bg-emerald-50" : trend === "down" ? "bg-red-50" : "bg-gray-50";

  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm hover:shadow-md transition-all hover:-translate-y-0.5 group">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs text-gray-500 font-bold uppercase tracking-wider">{title}</p>
          <p className="text-3xl font-extrabold text-gray-900 mt-1.5">{value}</p>
        </div>
        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-orange-50 to-orange-100 flex items-center justify-center group-hover:scale-110 transition-transform">
          <Icon size={24} className="text-orange-600" />
        </div>
      </div>
      {change != null && (
        <div className="flex items-center gap-1.5 mt-4">
          <div className={`flex items-center gap-0.5 px-2 py-0.5 rounded-md ${trendBg}`}>
            <TrendIcon className={`w-3.5 h-3.5 ${trendColor}`} />
            <span className={`text-xs font-bold ${trendColor}`}>{change > 0 ? "+" : ""}{change}%</span>
          </div>
          <span className="text-xs font-medium text-gray-400">vs last month</span>
        </div>
      )}
    </div>
  );
}

function SkeletonCard() {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm animate-pulse">
      <div className="flex items-start justify-between">
        <div className="space-y-3">
          <div className="h-3 w-20 bg-gray-200 rounded-full" />
          <div className="h-8 w-16 bg-gray-200 rounded-lg" />
        </div>
        <div className="w-12 h-12 rounded-xl bg-gray-100" />
      </div>
      <div className="mt-4 flex items-center gap-2">
        <div className="h-4 w-12 bg-gray-200 rounded" />
        <div className="h-3 w-24 bg-gray-100 rounded-full" />
      </div>
    </div>
  );
}

export default function AttendanceDashboard() {
  const [dashboard, setDashboard] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [dateRange, setDateRange] = useState("today");
  const [departmentFilter, setDepartmentFilter] = useState("");
  const [locationFilter, setLocationFilter] = useState("");

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    getAttendanceDashboard({ date_range: dateRange, department: departmentFilter, location: locationFilter })
      .then((d) => setDashboard(d))
      .catch((err) => setError(err?.message || "Failed to load dashboard"))
      .finally(() => setLoading(false));
  }, [dateRange, departmentFilter, locationFilter]);

  useEffect(() => { load(); }, [load]);

  const {
    present_today = 0, absent_today = 0, late_arrivals = 0, early_departures = 0,
    on_leave = 0, remote = 0, overtime = 0, attendance_percentage = 0, avg_working_hours = 0,
    total_employees = 0, attendance_trend = [], department_attendance = [], shift_distribution = [],
  } = dashboard || {};

  const statCards = [
    { title: "Present Today", value: present_today, icon: UserCheck, change: 5, trend: "up" },
    { title: "Absent Today", value: absent_today, icon: UserX, change: -2, trend: "down" },
    { title: "Late Arrivals", value: late_arrivals, icon: AlertTriangle, change: 1, trend: "down" },
    { title: "Early Departures", value: early_departures, icon: Clock, change: 0, trend: "flat" },
    { title: "On Leave", value: on_leave, icon: Luggage, change: 3, trend: "up" },
    { title: "Remote Work", value: remote, icon: Home, change: 2, trend: "up" },
    { title: "Overtime (hrs)", value: overtime, icon: TrendingUp, change: 4, trend: "up" },
    { title: "Attendance %", value: `${attendance_percentage}%`, icon: Users, change: null, trend: null },
    { title: "Avg Hours", value: avg_working_hours, icon: Clock, change: null, trend: null },
  ];

  const maxTrendValue = Math.max(...attendance_trend.map((t) => t.present + t.absent), 1);
  const maxDeptAttendance = Math.max(...department_attendance.map((d) => d.count), 1);
  const maxShiftValue = Math.max(...shift_distribution.map((s) => s.count), 1);
  const deptOptions = [...new Set(department_attendance.map((d) => d.department || d.name).filter(Boolean))];

  return (
    <HRPage title="Attendance Overview" subtitle="Live attendance metrics, workforce distribution, and statistics">
      <SubNav />

      <div className="space-y-6">
        
        {/* Dynamic Hero Banner */}
        <div className="bg-gradient-to-br from-orange-500 via-orange-600 to-red-500 rounded-2xl p-6 md:p-8 shadow-lg text-white flex flex-col md:flex-row items-start md:items-center justify-between gap-6 relative overflow-hidden">
          <div className="absolute right-0 top-0 opacity-10 pointer-events-none transform translate-x-1/4 -translate-y-1/4">
            <Users size={240} />
          </div>
          <div className="relative z-10">
            <h1 className="text-3xl font-extrabold leading-tight tracking-tight text-white mb-2">Live Workforce Overview</h1>
            <p className="text-orange-100 text-sm max-w-md font-medium leading-relaxed">
              Real-time snapshot of employee availability, remote work status, and department-level attendance trends.
            </p>
          </div>
          <div className="relative z-10 flex gap-4 md:gap-8 flex-wrap shrink-0">
            <div>
              <p className="text-orange-200 text-xs font-bold uppercase tracking-wide mb-1">Active Now</p>
              <div className="flex items-baseline gap-2">
                <span className="text-4xl font-black">{loading ? "-" : present_today}</span>
                <span className="text-orange-200 font-medium">/ {loading ? "-" : total_employees}</span>
              </div>
            </div>
            <div className="h-12 w-px bg-white/20 hidden md:block"></div>
            <div>
              <p className="text-orange-200 text-xs font-bold uppercase tracking-wide mb-1">Working Remote</p>
              <div className="flex items-baseline gap-2">
                <span className="text-4xl font-black">{loading ? "-" : remote}</span>
              </div>
            </div>
          </div>
        </div>

        {error && (
          <div className="px-4 py-3 bg-red-50 border border-red-200 text-red-700 font-medium rounded-xl flex items-center justify-between">
            <span>{error}</span>
            <button onClick={() => setError(null)} className="text-red-500 hover:text-red-800 text-lg">&times;</button>
          </div>
        )}

        {/* Filters and Actions */}
        <div className="bg-white rounded-2xl border border-gray-100 p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-4 shadow-sm">
          <div className="flex flex-col sm:flex-row items-center gap-3 w-full lg:w-auto">
            <div className="relative w-full sm:w-auto">
              <Calendar className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <select value={dateRange} onChange={(e) => setDateRange(e.target.value)}
                className="w-full pl-9 pr-8 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 focus:bg-white transition-colors cursor-pointer appearance-none">
                <option value="today">Today</option>
                <option value="this_week">This Week</option>
                <option value="this_month">This Month</option>
                <option value="last_month">Last Month</option>
                <option value="custom">Custom Range</option>
              </select>
            </div>
            <div className="relative w-full sm:w-auto">
              <Filter className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <select value={departmentFilter} onChange={(e) => setDepartmentFilter(e.target.value)}
                className="w-full pl-9 pr-8 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 focus:bg-white transition-colors cursor-pointer appearance-none">
                <option value="">All Departments</option>
                {deptOptions.map((d) => (<option key={d} value={d}>{d}</option>))}
              </select>
            </div>
            <div className="relative w-full sm:w-auto">
              <Building2 className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <select value={locationFilter} onChange={(e) => setLocationFilter(e.target.value)}
                className="w-full pl-9 pr-8 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 focus:bg-white transition-colors cursor-pointer appearance-none">
                <option value="">All Locations</option>
                <option value="office">Office</option>
                <option value="remote">Remote</option>
              </select>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={async () => { try { await exportAttendanceCsv(); } catch (err) { setError(err.message); } }}
              className="flex-1 lg:flex-none flex justify-center items-center gap-2 px-4 py-2.5 border border-gray-200 text-gray-700 bg-white rounded-xl hover:bg-gray-50 text-sm font-bold shadow-sm transition-colors">
              <Download className="w-4 h-4" /> CSV
            </button>
            <button onClick={async () => { try { await exportAttendanceExcel(); } catch (err) { setError(err.message); } }}
              className="flex-1 lg:flex-none flex justify-center items-center gap-2 px-4 py-2.5 border border-gray-200 text-gray-700 bg-white rounded-xl hover:bg-gray-50 text-sm font-bold shadow-sm transition-colors">
              <Download className="w-4 h-4" /> Excel
            </button>
          </div>
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {loading ? Array.from({ length: 8 }).map((_, i) => <SkeletonCard key={i} />) : statCards.slice(0,8).map((s) => <StatCard key={s.title} {...s} />)}
        </div>

        {/* Charts Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          {/* Attendance Trend */}
          <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm flex flex-col">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-bold text-gray-900">Attendance Trend</h2>
              <BarChart3 className="w-5 h-5 text-gray-400" />
            </div>
            {loading ? (
              <div className="flex-1 flex justify-center items-center min-h-[200px]">
                <Loader2 className="w-8 h-8 animate-spin text-orange-400" />
              </div>
            ) : attendance_trend.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center min-h-[200px] text-gray-400">
                <BarChart3 className="w-10 h-10 mb-2 opacity-50" />
                <span className="text-sm font-medium">No trend data available</span>
              </div>
            ) : (
              <>
                <div className="flex items-end gap-3 h-48 mt-auto">
                  {attendance_trend.map((d, i) => {
                    const total = d.present + d.absent;
                    const pct = maxTrendValue > 0 ? (total / maxTrendValue) * 100 : 0;
                    return (
                      <div key={d.label || i} className="flex-1 flex flex-col items-center gap-2 group">
                        <div className="flex gap-0.5 w-full h-full items-end relative">
                          {/* Tooltip */}
                          <div className="absolute -top-10 left-1/2 -translate-x-1/2 bg-gray-900 text-white text-xs font-bold px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10 whitespace-nowrap shadow-lg">
                            P: {d.present} | A: {d.absent}
                          </div>
                          <div className="flex-1 bg-emerald-400 hover:bg-emerald-500 rounded-t-sm transition-all duration-300" style={{ height: `${(d.present / total) * Math.max(pct, 4)}%` }} />
                          <div className="flex-1 bg-red-400 hover:bg-red-500 rounded-t-sm transition-all duration-300" style={{ height: `${(d.absent / total) * Math.max(pct, 4)}%` }} />
                        </div>
                        <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">{d.label}</span>
                      </div>
                    );
                  })}
                </div>
                <div className="flex items-center justify-center gap-5 mt-6 pt-4 border-t border-gray-100">
                  <span className="flex items-center gap-2 text-xs font-bold text-gray-600"><span className="w-2.5 h-2.5 rounded-full bg-emerald-400 shadow-sm" /> Present</span>
                  <span className="flex items-center gap-2 text-xs font-bold text-gray-600"><span className="w-2.5 h-2.5 rounded-full bg-red-400 shadow-sm" /> Absent</span>
                </div>
              </>
            )}
          </div>

          {/* Department Attendance */}
          <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-bold text-gray-900">Department Overview</h2>
              <Building2 className="w-5 h-5 text-gray-400" />
            </div>
            {loading ? (
              <div className="flex justify-center items-center min-h-[200px]"><Loader2 className="w-8 h-8 animate-spin text-orange-400" /></div>
            ) : department_attendance.length === 0 ? (
              <div className="flex flex-col items-center justify-center min-h-[200px] text-gray-400">
                <Building2 className="w-10 h-10 mb-2 opacity-50" />
                <span className="text-sm font-medium">No department data</span>
              </div>
            ) : (
              <div className="space-y-4">
                {department_attendance.map((d) => (
                  <div key={d.department || d.name} className="group">
                    <div className="flex justify-between items-center mb-1.5">
                      <span className="text-sm font-bold text-gray-700 truncate">{d.department || d.name}</span>
                      <span className="text-xs font-bold text-gray-500">{d.count} employees</span>
                    </div>
                    <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden">
                      <div className="bg-gradient-to-r from-orange-400 to-orange-500 h-full rounded-full transition-all duration-700 ease-out" style={{ width: `${(d.count / maxDeptAttendance) * 100}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Shift Distribution */}
          <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-bold text-gray-900">Shift Distribution</h2>
              <Clock className="w-5 h-5 text-gray-400" />
            </div>
            {loading ? (
              <div className="flex justify-center items-center min-h-[200px]"><Loader2 className="w-8 h-8 animate-spin text-orange-400" /></div>
            ) : shift_distribution.length === 0 ? (
              <div className="flex flex-col items-center justify-center min-h-[200px] text-gray-400">
                <Clock className="w-10 h-10 mb-2 opacity-50" />
                <span className="text-sm font-medium">No shift data</span>
              </div>
            ) : (
              <div className="space-y-4">
                {shift_distribution.map((s) => (
                  <div key={s.shift || s.name} className="group">
                    <div className="flex justify-between items-center mb-1.5">
                      <span className="text-sm font-bold text-gray-700 truncate capitalize">{s.shift || s.name}</span>
                      <span className="text-xs font-bold text-gray-500">{s.count} active</span>
                    </div>
                    <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden">
                      <div className="bg-gradient-to-r from-indigo-400 to-indigo-500 h-full rounded-full transition-all duration-700 ease-out" style={{ width: `${(s.count / maxShiftValue) * 100}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

      </div>
    </HRPage>
  );
}
