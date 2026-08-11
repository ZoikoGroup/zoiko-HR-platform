import { useState, useEffect, useMemo } from "react";
import { NavLink } from "react-router-dom";
import { Plus, X, Building2, Search, AlertCircle, Pencil, ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react";
import HRPage from "../../../components/HRPage";
import { getDepartments, createDepartment, updateDepartment } from "../../../service/hrService";

const ITEMS_PER_PAGE = 10;

const NAV_ITEMS = [
  { label: "Dashboard", href: "/zoiko-hr/departments" },
  { label: "Department List", href: "/zoiko-hr/departments/list" },
  { label: "Department Structure", href: "/zoiko-hr/departments/structure" },
  { label: "Reports", href: "/zoiko-hr/departments/reports" },
  { label: "Settings", href: "/zoiko-hr/departments/settings" },
];

const STATUS_OPTIONS = [
  { value: "all", label: "All Status" },
  { value: "active", label: "Active" },
  { value: "inactive", label: "Inactive" },
];

const SORT_OPTIONS = [
  { value: "name", label: "Name" },
  { value: "created_at", label: "Created Date" },
  { value: "employee_count", label: "Employee Count" },
  { value: "budget", label: "Budget" },
];

function SubNav() {
  return (
    <div className="flex gap-1 overflow-x-auto pb-1 mb-6 border-b border-gray-100">
      {NAV_ITEMS.map((item) => (
        <NavLink key={item.href} to={item.href} end={item.href === "/zoiko-hr/departments"}
          className={({ isActive }) =>
            `whitespace-nowrap px-3 py-2 text-sm font-medium rounded-t-lg transition-colors ${
              isActive ? "text-rose-600 border-b-2 border-rose-600 bg-rose-50/50" : "text-gray-500 hover:text-gray-700 hover:bg-gray-50"
            }`
          }>
          {item.label}
        </NavLink>
      ))}
    </div>
  );
}

function SortIcon({ column, current, direction }) {
  if (column !== current) return <ArrowUpDown className="w-3 h-3 inline ml-1 opacity-30" />;
  return direction === "asc" ? <ArrowUp className="w-3 h-3 inline ml-1 text-rose-600" /> : <ArrowDown className="w-3 h-3 inline ml-1 text-rose-600" />;
}

export default function DepartmentList() {
  const [records, setRecords] = useState([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sortColumn, setSortColumn] = useState("name");
  const [sortDirection, setSortDirection] = useState("asc");
  const [currentPage, setCurrentPage] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [editingDept, setEditingDept] = useState(null);

  const [formData, setFormData] = useState({
    name: "",
    code: "",
    head: "",
    establishment_year: "",
    budget: "",
    spent_budget: "",
    description: "",
    parent_id: ""
  });

  const fetchRecords = () => {
    setIsLoading(true);
    const params = statusFilter === "all" ? { include_inactive: true } : {};
    getDepartments(params)
      .then((res) => {
        const data = res?.data?.data || res?.data || res || [];
        setRecords(Array.isArray(data) ? data : []);
      })
      .catch((err) => console.error(err))
      .finally(() => setIsLoading(false));
  };

  useEffect(() => {
    fetchRecords();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter]);

  const emptyForm = {
    name: "",
    code: "",
    head: "",
    establishment_year: "",
    budget: "",
    spent_budget: "",
    description: "",
    parent_id: ""
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    setErrorMessage("");
    const payload = {
      ...formData,
      parent_id: formData.parent_id === "" ? null : Number(formData.parent_id),
      establishment_year: formData.establishment_year === "" ? null : Number(formData.establishment_year),
      budget: formData.budget === "" ? 0 : Number(formData.budget),
      spent_budget: formData.spent_budget === "" ? 0 : Number(formData.spent_budget),
    };

    const action = editingDept
      ? updateDepartment(editingDept.id, payload)
      : createDepartment(payload);

    action
      .then(() => {
        setIsModalOpen(false);
        setEditingDept(null);
        setFormData(emptyForm);
        fetchRecords();
      })
      .catch((err) => {
        const fallbackMsg = "Department with this name or code already exists.";
        const apiError = err?.response?.data?.message || err?.response?.data?.error || err?.message || fallbackMsg;
        setErrorMessage(apiError);
        console.error(err);
      });
  };

  const handleEditClick = (dept) => {
    setEditingDept(dept);
    setFormData({
      name: dept.name || "",
      code: dept.code || "",
      head: dept.head || "",
      establishment_year: dept.establishment_year || "",
      budget: dept.budget || "",
      spent_budget: dept.spent_budget || "",
      description: dept.description || "",
      parent_id: dept.parent_id || ""
    });
    setIsModalOpen(true);
  };

  const handleOpenCreateModal = () => {
    setEditingDept(null);
    setFormData(emptyForm);
    setErrorMessage("");
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setEditingDept(null);
    setErrorMessage("");
  };

  const handleSort = (column) => {
    if (sortColumn === column) {
      setSortDirection((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortColumn(column);
      setSortDirection("asc");
    }
    setCurrentPage(1);
  };

  const filtered = useMemo(() => {
    let result = records;

    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter((r) =>
        r.name?.toLowerCase().includes(q) ||
        r.code?.toLowerCase().includes(q) ||
        r.head?.toLowerCase().includes(q)
      );
    }

    if (statusFilter !== "all") {
      result = result.filter((r) =>
        statusFilter === "active" ? r.is_active : !r.is_active
      );
    }

    result.sort((a, b) => {
      let cmp = 0;
      if (sortColumn === "name") cmp = (a.name || "").localeCompare(b.name || "");
      else if (sortColumn === "created_at") cmp = new Date(a.created_at || 0) - new Date(b.created_at || 0);
      else if (sortColumn === "employee_count") cmp = (Number(a.employee_count) || 0) - (Number(b.employee_count) || 0);
      else if (sortColumn === "budget") cmp = (Number(a.budget) || 0) - (Number(b.budget) || 0);
      return sortDirection === "asc" ? cmp : -cmp;
    });

    return result;
  }, [records, search, statusFilter, sortColumn, sortDirection]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / ITEMS_PER_PAGE));
  const safePage = Math.min(currentPage, totalPages);
  const paginated = useMemo(() => {
    const start = (safePage - 1) * ITEMS_PER_PAGE;
    return filtered.slice(start, start + ITEMS_PER_PAGE);
  }, [filtered, safePage]);

  useEffect(() => {
    if (currentPage > totalPages) setCurrentPage(totalPages);
  }, [totalPages, currentPage]);

  const formatDate = (dateStr) => {
    if (!dateStr) return "—";
    return new Date(dateStr).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  };

  return (
    <HRPage title="Departments" subtitle="Manage organizational entities">
      <SubNav />

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-gray-100 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 w-full sm:w-auto">
            <div className="relative w-full sm:w-64">
              <Search className="absolute left-3 top-2.5 text-gray-400" size={16} />
              <input type="text" placeholder="Search by name, code, head..." value={search} onChange={(e) => { setSearch(e.target.value); setCurrentPage(1); }}
                className="w-full pl-9 pr-4 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-rose-500" />
            </div>
            <select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setCurrentPage(1); }}
              className="w-full sm:w-40 px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:border-rose-500">
              {STATUS_OPTIONS.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
            </select>
          </div>
          <button onClick={handleOpenCreateModal} className="w-full sm:w-auto bg-rose-600 hover:bg-rose-700 text-white text-sm font-semibold px-4 py-2 rounded-lg flex items-center justify-center gap-2 transition-colors shrink-0">
            <Plus size={16} /> Add Department
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                <th className="px-4 py-3 cursor-pointer select-none hover:text-rose-600" onClick={() => handleSort("name")}>
                  Name <SortIcon column="name" current={sortColumn} direction={sortDirection} />
                </th>
                <th className="px-4 py-3">Dept Code</th>
                <th className="px-4 py-3">Legacy Code</th>
                <th className="px-4 py-3">Head</th>
                <th className="px-4 py-3 cursor-pointer select-none hover:text-rose-600" onClick={() => handleSort("employee_count")}>
                  Employees <SortIcon column="employee_count" current={sortColumn} direction={sortDirection} />
                </th>
                <th className="px-4 py-3 text-center">Status</th>
                <th className="px-4 py-3 cursor-pointer select-none hover:text-rose-600" onClick={() => handleSort("created_at")}>
                  Created <SortIcon column="created_at" current={sortColumn} direction={sortDirection} />
                </th>
                <th className="px-4 py-3 cursor-pointer select-none hover:text-rose-600 text-right" onClick={() => handleSort("budget")}>
                  Budget <SortIcon column="budget" current={sortColumn} direction={sortDirection} />
                </th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 text-sm text-gray-700">
              {isLoading ? (
                <tr><td colSpan={9} className="text-center py-12 text-gray-400">
                  <div className="flex flex-col items-center gap-2">
                    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-rose-600" />
                    <span>Loading departments...</span>
                  </div>
                </td></tr>
              ) : paginated.length === 0 ? (
                <tr><td colSpan={9} className="text-center py-12 text-gray-400">
                  <div className="flex flex-col items-center gap-2">
                    <Building2 className="w-8 h-8 text-gray-300" />
                    <span className="text-sm font-medium">{search || statusFilter !== "all" ? "No matching entries found." : "No departments yet. Click \"Add Department\" to create one."}</span>
                  </div>
                </td></tr>
              ) : (
                paginated.map((r, i) => (
                  <tr key={r.id ?? i} className="hover:bg-gray-50/80 transition-colors">
                    <td className="px-4 py-3">
                      <p className="font-medium text-gray-900">{r.name}</p>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs font-bold text-[#FF7A00]">{r.department_code || "—"}</td>
                    <td className="px-4 py-3 font-mono text-xs font-semibold text-rose-600">{r.code}</td>
                    <td className="px-4 py-3">{r.head || "—"}</td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center gap-1 font-medium">
                        <span className="text-gray-900">{r.employee_count || 0}</span>
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                        r.is_active ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"
                      }`}>
                        {r.is_active ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-500 text-xs">{formatDate(r.created_at)}</td>
                    <td className="px-4 py-3 text-right text-sm">${(Number(r.budget) || 0).toLocaleString()}</td>
                    <td className="px-4 py-3 text-right">
                      <button onClick={() => handleEditClick(r)} className="inline-flex items-center gap-1 text-xs font-semibold text-gray-500 hover:text-rose-600 px-2 py-1 rounded-lg hover:bg-rose-50 transition-colors">
                        <Pencil size={13} /> Edit
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {totalPages > 1 && (
          <div className="px-4 py-3 border-t border-gray-100 flex flex-col sm:flex-row justify-between items-center gap-2">
            <span className="text-xs text-gray-400">
              Showing {(safePage - 1) * ITEMS_PER_PAGE + 1}-{Math.min(safePage * ITEMS_PER_PAGE, filtered.length)} of {filtered.length}
            </span>
            <div className="flex gap-1">
              <button onClick={() => setCurrentPage((p) => Math.max(1, p - 1))} disabled={safePage <= 1}
                className="px-3 py-1 text-sm border border-gray-200 rounded-lg disabled:opacity-40 hover:bg-gray-50 transition-colors">Prev</button>
              {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
                let pageNum;
                if (totalPages <= 7) {
                  pageNum = i + 1;
                } else if (safePage <= 4) {
                  pageNum = i + 1;
                } else if (safePage >= totalPages - 3) {
                  pageNum = totalPages - 6 + i;
                } else {
                  pageNum = safePage - 3 + i;
                }
                return (
                  <button key={pageNum} onClick={() => setCurrentPage(pageNum)}
                    className={`px-3 py-1 text-sm border rounded-lg transition-colors ${
                      pageNum === safePage ? "bg-rose-600 text-white border-rose-600" : "border-gray-200 hover:bg-gray-50"
                    }`}>{pageNum}</button>
                );
              })}
              <button onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))} disabled={safePage >= totalPages}
                className="px-3 py-1 text-sm border border-gray-200 rounded-lg disabled:opacity-40 hover:bg-gray-50 transition-colors">Next</button>
            </div>
          </div>
        )}
      </div>

      {/* Modal View Component */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-gray-50/50 flex-shrink-0">
              <h3 className="font-bold text-gray-900 flex items-center gap-2">
                <Building2 size={18} className="text-rose-600" /> {editingDept ? "Edit Department" : "Create New Department"}
              </h3>
              <button onClick={handleCloseModal} className="text-gray-400 hover:text-gray-600 p-1"><X size={18} /></button>
            </div>
            
            <form onSubmit={handleSubmit} className="p-6 space-y-4 overflow-y-auto text-sm flex-1">
              
              {errorMessage && (
                <div className="flex items-start gap-2.5 bg-red-50 border border-red-200 text-red-700 p-3 rounded-lg text-xs font-medium animate-shake">
                  <AlertCircle size={16} className="text-red-500 flex-shrink-0 mt-0.5" />
                  <div>{errorMessage}</div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Department Name *</label>
                  <input type="text" required placeholder="e.g., Human Resources" value={formData.name} onChange={(e) => setFormData({...formData, name: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:border-rose-500" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Department Code *</label>
                  <input type="text" required placeholder="e.g., HR" value={formData.code} onChange={(e) => setFormData({...formData, code: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:border-rose-500" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Department Head *</label>
                  <input type="text" required placeholder="e.g., Jane Doe" value={formData.head} onChange={(e) => setFormData({...formData, head: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:border-rose-500" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Establishment Year *</label>
                  <input type="number" required placeholder="e.g., 2024" value={formData.establishment_year} onChange={(e) => setFormData({...formData, establishment_year: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:border-rose-500" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Allocated Budget ($) *</label>
                  <input type="number" required placeholder="e.g., 1500000" value={formData.budget} onChange={(e) => setFormData({...formData, budget: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:border-rose-500" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Spent Budget ($) *</label>
                  <input type="number" required placeholder="e.g., 250000" value={formData.spent_budget} onChange={(e) => setFormData({...formData, spent_budget: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:border-rose-500" />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Parent Entity (Optional)</label>
                <select value={formData.parent_id} onChange={(e) => setFormData({...formData, parent_id: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg bg-white focus:outline-none focus:border-rose-500">
                  <option value="">No Parent (Root Level)</option>
                  {records.filter(r => r.is_active && r.id !== editingDept?.id).map(r => <option key={r.id} value={r.id}>{r.name} ({r.code})</option>)}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Description</label>
                <textarea rows="2" placeholder="Optional structural details..." value={formData.description} onChange={(e) => setFormData({...formData, description: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:border-rose-500 resize-none"></textarea>
              </div>

              <div className="pt-4 border-t border-gray-100 flex justify-end gap-3 flex-shrink-0">
                <button type="button" onClick={handleCloseModal} className="px-4 py-2 border border-gray-200 rounded-lg hover:bg-gray-50 font-semibold text-gray-600 transition-colors">Cancel</button>
                <button type="submit" className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-lg font-semibold shadow-sm transition-colors">{editingDept ? "Save Changes" : "Create"}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </HRPage>
  );
}
