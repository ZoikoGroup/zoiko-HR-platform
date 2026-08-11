import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import PageHeader from "../../components/PageHeader";
import {
  AlertTriangle, Building, Calendar, ChevronLeft, FileText, ShieldAlert,
  Activity, Users, CheckCircle, XCircle,
} from "lucide-react";
import { superAdminService } from "../../service/superAdminService";

const STATUS_BADGE = {
  active: "bg-emerald-50 text-emerald-700 border-emerald-200",
  suspended: "bg-slate-50 text-slate-700 border-slate-200",
  deactivated: "bg-purple-50 text-purple-700 border-purple-200",
  rejected: "bg-red-50 text-red-700 border-red-200",
  on_hold: "bg-amber-50 text-amber-700 border-amber-200",
};

function StatusBadge({ status }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold border uppercase ${STATUS_BADGE[status] || "bg-slate-50 text-slate-600"}`}>
      {status || "—"}
    </span>
  );
}

export default function OrganizationDetailPage() {
  const { orgId } = useParams();
  const navigate = useNavigate();
  const [org, setOrg] = useState(null);
  const [auditLogs, setAuditLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [actionLoading, setActionLoading] = useState(null);
  const [statusModal, setStatusModal] = useState(null);
  const [statusReason, setStatusReason] = useState("");

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      setError(null);
      const orgData = await superAdminService.getOrganization(orgId);
      setOrg(orgData);
      try {
        const auditData = await superAdminService.getAuditLogs({ page_size: 20 });
        setAuditLogs(auditData.logs || []);
      } catch { setAuditLogs([]); }
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
      await superAdminService.updateOrganizationStatus(orgId, {
        status: statusModal.status,
        reason: statusReason || null,
      });
      setStatusModal(null);
      setStatusReason("");
      loadAll();
    } catch (e) {
      setError(e.message);
    } finally {
      setActionLoading(null);
    }
  };

  const statusOptions = [
    { value: "active", label: "Active" },
    { value: "suspended", label: "Suspended" },
    { value: "deactivated", label: "Deactivated" },
    { value: "on_hold", label: "On Hold" },
  ];

  if (loading) {
    return (
      <div className="space-y-6 font-sans">
        <PageHeader title="Organization Details" description="Loading..." />
        <div className="flex items-center justify-center py-20 text-slate-400">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-[#FF7A00] border-t-transparent" />
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
                <div className="h-16 w-16 bg-[#FF7A00]/10 rounded-2xl flex items-center justify-center">
                  <Building className="h-8 w-8 text-[#FF7A00]" />
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
                  </div>
                </div>
              </div>
              <select
                value=""
                onChange={(e) => {
                  const target = e.target.value;
                  if (!target) return;
                  const option = statusOptions.find((o) => o.value === target);
                  if (!option) return;
                  setStatusModal({ status: target, label: option.label });
                  setStatusReason("");
                }}
                className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 outline-none focus:border-[#FF7A00] cursor-pointer"
              >
                <option value="">Change status...</option>
                {statusOptions.map((o) => (
                  <option key={o.value} value={o.value} disabled={o.value === org.status}>{o.label}</option>
                ))}
              </select>
            </div>

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
              <div><span className="text-slate-400 block text-xs">Organization Code</span><span className="font-mono text-xs font-semibold text-[#FF7A00]">{org.organization_code || "—"}</span></div>
              <div><span className="text-slate-400 block text-xs">Status</span><StatusBadge status={org.status} /></div>
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
            </div>
          </div>

          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-[0_4px_24px_rgba(0,0,0,0.03)]">
            <h3 className="text-lg font-bold text-slate-800 mb-4">Recent Platform Audit Activity</h3>
            {auditLogs.length === 0 ? (
              <div className="text-center py-8 text-slate-400">No audit logs</div>
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
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}

      {statusModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-3xl p-6 w-full max-w-md shadow-xl border border-slate-200">
            <div className="flex items-center gap-3 mb-4">
              <div className="h-10 w-10 rounded-full bg-[#FF7A00]/10 flex items-center justify-center">
                <ShieldAlert className="h-5 w-5 text-[#FF7A00]" />
              </div>
              <h3 className="text-lg font-bold text-slate-800">Change Organization Status</h3>
            </div>
            <p className="text-sm text-slate-600 mb-4">
              Change <strong>{org?.name}</strong> status to <span className="font-bold">{statusModal.label}</span>.
              Current status: <StatusBadge status={org?.status} />
            </p>
            <textarea
              value={statusReason}
              onChange={(e) => setStatusReason(e.target.value)}
              placeholder="Optional reason for this status change..."
              className="w-full rounded-xl border border-slate-200 bg-white py-2.5 px-4 text-sm text-slate-800 outline-none focus:border-[#FF7A00] min-h-[80px] resize-y"
            />
            <div className="flex gap-3 mt-6 justify-end">
              <button onClick={() => setStatusModal(null)}
                className="px-4 py-2 rounded-full border border-slate-200 text-sm text-slate-600 hover:bg-slate-50">Cancel</button>
              <button onClick={handleStatusChange} disabled={actionLoading === "status"}
                className="flex items-center gap-2 px-4 py-2 rounded-full bg-[#FF7A00] text-white text-sm font-semibold hover:bg-[#E66E00] disabled:opacity-50">
                {actionLoading === "status" ? "Updating..." : `Change to ${statusModal.label}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
