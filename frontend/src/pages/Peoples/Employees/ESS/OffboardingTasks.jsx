/*
 * Offboarding Tasks: clearance work assigned to me for other people's exits (manager handover, IT access, finance dues…),
 * and — for a manager when the organisation allows it — the resignations of direct reports waiting for a decision.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, CheckCircle2, Circle, ClipboardCheck, Loader2, Undo2, X } from "lucide-react";
import EmployeePageShell from "../../../../components/employee/EmployeePageShell";
import ConfirmDialog from "../../../../modules/zoiko-hr/documents/components/ConfirmDialog";
import { decideTeamResignation, errorMessage, getAssignedOffboardingTasks, setAssignedOffboardingTask } from "../../../../service/offboardingService";
import { formatDate } from "../../../../utils/dateTime";

const humanize = (s) => (s ? String(s).replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase()) : "—");

function Decision({ c, onDecided }) {
  const [mode, setMode] = useState(null);
  const [note, setNote] = useState("");
  return (
    <li className="rounded-2xl border border-slate-200 bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-semibold text-slate-900">{c.employee?.name}</p>
          <p className="text-sm text-slate-600">{c.employee?.job_title} · {c.case_number}</p>
          <p className="mt-1 text-sm text-slate-700">Reason: {humanize(c.reason_category)}</p>
          <p className="text-xs text-slate-500">{c.requested_last_day ? `Asked-for last day ${formatDate(c.requested_last_day)}` : `Last day under the notice rules ${formatDate(c.last_working_day)}`} · notice ends {formatDate(c.notice_end_date)}</p>
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={() => { setNote(""); setMode("approve"); }} aria-label={`Approve resignation of ${c.employee?.name}`}
            className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-700">
            <Check size={16} aria-hidden="true" /> Approve
          </button>
          <button type="button" onClick={() => { setNote(""); setMode("reject"); }} aria-label={`Reject resignation of ${c.employee?.name}`}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
            <X size={16} aria-hidden="true" /> Reject
          </button>
        </div>
      </div>
      <ConfirmDialog open={Boolean(mode)} danger={mode === "reject"}
        title={mode === "approve" ? `Accept ${c.employee?.name}'s resignation?` : `Do not accept ${c.employee?.name}'s resignation?`}
        confirmLabel={mode === "approve" ? "Approve" : "Reject"} onClose={() => setMode(null)}
        message={(
          <label className="block text-sm">{mode === "approve" ? "Note (optional)" : "Why it is not accepted (the employee sees this)"}
            <textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} aria-label="Decision note"
              className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm" />
          </label>
        )}
        onConfirm={async () => {
          if (mode === "reject" && !note.trim()) throw new Error("Say why it is not accepted.");
          await decideTeamResignation(c.id, mode, note.trim() || null);
          setMode(null);
          onDecided(mode === "approve" ? `${c.employee?.name}'s resignation is accepted.` : `${c.employee?.name}'s resignation is not accepted.`);
        }} />
    </li>
  );
}

function TaskRow({ task, onChange }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [note, setNote] = useState("");
  const run = async (done) => {
    setBusy(true); setError(null);
    try { await setAssignedOffboardingTask(task.id, done, note || null); onChange(); } catch (e) { setError(errorMessage(e)); } finally { setBusy(false); }
  };
  return (
    <li className="flex flex-wrap items-start justify-between gap-3 py-3">
      <div className="flex gap-3">
        {task.status === "open" ? <Circle size={18} className="mt-0.5 text-slate-400" aria-hidden="true" />
          : <CheckCircle2 size={18} className="mt-0.5 text-emerald-600" aria-hidden="true" />}
        <div>
          <p className="font-medium text-slate-900">{task.title}</p>
          {task.description && <p className="text-sm text-slate-600">{task.description}</p>}
          <p className={`text-xs ${task.overdue ? "font-semibold text-red-700" : "text-slate-500"}`}>
            {task.owner_label} · due {formatDate(task.due_date)}{task.overdue ? " · overdue" : ""}{task.status === "exception" ? " · not needed" : ""}
          </p>
          {task.status === "open" && (
            <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note (optional)" aria-label={`Note for ${task.title}`}
              className="mt-2 w-64 max-w-full rounded-lg border border-slate-300 px-2 py-1 text-sm" />
          )}
          {error && <p role="alert" className="text-xs text-red-700">{error}</p>}
        </div>
      </div>
      {task.status === "open" && (
        <button type="button" disabled={busy} onClick={() => run(true)} aria-label={`Mark ${task.title} done`}
          className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60">
          {busy && <Loader2 size={14} className="animate-spin" aria-hidden="true" />} Mark done
        </button>
      )}
      {task.status === "done" && (
        <button type="button" disabled={busy} onClick={() => run(false)} aria-label={`Undo ${task.title}`}
          className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60">
          <Undo2 size={14} aria-hidden="true" /> Undo
        </button>
      )}
    </li>
  );
}

export default function OffboardingTasks() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [filter, setFilter] = useState("open");
  const [notice, setNotice] = useState(null);
  const load = useCallback(() => {
    getAssignedOffboardingTasks().then(setData).catch((e) => setError(errorMessage(e, "Your offboarding tasks could not be loaded.")));
  }, []);
  useEffect(() => { load(); }, [load]);

  const groups = useMemo(() => {
    const out = new Map();
    for (const t of data?.items || []) {
      if (filter === "open" ? t.status !== "open" : t.status === "open") continue;
      const key = t.case.id;
      if (!out.has(key)) out.set(key, { case: t.case, tasks: [] });
      out.get(key).tasks.push(t);
    }
    return [...out.values()];
  }, [data, filter]);

  return (
    <EmployeePageShell title="Offboarding Tasks" subtitle="Clearance work for colleagues who are leaving, and resignations to decide.">
      {notice && <p role="status" className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">{notice}</p>}
      {error && <p role="alert" className="mb-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>}
      {!data && !error && <p role="status" className="text-sm text-slate-600">Loading…</p>}
      {data && data.decisions?.length > 0 && (
        <section aria-labelledby="decide" className="mb-6">
          <h2 id="decide" className="mb-2 text-base font-semibold text-slate-900">Resignations to decide</h2>
          <ul className="space-y-3">
            {data.decisions.map((c) => <Decision key={c.id} c={c} onDecided={(msg) => { setNotice(msg); load(); }} />)}
          </ul>
        </section>
      )}
      {data && (
        <section aria-labelledby="mine">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <h2 id="mine" className="flex items-center gap-2 text-base font-semibold text-slate-900">
              <ClipboardCheck size={18} aria-hidden="true" /> My clearance tasks
            </h2>
            <div role="tablist" aria-label="Show" className="inline-flex rounded-lg border border-slate-200 bg-white p-1">
              {[["open", `Open (${data.open || 0})`], ["done", "Done"]].map(([v, l]) => (
                <button key={v} type="button" role="tab" aria-selected={filter === v} onClick={() => setFilter(v)}
                  className={`rounded-md px-3 py-1 text-xs font-semibold ${filter === v ? "bg-blue-600 text-white" : "text-slate-600"}`}>{l}</button>
              ))}
            </div>
          </div>
          {groups.length === 0 ? (
            <p className="rounded-2xl border border-slate-200 bg-white p-5 text-sm text-slate-600">
              {filter === "open" ? "You have no open offboarding tasks." : "Nothing done yet."}
            </p>
          ) : groups.map((g) => (
            <div key={g.case.id} className="mb-3 rounded-2xl border border-slate-200 bg-white px-4">
              <p className="border-b border-slate-100 py-3 text-sm">
                <span className="font-semibold text-slate-900">{g.case.employee?.name}</span>
                <span className="text-slate-500"> · {g.case.case_number} · last working day {formatDate(g.case.last_working_day)}</span>
              </p>
              <ul className="divide-y divide-slate-100">{g.tasks.map((t) => <TaskRow key={t.id} task={t} onChange={load} />)}</ul>
            </div>
          ))}
        </section>
      )}
    </EmployeePageShell>
  );
}
