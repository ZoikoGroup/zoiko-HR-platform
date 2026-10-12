import { useState, useEffect, useMemo, useCallback } from "react";
import { NavLink } from "react-router-dom";
import { Download, TrendingUp, Users, Building2, CircleDollarSign, Calendar, RefreshCw } from "lucide-react";
import HRPage from "../../../components/HRPage";
import { getDesignationReport } from "../../../service/hrService";

const NAV_ITEMS = [
  { label: "Dashboard", href: "/zoiko-hr/designations" },
  { label: "Designation List", href: "/zoiko-hr/designations/list" },
  { label: "Designation Structure", href: "/zoiko-hr/designations/levels" },
  { label: "Reports", href: "/zoiko-hr/designations/reports" },
  { label: "Settings", href: "/zoiko-hr/designations/settings" },
];

const money = (n) => {
  if (n == null || !Number.isFinite(n) || n === 0) return "$0";
  if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  if (Math.abs(n) >= 1_000) return `$${Math.round(n / 1_000)}K`;
  return `$${Math.round(n)}`;
};

const csvCell = (v) => {
  const s = v == null ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

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

function StatCard({ title, value, icon: Icon, subtitle }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm text-gray-500 font-medium">{title}</p>
          <p className="text-xl 2xl:text-2xl font-bold text-gray-900 mt-1 whitespace-nowrap">{value}</p>
          {subtitle ? <p className="text-xs text-gray-400 mt-0.5">{subtitle}</p> : null}
        </div>
        {Icon && (
          <div className="h-10 w-10 shrink-0 rounded-lg flex items-center justify-center bg-orange-50 text-orange-600">
            <Icon className="w-5 h-5" aria-hidden="true" strokeWidth={2.25} />
          </div>
        )}
      </div>
    </div>
  );
}

export default function DesignationReports() {
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async (fresh = false) => {
    setLoading(true);
    setError(null);
    try {
      setReport(await getDesignationReport(fresh ? { _: Date.now() } : undefined));
    } catch (err) {
      setError(err?.message || "Failed to load the designation report.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const totals = report?.totals;
  const trend = report?.headcount_trend || [];
  const maxHeadcount = Math.max(1, ...trend.map((m) => m.count));
  const growth = report?.designation_growth || [];
  const departments = report?.by_department || [];

  const exportCsv = useCallback(() => {
    if (!report) return;
    const header = ["Designation", "Code", "Department", "Level", "Status", "Active employees", "Min salary", "Max salary"];
    const lines = [header, ...report.designations.map((r) => [r.title, r.designation_code, r.department, r.level, r.status, r.employees, r.min_salary, r.max_salary])];
    const blob = new Blob([lines.map((l) => l.map(csvCell).join(",")).join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "designation_report.csv";
    a.click();
    URL.revokeObjectURL(url);
  }, [report]);

  const title = "Designation Reports";
  const subtitle = "Analytics and insights across all designations";

  if (loading && !report) {
    return (
      <HRPage title={title} subtitle={subtitle}>
        <SubNav />
        <div className="flex justify-center items-center py-20" role="status">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-orange-600"></div>
          <span className="ml-3 text-gray-500">Loading reports...</span>
        </div>
      </HRPage>
    );
  }

  if (error && !report) {
    return (
      <HRPage title={title} subtitle={subtitle}>
        <SubNav />
        <div role="alert" className="mb-4 px-4 py-3 bg-red-50 border border-red-200 text-red-700 rounded-lg flex items-center justify-between gap-3">
          <span>{error}</span>
          <button type="button" onClick={() => load(true)} className="px-3 py-1 text-sm font-semibold border border-red-200 rounded-lg bg-white hover:bg-red-50">Retry</button>
        </div>
      </HRPage>
    );
  }

  if (!totals || totals.designations === 0) {
    return (
      <HRPage title={title} subtitle={subtitle}>
        <SubNav />
        <div className="bg-white rounded-xl border border-gray-200 p-10 text-center">
          <Building2 className="w-10 h-10 text-gray-300 mx-auto mb-3" aria-hidden="true" />
          <p className="text-gray-800 font-semibold">No designations to report on yet</p>
          <p className="text-sm text-gray-500 mt-1">Reports appear once designations exist: add them in the list or upload employees with a Designation column.</p>
          <NavLink to="/zoiko-hr/designations/list" className="inline-block mt-4 px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white text-sm font-semibold rounded-lg">
            Go to Designation List
          </NavLink>
        </div>
      </HRPage>
    );
  }

  const salaryBudget = totals.salary_max_total > 0
    ? `${money(totals.salary_min_total)} - ${money(totals.salary_max_total)}`
    : "Not set";

  return (
    <HRPage title={title} subtitle={subtitle}>
      <SubNav />
      <div className="space-y-6">
        {error ? (
          <div role="alert" className="px-4 py-3 bg-amber-50 border border-amber-200 text-amber-800 rounded-lg text-sm">Could not refresh: {error} Showing the last loaded data.</div>
        ) : null}

        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Designation Reports</h1>
            <p className="text-sm text-gray-500 mt-1">Analytics and insights across all designations</p>
          </div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => load(true)} disabled={loading} aria-label="Refresh report"
              className="p-2 border border-gray-200 rounded-lg hover:bg-gray-50 text-gray-500 disabled:opacity-60">
              <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} aria-hidden="true" />
            </button>
            <button type="button" onClick={exportCsv}
              className="flex items-center gap-2 px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-colors text-sm font-medium">
              <Download className="w-4 h-4" /> Export CSV
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard title="Total Designations" value={totals.designations} icon={Building2}
            subtitle={`${totals.active} active · ${totals.inactive} inactive`} />
          <StatCard title="Total Headcount" value={totals.employees.toLocaleString()} icon={Users}
            subtitle={`${totals.unfilled} designation${totals.unfilled === 1 ? "" : "s"} with no employees`} />
          <StatCard title="Salary Budget" value={salaryBudget} icon={CircleDollarSign}
            subtitle="Minimum - maximum pay across current headcount" />
          <StatCard title="Departments" value={totals.departments} icon={TrendingUp}
            subtitle={totals.without_salary_range ? `${totals.without_salary_range} without a salary range` : "All have a salary range"} />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h2 className="text-lg font-semibold text-gray-900">Headcount Trend</h2>
            <p className="text-xs text-gray-400 mb-4">Active employees holding a designation, by joining date (cumulative)</p>
            <div className="flex items-end gap-2 h-48" role="img" aria-label="Headcount by month">
              {trend.map((h) => {
                const pct = (h.count / maxHeadcount) * 100;
                return (
                  <div key={h.month} className="flex-1 flex flex-col items-center gap-1 h-full justify-end" data-testid={`trend-${h.month}`}>
                    <span className="text-[10px] text-gray-500 font-medium">{h.count}</span>
                    <div className="w-full bg-orange-200 rounded-t" style={{ height: h.count ? `${Math.max(pct, 4)}%` : "2px" }}
                      title={`${h.label}: ${h.count} (${h.joined} joined)`} />
                    <span className="text-[10px] text-gray-400 whitespace-nowrap">{h.label.split(" ")[0]}</span>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Designation Growth</h2>
            {growth.length === 0 ? (
              <p className="text-sm text-gray-500 py-6 text-center">No creation dates recorded yet.</p>
            ) : (
              <div className="space-y-4">
                {growth.map((g) => (
                  <div key={g.quarter} className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0" data-testid={`growth-${g.quarter}`}>
                    <div className="flex items-center gap-3">
                      <div className="p-1.5 bg-orange-50 rounded-lg"><Calendar className="w-4 h-4 text-orange-600" /></div>
                      <div>
                        <p className="text-sm font-medium text-gray-900">{g.quarter}</p>
                        <p className="text-xs text-gray-500">{g.total} total designation{g.total === 1 ? "" : "s"}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <span className={`text-sm font-semibold ${g.new > 0 ? "text-green-600" : "text-gray-400"}`}>{g.new > 0 ? `+${g.new}` : "0"}</span>
                      <p className="text-[10px] text-gray-400">new</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900">Budget by Department</h2>
            <span className="text-xs text-gray-400">{totals.designations} designations in {totals.departments} department{totals.departments === 1 ? "" : "s"}</span>
          </div>
          <div className="overflow-x-auto rounded-lg border border-gray-200">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Department</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Designations</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Employees</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Salary budget (min - max)</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-100">
                {departments.map((d) => (
                  <tr key={d.department} className="hover:bg-orange-50/50 transition-colors">
                    <td className="px-4 py-3 text-sm font-medium text-gray-900">{d.department}</td>
                    <td className="px-4 py-3 text-sm text-orange-600 font-medium">
                      {d.designations}
                      {d.active_designations !== d.designations ? <span className="ml-1 text-xs text-gray-400">({d.active_designations} active)</span> : null}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-700">{d.employees}</td>
                    <td className="px-4 py-3 text-sm text-gray-700 text-right">
                      {d.salary_max_total > 0 ? `${money(d.salary_min_total)} - ${money(d.salary_max_total)}` : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-gray-50">
                <tr>
                  <td className="px-4 py-3 text-sm font-semibold text-gray-900">Total</td>
                  <td className="px-4 py-3 text-sm font-semibold text-gray-900">{totals.designations}</td>
                  <td className="px-4 py-3 text-sm font-semibold text-gray-900">{totals.employees}</td>
                  <td className="px-4 py-3 text-sm font-semibold text-gray-900 text-right">{salaryBudget}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      </div>
    </HRPage>
  );
}
