/* My Exit → Exit Tasks: the person's own clearance items (handover, expense claims, details for final pay…). */
import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, Circle, Loader2, Undo2 } from "lucide-react";
import { errorMessage, getMyExitTasks, setMyExitTask } from "../../../../../service/offboardingService";
import { formatDate } from "../../../../../utils/dateTime";
import MyExitLayout, { useMyExit } from "./MyExitLayout";

function TaskRow({ task, onSave }) {
  const [note, setNote] = useState(task.note || "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const done = task.status === "done";
  const save = async (value) => {
    setBusy(true); setError(null);
    try { await onSave(task.id, value, note); } catch (e) { setError(errorMessage(e)); } finally { setBusy(false); }
  };
  return (
    <li className="rounded-2xl border border-slate-200 bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex gap-3">
          {done || task.status === "exception"
            ? <CheckCircle2 size={20} className="mt-0.5 text-emerald-600" aria-hidden="true" />
            : <Circle size={20} className="mt-0.5 text-slate-400" aria-hidden="true" />}
          <div>
            <p className="font-medium text-slate-900">{task.title}{task.mandatory ? "" : <span className="ml-2 text-xs font-normal text-slate-500">optional</span>}</p>
            {task.description && <p className="text-sm text-slate-600">{task.description}</p>}
            <p className={`mt-1 text-xs ${task.overdue ? "font-semibold text-red-700" : "text-slate-500"}`}>
              Due {formatDate(task.due_date)}{task.overdue ? " · overdue" : ""}
              {task.status === "exception" ? " · marked not needed by HR" : ""}
            </p>
          </div>
        </div>
        {task.status === "open" && (
          <button type="button" disabled={busy} onClick={() => save(true)} aria-label={`Mark ${task.title} done`}
            className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60">
            {busy && <Loader2 size={14} className="animate-spin" aria-hidden="true" />} Mark done
          </button>
        )}
        {done && (
          <button type="button" disabled={busy} onClick={() => save(false)} aria-label={`Undo ${task.title}`}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60">
            <Undo2 size={14} aria-hidden="true" /> Undo
          </button>
        )}
      </div>
      {task.status === "open" && (
        <label className="mt-3 block text-xs text-slate-600">Note (optional)
          <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={2000} aria-label={`Note for ${task.title}`}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm" />
        </label>
      )}
      {done && task.note && <p className="mt-2 text-xs text-slate-600">Note: {task.note}</p>}
      {error && <p role="alert" className="mt-2 text-xs text-red-700">{error}</p>}
    </li>
  );
}

function TasksTab() {
  const { reload: reloadExit } = useMyExit();
  const [items, setItems] = useState(null);
  const [error, setError] = useState(null);
  const load = useCallback(() => {
    getMyExitTasks().then((r) => setItems(r?.items || [])).catch((e) => setError(errorMessage(e, "Your tasks could not be loaded.")));
  }, []);
  useEffect(() => { load(); }, [load]);
  if (error) return <p role="alert" className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</p>;
  if (items === null) return <p role="status" className="text-sm text-slate-600">Loading…</p>;
  if (items.length === 0) return <p className="rounded-2xl border border-slate-200 bg-white p-5 text-sm text-slate-600">You have no exit tasks.</p>;
  const open = items.filter((t) => t.status === "open").length;
  return (
    <div>
      <p className="mb-3 text-sm text-slate-600">{open ? `${open} task(s) left before your last day.` : "All your exit tasks are done. Thank you."}</p>
      <ul className="space-y-3">
        {items.map((t) => <TaskRow key={t.id} task={t} onSave={async (id, done, note) => {
          await setMyExitTask(id, done, note || null);
          load();
          reloadExit();
        }} />)}
      </ul>
    </div>
  );
}

export default function ExitTasks() {
  return <MyExitLayout tab="tasks"><TasksTab /></MyExitLayout>;
}
