import { useEffect, useState } from "react";
import { api } from "../../../service/api";
import { errorMessage, getFinanceViewers, setFinanceViewers } from "../../../service/onboardingPrompt2Service";

const label = (employee) => employee.full_name
  || [employee.first_name, employee.last_name].filter(Boolean).join(" ")
  || employee.email || `Employee #${employee.id}`;

export default function FinanceViewersSetting() {
  const [open, setOpen] = useState(false);
  const [employees, setEmployees] = useState([]);
  const [selected, setSelected] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const [viewerResult, employeeResult] = await Promise.all([
        getFinanceViewers(),
        api.get("/hr/employee-management/employees", { params: { per_page: 200, include_all_roles: true, status: "active" } }),
      ]);
      const list = Array.isArray(employeeResult?.items) ? employeeResult.items
        : Array.isArray(employeeResult) ? employeeResult : [];
      setEmployees(list);
      setSelected(Array.isArray(viewerResult?.employee_ids) ? viewerResult.employee_ids.map(Number) : []);
    } catch (err) {
      setError(errorMessage(err, "Finance viewer settings could not be loaded."));
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { if (open) load(); }, [open]);

  const toggle = (id) => setSelected((current) => current.includes(Number(id))
    ? current.filter((entry) => entry !== Number(id)) : [...current, Number(id)]);

  const save = async () => {
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const result = await setFinanceViewers(selected);
      setSelected((result?.employee_ids || selected).map(Number));
      setNotice("Finance viewers saved. Only these employees can reveal or verify bank and payroll details.");
    } catch (err) {
      setError(errorMessage(err, "Finance viewer settings could not be saved."));
    } finally {
      setSaving(false);
    }
  };

  return (
    <section aria-label="Finance viewer settings" className="rounded-2xl border border-gray-200/80 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-gray-900">Finance viewers</h2>
          <p className="mt-1 text-sm text-gray-500">Explicitly grant access to reveal and verify onboarding bank and payroll details. Changes are audited.</p>
        </div>
        <button type="button" onClick={() => setOpen((current) => !current)} aria-expanded={open}
          className="inline-flex min-h-9 items-center rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50">
          {open ? "Hide finance viewer settings" : "Manage finance viewers"}
        </button>
      </div>
      {open && (
        <div className="mt-4 space-y-4">
          {error && <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
          {notice && <p role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{notice}</p>}
          {loading ? <p className="text-sm text-gray-500">Loading employees and permissions…</p>
            : employees.length ? (
              <div className="grid max-h-72 grid-cols-1 gap-1 overflow-auto rounded-xl border border-gray-100 p-2 sm:grid-cols-2">
                {employees.map((employee) => (
                  <label key={employee.id} className="flex items-center gap-3 rounded-lg px-2 py-2 text-sm text-gray-700 hover:bg-gray-50">
                    <input type="checkbox" checked={selected.includes(Number(employee.id))} onChange={() => toggle(employee.id)}
                      className="rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
                    <span>{label(employee)}</span>
                  </label>
                ))}
              </div>
            ) : <p className="text-sm text-gray-500">No active employees were returned.</p>}
          <div className="flex justify-end">
            <button type="button" onClick={save} disabled={loading || saving}
              className="inline-flex min-h-10 items-center rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50">
              {saving ? "Saving…" : "Save finance viewers"}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
