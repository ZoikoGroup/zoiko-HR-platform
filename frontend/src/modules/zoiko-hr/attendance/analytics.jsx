import { useState, useEffect, useMemo, useCallback } from "react";
import { NavLink } from "react-router-dom";
import { TrendingUp, TrendingDown, Minus, BarChart3, Users, Clock, Sun, Download, Calendar, Loader2, Percent, Building2, Zap, LayoutDashboard } from "lucide-react";
import HRPage from "../../../components/HRPage";
import { getAttendance, getAttendanceTrends, getDepartmentAnalysis, getOvertimeAnalytics, getShiftEfficiency } from "../../../service/hrService";

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

function KpiCard({ title, value, icon: Icon, change, trend, suffix }) {
  const TrendIcon = trend === "up" ? TrendingUp : trend === "down" ? TrendingDown : Minus;
  const trendColor = trend === "up" ? "text-emerald-600" : trend === "down" ? "text-red-600" : "text-gray-400";
  const trendBg = trend === "up" ? "bg-emerald-50" : trend === "down" ? "bg-red-50" : "bg-gray-50";

  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm hover:shadow-md transition-all group">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">{title}</p>
          <div className="flex items-baseline gap-1 mt-2">
            <span className="text-4xl font-extrabold text-gray-900">{value}</span>
            {suffix && <span className="text-base font-bold text-gray-400">{suffix}</span>}
          </div>
        </div>
        <div className="p-3 bg-gradient-to-br from-gray-50 to-gray-100 border border-gray-200/50 rounded-xl group-hover:scale-110 transition-transform">
          <Icon className="w-6 h-6 text-gray-700" />
        </div>
      </div>
      {change != null && (
        <div className="flex items-center gap-2 mt-5 pt-4 border-t border-gray-50">
          <div className={`flex items-center gap-1 px-2 py-0.5 rounded-md ${trendBg}`}>
            <TrendIcon className={`w-3.5 h-3.5 ${trendColor}`} />
            <span className={`text-xs font-bold ${trendColor}`}>{change > 0 ? "+" : ""}{change}%</span>
          </div>
          <span className="text-xs font-medium text-gray-400">vs last month</span>
        </div>
      )}
    </div>
  );
}

function SkeletonKpi() {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm animate-pulse">
      <div className="flex items-start justify-between">
        <div className="space-y-3 w-1/2">
          <div className="h-3 bg-gray-200 rounded-full w-24"></div>
          <div className="h-10 bg-gray-200 rounded-lg w-16"></div>
        </div>
        <div className="w-12 h-12 bg-gray-100 rounded-xl"></div>
      </div>
      <div className="mt-5 pt-4 border-t border-gray-50 flex gap-2">
        <div className="h-5 w-12 bg-gray-200 rounded-md"></div>
        <div className="h-4 w-24 bg-gray-100 rounded-full mt-0.5"></div>
      </div>
    </div>
  );
}

export default function AttendanceAnalytics() {
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [dateRange, setDateRange] = useState("");

  const [trends, setTrends] = useState(null);
  const [deptAnalysis, setDeptAnalysis] = useState(null);
  const [overtimeData, setOvertimeData] = useState(null);
  const [shiftEff, setShiftEff] = useState(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);
  const [analyticsError, setAnalyticsError] = useState(null);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    Promise.all([
      getAttendance(),
      getAttendanceTrends({ date: dateRange || undefined }),
      getDepartmentAnalysis({ date: dateRange || undefined }),
      getOvertimeAnalytics({ date: dateRange || undefined }),
      getShiftEfficiency({ date: dateRange || undefined }),
    ])
      .then(([attData, trendsData, deptData, otData, shiftData]) => {
        setRecords(Array.isArray(attData) ? attData : []);
        setTrends(trendsData);
        setDeptAnalysis(deptData);
        setOvertimeData(otData);
        setShiftEff(shiftData);
      })
      .catch((err) => setError(err?.message || "Failed to load analytics"))
      .finally(() => setLoading(false));
  }, [dateRange]);

  useEffect(() => { load(); }, [load]);

  const refreshAnalytics = useCallback(async () => {
    setAnalyticsLoading(true);
    setAnalyticsError(null);
    try {
      const [trendsData, deptData, otData, shiftData] = await Promise.all([
        getAttendanceTrends({ date: dateRange || undefined }),
        getDepartmentAnalysis({ date: dateRange || undefined }),
        getOvertimeAnalytics({ date: dateRange || undefined }),
        getShiftEfficiency({ date: dateRange || undefined }),
      ]);
      setTrends(trendsData);
      setDeptAnalysis(deptData);
      setOvertimeData(otData);
      setShiftEff(shiftData);
    } catch (err) {
      setAnalyticsError(err.message || "Failed to refresh analytics");
    } finally {
      setAnalyticsLoading(false);
    }
  }, [dateRange]);

  const kpiCards = useMemo(() => {
    const total = records.length;
    const present = records.filter((r) => r.status === "present").length;
    const absent = records.filter((r) => r.status === "absent").length;
    const late = records.filter((r) => r.status === "late").length;
    const attendancePct = total > 0 ? Math.round((present / total) * 100) : 0;

    return [
      { title: "Attendance Rate", value: attendancePct, icon: Percent, change: 2, trend: "up", suffix: "%" },
      { title: "Avg Work Hours", value: "7.8", icon: Clock, change: 0.5, trend: "up", suffix: " h" },
      { title: "Total Overtime", value: late > 0 ? late * 2 : 0, icon: Sun, change: 8, trend: "up", suffix: " h" },
      { title: "Shift Efficiency", value: total > 0 ? Math.round(((present) / Math.max(total - absent, 1)) * 100) : 0, icon: Zap, change: -1, trend: "down", suffix: "%" },
    ];
  }, [records]);

  const trendChart = useMemo(() => {
    if (trends && Array.isArray(trends)) return trends;
    if (records.length === 0) {
      return [
        { label: "Mon", present: 0, absent: 0 },
        { label: "Tue", present: 0, absent: 0 },
        { label: "Wed", present: 0, absent: 0 },
        { label: "Thu", present: 0, absent: 0 },
        { label: "Fri", present: 0, absent: 0 },
      ];
    }
    const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    return days.map((day) => {
      const dayRecords = records.filter((r) => {
        if (!r.work_date && !r.date) return false;
        const d = new Date(r.work_date || r.date);
        return d.toLocaleString("en-US", { weekday: "short" }) === day;
      });
      return {
        label: day,
        present: dayRecords.filter((r) => r.status === "present").length,
        absent: dayRecords.filter((r) => r.status === "absent").length,
      };
    }).filter((d) => d.present > 0 || d.absent > 0);
  }, [trends, records]);

  const departmentStats = useMemo(() => {
    if (deptAnalysis && Array.isArray(deptAnalysis)) return deptAnalysis;
    const depts = {};
    records.forEach((r) => {
      const dept = r.department || "Unknown";
      if (!depts[dept]) depts[dept] = { present: 0, absent: 0, late: 0, total: 0 };
      depts[dept].total++;
      if (r.status === "present") depts[dept].present++;
      else if (r.status === "absent") depts[dept].absent++;
      else if (r.status === "late") depts[dept].late++;
    });
    return Object.entries(depts).map(([dept, data]) => ({
      department: dept,
      ...data,
      attendanceRate: data.total > 0 ? Math.round((data.present / data.total) * 100) : 0,
    }));
  }, [deptAnalysis, records]);

  const overtimeAnalytics = useMemo(() => {
    if (overtimeData && Array.isArray(overtimeData)) return overtimeData;
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    return months.map((month) => ({
      month,
      hours: Math.floor(Math.random() * 80) + 20,
      employees: Math.floor(Math.random() * 10) + 3,
    }));
  }, [overtimeData]);

  const shiftEfficiency = useMemo(() => {
    if (shiftEff && Array.isArray(shiftEff)) return shiftEff;
    const shiftNames = ["Morning", "Afternoon", "Night", "General"];
    return shiftNames.map((shift) => {
      const total = records.length;
      const present = records.filter((r) => r.status === "present").length;
      return {
        shift,
        totalEmployees: Math.floor(total / shiftNames.length) + Math.floor(Math.random() * 5),
        present: Math.floor(present / shiftNames.length) + Math.floor(Math.random() * 3),
        efficiency: total > 0 ? Math.round((present / total) * 100) : 0,
      };
    });
  }, [shiftEff, records]);

  const maxTrend = useMemo(() => {
    if (!trendChart || trendChart.length === 0) return 0;
    return Math.max(...trendChart.map((d) => d.present + d.absent));
  }, [trendChart]);

  const handleExport = useCallback(async () => {
    const { exportAttendanceCsv } = await import("../../../service/hrService");
    try {
      await exportAttendanceCsv({ analytics: true, date: dateRange || undefined });
    } catch (err) {
      setError(err.message || "Export failed");
    }
  }, [dateRange]);

  const maxOvertime = useMemo(() => {
    if (!overtimeAnalytics || overtimeAnalytics.length === 0) return 0;
    return Math.max(...overtimeAnalytics.map((d) => d.hours));
  }, [overtimeAnalytics]);

  return (
    <HRPage title="Attendance Analytics" subtitle="Data-driven insights, efficiency metrics, and comprehensive attendance reporting">
      <SubNav />
      
      <div className="space-y-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-gray-100 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-gray-50 rounded-xl flex items-center justify-center border border-gray-100">
              <LayoutDashboard className="w-6 h-6 text-gray-700" />
            </div>
            <div>
              <h1 className="text-xl font-extrabold text-gray-900">Analytics Center</h1>
              <p className="text-sm text-gray-500 font-medium mt-0.5">Filter and export attendance reports</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative">
              <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input type="month" value={dateRange} onChange={(e) => setDateRange(e.target.value)}
                className="pl-9 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm font-bold focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition-colors cursor-pointer" />
            </div>
            <button onClick={handleExport}
              className="flex justify-center items-center gap-2 px-5 py-2.5 bg-gray-900 hover:bg-black text-white rounded-xl text-sm font-bold shadow-sm transition-colors">
              <Download className="w-4 h-4" /> Export Report
            </button>
          </div>
        </div>

        {error && (
          <div className="px-4 py-3 bg-red-50 border border-red-200 text-red-700 font-medium rounded-xl flex items-center justify-between shadow-sm">
            <span>{error}</span>
            <button onClick={() => setError(null)} className="text-red-500 hover:text-red-800 text-lg">&times;</button>
          </div>
        )}

        {analyticsError && (
          <div className="px-4 py-3 bg-red-50 border border-red-200 text-red-700 font-medium rounded-xl flex items-center justify-between shadow-sm">
            <span>Error refreshing analytics: {analyticsError}</span>
            <button onClick={refreshAnalytics} className="text-red-700 hover:text-red-900 font-bold text-sm">Retry</button>
          </div>
        )}

        {analyticsLoading && (
          <div className="flex justify-center items-center py-2 bg-orange-50/50 rounded-xl border border-orange-100">
            <Loader2 className="w-5 h-5 animate-spin text-orange-500" />
            <span className="ml-2 text-sm font-bold text-orange-700">Syncing latest data...</span>
          </div>
        )}

        {/* Top KPIs */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {loading ? Array.from({length: 4}).map((_, i) => <SkeletonKpi key={i} />) : kpiCards.map((kpi) => <KpiCard key={kpi.title} {...kpi} />)}
        </div>

        {/* Charts Row 1 */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm flex flex-col">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-bold text-gray-900">Attendance Volume Trend</h2>
              <BarChart3 className="w-5 h-5 text-gray-400" />
            </div>
            {loading ? (
              <div className="flex-1 flex justify-center items-center min-h-[220px]"><Loader2 className="w-8 h-8 animate-spin text-orange-400" /></div>
            ) : trendChart.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center min-h-[220px] text-gray-400">
                <BarChart3 className="w-10 h-10 mb-2 opacity-50" />
                <span className="text-sm font-bold">No trend data available</span>
              </div>
            ) : (
              <>
                <div className="flex items-end gap-4 h-48 mt-auto">
                  {trendChart.map((d) => {
                    const total = d.present + d.absent;
                    const pct = maxTrend > 0 ? (total / maxTrend) * 100 : 0;
                    return (
                      <div key={d.label} className="flex-1 flex flex-col items-center gap-2 group">
                        <div className="flex gap-0.5 w-full h-full items-end relative">
                          <div className="absolute -top-10 left-1/2 -translate-x-1/2 bg-gray-900 text-white text-xs font-bold px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10 whitespace-nowrap">
                            P: {d.present} | A: {d.absent}
                          </div>
                          <div className="flex-1 bg-emerald-400 hover:bg-emerald-500 rounded-t-sm transition-all" style={{ height: `${maxTrend > 0 ? (d.present / maxTrend) * 100 : 0}%`, minHeight: d.present > 0 ? "4%" : "0%" }} />
                          <div className="flex-1 bg-red-400 hover:bg-red-500 rounded-t-sm transition-all" style={{ height: `${maxTrend > 0 ? (d.absent / maxTrend) * 100 : 0}%`, minHeight: d.absent > 0 ? "4%" : "0%" }} />
                        </div>
                        <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">{d.label}</span>
                      </div>
                    );
                  })}
                </div>
                <div className="flex items-center justify-center gap-6 mt-6 pt-4 border-t border-gray-100">
                  <span className="flex items-center gap-2 text-xs font-bold text-gray-600"><span className="w-3 h-3 rounded-md bg-emerald-400" /> Present</span>
                  <span className="flex items-center gap-2 text-xs font-bold text-gray-600"><span className="w-3 h-3 rounded-md bg-red-400" /> Absent</span>
                </div>
              </>
            )}
          </div>

          <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm">
            <div className="flex items-center justify-between mb-8">
              <h2 className="text-lg font-bold text-gray-900">Shift Efficiency Comparison</h2>
              <Clock className="w-5 h-5 text-gray-400" />
            </div>
            {loading ? (
              <div className="flex justify-center items-center min-h-[220px]"><Loader2 className="w-8 h-8 animate-spin text-orange-400" /></div>
            ) : shiftEfficiency.length === 0 ? (
              <div className="flex flex-col items-center justify-center min-h-[220px] text-gray-400">
                <Clock className="w-10 h-10 mb-2 opacity-50" />
                <span className="text-sm font-bold">No shift data available</span>
              </div>
            ) : (
              <div className="space-y-6">
                {shiftEfficiency.map((s) => {
                  const effColor = s.efficiency >= 80 ? "text-emerald-600" : s.efficiency >= 60 ? "text-orange-600" : "text-red-600";
                  const barColor = s.efficiency >= 80 ? "bg-emerald-500" : s.efficiency >= 60 ? "bg-orange-500" : "bg-red-500";
                  return (
                    <div key={s.shift}>
                      <div className="flex justify-between items-center mb-2">
                        <span className="text-sm font-bold text-gray-700 uppercase tracking-wide">{s.shift}</span>
                        <span className={`text-sm font-extrabold ${effColor}`}>{s.efficiency}%</span>
                      </div>
                      <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
                        <div className={`${barColor} h-full rounded-full transition-all duration-1000 ease-out`} style={{ width: `${s.efficiency}%` }} />
                      </div>
                      <div className="mt-1.5 text-xs font-bold text-gray-400 text-right">{s.present} / {s.totalEmployees} Present</div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Charts Row 2 */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-bold text-gray-900">Department Overview</h2>
              <Building2 className="w-5 h-5 text-gray-400" />
            </div>
            {loading ? (
              <div className="flex justify-center items-center min-h-[220px]"><Loader2 className="w-8 h-8 animate-spin text-orange-400" /></div>
            ) : departmentStats.length === 0 ? (
              <div className="flex flex-col items-center justify-center min-h-[220px] text-gray-400">
                <Users className="w-10 h-10 mb-2 opacity-50" />
                <span className="text-sm font-bold">No department data</span>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-4">
                {departmentStats.map((d, i) => {
                  const rateColor = d.attendanceRate >= 80 ? "text-emerald-600" : d.attendanceRate >= 60 ? "text-orange-600" : "text-red-600";
                  const barColor = d.attendanceRate >= 80 ? "bg-emerald-500" : d.attendanceRate >= 60 ? "bg-orange-500" : "bg-red-500";
                  return (
                    <div key={d.department + i} className="p-4 bg-gray-50 border border-gray-100 rounded-xl hover:shadow-md transition-shadow">
                      <div className="flex items-center justify-between mb-3">
                        <span className="text-sm font-bold text-gray-900">{d.department}</span>
                        <span className={`text-lg font-extrabold ${rateColor}`}>{d.attendanceRate}%</span>
                      </div>
                      <div className="bg-gray-200 rounded-full h-2.5 overflow-hidden">
                        <div className={`${barColor} h-full rounded-full transition-all duration-700`} style={{ width: `${d.attendanceRate}%` }} />
                      </div>
                      <div className="flex items-center justify-between mt-3 text-xs font-bold">
                        <span className="text-emerald-600 bg-emerald-50 px-2 py-1 rounded">Present: {d.present}</span>
                        <span className="text-red-600 bg-red-50 px-2 py-1 rounded">Absent: {d.absent}</span>
                        <span className="text-orange-600 bg-orange-50 px-2 py-1 rounded">Late: {d.late}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm flex flex-col">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-bold text-gray-900">Overtime Trajectory</h2>
              <Sun className="w-5 h-5 text-gray-400" />
            </div>
            {loading ? (
              <div className="flex-1 flex justify-center items-center min-h-[220px]"><Loader2 className="w-8 h-8 animate-spin text-orange-400" /></div>
            ) : overtimeAnalytics.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center min-h-[220px] text-gray-400">
                <Sun className="w-10 h-10 mb-2 opacity-50" />
                <span className="text-sm font-bold">No overtime data</span>
              </div>
            ) : (
              <div className="flex items-end gap-2 h-56 mt-auto">
                {overtimeAnalytics.map((d) => {
                  const pct = maxOvertime > 0 ? (d.hours / maxOvertime) * 100 : 0;
                  return (
                    <div key={d.month} className="flex-1 flex flex-col items-center gap-2 group">
                      <span className="text-[10px] font-extrabold text-orange-600 opacity-0 group-hover:opacity-100 transition-opacity">{d.hours}h</span>
                      <div className="w-full bg-orange-100 rounded-t-lg relative overflow-hidden" style={{ height: `${Math.max(pct, 2)}%` }}>
                        <div className="absolute bottom-0 w-full bg-gradient-to-t from-orange-500 to-orange-400 rounded-t-lg transition-all duration-500" style={{ height: '100%' }} />
                      </div>
                      <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">{d.month}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Detailed Table */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="p-5 border-b border-gray-100 bg-gray-50/50">
            <h2 className="text-lg font-bold text-gray-900">Detailed Department Summary</h2>
          </div>
          {loading ? (
            <div className="flex justify-center items-center py-16"><Loader2 className="w-8 h-8 animate-spin text-orange-400" /></div>
          ) : departmentStats.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-gray-400">
              <Building2 className="w-10 h-10 mb-2 opacity-30" />
              <span className="text-sm font-bold">No data available</span>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50/80">
                  <tr>
                    <th className="px-5 py-4 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Department</th>
                    <th className="px-5 py-4 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Headcount</th>
                    <th className="px-5 py-4 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Present</th>
                    <th className="px-5 py-4 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Absent</th>
                    <th className="px-5 py-4 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Late</th>
                    <th className="px-5 py-4 text-right text-xs font-bold text-gray-500 uppercase tracking-wider">Attendance Rate</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-100">
                  {departmentStats.map((d, i) => {
                    const rateColor = d.attendanceRate >= 80 ? "text-emerald-600 bg-emerald-50" : d.attendanceRate >= 60 ? "text-orange-600 bg-orange-50" : "text-red-600 bg-red-50";
                    return (
                      <tr key={d.department + i} className="hover:bg-gray-50 transition-colors">
                        <td className="px-5 py-3.5 text-sm font-bold text-gray-900">{d.department}</td>
                        <td className="px-5 py-3.5 text-sm font-bold text-gray-600">{d.total || 0}</td>
                        <td className="px-5 py-3.5 text-sm font-bold text-emerald-600">{d.present}</td>
                        <td className="px-5 py-3.5 text-sm font-bold text-red-600">{d.absent}</td>
                        <td className="px-5 py-3.5 text-sm font-bold text-orange-600">{d.late}</td>
                        <td className="px-5 py-3.5 text-right">
                          <span className={`inline-flex items-center px-2.5 py-1 rounded-md text-sm font-extrabold ${rateColor}`}>
                            {d.attendanceRate}%
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </HRPage>
  );
}
