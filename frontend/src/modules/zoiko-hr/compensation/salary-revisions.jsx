import { useState, useEffect, useMemo } from "react";
import HRPage from "../../../components/HRPage";
import {
  getSalaryRevisions,
  createSalaryRevision,
  updateSalaryRevision,
  deleteSalaryRevision,
  getEmployeeCompensation,
} from "../../../service/hrService";

const STATUS_COLORS = {
  approved: "bg-green-100 text-green-800",
  pending: "bg-yellow-100 text-yellow-800",
  rejected: "bg-red-100 text-red-800",
};

const ITEMS_PER_PAGE = 8;

const initialForm = {
  employee_compensation_id: "",
  old_salary: "",
  new_salary: "",
  reason: "",
  effective_date: "",
};

export default function ZoikoHRSalaryRevisions() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editItem, setEditItem] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [formData, setFormData] = useState({ ...initialForm });
  const [formErrors, setFormErrors] = useState({});
  const [editForm, setEditForm] = useState({ ...initialForm });
  const [compensations, setCompensations] = useState([]);

  const fetchItems = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getSalaryRevisions();
      setItems(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err.message || "Failed to load salary revisions");
      setItems([]);
    } finally {
      setLoading(false);
    }
  };

  const fetchCompensations = async () => {
    try {
      const data = await getEmployeeCompensation();
      setCompensations(Array.isArray(data) ? data : []);
    } catch {
      setCompensations([]);
    }
  };

  useEffect(() => {
    fetchItems();
    fetchCompensations();
  }, []);

  const stats = useMemo(() => {
    const total = items.length;
    const totalIncrease = items.reduce((sum, i) => {
      return sum + ((parseFloat(i.new_salary) || 0) - (parseFloat(i.old_salary) || 0));
    }, 0);
    const avgIncrease = total > 0 ? totalIncrease / total : 0;
    return { total, avgIncrease };
  }, [items]);

  const filtered = useMemo(() => {
    let result = items;
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter((i) => {
        const comp = compensations.find((c) => c.id === i.employee_compensation_id);
        return comp ? String(comp.employee_id).includes(q) : false;
      });
    }
    return result;
  }, [items, search, compensations]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / ITEMS_PER_PAGE));
  const safePage = Math.min(currentPage, totalPages);
  const paginated = useMemo(() => {
    const start = (safePage - 1) * ITEMS_PER_PAGE;
    return filtered.slice(start, start + ITEMS_PER_PAGE);
  }, [filtered, safePage]);

  useEffect(() => {
    if (currentPage > totalPages) setCurrentPage(totalPages);
  }, [totalPages, currentPage]);

  const resetForm = () => setFormData({ ...initialForm });

  const validateForm = (data) => {
    const errors = {};
    if (!data.employee_compensation_id) errors.employee_compensation_id = "Employee compensation is required";
    if (!data.new_salary || isNaN(parseFloat(data.new_salary))) errors.new_salary = "Valid new salary is required";
    if (!data.effective_date) errors.effective_date = "Effective date is required";
    return errors;
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    const errors = validateForm(formData);
    setFormErrors(errors);
    if (Object.keys(errors).length > 0) return;
    setSubmitting(true);
    try {
      await createSalaryRevision({
        employee_compensation_id: parseInt(formData.employee_compensation_id),
        old_salary: formData.old_salary ? parseFloat(formData.old_salary) : null,
        new_salary: parseFloat(formData.new_salary),
        reason: formData.reason.trim() || null,
        effective_date: formData.effective_date,
      });
      setShowCreateModal(false);
      resetForm();
      await fetchItems();
    } catch (err) {
      setFormErrors({ submit: err.message || "Failed to create salary revision" });
    } finally {
      setSubmitting(false);
    }
  };

  const openEditModal = (item) => {
    setEditItem(item);
    setEditForm({
      employee_compensation_id: item.employee_compensation_id || "",
      old_salary: item.old_salary || "",
      new_salary: item.new_salary || "",
      reason: item.reason || "",
      effective_date: item.effective_date || "",
    });
    setFormErrors({});
    setShowEditModal(true);
  };

  const handleUpdate = async (e) => {
    e.preventDefault();
    if (!editItem) return;
    const errors = validateForm(editForm);
    setFormErrors(errors);
    if (Object.keys(errors).length > 0) return;
    setSubmitting(true);
    try {
      const payload = {};
      for (const key of Object.keys(initialForm)) {
        let val, orig;
        if (key === "employee_compensation_id") {
          val = editForm[key] ? parseInt(editForm[key]) : null;
          orig = editItem[key] ? parseInt(editItem[key]) : null;
        } else if (["old_salary", "new_salary"].includes(key)) {
          val = editForm[key] ? parseFloat(editForm[key]) : null;
          orig = editItem[key] ? parseFloat(editItem[key]) : null;
        } else {
          val = editForm[key] || null;
          orig = editItem[key] || null;
        }
        if (String(val) !== String(orig)) payload[key] = val;
      }
      if (Object.keys(payload).length > 0) {
        await updateSalaryRevision(editItem.id, payload);
      }
      setShowEditModal(false);
      setEditItem(null);
      await fetchItems();
    } catch (err) {
      setFormErrors({ submit: err.message || "Failed to update salary revision" });
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Are you sure you want to delete this salary revision?")) return;
    try {
      await deleteSalaryRevision(id);
      await fetchItems();
    } catch (err) {
      setError(err.message || "Failed to delete salary revision");
    }
  };

  if (loading && items.length === 0) {
    return (
      <HRPage title="Salary Revisions" subtitle="Track and manage salary revision history.">
        <div className="flex justify-center items-center py-20">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          <span className="ml-3 text-gray-500">Loading salary revisions...</span>
        </div>
      </HRPage>
    );
  }

  return (
    <HRPage title="Salary Revisions" subtitle="Track and manage salary revision history.">
      {error && (
        <div className="mb-4 px-4 py-3 bg-red-50 border border-red-200 text-red-700 rounded-lg flex justify-between items-center">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="text-red-500 hover:text-red-700 font-bold">&times;</button>
        </div>
      )}

      {formErrors.submit && (
        <div className="mb-4 px-4 py-3 bg-red-50 border border-red-200 text-red-700 rounded-lg">{formErrors.submit}</div>
      )}

      <div className="space-y-6">
        <div className="flex flex-wrap justify-between items-center gap-4">
          <div className="flex flex-wrap gap-3">
            <div className="bg-white px-4 py-2 border border-gray-100 rounded-lg shadow-sm text-sm">
              <span className="text-gray-400">Total Revisions: </span>
              <span className="font-bold text-gray-800">{stats.total}</span>
            </div>
            <div className="bg-white px-4 py-2 border border-blue-100 rounded-lg shadow-sm text-sm">
              <span className="text-gray-400">Avg Increase: </span>
              <span className="font-bold text-blue-600">${stats.avgIncrease.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
            </div>
          </div>
          <button
            onClick={() => { resetForm(); fetchCompensations(); setShowCreateModal(true); }}
            className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
          >
            + Add Revision
          </button>
        </div>

        {items.length > 0 && (
          <div className="flex flex-wrap gap-3">
            <input
              type="text"
              placeholder="Search by Employee ID..."
              value={search}
              onChange={(e) => { setSearch(e.target.value); setCurrentPage(1); }}
              className="border border-gray-200 rounded-lg px-3 py-2 text-sm w-64 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        )}

        {filtered.length === 0 && !loading ? (
          <div className="text-center py-16 bg-white rounded-xl border border-gray-100 shadow-sm">
            <div className="text-4xl mb-3">💰</div>
            <p className="text-gray-500 font-medium">
              {items.length === 0
                ? "No salary revisions yet. Add your first revision to get started."
                : "No revisions match your search criteria."}
            </p>
          </div>
        ) : (
          <>
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b border-gray-100">
                    <tr>
                      <th className="text-left px-4 py-3 font-semibold text-gray-600">Employee ID</th>
                      <th className="text-left px-4 py-3 font-semibold text-gray-600">Old Salary</th>
                      <th className="text-left px-4 py-3 font-semibold text-gray-600">New Salary</th>
                      <th className="text-left px-4 py-3 font-semibold text-gray-600">Change</th>
                      <th className="text-left px-4 py-3 font-semibold text-gray-600">Reason</th>
                      <th className="text-left px-4 py-3 font-semibold text-gray-600">Effective Date</th>
                      <th className="text-left px-4 py-3 font-semibold text-gray-600">Status</th>
                      <th className="text-right px-4 py-3 font-semibold text-gray-600">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {paginated.map((item) => {
                      const oldSal = parseFloat(item.old_salary) || 0;
                      const newSal = parseFloat(item.new_salary) || 0;
                      const change = newSal - oldSal;
                      const comp = compensations.find((c) => c.id === item.employee_compensation_id);
                      return (
                        <tr key={item.id} className="hover:bg-gray-50 transition-colors">
                          <td className="px-4 py-3 font-mono text-xs font-semibold text-blue-600">
                            {comp ? `#${comp.employee_id}` : `EC#${item.employee_compensation_id}`}
                          </td>
                          <td className="px-4 py-3 text-gray-700">${oldSal.toLocaleString()}</td>
                          <td className="px-4 py-3 text-gray-700">${newSal.toLocaleString()}</td>
                          <td className={`px-4 py-3 font-medium ${change >= 0 ? "text-green-600" : "text-red-600"}`}>
                            {change >= 0 ? "+" : ""}${change.toLocaleString()}
                          </td>
                          <td className="px-4 py-3 text-gray-700">{item.reason || <span className="text-gray-300">-</span>}</td>
                          <td className="px-4 py-3 text-gray-700">{item.effective_date || <span className="text-gray-300">-</span>}</td>
                          <td className="px-4 py-3">
                            <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[item.status] || STATUS_COLORS.pending}`}>
                              {item.status || "pending"}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <div className="flex items-center justify-end gap-1">
                              <button
                                onClick={() => openEditModal(item)}
                                className="text-blue-600 hover:text-blue-800 text-xs font-medium px-1"
                              >
                                Edit
                              </button>
                              <button
                                onClick={() => handleDelete(item.id)}
                                className="text-red-500 hover:text-red-700 text-xs font-medium px-1"
                              >
                                Delete
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {totalPages > 1 && (
              <div className="flex justify-between items-center">
                <span className="text-xs text-gray-400">
                  Showing {(safePage - 1) * ITEMS_PER_PAGE + 1}-{Math.min(safePage * ITEMS_PER_PAGE, filtered.length)} of {filtered.length}
                </span>
                <div className="flex gap-1">
                  <button
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    disabled={safePage <= 1}
                    className="px-3 py-1 text-sm border border-gray-200 rounded-lg disabled:opacity-40 hover:bg-gray-50"
                  >
                    Prev
                  </button>
                  {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
                    <button
                      key={p}
                      onClick={() => setCurrentPage(p)}
                      className={`px-3 py-1 text-sm border rounded-lg ${
                        p === safePage
                          ? "bg-blue-600 text-white border-blue-600"
                          : "border-gray-200 hover:bg-gray-50"
                      }`}
                    >
                      {p}
                    </button>
                  ))}
                  <button
                    onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                    disabled={safePage >= totalPages}
                    className="px-3 py-1 text-sm border border-gray-200 rounded-lg disabled:opacity-40 hover:bg-gray-50"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center px-6 py-4 border-b border-gray-100">
              <h2 className="text-lg font-bold text-gray-800">Add Salary Revision</h2>
              <button onClick={() => { setShowCreateModal(false); resetForm(); }} className="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
            </div>
            <form onSubmit={handleCreate} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Employee Compensation *</label>
                <select
                  value={formData.employee_compensation_id}
                  onChange={(e) => setFormData({ ...formData, employee_compensation_id: e.target.value })}
                  className={`w-full border ${formErrors.employee_compensation_id ? "border-red-300" : "border-gray-200"} rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500`}
                >
                  <option value="">-- Select Employee Compensation --</option>
                  {compensations.map((c) => (
                    <option key={c.id} value={c.id}>
                      Employee #{c.employee_id} — Structure #{c.structure_id} (Eff: {c.effective_date})
                    </option>
                  ))}
                </select>
                {formErrors.employee_compensation_id && <p className="text-red-500 text-xs mt-1">{formErrors.employee_compensation_id}</p>}
                {compensations.length === 0 && (
                  <p className="text-amber-600 text-xs mt-1">No employee compensations found. Create one first.</p>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Old Salary</label>
                <input
                  type="number"
                  step="0.01"
                  value={formData.old_salary}
                  onChange={(e) => setFormData({ ...formData, old_salary: e.target.value })}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">New Salary *</label>
                <input
                  type="number"
                  step="0.01"
                  value={formData.new_salary}
                  onChange={(e) => setFormData({ ...formData, new_salary: e.target.value })}
                  className={`w-full border ${formErrors.new_salary ? "border-red-300" : "border-gray-200"} rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500`}
                />
                {formErrors.new_salary && <p className="text-red-500 text-xs mt-1">{formErrors.new_salary}</p>}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Reason</label>
                <textarea
                  rows={2}
                  value={formData.reason}
                  onChange={(e) => setFormData({ ...formData, reason: e.target.value })}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Effective Date *</label>
                <input
                  type="date"
                  value={formData.effective_date}
                  onChange={(e) => setFormData({ ...formData, effective_date: e.target.value })}
                  className={`w-full border ${formErrors.effective_date ? "border-red-300" : "border-gray-200"} rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500`}
                />
                {formErrors.effective_date && <p className="text-red-500 text-xs mt-1">{formErrors.effective_date}</p>}
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={() => { setShowCreateModal(false); resetForm(); }} className="px-4 py-2 text-sm border border-gray-200 rounded-lg hover:bg-gray-50">Cancel</button>
                <button type="submit" disabled={submitting} className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white rounded-lg font-medium transition-colors">
                  {submitting ? "Creating..." : "Create Revision"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showEditModal && editItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center px-6 py-4 border-b border-gray-100">
              <h2 className="text-lg font-bold text-gray-800">Update Salary Revision</h2>
              <button onClick={() => { setShowEditModal(false); setEditItem(null); }} className="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
            </div>
            <form onSubmit={handleUpdate} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Employee Compensation *</label>
                <select
                  value={editForm.employee_compensation_id}
                  onChange={(e) => setEditForm({ ...editForm, employee_compensation_id: e.target.value })}
                  className={`w-full border ${formErrors.employee_compensation_id ? "border-red-300" : "border-gray-200"} rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500`}
                >
                  <option value="">-- Select Employee Compensation --</option>
                  {compensations.map((c) => (
                    <option key={c.id} value={c.id}>
                      Employee #{c.employee_id} — Structure #{c.structure_id} (Eff: {c.effective_date})
                    </option>
                  ))}
                </select>
                {formErrors.employee_compensation_id && <p className="text-red-500 text-xs mt-1">{formErrors.employee_compensation_id}</p>}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Old Salary</label>
                <input
                  type="number"
                  step="0.01"
                  value={editForm.old_salary}
                  onChange={(e) => setEditForm({ ...editForm, old_salary: e.target.value })}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">New Salary *</label>
                <input
                  type="number"
                  step="0.01"
                  value={editForm.new_salary}
                  onChange={(e) => setEditForm({ ...editForm, new_salary: e.target.value })}
                  className={`w-full border ${formErrors.new_salary ? "border-red-300" : "border-gray-200"} rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500`}
                />
                {formErrors.new_salary && <p className="text-red-500 text-xs mt-1">{formErrors.new_salary}</p>}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Reason</label>
                <textarea
                  rows={2}
                  value={editForm.reason}
                  onChange={(e) => setEditForm({ ...editForm, reason: e.target.value })}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Effective Date *</label>
                <input
                  type="date"
                  value={editForm.effective_date}
                  onChange={(e) => setEditForm({ ...editForm, effective_date: e.target.value })}
                  className={`w-full border ${formErrors.effective_date ? "border-red-300" : "border-gray-200"} rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500`}
                />
                {formErrors.effective_date && <p className="text-red-500 text-xs mt-1">{formErrors.effective_date}</p>}
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={() => { setShowEditModal(false); setEditItem(null); }} className="px-4 py-2 text-sm border border-gray-200 rounded-lg hover:bg-gray-50">Cancel</button>
                <button type="submit" disabled={submitting} className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white rounded-lg font-medium transition-colors">
                  {submitting ? "Updating..." : "Update Revision"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </HRPage>
  );
}
