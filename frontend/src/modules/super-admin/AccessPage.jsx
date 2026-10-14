import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import {
  Shield, Users, Building2, Search, ChevronDown, ChevronLeft, ChevronRight, AlertTriangle, Eye, SlidersHorizontal,
  UserPlus, X, Loader2, CheckCircle2, Mail, PauseCircle, PlayCircle,
} from "lucide-react";
import { superAdminService } from "../../service/superAdminService";
import EvaluationTimeRemaining from "../../components/EvaluationTimeRemaining";
import OrgPicker from "../../components/OrgPicker";
import { formatDateTime } from "../../utils/dateTime";

const PAGE_SIZE = 20;
const SEARCH_DEBOUNCE_MS = 350;

// Values are what the API stores (lower case); each tab filters on its own status vocabulary.
const ORG_STATUS_OPTIONS = ["pending", "approved", "active", "on_hold", "rejected", "suspended", "deactivated"];
const ADMIN_STATUS_OPTIONS = ["active", "pending", "suspended", "inactive", "locked", "deactivated"];

const STATUS_META = {
  PENDING: { label: "Pending", bg: "bg-amber-50", text: "text-amber-600", border: "border-amber-200/60", dot: "bg-amber-500" },
  ACTIVE: { label: "Active", bg: "bg-emerald-50", text: "text-emerald-600", border: "border-emerald-200/60", dot: "bg-emerald-500" },
  APPROVED: { label: "Approved", bg: "bg-blue-50", text: "text-blue-600", border: "border-blue-200/60", dot: "bg-blue-500" },
  REJECTED: { label: "Rejected", bg: "bg-red-50", text: "text-red-600", border: "border-red-200/60", dot: "bg-red-500" },
  SUSPENDED: { label: "Suspended", bg: "bg-slate-100", text: "text-slate-600", border: "border-slate-200/60", dot: "bg-slate-400" },
  DEACTIVATED: { label: "Deactivated", bg: "bg-slate-100", text: "text-slate-600", border: "border-slate-200/60", dot: "bg-slate-400" },
  INACTIVE: { label: "Inactive", bg: "bg-slate-100", text: "text-slate-600", border: "border-slate-200/60", dot: "bg-slate-400" },
  LOCKED: { label: "Locked", bg: "bg-red-50", text: "text-red-600", border: "border-red-200/60", dot: "bg-red-500" },
  ON_HOLD: { label: "On Hold", bg: "bg-amber-50", text: "text-amber-600", border: "border-amber-200/60", dot: "bg-amber-500" },
};

const statusLabel = (s) => STATUS_META[String(s || "").toUpperCase()]?.label || String(s || "").replace(/_/g, " ");

function StatusBadge({ status }) {
  const meta = STATUS_META[status?.toUpperCase()] || { label: status || "—", bg: "bg-slate-50", text: "text-slate-600", border: "border-slate-200/60", dot: "bg-slate-400" };
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold ${meta.bg} ${meta.text} border ${meta.border}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${meta.dot}`} />
      {meta.label}
    </span>
  );
}

const PLAN_META = {
  Core: { bg: "bg-slate-100", text: "text-slate-700", border: "border-slate-200/60" },
  Advanced: { bg: "bg-violet-50", text: "text-violet-600", border: "border-violet-200/60" },
  Enterprise: { bg: "bg-amber-50", text: "text-amber-700", border: "border-amber-200/60" },
  Evaluation: { bg: "bg-blue-50", text: "text-blue-600", border: "border-blue-200/60" },
};

function PlanBadge({ plan }) {
  if (!plan) return <span className="text-xs font-medium text-slate-400">—</span>;
  const meta = PLAN_META[plan] || { bg: "bg-slate-50", text: "text-slate-600", border: "border-slate-200/60" };
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-xl text-[11px] font-semibold border ${meta.bg} ${meta.text} ${meta.border}`}>
      {plan}
    </span>
  );
}

const AVATAR_GRADIENTS = [
  "from-pink-500 to-rose-500", "from-amber-500 to-orange-500",
  "from-violet-500 to-indigo-500", "from-emerald-500 to-teal-500",
  "from-blue-500 to-cyan-500", "from-red-500 to-pink-500",
  "from-fuchsia-500 to-purple-500", "from-sky-500 to-blue-500",
];

function getAvatar(name = "") {
  const clean = name.trim();
  const words = clean.split(/\s+/).filter(Boolean);
  const initials = words.length > 1 ? (words[0][0] + words[1][0]) : clean.slice(0, 2);
  let hash = 0;
  for (let i = 0; i < clean.length; i++) hash = (hash * 31 + clean.charCodeAt(i)) >>> 0;
  return { initials: (initials || "?").toUpperCase(), gradient: AVATAR_GRADIENTS[hash % AVATAR_GRADIENTS.length] };
}

const selectCls =
  "appearance-none bg-white border border-slate-200/80 rounded-xl px-3 py-2 pr-8 text-sm font-medium text-slate-700 shadow-sm cursor-pointer hover:border-slate-300 transition-colors";
const inputCls =
  "w-full rounded-xl border border-slate-200 bg-white py-2.5 px-4 text-sm text-slate-700 outline-none focus:border-[#3B82F6]";
const labelCls = "mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-500";

export default function AccessPage() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState("organizations");
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");           // the debounced value the query uses
  const [statusFilter, setStatusFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [addOpen, setAddOpen] = useState(false);
  const [reload, setReload] = useState(0);
  const requestSeq = useRef(0);

  // typing -> debounce -> search from page 1
  useEffect(() => {
    if (searchInput.trim() === search) return undefined;
    const t = setTimeout(() => { setSearch(searchInput.trim()); setPage(1); }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [searchInput, search]);

  const switchTab = (key) => {
    if (key === activeTab) return;
    setActiveTab(key);
    setRows([]);
    setTotal(0);
    setPage(1);
    setSearchInput("");
    setSearch("");
    setStatusFilter("");
    setError(null);
  };

  const load = useCallback(async (signal) => {
    const seq = ++requestSeq.current;
    setLoading(true);
    setError(null);
    try {
      const params = { page, page_size: PAGE_SIZE };
      if (search) params.search = search;
      if (statusFilter) params.status = statusFilter;
      const data = activeTab === "organizations"
        ? await superAdminService.getOrganizations(params, { signal })
        : await superAdminService.getUsers(params, { signal });
      if (seq !== requestSeq.current) return;           // a newer request superseded this one
      setRows((activeTab === "organizations" ? data.organizations : data.users) || []);
      setTotal(data.total || 0);
    } catch (e) {
      if (signal?.aborted || seq !== requestSeq.current) return;
      setError(e.message || `Failed to load ${activeTab === "organizations" ? "organizations" : "administrators"}`);
    } finally {
      if (seq === requestSeq.current) setLoading(false);
    }
  }, [activeTab, page, search, statusFilter]);

  useEffect(() => {
    const ctrl = new AbortController();
    load(ctrl.signal);
    return () => ctrl.abort();
  }, [load, reload]);

  const refresh = () => setReload((n) => n + 1);

  const adminAction = async (user, kind) => {
    setBusyId(user.id);
    setError(null);
    try {
      if (kind === "suspend") {
        await superAdminService.suspendTenantAdmin(user.id);
        setNotice(`${user.full_name} suspended. They can no longer sign in.`);
      } else if (kind === "activate") {
        await superAdminService.activateTenantAdmin(user.id);
        setNotice(`${user.full_name} reactivated.`);
      } else if (kind === "reset") {
        const res = await superAdminService.resetTenantAdminPassword(user.id, "link");
        setNotice(res?.message || "Password reset link sent.");
      }
      refresh();
    } catch (e) {
      setError(e.message || "The action failed.");
    } finally {
      setBusyId(null);
    }
  };

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const maxVisiblePages = 5;
  let startPage = Math.max(1, page - Math.floor(maxVisiblePages / 2));
  const endPage = Math.min(totalPages, startPage + maxVisiblePages - 1);
  if (endPage - startPage + 1 < maxVisiblePages) startPage = Math.max(1, endPage - maxVisiblePages + 1);
  const visiblePages = Array.from({ length: endPage - startPage + 1 }, (_, i) => startPage + i);

  const isOrgs = activeTab === "organizations";
  const statusOptions = isOrgs ? ORG_STATUS_OPTIONS : ADMIN_STATUS_OPTIONS;
  const filtered = Boolean(search || statusFilter);

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
              Organizations' status, plan and trial, and the administrator accounts the platform manages for them.
            </p>
          </div>
          {!isOrgs && (
            <button onClick={() => setAddOpen(true)}
              className="flex items-center gap-2 rounded-full bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800">
              <UserPlus className="h-4 w-4" /> Add administrator
            </button>
          )}
        </div>

        {notice && (
          <div className="rounded-3xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-700 text-sm flex items-center gap-3">
            <CheckCircle2 className="h-5 w-5 flex-shrink-0" />
            <span>{notice}</span>
            <button onClick={() => setNotice(null)} className="ml-auto underline text-xs font-semibold">Dismiss</button>
          </div>
        )}

        {error && (
          <div role="alert" className="rounded-3xl border border-red-200 bg-red-50 p-4 text-red-700 text-sm flex items-center gap-3">
            <AlertTriangle className="h-5 w-5 flex-shrink-0" />
            <span>{error}</span>
            <button onClick={refresh} className="ml-auto text-red-600 underline hover:text-red-800 text-xs font-semibold">Retry</button>
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-2 bg-white border border-slate-200/80 rounded-2xl p-1.5 shadow-sm w-fit">
          {[
            { key: "organizations", label: "Organizations", icon: Building2 },
            { key: "admins", label: "Organization admins", icon: Users },
          ].map((tab) => (
            <button
              key={tab.key}
              onClick={() => switchTab(tab.key)}
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
          <div className="flex-1 w-full flex items-center gap-2 bg-white border border-slate-200/80 rounded-xl px-3 py-2 shadow-sm">
            <Search className="w-4 h-4 text-slate-400" />
            <input
              type="search"
              placeholder={isOrgs ? "Search by organization name or code..." : "Search by organization name..."}
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              aria-label="Search"
              className="flex-1 bg-transparent text-sm text-slate-700 outline-none placeholder:text-slate-400"
            />
          </div>

          <div className="relative">
            <select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }} className={selectCls} aria-label="Status">
              <option value="">All statuses</option>
              {statusOptions.map((s) => <option key={s} value={s}>{statusLabel(s)}</option>)}
            </select>
            <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
          </div>

          <div className="flex items-center gap-2 ml-auto">
            {loading ? <Loader2 className="w-4 h-4 text-slate-400 animate-spin" /> : <SlidersHorizontal className="w-4 h-4 text-slate-400" />}
            <span className="text-sm font-semibold text-slate-600">{total} {isOrgs ? "orgs" : "admins"}</span>
          </div>
        </div>

        {!isOrgs && (
          <p className="-mt-3 px-1 text-xs text-slate-500">
            The platform manages organization administrator accounts only, shown as a reference with a masked address. Everyone else is managed by the organization itself.
          </p>
        )}

        {/* Content */}
        {loading && rows.length === 0 ? (
          <div className="space-y-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-16 bg-white border border-slate-200/80 rounded-2xl animate-pulse" />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <div className="text-center py-16 text-slate-400">
            {isOrgs ? <Building2 className="w-12 h-12 mx-auto mb-3 text-slate-200" /> : <Users className="w-12 h-12 mx-auto mb-3 text-slate-200" />}
            <p className="text-sm font-medium">
              {filtered ? "Nothing matches these filters." : isOrgs ? "No organizations found" : "No organization administrators found"}
            </p>
            {filtered && (
              <button onClick={() => { setSearchInput(""); setSearch(""); setStatusFilter(""); setPage(1); }}
                className="mt-2 text-sm font-semibold text-[#3B82F6] hover:underline">Clear filters</button>
            )}
          </div>
        ) : isOrgs ? (
          <div className={`bg-white border border-slate-200/80 rounded-3xl shadow-sm overflow-hidden transition-opacity ${loading ? "opacity-60" : ""}`}>
            <div className="hidden lg:grid grid-cols-[2fr_1fr_1fr_1fr_1fr_80px] gap-4 px-6 py-3 border-b border-slate-100 bg-slate-50/50 text-[11px] font-bold uppercase tracking-wider text-slate-400">
              <span>Organization</span>
              <span>Status</span>
              <span>Plan</span>
              <span>Trial Remaining</span>
              <span>Users</span>
              <span></span>
            </div>
            <div className="divide-y divide-slate-100">
              {rows.map((org) => {
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
                        <div className="text-xs font-medium text-slate-400 truncate">
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
                      <button onClick={() => navigate(`/super-admin/organizations/${org.id}`)} aria-label={`Open ${org.name}`} title="Open organization"
                        className="p-2 rounded-xl hover:bg-slate-100 transition-colors text-slate-400 hover:text-slate-600">
                        <Eye className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <div className={`bg-white border border-slate-200/80 rounded-3xl shadow-sm overflow-hidden transition-opacity ${loading ? "opacity-60" : ""}`}>
            <div className="hidden lg:grid grid-cols-[2fr_1fr_1.5fr_1fr_2fr] gap-4 px-6 py-3 border-b border-slate-100 bg-slate-50/50 text-[11px] font-bold uppercase tracking-wider text-slate-400">
              <span>Administrator</span>
              <span>Status</span>
              <span>Organization</span>
              <span>Added</span>
              <span className="text-right">Actions</span>
            </div>
            <div className="divide-y divide-slate-100">
              {rows.map((user) => {
                const avatar = getAvatar(user.organization_name || user.full_name || "");
                const suspended = !user.is_active || ["suspended", "deactivated", "inactive", "locked"].includes(user.status);
                const busy = busyId === user.id;
                return (
                  <div key={user.id} className="grid grid-cols-1 lg:grid-cols-[2fr_1fr_1.5fr_1fr_2fr] gap-3 lg:gap-4 px-6 py-4 hover:bg-slate-50/60 transition-colors items-center">
                    <div className="flex items-center gap-3">
                      <div className={`w-10 h-10 rounded-2xl bg-gradient-to-br ${avatar.gradient} text-white flex items-center justify-center font-bold text-xs shadow-sm ring-2 ring-white shrink-0`}>
                        {avatar.initials}
                      </div>
                      <div className="min-w-0">
                        <div className="font-bold text-slate-900 text-sm truncate">{user.full_name}</div>
                        <div className="text-xs font-medium text-slate-400 truncate">{user.email}</div>
                      </div>
                    </div>
                    <div><StatusBadge status={user.status} /></div>
                    <div className="text-sm text-slate-600 truncate">
                      {user.organization_id ? (
                        <button onClick={() => navigate(`/super-admin/organizations/${user.organization_id}`)} className="truncate hover:text-[#3B82F6] hover:underline">
                          {user.organization_name || `#${user.organization_id}`}
                        </button>
                      ) : "—"}
                    </div>
                    <div className="text-xs text-slate-400">{user.created_at ? formatDateTime(user.created_at) : "—"}</div>
                    <div className="flex flex-wrap items-center justify-start lg:justify-end gap-3 text-xs font-semibold">
                      {busy && <Loader2 className="h-3.5 w-3.5 animate-spin text-slate-400" />}
                      <button disabled={busy || suspended} onClick={() => adminAction(user, "reset")}
                        className="inline-flex items-center gap-1 text-[#3B82F6] hover:underline disabled:opacity-40 disabled:no-underline"
                        title={suspended ? "Reactivate the account first" : "E-mail a password reset link"}>
                        <Mail className="h-3.5 w-3.5" /> Reset password
                      </button>
                      {suspended ? (
                        <button disabled={busy} onClick={() => adminAction(user, "activate")}
                          className="inline-flex items-center gap-1 text-emerald-600 hover:underline disabled:opacity-40">
                          <PlayCircle className="h-3.5 w-3.5" /> Reactivate
                        </button>
                      ) : (
                        <button disabled={busy} onClick={() => adminAction(user, "suspend")}
                          className="inline-flex items-center gap-1 text-red-600 hover:underline disabled:opacity-40">
                          <PauseCircle className="h-3.5 w-3.5" /> Suspend
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Pagination */}
        {total > PAGE_SIZE && (
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 bg-white border border-slate-200/80 rounded-2xl px-6 py-3 shadow-sm">
            <span className="text-sm text-slate-500 font-medium">
              Showing <span className="font-bold text-slate-900">{(page - 1) * PAGE_SIZE + 1}</span>–<span className="font-bold text-slate-900">{Math.min(page * PAGE_SIZE, total)}</span> of <span className="font-bold text-slate-900">{total}</span>
            </span>
            <div className="flex items-center gap-1">
              <button disabled={page <= 1} onClick={() => setPage(page - 1)} aria-label="Previous page"
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
              <button disabled={page >= totalPages} onClick={() => setPage(page + 1)} aria-label="Next page"
                className="p-2 rounded-xl border border-slate-200/80 text-slate-400 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {addOpen && (
        <AddAdminModal
          onClose={() => setAddOpen(false)}
          onCreated={(message) => { setAddOpen(false); setNotice(message); refresh(); }}
        />
      )}
    </div>
  );
}

function AddAdminModal({ onClose, onCreated }) {
  const [org, setOrg] = useState(null);
  const [form, setForm] = useState({ first_name: "", last_name: "", email: "", phone: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const valid = org && form.first_name.trim() && form.last_name.trim() && /^\S+@\S+\.\S+$/.test(form.email.trim());

  const submit = async (e) => {
    e.preventDefault();
    if (!valid) return;
    setBusy(true);
    setError(null);
    try {
      const res = await superAdminService.createTenantAdmin({
        organization_id: org.id,
        first_name: form.first_name.trim(),
        last_name: form.last_name.trim(),
        email: form.email.trim(),
        phone: form.phone.trim() || null,
      });
      onCreated(res?.message || "Administrator added. They set their own password through the secure link.");
    } catch (err) {
      setError(err.message || "Could not add the administrator.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <form onSubmit={submit} role="dialog" aria-modal="true" aria-label="Add administrator"
        className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-bold text-slate-800">Add organization administrator</h3>
          <button type="button" onClick={onClose} aria-label="Close" className="text-slate-400 hover:text-slate-600"><X size={18} /></button>
        </div>
        <div className="space-y-4">
          <div>
            <label className={labelCls}>Organization *</label>
            <OrgPicker selectedOrg={org} onSelect={setOrg} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>First name *</label>
              <input value={form.first_name} onChange={set("first_name")} maxLength={100} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Last name *</label>
              <input value={form.last_name} onChange={set("last_name")} maxLength={100} className={inputCls} />
            </div>
          </div>
          <div>
            <label className={labelCls}>Work e-mail *</label>
            <input type="email" value={form.email} onChange={set("email")} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Phone</label>
            <input value={form.phone} onChange={set("phone")} className={inputCls} />
          </div>
          <p className="text-xs text-slate-500">They receive an invitation and set their own password; the platform never sees it.</p>
          {error && <p role="alert" className="text-xs text-red-600">{error}</p>}
        </div>
        <div className="mt-6 flex justify-end gap-3">
          <button type="button" onClick={onClose} className="rounded-full border border-slate-200 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50">Cancel</button>
          <button type="submit" disabled={!valid || busy}
            className="flex items-center gap-2 rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50">
            {busy && <Loader2 className="h-4 w-4 animate-spin" />} Send invitation
          </button>
        </div>
      </form>
    </div>
  );
}
