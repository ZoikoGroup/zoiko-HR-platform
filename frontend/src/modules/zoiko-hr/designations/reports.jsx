import { useState, useEffect, useMemo, useCallback } from "react";
import { NavLink } from "react-router-dom";
import {
  Download,
  TrendingUp,
  Users,
  Building2,
  CircleDollarSign,
  Calendar,
  RefreshCw,
  AlertCircle,
  FileSpreadsheet,
} from "lucide-react";
import DesignationLayout from "./DesignationLayout";
import { getDesignationReport } from "../../../service/hrService";

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

function StatCard({ title, value, icon: Icon, subtitle }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-200/90 p-5 shadow-xs hover:shadow-md transition-all">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">{title}</p>
          <p className="text-2xl font-bold text-gray-900 mt-1.5 whitespace-nowrap">{value}</p>
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

export default function DesignationReports() {
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(new Date());

  const load = useCallback(async (fresh = false) => {
    setLoading(true);
    setError(null);
    try {
      const data = await getDesignationReport(fresh ? { _: Date.now() } : undefined);
      setReport(data);
      setLastUpdated(new Date());
    } catch (err) {
      setError(err?.message || "Failed to load the designation report.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const totals = report?.totals;
  const trend = report?.headcount_trend || [];
  const maxHeadcount = Math.max(1, ...trend.map((m) => m.count));
  const growth = report?.designation_growth || [];
  const departments = report?.by_department || [];

  const exportCsv = useCallback(() => {
    if (!report) return;
    const header = ["Designation", "Department", "Level", "Status", "Active employees", "Min salary", "Max salary"];
    const lines = [
      header,
      ...report.designations.map((r) => [
        r.title,
        r.department,
        r.level,
        r.status,
        r.employees,
        r.min_salary,
        r.max_salary,
      ]),
    ];
    const blob = new Blob([lines.map((l) => l.map(csvCell).join(",")).join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "designation_report.csv";
    a.click();
    URL.revokeObjectURL(url);
  }, [report]);

  const salaryBudget =
    totals?.salary_max_total > 0
      ? `${money(totals.salary_min_total)} - ${money(totals.salary_max_total)}`
      : "Not set";

  return (
    <DesignationLayout
      title="Designation Reports"
      subtitle="Analytics, functional distribution, compensation envelopes, and staffing growth telemetry"
      lastUpdated={lastUpdated}
      isRefreshing={loading}
      onRefresh={() => load(true)}
      actions={
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => load(true)}
            disabled={loading}
            aria-label="Refresh report"
            className="p-2.5 rounded-xl border border-white/20 bg-white/10 hover:bg-white/20 text-white disabled:opacity-60 transition-colors"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={exportCsv}
            disabled={!report}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl shadow-sm text-xs font-semibold transition-all hover:scale-[1.02] active:scale-[0.98]"
          >
            <Download size={14} />
            <span>Export CSV</span>
          </button>
        </div>
      }
    >
      {loading && !report ? (
        <div className="flex justify-center items-center py-20 bg-white rounded-2xl border border-gray-200" role="status">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
          <span className="ml-3 text-sm text-gray-500 font-medium">Loading reports...</span>
        </div>
      ) : error && !report ? (
        <div role="alert" className="mb-4 px-5 py-4 bg-red-50 border border-red-200 text-red-700 rounded-2xl flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <AlertCircle size={18} className="text-red-500 shrink-0" />
            <span className="text-sm font-medium">{error}</span>
          </div>
          <button
            type="button"
            onClick={() => load(true)}
            className="px-4 py-1.5 text-xs font-semibold border border-red-200 rounded-xl bg-white hover:bg-red-50 text-red-700 transition-colors shadow-2xs"
          >
            Retry
          </button>
        </div>
      ) : !totals || totals.designations === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-200/90 p-12 text-center shadow-xs">
          <div className="w-14 h-14 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center mx-auto mb-3 border border-blue-100">
            <Building2 size={28} />
          </div>
          <h3 className="text-base font-bold text-gray-900">No designations to report on yet</h3>
          <p className="text-xs text-gray-500 mt-1 max-w-sm mx-auto">
            Reports appear once designations exist: add them in the list or upload employees with a Designation column.
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

          {/* Stat Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard
              title="Total Designations"
              value={totals.designations}
              icon={Building2}
              subtitle={`${totals.active} active · ${totals.inactive} inactive`}
            />
            <StatCard
              title="Total Headcount"
              value={totals.employees.toLocaleString()}
              icon={Users}
              subtitle={`${totals.unfilled} designation${totals.unfilled === 1 ? "" : "s"} with no employees`}
            />
            <StatCard
              title="Salary Budget"
              value={salaryBudget}
              icon={CircleDollarSign}
              subtitle="Minimum - maximum pay across current headcount"
            />
            <StatCard
              title="Departments"
              value={totals.departments}
              icon={TrendingUp}
              subtitle={
                totals.without_salary_range
                  ? `${totals.without_salary_range} without a salary range`
                  : "All have a salary range"
              }
            />
          </div>

          {/* Trends: Headcount Trend + Designation Growth */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Headcount Cumulative Trend */}
            <div className="bg-white rounded-2xl border border-gray-200/90 p-5 shadow-xs">
              <h2 className="text-base font-bold text-gray-900">Headcount Trend</h2>
              <p className="text-xs text-gray-400 mt-0.5 mb-4">Active employees holding a designation, by joining date (cumulative)</p>
              <div className="flex items-end gap-2 h-48 pt-4 px-2" role="img" aria-label="Headcount by month">
                {trend.map((h) => {
                  const pct = (h.count / maxHeadcount) * 100;
                  return (
                    <div
                      key={h.month}
                      className="min-w-0 flex-1 flex flex-col items-center gap-1.5 h-full justify-end group"
                      data-testid={`trend-${h.month}`}
                    >
                      <span className="text-xs text-gray-600 font-bold group-hover:text-blue-600 transition-colors">{h.count}</span>
                      <div
                        className="w-full bg-blue-500 rounded-t-lg transition-all duration-300 opacity-85 group-hover:opacity-100 shadow-2xs"
                        style={{ height: h.count ? `${Math.max(pct, 6)}%` : "3px" }}
                        title={`${h.label}: ${h.count} (${h.joined} joined)`}
                      />
                      <span className="text-[11px] text-gray-400 font-semibold whitespace-nowrap">{h.label.split(" ")[0]}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Designation Growth by Quarter */}
            <div className="bg-white rounded-2xl border border-gray-200/90 p-5 shadow-xs">
              <h2 className="text-base font-bold text-gray-900 mb-1">Designation Growth</h2>
              <p className="text-xs text-gray-400 mb-4">Quarterly creation cadence and catalog expansion</p>
              {growth.length === 0 ? (
                <p className="text-xs text-gray-400 py-10 text-center">No creation dates recorded yet.</p>
              ) : (
                <div className="space-y-3">
                  {growth.map((g) => (
                    <div
                      key={g.quarter}
                      className="flex items-center justify-between p-3 rounded-xl bg-gray-50/70 border border-gray-100 hover:bg-slate-50 transition-colors"
                      data-testid={`growth-${g.quarter}`}
                    >
                      <div className="flex items-center gap-3">
                        <div className="p-2 bg-blue-50 text-blue-600 rounded-lg">
                          <Calendar className="w-4 h-4" />
                        </div>
                        <div>
                          <p className="text-xs font-bold text-gray-900">{g.quarter}</p>
                          <p className="text-[11px] text-gray-400">
                            {g.total} total designation{g.total === 1 ? "" : "s"}
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <span className={`text-xs font-bold ${g.new > 0 ? "text-emerald-700" : "text-gray-400"}`}>
                          {g.new > 0 ? `+${g.new}` : "0"}
                        </span>
                        <p className="text-[10px] text-gray-400">new</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Budget by Department Table */}
          <div className="bg-white rounded-2xl border border-gray-200/90 p-5 shadow-xs">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-bold text-gray-900">Budget by Department</h2>
              <span className="text-xs font-semibold text-gray-400">
                {totals.designations} designations in {totals.departments} department{totals.departments === 1 ? "" : "s"}
              </span>
            </div>
            <div className="overflow-x-auto rounded-xl border border-gray-100">
              <table className="w-full divide-y divide-gray-100 text-xs text-left">
                <thead className="bg-gray-50/80">
                  <tr className="text-gray-500 font-semibold uppercase tracking-wider">
                    <th className="px-4 py-3">Department</th>
                    <th className="px-4 py-3">Designations</th>
                    <th className="px-4 py-3">Employees</th>
                    <th className="px-4 py-3 text-right">Salary budget (min - max)</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-50 text-gray-700 font-medium">
                  {departments.map((d) => (
                    <tr key={d.department} className="hover:bg-slate-50/80 transition-colors">
                      <td className="px-4 py-3.5 font-bold text-gray-900">{d.department}</td>
                      <td className="px-4 py-3.5 font-bold text-blue-600">
                        {d.designations}
                        {d.active_designations !== d.designations ? (
                          <span className="ml-1 text-[11px] text-gray-400 font-normal">
                            ({d.active_designations} active)
                          </span>
                        ) : null}
                      </td>
                      <td className="px-4 py-3.5 text-slate-800 font-semibold">{d.employees}</td>
                      <td className="px-4 py-3.5 text-gray-800 text-right font-mono font-semibold">
                        {d.salary_max_total > 0
                          ? `${money(d.salary_min_total)} - ${money(d.salary_max_total)}`
                          : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-gray-50/90 font-bold border-t border-gray-200 text-gray-900">
                  <tr>
                    <td className="px-4 py-3.5">Total</td>
                    <td className="px-4 py-3.5 text-blue-600">{totals.designations}</td>
                    <td className="px-4 py-3.5">{totals.employees}</td>
                    <td className="px-4 py-3.5 text-right font-mono">{salaryBudget}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </div>
      )}
    </DesignationLayout>
  );
}
