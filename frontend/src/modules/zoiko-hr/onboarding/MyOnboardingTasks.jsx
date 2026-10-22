import { useEffect, useState } from "react";
import {
  errorMessage, getMyOnboardingTasks, setMyOnboardingTaskCompleted,
} from "../../../service/onboardingPrompt2Service";

export default function MyOnboardingTasks() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(null);

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const result = await getMyOnboardingTasks();
      setItems(Array.isArray(result?.items) ? result.items : []);
    } catch (err) {
      setError(errorMessage(err, "Your onboarding tasks could not be loaded."));
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, []);

  const toggle = async (item) => {
    setBusy(item.id);
    setError("");
    try {
      await setMyOnboardingTaskCompleted(item.id, !item.completed);
      setItems((current) => current.map((task) => task.id === item.id
        ? { ...task, completed: !task.completed } : task));
    } catch (err) {
      setError(errorMessage(err, "The task could not be updated."));
    } finally {
      setBusy(null);
    }
  };

  return (
    <section aria-label="My onboarding tasks" className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5">
      <div className="flex flex-wrap justify-between items-start gap-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">My onboarding tasks</h2>
          <p className="mt-1 text-sm text-slate-500">Tasks assigned to you for new hires.</p>
        </div>
        <button type="button" onClick={load} disabled={loading} className="min-h-9 rounded-lg border px-3 text-sm disabled:opacity-50">Refresh</button>
      </div>
      {error && <p role="alert" className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      {loading ? <p className="mt-4 text-sm text-slate-500">Loading tasks…</p>
        : items.length === 0 ? <p className="mt-4 text-sm text-slate-500">No onboarding tasks are assigned to you.</p>
          : (
            <ul className="mt-3 divide-y divide-slate-100">
              {items.map((item) => (
                <li key={item.id} className="flex flex-wrap items-start gap-3 py-3">
                  <input type="checkbox" checked={!!item.completed} disabled={busy === item.id}
                    aria-label={`${item.completed ? "Reopen" : "Complete"} ${item.title}`}
                    onChange={() => toggle(item)} className="mt-1 rounded border-slate-300" />
                  <div className="min-w-0 flex-1">
                    <p className={`text-sm font-medium ${item.completed ? "text-slate-400 line-through" : "text-slate-800"}`}>{item.title}</p>
                    <p className="mt-1 text-xs text-slate-500">
                      {item.new_hire_name || `New hire #${item.new_hire_id}`} · {item.checklist}
                      {item.due_date ? ` · Due ${String(item.due_date).slice(0, 10)}` : ""}
                    </p>
                    {item.overdue && !item.completed && <span className="mt-1 inline-block rounded-full bg-red-100 px-2 py-0.5 text-xs text-red-700">Overdue</span>}
                    {item.mandatory && <span className="ml-2 mt-1 inline-block rounded-full bg-blue-50 px-2 py-0.5 text-xs text-blue-700">Required</span>}
                  </div>
                  {busy === item.id && <span className="text-xs text-slate-400">Saving…</span>}
                </li>
              ))}
            </ul>
          )}
    </section>
  );
}
