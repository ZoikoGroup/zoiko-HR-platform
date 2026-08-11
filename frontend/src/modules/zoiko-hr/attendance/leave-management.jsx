import { useState, useEffect, useCallback, useMemo } from "react";
import { NavLink } from "react-router-dom";
import { Plus, Search, Pencil, Trash2, ChevronLeft, ChevronRight, CheckCircle, X, AlertCircle } from "lucide-react";
import HRPage from "../../../components/HRPage";
import { getLeaveRequests, createLeaveRequest, updateLeaveRequest, deleteLeaveRequest, getLeaveBalances, reviewLeaveRequest } from "../../../service/hrService";

const NAV_ITEMS = [
  { label: "Dashboard", href: "/zoiko-hr/attendance" },
  { label: "Holiday Calendar", href: "/zoiko-hr/attendance/holidays" },
  { label: "Attendance Analytics", href: "/zoiko-hr/attendance/analytics" },
];

function SubNav() {
  return (
    <div className="flex gap-1 overflow-x-auto pb-1 mb-6 border-b border-gray-100">
      {NAV_ITEMS.map((item) => (
        <NavLink key={item.href} to={item.href} end={item.href === "/zoiko-hr/attendance"}
          className={({ isActive }) =>
            `whitespace-nowrap px-3 py-2 text-sm font-medium rounded-t-lg transition-colors ${isActive ? "text-orange-600 border-b-2 border-orange-600 bg-orange-50/50" : "text-gray-500 hover:text-gray-700 hover:bg-gray-50"}`
          }>
          {item.label}
        </NavLink>
      ))}
    </div>
  );
}

const LEAVE_TYPES = ["annual", "sick", "personal", "maternity", "paternity", "bereavement", "unpaid", "other"];
const LEAVE_STATUSES = ["pending", "approved", "rejected", "cancelled"];

const LEAVE_TYPE_COLORS = {
  annual: "bg-blue-100 text-blue-800",
  sick: "bg-red-100 text-red-800",
  personal: "bg-purple-100 text-purple-800",
  maternity: "bg-pink-100 text-pink-800",
  paternity: "bg-indigo-100 text-indigo-800",
  bereavement: "bg-gray-100 text-gray-800",
  unpaid: "bg-yellow-100 text-yellow-800",
  other: "bg-orange-100 text-orange-800",
};

const STATUS_COLORS = {
  pending: "bg-yellow-100 text-yellow-800",
  approved: "bg-green-100 text-green-800",
  rejected: "bg-red-100 text-red-800",
  cancelled: "bg-gray-100 text-gray-500",
};

const PAGE_SIZE = 10;

const initialForm = {
  employee_id: "", leave_type: "annual", start_date: "", end_date: "", reason: "",
};

function formatDate(dateStr) {
  if (!dateStr) return "-";
  try { return new Date(dateStr).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" }); }
  catch { return dateStr; }
}

function calcDays(start, end) {
  if (!start || !end) return 0;
  try {
    const s = new Date(start), e = new Date(end);
    return Math.max(1, Math.ceil((e - s) / (1000 * 60 * 60 * 24)) + 1);
  } catch { return 0; }
}

function StatusBadge({ status }) {
  const m = { pending: "bg-yellow-100 text-yellow-800", approved: "bg-green-100 text-green-800", rejected: "bg-red-100 text-red-800", cancelled: "bg-gray-100 text-gray-500" };
  return <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium capitalize ${m[status] || "bg-gray-100 text-gray-800"}`}>{status}</span>;
}

function LeaveTypeBadge({ type }) {
  const color = LEAVE_TYPE_COLORS[type] || "bg-gray-100 text-gray-800";
  return <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium capitalize ${color}`}>{type?.replace(/_/g, " ")}</span>;
}

export default function LeaveManagement() {
  const [requests, setRequests] = useState([]);
  const [balances, setBalances] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [page, setPage] = useState(1);
  const [showModal, setShowModal] = useState(false);
  const [editItem, setEditItem] = useState(null);
  const [form, setForm] = useState({ ...initialForm });
  const [formErrors, setFormErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    getLeaveRequests()
      .then((d) => setRequests(Array.isArray(d) ? d : d?.items || d?.data || []))
      .catch((err) => setError(err?.message || "Failed to load leave requests"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const loadBalances = useCallback(() => {
    getLeaveBalances()
      .then((d) => setBalances(d))
      .catch(() => {});
  }, []);

  useEffect(() => { loadBalances(); }, [loadBalances]);

  const filtered = useMemo(() => {
    let result = requests;
    if (search) {
      const q = search.toLowerCase();
      result = result.filter((r) =>
        (r.employee_name || r.employee || "").toLowerCase().includes(q)
      );
    }
    if (statusFilter) result = result.filter((r) => r.status === statusFilter);
    if (typeFilter) result = result.filter((r) => r.leave_type === typeFilter);
    if (dateFrom) result = result.filter((r) => r.start_date >= dateFrom);
    if (dateTo) result = result.filter((r) => (r.end_date || r.start_date) <= dateTo);
    return result;
  }, [requests, search, statusFilter, typeFilter, dateFrom, dateTo]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const paged = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const openCreate = () => {
    setEditItem(null);
    setForm({ ...initialForm });
    setFormErrors({});
    setShowModal(true);
  };

  const openEdit = (r) => {
    setEditItem(r);
    setForm({
      employee_id: r.employee_id || "",
      leave_type: r.leave_type || "annual",
      start_date: r.start_date ? r.start_date.substring(0, 10) : "",
      end_date: r.end_date ? r.end_date.substring(0, 10) : "",
      reason: r.reason || "",
    });
    setFormErrors({});
    setShowModal(true);
  };

  const validate = (d) => {
    const e = {};
    if (!d.employee_id) e.employee_id = "Employee is required";
    if (!d.leave_type) e.leave_type = "Leave type is required";
    if (!d.start_date) e.start_date = "Start date is required";
    if (!d.end_date) e.end_date = "End date is required";
    if (d.start_date && d.end_date && d.start_date > d.end_date) e.end_date = "End date must be after start date";
    return e;
  };

  const handleSubmit = async (ev) => {
    ev.preventDefault();
    const errors = validate(form);
    setFormErrors(errors);
    if (Object.keys(errors).length > 0) return;
    setSubmitting(true);
    try {
      const payload = {
        employee_id: Number(form.employee_id),
        leave_type: form.leave_type,
        start_date: form.start_date,
        end_date: form.end_date,
        reason: form.reason?.trim() || null,
      };
      if (editItem) {
        await updateLeaveRequest(editItem.id, payload);
      } else {
        await createLeaveRequest(payload);
      }
      setShowModal(false);
      load();
    } catch (err) {
      setFormErrors({ submit: err.message || "Failed to save leave request" });
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Are you sure you want to delete this leave request?")) return;
    try {
      await deleteLeaveRequest(id);
      load();
    } catch (err) {
      setError(err.message || "Failed to delete leave request");
    }
  };

  const handleReview = async (id, status) => {
    try {
      await reviewLeaveRequest(id, { status });
      load();
    } catch (err) {
      setError(err.message || `Failed to ${status} leave request`);
    }
  };

  const balanceEntries = useMemo(() => {
    if (!balances) return [];
    if (Array.isArray(balances)) return balances;
    if (balances.data && Array.isArray(balances.data)) return balances.data;
    if (balances.leave_balances) return Array.isArray(balances.leave_balances) ? balances.leave_balances : [];
    return [];
  }, [balances]);

  if (loading) {
    return (
      <HRPage title="Leave Management" subtitle="Manage employee leave requests and balances">
        <SubNav />
        <div className="flex justify-center items-center py-20">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-orange-600"></div>
          <span className="ml-3 text-gray-500">Loading leave requests...</span>
        </div>
      </HRPage>
    );
  }

  return (
    <HRPage title="Leave Management" subtitle="Manage employee leave requests and balances">
      <SubNav />
      <div className="space-y-6">
        {error && (
          <div className="px-4 py-3 bg-red-50 border border-red-200 text-red-700 rounded-lg flex justify-between items-center">
            <div className="flex items-center gap-2"><AlertCircle className="w-4 h-4" /><span>{error}</span></div>
            <button onClick={() => setError(null)} className="text-red-500 hover:text-red-700 font-bold">&times;</button>
          </div>
        )}

        {balanceEntries.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3">
            {balanceEntries.map((b, i) => (
              <div key={b.id || b.leave_type + '-' + i} className="bg-white rounded-xl border border-gray-200 p-3 text-center">
                <p className="text-xs text-gray-400 capitalize">{b.leave_type || b.type || "Leave"}</p>
                <p className="text-xl font-bold text-gray-900">{b.remaining ?? b.balance ?? b.total ?? 0}</p>
                <p className="text-[10px] text-gray-400">remaining of {b.total ?? b.quota ?? 0}</p>
              </div>
            ))}
          </div>
        )}

        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-gray-900">Leave Requests</h1>
          <button onClick={openCreate} className="flex items-center gap-2 px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 text-sm font-medium">
            <Plus className="w-4 h-4" /> New Leave Request
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[180px] max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input type="text" placeholder="Search by employee name..." value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500" />
          </div>
          <select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
            className="px-3 py-2 border border-gray-200 rounded-lg text-sm">
            <option value="">All Statuses</option>
            {LEAVE_STATUSES.map((s) => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
          </select>
          <select value={typeFilter} onChange={(e) => { setTypeFilter(e.target.value); setPage(1); }}
            className="px-3 py-2 border border-gray-200 rounded-lg text-sm">
            <option value="">All Types</option>
            {LEAVE_TYPES.map((t) => <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
          </select>
          <input type="date" value={dateFrom} onChange={(e) => { setDateFrom(e.target.value); setPage(1); }}
            className="px-3 py-2 border border-gray-200 rounded-lg text-sm" title="From date" />
          <input type="date" value={dateTo} onChange={(e) => { setDateTo(e.target.value); setPage(1); }}
            className="px-3 py-2 border border-gray-200 rounded-lg text-sm" title="To date" />
        </div>

        {filtered.length === 0 ? (
          <div className="text-center py-16 bg-white rounded-xl border border-gray-200">
            <p className="text-gray-500 font-medium">
              {requests.length === 0 ? "No leave requests yet. Create your first leave request." : "No requests match your filters."}
            </p>
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
            <table className="w-full text-left">
              <thead className="border-b border-gray-200 bg-gray-50 text-xs text-gray-500 uppercase tracking-wider">
                <tr>
                  {["Employee", "Leave Type", "Start Date", "End Date", "Days", "Status", "Reason", ""].map((h) => (
                    <th key={h} className="px-3 py-3 font-medium">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {paged.map((r) => (
                  <tr key={r.id} className="border-b border-gray-50 hover:bg-orange-50/50 text-sm">
                    <td className="px-3 py-3 font-medium text-gray-900">{r.employee_name || r.employee || "Employee #" + r.employee_id}</td>
                    <td className="px-3 py-3"><LeaveTypeBadge type={r.leave_type} /></td>
                    <td className="px-3 py-3 text-gray-700">{formatDate(r.start_date)}</td>
                    <td className="px-3 py-3 text-gray-700">{formatDate(r.end_date)}</td>
                    <td className="px-3 py-3 text-gray-700 font-medium">{calcDays(r.start_date, r.end_date)}</td>
                    <td className="px-3 py-3"><StatusBadge status={r.status} /></td>
                    <td className="px-3 py-3 text-gray-500 max-w-[150px] truncate">{r.reason || "-"}</td>
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-1">
                        {r.status === "pending" && (
                          <>
                            <button onClick={() => handleReview(r.id, "approved")} className="p-1 text-green-500 hover:bg-green-50 rounded" title="Approve"><CheckCircle className="w-4 h-4" /></button>
                            <button onClick={() => handleReview(r.id, "rejected")} className="p-1 text-red-500 hover:bg-red-50 rounded" title="Reject"><X className="w-4 h-4" /></button>
                          </>
                        )}
                        <button onClick={() => openEdit(r)} className="p-1 text-gray-400 hover:text-orange-600 rounded hover:bg-orange-50" title="Edit"><Pencil className="w-4 h-4" /></button>
                        <button onClick={() => handleDelete(r.id)} className="p-1 text-gray-400 hover:text-red-600 rounded hover:bg-red-50" title="Delete"><Trash2 className="w-4 h-4" /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="flex items-center justify-between text-sm">
          <span className="text-gray-500">{filtered.length} total request(s)</span>
          <div className="flex items-center gap-2">
            <button disabled={safePage <= 1} onClick={() => setPage(safePage - 1)} className="p-1.5 border border-gray-200 rounded-lg disabled:opacity-30 hover:bg-gray-50"><ChevronLeft className="w-4 h-4" /></button>
            <span className="text-gray-700 font-medium">Page {safePage} of {totalPages}</span>
            <button disabled={safePage >= totalPages} onClick={() => setPage(safePage + 1)} className="p-1.5 border border-gray-200 rounded-lg disabled:opacity-30 hover:bg-gray-50"><ChevronRight className="w-4 h-4" /></button>
          </div>
        </div>

        {showModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
            <div className="bg-white rounded-xl p-6 w-full max-w-lg shadow-xl">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-lg font-semibold">{editItem ? "Edit Leave Request" : "New Leave Request"}</h2>
                <button onClick={() => setShowModal(false)}><X className="w-5 h-5 text-gray-400" /></button>
              </div>
              <div className="space-y-3">
                {formErrors.submit && <div className="text-red-500 text-sm bg-red-50 p-2 rounded">{formErrors.submit}</div>}
                <div>
                  <label className="text-xs text-gray-500 font-medium">Employee ID *</label>
                  <input type="number" value={form.employee_id} onChange={(e) => setForm({ ...form, employee_id: e.target.value })}
                    className={`w-full border ${formErrors.employee_id ? "border-red-300" : "border-gray-200"} rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500`} />
                  {formErrors.employee_id && <p className="text-red-500 text-xs mt-1">{formErrors.employee_id}</p>}
                </div>
                <div>
                  <label className="text-xs text-gray-500 font-medium">Leave Type *</label>
                  <select value={form.leave_type} onChange={(e) => setForm({ ...form, leave_type: e.target.value })}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm">
                    {LEAVE_TYPES.map((t) => <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-gray-500 font-medium">Start Date *</label>
                    <input type="date" value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })}
                      className={`w-full border ${formErrors.start_date ? "border-red-300" : "border-gray-200"} rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500`} />
                    {formErrors.start_date && <p className="text-red-500 text-xs mt-1">{formErrors.start_date}</p>}
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 font-medium">End Date *</label>
                    <input type="date" value={form.end_date} onChange={(e) => setForm({ ...form, end_date: e.target.value })}
                      className={`w-full border ${formErrors.end_date ? "border-red-300" : "border-gray-200"} rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500`} />
                    {formErrors.end_date && <p className="text-red-500 text-xs mt-1">{formErrors.end_date}</p>}
                  </div>
                </div>
                <div>
                  <label className="text-xs text-gray-500 font-medium">Reason</label>
                  <textarea value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" rows={2} />
                </div>
              </div>
              <div className="flex justify-end gap-2 mt-6">
                <button onClick={() => setShowModal(false)} className="px-4 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50">Cancel</button>
                <button onClick={handleSubmit} disabled={submitting}
                  className="px-4 py-2 text-sm text-white bg-orange-600 rounded-lg hover:bg-orange-700 disabled:bg-orange-400">
                  {submitting ? "Saving..." : editItem ? "Update" : "Create"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </HRPage>
  );
}
