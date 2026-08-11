import { useState, useEffect, useMemo } from "react";
import { NavLink } from "react-router-dom";
import {
  Building2,
  CircleDollarSign,
  Users,
  TrendingUp,
  TrendingDown,
  Minus,
  GitBranch,
  UserCheck,
  Calendar,
  CheckCircle2,
  XCircle,
} from "lucide-react";
import HRPage from "../../../components/HRPage";
import { getDepartments } from "../../../service/hrService";

const NAV_ITEMS = [
  { label: "Dashboard",            href: "/zoiko-hr/departments" },
  { label: "Department List",      href: "/zoiko-hr/departments/list" },
  { label: "Department Structure", href: "/zoiko-hr/departments/structure" },
  { label: "Reports",              href: "/zoiko-hr/departments/reports" },
  { label: "Settings",             href: "/zoiko-hr/departments/settings" },
];

function SubNav() {
  return (
    <div className="flex gap-1 overflow-x-auto pb-1 mb-6 border-b border-gray-100">
      {NAV_ITEMS.map((item) => (
        <NavLink
          key={item.href}
          to={item.href}
          end={item.href === "/zoiko-hr/departments"}
          className={({ isActive }) =>
            `whitespace-nowrap px-3 py-2 text-sm font-medium rounded-t-lg transition-colors ${
              isActive
                ? "text-rose-600 border-b-2 border-rose-600 bg-rose-50/50"
                : "text-gray-500 hover:text-gray-700 hover:bg-gray-50"
            }`
          }
        >
          {item.label}
        </NavLink>
      ))}
    </div>
  );
}

function StatCard({ title, value, icon: Icon, color, subtitle }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm text-gray-500 font-medium">{title}</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{value}</p>
          {subtitle && <p className="text-xs text-gray-400 mt-0.5">{subtitle}</p>}
        </div>
        {Icon && (
          <div className={`p-2 rounded-lg ${color || "bg-rose-50"}`}>
            <Icon className={`w-5 h-5 ${color ? "text-white" : "text-rose-600"}`} />
          </div>
        )}
      </div>
    </div>
  );
}

export default function DepartmentDashboard() {
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    setError(null);
    getDepartments({ include_inactive: true })
      .then((res) => {
        if (!mounted) return;
        const data = res?.data?.data || res?.data || res || [];
        setRecords(Array.isArray(data) ? data : []);
      })
      .catch((err) => {
        if (mounted) setError(err.message || "Failed to load departments");
      })
      .finally(() => { if (mounted) setLoading(false); });
    return () => { mounted = false; };
  }, []);

  const stats = useMemo(() => {
    const total       = records.length;
    const active      = records.filter((r) => r.is_active).length;
    const inactive    = total - active;
    const withHead    = records.filter((r) => r.head).length;
    const rootDepts   = records.filter((r) => !r.parent_id).length;
    const totalBudget = records.reduce((s, r) => s + (Number(r.budget) || 0), 0);
    const totalSpent  = records.reduce((s, r) => s + (Number(r.spent_budget) || 0), 0);
    const totalEmp    = records.reduce((s, r) => s + (Number(r.employee_count) || 0), 0);
    const utilPct     = totalBudget > 0 ? Math.round((totalSpent / totalBudget) * 100) : 0;
    const avgBudget   = total > 0 ? Math.round(totalBudget / total) : 0;
    return { total, active, inactive, withHead, rootDepts, totalBudget, totalSpent, totalEmp, utilPct, avgBudget };
  }, [records]);

  const recentDepts = useMemo(
    () => [...records].sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0)).slice(0, 5),
    [records]
  );

  const maxBudget = useMemo(
    () => (records.length > 0 ? Math.max(...records.map((r) => Number(r.budget) || 0)) : 0),
    [records]
  );

  const topByBudget = useMemo(
    () => [...records].sort((a, b) => (Number(b.budget) || 0) - (Number(a.budget) || 0)).slice(0, 5),
    [records]
  );

  const rootDepartments = useMemo(
    () => records.filter((r) => !r.parent_id),
    [records]
  );

  const statCards = [
    { title: "Total Departments",    value: stats.total,                                           icon: Building2,        color: "bg-rose-50", subtitle: `${stats.rootDepts} root · ${stats.total - stats.rootDepts} sub` },
    { title: "Active",               value: stats.active,                                          icon: CheckCircle2,     color: "bg-green-50", subtitle: `${((stats.active / Math.max(stats.total, 1)) * 100).toFixed(0)}% of total` },
    { title: "Inactive",             value: stats.inactive,                                        icon: XCircle,          color: "bg-gray-100",  subtitle: stats.inactive === 0 ? "All departments active" : `${((stats.inactive / Math.max(stats.total, 1)) * 100).toFixed(0)}% of total` },
    { title: "Total Employees",      value: stats.totalEmp.toLocaleString(),                       icon: Users,            color: "bg-blue-50",  subtitle: `${stats.totalEmp > 0 ? (stats.totalEmp / Math.max(stats.active, 1)).toFixed(1) : 0} avg per dept` },
    { title: "Budget Utilization",   value: `${stats.utilPct}%`,                                    icon: TrendingUp,       color: "bg-amber-50", subtitle: `$${(stats.totalSpent / 1_000_000).toFixed(1)}M / $${(stats.totalBudget / 1_000_000).toFixed(1)}M` },
    { title: "Depts with Head",      value: `${stats.withHead} / ${stats.total}`,                   icon: UserCheck,        color: "bg-purple-50", subtitle: stats.withHead === stats.total ? "All departments staffed" : `${stats.total - stats.withHead} unfilled` },
  ];

  /* ── Loading / Error ── */
  if (loading) {
    return (
      <HRPage title="Departments" subtitle="Manage organizational entities">
        <SubNav />
        <div className="flex justify-center items-center py-20">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-rose-600" />
          <span className="ml-3 text-gray-500">Loading dashboard...</span>
        </div>
      </HRPage>
    );
  }

  if (error) {
    return (
      <HRPage title="Departments" subtitle="Manage organizational entities">
        <SubNav />
        <div className="px-4 py-3 bg-red-50 border border-red-200 text-red-700 rounded-lg">
          Error: {error}
        </div>
      </HRPage>
    );
  }

  return (
    <HRPage title="Departments" subtitle="Manage organizational entities">
      <SubNav />
      <div className="space-y-6">

        {/* ── Hero banner ── */}
        <div className="bg-gradient-to-r from-rose-600 to-rose-700 rounded-xl shadow-lg p-6 text-white">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div>
              <p className="text-rose-100 text-sm font-medium">Total Departments</p>
              <p className="text-4xl font-bold font-mono mt-1">{stats.total}</p>
              <p className="text-rose-100 mt-1">
                {stats.active} active · {stats.inactive} inactive · {stats.totalEmp} employees
              </p>
            </div>
            <div className="text-right">
              <p className="text-rose-100 text-sm">Budget Utilization</p>
              <p className="text-3xl font-bold">{stats.utilPct}%</p>
              <p className="text-rose-100 text-sm mt-1">
                ${(stats.totalSpent / 1_000_000).toFixed(1)}M spent of ${(stats.totalBudget / 1_000_000).toFixed(1)}M
              </p>
            </div>
          </div>
        </div>

        {/* ── Summary cards ── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
          {statCards.map((s) => (
            <StatCard key={s.title} {...s} />
          ))}
        </div>

        {/* ── Charts row ── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

          {/* Budget bar chart */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Budget by Department</h2>
            {records.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-8">No departments yet.</p>
            ) : (
              <div className="space-y-3 max-h-80 overflow-y-auto pr-1">
                {records.map((r) => {
                  const budget   = Number(r.budget) || 0;
                  const spent    = Number(r.spent_budget) || 0;
                  const barWidth = maxBudget > 0 ? Math.round((budget / maxBudget) * 100) : 0;
                  const spentPct = budget > 0 ? Math.round((spent / budget) * 100) : 0;
                  return (
                    <div key={r.id} className="space-y-1">
                      <div className="flex items-center justify-between text-sm">
                        <span className="font-medium text-gray-800 truncate max-w-[140px]">{r.name}</span>
                        <span className="text-xs text-gray-500 shrink-0 ml-2">
                          ${spent.toLocaleString()} / ${budget.toLocaleString()} ({spentPct}%)
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="h-2 bg-gray-100 rounded-full overflow-hidden flex-1" style={{ maxWidth: `${Math.max(barWidth, 4)}%` }}>
                          <div
                            className={`h-full rounded-full ${
                              spentPct > 90 ? "bg-red-500" : spentPct > 70 ? "bg-amber-400" : "bg-rose-500"
                            }`}
                            style={{ width: `${spentPct}%` }}
                          />
                        </div>
                        <span className={`text-xs font-medium shrink-0 ${!r.is_active ? "text-gray-400" : spentPct > 90 ? "text-red-600" : spentPct > 70 ? "text-amber-600" : "text-green-600"}`}>
                          {spentPct}%
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Employee distribution */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Employees by Department</h2>
            {records.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-8">No departments yet.</p>
            ) : (
              <div className="space-y-3 max-h-80 overflow-y-auto pr-1">
                {(() => {
                  const maxEmp = Math.max(...records.map((r) => Number(r.employee_count) || 0), 1);
                  return [...records]
                    .sort((a, b) => (Number(b.employee_count) || 0) - (Number(a.employee_count) || 0))
                    .map((r) => {
                      const empCount = Number(r.employee_count) || 0;
                      const barPct = Math.round((empCount / maxEmp) * 100);
                      return (
                        <div key={r.id} className="space-y-1">
                          <div className="flex items-center justify-between text-sm">
                            <span className="font-medium text-gray-800 truncate max-w-[180px]">{r.name}</span>
                            <span className="text-xs text-gray-500 shrink-0 ml-2">{empCount} employees</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden flex-1">
                              <div
                                className="h-full rounded-full bg-blue-500"
                                style={{ width: `${Math.max(barPct, 2)}%` }}
                              />
                            </div>
                            <span className="text-xs font-medium text-blue-600 shrink-0 w-8 text-right">{barPct}%</span>
                          </div>
                        </div>
                      );
                    });
                })()}
              </div>
            )}
          </div>
        </div>

        {/* ── Recently Created ── */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900">Recently Created Departments</h2>
            <span className="text-xs text-gray-400 bg-gray-50 px-2 py-1 rounded border border-gray-100">
              Latest {recentDepts.length} of {records.length}
            </span>
          </div>
          {recentDepts.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-8">No departments created yet.</p>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-gray-200">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Department</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Code</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Head</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Created</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Employees</th>
                    <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase tracking-wider">Status</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-100">
                  {recentDepts.map((r, i) => (
                    <tr key={r.id} className="hover:bg-rose-50/30 transition-colors">
                      <td className="px-4 py-3">
                        <p className="text-sm font-medium text-gray-900">{r.name}</p>
                      </td>
                      <td className="px-4 py-3 text-xs font-mono font-semibold text-rose-600">{r.code}</td>
                      <td className="px-4 py-3 text-sm text-gray-600">{r.head || "—"}</td>
                      <td className="px-4 py-3 text-sm text-gray-600">
                        {r.created_at ? new Date(r.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—"}
                      </td>
                      <td className="px-4 py-3 text-sm font-semibold text-gray-900 text-right">{r.employee_count || 0}</td>
                      <td className="px-4 py-3 text-center">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                          r.is_active ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"
                        }`}>
                          {r.is_active ? "Active" : "Inactive"}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* ── Root departments overview ── */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900">Root Departments Overview</h2>
            <span className="text-xs text-gray-400 bg-gray-50 px-2 py-1 rounded border border-gray-100">
              {rootDepartments.length} root entities
            </span>
          </div>
          {rootDepartments.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-8">
              No departments found. Add one from the Department List tab.
            </p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {rootDepartments.map((r) => {
                const budget  = Number(r.budget) || 0;
                const spent   = Number(r.spent_budget) || 0;
                const utilPct = budget > 0 ? Math.round((spent / budget) * 100) : 0;
                const subCount = records.filter((d) => d.parent_id === r.id).length;
                return (
                  <div
                    key={r.id}
                    className={`border rounded-xl p-4 transition-colors ${
                      r.is_active
                        ? "border-gray-100 hover:border-rose-200 hover:bg-rose-50/20"
                        : "border-gray-100 bg-gray-50/50 hover:border-gray-200"
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <div className={`p-2 rounded-lg shrink-0 ${r.is_active ? "bg-rose-50" : "bg-gray-200"}`}>
                        <Building2 className={`w-4 h-4 ${r.is_active ? "text-rose-600" : "text-gray-400"}`} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <p className={`text-sm font-semibold truncate ${r.is_active ? "text-gray-900" : "text-gray-500"}`}>{r.name}</p>
                          {!r.is_active && (
                            <span className="text-xs bg-gray-200 text-gray-500 px-1.5 py-0.5 rounded">Inactive</span>
                          )}
                        </div>
                        <p className="text-xs font-mono text-rose-600">{r.code}</p>
                      </div>
                    </div>

                    <div className="mt-3 space-y-1.5 text-xs text-gray-500">
                      {r.head && (
                        <div className="flex items-center gap-1.5">
                          <UserCheck className="w-3.5 h-3.5 shrink-0" />
                          <span className="truncate">{r.head}</span>
                        </div>
                      )}
                      {r.employee_count > 0 && (
                        <div className="flex items-center gap-1.5">
                          <Users className="w-3.5 h-3.5 shrink-0" />
                          <span>{r.employee_count} employee{r.employee_count !== 1 ? "s" : ""}</span>
                        </div>
                      )}
                      {r.establishment_year && (
                        <div className="flex items-center gap-1.5">
                          <Calendar className="w-3.5 h-3.5 shrink-0" />
                          <span>Est. {r.establishment_year}</span>
                        </div>
                      )}
                      <div className="flex items-center gap-1.5">
                        <GitBranch className="w-3.5 h-3.5 shrink-0" />
                        <span>{subCount} sub-department{subCount !== 1 ? "s" : ""}</span>
                      </div>
                    </div>

                    {r.is_active && (
                      <div className="mt-3">
                        <div className="flex justify-between text-xs text-gray-400 mb-1">
                          <span>Budget</span>
                          <span>${budget.toLocaleString()}</span>
                        </div>
                        <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full ${
                              utilPct > 90 ? "bg-red-500" : utilPct > 70 ? "bg-amber-400" : "bg-rose-500"
                            }`}
                            style={{ width: `${Math.min(utilPct, 100)}%` }}
                          />
                        </div>
                        <p className="text-xs text-gray-400 mt-0.5 text-right">{utilPct}% utilized</p>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

      </div>
    </HRPage>
  );
}
