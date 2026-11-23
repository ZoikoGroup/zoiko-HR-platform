import { useState, useEffect, useCallback, useRef } from "react";
import PageHeader from "../../components/PageHeader";
import {
  getAssetRequests,
  approveAssetRequest,
  rejectAssetRequest,
  fulfillAssetRequest,
} from "../../service/hrService";
import {
  Package, Search, CheckCircle, XCircle,
  Clock, AlertCircle, Loader2,
} from "lucide-react";
import { PAGE_SIZE, Pager, useDebounced } from "./assetPickers";
import FulfillAssetDialog from "./FulfillAssetDialog";
import { formatDate } from "../../utils/dateTime";

const STATUS_COLORS = {
  pending: "bg-yellow-100 text-yellow-800",
  approved: "bg-green-100 text-green-800",
  rejected: "bg-red-100 text-red-800",
  fulfilled: "bg-emerald-100 text-emerald-800",
  cancelled: "bg-gray-100 text-gray-800",
};

const PRIORITY_COLORS = {
  low: "bg-gray-100 text-gray-700",
  medium: "bg-yellow-100 text-yellow-800",
  high: "bg-orange-100 text-orange-800",
};

export default function OrgAdminAssetRequestsPage() {
  const [requests, setRequests] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pendingCount, setPendingCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [actionLoading, setActionLoading] = useState(null);
  const [fulfilling, setFulfilling] = useState(null);
  const settledSearch = useDebounced(search);
  const latest = useRef(0);

  // Paged, filtered and searched on the server; the pending banner counts every pending request, not one page.
  const fetchData = useCallback(async () => {
    const mine = ++latest.current;             // a slower, older answer never overwrites a newer one
    setLoading(true);
    setError(null);
    try {
      const [data, pending] = await Promise.all([
        getAssetRequests({
          page,
          per_page: PAGE_SIZE,
          status: statusFilter || undefined,
          search: settledSearch.trim() || undefined,
        }),
        getAssetRequests({ status: "pending", per_page: 1 }).catch(() => null),
      ]);
      if (mine !== latest.current) return;
      setRequests(data?.items || []);
      setTotal(data?.total ?? 0);
      setPendingCount(pending?.total ?? 0);
    } catch (err) {
      if (mine !== latest.current) return;
      setError(err.message || "Failed to load asset requests");
      setRequests([]);
      setTotal(0);
    } finally {
      if (mine === latest.current) setLoading(false);
    }
  }, [page, statusFilter, settledSearch]);

  useEffect(() => { fetchData(); }, [fetchData]);
  useEffect(() => { setPage(1); }, [statusFilter, settledSearch]);

  const handleAction = useCallback(async (id, action, payload) => {
    setActionLoading(`${action}-${id}`);
    try {
      if (action === "approve") await approveAssetRequest(id);
      if (action === "reject") await rejectAssetRequest(id);
      if (action === "fulfill") await fulfillAssetRequest(id, payload);
      await fetchData();
      return true;
    } catch (err) {
      setError(err.message || `Failed to ${action} request`);
      return false;
    } finally {
      setActionLoading(null);
    }
  }, [fetchData]);

  const filtering = Boolean(statusFilter || settledSearch.trim());

  return (
    <div className="space-y-6">
      <PageHeader
        title="Asset Requests"
        description="Review and manage employee asset requests"
      />

      {error && (
        <div className="rounded-2xl border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/30 p-4 text-sm text-red-700 dark:text-red-300 flex items-center justify-between">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="text-red-500 hover:text-red-700 font-bold">&times;</button>
        </div>
      )}

      {!loading && pendingCount > 0 && (
        <div className="flex items-center gap-3 rounded-2xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/30 px-5 py-3 text-sm text-amber-800 dark:text-amber-300">
          <AlertCircle size={16} />
          <span className="font-medium">{pendingCount} pending request{pendingCount > 1 ? "s" : ""} awaiting your review.</span>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search by employee, asset type..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 border border-slate-200 dark:border-[#334155] rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-300 focus:border-blue-400"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-3 py-2 border border-slate-200 dark:border-[#334155] rounded-xl text-sm bg-white dark:bg-[#1e293b] focus:outline-none focus:ring-2 focus:ring-blue-300 focus:border-blue-400"
        >
          <option value="">All Statuses</option>
          <option value="pending">Pending</option>
          <option value="approved">Approved</option>
          <option value="rejected">Rejected</option>
          <option value="fulfilled">Fulfilled</option>
          <option value="cancelled">Cancelled</option>
        </select>
      </div>

      {loading && requests.length === 0 ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-6 h-6 text-blue-500 animate-spin" />
          <span className="ml-3 text-sm text-slate-500 dark:text-slate-400 font-medium">Loading requests...</span>
        </div>
      ) : requests.length === 0 ? (
        <div className="text-center py-20 bg-white dark:bg-[#1e293b] rounded-2xl border border-slate-100 dark:border-[#334155] shadow-sm">
          <Package className="mx-auto h-10 w-10 text-slate-300" />
          <p className="mt-3 text-sm font-medium text-slate-500 dark:text-slate-400">
            {filtering ? "No requests match your filters." : "No asset requests yet."}
          </p>
        </div>
      ) : (
        <div className="bg-white dark:bg-[#1e293b] rounded-2xl border border-slate-100 dark:border-[#334155] shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-100 dark:divide-[#334155]">
              <thead>
                <tr className="border-b border-slate-100 dark:border-[#334155]">
                  <th className="px-5 py-3.5 text-left text-xs font-bold text-slate-400 uppercase tracking-widest">Employee</th>
                  <th className="px-5 py-3.5 text-left text-xs font-bold text-slate-400 uppercase tracking-widest">Asset Type</th>
                  <th className="px-5 py-3.5 text-left text-xs font-bold text-slate-400 uppercase tracking-widest">Qty</th>
                  <th className="px-5 py-3.5 text-left text-xs font-bold text-slate-400 uppercase tracking-widest">Priority</th>
                  <th className="px-5 py-3.5 text-left text-xs font-bold text-slate-400 uppercase tracking-widest">Reason</th>
                  <th className="px-5 py-3.5 text-left text-xs font-bold text-slate-400 uppercase tracking-widest">Status</th>
                  <th className="px-5 py-3.5 text-left text-xs font-bold text-slate-400 uppercase tracking-widest">Approved By</th>
                  <th className="px-5 py-3.5 text-left text-xs font-bold text-slate-400 uppercase tracking-widest">Requested</th>
                  <th className="px-5 py-3.5 text-right text-xs font-bold text-slate-400 uppercase tracking-widest">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50 dark:divide-[#334155]">
                {requests.map((r) => {
                  const status = r.status || "pending";
                  const priority = r.priority || "medium";
                  return (
                    <tr key={r.id} className="hover:bg-slate-50/60 dark:hover:bg-slate-700/30 transition">
                      <td className="px-5 py-3.5 text-sm font-semibold text-slate-800 dark:text-slate-100">{r.employee_name || "-"}</td>
                      <td className="px-5 py-3.5 text-sm text-slate-600 dark:text-slate-300">{r.asset_type || "-"}</td>
                      <td className="px-5 py-3.5 text-sm text-slate-600 dark:text-slate-300">{r.quantity || 1}</td>
                      <td className="px-5 py-3.5">
                        <span className={`inline-block px-2.5 py-1 rounded-full text-xs font-semibold ${PRIORITY_COLORS[priority] || "bg-gray-100 text-gray-700"}`}>
                          {priority.charAt(0).toUpperCase() + priority.slice(1)}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 text-sm text-slate-500 dark:text-slate-400 max-w-[200px] truncate" title={r.reason}>{r.reason || "-"}</td>
                      <td className="px-5 py-3.5">
                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${STATUS_COLORS[status] || "bg-gray-100 text-gray-800"}`}>
                          {status === "pending" && <Clock size={12} />}
                          {status === "approved" && <CheckCircle size={12} />}
                          {status === "rejected" && <XCircle size={12} />}
                          {status.charAt(0).toUpperCase() + status.slice(1)}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 text-sm text-slate-600 dark:text-slate-300">{r.approved_by_name || "-"}</td>
                      <td className="px-5 py-3.5 text-sm text-slate-400">
                        {r.requested_on || r.created_at
                          ? formatDate(r.requested_on || r.created_at)
                          : "-"}
                      </td>
                      <td className="px-5 py-3.5 text-right">
                        {status === "pending" && (
                          <div className="flex items-center justify-end gap-1">
                            <button
                              onClick={() => handleAction(r.id, "approve")}
                              disabled={Boolean(actionLoading)}
                              className="px-3 py-1.5 text-xs font-semibold text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/30 rounded-lg transition disabled:opacity-40"
                            >
                              {actionLoading === `approve-${r.id}` ? "..." : "Approve"}
                            </button>
                            <button
                              onClick={() => handleAction(r.id, "reject")}
                              disabled={Boolean(actionLoading)}
                              className="px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg transition disabled:opacity-40"
                            >
                              {actionLoading === `reject-${r.id}` ? "..." : "Reject"}
                            </button>
                          </div>
                        )}
                        {status === "approved" && (
                          <button
                            onClick={() => setFulfilling(r)}
                            disabled={Boolean(actionLoading)}
                            className="px-3 py-1.5 text-xs font-semibold text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded-lg transition disabled:opacity-40"
                          >
                            {actionLoading === `fulfill-${r.id}` ? "..." : "Fulfill"}
                          </button>
                        )}
                        {status !== "pending" && status !== "approved" && (
                          <span className="text-xs text-slate-300">-</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <Pager page={page} total={total} onPage={setPage} label="requests" />
        </div>
      )}

      {fulfilling && (
        <FulfillAssetDialog
          request={fulfilling}
          saving={actionLoading === `fulfill-${fulfilling.id}`}
          onClose={() => setFulfilling(null)}
          onFulfill={async (assetId) => {
            if (await handleAction(fulfilling.id, "fulfill", { asset_id: assetId })) setFulfilling(null);
          }}
        />
      )}
    </div>
  );
}

