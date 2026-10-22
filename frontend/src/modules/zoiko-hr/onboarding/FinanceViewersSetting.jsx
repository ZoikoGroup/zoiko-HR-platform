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
    <section aria-label="Finance viewer settings" className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-bold text-gray-800">Finance viewers</h2>
          <p className="mt-1 text-sm text-gray-500">Explicitly grant access to reveal and verify onboarding bank and payroll details. Changes are audited.</p>
        </div>
        <button type="button" onClick={() => setOpen((current) => !current)} aria-expanded={open}
          className="min-h-9 rounded-lg border border-slate-300 px-3 text-sm font-medium text-slate-700">
          {open ? "Hide finance viewer settings" : "Manage finance viewers"}
        </button>
      </div>
      {open && (
        <div className="mt-4 space-y-4">
          {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
          {notice && <p role="status" className="rounded-lg bg-green-50 p-3 text-sm text-green-700">{notice}</p>}
          {loading ? <p className="text-sm text-gray-500">Loading employees and permissions…</p>
            : employees.length ? (
              <div className="max-h-64 overflow-auto rounded-lg border border-slate-100 p-2">
                {employees.map((employee) => (
                  <label key={employee.id} className="flex items-center gap-3 rounded-md px-2 py-2 text-sm text-gray-700 hover:bg-slate-50">
                    <input type="checkbox" checked={selected.includes(Number(employee.id))} onChange={() => toggle(employee.id)}
                      className="rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
                    <span>{label(employee)}</span>
                  </label>
                ))}
              </div>
            ) : <p className="text-sm text-gray-500">No active employees were returned.</p>}
          <div className="flex justify-end">
            <button type="button" onClick={save} disabled={loading || saving}
              className="min-h-10 rounded-lg bg-blue-600 px-4 text-sm font-medium text-white disabled:opacity-50">
              {saving ? "Saving…" : "Save finance viewers"}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
