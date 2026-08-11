import { useState, useEffect, useMemo, useCallback } from "react";
import { getAssetRequests, createAssetRequest, approveAssetRequest, rejectAssetRequest, fulfillAssetRequest, cancelAssetRequest } from "../../../service/hrService";

const PRIORITY_OPTIONS = [
  { value: "low", label: "Low" }, { value: "medium", label: "Medium" },
  { value: "high", label: "High" }, { value: "urgent", label: "Urgent" },
];

const STATUS_OPTIONS = [
  { value: "pending", label: "Pending" }, { value: "approved", label: "Approved" },
  { value: "rejected", label: "Rejected" }, { value: "fulfilled", label: "Fulfilled" },
  { value: "cancelled", label: "Cancelled" },
];

const STATUS_COLORS = {
  pending: "bg-yellow-100 text-yellow-800", approved: "bg-green-100 text-green-800",
  rejected: "bg-red-100 text-red-800", fulfilled: "bg-emerald-100 text-emerald-800",
  cancelled: "bg-gray-100 text-gray-800",
};

const PRIORITY_COLORS = {
  low: "bg-gray-100 text-gray-700", medium: "bg-yellow-100 text-yellow-800",
  high: "bg-orange-100 text-orange-800", urgent: "bg-red-100 text-red-800",
};

const initialForm = { employee_name: "", asset_type: "", quantity: 1, priority: "medium", reason: "", notes: "" };

export default function Returns() {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ ...initialForm });
  const [formErrors, setFormErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [actionLoading, setActionLoading] = useState(null);

  const handleAction = useCallback(async (id, action) => {
    setActionLoading(`${action}-${id}`);
    try {
      if (action === "approve") await approveAssetRequest(id);
      if (action === "reject") await rejectAssetRequest(id);
      if (action === "fulfill") await fulfillAssetRequest(id);
      if (action === "cancel") await cancelAssetRequest(id);
      await fetchData();
    } catch (err) {
      setError(err.message || `Failed to ${action} request`);
    } finally {
      setActionLoading(null);
    }
  }, []);

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getAssetRequests();
      setRequests(data?.items || []);
    } catch (err) {
      setError(err.message || "Failed to load requests");
      setRequests([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  const filtered = useMemo(() => {
    let result = requests;
    if (search) {
      const q = search.toLowerCase();
      result = result.filter((r) =>
        (r.employee_name || "").toLowerCase().includes(q) ||
        (r.asset_type || "").toLowerCase().includes(q) ||
        (r.reason || "").toLowerCase().includes(q)
      );
    }
    if (statusFilter) result = result.filter((r) => (r.status || "") === statusFilter);
    return result;
  }, [requests, search, statusFilter]);

  const validate = (d) => {
    const e = {};
    if (!(d.employee_name || "").trim()) e.employee_name = "Employee name is required";
    if (!(d.asset_type || "").trim()) e.asset_type = "Asset type is required";
    if (!d.quantity || d.quantity < 1) e.quantity = "Quantity must be at least 1";
    return e;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const errors = validate(form);
    setFormErrors(errors);
    if (Object.keys(errors).length > 0) return;
    setSubmitting(true);
    try {
      await createAssetRequest({
        employee_name: form.employee_name.trim(),
        asset_type: form.asset_type.trim(),
        quantity: form.quantity,
        priority: form.priority,
        reason: form.reason.trim(),
        notes: form.notes.trim(),
        requested_on: new Date().toISOString().split("T")[0],
      });
      setShowModal(false);
      setForm({ ...initialForm });
      await fetchData();
    } catch (err) {
      setFormErrors({ submit: err.message || "Failed to create request" });
    } finally {
      setSubmitting(false);
    }
  };

  if (loading && requests.length === 0) {
    return (
      <div className="p-6">
        <div className="flex justify-center items-center py-20">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          <span className="ml-3 text-gray-500">Loading requests...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {error && (
        <div className="mb-4 px-4 py-3 bg-red-50 border border-red-200 text-red-700 rounded-lg flex justify-between items-center">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="text-red-500 hover:text-red-700 font-bold">&times;</button>
        </div>
      )}

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Asset Returns &amp; Requests</h1>
          <p className="text-sm text-gray-500 mt-1">Request new assets and track approval status</p>
        </div>
        <button onClick={() => { setForm({ ...initialForm }); setFormErrors({}); setShowModal(true); }}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium transition-colors">+ New Request</button>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <input type="text" placeholder="Search by employee, asset type, or reason..." value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-3 pr-4 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500" />
        </div>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}
          className="px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500">
          <option value="">All Statuses</option>
          {STATUS_OPTIONS.map((s) => (<option key={s.value} value={s.value}>{s.label}</option>))}
        </select>
      </div>

      {filtered.length === 0 && !loading ? (
        <div className="text-center py-16 bg-white rounded-xl border border-gray-200">
          <p className="text-gray-500 font-medium">{requests.length === 0 ? "No requests yet." : "No requests match your search."}</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Employee</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Asset Type</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Qty</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Priority</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Requested</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Approved</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-100">
                {filtered.map((r) => {
                  const emp = r.employee_name || "";
                  const type = r.asset_type || "";
                  const qty = r.quantity || 1;
                  const priority = r.priority || "medium";
                  const status = r.status || "pending";
                  const reqOn = r.requested_on || r.created_at || "";
                  const appOn = r.approved_on || "";
                  return (
                    <tr key={r.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3 text-sm font-medium text-gray-900">{emp}</td>
                      <td className="px-4 py-3 text-sm text-gray-700">{type}</td>
                      <td className="px-4 py-3 text-sm text-gray-700">{qty}</td>
                      <td className="px-4 py-3"><span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${PRIORITY_COLORS[priority] || "bg-gray-100 text-gray-700"}`}>{priority}</span></td>
                      <td className="px-4 py-3"><span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[status] || "bg-gray-100 text-gray-800"}`}>{status}</span></td>
                      <td className="px-4 py-3 text-sm text-gray-500">{reqOn ? new Date(reqOn).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" }) : "-"}</td>
                      <td className="px-4 py-3 text-sm text-gray-500">{appOn ? new Date(appOn).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" }) : <span className="text-gray-300">-</span>}</td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          {status === "pending" && (
                            <>
                              <button onClick={() => handleAction(r.id, "approve")} disabled={actionLoading === `approve-${r.id}`}
                                className="px-2 py-1 text-xs font-medium text-green-600 hover:bg-green-50 rounded transition-colors disabled:opacity-40">
                                {actionLoading === `approve-${r.id}` ? "..." : "Approve"}
                              </button>
                              <button onClick={() => handleAction(r.id, "reject")} disabled={actionLoading === `reject-${r.id}`}
                                className="px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50 rounded transition-colors disabled:opacity-40">
                                {actionLoading === `reject-${r.id}` ? "..." : "Reject"}
                              </button>
                              <button onClick={() => handleAction(r.id, "cancel")} disabled={actionLoading === `cancel-${r.id}`}
                                className="px-2 py-1 text-xs font-medium text-gray-600 hover:bg-gray-50 rounded transition-colors disabled:opacity-40">
                                {actionLoading === `cancel-${r.id}` ? "..." : "Cancel"}
                              </button>
                            </>
                          )}
                          {status === "approved" && (
                            <>
                              <button onClick={() => handleAction(r.id, "fulfill")} disabled={actionLoading === `fulfill-${r.id}`}
                                className="px-2 py-1 text-xs font-medium text-emerald-600 hover:bg-emerald-50 rounded transition-colors disabled:opacity-40">
                                {actionLoading === `fulfill-${r.id}` ? "..." : "Fulfill"}
                              </button>
                              <button onClick={() => handleAction(r.id, "cancel")} disabled={actionLoading === `cancel-${r.id}`}
                                className="px-2 py-1 text-xs font-medium text-gray-600 hover:bg-gray-50 rounded transition-colors disabled:opacity-40">
                                {actionLoading === `cancel-${r.id}` ? "..." : "Cancel"}
                              </button>
                            </>
                          )}
                          {status !== "pending" && status !== "approved" && (
                            <span className="text-xs text-gray-400">-</span>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center px-6 py-4 border-b border-gray-100">
              <h2 className="text-lg font-bold text-gray-800">New Asset Request</h2>
              <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              {formErrors.submit && <div className="text-red-500 text-sm bg-red-50 p-2 rounded">{formErrors.submit}</div>}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Employee Name *</label>
                <input type="text" value={form.employee_name} onChange={(e) => setForm({ ...form, employee_name: e.target.value })}
                  className={`w-full border ${formErrors.employee_name ? "border-red-300" : "border-gray-200"} rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500`} />
                {formErrors.employee_name && <p className="text-red-500 text-xs mt-1">{formErrors.employee_name}</p>}
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Asset Type *</label>
                  <input type="text" value={form.asset_type} onChange={(e) => setForm({ ...form, asset_type: e.target.value })}
                    placeholder="e.g. MacBook Pro"
                    className={`w-full border ${formErrors.asset_type ? "border-red-300" : "border-gray-200"} rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500`} />
                  {formErrors.asset_type && <p className="text-red-500 text-xs mt-1">{formErrors.asset_type}</p>}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Quantity *</label>
                  <input type="number" min="1" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: parseInt(e.target.value) || 1 })}
                    className={`w-full border ${formErrors.quantity ? "border-red-300" : "border-gray-200"} rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500`} />
                  {formErrors.quantity && <p className="text-red-500 text-xs mt-1">{formErrors.quantity}</p>}
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Priority</label>
                <select value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                  {PRIORITY_OPTIONS.map((o) => (<option key={o.value} value={o.value}>{o.label}</option>))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Reason *</label>
                <textarea rows={3} value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })}
                  placeholder="Why do you need this asset?"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Additional Notes</label>
                <textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={() => setShowModal(false)} className="px-4 py-2 text-sm border border-gray-200 rounded-lg hover:bg-gray-50">Cancel</button>
                <button type="submit" disabled={submitting} className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white rounded-lg font-medium transition-colors">
                  {submitting ? "Submitting..." : "Submit Request"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
