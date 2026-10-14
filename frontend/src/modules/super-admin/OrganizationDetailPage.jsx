import { useState } from "react";
import { DetailSkeleton, TableSkeleton } from "../../components/LoadingSkeletons";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { keys } from "../../service/queryKeys";
import { useParams, useNavigate } from "react-router-dom";
import PageHeader from "../../components/PageHeader";
import {
  AlertTriangle, Building, Calendar, ChevronLeft, FileText, ShieldAlert,
  Activity, Users, CheckCircle, XCircle, CreditCard, ArrowUpRight, ArrowDownRight, X,
  ThumbsUp, ThumbsDown, RotateCcw, Pause, Clock, Trash2,
} from "lucide-react";
import { superAdminService } from "../../service/superAdminService";
import DeleteOrganizationDialog from "../../components/DeleteOrganizationDialog";
import { billingService } from "../../service/billingService";
import { supportAccessService } from "../../service/supportAccessService";
import { useAuth } from "../../context/AuthContext";
import { ROLES } from "../../config/roles";
import EvaluationTimeRemaining from "../../components/EvaluationTimeRemaining";
import { formatDate, formatDateTime } from "../../utils/dateTime";

const STATUS_BADGE = {
  pending: "bg-amber-50 text-amber-700 border-amber-200",
  approved: "bg-blue-50 text-blue-700 border-blue-200",
  active: "bg-emerald-50 text-emerald-700 border-emerald-200",
  rejected: "bg-red-50 text-red-700 border-red-200",
  suspended: "bg-slate-100 text-slate-600 border-slate-200",
  deactivated: "bg-slate-50 text-slate-500 border-slate-200",
  on_hold: "bg-amber-50 text-amber-600 border-amber-200",
};

const STATUS_LABELS = {
  pending: "Pending Review",
  approved: "Approved",
  active: "Active",
  rejected: "Rejected",
  suspended: "Suspended",
  deactivated: "Deactivated",
  on_hold: "On Hold",
};

function StatusBadge({ status }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold border uppercase ${STATUS_BADGE[status] || "bg-slate-50 text-slate-600"}`}>
      {STATUS_LABELS[status] || status || "—"}
    </span>
  );
}

function getStatusOptions(currentStatus) {
  const transitions = {
    pending: [
      { value: "approved", label: "Approve", icon: ThumbsUp, color: "emerald" },
      { value: "rejected", label: "Reject", icon: XCircle, color: "red" },
    ],
    approved: [
      { value: "active", label: "Activate", icon: CheckCircle, color: "emerald" },
      { value: "suspended", label: "Suspend", icon: ShieldAlert, color: "slate" },
      { value: "on_hold", label: "Put On Hold", icon: Pause, color: "amber" },
    ],
    active: [
      { value: "suspended", label: "Suspend", icon: ShieldAlert, color: "slate" },
      { value: "deactivated", label: "Deactivate", icon: XCircle, color: "slate" },
      { value: "on_hold", label: "Put On Hold", icon: Pause, color: "amber" },
    ],
    suspended: [
      { value: "active", label: "Reactivate", icon: RotateCcw, color: "emerald" },
      { value: "deactivated", label: "Deactivate", icon: XCircle, color: "slate" },
    ],
    on_hold: [
      { value: "active", label: "Reactivate", icon: RotateCcw, color: "emerald" },
      { value: "suspended", label: "Suspend", icon: ShieldAlert, color: "slate" },
      { value: "deactivated", label: "Deactivate", icon: XCircle, color: "slate" },
    ],
    rejected: [],
    deactivated: [],
  };
  return transitions[currentStatus] || [];
}

function delinquencyStageStyle(stage) {
  const s = String(stage || "").toLowerCase();
  if (s.includes("day_45")) return "border-red-300 bg-red-50 text-red-800";
  if (s.includes("day_20") || s.includes("day_10")) return "border-amber-300 bg-amber-50 text-amber-800";
  return "border-amber-200 bg-amber-50 text-amber-800";
}

export default function OrganizationDetailPage() {
  const { orgId } = useParams();
  const navigate = useNavigate();
  const { role } = useAuth();
  const isSuperAdmin = role === ROLES.SUPER_ADMIN;
  const [error, setError] = useState(null);
  const [actionLoading, setActionLoading] = useState(null);
  const [statusModal, setStatusModal] = useState(null);
  const [statusReason, setStatusReason] = useState("");
  const [rejectModal, setRejectModal] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [deleteModal, setDeleteModal] = useState(false);

  // Each part of the page is its own cached query under this organization's detail key, so a recent visit shows
  // everything at once, and the parts load independently.
  const qc = useQueryClient();
  const part = (name) => keys.superAdmin.organizations.detailPart(orgId, name);
  const orgQuery = useQuery({ queryKey: keys.superAdmin.organizations.detail(orgId), queryFn: ({ signal }) => superAdminService.getOrganization(orgId, { signal }) });
  const auditQuery = useQuery({
    queryKey: part("audit"), retry: false,
    queryFn: ({ signal }) => superAdminService.getOrganizationAuditLogs(orgId, { page_size: 20 }, { signal }).then((d) => d.logs || []).catch(() => []),
  });
  const billingQuery = useQuery({
    queryKey: part("billing"), retry: false,
    queryFn: async ({ signal }) => {
      try {
        const [subscription, evalData, convData] = await Promise.all([
          billingService.getSubscription(orgId, { signal }),
          billingService.getEvaluations(orgId, { signal }).catch(() => ({ list: [] })),
          billingService.getConversions(orgId, { signal }).catch(() => ({ list: [] })),
        ]);
        return { subscription, evaluations: evalData.list || [], conversions: convData.list || [] };
      } catch { return { subscription: null, evaluations: [], conversions: [] }; }
    },
  });
  const delinquencyQuery = useQuery({ queryKey: part("delinquency"), retry: false, queryFn: ({ signal }) => billingService.getDelinquency(orgId, { signal }).catch(() => null) });
  // Live just-in-time grants on THIS organization (the platform list, narrowed to it).
  const supportQuery = useQuery({
    queryKey: part("support"), retry: false,
    queryFn: ({ signal }) => supportAccessService.grants({ signal })
      .then((rows) => (Array.isArray(rows) ? rows : []).filter((g) => String(g.tenant_id) === String(orgId)))
      .catch(() => []),
  });

  const org = orgQuery.data ?? null;
  const auditLogs = auditQuery.data || [];
  const subscription = billingQuery.data?.subscription ?? null;
  const evaluations = billingQuery.data?.evaluations || [];
  const conversions = billingQuery.data?.conversions || [];
  const delinquency = delinquencyQuery.data ?? null;
  const supportGrants = supportQuery.data || [];
  const loading = orgQuery.isPending;                                     // the page shows once the organization is in
  const billingLoading = billingQuery.isPending;
  const loadError = orgQuery.isError ? (orgQuery.error?.message || "Failed to load organization details.") : null;

  // After any change to this organization (status, approval, support access): its page, the organization lists, the
  // dashboard figures and the audit trail it wrote to.
  const loadAll = () => {
    qc.invalidateQueries({ queryKey: keys.superAdmin.organizations.all });
    qc.invalidateQueries({ queryKey: keys.superAdmin.commandCenter.all });
    qc.invalidateQueries({ queryKey: keys.superAdmin.auditLogs.all });
    qc.invalidateQueries({ queryKey: keys.billing.all });
  };

  const handleStatusChange = async () => {
    if (!statusModal) return;
    setActionLoading("status");
    try {
      const isDestructive = ["suspended", "deactivated", "on_hold", "rejected"].includes(statusModal.value);
      const payload = { status: statusModal.value, reason: statusReason || null };
      if (isDestructive) {
        const confirm = await superAdminService.mintConfirmationToken(orgId, "update_organization_status");
        payload.confirmation_id = confirm.confirmation_id;
        payload.confirmation_token = confirm.token;
      }
      await superAdminService.updateOrganizationStatus(orgId, payload);
      setStatusModal(null);
      setStatusReason("");
      loadAll();
    } catch (e) {
      setError(e.message);
    } finally {
      setActionLoading(null);
    }
  };

  const handleQuickApprove = async () => {
    setActionLoading("approve");
    try {
      await superAdminService.approveOrganization(orgId);
      loadAll();
    } catch (e) { setError(e.message); }
    finally { setActionLoading(null); }
  };

  const handleReject = async () => {
    if (!rejectReason.trim()) return;
    setActionLoading("reject");
    try {
      await superAdminService.rejectOrganization(orgId, { reason: rejectReason });
      setRejectModal(false);
      setRejectReason("");
      loadAll();
    } catch (e) { setError(e.message); }
    finally { setActionLoading(null); }
  };

  const handleRevokeSupport = async (grantId) => {
    try {
      await supportAccessService.revokeGrant(grantId, "revoked from the organization page");
      loadAll();
    } catch (e) { setError(e.message); }
  };

  const handleOrgDeleted = () => {
    setDeleteModal(false);
    navigate("/super-admin/organizations");
  };

  const availableTransitions = org ? getStatusOptions(org.status) : [];

  if (loading) {
    return (
      <div className="space-y-6 font-sans">
        <PageHeader title="Organization Details" description="Loading..." />
        <DetailSkeleton label="Loading organization" />
      </div>
    );
  }

  if (loadError && !org) {
    return (
      <div className="space-y-6 font-sans">
        <PageHeader title="Organization Details" description="Error loading" />
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-red-700 text-sm flex items-center gap-3">
          <AlertTriangle className="h-5 w-5" /><span>{loadError}</span>
          <button onClick={() => orgQuery.refetch()} className="ml-auto text-red-600 underline text-xs font-semibold">Retry</button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 font-sans">
      <div className="flex items-center gap-4">
        <button onClick={() => navigate("/super-admin/organizations")}
          className="p-2 rounded-xl border border-slate-200 bg-white text-slate-500 hover:text-blue-600 hover:bg-blue-50 hover:border-blue-200 transition">
          <ChevronLeft className="h-4 w-4" />
        </button>
        <PageHeader title={org?.name || "Organization"} description={org?.organization_code ? `Code: ${org.organization_code}` : "Organization"} />
        <button onClick={() => setDeleteModal(true)}
          className="ml-auto text-xs text-slate-400 hover:text-red-600 transition-colors">
          Delete organization
        </button>
      </div>

      {error && (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-red-700 text-sm flex items-center gap-3">
          <AlertTriangle className="h-5 w-5" /><span>{error}</span>
          <button onClick={() => setError(null)} className="ml-auto text-red-600 underline text-xs font-semibold">Dismiss</button>
        </div>
      )}

      {org && (
        <>
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-4">
                <div className="h-16 w-16 bg-blue-50 rounded-xl flex items-center justify-center">
                  <Building className="h-8 w-8 text-blue-600" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-slate-900">{org.name}</h2>
                  <div className="flex items-center gap-3 mt-1">
                    <span className="text-xs text-slate-400 font-mono">{org.organization_code}</span>
                    <StatusBadge status={org.status} />
                  </div>
                  <div className="flex items-center gap-4 mt-2 text-xs text-slate-500">
                    <span className="flex items-center gap-1"><Calendar className="h-3 w-3" /> Created {org.created_at ? formatDate(org.created_at) : "—"}</span>
                    <span className="flex items-center gap-1"><Users className="h-3 w-3" /> {org.total_employees} employees</span>
                    {org.subscription_plan && (
                      <span className="flex items-center gap-1"><CreditCard className="h-3 w-3" /> {org.subscription_plan}</span>
                    )}
                    {org.evaluation_ends_at && (
                      <EvaluationTimeRemaining evaluationEndsAt={org.evaluation_ends_at} compact />
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Quick Actions for PENDING orgs */}
            {org.status === "pending" && (
              <div className="mt-4 p-4 rounded-xl bg-amber-50 border border-amber-200">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-sm font-bold text-amber-800">Pending Approval</h4>
                    <p className="text-xs text-amber-600 mt-1">This organization is waiting for admin approval before users can sign in.</p>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={handleQuickApprove} disabled={actionLoading === "approve"}
                      className="flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700 disabled:opacity-50">
                      <ThumbsUp className="h-4 w-4" /> Approve
                    </button>
                    <button onClick={() => setRejectModal(true)}
                      className="flex items-center gap-2 px-4 py-2 rounded-lg bg-red-600 text-white text-sm font-semibold hover:bg-red-700">
                      <ThumbsDown className="h-4 w-4" /> Reject
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Hard-delete for any org (Prompt 5 confirmation safeguards) */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6">
              <div className="rounded-xl bg-slate-50 border border-slate-100 p-4">
                <p className="text-xs text-slate-400">Total Employees</p>
                <p className="text-2xl font-bold text-slate-900 mt-1">{org.total_employees || 0}</p>
              </div>
              <div className="rounded-xl bg-slate-50 border border-slate-100 p-4">
                <p className="text-xs text-slate-400">Active Employees</p>
                <p className="text-2xl font-bold text-blue-600 mt-1">{org.active_employees ?? org.active_employees_label ?? "—"}</p>
              </div>
              <div className="rounded-xl bg-slate-50 border border-slate-100 p-4">
                <p className="text-xs text-slate-400">HR Admins</p>
                <p className="text-2xl font-bold text-slate-900 mt-1">{org.hr_admins ?? org.hr_admins_label ?? "—"}</p>
              </div>
              <div className="rounded-xl bg-slate-50 border border-slate-100 p-4">
                <p className="text-xs text-slate-400">Managers</p>
                <p className="text-2xl font-bold text-slate-900 mt-1">{org.managers ?? org.managers_label ?? "—"}</p>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h3 className="text-lg font-bold text-slate-900 mb-4">Organization Profile</h3>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-6 text-sm">
              <div><span className="text-slate-400 block text-xs">Name</span><span className="font-semibold text-slate-700">{org.name}</span></div>
              <div><span className="text-slate-400 block text-xs">Organization Code</span><span className="font-mono text-xs font-semibold text-blue-600">{org.organization_code || "—"}</span></div>
              <div><span className="text-slate-400 block text-xs">Status</span><StatusBadge status={org.status} /></div>
              <div><span className="text-slate-400 block text-xs">Plan</span><span className="font-semibold text-slate-700">{org.subscription_plan || "—"}</span></div>
              <div><span className="text-slate-400 block text-xs" title="The platform sees a reference, not the person">Admin Contact (reference)</span><span className="font-semibold text-slate-700">{org.admin_name || "—"}</span></div>
              <div><span className="text-slate-400 block text-xs">Admin Email (masked)</span><span className="font-semibold text-slate-700">{org.admin_email || "—"}</span></div>
              <div><span className="text-slate-400 block text-xs">Country</span><span className="font-semibold text-slate-700">{org.country || "—"}</span></div>
              <div><span className="text-slate-400 block text-xs">State</span><span className="font-semibold text-slate-700">{org.state || "—"}</span></div>
              <div><span className="text-slate-400 block text-xs">City</span><span className="font-semibold text-slate-700">{org.city || "—"}</span></div>
              <div><span className="text-slate-400 block text-xs">Timezone</span><span className="font-semibold text-slate-700">{org.timezone || "—"}</span></div>
              <div><span className="text-slate-400 block text-xs">Industry</span><span className="font-semibold text-slate-700">{org.industry || "—"}</span></div>
              <div className="col-span-2"><span className="text-slate-400 block text-xs">Address</span><span className="font-semibold text-slate-700">{org.address || "—"}</span></div>
              <div><span className="text-slate-400 block text-xs">Domain</span><span className="font-semibold text-slate-700">{org.domain || "—"}</span></div>
              <div><span className="text-slate-400 block text-xs">Organization Type</span><span className="font-semibold text-slate-700 capitalize">{org.org_type || "—"}</span></div>
              <div><span className="text-slate-400 block text-xs">Phone</span><span className="font-semibold text-slate-700">{org.phone || "—"}</span></div>
              <div><span className="text-slate-400 block text-xs">Registered Email (masked)</span><span className="font-semibold text-slate-700">{org.registered_email || "—"}</span></div>
              <div><span className="text-slate-400 block text-xs">Created At</span><span className="font-semibold text-slate-700">{org.created_at ? formatDateTime(org.created_at) : "—"}</span></div>
              {org.approved_at && (
                <div><span className="text-slate-400 block text-xs">Approved At</span><span className="font-semibold text-slate-700">{formatDateTime(org.approved_at)}</span></div>
              )}
              {org.approved_by_name && (
                <div><span className="text-slate-400 block text-xs">Approved By</span><span className="font-semibold text-slate-700">{org.approved_by_name}</span></div>
              )}
              {org.rejection_reason && (
                <div className="col-span-2">
                  <span className="text-slate-400 block text-xs">Rejection Reason</span>
                  <p className="mt-1 text-red-600 bg-red-50 rounded-xl p-3 text-sm">{org.rejection_reason}</p>
                </div>
              )}
            </div>
          </div>

          {/* Billing Section */}
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h3 className="text-lg font-bold text-slate-900 mb-4 flex items-center gap-2">
              <CreditCard className="h-5 w-5 text-blue-600" />
              Billing & Subscription
            </h3>
            {billingLoading ? (
              <div className="py-2"><TableSkeleton rows={2} label="Loading billing data" /></div>
            ) : !subscription ? (
              <div className="text-center py-6 text-slate-400 text-sm">
                {org.evaluation_ends_at
                  ? "No active subscription — evaluation period"
                  : "No billing data available"}
              </div>
            ) : (
              <div className="space-y-4">
                {(subscription?.status === "EVALUATION" || org.evaluation_ends_at) && (
                  <EvaluationTimeRemaining evaluationEndsAt={org.evaluation_ends_at} />
                )}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="rounded-xl bg-slate-50 border border-slate-100 p-4">
                    <p className="text-xs text-slate-400">Classification</p>
                    <p className="text-sm font-bold text-slate-900 mt-1 capitalize">{subscription.billing_classification || "—"}</p>
                  </div>
                  <div className="rounded-xl bg-slate-50 border border-slate-100 p-4">
                    <p className="text-xs text-slate-400">Status</p>
                    <p className="text-sm font-bold text-slate-900 mt-1 capitalize">{subscription.status || "—"}</p>
                  </div>
                  <div className="rounded-xl bg-slate-50 border border-slate-100 p-4">
                    <p className="text-xs text-slate-400">Plan</p>
                    <p className="text-sm font-bold text-slate-900 mt-1">{subscription.plan_code?.toUpperCase() || org.subscription_plan || "—"}</p>
                  </div>
                  <div className="rounded-xl bg-slate-50 border border-slate-100 p-4">
                    <p className="text-xs text-slate-400">Workforce</p>
                    <p className="text-sm font-bold text-slate-900 mt-1">{subscription.quantity ?? "—"}</p>
                  </div>
                </div>

                {subscription.billing_cycle && (
                  <div className="text-xs text-slate-500">
                    Billing cycle: <span className="font-semibold">{subscription.billing_cycle}</span>
                    {subscription.renewal_anchor_date && <> · Renewal: <span className="font-semibold">{formatDate(subscription.renewal_anchor_date)}</span></>}
                  </div>
                )}
              </div>
            )}

            {/* Evaluations */}
            {evaluations.length > 0 && (
              <div className="mt-4 pt-4 border-t border-slate-100">
                <h4 className="text-sm font-bold text-slate-700 mb-2">Evaluations</h4>
                <div className="space-y-2">
                  {evaluations.map((ev) => (
                    <div key={ev.id} className="flex items-center justify-between p-2 rounded-xl bg-slate-50 border border-slate-100 text-sm">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-slate-700">Status: {ev.status}</span>
                        {ev.status === "ACTIVE" && ev.evaluation_ends_at && (
                          <EvaluationTimeRemaining evaluationEndsAt={ev.evaluation_ends_at} compact />
                        )}
                      </div>
                      <span className="text-xs text-slate-400">{ev.data_classification}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Conversion History */}
            {conversions.length > 0 && (
              <div className="mt-4 pt-4 border-t border-slate-100">
                <h4 className="text-sm font-bold text-slate-700 mb-2">Conversion History</h4>
                <div className="space-y-2">
                  {conversions.map((c) => (
                    <div key={c.id} className="flex items-center justify-between p-2 rounded-xl bg-slate-50 border border-slate-100 text-sm">
                      <div>
                        <span className="font-semibold text-slate-700">Catalog v{c.catalog_version}</span>
                        <span className="ml-2 text-xs text-slate-400">· {c.quantity_basis}</span>
                      </div>
                      <div className="text-xs text-slate-400">
                        {formatDate(c.commercial_effective_at)} · {c.approver}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Delinquency status (Prompt 5, Section 10 G1-G5) — informational */}
            {delinquency?.has_open_case && (
              <div className="mt-4 pt-4 border-t border-slate-100">
                <h4 className="text-sm font-bold text-slate-700 mb-2">Delinquency Status</h4>
                <div className={`rounded-2xl border p-4 ${delinquencyStageStyle(delinquency.stage)}`} role="alert">
                  <div className="flex items-center gap-2 text-sm font-bold">
                    <AlertTriangle className="h-4 w-4" />
                    Payment overdue — {delinquency.days_elapsed ?? 0} day(s)
                  </div>
                  <p className="text-xs mt-1 opacity-90">
                    Stage: <span className="font-semibold uppercase">{delinquency.stage?.replace(/_/g, " ") || "recovery"}</span>
                    {delinquency.retention_hold_until && (
                      <> · Retention hold until {formatDate(delinquency.retention_hold_until)}</>
                    )}
                  </p>
                  <p className="text-xs mt-1 opacity-70">
                    Service restrictions escalate automatically at day 10 / 20 / 45. This banner is advisory — enforcement is backend-driven.
                  </p>
                </div>
              </div>
            )}

            {/* Live just-in-time support access on this organization */}
            <div className="mt-4 pt-4 border-t border-slate-100">
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-sm font-bold text-slate-700">Support access</h4>
                <button onClick={() => navigate("/super-admin/jit-support-access")}
                  className="text-xs font-semibold text-blue-600 hover:underline">
                  Request or manage access
                </button>
              </div>
              {supportGrants.length === 0 ? (
                <p className="text-xs text-slate-400">No live support grants. Nobody on the platform can see this organization's data.</p>
              ) : (
                <div className="space-y-2">
                  {supportGrants.map((g) => (
                    <div key={g.id} className="flex items-center justify-between p-3 rounded-xl bg-slate-50 border border-slate-100 text-sm">
                      <div>
                        <span className="font-semibold text-slate-700">{g.kind === "BREAK_GLASS" ? "Break-glass" : "Just-in-time grant"}</span>
                        <span className="ml-2 text-xs font-semibold text-emerald-600">Live</span>
                        <div className="text-xs text-slate-400 mt-0.5">
                          {(g.scope?.resources || []).join(", ")} · {g.scope?.record_count ?? 0} records · {(g.scope?.actions || []).join("/")}
                          {" · "}expires {g.expires_at ? formatDateTime(g.expires_at) : "—"}
                        </div>
                      </div>
                      <button onClick={() => handleRevokeSupport(g.id)}
                        className="text-xs font-semibold text-red-600 hover:underline">Revoke</button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h3 className="text-lg font-bold text-slate-900 mb-4">Organization Audit Activity</h3>
            {auditLogs.length === 0 ? (
              <div className="text-center py-8 text-slate-400">No audit logs for this organization</div>
            ) : (
              <div className="space-y-3">
                {auditLogs.map((log) => (
                  <div key={log.id} className="flex items-start gap-3 p-3 rounded-xl bg-white border border-slate-100 hover:bg-blue-50/40 transition-colors duration-150">
                    <div className="h-8 w-8 rounded-full flex items-center justify-center flex-shrink-0 bg-blue-100">
                      <FileText className="h-4 w-4 text-blue-600" />
                    </div>
                    <div className="flex-1">
                      <div className="text-sm font-semibold text-slate-700 capitalize">{log.action}</div>
                      <div className="text-xs text-slate-500">
                        {log.entity_type} {log.entity_id ? `#${log.entity_id} · ` : "· "}
                        {log.performed_by_email || "system"} · {log.created_at ? formatDateTime(log.created_at) : ""}
                      </div>
                      {log.details && (
                        <div className="text-xs text-slate-400 mt-1 font-mono">
                          {typeof log.details === "object" ? JSON.stringify(log.details) : log.details}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}

      {/* Contextual Status Change Modal */}
      {statusModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-xl border border-slate-200">
            <div className="flex items-center gap-3 mb-4">
              <div className="h-10 w-10 rounded-xl bg-blue-50 flex items-center justify-center">
                <ShieldAlert className="h-5 w-5 text-blue-600" />
              </div>
              <h3 className="text-lg font-bold text-slate-900">{statusModal.label} Organization</h3>
            </div>
            <p className="text-sm text-slate-600 mb-4">
              Change <strong>{org?.name}</strong> from <StatusBadge status={org?.status} /> to <span className="font-bold">{statusModal.label}</span>.
            </p>
            {statusModal.value === "rejected" ? (
              <textarea
                value={statusReason}
                onChange={(e) => setStatusReason(e.target.value)}
                placeholder="Reason for rejection (required)..."
                className="w-full rounded-lg border border-slate-200 bg-white hover:border-blue-400 py-2.5 px-4 text-sm text-slate-800 outline-none focus:ring-2 focus:ring-red-400/30 focus:border-red-400 min-h-[80px] resize-y transition"
              />
            ) : (
              <textarea
                value={statusReason}
                onChange={(e) => setStatusReason(e.target.value)}
                placeholder="Optional reason for this status change..."
                className="w-full rounded-lg border border-slate-200 bg-white hover:border-blue-400 py-2.5 px-4 text-sm text-slate-800 outline-none focus:ring-2 focus:ring-[#3B82F6]/30 focus:border-blue-500 min-h-[80px] resize-y transition"
              />
            )}
            <div className="flex gap-3 mt-6 justify-end">
              <button onClick={() => { setStatusModal(null); setStatusReason(""); }}
                className="px-4 py-2 rounded-lg border border-slate-200 text-sm text-slate-600 hover:bg-blue-50 hover:text-blue-700 hover:border-blue-200">Cancel</button>
              <button onClick={handleStatusChange} disabled={actionLoading === "status" || (statusModal.value === "rejected" && !statusReason.trim())}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 disabled:opacity-50">
                {actionLoading === "status" ? "Updating..." : `Confirm ${statusModal.label}`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reject Modal (for quick reject from pending banner) */}
      {rejectModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-xl border border-slate-200">
            <div className="flex items-center gap-3 mb-4">
              <div className="h-10 w-10 rounded-xl bg-red-50 flex items-center justify-center">
                <XCircle className="h-5 w-5 text-red-600" />
              </div>
              <h3 className="text-lg font-bold text-slate-900">Reject Organization</h3>
            </div>
            <p className="text-sm text-slate-600 mb-4">
              Reject <strong>{org?.name}</strong> registration. Provide a reason (required):
            </p>
            <textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="Reason for rejection..."
              className="w-full rounded-lg border border-slate-200 bg-white hover:border-blue-400 py-2.5 px-4 text-sm text-slate-800 outline-none focus:ring-2 focus:ring-red-400/30 focus:border-red-400 min-h-[100px] resize-y transition"
            />
            <div className="flex gap-3 mt-6 justify-end">
              <button onClick={() => { setRejectModal(false); setRejectReason(""); }}
                className="px-4 py-2 rounded-lg border border-slate-200 text-sm text-slate-600 hover:bg-blue-50 hover:text-blue-700 hover:border-blue-200">Cancel</button>
              <button onClick={handleReject} disabled={!rejectReason.trim() || actionLoading === "reject"}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-red-600 text-white text-sm font-semibold hover:bg-red-700 disabled:opacity-50">
                {actionLoading === "reject" ? "Rejecting..." : "Reject"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Organization (shared with the list and User Management) */}
      {deleteModal && org && (
        <DeleteOrganizationDialog org={{ id: org.id ?? Number(orgId), name: org.name }} onClose={() => setDeleteModal(false)} onDeleted={handleOrgDeleted} />
      )}

    </div>
  );
}
