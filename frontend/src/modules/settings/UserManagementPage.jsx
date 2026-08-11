import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  getUsers, createUser, updateUser, deactivateUser,
  activateUser, resetPassword, suspendUser, archiveUser, hardDeleteUser,
} from "../../service/userService";
import { superAdminService } from "../../service/superAdminService";
import {
  User, Edit, Trash2, Plus, Search, ChevronDown, Eye, EyeOff,
  RefreshCw, Unlock, CheckCircle, X, Building2, AlertTriangle,
  FileText, Download, Clock, Archive, Ban, Mail, Shield, Users,
  UserCheck, UserX, Filter,
} from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { ROLE_CREATION_RULES, ROLE_LABELS } from "../../config/roles";

const ALL_ROLE_OPTIONS = [
  { value: "admin", label: "Organization Admin" },
  { value: "hr_admin", label: "HR Admin" },
  { value: "employee", label: "Employee" },
];

const ROLE_BADGES = {
  admin: "bg-purple-100 text-purple-800 ring-purple-200",
  hr_admin: "bg-blue-100 text-blue-800 ring-blue-200",
  employee: "bg-green-100 text-green-800 ring-green-200",
};

const STATUS_STYLES = {
  active: { class: "bg-green-50 text-green-700 ring-green-200", icon: CheckCircle },
  inactive: { class: "bg-gray-100 text-gray-600 ring-gray-200", icon: X },
  pending: { class: "bg-yellow-50 text-yellow-700 ring-yellow-200", icon: Clock },
  suspended: { class: "bg-red-50 text-red-700 ring-red-200", icon: Ban },
  locked: { class: "bg-orange-50 text-orange-700 ring-orange-200", icon: LockIcon },
  archived: { class: "bg-slate-100 text-slate-600 ring-slate-200", icon: Archive },
  deactivated: { class: "bg-red-50 text-red-700 ring-red-200", icon: X },
};
function LockIcon() { return <Ban className="w-3 h-3" />; }

const ITEMS_PER_PAGE = 10;

const initialForm = {
  email: "",
  first_name: "",
  last_name: "",
  phone: "",
  role: "employee",
  job_title: "",
  organization_id: "",
};

function ConfirmDialog({ open, title, message, confirmLabel, danger, onConfirm, onCancel }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={onCancel}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm mx-4 p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-3 mb-4">
          <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${danger ? "bg-red-50" : "bg-blue-50"}`}>
            {danger ? <AlertTriangle className="w-6 h-6 text-red-600" /> : <Shield className="w-6 h-6 text-blue-600" />}
          </div>
          <h3 className="text-lg font-bold text-gray-900">{title}</h3>
        </div>
        <p className="text-sm text-gray-600 mb-6 leading-relaxed">{message}</p>
        <div className="flex justify-end gap-3">
          <button onClick={onCancel} className="px-4 py-2.5 text-sm font-semibold text-gray-700 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 hover:border-gray-300 transition-all">Cancel</button>
          <button onClick={onConfirm} className={`px-5 py-2.5 text-sm font-semibold text-white rounded-xl transition-all shadow-sm ${danger ? "bg-red-600 hover:bg-red-700 shadow-red-600/25" : "bg-blue-600 hover:bg-blue-700 shadow-blue-600/25"}`}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}

function Toast({ message, type, onClose }) {
  useEffect(() => {
    if (!message) return;
    const t = setTimeout(onClose, 4000);
    return () => clearTimeout(t);
  }, [message, onClose]);
  if (!message) return null;
  const bg = type === "success" ? "bg-emerald-600" : type === "error" ? "bg-red-600" : "bg-blue-600";
  return (
    <div className={`fixed bottom-6 right-6 z-50 px-5 py-3.5 rounded-xl shadow-lg text-white text-sm font-medium ${bg} flex items-center gap-2.5`}>
      {type === "success" ? <CheckCircle className="w-4 h-4" /> : type === "error" ? <AlertTriangle className="w-4 h-4" /> : null}
      {message}
      <button onClick={onClose} className="ml-1 p-0.5 hover:bg-white/20 rounded-lg transition-colors"><X className="w-3.5 h-3.5" /></button>
    </div>
  );
}

export default function UserManagementPage() {
  const navigate = useNavigate();
  const { user, role } = useAuth();
  const isSuperAdmin = role === "super_admin";
  const allowedRoles = ROLE_CREATION_RULES[role] || [];
  const canCreateUsers = allowedRoles.length > 0;
  const ROLE_OPTIONS = ALL_ROLE_OPTIONS.filter((r) => allowedRoles.includes(r.value));

  const [users, setUsers] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [orgFilter, setOrgFilter] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [showModal, setShowModal] = useState(false);
  const [editId, setEditId] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [formData, setFormData] = useState({ ...initialForm });
  const [formErrors, setFormErrors] = useState({});
  const [createdPassword, setCreatedPassword] = useState(null);
  const [showPassword, setShowPassword] = useState(false);
  const [confirmDialog, setConfirmDialog] = useState({ open: false });
  const [toast, setToast] = useState({ message: null, type: "success" });

  const STATUS_OPTIONS = [
    { value: "", label: "All Statuses" },
    { value: "active", label: "Active" },
    { value: "inactive", label: "Inactive" },
    { value: "pending", label: "Pending" },
    { value: "suspended", label: "Suspended" },
    { value: "locked", label: "Locked" },
    { value: "archived", label: "Archived" },
    { value: "deactivated", label: "Deactivated" },
  ];

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      if (isSuperAdmin) {
        const data = await superAdminService.getUsers({
          page: currentPage,
          page_size: ITEMS_PER_PAGE,
          search: search || undefined,
          role: "admin",
          status: statusFilter || undefined,
          organization_id: orgFilter ? parseInt(orgFilter) : undefined,
        });
        const filteredUsers = (data.users || []).filter((u) => u.id !== user?.id);
        setUsers(filteredUsers);
        setTotal(data.total || 0);
      } else {
        const data = await getUsers({
          page: currentPage,
          per_page: ITEMS_PER_PAGE,
          search,
          role: roleFilter,
          status: statusFilter,
        });
        setUsers(data.items || []);
        setTotal(data.total || 0);
      }
    } catch (err) {
      setError(err.message || "Failed to load users");
      setUsers([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [currentPage, search, roleFilter, statusFilter, orgFilter, isSuperAdmin]);

  useEffect(() => { fetchUsers(); }, [fetchUsers]);

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

  const openCreate = () => {
    resetForm();
    setCreatedPassword(null);
    if (isSuperAdmin) {
      const defaultRole = getDefaultRole();
      if (defaultRole !== "employee") {
        setFormData(prev => ({ ...prev, role: defaultRole }));
      }
    }
    setShowModal(true);
  };

  const openEdit = (user) => {
    setEditId(user.id);
    setCreatedPassword(null);
    setFormData({
      email: user.email || "",
      first_name: user.first_name || "",
      last_name: user.last_name || "",
      phone: user.phone || "",
      role: user.role || "employee",
      job_title: user.job_title || "",
      organization_id: user.organization_id || "",
    });
    setFormErrors({});
    setShowModal(true);
  };

  const fetchOrganizations = async () => {
    try {
      const data = await superAdminService.getOrganizations();
      return data.organizations || [];
    } catch (err) {
      setToast({ message: "Failed to fetch organizations", type: "error" });
      return [];
    }
  };

  const [organizations, setOrganizations] = useState([]);

  useEffect(() => {
    if (isSuperAdmin) {
      fetchOrganizations().then(setOrganizations);
    }
  }, [isSuperAdmin]);

  const getDefaultRole = () => {
    if (allowedRoles.length > 0) {
      const firstAllowed = allowedRoles[0];
      const roleOption = ALL_ROLE_OPTIONS.find(r => r.value === firstAllowed);
      if (roleOption) return roleOption.value;
    }
    return "employee";
  };

  useEffect(() => {
    if (isSuperAdmin && formData.role === "employee") {
      const defaultRole = getDefaultRole();
      if (defaultRole !== "employee") {
        setFormData(prev => ({ ...prev, role: defaultRole }));
      }
    }
  }, [isSuperAdmin, allowedRoles]);

  const validate = () => {
    const errors = {};
    if (!formData.email.trim()) errors.email = "Email is required";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) errors.email = "Invalid email";
    if (!formData.first_name.trim()) errors.first_name = "First name is required";
    if (!formData.last_name.trim()) errors.last_name = "Last name is required";
    if (!formData.role) errors.role = "Role is required";
    if (isSuperAdmin && !formData.organization_id) errors.organization_id = "Organization is required";
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validate()) return;
    setSubmitting(true);
    try {
      const payload = {
        email: formData.email.trim(),
        first_name: formData.first_name.trim(),
        last_name: formData.last_name.trim(),
        phone: formData.phone.trim() || null,
        role: formData.role,
        job_title: formData.job_title.trim() || null,
        organization_id: isSuperAdmin ? parseInt(formData.organization_id) : undefined,
      };
      if (editId) {
        await updateUser(editId, payload);
        setToast({ message: "User updated successfully.", type: "success" });
        setShowModal(false);
        resetForm();
      } else {
        const res = await createUser(payload);
        setShowModal(false);
        setCreatedPassword(res.temporary_password || null);
        setToast({ message: "User created successfully.", type: "success" });
        resetForm();
      }
      await fetchUsers();
    } catch (err) {
      setFormErrors({ submit: err.response?.data?.detail || err.message || "Failed to save user" });
    } finally {
      setSubmitting(false);
    }
  };

  const confirmAction = (action, user, options = {}) => {
    setConfirmDialog({
      open: true,
      ...options,
      onConfirm: async () => {
        setConfirmDialog({ open: false });
        try {
          await action(user.id);
          await fetchUsers();
          setToast({ message: options.successMsg || "Action completed.", type: "success" });
        } catch (err) {
          setToast({ message: err.response?.data?.detail || err.message || "Action failed.", type: "error" });
        }
      },
      onCancel: () => setConfirmDialog({ open: false }),
    });
  };

  const handleDeactivate = (user) => confirmAction(deactivateUser, user, {
    title: "Deactivate User", danger: true,
    message: `Are you sure you want to deactivate ${user.first_name} ${user.last_name}? They will not be able to log in.`,
    confirmLabel: "Deactivate",
    successMsg: "User deactivated.",
  });

  const handleActivate = (user) => confirmAction(activateUser, user, {
    title: "Activate User",
    message: `Activate ${user.first_name} ${user.last_name}? They will regain access.`,
    confirmLabel: "Activate",
    successMsg: "User activated.",
  });

  const handleSuspend = (user) => confirmAction(suspendUser, user, {
    title: "Suspend User", danger: true,
    message: `Suspend ${user.first_name} ${user.last_name}? They will be blocked from logging in.`,
    confirmLabel: "Suspend",
    successMsg: "User suspended.",
  });

  const handleArchive = (user) => confirmAction(archiveUser, user, {
    title: "Archive User", danger: true,
    message: `Archive ${user.first_name} ${user.last_name}? Their account will be archived.`,
    confirmLabel: "Archive",
    successMsg: "User archived.",
  });

  const handleDelete = (user) => confirmAction(hardDeleteUser, user, {
    title: "Delete User", danger: true,
    message: `Permanently delete ${user.first_name} ${user.last_name} and all associated records? This action cannot be undone.`,
    confirmLabel: "Delete",
    successMsg: "User deleted.",
  });

  const handleResetPassword = async (user) => {
    setConfirmDialog({
      open: true,
      title: "Reset Password",
      message: `Reset password for ${user.first_name} ${user.last_name}? A new temporary password will be generated.`,
      confirmLabel: "Reset",
      onConfirm: async () => {
        setConfirmDialog({ open: false });
        try {
          const res = await resetPassword(user.id);
          setCreatedPassword(res.temporary_password || null);
          setToast({ message: "Password reset successfully.", type: "success" });
        } catch (err) {
          setToast({ message: err.response?.data?.detail || err.message || "Failed to reset password.", type: "error" });
        }
      },
      onCancel: () => setConfirmDialog({ open: false }),
    });
  };

  const stats = isSuperAdmin ? [
    { label: "Total Org Admins", value: total, color: "text-indigo-600", bg: "bg-indigo-50", icon: Users },
    { label: "Active", value: users.filter((u) => u.is_active !== false).length, color: "text-emerald-600", bg: "bg-emerald-50", icon: UserCheck },
    { label: "Inactive", value: users.filter((u) => u.is_active === false).length, color: "text-red-500", bg: "bg-red-50", icon: UserX },
  ] : [
    { label: "Total Users", value: users.length, color: "text-indigo-600", bg: "bg-indigo-50", icon: Users },
    { label: "Active", value: users.filter((u) => u.is_active !== false).length, color: "text-emerald-600", bg: "bg-emerald-50", icon: UserCheck },
    { label: "Inactive", value: users.filter((u) => u.is_active === false).length, color: "text-red-500", bg: "bg-red-50", icon: UserX },
  ];

  if (loading && users.length === 0) {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="animate-pulse">
            <div className="h-8 bg-gray-200 rounded-lg w-56 mb-2"></div>
            <div className="h-4 bg-gray-200 rounded-lg w-80 mb-8"></div>
            <div className={`grid gap-4 mb-6 ${isSuperAdmin ? "grid-cols-1 sm:grid-cols-3" : "grid-cols-1 sm:grid-cols-3"}`}>
              {[...Array(3)].map((_, i) => <div key={i} className="h-24 bg-gray-100 rounded-xl"></div>)}
            </div>
            <div className="h-14 bg-gray-100 rounded-xl mb-6"></div>
            <div className="h-96 bg-gray-100 rounded-xl"></div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Toast message={toast.message} type={toast.type} onClose={() => setToast({ message: null })} />
      <ConfirmDialog {...confirmDialog} />

      <header className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="py-6 flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900 tracking-tight">User Management</h1>
              <p className="mt-1 text-sm text-gray-500">
                {isSuperAdmin ? "Manage organization administrators across all organizations." : "Manage organization users and their roles."}
              </p>
            </div>
            {canCreateUsers && (
              <button onClick={openCreate} className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold px-5 py-2.5 rounded-xl transition-all flex items-center gap-2 shadow-sm shadow-blue-600/25 hover:shadow-md hover:shadow-blue-600/30">
                <Plus className="w-4 h-4" /> Add User
              </button>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="space-y-6">
          {error && (
            <div className="px-5 py-4 bg-red-50 border border-red-200 text-red-700 rounded-xl flex justify-between items-center text-sm">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>{error}</span>
              </div>
              <button onClick={() => setError(null)} className="p-1 hover:bg-red-100 rounded-lg transition-colors ml-3">
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          {stats && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {stats.map((s) => {
                const Icon = s.icon;
                return (
                  <div key={s.label} className="bg-white rounded-xl border border-gray-100 shadow-sm px-5 py-4 transition-all hover:shadow-md hover:border-gray-200">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">{s.label}</p>
                        <p className={`text-3xl font-bold mt-1.5 ${s.color}`}>{s.value ?? "-"}</p>
                      </div>
                      <div className={`w-12 h-12 rounded-xl ${s.bg} flex items-center justify-center`}>
                        <Icon className={`w-6 h-6 ${s.color}`} />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <div className="bg-white rounded-xl border border-gray-100 shadow-sm px-5 py-4">
            <div className="flex flex-wrap items-center gap-3">
              <div className="relative flex-1 min-w-[240px]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search by name, email..."
                  value={search}
                  onChange={(e) => { setSearch(e.target.value); setCurrentPage(1); }}
                  className="w-full bg-gray-50 border border-gray-200 rounded-lg px-4 py-2.5 text-sm pl-10 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 focus:bg-white transition-all placeholder:text-gray-400"
                />
              </div>
              <div className="h-8 w-px bg-gray-200 hidden sm:block" />
              {!isSuperAdmin && (
                <div className="relative">
                  <select
                    value={roleFilter}
                    onChange={(e) => { setRoleFilter(e.target.value); setCurrentPage(1); }}
                    className="bg-gray-50 border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 focus:bg-white appearance-none pr-9 transition-all cursor-pointer"
                  >
                    <option value="">All Roles</option>
                    {ROLE_OPTIONS.map((r) => (
                      <option key={r.value} value={r.value}>{r.label}</option>
                    ))}
                  </select>
                  <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                </div>
              )}
              <div className="relative">
                <select
                  value={statusFilter}
                  onChange={(e) => { setStatusFilter(e.target.value); setCurrentPage(1); }}
                  className="bg-gray-50 border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 focus:bg-white appearance-none pr-9 transition-all cursor-pointer"
                >
                  {STATUS_OPTIONS.map((s) => (
                    <option key={s.value} value={s.value}>{s.label}</option>
                  ))}
                </select>
                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
              </div>
              {(search || roleFilter || statusFilter) && (
                <button
                  onClick={() => { setSearch(""); setRoleFilter(""); setStatusFilter(""); setCurrentPage(1); }}
                  className="text-sm text-gray-500 hover:text-gray-700 font-medium flex items-center gap-1.5 px-3 py-2.5 hover:bg-gray-50 rounded-lg transition-colors"
                >
                  <X className="w-3.5 h-3.5" />
                  Clear
                </button>
              )}
            </div>
          </div>

          {users.length === 0 && !loading ? (
            <div className="text-center py-20 bg-white rounded-xl border border-gray-100 shadow-sm">
              <div className="w-16 h-16 bg-gray-100 rounded-2xl flex items-center justify-center mx-auto mb-5">
                <User className="w-8 h-8 text-gray-300" />
              </div>
              <p className="text-gray-700 font-semibold text-lg">No users found</p>
              <p className="text-sm text-gray-400 mt-1.5 max-w-sm mx-auto">No users match your current filters. Try adjusting your search criteria.</p>
              {canCreateUsers && (
                <button onClick={openCreate} className="mt-5 inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-5 py-2.5 rounded-lg transition-colors shadow-sm">
                  <Plus className="w-4 h-4" /> Add User
                </button>
              )}
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50/80 border-b border-gray-200">
                      <th className="text-left px-5 py-3.5 font-semibold text-gray-500 text-xs uppercase tracking-wider">User</th>
                      <th className="text-left px-5 py-3.5 font-semibold text-gray-500 text-xs uppercase tracking-wider">Email</th>
                      {isSuperAdmin && <th className="text-left px-5 py-3.5 font-semibold text-gray-500 text-xs uppercase tracking-wider">Organization</th>}
                      {!isSuperAdmin && <th className="text-left px-5 py-3.5 font-semibold text-gray-500 text-xs uppercase tracking-wider">Role</th>}
                      <th className="text-left px-5 py-3.5 font-semibold text-gray-500 text-xs uppercase tracking-wider">Job Title</th>
                      <th className="text-left px-5 py-3.5 font-semibold text-gray-500 text-xs uppercase tracking-wider">Status</th>
                      <th className="text-right px-5 py-3.5 font-semibold text-gray-500 text-xs uppercase tracking-wider">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {users.map((u) => {
                      const statusKey = (u.status || (u.is_active ? "active" : "inactive")).toLowerCase();
                      const st = STATUS_STYLES[statusKey] || STATUS_STYLES.inactive;
                      const StatusIcon = st.icon;
                      return (
                        <tr key={u.id} className="hover:bg-gray-50/50 transition-colors group">
                          <td className="px-5 py-4">
                            <div className="flex items-center gap-3">
                              <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-xl flex items-center justify-center shadow-sm ring-2 ring-white">
                                <span className="text-white font-semibold text-sm">{u.first_name?.charAt(0)}{u.last_name?.charAt(0)}</span>
                              </div>
                              <div>
                                <p className="font-semibold text-gray-900">{u.first_name} {u.last_name}</p>
                                {u.employee_id && <p className="text-xs text-gray-400 mt-0.5">{u.employee_id}</p>}
                              </div>
                            </div>
                          </td>
                          <td className="px-5 py-4 text-gray-600">{u.email}</td>
                          {isSuperAdmin && (
                            <td className="px-5 py-4">
                              <div className="flex items-center gap-2">
                                <div className="w-7 h-7 bg-gray-100 rounded-lg flex items-center justify-center shrink-0">
                                  <Building2 className="w-3.5 h-3.5 text-gray-500" />
                                </div>
                                <span className="text-gray-700 font-semibold truncate max-w-[160px]">{u.organization_name || "-"}</span>
                              </div>
                            </td>
                          )}
                          {!isSuperAdmin && (
                            <td className="px-5 py-4">
                              <span className={`inline-flex items-center px-2.5 py-1 text-xs font-semibold rounded-full ring-1 ring-inset ${ROLE_BADGES[u.role] || "bg-gray-100 text-gray-800 ring-gray-200"}`}>
                                {ROLE_LABELS[u.role] || u.role}
                              </span>
                            </td>
                          )}
                          <td className="px-5 py-4 text-gray-600 max-w-[160px] truncate">{u.job_title || "-"}</td>
                          <td className="px-5 py-4">
                            <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-full ring-1 ring-inset ${st.class}`}>
                              <StatusIcon className="w-3 h-3" />
                              {statusKey.charAt(0).toUpperCase() + statusKey.slice(1)}
                            </span>
                          </td>
                          <td className="px-5 py-4 text-right">
                            <div className="flex justify-end gap-0.5 opacity-60 group-hover:opacity-100 transition-opacity">
                              <button onClick={() => openEdit(u)} className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all" title="Edit user">
                                <Edit className="w-4 h-4" />
                              </button>
                              {u.is_active !== false && u.status !== "suspended" ? (
                                <>
                                  <button onClick={() => handleDeactivate(u)} className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all" title="Deactivate">
                                    <UserX className="w-4 h-4" />
                                  </button>
                                  <button onClick={() => handleSuspend(u)} className="p-2 text-gray-400 hover:text-orange-600 hover:bg-orange-50 rounded-lg transition-all" title="Suspend">
                                    <Ban className="w-4 h-4" />
                                  </button>
                                </>
                              ) : (
                                <button onClick={() => handleActivate(u)} className="p-2 text-gray-400 hover:text-green-600 hover:bg-green-50 rounded-lg transition-all" title="Activate">
                                  <RefreshCw className="w-4 h-4" />
                                </button>
                              )}
                              <button onClick={() => handleArchive(u)} className="p-2 text-gray-400 hover:text-slate-600 hover:bg-slate-50 rounded-lg transition-all" title="Archive">
                                <Archive className="w-4 h-4" />
                              </button>
                              <button onClick={() => handleResetPassword(u)} className="p-2 text-gray-400 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-all" title="Reset password">
                                <Unlock className="w-4 h-4" />
                              </button>
                              <button onClick={() => handleDelete(u)} className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all" title="Delete">
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {totalPages > 1 && (
                <div className="flex flex-col sm:flex-row justify-between items-center px-5 py-4 border-t border-gray-100 bg-gray-50/30 gap-3">
                  <p className="text-sm text-gray-500">
                    Showing <span className="font-medium text-gray-700">{(safePage - 1) * ITEMS_PER_PAGE + 1}</span>
                    {" "}-{" "}
                    <span className="font-medium text-gray-700">{Math.min(safePage * ITEMS_PER_PAGE, total)}</span>
                    {" "}of{" "}
                    <span className="font-medium text-gray-700">{total}</span> users
                  </p>
                  <div className="flex items-center gap-1.5">
                    <button
                      disabled={currentPage <= 1}
                      onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                      className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 hover:border-gray-300 disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-sm"
                    >
                      Previous
                    </button>
                    <span className="px-3 py-2 text-sm font-medium text-gray-600 bg-white border border-gray-200 rounded-lg">
                      {safePage} / {totalPages}
                    </span>
                    <button
                      disabled={currentPage >= totalPages}
                      onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                      className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 hover:border-gray-300 disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-sm"
                    >
                      Next
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {showModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={() => { setShowModal(false); resetForm(); }}>
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden" onClick={(e) => e.stopPropagation()}>
              <div className="flex justify-between items-center px-6 py-5 border-b border-gray-100 bg-gray-50/50">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center">
                    {editId ? <Edit className="w-5 h-5 text-blue-600" /> : <Plus className="w-5 h-5 text-blue-600" />}
                  </div>
                  <div>
                    <h2 className="text-lg font-bold text-gray-900">{editId ? "Edit User" : "Create User"}</h2>
                    <p className="text-xs text-gray-500 mt-0.5">{editId ? "Update user information" : "Add a new user to the system"}</p>
                  </div>
                </div>
                <button onClick={() => { setShowModal(false); resetForm(); }} className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-xl transition-all">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <form onSubmit={handleSubmit} className="p-6 space-y-5">
                {formErrors.submit && (
                  <div className="px-4 py-3 bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 shrink-0" />
                    {formErrors.submit}
                  </div>
                )}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-1.5">First Name <span className="text-red-500">*</span></label>
                    <input type="text" value={formData.first_name} onChange={(e) => setFormData({ ...formData, first_name: e.target.value })}
                      className={`w-full border ${formErrors.first_name ? "border-red-300 ring-2 ring-red-100" : "border-gray-200"} rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all`}
                      placeholder="John" />
                    {formErrors.first_name && <p className="text-xs text-red-500 mt-1.5 font-medium">{formErrors.first_name}</p>}
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-1.5">Last Name <span className="text-red-500">*</span></label>
                    <input type="text" value={formData.last_name} onChange={(e) => setFormData({ ...formData, last_name: e.target.value })}
                      className={`w-full border ${formErrors.last_name ? "border-red-300 ring-2 ring-red-100" : "border-gray-200"} rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all`}
                      placeholder="Doe" />
                    {formErrors.last_name && <p className="text-xs text-red-500 mt-1.5 font-medium">{formErrors.last_name}</p>}
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1.5">Email <span className="text-red-500">*</span></label>
                  <input type="email" value={formData.email} onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    className={`w-full border ${formErrors.email ? "border-red-300 ring-2 ring-red-100" : "border-gray-200"} rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all`}
                    placeholder="john.doe@company.com" />
                  {formErrors.email && <p className="text-xs text-red-500 mt-1.5 font-medium">{formErrors.email}</p>}
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-1.5">Role <span className="text-red-500">*</span></label>
                    <div className="relative">
                      <select value={formData.role} onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                        className={`w-full border ${formErrors.role ? "border-red-300 ring-2 ring-red-100" : "border-gray-200"} rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white appearance-none pr-10 transition-all cursor-pointer`}>
                        {ROLE_OPTIONS.map((r) => (
                          <option key={r.value} value={r.value}>{r.label}</option>
                        ))}
                      </select>
                      <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                    </div>
                    {formErrors.role && <p className="text-xs text-red-500 mt-1.5 font-medium">{formErrors.role}</p>}
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-1.5">Phone</label>
                    <input type="text" value={formData.phone} onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                      className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
                      placeholder="+1-555-0100" />
                  </div>
                </div>
                {isSuperAdmin && (
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-1.5">Organization <span className="text-red-500">*</span></label>
                    <div className="relative">
                      <select value={formData.organization_id} onChange={(e) => setFormData({ ...formData, organization_id: e.target.value })}
                        className={`w-full border ${formErrors.organization_id ? "border-red-300 ring-2 ring-red-100" : "border-gray-200"} rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white appearance-none pr-10 transition-all cursor-pointer`}
                      disabled={!organizations.length}>
                        <option value="">Select an organization</option>
                        {organizations.map((org) => (
                          <option key={org.id} value={org.id}>{org.name}</option>
                        ))}
                      </select>
                      <Building2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                    </div>
                    {formErrors.organization_id && <p className="text-xs text-red-500 mt-1.5 font-medium">{formErrors.organization_id}</p>}
                  </div>
                )}
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1.5">Job Title</label>
                  <input type="text" value={formData.job_title} onChange={(e) => setFormData({ ...formData, job_title: e.target.value })}
                    className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
                    placeholder="Software Engineer" />
                </div>
                <div className="flex justify-end gap-3 pt-4 border-t border-gray-100 mt-6">
                  <button type="button" onClick={() => { setShowModal(false); resetForm(); }}
                    className="px-5 py-2.5 text-sm font-semibold text-gray-700 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 hover:border-gray-300 transition-all">Cancel</button>
                  <button type="submit" disabled={submitting}
                    className="px-6 py-2.5 text-sm font-semibold text-white bg-blue-600 rounded-xl hover:bg-blue-700 disabled:opacity-50 transition-all shadow-sm shadow-blue-600/25">
                    {submitting ? "Saving..." : editId ? "Update User" : "Create User"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {createdPassword && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={() => setCreatedPassword(null)}>
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 p-6" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center gap-3 mb-5">
                <div className="w-12 h-12 bg-emerald-50 rounded-xl flex items-center justify-center">
                  <CheckCircle className="w-6 h-6 text-emerald-600" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-gray-900">Temporary Password</h2>
                  <p className="text-sm text-gray-500 mt-0.5">Share this with the user securely.</p>
                </div>
              </div>
              <div className="bg-gray-50 border border-gray-200 rounded-xl px-4 py-3.5 mb-5">
                <div className="flex justify-between items-center">
                  <code className="text-sm font-mono font-bold text-gray-800 select-all">
                    {showPassword ? createdPassword : "••••••••••••"}
                  </code>
                  <button onClick={() => setShowPassword(!showPassword)} className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-all">
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              <div className="flex justify-end">
                <button onClick={() => setCreatedPassword(null)}
                  className="px-6 py-2.5 text-sm font-semibold text-white bg-blue-600 rounded-xl hover:bg-blue-700 transition-all shadow-sm shadow-blue-600/25">Done</button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
