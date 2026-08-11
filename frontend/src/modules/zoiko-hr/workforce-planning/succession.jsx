import { useState, useEffect, useMemo, useCallback } from "react";
import { NavLink } from "react-router-dom";
import HRPage from "../../../components/HRPage";
import { getWfSuccessions, createWfSuccession, updateWfSuccession, deleteWfSuccession, getHrEmployees } from "../../../service/hrService";
import { Plus, Search, Edit3, Trash2, X, Users, AlertTriangle, CheckCircle, Clock } from "lucide-react";

const NAV_ITEMS = [
  { label: "Dashboard", href: "/zoiko-hr/workforce-planning" },
  { label: "Plans", href: "/zoiko-hr/workforce-planning/plans" },
  { label: "Headcount", href: "/zoiko-hr/workforce-planning/headcount" },
  { label: "Succession", href: "/zoiko-hr/workforce-planning/succession" },
  { label: "Reports", href: "/zoiko-hr/workforce-planning/reports" },
];

function SubNav() {
  return (
    <div className="flex gap-1 overflow-x-auto pb-1 mb-6 border-b border-gray-100">
      {NAV_ITEMS.map((item) => (
        <NavLink key={item.href} to={item.href}
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

const ITEMS_PER_PAGE = 15;

const READINESS_COLORS = {
  not_ready: "bg-gray-100 text-gray-700",
  moderately_ready: "bg-yellow-100 text-yellow-700",
  ready: "bg-green-100 text-green-700",
  fully_ready: "bg-teal-100 text-teal-700",
};

const RISK_COLORS = {
  low: "bg-green-100 text-green-700",
  medium: "bg-yellow-100 text-yellow-700",
  high: "bg-orange-100 text-orange-700",
  critical: "bg-red-100 text-red-700",
};

const READINESS_LEVELS = ["not_ready", "moderately_ready", "ready", "fully_ready"];
const RISK_LEVELS = ["low", "medium", "high", "critical"];

function validateForm(data) {
  const errors = {};
  if (!data.employee_id) errors.employee_id = "Employee is required";
  return errors;
}

function StatCard({ title, value, icon: Icon, color }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4">
      <div className="flex items-center gap-3">
        <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${color ? color.replace("text-", "bg-").replace("600", "50") : "bg-gray-50"}`}>
          <Icon size={18} className={color || "text-gray-600"} />
        </div>
        <div>
          <p className="text-xs text-gray-400 uppercase tracking-wider">{title}</p>
          <p className={`text-xl font-bold ${color || "text-gray-900"}`}>{value}</p>
        </div>
      </div>
    </div>
  );
}

export default function SuccessionPlanning() {
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState("");
  const [readinessFilter, setReadinessFilter] = useState("");
  const [riskFilter, setRiskFilter] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [showModal, setShowModal] = useState(false);
  const [editItem, setEditItem] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({ employee_id: "", successor_employee_id: "", readiness_level: "not_ready", risk_level: "medium", target_position: "", review_date: "", notes: "" });
  const [formErrors, setFormErrors] = useState({});
  const [employees, setEmployees] = useState([]);

  const fetchData = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const res = await getWfSuccessions({ page: 1, per_page: 100 });
      setRecords(res?.items || []);
    } catch (err) { setError(err.message || "Failed to load succession data"); setRecords([]); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    fetchData();
    getHrEmployees({ per_page: 100 }).then((res) => { if (res?.items) setEmployees(res.items); }).catch(() => {});
  }, [fetchData]);

  const stats = useMemo(() => {
    const total = records.length;
    const ready = records.filter((r) => r.readiness_level === "ready" || r.readiness_level === "fully_ready").length;
    const highRisk = records.filter((r) => r.risk_level === "high" || r.risk_level === "critical").length;
    return { total, ready, highRisk };
  }, [records]);

  const filtered = useMemo(() => {
    let result = records;
    if (search) {
      const q = search.toLowerCase();
      result = result.filter((r) =>
        (r.employee_name || "").toLowerCase().includes(q) ||
        (r.successor_name || "").toLowerCase().includes(q) ||
        (r.target_position || "").toLowerCase().includes(q)
      );
    }
    if (readinessFilter) result = result.filter((r) => r.readiness_level === readinessFilter);
    if (riskFilter) result = result.filter((r) => r.risk_level === riskFilter);
    return result;
  }, [records, search, readinessFilter, riskFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / ITEMS_PER_PAGE));
  const safePage = Math.min(currentPage, totalPages);
  const paginated = useMemo(() => {
    const start = (safePage - 1) * ITEMS_PER_PAGE;
    return filtered.slice(start, start + ITEMS_PER_PAGE);
  }, [filtered, safePage]);

  useEffect(() => { if (currentPage > totalPages) setCurrentPage(totalPages); }, [totalPages, currentPage]);

  const openCreate = () => {
    setEditItem(null);
    setForm({ employee_id: "", successor_employee_id: "", readiness_level: "not_ready", risk_level: "medium", target_position: "", review_date: "", notes: "" });
    setFormErrors({});
    setShowModal(true);
  };

  const openEdit = (item) => {
    setEditItem(item);
    setForm({
      employee_id: item.employee_id || "",
      successor_employee_id: item.successor_employee_id || "",
      readiness_level: item.readiness_level || "not_ready",
      risk_level: item.risk_level || "medium",
      target_position: item.target_position || "",
      review_date: item.review_date || "",
      notes: item.notes || "",
    });
    setFormErrors({});
    setShowModal(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const errors = validateForm(form);
    setFormErrors(errors);
    if (Object.keys(errors).length > 0) return;
    setSubmitting(true);
    try {
      const payload = {
        employee_id: parseInt(form.employee_id),
        successor_employee_id: form.successor_employee_id ? parseInt(form.successor_employee_id) : null,
        readiness_level: form.readiness_level,
        risk_level: form.risk_level,
        target_position: form.target_position || null,
        review_date: form.review_date || null,
        notes: form.notes || null,
      };
      if (editItem) await updateWfSuccession(editItem.id, payload);
      else await createWfSuccession(payload);
      setShowModal(false);
      await fetchData();
    } catch (err) { setFormErrors({ submit: err.message || "Failed to save" }); }
    finally { setSubmitting(false); }
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Delete this succession record?")) return;
    try { await deleteWfSuccession(id); await fetchData(); }
    catch (err) { setError(err.message || "Failed to delete"); }
  };

  const handleField = (field) => (e) => setForm((prev) => ({ ...prev, [field]: e.target.value }));

  return (
    <HRPage title="Succession Planning" subtitle="Key position mapping and talent pipeline management">
      <SubNav />
      {error && (
        <div className="mb-4 px-4 py-3 bg-red-50 border border-red-200 text-red-700 rounded-lg flex justify-between items-center">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="text-red-500 hover:text-red-700 font-bold">&times;</button>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <StatCard title="Total Tracked" value={stats.total} icon={Users} color="text-blue-600" />
        <StatCard title="Ready Successors" value={stats.ready} icon={CheckCircle} color="text-green-600" />
        <StatCard title="High Risk" value={stats.highRisk} icon={AlertTriangle} color="text-red-600" />
      </div>

      <div className="flex flex-wrap items-center gap-3 mb-6">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input type="text" placeholder="Search employee, successor, position..." value={search} onChange={(e) => { setSearch(e.target.value); setCurrentPage(1); }}
            className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500" />
        </div>
        <select value={readinessFilter} onChange={(e) => { setReadinessFilter(e.target.value); setCurrentPage(1); }}
          className="px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500">
          <option value="">All Readiness</option>
          {READINESS_LEVELS.map((l) => <option key={l} value={l}>{l.replace(/_/g, " ")}</option>)}
        </select>
        <select value={riskFilter} onChange={(e) => { setRiskFilter(e.target.value); setCurrentPage(1); }}
          className="px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500">
          <option value="">All Risk Levels</option>
          {RISK_LEVELS.map((l) => <option key={l} value={l}>{l}</option>)}
        </select>
        <button onClick={openCreate} className="flex items-center gap-2 px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white text-sm font-medium rounded-lg transition-colors ml-auto">
          <Plus size={16} /> Add Succession
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center items-center py-20">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-teal-600" />
          <span className="ml-3 text-gray-500">Loading succession data...</span>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Employee</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Successor</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Target Position</th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase tracking-wider">Readiness</th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase tracking-wider">Risk</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Review Date</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-100">
                {paginated.length === 0 ? (
                  <tr><td colSpan={7} className="px-4 py-10 text-center text-gray-400">No succession records found.</td></tr>
                ) : paginated.map((r) => (
                  <tr key={r.id} className="hover:bg-amber-50/50 transition-colors">
                    <td className="px-4 py-3 text-sm font-medium text-gray-900">{r.employee_name || `Employee #${r.employee_id}`}</td>
                    <td className="px-4 py-3 text-sm text-gray-600">{r.successor_name || "-"}</td>
                    <td className="px-4 py-3 text-sm text-gray-600">{r.target_position || "-"}</td>
                    <td className="px-4 py-3 text-center">
                      <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${READINESS_COLORS[r.readiness_level] || "bg-gray-100 text-gray-700"}`}>
                        {r.readiness_level?.replace(/_/g, " ")}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${RISK_COLORS[r.risk_level] || "bg-gray-100 text-gray-700"}`}>
                        {r.risk_level}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">{r.review_date || "-"}</td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button onClick={() => openEdit(r)} className="p-1.5 text-gray-400 hover:text-teal-600" title="Edit"><Edit3 size={15} /></button>
                        <button onClick={() => handleDelete(r.id)} className="p-1.5 text-gray-400 hover:text-red-600" title="Delete"><Trash2 size={15} /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {filtered.length > ITEMS_PER_PAGE && (
            <div className="flex justify-between items-center px-4 py-3 border-t border-gray-100">
              <span className="text-xs text-gray-400">Showing {(safePage - 1) * ITEMS_PER_PAGE + 1}-{Math.min(safePage * ITEMS_PER_PAGE, filtered.length)} of {filtered.length}</span>
              <div className="flex gap-1">
                <button onClick={() => setCurrentPage((p) => Math.max(1, p - 1))} disabled={safePage <= 1}
                  className="px-3 py-1 text-sm border border-gray-200 rounded-lg disabled:opacity-40 hover:bg-gray-50">Prev</button>
                {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
                  const start = Math.max(1, Math.min(safePage - 3, totalPages - 6));
                  return start + i;
                }).map((p) => (
                  <button key={p} onClick={() => setCurrentPage(p)}
                    className={`px-3 py-1 text-sm border rounded-lg ${p === safePage ? "bg-teal-600 text-white border-teal-600" : "border-gray-200 hover:bg-gray-50"}`}>{p}</button>
                ))}
                <button onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))} disabled={safePage >= totalPages}
                  className="px-3 py-1 text-sm border border-gray-200 rounded-lg disabled:opacity-40 hover:bg-gray-50">Next</button>
              </div>
            </div>
          )}
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setShowModal(false)}>
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between items-center px-6 py-4 border-b border-gray-100">
              <h2 className="text-lg font-bold text-gray-800">{editItem ? "Edit Succession" : "Add Succession Record"}</h2>
              <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-600 p-1"><X size={20} /></button>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              {formErrors.submit && <div className="text-red-500 text-sm bg-red-50 p-2 rounded">{formErrors.submit}</div>}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Employee *</label>
                  <select value={form.employee_id} onChange={handleField("employee_id")}
                    className={`w-full border ${formErrors.employee_id ? "border-red-300" : "border-gray-200"} rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500`}>
                    <option value="">Select Employee</option>
                    {employees.map((e) => <option key={e.id} value={e.id}>{e.full_name || `${e.first_name || ""} ${e.last_name || ""}`}</option>)}
                  </select>
                  {formErrors.employee_id && <p className="text-red-500 text-xs mt-1">{formErrors.employee_id}</p>}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Successor</label>
                  <select value={form.successor_employee_id} onChange={handleField("successor_employee_id")}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500">
                    <option value="">Select Successor</option>
                    {employees.map((e) => <option key={e.id} value={e.id}>{e.full_name || `${e.first_name || ""} ${e.last_name || ""}`}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Target Position</label>
                <input type="text" value={form.target_position} onChange={handleField("target_position")}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Readiness Level</label>
                  <select value={form.readiness_level} onChange={handleField("readiness_level")}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500">
                    {READINESS_LEVELS.map((l) => <option key={l} value={l}>{l.replace(/_/g, " ")}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Risk Level</label>
                  <select value={form.risk_level} onChange={handleField("risk_level")}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500">
                    {RISK_LEVELS.map((l) => <option key={l} value={l}>{l}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Review Date</label>
                <input type="date" value={form.review_date} onChange={handleField("review_date")}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
                <textarea value={form.notes} onChange={handleField("notes")} rows={3}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500" />
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={() => setShowModal(false)}
                  className="px-4 py-2 text-sm border border-gray-200 rounded-lg hover:bg-gray-50">Cancel</button>
                <button type="submit" disabled={submitting}
                  className="px-4 py-2 text-sm bg-teal-600 hover:bg-teal-700 disabled:bg-teal-400 text-white rounded-lg font-medium transition-colors">
                  {submitting ? "Saving..." : editItem ? "Update" : "Create"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </HRPage>
  );
}
