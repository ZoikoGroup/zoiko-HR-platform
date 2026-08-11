import { useState, useEffect, useMemo } from "react";
import { useNavigate, NavLink } from "react-router-dom";
import HRPage from "../../../../components/HRPage";
import EmployeeBulkActions from "../../../../components/EmployeeBulkActions";
import { getEmployees, getDepartments, getDesignations, createEmployee, updateEmployee, deleteEmployee, getEmployeeById, importEmployees, downloadImportTemplate } from "../../../../service/employee";
import { resetPassword } from "../../../../service/userService";
import { User, Edit, Trash2, Plus, Search, Filter, X, CheckCircle, AlertCircle, RefreshCw, ChevronDown, ChevronUp, Eye, UserCheck, UserX, FileText, Unlock, Upload, Download } from "lucide-react";

const NAV_ITEMS = [
  { label: "Dashboard", href: "/zoiko-hr/employee-management" },
  { label: "Employees", href: "/zoiko-hr/employee-management/employees" },
  { label: "Organization Structure", href: "/zoiko-hr/employee-management/organization" },
  { label: "Employee Lifecycle", href: "/zoiko-hr/employee-management/lifecycle" },
  { label: "Reports", href: "/zoiko-hr/employee-management/reports" },
];

function SubNav() {
  return (
    <div className="flex gap-1 overflow-x-auto pb-1 mb-6 border-b border-gray-100">
      {NAV_ITEMS.map((item) => (
        <NavLink key={item.href} to={item.href} end={item.href === "/zoiko-hr/employee-management"}
          className={({ isActive }) =>
            `whitespace-nowrap px-3 py-2 text-sm font-medium rounded-t-lg transition-colors ${isActive ? "text-blue-600 border-b-2 border-blue-600 bg-blue-50/50" : "text-gray-500 hover:text-gray-700 hover:bg-gray-50"}`
          }>
          {item.label}
        </NavLink>
      ))}
    </div>
  );
}

const STATUS_COLORS = {
  active: "bg-green-100 text-green-800",
  inactive: "bg-red-100 text-red-800",
  on_leave: "bg-yellow-100 text-yellow-800",
  terminated: "bg-gray-100 text-gray-800",
  resigned: "bg-orange-100 text-orange-800",
};

const STATUS_OPTIONS = [
  { value: "active", label: "Active" },
  { value: "inactive", label: "Inactive" },
  { value: "on_leave", label: "On Leave" },
  { value: "terminated", label: "Terminated" },
  { value: "resigned", label: "Resigned" },
];

const EMPLOYMENT_TYPE_OPTIONS = [
  { value: "full_time", label: "Full Time" },
  { value: "part_time", label: "Part Time" },
  { value: "contract", label: "Contract" },
  { value: "intern", label: "Intern" },
  { value: "probation", label: "Probation" },
];

const DEPARTMENT_COLORS = [
  "bg-blue-500", "bg-green-500", "bg-purple-500", "bg-orange-500",
  "bg-red-500", "bg-teal-500", "bg-cyan-500", "bg-indigo-500",
];

const ITEMS_PER_PAGE = 10;

const initialForm = {
  first_name: "",
  last_name: "",
  email: "",
  password: "",
  phone: "",
  job_title: "",
  employment_type: "full_time",
  status: "active",
  department_id: "",
  designation_id: "",
  reporting_manager_id: "",
  basic_salary: "",
  ctc: "",
  date_of_joining: "",
  confirmation_date: "",
  work_email: "",
  personal_email: "",
  company: "",
  business_unit: "",
  division: "",
  team: "",
  current_address: "",
  permanent_address: "",
  city: "",
  state: "",
  country: "",
  pincode: "",
  address: "",
};

export default function Employees() {
  const navigate = useNavigate();
  const [employees, setEmployees] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [departmentFilter, setDepartmentFilter] = useState("");
  const [employmentTypeFilter, setEmploymentTypeFilter] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [showModal, setShowModal] = useState(false);
  const [editId, setEditId] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [formData, setFormData] = useState({ ...initialForm });
  const [formErrors, setFormErrors] = useState({});
  const [expandedId, setExpandedId] = useState(null);
  const [exporting, setExporting] = useState(false);
  const [deptList, setDeptList] = useState([]);
  const [desigList, setDesigList] = useState([]);
  const [managerList, setManagerList] = useState([]);
  const [resetPwdResult, setResetPwdResult] = useState(null);
  const [showResetPwd, setShowResetPwd] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [importFile, setImportFile] = useState(null);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState(null);

  const fetchEmployees = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getEmployees({
        page: currentPage,
        per_page: ITEMS_PER_PAGE,
        search: search,
        status: statusFilter,
        department_id: departmentFilter,
        employment_type: employmentTypeFilter,
      });
      setEmployees(data.items || []);
      setTotal(data.total || 0);
    } catch (err) {
      setError(err.message || "Failed to load employees");
      setEmployees([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEmployees();
  }, [currentPage, search, statusFilter, departmentFilter, employmentTypeFilter]);

  const fetchDropdownData = async () => {
    const [depts, desigs, managers] = await Promise.allSettled([
      getDepartments(),
      getDesignations(),
      getEmployees({ per_page: 1000 }),
    ]);
    if (depts.status === "fulfilled") setDeptList(Array.isArray(depts.value) ? depts.value : depts.value?.items || depts.value?.data || []);
    if (desigs.status === "fulfilled") setDesigList(Array.isArray(desigs.value) ? desigs.value : desigs.value?.items || desigs.value?.data || []);
    if (managers.status === "fulfilled") setManagerList(managers.value.items || []);
  };

  useEffect(() => {
    fetchDropdownData();
  }, []);

  const departments = useMemo(() => {
    return deptList.map((d) => ({ id: d.id, name: d.name }));
  }, [deptList]);

  const totalPages = Math.max(1, Math.ceil(total / ITEMS_PER_PAGE));
  const safePage = Math.min(currentPage, totalPages);

  useEffect(() => {
    if (currentPage > totalPages) setCurrentPage(totalPages);
  }, [totalPages, currentPage]);

  const resetForm = () => {
    setFormData({ ...initialForm });
    setFormErrors({});
    setEditId(null);
  };

  const formatVal = (val) => (val !== null && val !== undefined && val !== "") ? val : "N/A";
  const fmtDate = (d) => {
    if (!d) return "N/A";
    const dt = new Date(d);
    if (isNaN(dt.getTime())) return d;
    return dt.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
  };

  const openCreate = () => {
    resetForm();
    setShowModal(true);
  };

  const openView = (id) => {
    navigate(`/zoiko-hr/employee-management/employees/${id}`);
  };

  const openEdit = async (employee) => {
    setEditId(employee.id);
    try {
      const fullEmployee = await getEmployeeById(employee.id);
      const fe = fullEmployee;
      setFormData({
        first_name: fe.firstName || fe.first_name || "",
        last_name: fe.lastName || fe.last_name || "",
        email: fe.email || "",
        password: "",
        phone: fe.phone || "",
        job_title: fe.jobTitle || fe.job_title || "",
        employment_type: fe.employmentType || fe.employment_type || "full_time",
        status: fe.status || "active",
        department_id: fe.departmentId || fe.department_id ? String(fe.departmentId || fe.department_id) : "",
        designation_id: fe.designationId || fe.designation_id ? String(fe.designationId || fe.designation_id) : "",
        reporting_manager_id: fe.reportingManagerId || fe.reporting_manager_id ? String(fe.reportingManagerId || fe.reporting_manager_id) : "",
        basic_salary: fe.basicSalary || fe.basic_salary ? String(fe.basicSalary || fe.basic_salary) : "",
        ctc: fe.ctc ? String(fe.ctc) : "",
        date_of_joining: fe.dateOfJoining || fe.date_of_joining || "",
        confirmation_date: fe.confirmationDate || fe.confirmation_date || "",
        work_email: fe.workEmail || fe.work_email || "",
        personal_email: fe.personalEmail || fe.personal_email || "",
        company: fe.company || "",
        business_unit: fe.businessUnit || fe.business_unit || "",
        division: fe.division || "",
        team: fe.team || "",
        current_address: fe.currentAddress || fe.current_address || "",
        permanent_address: fe.permanentAddress || fe.permanent_address || "",
        city: fe.city || "",
        state: fe.state || "",
        country: fe.country || "",
        pincode: fe.pincode || "",
        address: fullEmployee.address || "",
      });
    } catch (err) {
      setFormErrors({ submit: err.message || "Failed to load employee details" });
    }
    setFormErrors({});
    setShowModal(true);
  };

  const validate = () => {
    const errors = {};
    if (!formData.first_name.trim()) errors.first_name = "First name is required";
    if (!formData.last_name.trim()) errors.last_name = "Last name is required";
    if (!formData.email.trim()) errors.email = "Email is required";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) errors.email = "Invalid email";
    if (!formData.job_title.trim()) errors.job_title = "Job title is required";
    if (!formData.password && !editId) errors.password = "Password is required for new employees";
    if (formData.password && formData.password.length < 8) errors.password = "Password must be at least 8 characters";
    if (!formData.date_of_joining && !editId) errors.date_of_joining = "Date of joining is required";
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validate()) return;
    setSubmitting(true);
    try {
      const payload = {
        first_name: formData.first_name.trim(),
        last_name: formData.last_name.trim(),
        email: formData.email.trim(),
        password: formData.password || undefined,
        phone: formData.phone.trim() || null,
        job_title: formData.job_title.trim(),
        employment_type: formData.employment_type,
        status: formData.status,
        department_id: formData.department_id ? Number(formData.department_id) : null,
        designation_id: formData.designation_id ? Number(formData.designation_id) : null,
        reporting_manager_id: formData.reporting_manager_id ? Number(formData.reporting_manager_id) : null,
        basic_salary: formData.basic_salary ? Number(formData.basic_salary) : null,
        ctc: formData.ctc ? Number(formData.ctc) : null,
        date_of_joining: formData.date_of_joining || null,
        confirmation_date: formData.confirmation_date || null,
        work_email: formData.work_email.trim() || null,
        personal_email: formData.personal_email.trim() || null,
        company: formData.company.trim() || null,
        business_unit: formData.business_unit.trim() || null,
        division: formData.division.trim() || null,
        team: formData.team.trim() || null,
        current_address: formData.current_address.trim() || null,
        permanent_address: formData.permanent_address.trim() || null,
        city: formData.city.trim() || null,
        state: formData.state.trim() || null,
        country: formData.country.trim() || null,
        pincode: formData.pincode.trim() || null,
        address: formData.address.trim() || null,
      };
      if (editId) {
        await updateEmployee(editId, payload);
      } else {
        await createEmployee(payload);
      }
      setShowModal(false);
      resetForm();
      await fetchEmployees();
    } catch (err) {
      setFormErrors({ submit: err.message || "Failed to save employee" });
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id, status) => {
    const isActive = status === "active";
    if (!window.confirm(isActive ? "Deactivate this employee? They will be marked as terminated." : "Delete this employee? This action cannot be undone.")) return;
    try {
      await deleteEmployee(id);
      setError(null);
      await fetchEmployees();
    } catch (err) {
      setError(err.message || "Failed to delete employee");
    }
  };

  const handleResetPassword = async (id) => {
    if (!window.confirm("Reset password for this employee? A new temporary password will be generated.")) return;
    try {
      const res = await resetPassword(id);
      setResetPwdResult(res.temporary_password || null);
      setShowResetPwd(true);
    } catch (err) {
      setError(err.response?.data?.detail || err.message || "Failed to reset password");
    }
  };

  const handleExport = () => {
    setExporting(true);
    try {
      const headers = ["Employee ID", "Employee Code", "First Name", "Last Name", "Email", "Phone", "Job Title", "Department", "Employment Type", "Status", "Joining Date", "Basic Salary"];
      const rows = employees.map((e) => [
        e.employeeId || e.employee_id || "",
        e.employeeCode || e.employee_code || "",
        e.firstName || e.first_name || "",
        e.lastName || e.last_name || "",
        e.email || "",
        e.phone || "",
        e.jobTitle || e.job_title || "",
        e.departmentName || e.department?.name || "",
        EMPLOYMENT_TYPE_OPTIONS.find((opt) => opt.value === (e.employmentType || e.employment_type))?.label || e.employmentType || e.employment_type || "",
        STATUS_OPTIONS.find((opt) => opt.value === e.status)?.label || e.status || "",
        e.dateOfJoining || e.date_of_joining || "",
        e.basicSalary || e.basic_salary || "",
      ]);
      const csv = [headers.join(","), ...rows.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","))].join("\n");
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `employees-export-${new Date().toISOString().split("T")[0]}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err.message || "Failed to export employees");
    } finally {
      setExporting(false);
    }
  };

  const handleImport = async () => {
    if (!importFile) return;
    setImporting(true);
    setImportResult(null);
    try {
      const result = await importEmployees(importFile);
      setImportResult(result);
      await fetchEmployees();
    } catch (err) {
      setError(err.message || "Import failed");
      setShowImportModal(false);
    } finally {
      setImporting(false);
      setImportFile(null);
    }
  };

  const handleDownloadTemplate = async () => {
    try {
      await downloadImportTemplate();
    } catch (err) {
      setError(err.message || "Failed to download template");
    }
  };

  const handleDownloadErrorReport = () => {
    if (!importResult?.errors?.length) return;
    const headers = ["Row", "Employee ID", "Email", "Field", "Error"];
    const rows = importResult.errors.map((e) => [e.row, e.employee_id || "", e.email || "", e.field || "", e.error]);
    const csv = [headers.join(","), ...rows.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","))].join("\n");
    const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `import-errors-${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleBulkImport = async () => {
    await fetchEmployees();
  };

  const stats = useMemo(() => {
    const total = employees.length;
    const active = employees.filter((e) => e.status === "active").length;
    const onLeave = employees.filter((e) => e.status === "on_leave").length;
    const resigned = employees.filter((e) => e.status === "resigned").length;
    const terminated = employees.filter((e) => e.status === "terminated").length;
    const inactive = employees.filter((e) => e.status === "inactive").length;
    return { total, active, onLeave, resigned, terminated, inactive };
  }, [employees]);

  if (loading && employees.length === 0) {
    return (
      <HRPage title="Employees" subtitle="Manage employee directory and records.">
        <SubNav />
        <div className="flex justify-center items-center py-20">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          <span className="ml-3 text-gray-500">Loading employees...</span>
        </div>
      </HRPage>
    );
  }

  return (
    <HRPage title="Employees" subtitle="Manage employee directory and records.">
      <SubNav />

      {error && (
        <div className="mb-4 px-4 py-3 bg-red-50 border border-red-200 text-red-700 rounded-lg flex justify-between items-center">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="text-red-500 hover:text-red-700 font-bold">&times;</button>
        </div>
      )}

      <div className="space-y-6">
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm px-3 py-2">
            <p className="text-xs text-gray-400">Total</p>
            <p className="text-lg font-bold text-gray-800">{stats.total}</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm px-3 py-2">
            <p className="text-xs text-gray-400">Active</p>
            <p className="text-lg font-bold text-green-600">{stats.active}</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm px-3 py-2">
            <p className="text-xs text-gray-400">On Leave</p>
            <p className="text-lg font-bold text-yellow-600">{stats.onLeave}</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm px-3 py-2">
            <p className="text-xs text-gray-400">Inactive</p>
            <p className="text-lg font-bold text-red-600">{stats.inactive}</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm px-3 py-2">
            <p className="text-xs text-gray-400">Resigned</p>
            <p className="text-lg font-bold text-orange-600">{stats.resigned || 0}</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm px-3 py-2">
            <p className="text-xs text-gray-400">Terminated</p>
            <p className="text-lg font-bold text-gray-600">{stats.terminated || 0}</p>
          </div>
        </div>

        <div className="flex flex-wrap justify-between items-center gap-4">
          <div className="flex flex-wrap gap-3">
            <div className="relative">
              <input
                type="text"
                placeholder="Search by name, email, Employee ID, code..."
                value={search}
                onChange={(e) => { setSearch(e.target.value); setCurrentPage(1); }}
                className="border border-gray-200 rounded-lg px-3 py-2 text-sm w-56 focus:outline-none focus:ring-2 focus:ring-blue-500 pl-8"
              />
              <Search className="absolute left-2 top-2.5 w-4 h-4 text-gray-400" />
            </div>
            <div className="relative">
              <select
                value={statusFilter}
                onChange={(e) => { setStatusFilter(e.target.value); setCurrentPage(1); }}
                className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 appearance-none pr-8"
              >
                <option value="">All Statuses</option>
                {STATUS_OPTIONS.map((s) => (
                  <option key={s.value} value={s.value}>{s.label}</option>
                ))}
              </select>
              <ChevronDown className="absolute right-2 top-2.5 w-4 h-4 text-gray-400" />
            </div>
            <div className="relative">
              <select
                value={departmentFilter}
                onChange={(e) => { setDepartmentFilter(e.target.value); setCurrentPage(1); }}
                className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 appearance-none pr-8"
              >
                <option value="">All Departments</option>
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>{d.name || `Dept #${d.id}`}</option>
                ))}
              </select>
              <ChevronDown className="absolute right-2 top-2.5 w-4 h-4 text-gray-400" />
            </div>
            <div className="relative">
              <select
                value={employmentTypeFilter}
                onChange={(e) => { setEmploymentTypeFilter(e.target.value); setCurrentPage(1); }}
                className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 appearance-none pr-8"
              >
                <option value="">All Types</option>
                {EMPLOYMENT_TYPE_OPTIONS.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
              <ChevronDown className="absolute right-2 top-2.5 w-4 h-4 text-gray-400" />
            </div>
          </div>
          <div className="flex gap-2">
            <EmployeeBulkActions
              employees={employees}
              onImport={handleBulkImport}
            />
            <button onClick={openCreate} className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors flex items-center gap-2">
              <Plus className="w-4 h-4" /> Add Employee
            </button>
          </div>
        </div>

        {employees.length === 0 && !loading ? (
          <div className="text-center py-16 bg-white rounded-xl border border-gray-100 shadow-sm">
            <p className="text-gray-500 font-medium">
              {employees.length === 0 ? "No employees found yet." : "No employees match your search."}
            </p>
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-100">
                  <tr>
                    <th className="w-8 px-2 py-3"></th>
                    <th className="text-left px-3 py-3 font-semibold text-gray-600">Employee ID</th>
                    <th className="text-left px-3 py-3 font-semibold text-gray-600">Employee Name</th>
                    <th className="text-left px-3 py-3 font-semibold text-gray-600">Email</th>
                    <th className="text-left px-3 py-3 font-semibold text-gray-600">Position</th>
                    <th className="text-left px-3 py-3 font-semibold text-gray-600">Department</th>
                    <th className="text-left px-3 py-3 font-semibold text-gray-600">Type</th>
                    <th className="text-left px-3 py-3 font-semibold text-gray-600">Status</th>
                    <th className="text-left px-3 py-3 font-semibold text-gray-600">Joined</th>
                    <th className="text-right px-3 py-3 font-semibold text-gray-600">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {employees.map((e) => (
                    <tr key={e.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-2 py-3">
                        <button
                          onClick={() => setExpandedId(expandedId === e.id ? null : e.id)}
                          className="text-gray-400 hover:text-gray-600 text-xs"
                        >
                          {expandedId === e.id ? "▼" : "▶"}
                        </button>
                      </td>
                      <td className="px-3 py-3">
                        <span className="text-xs font-mono font-bold text-indigo-600 bg-indigo-50 px-2 py-1 rounded-md">{e.employeeId || e.employee_id}</span>
                      </td>
                      <td className="px-3 py-3">
                        <p className="text-sm font-medium text-gray-900">{(e.firstName || e.first_name)
                          ? `${e.firstName || e.first_name} ${e.lastName || e.last_name || ""}`.trim()
                          : e.employeeCode || e.employee_code || "N/A"}</p>
                      </td>
                      <td className="px-3 py-3">
                        <p className="text-sm text-gray-700">{e.email}</p>
                        <p className="text-xs text-gray-500">{e.phone}</p>
                      </td>
                      <td className="px-3 py-3">
                        <p className="text-sm text-gray-700 font-medium">{e.jobTitle || e.job_title}</p>
                      </td>
                      <td className="px-3 py-3">
                        <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${DEPARTMENT_COLORS[(e.departmentId || e.department_id || 0) % DEPARTMENT_COLORS.length]} text-white`}>{e.departmentName || e.department?.name || "-"}</span>
                      </td>
                      <td className="px-3 py-3">
                        <span className="text-xs text-gray-600">{EMPLOYMENT_TYPE_OPTIONS.find((opt) => opt.value === (e.employmentType || e.employment_type))?.label || e.employmentType || e.employment_type}</span>
                      </td>
                      <td className="px-3 py-3">
                        <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[e.status] || ""}`}>{STATUS_OPTIONS.find((opt) => opt.value === e.status)?.label || e.status}</span>
                      </td>
                      <td className="px-3 py-3">
                        <p className="text-xs text-gray-500">{(e.dateOfJoining || e.date_of_joining) ? new Date(e.dateOfJoining || e.date_of_joining).toLocaleDateString() : "-"}</p>
                      </td>
                      <td className="px-3 py-3 text-right">
                        <div className="flex items-center justify-end gap-1 flex-wrap">
                          <button onClick={() => openView(e.id)} className="text-blue-600 hover:text-blue-800 text-xs font-medium px-1" title="View">
                            <Eye className="w-3.5 h-3.5" />
                          </button>
                          <button onClick={() => openEdit(e)} className="text-green-600 hover:text-green-800 text-xs font-medium px-1" title="Edit">
                            <Edit className="w-3.5 h-3.5" />
                          </button>
                          <button onClick={() => handleResetPassword(e.id)} className="text-orange-500 hover:text-orange-700 text-xs font-medium px-1" title="Reset Password">
                            <Unlock className="w-3.5 h-3.5" />
                          </button>
                          {e.status === "active" && (
                            <button onClick={() => handleDelete(e.id, e.status)} className="text-red-400 hover:text-red-600 text-xs px-1" title="Deactivate">
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                          {e.status !== "active" && (
                            <button onClick={() => handleDelete(e.id, e.status)} className="text-red-400 hover:text-red-600 text-xs px-1" title="Delete">
                              <X className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {totalPages > 1 && (
              <div className="flex justify-between items-center px-6 py-3 border-t border-gray-100">
                <span className="text-xs text-gray-400">Page {safePage} of {totalPages}</span>
                <div className="flex gap-1">
                  <button onClick={() => setCurrentPage((p) => Math.max(1, p - 1))} disabled={safePage <= 1} className="px-3 py-1 text-xs border border-gray-200 rounded disabled:opacity-40 hover:bg-gray-50">Prev</button>
                  {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
                    <button key={p} onClick={() => setCurrentPage(p)} className={`px-3 py-1 text-xs border rounded ${p === safePage ? "bg-blue-600 text-white border-blue-600" : "border-gray-200 hover:bg-gray-50"}`}>{p}</button>
                  ))}
                  <button onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))} disabled={safePage >= totalPages} className="px-3 py-1 text-xs border border-gray-200 rounded disabled:opacity-40 hover:bg-gray-50">Next</button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl mx-4 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center px-6 py-4 border-b border-gray-100">
              <h2 className="text-lg font-bold text-gray-800">{editId ? "Edit Employee" : "Add New Employee"}</h2>
              <button onClick={() => { setShowModal(false); resetForm(); }} className="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              {formErrors.submit && <div className="text-red-500 text-sm bg-red-50 p-2 rounded">{formErrors.submit}</div>}

              <h3 className="text-sm font-semibold text-gray-800 border-b pb-1">Identity</h3>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">First Name *</label>
                  <input type="text" value={formData.first_name} onChange={(e) => setFormData({ ...formData, first_name: e.target.value })} className={`w-full border ${formErrors.first_name ? "border-red-300" : "border-gray-200"} rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500`} />
                  {formErrors.first_name && <p className="text-red-500 text-xs mt-1">{formErrors.first_name}</p>}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Last Name *</label>
                  <input type="text" value={formData.last_name} onChange={(e) => setFormData({ ...formData, last_name: e.target.value })} className={`w-full border ${formErrors.last_name ? "border-red-300" : "border-gray-200"} rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500`} />
                  {formErrors.last_name && <p className="text-red-500 text-xs mt-1">{formErrors.last_name}</p>}
                </div>
              </div>

              <h3 className="text-sm font-semibold text-gray-800 border-b pb-1">Contact</h3>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Email (Login) *</label>
                  <input type="email" value={formData.email} onChange={(e) => setFormData({ ...formData, email: e.target.value })} className={`w-full border ${formErrors.email ? "border-red-300" : "border-gray-200"} rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500`} />
                  {formErrors.email && <p className="text-red-500 text-xs mt-1">{formErrors.email}</p>}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Work Email</label>
                  <input type="email" value={formData.work_email} onChange={(e) => setFormData({ ...formData, work_email: e.target.value })} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Personal Email</label>
                  <input type="email" value={formData.personal_email} onChange={(e) => setFormData({ ...formData, personal_email: e.target.value })} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
                  <input type="text" value={formData.phone} onChange={(e) => setFormData({ ...formData, phone: e.target.value })} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
              </div>

              <h3 className="text-sm font-semibold text-gray-800 border-b pb-1">Employment</h3>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Job Title *</label>
                  <input type="text" value={formData.job_title} onChange={(e) => setFormData({ ...formData, job_title: e.target.value })} className={`w-full border ${formErrors.job_title ? "border-red-300" : "border-gray-200"} rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500`} />
                  {formErrors.job_title && <p className="text-red-500 text-xs mt-1">{formErrors.job_title}</p>}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Employment Type</label>
                  <select value={formData.employment_type} onChange={(e) => setFormData({ ...formData, employment_type: e.target.value })} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                    {EMPLOYMENT_TYPE_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
                  <select value={formData.status} onChange={(e) => setFormData({ ...formData, status: e.target.value })} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                    {STATUS_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Department</label>
                  <select value={formData.department_id} onChange={(e) => setFormData({ ...formData, department_id: e.target.value })} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                    <option value="">Select Department</option>
                    {deptList.map((d) => (
                      <option key={d.id} value={d.id}>{d.name}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Designation</label>
                  <select value={formData.designation_id} onChange={(e) => setFormData({ ...formData, designation_id: e.target.value })} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                    <option value="">Select Designation</option>
                    {desigList.map((d) => (
                      <option key={d.id} value={d.id}>{d.title}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Reporting Manager</label>
                  <select value={formData.reporting_manager_id} onChange={(e) => setFormData({ ...formData, reporting_manager_id: e.target.value })} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                    <option value="">None</option>
                    {managerList.filter((m) => m.id !== editId).map((m) => (
                      <option key={m.id} value={m.id}>{m.first_name} {m.last_name} ({m.employee_code})</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Joining Date</label>
                  <input type="date" value={formData.date_of_joining} onChange={(e) => setFormData({ ...formData, date_of_joining: e.target.value })} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Confirmation Date</label>
                  <input type="date" value={formData.confirmation_date} onChange={(e) => setFormData({ ...formData, confirmation_date: e.target.value })} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
              </div>

              <h3 className="text-sm font-semibold text-gray-800 border-b pb-1">Organization</h3>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Company</label>
                  <input type="text" value={formData.company} onChange={(e) => setFormData({ ...formData, company: e.target.value })} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Business Unit</label>
                  <input type="text" value={formData.business_unit} onChange={(e) => setFormData({ ...formData, business_unit: e.target.value })} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Division</label>
                  <input type="text" value={formData.division} onChange={(e) => setFormData({ ...formData, division: e.target.value })} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Team</label>
                  <input type="text" value={formData.team} onChange={(e) => setFormData({ ...formData, team: e.target.value })} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
              </div>

              <h3 className="text-sm font-semibold text-gray-800 border-b pb-1">Compensation</h3>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Basic Salary</label>
                  <input type="number" min="0" step="0.01" value={formData.basic_salary} onChange={(e) => setFormData({ ...formData, basic_salary: e.target.value })} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">CTC</label>
                  <input type="number" min="0" step="0.01" value={formData.ctc} onChange={(e) => setFormData({ ...formData, ctc: e.target.value })} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
              </div>

              <h3 className="text-sm font-semibold text-gray-800 border-b pb-1">Address</h3>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Current Address</label>
                  <textarea rows={2} value={formData.current_address} onChange={(e) => setFormData({ ...formData, current_address: e.target.value })} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Permanent Address</label>
                  <textarea rows={2} value={formData.permanent_address} onChange={(e) => setFormData({ ...formData, permanent_address: e.target.value })} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
              </div>
              <div className="grid grid-cols-4 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">City</label>
                  <input type="text" value={formData.city} onChange={(e) => setFormData({ ...formData, city: e.target.value })} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">State</label>
                  <input type="text" value={formData.state} onChange={(e) => setFormData({ ...formData, state: e.target.value })} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Country</label>
                  <input type="text" value={formData.country} onChange={(e) => setFormData({ ...formData, country: e.target.value })} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Pincode</label>
                  <input type="text" value={formData.pincode} onChange={(e) => setFormData({ ...formData, pincode: e.target.value })} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
              </div>

              {!editId && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Password *</label>
                  <input type="password" value={formData.password} onChange={(e) => setFormData({ ...formData, password: e.target.value })} className={`w-full border ${formErrors.password ? "border-red-300" : "border-gray-200"} rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500`} />
                  {formErrors.password && <p className="text-red-500 text-xs mt-1">{formErrors.password}</p>}
                </div>
              )}
              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={() => { setShowModal(false); resetForm(); }} className="px-4 py-2 text-sm border border-gray-200 rounded-lg hover:bg-gray-50">Cancel</button>
                <button type="submit" disabled={submitting} className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white rounded-lg font-medium transition-colors">
                  {submitting ? "Saving..." : editId ? "Update" : "Create"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showResetPwd && resetPwdResult && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4 p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center">
                <CheckCircle className="w-6 h-6 text-green-600" />
              </div>
              <h2 className="text-lg font-semibold text-slate-800">Password Reset Successful</h2>
            </div>
            <p className="text-sm text-slate-600 mb-4">
              Temporary password generated. Share it with the employee.
            </p>
            <div className="bg-slate-50 border border-slate-200 rounded-lg px-4 py-3 mb-4">
              <code className="text-sm font-mono font-bold text-slate-800">{resetPwdResult}</code>
            </div>
            <div className="flex justify-end">
              <button
                onClick={() => { setShowResetPwd(false); setResetPwdResult(null); }}
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {showImportModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg mx-4 p-6">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-bold text-gray-800">Import Employees</h2>
              <button onClick={() => { setShowImportModal(false); setImportFile(null); }} className="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
            </div>

            <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-700">
              Upload an Excel (.xlsx, .xls) or CSV file with employee records. Columns are auto-mapped by header name.
            </div>

            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">Choose File</label>
              <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center hover:border-blue-400 transition-colors cursor-pointer" onClick={() => document.getElementById("import-file-input")?.click()}>
                {importFile ? (
                  <div>
                    <CheckCircle className="w-8 h-8 text-green-500 mx-auto mb-2" />
                    <p className="text-sm font-medium text-gray-700">{importFile.name}</p>
                    <p className="text-xs text-gray-500">{(importFile.size / 1024).toFixed(1)} KB</p>
                  </div>
                ) : (
                  <div>
                    <Upload className="w-8 h-8 text-gray-400 mx-auto mb-2" />
                    <p className="text-sm text-gray-500">Click to select or drag & drop a file</p>
                    <p className="text-xs text-gray-400 mt-1">.xlsx, .xls, or .csv</p>
                  </div>
                )}
              </div>
              <input id="import-file-input" type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={(e) => setImportFile(e.target.files[0] || null)} />
            </div>

            <div className="flex justify-between items-center">
              <button onClick={handleDownloadTemplate} className="text-blue-600 hover:text-blue-800 text-sm font-medium flex items-center gap-1">
                <Download className="w-4 h-4" /> Download Template
              </button>
              <div className="flex gap-2">
                <button onClick={() => { setShowImportModal(false); setImportFile(null); }} className="px-4 py-2 text-sm border border-gray-200 rounded-lg hover:bg-gray-50">Cancel</button>
                <button onClick={handleImport} disabled={!importFile || importing} className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white rounded-lg font-medium transition-colors">
                  {importing ? "Importing..." : "Import"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {importResult && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg mx-4 p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className={`w-10 h-10 rounded-full flex items-center justify-center ${importResult.failed > 0 ? "bg-yellow-100" : "bg-green-100"}`}>
                {importResult.failed > 0 ? <AlertCircle className="w-6 h-6 text-yellow-600" /> : <CheckCircle className="w-6 h-6 text-green-600" />}
              </div>
              <h2 className="text-lg font-semibold text-slate-800">Import Complete</h2>
            </div>

            <div className="grid grid-cols-3 gap-2 mb-4">
              <div className="bg-gray-50 rounded-lg p-2 text-center">
                <p className="text-xl font-bold text-gray-800">{importResult.total_rows}</p>
                <p className="text-xs text-gray-500">Total Rows</p>
              </div>
              <div className="bg-green-50 rounded-lg p-2 text-center">
                <p className="text-xl font-bold text-green-600">{importResult.created}</p>
                <p className="text-xs text-gray-500">Employees Created</p>
              </div>
              <div className="bg-blue-50 rounded-lg p-2 text-center">
                <p className="text-xl font-bold text-blue-600">{importResult.updated}</p>
                <p className="text-xs text-gray-500">Updated</p>
              </div>
              <div className="bg-purple-50 rounded-lg p-2 text-center">
                <p className="text-xl font-bold text-purple-600">{importResult.departments_created || 0}</p>
                <p className="text-xs text-gray-500">Departments Created</p>
              </div>
              <div className="bg-indigo-50 rounded-lg p-2 text-center">
                <p className="text-xl font-bold text-indigo-600">{importResult.designations_created || 0}</p>
                <p className="text-xs text-gray-500">Designations Created</p>
              </div>
              <div className="bg-yellow-50 rounded-lg p-2 text-center">
                <p className="text-xl font-bold text-yellow-600">{importResult.skipped + importResult.failed}</p>
                <p className="text-xs text-gray-500">Skipped / Failed</p>
              </div>
            </div>

            {importResult.errors?.length > 0 && (
              <div className="mb-4">
                <div className="flex justify-between items-center mb-2">
                  <p className="text-sm font-medium text-red-600">{importResult.errors.length} error(s) found</p>
                  <button onClick={handleDownloadErrorReport} className="text-blue-600 hover:text-blue-800 text-xs font-medium flex items-center gap-1">
                    <Download className="w-3 h-3" /> Download Error Report
                  </button>
                </div>
                <div className="max-h-32 overflow-y-auto bg-red-50 border border-red-200 rounded-lg p-2">
                  {importResult.errors.slice(0, 20).map((err, i) => (
                    <p key={i} className="text-xs text-red-700 mb-1">Row {err.row}{err.field ? ` (${err.field})` : ""}: {err.error}</p>
                  ))}
                  {importResult.errors.length > 20 && (
                    <p className="text-xs text-gray-500 mt-1">...and {importResult.errors.length - 20} more errors</p>
                  )}
                </div>
              </div>
            )}

            <div className="flex justify-end">
              <button onClick={() => setImportResult(null)} className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium">
                Done
              </button>
            </div>
          </div>
        </div>
      )}

    </HRPage>
  );
}
