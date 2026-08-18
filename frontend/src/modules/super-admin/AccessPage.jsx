import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  Shield, Users, Building2, Search, ChevronDown, ChevronLeft, ChevronRight,
  Clock, AlertTriangle, CheckCircle2, UserCog, Eye, Activity, Filter, SlidersHorizontal,
} from "lucide-react";
import { superAdminService } from "../../service/superAdminService";
import EvaluationTimeRemaining from "../../components/EvaluationTimeRemaining";

export default function AccessPage() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState("organizations");
  const [organizations, setOrganizations] = useState([]);
  const [users, setUsers] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("All statuses");
  const [roleFilter, setRoleFilter] = useState("All roles");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const ROLE_OPTIONS = ["All roles", "ADMIN", "HR_ADMIN", "MANAGER", "EMPLOYEE"];
  const STATUS_OPTIONS = ["All statuses", "PENDING", "ACTIVE", "APPROVED", "REJECTED", "SUSPENDED", "DEACTIVATED"];

  const STATUS_META = {
    PENDING: { label: "Pending", bg: "bg-amber-50", text: "text-amber-600", border: "border-amber-200/60", dot: "bg-amber-500" },
    ACTIVE: { label: "Active", bg: "bg-emerald-50", text: "text-emerald-600", border: "border-emerald-200/60", dot: "bg-emerald-500" },
    APPROVED: { label: "Approved", bg: "bg-blue-50", text: "text-blue-600", border: "border-blue-200/60", dot: "bg-blue-500" },
    REJECTED: { label: "Rejected", bg: "bg-red-50", text: "text-red-600", border: "border-red-200/60", dot: "bg-red-500" },
    SUSPENDED: { label: "Suspended", bg: "bg-slate-100", text: "text-slate-600", border: "border-slate-200/60", dot: "bg-slate-400" },
    DEACTIVATED: { label: "Deactivated", bg: "bg-blue-50", text: "text-blue-600", border: "border-blue-200/60", dot: "bg-blue-500" },
    ON_HOLD: { label: "On Hold", bg: "bg-amber-50", text: "text-amber-600", border: "border-amber-200/60", dot: "bg-amber-500" },
  };

  const StatusBadge = ({ status }) => {
    const meta = STATUS_META[status?.toUpperCase()] || { label: status, bg: "bg-slate-50", text: "text-slate-600", border: "border-slate-200/60", dot: "bg-slate-400" };
    return (
      <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold ${meta.bg} ${meta.text} border ${meta.border}`}>
        <span className={`w-1.5 h-1.5 rounded-full ${meta.dot}`} />
        {meta.label}
      </span>
    );
  };

  const PLAN_META = {
    Core: { bg: "bg-slate-100", text: "text-slate-700", border: "border-slate-200/60" },
    Advanced: { bg: "bg-violet-50", text: "text-violet-600", border: "border-violet-200/60" },
    Enterprise: { bg: "bg-amber-50", text: "text-amber-700", border: "border-amber-200/60" },
    Evaluation: { bg: "bg-blue-50", text: "text-blue-600", border: "border-blue-200/60" },
  };

  const PlanBadge = ({ plan }) => {
    if (!plan) return <span className="text-xs font-medium text-slate-400">—</span>;
    const meta = PLAN_META[plan] || { bg: "bg-slate-50", text: "text-slate-600", border: "border-slate-200/60" };
    return (
      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-xl text-[11px] font-semibold border ${meta.bg} ${meta.text} ${meta.border}`}>
        {plan}
      </span>
    );
  };

  const ROLE_META = {
    ADMIN: { bg: "bg-amber-50", text: "text-amber-700", border: "border-amber-200/60" },
    HR_ADMIN: { bg: "bg-blue-50", text: "text-blue-600", border: "border-blue-200/60" },
    MANAGER: { bg: "bg-violet-50", text: "text-violet-600", border: "border-violet-200/60" },
    EMPLOYEE: { bg: "bg-emerald-50", text: "text-emerald-600", border: "border-emerald-200/60" },
  };

  const RoleBadge = ({ role }) => {
    if (!role) return <span className="text-xs font-medium text-slate-400">—</span>;
    const meta = ROLE_META[role] || { bg: "bg-slate-50", text: "text-slate-600", border: "border-slate-200/60" };
    return (
      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-xl text-[11px] font-semibold border ${meta.bg} ${meta.text} ${meta.border}`}>
        {role.replace("_", " ")}
      </span>
    );
  };

  const AVATAR_GRADIENTS = [
    "from-pink-500 to-rose-500", "from-amber-500 to-orange-500",
    "from-violet-500 to-indigo-500", "from-emerald-500 to-teal-500",
    "from-blue-500 to-cyan-500", "from-red-500 to-pink-500",
    "from-fuchsia-500 to-purple-500", "from-sky-500 to-blue-500",
  ];

  const getAvatar = (name = "") => {
    const clean = name.trim();
    const words = clean.split(/\s+/).filter(Boolean);
    const initials = words.length > 1 ? (words[0][0] + words[1][0]) : clean.slice(0, 2);
    let hash = 0;
    for (let i = 0; i < clean.length; i++) hash = (hash * 31 + clean.charCodeAt(i)) >>> 0;
    const gradient = AVATAR_GRADIENTS[hash % AVATAR_GRADIENTS.length];
    return { initials: initials.toUpperCase(), gradient };
  };

  const loadOrgs = useCallback(async () => {
    setLoading(true);
    try {
      setError(null);
      const params = { page, page_size: pageSize };
      if (searchTerm) params.search = searchTerm;
      if (statusFilter !== "All statuses") params.status = statusFilter.toLowerCase();
      const data = await superAdminService.getOrganizations(params);
      setOrganizations(data.organizations || []);
      setTotal(data.total || 0);
    } catch (e) {
      setError(e.message || "Failed to load organizations");
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, searchTerm, statusFilter]);

  const loadUsers = useCallback(async () => {
    setLoading(true);
    try {
      setError(null);
      const params = { page, page_size: pageSize };
      if (searchTerm) params.search = searchTerm;
      if (roleFilter !== "All roles") params.role = roleFilter;
      if (statusFilter !== "All statuses") params.status = statusFilter;
      const data = await superAdminService.getUsers(params);
      setUsers(data.users || []);
      setTotal(data.total || 0);
    } catch (e) {
      setError(e.message || "Failed to load users");
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, searchTerm, statusFilter, roleFilter]);

  useEffect(() => {
    setPage(1);
  }, [searchTerm, statusFilter, roleFilter]);

  useEffect(() => {
    if (activeTab === "organizations") loadOrgs();
    else loadUsers();
  }, [activeTab, loadOrgs, loadUsers]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const maxVisiblePages = 5;
  let startPage = Math.max(1, page - Math.floor(maxVisiblePages / 2));
  let endPage = Math.min(totalPages, startPage + maxVisiblePages - 1);
  if (endPage - startPage + 1 < maxVisiblePages) startPage = Math.max(1, endPage - maxVisiblePages + 1);
  const visiblePages = Array.from({ length: endPage - startPage + 1 }, (_, i) => startPage + i);

  if (loading && organizations.length === 0 && users.length === 0) {
    return (
      <div className="min-h-screen bg-slate-50/60 p-6 sm:p-10 text-slate-800 font-sans antialiased">
        <div className="max-w-7xl mx-auto space-y-6">
          <div className="p-8 bg-white/80 backdrop-blur-md border border-slate-200/80 rounded-3xl shadow-sm">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-slate-900 text-white rounded-2xl shadow-sm">
                <Shield className="w-6 h-6" />
              </div>
              <div>
                <div className="h-8 w-56 bg-slate-100 rounded-xl animate-pulse" />
                <div className="h-4 w-64 bg-slate-100 rounded-lg animate-pulse mt-2" />
              </div>
            </div>
          </div>
          <div className="space-y-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-16 bg-white border border-slate-200/80 rounded-2xl animate-pulse" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50/60 p-6 sm:p-10 text-slate-800 font-sans antialiased">
      <div className="max-w-7xl mx-auto space-y-6">

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-8 bg-white/80 backdrop-blur-md border border-slate-200/80 rounded-3xl shadow-sm">
          <div>
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-slate-900 text-white rounded-2xl shadow-sm">
                <Shield className="w-6 h-6" />
              </div>
              <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900">
                Access & Role Management
              </h1>
            </div>
            <p className="mt-2 text-sm text-slate-500 font-medium ml-1">
              Manage organization plans, roles, and trial status.
            </p>
          </div>
        </div>

        {error && (
          <div className="rounded-3xl border border-red-200 bg-red-50 p-4 text-red-700 text-sm flex items-center gap-3">
            <AlertTriangle className="h-5 w-5 flex-shrink-0" />
            <span>{error}</span>
            <button onClick={() => activeTab === "organizations" ? loadOrgs() : loadUsers()} className="ml-auto text-red-600 underline hover:text-red-800 text-xs font-semibold">Retry</button>
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-2 bg-white border border-slate-200/80 rounded-2xl p-1.5 shadow-sm w-fit">
          {[
            { key: "organizations", label: "Organizations", icon: Building2 },
            { key: "users", label: "Users", icon: Users },
          ].map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all ${
                activeTab === tab.key
                  ? "bg-slate-900 text-white shadow-sm"
                  : "text-slate-500 hover:text-slate-700 hover:bg-slate-50"
              }`}
            >
              <tab.icon className="w-4 h-4" />
              {tab.label}
            </button>
          ))}
        </div>

        {/* Toolbar */}
        <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center bg-white/60 backdrop-blur-sm p-3 rounded-2xl border border-slate-200/80">
          <div className="flex-1 flex items-center gap-2 bg-white border border-slate-200/80 rounded-xl px-3 py-2 shadow-sm">
            <Search className="w-4 h-4 text-slate-400" />
            <input
              type="search"
              placeholder={`Search ${activeTab === "organizations" ? "organizations" : "users"}...`}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="flex-1 bg-transparent text-sm text-slate-700 outline-none placeholder:text-slate-400"
            />
          </div>

          {activeTab === "organizations" ? (
            <div className="relative">
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="appearance-none bg-white border border-slate-200/80 rounded-xl px-3 py-2 pr-8 text-sm font-medium text-slate-700 shadow-sm cursor-pointer hover:border-slate-300 transition-colors"
              >
                {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
              <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
            </div>
          ) : (
            <>
              <div className="relative">
                <select
                  value={roleFilter}
                  onChange={(e) => setRoleFilter(e.target.value)}
                  className="appearance-none bg-white border border-slate-200/80 rounded-xl px-3 py-2 pr-8 text-sm font-medium text-slate-700 shadow-sm cursor-pointer hover:border-slate-300 transition-colors"
                >
                  {ROLE_OPTIONS.map((r) => <option key={r} value={r}>{r}</option>)}
                </select>
                <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
              </div>
              <div className="relative">
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="appearance-none bg-white border border-slate-200/80 rounded-xl px-3 py-2 pr-8 text-sm font-medium text-slate-700 shadow-sm cursor-pointer hover:border-slate-300 transition-colors"
                >
                  {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
                <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
              </div>
            </>
          )}

          <div className="flex items-center gap-2 ml-auto">
            <SlidersHorizontal className="w-4 h-4 text-slate-400" />
            <span className="text-sm font-semibold text-slate-600">{total} {activeTab === "organizations" ? "orgs" : "users"}</span>
          </div>
        </div>

        {/* Content */}
        {activeTab === "organizations" ? (
          organizations.length === 0 ? (
            <div className="text-center py-16 text-slate-400">
              <Building2 className="w-12 h-12 mx-auto mb-3 text-slate-200" />
              <p className="text-sm font-medium">No organizations found</p>
            </div>
          ) : (
            <div className="bg-white border border-slate-200/80 rounded-3xl shadow-sm overflow-hidden">
              {/* Table Header */}
              <div className="hidden lg:grid grid-cols-[2fr_1fr_1fr_1fr_1fr_80px] gap-4 px-6 py-3 border-b border-slate-100 bg-slate-50/50 text-[11px] font-bold uppercase tracking-wider text-slate-400">
                <span>Organization</span>
                <span>Status</span>
                <span>Plan</span>
                <span>Trial Remaining</span>
                <span>Users</span>
                <span></span>
              </div>

              <div className="divide-y divide-slate-100">
                {organizations.map((org) => {
                  const avatar = getAvatar(org.name);
                  const isTrial = org.subscription_plan === "Evaluation" && org.evaluation_ends_at;
                  return (
                    <div key={org.id} className="grid grid-cols-1 lg:grid-cols-[2fr_1fr_1fr_1fr_1fr_80px] gap-3 lg:gap-4 px-6 py-4 hover:bg-slate-50/60 transition-colors items-center">
                      <div className="flex items-center gap-3">
                        <div className={`w-10 h-10 rounded-2xl bg-gradient-to-br ${avatar.gradient} text-white flex items-center justify-center font-bold text-xs shadow-sm ring-2 ring-white shrink-0`}>
                          {avatar.initials}
                        </div>
                        <div className="min-w-0">
                          <div className="font-bold text-slate-900 text-sm truncate">{org.name}</div>
                          <div className="text-xs font-medium text-slate-400">
                            {org.organization_code || "—"} {org.admin_email ? `· ${org.admin_email}` : ""}
                          </div>
                        </div>
                      </div>
                      <div><StatusBadge status={org.status} /></div>
                      <div><PlanBadge plan={org.subscription_plan} /></div>
                      <div>
                        {isTrial ? (
                          <EvaluationTimeRemaining evaluationEndsAt={org.evaluation_ends_at} compact />
                        ) : (
                          <span className="text-xs text-slate-400 font-medium">—</span>
                        )}
                      </div>
                      <div>
                        <span className="text-sm font-bold text-slate-700">{org.total_employees ?? 0}</span>
                        <span className="text-xs text-slate-400 ml-1">users</span>
                      </div>
                      <div>
                        <button onClick={() => navigate(`/super-admin/organizations/${org.id}`)}
                          className="p-2 rounded-xl hover:bg-slate-100 transition-colors text-slate-400 hover:text-slate-600">
                          <Eye className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )
        ) : (
          users.length === 0 ? (
            <div className="text-center py-16 text-slate-400">
              <Users className="w-12 h-12 mx-auto mb-3 text-slate-200" />
              <p className="text-sm font-medium">No users found</p>
            </div>
          ) : (
            <div className="bg-white border border-slate-200/80 rounded-3xl shadow-sm overflow-hidden">
              {/* Table Header */}
              <div className="hidden lg:grid grid-cols-[2fr_1fr_1fr_1fr_1fr_80px] gap-4 px-6 py-3 border-b border-slate-100 bg-slate-50/50 text-[11px] font-bold uppercase tracking-wider text-slate-400">
                <span>User</span>
                <span>Role</span>
                <span>Status</span>
                <span>Organization</span>
                <span>Job Title</span>
                <span></span>
              </div>

              <div className="divide-y divide-slate-100">
                {users.map((user) => {
                  const avatar = getAvatar(user.full_name || `${user.first_name} ${user.last_name}`);
                  return (
                    <div key={user.id} className="grid grid-cols-1 lg:grid-cols-[2fr_1fr_1fr_1fr_1fr_80px] gap-3 lg:gap-4 px-6 py-4 hover:bg-slate-50/60 transition-colors items-center">
                      <div className="flex items-center gap-3">
                        <div className={`w-10 h-10 rounded-2xl bg-gradient-to-br ${avatar.gradient} text-white flex items-center justify-center font-bold text-xs shadow-sm ring-2 ring-white shrink-0`}>
                          {avatar.initials}
                        </div>
                        <div className="min-w-0">
                          <div className="font-bold text-slate-900 text-sm truncate">{user.full_name || `${user.first_name} ${user.last_name}`}</div>
                          <div className="text-xs font-medium text-slate-400 truncate">{user.email}</div>
                        </div>
                      </div>
                      <div><RoleBadge role={user.role} /></div>
                      <div><StatusBadge status={user.status} /></div>
                      <div className="text-sm text-slate-600 truncate">{user.organization_name || "—"}</div>
                      <div className="text-sm text-slate-600 truncate">{user.job_title || "—"}</div>
                      <div>
                        <StatusBadge status={user.is_active ? "ACTIVE" : "DEACTIVATED"} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )
        )}

        {/* Pagination */}
        {total > pageSize && (
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 bg-white border border-slate-200/80 rounded-2xl px-6 py-3 shadow-sm">
            <span className="text-sm text-slate-500 font-medium">
              Showing <span className="font-bold text-slate-900">{(page - 1) * pageSize + 1}</span>–<span className="font-bold text-slate-900">{Math.min(page * pageSize, total)}</span> of <span className="font-bold text-slate-900">{total}</span>
            </span>
            <div className="flex items-center gap-1">
              <button disabled={page <= 1} onClick={() => setPage(page - 1)}
                className="p-2 rounded-xl border border-slate-200/80 text-slate-400 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
                <ChevronLeft className="w-4 h-4" />
              </button>
              {visiblePages.map((p) => (
                <button key={p} onClick={() => setPage(p)}
                  className={`w-9 h-9 rounded-xl text-sm font-bold transition-all ${
                    p === page
                      ? "bg-slate-900 text-white shadow-sm"
                      : "text-slate-500 hover:bg-slate-50 border border-transparent hover:border-slate-200/80"
                  }`}>
                  {p}
                </button>
              ))}
              <button disabled={page >= totalPages} onClick={() => setPage(page + 1)}
                className="p-2 rounded-xl border border-slate-200/80 text-slate-400 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
