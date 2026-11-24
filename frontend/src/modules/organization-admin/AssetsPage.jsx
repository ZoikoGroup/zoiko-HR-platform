import { useState, useEffect, useRef, useCallback } from "react";
import PageHeader from "../../components/PageHeader";
import { employeeName, employeeInitials, employeeEmail } from "../../utils/fieldAccess";
import {
  getAssets, createAsset, getAssetCategories, getAssetDashboard, assignAsset,
} from "../../service/hrService";
import { PAGE_SIZE, Pager, isFutureDate, todayISO, useDebounced, useEmployeeOptions } from "./assetPickers";
import {
  EditAssetDialog, DeleteAssetDialog, ReturnAssetDialog, CategoryManagerDialog,
} from "./AssetActionDialogs";
import {
  Package, Search, Plus, X, Loader2, CheckCircle, AlertCircle, User, ChevronDown,
  Pencil, Trash2, Undo2, Tags,
} from "lucide-react";

const STATUS_COLORS = {
  available: "bg-green-100 text-green-800",
  assigned: "bg-blue-100 text-blue-800",
  maintenance: "bg-orange-100 text-orange-800",
  retired: "bg-gray-100 text-gray-800",
  lost: "bg-red-100 text-red-800",
};

const STATUS_OPTIONS = ["available", "assigned", "maintenance", "retired", "lost"];
// A new asset starts without a holder in one of these states; choosing an employee makes it "assigned" on the server.
const CREATE_STATUS_OPTIONS = ["available", "maintenance", "retired", "lost"];
const CONDITION_OPTIONS = ["new", "good", "fair", "poor", "damaged"];

const initialForm = {
  name: "", assetTag: "", category: "", serialNumber: "",
  status: "available", condition: "new", purchaseDate: "", purchasePrice: "",
  notes: "", employee_id: "",
};

export default function OrgAdminAssetsPage() {
  const [assets, setAssets] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [counts, setCounts] = useState(null);
  const [categories, setCategories] = useState([]);          // names, for the selects
  const [categoryRows, setCategoryRows] = useState([]);      // {id, name, ...}, for the category manager
  const [action, setAction] = useState(null);                // { kind: "edit" | "delete" | "return", asset } | { kind: "categories" }
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [selectedEmployee, setSelectedEmployee] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ ...initialForm });
  const [formErrors, setFormErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const settledSearch = useDebounced(search);
  const employeeId = selectedEmployee?.id;
  const latest = useRef(0);

  // One page at a time from the server; search, status and holder are filtered there, not in the browser.
  const fetchAssets = useCallback(async () => {
    const mine = ++latest.current;             // a slower, older answer never overwrites a newer one
    setLoading(true);
    try {
      const data = await getAssets({
        page,
        per_page: PAGE_SIZE,
        search: settledSearch.trim() || undefined,
        status: statusFilter || undefined,
        employee_id: employeeId || undefined,
      });
      if (mine !== latest.current) return;
      setAssets(data?.items || []);
      setTotal(data?.total ?? 0);
    } catch (err) {
      if (mine !== latest.current) return;
      setError(`Assets: ${err.message || "failed to load"}`);
      setAssets([]);
      setTotal(0);
    } finally {
      if (mine === latest.current) setLoading(false);
    }
  }, [page, settledSearch, statusFilter, employeeId]);

  // The cards count every asset in the organization (the asset dashboard), not the rows on this page.
  const fetchCounts = useCallback(async () => {
    try {
      setCounts(await getAssetDashboard());
    } catch {
      setCounts(null);
    }
  }, []);

  useEffect(() => { fetchAssets(); }, [fetchAssets]);
  useEffect(() => { fetchCounts(); }, [fetchCounts]);
  const loadCategories = useCallback(async () => {
    try {
      const catData = await getAssetCategories();
      const cats = Array.isArray(catData) ? catData : catData?.items || catData?.data || [];
      setCategoryRows(cats);
      setCategories(cats.map((c) => c.name));
    } catch (e) {
      setError(`Categories: ${e.message}`);
    }
  }, []);
  useEffect(() => { loadCategories(); }, [loadCategories]);
  useEffect(() => { setPage(1); }, [settledSearch, statusFilter, employeeId]);

  const refresh = async () => { await Promise.all([fetchAssets(), fetchCounts()]); };

  const openCreate = () => {
    setForm({ ...initialForm });
    setFormErrors({});
    setShowModal(true);
  };

  const validate = (d) => {
    const e = {};
    if (!d.name?.trim()) e.name = "Name is required";
    if (!d.assetTag?.trim()) e.assetTag = "Asset tag is required";
    if (isFutureDate(d.purchaseDate)) e.purchaseDate = "Purchase date cannot be in the future";
    return e;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const errors = validate(form);
    setFormErrors(errors);
    if (Object.keys(errors).length > 0) return;
    setSubmitting(true);
    try {
      // One call: with an employee the server creates the asset already assigned to them, or creates nothing at all.
      const payload = {
        name: form.name.trim(),
        asset_tag: form.assetTag.trim(),
        category: form.category || null,
        serial_number: form.serialNumber || null,
        status: form.employee_id ? "assigned" : form.status,
        condition: form.condition,
        purchase_date: form.purchaseDate || null,
        purchase_cost: form.purchasePrice ? Number(form.purchasePrice) : null,
        notes: form.notes || null,
        employee_id: form.employee_id ? parseInt(form.employee_id, 10) : null,
      };
      await createAsset(payload);
      setShowModal(false);
      await refresh();
    } catch (err) {
      setFormErrors({ submit: err.message || "Failed to save asset" });
    } finally {
      setSubmitting(false);
    }
  };

  // Resolves to null on success, or the server's message (shown inside the Assign dropdown).
  const handleAssign = async (assetId, employeeId) => {
    try {
      await assignAsset(assetId, { employee_id: parseInt(employeeId, 10) });
    } catch (err) {
      return err.message || "Failed to assign asset";
    }
    await refresh();
    return null;
  };

  const closeAction = () => setAction(null);
  const afterAction = async () => { setAction(null); await refresh(); };

  const filtering = Boolean(settledSearch.trim() || statusFilter || employeeId);
  const cardValue = (v) => (v === undefined || v === null ? "..." : v);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Assets"
        description="Manage your organization's assets and assign them to employees"
      />

      {error && (
        <div className="rounded-2xl border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/30 p-4 text-sm text-red-700 dark:text-red-300 flex items-center justify-between">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="text-red-500 hover:text-red-700 font-bold">&times;</button>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-2xl border border-slate-200 dark:border-[#334155] bg-white dark:bg-[#1e293b] p-5 shadow-sm">
          <p className="text-xs text-slate-400 font-semibold uppercase tracking-wide">Total Assets</p>
          <p className="mt-1 text-2xl font-extrabold text-slate-800 dark:text-slate-100" data-testid="count-total">{cardValue(counts?.total_assets)}</p>
        </div>
        <div className="rounded-2xl border border-slate-200 dark:border-[#334155] bg-white dark:bg-[#1e293b] p-5 shadow-sm">
          <p className="text-xs text-slate-400 font-semibold uppercase tracking-wide">Assigned</p>
          <p className="mt-1 text-2xl font-extrabold text-blue-600" data-testid="count-assigned">{cardValue(counts?.assigned_count)}</p>
        </div>
        <div className="rounded-2xl border border-slate-200 dark:border-[#334155] bg-white dark:bg-[#1e293b] p-5 shadow-sm">
          <p className="text-xs text-slate-400 font-semibold uppercase tracking-wide">Available</p>
          <p className="mt-1 text-2xl font-extrabold text-green-600" data-testid="count-available">{cardValue(counts?.available_count)}</p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-xs">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text" placeholder="Search by name, tag, serial..."
            value={search} onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 border border-slate-200 dark:border-[#334155] rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-300 focus:border-blue-400"
          />
        </div>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} aria-label="Filter by status"
          className="px-3 py-2 border border-slate-200 dark:border-[#334155] rounded-xl text-sm bg-white dark:bg-[#1e293b] focus:outline-none focus:ring-2 focus:ring-blue-300 focus:border-blue-400">
          <option value="">All statuses</option>
          {STATUS_OPTIONS.map((v) => (<option key={v} value={v}>{v.charAt(0).toUpperCase() + v.slice(1)}</option>))}
        </select>
        <EmployeeFilter value={selectedEmployee} onChange={setSelectedEmployee} />
        {selectedEmployee && (
          <button onClick={() => setSelectedEmployee(null)}
            className="text-xs text-slate-400 hover:text-red-500 font-medium transition">
            Clear filter
          </button>
        )}
        <div className="sm:ml-auto flex flex-wrap items-center gap-2">
          <button onClick={() => setAction({ kind: "categories" })}
            className="flex items-center gap-2 px-4 py-2 border border-slate-200 dark:border-[#334155] bg-white dark:bg-[#1e293b] hover:bg-slate-50 dark:hover:bg-slate-700/40 text-slate-700 dark:text-slate-200 rounded-xl text-sm font-semibold transition">
            <Tags size={16} /> Categories
          </button>
          <button onClick={openCreate}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-semibold transition shadow-sm">
            <Plus size={16} /> Add Asset
          </button>
        </div>
      </div>

      {loading && assets.length === 0 ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-6 h-6 text-blue-500 animate-spin" />
          <span className="ml-3 text-sm text-slate-500 dark:text-slate-400 font-medium">Loading assets...</span>
        </div>
      ) : assets.length === 0 ? (
        <div className="text-center py-20 bg-white dark:bg-[#1e293b] rounded-2xl border border-slate-100 dark:border-[#334155] shadow-sm">
          <Package className="mx-auto h-10 w-10 text-slate-300" />
          <p className="mt-3 text-sm font-medium text-slate-500 dark:text-slate-400">
            {filtering ? "No assets match your search." : "No assets yet. Add your first asset."}
          </p>
        </div>
      ) : (
        <div className="bg-white dark:bg-[#1e293b] rounded-2xl border border-slate-100 dark:border-[#334155] shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-100 dark:divide-[#334155]">
              <thead>
                <tr className="border-b border-slate-100 dark:border-[#334155]">
                  <th className="px-5 py-3.5 text-left text-xs font-bold text-slate-400 uppercase tracking-widest">Asset</th>
                  <th className="px-5 py-3.5 text-left text-xs font-bold text-slate-400 uppercase tracking-widest">Tag</th>
                  <th className="px-5 py-3.5 text-left text-xs font-bold text-slate-400 uppercase tracking-widest">Category</th>
                  <th className="px-5 py-3.5 text-left text-xs font-bold text-slate-400 uppercase tracking-widest">Assigned To</th>
                  <th className="px-5 py-3.5 text-left text-xs font-bold text-slate-400 uppercase tracking-widest">Status</th>
                  <th className="px-5 py-3.5 text-right text-xs font-bold text-slate-400 uppercase tracking-widest">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50 dark:divide-[#334155]">
                {assets.map((a) => {
                  const status = a.status || "available";
                  const empName = a.employeeName || a.employee_name || "";
                  return (
                    <tr key={a.id} className="hover:bg-slate-50/60 dark:hover:bg-slate-700/30 transition">
                      <td className="px-5 py-3.5">
                        <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">{a.name || a.itemName || "-"}</p>
                        {a.serialNumber || a.serial_number ? (
                          <p className="text-xs text-slate-400 font-mono mt-0.5">{a.serialNumber || a.serial_number}</p>
                        ) : null}
                      </td>
                      <td className="px-5 py-3.5 text-sm font-mono text-amber-600">{a.assetTag || a.asset_tag || "-"}</td>
                      <td className="px-5 py-3.5 text-sm text-slate-500 dark:text-slate-400">{a.category || "-"}</td>
                      <td className="px-5 py-3.5 text-sm text-slate-600 dark:text-slate-300">
                        {empName ? (
                          <span className="inline-flex items-center gap-1.5">
                            <User size={12} className="text-slate-400" />
                            {empName}
                          </span>
                        ) : (
                          <span className="text-slate-300">—</span>
                        )}
                      </td>
                      <td className="px-5 py-3.5">
                        <span className={`inline-block px-2.5 py-1 rounded-full text-xs font-semibold ${STATUS_COLORS[status] || "bg-gray-100 text-gray-800"}`}>
                          {status.charAt(0).toUpperCase() + status.slice(1).replace(/_/g, " ")}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 text-right">
                        <div className="flex items-center justify-end gap-1">
                          {status === "available" && (
                            <AssignDropdown asset={a} onAssign={handleAssign} />
                          )}
                          {/* QA bug 20: no Transfer. An assigned asset is returned to the organization first, then assigned again. */}
                          {status === "assigned" && (
                            <IconButton label={`Return ${a.asset_tag}`} title="Return to the organization" onClick={() => setAction({ kind: "return", asset: a })}
                              className="text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-900/30"><Undo2 size={14} /></IconButton>
                          )}
                          <IconButton label={`Edit ${a.asset_tag}`} title="Edit" onClick={() => setAction({ kind: "edit", asset: a })}
                            className="text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700"><Pencil size={14} /></IconButton>
                          <IconButton label={`Delete ${a.asset_tag}`} title="Delete" onClick={() => setAction({ kind: "delete", asset: a })}
                            className="text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30"><Trash2 size={14} /></IconButton>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <Pager page={page} total={total} onPage={setPage} label="assets" />
        </div>
      )}

      {action?.kind === "edit" && (
        <EditAssetDialog asset={action.asset} categories={categories} onClose={closeAction} onSaved={afterAction} />
      )}
      {action?.kind === "delete" && (
        <DeleteAssetDialog asset={action.asset} onClose={closeAction} onDeleted={afterAction} />
      )}
      {action?.kind === "return" && (
        <ReturnAssetDialog asset={action.asset} onClose={closeAction} onReturned={afterAction} />
      )}
      {action?.kind === "categories" && (
        <CategoryManagerDialog categories={categoryRows} onClose={closeAction}
          onChanged={async () => { await loadCategories(); await fetchAssets(); }} />
      )}

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-[#1e293b] rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-[#334155]">
              <div>
                <h2 className="text-lg font-bold text-slate-800 dark:text-slate-100">Add Asset</h2>
                <p className="text-xs text-slate-400 mt-0.5">Create and optionally assign to an employee</p>
              </div>
              <button onClick={() => setShowModal(false)} className="p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-400 transition">
                <X size={18} />
              </button>
            </div>
            <form onSubmit={handleSubmit} noValidate className="p-6 space-y-4">
              {formErrors.submit && (
                <div className="flex items-center gap-2 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-xl px-4 py-3 text-red-700 dark:text-red-300 text-sm font-semibold">
                  <AlertCircle size={14} /> {formErrors.submit}
                </div>
              )}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide block mb-1.5">Name *</label>
                  <input type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
                    className={`w-full border rounded-xl px-3 py-2.5 text-sm text-slate-800 dark:text-slate-100 bg-slate-50 dark:bg-[#0f172a] outline-none focus:ring-2 focus:ring-blue-300 focus:border-blue-400 focus:bg-white dark:focus:bg-[#0f172a] transition ${formErrors.name ? "border-red-300" : "border-slate-200 dark:border-[#334155]"}`} />
                  {formErrors.name && <p className="text-xs text-red-500 mt-1">{formErrors.name}</p>}
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide block mb-1.5">Asset Tag *</label>
                  <input type="text" value={form.assetTag} onChange={(e) => setForm({ ...form, assetTag: e.target.value })}
                    className={`w-full border rounded-xl px-3 py-2.5 text-sm text-slate-800 dark:text-slate-100 bg-slate-50 dark:bg-[#0f172a] outline-none focus:ring-2 focus:ring-blue-300 focus:border-blue-400 focus:bg-white dark:focus:bg-[#0f172a] transition ${formErrors.assetTag ? "border-red-300" : "border-slate-200 dark:border-[#334155]"}`} />
                  {formErrors.assetTag && <p className="text-xs text-red-500 mt-1">{formErrors.assetTag}</p>}
                </div>
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide block mb-1.5">Category</label>
                  <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}
                    className="w-full border border-slate-200 dark:border-[#334155] rounded-xl px-3 py-2.5 text-sm text-slate-800 dark:text-slate-100 bg-slate-50 dark:bg-[#0f172a] outline-none focus:ring-2 focus:ring-blue-300 focus:border-blue-400 focus:bg-white dark:focus:bg-[#0f172a] transition">
                    <option value="">Select category</option>
                    {categories.map((v) => (<option key={v} value={v}>{v}</option>))}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide block mb-1.5">Serial Number</label>
                  <input type="text" value={form.serialNumber} onChange={(e) => setForm({ ...form, serialNumber: e.target.value })}
                    className="w-full border border-slate-200 dark:border-[#334155] rounded-xl px-3 py-2.5 text-sm text-slate-800 dark:text-slate-100 bg-slate-50 dark:bg-[#0f172a] outline-none focus:ring-2 focus:ring-blue-300 focus:border-blue-400 focus:bg-white dark:focus:bg-[#0f172a] transition" />
                </div>
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide block mb-1.5">Assign to Employee</label>
                <EmployeeSelectModal value={form.employee_id} onChange={(v) => setForm({ ...form, employee_id: v })} />
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide block mb-1.5">Status</label>
                  {form.employee_id ? (
                    <p className="w-full border border-slate-200 dark:border-[#334155] rounded-xl px-3 py-2.5 text-sm text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-900/30">
                      assigned (to the chosen employee)
                    </p>
                  ) : (
                    <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}
                      className="w-full border border-slate-200 dark:border-[#334155] rounded-xl px-3 py-2.5 text-sm text-slate-800 dark:text-slate-100 bg-slate-50 dark:bg-[#0f172a] outline-none focus:ring-2 focus:ring-blue-300 focus:border-blue-400 focus:bg-white dark:focus:bg-[#0f172a] transition">
                      {CREATE_STATUS_OPTIONS.map((v) => (<option key={v} value={v}>{v.replace(/_/g, " ")}</option>))}
                    </select>
                  )}
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide block mb-1.5">Condition</label>
                  <select value={form.condition} onChange={(e) => setForm({ ...form, condition: e.target.value })}
                    className="w-full border border-slate-200 dark:border-[#334155] rounded-xl px-3 py-2.5 text-sm text-slate-800 dark:text-slate-100 bg-slate-50 dark:bg-[#0f172a] outline-none focus:ring-2 focus:ring-blue-300 focus:border-blue-400 focus:bg-white dark:focus:bg-[#0f172a] transition">
                    {CONDITION_OPTIONS.map((v) => (<option key={v} value={v}>{v}</option>))}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide block mb-1.5">Purchase Price ($)</label>
                  <input type="number" value={form.purchasePrice} onChange={(e) => setForm({ ...form, purchasePrice: e.target.value })}
                    className="w-full border border-slate-200 dark:border-[#334155] rounded-xl px-3 py-2.5 text-sm text-slate-800 dark:text-slate-100 bg-slate-50 dark:bg-[#0f172a] outline-none focus:ring-2 focus:ring-blue-300 focus:border-blue-400 focus:bg-white dark:focus:bg-[#0f172a] transition" />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide block mb-1.5">Purchase Date</label>
                  <input type="date" max={todayISO()} aria-label="Purchase Date" value={form.purchaseDate} onChange={(e) => setForm({ ...form, purchaseDate: e.target.value })}
                    className="w-full border border-slate-200 dark:border-[#334155] rounded-xl px-3 py-2.5 text-sm text-slate-800 dark:text-slate-100 bg-slate-50 dark:bg-[#0f172a] outline-none focus:ring-2 focus:ring-blue-300 focus:border-blue-400 focus:bg-white dark:focus:bg-[#0f172a] transition" />
                  {formErrors.purchaseDate && <p className="text-xs text-red-500 mt-1">{formErrors.purchaseDate}</p>}
                </div>
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide block mb-1.5">Notes</label>
                <textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  className="w-full border border-slate-200 dark:border-[#334155] rounded-xl px-3 py-2.5 text-sm text-slate-800 dark:text-slate-100 bg-slate-50 dark:bg-[#0f172a] outline-none focus:ring-2 focus:ring-blue-300 focus:border-blue-400 focus:bg-white dark:focus:bg-[#0f172a] transition resize-none" />
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={() => setShowModal(false)}
                  className="px-4 py-2.5 rounded-xl border border-slate-200 dark:border-[#334155] text-sm font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700/40 transition">
                  Cancel
                </button>
                <button type="submit" disabled={submitting}
                  className="px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white text-sm font-semibold transition shadow-sm flex items-center gap-2">
                  {submitting ? <><Loader2 size={14} className="animate-spin" /> Saving...</> : "Create Asset"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function IconButton({ label, title, onClick, className = "", children }) {
  return (
    <button type="button" aria-label={label} title={title} onClick={onClick}
      className={`p-1.5 rounded-lg transition ${className}`}>
      {children}
    </button>
  );
}

function EmployeeOption({ emp, selected = false }) {
  return (
    <>
      <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${
        selected ? "bg-blue-200 text-blue-700 dark:text-blue-300" : "bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400"
      }`}>
        {employeeInitials(emp)}
      </div>
      <div className="min-w-0 flex-1">
        <p className="font-medium truncate">{employeeName(emp)}</p>
        {employeeEmail(emp) && <p className="text-xs text-slate-400 truncate">{employeeEmail(emp)}</p>}
      </div>
      {selected && <CheckCircle size={14} className="text-blue-500 flex-shrink-0" />}
    </>
  );
}

function useOutsideClose(ref, close) {
  useEffect(() => {
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) close();
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [ref, close]);
}

// Filter the list by holder: anyone in the organization (someone who has left may still hold assets), searched on the server.
function EmployeeFilter({ value, onChange }) {
  const [input, setInput] = useState("");
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const close = useCallback(() => setOpen(false), []);
  useOutsideClose(ref, close);
  const { items: suggestions } = useEmployeeOptions(input, {
    enabled: open && !value && Boolean(input.trim()), includeInactive: true,
  });

  return (
    <div ref={ref} className="relative w-full sm:w-64">
      {value ? (
        <div className="flex items-center gap-2 border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/30 rounded-xl px-3 py-2 text-sm text-blue-700 dark:text-blue-300 font-medium">
          <User size={14} />
          <span className="flex-1 truncate">{employeeName(value)}</span>
          <button onClick={() => { onChange(null); setInput(""); }} aria-label="Clear employee filter"
            className="text-blue-400 hover:text-blue-600 transition">
            <X size={14} />
          </button>
        </div>
      ) : (
        <>
          <input
            type="text" placeholder="Filter by employee..."
            value={input}
            onChange={(e) => { setInput(e.target.value); setOpen(true); }}
            onFocus={() => setOpen(true)}
            className="w-full pl-3 pr-8 py-2 border border-slate-200 dark:border-[#334155] rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-300 focus:border-blue-400"
          />
          <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
        </>
      )}
      {open && !value && input.trim() && suggestions.length > 0 && (
        <div className="absolute top-full mt-1 left-0 right-0 z-50 bg-white dark:bg-[#1e293b] rounded-xl border border-slate-200 dark:border-[#334155] shadow-lg max-h-60 overflow-y-auto p-1">
          {suggestions.map((emp) => (
            <button key={emp.id} type="button"
              onClick={() => { onChange(emp); setInput(""); setOpen(false); }}
              className="w-full text-left px-2 py-2 rounded-lg text-sm flex items-center gap-2.5 hover:bg-blue-50 dark:hover:bg-blue-900/30 text-slate-700 dark:text-slate-200">
              <EmployeeOption emp={emp} />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// Who a new asset goes to: active staff only, searched on the server and ordered by name.
function EmployeeSelectModal({ value, onChange }) {
  const [input, setInput] = useState("");
  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState(null);
  const ref = useRef(null);
  const close = useCallback(() => setOpen(false), []);
  useOutsideClose(ref, close);
  const { items: suggestions, loading } = useEmployeeOptions(input, { enabled: open, limit: 8 });
  const selectedEmp = value && picked && String(picked.id) === String(value) ? picked : null;

  return (
    <div ref={ref} className="relative">
      <button type="button" onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-2 border border-slate-200 dark:border-[#334155] rounded-xl px-3 py-2.5 text-sm bg-slate-50 dark:bg-[#0f172a] hover:bg-white dark:hover:bg-[#1e293b] transition text-left">
        {selectedEmp ? (
          <span className="flex-1 text-slate-800 dark:text-slate-100 font-medium">{employeeName(selectedEmp)}</span>
        ) : (
          <span className="flex-1 text-slate-400">— Keep available —</span>
        )}
        <ChevronDown size={14} className="text-slate-400 flex-shrink-0" />
      </button>
      {open && (
        <div className="absolute top-full mt-1 left-0 right-0 z-50 bg-white dark:bg-[#1e293b] rounded-xl border border-slate-200 dark:border-[#334155] shadow-lg p-2">
          <div className="relative mb-1">
            <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text" placeholder="Search employee..."
              value={input} onChange={(e) => setInput(e.target.value)}
              autoFocus
              className="w-full pl-8 pr-3 py-1.5 border border-slate-200 dark:border-[#334155] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
            />
          </div>
          <div className="max-h-48 overflow-y-auto">
            <button type="button" onClick={() => { onChange(""); setPicked(null); setOpen(false); setInput(""); }}
              className={`w-full text-left px-2 py-2 rounded-lg text-sm transition ${!value ? "bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 font-medium" : "hover:bg-slate-50 dark:hover:bg-slate-700/40 text-slate-500 dark:text-slate-400"}`}>
              — Keep available —
            </button>
            {!loading && suggestions.length === 0 && (
              <p className="text-xs text-slate-400 text-center py-3">No active employees match</p>
            )}
            {suggestions.map((emp) => {
              const isSelected = String(emp.id) === String(value);
              return (
                <button key={emp.id} type="button"
                  onClick={() => { onChange(String(emp.id)); setPicked(emp); setOpen(false); setInput(""); }}
                  className={`w-full text-left px-2 py-2 rounded-lg text-sm flex items-center gap-2.5 transition ${
                    isSelected ? "bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300" : "hover:bg-slate-50 dark:hover:bg-slate-700/40 text-slate-700 dark:text-slate-200"
                  }`}>
                  <EmployeeOption emp={emp} selected={isSelected} />
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function AssignDropdown({ asset, onAssign }) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState("");
  const [assignInput, setAssignInput] = useState("");
  const [saving, setSaving] = useState(false);
  const [assignError, setAssignError] = useState(null);
  const ref = useRef(null);
  const close = useCallback(() => setOpen(false), []);
  useOutsideClose(ref, close);
  const { items: filteredEmp, loading } = useEmployeeOptions(assignInput, { enabled: open });

  return (
    <div ref={ref} className="relative inline-block text-left">
      <button onClick={() => { setOpen(!open); setAssignInput(""); setSelected(""); setAssignError(null); }}
        className="px-3 py-1.5 text-xs font-semibold text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded-lg transition">
        Assign
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 z-50 w-72 max-w-[calc(100vw-2rem)] bg-white dark:bg-[#1e293b] rounded-xl border border-slate-200 dark:border-[#334155] shadow-lg p-3">
          <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-2">Search Employee</p>
          <div className="relative mb-2">
            <input
              type="text" placeholder="Type name or email..."
              value={assignInput}
              onChange={(e) => setAssignInput(e.target.value)}
              autoFocus
              className="w-full pl-3 pr-8 py-1.5 border border-slate-200 dark:border-[#334155] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-300 focus:border-blue-400"
            />
            <Search size={12} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
          </div>
          <div className="max-h-48 overflow-y-auto -mx-1">
            {loading && filteredEmp.length === 0 ? (
              <p className="text-xs text-slate-400 text-center py-3">Searching...</p>
            ) : filteredEmp.length === 0 ? (
              <p className="text-xs text-slate-400 text-center py-3">No active employees match</p>
            ) : (
              filteredEmp.map((emp) => {
                const isSelected = String(emp.id) === selected;
                return (
                  <button key={emp.id} type="button" onClick={() => setSelected(String(emp.id))}
                    className={`w-full text-left px-2 py-2 rounded-lg text-sm flex items-center gap-2.5 transition ${
                      isSelected ? "bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300" : "hover:bg-slate-50 dark:hover:bg-slate-700/40 text-slate-700 dark:text-slate-200"
                    }`}>
                    <EmployeeOption emp={emp} selected={isSelected} />
                  </button>
                );
              })
            )}
          </div>
          {assignError && <p role="alert" className="text-xs text-red-600 mt-2">{assignError}</p>}
          <div className="flex gap-2 mt-2 pt-2 border-t border-slate-100 dark:border-[#334155]">
            <button onClick={() => setOpen(false)} disabled={saving}
              className="flex-1 px-2 py-1.5 text-xs border border-slate-200 dark:border-[#334155] rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700/40 font-medium">Cancel</button>
            <button disabled={!selected || saving} onClick={async () => {
              setSaving(true);
              setAssignError(null);
              const problem = await onAssign(asset.id, selected);
              setSaving(false);
              if (problem) setAssignError(problem);
              else setOpen(false);
            }}
              className="flex-1 px-2 py-1.5 text-xs bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white rounded-lg font-medium">
              {saving ? "Assigning..." : "Assign"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
