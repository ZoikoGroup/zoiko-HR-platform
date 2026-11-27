import { useMemo } from "react";
import { NavLink } from "react-router-dom";
import {
  Building2,
  Users,
  TrendingUp,
  CircleDollarSign,
  UserCheck,
  GitBranch,
  ArrowUpRight,
  Plus,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Calendar,
  Sparkles,
  Layers,
  ChevronRight,
  Wallet,
  ShieldCheck,
  UserX,
  FileText,
} from "lucide-react";
import DepartmentLayout, { useDepartmentData } from "./DepartmentLayout";
// budgets and spend, in the organization's currency (compact: £2.5M)
const formatNumber = (n, { compact = false } = {}) =>
  formatOrgMoney(n == null || !Number.isFinite(Number(n)) ? 0 : Number(n), { compact });
import { formatDate } from "../../../utils/dateTime";
import { formatOrgMoney } from "../../../utils/money";

function MetricCard({ title, value, subtitle, icon: Icon, tone = "blue", badge, trend }) {
  const tones = {
    blue: {
      bg: "bg-blue-50 text-blue-600 ring-blue-100",
      pill: "bg-blue-50 text-blue-700 ring-blue-200/60",
      accent: "from-blue-500 to-indigo-600",
    },
    emerald: {
      bg: "bg-green-50 text-green-600 ring-green-100",
      pill: "bg-green-50 text-green-700 ring-green-200/60",
      accent: "from-green-500 to-teal-600",
    },
    violet: {
      bg: "bg-blue-50 text-blue-600 ring-blue-100",
      pill: "bg-blue-50 text-blue-700 ring-blue-200/60",
      accent: "from-blue-500 to-indigo-600",
    },
    amber: {
      bg: "bg-amber-50 text-amber-600 ring-amber-100",
      pill: "bg-amber-50 text-amber-700 ring-amber-200/60",
      accent: "from-amber-500 to-orange-600",
    },
    rose: {
      bg: "bg-rose-50 text-rose-600 ring-rose-100",
      pill: "bg-rose-50 text-rose-700 ring-rose-200/60",
      accent: "from-rose-500 to-pink-600",
    },
  };

  const style = tones[tone] || tones.blue;

  return (
    <div className="group relative overflow-hidden rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm transition-all hover:border-slate-300 hover:shadow-md">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <span className="block text-xs font-semibold uppercase tracking-wider text-slate-500">
            {title}
          </span>
          <p className="mt-2 flex flex-wrap items-baseline gap-x-2 gap-y-1 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
            {value}
            {badge && (
              <span className={`inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-semibold tracking-normal ring-1 ring-inset ${style.pill}`}>
                {badge}
              </span>
            )}
          </p>
          {subtitle && (
            <p className="mt-1 text-xs font-medium text-slate-500">
              {subtitle}
            </p>
          )}
        </div>
        <div
          data-testid="stat-icon"
          className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl ring-1 ${style.bg} transition-transform group-hover:scale-105`}
        >
          <Icon className="h-5 w-5" strokeWidth={2.2} />
        </div>
      </div>
      {trend && (
        <div className="mt-3.5 flex items-center gap-1.5 border-t border-slate-100 pt-3 text-xs text-slate-600">
          {trend}
        </div>
      )}
    </div>
  );
}

export default function DepartmentDashboard() {
  const { departments, loading, refreshing, error, lastUpdated, refresh } = useDepartmentData();

  const stats = useMemo(() => {
    const total = departments.length;
    const active = departments.filter((d) => d.is_active).length;
    const inactive = total - active;
    const root = departments.filter((d) => !d.parent_id).length;
    const sub = total - root;

    const totalEmployees = departments.reduce((acc, d) => acc + (Number(d.employee_count) || 0), 0);
    const totalBudget = departments.reduce((acc, d) => acc + (Number(d.budget) || 0), 0);
    const totalSpent = departments.reduce((acc, d) => acc + (Number(d.spent_budget) || 0), 0);
    const remainingBudget = Math.max(0, totalBudget - totalSpent);
    const utilization = totalBudget > 0 ? Math.round((totalSpent / totalBudget) * 100) : 0;

    const withHead = departments.filter((d) => d.head_name || d.head).length;
    const vacantHead = total - withHead;
    const headCoverage = total > 0 ? Math.round((withHead / total) * 100) : 0;

    return {
      total,
      active,
      inactive,
      root,
      sub,
      totalEmployees,
      totalBudget,
      totalSpent,
      remainingBudget,
      utilization,
      withHead,
      vacantHead,
      headCoverage,
    };
  }, [departments]);

  // Top departments sorted by budget
  const topByBudget = useMemo(() => {
    return [...departments]
      .filter((d) => d.is_active)
      .sort((a, b) => (Number(b.budget) || 0) - (Number(a.budget) || 0))
      .slice(0, 6);
  }, [departments]);

  // Top departments sorted by headcount
  const topByHeadcount = useMemo(() => {
    return [...departments]
      .filter((d) => d.is_active)
      .sort((a, b) => (Number(b.employee_count) || 0) - (Number(a.employee_count) || 0))
      .slice(0, 6);
  }, [departments]);

  // Key department heads leadership list
  const leadership = useMemo(() => {
    return departments
      .filter((d) => d.is_active && (d.head_name || d.head))
      .map((d) => ({
        id: d.id,
        deptName: d.name,
        code: d.code,
        headName: d.head_name || d.head,
        headEmployeeId: d.head_employee_id,
        staffCount: Number(d.employee_count) || 0,
        budget: Number(d.budget) || 0,
      }))
      .slice(0, 8);
  }, [departments]);

  // Recently added or modified departments
  const recentDepts = useMemo(() => {
    return [...departments]
      .sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0))
      .slice(0, 5);
  }, [departments]);

  const maxBudget = useMemo(() => {
    if (!topByBudget.length) return 1;
    return Math.max(...topByBudget.map((d) => Math.max(Number(d.budget) || 0, Number(d.spent_budget) || 0)), 1);
  }, [topByBudget]);

  const maxHeadcount = useMemo(() => {
    if (!topByHeadcount.length) return 1;
    return Math.max(...topByHeadcount.map((d) => Number(d.employee_count) || 0), 1);
  }, [topByHeadcount]);

  return (
    <DepartmentLayout
      title="Departments Overview"
      subtitle="Comprehensive visibility into organizational units, workforce distribution, leadership assignments, and budget utilization."
      badge={`${stats.active} Active Units`}
      refreshing={refreshing}
      lastUpdated={lastUpdated}
      onRefresh={refresh}
      actions={
        <div className="flex flex-wrap items-center gap-2 max-w-full">
          <NavLink
            to="/zoiko-hr/departments/reports"
            className="inline-flex items-center gap-2 rounded-xl bg-white/10 px-3.5 py-2 text-xs font-semibold text-white shadow-sm ring-1 ring-inset ring-white/20 hover:bg-white/20 transition-all backdrop-blur-sm"
          >
            <FileText className="h-4 w-4 text-blue-300" />
            <span>Reports</span>
          </NavLink>
          <NavLink
            to="/zoiko-hr/departments/structure"
            className="inline-flex items-center gap-2 rounded-xl bg-white/10 px-3.5 py-2 text-xs font-semibold text-white shadow-sm ring-1 ring-inset ring-white/20 hover:bg-white/20 transition-all backdrop-blur-sm"
          >
            <GitBranch className="h-4 w-4 text-emerald-300" />
            <span>Org Chart</span>
          </NavLink>
          <NavLink
            to="/zoiko-hr/departments/list?action=new"
            className="inline-flex items-center gap-2 rounded-xl bg-blue-500 px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-blue-600 transition-all ring-1 ring-blue-400/40"
          >
            <Plus className="h-4 w-4" />
            <span>Add Department</span>
          </NavLink>
        </div>
      }
    >
      {error && (
        <div className="mb-6 flex items-center justify-between rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
          <div className="flex items-center gap-3">
            <AlertTriangle className="h-5 w-5 text-rose-600 shrink-0" />
            <span>{error}</span>
          </div>
          <button
            onClick={refresh}
            className="text-xs font-semibold text-rose-900 underline hover:no-underline"
          >
            Retry
          </button>
        </div>
      )}

      {loading ? (
        <div className="flex flex-col items-center justify-center py-24 text-slate-500">
          <div className="relative">
            <div className="h-12 w-12 rounded-full border-2 border-slate-200 border-t-blue-600 animate-spin" />
            <Building2 className="absolute inset-0 m-auto h-5 w-5 text-slate-400" />
          </div>
          <p className="mt-4 text-sm font-medium text-slate-600">Loading organizational departments…</p>
        </div>
      ) : departments.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-slate-300 bg-white p-12 text-center shadow-sm">
          <div className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-blue-50 text-blue-600 ring-1 ring-blue-100">
            <Building2 className="h-8 w-8" />
          </div>
          <h3 className="mt-4 text-lg font-bold text-slate-900">No departments configured</h3>
          <p className="mx-auto mt-1.5 max-w-md text-sm text-slate-500">
            Organize your company workforce, assign leadership, and allocate financial budgets by creating your first department.
          </p>
          <div className="mt-6">
            <NavLink
              to="/zoiko-hr/departments/list?action=new"
              className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 transition-colors"
            >
              <Plus className="h-4 w-4" />
              <span>Create Department</span>
            </NavLink>
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Top 6 KPI Metric Cards */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 min-[1800px]:grid-cols-6">
            <MetricCard
              title="Total Units"
              value={stats.total}
              badge={`${stats.active} Active`}
              subtitle={`${stats.root} Root · ${stats.sub} Sub-units`}
              icon={Building2}
              tone="blue"
              trend={
                <span>
                  <strong className="text-slate-800">{stats.inactive}</strong> inactive units
                </span>
              }
            />

            <MetricCard
              title="Total Staff"
              value={stats.totalEmployees.toLocaleString()}
              badge="Workforce"
              subtitle={`Avg ${(stats.totalEmployees / Math.max(stats.active, 1)).toFixed(1)} per active dept`}
              icon={Users}
              tone="emerald"
              trend={
                <span className="flex items-center gap-1 text-emerald-700 font-medium">
                  <CheckCircle2 className="h-3.5 w-3.5" /> Across {stats.active} departments
                </span>
              }
            />

            <MetricCard
              title="Budget Envelope"
              value={formatNumber(stats.totalBudget, { compact: true })}
              badge="Allocation"
              subtitle={`Avg ${formatNumber(stats.totalBudget / Math.max(stats.total, 1), { compact: true })}`}
              icon={Wallet}
              tone="violet"
              trend={
                <span>
                  Remaining: <strong className="text-slate-800">{formatNumber(stats.remainingBudget, { compact: true })}</strong>
                </span>
              }
            />

            <MetricCard
              title="Total Spent"
              value={formatNumber(stats.totalSpent, { compact: true })}
              badge="Financials"
              subtitle={`Out of ${formatNumber(stats.totalBudget, { compact: true })}`}
              icon={CircleDollarSign}
              tone={stats.utilization > 95 ? "rose" : "amber"}
              trend={
                <span className="text-slate-500">
                  Actual expenditure YTD
                </span>
              }
            />

            <MetricCard
              title="Budget Utilization"
              value={`${stats.utilization}%`}
              badge={stats.utilization > 90 ? "High" : "Optimal"}
              subtitle={stats.utilization > 100 ? "Over budget" : `${100 - stats.utilization}% available`}
              icon={TrendingUp}
              tone={stats.utilization > 100 ? "rose" : stats.utilization > 80 ? "amber" : "emerald"}
              trend={
                <div className="w-full">
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                    <div
                      className={`h-full rounded-full transition-all ${
                        stats.utilization > 100
                          ? "bg-rose-500"
                          : stats.utilization > 85
                          ? "bg-amber-500"
                          : "bg-emerald-500"
                      }`}
                      style={{ width: `${Math.min(stats.utilization, 100)}%` }}
                    />
                  </div>
                </div>
              }
            />

            <MetricCard
              title="Leadership"
              value={`${stats.headCoverage}%`}
              badge={`${stats.withHead}/${stats.total}`}
              subtitle={stats.vacantHead > 0 ? `${stats.vacantHead} unassigned` : "Fully staffed"}
              icon={UserCheck}
              tone={stats.headCoverage >= 90 ? "emerald" : "amber"}
              trend={
                <span className="flex items-center gap-1 text-slate-600">
                  {stats.vacantHead === 0 ? (
                    <span className="text-emerald-700 font-medium">All heads assigned</span>
                  ) : (
                    <span>{stats.vacantHead} need leadership</span>
                  )}
                </span>
              }
            />
          </div>

          {/* Middle Row: Budget Allocation Comparison & Workforce Density */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            {/* Budget vs Expenditure by Department */}
            <div className="rounded-2xl border border-slate-200/90 bg-white p-6 shadow-sm">
              <div className="flex items-center justify-between pb-4 border-b border-slate-100">
                <div>
                  <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                    <CircleDollarSign className="h-5 w-5 text-indigo-600" />
                    <span>Budget Allocation & Expenditure</span>
                  </h2>
                  <p className="mt-0.5 text-xs text-slate-500">
                    Financial allocation vs spent budget for major operating departments
                  </p>
                </div>
                <NavLink
                  to="/zoiko-hr/departments/reports"
                  className="flex shrink-0 items-center gap-1 whitespace-nowrap text-xs font-semibold text-blue-600 hover:text-blue-700"
                >
                  Full Report <ChevronRight className="h-3.5 w-3.5" />
                </NavLink>
              </div>

              <div className="mt-5 space-y-4">
                {topByBudget.map((dept) => {
                  const budget = Number(dept.budget) || 0;
                  const spent = Number(dept.spent_budget) || 0;
                  const pct = budget > 0 ? Math.round((spent / budget) * 100) : 0;
                  const budgetBarPct = Math.min(100, Math.round((budget / maxBudget) * 100));
                  const spentBarPct = Math.min(100, Math.round((spent / maxBudget) * 100));

                  const isOver = pct > 100;
                  const isHigh = pct >= 80 && pct <= 100;

                  return (
                    <div key={dept.id} className="space-y-1.5 rounded-xl p-2.5 hover:bg-slate-50/70 transition-colors">
                      <div className="flex items-center justify-between text-xs">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="font-semibold text-slate-800 truncate">
                            {dept.name}
                          </span>
                          <span className="font-mono text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded font-medium">
                            {dept.code}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="text-slate-600">
                            {formatNumber(spent, { compact: true })} / {formatNumber(budget, { compact: true })}
                          </span>
                          <span
                            className={`inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-bold ${
                              isOver
                                ? "bg-rose-100 text-rose-700"
                                : isHigh
                                ? "bg-amber-100 text-amber-800"
                                : "bg-emerald-100 text-emerald-800"
                            }`}
                          >
                            {pct}%
                          </span>
                        </div>
                      </div>

                      {/* Comparative Dual Progress Bars */}
                      <div className="space-y-1">
                        <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100 relative">
                          {/* Budget baseline */}
                          <div
                            className="h-full rounded-full bg-slate-200"
                            style={{ width: `${budgetBarPct}%` }}
                          />
                          {/* Spent overlay */}
                          <div
                            className={`absolute top-0 left-0 h-full rounded-full transition-all ${
                              isOver
                                ? "bg-rose-500"
                                : isHigh
                                ? "bg-amber-500"
                                : "bg-blue-600"
                            }`}
                            style={{ width: `${spentBarPct}%` }}
                          />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="mt-5 pt-3.5 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
                <div className="flex items-center gap-4">
                  <span className="inline-flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full bg-blue-600" /> Spent
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full bg-slate-200" /> Budget
                  </span>
                </div>
                <span>Total: {formatNumber(stats.totalBudget)}</span>
              </div>
            </div>

            {/* Workforce Distribution by Department */}
            <div className="rounded-2xl border border-slate-200/90 bg-white p-6 shadow-sm">
              <div className="flex items-center justify-between pb-4 border-b border-slate-100">
                <div>
                  <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                    <Users className="h-5 w-5 text-emerald-600" />
                    <span>Workforce Headcount Distribution</span>
                  </h2>
                  <p className="mt-0.5 text-xs text-slate-500">
                    Personnel density and direct team sizes across organization branches
                  </p>
                </div>
                <NavLink
                  to="/zoiko-hr/departments/structure"
                  className="flex shrink-0 items-center gap-1 whitespace-nowrap text-xs font-semibold text-blue-600 hover:text-blue-700"
                >
                  View Hierarchy <ChevronRight className="h-3.5 w-3.5" />
                </NavLink>
              </div>

              <div className="mt-5 space-y-4">
                {topByHeadcount.map((dept) => {
                  const count = Number(dept.employee_count) || 0;
                  const pctOfTotal = stats.totalEmployees > 0 ? Math.round((count / stats.totalEmployees) * 100) : 0;
                  const barWidth = Math.min(100, Math.round((count / maxHeadcount) * 100));

                  return (
                    <div key={dept.id} className="space-y-1.5 rounded-xl p-2.5 hover:bg-slate-50/70 transition-colors">
                      <div className="flex items-center justify-between text-xs">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="font-semibold text-slate-800 truncate">
                            {dept.name}
                          </span>
                          <span className="font-mono text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded font-medium">
                            {dept.code}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="font-semibold text-slate-900">
                            {count} {count === 1 ? "staff" : "staff"}
                          </span>
                          <span className="inline-flex items-center rounded-md bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700 ring-1 ring-inset ring-emerald-200/60">
                            {pctOfTotal}% of total
                          </span>
                        </div>
                      </div>

                      <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-teal-500 transition-all"
                          style={{ width: `${barWidth}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="mt-5 pt-3.5 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
                <span>Active Personnel: {stats.totalEmployees} employees</span>
                <span>Average: {(stats.totalEmployees / Math.max(stats.active, 1)).toFixed(1)} per unit</span>
              </div>
            </div>
          </div>

          {/* Bottom Row: Executive Leadership Roster & Recent Department Activity */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            {/* Leadership Directory (2 Cols) */}
            <div className="lg:col-span-2 rounded-2xl border border-slate-200/90 bg-white p-6 shadow-sm">
              <div className="flex items-center justify-between pb-4 border-b border-slate-100">
                <div>
                  <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                    <UserCheck className="h-5 w-5 text-blue-600" />
                    <span>Department Leadership Roster</span>
                  </h2>
                  <p className="mt-0.5 text-xs text-slate-500">
                    Appointed Heads of Departments overseeing operational teams
                  </p>
                </div>
                <NavLink
                  to="/zoiko-hr/departments/list"
                  className="flex shrink-0 items-center gap-1 whitespace-nowrap text-xs font-semibold text-blue-600 hover:text-blue-700"
                >
                  Manage Leaders <ChevronRight className="h-3.5 w-3.5" />
                </NavLink>
              </div>

              {leadership.length === 0 ? (
                <div className="py-8 text-center text-xs text-slate-400">
                  No department heads assigned yet. Assign leaders in the Department List.
                </div>
              ) : (
                <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {leadership.map((l) => (
                    <div
                      key={l.id}
                      onClick={() => navigate(`/zoiko-hr/departments/structure`)}
                      className="group flex items-center gap-3.5 rounded-xl border border-slate-200/80 bg-slate-50/40 p-3 hover:border-blue-300 hover:bg-blue-50/30 transition-all cursor-pointer"
                    >
                      <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-blue-600 to-indigo-700 text-sm font-bold text-white shadow-sm">
                        {l.headName.charAt(0).toUpperCase()}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-bold text-slate-900 truncate group-hover:text-blue-600 transition-colors">
                          {l.headName}
                        </p>
                        <p className="text-[11px] font-medium text-slate-500 truncate">
                          Head of {l.deptName}
                        </p>
                        <div className="mt-1 flex items-center gap-2 text-[10px] text-slate-400">
                          <span className="font-mono text-slate-500 font-semibold">{l.code}</span>
                          <span>•</span>
                          <span>{l.staffCount} direct staff</span>
                        </div>
                      </div>
                      <ChevronRight className="h-4 w-4 text-slate-300 group-hover:text-blue-500 transition-colors" />
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Quick Actions & Department Status Health (1 Col) */}
            <div className="space-y-6">
              <div className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-sm">
                <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <Layers className="h-4 w-4 text-blue-600" />
                  <span>Hierarchy & Unit Health</span>
                </h3>

                <div className="mt-4 space-y-3">
                  <div className="flex items-center justify-between rounded-xl bg-slate-50 p-3 text-xs">
                    <span className="text-slate-600 font-medium">Root Departments</span>
                    <span className="font-bold text-slate-900 bg-white px-2 py-0.5 rounded shadow-xs border border-slate-200">
                      {stats.root}
                    </span>
                  </div>

                  <div className="flex items-center justify-between rounded-xl bg-slate-50 p-3 text-xs">
                    <span className="text-slate-600 font-medium">Sub-tier Departments</span>
                    <span className="font-bold text-slate-900 bg-white px-2 py-0.5 rounded shadow-xs border border-slate-200">
                      {stats.sub}
                    </span>
                  </div>

                  <div className="flex items-center justify-between rounded-xl bg-slate-50 p-3 text-xs">
                    <span className="text-slate-600 font-medium">Active Status Rate</span>
                    <span className="font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                      {((stats.active / Math.max(stats.total, 1)) * 100).toFixed(0)}%
                    </span>
                  </div>

                  <div className="flex items-center justify-between rounded-xl bg-slate-50 p-3 text-xs">
                    <span className="text-slate-600 font-medium">Vacant Leadership</span>
                    <span
                      className={`font-bold px-2 py-0.5 rounded border ${
                        stats.vacantHead > 0
                          ? "bg-amber-50 text-amber-800 border-amber-200"
                          : "bg-emerald-50 text-emerald-800 border-emerald-200"
                      }`}
                    >
                      {stats.vacantHead} units
                    </span>
                  </div>
                </div>

                <div className="mt-4 pt-3 border-t border-slate-100">
                  <NavLink
                    to="/zoiko-hr/departments/structure"
                    className="flex w-full items-center justify-center gap-2 rounded-xl bg-slate-900 py-2.5 text-xs font-semibold text-white hover:bg-slate-800 transition-colors shadow-sm"
                  >
                    <GitBranch className="h-4 w-4" />
                    <span>Explore Structure Tree</span>
                  </NavLink>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </DepartmentLayout>
  );
}
