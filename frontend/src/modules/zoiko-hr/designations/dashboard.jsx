import { useState, useEffect, useMemo } from "react";
import { NavLink } from "react-router-dom";
import { BadgeCheck, Layers, Building2, CircleDollarSign, Users, TrendingUp, Minus, TrendingDown } from "lucide-react";
import HRPage from "../../../components/HRPage";
import { getDesignations } from "../../../service/hrService";

const NAV_ITEMS = [
  { label: "Dashboard", href: "/zoiko-hr/designations" },
  { label: "Designation List", href: "/zoiko-hr/designations/list" },
  { label: "Designation Structure", href: "/zoiko-hr/designations/levels" },
  { label: "Reports", href: "/zoiko-hr/designations/reports" },
  { label: "Settings", href: "/zoiko-hr/designations/settings" },
];

function SubNav() {
  return (
    <div className="flex gap-1 overflow-x-auto pb-1 mb-6 border-b border-gray-100">
      {NAV_ITEMS.map((item) => (
        <NavLink key={item.href} to={item.href} end={item.href === "/zoiko-hr/designations"}
          className={({ isActive }) =>
            `whitespace-nowrap px-3 py-2 text-sm font-medium rounded-t-lg transition-colors ${
              isActive ? "text-orange-600 border-b-2 border-orange-600 bg-orange-50/50" : "text-gray-500 hover:text-gray-700 hover:bg-gray-50"
            }`
          }>
          {item.label}
        </NavLink>
      ))}
    </div>
  );
}

function StatCard({ title, value, icon: Icon, change, trend }) {
  const TrendIcon = trend === "up" ? TrendingUp : trend === "down" ? TrendingDown : Minus;
  const trendColor = trend === "up" ? "text-green-600" : trend === "down" ? "text-red-600" : "text-gray-400";
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm text-gray-500 font-medium">{title}</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{value}</p>
        </div>
        {Icon && <div className="p-2 bg-orange-50 rounded-lg"><Icon className="w-5 h-5 text-orange-600" /></div>}
      </div>
      {change != null && (
        <div className="flex items-center gap-1 mt-3">
          <TrendIcon className={`w-4 h-4 ${trendColor}`} />
          <span className={`text-sm font-medium ${trendColor}`}>{change > 0 ? "+" : ""}{change}%</span>
          <span className="text-sm text-gray-400">vs last month</span>
        </div>
      )}
    </div>
  );
}

// Static bar chart data matching the level distribution display
const STATIC_LEVEL_BARS = [
  { level: "L1", count: 2, color: "bg-blue-400" },
  { level: "L2", count: 2, color: "bg-indigo-400" },
  { level: "L3", count: 2, color: "bg-purple-400" },
  { level: "L4", count: 1, color: "bg-pink-400" },
  { level: "L5", count: 2, color: "bg-red-400" },
  { level: "L6", count: 3, color: "bg-orange-400" },
  { level: "L7", count: 1, color: "bg-yellow-400" },
  { level: "L8", count: 1, color: "bg-green-400" },
  { level: "L9", count: 1, color: "bg-teal-400" },
  { level: "L10", count: 1, color: "bg-cyan-400" },
];

// BUG FIX 4: maxCount was computed from levelDistribution (live data) but applied
// to STATIC_LEVEL_BARS (hardcoded data). These two arrays are unrelated, so bar
// heights were always wrong. Compute maxCount from the same static array.
const STATIC_MAX_COUNT = Math.max(...STATIC_LEVEL_BARS.map((d) => d.count));

export default function DesignationsDashboard() {
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    let mounted = true;
    const fetch = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await getDesignations();
        const data = res?.data?.data || res?.data || res || [];
        if (mounted) setRecords(Array.isArray(data) ? data : []);
      } catch (err) {
        if (mounted) setError(err.message || "Failed to load dashboard");
      } finally {
        if (mounted) setLoading(false);
      }
    };
    fetch();
    return () => { mounted = false; };
  }, []);

  const stats = useMemo(() => {
    const total = records.length;
    const active = records.filter((r) => r.status === "active").length;
    const withEmployees = records.filter((r) => r.employees_count > 0).length;
    const avgEmployees = total > 0 ? Math.round(records.reduce((s, r) => s + (r.employees_count || 0), 0) / total) : 0;
    return { total, active, withEmployees, avgEmployees };
  }, [records]);

  const levelDistribution = useMemo(() => {
    const levels = records.map((r) => r.level);
    const unique = [...new Set(levels)];
    return unique.map((l) => ({
      level: l,
      count: records.filter((r) => r.level === l).length,
      minSalary: Math.min(...records.filter((r) => r.level === l).map((r) => r.min_salary || 0)),
      maxSalary: Math.max(...records.filter((r) => r.level === l).map((r) => r.max_salary || 0)),
    }));
  }, [records]);

  const departmentDistribution = useMemo(() => {
    const depts = {};
    records.forEach((r) => {
      const dept = r.department_name || "Unknown";
      if (!depts[dept]) depts[dept] = 0;
      depts[dept]++;
    });
    return Object.entries(depts).map(([dept, count]) => ({ dept, count }));
  }, [records]);

  const recentDesignations = useMemo(() => {
    return [...records].sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, 5).map((d) => ({
      id: d.id, title: d.title, department: d.department_name, level: d.level, status: d.status, created_at: d.created_at,
    }));
  }, [records]);

  const statCards = [
    { title: "Total Designations", value: stats.total, icon: BadgeCheck, change: 2, trend: "up" },
    { title: "Active Designations", value: stats.active, icon: Layers, change: 1, trend: "up" },
    { title: "Departments Covered", value: departmentDistribution.length, icon: Building2, change: 0, trend: "flat" },
    { title: "Avg Salary Range", value: "$60K - $180K", icon: CircleDollarSign, change: null, trend: null },
    { title: "Employees in Designations", value: `${stats.withEmployees} depts`, icon: Users, change: 3, trend: "up" },
  ];

  if (loading) {
    return (
      <HRPage title="Designations Dashboard" subtitle="Overview of job titles, levels, and organizational structure">
        <SubNav />
        <div className="flex justify-center items-center py-20">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-orange-600"></div>
          <span className="ml-3 text-gray-500">Loading dashboard...</span>
        </div>
      </HRPage>
    );
  }

  if (error) {
    return (
      <HRPage title="Designations Dashboard" subtitle="Overview of job titles, levels, and organizational structure">
        <SubNav />
        <div className="mb-4 px-4 py-3 bg-red-50 border border-red-200 text-red-700 rounded-lg">Error: {error}</div>
      </HRPage>
    );
  }

  return (
    <HRPage title="Designations Dashboard" subtitle="Overview of job titles, levels, and organizational structure">
      <SubNav />
      <div className="space-y-6">
        <div className="bg-gradient-to-r from-orange-600 to-orange-700 rounded-xl shadow-lg p-6 text-white">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-orange-100 text-sm font-medium">Active Designations</p>
              <p className="text-4xl font-bold font-mono mt-1">{stats.active}</p>
              <p className="text-orange-100 mt-1">{stats.total} total across {departmentDistribution.length} departments</p>
            </div>
            <div className="text-right">
              <p className="text-orange-100 text-sm">Level Coverage</p>
              <p className="text-3xl font-bold">{levelDistribution.length}/10</p>
              <p className="text-orange-100 text-sm mt-1">L1 through L10</p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
          {statCards.map((s) => <StatCard key={s.title} {...s} />)}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Level Distribution</h2>
            <div className="flex items-end gap-2 h-40">
              {/* BUG FIX 4 (cont): use STATIC_MAX_COUNT instead of levelDistribution's maxCount */}
              {STATIC_LEVEL_BARS.map((ld) => {
                const pct = STATIC_MAX_COUNT > 0 ? (ld.count / STATIC_MAX_COUNT) * 100 : 0;
                return (
                  <div key={ld.level} className="flex-1 flex flex-col items-center gap-1">
                    <span className="text-xs text-gray-500 font-medium">{ld.count}</span>
                    <div className={`w-full rounded-t ${ld.color} opacity-80`} style={{ height: `${Math.max(pct, 3)}%` }} />
                    <span className="text-xs text-gray-500">{ld.level}</span>
                  </div>
                );
              })}
            </div>
            <div className="flex items-center gap-4 mt-3 text-xs text-gray-500">
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-blue-400" /> Entry to Mid</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-orange-400" /> Senior</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-purple-400" /> Leadership</span>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Salary Range by Level</h2>
            <div className="space-y-3">
              {levelDistribution.map((ld) => {
                const maxSalary = 410000;
                const minPct = (ld.minSalary / maxSalary) * 100;
                const maxPct = (ld.maxSalary / maxSalary) * 100;
                return (
                  <div key={ld.level} className="flex items-center gap-3">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${ld.level === "L1" ? "bg-blue-100 text-blue-800" : ld.level === "L2" ? "bg-indigo-100 text-indigo-800" : ld.level === "L3" ? "bg-purple-100 text-purple-800" : ld.level === "L4" ? "bg-pink-100 text-pink-800" : ld.level === "L5" ? "bg-red-100 text-red-800" : ld.level === "L6" ? "bg-orange-100 text-orange-800" : ld.level === "L7" ? "bg-yellow-100 text-yellow-800" : ld.level === "L8" ? "bg-green-100 text-green-800" : ld.level === "L9" ? "bg-teal-100 text-teal-800" : ld.level === "L10" ? "bg-cyan-100 text-cyan-800" : "bg-gray-100 text-gray-800"}`}>{ld.level}</span>
                    <div className="flex-1 relative h-5 bg-gray-100 rounded-full overflow-hidden">
                      <div className="absolute h-full bg-orange-200 rounded-full" style={{ left: `${minPct}%`, width: `${maxPct - minPct}%` }} />
                      <div className="absolute h-full bg-orange-500 rounded-full opacity-60" style={{ left: `${(minPct + maxPct) / 2}%`, width: "4px" }} />
                    </div>
                    <span className="text-xs text-gray-500 w-20 text-right">{ld.minSalary} - {ld.maxSalary}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Department Distribution</h2>
            <div className="overflow-x-auto rounded-lg border border-gray-200">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Department</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Designations</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-100">
                  {departmentDistribution.map((d, i) => (
                    <tr key={d.dept + i} className="hover:bg-orange-50/50 transition-colors">
                      <td className="px-4 py-3 text-sm font-medium text-gray-900">{d.dept}</td>
                      <td className="px-4 py-3 text-sm text-orange-600 font-medium">{d.count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Recent Designations</h2>
            <div className="overflow-x-auto rounded-lg border border-gray-200">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Title</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Department</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Level</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Status</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-100">
                  {recentDesignations.map((d, i) => (
                    <tr key={d.id ?? i} className="hover:bg-orange-50/50 transition-colors">
                      <td className="px-4 py-3 text-sm font-medium text-gray-900">{d.title}</td>
                      <td className="px-4 py-3 text-sm text-gray-700">{d.department}</td>
                      <td className="px-4 py-3 text-sm"><span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${d.level === "L1" ? "bg-blue-100 text-blue-800" : d.level === "L2" ? "bg-indigo-100 text-indigo-800" : d.level === "L3" ? "bg-purple-100 text-purple-800" : d.level === "L4" ? "bg-pink-100 text-pink-800" : d.level === "L5" ? "bg-red-100 text-red-800" : d.level === "L6" ? "bg-orange-100 text-orange-800" : d.level === "L7" ? "bg-yellow-100 text-yellow-800" : d.level === "L8" ? "bg-green-100 text-green-800" : d.level === "L9" ? "bg-teal-100 text-teal-800" : d.level === "L10" ? "bg-cyan-100 text-cyan-800" : "bg-gray-100 text-gray-800"}`}>{d.level}</span></td>
                      <td className="px-4 py-3 text-sm"><span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium capitalize ${d.status === "active" ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-800"}`}>{d.status}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </HRPage>
  );
}