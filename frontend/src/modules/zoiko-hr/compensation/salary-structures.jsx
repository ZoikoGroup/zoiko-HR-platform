import { useState, useEffect, useMemo } from "react";
import HRPage from "../../../components/HRPage";
import {
  getSalaryStructures,
  createSalaryStructure,
  updateSalaryStructure,
  deleteSalaryStructure,
  getSalaryComponents,
  getStructureComponents,
  addStructureComponent,
  updateStructureComponent,
  deleteStructureComponent,
} from "../../../service/hrService";
import { formatDateTime } from "../../../utils/dateTime";
import { validateStructureComponent, structureComponentPayload, structureAmountError, suggestedAmount, serverStructureErrors } from "../../../utils/structureComponentForm";

const asList = (r) => (Array.isArray(r) ? r : r?.items || r?.data || []);

/** What goes into a salary structure: each component with the amount that counts. The amount is required here, even for a
 *  component that has no default amount of its own. */
function StructureComponentsDialog({ structure, onClose }) {
  const [rows, setRows] = useState(null);
  const [catalog, setCatalog] = useState([]);
  const [form, setForm] = useState({ componentId: "", amount: "" });
  const [errors, setErrors] = useState({});
  const [message, setMessage] = useState(null);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(null);       // { id, amount, error }

  const load = async () => {
    try {
      const [inStructure, all] = await Promise.all([getStructureComponents(structure.id), getSalaryComponents()]);
      setRows(asList(inStructure));
      setCatalog(asList(all));
    } catch (err) {
      setRows([]);
      setMessage(err?.message || "The components could not be loaded.");
    }
  };
  useEffect(() => { load(); }, [structure.id]);

  const usedIds = (rows || []).map((r) => r.component_id);
  const available = catalog.filter((c) => !usedIds.includes(c.id));

  const pick = (e) => {
    const id = e.target.value;
    const comp = catalog.find((c) => String(c.id) === id);
    setForm({ componentId: id, amount: suggestedAmount(comp) });   // a default amount is only a suggestion
    setErrors({});
    setMessage(null);
  };

  const add = async (e) => {
    e.preventDefault();
    if (saving) return;
    const problems = validateStructureComponent(form, usedIds);
    setErrors(problems);
    if (Object.keys(problems).length) return;
    setSaving(true);
    setMessage(null);
    try {
      await addStructureComponent(structure.id, structureComponentPayload(form));
      setForm({ componentId: "", amount: "" });
      await load();
    } catch (err) {
      const { fieldErrors, message: msg } = serverStructureErrors(err);
      setErrors(fieldErrors);
      setMessage(msg || null);
    } finally {
      setSaving(false);
    }
  };

  const saveEdit = async () => {
    const problem = structureAmountError(editing.amount);
    if (problem) { setEditing({ ...editing, error: problem }); return; }
    try {
      await updateStructureComponent(structure.id, editing.id, { amount_or_formula: editing.amount.trim() });
      setEditing(null);
      await load();
    } catch (err) {
      setEditing({ ...editing, error: serverStructureErrors(err).fieldErrors.amount || err?.message || "The amount could not be changed." });
    }
  };

  const remove = async (row) => {
    if (!window.confirm(`Remove ${row.component_name || "this component"} from ${structure.name}?`)) return;
    try {
      await deleteStructureComponent(structure.id, row.id);
      await load();
    } catch (err) {
      setMessage(err?.message || "The component could not be removed.");
    }
  };

  return (
    <div role="dialog" aria-modal="true" aria-label={`Components of ${structure.name}`} className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl mx-4 max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center px-6 py-4 border-b border-gray-100">
          <h2 className="text-lg font-bold text-gray-800">Components of {structure.name}</h2>
          <button onClick={onClose} aria-label="Close" className="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
        </div>
        <div className="p-6 space-y-5">
          {message && <div role="alert" className="px-4 py-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">{message}</div>}

          {rows === null ? (
            <p className="text-sm text-gray-500">Loading components...</p>
          ) : rows.length === 0 ? (
            <p className="text-sm text-gray-500">No components yet. Add the earnings and deductions this structure is made of.</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  <th className="text-left px-3 py-2 font-semibold text-gray-600">Component</th>
                  <th className="text-left px-3 py-2 font-semibold text-gray-600">Type</th>
                  <th className="text-left px-3 py-2 font-semibold text-gray-600">Amount / formula</th>
                  <th className="text-right px-3 py-2 font-semibold text-gray-600">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td className="px-3 py-2 font-medium text-gray-800">{r.component_name || `Component #${r.component_id}`}</td>
                    <td className="px-3 py-2 capitalize text-gray-600">{r.component_type || "-"}</td>
                    <td className="px-3 py-2 text-gray-700">
                      {editing?.id === r.id ? (
                        <div>
                          <input aria-label="Amount or formula" value={editing.amount} onChange={(e) => setEditing({ ...editing, amount: e.target.value, error: "" })}
                            className={`w-full border ${editing.error ? "border-red-300" : "border-gray-200"} rounded-lg px-2 py-1 text-sm`} />
                          {editing.error && <p role="alert" className="text-red-500 text-xs mt-1">{editing.error}</p>}
                        </div>
                      ) : r.amount_or_formula}
                    </td>
                    <td className="px-3 py-2 text-right whitespace-nowrap">
                      {editing?.id === r.id ? (
                        <>
                          <button onClick={saveEdit} className="text-blue-600 hover:text-blue-800 text-xs font-medium px-1">Save</button>
                          <button onClick={() => setEditing(null)} className="text-gray-500 hover:text-gray-700 text-xs font-medium px-1">Cancel</button>
                        </>
                      ) : (
                        <>
                          <button onClick={() => setEditing({ id: r.id, amount: r.amount_or_formula, error: "" })} className="text-blue-600 hover:text-blue-800 text-xs font-medium px-1">Edit</button>
                          <button onClick={() => remove(r)} className="text-red-500 hover:text-red-700 text-xs font-medium px-1">Remove</button>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          <form onSubmit={add} noValidate className="border-t border-gray-100 pt-4 space-y-3">
            <h3 className="text-sm font-bold text-gray-800">Add a component</h3>
            <div>
              <label htmlFor="sc-component" className="block text-sm font-medium text-gray-700 mb-1">Component <span className="text-red-500">*</span></label>
              <select id="sc-component" value={form.componentId} onChange={pick} aria-invalid={!!errors.componentId}
                className={`w-full border ${errors.componentId ? "border-red-300" : "border-gray-200"} rounded-lg px-3 py-2 text-sm`}>
                <option value="">{available.length ? "Select a component" : "Every component is already in this structure"}</option>
                {available.map((c) => <option key={c.id} value={c.id}>{c.name} ({c.component_type})</option>)}
              </select>
              {errors.componentId && <p role="alert" className="text-red-500 text-xs mt-1">{errors.componentId}</p>}
            </div>
            <div>
              <label htmlFor="sc-amount" className="block text-sm font-medium text-gray-700 mb-1">Amount or formula <span className="text-red-500">*</span></label>
              <input id="sc-amount" type="text" value={form.amount} onChange={(e) => { setForm({ ...form, amount: e.target.value }); setErrors((p) => ({ ...p, amount: undefined })); }}
                placeholder="e.g. 50000, 12% or 40% of basic" aria-invalid={!!errors.amount}
                className={`w-full border ${errors.amount ? "border-red-300" : "border-gray-200"} rounded-lg px-3 py-2 text-sm`} />
              {errors.amount && <p role="alert" className="text-red-500 text-xs mt-1">{errors.amount}</p>}
              <p className="text-gray-400 text-xs mt-1">Required. A fixed amount, a percentage, or a formula. A component's default amount is only filled in as a suggestion.</p>
            </div>
            <div className="flex justify-end">
              <button type="submit" disabled={saving || !available.length} className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white rounded-lg font-medium transition-colors">
                {saving ? "Adding..." : "Add to structure"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

const ITEMS_PER_PAGE = 8;

const initialForm = {
  name: "",
  is_active: true,
};

export default function SalaryStructuresPage() {
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
  const [componentsFor, setComponentsFor] = useState(null);

  const fetchItems = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getSalaryStructures();
      setItems(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err.message || "Failed to load salary structures");
      setItems([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchItems();
  }, []);

  const stats = useMemo(() => {
    const total = items.length;
    const active = items.filter((s) => s.is_active !== false).length;
    return { total, active };
  }, [items]);

  const filtered = useMemo(() => {
    let result = items;
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter((s) => (s.name || "").toLowerCase().includes(q));
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
    if (!data.name?.trim()) errors.name = "Structure name is required";
    return errors;
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    const errors = validateForm(formData);
    setFormErrors(errors);
    if (Object.keys(errors).length > 0) return;
    setSubmitting(true);
    try {
      await createSalaryStructure({
        name: formData.name.trim(),
        is_active: formData.is_active,
      });
      setShowCreateModal(false);
      resetForm();
      await fetchItems();
    } catch (err) {
      setFormErrors({ submit: err.message || "Failed to create salary structure" });
    } finally {
      setSubmitting(false);
    }
  };

  const openEditModal = (item) => {
    setEditItem(item);
    setEditForm({
      name: item.name || "",
      is_active: item.is_active !== false,
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
      await updateSalaryStructure(editItem.id, {
        name: editForm.name.trim(),
        is_active: editForm.is_active,
      });
      setShowEditModal(false);
      setEditItem(null);
      await fetchItems();
    } catch (err) {
      setFormErrors({ submit: err.message || "Failed to update salary structure" });
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Are you sure you want to delete this salary structure?")) return;
    try {
      await deleteSalaryStructure(id);
      await fetchItems();
    } catch (err) {
      setError(err.message || "Failed to delete salary structure");
    }
  };

  if (loading && items.length === 0) {
    return (
      <HRPage title="Salary Structures" subtitle="Manage salary structure templates.">
        <div className="flex justify-center items-center py-20">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          <span className="ml-3 text-gray-500">Loading salary structures...</span>
        </div>
      </HRPage>
    );
  }

  return (
    <HRPage title="Salary Structures" subtitle="Manage salary structure templates.">
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
            <div className="bg-white px-4 py-2 border border-green-100 rounded-lg shadow-sm text-sm">
              <span className="text-gray-400">Active: </span>
              <span className="font-bold text-green-600">{stats.active}</span>
            </div>
          </div>
          <button
            onClick={() => { resetForm(); setShowCreateModal(true); }}
            className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
          >
            + Add Salary Structure
          </button>
        </div>

        {items.length > 0 && (
          <div className="flex flex-wrap gap-3">
            <input
              type="text"
              placeholder="Search by name..."
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
                ? "No salary structures yet. Add your first one to get started."
                : "No salary structures match your search criteria."}
            </p>
          </div>
        ) : (
          <>
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b border-gray-100">
                    <tr>
                      <th className="text-left px-4 py-3 font-semibold text-gray-600">Name</th>
                      <th className="text-left px-4 py-3 font-semibold text-gray-600">Status</th>
                      <th className="text-right px-4 py-3 font-semibold text-gray-600">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {paginated.map((s) => (
                      <tr key={s.id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-4 py-3 font-medium text-gray-800">{s.name}</td>
                        <td className="px-4 py-3">
                          <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${s.is_active !== false ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-800"}`}>
                            {s.is_active !== false ? "Active" : "Inactive"}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <button
                              onClick={() => setComponentsFor(s)}
                              className="text-emerald-600 hover:text-emerald-800 text-xs font-medium px-1"
                            >
                              Components
                            </button>
                            <button
                              onClick={() => openEditModal(s)}
                              className="text-blue-600 hover:text-blue-800 text-xs font-medium px-1"
                            >
                              Edit
                            </button>
                            <button
                              onClick={() => handleDelete(s.id)}
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

      {componentsFor && <StructureComponentsDialog structure={componentsFor} onClose={() => setComponentsFor(null)} />}

      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center px-6 py-4 border-b border-gray-100">
              <h2 className="text-lg font-bold text-gray-800">Add Salary Structure</h2>
              <button onClick={() => { setShowCreateModal(false); resetForm(); }} className="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
            </div>
            <form onSubmit={handleCreate} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Structure Name *</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className={`w-full border ${formErrors.name ? "border-red-300" : "border-gray-200"} rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500`}
                  placeholder="e.g. Standard, Executive, Intern"
                />
                {formErrors.name && <p className="text-red-500 text-xs mt-1">{formErrors.name}</p>}
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="is_active"
                  checked={formData.is_active}
                  onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                  className="rounded border-gray-300"
                />
                <label htmlFor="is_active" className="text-sm font-medium text-gray-700">Active</label>
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={() => { setShowCreateModal(false); resetForm(); }} className="px-4 py-2 text-sm border border-gray-200 rounded-lg hover:bg-gray-50">Cancel</button>
                <button type="submit" disabled={submitting} className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white rounded-lg font-medium transition-colors">
                  {submitting ? "Creating..." : "Create Structure"}
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
              <h2 className="text-lg font-bold text-gray-800">Update Salary Structure</h2>
              <button onClick={() => { setShowEditModal(false); setEditItem(null); }} className="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
            </div>
            <form onSubmit={handleUpdate} className="p-6 space-y-4">
              <div className="text-sm text-gray-500 mb-1">
                Editing: <span className="font-medium text-gray-800">{editItem.name}</span>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Structure Name *</label>
                <input
                  type="text"
                  value={editForm.name}
                  onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                  className={`w-full border ${formErrors.name ? "border-red-300" : "border-gray-200"} rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500`}
                />
                {formErrors.name && <p className="text-red-500 text-xs mt-1">{formErrors.name}</p>}
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="edit_is_active"
                  checked={editForm.is_active}
                  onChange={(e) => setEditForm({ ...editForm, is_active: e.target.checked })}
                  className="rounded border-gray-300"
                />
                <label htmlFor="edit_is_active" className="text-sm font-medium text-gray-700">Active</label>
              </div>
              {editItem.created_at && (
                <div className="text-xs text-gray-400">Created: {formatDateTime(editItem.created_at)}</div>
              )}
              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={() => { setShowEditModal(false); setEditItem(null); }} className="px-4 py-2 text-sm border border-gray-200 rounded-lg hover:bg-gray-50">Cancel</button>
                <button type="submit" disabled={submitting} className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white rounded-lg font-medium transition-colors">
                  {submitting ? "Updating..." : "Update Structure"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </HRPage>
  );
}
