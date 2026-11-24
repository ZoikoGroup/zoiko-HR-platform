import { useState } from "react";
import { X } from "lucide-react";
import EmployeePicker from "../learning/EmployeePicker";
import { assignDesignation } from "../../../service/hrService";

/**
 * Several people of the organization (any role), picked one at a time by searching on the server, shown as removable
 * chips. `value` is [{id, name}].
 */
export function PeopleMultiPicker({ id = "people-picker", label = "People", value, onChange }) {
  const add = (person) => {
    if (person && !value.some((p) => p.id === person.id)) onChange([...value, person]);
  };
  return (
    <div>
      <EmployeePicker id={id} label={label} value={null} onChange={add} placeholder="Search by name, email or employee code..." />
      {value.length > 0 && (
        <ul aria-label="Selected people" className="mt-2 flex flex-wrap gap-2">
          {value.map((p) => (
            <li key={p.id} className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-800">
              {p.name}
              <button type="button" onClick={() => onChange(value.filter((x) => x.id !== p.id))} aria-label={`Remove ${p.name}`}
                className="rounded-full p-0.5 hover:bg-blue-100"><X size={12} aria-hidden="true" /></button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** "Assign to employees": give a designation to existing people, optionally setting their job title to it. */
export default function AssignPeopleDialog({ designation, onClose, onDone }) {
  const [people, setPeople] = useState([]);
  const [syncTitle, setSyncTitle] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const submit = async (e) => {
    e.preventDefault();
    if (people.length === 0) { setError("Pick at least one person."); return; }
    setBusy(true);
    setError("");
    try {
      const res = await assignDesignation(designation.id, { employee_ids: people.map((p) => p.id), sync_job_title: syncTitle });
      onDone?.(res);
    } catch (err) {
      setError(err?.message || "The designation could not be assigned.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm">
      <form role="dialog" aria-modal="true" aria-label={`Assign ${designation.title}`} onSubmit={submit}
        className="w-full max-w-md overflow-visible rounded-xl bg-white shadow-xl">
        <div className="border-b border-gray-100 bg-gray-50 px-6 py-4">
          <h3 className="text-base font-semibold text-gray-900">Assign “{designation.title}”</h3>
          <p className="text-xs text-gray-500">Existing employees of your organization. Their current designation is replaced.</p>
        </div>
        <div className="space-y-4 p-6">
          {error && <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
          <PeopleMultiPicker id="assign-people" label="Employees" value={people} onChange={setPeople} />
          <label className="flex items-start gap-2 text-sm text-gray-700">
            <input type="checkbox" className="mt-0.5 accent-blue-600" checked={syncTitle} onChange={(e) => setSyncTitle(e.target.checked)} />
            <span>Also set their job title to “{designation.title}”</span>
          </label>
        </div>
        <div className="flex justify-end gap-3 border-t border-gray-100 bg-gray-50 px-6 py-4">
          <button type="button" onClick={onClose} className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">Cancel</button>
          <button type="submit" disabled={busy || people.length === 0}
            className="rounded-lg bg-blue-500 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-600 disabled:opacity-50">
            {busy ? "Assigning..." : `Assign${people.length ? ` ${people.length}` : ""}`}
          </button>
        </div>
      </form>
    </div>
  );
}
