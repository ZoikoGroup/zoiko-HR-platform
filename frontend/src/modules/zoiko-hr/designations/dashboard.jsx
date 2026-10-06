import { useState, useEffect, useMemo, useCallback } from "react";
import { NavLink } from "react-router-dom";
import { BadgeCheck, Layers, Building2, CircleDollarSign, Users, RefreshCw } from "lucide-react";
import HRPage from "../../../components/HRPage";
import { getDesignations } from "../../../service/hrService";
import { formatDate } from "../../../utils/dateTime";

const NAV_ITEMS = [
  { label: "Dashboard", href: "/zoiko-hr/designations" },
  { label: "Designation List", href: "/zoiko-hr/designations/list" },
  { label: "Designation Structure", href: "/zoiko-hr/designations/levels" },
  { label: "Reports", href: "/zoiko-hr/designations/reports" },
  { label: "Settings", href: "/zoiko-hr/designations/settings" },
];

const LEVELS = Array.from({ length: 10 }, (_, i) => `L${i + 1}`);

// Level bands: the colour only groups levels, the numbers always come from the data.
const BANDS = [
  { key: "entry", label: "Entry to Mid (L1-L3)", bar: "bg-blue-400", chip: "bg-blue-100 text-blue-800", from: 1, to: 3 },
  { key: "senior", label: "Senior (L4-L6)", bar: "bg-indigo-400", chip: "bg-indigo-100 text-indigo-800", from: 4, to: 6 },
  { key: "lead", label: "Leadership (L7-L10)", bar: "bg-emerald-400", chip: "bg-emerald-100 text-emerald-800", from: 7, to: 10 },
];
const OTHER_BAND = { key: "other", label: "No level", bar: "bg-gray-300", chip: "bg-gray-100 text-gray-700" };

const levelNumber = (level) => {
  const m = /^L(\d+)$/i.exec(String(level || "").trim());
  return m ? Number(m[1]) : null;
};
const bandFor = (level) => {
  const n = levelNumber(level);
  return BANDS.find((b) => n != null && n >= b.from && n <= b.to) || OTHER_BAND;
};

const money = (n) => {
  if (n == null || !Number.isFinite(n)) return "—";
  if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  if (Math.abs(n) >= 1_000) return `$${Math.round(n / 1_000)}K`;
  return `$${Math.round(n)}`;
};

function SubNav() {
  return (
    <div className="flex gap-1 overflow-x-auto pb-1 mb-6 border-b border-gray-100">
      {NAV_ITEMS.map((item) => (
        <NavLink key={item.href} to={item.href} end={item.href === "/zoiko-hr/designations"}
          className={({ isActive }) =>
            `whitespace-nowrap px-3 py-2 text-sm font-medium rounded-t-lg transition-colors ${
              isActive ? "text-blue-600 border-b-2 border-blue-600 bg-blue-50/50" : "text-gray-500 hover:text-gray-700 hover:bg-gray-50"
            }`
          }>
          {item.label}
        </NavLink>
      ))}
    </div>
  );
}

function StatCard({ title, value, icon: Icon, subtitle }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm text-gray-500 font-medium">{title}</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{value}</p>
          {subtitle ? <p className="text-xs text-gray-400 mt-0.5">{subtitle}</p> : null}
        </div>
        {Icon && (
          <div className="h-10 w-10 shrink-0 rounded-lg flex items-center justify-center bg-blue-50 text-blue-600">
            <Icon className="w-5 h-5" aria-hidden="true" strokeWidth={2.25} />
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

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await getDesignations();
      const data = res?.data?.data || res?.data || res || [];
      setRecords(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err?.message || "Failed to load the designations dashboard.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const stats = useMemo(() => {
    const total = records.length;
    const active = records.filter((r) => String(r.status).toLowerCase() === "active").length;
    const departments = new Set(records.map((r) => (r.department_name || "").trim()).filter(Boolean));
    const employees = records.reduce((sum, r) => sum + (Number(r.employees_count) || 0), 0);
    const mins = records.map((r) => Number(r.min_salary)).filter((n) => Number.isFinite(n) && n > 0);
    const maxes = records.map((r) => Number(r.max_salary)).filter((n) => Number.isFinite(n) && n > 0);
    return {
      total, active, inactive: total - active, departments: departments.size, employees,
      lowest: mins.length ? Math.min(...mins) : null,
      highest: maxes.length ? Math.max(...maxes) : null,
    };
  }, [records]);

  // One bar per level, L1..L10, counted from the data (plus "No level" when some rows have none).
  const levelBars = useMemo(() => {
    const bars = LEVELS.map((level) => ({ level, count: records.filter((r) => String(r.level || "").toUpperCase() === level).length }));
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
  const salaryScale = Math.max(1, ...salaryByLevel.map((s) => s.max));

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
    [records],
  );

  const title = "Designations Dashboard";
  const subtitle = "Overview of job titles, levels, and organizational structure";

  if (loading && records.length === 0) {
    return (
      <HRPage title={title} subtitle={subtitle}>
        <SubNav />
        <div className="flex justify-center items-center py-20" role="status">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          <span className="ml-3 text-gray-500">Loading dashboard...</span>
        </div>
      </HRPage>
    );
  }

  if (error && records.length === 0) {
    return (
      <HRPage title={title} subtitle={subtitle}>
        <SubNav />
        <div role="alert" className="mb-4 px-4 py-3 bg-red-50 border border-red-200 text-red-700 rounded-lg flex items-center justify-between gap-3">
          <span>{error}</span>
          <button type="button" onClick={load} className="px-3 py-1 text-sm font-semibold border border-red-200 rounded-lg bg-white hover:bg-red-50">Retry</button>
        </div>
      </HRPage>
    );
  }

  if (records.length === 0) {
    return (
      <HRPage title={title} subtitle={subtitle}>
        <SubNav />
        <div className="bg-white rounded-xl border border-gray-200 p-10 text-center">
          <BadgeCheck className="w-10 h-10 text-gray-300 mx-auto mb-3" aria-hidden="true" />
          <p className="text-gray-800 font-semibold">No designations yet</p>
          <p className="text-sm text-gray-500 mt-1">Create your first designation to see levels, salary ranges and department coverage here.</p>
          <NavLink to="/zoiko-hr/designations/list" className="inline-block mt-4 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-lg">
            Go to Designation List
          </NavLink>
        </div>
      </HRPage>
    );
  }

  const salaryRange = stats.lowest != null && stats.highest != null ? `${money(stats.lowest)} - ${money(stats.highest)}` : "Not set";

  return (
    <HRPage title={title} subtitle={subtitle}>
      <SubNav />
      <div className="space-y-6">
        {error ? (
          <div role="alert" className="px-4 py-3 bg-amber-50 border border-amber-200 text-amber-800 rounded-lg text-sm">
            Could not refresh: {error} Showing the last loaded data.
          </div>
        ) : null}

        <div className="bg-gradient-to-r from-blue-600 to-blue-700 rounded-xl shadow-lg p-6 text-white">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div>
              <p className="text-blue-100 text-sm font-medium">Active Designations</p>
              <p className="text-4xl font-bold font-mono mt-1" data-testid="hero-active">{stats.active}</p>
              <p className="text-blue-100 mt-1">
                {stats.total} total across {stats.departments} department{stats.departments === 1 ? "" : "s"}
              </p>
            </div>
            <div className="flex items-start gap-6">
              <div className="text-right">
                <p className="text-blue-100 text-sm">Level Coverage</p>
                <p className="text-3xl font-bold">{levelsInUse}/10</p>
                <p className="text-blue-100 text-sm mt-1">levels in use</p>
              </div>
              <button type="button" onClick={load} disabled={loading} aria-label="Refresh dashboard"
                className="p-2 rounded-lg bg-white/15 hover:bg-white/25 disabled:opacity-60 transition-colors">
                <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} aria-hidden="true" />
              </button>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-5 gap-4">
          <StatCard title="Total Designations" value={stats.total} icon={BadgeCheck} subtitle={`${stats.inactive} inactive`} />
          <StatCard title="Active Designations" value={stats.active} icon={Layers}
            subtitle={`${Math.round((stats.active / Math.max(stats.total, 1)) * 100)}% of total`} />
          <StatCard title="Departments Covered" value={stats.departments} icon={Building2} />
          <StatCard title="Salary Range" value={salaryRange} icon={CircleDollarSign} subtitle="Lowest minimum to highest maximum" />
          <StatCard title="Employees in Designations" value={stats.employees.toLocaleString()} icon={Users} subtitle="Active employees assigned" />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Level Distribution</h2>
            <div className="flex items-end gap-2 h-40" role="img" aria-label="Designations per level">
              {levelBars.map((ld) => {
                const band = ld.none ? OTHER_BAND : bandFor(ld.level);
                const pct = (ld.count / maxBar) * 100;
                return (
                  <div key={ld.level} className="flex-1 flex flex-col items-center justify-end gap-1 h-full" data-testid={`level-${ld.level}`}>
                    <span className="text-xs text-gray-500 font-medium">{ld.count}</span>
                    <div className={`w-full rounded-t ${band.bar} opacity-80`} style={{ height: ld.count ? `${Math.max(pct, 6)}%` : "2px" }} />
                    <span className="text-xs text-gray-500">{ld.level}</span>
                  </div>
                );
              })}
            </div>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-3 text-xs text-gray-500">
              {BANDS.map((b) => (
                <span key={b.key} className="flex items-center gap-1"><span className={`w-2 h-2 rounded-full ${b.bar}`} /> {b.label}</span>
              ))}
            </div>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Salary Range by Level</h2>
            {salaryByLevel.length === 0 ? (
              <p className="text-sm text-gray-500 py-6 text-center">No salary ranges set yet. Add a minimum and maximum salary to a designation to see it here.</p>
            ) : (
              <div className="space-y-3">
                {salaryByLevel.map((ld) => {
                  const minPct = (ld.min / salaryScale) * 100;
                  const maxPct = (ld.max / salaryScale) * 100;
                  return (
                    <div key={ld.level} className="flex items-center gap-3" data-testid={`salary-${ld.level}`}>
                      <span className={`inline-flex items-center justify-center w-10 px-2 py-0.5 rounded text-xs font-medium ${bandFor(ld.level).chip}`}>{ld.level}</span>
                      <div className="flex-1 relative h-5 bg-gray-100 rounded-full overflow-hidden">
                        <div className="absolute h-full bg-blue-200 rounded-full" style={{ left: `${minPct}%`, width: `${Math.max(maxPct - minPct, 1.5)}%` }} />
                      </div>
                      <span className="text-xs text-gray-600 w-28 text-right">{money(ld.min)} - {money(ld.max)}</span>
                    </div>
                  );
                })}
              </div>
            )}
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
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Employees</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-100">
                  {departmentDistribution.map((d) => (
                    <tr key={d.dept} className="hover:bg-blue-50/50 transition-colors">
                      <td className="px-4 py-3 text-sm font-medium text-gray-900">{d.dept}</td>
                      <td className="px-4 py-3 text-sm text-blue-600 font-medium">{d.count}</td>
                      <td className="px-4 py-3 text-sm text-gray-700">{d.employees}</td>
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
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Created</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-100">
                  {recentDesignations.map((d) => (
                    <tr key={d.id} className="hover:bg-blue-50/50 transition-colors">
                      <td className="px-4 py-3 text-sm font-medium text-gray-900">{d.title}</td>
                      <td className="px-4 py-3 text-sm text-gray-700">{d.department_name || "—"}</td>
                      <td className="px-4 py-3 text-sm">
                        {d.level ? <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${bandFor(d.level).chip}`}>{d.level}</span> : "—"}
                      </td>
                      <td className="px-4 py-3 text-sm">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium capitalize ${String(d.status).toLowerCase() === "active" ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-800"}`}>{d.status}</span>
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-500">{d.created_at ? formatDate(d.created_at) : "—"}</td>
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
