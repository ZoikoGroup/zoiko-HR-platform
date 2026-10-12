import { useState, useMemo, useEffect, useCallback } from "react";
import { NavLink } from "react-router-dom";
import { Plus, RefreshCw, X } from "lucide-react";
import HRPage from "../../../components/HRPage";
import { 
  getDesignations, 
  getDepartments,
  createDesignation, 
  updateDesignation, 
  deleteDesignation,
  getHrEmployees,
  getDesignationSettings,
} from "../../../service/hrService";
import { updateEmployee } from "../../../service/employee";
import { formatDate } from "../../../utils/dateTime";
import { DEFAULT_DESIGNATION_SETTINGS, normalizeDesignationSettings, sortDesignations } from "../../../utils/designationSettings";

// Where a designation came from. Rows created before this was tracked have no source.
const SOURCE_LABELS = {
  manual: "Added manually",
  import: "Employee import",
  user_form: "Add User form",
};
const sourceLabel = (s) => SOURCE_LABELS[s] || "Before tracking";

const NAV_ITEMS = [
  { label: "Dashboard", href: "/zoiko-hr/designations" },
  { label: "Designation List", href: "/zoiko-hr/designations/list" },
  { label: "Designation Structure", href: "/zoiko-hr/designations/levels" },
  { label: "Reports", href: "/zoiko-hr/designations/reports" },
  { label: "Settings", href: "/zoiko-hr/designations/settings" },
];

const LEVEL_OPTIONS = ["L1", "L2", "L3", "L4", "L5", "L6", "L7", "L8", "L9", "L10"].map((l) => ({ value: l, label: l }));
const STATUS_OPTIONS = [
  { value: "active", label: "Active" },
  { value: "inactive", label: "Inactive" },
  { value: "archived", label: "Archived" },
];


const initialForm = {
  title: "",
  department_name: "", 
  level: "L1",
  description: "",
  status: "active",
};

export default function DesignationList() {
  const [records, setRecords] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [showDetail, setShowDetail] = useState(false);
  const [formData, setFormData] = useState(initialForm);
  const [detailItem, setDetailItem] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [notice, setNotice] = useState(null); // { type: "success" | "error", text }
  const [modalError, setModalError] = useState("");
  const [sourceFilter, setSourceFilter] = useState("all");
  const [search, setSearch] = useState("");
  // The organization's Designation Settings (sort, page size, columns, compact layout, level limit, codes).
  const [settings, setSettings] = useState(DEFAULT_DESIGNATION_SETTINGS);
  const [page, setPage] = useState(1);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const rows = records.filter((r) => {
      if (sourceFilter === "none" ? r.source : sourceFilter !== "all" && r.source !== sourceFilter) return false;
      if (!q) return true;
      return [r.title, r.department_name, r.designation_code].some((v) => String(v || "").toLowerCase().includes(q));
    });
    return sortDesignations(rows, settings.default_sort_field, settings.default_sort_direction);
  }, [records, search, sourceFilter, settings.default_sort_field, settings.default_sort_direction]);

  const pageSize = settings.items_per_page;
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const visible = useMemo(() => filtered.slice((safePage - 1) * pageSize, safePage * pageSize), [filtered, safePage, pageSize]);
  useEffect(() => { setPage(1); }, [search, sourceFilter, pageSize]);

  const cell = settings.compact_mode ? "px-4 py-1.5" : "px-4 py-3";
  const levelOptions = useMemo(() => {
    const allowed = LEVEL_OPTIONS.filter((_, i) => i + 1 <= settings.max_hierarchy_depth);
    // an existing designation keeps its current level selectable even if it is now beyond the limit
    return allowed.some((o) => o.value === formData.level) || !formData.level ? allowed : [...allowed, { value: formData.level, label: `${formData.level} (above the limit)` }];
  }, [settings.max_hierarchy_depth, formData.level]);

  const getEmpName = (emp) => {
    if (!emp) return "";
    const u = emp.user || emp.profile || {};
    const first = emp.first_name || emp.firstName || u.first_name || u.firstName || "";
    const last = emp.last_name || emp.lastName || u.last_name || u.lastName || "";
    if (first || last) return `${first} ${last}`.trim();
    return emp.full_name || emp.fullName || emp.name || emp.employee_name || emp.display_name || u.full_name || u.name || "";
  };

  const getEmpCode = (emp) => {
    if (!emp) return "";
    const u = emp.user || emp.profile || {};
    return emp.employee_code || emp.code || u.employee_code || u.code || emp.employee_id || emp.employeeId || emp.id;
  };

  const employeeMap = useMemo(() => {
    const m = {};
    employees.forEach((emp) => {
      const key = emp.id || emp.employee_id || emp.user_id || emp.user?.id || emp.profile?.id;
      if (key) m[key] = emp;
    });
    return m;
  }, [employees]);

  const getEmployeeDisplay = (empId) => {
    if (!empId) return "";
    const emp = employeeMap[empId];
    if (!emp) return `#${empId}`;
    const name = getEmpName(emp);
    const code = getEmpCode(emp);
    return name ? `${name} (${code})` : `#${code}`;
  };

  // A Designation has no employee_id of its own — the backend models this the
  // other way around (Employee.designation_id -> Designation.id), and a single
  // designation can be held by many employees (see Designation.employees_count).
  // So "who holds this designation" has to be derived by scanning the employee
  // list, not read off a field on the designation record.
  const getEmployeesForDesignation = (designationId) => {
    if (!designationId) return [];
    return employees.filter((emp) => {
      const empDesigId = emp.designation_id ?? emp.designationId ?? emp.designation?.id;
      return empDesigId != null && String(empDesigId) === String(designationId);
    });
  };

  const getAssignedEmployeeDisplay = (designationId) => {
    const emps = getEmployeesForDesignation(designationId);
    if (emps.length === 0) return "";
    if (emps.length === 1) {
      const name = getEmpName(emps[0]);
      const code = getEmpCode(emps[0]);
      return name ? `${name} (${code})` : `#${code}`;
    }
    return `${emps.length} employees`;
  };

  const fetchRecords = useCallback((opts = {}) => {
    setLoading(true);
    // A manual refresh must show the database, not a copy the server cached for up to two minutes:
    // the unique query value gives that request its own cache key.
    const fresh = opts.fresh ? { _: Date.now() } : undefined;
    return Promise.all([
      getDesignations(fresh),
      getDepartments(fresh),
      getHrEmployees(fresh),
      // the list still works with the defaults if the settings cannot be read
      getDesignationSettings(fresh).then(normalizeDesignationSettings).catch(() => null),
    ])
      .then(([desigRes, deptRes, empRes, settingsRes]) => {
        if (settingsRes) setSettings(settingsRes);
        const desigItems = desigRes?.items || desigRes?.data || (Array.isArray(desigRes) ? desigRes : []);
        setRecords(Array.isArray(desigItems) ? desigItems : []);
        const deptItems = deptRes?.data || deptRes?.items || (Array.isArray(deptRes) ? deptRes : []);
        setDepartments(Array.isArray(deptItems) ? deptItems : []);
        const empItems = empRes?.data || empRes?.items || (Array.isArray(empRes) ? empRes : []);
        const emps = Array.isArray(empItems) ? empItems : [];
        setEmployees(emps);
        return true;
      })
      .catch((err) => {
        console.error(err);
        setNotice({ type: "error", text: err?.message || "Could not load designations." });
        return false;
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    fetchRecords();
  }, [fetchRecords]);

  const handleRefresh = async () => {
    if (refreshing) return;
    setRefreshing(true);
    setNotice(null);
    const ok = await fetchRecords({ fresh: true });
    if (ok) setNotice({ type: "success", text: "Designation list refreshed." });
    setRefreshing(false);
  };

  const handleOpenCreate = () => {
    setEditingId(null);
    setFormData({ ...initialForm, status: settings.default_status, designation_code: "" });
    setSelectedEmployeeId("");
    setModalError("");
    setShowModal(true);
  };

  const handleOpenEdit = (item, e) => {
    e.stopPropagation();
    setEditingId(item.id);
    setFormData({
      title: item.title || "",
      department_name: item.department_name || "",
      level: item.level || "L1",
      description: item.description || "",
      status: item.status || "active",
    });
    const currentEmps = getEmployeesForDesignation(item.id);
    const currentEmpId = currentEmps[0] ? (currentEmps[0].id || currentEmps[0].employee_id || currentEmps[0].user_id) : null;
    setSelectedEmployeeId(currentEmpId ? String(currentEmpId) : "");
    setModalError("");
    setShowModal(true);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    // The Designation record itself has no employee_id field on the backend
    // (a designation can be held by many employees), so the assignment is
    // never sent as part of this payload — it's persisted separately below
    // by updating the chosen employee's designation_id instead.
    const payload = { ...formData };
    if (editingId || settings.auto_generate_codes || !payload.designation_code) delete payload.designation_code;
    const action = editingId
      ? updateDesignation(editingId, payload)
      : createDesignation(payload);

    action
      .then((res) => {
        const savedDesignation = res?.data || res;
        const designationId = editingId || savedDesignation?.id;
        if (selectedEmployeeId && designationId) {
          return updateEmployee(selectedEmployeeId, { designation_id: designationId });
        }
      })
      .then(() => {
        setShowModal(false);
        setNotice({ type: "success", text: editingId ? "Designation updated." : "Designation created." });
        return fetchRecords({ fresh: true });
      })
      .catch((err) => {
        console.error("Error saving record:", err);
        setModalError(err?.message || "Could not save the designation.");
      });
  };

  const handleDelete = (id, e) => {
    e.stopPropagation();
    if (window.confirm("Are you sure you want to delete this designation?")) {
      deleteDesignation(id)
        .then(() => {
          setNotice({ type: "success", text: "Designation deleted." });
          return fetchRecords({ fresh: true });
        })
        .catch((err) => {
          // e.g. "N employee(s) hold this designation" - say why instead of failing silently.
          setNotice({ type: "error", text: err?.message || "Could not delete the designation." });
        });
    }
  };

  return (
    <HRPage title="Designation List" breadcrumbs={[{ label: "HR" }, { label: "Designations", href: "/zoiko-hr/designations" }, { label: "List" }]}>
      <div className="flex gap-1 overflow-x-auto pb-1 mb-6 border-b border-gray-100">
        {NAV_ITEMS.map((item) => (
          <NavLink key={item.href} to={item.href} className={({ isActive }) => `whitespace-nowrap px-3 py-2 text-sm font-medium rounded-t-lg transition-colors ${isActive ? "text-blue-600 border-b-2 border-blue-600 bg-blue-50/50" : "text-gray-500 hover:text-gray-700"}`}>{item.label}</NavLink>
        ))}
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div className="flex items-center gap-2">
          <button onClick={handleOpenCreate} className="inline-flex items-center gap-2 bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors shadow-sm"><Plus className="w-4 h-4" /> Add Designation</button>
          <button type="button" onClick={handleRefresh} disabled={refreshing} aria-label="Refresh designations" title="Refresh from the server"
            className="p-2 border border-gray-200 rounded-lg hover:bg-gray-50 text-gray-500 transition-colors disabled:opacity-60">
            <RefreshCw className={`w-4 h-4 ${refreshing ? "animate-spin" : ""}`} aria-hidden="true" />
          </button>
        </div>
        <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
          <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search title or department..." aria-label="Search designations"
            className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20" />
          <select value={sourceFilter} onChange={(e) => setSourceFilter(e.target.value)} aria-label="Filter by source"
            className="px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none">
            <option value="all">All sources</option>
            <option value="manual">Added manually</option>
            <option value="import">Employee import</option>
            <option value="user_form">Add User form</option>
            <option value="none">Before tracking</option>
          </select>
        </div>
      </div>

      {notice && (
        <div role={notice.type === "error" ? "alert" : "status"}
          className={`mb-4 flex items-start justify-between gap-3 rounded-lg border px-4 py-3 text-sm ${
            notice.type === "error" ? "bg-red-50 border-red-200 text-red-700" : "bg-green-50 border-green-200 text-green-700"
          }`}>
          <span>{notice.text}</span>
          <button type="button" onClick={() => setNotice(null)} aria-label="Dismiss" className="shrink-0 opacity-70 hover:opacity-100"><X size={16} /></button>
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Designation Code</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Designation Title</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Department</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Level</th>
                {settings.show_salary_range && <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Salary Range</th>}
                {settings.show_employee_count && <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Employee</th>}
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Source</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Status</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-100">
              {loading && records.length === 0 ? (
                <tr><td colSpan={7 + (settings.show_salary_range ? 1 : 0) + (settings.show_employee_count ? 1 : 0)} className="px-4 py-10 text-center text-sm text-gray-400" role="status">Loading designations...</td></tr>
              ) : visible.length === 0 ? (
                <tr><td colSpan={7 + (settings.show_salary_range ? 1 : 0) + (settings.show_employee_count ? 1 : 0)} className="px-4 py-10 text-center text-sm text-gray-500">
                  {records.length === 0
                    ? "No designations yet. Click \"Add Designation\" or upload employees with a Designation column."
                    : "No designations match your search or filter."}
                </td></tr>
              ) : null}
              {visible.map((item) => (
                  <tr key={item.id} onClick={() => { setDetailItem(item); setShowDetail(true); }} className="hover:bg-gray-50/80 cursor-pointer transition-colors">
                  <td className={`${cell} text-sm font-mono font-bold text-[#3B82F6]`}>{item.designation_code || "—"}</td>
                  <td className={`${cell} text-sm font-medium text-gray-900`}>{item.title}</td>
                  <td className={`${cell} text-sm text-gray-600`}>{item.department_name}</td>
                  <td className={`${cell} text-sm text-gray-600`}>{item.level}</td>
                  {settings.show_salary_range && (
                    <td className={`${cell} text-sm text-gray-600`}>
                      {item.min_salary != null || item.max_salary != null
                        ? `${item.min_salary != null ? Number(item.min_salary).toLocaleString() : "?"} – ${item.max_salary != null ? Number(item.max_salary).toLocaleString() : "?"}`
                        : "—"}
                    </td>
                  )}
                  {settings.show_employee_count && (
                    <td className={`${cell} text-sm text-gray-600`}>
                      {getAssignedEmployeeDisplay(item.id) || (item.employees_count ? `${item.employees_count} employee${item.employees_count === 1 ? "" : "s"}` : "-")}
                    </td>
                  )}
                  <td className={`${cell} text-xs text-gray-500`} title={item.created_by_name ? `Created by ${item.created_by_name}` : undefined}>
                    <span className="block text-gray-700">{sourceLabel(item.source)}</span>
                    {item.created_at ? <span>{formatDate(item.created_at)}{item.created_by_name ? ` · ${item.created_by_name}` : ""}</span> : null}
                  </td>
                  <td className={`${cell} text-sm`}>
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium capitalize ${item.status === "active" ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-800"}`}>
                      {item.status}
                    </span>
                  </td>
                  <td className={`${cell} text-sm flex gap-2`}>
                    <button onClick={(e) => handleOpenEdit(item, e)} className="text-blue-600 hover:underline">Edit</button>
                    <button onClick={(e) => handleDelete(item.id, e)} disabled={item.employees_count > 0}
                      title={item.employees_count > 0 ? `${item.employees_count} employee(s) hold this designation; reassign them first` : "Delete designation"}
                      className="text-red-600 hover:underline disabled:text-gray-300 disabled:no-underline disabled:cursor-not-allowed">Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {filtered.length > pageSize && (
          <div className="flex items-center justify-between border-t border-gray-100 px-4 py-3 text-sm text-gray-600">
            <span>{(safePage - 1) * pageSize + 1}–{Math.min(safePage * pageSize, filtered.length)} of {filtered.length}</span>
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => setPage(safePage - 1)} disabled={safePage <= 1} className="rounded-lg border border-gray-200 px-3 py-1.5 hover:bg-gray-50 disabled:opacity-40">Previous</button>
              <span>Page {safePage} of {totalPages}</span>
              <button type="button" onClick={() => setPage(safePage + 1)} disabled={safePage >= totalPages} className="rounded-lg border border-gray-200 px-3 py-1.5 hover:bg-gray-50 disabled:opacity-40">Next</button>
            </div>
          </div>
        )}
      </div>

      {showDetail && detailItem && (
        <div className="fixed inset-0 bg-black/20 backdrop-blur-sm z-50 flex justify-end">
          <div className="w-full max-w-md bg-white h-full p-6 shadow-xl overflow-y-auto">
            <h2 className="text-xl font-bold mb-4">{detailItem.title}</h2>
            <div className="space-y-4 mb-6">
              <div>
                <label className="block text-sm font-medium text-gray-500">Designation Code</label>
                <p className="text-sm font-mono font-bold text-[#3B82F6]">{detailItem.designation_code || "—"}</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-500">Department</label>
                <p className="text-sm text-gray-900 font-medium">{detailItem.department_name}</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-500">Hierarchy Level</label>
                <p className="text-sm text-gray-900 font-medium">{detailItem.level}</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-500">Assigned Employee{getEmployeesForDesignation(detailItem.id).length > 1 ? "s" : ""}</label>
                <p className="text-sm text-gray-900 font-medium">{getAssignedEmployeeDisplay(detailItem.id) || "Not assigned"}</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-500">Description</label>
                <p className="text-sm text-gray-700 bg-gray-50 p-3 rounded-lg border">{detailItem.description || "N/A"}</p>
              </div>
            </div>
            <button onClick={() => setShowDetail(false)} className="w-full py-2 bg-gray-100 hover:bg-gray-200 text-gray-800 rounded-lg text-sm font-medium">Close Panel</button>
          </div>
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <form onSubmit={handleSubmit} className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="px-6 py-4 border-b border-gray-100 bg-gray-50"><h3 className="text-base font-semibold text-gray-900">{editingId ? "Edit Designation" : "Add New Designation"}</h3></div>
            <div className="p-6 space-y-4">
              {modalError && <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{modalError}</div>}
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Designation Title</label>
                <input type="text" value={formData.title} onChange={(e) => setFormData({ ...formData, title: e.target.value })} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20" required placeholder="e.g. Senior Software Engineer" />
              </div>
              {!editingId && !settings.auto_generate_codes && (
                <div>
                  <label htmlFor="designation-code" className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Designation Code</label>
                  <input id="designation-code" type="text" value={formData.designation_code || ""} maxLength={20} required
                    onChange={(e) => setFormData({ ...formData, designation_code: e.target.value.toUpperCase() })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20" placeholder="e.g. ENG-01" />
                  <p className="mt-1 text-xs text-gray-500">Automatic codes are turned off in Designation Settings.</p>
                </div>
              )}
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Department Name</label>
                <select value={formData.department_name} onChange={(e) => setFormData({ ...formData, department_name: e.target.value })} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20" required>
                  <option value="">Select Department</option>
                  {departments.length === 0 ? (
                    <option value="" disabled>No departments available. Please create a department first.</option>
                  ) : (
                    departments.map((dept) => (
                      <option key={dept.id} value={dept.name}>{dept.name}</option>
                    ))
                  )}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Hierarchy Level</label>
                  <select value={formData.level} onChange={(e) => setFormData({ ...formData, level: e.target.value })} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none" required>
                    {levelOptions.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Status</label>
                  <select value={formData.status} onChange={(e) => setFormData({ ...formData, status: e.target.value })} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none">
                    {STATUS_OPTIONS.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Assign Employee</label>
                <select value={selectedEmployeeId} onChange={(e) => setSelectedEmployeeId(e.target.value)} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20">
                  <option value="">Select employee...</option>
                  {employees.map((emp) => {
                    const eid = emp.id || emp.employee_id || emp.user_id || emp.user?.id;
                    const ename = getEmpName(emp);
                    const ecode = getEmpCode(emp);
                    return (
                      <option key={eid} value={eid}>
                        {ename ? `${ename} (${ecode})` : `#${ecode}`}
                      </option>
                    );
                  })}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Description</label>
                <textarea rows="3" value={formData.description} onChange={(e) => setFormData({ ...formData, description: e.target.value })} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none" placeholder="Brief details about responsibilities..."></textarea>
              </div>
            </div>
            <div className="px-6 py-4 bg-gray-50 border-t border-gray-100 flex justify-end gap-3">
              <button type="button" onClick={() => setShowModal(false)} className="px-4 py-2 border border-gray-200 rounded-lg text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 transition-colors">Cancel</button>
              <button type="submit" className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg text-sm font-medium transition-colors shadow-sm">Save Designation</button>
            </div>
          </form>
        </div>
      )}
    </HRPage>
  );
}