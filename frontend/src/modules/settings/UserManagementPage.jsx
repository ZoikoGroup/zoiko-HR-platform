import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import {
  getUsers, createUser, updateUser, deactivateUser,
  activateUser, resetPassword, suspendUser, archiveUser, hardDeleteUser, getAssignableRoles,
} from "../../service/userService";
import { superAdminService } from "../../service/superAdminService";
import {
  User, Edit, Trash2, Plus, Search, ChevronDown, Eye, EyeOff,
  RefreshCw, Unlock, CheckCircle, X, Building2, AlertTriangle,
  FileText, Download, Clock, Archive, Ban, Mail, Shield, Users,
  UserCheck, UserX, Filter, MoreVertical, ArrowLeft,
} from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { ROLE_LABELS } from "../../config/roles";
import DeleteOrganizationDialog from "../../components/DeleteOrganizationDialog";

// Role options come from GET /hr/admin/roles (single source of truth on the
// server: label, description, platform/organization scope, and what the
// signed-in user is allowed to assign). Nothing is hardcoded here.
const ROLE_BADGES = {
  super_admin: "bg-purple-100 text-purple-800 ring-purple-200",
  admin: "bg-blue-100 text-blue-800 ring-blue-200",
  hr_admin: "bg-blue-100 text-blue-800 ring-blue-200",
  billing_admin: "bg-amber-100 text-amber-800 ring-amber-200",
  manager: "bg-teal-100 text-teal-800 ring-teal-200",
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

const ITEMS_PER_PAGE = 7; // sized so the list, filters and pager fit one screen without scrolling

const initialForm = {
  email: "",
  first_name: "",
  last_name: "",
  phone: "",
  role: "",
  job_title: "",
  organization_id: "",
  confirm_super_admin: false,
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

function RowMenu({ label, children }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const close = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    const esc = (e) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", close); document.removeEventListener("keydown", esc); };
  }, [open]);
  return (
    <div className="relative" ref={ref}>
      <button type="button" onClick={() => setOpen((o) => !o)} aria-haspopup="menu" aria-expanded={open} aria-label={label} title="More actions"
        className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-all">
        <MoreVertical className="w-4 h-4" />
      </button>
      {open && (
        <div role="menu" className="absolute right-0 z-30 mt-1 w-44 rounded-xl border border-gray-200 bg-white py-1 shadow-lg" onClick={() => setOpen(false)}>
          {children}
        </div>
      )}
    </div>
  );
}

function MenuItem({ icon: Icon, danger, onClick, children }) {
  return (
    <button type="button" role="menuitem" onClick={onClick}
      className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-gray-50 ${danger ? "text-red-600" : "text-gray-700"}`}>
      <Icon className="w-4 h-4" /> {children}
    </button>
  );
}

function OrganizationPicker({ organizations, loading, busyId, onOpen, onSuspend, onReactivate, onResetPassword, onDelete }) {
  const [q, setQ] = useState("");
  const term = q.trim().toLowerCase();
  const shown = organizations.filter((o) => !term || (o.name || "").toLowerCase().includes(term)
    || (o.organization_code || "").toLowerCase().includes(term) || (o.admin_email || "").toLowerCase().includes(term));
  return (
    <div className="space-y-3">
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm px-4 py-3 flex items-center gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input type="text" aria-label="Search organizations" placeholder="Search organizations..." value={q} onChange={(e) => setQ(e.target.value)}
            className="w-full bg-gray-50 border border-gray-200 rounded-lg px-4 py-2.5 text-sm pl-10 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white" />
        </div>
        <p className="text-sm text-gray-500 whitespace-nowrap">{organizations.length} organization{organizations.length === 1 ? "" : "s"}</p>
      </div>
      {loading && organizations.length === 0 ? (
        <p className="text-sm text-gray-500 px-1">Loading organizations…</p>
      ) : shown.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-xl border border-gray-100 shadow-sm">
          <Building2 className="w-8 h-8 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-700 font-semibold">{organizations.length === 0 ? "No organizations yet" : "No organizations match your search"}</p>
          <p className="text-sm text-gray-400 mt-1">{organizations.length === 0 ? "Use Add Organization to create the first one." : "Try a different name."}</p>
        </div>
      ) : (
        <div className="grid content-start gap-3 sm:grid-cols-2 xl:grid-cols-3 max-h-[calc(100vh-290px)] overflow-y-auto pr-1" aria-label="Organizations">
          {shown.map((o) => {
            const suspended = String(o.status || "").toLowerCase() === "suspended";
            const busy = busyId === o.id;
            return (
              <div key={o.id} className="bg-white rounded-xl border border-gray-100 shadow-sm hover:border-blue-300 hover:shadow-md transition-all flex flex-col">
                <button type="button" onClick={() => onOpen(o)} aria-label={`Open ${o.name}`} className="text-left p-4 flex-1">
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 shrink-0 bg-blue-50 rounded-xl flex items-center justify-center"><Building2 className="w-5 h-5 text-blue-600" /></div>
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-gray-900 truncate" title={o.name}>{o.name}</p>
                      <p className="text-xs text-gray-400 truncate">{o.organization_code || o.code || ""}</p>
                    </div>
                    {o.status ? (
                      <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold capitalize ${suspended ? "bg-orange-50 text-orange-700" : "bg-gray-100 text-gray-600"}`}>
                        {String(o.status).replace(/_/g, " ")}
                      </span>
                    ) : null}
                  </div>
                  <div className="mt-3 flex items-center gap-4 text-xs text-gray-500">
                    <span className="flex items-center gap-1"><Users className="w-3.5 h-3.5" /><b className="text-gray-800">{o.user_count ?? 0}</b> user{o.user_count === 1 ? "" : "s"}</span>
                    <span className="flex items-center gap-1"><UserCheck className="w-3.5 h-3.5 text-emerald-500" /><b className="text-gray-800">{o.active_employees ?? 0}</b> active</span>
                  </div>
                  {o.admin_name || o.admin_email ? (
                    <p className="mt-2 text-[11px] text-gray-400 truncate" title={o.admin_email || ""}>Admin: {o.admin_name || o.admin_email}</p>
                  ) : null}
                </button>
                <div className="flex items-center gap-1 border-t border-gray-100 px-2 py-1.5">
                  {suspended ? (
                    <button type="button" disabled={busy} onClick={() => onReactivate(o)} aria-label={`Reactivate ${o.name}`}
                      className="flex items-center gap-1 px-2 py-1 text-xs font-semibold text-emerald-700 hover:bg-emerald-50 rounded-lg disabled:opacity-50">
                      <RefreshCw className="w-3.5 h-3.5" /> Reactivate
                    </button>
                  ) : (
                    <button type="button" disabled={busy} onClick={() => onSuspend(o)} aria-label={`Suspend ${o.name}`}
                      className="flex items-center gap-1 px-2 py-1 text-xs font-semibold text-orange-700 hover:bg-orange-50 rounded-lg disabled:opacity-50">
                      <Ban className="w-3.5 h-3.5" /> Suspend
                    </button>
                  )}
                  <button type="button" disabled={busy} onClick={() => onResetPassword(o)} aria-label={`Reset admin password for ${o.name}`}
                    className="flex items-center gap-1 px-2 py-1 text-xs font-semibold text-amber-700 hover:bg-amber-50 rounded-lg disabled:opacity-50">
                    <Unlock className="w-3.5 h-3.5" /> Reset password
                  </button>
                  <button type="button" disabled={busy} onClick={() => onDelete(o)} aria-label={`Delete ${o.name}`}
                    className="ml-auto flex items-center gap-1 px-2 py-1 text-xs font-semibold text-red-600 hover:bg-red-50 rounded-lg disabled:opacity-50">
                    <Trash2 className="w-3.5 h-3.5" /> Delete
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

const EMPTY_ORG = { organization: "", admin_name: "", admin_email: "", plan_code: "core", billing_cycle: "monthly", industry: "", country: "" };

function CreateOrganizationDialog({ onClose, onCreated }) {
  const [form, setForm] = useState(EMPTY_ORG);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const input = "w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500";

  async function submit(e) {
    e.preventDefault();
    if (pending) return;
    setPending(true);
    setError("");
    try {
      const body = { ...form };
      ["industry", "country"].forEach((k) => { if (!body[k].trim()) delete body[k]; });
      onCreated(await superAdminService.createOrganization(body));
    } catch (err) {
      setError(err.message || "Could not create the organization.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="Create organization"
      onClick={() => { if (!pending) onClose(); }}>
      <form onSubmit={submit} className="bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4 p-6 max-h-[92vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-bold text-gray-900">Create organization</h2>
        <p className="text-xs text-gray-500 mt-0.5">Creates the organization and its first administrator, and starts an evaluation.</p>
        {error && <div className="mt-3 px-3 py-2 bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl" role="alert">{error}</div>}
        <fieldset disabled={pending} className="mt-4 space-y-3">
          <label className="block text-sm font-semibold text-gray-700">Organization name <span className="text-red-500">*</span>
            <input className={`${input} mt-1 font-normal`} required maxLength={200} value={form.organization} onChange={set("organization")} placeholder="Acme Ltd" />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block text-sm font-semibold text-gray-700">Admin name <span className="text-red-500">*</span>
              <input className={`${input} mt-1 font-normal`} required maxLength={200} value={form.admin_name} onChange={set("admin_name")} placeholder="Jane Smith" />
            </label>
            <label className="block text-sm font-semibold text-gray-700">Admin email <span className="text-red-500">*</span>
              <input className={`${input} mt-1 font-normal`} required type="email" value={form.admin_email} onChange={set("admin_email")} placeholder="jane@acme.com" />
            </label>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <label className="block text-sm font-semibold text-gray-700">Plan
              <select className={`${input} mt-1 font-normal`} value={form.plan_code} onChange={set("plan_code")}>
                <option value="core">Core</option>
                <option value="advanced">Advanced</option>
              </select>
            </label>
            <label className="block text-sm font-semibold text-gray-700">Billing cycle
              <select className={`${input} mt-1 font-normal`} value={form.billing_cycle} onChange={set("billing_cycle")}>
                <option value="monthly">Monthly</option>
                <option value="annual">Annual</option>
              </select>
            </label>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <label className="block text-sm font-semibold text-gray-700">Industry
              <input className={`${input} mt-1 font-normal`} maxLength={100} value={form.industry} onChange={set("industry")} />
            </label>
            <label className="block text-sm font-semibold text-gray-700">Country
              <input className={`${input} mt-1 font-normal`} maxLength={100} value={form.country} onChange={set("country")} />
            </label>
          </div>
        </fieldset>
        <div className="flex justify-end gap-3 mt-5">
          <button type="button" onClick={onClose} disabled={pending}
            className="px-4 py-2 text-sm font-semibold text-gray-700 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 disabled:opacity-50">Cancel</button>
          <button type="submit" disabled={pending}
            className="px-5 py-2 text-sm font-semibold text-white bg-blue-600 rounded-xl hover:bg-blue-700 disabled:opacity-50">
            {pending ? "Creating…" : "Create organization"}
          </button>
        </div>
      </form>
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
  const [roleOptions, setRoleOptions] = useState([]);
  const ROLE_OPTIONS = roleOptions;
  const canCreateUsers = roleOptions.length > 0;
  const roleInfo = (value) => roleOptions.find((r) => r.value === value);
  const roleLabel = (value) => roleInfo(value)?.label || ROLE_LABELS[value] || value;

  const [users, setUsers] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [selectedOrg, setSelectedOrg] = useState(null); // super admin: users are listed one organization at a time
  const [orgsLoading, setOrgsLoading] = useState(false);
  const [orgBusyId, setOrgBusyId] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [showModal, setShowModal] = useState(false);
  const [editId, setEditId] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [formData, setFormData] = useState({ ...initialForm });
  const [formErrors, setFormErrors] = useState({});
  const [createdPassword, setCreatedPassword] = useState(null);
  const [showPassword, setShowPassword] = useState(false);
  const [confirmDialog, setConfirmDialog] = useState({ open: false });
  const [deleteOrgTarget, setDeleteOrgTarget] = useState(null);
  const [showCreateOrg, setShowCreateOrg] = useState(false);
  const [resetTarget, setResetTarget] = useState(null);
  const [resetMethod, setResetMethod] = useState("link");
  const [resetPending, setResetPending] = useState(false);
  const [resetError, setResetError] = useState("");
  const [copied, setCopied] = useState(false);
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
    if (isSuperAdmin && !selectedOrg) {
      setUsers([]);
      setTotal(0);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      if (isSuperAdmin) {
        const data = await superAdminService.getUsers({
          page: currentPage,
          page_size: ITEMS_PER_PAGE,
          search: search || undefined,
          role: roleFilter || undefined,
          status: statusFilter || undefined,
          organization_id: selectedOrg.id,
        });
        const filteredUsers = (data.users || []).filter((u) => u.id !== user?.id);
        setUsers(filteredUsers);
        // Your own row is hidden here, so do not count it in the total either.
        setTotal(Math.max(0, (data.total || 0) - ((data.users || []).length - filteredUsers.length)));
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
  }, [currentPage, search, roleFilter, statusFilter, selectedOrg, isSuperAdmin]);

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

  const openOrganization = (org) => {
    setSelectedOrg({ id: org.id, name: org.name });
    setSearch("");
    setRoleFilter("");
    setStatusFilter("");
    setCurrentPage(1);
  };

  const closeOrganization = () => {
    setSelectedOrg(null);
    setError(null);
    fetchOrganizations().then(setOrganizations); // counts may have changed
  };

  const openCreate = () => {
    resetForm();
    setCreatedPassword(null);
    setFormData((prev) => ({ ...prev, role: getDefaultRole(), organization_id: selectedOrg ? String(selectedOrg.id) : "" }));
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
      confirm_super_admin: false,
    });
    setFormErrors({});
    setShowModal(true);
  };

  const fetchOrganizations = async () => {
    try {
      setOrgsLoading(true);
      const data = await superAdminService.getOrganizations({ page_size: 200 });
      return data.organizations || [];
    } catch (err) {
      setToast({ message: "Failed to fetch organizations", type: "error" });
      return [];
    } finally {
      setOrgsLoading(false);
    }
  };

  const [organizations, setOrganizations] = useState([]);

  useEffect(() => {
    if (isSuperAdmin) {
      fetchOrganizations().then(setOrganizations);
    }
  }, [isSuperAdmin]);

  useEffect(() => {
    let cancelled = false;
    getAssignableRoles()
      .then((res) => { if (!cancelled) setRoleOptions(res.roles || []); })
      .catch((err) => { if (!cancelled) setToast({ message: err.message || "Failed to load roles", type: "error" }); });
    return () => { cancelled = true; };
  }, []);

  const getDefaultRole = () => {
    const preferred = roleOptions.find((r) => r.value === "employee") || roleOptions[0];
    return preferred ? preferred.value : "";
  };

  const selectedRole = roleInfo(formData.role);
  const needsOrganization = isSuperAdmin && selectedRole?.scope === "organization";
  const isPlatformRole = selectedRole?.scope === "platform";

  const validate = () => {
    const errors = {};
    if (!formData.email.trim()) errors.email = "Email is required";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) errors.email = "Invalid email";
    if (!formData.first_name.trim()) errors.first_name = "First name is required";
    if (!formData.last_name.trim()) errors.last_name = "Last name is required";
    if (!formData.role) errors.role = "Role is required";
    if (!editId && needsOrganization && !formData.organization_id) errors.organization_id = "Select an organization for this role";
    if (!editId && isPlatformRole && !formData.confirm_super_admin) errors.confirm_super_admin = "Confirm that this person should get full platform access";
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
      };
      if (editId) {
        await updateUser(editId, payload);
        setToast({ message: "User updated successfully.", type: "success" });
        setShowModal(false);
        resetForm();
      } else {
        if (needsOrganization) payload.organization_id = parseInt(formData.organization_id);
        if (isPlatformRole) payload.confirm_super_admin = true;
        const res = await createUser(payload);
        setShowModal(false);
        setCreatedPassword(res.temporary_password || null);
        setToast({ message: res.message || "User created successfully.", type: "success" });
        resetForm();
      }
      await fetchUsers();
    } catch (err) {
      setFormErrors({ submit: err.message || "Failed to save user" });
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

  // Deleting an organization from here is the same soft delete the Organizations
  // page uses (one service, one endpoint), then this list re-reads from the server.
  const handleOrganizationDeleted = async (res) => {
    const name = deleteOrgTarget?.name;
    const deletedId = deleteOrgTarget?.id;
    setDeleteOrgTarget(null);
    fetchOrganizations().then(setOrganizations);
    if (deletedId && selectedOrg?.id === deletedId) {
      setSelectedOrg(null); // the organization is gone; go back to the list
      setToast({ message: res?.message || `Organization "${name}" was deleted.`, type: "success" });
      return;
    }
    setToast({ message: res?.message || `Organization "${name}" was deleted.`, type: "success" });
    await fetchUsers();
  };

  const handleOrganizationCreated = async (res) => {
    setShowCreateOrg(false);
    setShowPassword(false);
    setCopied(false);
    setCreatedPassword(res.temporary_password || null);
    setToast({ message: res.message || `Organization "${res.organization_name}" was created.`, type: "success" });
    fetchOrganizations().then(setOrganizations);
    await fetchUsers();
  };

  const refreshOrganizations = () => fetchOrganizations().then(setOrganizations);

  const handleSuspendOrganization = (org) => setConfirmDialog({
    open: true, danger: true, title: "Suspend organization",
    message: `Suspend ${org.name}? Its users will be blocked from signing in until it is reactivated. Nothing is deleted.`,
    confirmLabel: "Suspend",
    onCancel: () => setConfirmDialog({ open: false }),
    onConfirm: async () => {
      setConfirmDialog({ open: false });
      setOrgBusyId(org.id);
      try {
        const token = await superAdminService.mintConfirmationToken(org.id, "update_organization_status");
        await superAdminService.updateOrganizationStatus(org.id, {
          status: "suspended", confirmation_id: token.confirmation_id, confirmation_token: token.token,
        });
        setToast({ message: `${org.name} was suspended.`, type: "success" });
        await refreshOrganizations();
      } catch (err) {
        setToast({ message: err.message || "Could not suspend the organization.", type: "error" });
      } finally {
        setOrgBusyId(null);
      }
    },
  });

  const handleReactivateOrganization = (org) => setConfirmDialog({
    open: true, title: "Reactivate organization",
    message: `Reactivate ${org.name}? Its users will be able to sign in again.`,
    confirmLabel: "Reactivate",
    onCancel: () => setConfirmDialog({ open: false }),
    onConfirm: async () => {
      setConfirmDialog({ open: false });
      setOrgBusyId(org.id);
      try {
        await superAdminService.reactivateOrganization(org.id);
        setToast({ message: `${org.name} was reactivated.`, type: "success" });
        await refreshOrganizations();
      } catch (err) {
        setToast({ message: err.message || "Could not reactivate the organization.", type: "error" });
      } finally {
        setOrgBusyId(null);
      }
    },
  });

  // Reset the password of the organization's administrator, through the same dialog as a user reset.
  const handleResetOrganizationAdmin = async (org) => {
    setOrgBusyId(org.id);
    try {
      const data = await superAdminService.getUsers({ organization_id: org.id, role: "admin", page_size: 5 });
      const admin = (data.users || []).find((u) => u.id !== user?.id && u.is_active !== false) || (data.users || [])[0];
      if (!admin) {
        setToast({ message: `${org.name} has no organization admin to reset.`, type: "error" });
        return;
      }
      handleResetPassword(admin);
    } catch (err) {
      setToast({ message: err.message || "Could not find the organization admin.", type: "error" });
    } finally {
      setOrgBusyId(null);
    }
  };

  const handleResetPassword = (target) => {
    setResetTarget(target);
    setResetMethod("link");
    setResetError("");
  };

  const submitReset = async () => {
    if (resetPending || !resetTarget) return;
    setResetPending(true);
    setResetError("");
    try {
      const res = await resetPassword(resetTarget.id, resetMethod);
      const target = resetTarget;
      setResetTarget(null);
      if (res.temporary_password) {
        setShowPassword(false);
        setCopied(false);
        setCreatedPassword(res.temporary_password);
        setToast({ message: `Temporary password set for ${target.email}. Share it securely.`, type: "success" });
      } else {
        setToast({ message: `Reset link sent to ${target.email}.`, type: "success" });
      }
    } catch (err) {
      setResetError(err.message || "Failed to reset password.");
    } finally {
      setResetPending(false);
    }
  };

  const copyPassword = async () => {
    try {
      await navigator.clipboard.writeText(createdPassword);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  const stats = isSuperAdmin ? [
    { label: "Total Users", value: total, color: "text-blue-600", bg: "bg-blue-50", icon: Users },
    { label: "Active", value: users.filter((u) => u.is_active !== false).length, color: "text-emerald-600", bg: "bg-emerald-50", icon: UserCheck },
    { label: "Inactive", value: users.filter((u) => u.is_active === false).length, color: "text-red-500", bg: "bg-red-50", icon: UserX },
  ] : [
    { label: "Total Users", value: users.length, color: "text-blue-600", bg: "bg-blue-50", icon: Users },
    { label: "Active", value: users.filter((u) => u.is_active !== false).length, color: "text-emerald-600", bg: "bg-emerald-50", icon: UserCheck },
    { label: "Inactive", value: users.filter((u) => u.is_active === false).length, color: "text-red-500", bg: "bg-red-50", icon: UserX },
  ];

  const showOrgPicker = isSuperAdmin && !selectedOrg;

  if (loading && users.length === 0 && !showOrgPicker) {
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
    <div className="bg-gray-50">
      <Toast message={toast.message} type={toast.type} onClose={() => setToast({ message: null })} />
      <ConfirmDialog {...confirmDialog} />

      <header className="bg-white border-b border-gray-200">
        <div className="px-4 sm:px-6">
          <div className="py-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
            <button type="button" onClick={() => (selectedOrg ? closeOrganization() : navigate(-1))}
              aria-label={selectedOrg ? "Back to all organizations" : "Back to previous page"}
              title={selectedOrg ? "Back to all organizations" : "Back to previous page"}
              className="p-2 text-gray-500 hover:text-gray-800 bg-white border border-gray-200 hover:bg-gray-50 rounded-xl transition-all">
              <ArrowLeft className="w-4 h-4" />
            </button>
            <div>
              <h1 className="text-xl font-bold text-gray-900 tracking-tight">User Management</h1>
              <p className="mt-1 text-sm text-gray-500">
                {isSuperAdmin ? (selectedOrg ? `Users of ${selectedOrg.name}.` : "Choose an organization to see and manage its users.") : "Manage organization users and their roles."}
              </p>
            </div>
            </div>
            <div className="flex items-center gap-2">
              {isSuperAdmin && (
                <button onClick={() => setShowCreateOrg(true)} className="bg-white hover:bg-gray-50 text-blue-700 border border-blue-200 text-sm font-semibold px-4 py-2.5 rounded-xl transition-all flex items-center gap-2">
                  <Building2 className="w-4 h-4" /> Add Organization
                </button>
              )}
              {canCreateUsers && (
                <button onClick={openCreate} className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold px-5 py-2.5 rounded-xl transition-all flex items-center gap-2 shadow-sm shadow-blue-600/25 hover:shadow-md hover:shadow-blue-600/30">
                  <Plus className="w-4 h-4" /> Add User
                </button>
              )}
            </div>
          </div>
        </div>
      </header>

      <main className="px-4 sm:px-6 py-4">
        <div className="space-y-4">
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

          {showOrgPicker ? (
            <OrganizationPicker organizations={organizations} loading={orgsLoading} busyId={orgBusyId} onOpen={openOrganization}
              onSuspend={handleSuspendOrganization} onReactivate={handleReactivateOrganization}
              onResetPassword={handleResetOrganizationAdmin} onDelete={(o) => setDeleteOrgTarget({ id: o.id, name: o.name })} />
          ) : (
          <>
          {isSuperAdmin && selectedOrg && (
            <nav className="flex items-center gap-2 text-sm" aria-label="Breadcrumb">
              <button type="button" onClick={closeOrganization} className="font-semibold text-blue-600 hover:underline">All organizations</button>
              <span className="text-gray-300">/</span>
              <span className="flex items-center gap-1.5 font-semibold text-gray-800"><Building2 className="w-4 h-4 text-gray-400" />{selectedOrg.name}</span>
            </nav>
          )}

          {stats && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {stats.map((s) => {
                const Icon = s.icon;
                return (
                  <div key={s.label} className="bg-white rounded-xl border border-gray-100 shadow-sm px-4 py-2">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">{s.label}</p>
                        <p className={`text-xl font-bold leading-tight ${s.color}`}>{s.value ?? "-"}</p>
                      </div>
                      <div className={`w-9 h-9 rounded-xl ${s.bg} flex items-center justify-center`}>
                        <Icon className={`w-4 h-4 ${s.color}`} />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <div className="bg-white rounded-xl border border-gray-100 shadow-sm px-4 py-3">
            <div className="flex flex-wrap items-center gap-3">
              <div className="relative flex-1 min-w-[200px]">
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
              {(
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
              <table className="w-full table-fixed text-sm">
                <thead>
                  <tr className="bg-gray-50/80 border-b border-gray-200 text-left text-[11px] font-semibold uppercase tracking-wider text-gray-500">
                    <th className="px-4 py-2.5 w-[30%]">User</th>
                    {isSuperAdmin && !selectedOrg && <th className="px-3 py-2.5 w-[18%]">Organization</th>}
                    <th className="px-3 py-2.5 w-[18%]">Role</th>
                    <th className="px-3 py-2.5 w-[13%]">Status</th>
                    <th className="px-3 py-2.5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {users.map((u) => {
                    const statusKey = (u.status || (u.is_active ? "active" : "inactive")).toLowerCase();
                    const st = STATUS_STYLES[statusKey] || STATUS_STYLES.inactive;
                    const StatusIcon = st.icon;
                    const isSelf = u.id === user?.id;
                    return (
                      <tr key={u.id} className="hover:bg-gray-50/50 transition-colors">
                        <td className="px-4 py-2">
                          <div className="flex items-center gap-2.5 min-w-0">
                            <div className="w-8 h-8 shrink-0 bg-gradient-to-br from-blue-500 to-blue-600 rounded-lg flex items-center justify-center">
                              <span className="text-white font-semibold text-xs">{u.first_name?.charAt(0)}{u.last_name?.charAt(0)}</span>
                            </div>
                            <div className="min-w-0">
                              <p className="font-semibold text-gray-900 truncate" title={`${u.first_name} ${u.last_name}`}>{u.first_name} {u.last_name}</p>
                              <p className="text-xs text-gray-500 truncate" title={u.email}>{u.email}</p>
                            </div>
                          </div>
                        </td>
                        {isSuperAdmin && !selectedOrg && (
                          <td className="px-3 py-2">
                            <span className="flex items-center gap-1.5 min-w-0 text-gray-700 font-medium" title={u.organization_name || ""}>
                              <Building2 className="w-3.5 h-3.5 shrink-0 text-gray-400" />
                              <span className="truncate">{u.organization_name || "-"}</span>
                            </span>
                          </td>
                        )}
                        <td className="px-3 py-2">
                          <span title={u.job_title || undefined} className={`inline-flex items-center px-2 py-0.5 text-xs font-semibold rounded-full ring-1 ring-inset ${ROLE_BADGES[u.role] || "bg-gray-100 text-gray-800 ring-gray-200"}`}>
                            {roleLabel(u.role)}
                          </span>
                        </td>
                        <td className="px-3 py-2">
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs font-semibold rounded-full ring-1 ring-inset ${st.class}`}>
                            <StatusIcon className="w-3 h-3" />
                            {statusKey.charAt(0).toUpperCase() + statusKey.slice(1)}
                          </span>
                        </td>
                        <td className="px-3 py-2">
                          <div className="flex items-center justify-end gap-0.5">
                            <button onClick={() => openEdit(u)} className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all" title="Edit user" aria-label={`Edit ${u.first_name} ${u.last_name}`}>
                              <Edit className="w-4 h-4" />
                            </button>
                            <button onClick={() => handleResetPassword(u)} disabled={isSelf}
                              className="p-1.5 text-gray-400 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                              title={isSelf ? "Use account settings to change your own password" : "Reset password"}
                              aria-label={`Reset password for ${u.first_name} ${u.last_name}`}>
                              <Unlock className="w-4 h-4" />
                            </button>
                            <RowMenu label={`More actions for ${u.first_name} ${u.last_name}`}>
                              {u.is_active !== false && u.status !== "suspended" ? (
                                <>
                                  <MenuItem icon={UserX} onClick={() => handleDeactivate(u)}>Deactivate</MenuItem>
                                  <MenuItem icon={Ban} onClick={() => handleSuspend(u)}>Suspend</MenuItem>
                                </>
                              ) : (
                                <MenuItem icon={RefreshCw} onClick={() => handleActivate(u)}>Activate</MenuItem>
                              )}
                              <MenuItem icon={Archive} onClick={() => handleArchive(u)}>Archive</MenuItem>
                              <MenuItem icon={Trash2} danger onClick={() => handleDelete(u)}>Delete user</MenuItem>
                              {isSuperAdmin && u.organization_id && (
                                <MenuItem icon={Building2} danger onClick={() => setDeleteOrgTarget({ id: u.organization_id, name: u.organization_name })}>Delete organization</MenuItem>
                              )}
                            </RowMenu>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              {totalPages > 1 && (
                <div className="flex flex-col sm:flex-row justify-between items-center px-4 py-2.5 border-t border-gray-100 bg-gray-50/30 gap-3">
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
          </>
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
                    {selectedRole && <p className="text-xs text-gray-500 mt-1.5">{selectedRole.description}</p>}
                    {formErrors.role && <p className="text-xs text-red-500 mt-1.5 font-medium">{formErrors.role}</p>}
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-1.5">Phone</label>
                    <input type="text" value={formData.phone} onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                      className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
                      placeholder="+1-555-0100" />
                  </div>
                </div>
                {isPlatformRole && !editId && (
                  <label className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
                    <input type="checkbox" className="mt-0.5" checked={formData.confirm_super_admin}
                      onChange={(e) => setFormData({ ...formData, confirm_super_admin: e.target.checked })} />
                    <span>
                      I understand this account will have full access to every organization. This action is audit-logged.
                      {formErrors.confirm_super_admin && <span className="block text-red-600 font-medium mt-1">{formErrors.confirm_super_admin}</span>}
                    </span>
                  </label>
                )}
                {needsOrganization && !editId && (
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

        {showCreateOrg && <CreateOrganizationDialog onClose={() => setShowCreateOrg(false)} onCreated={handleOrganizationCreated} />}

        {deleteOrgTarget && (
          <DeleteOrganizationDialog org={deleteOrgTarget} onClose={() => setDeleteOrgTarget(null)} onDeleted={handleOrganizationDeleted} />
        )}

        {resetTarget && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="Reset password"
            onClick={() => { if (!resetPending) setResetTarget(null); }}>
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 p-6" onClick={(e) => e.stopPropagation()}>
              <h2 className="text-lg font-bold text-gray-900">Reset password</h2>
              <p className="text-sm text-gray-600 mt-1">
                {resetTarget.first_name} {resetTarget.last_name} · <span className="font-mono">{resetTarget.email}</span>
              </p>
              {resetError && (
                <div className="mt-4 px-4 py-3 bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl" role="alert">
                  {resetError}
                  {resetMethod === "link" && /email/i.test(resetError) && (
                    <button type="button" onClick={() => { setResetMethod("temporary"); setResetError(""); }}
                      className="mt-2 block text-xs font-semibold text-red-800 underline">
                      Email is unavailable - set a temporary password instead
                    </button>
                  )}
                </div>
              )}
              <fieldset className="mt-4 space-y-2" disabled={resetPending}>
                <label className={`flex items-start gap-3 rounded-xl border p-3 cursor-pointer ${resetMethod === "link" ? "border-blue-500 bg-blue-50" : "border-gray-200"}`}>
                  <input type="radio" name="reset-method" className="mt-1" checked={resetMethod === "link"} onChange={() => setResetMethod("link")} />
                  <span><span className="block text-sm font-semibold text-gray-900">Email a reset link (recommended)</span>
                    <span className="block text-xs text-gray-500">The user gets a single-use link valid for 60 minutes and chooses their own password.</span></span>
                </label>
                <label className={`flex items-start gap-3 rounded-xl border p-3 cursor-pointer ${resetMethod === "temporary" ? "border-blue-500 bg-blue-50" : "border-gray-200"}`}>
                  <input type="radio" name="reset-method" className="mt-1" checked={resetMethod === "temporary"} onChange={() => setResetMethod("temporary")} />
                  <span><span className="block text-sm font-semibold text-gray-900">Set a temporary password</span>
                    <span className="block text-xs text-gray-500">Shown to you once. The user must change it at next sign-in.</span></span>
                </label>
              </fieldset>
              <p className="text-xs text-gray-400 mt-3">Either way, the user's current sessions are signed out and the action is audit-logged.</p>
              <div className="flex justify-end gap-3 mt-5">
                <button onClick={() => setResetTarget(null)} disabled={resetPending}
                  className="px-4 py-2.5 text-sm font-semibold text-gray-700 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 disabled:opacity-50">Cancel</button>
                <button onClick={submitReset} disabled={resetPending}
                  className="px-5 py-2.5 text-sm font-semibold text-white bg-blue-600 rounded-xl hover:bg-blue-700 disabled:opacity-50">
                  {resetPending ? "Working…" : resetMethod === "link" ? "Send reset link" : "Set temporary password"}
                </button>
              </div>
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
                  <p className="text-sm text-gray-500 mt-0.5">Shown once. Share it securely; the user must change it at next sign-in.</p>
                </div>
              </div>
              <div className="bg-gray-50 border border-gray-200 rounded-xl px-4 py-3.5 mb-5">
                <div className="flex justify-between items-center">
                  <code className="text-sm font-mono font-bold text-gray-800 select-all">
                    {showPassword ? createdPassword : "••••••••••••"}
                  </code>
                  <div className="flex items-center gap-1">
                    <button onClick={copyPassword} className="px-2.5 py-1.5 text-xs font-semibold text-gray-600 hover:bg-gray-100 rounded-lg transition-all">{copied ? "Copied" : "Copy"}</button>
                    <button onClick={() => setShowPassword(!showPassword)} className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-all" aria-label="Toggle password visibility">
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
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
