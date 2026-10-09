import { realEmailError } from "../../utils/realEmail";
import { useState, useMemo, useRef, useEffect, useCallback } from "react";
import { useAuth } from "../../context/AuthContext";
import { importEmployees, getEmployees, hardDeleteEmployee, bulkHardDeleteEmployees } from "../../service/employee";
import { resolveEmployeeDisplayStatus } from "../../utils/employeeStatus";
import { phoneError, PHONE_MAX_LENGTH } from "../../utils/phone";
import { createUser, resetPassword, updateUser, deactivateUser, activateUser, archiveUser, getAssignableRoles, getUser } from "../../service/userService";
import {
  Users,
  UserCheck,
  UserX,
  Search,
  Plus,
  Mail,
  Pencil,
  Trash2,
  Ban,
  Archive,
  Lock,
  CircleCheck,
  Upload,
  Download,
  FileDown,
  X,
  CircleAlert,
  Loader2,
  ChevronDown,
  Eye,
  EyeOff,
} from "lucide-react";

const COLUMNS = [
  { key: "first_name", label: "First Name", required: true },
  { key: "last_name", label: "Last Name", required: true },
  { key: "email", label: "Email", required: true },
  { key: "password", label: "Password", required: false },
  { key: "phone", label: "Phone", required: false },
  { key: "job_title", label: "Job Title", required: true },
  { key: "department", label: "Department", required: true },
  { key: "designation", label: "Designation", required: false },
  { key: "reporting_manager", label: "Reporting Manager", required: false },
  { key: "employment_type", label: "Employment Type", required: true },
  { key: "status", label: "Status", required: true },
  { key: "date_of_joining", label: "Date of Joining", required: true },
  { key: "date_of_birth", label: "Date of Birth", required: false },
  { key: "gender", label: "Gender", required: false },
  { key: "basic_salary", label: "Basic Salary", required: false },
  { key: "ctc", label: "CTC", required: false },
  { key: "work_email", label: "Work Email", required: false },
  { key: "personal_email", label: "Personal Email", required: false },
  { key: "confirmation_date", label: "Confirmation Date", required: false },
  { key: "company", label: "Company", required: false },
  { key: "business_unit", label: "Business Unit", required: false },
  { key: "division", label: "Division", required: false },
  { key: "team", label: "Team", required: false },
  { key: "current_address", label: "Current Address", required: false },
  { key: "permanent_address", label: "Permanent Address", required: false },
  { key: "city", label: "City", required: false },
  { key: "state", label: "State", required: false },
  { key: "country", label: "Country", required: false },
  { key: "pincode", label: "Pincode", required: false },
  { key: "address", label: "Address", required: false },
];

const REQUIRED_COLUMNS = COLUMNS.filter((c) => c.required)
  .map((c) => c.label)
  .join(", ");

function toCSV(rows) {
  const header = COLUMNS.map((c) => c.label).join(",");
  const lines = rows.map((row) =>
    COLUMNS.map((c) => {
      const val = String(row[c.key] ?? "");
      return val.includes(",") || val.includes('"')
        ? `"${val.replace(/"/g, '""')}"`
        : val;
    }).join(",")
  );
  return [header, ...lines].join("\n");
}

function downloadFile(content, filename, mime = "text/csv;charset=utf-8;") {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

const ROLE_DISPLAY_LABELS = {
  super_admin: "Super Admin",
  admin: "Admin",
  hr_admin: "HR Admin",
  billing_admin: "Billing Admin",
  manager: "Manager",
  employee: "Employee",
};

function initials(name) {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

const EMPLOYMENT_TYPES = [["full_time", "Full time"], ["part_time", "Part time"], ["contract", "Contract"], ["intern", "Intern"], ["probation", "Probation"]];
const GENDERS = [["male", "Male"], ["female", "Female"], ["other", "Other"]];
const ADD_STATUSES = [["active", "Active"], ["pending", "Pending"], ["inactive", "Inactive"]];

// Mirrors the bulk-import columns, so adding one person captures the same information.
const ADD_USER_SECTIONS = [
  { title: "Account", fields: [
    { name: "first_name", label: "First name", required: true, placeholder: "John" },
    { name: "last_name", label: "Last name", required: true, placeholder: "Doe" },
    { name: "email", label: "Email", required: true, type: "email", placeholder: "john.doe@company.com" },
    { name: "phone", label: "Phone", type: "tel", placeholder: "+91 9876543210" },
    { name: "role", label: "Role", required: true },
    { name: "job_title", label: "Job title", required: true, placeholder: "Software Engineer" },
  ] },
  { title: "Employment", fields: [
    { name: "date_of_joining", label: "Date of joining", required: true, type: "date" },
    { name: "employment_type", label: "Employment type", options: EMPLOYMENT_TYPES, blank: "Full time (default)" },
    { name: "status", label: "Status", options: ADD_STATUSES, blank: "Active (default)" },
    { name: "confirmation_date", label: "Confirmation date", type: "date" },
    { name: "department_name", label: "Department", placeholder: "Created if new" },
    { name: "designation_name", label: "Designation", placeholder: "Created if new" },
    { name: "company", label: "Company" },
    { name: "business_unit", label: "Business unit" },
    { name: "division", label: "Division" },
    { name: "team", label: "Team" },
  ] },
  { title: "Personal", fields: [
    { name: "date_of_birth", label: "Date of birth", type: "date" },
    { name: "gender", label: "Gender", options: GENDERS },
    { name: "work_email", label: "Work email", type: "email" },
    { name: "personal_email", label: "Personal email", type: "email" },
    { name: "current_address", label: "Current address", wide: true },
    { name: "permanent_address", label: "Permanent address", wide: true },
    { name: "city", label: "City" },
    { name: "state", label: "State" },
    { name: "country", label: "Country" },
    { name: "pincode", label: "Pincode" },
  ] },
  { title: "Compensation & statutory", fields: [
    { name: "basic_salary", label: "Basic salary", type: "number" },
    { name: "ctc", label: "CTC", type: "number" },
    { name: "pan_number", label: "PAN" },
    { name: "uan_number", label: "UAN" },
    { name: "bank_account", label: "Bank account number" },
    { name: "bank_ifsc", label: "IFSC code" },
  ] },
];

const emptyAddForm = () => ({
  ...Object.fromEntries(ADD_USER_SECTIONS.flatMap((sec) => sec.fields.map((f) => [f.name, ""]))),
  role: "employee",
  date_of_joining: new Date().toISOString().slice(0, 10),
});

const EDIT_STATUSES = [["active", "Active"], ["pending", "Pending"], ["inactive", "Inactive"], ["on_leave", "On Leave"], ["suspended", "Suspended"], ["terminated", "Terminated"], ["resigned", "Resigned"], ["deactivated", "Deactivated"]];
const EDIT_DISABLED_FIELDS = new Set(["email", "date_of_joining"]);

// Same fields as Add User so an existing employee can be fully viewed and edited.
const EDIT_SECTIONS = ADD_USER_SECTIONS.map((section) => ({
  ...section,
  fields: section.fields.map((f) => (f.name === "status" ? { ...f, options: EDIT_STATUSES } : f)),
}));

const emptyEditForm = () => ({
  ...Object.fromEntries(ADD_USER_SECTIONS.flatMap((sec) => sec.fields.map((f) => [f.name, ""]))),
  role: "employee",
});

function detailToEditForm(d) {
  return {
    ...emptyEditForm(),
    first_name: d.first_name || "",
    last_name: d.last_name || "",
    email: d.email || "",
    phone: d.phone || "",
    role: (d.role || "employee").toLowerCase(),
    job_title: d.job_title || "",
    date_of_joining: d.date_of_joining || "",
    employment_type: d.employment_type || "",
    status: d.status || "",
    confirmation_date: d.confirmation_date || "",
    department_name: d.department || d.department_name || "",
    designation_name: d.designation || d.designation_name || "",
    company: d.company || "",
    business_unit: d.business_unit || "",
    division: d.division || "",
    team: d.team || "",
    date_of_birth: d.date_of_birth || "",
    gender: d.gender || "",
    work_email: d.work_email || "",
    personal_email: d.personal_email || "",
    current_address: d.current_address || "",
    permanent_address: d.permanent_address || "",
    city: d.city || "",
    state: d.state || "",
    country: d.country || "",
    pincode: d.pincode || "",
    basic_salary: d.basic_salary ?? "",
    ctc: d.ctc ?? "",
    pan_number: d.pan_number || "",
    uan_number: d.uan_number || "",
    bank_account: d.bank_account || "",
    bank_ifsc: d.bank_ifsc || "",
  };
}

/** "3 created, 2 updated" - an update-only file must not read as "0 created". */
function importSummary(result) {
  const parts = [];
  if (result.created) parts.push(`${result.created} created`);
  if (result.updated) parts.push(`${result.updated} updated`);
  return parts.length ? `${parts.join(", ")}` : "No changes";
}

export default function OrgAdminUserManagementPage() {
  const { user } = useAuth();
  const [search, setSearch] = useState("");
  const [role, setRole] = useState("All roles");
  const [status, setStatus] = useState("All statuses");
  const [users, setUsers] = useState([]);
  const [rawEmployees, setRawEmployees] = useState([]);
  const fileInputRef = useRef(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [notice, setNotice] = useState(null);

  const [showAddModal, setShowAddModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formData, setFormData] = useState(emptyAddForm);
  const [roleOptions, setRoleOptions] = useState([
    { value: "employee", label: "Employee" }, { value: "hr_admin", label: "HR Admin" }, { value: "admin", label: "Admin" },
  ]);
  const [formErrors, setFormErrors] = useState({});
  const [createdPassword, setCreatedPassword] = useState(null);
  const [showPassword, setShowPassword] = useState(false);
  const [resetConfirm, setResetConfirm] = useState(null);
  const [resetting, setResetting] = useState(false);

  const [selectedIds, setSelectedIds] = useState(new Set());
  const [confirmAction, setConfirmAction] = useState(null);
  const [acting, setActing] = useState(false);

  const [editModal, setEditModal] = useState(null);
  const [editForm, setEditForm] = useState(emptyEditForm);
  const [editErrors, setEditErrors] = useState({});
  const [editLoading, setEditLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const [viewModal, setViewModal] = useState(null);

  const fetchUsers = useCallback(async () => {
    try {
      const data = await getEmployees({ per_page: 200, include_all_roles: true });
      const items = data.items || [];
      setRawEmployees(items);
      setUsers(items.map((e) => ({
        id: e.id,
        displayId: e.employeeCode || e.employee_code || e.employeeId || e.employee_id || "",
        name: `${e.firstName || e.first_name || ""} ${e.lastName || e.last_name || ""}`.trim(),
        email: e.email || "",
        phone: e.phone || e.phoneNumber || "",
        role: e.role
          ? (ROLE_DISPLAY_LABELS[e.role] || e.role.charAt(0).toUpperCase() + e.role.slice(1))
          : "Employee",
        roleValue: e.role || "employee",
        title: e.jobTitle || e.job_title || "",
        // the same resolver the ZoikoHR dashboard uses, so both screens always say the same thing
        status: (() => { const label = resolveEmployeeDisplayStatus(e).label; return label === "Working" ? "Active" : label; })(),
      })));
      setLoadError(null);
    } catch (err) {
      setRawEmployees([]);
      setUsers([]);
      setLoadError(err?.response?.data?.detail || err?.message || "Failed to load users.");
    }
  }, []);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), 6000);
    return () => clearTimeout(t);
  }, [notice]);

  const total = users.length;
  // someone on leave still has a working account: only the other states are "not active"
  const isLiveAccount = (u) => u.status === "Active" || u.status === "On Leave";
  const active = users.filter(isLiveAccount).length;
  const inactive = total - active;

  const filtered = useMemo(() => {
    return users.filter((u) => {
      const matchesSearch =
        u.name.toLowerCase().includes(search.toLowerCase()) ||
        u.email.toLowerCase().includes(search.toLowerCase());
      const matchesRole = role === "All roles" || u.role === role;
      const matchesStatus =
        status === "All statuses" ||
        (status === "Active" ? isLiveAccount(u) : !isLiveAccount(u));
      return matchesSearch && matchesRole && matchesStatus;
    });
  }, [users, search, role, status]);

  const toggleSelect = (id) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === filtered.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filtered.map((u) => u.id)));
    }
  };

  const handleBulkDelete = () => {
    setConfirmAction({
      userIds: [...selectedIds],
      title: "Delete Selected Users",
      message: `Permanently delete ${selectedIds.size} user(s) and all associated records? This action cannot be undone.`,
      confirmLabel: `Delete ${selectedIds.size} user(s)`,
      fn: async (ids) => {
        const res = await bulkHardDeleteEmployees(ids);
        if (res?.message) alert(res.message);
      },
    });
  };

  function handleDownloadTemplate() {
    const link = document.createElement("a");
    link.href = "/templates/employee-import-template.xlsx";
    link.download = "employee-import-template.xlsx";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  function handleExport() {
    if (rawEmployees.length === 0) return;
    const exportRows = rawEmployees.map((e) => ({
      first_name: e.firstName || e.first_name || "",
      last_name: e.lastName || e.last_name || "",
      email: e.email || "",
      password: "",
      phone: e.phone || "",
      job_title: e.jobTitle || e.job_title || "",
      department: e.departmentName || e.department?.name || "",
      designation: e.designationName || e.designation?.title || "",
      reporting_manager: e.reportingManagerName || "",
      employment_type: (e.employmentType || e.employment_type || "").replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
      status: (e.status || "").replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
      date_of_joining: e.dateOfJoining || e.date_of_joining || "",
      date_of_birth: e.dateOfBirth || e.date_of_birth || "",
      gender: (e.gender || "").replace(/\b\w/g, (c) => c.toUpperCase()),
      basic_salary: e.basicSalary || e.basic_salary || "",
      ctc: e.ctc || "",
      work_email: e.workEmail || e.work_email || "",
      personal_email: e.personalEmail || e.personal_email || "",
      confirmation_date: e.confirmationDate || e.confirmation_date || "",
      company: e.company || "",
      business_unit: e.businessUnit || e.business_unit || "",
      division: e.division || "",
      team: e.team || "",
      current_address: e.currentAddress || e.current_address || "",
      permanent_address: e.permanentAddress || e.permanent_address || "",
      city: e.city || "",
      state: e.state || "",
      country: e.country || "",
      pincode: e.pincode || "",
      address: e.address || "",
    }));
    downloadFile(toCSV(exportRows), `users_export_${Date.now()}.csv`);
  }

  function handleFileSelected(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setSelectedFile(file);
    setImportResult(null);
    e.target.value = "";
  }

  async function handleConfirmImport() {
    if (!selectedFile) return;
    setImporting(true);
    setImportResult(null);
    try {
      const result = await importEmployees(selectedFile);
      setImportResult(result);
      // Updates (e.g. a changed Status column) change the list too, not only new people.
      if ((result.created || 0) + (result.updated || 0) > 0) {
        await fetchUsers();
      }
    } catch (err) {
      setImportResult({
        total_rows: 0,
        created: 0,
        updated: 0,
        skipped: 0,
        failed: 0,
        errors: [{ row: 0, employee_id: "", email: "", field: "file", error: err.message || "Import failed" }],
      });
    } finally {
      setImporting(false);
    }
  }

  function closeModal() {
    setModalOpen(false);
    setSelectedFile(null);
    setImportResult(null);
  }

  const resetAddForm = () => {
    setFormData(emptyAddForm());
    setFormErrors({});
  };

  const openAddUser = () => {
    resetAddForm();
    setShowAddModal(true);
  };

  useEffect(() => {
    let cancelled = false;
    getAssignableRoles()
      .then((res) => { if (!cancelled && res?.roles?.length) setRoleOptions(res.roles); })
      .catch(() => {}); // keep the built-in options if the list cannot be loaded
    return () => { cancelled = true; };
  }, []);

  const validateAddForm = () => {
    const errors = {};
    if (!formData.first_name.trim()) errors.first_name = "First name is required";
    if (!formData.last_name.trim()) errors.last_name = "Last name is required";
    if (!formData.email.trim()) errors.email = "Email is required";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) errors.email = "Invalid email";
    else if (realEmailError(formData.email)) errors.email = realEmailError(formData.email);
    if (!formData.role) errors.role = "Role is required";
    if (!formData.job_title.trim()) errors.job_title = "Job title is required";
    if (!formData.date_of_joining) errors.date_of_joining = "Date of joining is required";
    const phoneProblem = phoneError(formData.phone);
    if (phoneProblem) errors.phone = phoneProblem;
    ["work_email", "personal_email"].forEach((k) => {
      if (formData[k].trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData[k])) errors[k] = "Invalid email";
      else if (formData[k].trim() && realEmailError(formData[k])) errors[k] = realEmailError(formData[k]);
    });
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleAddUser = async (e) => {
    e.preventDefault();
    if (!validateAddForm()) return;
    setSubmitting(true);
    try {
      // Send only what was filled in; blanks stay out of the request.
      const payload = {};
      Object.entries(formData).forEach(([k, v]) => {
        const value = typeof v === "string" ? v.trim() : v;
        if (value !== "") payload[k] = value;
      });
      const res = await createUser(payload);
      setShowAddModal(false);
      resetAddForm();
      setCreatedPassword(res.temporary_password || null);
      setNotice({ message: res.message || "User created successfully.", type: "success" });
      await fetchUsers();
    } catch (err) {
      setFormErrors({ submit: err.message || err.response?.data?.detail || "Failed to create user" });
    } finally {
      setSubmitting(false);
    }
  };

  const handleResetPassword = async () => {
    if (!resetConfirm) return;
    setResetting(true);
    try {
      const res = await resetPassword(resetConfirm.id);
      setResetConfirm(null);
      setCreatedPassword(res.temporary_password || null);
      setNotice({ message: res.message || "Password reset successful.", type: "success" });
      await fetchUsers();
    } catch (err) {
      alert(err.response?.data?.detail || err.message || "Failed to reset password");
      setResetConfirm(null);
    } finally {
      setResetting(false);
    }
  };

  const openView = async (u) => {
    setViewModal({ id: u.id, loading: true, record: null });
    try {
      const detail = await getUser(u.id);
      setViewModal({ id: u.id, loading: false, record: detail });
    } catch (err) {
      setViewModal(null);
      setNotice({ message: err.response?.data?.detail || err.message || "Failed to load user details.", type: "error" });
    }
  };

  const openEdit = async (u) => {
    // start from the list row so the name shows instantly, then fill in every detail
    setEditErrors({});
    setEditLoading(true);
    setEditForm({ ...emptyEditForm(), first_name: u.name.split(" ")[0] || "", last_name: u.name.split(" ").slice(1).join(" ") || "", phone: u.phone || "", role: (u.roleValue || "employee").toLowerCase(), job_title: u.title || "" });
    setEditModal(u);
    try {
      const detail = await getUser(u.id);
      setEditForm(detailToEditForm(detail));
      setEditModal({ ...u, phone: detail.phone || u.phone || "" });
    } catch (err) {
      setEditErrors({ submit: err.response?.data?.detail || err.message || "Failed to load user details." });
    } finally {
      setEditLoading(false);
    }
  };

  const handleEdit = async (e) => {
    e.preventDefault();
    const errors = {};
    if (!editForm.first_name.trim()) errors.first_name = "Required";
    if (!editForm.last_name.trim()) errors.last_name = "Required";
    // only a number that was changed is checked, so details of someone with an older number can still be saved
    if (editForm.phone.trim() !== (editModal.phone || "").trim()) {
      const phoneProblem = phoneError(editForm.phone);
      if (phoneProblem) errors.phone = phoneProblem;
    }
    ["work_email", "personal_email"].forEach((k) => {
      const v = editForm[k].trim();
      if (v && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) errors[k] = "Invalid email";
      else if (v && realEmailError(v)) errors[k] = realEmailError(v);
    });
    if (Object.keys(errors).length) { setEditErrors(errors); return; }

    setSaving(true);
    try {
      // Send only what was filled in; blanks stay out of the request (so they are left unchanged).
      const payload = { role: editForm.role };
      Object.entries(editForm).forEach(([k, v]) => {
        if (["email", "password", "date_of_joining"].includes(k)) return;
        const value = typeof v === "string" ? v.trim() : v;
        if (value !== "" && value != null) payload[k] = value;
      });
      payload.phone = editForm.phone.trim() || null;
      await updateUser(editModal.id, payload);
      setEditModal(null);
      setNotice({ message: "User updated successfully.", type: "success" });
      await fetchUsers();
    } catch (err) {
      setEditErrors({ submit: err.response?.data?.detail || err.message || "Failed to update user" });
    } finally {
      setSaving(false);
    }
  };

  const runConfirmAction = async () => {
    if (!confirmAction) return;
    setActing(true);
    try {
      if (confirmAction.userIds) {
        await confirmAction.fn(confirmAction.userIds);
      } else {
        await confirmAction.fn(confirmAction.user.id);
      }
      setConfirmAction(null);
      setSelectedIds(new Set());
      setNotice({ message: `${confirmAction.title} completed successfully.`, type: "success" });
      await fetchUsers();
    } catch (err) {
      alert(err.response?.data?.detail || err.message || "Action failed");
      setConfirmAction(null);
    } finally {
      setActing(false);
    }
  };

  const handleDeactivate = (u) => setConfirmAction({
    user: u,
    title: "Deactivate User",
    message: `Deactivate ${u.name}? They will not be able to log in.`,
    confirmLabel: "Deactivate",
    fn: deactivateUser,
  });

  const handleActivate = (u) => setConfirmAction({
    user: u,
    title: "Activate User",
    message: `Activate ${u.name}? They will regain access.`,
    confirmLabel: "Activate",
    fn: activateUser,
  });

  const handleArchive = (u) => setConfirmAction({
    user: u,
    title: "Archive User",
    message: `Archive ${u.name}? Their account will be archived.`,
    confirmLabel: "Archive",
    fn: archiveUser,
  });

  const handleDelete = (u) => setConfirmAction({
    user: u,
    title: "Delete User",
    message: `Permanently delete ${u.name} and all associated records? This action cannot be undone.`,
    confirmLabel: "Delete",
    fn: hardDeleteEmployee,
  });

  const gradPairs = [
    ['#3B82F6','#1E40AF'], ['#10B981','#059669'], ['#0A1128','#1A2744'],
    ['#64748B','#475569'], ['#1E40AF','#0A1128'], ['#60A5FA','#3B82F6']
  ];

  return (
    <div style={{ fontFamily:'Inter, sans-serif', color:'#0A1128' }}>

      {/* Hero */}
      <div style={{
        background:'linear-gradient(120deg,#0A1128 0%,#1A2744 55%,#1E3A5F 100%)',
        borderRadius:20, padding:'28px 32px', display:'flex', justifyContent:'space-between',
        alignItems:'center', gap:24, color:'#fff', position:'relative', overflow:'hidden',
        boxShadow:'0 4px 10px rgba(10,17,40,0.06), 0 20px 40px -20px rgba(59,130,246,0.25)',
        marginBottom:20
      }}>
        <div style={{ position:'relative', zIndex:1 }}>
          <div style={{ fontSize:11.5, letterSpacing:'0.12em', textTransform:'uppercase', color:'rgba(255,255,255,0.55)', fontWeight:700, marginBottom:8 }}>
            Administration
          </div>
          <h1 style={{ fontFamily:'Sora,sans-serif', fontSize:26, fontWeight:700, letterSpacing:'-0.01em', margin:0 }}>
            User Management
          </h1>
          <p style={{ marginTop:6, color:'rgba(255,255,255,0.68)', fontSize:13.5, maxWidth:520 }}>
            Manage organization users, roles, and access permissions from one place.
          </p>
        </div>
        <button
          onClick={openAddUser}
          style={{
            padding:'12px 22px', borderRadius:12, fontSize:14, fontWeight:700, cursor:'pointer', border:'none',
            display:'flex', alignItems:'center', gap:8, whiteSpace:'nowrap', zIndex:1,
            background:'linear-gradient(135deg,#3B82F6,#2563EB)', color:'#fff',
            boxShadow:'0 8px 20px -8px rgba(59,130,246,0.7)'
          }}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M12 5v14M5 12h14"/></svg>
          Add User
        </button>
      </div>

      {/* Feedback banners */}
      {loadError && (
        <div style={{
          display:'flex', alignItems:'center', justifyContent:'space-between', gap:12,
          padding:'14px 18px', marginBottom:16, borderRadius:12,
          background:'#FEE2E2', border:'1px solid #FECACA', fontSize:13.5, fontWeight:600, color:'#EF4444'
        }}>
          <span>{loadError}</span>
          <button
            onClick={fetchUsers}
            style={{ background:'#EF4444', color:'#fff', border:'none', borderRadius:8, padding:'8px 14px', fontSize:12.5, fontWeight:700, cursor:'pointer' }}
          >
            Retry
          </button>
        </div>
      )}
      {notice && (
        <div style={{
          display:'flex', alignItems:'center', justifyContent:'space-between', gap:12,
          padding:'14px 18px', marginBottom:16, borderRadius:12,
          background: notice.type === 'success' ? '#D1FAE5' : '#DBEAFE',
          border: `1px solid ${notice.type === 'success' ? '#A7F3D0' : '#BFDBFE'}`,
          fontSize:13.5, fontWeight:600,
          color: notice.type === 'success' ? '#059669' : '#3B82F6'
        }}>
          <span>{notice.message}</span>
          <button
            onClick={() => setNotice(null)}
            style={{ background:'transparent', border:'none', color:'inherit', cursor:'pointer', fontSize:14, fontWeight:700 }}
            aria-label="Dismiss"
          >
            ×
          </button>
        </div>
      )}

      {/* Toolbar */}
      <div style={{ display:'flex', gap:12, marginBottom:20 }}>
        <button onClick={handleDownloadTemplate} className="tool-btn" style={{
          display:'flex', alignItems:'center', gap:9, padding:'11px 18px', borderRadius:12,
          background:'#fff', border:'1px solid rgba(10,17,40,0.08)', fontSize:13.5, fontWeight:600,
          color:'#0A1128', cursor:'pointer', boxShadow:'0 1px 2px rgba(10,17,40,0.04), 0 8px 24px -12px rgba(10,17,40,0.10)'
        }}>
          <FileDown size={15} style={{ opacity:0.75 }} />
          Download Template
        </button>
        <button onClick={() => setModalOpen(true)} className="tool-btn" style={{
          display:'flex', alignItems:'center', gap:9, padding:'11px 18px', borderRadius:12,
          background:'#fff', border:'1px solid rgba(10,17,40,0.08)', fontSize:13.5, fontWeight:600,
          color:'#0A1128', cursor:'pointer', boxShadow:'0 1px 2px rgba(10,17,40,0.04), 0 8px 24px -12px rgba(10,17,40,0.10)'
        }}>
          <Upload size={15} style={{ opacity:0.75 }} />
          Import Users
        </button>
        <button onClick={handleExport} className="tool-btn" style={{
          display:'flex', alignItems:'center', gap:9, padding:'11px 18px', borderRadius:12,
          background:'#fff', border:'1px solid rgba(10,17,40,0.08)', fontSize:13.5, fontWeight:600,
          color:'#0A1128', cursor:'pointer', boxShadow:'0 1px 2px rgba(10,17,40,0.04), 0 8px 24px -12px rgba(10,17,40,0.10)'
        }}>
          <Download size={15} style={{ opacity:0.75 }} />
          Export CSV
        </button>
      </div>

      {/* Stat cards */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:16, marginBottom:22 }}>
        {[
          { label:'Total Users', value:total, color:'#3B82F6', bg:'#DBEAFE', icon:Users },
          { label:'Active', value:active, color:'#10B981', bg:'#D1FAE5', icon:UserCheck },
          { label:'Inactive', value:inactive, color:'#EF4444', bg:'#FEE2E2', icon:UserX },
        ].map((s) => (
          <div key={s.label} style={{
            background:'#fff', border:'1px solid rgba(10,17,40,0.08)', borderRadius:14,
            padding:'20px 22px', boxShadow:'0 1px 2px rgba(10,17,40,0.04), 0 8px 24px -12px rgba(10,17,40,0.10)',
            display:'flex', alignItems:'center', justifyContent:'space-between'
          }}>
            <div>
              <div style={{ fontSize:11, fontWeight:700, letterSpacing:'0.08em', color:'#475569', textTransform:'uppercase', marginBottom:10 }}>
                {s.label}
              </div>
              <div style={{ fontSize:30, fontWeight:800, letterSpacing:'-0.01em', fontFamily:'JetBrains Mono,monospace', fontVariantNumeric:'tabular-nums', color:s.label==='Active'?'#10B981':s.label==='Inactive'?'#EF4444':'#0A1128' }}>
                {s.value}
              </div>
            </div>
            <div style={{ width:44, height:44, borderRadius:12, background:s.bg, color:s.color, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
              <s.icon size={20} />
            </div>
          </div>
        ))}
      </div>

      {/* Filter bar */}
      <div style={{ display:'flex', gap:12, marginBottom:18 }}>
        <div style={{
          flex:1, display:'flex', alignItems:'center', gap:10, background:'#fff',
          border:'1px solid rgba(10,17,40,0.08)', borderRadius:12, padding:'12px 16px',
          boxShadow:'0 1px 2px rgba(10,17,40,0.04), 0 8px 24px -12px rgba(10,17,40,0.10)'
        }}>
          <Search size={15} color="#94A3B8" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, email…"
            style={{ border:'none', outline:'none', fontSize:13.5, width:'100%', fontFamily:'Inter', background:'transparent', color:'#0A1128' }}
          />
        </div>
        {[
          { val:role, set:setRole, options:['All roles','Employee','Admin','HR Admin','Billing Admin','Manager'] },
          { val:status, set:setStatus, options:['All statuses','Active','Inactive'] },
        ].map((sel) => (
          <div key={sel.options[0]} style={{
            display:'flex', alignItems:'center', justifyContent:'space-between', gap:10, minWidth:160,
            background:'#fff', border:'1px solid rgba(10,17,40,0.08)', borderRadius:12, padding:'12px 16px',
            fontSize:13, fontWeight:600, color:'#0A1128', boxShadow:'0 1px 2px rgba(10,17,40,0.04), 0 8px 24px -12px rgba(10,17,40,0.10)', cursor:'pointer'
          }}>
            <select
              value={sel.val}
              onChange={(e) => sel.set(e.target.value)}
              style={{ border:'none', outline:'none', width:'100%', background:'transparent', fontSize:13, fontWeight:600, color:'#0A1128', fontFamily:'Inter', cursor:'pointer' }}
            >
              {sel.options.map((o) => <option key={o}>{o}</option>)}
            </select>
            <ChevronDown size={13} color="#475569" />
          </div>
        ))}
      </div>

      {/* Bulk action bar */}
      {selectedIds.size > 0 && (
        <div style={{
          display:'flex', alignItems:'center', justifyContent:'space-between', gap:12,
          padding:'12px 18px', marginBottom:12,
          background:'#FEE2E2', border:'1px solid #FECACA', borderRadius:12,
          fontSize:13.5, fontWeight:600, color:'#EF4444'
        }}>
          <span>{selectedIds.size} user(s) selected</span>
          <button
            onClick={handleBulkDelete}
            style={{
              display:'flex', alignItems:'center', gap:8, padding:'9px 18px', borderRadius:10,
              background:'#EF4444', color:'#fff', fontWeight:700, fontSize:13, border:'none',
              cursor:'pointer', transition:'.13s ease',
            }}
            onMouseEnter={(e) => e.currentTarget.style.background='#DC2626'}
            onMouseLeave={(e) => e.currentTarget.style.background='#EF4444'}
          >
            <Trash2 size={14} />
            Delete Selected
          </button>
        </div>
      )}

      {/* Table */}
      <div style={{
        background:'#fff', border:'1px solid rgba(10,17,40,0.08)', borderRadius:20,
        boxShadow:'0 1px 2px rgba(10,17,40,0.04), 0 8px 24px -12px rgba(10,17,40,0.10)', overflow:'hidden'
      }}>
        <table style={{ width:'100%', borderCollapse:'collapse' }}>
          <thead>
            <tr style={{ background:'#F0F4F8' }}>
              <th style={{ width:40, padding:'15px 10px 15px 18px', borderBottom:'1px solid rgba(10,17,40,0.08)' }}>
                <input
                  type="checkbox"
                  checked={filtered.length > 0 && selectedIds.size === filtered.length}
                  onChange={toggleSelectAll}
                  style={{ accentColor:'#3B82F6', cursor:'pointer', width:15, height:15 }}
                />
              </th>
              {['User','Email','Role','Job Title','Status','Actions'].map((h) => (
                <th key={h} style={{
                  textAlign:h==='Actions'?'right':'left', fontSize:10.5, textTransform:'uppercase',
                  letterSpacing:'0.07em', color:'#475569', fontWeight:700, padding:'15px 18px',
                  borderBottom:'1px solid rgba(10,17,40,0.08)'
                }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map((u, i) => {
              const g = gradPairs[i % gradPairs.length];
              return (
                <tr key={u.id} style={{ transition:'background .12s ease' }}
                  onMouseEnter={(e) => e.currentTarget.style.background='#F0F7FF'}
                  onMouseLeave={(e) => e.currentTarget.style.background='transparent'}
                >
                  <td style={{ width:40, padding:'15px 10px 15px 18px', borderBottom:'1px solid rgba(10,17,40,0.08)' }}>
                    <input
                      type="checkbox"
                      checked={selectedIds.has(u.id)}
                      onChange={() => toggleSelect(u.id)}
                      style={{ accentColor:'#3B82F6', cursor:'pointer', width:15, height:15 }}
                    />
                  </td>
                  <td style={{ padding:'15px 18px', borderBottom:'1px solid rgba(10,17,40,0.08)' }}>
                    <div style={{ display:'flex', alignItems:'center', gap:12 }}>
                      <div style={{
                        width:38, height:38, borderRadius:11, flexShrink:0,
                        display:'flex', alignItems:'center', justifyContent:'center',
                        fontFamily:'Sora', fontWeight:700, fontSize:13, color:'#fff',
                        background:`linear-gradient(135deg,${g[0]},${g[1]})`
                      }}>
                        {initials(u.name)}
                      </div>
                      <div>
                        <div style={{ fontWeight:600, fontSize:13.5, color:'#0A1128' }}>{u.name}</div>
                        {u.displayId && <div style={{ fontSize:11, color:'#475569', marginTop:1 }}>{u.displayId}</div>}
                      </div>
                    </div>
                  </td>
                  <td style={{ padding:'15px 18px', borderBottom:'1px solid rgba(10,17,40,0.08)' }}>
                    <div style={{ display:'flex', alignItems:'center', gap:8, color:'#475569' }}>
                      <Mail size={14} />
                      {u.email}
                    </div>
                  </td>
                  <td style={{ padding:'15px 18px', borderBottom:'1px solid rgba(10,17,40,0.08)' }}>
                    <span style={{
                      display:'inline-flex', alignItems:'center', padding:'5px 12px', borderRadius:100,
                      fontSize:11.5, fontWeight:700, background:'#DBEAFE', color:'#3B82F6'
                    }}>
                      {u.role}
                    </span>
                  </td>
                  <td style={{ padding:'15px 18px', borderBottom:'1px solid rgba(10,17,40,0.08)', color:'#475569' }}>{u.title}</td>
                  <td style={{ padding:'15px 18px', borderBottom:'1px solid rgba(10,17,40,0.08)' }}>
                    <span style={{
                      display:'inline-flex', alignItems:'center', gap:6, padding:'5px 12px', borderRadius:100,
                      fontSize:11.5, fontWeight:700,
                      background:u.status==='Active'?'#D1FAE5':u.status==='On Leave'?'#DBEAFE':'#FEE2E2',
                      color:u.status==='Active'?'#10B981':u.status==='On Leave'?'#3B82F6':'#EF4444'
                    }}>
                      <span style={{ width:6, height:6, borderRadius:'50%', background:'currentColor' }} />
                      {u.status}
                    </span>
                  </td>
                  <td style={{ padding:'15px 18px', borderBottom:'1px solid rgba(10,17,40,0.08)' }}>
                    <div style={{ display:'flex', gap:6, justifyContent:'flex-end' }}>
                      {[
                        { icon:Eye, label:'View', cls:'edit', onClick:() => openView(u) },
                        { icon:Pencil, label:'Edit', cls:'edit', onClick:() => openEdit(u) },
                        isLiveAccount(u)
                          ? { icon:Ban, label:'Deactivate', cls:'', onClick:() => handleDeactivate(u) }
                          : { icon:CircleCheck, label:'Activate', cls:'edit', onClick:() => handleActivate(u) },
                        { icon:Archive, label:'Archive', cls:'', onClick:() => handleArchive(u) },
                        { icon:Lock, label:'Reset password', cls:'', onClick:() => setResetConfirm(u) },
                        { icon:Trash2, label:'Delete', cls:'del', onClick:() => handleDelete(u) },
                      ].map((a) => (
                        <button
                          key={a.label}
                          onClick={a.onClick}
                          title={a.label}
                          style={{
                            width:32, height:32, borderRadius:9, display:'flex', alignItems:'center',
                            justifyContent:'center', cursor:'pointer', color:'#475569',
                            background:'transparent', border:'1px solid transparent',
                            transition:'.13s ease', fontSize:'inherit'
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.background='#F0F4F8';
                            e.currentTarget.style.borderColor='rgba(10,17,40,0.08)';
                            if (a.cls==='edit') e.currentTarget.style.color='#3B82F6';
                            if (a.cls==='del') { e.currentTarget.style.background='#FEE2E2'; e.currentTarget.style.color='#EF4444'; }
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.background='transparent';
                            e.currentTarget.style.borderColor='transparent';
                            e.currentTarget.style.color='#475569';
                          }}
                        >
                          <a.icon size={14} />
                        </button>
                      ))}
                    </div>
                  </td>
                </tr>
              );
            })}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={7} style={{ padding:'15px 18px', textAlign:'center', fontSize:13.5, color:'#94A3B8' }}>
                  No users match your filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
        <div style={{
          display:'flex', alignItems:'center', justifyContent:'space-between', padding:'16px 18px',
          borderTop:'1px solid rgba(10,17,40,0.08)', fontSize:12.5, color:'#475569'
        }}>
          <div>Showing <b style={{ color:'#0A1128' }}>1–{filtered.length}</b> of <b style={{ color:'#0A1128' }}>{total}</b> users</div>
          <div style={{ display:'flex', gap:6 }}>
            {[1,2,3].map((p) => (
              <div key={p} style={{
                width:32, height:32, borderRadius:8, border:'1px solid rgba(10,17,40,0.08)',
                background:p===1?'#3B82F6':'#fff', display:'flex', alignItems:'center',
                justifyContent:'center', fontSize:12.5, fontWeight:600, cursor:'pointer',
                color:p===1?'#fff':'#475569'
              }}>{p}</div>
            ))}
          </div>
        </div>
      </div>

      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-lg rounded-xl bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
              <h3 className="text-base font-semibold text-gray-900">
                Import users
              </h3>
              <button onClick={closeModal} className="text-gray-400 hover:text-gray-600">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="px-5 py-5">
              <p className="mb-4 text-sm text-gray-500">
                Upload an Excel or CSV file matching the{" "}
                <button
                  onClick={handleDownloadTemplate}
                  className="font-medium text-[#3B82F6] hover:underline"
                >
                  import template
                </button>
                . Required columns: {REQUIRED_COLUMNS}. If Password is left blank, a
                temporary password is auto-generated.
              </p>

              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.csv"
                onChange={handleFileSelected}
                className="hidden"
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={importing}
                className="flex w-full items-center justify-center gap-2 rounded-lg border-2 border-dashed border-gray-200 py-6 text-sm text-gray-500 hover:border-[#60A5FA] hover:text-[#3B82F6] disabled:opacity-50"
              >
                <Upload className="h-4 w-4" />
                {selectedFile ? selectedFile.name : "Choose an Excel or CSV file"}
              </button>

              {selectedFile && !importResult && !importing && (
                <div className="mt-4 rounded-lg border border-[#DBEAFE] bg-[#DBEAFE] p-3 text-sm text-[#3B82F6]">
                  <span className="font-medium">{selectedFile.name}</span> selected
                </div>
              )}

              {importing && (
                <div className="mt-4 flex items-center gap-2 rounded-lg border border-blue-100 bg-blue-50 p-3 text-sm text-blue-700">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Importing employees...
                </div>
              )}

              {importResult && (
                <div className="mt-4 rounded-lg border border-gray-100 bg-gray-50 p-3">
                  {importResult.errors.length === 0 ? (
                    <div className="flex items-center gap-2 text-sm text-emerald-700">
                      <CircleCheck className="h-4 w-4" />
                      {importSummary(importResult)} successfully.
                    </div>
                  ) : (
                    <div>
                      <div className="mb-1 flex items-center gap-2 text-sm font-medium text-red-700">
                        <CircleAlert className="h-4 w-4" />
                        {(importResult.created > 0 || importResult.updated > 0) && (
                          <span className="text-emerald-700">
                            {importSummary(importResult)}.{" "}
                          </span>
                        )}
                        {importResult.errors.length} issue
                        {importResult.errors.length !== 1 ? "s" : ""} found
                      </div>
                      <ul className="max-h-32 space-y-0.5 overflow-y-auto text-xs text-red-600">
                        {importResult.errors.slice(0, 20).map((err, i) => (
                          <li key={i}>
                            {err.row ? `Row ${err.row}: ` : ""}
                            {err.error}
                          </li>
                        ))}
                        {importResult.errors.length > 20 && <li>…and {importResult.errors.length - 20} more.</li>}
                      </ul>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2 border-t border-gray-100 px-5 py-4">
              <button
                onClick={closeModal}
                className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                {importResult ? "Close" : "Cancel"}
              </button>
              {!importResult && (
                <button
                  onClick={handleConfirmImport}
                  disabled={!selectedFile || importing}
                  className="rounded-lg bg-[#3B82F6] px-4 py-2 text-sm font-semibold text-white hover:bg-[#1E40AF] disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {importing ? "Importing..." : "Import"}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-3xl rounded-xl bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
              <h3 className="text-base font-semibold text-gray-900">Add User</h3>
              <button onClick={() => { setShowAddModal(false); resetAddForm(); }} className="text-gray-400 hover:text-gray-600">
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleAddUser} className="max-h-[78vh] overflow-y-auto px-5 pt-5 space-y-5">
              {formErrors.submit && (
                <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {formErrors.submit}
                </div>
              )}

              {ADD_USER_SECTIONS.map((section) => (
                <fieldset key={section.title} disabled={submitting}>
                  <legend className="mb-2 text-xs font-bold uppercase tracking-wider text-gray-400">{section.title}</legend>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    {section.fields.map((f) => {
                      const id = `add-user-${f.name}`;
                      const cls = `w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#DBEAFE] ${
                        formErrors[f.name] ? "border-red-300 focus:border-red-400" : "border-gray-200 focus:border-[#3B82F6]"
                      }`;
                      const value = formData[f.name] ?? "";
                      const set = (e) => {
                        setFormData({ ...formData, [f.name]: e.target.value });
                        if (formErrors[f.name]) setFormErrors((prev) => ({ ...prev, [f.name]: undefined }));
                      };
                      return (
                        <div key={f.name} className={f.wide ? "sm:col-span-2" : ""}>
                          <label htmlFor={id} className="mb-1 block text-sm font-medium text-gray-700">
                            {f.label}{f.required ? <span className="text-red-500"> *</span> : null}
                          </label>
                          {f.name === "role" ? (
                            <div className="relative">
                              <select id={id} value={value} onChange={set} className={`${cls} appearance-none pr-9`}>
                                {roleOptions.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
                              </select>
                              <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                            </div>
                          ) : f.options ? (
                            <div className="relative">
                              <select id={id} value={value} onChange={set} className={`${cls} appearance-none pr-9`}>
                                <option value="">{f.blank || "Select…"}</option>
                                {f.options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                              </select>
                              <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                            </div>
                          ) : (
                            <input id={id} type={f.type || "text"} value={value} onChange={set} className={cls}
                              maxLength={f.name === "phone" ? PHONE_MAX_LENGTH : undefined} inputMode={f.name === "phone" ? "tel" : undefined}
                              onBlur={f.name === "phone" ? () => setFormErrors((prev) => ({ ...prev, phone: phoneError(formData.phone) || undefined })) : undefined}
                              aria-invalid={formErrors[f.name] ? "true" : undefined}
                              placeholder={f.placeholder} min={f.type === "number" ? "0" : undefined} step={f.type === "number" ? "0.01" : undefined} />
                          )}
                          {formErrors[f.name] && <p className="mt-1 text-xs text-red-500">{formErrors[f.name]}</p>}
                          {f.name === "role" && roleOptions.find((r) => r.value === formData.role)?.description ? (
                            <p className="mt-1 text-xs text-gray-500">{roleOptions.find((r) => r.value === formData.role).description}</p>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                </fieldset>
              ))}

              <div className="sticky bottom-0 -mx-5 flex justify-end gap-2 border-t border-gray-100 bg-white px-5 py-3">
                <button
                  type="button"
                  onClick={() => { setShowAddModal(false); resetAddForm(); }}
                  className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="rounded-lg bg-[#3B82F6] px-4 py-2 text-sm font-semibold text-white hover:bg-[#1E40AF] disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {submitting ? "Creating..." : "Create User"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {createdPassword && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-md rounded-xl bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
              <h3 className="text-base font-semibold text-gray-900">Temporary Password</h3>
              <button onClick={() => { setCreatedPassword(null); setShowPassword(false); }} className="text-gray-400 hover:text-gray-600">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="px-5 py-5">
              <p className="mb-4 text-sm text-gray-500">
                Share this temporary password with the new user securely.
              </p>
              <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3">
                <div className="flex items-center justify-between">
                  <code className="text-sm font-mono font-bold text-gray-800 select-all">
                    {showPassword ? createdPassword : "••••••••••••"}
                  </code>
                  <button
                    onClick={() => setShowPassword(!showPassword)}
                    className="ml-3 text-gray-400 hover:text-gray-600"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
            </div>
            <div className="flex justify-end border-t border-gray-100 px-5 py-4">
              <button
                onClick={() => { setCreatedPassword(null); setShowPassword(false); }}
                className="rounded-lg bg-[#3B82F6] px-4 py-2 text-sm font-semibold text-white hover:bg-[#1E40AF]"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {resetConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-sm rounded-xl bg-white shadow-xl">
            <div className="px-5 py-5">
              <h3 className="text-base font-semibold text-gray-900">Reset Password</h3>
              <p className="mt-2 text-sm text-gray-500">
                Generate a new temporary password for <span className="font-medium text-gray-700">{resetConfirm.name}</span>?
                Their current password will stop working immediately.
              </p>
            </div>
            <div className="flex justify-end gap-2 border-t border-gray-100 px-5 py-4">
              <button
                onClick={() => setResetConfirm(null)}
                className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleResetPassword}
                disabled={resetting}
                className="rounded-lg bg-[#3B82F6] px-4 py-2 text-sm font-semibold text-white hover:bg-[#1E40AF] disabled:cursor-not-allowed disabled:opacity-40"
              >
                {resetting ? "Resetting..." : "Reset Password"}
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmAction && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-sm rounded-xl bg-white shadow-xl">
            <div className="px-5 py-5">
              <h3 className="text-base font-semibold text-gray-900">{confirmAction.title}</h3>
              <p className="mt-2 text-sm text-gray-500">{confirmAction.message}</p>
            </div>
            <div className="flex justify-end gap-2 border-t border-gray-100 px-5 py-4">
              <button
                onClick={() => setConfirmAction(null)}
                className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={runConfirmAction}
                disabled={acting}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {acting ? "Processing..." : confirmAction.confirmLabel}
              </button>
            </div>
          </div>
        </div>
      )}

      {viewModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-3xl rounded-xl bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
              <h3 className="text-base font-semibold text-gray-900">
                {viewModal.record ? (viewModal.record.full_name || `${viewModal.record.first_name || ""} ${viewModal.record.last_name || ""}`.trim()) : "User Details"}
              </h3>
              <button onClick={() => setViewModal(null)} className="text-gray-400 hover:text-gray-600">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="max-h-[78vh] overflow-y-auto px-5 py-5 space-y-6">
              {viewModal.loading ? (
                <div className="flex items-center justify-center gap-2 py-10 text-sm text-gray-500">
                  <Loader2 className="h-4 w-4 animate-spin" /> Loading details…
                </div>
              ) : viewModal.record && (
                EDIT_SECTIONS.map((section) => (
                  <div key={section.title}>
                    <div className="mb-2 text-xs font-bold uppercase tracking-wider text-gray-400">{section.title}</div>
                    <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
                      {section.fields.map((f) => (
                        <div key={f.name} className={`min-w-0 ${f.wide ? "sm:col-span-2" : ""}`}>
                          <dt className="text-xs font-medium text-gray-500">{f.label}</dt>
                          <dd className="text-sm text-gray-900 break-words">
                            {(() => {
                              const r = viewModal.record;
                              let value;
                              if (f.name === "role") value = ROLE_DISPLAY_LABELS[r.role] || r.role;
                              else if (f.name === "department_name") value = r.department;
                              else if (f.name === "designation_name") value = r.designation;
                              else value = r[f.name];
                              if (value === null || value === undefined || value === "") return <span className="text-gray-400">—</span>;
                              return String(value).replace(/_/g, " ");
                            })()}
                          </dd>
                        </div>
                      ))}
                    </dl>
                  </div>
                ))
              )}
            </div>
            <div className="flex justify-end gap-2 border-t border-gray-100 px-5 py-4">
              <button onClick={() => setViewModal(null)}
                className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">Close</button>
              {viewModal.record && (
                <button type="button" onClick={() => { const rec = viewModal.record; setViewModal(null); openEdit({ id: rec.id, name: `${rec.first_name || ""} ${rec.last_name || ""}`.trim(), phone: rec.phone || "", roleValue: rec.role || "employee", title: rec.job_title || "" }); }}
                  className="rounded-lg bg-[#3B82F6] px-4 py-2 text-sm font-semibold text-white hover:bg-[#1E40AF]">Edit</button>
              )}
            </div>
          </div>
        </div>
      )}

      {editModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-3xl rounded-xl bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
              <h3 className="text-base font-semibold text-gray-900">Edit User</h3>
              <button onClick={() => setEditModal(null)} className="text-gray-400 hover:text-gray-600">
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={handleEdit} className="max-h-[78vh] overflow-y-auto px-5 pt-5 space-y-5">
              {editErrors.submit && (
                <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{editErrors.submit}</div>
              )}
              {editLoading && (
                <div className="flex items-center gap-2 text-sm text-gray-500">
                  <Loader2 className="h-4 w-4 animate-spin" /> Loading details…
                </div>
              )}
              {EDIT_SECTIONS.map((section) => (
                <fieldset key={section.title} disabled={saving}>
                  <legend className="mb-2 text-xs font-bold uppercase tracking-wider text-gray-400">{section.title}</legend>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    {section.fields.map((f) => {
                      const id = `edit-user-${f.name}`;
                      const disabled = EDIT_DISABLED_FIELDS.has(f.name);
                      const cls = `w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#DBEAFE] disabled:bg-gray-50 disabled:text-gray-500 ${
                        editErrors[f.name] ? "border-red-300 focus:border-red-400" : "border-gray-200 focus:border-[#3B82F6]"
                      }`;
                      const value = editForm[f.name] ?? "";
                      const set = (e) => {
                        setEditForm({ ...editForm, [f.name]: e.target.value });
                        if (editErrors[f.name]) setEditErrors((prev) => ({ ...prev, [f.name]: undefined }));
                      };
                      return (
                        <div key={f.name} className={f.wide ? "sm:col-span-2" : ""}>
                          <label htmlFor={id} className="mb-1 block text-sm font-medium text-gray-700">
                            {f.label}{f.required && !disabled ? <span className="text-red-500"> *</span> : null}
                          </label>
                          {f.name === "role" ? (
                            <div className="relative">
                              <select id={id} value={value} onChange={set} disabled={disabled} className={`${cls} appearance-none pr-9`}>
                                {roleOptions.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
                              </select>
                              <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                            </div>
                          ) : f.options ? (
                            <div className="relative">
                              <select id={id} value={value} onChange={set} disabled={disabled} className={`${cls} appearance-none pr-9`}>
                                <option value="">{f.blank || "Select…"}</option>
                                {f.options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                              </select>
                              <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                            </div>
                          ) : (
                            <input id={id} type={f.type || "text"} value={value} onChange={set} disabled={disabled} className={cls}
                              maxLength={f.name === "phone" ? PHONE_MAX_LENGTH : undefined} inputMode={f.name === "phone" ? "tel" : undefined}
                              onBlur={f.name === "phone" ? () => { if (editForm.phone.trim() !== (editModal?.phone || "").trim()) setEditErrors((prev) => ({ ...prev, phone: phoneError(editForm.phone) || undefined })); } : undefined}
                              aria-invalid={editErrors[f.name] ? "true" : undefined}
                              placeholder={f.placeholder} min={f.type === "number" ? "0" : undefined} step={f.type === "number" ? "0.01" : undefined} />
                          )}
                          {editErrors[f.name] && <p className="mt-1 text-xs text-red-500">{editErrors[f.name]}</p>}
                        </div>
                      );
                    })}
                  </div>
                </fieldset>
              ))}
              <div className="sticky bottom-0 -mx-5 flex justify-end gap-2 border-t border-gray-100 bg-white px-5 py-3">
                <button type="button" onClick={() => setEditModal(null)}
                  className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">Cancel</button>
                <button type="submit" disabled={saving || editLoading}
                  className="rounded-lg bg-[#3B82F6] px-4 py-2 text-sm font-semibold text-white hover:bg-[#1E40AF] disabled:cursor-not-allowed disabled:opacity-40">
                  {saving ? "Saving..." : "Save Changes"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
