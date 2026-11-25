import { useState, useMemo, useEffect, useCallback } from "react";
import {
  Building2,
  Search,
  Plus,
  Pencil,
  Power,
  Loader2,
  Users,
  CircleDollarSign,
  Calendar,
  UserCheck,
  AlertCircle,
  X,
  LayoutGrid,
  List,
  GitFork,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  ShieldAlert,
  Sparkles,
} from "lucide-react";
import DepartmentLayout, {
  useDepartmentData,
  notifyDepartmentsUpdated,
} from "./DepartmentLayout";
import {
  getDepartments,
  createDepartment,
  updateDepartment,
  getDepartmentSettings,
} from "../../../service/hrService";
import { formatDate as formatDateUtil } from "../../../utils/dateTime";
import {
  DEFAULT_DEPARTMENT_SETTINGS,
  normalizeDepartmentSettings,
} from "../../../utils/departmentSettings";
import { fieldProblem } from "../../../utils/fieldRules";
const formatNumber = (n) => (n == null || !Number.isFinite(Number(n)) ? "0" : Number(n).toLocaleString());
import EmployeePicker from "../learning/EmployeePicker";

function SortIcon({ column, current, direction }) {
  if (column !== current) {
    return <ArrowUpDown className="w-3 h-3 inline ml-1 opacity-30 text-gray-400" />;
  }
  return direction === "asc" ? (
    <ArrowUp className="w-3 h-3 inline ml-1 text-rose-600" />
  ) : (
    <ArrowDown className="w-3 h-3 inline ml-1 text-rose-600" />
  );
}

export default function DepartmentList() {
  const [records, setRecords] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(new Date());

  const fetchRecords = useCallback(() => {
    setIsLoading(true);
    getDepartments({ include_inactive: true })
      .then((res) => {
        const raw = res?.data?.data ?? res?.data?.items ?? res?.data ?? res?.items ?? res ?? [];
        const list = Array.isArray(raw) ? raw : (Array.isArray(raw?.items) ? raw.items : []);
        setRecords(list);
        setLastUpdated(new Date());
      })
      .catch((err) => console.error(err))
      .finally(() => setIsLoading(false));
  }, []);

  useEffect(() => {
    fetchRecords();
    const handleSync = () => fetchRecords();
    window.addEventListener("zoiko-departments-updated", handleSync);
    return () => window.removeEventListener("zoiko-departments-updated", handleSync);
  }, [fetchRecords]);

  const [viewMode, setViewMode] = useState("table"); // "table" | "grid"
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all"); // "all" | "active" | "inactive"
  const [typeFilter, setTypeFilter] = useState("all"); // "all" | "root" | "sub"
  const [budgetHealthFilter, setBudgetHealthFilter] = useState("all"); // "all" | "healthy" | "warning" | "over"

  const [sortColumn, setSortColumn] = useState(
    DEFAULT_DEPARTMENT_SETTINGS.default_sort_field || "name"
  );
  const [sortDirection, setSortDirection] = useState(
    DEFAULT_DEPARTMENT_SETTINGS.default_sort_direction || "asc"
  );
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(
    DEFAULT_DEPARTMENT_SETTINGS.items_per_page || 10
  );

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingDept, setEditingDept] = useState(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [nameError, setNameError] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const [confirmStatus, setConfirmStatus] = useState(null); // { dept, next }
  const [statusBusyId, setStatusBusyId] = useState(null);
  const [statusMessage, setStatusMessage] = useState(null); // { type, text }

  const emptyForm = {
    is_active: true,
    name: "",
    code: "",
    head: "",
    head_person: null,
    head_touched: false,
    establishment_year: new Date().getFullYear().toString(),
    budget: "",
    spent_budget: "0",
    description: "",
    parent_id: "",
  };

  const [formData, setFormData] = useState(emptyForm);

  // Load preferences from settings service if available
  useEffect(() => {
    if (typeof getDepartmentSettings !== "function") return;
    getDepartmentSettings({ _: Date.now() })
      .then((data) => {
        const s = normalizeDepartmentSettings(data);
        if (s.default_sort_field) setSortColumn(s.default_sort_field);
        if (s.default_sort_direction) setSortDirection(s.default_sort_direction);
        if (s.items_per_page) setItemsPerPage(s.items_per_page);
      })
      .catch(() => {});
  }, []);

  const deptLookup = useMemo(() => {
    const map = new Map();
    records.forEach((d) => map.set(d.id, d));
    return map;
  }, [records]);

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
    let result = [...records];

    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        (r) =>
          r.name?.toLowerCase().includes(q) ||
          r.code?.toLowerCase().includes(q) ||
          r.department_code?.toLowerCase().includes(q) ||
          (r.head_name || r.head)?.toLowerCase().includes(q) ||
          (r.establishment_year && String(r.establishment_year).includes(q))
      );
    }

    if (statusFilter !== "all") {
      result = result.filter((r) =>
        statusFilter === "active" ? r.is_active : !r.is_active
      );
    }

    if (typeFilter !== "all") {
      result = result.filter((r) =>
        typeFilter === "root" ? !r.parent_id : Boolean(r.parent_id)
      );
    }

    if (budgetHealthFilter !== "all") {
      result = result.filter((r) => {
        const b = Number(r.budget) || 0;
        const s = Number(r.spent_budget) || 0;
        if (b <= 0) return budgetHealthFilter === "healthy";
        const pct = (s / b) * 100;
        if (budgetHealthFilter === "over") return pct > 100;
        if (budgetHealthFilter === "warning") return pct >= 80 && pct <= 100;
        if (budgetHealthFilter === "healthy") return pct < 80;
        return true;
      });
    }

    result.sort((a, b) => {
      let cmp = 0;
      if (sortColumn === "name") {
        cmp = (a.name || "").localeCompare(b.name || "");
      } else if (sortColumn === "created_at") {
        cmp = new Date(a.created_at || 0) - new Date(b.created_at || 0);
      } else if (sortColumn === "employee_count") {
        cmp = (Number(a.employee_count) || 0) - (Number(b.employee_count) || 0);
      } else if (sortColumn === "budget") {
        cmp = (Number(a.budget) || 0) - (Number(b.budget) || 0);
      } else if (sortColumn === "spent_budget") {
        cmp = (Number(a.spent_budget) || 0) - (Number(b.spent_budget) || 0);
      }
      return sortDirection === "asc" ? cmp : -cmp;
    });

    return result;
  }, [
    records,
    search,
    statusFilter,
    typeFilter,
    budgetHealthFilter,
    sortColumn,
    sortDirection,
  ]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / itemsPerPage));
  const safePage = Math.min(currentPage, totalPages);
  const paginated = useMemo(() => {
    const start = (safePage - 1) * itemsPerPage;
    return filtered.slice(start, start + itemsPerPage);
  }, [filtered, safePage, itemsPerPage]);

  useEffect(() => {
    if (currentPage > totalPages) setCurrentPage(totalPages);
  }, [totalPages, currentPage]);

  const handleOpenCreateModal = (parentDeptId = "") => {
    setEditingDept(null);
    setFormData({
      ...emptyForm,
      parent_id: parentDeptId ? String(parentDeptId) : "",
    });
    setErrorMessage("");
    setNameError("");
    setIsModalOpen(true);
  };

  const handleEditClick = (dept) => {
    setEditingDept(dept);
    setFormData({
      name: dept.name || "",
      code: dept.code || "",
      head: dept.head || "",
      head_person: dept.head_employee_id
        ? { id: dept.head_employee_id, name: dept.head_name || dept.head }
        : null,
      head_touched: false,
      establishment_year: dept.establishment_year || "",
      budget: dept.budget != null ? String(dept.budget) : "",
      spent_budget: dept.spent_budget != null ? String(dept.spent_budget) : "0",
      description: dept.description || "",
      parent_id: dept.parent_id != null ? String(dept.parent_id) : "",
      is_active: dept.is_active !== false,
    });
    setErrorMessage("");
    setNameError("");
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setEditingDept(null);
    setErrorMessage("");
    setNameError("");
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    setErrorMessage("");
    const nameProblem = fieldProblem("org_unit", formData.name);
    setNameError(nameProblem);
    if (nameProblem) {
      document.getElementById("dept-name")?.focus();
      return;
    }

    setIsSaving(true);
    const { head_person: headPerson, head_touched: headTouched, ...rest } = formData;
    const payload = {
      ...rest,
      parent_id: formData.parent_id === "" ? null : Number(formData.parent_id),
      establishment_year:
        formData.establishment_year === ""
          ? null
          : Number(formData.establishment_year),
      budget: formData.budget === "" ? 0 : Number(formData.budget),
      spent_budget:
        formData.spent_budget === "" ? 0 : Number(formData.spent_budget),
      is_active: formData.is_active !== false,
    };
    delete payload.head;
    if (headTouched || !editingDept) {
      payload.head_employee_id = headPerson ? headPerson.id : null;
    }

    const action = editingDept
      ? updateDepartment(editingDept.id, payload)
      : createDepartment(payload);

    action
      .then(() => {
        setIsModalOpen(false);
        setEditingDept(null);
        setFormData(emptyForm);
        notifyDepartmentsUpdated();
        fetchRecords();
        setStatusMessage({
          type: "success",
          text: `Department ${payload.name} was successfully ${
            editingDept ? "updated" : "created"
          }.`,
        });
      })
      .catch((err) => {
        const fallbackMsg =
          "Department with this name or code already exists in the organization.";
        const apiError =
          err?.message ||
          err?.response?.data?.message ||
          err?.response?.data?.error ||
          fallbackMsg;
        setErrorMessage(apiError);
      })
      .finally(() => setIsSaving(false));
  };

  const applyStatusChange = () => {
    if (!confirmStatus) return;
    const { dept, next } = confirmStatus;
    setStatusBusyId(dept.id);
    setStatusMessage(null);
    updateDepartment(dept.id, { is_active: next })
      .then(() => {
        setConfirmStatus(null);
        setStatusMessage({
          type: "success",
          text: `${dept.name} is now ${next ? "active" : "inactive"}.`,
        });
        setRecords((prev) =>
          prev.map((d) => (d.id === dept.id ? { ...d, is_active: next } : d))
        );
        notifyDepartmentsUpdated();
        fetchRecords();
      })
      .catch((err) => {
        setConfirmStatus(null);
        setStatusMessage({
          type: "error",
          text: err?.message || "Could not modify department active status.",
        });
      })
      .finally(() => setStatusBusyId(null));
  };

  const autoGenerateCode = () => {
    if (!formData.name.trim()) return;
    const words = formData.name.trim().split(/\s+/);
    let generated = "";
    if (words.length === 1) {
      generated = words[0].slice(0, 4).toUpperCase();
    } else {
      generated = words
        .slice(0, 4)
        .map((w) => w[0])
        .join("")
        .toUpperCase();
    }
    setFormData((prev) => ({ ...prev, code: generated }));
  };

  return (
    <DepartmentLayout
      title="Department Directory"
      subtitle="Comprehensive registry of organizational entities, hierarchy paths, leadership, and budget allocation"
      lastUpdated={lastUpdated}
      isRefreshing={isLoading}
      onRefresh={fetchRecords}
      actions={
        <button
          onClick={() => handleOpenCreateModal()}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-rose-600 hover:bg-rose-700 text-white font-semibold text-sm shadow-sm shadow-rose-900/20 transition-all hover:scale-[1.02] active:scale-[0.98]"
        >
          <Plus size={16} className="stroke-[2.5]" />
          <span>Add Department</span>
        </button>
      }
    >
      {/* Notifications / Alerts */}
      {statusMessage && (
        <div
          role={statusMessage.type === "error" ? "alert" : "status"}
          className={`mb-5 flex items-start justify-between gap-3 rounded-xl border px-4 py-3.5 text-sm shadow-sm transition-all animate-fadeIn ${
            statusMessage.type === "error"
              ? "bg-red-50/90 border-red-200 text-red-800"
              : "bg-emerald-50/90 border-emerald-200 text-emerald-800"
          }`}
        >
          <div className="flex items-center gap-2.5">
            {statusMessage.type === "error" ? (
              <ShieldAlert className="w-5 h-5 text-red-600 shrink-0" />
            ) : (
              <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
            )}
            <span className="font-medium">{statusMessage.text}</span>
          </div>
          <button
            type="button"
            onClick={() => setStatusMessage(null)}
            aria-label="Dismiss"
            className="shrink-0 p-1 text-gray-400 hover:text-gray-700 rounded-lg hover:bg-black/5"
          >
            <X size={15} />
          </button>
        </div>
      )}

      {/* Main Card Container */}
      <div className="bg-white rounded-2xl border border-gray-200/90 shadow-sm overflow-hidden">
        {/* Multi-Filter & Search Toolbar */}
        <div className="p-4 sm:p-5 border-b border-gray-100 bg-gray-50/50 flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3.5">
          {/* Search + Dropdowns */}
          <div className="flex flex-wrap items-center gap-2.5 flex-1">
            <div className="relative min-w-[240px] flex-1 sm:max-w-xs">
              <Search
                className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400"
                size={16}
              />
              <input
                type="text"
                placeholder="Search name, code, head, year..."
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setCurrentPage(1);
                }}
                className="w-full pl-9 pr-8 py-2 text-sm bg-white border border-gray-200 rounded-xl placeholder:text-gray-400 focus:outline-none focus:border-rose-500 focus:ring-2 focus:ring-rose-500/10 transition-all shadow-xs"
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch("")}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 p-0.5"
                >
                  <X size={14} />
                </button>
              )}
            </div>

            {/* Status Filter */}
            <select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setCurrentPage(1);
              }}
              className="px-3 py-2 text-sm bg-white border border-gray-200 rounded-xl text-gray-700 focus:outline-none focus:border-rose-500 shadow-xs"
            >
              <option value="all">All Status</option>
              <option value="active">Active Only</option>
              <option value="inactive">Inactive Only</option>
            </select>

            {/* Hierarchy Type Filter */}
            <select
              value={typeFilter}
              onChange={(e) => {
                setTypeFilter(e.target.value);
                setCurrentPage(1);
              }}
              className="px-3 py-2 text-sm bg-white border border-gray-200 rounded-xl text-gray-700 focus:outline-none focus:border-rose-500 shadow-xs"
            >
              <option value="all">All Hierarchies</option>
              <option value="root">Root Departments</option>
              <option value="sub">Sub-Departments</option>
            </select>

            {/* Budget Health Filter */}
            <select
              value={budgetHealthFilter}
              onChange={(e) => {
                setBudgetHealthFilter(e.target.value);
                setCurrentPage(1);
              }}
              className="px-3 py-2 text-sm bg-white border border-gray-200 rounded-xl text-gray-700 focus:outline-none focus:border-rose-500 shadow-xs"
            >
              <option value="all">All Budget Statuses</option>
              <option value="healthy">Within Budget (&lt;80%)</option>
              <option value="warning">Near Limit (80%–100%)</option>
              <option value="over">Over Budget (&gt;100%)</option>
            </select>
          </div>

          {/* View Mode & Count */}
          <div className="flex items-center justify-between sm:justify-end gap-3 shrink-0 pt-2 lg:pt-0 border-t lg:border-t-0 border-gray-200/60">
            <span className="text-xs font-semibold text-gray-500">
              Showing{" "}
              <strong className="text-gray-900 font-bold">{filtered.length}</strong>{" "}
              of {records.length} units
            </span>

            <div className="inline-flex items-center p-1 bg-gray-200/60 rounded-xl border border-gray-200">
              <button
                type="button"
                onClick={() => setViewMode("table")}
                title="Table View"
                className={`p-1.5 rounded-lg text-xs font-medium transition-all ${
                  viewMode === "table"
                    ? "bg-white text-gray-900 shadow-xs"
                    : "text-gray-500 hover:text-gray-800"
                }`}
              >
                <List size={16} />
              </button>
              <button
                type="button"
                onClick={() => setViewMode("grid")}
                title="Grid View"
                className={`p-1.5 rounded-lg text-xs font-medium transition-all ${
                  viewMode === "grid"
                    ? "bg-white text-gray-900 shadow-xs"
                    : "text-gray-500 hover:text-gray-800"
                }`}
              >
                <LayoutGrid size={16} />
              </button>
            </div>
          </div>
        </div>

        {/* Content Body */}
        {isLoading && records.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-gray-400">
            <Loader2 className="w-8 h-8 text-rose-600 animate-spin mb-3" />
            <span className="text-sm font-medium text-gray-600">
              Loading department registry...
            </span>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 px-4 text-center">
            <div className="w-16 h-16 rounded-2xl bg-rose-50 border border-rose-100 flex items-center justify-center mb-3 text-rose-500">
              <Building2 size={28} />
            </div>
            <h4 className="text-base font-bold text-gray-900">
              No matching departments found
            </h4>
            <p className="text-sm text-gray-500 max-w-sm mt-1 mb-5">
              {search ||
              statusFilter !== "all" ||
              typeFilter !== "all" ||
              budgetHealthFilter !== "all"
                ? "Try adjusting your search query or filter options to locate the department you need."
                : "No departments currently exist. Create your primary organization unit to get started."}
            </p>
            {search ||
            statusFilter !== "all" ||
            typeFilter !== "all" ||
            budgetHealthFilter !== "all" ? (
              <button
                type="button"
                onClick={() => {
                  setSearch("");
                  setStatusFilter("all");
                  setTypeFilter("all");
                  setBudgetHealthFilter("all");
                }}
                className="px-4 py-2 text-xs font-semibold text-rose-600 hover:bg-rose-50 rounded-lg border border-rose-200 transition-colors"
              >
                Reset All Filters
              </button>
            ) : (
              <button
                type="button"
                onClick={() => handleOpenCreateModal()}
                className="inline-flex items-center gap-2 px-4 py-2 bg-rose-600 text-white rounded-lg text-sm font-semibold hover:bg-rose-700 transition-colors"
              >
                <Plus size={16} /> Add First Department
              </button>
            )}
          </div>
        ) : viewMode === "table" ? (
          /* TABLE VIEW */
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-gray-50/75 border-b border-gray-200 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  <th
                    className="px-5 py-3.5 cursor-pointer select-none hover:text-rose-600 transition-colors"
                    onClick={() => handleSort("name")}
                  >
                    Department Entity{" "}
                    <SortIcon
                      column="name"
                      current={sortColumn}
                      direction={sortDirection}
                    />
                  </th>
                  <th className="px-4 py-3.5">Code / ID</th>
                  <th className="px-4 py-3.5">Hierarchy Path</th>
                  <th className="px-4 py-3.5">Head of Dept</th>
                  <th
                    className="px-4 py-3.5 cursor-pointer select-none hover:text-rose-600 text-center transition-colors"
                    onClick={() => handleSort("employee_count")}
                  >
                    Staff{" "}
                    <SortIcon
                      column="employee_count"
                      current={sortColumn}
                      direction={sortDirection}
                    />
                  </th>
                  <th
                    className="px-4 py-3.5 cursor-pointer select-none hover:text-rose-600 transition-colors"
                    onClick={() => handleSort("budget")}
                  >
                    Budget &amp; Spend{" "}
                    <SortIcon
                      column="budget"
                      current={sortColumn}
                      direction={sortDirection}
                    />
                  </th>
                  <th className="px-4 py-3.5 text-center">Status</th>
                  <th className="px-5 py-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 text-sm text-gray-700">
                {paginated.map((r) => {
                  const parent = r.parent_id ? deptLookup.get(r.parent_id) : null;
                  const b = Number(r.budget) || 0;
                  const s = Number(r.spent_budget) || 0;
                  const utilPct = b > 0 ? Math.min(Math.round((s / b) * 100), 999) : 0;
                  const isOver = b > 0 && s > b;
                  const isNear = b > 0 && utilPct >= 80 && !isOver;

                  return (
                    <tr
                      key={r.id}
                      className="hover:bg-slate-50/80 transition-colors group"
                    >
                      {/* Name & Initials */}
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-slate-100 to-slate-200 border border-slate-200/80 flex items-center justify-center font-bold text-slate-700 text-xs shadow-2xs shrink-0 group-hover:from-rose-50 group-hover:to-rose-100 group-hover:text-rose-700 group-hover:border-rose-200 transition-all">
                            {r.code ? r.code.slice(0, 3) : r.name.slice(0, 2).toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <p className="font-semibold text-gray-900 truncate">
                              {r.name}
                            </p>
                            {r.establishment_year && (
                              <p className="text-xs text-gray-400 mt-0.5 flex items-center gap-1">
                                <Calendar size={11} /> Est. {r.establishment_year}
                              </p>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Code / Dept Code */}
                      <td className="px-4 py-4">
                        <div className="space-y-0.5">
                          <span className="inline-block px-2 py-0.5 rounded-md font-mono text-xs font-bold bg-rose-50 text-rose-700 border border-rose-200/60">
                            {r.code}
                          </span>
                          {r.department_code && r.department_code !== r.code && (
                            <p className="text-[11px] font-mono text-blue-600">
                              {r.department_code}
                            </p>
                          )}
                        </div>
                      </td>

                      {/* Parent Hierarchy */}
                      <td className="px-4 py-4">
                        {parent ? (
                          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-gray-100/80 text-gray-700 text-xs font-medium border border-gray-200">
                            <GitFork size={12} className="text-rose-500 rotate-180" />
                            <span className="truncate max-w-[130px]" title={parent.name}>
                              {parent.name}
                            </span>
                          </div>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-100 text-slate-600 text-xs font-semibold">
                            Root Unit
                          </span>
                        )}
                      </td>

                      {/* Head of Department */}
                      <td className="px-4 py-4">
                        {r.head_name || r.head ? (
                          <div className="flex items-center gap-2">
                            <div className="w-7 h-7 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center font-bold text-xs shrink-0">
                              {(r.head_name || r.head)[0].toUpperCase()}
                            </div>
                            <span className="text-xs font-medium text-gray-900 truncate max-w-[140px]">
                              {r.head_name || r.head}
                            </span>
                          </div>
                        ) : (
                          <span className="text-xs text-gray-400 italic">
                            Unassigned
                          </span>
                        )}
                      </td>

                      {/* Staff Headcount */}
                      <td className="px-4 py-4 text-center">
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-slate-100 text-slate-700 text-xs font-bold border border-slate-200/70">
                          <Users size={12} className="text-slate-500" />
                          {r.employee_count || 0}
                        </span>
                      </td>

                      {/* Budget & Spend */}
                      <td className="px-4 py-4 min-w-[170px]">
                        <div>
                          <div className="flex items-center justify-between text-xs mb-1">
                            <span className="font-medium text-gray-700">
                              {formatNumber(s)}
                            </span>
                            <span className="text-gray-400">
                              of {formatNumber(b)}
                            </span>
                          </div>
                          <div className="w-full bg-gray-100 rounded-full h-1.5 overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all duration-500 ${
                                isOver
                                  ? "bg-red-500"
                                  : isNear
                                  ? "bg-amber-500"
                                  : "bg-emerald-500"
                              }`}
                              style={{ width: `${Math.min(utilPct, 100)}%` }}
                            />
                          </div>
                          <div className="flex items-center justify-between mt-1 text-[11px]">
                            <span
                              className={`font-semibold ${
                                isOver
                                  ? "text-red-600"
                                  : isNear
                                  ? "text-amber-600"
                                  : "text-emerald-700"
                              }`}
                            >
                              {utilPct}% used
                            </span>
                            {isOver && (
                              <span className="text-red-600 font-bold">
                                Exceeded
                              </span>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Status */}
                      <td className="px-4 py-4 text-center">
                        <span
                          className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                            r.is_active
                              ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                              : "bg-gray-100 text-gray-500 border border-gray-200"
                          }`}
                        >
                          <span
                            className={`w-1.5 h-1.5 rounded-full ${
                              r.is_active ? "bg-emerald-500" : "bg-gray-400"
                            }`}
                          />
                          {r.is_active ? "Active" : "Inactive"}
                        </span>
                      </td>

                      {/* Actions */}
                      <td className="px-5 py-4 text-right">
                        <div className="inline-flex items-center justify-end gap-1">
                          <button
                            type="button"
                            onClick={() => handleEditClick(r)}
                            className="inline-flex items-center gap-1 text-xs font-semibold text-gray-600 hover:text-rose-600 px-2.5 py-1.5 rounded-lg hover:bg-rose-50/80 transition-colors"
                          >
                            <Pencil size={13} />
                            <span>Edit</span>
                          </button>
                          <button
                            type="button"
                            disabled={statusBusyId === r.id}
                            onClick={() =>
                              setConfirmStatus({ dept: r, next: !r.is_active })
                            }
                            aria-label={`${
                              r.is_active ? "Deactivate" : "Activate"
                            } ${r.name}`}
                            className={`inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1.5 rounded-lg transition-colors disabled:opacity-50 ${
                              r.is_active
                                ? "text-gray-500 hover:text-amber-700 hover:bg-amber-50"
                                : "text-emerald-700 hover:bg-emerald-50"
                            }`}
                          >
                            {statusBusyId === r.id ? (
                              <Loader2 size={13} className="animate-spin" />
                            ) : (
                              <Power size={13} />
                            )}
                            <span>{r.is_active ? "Deactivate" : "Activate"}</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          /* CARD GRID VIEW */
          <div className="p-5 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 bg-gray-50/40">
            {paginated.map((r) => {
              const parent = r.parent_id ? deptLookup.get(r.parent_id) : null;
              const b = Number(r.budget) || 0;
              const s = Number(r.spent_budget) || 0;
              const utilPct = b > 0 ? Math.min(Math.round((s / b) * 100), 999) : 0;
              const isOver = b > 0 && s > b;
              const isNear = b > 0 && utilPct >= 80 && !isOver;

              return (
                <div
                  key={r.id}
                  className="bg-white rounded-2xl border border-gray-200/90 p-5 shadow-xs hover:shadow-md hover:border-rose-200/80 transition-all flex flex-col justify-between"
                >
                  <div>
                    {/* Header: Code & Status */}
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <span className="px-2.5 py-1 rounded-lg font-mono text-xs font-bold bg-rose-50 text-rose-700 border border-rose-200/60">
                          {r.code}
                        </span>
                        {parent && (
                          <span className="text-[11px] font-medium text-gray-500 bg-gray-100 px-2 py-0.5 rounded-md truncate max-w-[120px]">
                            ↳ {parent.name}
                          </span>
                        )}
                      </div>
                      <span
                        className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                          r.is_active
                            ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                            : "bg-gray-100 text-gray-500 border border-gray-200"
                        }`}
                      >
                        <span
                          className={`w-1.5 h-1.5 rounded-full ${
                            r.is_active ? "bg-emerald-500" : "bg-gray-400"
                          }`}
                        />
                        {r.is_active ? "Active" : "Inactive"}
                      </span>
                    </div>

                    {/* Department Title */}
                    <h4 className="text-base font-bold text-gray-900 tracking-tight leading-snug line-clamp-1">
                      {r.name}
                    </h4>
                    {r.description && (
                      <p className="text-xs text-gray-500 line-clamp-2 mt-1">
                        {r.description}
                      </p>
                    )}

                    {/* Meta info chips */}
                    <div className="mt-4 pt-3 border-t border-gray-100 grid grid-cols-2 gap-2 text-xs">
                      <div>
                        <span className="text-gray-400 font-medium block">
                          Head of Dept
                        </span>
                        <span className="font-semibold text-gray-800 truncate block mt-0.5">
                          {r.head_name || r.head || "Unassigned"}
                        </span>
                      </div>
                      <div>
                        <span className="text-gray-400 font-medium block">
                          Active Staff
                        </span>
                        <span className="font-semibold text-gray-800 flex items-center gap-1 mt-0.5">
                          <Users size={12} className="text-slate-500" />
                          {r.employee_count || 0} employees
                        </span>
                      </div>
                    </div>

                    {/* Financial Progress */}
                    <div className="mt-4 pt-3 border-t border-gray-100">
                      <div className="flex items-center justify-between text-xs mb-1.5">
                        <span className="text-gray-500 font-medium">
                          Budget Utilization
                        </span>
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
                      <div className="flex items-center justify-between text-[11px] text-gray-400 mt-1">
                        <span>Spent: {formatNumber(s)}</span>
                        <span>Total: {formatNumber(b)}</span>
                      </div>
                    </div>
                  </div>

                  {/* Card Action Footer */}
                  <div className="mt-5 pt-3 border-t border-gray-100 flex items-center justify-between">
                    <button
                      type="button"
                      onClick={() => handleOpenCreateModal(r.id)}
                      className="text-xs font-medium text-gray-500 hover:text-rose-600 flex items-center gap-1"
                    >
                      <Plus size={13} />
                      <span>Add sub-unit</span>
                    </button>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => handleEditClick(r)}
                        className="px-2.5 py-1 text-xs font-semibold text-gray-600 hover:text-rose-600 rounded-lg hover:bg-rose-50 transition-colors"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          setConfirmStatus({ dept: r, next: !r.is_active })
                        }
                        className="px-2.5 py-1 text-xs font-semibold text-gray-500 hover:text-gray-900 rounded-lg hover:bg-gray-100 transition-colors"
                      >
                        {r.is_active ? "Deactivate" : "Activate"}
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Pagination Bar */}
        {totalPages > 1 && (
          <div className="px-5 py-4 border-t border-gray-100 flex flex-col sm:flex-row justify-between items-center gap-3 bg-gray-50/40">
            <span className="text-xs font-medium text-gray-500">
              Showing {(safePage - 1) * itemsPerPage + 1}–
              {Math.min(safePage * itemsPerPage, filtered.length)} of{" "}
              {filtered.length} entries
            </span>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={safePage <= 1}
                className="px-3 py-1.5 text-xs font-semibold border border-gray-200 rounded-lg disabled:opacity-40 hover:bg-white hover:border-gray-300 transition-colors"
              >
                Previous
              </button>
              {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
                let pageNum;
                if (totalPages <= 5) {
                  pageNum = i + 1;
                } else if (safePage <= 3) {
                  pageNum = i + 1;
                } else if (safePage >= totalPages - 2) {
                  pageNum = totalPages - 4 + i;
                } else {
                  pageNum = safePage - 2 + i;
                }
                return (
                  <button
                    key={pageNum}
                    type="button"
                    onClick={() => setCurrentPage(pageNum)}
                    className={`px-3 py-1.5 text-xs font-semibold rounded-lg border transition-all ${
                      pageNum === safePage
                        ? "bg-rose-600 text-white border-rose-600 shadow-xs"
                        : "border-gray-200 hover:bg-white text-gray-700"
                    }`}
                  >
                    {pageNum}
                  </button>
                );
              })}
              <button
                type="button"
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                disabled={safePage >= totalPages}
                className="px-3 py-1.5 text-xs font-semibold border border-gray-200 rounded-lg disabled:opacity-40 hover:bg-white hover:border-gray-300 transition-colors"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {/* CREATE / EDIT MODAL */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-950/50 backdrop-blur-xs flex items-center justify-center z-50 p-4 animate-fadeIn">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl overflow-hidden flex flex-col max-h-[92vh] border border-gray-100">
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-gradient-to-r from-gray-50 to-white">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-rose-50 border border-rose-100 text-rose-600 flex items-center justify-center">
                  <Building2 size={18} />
                </div>
                <div>
                  <h3 className="font-bold text-gray-900 text-base">
                    {editingDept ? "Modify Department Unit" : "Create Department Unit"}
                  </h3>
                  <p className="text-xs text-gray-500">
                    Define entity parameters, leadership, and budget allocation
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={handleCloseModal}
                className="text-gray-400 hover:text-gray-700 p-1.5 rounded-lg hover:bg-gray-100 transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            {/* Modal Form */}
            <form
              onSubmit={handleSubmit}
              className="p-6 space-y-4 overflow-y-auto text-sm flex-1"
            >
              {errorMessage && (
                <div className="flex items-start gap-2.5 bg-red-50 border border-red-200 text-red-700 p-3.5 rounded-xl text-xs font-medium">
                  <AlertCircle size={16} className="text-red-500 shrink-0 mt-0.5" />
                  <div className="leading-relaxed">{errorMessage}</div>
                </div>
              )}

              {/* Basic Details: Name and Code */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wider mb-1.5">
                    Department Name *
                  </label>
                  <input
                    id="dept-name"
                    type="text"
                    required
                    placeholder="e.g., Engineering & DevOps"
                    value={formData.name}
                    onChange={(e) => {
                      setFormData({ ...formData, name: e.target.value });
                      if (nameError) setNameError("");
                    }}
                    onBlur={() => setNameError(fieldProblem("org_unit", formData.name))}
                    aria-invalid={nameError ? true : undefined}
                    aria-describedby={nameError ? "dept-name-error" : undefined}
                    className={`w-full px-3.5 py-2.5 border rounded-xl focus:outline-none focus:border-rose-500 focus:ring-2 focus:ring-rose-500/10 transition-all ${
                      nameError ? "border-rose-300 bg-rose-50/20" : "border-gray-200"
                    }`}
                  />
                  {nameError && (
                    <p
                      id="dept-name-error"
                      role="alert"
                      className="mt-1 text-xs font-medium text-rose-600"
                    >
                      {nameError}
                    </p>
                  )}
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wider">
                      Department Code *
                    </label>
                    <button
                      type="button"
                      onClick={autoGenerateCode}
                      className="text-[11px] font-semibold text-rose-600 hover:text-rose-700 flex items-center gap-1"
                    >
                      <Sparkles size={11} /> Auto-code
                    </button>
                  </div>
                  <input
                    type="text"
                    required
                    placeholder="e.g., ENG"
                    value={formData.code}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        code: e.target.value.toUpperCase(),
                      })
                    }
                    className="w-full px-3.5 py-2.5 font-mono text-sm uppercase border border-gray-200 rounded-xl focus:outline-none focus:border-rose-500 focus:ring-2 focus:ring-rose-500/10 transition-all"
                  />
                </div>
              </div>

              {/* Leadership & Establishment Year */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <EmployeePicker
                    id="dept-head"
                    label="Head of department (optional)"
                    value={formData.head_person}
                    onChange={(person) =>
                      setFormData({
                        ...formData,
                        head_person: person,
                        head_touched: true,
                      })
                    }
                    placeholder="Search people by name..."
                  />
                  {!formData.head_person && formData.head && !formData.head_touched && (
                    <p className="mt-1 text-xs text-amber-700">
                      Currently “{formData.head}” (typed text). Pick an employee to link directly.
                    </p>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wider mb-1.5">
                    Establishment Year *
                  </label>
                  <input
                    type="number"
                    required
                    placeholder="e.g., 2024"
                    value={formData.establishment_year}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        establishment_year: e.target.value,
                      })
                    }
                    className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:border-rose-500 focus:ring-2 focus:ring-rose-500/10 transition-all"
                  />
                </div>
              </div>

              {/* Financial Allocation */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-gray-50/70 p-4 rounded-xl border border-gray-100">
                <div>
                  <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wider mb-1.5">
                    Allocated Budget *
                  </label>
                  <input
                    type="number"
                    min="0"
                    required
                    placeholder="e.g., 500000"
                    value={formData.budget}
                    onChange={(e) =>
                      setFormData({ ...formData, budget: e.target.value })
                    }
                    className="w-full px-3.5 py-2.5 bg-white border border-gray-200 rounded-xl focus:outline-none focus:border-rose-500 focus:ring-2 focus:ring-rose-500/10 transition-all"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wider mb-1.5">
                    Spent Budget *
                  </label>
                  <input
                    type="number"
                    min="0"
                    required
                    placeholder="e.g., 120000"
                    value={formData.spent_budget}
                    onChange={(e) =>
                      setFormData({ ...formData, spent_budget: e.target.value })
                    }
                    className="w-full px-3.5 py-2.5 bg-white border border-gray-200 rounded-xl focus:outline-none focus:border-rose-500 focus:ring-2 focus:ring-rose-500/10 transition-all"
                  />
                  {Number(formData.budget) > 0 &&
                    Number(formData.spent_budget) > Number(formData.budget) && (
                      <p role="status" className="mt-1 text-xs text-red-600 font-semibold">
                        Over budget by{" "}
                        {formatNumber(
                          Number(formData.spent_budget) - Number(formData.budget)
                        )}
                        .
                      </p>
                    )}
                </div>
              </div>

              {/* Parent Entity & Status */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wider mb-1.5">
                    Parent Department (Optional)
                  </label>
                  <select
                    value={formData.parent_id}
                    onChange={(e) =>
                      setFormData({ ...formData, parent_id: e.target.value })
                    }
                    className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl bg-white focus:outline-none focus:border-rose-500 shadow-xs"
                  >
                    <option value="">No Parent (Root Department)</option>
                    {records
                      .filter(
                        (r) => r.is_active && (!editingDept || r.id !== editingDept.id)
                      )
                      .map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.name} ({r.code})
                        </option>
                      ))}
                  </select>
                </div>

                {editingDept && (
                  <div>
                    <label
                      htmlFor="dept-status"
                      className="block text-xs font-semibold text-gray-600 uppercase tracking-wider mb-1.5"
                    >
                      Status
                    </label>
                    <select
                      id="dept-status"
                      value={formData.is_active === false ? "inactive" : "active"}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          is_active: e.target.value === "active",
                        })
                      }
                      className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl bg-white focus:outline-none focus:border-rose-500 shadow-xs"
                    >
                      <option value="active">Active</option>
                      <option value="inactive">Inactive</option>
                    </select>
                  </div>
                )}
              </div>

              {/* Description */}
              <div>
                <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wider mb-1.5">
                  Department Purpose / Notes
                </label>
                <textarea
                  rows="2"
                  placeholder="Outline responsibilities and organizational mandate..."
                  value={formData.description}
                  onChange={(e) =>
                    setFormData({ ...formData, description: e.target.value })
                  }
                  className="w-full px-3.5 py-2 border border-gray-200 rounded-xl focus:outline-none focus:border-rose-500 focus:ring-2 focus:ring-rose-500/10 transition-all resize-none"
                />
              </div>

              {/* Actions */}
              <div className="pt-4 border-t border-gray-100 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={handleCloseModal}
                  disabled={isSaving}
                  className="px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-100 rounded-xl transition-colors disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="px-5 py-2.5 text-sm font-semibold text-white bg-rose-600 hover:bg-rose-700 rounded-xl shadow-sm shadow-rose-900/20 transition-all flex items-center gap-2 disabled:opacity-50"
                >
                  {isSaving && <Loader2 size={14} className="animate-spin" />}
                  <span>
                    {editingDept ? "Save Department" : "Create Department"}
                  </span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ACTIVATE / DEACTIVATE CONFIRMATION DIALOG */}
      {confirmStatus && (
        <div
          className="fixed inset-0 bg-slate-950/50 backdrop-blur-xs flex items-center justify-center z-50 p-4 animate-fadeIn"
          role="dialog"
          aria-modal="true"
          aria-label={confirmStatus.next ? "Activate department" : "Deactivate department"}
        >
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 border border-gray-100">
            <h3 className="font-bold text-gray-900 text-base">
              {confirmStatus.next ? "Activate" : "Deactivate"}{" "}
              {confirmStatus.dept.name}?
            </h3>
            <p className="text-sm text-gray-600 mt-2 leading-relaxed">
              {confirmStatus.next
                ? "This unit will be restored to active status across employee records, org trees, and reporting lists."
                : "This unit will be marked inactive and hidden from department selection pickers. All historical personnel and budget data are preserved."}
            </p>
            <div className="mt-5 flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setConfirmStatus(null)}
                disabled={statusBusyId === confirmStatus.dept.id}
                className="px-4 py-2 border border-gray-200 rounded-xl text-xs font-semibold text-gray-700 hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={applyStatusChange}
                disabled={statusBusyId === confirmStatus.dept.id}
                className={`px-4 py-2 rounded-xl text-xs font-semibold text-white transition-colors flex items-center gap-1.5 ${
                  confirmStatus.next
                    ? "bg-emerald-600 hover:bg-emerald-700 shadow-sm shadow-emerald-900/20"
                    : "bg-amber-600 hover:bg-amber-700 shadow-sm shadow-amber-900/20"
                }`}
              >
                {statusBusyId === confirmStatus.dept.id && (
                  <Loader2 size={13} className="animate-spin" />
                )}
                <span>
                  {confirmStatus.next ? "Activate" : "Deactivate"}
                </span>
              </button>
            </div>
          </div>
        </div>
      )}
    </DepartmentLayout>
  );
}
