import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  Search, Eye, ShieldCheck, History, CheckCircle2, XCircle,
  ChevronDown, Building2, Filter, Plus, SlidersHorizontal,
  ChevronLeft, ChevronRight, MoreVertical, RotateCcw, AlertTriangle, X, Trash2
} from "lucide-react";
import { superAdminService } from "../../service/superAdminService";
import EvaluationTimeRemaining from "../../components/EvaluationTimeRemaining";
import { formatDate } from "../../utils/dateTime";

export default function SuperAdminOrganizationsPage() {
  const navigate = useNavigate();
  const [organizations, setOrganizations] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("All statuses");
  const [planFilter, setPlanFilter] = useState("all");
  const [createdFrom, setCreatedFrom] = useState("");
  const [createdTo, setCreatedTo] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const [draftFilters, setDraftFilters] = useState({ plan: "all", createdFrom: "", createdTo: "" });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [successMessage, setSuccessMessage] = useState(null);
  const [actionLoading, setActionLoading] = useState(null);

  const [rejectModal, setRejectModal] = useState(null);
  const [rejectReason, setRejectReason] = useState("");
  const [deleteOrg, setDeleteOrg] = useState(null);
  const [openMenuId, setOpenMenuId] = useState(null);

  const loadOrgs = useCallback(async () => {
    setLoading(true);
    try {
      setError(null);
      const params = { page, page_size: pageSize };
      if (searchTerm) params.search = searchTerm;
      if (statusFilter !== "All statuses") params.status = statusFilter.toLowerCase().replace(" ", "_");
      if (planFilter !== "all") params.plan = planFilter;
      if (createdFrom) params.created_from = createdFrom;
      if (createdTo) params.created_to = createdTo;
      const data = await superAdminService.getOrganizations(params);
      setOrganizations(data.organizations || []);
      setTotal(data.total || 0);
    } catch (e) {
      console.error("Failed to load organizations", e);
      setError(e.message || "Failed to load organizations.");
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, searchTerm, statusFilter, planFilter, createdFrom, createdTo]);

  useEffect(() => { loadOrgs(); }, [loadOrgs]);

  const handleApprove = async (org) => {
    setActionLoading(org.id);
    try {
      setError(null);
      setSuccessMessage(null);
      await superAdminService.approveOrganization(org.id);
      setSuccessMessage(`Organization "${org.name}" approved successfully.`);
      loadOrgs();
    } catch (e) { setError(e.message); }
    finally { setActionLoading(null); }
  };

  const handleRejectClick = (org) => {
    setRejectModal(org);
    setRejectReason("");
  };

  const confirmReject = async () => {
    if (!rejectModal || !rejectReason.trim()) return;
    const orgName = rejectModal.name;
    setActionLoading(rejectModal.id);
    try {
      setError(null);
      setSuccessMessage(null);
      const confirm = await superAdminService.mintConfirmationToken(rejectModal.id, "update_organization_status");
      await superAdminService.updateOrganizationStatus(rejectModal.id, {
        status: "rejected",
        reason: rejectReason,
        confirmation_id: confirm.confirmation_id,
        confirmation_token: confirm.token,
      });
      setRejectModal(null);
      setSuccessMessage(`Organization "${orgName}" rejected successfully.`);
      loadOrgs();
    } catch (e) { setError(e.message); }
    finally { setActionLoading(null); }
  };

  const handleSuspend = async (org) => {
    if (!confirm(`Suspend "${org.name}"?`)) return;
    setActionLoading(org.id);
    try {
      setError(null);
      setSuccessMessage(null);
      const confirm = await superAdminService.mintConfirmationToken(org.id, "update_organization_status");
      await superAdminService.updateOrganizationStatus(org.id, {
        status: "suspended",
        confirmation_id: confirm.confirmation_id,
        confirmation_token: confirm.token,
      });
      setSuccessMessage(`Organization "${org.name}" suspended successfully.`);
      loadOrgs();
    } catch (e) { setError(e.message); }
    finally { setActionLoading(null); }
  };

  const handleReactivate = async (org) => {
    if (!confirm(`Reactivate "${org.name}"?`)) return;
    setActionLoading(org.id);
    try {
      setError(null);
      setSuccessMessage(null);
      await superAdminService.reactivateOrganization(org.id);
      setSuccessMessage(`Organization "${org.name}" reactivated successfully.`);
      loadOrgs();
    } catch (e) { setError(e.message); }
    finally { setActionLoading(null); }
  };

  const handleDeleteClick = (org) => setDeleteOrg(org);

  const confirmDeleteOrg = async () => {
    if (!deleteOrg) return;
    const orgName = deleteOrg.name;
    setActionLoading(deleteOrg.id);
    try {
      setError(null);
      setSuccessMessage(null);
      const confirm = await superAdminService.mintConfirmationToken(deleteOrg.id, "delete_organization");
      const res = await superAdminService.deleteOrganization(deleteOrg.id, {
        id: confirm.confirmation_id,
        token: confirm.token,
      });
      setDeleteOrg(null);
      setSuccessMessage(res?.message || `Organization "${orgName}" deleted successfully.`);
      loadOrgs();
    } catch (e) { setError(e.message); }
    finally { setActionLoading(null); }
  };

  const PLAN_OPTIONS = [
    { value: "core", label: "Core" },
    { value: "advanced", label: "Advanced" },
    { value: "enterprise", label: "Enterprise" },
    { value: "evaluation", label: "Evaluation (Trial)" },
    { value: "not_assigned", label: "Not assigned" },
  ];

  const AVATAR_GRADIENTS = [
    "from-pink-500 to-rose-500",
    "from-amber-500 to-orange-500",
    "from-violet-500 to-indigo-500",
    "from-emerald-500 to-teal-500",
    "from-blue-500 to-cyan-500",
    "from-red-500 to-pink-500",
    "from-fuchsia-500 to-purple-500",
    "from-sky-500 to-blue-500",
  ];

  const getOrgAvatar = (name = "") => {
    const clean = name.trim();
    const words = clean.split(/\s+/).filter(Boolean);
    const initials = words.length > 1
      ? (words[0][0] + words[1][0])
      : clean.slice(0, 2);
    let hash = 0;
    for (let i = 0; i < clean.length; i++) hash = (hash * 31 + clean.charCodeAt(i)) >>> 0;
    const gradient = AVATAR_GRADIENTS[hash % AVATAR_GRADIENTS.length];
    return { initials: initials.toUpperCase(), gradient };
  };

  const totalPages = Math.ceil(total / pageSize);

  const activeFilterCount =
    (planFilter !== "all" ? 1 : 0) + (createdFrom ? 1 : 0) + (createdTo ? 1 : 0);

  const openFilters = () => {
    setDraftFilters({ plan: planFilter, createdFrom, createdTo });
    setShowFilters(true);
  };

  const applyFilters = () => {
    setPlanFilter(draftFilters.plan);
    setCreatedFrom(draftFilters.createdFrom);
    setCreatedTo(draftFilters.createdTo);
    setPage(1);
    setShowFilters(false);
  };

  const clearFilters = () => {
    setPlanFilter("all");
    setCreatedFrom("");
    setCreatedTo("");
    setDraftFilters({ plan: "all", createdFrom: "", createdTo: "" });
    setPage(1);
    setShowFilters(false);
  };

  return (
    <div className="space-y-6 font-sans">

        {/* Header Section */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-8 bg-white border border-slate-200 rounded-2xl shadow-sm">
          <div>
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-blue-600 text-white rounded-xl shadow-sm">
                <Building2 className="w-6 h-6" />
              </div>
              <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900">
                Organizations
              </h1>
            </div>
            <p className="mt-2 text-sm text-slate-500 font-medium ml-1">
              Manage platform workspaces, review pending approvals, and view system audits.
            </p>
          </div>

          <button onClick={() => navigate("/register")} title="Register a new organization" className="inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-xl shadow-sm hover:shadow-md transition-all active:scale-[0.98]">
            <Plus className="w-4 h-4" />
            Add Organization
          </button>
        </div>

        {error && (
          <div className="rounded-3xl border border-red-200 bg-red-50 p-4 text-red-700 text-sm flex items-center gap-3">
            <AlertTriangle className="h-5 w-5 flex-shrink-0" />
            <span>{error}</span>
            <button onClick={loadOrgs} className="ml-auto text-red-600 underline hover:text-red-800 text-xs font-semibold">Retry</button>
          </div>
        )}

        {successMessage && (
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-800 text-sm flex items-center gap-3 shadow-xs transition-all">
            <CheckCircle2 className="h-5 w-5 text-emerald-600 flex-shrink-0" />
            <span className="font-medium">{successMessage}</span>
            <button onClick={() => setSuccessMessage(null)} className="ml-auto text-emerald-600 hover:text-emerald-800 p-1 rounded-lg transition" title="Dismiss">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Main Content Container */}
        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">

          {/* Toolbar */}
          <div className="p-6 border-b border-slate-100 flex flex-col md:flex-row md:items-center justify-between gap-4 bg-slate-50/60">
            <div className="flex items-center gap-3">
              <h2 className="text-lg font-bold text-slate-900">All Organizations</h2>
              <span className="px-2.5 py-0.5 text-xs font-semibold text-blue-700 bg-blue-50 border border-blue-200 rounded-full">
                {total} total
              </span>
            </div>

            <div className="flex items-center flex-wrap gap-3">
              {/* Status Filter Dropdown */}
              <div className="relative">
                <Filter className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <select
                  value={statusFilter}
                  onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
                  className="appearance-none bg-white hover:border-blue-400 text-slate-700 text-xs font-semibold rounded-lg pl-9 pr-9 py-2.5 border border-slate-200 shadow-sm focus:outline-none focus:ring-2 focus:ring-[#3B82F6]/30 focus:border-blue-500 cursor-pointer transition"
                >
                  <option value="All statuses">All statuses</option>
                  <option value="pending">Pending Review</option>
                  <option value="active">Active</option>
                  <option value="rejected">Rejected</option>
                  <option value="suspended">Suspended</option>
                  <option value="deactivated">Deactivated</option>
                </select>
                <ChevronDown className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              </div>

              {/* Search Bar */}
              <div className="relative flex-1 sm:flex-none">
                <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Search by name or slug..."
                  value={searchTerm}
                  onChange={(e) => { setSearchTerm(e.target.value); setPage(1); }}
                  className="w-full sm:w-64 bg-white hover:border-blue-400 focus:bg-white text-xs font-medium text-slate-800 placeholder-slate-400 rounded-lg pl-9 pr-4 py-2.5 border border-slate-200 shadow-sm focus:outline-none focus:ring-2 focus:ring-[#3B82F6]/30 focus:border-blue-500 transition"
                />
              </div>

              <div className="relative">
                <button onClick={openFilters}
                  className={`p-2.5 bg-white border hover:bg-blue-50 hover:text-blue-600 text-slate-600 rounded-lg shadow-sm transition ${
                    activeFilterCount > 0 ? "border-blue-300 text-blue-600 bg-blue-50 hover:bg-blue-100" : "border-slate-200"
                  }`} title="More Filters">
                  <SlidersHorizontal className="w-4 h-4" />
                  {activeFilterCount > 0 && (
                    <span className="absolute -top-1.5 -right-1.5 h-4 min-w-4 px-1 rounded-full bg-blue-600 text-white text-[10px] font-bold flex items-center justify-center">
                      {activeFilterCount}
                    </span>
                  )}
                </button>
              </div>
            </div>
          </div>

          {/* Table View */}
          {loading ? (
            <div className="divide-y divide-slate-100">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex items-center gap-4 px-6 py-4 animate-pulse">
                  <div className="h-10 w-10 rounded-2xl bg-slate-100" />
                  <div className="flex-1 space-y-2">
                    <div className="h-3 w-40 rounded bg-slate-100" />
                    <div className="h-2.5 w-24 rounded bg-slate-100" />
                  </div>
                  <div className="h-6 w-16 rounded-xl bg-slate-100" />
                  <div className="h-6 w-20 rounded-full bg-slate-100" />
                  <div className="h-6 w-24 rounded-full bg-slate-100" />
                </div>
              ))}
            </div>
          ) : organizations.length === 0 ? (
            <div className="py-16 text-center">
              <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-50">
                <Building2 className="h-6 w-6 text-blue-400" />
              </div>
              <p className="text-sm font-semibold text-slate-600">No organizations found</p>
              <p className="mt-1 text-sm text-slate-400">
                {searchTerm || statusFilter !== "All statuses" ? "Try adjusting your search or filter." : "New registrations will appear here."}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                  <tr>
                    <th className="px-6 py-3.5">Organization</th>
                    <th className="px-6 py-3.5">Plan</th>
                    <th className="px-6 py-3.5">Trial</th>
                    <th className="px-6 py-3.5">Users</th>
                    <th className="px-6 py-3.5">Status</th>
                    <th className="px-6 py-3.5">Created</th>
                    <th className="px-6 py-3.5 text-right pr-8">Actions</th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-slate-100/80">
                  {organizations.map((o) => {
                    const avatar = getOrgAvatar(o.name);
                    const s = o.status?.toUpperCase();
                    const userCount = o.user_count ?? o.total_employees ?? 0;
                    return (
                      <tr key={o.id} className="hover:bg-blue-50/40 transition-colors duration-150 group">
                        {/* Organization Details */}
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3.5">
                            <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${avatar.gradient} text-white flex items-center justify-center font-bold text-xs shadow-sm ring-2 ring-white`}>
                              {avatar.initials}
                            </div>
                            <div>
                              <div className="font-bold text-slate-900 text-sm group-hover:text-blue-600 transition-colors">
                                {o.name}
                              </div>
                              <div className="text-xs font-medium text-slate-400">
                                ID: {o.organization_code || "—"}
                              </div>
                            </div>
                          </div>
                        </td>

                        {/* Plan Badge */}
                        <td className="px-6 py-4">
                          {o.subscription_plan ? (
                            <span className="inline-flex items-center px-2.5 py-1 text-xs font-semibold text-blue-700 bg-blue-50 border border-blue-200/70 rounded-lg capitalize">
                              {o.subscription_plan}
                            </span>
                          ) : (
                            <span className="inline-flex items-center px-2.5 py-1 text-xs font-semibold text-slate-400 bg-slate-50 border border-dashed border-slate-200 rounded-lg">
                              Not assigned
                            </span>
                          )}
                        </td>

                        {/* Trial / Evaluation Countdown */}
                        <td className="px-6 py-4">
                          {o.evaluation_ends_at ? (
                            <EvaluationTimeRemaining evaluationEndsAt={o.evaluation_ends_at} compact />
                          ) : (
                            <span className="text-xs text-slate-300">—</span>
                          )}
                        </td>

                        {/* Users Counter */}
                        <td className="px-6 py-4">
                          <div className="inline-flex items-center gap-1.5 font-semibold text-slate-700 text-xs">
                            <span className="w-2 h-2 rounded-full bg-blue-400"></span>
                            {userCount} {userCount === 1 ? "user" : "users"}
                          </div>
                        </td>

                        {/* Status Pill */}
                        <td className="px-6 py-4">
                          {s === "ACTIVE" || s === "APPROVED" ? (
                            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-sky-50 text-sky-700 border border-sky-200/70 shadow-xs">
                              <span className="w-1.5 h-1.5 rounded-full bg-sky-500 animate-pulse"></span>
                              Active
                            </span>
                          ) : s === "PENDING" ? (
                            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-amber-50 text-amber-700 border border-amber-200/70 shadow-xs">
                              <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
                              Pending Review
                            </span>
                          ) : s === "REJECTED" ? (
                            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-red-50 text-red-700 border border-red-200/70 shadow-xs">
                              <span className="w-1.5 h-1.5 rounded-full bg-red-500"></span>
                              Rejected
                            </span>
                          ) : s === "SUSPENDED" ? (
                            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-slate-100 text-slate-600 border border-slate-200/70 shadow-xs">
                              <span className="w-1.5 h-1.5 rounded-full bg-slate-400"></span>
                              Suspended
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-slate-100 text-slate-600 border border-slate-200/70 shadow-xs">
                              <span className="w-1.5 h-1.5 rounded-full bg-slate-400"></span>
                              {o.status || "—"}
                            </span>
                          )}
                        </td>

                        {/* Date Created */}
                        <td className="px-6 py-4 text-xs font-medium text-slate-500">
                          {o.created_at ? formatDate(o.created_at) : "—"}
                        </td>

                        {/* Action Buttons */}
                        <td className="px-6 py-4 text-right pr-6">
                          <div className="inline-flex items-center bg-slate-50 border border-slate-200 rounded-xl p-1 gap-1 shadow-xs">
                            {/* View Button */}
                            <button onClick={() => navigate(`/super-admin/organizations/${o.id}`)}
                              className="p-1.5 text-slate-500 hover:text-blue-600 hover:bg-blue-100/70 rounded-lg transition-all shadow-none" title="View details">
                              <Eye className="w-4 h-4" />
                            </button>

                            {/* Approval / Security Context */}
                            {s === "PENDING" ? (
                              <>
                                <button onClick={() => handleApprove(o)} disabled={actionLoading === o.id}
                                  className="p-1.5 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-100/70 rounded-lg transition-all shadow-none disabled:opacity-40" title="Approve">
                                  <CheckCircle2 className="w-4 h-4" />
                                </button>
                                <button onClick={() => handleRejectClick(o)} disabled={actionLoading === o.id}
                                  className="p-1.5 text-rose-500 hover:text-rose-700 hover:bg-rose-100/70 rounded-lg transition-all shadow-none disabled:opacity-40" title="Reject">
                                  <XCircle className="w-4 h-4" />
                                </button>
                              </>
                            ) : s === "ACTIVE" || s === "APPROVED" ? (
                              <button onClick={() => handleSuspend(o)} disabled={actionLoading === o.id}
                                className="p-1.5 text-slate-500 hover:text-blue-600 hover:bg-blue-100/70 rounded-lg transition-all shadow-none disabled:opacity-40" title="Permissions & Security">
                                <ShieldCheck className="w-4 h-4" />
                              </button>
                            ) : s === "SUSPENDED" || s === "ON_HOLD" ? (
                              <button onClick={() => handleReactivate(o)} disabled={actionLoading === o.id}
                                className="p-1.5 text-slate-500 hover:text-blue-600 hover:bg-blue-100/70 rounded-lg transition-all shadow-none disabled:opacity-40" title="Reactivate">
                                <RotateCcw className="w-4 h-4" />
                              </button>
                            ) : null}

                            {/* History Button */}
                            <button onClick={() => navigate(`/super-admin/audit-logs?entity_type=Organization&entity_id=${o.id}`)}
                              className="p-1.5 text-slate-500 hover:text-blue-600 hover:bg-blue-100/70 rounded-lg transition-all shadow-none" title="View audit trail for this organization">
                              <History className="w-4 h-4" />
                            </button>

                            {/* Delete */}
                            <button onClick={() => handleDeleteClick(o)} disabled={actionLoading === o.id}
                              className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-100/70 rounded-lg transition-all shadow-none disabled:opacity-40" title="Permanently delete">
                              <Trash2 className="w-4 h-4" />
                            </button>

                            {/* More Options */}
                            <div className="relative">
                              {openMenuId === o.id && (
                                <div className="fixed inset-0 z-30" onClick={() => setOpenMenuId(null)} />
                              )}
                              <button onClick={() => setOpenMenuId(openMenuId === o.id ? null : o.id)}
                                className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-100/70 rounded-lg transition-all shadow-none" title="More options">
                                <MoreVertical className="w-4 h-4" />
                              </button>
                              {openMenuId === o.id && (
                                <div className="absolute right-0 top-full z-40 mt-2 w-48 rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl">
                                  <button onClick={() => { setOpenMenuId(null); navigate(`/super-admin/organizations/${o.id}`); }}
                                    className="flex w-full items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold text-slate-700 hover:bg-blue-50 hover:text-blue-600 transition text-left">
                                    <Eye className="h-4 w-4 text-blue-500" /> View details
                                  </button>
                                  <button onClick={() => { setOpenMenuId(null); navigate(`/super-admin/audit-logs?entity_type=Organization&entity_id=${o.id}`); }}
                                    className="flex w-full items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold text-slate-700 hover:bg-blue-50 hover:text-blue-600 transition text-left">
                                    <History className="h-4 w-4 text-blue-500" /> Audit trail
                                  </button>
                                  {s === "PENDING" && (
                                    <>
                                      <button onClick={() => { setOpenMenuId(null); handleApprove(o); }} disabled={actionLoading === o.id}
                                        className="flex w-full items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold text-emerald-600 hover:bg-emerald-50 transition text-left disabled:opacity-40">
                                        <CheckCircle2 className="h-4 w-4" /> Approve
                                      </button>
                                      <button onClick={() => { setOpenMenuId(null); handleRejectClick(o); }} disabled={actionLoading === o.id}
                                        className="flex w-full items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold text-rose-600 hover:bg-rose-50 transition text-left disabled:opacity-40">
                                        <XCircle className="h-4 w-4" /> Reject
                                      </button>
                                    </>
                                  )}
                                  {(s === "ACTIVE" || s === "APPROVED") && (
                                    <button onClick={() => { setOpenMenuId(null); handleSuspend(o); }} disabled={actionLoading === o.id}
                                      className="flex w-full items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold text-blue-600 hover:bg-blue-50 transition text-left disabled:opacity-40">
                                      <ShieldCheck className="h-4 w-4" /> Suspend access
                                    </button>
                                  )}
                                  {(s === "SUSPENDED" || s === "ON_HOLD") && (
                                    <button onClick={() => { setOpenMenuId(null); handleReactivate(o); }} disabled={actionLoading === o.id}
                                      className="flex w-full items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold text-emerald-600 hover:bg-emerald-50 transition text-left disabled:opacity-40">
                                      <RotateCcw className="h-4 w-4" /> Reactivate
                                    </button>
                                  )}
                                  <div className="my-1 border-t border-slate-100" />
                                  <button onClick={() => { setOpenMenuId(null); handleDeleteClick(o); }} disabled={actionLoading === o.id}
                                    className="flex w-full items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold text-red-600 hover:bg-red-50 transition text-left disabled:opacity-40">
                                    <Trash2 className="h-4 w-4" /> Delete permanently
                                  </button>
                                </div>
                              )}
                            </div>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Footer Controls & Pagination */}
          <div className="px-6 py-4 border-t border-slate-100 bg-slate-50/60 flex items-center justify-between text-xs text-slate-500 font-medium">
            <div>
              Showing{" "}
              <span className="font-bold text-slate-700">
                {total === 0 ? "0" : `${(page - 1) * pageSize + 1}–${Math.min(page * pageSize, total)}`}
              </span>{" "}
              of <span className="font-bold text-slate-700">{total}</span>
            </div>

            {totalPages > 1 && (
              <div className="flex items-center gap-2">
                <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
                  className="p-2 bg-white border border-slate-200 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 hover:border-blue-200 transition shadow-xs disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-white disabled:hover:text-slate-400 disabled:hover:border-slate-200">
                  <ChevronLeft className="w-4 h-4" />
                </button>
                {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
                  let pageNum;
                  if (totalPages <= 5) {
                    pageNum = i + 1;
                  } else if (page <= 3) {
                    pageNum = i + 1;
                  } else if (page >= totalPages - 2) {
                    pageNum = totalPages - 4 + i;
                  } else {
                    pageNum = page - 2 + i;
                  }
                  return (
                    <button key={pageNum} onClick={() => setPage(pageNum)}
                      className={`px-3 py-1 font-bold rounded-lg shadow-xs transition ${
                        page === pageNum
                          ? "bg-blue-600 text-white hover:bg-blue-700"
                          : "bg-white border border-slate-200 text-slate-600 hover:bg-blue-50 hover:text-blue-600 hover:border-blue-200"
                      }`}>
                      {pageNum}
                    </button>
                  );
                })}
                <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
                  className="p-2 bg-white border border-slate-200 rounded-lg text-slate-600 hover:text-blue-600 hover:bg-blue-50 hover:border-blue-200 transition shadow-xs disabled:opacity-40 disabled:cursor-not-allowed">
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>
        </div>

      {/* More Filters Modal */}
      {showFilters && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4" onClick={() => setShowFilters(false)}>
          <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-xl border border-slate-200" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-3 mb-5">
              <div className="h-10 w-10 rounded-xl bg-blue-50 flex items-center justify-center">
                <SlidersHorizontal className="h-5 w-5 text-blue-600" />
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-bold text-slate-800">More Filters</h3>
                <p className="text-xs text-slate-400 font-medium">Refine the organization list</p>
              </div>
              <button onClick={() => setShowFilters(false)} className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-50 rounded-lg transition" title="Close">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-5">
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Plan</label>
                <div className="relative">
                  <select
                    value={draftFilters.plan}
                    onChange={(e) => setDraftFilters((d) => ({ ...d, plan: e.target.value }))}
                    className="appearance-none w-full bg-white hover:border-blue-400 text-sm font-semibold text-slate-700 rounded-lg pl-4 pr-9 py-2.5 border border-slate-200 shadow-sm focus:outline-none focus:ring-2 focus:ring-[#3B82F6]/30 focus:border-blue-500 cursor-pointer transition"
                  >
                    <option value="all">All plans</option>
                    {PLAN_OPTIONS.map((p) => (
                      <option key={p.value} value={p.value}>{p.label}</option>
                    ))}
                  </select>
                  <ChevronDown className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Created from</label>
                  <input
                    type="date"
                    value={draftFilters.createdFrom}
                    max={draftFilters.createdTo || undefined}
                    onChange={(e) => setDraftFilters((d) => ({ ...d, createdFrom: e.target.value }))}
                    className="w-full bg-white hover:border-blue-400 text-sm font-medium text-slate-700 rounded-lg px-4 py-2.5 border border-slate-200 shadow-sm focus:outline-none focus:ring-2 focus:ring-[#3B82F6]/30 focus:border-blue-500 transition"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Created to</label>
                  <input
                    type="date"
                    value={draftFilters.createdTo}
                    min={draftFilters.createdFrom || undefined}
                    onChange={(e) => setDraftFilters((d) => ({ ...d, createdTo: e.target.value }))}
                    className="w-full bg-white hover:border-blue-400 text-sm font-medium text-slate-700 rounded-lg px-4 py-2.5 border border-slate-200 shadow-sm focus:outline-none focus:ring-2 focus:ring-[#3B82F6]/30 focus:border-blue-500 transition"
                  />
                </div>
              </div>
            </div>

            <div className="flex gap-3 mt-7 justify-end">
              <button onClick={clearFilters}
                className="px-4 py-2 rounded-lg border border-slate-200 text-sm text-slate-600 hover:bg-blue-50 hover:text-blue-700 hover:border-blue-200">
                Clear all
              </button>
              <button onClick={() => setShowFilters(false)}
                className="px-4 py-2 rounded-lg border border-slate-200 text-sm text-slate-600 hover:bg-blue-50 hover:text-blue-700 hover:border-blue-200">
                Cancel
              </button>
              <button onClick={applyFilters}
                className="px-5 py-2 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 shadow-sm">
                Apply Filters
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Organization Modal */}
      {deleteOrg && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-3xl p-6 w-full max-w-md shadow-xl border border-slate-200">
            <div className="flex items-center gap-3 mb-4">
              <div className="h-10 w-10 rounded-full bg-red-100 flex items-center justify-center">
                <Trash2 className="h-5 w-5 text-red-600" />
              </div>
              <h3 className="text-lg font-bold text-slate-800">Delete Organization</h3>
            </div>
            <p className="text-sm text-slate-600 mb-4">
              Permanently delete <strong>{deleteOrg.name}</strong> and all of its users and records?
              This irreversible action requires a one-time confirmation token and cannot be undone.
            </p>
            <div className="flex gap-3 mt-6 justify-end">
              <button onClick={() => setDeleteOrg(null)}
                className="px-4 py-2 rounded-lg border border-slate-200 text-sm text-slate-600 hover:bg-blue-50 hover:text-blue-700 hover:border-blue-200">Cancel</button>
              <button onClick={confirmDeleteOrg} disabled={actionLoading === deleteOrg.id}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-red-600 text-white text-sm font-semibold hover:bg-red-700 disabled:opacity-50">
                <Trash2 className="h-4 w-4" />
                {actionLoading === deleteOrg.id ? "Deleting..." : "Delete Forever"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reject Reason Modal */}
      {rejectModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-3xl p-6 w-full max-w-md shadow-xl border border-slate-200">
            <div className="flex items-center gap-3 mb-4">
              <div className="h-10 w-10 rounded-full bg-red-100 flex items-center justify-center">
                <XCircle className="h-5 w-5 text-red-600" />
              </div>
              <h3 className="text-lg font-bold text-slate-800">Reject Organization</h3>
            </div>
            <p className="text-sm text-slate-600 mb-4">
              Reject <strong>{rejectModal.name}</strong> registration. Provide a reason (required):
            </p>
            <textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="Reason for rejection..."
              className="w-full rounded-xl border border-slate-200 bg-white py-2.5 px-4 text-sm text-slate-800 outline-none focus:border-red-400 min-h-[100px] resize-y"
            />
            <div className="flex gap-3 mt-6 justify-end">
              <button onClick={() => setRejectModal(null)}
                className="px-4 py-2 rounded-lg border border-slate-200 text-sm text-slate-600 hover:bg-blue-50 hover:text-blue-700 hover:border-blue-200">Cancel</button>
              <button onClick={confirmReject} disabled={!rejectReason.trim() || actionLoading === rejectModal.id}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-red-600 text-white text-sm font-semibold hover:bg-red-700 disabled:opacity-50">
                {actionLoading === rejectModal.id ? "Rejecting..." : "Reject"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
