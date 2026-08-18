import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  Search, Eye, ShieldCheck, History, CheckCircle2, XCircle,
  ChevronDown, Building2, Filter, Plus, SlidersHorizontal,
  ChevronLeft, ChevronRight, MoreVertical, RotateCcw, AlertTriangle, X
} from "lucide-react";
import { superAdminService } from "../../service/superAdminService";

export default function SuperAdminOrganizationsPage() {
  const navigate = useNavigate();
  const [organizations, setOrganizations] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("All statuses");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [actionLoading, setActionLoading] = useState(null);

  const [rejectModal, setRejectModal] = useState(null);
  const [rejectReason, setRejectReason] = useState("");

  const loadOrgs = useCallback(async () => {
    setLoading(true);
    try {
      setError(null);
      const params = { page, page_size: pageSize };
      if (searchTerm) params.search = searchTerm;
      if (statusFilter !== "All statuses") params.status = statusFilter.toLowerCase().replace(" ", "_");
      const data = await superAdminService.getOrganizations(params);
      setOrganizations(data.organizations || []);
      setTotal(data.total || 0);
    } catch (e) {
      console.error("Failed to load organizations", e);
      setError(e.message || "Failed to load organizations.");
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, searchTerm, statusFilter]);

  useEffect(() => { loadOrgs(); }, [loadOrgs]);

  const handleApprove = async (org) => {
    setActionLoading(org.id);
    try {
      await superAdminService.approveOrganization(org.id);
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
    setActionLoading(rejectModal.id);
    try {
      await superAdminService.rejectOrganization(rejectModal.id, { reason: rejectReason });
      setRejectModal(null);
      loadOrgs();
    } catch (e) { setError(e.message); }
    finally { setActionLoading(null); }
  };

  const handleSuspend = async (org) => {
    if (!confirm(`Suspend "${org.name}"?`)) return;
    setActionLoading(org.id);
    try {
      await superAdminService.suspendOrganization(org.id);
      loadOrgs();
    } catch (e) { setError(e.message); }
    finally { setActionLoading(null); }
  };

  const handleReactivate = async (org) => {
    if (!confirm(`Reactivate "${org.name}"?`)) return;
    setActionLoading(org.id);
    try {
      await superAdminService.reactivateOrganization(org.id);
      loadOrgs();
    } catch (e) { setError(e.message); }
    finally { setActionLoading(null); }
  };

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

  return (
    <div className="min-h-screen bg-slate-50/60 p-6 sm:p-10 text-slate-800 font-sans antialiased">
      <div className="max-w-7xl mx-auto space-y-6">

        {/* Header Section */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-8 bg-white/80 backdrop-blur-md border border-slate-200/80 rounded-3xl shadow-sm">
          <div>
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-slate-900 text-white rounded-2xl shadow-sm">
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

          <button className="inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-slate-900 hover:bg-slate-800 text-white text-sm font-semibold rounded-2xl shadow-sm hover:shadow-md transition-all active:scale-[0.98]">
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

        {/* Main Content Container */}
        <div className="bg-white border border-slate-200/80 rounded-3xl shadow-sm overflow-hidden">

          {/* Toolbar */}
          <div className="p-6 border-b border-slate-100 flex flex-col md:flex-row md:items-center justify-between gap-4 bg-slate-50/30">
            <div className="flex items-center gap-3">
              <h2 className="text-lg font-bold text-slate-900">All Organizations</h2>
              <span className="px-2.5 py-0.5 text-xs font-semibold text-slate-600 bg-slate-100 border border-slate-200 rounded-full">
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
                  className="appearance-none bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold rounded-2xl pl-9 pr-9 py-2.5 border border-slate-200 shadow-sm focus:outline-none focus:ring-2 focus:ring-slate-900/10 cursor-pointer transition"
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
                  className="w-full sm:w-64 bg-white hover:bg-slate-50/80 focus:bg-white text-xs font-medium text-slate-800 placeholder-slate-400 rounded-2xl pl-9 pr-4 py-2.5 border border-slate-200 shadow-sm focus:outline-none focus:ring-2 focus:ring-slate-900/10 transition"
                />
              </div>

              <button className="p-2.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-600 rounded-2xl shadow-sm transition" title="More Filters">
                <SlidersHorizontal className="w-4 h-4" />
              </button>
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
              <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100">
                <Building2 className="h-6 w-6 text-slate-300" />
              </div>
              <p className="text-sm font-semibold text-slate-600">No organizations found</p>
              <p className="mt-1 text-sm text-slate-400">
                {searchTerm || statusFilter !== "All statuses" ? "Try adjusting your search or filter." : "New registrations will appear here."}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-slate-100 text-[11px] font-bold text-slate-400 uppercase tracking-wider bg-slate-50/50">
                  <tr>
                    <th className="px-6 py-3.5">Organization</th>
                    <th className="px-6 py-3.5">Plan</th>
                    <th className="px-6 py-3.5">Users</th>
                    <th className="px-6 py-3.5">Status</th>
                    <th className="px-6 py-3.5">Created</th>
                    <th className="px-6 py-3.5 text-right pr-8">Actions</th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-slate-100">
                  {organizations.map((o) => {
                    const avatar = getOrgAvatar(o.name);
                    const s = o.status?.toUpperCase();
                    const userCount = o.user_count ?? o.total_employees ?? 0;
                    return (
                      <tr key={o.id} className="hover:bg-slate-50/80 transition-colors group">
                        {/* Organization Details */}
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3.5">
                            <div className={`w-10 h-10 rounded-2xl bg-gradient-to-br ${avatar.gradient} text-white flex items-center justify-center font-bold text-xs shadow-sm ring-2 ring-white`}>
                              {avatar.initials}
                            </div>
                            <div>
                              <div className="font-bold text-slate-900 text-sm group-hover:text-indigo-600 transition-colors">
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
                            <span className="inline-flex items-center px-2.5 py-1 text-xs font-semibold text-slate-700 bg-slate-100/80 border border-slate-200/80 rounded-xl capitalize">
                              {o.subscription_plan}
                            </span>
                          ) : (
                            <span className="inline-flex items-center px-2.5 py-1 text-xs font-semibold text-slate-400 bg-slate-50 border border-dashed border-slate-200 rounded-xl">
                              Not assigned
                            </span>
                          )}
                        </td>

                        {/* Users Counter */}
                        <td className="px-6 py-4">
                          <div className="inline-flex items-center gap-1.5 font-semibold text-slate-700 text-xs">
                            <span className="w-2 h-2 rounded-full bg-slate-300"></span>
                            {userCount} {userCount === 1 ? "user" : "users"}
                          </div>
                        </td>

                        {/* Status Pill */}
                        <td className="px-6 py-4">
                          {s === "ACTIVE" || s === "APPROVED" ? (
                            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200/60 shadow-xs">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                              Active
                            </span>
                          ) : s === "PENDING" ? (
                            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-amber-50 text-amber-700 border border-amber-200/60 shadow-xs">
                              <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
                              Pending Review
                            </span>
                          ) : s === "REJECTED" ? (
                            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-red-50 text-red-700 border border-red-200/60 shadow-xs">
                              <span className="w-1.5 h-1.5 rounded-full bg-red-500"></span>
                              Rejected
                            </span>
                          ) : s === "SUSPENDED" ? (
                            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-slate-100 text-slate-600 border border-slate-200/60 shadow-xs">
                              <span className="w-1.5 h-1.5 rounded-full bg-slate-400"></span>
                              Suspended
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-slate-100 text-slate-600 border border-slate-200/60 shadow-xs">
                              <span className="w-1.5 h-1.5 rounded-full bg-slate-400"></span>
                              {o.status || "—"}
                            </span>
                          )}
                        </td>

                        {/* Date Created */}
                        <td className="px-6 py-4 text-xs font-medium text-slate-500">
                          {o.created_at ? new Date(o.created_at).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" }) : "—"}
                        </td>

                        {/* Action Buttons */}
                        <td className="px-6 py-4 text-right pr-6">
                          <div className="inline-flex items-center bg-slate-50 border border-slate-200/80 rounded-2xl p-1 gap-1 shadow-xs">
                            {/* View Button */}
                            <button onClick={() => navigate(`/super-admin/organizations/${o.id}`)}
                              className="p-1.5 text-slate-500 hover:text-slate-900 hover:bg-white rounded-xl transition-all shadow-none hover:shadow-xs" title="View details">
                              <Eye className="w-4 h-4" />
                            </button>

                            {/* Approval / Security Context */}
                            {s === "PENDING" ? (
                              <>
                                <button onClick={() => handleApprove(o)} disabled={actionLoading === o.id}
                                  className="p-1.5 text-emerald-600 hover:text-white hover:bg-emerald-600 rounded-xl transition-all shadow-none hover:shadow-xs disabled:opacity-40" title="Approve">
                                  <CheckCircle2 className="w-4 h-4" />
                                </button>
                                <button onClick={() => handleRejectClick(o)} disabled={actionLoading === o.id}
                                  className="p-1.5 text-rose-500 hover:text-white hover:bg-rose-600 rounded-xl transition-all shadow-none hover:shadow-xs disabled:opacity-40" title="Reject">
                                  <XCircle className="w-4 h-4" />
                                </button>
                              </>
                            ) : s === "ACTIVE" || s === "APPROVED" ? (
                              <button onClick={() => handleSuspend(o)} disabled={actionLoading === o.id}
                                className="p-1.5 text-slate-500 hover:text-indigo-600 hover:bg-white rounded-xl transition-all shadow-none hover:shadow-xs disabled:opacity-40" title="Permissions & Security">
                                <ShieldCheck className="w-4 h-4" />
                              </button>
                            ) : s === "SUSPENDED" || s === "ON_HOLD" ? (
                              <button onClick={() => handleReactivate(o)} disabled={actionLoading === o.id}
                                className="p-1.5 text-slate-500 hover:text-emerald-600 hover:bg-white rounded-xl transition-all shadow-none hover:shadow-xs disabled:opacity-40" title="Reactivate">
                                <RotateCcw className="w-4 h-4" />
                              </button>
                            ) : null}

                            {/* History Button */}
                            <button onClick={() => navigate(`/super-admin/organizations/${o.id}`)}
                              className="p-1.5 text-slate-500 hover:text-slate-900 hover:bg-white rounded-xl transition-all shadow-none hover:shadow-xs" title="Audit Trail">
                              <History className="w-4 h-4" />
                            </button>

                            <button onClick={() => navigate(`/super-admin/organizations/${o.id}`)}
                              className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-white rounded-xl transition-all shadow-none hover:shadow-xs" title="More options">
                              <MoreVertical className="w-4 h-4" />
                            </button>
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
          <div className="px-6 py-4 border-t border-slate-100 bg-slate-50/30 flex items-center justify-between text-xs text-slate-500 font-medium">
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
                  className="p-2 bg-white border border-slate-200 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-50 transition shadow-xs disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-white disabled:hover:text-slate-400">
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
                      className={`px-3 py-1 font-bold rounded-xl shadow-xs transition ${
                        page === pageNum
                          ? "bg-slate-900 text-white"
                          : "bg-white border border-slate-200 text-slate-600 hover:bg-slate-50"
                      }`}>
                      {pageNum}
                    </button>
                  );
                })}
                <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
                  className="p-2 bg-white border border-slate-200 rounded-xl text-slate-600 hover:bg-slate-50 transition shadow-xs disabled:opacity-40 disabled:cursor-not-allowed">
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

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
                className="px-4 py-2 rounded-full border border-slate-200 text-sm text-slate-600 hover:bg-slate-50">Cancel</button>
              <button onClick={confirmReject} disabled={!rejectReason.trim() || actionLoading === rejectModal.id}
                className="flex items-center gap-2 px-4 py-2 rounded-full bg-red-600 text-white text-sm font-semibold hover:bg-red-700 disabled:opacity-50">
                {actionLoading === rejectModal.id ? "Rejecting..." : "Reject"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
