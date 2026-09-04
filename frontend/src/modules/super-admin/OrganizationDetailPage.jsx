import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import PageHeader from "../../components/PageHeader";
import {
  AlertTriangle, Building, Calendar, ChevronLeft, FileText, ShieldAlert,
  Activity, Users, CheckCircle, XCircle, CreditCard, ArrowUpRight, ArrowDownRight, X,
  ThumbsUp, ThumbsDown, RotateCcw, Pause, Clock, Trash2, KeyRound,
} from "lucide-react";
import { superAdminService } from "../../service/superAdminService";
import { billingService } from "../../service/billingService";
import { useAuth } from "../../context/AuthContext";
import { ROLES } from "../../config/roles";
import EvaluationTimeRemaining from "../../components/EvaluationTimeRemaining";

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
  const [org, setOrg] = useState(null);
  const [auditLogs, setAuditLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [actionLoading, setActionLoading] = useState(null);
  const [statusModal, setStatusModal] = useState(null);
  const [statusReason, setStatusReason] = useState("");
  const [subscription, setSubscription] = useState(null);
  const [evaluations, setEvaluations] = useState([]);
  const [conversions, setConversions] = useState([]);
  const [billingLoading, setBillingLoading] = useState(true);
  const [rejectModal, setRejectModal] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [delinquency, setDelinquency] = useState(null);
  const [supportGrants, setSupportGrants] = useState([]);
  const [supportModal, setSupportModal] = useState(false);
  const [supportResult, setSupportResult] = useState(null);
  const [supportBusy, setSupportBusy] = useState(false);
  const [deleteModal, setDeleteModal] = useState(false);

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      setError(null);
      const orgData = await superAdminService.getOrganization(orgId);
      setOrg(orgData);
      try {
        const auditData = await superAdminService.getOrganizationAuditLogs(orgId, { page_size: 20 });
        setAuditLogs(auditData.logs || []);
      } catch { setAuditLogs([]); }

      setBillingLoading(true);
      try {
        const [subData, evalData, convData] = await Promise.all([
          billingService.getSubscription(orgId),
          billingService.getEvaluations(orgId).catch(() => ({ list: [] })),
          billingService.getConversions(orgId).catch(() => ({ list: [] })),
        ]);
        setSubscription(subData);
        setEvaluations(evalData.list || []);
        setConversions(convData.list || []);
      } catch {
        setSubscription(null);
        setEvaluations([]);
        setConversions([]);
      } finally {
        setBillingLoading(false);
      }

      billingService.getDelinquency(orgId)
        .then(setDelinquency)
        .catch(() => setDelinquency(null));
      billingService.listSupportAccess(orgId)
        .then((res) => setSupportGrants(res?.list || []))
        .catch(() => setSupportGrants([]));
    } catch (e) {
      console.error("Failed to load org details", e);
      setError(e.message || "Failed to load organization details.");
    } finally {
      setLoading(false);
    }
  }, [orgId]);

  useEffect(() => { loadAll(); }, [loadAll]);

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

  const handleMintSupport = async () => {
    setSupportBusy(true);
    try {
      const res = await billingService.createSupportAccess({
        organization_id: Number(orgId),
        reason: "Manual time-bounded support access",
        ttl_hours: 24,
      });
      setSupportResult(res);
      setSupportModal(false);
      loadAll();
    } catch (e) { setError(e.message); }
    finally { setSupportBusy(false); }
  };

  const handleRevokeSupport = async (grantId) => {
    try {
      await billingService.revokeSupportAccess(grantId);
      loadAll();
    } catch (e) { setError(e.message); }
  };

  const handleDeleteOrg = async () => {
    setActionLoading("delete");
    try {
      const confirm = await superAdminService.mintConfirmationToken(orgId, "delete_organization");
      await superAdminService.deleteOrganization(orgId, { id: confirm.confirmation_id, token: confirm.token });
      setDeleteModal(false);
      navigate("/super-admin/organizations");
    } catch (e) { setError(e.message); }
    finally { setActionLoading(null); }
  };

  const availableTransitions = org ? getStatusOptions(org.status) : [];

  if (loading) {
    return (
      <div className="space-y-6 font-sans">
        <PageHeader title="Organization Details" description="Loading..." />
        <div className="flex items-center justify-center py-20 text-slate-400">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-[#3B82F6] border-t-transparent" />
        </div>
      </div>
    );
  }

  if (error && !org) {
    return (
      <div className="space-y-6 font-sans">
        <PageHeader title="Organization Details" description="Error loading" />
        <div className="rounded-3xl border border-red-200 bg-red-50 p-4 text-red-700 text-sm flex items-center gap-3">
          <AlertTriangle className="h-5 w-5" /><span>{error}</span>
          <button onClick={loadAll} className="ml-auto text-red-600 underline text-xs font-semibold">Retry</button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 font-sans">
      <div className="flex items-center gap-4">
        <button onClick={() => navigate("/super-admin/organizations")}
          className="p-2 rounded-xl border border-slate-200 hover:bg-slate-50 transition">
          <ChevronLeft className="h-4 w-4 text-slate-500" />
        </button>
        <PageHeader title={org?.name || "Organization"} description={org?.organization_code ? `Code: ${org.organization_code}` : "Organization"} />
      </div>

      {error && (
        <div className="rounded-3xl border border-red-200 bg-red-50 p-4 text-red-700 text-sm flex items-center gap-3">
          <AlertTriangle className="h-5 w-5" /><span>{error}</span>
          <button onClick={() => setError(null)} className="ml-auto text-red-600 underline text-xs font-semibold">Dismiss</button>
        </div>
      )}

      {org && (
        <>
          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-[0_4px_24px_rgba(0,0,0,0.03)]">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-4">
                <div className="h-16 w-16 bg-[#3B82F6]/10 rounded-2xl flex items-center justify-center">
                  <Building className="h-8 w-8 text-[#3B82F6]" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-slate-800">{org.name}</h2>
                  <div className="flex items-center gap-3 mt-1">
                    <span className="text-xs text-slate-400 font-mono">{org.organization_code}</span>
                    <StatusBadge status={org.status} />
                  </div>
                  <div className="flex items-center gap-4 mt-2 text-xs text-slate-500">
                    <span className="flex items-center gap-1"><Calendar className="h-3 w-3" /> Created {org.created_at ? new Date(org.created_at).toLocaleDateString() : "—"}</span>
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
              <div className="mt-4 p-4 rounded-2xl bg-amber-50 border border-amber-200">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-sm font-bold text-amber-800">Pending Approval</h4>
                    <p className="text-xs text-amber-600 mt-1">This organization is waiting for admin approval before users can sign in.</p>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={handleQuickApprove} disabled={actionLoading === "approve"}
                      className="flex items-center gap-2 px-4 py-2 rounded-full bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700 disabled:opacity-50">
                      <ThumbsUp className="h-4 w-4" /> Approve
                    </button>
                    <button onClick={() => setRejectModal(true)}
                      className="flex items-center gap-2 px-4 py-2 rounded-full bg-red-600 text-white text-sm font-semibold hover:bg-red-700">
                      <ThumbsDown className="h-4 w-4" /> Reject
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Hard-delete for REJECTED orgs (Prompt 5 confirmation safeguards) */}
            {org.status === "rejected" && (
              <div className="mt-4 p-4 rounded-2xl bg-red-50 border border-red-200 flex items-center justify-between">
                <div>
                  <h4 className="text-sm font-bold text-red-800">Rejected Organization</h4>
                  <p className="text-xs text-red-600 mt-1">Delete removes the rejected registration permanently (requires a confirmation token).</p>
                </div>
                <button onClick={() => setDeleteModal(true)}
                  className="flex items-center gap-2 px-4 py-2 rounded-full bg-red-600 text-white text-sm font-semibold hover:bg-red-700">
                  <Trash2 className="h-4 w-4" /> Delete
                </button>
              </div>
            )}

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6">
              <div className="rounded-2xl bg-slate-50 border border-slate-100 p-4">
                <p className="text-xs text-slate-400">Total Employees</p>
                <p className="text-2xl font-bold text-slate-800 mt-1">{org.total_employees || 0}</p>
              </div>
              <div className="rounded-2xl bg-slate-50 border border-slate-100 p-4">
                <p className="text-xs text-slate-400">Active Employees</p>
                <p className="text-2xl font-bold text-emerald-600 mt-1">{org.active_employees || 0}</p>
              </div>
              <div className="rounded-2xl bg-slate-50 border border-slate-100 p-4">
                <p className="text-xs text-slate-400">HR Admins</p>
                <p className="text-2xl font-bold text-slate-800 mt-1">{org.hr_admins || 0}</p>
              </div>
              <div className="rounded-2xl bg-slate-50 border border-slate-100 p-4">
                <p className="text-xs text-slate-400">Managers</p>
                <p className="text-2xl font-bold text-slate-800 mt-1">{org.managers || 0}</p>
              </div>
            </div>
          </div>

          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-[0_4px_24px_rgba(0,0,0,0.03)]">
            <h3 className="text-lg font-bold text-slate-800 mb-4">Organization Profile</h3>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-6 text-sm">
              <div><span className="text-slate-400 block text-xs">Name</span><span className="font-semibold text-slate-700">{org.name}</span></div>
              <div><span className="text-slate-400 block text-xs">Organization Code</span><span className="font-mono text-xs font-semibold text-[#3B82F6]">{org.organization_code || "—"}</span></div>
              <div><span className="text-slate-400 block text-xs">Status</span><StatusBadge status={org.status} /></div>
              <div><span className="text-slate-400 block text-xs">Plan</span><span className="font-semibold text-slate-700">{org.subscription_plan || "—"}</span></div>
              <div><span className="text-slate-400 block text-xs">Admin Contact</span><span className="font-semibold text-slate-700">{org.admin_name || "—"}</span></div>
              <div><span className="text-slate-400 block text-xs">Admin Email</span><span className="font-semibold text-slate-700">{org.admin_email || "—"}</span></div>
              <div><span className="text-slate-400 block text-xs">Country</span><span className="font-semibold text-slate-700">{org.country || "—"}</span></div>
              <div><span className="text-slate-400 block text-xs">State</span><span className="font-semibold text-slate-700">{org.state || "—"}</span></div>
              <div><span className="text-slate-400 block text-xs">City</span><span className="font-semibold text-slate-700">{org.city || "—"}</span></div>
              <div><span className="text-slate-400 block text-xs">Timezone</span><span className="font-semibold text-slate-700">{org.timezone || "—"}</span></div>
              <div><span className="text-slate-400 block text-xs">Industry</span><span className="font-semibold text-slate-700">{org.industry || "—"}</span></div>
              <div className="col-span-2"><span className="text-slate-400 block text-xs">Address</span><span className="font-semibold text-slate-700">{org.address || "—"}</span></div>
              <div><span className="text-slate-400 block text-xs">Domain</span><span className="font-semibold text-slate-700">{org.domain || "—"}</span></div>
              <div><span className="text-slate-400 block text-xs">Created At</span><span className="font-semibold text-slate-700">{org.created_at ? new Date(org.created_at).toLocaleString() : "—"}</span></div>
              {org.approved_at && (
                <div><span className="text-slate-400 block text-xs">Approved At</span><span className="font-semibold text-slate-700">{new Date(org.approved_at).toLocaleString()}</span></div>
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
          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-[0_4px_24px_rgba(0,0,0,0.03)]">
            <h3 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
              <CreditCard className="h-5 w-5 text-[#3B82F6]" />
              Billing & Subscription
            </h3>
            {billingLoading ? (
              <div className="text-center py-6 text-slate-400 text-sm">Loading billing data...</div>
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
                  <div className="rounded-2xl bg-slate-50 border border-slate-100 p-4">
                    <p className="text-xs text-slate-400">Classification</p>
                    <p className="text-sm font-bold text-slate-800 mt-1 capitalize">{subscription.billing_classification || "—"}</p>
                  </div>
                  <div className="rounded-2xl bg-slate-50 border border-slate-100 p-4">
                    <p className="text-xs text-slate-400">Status</p>
                    <p className="text-sm font-bold text-slate-800 mt-1 capitalize">{subscription.status || "—"}</p>
                  </div>
                  <div className="rounded-2xl bg-slate-50 border border-slate-100 p-4">
                    <p className="text-xs text-slate-400">Plan</p>
                    <p className="text-sm font-bold text-slate-800 mt-1">{subscription.plan_code?.toUpperCase() || org.subscription_plan || "—"}</p>
                  </div>
                  <div className="rounded-2xl bg-slate-50 border border-slate-100 p-4">
                    <p className="text-xs text-slate-400">Workforce</p>
                    <p className="text-sm font-bold text-slate-800 mt-1">{subscription.quantity ?? "—"}</p>
                  </div>
                </div>

                {subscription.billing_cycle && (
                  <div className="text-xs text-slate-500">
                    Billing cycle: <span className="font-semibold">{subscription.billing_cycle}</span>
                    {subscription.renewal_anchor_date && <> · Renewal: <span className="font-semibold">{new Date(subscription.renewal_anchor_date).toLocaleDateString()}</span></>}
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
                        {new Date(c.commercial_effective_at).toLocaleDateString()} · {c.approver}
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
                      <> · Retention hold until {new Date(delinquency.retention_hold_until).toLocaleDateString()}</>
                    )}
                  </p>
                  <p className="text-xs mt-1 opacity-70">
                    Service restrictions escalate automatically at day 10 / 20 / 45. This banner is advisory — enforcement is backend-driven.
                  </p>
                </div>
              </div>
            )}

            {/* Support Access Grants (Section 18 O3) */}
            <div className="mt-4 pt-4 border-t border-slate-100">
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-sm font-bold text-slate-700">Support Access Grants</h4>
                <button onClick={() => setSupportModal(true)}
                  className="text-xs font-semibold text-[#3B82F6] hover:underline">
                  + Grant Billing Ops access
                </button>
              </div>
              {supportGrants.length === 0 ? (
                <p className="text-xs text-slate-400">No active support-access grants.</p>
              ) : (
                <div className="space-y-2">
                  {supportGrants.map((g) => {
                    const active = !g.revoked_at && (g.expires_at ? new Date(g.expires_at).getTime() > Date.now() : true);
                    return (
                      <div key={g.id} className="flex items-center justify-between p-3 rounded-xl bg-slate-50 border border-slate-100 text-sm">
                        <div>
                          <span className="font-semibold text-slate-700">{g.granted_by || "Billing Ops"}</span>
                          <span className={`ml-2 text-xs font-semibold ${active ? "text-emerald-600" : "text-slate-400"}`}>
                            {active ? "Active" : "Expired/Revoked"}
                          </span>
                          <div className="text-xs text-slate-400 mt-0.5">
                            Expires {g.expires_at ? new Date(g.expires_at).toLocaleString() : "—"}
                            {g.revoked_by && <> · revoked by {g.revoked_by}</>}
                          </div>
                        </div>
                        {active && (
                          <button onClick={() => handleRevokeSupport(g.id)}
                            className="text-xs font-semibold text-red-600 hover:underline">Revoke</button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-[0_4px_24px_rgba(0,0,0,0.03)]">
            <h3 className="text-lg font-bold text-slate-800 mb-4">Organization Audit Activity</h3>
            {auditLogs.length === 0 ? (
              <div className="text-center py-8 text-slate-400">No audit logs for this organization</div>
            ) : (
              <div className="space-y-3">
                {auditLogs.map((log) => (
                  <div key={log.id} className="flex items-start gap-3 p-3 rounded-2xl bg-slate-50/50 border border-slate-100">
                    <div className="h-8 w-8 rounded-full flex items-center justify-center flex-shrink-0 bg-blue-100">
                      <FileText className="h-4 w-4 text-blue-600" />
                    </div>
                    <div className="flex-1">
                      <div className="text-sm font-semibold text-slate-700 capitalize">{log.action}</div>
                      <div className="text-xs text-slate-500">
                        {log.entity_type} {log.entity_id ? `#${log.entity_id} · ` : "· "}
                        {log.performed_by_email || "system"} · {log.created_at ? new Date(log.created_at).toLocaleString() : ""}
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
          <div className="bg-white rounded-3xl p-6 w-full max-w-md shadow-xl border border-slate-200">
            <div className="flex items-center gap-3 mb-4">
              <div className="h-10 w-10 rounded-full bg-[#3B82F6]/10 flex items-center justify-center">
                <ShieldAlert className="h-5 w-5 text-[#3B82F6]" />
              </div>
              <h3 className="text-lg font-bold text-slate-800">{statusModal.label} Organization</h3>
            </div>
            <p className="text-sm text-slate-600 mb-4">
              Change <strong>{org?.name}</strong> from <StatusBadge status={org?.status} /> to <span className="font-bold">{statusModal.label}</span>.
            </p>
            {statusModal.value === "rejected" ? (
              <textarea
                value={statusReason}
                onChange={(e) => setStatusReason(e.target.value)}
                placeholder="Reason for rejection (required)..."
                className="w-full rounded-xl border border-slate-200 bg-white py-2.5 px-4 text-sm text-slate-800 outline-none focus:border-red-400 min-h-[80px] resize-y"
              />
            ) : (
              <textarea
                value={statusReason}
                onChange={(e) => setStatusReason(e.target.value)}
                placeholder="Optional reason for this status change..."
                className="w-full rounded-xl border border-slate-200 bg-white py-2.5 px-4 text-sm text-slate-800 outline-none focus:border-[#3B82F6] min-h-[80px] resize-y"
              />
            )}
            <div className="flex gap-3 mt-6 justify-end">
              <button onClick={() => { setStatusModal(null); setStatusReason(""); }}
                className="px-4 py-2 rounded-full border border-slate-200 text-sm text-slate-600 hover:bg-slate-50">Cancel</button>
              <button onClick={handleStatusChange} disabled={actionLoading === "status" || (statusModal.value === "rejected" && !statusReason.trim())}
                className="flex items-center gap-2 px-4 py-2 rounded-full bg-[#3B82F6] text-white text-sm font-semibold hover:bg-[#2563EB] disabled:opacity-50">
                {actionLoading === "status" ? "Updating..." : `Confirm ${statusModal.label}`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reject Modal (for quick reject from pending banner) */}
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
              Reject <strong>{org?.name}</strong> registration. Provide a reason (required):
            </p>
            <textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="Reason for rejection..."
              className="w-full rounded-xl border border-slate-200 bg-white py-2.5 px-4 text-sm text-slate-800 outline-none focus:border-red-400 min-h-[100px] resize-y"
            />
            <div className="flex gap-3 mt-6 justify-end">
              <button onClick={() => { setRejectModal(false); setRejectReason(""); }}
                className="px-4 py-2 rounded-full border border-slate-200 text-sm text-slate-600 hover:bg-slate-50">Cancel</button>
              <button onClick={handleReject} disabled={!rejectReason.trim() || actionLoading === "reject"}
                className="flex items-center gap-2 px-4 py-2 rounded-full bg-red-600 text-white text-sm font-semibold hover:bg-red-700 disabled:opacity-50">
                {actionLoading === "reject" ? "Rejecting..." : "Reject"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Organization (confirmation-token protected) */}
      {deleteModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-3xl p-6 w-full max-w-md shadow-xl border border-slate-200">
            <div className="flex items-center gap-3 mb-4">
              <div className="h-10 w-10 rounded-full bg-red-100 flex items-center justify-center">
                <Trash2 className="h-5 w-5 text-red-600" />
              </div>
              <h3 className="text-lg font-bold text-slate-800">Delete Organization</h3>
            </div>
            <p className="text-sm text-slate-600 mb-4">
              Permanently delete <strong>{org?.name}</strong>? This irreversible action
              requires a one-time confirmation token and removes the registration.
            </p>
            <div className="flex gap-3 mt-6 justify-end">
              <button onClick={() => setDeleteModal(false)}
                className="px-4 py-2 rounded-full border border-slate-200 text-sm text-slate-600 hover:bg-slate-50">Cancel</button>
              <button onClick={handleDeleteOrg} disabled={actionLoading === "delete"}
                className="flex items-center gap-2 px-4 py-2 rounded-full bg-red-600 text-white text-sm font-semibold hover:bg-red-700 disabled:opacity-50">
                {actionLoading === "delete" ? "Deleting..." : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Grant Support Access */}
      {supportModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-3xl p-6 w-full max-w-md shadow-xl border border-slate-200">
            <div className="flex items-center gap-3 mb-4">
              <div className="h-10 w-10 rounded-full bg-[#3B82F6]/10 flex items-center justify-center">
                <KeyRound className="h-5 w-5 text-[#3B82F6]" />
              </div>
              <h3 className="text-lg font-bold text-slate-800">Grant Billing Ops Access</h3>
            </div>
            <p className="text-sm text-slate-600 mb-4">
              Mint a time-bounded (24h) support-access token for <strong>{org?.name}</strong>.
              The raw token is displayed once after minting.
            </p>
            <div className="flex gap-3 mt-6 justify-end">
              <button onClick={() => setSupportModal(false)}
                className="px-4 py-2 rounded-full border border-slate-200 text-sm text-slate-600 hover:bg-slate-50">Cancel</button>
              <button onClick={handleMintSupport} disabled={supportBusy}
                className="flex items-center gap-2 px-4 py-2 rounded-full bg-[#3B82F6] text-white text-sm font-semibold hover:bg-[#2563EB] disabled:opacity-50">
                {supportBusy ? "Minting..." : "Mint Token"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Support token result (shown once) */}
      {supportResult && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-3xl p-6 w-full max-w-lg shadow-xl border border-slate-200">
            <div className="flex items-center gap-3 mb-4">
              <div className="h-10 w-10 rounded-full bg-emerald-100 flex items-center justify-center">
                <KeyRound className="h-5 w-5 text-emerald-600" />
              </div>
              <h3 className="text-lg font-bold text-slate-800">Support Access Token</h3>
            </div>
            <p className="text-xs text-slate-500 mb-2">Copy this now — the raw token is shown once and cannot be retrieved again.</p>
            <pre className="bg-slate-900 text-emerald-300 rounded-xl p-4 text-xs whitespace-pre-wrap break-all font-mono select-all">{supportResult.token}</pre>
            <div className="flex gap-3 mt-6 justify-end">
              <button onClick={() => { setSupportResult(null); loadAll(); }}
                className="px-4 py-2 rounded-full bg-[#3B82F6] text-white text-sm font-semibold hover:bg-[#2563EB]">Done</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
