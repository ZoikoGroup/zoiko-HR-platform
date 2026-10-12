import { useState, useEffect, useMemo, useCallback } from "react";
import { NavLink } from "react-router-dom";
import HRPage from "../../../components/HRPage";
import { employeeList, employeeLabel } from "../../../utils/employeeOptions";
import { getWfHeadcounts, createWfHeadcount, updateWfHeadcount, deleteWfHeadcount, getDepartments } from "../../../service/hrService";
import { Plus, Search, Edit3, Trash2, X } from "lucide-react";
import {
  EMPTY_HEADCOUNT, headcountToForm, validateHeadcount, headcountPayload, serverHeadcountErrors, headcountRefusalField, departmentText,
} from "../../../utils/headcountForm";

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

const formatCurrency = (v) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(v || 0);

export default function HeadcountPlanning() {
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState("");
  const [yearFilter, setYearFilter] = useState("");
  const [deptFilter, setDeptFilter] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [showModal, setShowModal] = useState(false);
  const [editItem, setEditItem] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({ ...EMPTY_HEADCOUNT });
  const [formErrors, setFormErrors] = useState({});
  const [departments, setDepartments] = useState([]);
  const [departmentsReady, setDepartmentsReady] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const res = await getWfHeadcounts({ page: 1, per_page: 100 });
      setRecords(res?.items || []);
    } catch (err) { setError(err.message || "Failed to load headcount data"); setRecords([]); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    fetchData();
    getDepartments()
      .then((res) => setDepartments(employeeList(res?.data)))
      .catch(() => setDepartments([]))
      .finally(() => setDepartmentsReady(true));
  }, [fetchData]);

  const aggregated = useMemo(() => {
    const totals = { approved: 0, filled: 0, vacant: 0, planned: 0, cost: 0 };
    records.forEach((r) => {
      totals.approved += r.approved_positions || 0;
      totals.filled += r.filled_positions || 0;
      totals.vacant += r.vacant_positions || 0;
      totals.planned += r.planned_hires || 0;
      totals.cost += r.projected_cost || 0;
    });
    return totals;
  }, [records]);

  const filtered = useMemo(() => {
    let result = records;
    if (search) {
      const q = search.toLowerCase();
      result = result.filter((r) =>
        (r.department_name || "").toLowerCase().includes(q) ||
        String(r.fiscal_year || "").includes(q)
      );
    }
    if (yearFilter) result = result.filter((r) => r.fiscal_year === parseInt(yearFilter));
    if (deptFilter) result = result.filter((r) => r.department_id === parseInt(deptFilter));
    return result;
  }, [records, search, yearFilter, deptFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / ITEMS_PER_PAGE));
  const safePage = Math.min(currentPage, totalPages);
  const paginated = useMemo(() => {
    const start = (safePage - 1) * ITEMS_PER_PAGE;
    return filtered.slice(start, start + ITEMS_PER_PAGE);
  }, [filtered, safePage]);

  useEffect(() => { if (currentPage > totalPages) setCurrentPage(totalPages); }, [totalPages, currentPage]);

  const availableYears = useMemo(() => {
    const years = new Set(records.map((r) => r.fiscal_year));
    return [...years].sort((a, b) => b - a);
  }, [records]);

  const openCreate = () => {
    setEditItem(null);
    setForm({ ...EMPTY_HEADCOUNT });
    setFormErrors({});
    setShowModal(true);
  };

  const openEdit = (item) => {
    setEditItem(item);
    setForm(headcountToForm(item));
    setFormErrors({});
    setShowModal(true);
  };

  const noDepartments = departmentsReady && departments.length === 0;

  const handleSubmit = async (e) => {
    e.preventDefault();
    const ids = departmentsReady && departments.length ? departments.map((d) => d.id).concat(editItem?.department_id ? [editItem.department_id] : []) : null;
    const errors = validateHeadcount(form, ids);
    setFormErrors(errors);
    if (Object.keys(errors).length > 0) return;
    setSubmitting(true);
    try {
      const payload = headcountPayload(form);
      if (editItem) await updateWfHeadcount(editItem.id, payload);
      else await createWfHeadcount(payload);
      setShowModal(false);
      await fetchData();
    } catch (err) {
      const fields = serverHeadcountErrors(err?.validation);
      const target = headcountRefusalField(err?.message);
      if (Object.keys(fields).length) setFormErrors(fields);
      else if (target) setFormErrors({ [target]: err.message });
      else setFormErrors({ submit: err.message || "The headcount record could not be saved." });
    } finally { setSubmitting(false); }
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Delete this headcount record?")) return;
    try { await deleteWfHeadcount(id); await fetchData(); }
    catch (err) { setError(err.message || "Failed to delete"); }
  };

  const handleField = (field) => (e) => {
    const value = e.target.value;
    setForm((prev) => ({ ...prev, [field]: value }));
    setFormErrors((prev) => (prev[field] || prev.submit ? { ...prev, [field]: undefined, submit: undefined } : prev));
  };
  const fieldError = (name) => (formErrors[name] ? <p role="alert" className="text-red-500 text-xs mt-1">{formErrors[name]}</p> : null);
  const boxClass = (name) => `w-full border ${formErrors[name] ? "border-red-300" : "border-gray-200"} rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500`;
  // a department already on the record stays selectable even if the list did not include it
  const departmentChoices = !form.department_id || departments.some((d) => String(d.id) === String(form.department_id))
    ? departments
    : [{ id: form.department_id, name: editItem?.department_name || `Department #${form.department_id}` }, ...departments];

  return (
    <HRPage title="Headcount Planning" subtitle="Department-wise workforce planning and vacancy tracking">
      <SubNav />
      {error && (
        <div className="mb-4 px-4 py-3 bg-red-50 border border-red-200 text-red-700 rounded-lg flex justify-between items-center">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="text-red-500 hover:text-red-700 font-bold">&times;</button>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-xs text-gray-400 uppercase tracking-wider">Approved</p>
          <p className="text-xl font-bold text-blue-600 mt-1">{aggregated.approved}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-xs text-gray-400 uppercase tracking-wider">Filled</p>
          <p className="text-xl font-bold text-green-600 mt-1">{aggregated.filled}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-xs text-gray-400 uppercase tracking-wider">Vacant</p>
          <p className="text-xl font-bold text-orange-600 mt-1">{aggregated.vacant}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-xs text-gray-400 uppercase tracking-wider">Planned Hires</p>
          <p className="text-xl font-bold text-teal-600 mt-1">{aggregated.planned}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-xs text-gray-400 uppercase tracking-wider">Projected Cost</p>
          <p className="text-xl font-bold text-gray-900 mt-1">{formatCurrency(aggregated.cost)}</p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3 mb-6">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input type="text" placeholder="Search by department or year..." value={search} onChange={(e) => { setSearch(e.target.value); setCurrentPage(1); }}
            className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500" />
        </div>
        <select value={yearFilter} onChange={(e) => { setYearFilter(e.target.value); setCurrentPage(1); }}
          className="px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500">
          <option value="">All Years</option>
          {availableYears.map((y) => <option key={y} value={y}>{y}</option>)}
        </select>
        <select value={deptFilter} onChange={(e) => { setDeptFilter(e.target.value); setCurrentPage(1); }}
          className="px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500">
          <option value="">All Departments</option>
          {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
        <button onClick={openCreate} className="flex items-center gap-2 px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white text-sm font-medium rounded-lg transition-colors ml-auto">
          <Plus size={16} /> New Record
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center items-center py-20">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-teal-600" />
          <span className="ml-3 text-gray-500">Loading headcount data...</span>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Department</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Fiscal Year</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Approved</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Filled</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Vacant</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Planned Hires</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Projected Cost</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-100">
                {paginated.length === 0 ? (
                  <tr><td colSpan={8} className="px-4 py-10 text-center text-gray-400">No headcount records found.</td></tr>
                ) : paginated.map((r) => (
                  <tr key={r.id} className="hover:bg-amber-50/50 transition-colors">
                    <td className="px-4 py-3 text-sm font-medium text-gray-900">{departmentText(r, departments)}</td>
                    <td className="px-4 py-3 text-sm text-gray-600">{r.fiscal_year}</td>
                    <td className="px-4 py-3 text-sm text-blue-600 font-medium text-right">{r.approved_positions || 0}</td>
                    <td className="px-4 py-3 text-sm text-green-600 font-medium text-right">{r.filled_positions || 0}</td>
                    <td className="px-4 py-3 text-sm text-orange-600 font-medium text-right">{r.vacant_positions || 0}</td>
                    <td className="px-4 py-3 text-sm text-teal-600 font-medium text-right">{r.planned_hires || 0}</td>
                    <td className="px-4 py-3 text-sm text-gray-700 text-right font-medium">{formatCurrency(r.projected_cost)}</td>
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
              <h2 className="text-lg font-bold text-gray-800">{editItem ? "Edit Headcount Record" : "New Headcount Record"}</h2>
              <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-600 p-1"><X size={20} /></button>
            </div>
            <form noValidate onSubmit={handleSubmit} className="p-6 space-y-4">
              {formErrors.submit && <div role="alert" className="text-red-700 text-sm bg-red-50 border border-red-200 px-3 py-2 rounded-lg">{formErrors.submit}</div>}
              {noDepartments && <div role="alert" className="text-amber-800 text-sm bg-amber-50 border border-amber-200 px-3 py-2 rounded-lg">There are no departments in this organization yet. Create a department first, then plan its headcount.</div>}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label htmlFor="hc-dept" className="block text-sm font-medium text-gray-700 mb-1">Department <span className="text-red-500">*</span></label>
                  <select id="hc-dept" value={form.department_id} onChange={handleField("department_id")} disabled={noDepartments} aria-invalid={!!formErrors.department_id} className={boxClass("department_id")}>
                    <option value="">{noDepartments ? "No departments yet" : "Select department"}</option>
                    {departmentChoices.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                  </select>
                  {fieldError("department_id")}
                </div>
                <div>
                  <label htmlFor="hc-year" className="block text-sm font-medium text-gray-700 mb-1">Fiscal Year <span className="text-red-500">*</span></label>
                  <input id="hc-year" type="number" min="2020" max="2100" step="1" value={form.fiscal_year} onChange={handleField("fiscal_year")} aria-invalid={!!formErrors.fiscal_year} className={boxClass("fiscal_year")} />
                  {fieldError("fiscal_year")}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label htmlFor="hc-approved" className="block text-sm font-medium text-gray-700 mb-1">Approved Positions</label>
                  <input id="hc-approved" type="number" min="0" step="1" value={form.approved_positions} onChange={handleField("approved_positions")} aria-invalid={!!formErrors.approved_positions} className={boxClass("approved_positions")} />
                  {fieldError("approved_positions")}
                </div>
                <div>
                  <label htmlFor="hc-filled" className="block text-sm font-medium text-gray-700 mb-1">Filled Positions</label>
                  <input id="hc-filled" type="number" min="0" step="1" value={form.filled_positions} onChange={handleField("filled_positions")} aria-invalid={!!formErrors.filled_positions} className={boxClass("filled_positions")} />
                  {fieldError("filled_positions")}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label htmlFor="hc-vacant" className="block text-sm font-medium text-gray-700 mb-1">Vacant Positions</label>
                  <input id="hc-vacant" type="number" min="0" step="1" value={form.vacant_positions} onChange={handleField("vacant_positions")} aria-invalid={!!formErrors.vacant_positions} className={boxClass("vacant_positions")} />
                  {fieldError("vacant_positions")}
                </div>
                <div>
                  <label htmlFor="hc-hires" className="block text-sm font-medium text-gray-700 mb-1">Planned Hires</label>
                  <input id="hc-hires" type="number" min="0" step="1" value={form.planned_hires} onChange={handleField("planned_hires")} aria-invalid={!!formErrors.planned_hires} className={boxClass("planned_hires")} />
                  {fieldError("planned_hires")}
                </div>
              </div>
              <p className="text-[11px] text-gray-400 -mt-2">Filled plus vacant cannot be more than approved. An empty number counts as 0.</p>
              <div>
                <label htmlFor="hc-cost" className="block text-sm font-medium text-gray-700 mb-1">Projected Cost ($)</label>
                <input id="hc-cost" type="number" min="0" step="0.01" value={form.projected_cost} onChange={handleField("projected_cost")} aria-invalid={!!formErrors.projected_cost} className={boxClass("projected_cost")} />
                {fieldError("projected_cost")}
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={() => setShowModal(false)}
                  className="px-4 py-2 text-sm border border-gray-200 rounded-lg hover:bg-gray-50">Cancel</button>
                <button type="submit" disabled={submitting || noDepartments}
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
