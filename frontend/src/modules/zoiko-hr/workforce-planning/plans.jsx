import { useState, useEffect, useMemo, useCallback } from "react";
import { NavLink } from "react-router-dom";
import HRPage from "../../../components/HRPage";
import { getWfPlans, createWfPlan, updateWfPlan, deleteWfPlan, getDepartments, getHrEmployees } from "../../../service/hrService";
import { Plus, Search, Edit3, Trash2, X, Filter } from "lucide-react";

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

const STATUS_COLORS = {
  draft: "bg-gray-100 text-gray-700",
  active: "bg-green-100 text-green-700",
  approved: "bg-blue-100 text-blue-700",
  on_hold: "bg-yellow-100 text-yellow-700",
  completed: "bg-teal-100 text-teal-700",
  cancelled: "bg-red-100 text-red-700",
};

const PLAN_STATUSES = ["draft", "active", "approved", "on_hold", "completed", "cancelled"];

function validateForm(data) {
  const errors = {};
  if (!data.title?.trim()) errors.title = "Title is required";
  if (!data.plan_year) errors.plan_year = "Plan year is required";
  else if (data.plan_year < 2020 || data.plan_year > 2100) errors.plan_year = "Year must be between 2020 and 2100";
  return errors;
}

export default function WorkforcePlans() {
  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [deptFilter, setDeptFilter] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [showModal, setShowModal] = useState(false);
  const [editItem, setEditItem] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({ title: "", description: "", plan_year: new Date().getFullYear(), status: "draft", department_id: "", owner_id: "", budget: "", target_headcount: "", current_headcount: "" });
  const [formErrors, setFormErrors] = useState({});
  const [departments, setDepartments] = useState([]);
  const [employees, setEmployees] = useState([]);

  const fetchPlans = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const res = await getWfPlans({ page: 1, per_page: 100 });
      setPlans(res?.items || []);
    } catch (err) { setError(err.message || "Failed to load plans"); setPlans([]); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    fetchPlans();
    const loadLookups = async () => {
      try {
        const [deptRes, empRes] = await Promise.all([
          getDepartments(),
          getHrEmployees({ per_page: 100 }),
        ]);
        if (deptRes?.data) setDepartments(deptRes.data);
        if (empRes?.items) setEmployees(empRes.items);
      } catch { /* silent */ }
    };
    loadLookups();
  }, [fetchPlans]);

  const filtered = useMemo(() => {
    let result = plans;
    if (search) {
      const q = search.toLowerCase();
      result = result.filter((p) =>
        (p.title || "").toLowerCase().includes(q) ||
        (p.department_name || "").toLowerCase().includes(q)
      );
    }
    if (statusFilter) result = result.filter((p) => p.status === statusFilter);
    if (deptFilter) result = result.filter((p) => p.department_id === parseInt(deptFilter));
    return result;
  }, [plans, search, statusFilter, deptFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / ITEMS_PER_PAGE));
  const safePage = Math.min(currentPage, totalPages);
  const paginated = useMemo(() => {
    const start = (safePage - 1) * ITEMS_PER_PAGE;
    return filtered.slice(start, start + ITEMS_PER_PAGE);
  }, [filtered, safePage]);

  useEffect(() => { if (currentPage > totalPages) setCurrentPage(totalPages); }, [totalPages, currentPage]);

  const openCreate = () => {
    setEditItem(null);
    setForm({ title: "", description: "", plan_year: new Date().getFullYear(), status: "draft", department_id: "", owner_id: "", budget: "", target_headcount: "", current_headcount: "" });
    setFormErrors({});
    setShowModal(true);
  };

  const openEdit = (item) => {
    setEditItem(item);
    setForm({
      title: item.title || "",
      description: item.description || "",
      plan_year: item.plan_year || new Date().getFullYear(),
      status: item.status || "draft",
      department_id: item.department_id || "",
      owner_id: item.owner_id || "",
      budget: item.budget || "",
      target_headcount: item.target_headcount || "",
      current_headcount: item.current_headcount || "",
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
        ...form,
        department_id: form.department_id ? parseInt(form.department_id) : null,
        owner_id: form.owner_id ? parseInt(form.owner_id) : null,
        budget: form.budget ? parseFloat(form.budget) : 0,
        target_headcount: form.target_headcount ? parseInt(form.target_headcount) : 0,
        current_headcount: form.current_headcount ? parseInt(form.current_headcount) : 0,
        plan_year: parseInt(form.plan_year),
      };
      if (editItem) await updateWfPlan(editItem.id, payload);
      else await createWfPlan(payload);
      setShowModal(false);
      await fetchPlans();
    } catch (err) { setFormErrors({ submit: err.message || "Failed to save" }); }
    finally { setSubmitting(false); }
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Are you sure you want to delete this plan?")) return;
    try {
      await deleteWfPlan(id);
      await fetchPlans();
    } catch (err) { setError(err.message || "Failed to delete"); }
  };

  const handleField = (field) => (e) => setForm((prev) => ({ ...prev, [field]: e.target.value }));

  return (
    <HRPage title="Workforce Plans" subtitle="Strategic workforce planning and budgeting">
      <SubNav />
      {error && (
        <div className="mb-4 px-4 py-3 bg-red-50 border border-red-200 text-red-700 rounded-lg flex justify-between items-center">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="text-red-500 hover:text-red-700 font-bold">&times;</button>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3 mb-6">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input type="text" placeholder="Search plans..." value={search} onChange={(e) => { setSearch(e.target.value); setCurrentPage(1); }}
            className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500" />
        </div>
        <select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setCurrentPage(1); }}
          className="px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500">
          <option value="">All Statuses</option>
          {PLAN_STATUSES.map((s) => <option key={s} value={s}>{s.replace(/_/g, " ")}</option>)}
        </select>
        <select value={deptFilter} onChange={(e) => { setDeptFilter(e.target.value); setCurrentPage(1); }}
          className="px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500">
          <option value="">All Departments</option>
          {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
        <button onClick={openCreate} className="flex items-center gap-2 px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white text-sm font-medium rounded-lg transition-colors ml-auto">
          <Plus size={16} /> New Plan
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center items-center py-20">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-teal-600" />
          <span className="ml-3 text-gray-500">Loading plans...</span>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Title</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Year</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Department</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Status</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Budget</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Target HC</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Current HC</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-100">
                {paginated.length === 0 ? (
                  <tr><td colSpan={8} className="px-4 py-10 text-center text-gray-400">No workforce plans found.</td></tr>
                ) : paginated.map((p) => (
                  <tr key={p.id} className="hover:bg-amber-50/50 transition-colors">
                    <td className="px-4 py-3 text-sm font-medium text-gray-900">{p.title}</td>
                    <td className="px-4 py-3 text-sm text-gray-600">{p.plan_year}</td>
                    <td className="px-4 py-3 text-sm text-gray-600">{p.department_name || "-"}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[p.status] || "bg-gray-100 text-gray-700"}`}>
                        {p.status?.replace(/_/g, " ")}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-700 text-right font-medium">
                      {new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(p.budget || 0)}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-700 text-right">{p.target_headcount || 0}</td>
                    <td className="px-4 py-3 text-sm text-gray-700 text-right">{p.current_headcount || 0}</td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button onClick={() => openEdit(p)} className="p-1.5 text-gray-400 hover:text-teal-600 transition-colors" title="Edit"><Edit3 size={15} /></button>
                        <button onClick={() => handleDelete(p.id)} className="p-1.5 text-gray-400 hover:text-red-600 transition-colors" title="Delete"><Trash2 size={15} /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {filtered.length > ITEMS_PER_PAGE && (
            <div className="flex justify-between items-center px-4 py-3 border-t border-gray-100">
              <span className="text-xs text-gray-400">
                Showing {(safePage - 1) * ITEMS_PER_PAGE + 1}-{Math.min(safePage * ITEMS_PER_PAGE, filtered.length)} of {filtered.length}
              </span>
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
              <h2 className="text-lg font-bold text-gray-800">{editItem ? "Edit Plan" : "Create Plan"}</h2>
              <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-600 p-1"><X size={20} /></button>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              {formErrors.submit && <div className="text-red-500 text-sm bg-red-50 p-2 rounded">{formErrors.submit}</div>}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Title *</label>
                <input type="text" value={form.title} onChange={handleField("title")}
                  className={`w-full border ${formErrors.title ? "border-red-300" : "border-gray-200"} rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500`} />
                {formErrors.title && <p className="text-red-500 text-xs mt-1">{formErrors.title}</p>}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                <textarea value={form.description} onChange={handleField("description")} rows={3}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Plan Year *</label>
                  <input type="number" value={form.plan_year} onChange={handleField("plan_year")}
                    className={`w-full border ${formErrors.plan_year ? "border-red-300" : "border-gray-200"} rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500`} />
                  {formErrors.plan_year && <p className="text-red-500 text-xs mt-1">{formErrors.plan_year}</p>}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
                  <select value={form.status} onChange={handleField("status")}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500">
                    {PLAN_STATUSES.map((s) => <option key={s} value={s}>{s.replace(/_/g, " ")}</option>)}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Department</label>
                  <select value={form.department_id} onChange={handleField("department_id")}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500">
                    <option value="">Select Department</option>
                    {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Owner</label>
                  <select value={form.owner_id} onChange={handleField("owner_id")}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500">
                    <option value="">Select Owner</option>
                    {employees.map((e) => <option key={e.id} value={e.id}>{e.full_name || e.first_name + " " + (e.last_name || "")}</option>)}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Budget ($)</label>
                  <input type="number" step="0.01" value={form.budget} onChange={handleField("budget")}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Target HC</label>
                  <input type="number" value={form.target_headcount} onChange={handleField("target_headcount")}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Current HC</label>
                  <input type="number" value={form.current_headcount} onChange={handleField("current_headcount")}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500" />
                </div>
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={() => setShowModal(false)}
                  className="px-4 py-2 text-sm border border-gray-200 rounded-lg hover:bg-gray-50">Cancel</button>
                <button type="submit" disabled={submitting}
                  className="px-4 py-2 text-sm bg-teal-600 hover:bg-teal-700 disabled:bg-teal-400 text-white rounded-lg font-medium transition-colors">
                  {submitting ? "Saving..." : editItem ? "Update Plan" : "Create Plan"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </HRPage>
  );
}
