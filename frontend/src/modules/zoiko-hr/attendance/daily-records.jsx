import { useState, useEffect, useCallback, useMemo } from "react";
import { NavLink } from "react-router-dom";
import { Search, Download, Plus, Pencil, Trash2, Calendar, Filter, Loader2, UserX } from "lucide-react";
import HRPage from "../../../components/HRPage";
import { getAttendanceRecords, createAttendanceRecord, updateAttendanceRecord, deleteAttendanceRecord, exportAttendanceCsv, exportAttendanceExcel, getHrEmployees } from "../../../service/hrService";

const NAV_ITEMS = [
  { label: "Dashboard", href: "/zoiko-hr/attendance" },
  { label: "Attendance Records", href: "/zoiko-hr/attendance/daily" },
  { label: "Holiday Calendar", href: "/zoiko-hr/attendance/holidays" },
  { label: "Attendance Analytics", href: "/zoiko-hr/attendance/analytics" },
];

function SubNav() {
  return (
    <div className="flex gap-1 overflow-x-auto pb-1 mb-6 border-b border-gray-100">
      {NAV_ITEMS.map((item) => (
        <NavLink key={item.href} to={item.href} end={item.href === "/zoiko-hr/attendance"}
          className={({ isActive }) =>
            `whitespace-nowrap px-4 py-2.5 text-sm font-bold rounded-t-xl transition-all ${isActive ? "text-orange-600 border-b-2 border-orange-600 bg-orange-50/50" : "text-gray-500 hover:text-gray-800 hover:bg-gray-50"}`
          }>
          {item.label}
        </NavLink>
      ))}
    </div>
  );
}

const ITEMS_PER_PAGE = 15;

const STATUS_COLORS = {
  present: "bg-emerald-100 text-emerald-800 border-emerald-200",
  absent: "bg-red-100 text-red-800 border-red-200",
  late: "bg-orange-100 text-orange-800 border-orange-200",
  on_leave: "bg-blue-100 text-blue-800 border-blue-200",
  remote: "bg-purple-100 text-purple-800 border-purple-200",
  half_day: "bg-yellow-100 text-yellow-800 border-yellow-200",
  holiday: "bg-pink-100 text-pink-800 border-pink-200",
  weekend: "bg-gray-100 text-gray-800 border-gray-200",
};

const STATUS_OPTIONS = ["present", "absent", "late", "on_leave", "remote", "half_day"];

const initialForm = {
  employee_id: "", date: "", status: "present", check_in: "", check_out: "", notes: "",
};

function StatusBadge({ status }) {
  const colorClass = STATUS_COLORS[status] || "bg-gray-100 text-gray-800 border-gray-200";
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold border ${colorClass} capitalize`}>
      {status.replace(/_/g, " ")}
    </span>
  );
}

function formatDate(dateStr) {
  if (!dateStr) return "-";
  return new Date(dateStr).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

function formatTime(timeStr) {
  if (!timeStr) return "-";
  return new Date(timeStr).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
}

export default function DailyRecords() {
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState({ status: "", department: "", date: "" });
  const [currentPage, setCurrentPage] = useState(1);
  const [showModal, setShowModal] = useState(false);
  const [editRecord, setEditRecord] = useState(null);
  const [form, setForm] = useState({ ...initialForm });
  const [formErrors, setFormErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [employees, setEmployees] = useState([]);

  const fetchData = useCallback(async (params = {}) => {
    setLoading(true);
    setError(null);
    try {
      const data = await getAttendanceRecords(params);
      setRecords(data?.items || (Array.isArray(data) ? data : []));
    } catch (err) {
      setError(err.message || "Failed to load records");
      setRecords([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchEmployees = useCallback(async () => {
    try {
      const data = await getHrEmployees({ per_page: 100 });
      const list = data?.items || (Array.isArray(data) ? data : []);
      setEmployees(list);
    } catch {
      setEmployees([]);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);
  useEffect(() => { fetchEmployees(); }, [fetchEmployees]);

  const departments = useMemo(() => {
    const depts = new Set(records.map((r) => r.department || r.department_name).filter(Boolean));
    return [...depts].sort();
  }, [records]);

  const filtered = useMemo(() => {
    let result = records;
    if (search) {
      const q = search.toLowerCase();
      result = result.filter((r) =>
        (r.employee_name || r.employee || "").toLowerCase().includes(q) ||
        (r.department || "").toLowerCase().includes(q)
      );
    }
    if (filters.status) result = result.filter((r) => r.status === filters.status);
    if (filters.department) result = result.filter((r) => (r.department || r.department_name || "") === filters.department);
    if (filters.date) result = result.filter((r) => r.date === filters.date);
    return result;
  }, [records, search, filters]);

  const paginated = useMemo(() => {
    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    return filtered.slice(start, start + ITEMS_PER_PAGE);
  }, [filtered, currentPage]);

  const openCreate = () => {
    setEditRecord(null);
    setForm({ ...initialForm, date: new Date().toISOString().split("T")[0] });
    setFormErrors({});
    setShowModal(true);
  };

  const openEdit = (record) => {
    setEditRecord(record);
    setForm({
      employee_id: record.employee_id || "",
      date: record.date || "",
      status: record.status || "present",
      check_in: record.check_in ? new Date(record.check_in).toISOString().slice(0, 16) : "",
      check_out: record.check_out ? new Date(record.check_out).toISOString().slice(0, 16) : "",
      notes: record.notes || "",
    });
    setFormErrors({});
    setShowModal(true);
  };

  const validate = (d) => {
    const e = {};
    if (!d.employee_id) e.employee_id = "Employee is required";
    if (!d.date) e.date = "Date is required";
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
        date: form.date,
        status: form.status,
        check_in: form.check_in || null,
        check_out: form.check_out || null,
        notes: form.notes || null,
      };
      if (editRecord) {
        await updateAttendanceRecord(editRecord.id, payload);
      } else {
        await createAttendanceRecord(payload);
      }
      setShowModal(false);
      await fetchData();
    } catch (err) {
      setFormErrors({ submit: err.message || "Failed to save record" });
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Are you sure you want to delete this attendance record?")) return;
    try {
      await deleteAttendanceRecord(id);
      await fetchData();
    } catch (err) {
      setError(err.message || "Failed to delete record");
    }
  };

  return (
    <HRPage title="Daily Attendance Records" subtitle="Track and manage daily employee attendance logs">
      <SubNav />

      <div className="space-y-6">
        {error && (
          <div className="px-4 py-3 bg-red-50 border border-red-200 text-red-700 font-medium rounded-xl flex items-center justify-between shadow-sm">
            <span>{error}</span>
            <button onClick={() => setError(null)} className="text-red-500 hover:text-red-800 text-lg">&times;</button>
          </div>
        )}

        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-gray-100 shadow-sm">
          <div>
            <h1 className="text-xl font-extrabold text-gray-900">Attendance Log</h1>
            <p className="text-sm text-gray-500 font-medium mt-1">Review check-ins, check-outs, and daily statuses</p>
          </div>
          <div className="flex items-center gap-3">
            <button onClick={async () => { try { await exportAttendanceCsv(); } catch (err) { setError(err.message); } }}
              className="flex justify-center items-center gap-2 px-4 py-2.5 border border-gray-200 text-gray-700 bg-gray-50 rounded-xl hover:bg-gray-100 text-sm font-bold transition-colors">
              <Download className="w-4 h-4" /> CSV
            </button>
            <button onClick={async () => { try { await exportAttendanceExcel(); } catch (err) { setError(err.message); } }}
              className="flex justify-center items-center gap-2 px-4 py-2.5 border border-gray-200 text-gray-700 bg-gray-50 rounded-xl hover:bg-gray-100 text-sm font-bold transition-colors">
              <Download className="w-4 h-4" /> Excel
            </button>
            <button onClick={openCreate} className="flex items-center gap-2 px-5 py-2.5 bg-orange-600 hover:bg-orange-700 text-white rounded-xl text-sm font-bold shadow transition-colors">
              <Plus className="w-4 h-4" /> Add Record
            </button>
          </div>
        </div>

        {/* Filter Bar */}
        <div className="flex flex-wrap items-center gap-3 bg-gray-50/50 p-4 rounded-2xl border border-gray-100">
          <div className="relative flex-1 min-w-[240px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input type="text" placeholder="Search employee or department..." value={search}
              onChange={(e) => { setSearch(e.target.value); setCurrentPage(1); }}
              className="w-full pl-9 pr-4 py-2.5 bg-white border border-gray-200 rounded-xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 shadow-sm" />
          </div>
          <div className="relative w-full sm:w-auto">
            <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <select value={filters.status} onChange={(e) => { setFilters({ ...filters, status: e.target.value }); setCurrentPage(1); }}
              className="w-full sm:w-auto pl-9 pr-8 py-2.5 bg-white border border-gray-200 rounded-xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 appearance-none shadow-sm cursor-pointer">
              <option value="">All Statuses</option>
              {STATUS_OPTIONS.map((v) => (<option key={v} value={v}>{v.replace(/_/g, " ")}</option>))}
            </select>
          </div>
          <div className="relative w-full sm:w-auto">
            <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <select value={filters.department} onChange={(e) => { setFilters({ ...filters, department: e.target.value }); setCurrentPage(1); }}
              className="w-full sm:w-auto pl-9 pr-8 py-2.5 bg-white border border-gray-200 rounded-xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 appearance-none shadow-sm cursor-pointer">
              <option value="">All Departments</option>
              {departments.map((d) => (<option key={d} value={d}>{d}</option>))}
            </select>
          </div>
          <div className="relative w-full sm:w-auto flex-1 md:flex-none max-w-[200px]">
            <input type="date" value={filters.date} onChange={(e) => { setFilters({ ...filters, date: e.target.value }); setCurrentPage(1); }}
              className="w-full px-4 py-2.5 bg-white border border-gray-200 rounded-xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 shadow-sm" />
          </div>
        </div>

        {/* Data Table */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          {loading ? (
            <div className="flex flex-col justify-center items-center py-24">
              <Loader2 className="w-8 h-8 animate-spin text-orange-500 mb-4" />
              <p className="text-sm font-bold text-gray-500">Loading attendance records...</p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-24 text-center px-4">
              <div className="w-16 h-16 bg-orange-50 rounded-full flex items-center justify-center mb-4">
                <UserX className="w-8 h-8 text-orange-300" />
              </div>
              <p className="text-lg font-bold text-gray-800 mb-1">No records found</p>
              <p className="text-sm text-gray-500 max-w-sm">
                {records.length === 0 ? "You haven't added any attendance records yet." : "Try adjusting your search or filters."}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead className="bg-gray-50/80 border-b border-gray-100">
                  <tr>
                    <th className="py-4 px-5 text-xs font-bold text-gray-500 uppercase tracking-wider">Employee</th>
                    <th className="py-4 px-5 text-xs font-bold text-gray-500 uppercase tracking-wider">Department</th>
                    <th className="py-4 px-5 text-xs font-bold text-gray-500 uppercase tracking-wider">Date</th>
                    <th className="py-4 px-5 text-xs font-bold text-gray-500 uppercase tracking-wider">Check In</th>
                    <th className="py-4 px-5 text-xs font-bold text-gray-500 uppercase tracking-wider">Check Out</th>
                    <th className="py-4 px-5 text-xs font-bold text-gray-500 uppercase tracking-wider">Status</th>
                    <th className="py-4 px-5 text-right text-xs font-bold text-gray-500 uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {paginated.map((r) => (
                    <tr key={r.id} className="hover:bg-orange-50/30 transition-colors group">
                      <td className="py-3.5 px-5">
                        <div className="font-bold text-gray-900">{r.employee_name || r.employee || "Employee #" + r.id}</div>
                      </td>
                      <td className="py-3.5 px-5 text-sm font-medium text-gray-600">{r.department || r.department_name || "—"}</td>
                      <td className="py-3.5 px-5 text-sm font-semibold text-gray-700">{formatDate(r.date)}</td>
                      <td className="py-3.5 px-5 text-sm font-medium text-gray-600">{formatTime(r.check_in)}</td>
                      <td className="py-3.5 px-5 text-sm font-medium text-gray-600">{formatTime(r.check_out)}</td>
                      <td className="py-3.5 px-5"><StatusBadge status={r.status} /></td>
                      <td className="py-3.5 px-5 text-right">
                        <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button onClick={() => openEdit(r)} className="p-2 text-gray-400 hover:text-orange-600 hover:bg-orange-50 rounded-lg transition-colors" title="Edit">
                            <Pencil className="w-4 h-4" />
                          </button>
                          <button onClick={() => handleDelete(r.id)} className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors" title="Delete">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Pagination */}
        {!loading && filtered.length > ITEMS_PER_PAGE && (
          <div className="flex flex-col sm:flex-row justify-between items-center gap-4 px-2">
            <span className="text-sm font-medium text-gray-500">
              Showing <strong className="text-gray-900">{(currentPage - 1) * ITEMS_PER_PAGE + 1}</strong> to <strong className="text-gray-900">{Math.min(currentPage * ITEMS_PER_PAGE, filtered.length)}</strong> of <strong className="text-gray-900">{filtered.length}</strong> records
            </span>
            <div className="flex gap-1.5">
              <button onClick={() => setCurrentPage((p) => Math.max(1, p - 1))} disabled={currentPage <= 1}
                className="px-4 py-2 text-sm font-bold border border-gray-200 rounded-xl disabled:opacity-40 hover:bg-gray-50 transition-colors">Prev</button>
              {Array.from({ length: Math.ceil(filtered.length / ITEMS_PER_PAGE) }, (_, i) => i + 1).map((p) => {
                if (p === 1 || p === Math.ceil(filtered.length / ITEMS_PER_PAGE) || Math.abs(currentPage - p) <= 1) {
                  return (
                    <button key={p} onClick={() => setCurrentPage(p)}
                      className={`px-4 py-2 text-sm font-bold border rounded-xl transition-colors ${p === currentPage ? "bg-orange-600 text-white border-orange-600 shadow-sm" : "border-gray-200 text-gray-600 hover:bg-gray-50"}`}>
                      {p}
                    </button>
                  );
                }
                if (Math.abs(currentPage - p) === 2) return <span key={p} className="px-2 py-2 text-gray-400">...</span>;
                return null;
              })}
              <button onClick={() => setCurrentPage((p) => Math.min(Math.ceil(filtered.length / ITEMS_PER_PAGE), p + 1))}
                disabled={currentPage >= Math.ceil(filtered.length / ITEMS_PER_PAGE)}
                className="px-4 py-2 text-sm font-bold border border-gray-200 rounded-xl disabled:opacity-40 hover:bg-gray-50 transition-colors">Next</button>
            </div>
          </div>
        )}

        {/* Create/Edit Modal */}
        {showModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/40 backdrop-blur-sm p-4">
            <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]">
              <div className="bg-gradient-to-r from-gray-900 to-gray-800 px-6 py-5 flex justify-between items-center">
                <h2 className="text-lg font-bold text-white">{editRecord ? "Edit Record" : "Add Record"}</h2>
                <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-white transition-colors">
                  <UserX className="w-5 h-5" />
                </button>
              </div>
              
              <div className="p-6 overflow-y-auto">
                <form id="record-form" onSubmit={handleSubmit} className="space-y-5">
                  {formErrors.submit && (
                    <div className="text-red-700 text-sm font-semibold bg-red-50 border border-red-200 px-4 py-3 rounded-xl">{formErrors.submit}</div>
                  )}
                  
                  <div>
                    <label className="block text-sm font-bold text-gray-700 mb-1.5">Employee <span className="text-red-500">*</span></label>
                    <select value={form.employee_id} onChange={(e) => setForm({ ...form, employee_id: e.target.value })}
                      className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 focus:bg-white transition-colors">
                      <option value="">Select an employee...</option>
                      {employees.map((emp) => (
                        <option key={emp.id} value={emp.id}>{emp.first_name} {emp.last_name} ({emp.email})</option>
                      ))}
                    </select>
                    {formErrors.employee_id && <p className="text-red-500 text-xs font-bold mt-1.5">{formErrors.employee_id}</p>}
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-bold text-gray-700 mb-1.5">Date <span className="text-red-500">*</span></label>
                      <input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })}
                        className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 focus:bg-white transition-colors" />
                      {formErrors.date && <p className="text-red-500 text-xs font-bold mt-1.5">{formErrors.date}</p>}
                    </div>
                    <div>
                      <label className="block text-sm font-bold text-gray-700 mb-1.5">Status</label>
                      <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}
                        className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5 text-sm font-medium capitalize focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 focus:bg-white transition-colors">
                        {STATUS_OPTIONS.map((v) => (<option key={v} value={v}>{v.replace(/_/g, " ")}</option>))}
                      </select>
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-bold text-gray-700 mb-1.5">Check In</label>
                      <input type="datetime-local" value={form.check_in} onChange={(e) => setForm({ ...form, check_in: e.target.value })}
                        className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 focus:bg-white transition-colors" />
                    </div>
                    <div>
                      <label className="block text-sm font-bold text-gray-700 mb-1.5">Check Out</label>
                      <input type="datetime-local" value={form.check_out} onChange={(e) => setForm({ ...form, check_out: e.target.value })}
                        className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 focus:bg-white transition-colors" />
                    </div>
                  </div>
                  
                  <div>
                    <label className="block text-sm font-bold text-gray-700 mb-1.5">Notes / Remarks</label>
                    <textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })}
                      placeholder="Optional remarks about this record..."
                      className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 focus:bg-white transition-colors resize-none" />
                  </div>
                </form>
              </div>
              
              <div className="p-5 border-t border-gray-100 bg-gray-50 flex justify-end gap-3 mt-auto">
                <button type="button" onClick={() => setShowModal(false)} 
                  className="px-5 py-2.5 text-sm font-bold text-gray-600 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors shadow-sm">
                  Cancel
                </button>
                <button type="submit" form="record-form" disabled={submitting} 
                  className="flex justify-center items-center gap-2 min-w-[120px] px-5 py-2.5 text-sm font-bold bg-orange-600 hover:bg-orange-700 disabled:bg-orange-400 text-white rounded-xl transition-colors shadow-sm">
                  {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                  {submitting ? "Saving..." : editRecord ? "Update Record" : "Create Record"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </HRPage>
  );
}
