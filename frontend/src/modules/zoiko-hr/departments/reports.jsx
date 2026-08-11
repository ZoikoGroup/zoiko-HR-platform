import { useState, useEffect, useMemo } from "react";
import { NavLink } from "react-router-dom";
import { Building2, Download, Filter, Search } from "lucide-react";
import HRPage from "../../../components/HRPage";
import { api } from "../../../service/api";

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

function exportCsv(rows, filename) {
  const headers = ["Name", "Code", "Head", "Budget", "Spent Budget", "Utilization %", "Parent ID", "Establishment Year"];
  const csvRows = [headers.join(",")];
  for (const r of rows) {
    const budget = Number(r.budget) || 0;
    const spent = Number(r.spent_budget) || 0;
    const util = budget > 0 ? Math.round((spent / budget) * 100) : 0;
    csvRows.push([
      `"${(r.name || "").replace(/"/g, '""')}"`,
      `"${(r.code || "").replace(/"/g, '""')}"`,
      `"${(r.head || "").replace(/"/g, '""')}"`,
      budget,
      spent,
      util,
      r.parent_id ?? "",
      r.establishment_year ?? "",
    ].join(","));
  }
  const blob = new Blob([csvRows.join("\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function DepartmentReports() {
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState("name");
  const [sortDir, setSortDir] = useState("asc");

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    setError(null);
    api.get("/hr/departments")
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
    const total = records.length;
    const totalBudget = records.reduce((s, r) => s + (Number(r.budget) || 0), 0);
    const totalSpent = records.reduce((s, r) => s + (Number(r.spent_budget) || 0), 0);
    const rootDepts = records.filter((r) => !r.parent_id).length;
    const utilPct = totalBudget > 0 ? Math.round((totalSpent / totalBudget) * 100) : 0;
    return { total, totalBudget, totalSpent, rootDepts, utilPct };
  }, [records]);

  const filtered = useMemo(() => {
    let list = [...records];
    if (search) {
      const q = search.toLowerCase();
      list = list.filter((r) =>
        (r.name || "").toLowerCase().includes(q) ||
        (r.code || "").toLowerCase().includes(q) ||
        (r.head || "").toLowerCase().includes(q)
      );
    }
    list.sort((a, b) => {
      let va = (a[sortKey] ?? "");
      let vb = (b[sortKey] ?? "");
      if (sortKey === "budget" || sortKey === "spent_budget") {
        va = Number(va) || 0;
        vb = Number(vb) || 0;
      } else {
        va = String(va).toLowerCase();
        vb = String(vb).toLowerCase();
      }
      if (va < vb) return sortDir === "asc" ? -1 : 1;
      if (va > vb) return sortDir === "asc" ? 1 : -1;
      return 0;
    });
    return list;
  }, [records, search, sortKey, sortDir]);

  const toggleSort = (key) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  const SortIcon = ({ colKey }) => {
    if (sortKey !== colKey) return <span className="ml-1 text-gray-300">↕</span>;
    return <span className="ml-1 text-rose-600">{sortDir === "asc" ? "↑" : "↓"}</span>;
  };

  if (loading) {
    return (
      <HRPage title="Department Reports" subtitle="Export and analyze department data">
        <SubNav />
        <div className="flex justify-center items-center py-20">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-rose-600" />
          <span className="ml-3 text-gray-500">Loading reports...</span>
        </div>
      </HRPage>
    );
  }

  if (error) {
    return (
      <HRPage title="Department Reports" subtitle="Export and analyze department data">
        <SubNav />
        <div className="px-4 py-3 bg-red-50 border border-red-200 text-red-700 rounded-lg">Error: {error}</div>
      </HRPage>
    );
  }

  return (
    <HRPage title="Department Reports" subtitle="Export and analyze department data">
      <SubNav />

      <div className="space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
            <p className="text-xs text-gray-400 font-medium uppercase tracking-wider">Total Departments</p>
            <p className="text-2xl font-bold text-gray-800 mt-1">{stats.total}</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
            <p className="text-xs text-gray-400 font-medium uppercase tracking-wider">Root Departments</p>
            <p className="text-2xl font-bold text-gray-800 mt-1">{stats.rootDepts}</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
            <p className="text-xs text-gray-400 font-medium uppercase tracking-wider">Total Budget</p>
            <p className="text-2xl font-bold text-gray-800 mt-1">${(stats.totalBudget / 1_000_000).toFixed(1)}M</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
            <p className="text-xs text-gray-400 font-medium uppercase tracking-wider">Budget Utilization</p>
            <p className="text-2xl font-bold text-gray-800 mt-1">{stats.utilPct}%</p>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
          <div className="flex items-center justify-between p-4 border-b border-gray-100">
            <h2 className="text-lg font-semibold text-gray-900">Department Data Report</h2>
            <div className="flex items-center gap-3">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search departments..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9 pr-4 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-rose-500 focus:border-rose-500 w-64"
                />
              </div>
              <button
                onClick={() => exportCsv(filtered, `departments-report-${new Date().toISOString().slice(0, 10)}.csv`)}
                className="flex items-center gap-2 px-4 py-2 bg-rose-600 text-white text-sm font-medium rounded-lg hover:bg-rose-700 transition-colors"
              >
                <Download className="w-4 h-4" />
                Export CSV
              </button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  {[
                    { key: "name", label: "Department" },
                    { key: "code", label: "Code" },
                    { key: "head", label: "Head" },
                    { key: "budget", label: "Budget" },
                    { key: "spent_budget", label: "Spent" },
                    { key: null, label: "Utilization" },
                    { key: "parent_id", label: "Parent ID" },
                    { key: "establishment_year", label: "Est. Year" },
                  ].map((col) => (
                    <th
                      key={col.label}
                      className={`px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider ${
                        col.key ? "cursor-pointer hover:text-gray-700 select-none" : ""
                      }`}
                      onClick={() => col.key && toggleSort(col.key)}
                    >
                      <span className="inline-flex items-center">
                        {col.label}
                        {col.key && <SortIcon colKey={col.key} />}
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-100">
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-12 text-center text-sm text-gray-400">
                      {search ? "No departments match your search." : "No departments found."}
                    </td>
                  </tr>
                ) : (
                  filtered.map((r) => {
                    const budget = Number(r.budget) || 0;
                    const spent = Number(r.spent_budget) || 0;
                    const util = budget > 0 ? Math.round((spent / budget) * 100) : 0;
                    return (
                      <tr key={r.id} className="hover:bg-rose-50/30 transition-colors">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <Building2 className="w-4 h-4 text-rose-500 shrink-0" />
                            <span className="text-sm font-medium text-gray-900">{r.name}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-sm font-mono text-rose-600">{r.code || "—"}</td>
                        <td className="px-4 py-3 text-sm text-gray-600">{r.head || "—"}</td>
                        <td className="px-4 py-3 text-sm font-semibold text-gray-900">${budget.toLocaleString()}</td>
                        <td className="px-4 py-3 text-sm text-gray-600">${spent.toLocaleString()}</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <div className="h-2 w-16 bg-gray-100 rounded-full overflow-hidden">
                              <div
                                className={`h-full rounded-full ${
                                  util > 90 ? "bg-red-500" : util > 70 ? "bg-amber-400" : "bg-rose-500"
                                }`}
                                style={{ width: `${Math.min(util, 100)}%` }}
                              />
                            </div>
                            <span className="text-xs text-gray-500">{util}%</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-500">{r.parent_id ?? "—"}</td>
                        <td className="px-4 py-3 text-sm text-gray-500">{r.establishment_year ?? "—"}</td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          <div className="px-4 py-3 border-t border-gray-100 bg-gray-50 text-sm text-gray-500">
            Showing {filtered.length} of {records.length} departments
          </div>
        </div>
      </div>
    </HRPage>
  );
}
