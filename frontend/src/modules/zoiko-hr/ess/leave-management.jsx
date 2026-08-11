import { useState, useEffect, useRef } from "react";
import { NavLink } from "react-router-dom";
import { Loader2, AlertCircle, CheckCircle, Calendar, Plus, Check, X, CalendarClock } from "lucide-react";
import HRPage from "../../../components/HRPage";
import { getLeaveRequests, createLeaveRequest } from "../../../service/hrService";
import { useAuth } from "../../../context/AuthContext";

const NAV_ITEMS = [
  { label: "Dashboard", href: "/zoiko-hr/ess" },
  { label: "Profile", href: "/zoiko-hr/ess/profile" },
  { label: "Leave Management", href: "/zoiko-hr/ess/leave" },
  { label: "Attendance", href: "/zoiko-hr/ess/attendance" },
  { label: "My Documents", href: "/zoiko-hr/ess/my-documents" },
  { label: "Learning", href: "/zoiko-hr/ess/requests" },
  { label: "Settings", href: "/zoiko-hr/ess/settings" },
];

function SubNav() {
  return (
    <div className="flex gap-1 overflow-x-auto pb-1 mb-6 border-b border-gray-100">
      {NAV_ITEMS.map((item) => (
        <NavLink
          key={item.href}
          to={item.href}
          end={item.href === "/zoiko-hr/ess"}
          className={({ isActive }) =>
            `whitespace-nowrap px-3 py-2 text-sm font-medium rounded-t-lg transition-colors ${
              isActive
                ? "text-blue-600 border-b-2 border-blue-600 bg-blue-50/50"
                : "text-gray-500 hover:text-gray-700 hover:bg-gray-50"
            }`
          }
        >
          {item.label}
        </NavLink>
      ))}
    </div>
  );
}

const LEAVE_TYPES = [
  { value: "annual", label: "Annual Leave", color: "bg-blue-500 text-white" },
  { value: "sick", label: "Sick Leave", color: "bg-pink-500 text-white" },
  { value: "casual", label: "Casual Leave", color: "bg-orange-500 text-white" },
  { value: "unpaid", label: "Unpaid Leave", color: "bg-gray-500 text-white" },
  { value: "maternity", label: "Maternity Leave", color: "bg-purple-500 text-white" },
  { value: "paternity", label: "Paternity Leave", color: "bg-indigo-500 text-white" },
];

const STATUS_META = {
  pending: { label: "Pending", bg: "bg-amber-100", text: "text-amber-700", border: "border-amber-200", icon: CalendarClock },
  approved: { label: "Approved", bg: "bg-emerald-100", text: "text-emerald-700", border: "border-emerald-200", icon: CheckCircle },
  rejected: { label: "Rejected", bg: "bg-red-100", text: "text-red-700", border: "border-red-200", icon: X },
};

export default function EssLeaveManagement() {
  const { user } = useAuth();
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({ leave_type: "annual", start_date: "", end_date: "", reason: "" });
  const [formError, setFormError] = useState(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    loadRequests();
    return () => { mounted.current = false; };
  }, []);

  const loadRequests = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await getLeaveRequests();
      const data = Array.isArray(res) ? res : res?.data || res?.items || [];
      if (mounted.current) setRequests(data);
    } catch (err) {
      if (mounted.current) setError(err?.message || "Failed to load leave requests");
    } finally {
      if (mounted.current) setLoading(false);
    }
  };

  const filtered = requests.filter((r) => {
    const type = r.leave_type || r.type || "";
    const reason = r.reason || "";
    if (search && !type.toLowerCase().includes(search.toLowerCase()) && !reason.toLowerCase().includes(search.toLowerCase())) return false;
    if (statusFilter && r.status !== statusFilter) return false;
    if (typeFilter && (r.leave_type || r.type) !== typeFilter) return false;
    return true;
  });

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!form.start_date || !form.end_date) {
      setFormError("Start and end dates are required");
      return;
    }
    setSubmitting(true);
    setFormError(null);
    try {
      await createLeaveRequest(form);
      setShowModal(false);
      setForm({ leave_type: "annual", start_date: "", end_date: "", reason: "" });
      setSuccess("Leave request submitted successfully");
      setTimeout(() => setSuccess(null), 3000);
      loadRequests();
    } catch (err) {
      setFormError(err.message || "Failed to create leave request");
    } finally {
      setSubmitting(false);
    }
  };

  const formatDate = (d) => {
    if (!d) return "";
    const dt = new Date(d);
    return dt.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
  };

  const getStatusBadge = (status) => {
    const m = STATUS_META[status] || { label: status, bg: "bg-gray-100", text: "text-gray-700", border: "border-gray-200", icon: null };
    const Icon = m.icon;
    return (
      <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold border ${m.bg} ${m.text} ${m.border}`}>
        {Icon && <Icon className="w-3.5 h-3.5" />}
        <span className="capitalize">{m.label}</span>
      </span>
    );
  };

  const getTypeBadge = (type) => {
    const matched = LEAVE_TYPES.find(t => t.value === type);
    const colorClass = matched ? matched.color : "bg-gray-400 text-white";
    return (
      <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold shadow-sm ${colorClass}`}>
        {matched ? matched.label : (type || "Other").toUpperCase()}
      </span>
    );
  };

  return (
    <HRPage title="Employee Self Service" subtitle="Manage your leave requests and view balance">
      <SubNav />

      <div className="space-y-6">
        
        {/* Header Hero Section */}
        <div className="bg-gradient-to-r from-blue-600 to-indigo-600 rounded-2xl p-6 shadow-lg text-white flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-extrabold leading-tight">My Leave Management</h1>
            <p className="text-blue-100 text-sm mt-1">Submit new leave requests and track your request history.</p>
          </div>
          <button
            onClick={() => { setShowModal(true); setFormError(null); }}
            className="flex items-center gap-2 px-5 py-2.5 bg-white text-blue-600 hover:bg-blue-50 rounded-xl text-sm font-bold transition-all shadow hover:shadow-lg hover:-translate-y-0.5 whitespace-nowrap"
          >
            <Plus className="w-5 h-5" />
            Apply for Leave
          </button>
        </div>

        {success && (
          <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3 text-emerald-700 text-sm font-semibold">
            <CheckCircle size={18} /> {success}
          </div>
        )}

        {/* Leave Requests Table */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          
          <div className="p-4 border-b border-gray-100 bg-gray-50/50 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
              <Calendar className="w-5 h-5 text-blue-600" /> My Requests
            </h2>
            <div className="flex items-center flex-wrap gap-2">
              <input
                type="text"
                placeholder="Search reason or type..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 w-full md:w-48 bg-white"
              />
              <select
                value={statusFilter}
                onChange={e => setStatusFilter(e.target.value)}
                className="px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-blue-500 bg-white"
              >
                <option value="">All Status</option>
                <option value="pending">Pending</option>
                <option value="approved">Approved</option>
                <option value="rejected">Rejected</option>
              </select>
              <select
                value={typeFilter}
                onChange={e => setTypeFilter(e.target.value)}
                className="px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-blue-500 bg-white"
              >
                <option value="">All Types</option>
                {LEAVE_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
          </div>

          <div className="overflow-x-auto">
            {loading ? (
              <div className="flex flex-col items-center justify-center py-16 gap-3 text-gray-400">
                <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
                <span className="text-sm font-medium">Loading leave requests...</span>
              </div>
            ) : error ? (
              <div className="flex items-center gap-3 bg-red-50 border-t border-red-200 px-6 py-4 text-red-700 text-sm font-semibold">
                <AlertCircle size={18} /> {error}
              </div>
            ) : filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-center px-4">
                <div className="w-16 h-16 bg-blue-50 rounded-full flex items-center justify-center mb-4">
                  <Calendar className="w-8 h-8 text-blue-300" />
                </div>
                <p className="text-lg font-bold text-gray-800 mb-1">
                  {search || statusFilter || typeFilter ? "No matching requests" : "No leave requests yet"}
                </p>
                <p className="text-sm text-gray-500 max-w-sm mx-auto">
                  {search || statusFilter || typeFilter 
                    ? "Try adjusting your search terms or filters to find what you're looking for." 
                    : "You haven't submitted any leave requests yet. Click the 'Apply for Leave' button above to get started."}
                </p>
              </div>
            ) : (
              <table className="w-full text-left">
                <thead className="bg-gray-50 border-b border-gray-100 text-xs font-bold text-gray-500 uppercase tracking-wider">
                  <tr>
                    <th className="py-3 px-4">Type</th>
                    <th className="py-3 px-4">Duration</th>
                    <th className="py-3 px-4 text-center">Days</th>
                    <th className="py-3 px-4">Reason</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4 text-right">Applied On</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {filtered.map((r) => (
                    <tr key={r.id} className="hover:bg-blue-50/30 transition-colors">
                      <td className="py-3.5 px-4">{getTypeBadge(r.leave_type || r.type)}</td>
                      <td className="py-3.5 px-4 text-sm text-gray-700">
                        <div className="font-medium">{formatDate(r.start_date || r.startDate)}</div>
                        <div className="text-gray-400 text-xs">to {formatDate(r.end_date || r.endDate)}</div>
                      </td>
                      <td className="py-3.5 px-4 text-center text-sm font-bold text-gray-800">{r.days || "-"}</td>
                      <td className="py-3.5 px-4 text-sm text-gray-600 max-w-xs truncate" title={r.reason}>{r.reason || "—"}</td>
                      <td className="py-3.5 px-4">{getStatusBadge(r.status)}</td>
                      <td className="py-3.5 px-4 text-right text-xs font-medium text-gray-400">{formatDate(r.created_at || r.appliedOn)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* Apply Leave Modal */}
        {showModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4">
            <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden">
              <div className="bg-gradient-to-r from-blue-600 to-indigo-600 px-6 py-4 flex justify-between items-center text-white">
                <h2 className="text-lg font-bold">Apply for Leave</h2>
                <button onClick={() => { setShowModal(false); setFormError(null); }} className="text-blue-100 hover:text-white transition-colors text-2xl leading-none">&times;</button>
              </div>
              <form onSubmit={handleCreate} className="p-6 space-y-5">
                {formError && (
                  <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm font-medium">
                    <AlertCircle className="w-5 h-5 flex-shrink-0" /> {formError}
                  </div>
                )}
                
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-2">Leave Type <span className="text-red-500">*</span></label>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {LEAVE_TYPES.map((t) => (
                      <button
                        key={t.value}
                        type="button"
                        onClick={() => setForm({ ...form, leave_type: t.value })}
                        className={`px-3 py-2 rounded-xl text-xs font-semibold transition-all border ${
                          form.leave_type === t.value 
                            ? "bg-blue-50 border-blue-500 text-blue-700 ring-1 ring-blue-500" 
                            : "bg-white border-gray-200 text-gray-600 hover:bg-gray-50 hover:border-gray-300"
                        }`}
                      >
                        {t.label}
                      </button>
                    ))}
                  </div>
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-bold text-gray-700 mb-1.5">Start Date <span className="text-red-500">*</span></label>
                    <input
                      type="date"
                      value={form.start_date}
                      onChange={(e) => setForm({ ...form, start_date: e.target.value })}
                      className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:bg-white focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-gray-700 mb-1.5">End Date <span className="text-red-500">*</span></label>
                    <input
                      type="date"
                      value={form.end_date}
                      onChange={(e) => setForm({ ...form, end_date: e.target.value })}
                      className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:bg-white focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors"
                    />
                  </div>
                </div>
                
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-1.5">Reason <span className="text-gray-400 font-normal">(optional)</span></label>
                  <textarea
                    rows={3}
                    value={form.reason}
                    onChange={(e) => setForm({ ...form, reason: e.target.value })}
                    className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:bg-white focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors"
                    placeholder="Briefly explain the reason for your leave..."
                  />
                </div>
                
                <div className="flex justify-end gap-3 pt-4 border-t border-gray-100">
                  <button
                    type="button"
                    onClick={() => { setShowModal(false); setFormError(null); }}
                    className="px-5 py-2.5 text-sm font-bold text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-xl transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={submitting}
                    className="flex items-center gap-2 px-5 py-2.5 text-sm font-bold bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white rounded-xl transition-all shadow-sm hover:shadow"
                  >
                    {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
                    {submitting ? "Submitting..." : "Submit Request"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </HRPage>
  );
}
