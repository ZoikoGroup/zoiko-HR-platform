import { useState, useEffect, useMemo } from "react";
import { getAssets, createAsset, updateAsset, deleteAsset, getAssetCategories, getHrEmployees, transferAsset, assignAsset, returnAsset, exportAssetsCsv, exportAssetsExcel } from "../../../service/hrService";

const ITEMS_PER_PAGE = 15;

const initialForm = {
  name: "", assetTag: "", category: "", serialNumber: "", employeeName: "", department: "",
  assignedDate: "", status: "available", condition: "new", purchaseDate: "", purchasePrice: "", notes: "",
};
const STATUS_OPTIONS = ["available", "assigned", "maintenance", "retired", "lost"];
const CONDITION_OPTIONS = ["new", "good", "fair", "poor", "damaged"];

const STATUS_COLORS = {
  available: "bg-green-100 text-green-800", assigned: "bg-blue-100 text-blue-800",
  maintenance: "bg-orange-100 text-orange-800", retired: "bg-gray-100 text-gray-800", lost: "bg-red-100 text-red-800",
};

const CONDITION_COLORS = {
  new: "bg-emerald-100 text-emerald-800", good: "bg-green-100 text-green-800",
  fair: "bg-yellow-100 text-yellow-800", poor: "bg-orange-100 text-orange-800", damaged: "bg-red-100 text-red-800",
};

export default function Inventory() {
  const [assets, setAssets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [deptFilter, setDeptFilter] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [showModal, setShowModal] = useState(false);
  const [editAsset, setEditAsset] = useState(null);
  const [form, setForm] = useState({ ...initialForm });
  const [formErrors, setFormErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [categoryOptions, setCategoryOptions] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [showAssign, setShowAssign] = useState(null);
  const [assignEmployeeId, setAssignEmployeeId] = useState("");
  const [assigning, setAssigning] = useState(false);

  const fetchData = async (params = {}) => {
    setLoading(true);
    setError(null);
    try {
      const data = await getAssets(params);
      setAssets(data?.items || (Array.isArray(data) ? data : []));
    } catch (err) {
      setError(err.message || "Failed to load inventory");
      setAssets([]);
    } finally {
      setLoading(false);
    }
  };

  const fetchLookups = async () => {
    try {
      const [catData, empData] = await Promise.all([
        getAssetCategories(),
        getHrEmployees({ per_page: 200 }),
      ]);
      const cats = Array.isArray(catData) ? catData : catData?.items || catData?.data || [];
      setCategoryOptions(cats.map((c) => c.name));
      const empList = empData?.items || (Array.isArray(empData) ? empData : []);
      setEmployees(empList);
    } catch {
      // silent
    }
  };

  useEffect(() => { fetchData(); fetchLookups(); }, []);

  const departments = useMemo(() => {
    const depts = new Set(assets.map((a) => a.department || a.department_name).filter(Boolean));
    return [...depts].sort();
  }, [assets]);

  const filtered = useMemo(() => {
    let result = assets;
    if (search) {
      const q = search.toLowerCase();
      result = result.filter((a) =>
        (a.name || a.itemName || "").toLowerCase().includes(q) ||
        (a.assetTag || a.asset_tag || "").toLowerCase().includes(q) ||
        (a.serialNumber || a.serial_number || "").toLowerCase().includes(q)
      );
    }
    if (categoryFilter) result = result.filter((a) => (a.category || "") === categoryFilter);
    if (statusFilter) result = result.filter((a) => (a.status || "") === statusFilter);
    if (deptFilter) result = result.filter((a) => (a.department || a.department_name || "") === deptFilter);
    return result;
  }, [assets, search, categoryFilter, statusFilter, deptFilter]);

  const paginated = useMemo(() => {
    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    return filtered.slice(start, start + ITEMS_PER_PAGE);
  }, [filtered, currentPage]);

  const openCreate = () => { setEditAsset(null); setForm({ ...initialForm }); setFormErrors({}); setShowModal(true); };

  const openEdit = (asset) => {
    setEditAsset(asset);
    setForm({
      name: asset.name || asset.itemName || "", assetTag: asset.assetTag || asset.asset_tag || "",
      category: asset.category || "", serialNumber: asset.serialNumber || asset.serial_number || "",
      employeeName: asset.employeeName || "", department: asset.department || asset.department_name || "",
      assignedDate: asset.assignedDate || asset.assigned_date || "", status: asset.status || "available",
      condition: asset.condition || "new", purchaseDate: asset.purchaseDate || "",
      purchasePrice: (asset.purchasePrice || asset.purchase_price || "").toString(), notes: asset.notes || "",
    });
    setFormErrors({});
    setShowModal(true);
  };

  const validate = (d) => {
    const e = {};
    if (!d.name?.trim()) e.name = "Name is required";
    if (!d.assetTag?.trim()) e.assetTag = "Asset tag is required";
    return e;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const errors = validate(form);
    setFormErrors(errors);
    if (Object.keys(errors).length > 0) return;
    setSubmitting(true);
    try {
      const payload = {
        name: form.name.trim(), asset_tag: form.assetTag.trim(),
        category: form.category || null, serial_number: form.serialNumber || null,
        employee_id: null, department: form.department || null,
        assigned_date: form.assignedDate || null, status: form.status, condition: form.condition,
        purchase_date: form.purchaseDate || null, purchase_cost: form.purchasePrice ? Number(form.purchasePrice) : null,
        notes: form.notes || null,
      };
      if (editAsset) {
        await updateAsset(editAsset.id, payload);
      } else {
        await createAsset(payload);
      }
      setShowModal(false);
      await fetchData();
    } catch (err) {
      setFormErrors({ submit: err.message || "Failed to save asset" });
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Are you sure you want to delete this asset?")) return;
    try {
      await deleteAsset(id);
      await fetchData();
    } catch (err) {
      setError(err.message || "Failed to delete asset");
    }
  };

  if (loading && assets.length === 0) {
    return (
      <div className="p-6">
        <div className="flex justify-center items-center py-20">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          <span className="ml-3 text-gray-500">Loading inventory...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {error && (
        <div className="mb-4 px-4 py-3 bg-red-50 border border-red-200 text-red-700 rounded-lg flex justify-between items-center">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="text-red-500 hover:text-red-700 font-bold">&times;</button>
        </div>
      )}

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Inventory</h1>
          <p className="text-sm text-gray-500 mt-1">Complete inventory of all company assets</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={async () => { try { await exportAssetsCsv(); } catch (err) { setError(err.message); } }}
            className="flex items-center gap-1 px-3 py-2 border border-gray-200 text-gray-600 rounded-lg hover:bg-gray-50 text-sm font-medium transition-colors" title="Export CSV">
            CSV
          </button>
          <button onClick={async () => { try { await exportAssetsExcel(); } catch (err) { setError(err.message); } }}
            className="flex items-center gap-1 px-3 py-2 border border-gray-200 text-gray-600 rounded-lg hover:bg-gray-50 text-sm font-medium transition-colors" title="Export Excel">
            Excel
          </button>
          <button onClick={openCreate} className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium transition-colors">
            + Add Asset
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <input type="text" placeholder="Search by name, tag, or serial..." value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-3 pr-4 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500" />
        </div>
        <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}
          className="px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500">
          <option value="">All Categories</option>
          {categoryOptions.map((v) => (<option key={v} value={v}>{v}</option>))}
        </select>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}
          className="px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500">
          <option value="">All Statuses</option>
          {STATUS_OPTIONS.map((v) => (<option key={v} value={v}>{v.replace(/_/g, " ")}</option>))}
        </select>
        <select value={deptFilter} onChange={(e) => setDeptFilter(e.target.value)}
          className="px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500">
          <option value="">All Departments</option>
          {departments.map((d) => (<option key={d} value={d}>{d}</option>))}
        </select>
      </div>

      {filtered.length === 0 && !loading ? (
        <div className="text-center py-16 bg-white rounded-xl border border-gray-200">
          <p className="text-gray-500 font-medium">
            {assets.length === 0 ? "No assets yet. Add your first asset." : "No assets match your filters."}
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Tag</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Name</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Category</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Employee</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Dept</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Condition</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Status</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-100">
                {paginated.map((a) => {
                  const tag = a.assetTag || a.asset_tag || "";
                  const name = a.name || a.itemName || "";
                  const cat = a.category || "";
                  const emp = a.employeeName || "";
                  const dept = a.department || a.department_name || "";
                  const cond = a.condition || "new";
                  const status = a.status || "available";
                  return (
                    <tr key={a.id} className="hover:bg-amber-50/50 transition-colors">
                      <td className="px-4 py-3 text-sm font-mono text-xs font-semibold text-amber-600">{tag}</td>
                      <td className="px-4 py-3 text-sm font-medium text-gray-900">{name}</td>
                      <td className="px-4 py-3"><span className="inline-block bg-amber-50 text-amber-700 text-xs px-2 py-0.5 rounded-full font-medium">{cat}</span></td>
                      <td className="px-4 py-3 text-sm text-gray-700">{emp || <span className="text-gray-300">-</span>}</td>
                      <td className="px-4 py-3 text-sm text-gray-500">{dept || <span className="text-gray-300">-</span>}</td>
                      <td className="px-4 py-3"><span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${CONDITION_COLORS[cond] || "bg-gray-100 text-gray-800"}`}>{cond}</span></td>
                      <td className="px-4 py-3"><span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[status] || "bg-gray-100 text-gray-800"}`}>{status.replace(/_/g, " ")}</span></td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button onClick={() => openEdit(a)} className="p-1.5 text-gray-400 hover:text-amber-600 transition-colors rounded hover:bg-amber-50" title="Edit">&#9998;</button>
                          {a.status === "available" && (
                            <button onClick={() => { setShowAssign(a); setAssignEmployeeId(""); }} className="p-1.5 text-gray-400 hover:text-blue-600 transition-colors rounded hover:bg-blue-50" title="Assign">&#8594;</button>
                          )}
                          {a.status === "assigned" && a.employee_id && (
                            <>
                              <button onClick={() => { setShowAssign(a); setAssignEmployeeId(""); }} className="p-1.5 text-gray-400 hover:text-blue-600 transition-colors rounded hover:bg-blue-50" title="Transfer">&#8644;</button>
                              <button onClick={async () => {
                                if (!window.confirm("Return this asset?")) return;
                                try {
                                  await returnAsset(a.id, { reason: "Manual return" });
                                  await fetchData();
                                } catch (err) {
                                  setError(err.message || "Failed to return asset");
                                }
                              }} className="p-1.5 text-gray-400 hover:text-green-600 transition-colors rounded hover:bg-green-50" title="Unassign">&#8617;</button>
                            </>
                          )}
                          <button onClick={() => handleDelete(a.id)} className="p-1.5 text-gray-400 hover:text-red-600 transition-colors rounded hover:bg-red-50" title="Delete">&#10005;</button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {filtered.length > ITEMS_PER_PAGE && (
        <div className="flex justify-between items-center">
          <span className="text-xs text-gray-400">
            Showing {(currentPage - 1) * ITEMS_PER_PAGE + 1}-{Math.min(currentPage * ITEMS_PER_PAGE, filtered.length)} of {filtered.length}
          </span>
          <div className="flex gap-1">
            <button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage <= 1}
              className="px-3 py-1 text-sm border border-gray-200 rounded-lg disabled:opacity-40 hover:bg-gray-50">Prev</button>
            {Array.from({ length: Math.ceil(filtered.length / ITEMS_PER_PAGE) }, (_, i) => i + 1).map(p => (
              <button key={p} onClick={() => setCurrentPage(p)}
                className={`px-3 py-1 text-sm border rounded-lg ${p === currentPage ? 'bg-blue-600 text-white border-blue-600' : 'border-gray-200 hover:bg-gray-50'}`}>{p}</button>
            ))}
            <button onClick={() => setCurrentPage(p => Math.min(Math.ceil(filtered.length / ITEMS_PER_PAGE), p + 1))}
              disabled={currentPage >= Math.ceil(filtered.length / ITEMS_PER_PAGE)}
              className="px-3 py-1 text-sm border border-gray-200 rounded-lg disabled:opacity-40 hover:bg-gray-50">Next</button>
          </div>
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center px-6 py-4 border-b border-gray-100">
              <h2 className="text-lg font-bold text-gray-800">{editAsset ? "Edit Asset" : "Add Asset"}</h2>
              <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              {formErrors.submit && <div className="text-red-500 text-sm bg-red-50 p-2 rounded">{formErrors.submit}</div>}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Name *</label>
                  <input type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
                    className={`w-full border ${formErrors.name ? "border-red-300" : "border-gray-200"} rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500`} />
                  {formErrors.name && <p className="text-red-500 text-xs mt-1">{formErrors.name}</p>}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Asset Tag *</label>
                  <input type="text" value={form.assetTag} onChange={(e) => setForm({ ...form, assetTag: e.target.value })}
                    className={`w-full border ${formErrors.assetTag ? "border-red-300" : "border-gray-200"} rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500`} />
                  {formErrors.assetTag && <p className="text-red-500 text-xs mt-1">{formErrors.assetTag}</p>}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
                  <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                    <option value="">Select category</option>
                    {categoryOptions.map((v) => (<option key={v} value={v}>{v}</option>))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Serial Number</label>
                  <input type="text" value={form.serialNumber} onChange={(e) => setForm({ ...form, serialNumber: e.target.value })}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Employee Name</label>
                  <input type="text" value={form.employeeName} onChange={(e) => setForm({ ...form, employeeName: e.target.value })}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Department</label>
                  <input type="text" value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
                  <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                    {STATUS_OPTIONS.map((v) => (<option key={v} value={v}>{v.replace(/_/g, " ")}</option>))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Condition</label>
                  <select value={form.condition} onChange={(e) => setForm({ ...form, condition: e.target.value })}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                    {CONDITION_OPTIONS.map((v) => (<option key={v} value={v}>{v}</option>))}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Assigned Date</label>
                  <input type="date" value={form.assignedDate} onChange={(e) => setForm({ ...form, assignedDate: e.target.value })}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Purchase Price ($)</label>
                  <input type="number" value={form.purchasePrice} onChange={(e) => setForm({ ...form, purchasePrice: e.target.value })}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Purchase Date</label>
                <input type="date" value={form.purchaseDate} onChange={(e) => setForm({ ...form, purchaseDate: e.target.value })}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
                <textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={() => setShowModal(false)} className="px-4 py-2 text-sm border border-gray-200 rounded-lg hover:bg-gray-50">Cancel</button>
                <button type="submit" disabled={submitting} className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white rounded-lg font-medium transition-colors">
                  {submitting ? "Saving..." : editAsset ? "Update Asset" : "Create Asset"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showAssign && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4">
            <div className="flex justify-between items-center px-6 py-4 border-b border-gray-100">
              <h2 className="text-lg font-bold text-gray-800">{showAssign.status === "assigned" ? "Transfer Asset" : "Assign Asset"}</h2>
              <button onClick={() => setShowAssign(null)} className="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <p className="text-sm text-gray-600 mb-1">Asset: <span className="font-semibold">{showAssign.name || showAssign.itemName || ""}</span></p>
                <p className="text-sm text-gray-500 mb-3">Tag: <span className="font-mono text-amber-600">{showAssign.assetTag || showAssign.asset_tag || ""}</span></p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Select Employee *</label>
                <select value={assignEmployeeId} onChange={(e) => setAssignEmployeeId(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                  <option value="">-- Select employee --</option>
                  {employees.map((emp) => (
                    <option key={emp.id} value={emp.id}>{emp.first_name} {emp.last_name} ({emp.email})</option>
                  ))}
                </select>
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={() => setShowAssign(null)} className="px-4 py-2 text-sm border border-gray-200 rounded-lg hover:bg-gray-50">Cancel</button>
                <button type="button" disabled={!assignEmployeeId || assigning} onClick={async () => {
                  setAssigning(true);
                  try {
                    if (showAssign.status === "assigned") {
                      await transferAsset(showAssign.id, { employee_id: parseInt(assignEmployeeId) });
                    } else {
                      await assignAsset(showAssign.id, { employee_id: parseInt(assignEmployeeId) });
                    }
                    setShowAssign(null);
                    setAssignEmployeeId("");
                    await fetchData();
                  } catch (err) {
                    setError(err.message || "Failed to assign asset");
                  } finally {
                    setAssigning(false);
                  }
                }} className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white rounded-lg font-medium transition-colors">
                  {assigning ? "Assigning..." : showAssign.status === "assigned" ? "Transfer" : "Assign"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
