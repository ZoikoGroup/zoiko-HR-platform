import { useState, useEffect, useMemo } from "react";
import HRPage from "../../../components/HRPage";
import {
  getAllowances,
  createAllowance,
  updateAllowance,
  deleteAllowance,
  getHrEmployees,
} from "../../../service/hrService";
import { formatDate } from "../../../utils/dateTime";
import {
  EMPTY_ALLOWANCE, employeeName, allowanceToForm, validateAllowanceForm, allowancePayload, serverAllowanceErrors, employeeRefusal,
} from "../../../utils/allowanceForm";

const ITEMS_PER_PAGE = 8;
const inputBase = "w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500";

// One form for adding and editing, so both ask for (and check) exactly the same things.
function AllowanceForm({ title, form, setForm, errors, setErrors, employees, employeesReady, submitting, submitLabel, busyLabel, onSubmit, onCancel }) {
  const set = (key) => (e) => {
    setForm((prev) => ({ ...prev, [key]: e.target.value }));
    setErrors((prev) => (prev[key] || prev.submit ? { ...prev, [key]: undefined, submit: undefined } : prev));
  };
  const box = (name) => `${inputBase} ${errors[name] ? "border-red-300" : "border-gray-200"}`;
  const err = (name) => (errors[name] ? <p role="alert" className="text-red-500 text-xs mt-1">{errors[name]}</p> : null);
  const star = <span className="text-red-500"> *</span>;
  const noEmployees = employeesReady && employees.length === 0;
  // an employee already on the allowance stays selectable even if the list did not include them
  const options = !form.employee_id || employees.some((e) => String(e.id) === String(form.employee_id))
    ? employees
    : [{ id: form.employee_id, name: `Employee #${form.employee_id}` }, ...employees];
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center px-6 py-4 border-b border-gray-100">
          <h2 className="text-lg font-bold text-gray-800">{title}</h2>
          <button type="button" aria-label="Close" onClick={onCancel} className="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
        </div>
        <form noValidate onSubmit={onSubmit} className="p-6 space-y-4">
          {errors.submit && <div role="alert" className="px-3 py-2 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg">{errors.submit}</div>}
          <div>
            <label htmlFor="al-employee" className="block text-sm font-medium text-gray-700 mb-1">Employee{star}</label>
            <select id="al-employee" value={form.employee_id} disabled={noEmployees} aria-invalid={!!errors.employee_id} onChange={set("employee_id")} className={box("employee_id")}>
              <option value="">{noEmployees ? "No employees yet" : "Select employee..."}</option>
              {options.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
            </select>
            {noEmployees && <p role="alert" className="text-amber-700 text-xs mt-1">There are no employees in this organization yet. Add an employee first, then you can give them an allowance.</p>}
            {err("employee_id")}
          </div>
          <div>
            <label htmlFor="al-type" className="block text-sm font-medium text-gray-700 mb-1">Allowance Type{star}</label>
            <input id="al-type" type="text" value={form.allowance_type} maxLength={100} aria-invalid={!!errors.allowance_type} placeholder="e.g. Housing, Travel" onChange={set("allowance_type")} className={box("allowance_type")} />
            {err("allowance_type")}
          </div>
          <div>
            <label htmlFor="al-amount" className="block text-sm font-medium text-gray-700 mb-1">Amount{star}</label>
            <input id="al-amount" type="number" min="0.01" step="0.01" value={form.amount} aria-invalid={!!errors.amount} placeholder="e.g. 1500" onChange={set("amount")} className={box("amount")} />
            {err("amount")}
          </div>
          <div>
            <label htmlFor="al-date" className="block text-sm font-medium text-gray-700 mb-1">Effective Date{star}</label>
            <input id="al-date" type="date" min="2000-01-01" max="2100-12-31" value={form.effective_date} aria-invalid={!!errors.effective_date} onChange={set("effective_date")} className={box("effective_date")} />
            {err("effective_date")}
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onCancel} className="px-4 py-2 text-sm border border-gray-200 rounded-lg hover:bg-gray-50">Cancel</button>
            <button type="submit" disabled={submitting || noEmployees} className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white rounded-lg font-medium transition-colors">{submitting ? busyLabel : submitLabel}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function ZoikoHRAllowances() {
  const [items, setItems] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [employeesReady, setEmployeesReady] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [showCreate, setShowCreate] = useState(false);
  const [editItem, setEditItem] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [formData, setFormData] = useState({ ...EMPTY_ALLOWANCE });
  const [formErrors, setFormErrors] = useState({});

  const fetchItems = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getAllowances();
      setItems(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err.message || "Failed to load allowances");
      setItems([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchItems();
    getHrEmployees({ per_page: 200, include_all_roles: true })
      .then((res) => {
        const list = Array.isArray(res) ? res : res?.items || res?.data || [];
        setEmployees(list.map((e) => ({ id: e.id, name: employeeName(e) })));
      })
      .catch(() => setEmployees([]))
      .finally(() => setEmployeesReady(true));
  }, []);

  const nameOf = (item) => item.employee_name || employees.find((e) => e.id === item.employee_id)?.name || `Employee #${item.employee_id}`;

  const stats = useMemo(() => {
    const total = items.length;
    const totalAmount = items.reduce((sum, i) => sum + (parseFloat(i.amount) || 0), 0);
    return { total, totalAmount };
  }, [items]);

  const filtered = useMemo(() => {
    if (!search.trim()) return items;
    const q = search.toLowerCase();
    return items.filter((i) => nameOf(i).toLowerCase().includes(q) || (i.allowance_type && i.allowance_type.toLowerCase().includes(q)));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, search, employees]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / ITEMS_PER_PAGE));
  const safePage = Math.min(currentPage, totalPages);
  const paginated = filtered.slice((safePage - 1) * ITEMS_PER_PAGE, safePage * ITEMS_PER_PAGE);

  useEffect(() => {
    if (currentPage > totalPages) setCurrentPage(totalPages);
  }, [totalPages, currentPage]);

  const openCreate = () => { setFormData({ ...EMPTY_ALLOWANCE }); setFormErrors({}); setShowCreate(true); };
  const closeForm = () => { setShowCreate(false); setEditItem(null); setFormErrors({}); };
  const openEdit = (item) => { setEditItem(item); setFormData(allowanceToForm(item)); setFormErrors({}); };

  const save = async (e, existing) => {
    e.preventDefault();
    // a person who is already on the record keeps being valid even if the list could not be loaded
    const ids = employeesReady && employees.length ? employees.map((x) => x.id).concat(existing ? [existing.employee_id] : []) : null;
    const errors = validateAllowanceForm(formData, ids);
    setFormErrors(errors);
    if (Object.keys(errors).length > 0) return;
    setSubmitting(true);
    try {
      const payload = allowancePayload(formData);
      if (existing) await updateAllowance(existing.id, payload);
      else await createAllowance(payload);
      closeForm();
      await fetchItems();
    } catch (err) {
      const fields = serverAllowanceErrors(err?.validation);
      if (Object.keys(fields).length) setFormErrors(fields);
      else if (employeeRefusal(err?.message)) setFormErrors({ employee_id: err.message });
      else setFormErrors({ submit: err.message || (existing ? "The allowance could not be updated." : "The allowance could not be created.") });
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (item) => {
    if (!window.confirm(`Delete the ${item.allowance_type} allowance for ${nameOf(item)}?`)) return;
    try {
      await deleteAllowance(item.id);
      await fetchItems();
    } catch (err) {
      setError(err.message || "Failed to delete allowance");
    }
  };

  if (loading && items.length === 0) {
    return (
      <HRPage title="Allowances" subtitle="Manage employee allowances.">
        <div className="flex justify-center items-center py-20">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          <span className="ml-3 text-gray-500">Loading allowances...</span>
        </div>
      </HRPage>
    );
  }

  return (
    <HRPage title="Allowances" subtitle="Manage employee allowances.">
      {error && (
        <div role="alert" className="mb-4 px-4 py-3 bg-red-50 border border-red-200 text-red-700 rounded-lg flex justify-between items-center">
          <span>{error}</span>
          <button onClick={() => setError(null)} aria-label="Dismiss" className="text-red-500 hover:text-red-700 font-bold">&times;</button>
        </div>
      )}

      <div className="space-y-6">
        <div className="flex flex-wrap justify-between items-center gap-4">
          <div className="flex flex-wrap gap-3">
            <div className="bg-white px-4 py-2 border border-gray-100 rounded-lg shadow-sm text-sm"><span className="text-gray-400">Total: </span><span className="font-bold text-gray-800">{stats.total}</span></div>
            <div className="bg-white px-4 py-2 border border-blue-100 rounded-lg shadow-sm text-sm"><span className="text-gray-400">Total Amount: </span><span className="font-bold text-blue-600">${stats.totalAmount.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span></div>
          </div>
          <button onClick={openCreate} className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors">+ Add Allowance</button>
        </div>

        {items.length > 0 && (
          <input type="text" placeholder="Search by employee or type..." value={search} onChange={(e) => { setSearch(e.target.value); setCurrentPage(1); }}
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm w-64 focus:outline-none focus:ring-2 focus:ring-blue-500" />
        )}

        {filtered.length === 0 && !loading ? (
          <div className="text-center py-16 bg-white rounded-xl border border-gray-100 shadow-sm">
            <div className="text-4xl mb-3">💼</div>
            <p className="text-gray-500 font-medium">{items.length === 0 ? "No allowances yet. Add your first allowance to get started." : "No allowances match your search criteria."}</p>
          </div>
        ) : (
          <>
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b border-gray-100">
                    <tr>
                      {["Employee", "Type", "Amount", "Effective Date"].map((h) => <th key={h} className="text-left px-4 py-3 font-semibold text-gray-600">{h}</th>)}
                      <th className="text-right px-4 py-3 font-semibold text-gray-600">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {paginated.map((item) => (
                      <tr key={item.id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-4 py-3 font-medium text-gray-800">{nameOf(item)}</td>
                        <td className="px-4 py-3 text-gray-700">{item.allowance_type || <span className="text-gray-300">-</span>}</td>
                        <td className="px-4 py-3 text-gray-700">${(parseFloat(item.amount) || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}</td>
                        <td className="px-4 py-3 text-gray-700">{item.effective_date ? formatDate(item.effective_date) : <span className="text-gray-300">-</span>}</td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <button onClick={() => openEdit(item)} className="text-blue-600 hover:text-blue-800 text-xs font-medium px-1">Edit</button>
                            <button onClick={() => handleDelete(item)} className="text-red-500 hover:text-red-700 text-xs font-medium px-1">Delete</button>
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
                <span className="text-xs text-gray-400">Showing {(safePage - 1) * ITEMS_PER_PAGE + 1}-{Math.min(safePage * ITEMS_PER_PAGE, filtered.length)} of {filtered.length}</span>
                <div className="flex gap-1">
                  <button onClick={() => setCurrentPage((p) => Math.max(1, p - 1))} disabled={safePage <= 1} className="px-3 py-1 text-sm border border-gray-200 rounded-lg disabled:opacity-40 hover:bg-gray-50">Prev</button>
                  {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
                    <button key={p} onClick={() => setCurrentPage(p)} className={`px-3 py-1 text-sm border rounded-lg ${p === safePage ? "bg-blue-600 text-white border-blue-600" : "border-gray-200 hover:bg-gray-50"}`}>{p}</button>
                  ))}
                  <button onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))} disabled={safePage >= totalPages} className="px-3 py-1 text-sm border border-gray-200 rounded-lg disabled:opacity-40 hover:bg-gray-50">Next</button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {showCreate && (
        <AllowanceForm title="Add Allowance" form={formData} setForm={setFormData} errors={formErrors} setErrors={setFormErrors} employees={employees} employeesReady={employeesReady}
          submitting={submitting} submitLabel="Create Allowance" busyLabel="Creating..." onSubmit={(e) => save(e, null)} onCancel={closeForm} />
      )}
      {editItem && (
        <AllowanceForm title="Update Allowance" form={formData} setForm={setFormData} errors={formErrors} setErrors={setFormErrors} employees={employees} employeesReady={employeesReady}
          submitting={submitting} submitLabel="Update Allowance" busyLabel="Updating..." onSubmit={(e) => save(e, editItem)} onCancel={closeForm} />
      )}
    </HRPage>
  );
}
