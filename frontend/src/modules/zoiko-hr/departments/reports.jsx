import { useState, useMemo } from "react";
import { Link } from "react-router-dom";
import {
  BarChart3,
  Building2,
  Download,
  Search,
  Filter,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  CircleDollarSign,
  PieChart,
  TrendingUp,
  AlertCircle,
  CheckCircle2,
  AlertTriangle,
  GitFork,
  Users,
} from "lucide-react";
import DepartmentLayout, { useDepartmentData } from "./DepartmentLayout";
import { formatOrgMoney } from "../../../utils/money";
// budgets and spend, in the organization's currency
const formatNumber = (n) => formatOrgMoney(n == null || !Number.isFinite(Number(n)) ? 0 : Number(n));

function SortIcon({ colKey, currentKey, direction }) {
  if (colKey !== currentKey) {
    return <ArrowUpDown className="w-3 h-3 inline ml-1 opacity-30 text-gray-400" />;
  }
  return direction === "asc" ? (
    <ArrowUp className="w-3 h-3 inline ml-1 text-rose-600" />
  ) : (
    <ArrowDown className="w-3 h-3 inline ml-1 text-rose-600" />
  );
}

function exportCsv(rows, filename) {
  const headers = [
    "Department Name",
    "Code",
    "Dept ID",
    "Head of Department",
    "Staff Count",
    "Allocated Budget",
    "Spent Budget",
    "Remaining Variance",
    "Utilization %",
    "Budget Status",
    "Establishment Year",
    "Status",
  ];

  const csvRows = [headers.join(",")];
  for (const r of rows) {
    const budget = Number(r.budget) || 0;
    const spent = Number(r.spent_budget) || 0;
    const variance = budget - spent;
    const util = budget > 0 ? Math.round((spent / budget) * 100) : 0;
    const budgetStatus =
      budget === 0
        ? "No Budget"
        : util > 100
        ? "Over Budget"
        : util >= 80
        ? "Near Capacity"
        : "Healthy";

    csvRows.push(
      [
        `"${(r.name || "").replace(/"/g, '""')}"`,
        `"${(r.code || "").replace(/"/g, '""')}"`,
        `"${(r.department_code || "").replace(/"/g, '""')}"`,
        `"${(r.head_name || r.head || "Unassigned").replace(/"/g, '""')}"`,
        Number(r.employee_count) || 0,
        budget,
        spent,
        variance,
        util,
        budgetStatus,
        r.establishment_year ?? "",
        r.is_active ? "Active" : "Inactive",
      ].join(",")
    );
  }

  const blob = new Blob([csvRows.join("\n")], {
    type: "text/csv;charset=utf-8;",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function DepartmentReports() {
  const {
    departments: records,
    loading: isLoading,
    refresh: fetchRecords,
    lastUpdated,
    isRefreshing,
  } = useDepartmentData({ autoPoll: true });

  const [search, setSearch] = useState("");
  const [healthFilter, setHealthFilter] = useState("all"); // "all" | "healthy" | "warning" | "over"
  const [hierarchyFilter, setHierarchyFilter] = useState("all"); // "all" | "root" | "sub"
  const [sortKey, setSortKey] = useState("budget");
  const [sortDir, setSortDir] = useState("desc");

  // Executive Stats Calculation
  const stats = useMemo(() => {
    const totalUnits = records.length;
    const totalStaff = records.reduce(
      (acc, r) => acc + (Number(r.employee_count) || 0),
      0
    );
    const totalBudget = records.reduce(
      (acc, r) => acc + (Number(r.budget) || 0),
      0
    );
    const totalSpent = records.reduce(
      (acc, r) => acc + (Number(r.spent_budget) || 0),
      0
    );
    const netVariance = totalBudget - totalSpent;
    const orgUtilPct =
      totalBudget > 0 ? Math.round((totalSpent / totalBudget) * 100) : 0;

    // Health breakdown
    let healthyCount = 0;
    let warningCount = 0;
    let overCount = 0;

    records.forEach((r) => {
      const b = Number(r.budget) || 0;
      const s = Number(r.spent_budget) || 0;
      if (b <= 0) return;
      const pct = (s / b) * 100;
      if (pct > 100) overCount++;
      else if (pct >= 80) warningCount++;
      else healthyCount++;
    });

    return {
      totalUnits,
      totalStaff,
      totalBudget,
      totalSpent,
      netVariance,
      orgUtilPct,
      healthyCount,
      warningCount,
      overCount,
    };
  }, [records]);

  // Sorting & Filtering
  const filtered = useMemo(() => {
    let list = [...records];

    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (r) =>
          r.name?.toLowerCase().includes(q) ||
          r.code?.toLowerCase().includes(q) ||
          r.department_code?.toLowerCase().includes(q) ||
          (r.head_name || r.head)?.toLowerCase().includes(q)
      );
    }

    if (hierarchyFilter !== "all") {
      list = list.filter((r) =>
        hierarchyFilter === "root" ? !r.parent_id : Boolean(r.parent_id)
      );
    }

    if (healthFilter !== "all") {
      list = list.filter((r) => {
        const b = Number(r.budget) || 0;
        const s = Number(r.spent_budget) || 0;
        if (b <= 0) return healthFilter === "healthy";
        const pct = (s / b) * 100;
        if (healthFilter === "over") return pct > 100;
        if (healthFilter === "warning") return pct >= 80 && pct <= 100;
        if (healthFilter === "healthy") return pct < 80;
        return true;
      });
    }

    list.sort((a, b) => {
      let va = a[sortKey] ?? "";
      let vb = b[sortKey] ?? "";

      if (
        sortKey === "budget" ||
        sortKey === "spent_budget" ||
        sortKey === "employee_count"
      ) {
        va = Number(va) || 0;
        vb = Number(vb) || 0;
      } else if (sortKey === "variance") {
        va = (Number(a.budget) || 0) - (Number(a.spent_budget) || 0);
        vb = (Number(b.budget) || 0) - (Number(b.spent_budget) || 0);
      } else if (sortKey === "utilization") {
        const ba = Number(a.budget) || 0;
        const sa = Number(a.spent_budget) || 0;
        const bb = Number(b.budget) || 0;
        const sb = Number(b.spent_budget) || 0;
        va = ba > 0 ? sa / ba : 0;
        vb = bb > 0 ? sb / bb : 0;
      } else {
        va = String(va).toLowerCase();
        vb = String(vb).toLowerCase();
      }

      if (va < vb) return sortDir === "asc" ? -1 : 1;
      if (va > vb) return sortDir === "asc" ? 1 : -1;
      return 0;
    });

    return list;
  }, [records, search, hierarchyFilter, healthFilter, sortKey, sortDir]);

  const toggleSort = (key) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  const handleExport = () => {
    const timestamp = new Date().toISOString().slice(0, 10);
    exportCsv(filtered, `zoiko-department-financial-report-${timestamp}.csv`);
  };

  return (
    <DepartmentLayout
      title="Department Financial Analytics & Reports"
      subtitle="Financial allocation auditing, budget variance tracking, and operational expenditure telemetry"
      lastUpdated={lastUpdated}
      isRefreshing={isRefreshing}
      onRefresh={fetchRecords}
      actions={
        <button
          onClick={handleExport}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-semibold text-sm shadow-sm shadow-blue-900/20 transition-all hover:scale-[1.02] active:scale-[0.98]"
        >
          <Download size={16} />
          <span>Export CSV Report</span>
        </button>
      }
    >
      {/* Executive Financial KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {/* Total Budget */}
        <div className="bg-white rounded-2xl border border-gray-200/90 p-5 shadow-2xs">
          <div className="flex items-center justify-between text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
            <span>Allocated Envelope</span>
            <span className="p-1.5 rounded-lg bg-emerald-50 text-emerald-600">
              <CircleDollarSign size={16} />
            </span>
          </div>
          <p className="text-2xl font-bold text-gray-900 tracking-tight">
            {formatNumber(stats.totalBudget)}
          </p>
          <p className="text-xs text-gray-500 mt-1">
            Across {stats.totalUnits} organizational units
          </p>
        </div>

        {/* Total Spent */}
        <div className="bg-white rounded-2xl border border-gray-200/90 p-5 shadow-2xs">
          <div className="flex items-center justify-between text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
            <span>Expenditure to Date</span>
            <span className="p-1.5 rounded-lg bg-blue-50 text-blue-600">
              <TrendingUp size={16} />
            </span>
          </div>
          <p className="text-2xl font-bold text-gray-900 tracking-tight">
            {formatNumber(stats.totalSpent)}
          </p>
          <p className="text-xs text-gray-500 mt-1">
            {stats.orgUtilPct}% of total allocation consumed
          </p>
        </div>

        {/* Net Variance */}
        <div className="bg-white rounded-2xl border border-gray-200/90 p-5 shadow-2xs">
          <div className="flex items-center justify-between text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
            <span>Net Budget Variance</span>
            <span
              className={`p-1.5 rounded-lg ${
                stats.netVariance >= 0
                  ? "bg-emerald-50 text-emerald-600"
                  : "bg-red-50 text-red-600"
              }`}
            >
              <PieChart size={16} />
            </span>
          </div>
          <p
            className={`text-2xl font-bold tracking-tight ${
              stats.netVariance >= 0 ? "text-emerald-700" : "text-red-700"
            }`}
          >
            {formatNumber(stats.netVariance)}
          </p>
          <p className="text-xs text-gray-500 mt-1">
            {stats.netVariance >= 0
              ? "Surplus remaining available"
              : "Deficit (Expenditure over allocated cap)"}
          </p>
        </div>

        {/* Utilization Rate */}
        <div className="bg-white rounded-2xl border border-gray-200/90 p-5 shadow-2xs">
          <div className="flex items-center justify-between text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
            <span>Budget Utilization</span>
            <span
              className={`text-xs font-bold px-2 py-0.5 rounded-md ${
                stats.orgUtilPct > 100
                  ? "bg-red-100 text-red-700"
                  : stats.orgUtilPct >= 80
                  ? "bg-amber-100 text-amber-700"
                  : "bg-emerald-100 text-emerald-700"
              }`}
            >
              {stats.orgUtilPct}%
            </span>
          </div>
          <div className="w-full bg-gray-100 rounded-full h-2 overflow-hidden my-3">
            <div
              className={`h-full rounded-full transition-all duration-500 ${
                stats.orgUtilPct > 100
                  ? "bg-red-500"
                  : stats.orgUtilPct >= 80
                  ? "bg-amber-500"
                  : "bg-emerald-500"
              }`}
              style={{ width: `${Math.min(stats.orgUtilPct, 100)}%` }}
            />
          </div>
          <div className="flex items-center justify-between text-[11px] text-gray-400">
            <span>{stats.overCount} over limit</span>
            <span>{stats.healthyCount} on target</span>
          </div>
        </div>
      </div>

      {/* Main Ledger Card */}
      <div className="bg-white rounded-2xl border border-gray-200/90 shadow-sm overflow-hidden">
        {/* Filtering & Search Toolbar */}
        <div className="p-4 sm:p-5 border-b border-gray-100 bg-gray-50/50 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3.5">
          <div className="flex flex-wrap items-center gap-2.5 flex-1">
            <div className="relative min-w-[240px] flex-1 sm:max-w-xs">
              <Search
                className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400"
                size={16}
              />
              <input
                type="text"
                placeholder="Search unit, code, or head..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-9 pr-4 py-2 text-sm bg-white border border-gray-200 rounded-xl focus:outline-none focus:border-rose-500 focus:ring-2 focus:ring-rose-500/10 shadow-xs"
              />
            </div>

            {/* Health Filter */}
            <select
              value={healthFilter}
              onChange={(e) => setHealthFilter(e.target.value)}
              className="px-3 py-2 text-sm bg-white border border-gray-200 rounded-xl text-gray-700 focus:outline-none focus:border-rose-500 shadow-xs"
            >
              <option value="all">All Budget Tiers</option>
              <option value="healthy">Healthy (&lt;80%)</option>
              <option value="warning">Near Limit (80%–100%)</option>
              <option value="over">Over Budget (&gt;100%)</option>
            </select>

            {/* Hierarchy Filter */}
            <select
              value={hierarchyFilter}
              onChange={(e) => setHierarchyFilter(e.target.value)}
              className="px-3 py-2 text-sm bg-white border border-gray-200 rounded-xl text-gray-700 focus:outline-none focus:border-rose-500 shadow-xs"
            >
              <option value="all">All Units</option>
              <option value="root">Root Entities Only</option>
              <option value="sub">Sub-Units Only</option>
            </select>
          </div>

          <div className="text-xs font-semibold text-gray-500">
            Showing <strong className="text-gray-900">{filtered.length}</strong> of{" "}
            {records.length} records
          </div>
        </div>

        {/* Data Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-gray-50/75 border-b border-gray-200 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                <th
                  className="px-4 py-3.5 cursor-pointer select-none hover:text-rose-600"
                  onClick={() => toggleSort("name")}
                >
                  Department Unit{" "}
                  <SortIcon
                    colKey="name"
                    currentKey={sortKey}
                    direction={sortDir}
                  />
                </th>
                <th className="px-3 py-3.5">Code</th>
                <th className="px-3 py-3.5">Department Head</th>
                <th
                  className="px-3 py-3.5 text-center cursor-pointer select-none hover:text-rose-600"
                  onClick={() => toggleSort("employee_count")}
                >
                  Staff{" "}
                  <SortIcon
                    colKey="employee_count"
                    currentKey={sortKey}
                    direction={sortDir}
                  />
                </th>
                <th
                  className="px-3 py-3.5 text-right cursor-pointer select-none hover:text-rose-600"
                  onClick={() => toggleSort("budget")}
                >
                  Allocated Envelope{" "}
                  <SortIcon
                    colKey="budget"
                    currentKey={sortKey}
                    direction={sortDir}
                  />
                </th>
                <th
                  className="px-3 py-3.5 text-right cursor-pointer select-none hover:text-rose-600"
                  onClick={() => toggleSort("spent_budget")}
                >
                  Expenditure{" "}
                  <SortIcon
                    colKey="spent_budget"
                    currentKey={sortKey}
                    direction={sortDir}
                  />
                </th>
                <th
                  className="px-3 py-3.5 text-right cursor-pointer select-none hover:text-rose-600"
                  onClick={() => toggleSort("variance")}
                >
                  Net Variance{" "}
                  <SortIcon
                    colKey="variance"
                    currentKey={sortKey}
                    direction={sortDir}
                  />
                </th>
                <th
                  className="px-4 py-3.5 cursor-pointer select-none hover:text-rose-600 min-w-[130px]"
                  onClick={() => toggleSort("utilization")}
                >
                  Utilization{" "}
                  <SortIcon
                    colKey="utilization"
                    currentKey={sortKey}
                    direction={sortDir}
                  />
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 text-sm text-gray-700">
              {isLoading && records.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-16 text-center text-gray-400">
                    Loading department reports...
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-16 text-center text-gray-400">
                    {search ||
                    healthFilter !== "all" ||
                    hierarchyFilter !== "all"
                      ? "No records match your filter criteria."
                      : "No department financial records available."}
                  </td>
                </tr>
              ) : (
                filtered.map((r) => {
                  const b = Number(r.budget) || 0;
                  const s = Number(r.spent_budget) || 0;
                  const variance = b - s;
                  const utilPct =
                    b > 0 ? Math.min(Math.round((s / b) * 100), 999) : 0;
                  const isOver = b > 0 && s > b;
                  const isNear = b > 0 && utilPct >= 80 && !isOver;

                  return (
                    <tr
                      key={r.id}
                      className="hover:bg-slate-50/80 transition-colors"
                    >
                      {/* Name */}
                      <td className="px-4 py-4">
                        <div className="flex items-center gap-2.5">
                          <Building2
                            size={16}
                            className="text-rose-500 shrink-0"
                          />
                          <div>
                            <span className="font-semibold text-gray-900 block truncate">
                              {r.name}
                            </span>
                            {r.parent_id && (
                              <span className="text-[11px] text-gray-400">
                                Sub-unit
                              </span>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Code */}
                      <td className="px-3 py-4 font-mono text-xs font-bold text-gray-700">
                        {r.code}
                      </td>

                      {/* Head */}
                      <td className="px-3 py-4 text-xs font-medium text-gray-800">
                        {r.head_name || r.head || (
                          <span className="text-gray-400 italic">Unassigned</span>
                        )}
                      </td>

                      {/* Staff */}
                      <td className="px-3 py-4 text-center">
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-700 text-xs font-bold">
                          <Users size={11} className="text-slate-500" />
                          {r.employee_count || 0}
                        </span>
                      </td>

                      {/* Budget */}
                      <td className="px-3 py-4 text-right font-semibold text-gray-900">
                        {formatNumber(b)}
                      </td>

                      {/* Spent */}
                      <td className="px-3 py-4 text-right font-medium text-gray-700">
                        {formatNumber(s)}
                      </td>

                      {/* Variance */}
                      <td className="px-3 py-4 text-right">
                        <span
                          className={`font-semibold text-xs px-2 py-0.5 rounded-md ${
                            variance >= 0
                              ? "text-emerald-700 bg-emerald-50 border border-emerald-200"
                              : "text-red-700 bg-red-50 border border-red-200"
                          }`}
                        >
                          {formatNumber(variance)}
                        </span>
                      </td>

                      {/* Utilization Bar */}
                      <td className="px-4 py-4">
                        <div className="space-y-1">
                          <div className="flex items-center justify-between text-xs">
                            <span
                              className={`font-bold ${
                                isOver
                                  ? "text-red-600"
                                  : isNear
                                  ? "text-amber-600"
                                  : "text-emerald-700"
                              }`}
                            >
                              {utilPct}%
                            </span>
                            <span className="text-[10px] text-gray-400">
                              {isOver
                                ? "Over"
                                : isNear
                                ? "Warning"
                                : "Balanced"}
                            </span>
                          </div>
                          <div className="w-full bg-gray-100 rounded-full h-1.5 overflow-hidden">
                            <div
                              className={`h-full rounded-full ${
                                isOver
                                  ? "bg-red-500"
                                  : isNear
                                  ? "bg-amber-500"
                                  : "bg-emerald-500"
                              }`}
                              style={{ width: `${Math.min(utilPct, 100)}%` }}
                            />
                          </div>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>

            {/* Totals Summary Footer */}
            {filtered.length > 0 && (
              <tfoot>
                <tr className="bg-gray-50/90 border-t-2 border-gray-200 font-bold text-xs text-gray-900">
                  <td className="px-4 py-3.5 uppercase tracking-wider">
                    Ledger Total ({filtered.length} units)
                  </td>
                  <td className="px-3 py-3.5">—</td>
                  <td className="px-3 py-3.5">—</td>
                  <td className="px-3 py-3.5 text-center">
                    {filtered.reduce(
                      (acc, r) => acc + (Number(r.employee_count) || 0),
                      0
                    )}
                  </td>
                  <td className="px-3 py-3.5 text-right font-bold text-sm">
                    {formatNumber(
                      filtered.reduce(
                        (acc, r) => acc + (Number(r.budget) || 0),
                        0
                      )
                    )}
                  </td>
                  <td className="px-3 py-3.5 text-right font-bold text-sm">
                    {formatNumber(
                      filtered.reduce(
                        (acc, r) => acc + (Number(r.spent_budget) || 0),
                        0
                      )
                    )}
                  </td>
                  <td className="px-3 py-3.5 text-right font-bold text-sm">
                    {formatNumber(
                      filtered.reduce(
                        (acc, r) =>
                          acc +
                          ((Number(r.budget) || 0) -
                            (Number(r.spent_budget) || 0)),
                        0
                      )
                    )}
                  </td>
                  <td className="px-4 py-3.5">—</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    </DepartmentLayout>
  );
}
