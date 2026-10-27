// Organization Admin — Time Requests (overtime + attendance corrections).
// Organization admin is an HR role, so /hr/time/* already scopes to their whole
// organization: they can view and decide every request, not just their own.
import { useCallback, useMemo, useState } from "react";
import PageHeader from "../../components/PageHeader";
import { Clock2, Clock, Loader2, Search, CheckCircle2, XCircle } from "lucide-react";
import {
  decideCorrection,
  decideOvertime,
  listCorrections,
  listOvertime,
} from "../../service/workDocumentsService";
import { formatDate } from "../../utils/dateTime";

const TABS = [
  { key: "overtime", label: "Overtime Requests", icon: Clock },
  { key: "corrections", label: "Attendance Corrections", icon: Clock2 },
];

const STATUS_COLORS = {
  PENDING: "bg-amber-50 text-amber-700 border-amber-200",
  APPROVED: "bg-emerald-50 text-emerald-700 border-emerald-200",
  REJECTED: "bg-rose-50 text-rose-700 border-rose-200",
};

const inputCls =
  "w-full pl-3 pr-4 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-300 focus:border-blue-400 bg-white";

export default function OrgAdminTimeRequestsPage() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState("overtime");
  const [overtime, setOvertime] = useState([]);
  const [corrections, setCorrections] = useState([]);
  const [loading, setLoading] = useState({ overtime: true, corrections: true });
  const [error, setError] = useState(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [actionLoading, setActionLoading] = useState(null);

  // Decision modal state
  const [modal, setModal] = useState(null); // { kind, id, employee, ...row }

  const fetchOvertime = useCallback(async () => {
    setLoading((s) => ({ ...s, overtime: true }));
    try {
      const data = await listOvertime();
      setOvertime(data?.items || []);
    } catch (err) {
      setError(err?.message || "Failed to load overtime requests");
      setOvertime([]);
    } finally {
      setLoading((s) => ({ ...s, overtime: false }));
    }
  }, []);

  const fetchCorrections = useCallback(async () => {
    setLoading((s) => ({ ...s, corrections: true }));
    try {
      const data = await listCorrections();
      setCorrections(data?.items || []);
    } catch (err) {
      setError(err?.message || "Failed to load correction requests");
      setCorrections([]);
    } finally {
      setLoading((s) => ({ ...s, corrections: false }));
    }
  }, []);

  useEffect(() => { fetchOvertime(); fetchCorrections(); }, [fetchOvertime, fetchCorrections]);
  const pendingCount = overtime.filter((o) => o.status === "PENDING").length
    + corrections.filter((c) => c.status === "PENDING").length;

  const employeeName = (row) => {
    const fn = row.employee_first_name || row.first_name || "";
    const ln = row.employee_last_name || row.last_name || "";
    return (fn + " " + ln).trim() || `Employee #${row.employee_id}`;
  };

  const filtered = useMemo(() => {
    const rows = activeTab === "overtime" ? overtime : corrections;
    const q = search.toLowerCase().trim();
    return rows.filter((r) => {
      if (statusFilter && (r.status || "") !== statusFilter) return false;
      if (!q) return true;
      const haystack = [employeeName(r), r.reason || "", r.reason_detail || "", r.date || "", r.status || ""]
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [activeTab, overtime, corrections, search, statusFilter]);

  const openDecide = (kind, id) => {
    const rows = kind === "overtime" ? overtime : corrections;
    const row = rows.find((r) => r.id === id);
    if (!row) return;
    setModal({ kind, id, employee: employeeName(row), ...row });
    setError(null);
  };

  const closeModal = () => setModal(null);

  const handleDecision = useCallback(async (approve) => {
    if (!modal) return;
    const { kind, id } = modal;
    setActionLoading(`${approve ? "approve" : "reject"}-${id}`);
    try {
      if (kind === "overtime") {
        await decideOvertime(id, {
          approve,
          reason: modal.decisionReason || "",
          compensation_method: modal.compensationMethod || "per_policy",
        });
      } else {
        await decideCorrection(id, {
          approve,
          reason: modal.decisionReason || "",
        });
      }
      closeModal();
      await (activeTab === "overtime" ? fetchOvertime() : fetchCorrections());
    } catch (err) {
      setError(err?.message || `Failed to ${approve ? "approve" : "reject"} request`);
    } finally {
      setActionLoading(null);
    }
  }, [modal, activeTab, fetchOvertime, fetchCorrections]);

  const rows = activeTab === "overtime" ? overtime : corrections;
  const isLoading = loading[activeTab];

  const timeLabel = (r) => {
    if (activeTab === "overtime") {
      return `${r.start_time || "-"} – ${r.end_time || "-"} · ${Number(r.hours || 0).toFixed(1)}h`;
    }
    const cin = r.requested_check_in || r.requestedCheckIn || "-";
    const cout = r.requested_check_out || r.requestedCheckOut || "-";
    return `${cin} → ${cout}`;
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Time Requests"
        description="Review and decide employee overtime and attendance correction requests across your organization."
      />

      {error && (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 flex items-center justify-between">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="text-red-500 hover:text-red-700 font-bold">&times;</button>
        </div>
      )}

      {pendingCount > 0 && (
        <div className="flex items-center gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-5 py-3 text-sm text-amber-800">
          <Clock size={16} />
          <span className="font-medium">
            {pendingCount} pending request{pendingCount > 1 ? "s" : ""} awaiting your decision.
          </span>
        </div>
      )}

      {/* Tab bar */}
      <div className="inline-flex flex-wrap gap-1 rounded-xl border border-slate-200 bg-white p-1">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setActiveTab(t.key)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
              activeTab === t.key
                ? "bg-blue-600 text-white shadow-sm"
                : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
            }`}
          >
            <t.icon size={16} className={`mr-1.5 ${activeTab === t.key ? "text-white" : "text-slate-400"}`} />
            {t.label}
          </button>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[220px] max-w-md">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search by employee, reason, date..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className={inputCls}
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-3 py-2 border border-slate-200 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-300 focus:border-blue-400"
        >
          <option value="">All Statuses</option>
          <option value="PENDING">Pending</option>
          <option value="APPROVED">Approved</option>
          <option value="REJECTED">Rejected</option>
        </select>
      </div>

      {/* Empty / loading */}
      {isLoading && rows.length === 0 ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-6 h-6 text-blue-500 animate-spin" />
          <span className="ml-3 text-sm text-slate-500 font-medium">Loading time requests…</span>
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-20 bg-white rounded-2xl border border-slate-100 shadow-sm">
          <Clock size={24} className="mx-auto h-10 w-10 text-slate-300" />
          <p className="mt-3 text-sm font-medium text-slate-500">
            {rows.length === 0 ? "No time requests yet." : "No requests match your filters."}
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-50">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50">
                  {activeTab === "overtime" ? (
                    <>
                      <th className="px-5 py-3.5 text-left text-xs font-bold text-slate-400 uppercase tracking-widest">Employee</th>
                      <th className="px-5 py-3.5 text-left text-xs font-bold text-slate-400 uppercase tracking-widest">Date</th>
                      <th className="px-5 py-3.5 text-left text-xs font-bold text-slate-400 uppercase tracking-widest">Time</th>
                      <th className="px-5 py-3.5 text-left text-xs font-bold text-slate-400 uppercase tracking-widest">Hours</th>
                      <th className="px-5 py-3.5 text-left text-xs font-bold text-slate-400 uppercase tracking-widest">Reason</th>
                      <th className="px-5 py-3.5 text-left text-xs font-bold text-slate-400 uppercase tracking-widest">Status</th>
                      <th className="px-5 py-3.5 text-left text-xs font-bold text-slate-400 uppercase tracking-widest">Requested</th>
                      <th className="px-5 py-3.5 text-left text-xs font-bold text-slate-400 uppercase tracking-widest">Decided By</th>
                      <th className="px-5 py-3.5 text-right text-xs font-bold text-slate-400 uppercase tracking-widest">Actions</th>
                    </>
                  ) : (
                    <>
                      <th className="px-5 py-3.5 text-left text-xs font-bold text-slate-400 uppercase tracking-widest">Employee</th>
                      <th className="px-5 py-3.5 text-left text-xs font-bold text-slate-400 uppercase tracking-widest">Date</th>
                      <th className="px-5 py-3.5 text-left text-xs font-bold text-slate-400 uppercase tracking-widest">Requested Times</th>
                      <th className="px-5 py-3.5 text-left text-xs font-bold text-slate-400 uppercase tracking-widest">Original Times</th>
                      <th className="px-5 py-3.5 text-left text-xs font-bold text-slate-400 uppercase tracking-widest">Reason</th>
                      <th className="px-5 py-3.5 text-left text-xs font-bold text-slate-400 uppercase tracking-widest">Status</th>
                      <th className="px-5 py-3.5 text-left text-xs font-bold text-slate-400 uppercase tracking-widest">Requested</th>
                      <th className="px-5 py-3.5 text-left text-xs font-bold text-slate-400 uppercase tracking-widest">Decided By</th>
                      <th className="px-5 py-3.5 text-right text-xs font-bold text-slate-400 uppercase tracking-widest">Actions</th>
                    </>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {filtered.map((r) => {
                  const status = r.status || "PENDING";
                  const pending = status === "PENDING";
                  const deciderName = r.decided_by_name
                    || (r.decided_by_first_name || r.decided_by_last_name
                      ? `${r.decided_by_first_name || ""} ${r.decided_by_last_name || ""}`.trim()
                      : null);
                  return (
                    <tr key={r.id} className="hover:bg-slate-50/60 transition">
                      <td className="px-5 py-3.5 text-sm font-semibold text-slate-800">{employeeName(r)}</td>
                      <td className="px-5 py-3.5 text-sm text-slate-600">{formatDate(r.date) || "-"}</td>
                      {activeTab === "overtime" ? (
                        <>
                          <td className="px-5 py-3.5 text-sm text-slate-600 font-mono">{timeLabel(r)}</td>
                          <td className="px-5 py-3.5 text-sm text-slate-600">{Number(r.hours || 0).toFixed(1)}</td>
                        </>
                      ) : (
                        <>
                          <td className="px-5 py-3.5 text-sm text-slate-600 font-mono">{timeLabel(r)}</td>
                          <td className="px-5 py-3.5 text-sm text-slate-600 font-mono">
                            {`${r.original_check_in || "-"} → ${r.original_check_out || "-"} `}
                          </td>
                        </>
                      )}
                      <td className="px-5 py-3.5 text-sm text-slate-500 max-w-[220px] truncate" title={r.reason || r.reason_detail || "-"}>
                        {activeTab === "overtime" ? (r.reason || "-") : (r.reason_detail || r.reason || "-")}
                      </td>
                      <td className="px-5 py-3.5">
                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${STATUS_COLORS[status] || "bg-gray-100 text-gray-800"}`}>
                          {status === "PENDING" && <Clock2 size={12} />}
                          {status === "APPROVED" && <CheckCircle2 size={12} />}
                          {status === "REJECTED" && <XCircle size={12} />}
                          {status.charAt(0).toUpperCase() + status.slice(1).toLowerCase()}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 text-sm text-slate-400">
                        {formatDate(r.created_at || r.requested_at) || "-"}
                      </td>
                      <td className="px-5 py-3.5 text-sm text-slate-600">{deciderName || "-"}</td>
                      <td className="px-5 py-3.5 text-right">
                        {pending && (
                          <div className="flex items-center justify-end gap-1">
                            <button
                              onClick={() => openDecide(activeTab, r.id)}
                              disabled={actionLoading === `approve-${r.id}` || actionLoading === `reject-${r.id}`}
                              className="px-3 py-1.5 text-xs font-semibold text-emerald-600 hover:bg-emerald-50 rounded-lg transition disabled:opacity-40"
                            >
                              {actionLoading === `approve-${r.id}` ? <Loader2 size={14} className="animate-spin" /> : "Approve"}
                            </button>
                            <button
                              onClick={() => openDecide(activeTab, r.id)}
                              disabled={actionLoading === `approve-${r.id}` || actionLoading === `reject-${r.id}`}
                              className="px-3 py-1.5 text-xs font-semibold text-rose-600 hover:bg-rose-50 rounded-lg transition disabled:opacity-40"
                            >
                              {actionLoading === `reject-${r.id}` ? <Loader2 size={14} className="animate-spin" /> : "Reject"}
                            </button>
                          </div>
                        )}
                        {!pending && <span className="text-xs text-slate-300">-</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Decision modal */}
      {modal && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-sm" onClick={closeModal} aria-hidden="true">
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={(e) => e.stopPropagation()}>
            <div className="bg-white dark:bg-[#1e293b] rounded-2xl border border-slate-200 dark:border-[#334155] shadow-2xl w-full max-w-md p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  {modal.kind === "overtime" ? "Decide Overtime Request" : "Decide Attendance Correction"}
                </h3>
                <button type="button" onClick={closeModal} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-900">
                  <XCircle size={20} />
                </button>
              </div>

              <div className="space-y-3 text-sm mb-4">
                <div className="flex justify-between">
                  <span className="text-slate-500">Employee</span>
                  <span className="font-medium text-slate-800 dark:text-slate-200">{modal.employee}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Date</span>
                  <span className="font-medium text-slate-800 dark:text-slate-200">{formatDate(modal.date) || "-"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Time</span>
                  <span className="font-medium text-slate-800 dark:text-slate-200 font-mono">{timeLabel(modal)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Reason</span>
                  <span className="text-slate-700 dark:text-slate-300 break-words">{modal.reason || modal.reason_detail || "-"}</span>
                </div>
                {modal.kind === "overtime" && (
                  <div className="flex justify-between">
                    <span className="text-slate-500">Hours</span>
                    <span className="font-medium text-slate-800 dark:text-slate-200">{Number(modal.hours || 0).toFixed(1)}h</span>
                  </div>
                )}
              </div>

              <div className="space-y-3 mb-4">
                <div className="flex items-center gap-2">
                  <input
                    type="radio"
                    name={`decide-${modal.id}`}
                    checked={modal.approve !== false}
                    onChange={() => setModal({ ...modal, approve: true })}
                    className="accent-blue-600"
                  />
                  <label className="text-sm font-semibold text-slate-800 dark:text-slate-200">Approve</label>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="radio"
                    name={`decide-${modal.id}`}
                    checked={modal.approve === false}
                    onChange={() => setModal({ ...modal, approve: false })}
                    className="accent-rose-600"
                  />
                  <label className="text-sm font-semibold text-slate-800 dark:text-slate-200">Reject</label>
                </div>
                {modal.kind === "overtime" && (
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Compensation method</label>
                    <select
                      value={modal.compensationMethod || "per_policy"}
                      onChange={(e) => setModal({ ...modal, compensationMethod: e.target.value })}
                      className={inputCls}
                    >
                      <option value="pay">Paid</option>
                      <option value="time_off">Time off in lieu</option>
                      <option value="per_policy">As set out in policy</option>
                    </select>
                  </div>
                )}
                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Decision reason</label>
                  <label className="text-xs text-slate-400 block mb-1">
                    {modal.kind === "overtime" && !modal.approve ? "Required when refusing" : "Optional"}
                  </label>
                  <textarea
                    value={modal.decisionReason || ""}
                    onChange={(e) => setModal({ ...modal, decisionReason: e.target.value })}
                    rows={2}
                    className={inputCls}
                    placeholder="Enter a reason for your decision…"
                  />
                </div>
              </div>

              {error && (
                <div className="mb-3 p-2.5 rounded-lg border border-red-200 bg-red-50 text-red-700 text-xs">{error}</div>
              )}

              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={closeModal}
                  disabled={actionLoading && actionLoading.includes(modal.id)}
                  className="px-4 py-2 rounded-xl text-sm font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-40"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => handleDecision(modal.approve !== false)}
                  disabled={
                    actionLoading && actionLoading.includes(modal.id)
                    || (!modal.approve && !modal.decisionReason && modal.kind === "overtime")
                    || (!modal.approve && !modal.decisionReason && modal.kind === "corrections")
                  }
                  className={`px-4 py-2 rounded-xl text-sm font-semibold text-white shadow-sm disabled:opacity-40 ${
                    modal.approve !== false
                      ? "bg-emerald-600 hover:bg-emerald-700"
                      : "bg-rose-600 hover:bg-rose-700"
                  }`}
                >
                  {actionLoading && actionLoading.includes(modal.id)
                    ? <Loader2 size={16} className="animate-spin" />
                    : modal.approve !== false ? "Approve" : "Reject"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
