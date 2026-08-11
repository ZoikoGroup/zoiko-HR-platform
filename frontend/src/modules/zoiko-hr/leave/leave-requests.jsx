import { useState, useEffect, useMemo } from "react";
import { NavLink } from "react-router-dom";
import { Calendar, Clock, CheckCircle, XCircle, Search, Trash2, Filter, AlertCircle, FileText } from "lucide-react";
import HRPage from "../../../components/HRPage";
import { getLeaveRequests, reviewLeaveRequest, getLeaveDashboard, getHrEmployees, deleteLeaveRequest } from "../../../service/hrService";

const NAV_ITEMS = [
  { label: "Dashboard", href: "/zoiko-hr/leave" },
  { label: "Requests", href: "/zoiko-hr/leave/requests" },
  { label: "Calendar", href: "/zoiko-hr/leave/calendar" },
  { label: "Reports", href: "/zoiko-hr/leave/reports" },
];

const STATUS_COLORS = {
  pending: "bg-amber-100 text-amber-700 border-amber-200",
  approved: "bg-emerald-100 text-emerald-700 border-emerald-200",
  rejected: "bg-red-100 text-red-700 border-red-200",
  cancelled: "bg-gray-100 text-gray-700 border-gray-200",
};

const TYPE_COLORS = {
  annual: "bg-blue-500", sick: "bg-pink-500", casual: "bg-orange-500", earned: "bg-teal-500",
  maternity: "bg-purple-500", paternity: "bg-indigo-500", unpaid: "bg-gray-500", study: "bg-cyan-500", emergency: "bg-red-500",
};

const ITEMS_PER_PAGE = 8;

function SubNav() {
  return (
    <div className="flex gap-1 overflow-x-auto pb-1 mb-6 border-b border-gray-100">
      {NAV_ITEMS.map((item) => (
        <NavLink key={item.href} to={item.href} end={item.href === "/zoiko-hr/leave"}
          className={({ isActive }) =>
            `whitespace-nowrap px-3 py-2 text-sm font-medium rounded-t-lg transition-colors ${
              isActive ? "text-teal-600 border-b-2 border-teal-600 bg-teal-50/50" : "text-gray-500 hover:text-gray-700 hover:bg-gray-50"
            }`
          }>
          {item.label}
        </NavLink>
      ))}
    </div>
  );
}

function StatusBadge({ status }) {
  const colorClass = STATUS_COLORS[status] || "bg-gray-100 text-gray-700 border-gray-200";
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold capitalize border ${colorClass}`}>
      {status.replace(/_/g, " ")}
    </span>
  );
}

function StatCard({ title, value, icon: Icon, color, loading }) {
  const colorMap = {
    teal: "text-teal-600 bg-teal-50",
    amber: "text-amber-600 bg-amber-50",
    emerald: "text-emerald-600 bg-emerald-50",
    red: "text-red-600 bg-red-50",
  };
  const clr = colorMap[color] || colorMap.teal;

  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm font-medium text-gray-500">{title}</p>
          {loading ? (
            <div className="h-8 w-16 bg-gray-200 rounded animate-pulse mt-1" />
          ) : (
            <p className="text-3xl font-extrabold text-gray-900 mt-1">{value ?? "—"}</p>
          )}
        </div>
        {Icon && <div className={`p-2.5 rounded-xl ${clr}`}><Icon className="w-5 h-5" /></div>}
      </div>
    </div>
  );
}

function InitialsAvatar({ name }) {
  const parts = (name || "?").trim().split(" ");
  const initials = parts.length >= 2 ? parts[0][0] + parts[parts.length - 1][0] : parts[0]?.[0] || "?";
  const colors = ["bg-teal-500","bg-blue-500","bg-violet-500","bg-emerald-500","bg-amber-500","bg-rose-500"];
  const idx = (name || "").charCodeAt(0) % colors.length;
  return (
    <div className={`w-8 h-8 ${colors[idx]} rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0`}>
      {initials.toUpperCase()}
    </div>
  );
}

function SkeletonRow() {
  return (
    <tr className="border-b border-gray-50">
      <td className="px-4 py-3"><div className="flex items-center gap-3"><div className="w-8 h-8 rounded-full bg-gray-200 animate-pulse"/><div className="h-4 w-24 bg-gray-200 rounded animate-pulse"/></div></td>
      {[1,2,3,4,5,6].map(i => <td key={i} className="px-4 py-3"><div className="h-4 bg-gray-200 rounded animate-pulse w-3/4"/></td>)}
    </tr>
  );
}

function formatDate(dateStr) {
  if (!dateStr) return "—";
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

export default function LeaveRequests() {
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [departmentFilter, setDepartmentFilter] = useState("");
  const [approverFilter, setApproverFilter] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [stats, setStats] = useState({ total_requests: 0, pending_requests: 0, approved_requests: 0, rejected_requests: 0 });
  const [departments, setDepartments] = useState([]);

  useEffect(() => {
    let mounted = true;
    const fetch = async () => {
      try {
        const [leaveData, dashData, emps] = await Promise.all([
          getLeaveRequests(),
          getLeaveDashboard(),
          getHrEmployees(),
        ]);
        if (!mounted) return;
        const rawLeaves = Array.isArray(leaveData) ? leaveData : (leaveData?.items || leaveData?.data || []);
        setRecords(Array.isArray(rawLeaves) ? rawLeaves : []);
        if (dashData) {
          setStats({
            total_requests: dashData.total_requests || 0,
            pending_requests: dashData.pending_requests || 0,
            approved_requests: dashData.approved_requests || 0,
            rejected_requests: dashData.rejected_requests || 0,
          });
        }
        const empData = emps?.data || emps?.items || (Array.isArray(emps) ? emps : []);
        const deptNames = [...new Set((Array.isArray(empData) ? empData : []).map(e => {
          const d = e.department || e.department_name;
          return typeof d === "object" && d !== null ? d.name || String(d.id) : d;
        }).filter(Boolean))];
        setDepartments(deptNames.map(name => ({ id: name, name })));
      } catch {
        // ignore
      } finally {
        if (mounted) setLoading(false);
      }
    };
    fetch();
    return () => { mounted = false; };
  }, []);

  const filtered = useMemo(() => {
    let result = records;
    if (search) {
      const q = search.toLowerCase();
      result = result.filter((r) => 
        (r.employee_name || "").toLowerCase().includes(q) ||
        (r.employee_code || "").toLowerCase().includes(q) ||
        (r.department || "").toLowerCase().includes(q)
      );
    }
    if (statusFilter) result = result.filter((r) => r.status === statusFilter);
    if (departmentFilter) result = result.filter((r) => r.department === departmentFilter);
    if (approverFilter) {
      if (approverFilter === "approved") {
        result = result.filter((r) => r.approved_by && r.approved_by !== "-");
      } else if (approverFilter === "rejected") {
        result = result.filter((r) => r.approved_by && r.approved_by !== "-" && r.status === "rejected");
      }
    }
    return result;
  }, [records, search, statusFilter, departmentFilter, approverFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / ITEMS_PER_PAGE));
  const safePage = Math.min(currentPage, totalPages);
  const paginated = filtered.slice((safePage - 1) * ITEMS_PER_PAGE, safePage * ITEMS_PER_PAGE);

  const handleReview = async (id, status) => {
    setSubmitting(true);
    setMessage(null);
    try {
      await reviewLeaveRequest(id, { status });
      setMessage({ type: 'success', text: `Request ${status} successfully` });
      const data = await getLeaveRequests();
      setRecords(Array.isArray(data) ? data : []);
      setTimeout(() => setMessage(null), 3000);
    } catch {
      setMessage({ type: 'error', text: `Failed to ${status} request` });
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Delete this leave request permanently?")) return;
    setMessage(null);
    try {
      await deleteLeaveRequest(id);
      setMessage({ type: 'success', text: "Leave request deleted" });
      const data = await getLeaveRequests();
      setRecords(Array.isArray(data) ? data : []);
      setTimeout(() => setMessage(null), 3000);
    } catch {
      setMessage({ type: 'error', text: "Failed to delete request" });
    }
  };

  return (
    <HRPage title="Leave Requests" subtitle="Review and manage employee leave requests">
      <SubNav />
      <div className="space-y-6">

        {message && (
          <div className={`flex items-center gap-2 px-4 py-3 rounded-xl text-sm font-medium ${message.type === 'success' ? 'bg-emerald-50 border border-emerald-200 text-emerald-700' : 'bg-red-50 border border-red-200 text-red-700'}`}>
            {message.type === 'success' ? <CheckCircle className="w-5 h-5" /> : <AlertCircle className="w-5 h-5" />}
            {message.text}
          </div>
        )}

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <StatCard title="Total Requests" value={stats.total_requests} icon={FileText} color="teal" loading={loading} />
          <StatCard title="Pending" value={stats.pending_requests} icon={Clock} color="amber" loading={loading} />
          <StatCard title="Approved" value={stats.approved_requests} icon={CheckCircle} color="emerald" loading={loading} />
          <StatCard title="Rejected" value={stats.rejected_requests} icon={XCircle} color="red" loading={loading} />
        </div>

        <div className="bg-white rounded-2xl border border-gray-100 p-4 shadow-sm">
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-[200px] max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input type="text" placeholder="Search employee, code, or department..." value={search}
                onChange={(e) => { setSearch(e.target.value); setCurrentPage(1); }}
                className="w-full pl-9 pr-4 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500" />
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <div className="flex items-center gap-2 text-sm text-gray-500 px-2 border-r border-gray-200">
                <Filter className="w-4 h-4" /> Filters
              </div>
              <select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setCurrentPage(1); }}
                className="px-3 py-2 border border-gray-200 rounded-xl text-sm bg-gray-50 focus:outline-none focus:border-teal-500 focus:bg-white transition-colors">
                <option value="">All Statuses</option>
                <option value="pending">Pending</option>
                <option value="approved">Approved</option>
                <option value="rejected">Rejected</option>
              </select>
              <select value={departmentFilter} onChange={(e) => { setDepartmentFilter(e.target.value); setCurrentPage(1); }}
                className="px-3 py-2 border border-gray-200 rounded-xl text-sm bg-gray-50 focus:outline-none focus:border-teal-500 focus:bg-white transition-colors">
                <option value="">All Departments</option>
                {departments.map((dept) => (
                  <option key={dept.id} value={dept.name}>{dept.name}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full text-left">
              <thead className="bg-gray-50/80 border-b border-gray-100">
                <tr>
                  <th className="px-4 py-3.5 text-xs font-semibold text-gray-500 uppercase tracking-wider">Employee</th>
                  <th className="px-4 py-3.5 text-xs font-semibold text-gray-500 uppercase tracking-wider">Type</th>
                  <th className="px-4 py-3.5 text-xs font-semibold text-gray-500 uppercase tracking-wider">Dates</th>
                  <th className="px-4 py-3.5 text-center text-xs font-semibold text-gray-500 uppercase tracking-wider">Days</th>
                  <th className="px-4 py-3.5 text-xs font-semibold text-gray-500 uppercase tracking-wider">Status</th>
                  <th className="px-4 py-3.5 text-xs font-semibold text-gray-500 uppercase tracking-wider">Approved By</th>
                  <th className="px-4 py-3.5 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {loading ? (
                  Array.from({ length: 5 }).map((_, i) => <SkeletonRow key={i} />)
                ) : paginated.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-16 text-center">
                      <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-3">
                        <FileText className="w-8 h-8 text-gray-300" />
                      </div>
                      <p className="text-gray-500 font-medium">No requests found</p>
                      <p className="text-sm text-gray-400 mt-1">Try adjusting your filters or search terms.</p>
                    </td>
                  </tr>
                ) : (
                  paginated.map((row, i) => (
                    <tr key={row.id ?? i} className="hover:bg-teal-50/30 transition-colors group">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <InitialsAvatar name={row.employee_name || row.employee} />
                          <div>
                            <p className="text-sm font-semibold text-gray-900 leading-none">{row.employee_name || row.employee}</p>
                            <p className="text-xs text-gray-500 mt-1">{row.department || row.employee_code || "—"}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-semibold capitalize text-white ${TYPE_COLORS[row.leave_type || row.type] || "bg-gray-400"}`}>
                          {row.leave_type || row.type}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-600">
                        <div className="flex flex-col gap-0.5">
                          <span>{formatDate(row.start_date)}</span>
                          <span className="text-gray-400">to {formatDate(row.end_date)}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-center text-sm font-semibold text-gray-700">{row.days || "—"}</td>
                      <td className="px-4 py-3"><StatusBadge status={row.status} /></td>
                      <td className="px-4 py-3 text-xs text-gray-500">
                        {row.status === "pending" ? (
                          "—"
                        ) : (
                          <div>
                            <p className="font-medium text-gray-700">{row.approved_by || "—"}</p>
                            <p>{formatDate(row.approval_date)}</p>
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {row.status === "pending" ? (
                          <div className="flex items-center justify-end gap-2">
                            <button onClick={() => handleReview(row.id, "approved")} disabled={submitting}
                              className="flex items-center gap-1 px-3 py-1.5 text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-lg hover:bg-emerald-100 hover:border-emerald-300 transition-colors disabled:opacity-50">
                              <CheckCircle className="w-3.5 h-3.5" /> Approve
                            </button>
                            <button onClick={() => handleReview(row.id, "rejected")} disabled={submitting}
                              className="flex items-center gap-1 px-3 py-1.5 text-xs font-semibold bg-red-50 text-red-700 border border-red-200 rounded-lg hover:bg-red-100 hover:border-red-300 transition-colors disabled:opacity-50">
                              <XCircle className="w-3.5 h-3.5" /> Reject
                            </button>
                          </div>
                        ) : (
                          <button onClick={() => handleDelete(row.id)}
                            className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors opacity-0 group-hover:opacity-100">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          {!loading && totalPages > 1 && (
            <div className="flex items-center justify-between px-6 py-4 border-t border-gray-100 bg-gray-50/50">
              <span className="text-sm font-medium text-gray-500">Page {safePage} of {totalPages}</span>
              <div className="flex gap-2">
                <button disabled={safePage <= 1} onClick={() => setCurrentPage(safePage - 1)}
                  className="px-4 py-2 text-sm font-medium border border-gray-200 rounded-xl bg-white disabled:opacity-50 disabled:bg-gray-50 hover:bg-gray-50 transition-colors shadow-sm">
                  Previous
                </button>
                <button disabled={safePage >= totalPages} onClick={() => setCurrentPage(safePage + 1)}
                  className="px-4 py-2 text-sm font-medium border border-gray-200 rounded-xl bg-white disabled:opacity-50 disabled:bg-gray-50 hover:bg-gray-50 transition-colors shadow-sm">
                  Next
                </button>
              </div>
            </div>
          )}
        </div>

      </div>
    </HRPage>
  );
}
