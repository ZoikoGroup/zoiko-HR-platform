import { useState, useEffect, useMemo, useCallback } from "react";
import { NavLink } from "react-router-dom";
import {
  BadgeCheck,
  Layers,
  Building2,
  CircleDollarSign,
  Users,
  RefreshCw,
  ArrowRight,
  TrendingUp,
  Briefcase,
  AlertCircle,
} from "lucide-react";
import DesignationLayout from "./DesignationLayout";
import { getDesignations } from "../../../service/hrService";
import { formatDate } from "../../../utils/dateTime";
import { formatOrgMoney } from "../../../utils/money";

const LEVELS = Array.from({ length: 10 }, (_, i) => `L${i + 1}`);

const BANDS = [
  { key: "entry", label: "Entry to Mid (L1-L3)", bar: "bg-blue-500", chip: "bg-blue-100 text-blue-800", from: 1, to: 3 },
  { key: "senior", label: "Senior (L4-L6)", bar: "bg-indigo-500", chip: "bg-indigo-100 text-indigo-800", from: 4, to: 6 },
  { key: "lead", label: "Leadership (L7-L10)", bar: "bg-emerald-500", chip: "bg-emerald-100 text-emerald-800", from: 7, to: 10 },
];
const OTHER_BAND = { key: "other", label: "No level", bar: "bg-slate-400", chip: "bg-slate-100 text-slate-700" };

const levelNumber = (level) => {
  const m = /^L(\d+)$/i.exec(String(level || "").trim());
  return m ? Number(m[1]) : null;
};

const bandFor = (level) => {
  const n = levelNumber(level);
  return BANDS.find((b) => n != null && n >= b.from && n <= b.to) || OTHER_BAND;
};

// salaries in the organization's currency (compact: £300K), never a fixed "$"
const money = (n) => (n == null || !Number.isFinite(Number(n)) ? "—" : formatOrgMoney(Number(n), { compact: true }));

function StatCard({ title, value, icon: Icon, subtitle }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-200/90 p-5 shadow-xs hover:shadow-md transition-all">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">{title}</p>
          <p className="text-2xl font-bold text-gray-900 mt-1.5">{value}</p>
          {subtitle ? <p className="text-xs text-gray-400 mt-1">{subtitle}</p> : null}
        </div>
        {Icon && (
          <div className="h-10 w-10 shrink-0 rounded-xl flex items-center justify-center bg-blue-50 text-blue-600 border border-blue-100/60">
            <Icon className="w-5 h-5 stroke-[2.2]" aria-hidden="true" />
          </div>
        )}
      </div>
    </div>
  );
}

export default function DesignationsDashboard() {
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(new Date());

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await getDesignations();
      const data = res?.data?.data ?? res?.data?.items ?? res?.data ?? res?.items ?? res ?? [];
      setRecords(Array.isArray(data) ? data : []);
      setLastUpdated(new Date());
    } catch (err) {
      setError(err?.message || "Failed to load the designations dashboard.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const stats = useMemo(() => {
    const total = records.length;
    const active = records.filter((r) => String(r.status).toLowerCase() === "active").length;
    const departments = new Set(records.map((r) => (r.department_name || "").trim()).filter(Boolean));
    const employees = records.reduce((sum, r) => sum + (Number(r.employees_count) || 0), 0);
    const mins = records.map((r) => Number(r.min_salary)).filter((n) => Number.isFinite(n) && n > 0);
    const maxes = records.map((r) => Number(r.max_salary)).filter((n) => Number.isFinite(n) && n > 0);
    return {
      total,
      active,
      inactive: total - active,
      departments: departments.size,
      employees,
      lowest: mins.length ? Math.min(...mins) : null,
      highest: maxes.length ? Math.max(...maxes) : null,
    };
  }, [records]);

  // Count designations per level L1..L10 from live data + unassigned level bar
  const levelBars = useMemo(() => {
    const bars = LEVELS.map((level) => ({
      level,
      count: records.filter((r) => String(r.level || "").toUpperCase() === level).length,
    }));
    const unassigned = records.filter((r) => levelNumber(r.level) == null).length;
    if (unassigned) bars.push({ level: "—", count: unassigned, none: true });
    return bars;
  }, [records]);
  const maxBar = Math.max(1, ...levelBars.map((b) => b.count));
  const levelsInUse = levelBars.filter((b) => !b.none && b.count > 0).length;

  const salaryByLevel = useMemo(() => {
    return LEVELS.map((level) => {
      const rows = records.filter((r) => String(r.level || "").toUpperCase() === level);
      const mins = rows.map((r) => Number(r.min_salary)).filter((n) => Number.isFinite(n) && n > 0);
      const maxes = rows.map((r) => Number(r.max_salary)).filter((n) => Number.isFinite(n) && n > 0);
      if (!mins.length && !maxes.length) return null;
      const min = mins.length ? Math.min(...mins) : Math.min(...maxes);
      const max = maxes.length ? Math.max(...maxes) : Math.max(...mins);
      return { level, min, max };
    }).filter(Boolean);
  }, [records]);

  const departmentDistribution = useMemo(() => {
    const map = new Map();
    records.forEach((r) => {
      const name = (r.department_name || "").trim() || "No department";
      const row = map.get(name) || { dept: name, count: 0, employees: 0 };
      row.count += 1;
      row.employees += Number(r.employees_count) || 0;
      map.set(name, row);
    });
    return [...map.values()].sort((a, b) => b.count - a.count || a.dept.localeCompare(b.dept));
  }, [records]);

  const recentDesignations = useMemo(
    () => [...records].sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0)).slice(0, 5),
    [records]
  );

  const salaryRange = stats.lowest != null && stats.highest != null ? `${money(stats.lowest)} - ${money(stats.highest)}` : "Not set";

  return (
    <DesignationLayout
      title="Designations Dashboard"
      subtitle="Overview of organizational job titles, seniority levels, department allocation, and roles"
      lastUpdated={lastUpdated}
      isRefreshing={loading}
      onRefresh={load}
      actions={
        <NavLink
          to="/zoiko-hr/designations/list"
          className="inline-flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-semibold shadow-sm transition-all"
        >
          <span>Designation Directory</span>
          <ArrowRight size={14} />
        </NavLink>
      }
    >
      {/* Loading State */}
      {loading && records.length === 0 ? (
        <div className="flex justify-center items-center py-20 bg-white rounded-2xl border border-gray-200" role="status">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
          <span className="ml-3 text-sm text-gray-500 font-medium">Loading designations dashboard...</span>
        </div>
      ) : error && records.length === 0 ? (
        <div role="alert" className="mb-4 px-5 py-4 bg-red-50 border border-red-200 text-red-700 rounded-2xl flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <AlertCircle size={18} className="text-red-500 shrink-0" />
            <span className="text-sm font-medium">{error}</span>
          </div>
          <button
            type="button"
            onClick={load}
            className="px-4 py-1.5 text-xs font-semibold border border-red-200 rounded-xl bg-white hover:bg-red-50 text-red-700 transition-colors shadow-2xs"
          >
            Retry
          </button>
        </div>
      ) : records.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-200/90 p-12 text-center shadow-xs">
          <div className="w-14 h-14 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center mx-auto mb-3 border border-blue-100">
            <BadgeCheck size={28} />
          </div>
          <h3 className="text-base font-bold text-gray-900">No designations yet</h3>
          <p className="text-xs text-gray-500 mt-1 max-w-sm mx-auto">
            Create your first designation to see levels, salary bands, and department coverage here.
          </p>
          <NavLink
            to="/zoiko-hr/designations/list"
            className="inline-flex items-center gap-1.5 mt-5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-xl shadow-xs transition-colors"
          >
            Go to Designation List
          </NavLink>
        </div>
      ) : (
        <div className="space-y-6">
          {error && (
            <div role="alert" className="px-4 py-3 bg-amber-50 border border-amber-200 text-amber-800 rounded-xl text-xs font-medium">
              Could not refresh: {error} Showing the last loaded data.
            </div>
          )}

          {/* Hero Banner */}
          <div className="bg-gradient-to-r from-blue-600 via-blue-700 to-indigo-800 rounded-2xl shadow-md p-6 text-white relative overflow-hidden">
            <div className="flex items-center justify-between gap-4 flex-wrap relative z-10">
              <div>
                <p className="text-blue-100 text-xs font-semibold uppercase tracking-wider">Active Designations</p>
                <p className="text-4xl font-extrabold font-mono mt-1 tracking-tight" data-testid="hero-active">{stats.active}</p>
                <p className="text-blue-100 text-xs mt-1 font-medium">
                  {stats.total} total across {stats.departments} department{stats.departments === 1 ? "" : "s"}
                </p>
              </div>
              <div className="flex items-start gap-6">
                <div className="text-right">
                  <p className="text-blue-100 text-xs font-semibold uppercase tracking-wider">Level Coverage</p>
                  <p className="text-3xl font-extrabold">{levelsInUse}/10</p>
                  <p className="text-blue-100 text-xs mt-1 font-medium">levels in use</p>
                </div>
                <button
                  type="button"
                  onClick={load}
                  disabled={loading}
                  aria-label="Refresh dashboard"
                  className="p-2.5 rounded-xl bg-white/15 hover:bg-white/25 disabled:opacity-60 transition-colors"
                >
                  <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} aria-hidden="true" />
                </button>
              </div>
            </div>
          </div>

          {/* KPI Stat Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-5 gap-4">
            <StatCard title="Total Designations" value={stats.total} icon={BadgeCheck} subtitle={`${stats.inactive} inactive`} />
            <StatCard title="Active Designations" value={stats.active} icon={Layers} subtitle={`${Math.round((stats.active / Math.max(stats.total, 1)) * 100)}% of total`} />
            <StatCard title="Departments Covered" value={stats.departments} icon={Building2} subtitle="Functional areas" />
            <StatCard title="Salary Range" value={salaryRange} icon={CircleDollarSign} subtitle="Lowest minimum to highest maximum" />
            <StatCard title="Employees in Designations" value={stats.employees.toLocaleString()} icon={Users} subtitle="Active employees assigned" />
          </div>

          {/* Level Distribution + Salary Ranges */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Level Distribution Chart */}
            <div className="bg-white rounded-2xl border border-gray-200/90 p-5 shadow-xs">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-base font-bold text-gray-900">Level Distribution</h2>
                <span className="text-xs text-gray-400 font-semibold">{levelsInUse} active levels</span>
              </div>
              <div className="flex items-end gap-2.5 h-44 pt-4 px-2" role="img" aria-label="Designations per level">
                {levelBars.map((ld) => {
                  const band = ld.none ? OTHER_BAND : bandFor(ld.level);
                  const pct = (ld.count / maxBar) * 100;
                  return (
                    <div key={ld.level} className="flex-1 flex flex-col items-center justify-end gap-1.5 h-full group" data-testid={`level-${ld.level}`}>
                      <span className="text-xs text-gray-600 font-bold group-hover:text-blue-600 transition-colors">{ld.count}</span>
                      <div
                        className={`w-full rounded-t-lg ${band.bar} transition-all duration-300 opacity-90 group-hover:opacity-100 shadow-2xs`}
                        style={{ height: ld.count ? `${Math.max(pct, 8)}%` : "3px" }}
                      />
                      <span className="text-[11px] text-gray-500 font-semibold font-mono">{ld.level}</span>
                    </div>
                  );
                })}
              </div>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 mt-4 pt-3 border-t border-gray-100 text-xs text-gray-500">
                {BANDS.map((b) => (
                  <span key={b.key} className="flex items-center gap-1.5 font-medium">
                    <span className={`w-2.5 h-2.5 rounded-full ${b.bar}`} /> {b.label}
                  </span>
                ))}
              </div>
            </div>

            {/* Salary Ranges per Level */}
            <div className="bg-white rounded-2xl border border-gray-200/90 p-5 shadow-xs">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-base font-bold text-gray-900">Salary Ranges by Level</h2>
                <span className="text-xs text-gray-400 font-semibold">{salaryByLevel.length} reported bands</span>
              </div>
              {salaryByLevel.length === 0 ? (
                <div className="py-12 text-center text-xs text-gray-400">
                  No compensation minimum/maximum ranges set on designations.
                </div>
              ) : (
                <div className="space-y-3">
                  {salaryByLevel.map((s) => (
                    <div
                      key={s.level}
                      data-testid={`salary-${s.level}`}
                      className="flex items-center justify-between p-3 rounded-xl bg-gray-50/80 border border-gray-100 text-xs"
                    >
                      <div className="flex items-center gap-2">
                        <span className="px-2 py-0.5 rounded-md font-mono text-xs font-bold bg-blue-100 text-blue-800">
                          {s.level}
                        </span>
                        <span className="text-gray-600 font-medium">{bandFor(s.level).label}</span>
                      </div>
                      <span className="font-bold text-gray-900 font-mono">
                        {money(s.min)} - {money(s.max)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Department Distribution & Recent Roles */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Department Distribution */}
            <div className="bg-white rounded-2xl border border-gray-200/90 p-5 shadow-xs">
              <h2 className="text-base font-bold text-gray-900 mb-4">Department Distribution</h2>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-gray-100 text-gray-400 font-semibold uppercase tracking-wider">
                      <th className="py-2.5">Department</th>
                      <th className="py-2.5 text-center">Designations</th>
                      <th className="py-2.5 text-right">Assigned Staff</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50 text-gray-700 font-medium">
                    {departmentDistribution.map((d) => (
                      <tr key={d.dept} className="hover:bg-slate-50/80 transition-colors">
                        <td className="py-3 font-semibold text-gray-900">{d.dept}</td>
                        <td className="py-3 text-center">
                          <span className="px-2 py-0.5 rounded-md bg-gray-100 font-bold">{d.count}</span>
                        </td>
                        <td className="py-3 text-right font-bold text-slate-800">{d.employees}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Recent Designations */}
            <div className="bg-white rounded-2xl border border-gray-200/90 p-5 shadow-xs">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-base font-bold text-gray-900">Recently Added Designations</h2>
                <NavLink to="/zoiko-hr/designations/list" className="text-xs font-semibold text-blue-600 hover:text-blue-700">
                  View All
                </NavLink>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-gray-100 text-gray-400 font-semibold uppercase tracking-wider">
                      <th className="py-2.5">Title</th>
                      <th className="py-2.5">Department</th>
                      <th className="py-2.5 text-center">Level</th>
                      <th className="py-2.5 text-right">Created</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50 text-gray-700">
                    {recentDesignations.map((r) => (
                      <tr key={r.id} className="hover:bg-slate-50/80 transition-colors">
                        <td className="py-3 font-semibold text-gray-900">{r.title}</td>
                        <td className="py-3 text-gray-500">{r.department_name || "—"}</td>
                        <td className="py-3 text-center">
                          <span className="px-2 py-0.5 rounded-md font-mono font-bold bg-blue-50 text-blue-700 border border-blue-100/60">
                            {r.level || "—"}
                          </span>
                        </td>
                        <td className="py-3 text-right text-gray-400">{formatDate(r.created_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}
    </DesignationLayout>
  );
}
