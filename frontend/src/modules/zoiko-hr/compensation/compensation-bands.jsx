import { useState, useEffect, useMemo } from "react";
import HRPage from "../../../components/HRPage";
import {
  getCompensationBands,
  createCompensationBand,
  updateCompensationBand,
  deleteCompensationBand,
} from "../../../service/hrService";

const ITEMS_PER_PAGE = 8;

const initialForm = {
  band_name: "",
  level: "",
  min_salary: "",
  max_salary: "",
};

export default function CompensationBandsPage() {
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

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getCompensationBands();
      setItems(data);
    } catch (err) {
      setError(err.message || "Failed to load compensation bands");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const stats = useMemo(() => {
    const total = items.length;
    const highestMax = items.reduce((max, i) => Math.max(max, Number(i.max_salary) || 0), 0);
    return { total, highestMax };
  }, [items]);

  const filtered = useMemo(() => {
    let result = items;
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        (i) =>
          i.band_name?.toLowerCase().includes(q) ||
          String(i.level).toLowerCase().includes(q)
      );
    }
    return result;
  }, [items, search]);

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
    if (!data.band_name?.trim()) errors.band_name = "Band name is required";
    if (!data.level || isNaN(parseInt(data.level))) errors.level = "Valid level is required";
    if (!data.min_salary || isNaN(parseFloat(data.min_salary)) || parseFloat(data.min_salary) < 0) errors.min_salary = "Valid min salary is required";
    if (!data.max_salary || isNaN(parseFloat(data.max_salary)) || parseFloat(data.max_salary) < 0) errors.max_salary = "Valid max salary is required";
    if (parseFloat(data.min_salary) > parseFloat(data.max_salary)) errors.max_salary = "Max must be greater than min";
    return errors;
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    const errors = validateForm(formData);
    setFormErrors(errors);
    if (Object.keys(errors).length > 0) return;
    setSubmitting(true);
    try {
      await createCompensationBand({
        band_name: formData.band_name.trim(),
        level: parseInt(formData.level),
        min_salary: parseFloat(formData.min_salary),
        max_salary: parseFloat(formData.max_salary),
      });
      await fetchData();
      setShowCreateModal(false);
      resetForm();
    } catch (err) {
      setFormErrors({ submit: err.message || "Failed to create band" });
    } finally {
      setSubmitting(false);
    }
  };

  const openEditModal = (item) => {
    setEditItem(item);
    setEditForm({
      band_name: item.band_name || "",
      level: String(item.level || ""),
      min_salary: String(Number(item.min_salary) || ""),
      max_salary: String(Number(item.max_salary) || ""),
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
      await updateCompensationBand(editItem.id, {
        band_name: editForm.band_name.trim(),
        level: parseInt(editForm.level),
        min_salary: parseFloat(editForm.min_salary),
        max_salary: parseFloat(editForm.max_salary),
      });
      await fetchData();
      setShowEditModal(false);
      setEditItem(null);
    } catch (err) {
      setFormErrors({ submit: err.message || "Failed to update band" });
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Are you sure you want to delete this compensation band?")) return;
    try {
      await deleteCompensationBand(id);
      await fetchData();
    } catch (err) {
      setError(err.message || "Failed to delete band");
    }
  };

  if (loading) {
    return (
      <HRPage title="Compensation Bands" subtitle="Define compensation band ranges and levels.">
        <div className="flex justify-center items-center py-20">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          <span className="ml-3 text-gray-500">Loading compensation bands...</span>
        </div>
      </HRPage>
    );
  }

  return (
    <HRPage title="Compensation Bands" subtitle="Define compensation band ranges and levels.">
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
              <span className="text-gray-400">Total: </span>
              <span className="font-bold text-gray-800">{stats.total}</span>
            </div>
            <div className="bg-white px-4 py-2 border border-purple-100 rounded-lg shadow-sm text-sm">
              <span className="text-gray-400">Highest Band Max: </span>
              <span className="font-bold text-purple-600">${stats.highestMax.toLocaleString()}</span>
            </div>
          </div>
          <button
            onClick={() => { resetForm(); setShowCreateModal(true); }}
            className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
          >
            + Add Band
          </button>
        </div>

        {items.length > 0 && (
          <div className="flex flex-wrap gap-3">
            <input
              type="text"
              placeholder="Search by band name or level..."
              value={search}
              onChange={(e) => { setSearch(e.target.value); setCurrentPage(1); }}
              className="border border-gray-200 rounded-lg px-3 py-2 text-sm w-64 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        )}

        {filtered.length === 0 && !loading ? (
          <div className="text-center py-16 bg-white rounded-xl border border-gray-100 shadow-sm">
            <div className="text-4xl mb-3">📋</div>
            <p className="text-gray-500 font-medium">
              {items.length === 0
                ? "No compensation bands yet. Add your first band to get started."
                : "No bands match your search criteria."}
            </p>
          </div>
        ) : (
          <>
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b border-gray-100">
                    <tr>
                      <th className="text-left px-4 py-3 font-semibold text-gray-600">Band Name</th>
                      <th className="text-left px-4 py-3 font-semibold text-gray-600">Level</th>
                      <th className="text-left px-4 py-3 font-semibold text-gray-600">Min Salary</th>
                      <th className="text-left px-4 py-3 font-semibold text-gray-600">Max Salary</th>
                      <th className="text-left px-4 py-3 font-semibold text-gray-600">Range Width</th>
                      <th className="text-right px-4 py-3 font-semibold text-gray-600">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {paginated.map((i) => (
                      <tr key={i.id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-4 py-3 font-mono text-xs font-semibold text-blue-600">{i.band_name}</td>
                        <td className="px-4 py-3">
                          <span className="inline-block px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                            {i.level}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-gray-700">${Number(i.min_salary).toLocaleString()}</td>
                        <td className="px-4 py-3 text-gray-700">${Number(i.max_salary).toLocaleString()}</td>
                        <td className="px-4 py-3 text-gray-700">${(Number(i.max_salary) - Number(i.min_salary)).toLocaleString()}</td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <button
                              onClick={() => openEditModal(i)}
                              className="text-blue-600 hover:text-blue-800 text-xs font-medium px-1"
                            >
                              Edit
                            </button>
                            <button
                              onClick={() => handleDelete(i.id)}
                              className="text-red-500 hover:text-red-700 text-xs font-medium px-1"
                            >
                              Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
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
              <h2 className="text-lg font-bold text-gray-800">Add Compensation Band</h2>
              <button onClick={() => { setShowCreateModal(false); resetForm(); }} className="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
            </div>
            <form onSubmit={handleCreate} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Band Name *</label>
                <input
                  type="text"
                  value={formData.band_name}
                  onChange={(e) => setFormData({ ...formData, band_name: e.target.value })}
                  className={`w-full border ${formErrors.band_name ? "border-red-300" : "border-gray-200"} rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500`}
                />
                {formErrors.band_name && <p className="text-red-500 text-xs mt-1">{formErrors.band_name}</p>}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Level *</label>
                <input
                  type="number"
                  value={formData.level}
                  onChange={(e) => setFormData({ ...formData, level: e.target.value })}
                  className={`w-full border ${formErrors.level ? "border-red-300" : "border-gray-200"} rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500`}
                />
                {formErrors.level && <p className="text-red-500 text-xs mt-1">{formErrors.level}</p>}
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Min Salary *</label>
                  <input
                    type="number"
                    step="0.01"
                    value={formData.min_salary}
                    onChange={(e) => setFormData({ ...formData, min_salary: e.target.value })}
                    className={`w-full border ${formErrors.min_salary ? "border-red-300" : "border-gray-200"} rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500`}
                  />
                  {formErrors.min_salary && <p className="text-red-500 text-xs mt-1">{formErrors.min_salary}</p>}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Max Salary *</label>
                  <input
                    type="number"
                    step="0.01"
                    value={formData.max_salary}
                    onChange={(e) => setFormData({ ...formData, max_salary: e.target.value })}
                    className={`w-full border ${formErrors.max_salary ? "border-red-300" : "border-gray-200"} rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500`}
                  />
                  {formErrors.max_salary && <p className="text-red-500 text-xs mt-1">{formErrors.max_salary}</p>}
                </div>
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={() => { setShowCreateModal(false); resetForm(); }} className="px-4 py-2 text-sm border border-gray-200 rounded-lg hover:bg-gray-50">Cancel</button>
                <button type="submit" disabled={submitting} className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white rounded-lg font-medium transition-colors">
                  {submitting ? "Creating..." : "Create Band"}
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
              <h2 className="text-lg font-bold text-gray-800">Update Compensation Band</h2>
              <button onClick={() => { setShowEditModal(false); setEditItem(null); }} className="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
            </div>
            <form onSubmit={handleUpdate} className="p-6 space-y-4">
              <div className="text-sm text-gray-500 mb-1">
                Editing: <span className="font-medium text-gray-800">{editItem.band_name}</span> (Level {editItem.level})
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Band Name *</label>
                <input
                  type="text"
                  value={editForm.band_name}
                  onChange={(e) => setEditForm({ ...editForm, band_name: e.target.value })}
                  className={`w-full border ${formErrors.band_name ? "border-red-300" : "border-gray-200"} rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500`}
                />
                {formErrors.band_name && <p className="text-red-500 text-xs mt-1">{formErrors.band_name}</p>}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Level *</label>
                <input
                  type="number"
                  value={editForm.level}
                  onChange={(e) => setEditForm({ ...editForm, level: e.target.value })}
                  className={`w-full border ${formErrors.level ? "border-red-300" : "border-gray-200"} rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500`}
                />
                {formErrors.level && <p className="text-red-500 text-xs mt-1">{formErrors.level}</p>}
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Min Salary *</label>
                  <input
                    type="number"
                    step="0.01"
                    value={editForm.min_salary}
                    onChange={(e) => setEditForm({ ...editForm, min_salary: e.target.value })}
                    className={`w-full border ${formErrors.min_salary ? "border-red-300" : "border-gray-200"} rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500`}
                  />
                  {formErrors.min_salary && <p className="text-red-500 text-xs mt-1">{formErrors.min_salary}</p>}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Max Salary *</label>
                  <input
                    type="number"
                    step="0.01"
                    value={editForm.max_salary}
                    onChange={(e) => setEditForm({ ...editForm, max_salary: e.target.value })}
                    className={`w-full border ${formErrors.max_salary ? "border-red-300" : "border-gray-200"} rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500`}
                  />
                  {formErrors.max_salary && <p className="text-red-500 text-xs mt-1">{formErrors.max_salary}</p>}
                </div>
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={() => { setShowEditModal(false); setEditItem(null); }} className="px-4 py-2 text-sm border border-gray-200 rounded-lg hover:bg-gray-50">Cancel</button>
                <button type="submit" disabled={submitting} className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white rounded-lg font-medium transition-colors">
                  {submitting ? "Updating..." : "Update Band"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </HRPage>
  );
}
