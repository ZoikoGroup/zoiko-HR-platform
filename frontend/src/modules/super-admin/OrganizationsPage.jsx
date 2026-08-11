import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import PageHeader from "../../components/PageHeader";
import {
  AlertTriangle, Search, Building, ShieldAlert, CheckCircle, XCircle,
  RotateCcw, ChevronLeft, ChevronRight, Eye, Mail, User, Clock,
  Calendar, ThumbsUp, ThumbsDown, History, X, MessageSquare
} from "lucide-react";
import { superAdminService } from "../../service/superAdminService";

export default function SuperAdminOrganizationsPage() {
  const navigate = useNavigate();
  const [organizations, setOrganizations] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [actionLoading, setActionLoading] = useState(null);

  const [workflowOrg, setWorkflowOrg] = useState(null);
  const [rejectModal, setRejectModal] = useState(null);
  const [rejectReason, setRejectReason] = useState("");
  const [confirmModal, setConfirmModal] = useState(null);
  const [detailOrg, setDetailOrg] = useState(null);

  const loadOrgs = useCallback(async () => {
    setLoading(true);
    try {
      setError(null);
      const params = { page, page_size: pageSize };
      if (search) params.search = search;
      if (statusFilter) params.status = statusFilter;
      const data = await superAdminService.getOrganizations(params);
      setOrganizations(data.organizations || []);
      setTotal(data.total || 0);
    } catch (e) {
      console.error("Failed to load organizations", e);
      setError(e.message || "Failed to load organizations.");
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, search, statusFilter]);

  useEffect(() => { loadOrgs(); }, [loadOrgs]);

  const openWorkflow = (org) => {
    setWorkflowOrg(org);
    setConfirmModal(null);
    setRejectModal(null);
    setDetailOrg(null);
  };

  const handleApprove = async () => {
    if (!workflowOrg) return;
    setActionLoading(workflowOrg.id);
    try {
      await superAdminService.approveOrganization(workflowOrg.id);
      setWorkflowOrg(null);
      loadOrgs();
    } catch (e) { setError(e.message); }
    finally { setActionLoading(null); }
  };

  const handleRejectClick = () => {
    setRejectModal(workflowOrg);
    setRejectReason("");
  };

  const confirmReject = async () => {
    if (!rejectModal || !rejectReason.trim()) return;
    setActionLoading(rejectModal.id);
    try {
      await superAdminService.rejectOrganization(rejectModal.id, { reason: rejectReason });
      setRejectModal(null);
      setWorkflowOrg(null);
      loadOrgs();
    } catch (e) { setError(e.message); }
    finally { setActionLoading(null); }
  };

  const handleSuspend = async () => {
    if (!workflowOrg) return;
    setActionLoading(workflowOrg.id);
    try {
      await superAdminService.suspendOrganization(workflowOrg.id);
      setWorkflowOrg(null);
      loadOrgs();
    } catch (e) { setError(e.message); }
    finally { setActionLoading(null); }
  };

  const handleReactivate = async () => {
    if (!workflowOrg) return;
    setActionLoading(workflowOrg.id);
    try {
      await superAdminService.reactivateOrganization(workflowOrg.id);
      setWorkflowOrg(null);
      loadOrgs();
    } catch (e) { setError(e.message); }
    finally { setActionLoading(null); }
  };

  const handleDelete = async (id) => {
    if (!confirm("Are you sure you want to delete this organization? This cannot be undone.")) return;
    try {
      await superAdminService.deleteOrganization(id);
      setWorkflowOrg(null);
      loadOrgs();
    } catch (e) { setError(e.message); }
  };

  const totalPages = Math.ceil(total / pageSize);

  const StatusBadge = ({ status }) => {
    const map = {
      PENDING: "bg-amber-50 text-amber-700 border-amber-200",
      ACTIVE: "bg-emerald-50 text-emerald-700 border-emerald-200",
      REJECTED: "bg-red-50 text-red-700 border-red-200",
      SUSPENDED: "bg-slate-50 text-slate-700 border-slate-200",
      DEACTIVATED: "bg-purple-50 text-purple-700 border-purple-200",
    };
    return (
      <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold border ${map[status] || "bg-slate-50 text-slate-600"}`}>
        {status}
      </span>
    );
  };

  const renderActions = (o) => {
    const base = "p-1.5 rounded-lg transition disabled:opacity-40";
    return (
      <div className="flex justify-end gap-1 text-slate-400">
        <button onClick={() => openWorkflow(o)}
          className={`${base} hover:text-blue-500 hover:bg-blue-50`} title="Manage">
          <Eye className="h-4 w-4" />
        </button>
        {o.status === "PENDING" && (
          <>
            <button onClick={() => { setWorkflowOrg(o); handleApprove(); }} disabled={actionLoading === o.id}
              className={`${base} hover:text-emerald-500 hover:bg-emerald-50`} title="Approve">
              <ThumbsUp className="h-4 w-4" />
            </button>
            <button onClick={() => { setWorkflowOrg(o); handleRejectClick(); }} disabled={actionLoading === o.id}
              className={`${base} hover:text-red-500 hover:bg-red-50`} title="Reject">
              <ThumbsDown className="h-4 w-4" />
            </button>
          </>
        )}
        {o.status === "ACTIVE" && (
          <button onClick={() => { setWorkflowOrg(o); if (confirm(`Suspend "${o.name}"?`)) handleSuspend(); }}
            disabled={actionLoading === o.id}
            className={`${base} hover:text-red-500 hover:bg-red-50`} title="Suspend">
            <ShieldAlert className="h-4 w-4" />
          </button>
        )}
        {o.status === "SUSPENDED" && (
          <button onClick={() => { setWorkflowOrg(o); if (confirm(`Reactivate "${o.name}"?`)) handleReactivate(); }}
            disabled={actionLoading === o.id}
            className={`${base} hover:text-emerald-500 hover:bg-emerald-50`} title="Reactivate">
            <RotateCcw className="h-4 w-4" />
          </button>
        )}
        <button onClick={() => navigate(`/super-admin/organizations/${o.id}`)}
          className={`${base} hover:text-[#FF7A00] hover:bg-slate-50`} title="View Details">
          <History className="h-4 w-4" />
        </button>
      </div>
    );
  };

  return (
    <div className="space-y-6 font-sans">
      <PageHeader title="Organizations" description="Manage all organizations on the platform." />

      {error && (
        <div className="rounded-3xl border border-red-200 bg-red-50 p-4 text-red-700 text-sm flex items-center gap-3">
          <AlertTriangle className="h-5 w-5 flex-shrink-0" />
          <span>{error}</span>
          <button onClick={loadOrgs} className="ml-auto text-red-600 underline hover:text-red-800 text-xs font-semibold">Retry</button>
        </div>
      )}

      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-[0_4px_24px_rgba(0,0,0,0.03)]">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mb-6">
          <h3 className="text-lg font-bold text-slate-800">All Organizations ({total})</h3>
          <div className="flex gap-3 items-center">
            <select
              value={statusFilter}
              onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
              className="rounded-full border border-slate-200 bg-slate-50 py-2 px-4 text-sm text-slate-700 outline-none focus:border-[#FF7A00]"
            >
              <option value="">All Status</option>
              <option value="pending">Pending</option>
              <option value="active">Approved</option>
              <option value="rejected">Rejected</option>
              <option value="suspended">Suspended</option>
              <option value="deactivated">Deactivated</option>
            </select>
            <div className="relative max-w-sm w-full">
              <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Search organizations..."
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                className="w-full rounded-full border border-slate-200 bg-slate-50 py-2 pl-10 pr-4 text-sm text-slate-800 placeholder-slate-400 outline-none transition focus:bg-white focus:border-[#FF7A00]"
              />
            </div>
          </div>
        </div>

        {loading ? (
          <div className="text-center py-12 text-slate-400">Loading...</div>
        ) : organizations.length === 0 ? (
          <div className="text-center py-12 text-slate-400">
            <Building className="h-10 w-10 mx-auto mb-3 opacity-40" />
            No organizations found
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-100 text-xs font-semibold uppercase tracking-wider text-slate-500">
                    <th className="py-3 px-4">Organization</th>
                    <th className="py-3 px-4">Org Code</th>
                    <th className="py-3 px-4">Plan</th>
                    <th className="py-3 px-4">Users</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4">Created</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {organizations.map((o) => (
                    <tr key={o.id} className="text-sm text-slate-650 hover:bg-slate-50/50 transition">
                      <td className="py-4 px-4">
                        <div className="flex items-center gap-2.5">
                          <div className="h-9 w-9 bg-slate-100 rounded-xl flex items-center justify-center text-slate-550 border border-slate-200/50">
                            <Building className="h-4.5 w-4.5" />
                          </div>
                          <div>
                            <div className="font-bold text-slate-850">{o.name}</div>
                            <div className="text-[10px] font-mono font-bold text-[#FF7A00]">{o.organization_code || "—"}</div>
                          </div>
                        </div>
                      </td>
                       <td className="py-4 px-4">
                        <span className="inline-flex items-center rounded bg-[#FF7A00]/10 px-1.5 py-0.5 text-[10px] font-mono font-bold text-[#FF7A00]">{o.organization_code || "—"}</span>
                      </td>
                      <td className="py-4 px-4">
                        <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                          o.subscription_plan?.toUpperCase() === "ENTERPRISE" ? "bg-indigo-50 text-indigo-600 border border-indigo-100" :
                          o.subscription_plan?.toUpperCase() === "PROFESSIONAL" ? "bg-blue-50 text-blue-600 border border-blue-100" :
                          o.subscription_plan?.toUpperCase() === "BASIC" ? "bg-[#FF7A00]/5 text-[#FF7A00] border border-[#FF7A00]/10" :
                          o.subscription_plan?.toUpperCase() === "TRIAL" ? "bg-purple-50 text-purple-600 border border-purple-100" :
                          "bg-slate-50 text-slate-600 border border-slate-100"
                        }`}>
                          {o.subscription_plan}
                        </span>
                      </td>
                      <td className="py-4 px-4 font-semibold text-slate-800">{o.user_count}</td>
                      <td className="py-4 px-4"><StatusBadge status={o.status} /></td>
                      <td className="py-4 px-4 text-slate-500">{new Date(o.created_at).toLocaleDateString()}</td>
                      <td className="py-4 px-4 text-right">{renderActions(o)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {totalPages > 1 && (
              <div className="flex items-center justify-between mt-6 pt-4 border-t border-slate-100">
                <span className="text-sm text-slate-500">{total} total organizations</span>
                <div className="flex gap-2 items-center">
                  <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="p-2 rounded-lg border border-slate-200 hover:bg-slate-50 disabled:opacity-40"><ChevronLeft className="h-4 w-4" /></button>
                  <span className="text-sm text-slate-600">Page {page} of {totalPages}</span>
                  <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages} className="p-2 rounded-lg border border-slate-200 hover:bg-slate-50 disabled:opacity-40"><ChevronRight className="h-4 w-4" /></button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Workflow Modal */}
      {workflowOrg && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-3xl p-6 w-full max-w-2xl shadow-xl border border-slate-200 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 bg-[#FF7A00]/10 rounded-2xl flex items-center justify-center">
                  <Building className="h-5 w-5 text-[#FF7A00]" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-800">{workflowOrg.name}</h3>
                  <span className="text-[10px] text-slate-400 font-mono">{workflowOrg.code}</span>
                </div>
              </div>
              <button onClick={() => setWorkflowOrg(null)} className="p-1 hover:bg-slate-100 rounded-lg"><X className="h-5 w-5 text-slate-400" /></button>
            </div>

            {/* Details Grid */}
            <div className="grid grid-cols-2 gap-4 text-sm mb-6">
               <div>
                <span className="text-slate-400 block text-xs">Organization Name</span>
                <span className="font-semibold text-slate-700">{workflowOrg.name}</span>
              </div>
              <div>
                <span className="text-slate-400 block text-xs">Org Code</span>
                <span className="font-semibold text-[#FF7A00] font-mono">{workflowOrg.organization_code || "—"}</span>
              </div>
              <div>
                <span className="text-slate-400 block text-xs">Legacy Code</span>
                <span className="font-semibold text-slate-700 font-mono">{workflowOrg.code}</span>
              </div>
              <div>
                <span className="text-slate-400 block text-xs">Current Status</span>
                <StatusBadge status={workflowOrg.status} />
              </div>
              <div>
                <span className="text-slate-400 block text-xs">Subscription Plan</span>
                <span className="font-semibold text-slate-700 capitalize">{workflowOrg.subscription_plan}</span>
              </div>
              <div>
                <span className="text-slate-400 block text-xs">Organization Admin</span>
                <span className="font-semibold text-slate-700">{workflowOrg.admin_name || "—"}</span>
              </div>
              <div>
                <span className="text-slate-400 block text-xs">Admin Email</span>
                <span className="font-semibold text-slate-700">{workflowOrg.admin_email || "—"}</span>
              </div>
              <div>
                <span className="text-slate-400 block text-xs">User Count</span>
                <span className="font-semibold text-slate-700">{workflowOrg.user_count}</span>
              </div>
              <div>
                <span className="text-slate-400 block text-xs">Registration Date</span>
                <span className="font-semibold text-slate-700">{new Date(workflowOrg.created_at).toLocaleDateString()}</span>
              </div>
              {workflowOrg.approved_by_name && (
                <div>
                  <span className="text-slate-400 block text-xs">Approved By</span>
                  <span className="font-semibold text-slate-700">{workflowOrg.approved_by_name}</span>
                </div>
              )}
              {workflowOrg.approved_at && (
                <div>
                  <span className="text-slate-400 block text-xs">Approved At</span>
                  <span className="font-semibold text-slate-700">{new Date(workflowOrg.approved_at).toLocaleString()}</span>
                </div>
              )}
              {workflowOrg.suspended_at && (
                <div>
                  <span className="text-slate-400 block text-xs">Suspended At</span>
                  <span className="font-semibold text-slate-700">{new Date(workflowOrg.suspended_at).toLocaleString()}</span>
                </div>
              )}
              {workflowOrg.reactivated_at && (
                <div>
                  <span className="text-slate-400 block text-xs">Reactivated At</span>
                  <span className="font-semibold text-slate-700">{new Date(workflowOrg.reactivated_at).toLocaleString()}</span>
                </div>
              )}
              {workflowOrg.rejection_reason && (
                <div className="col-span-2">
                  <span className="text-slate-400 block text-xs">Rejection Reason</span>
                  <p className="mt-1 text-red-600 bg-red-50 rounded-xl p-3 text-sm">{workflowOrg.rejection_reason}</p>
                </div>
              )}
            </div>

            {/* Status-Based Actions */}
            <div className="border-t border-slate-100 pt-4">
              <h4 className="text-sm font-bold text-slate-700 mb-3">Workflow Actions</h4>
              <div className="flex gap-3 flex-wrap">
                {workflowOrg.status === "PENDING" && (
                  <>
                    <button onClick={handleApprove} disabled={actionLoading === workflowOrg.id}
                      className="flex items-center gap-2 px-4 py-2 rounded-full bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700 disabled:opacity-50">
                      <ThumbsUp className="h-4 w-4" /> Approve
                    </button>
                    <button onClick={handleRejectClick} disabled={actionLoading === workflowOrg.id}
                      className="flex items-center gap-2 px-4 py-2 rounded-full bg-red-600 text-white text-sm font-semibold hover:bg-red-700 disabled:opacity-50">
                      <ThumbsDown className="h-4 w-4" /> Reject
                    </button>
                    <button onClick={() => navigate(`/super-admin/organizations/${workflowOrg.id}`)}
                      className="flex items-center gap-2 px-4 py-2 rounded-full border border-slate-200 text-sm text-slate-600 hover:bg-slate-50">
                      <Eye className="h-4 w-4" /> View Details
                    </button>
                  </>
                )}
                {workflowOrg.status === "ACTIVE" && (
                  <>
                    <button onClick={() => { if (confirm(`Suspend "${workflowOrg.name}"?`)) handleSuspend(); }} disabled={actionLoading === workflowOrg.id}
                      className="flex items-center gap-2 px-4 py-2 rounded-full bg-slate-600 text-white text-sm font-semibold hover:bg-slate-700 disabled:opacity-50">
                      <ShieldAlert className="h-4 w-4" /> Suspend
                    </button>
                    <button onClick={() => navigate(`/super-admin/organizations/${workflowOrg.id}`)}
                      className="flex items-center gap-2 px-4 py-2 rounded-full border border-slate-200 text-sm text-slate-600 hover:bg-slate-50">
                      <Eye className="h-4 w-4" /> View Details
                    </button>
                  </>
                )}
                {workflowOrg.status === "SUSPENDED" && (
                  <>
                    <button onClick={() => { if (confirm(`Reactivate "${workflowOrg.name}"?`)) handleReactivate(); }} disabled={actionLoading === workflowOrg.id}
                      className="flex items-center gap-2 px-4 py-2 rounded-full bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700 disabled:opacity-50">
                      <RotateCcw className="h-4 w-4" /> Reactivate
                    </button>
                    <button onClick={() => navigate(`/super-admin/organizations/${workflowOrg.id}`)}
                      className="flex items-center gap-2 px-4 py-2 rounded-full border border-slate-200 text-sm text-slate-600 hover:bg-slate-50">
                      <Eye className="h-4 w-4" /> View Details
                    </button>
                  </>
                )}
                {workflowOrg.status === "REJECTED" && (
                  <>
                    <button onClick={() => navigate(`/super-admin/organizations/${workflowOrg.id}`)}
                      className="flex items-center gap-2 px-4 py-2 rounded-full border border-slate-200 text-sm text-slate-600 hover:bg-slate-50">
                      <Eye className="h-4 w-4" /> View Details
                    </button>
                    <button onClick={() => { setWorkflowOrg(null); handleDelete(workflowOrg.id); }}
                      className="flex items-center gap-2 px-4 py-2 rounded-full bg-red-600 text-white text-sm font-semibold hover:bg-red-700">
                      <XCircle className="h-4 w-4" /> Delete Registration
                    </button>
                  </>
                )}
                {workflowOrg.status === "DEACTIVATED" && (
                  <>
                    <button onClick={() => navigate(`/super-admin/organizations/${workflowOrg.id}`)}
                      className="flex items-center gap-2 px-4 py-2 rounded-full border border-slate-200 text-sm text-slate-600 hover:bg-slate-50">
                      <Eye className="h-4 w-4" /> View Details
                    </button>
                  </>
                )}
              </div>
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
                className="px-4 py-2 rounded-full border border-slate-200 text-sm text-slate-600 hover:bg-slate-50">Cancel</button>
              <button onClick={confirmReject} disabled={!rejectReason.trim()}
                className="flex items-center gap-2 px-4 py-2 rounded-full bg-red-600 text-white text-sm font-semibold hover:bg-red-700 disabled:opacity-50">
                <XCircle className="h-4 w-4" /> Reject
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
