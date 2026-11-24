/*
 * Offboarding → Clearance Board: every open clearance task across all exits, grouped by who owns it (HR, Manager, IT,
 * Finance, Admin, Employee). Overdue tasks are highlighted. HR marks tasks done, assigns them or marks them not needed.
 * Data: GET /hr/offboarding/tasks; changes: PUT /hr/offboarding/tasks/{id}.
 */
import { useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, CheckCircle2, ClipboardCheck, RefreshCw, UserPlus, XCircle } from "lucide-react";
import { errorMessage, getClearanceBoard, updateClearanceTask } from "../../../service/offboardingService";
import { formatDate } from "../../../utils/dateTime";
import { Card, EmptyState, FilterSelect, KpiCard, PrimaryButton, SecondaryButton } from "../recruitment/ui";
import OffboardingLayout from "./OffboardingLayout";
import { EmployeePicker, ErrorNote, Modal, inputClass, useLoad } from "./part2Helpers";

export const OWNER_COLUMNS = [
  { key: "hr", label: "HR" }, { key: "manager", label: "Manager" }, { key: "it", label: "IT" },
  { key: "finance", label: "Finance" }, { key: "admin", label: "Admin" }, { key: "employee", label: "Employee" },
];

function TaskCard({ task, onDone, onAssign, onExcuse, busy }) {
  return (
    <li className={`rounded-xl border bg-white p-3 shadow-sm ${task.overdue ? "border-rose-200" : "border-slate-200"}`}
      data-testid={`task-${task.id}`}>
      <p className="text-sm font-semibold text-slate-900">{task.title}</p>
      <p className="mt-1 text-xs text-slate-600">
        {task.case?.employee?.name || "—"} ·{" "}
        <Link to={`/zoiko-hr/offboarding/cases/${task.case_id}`} className="font-medium text-blue-700 hover:underline">
          {task.case?.case_number || `Case ${task.case_id}`}
        </Link>
      </p>
      <p className={`mt-1 text-xs ${task.overdue ? "font-semibold text-rose-700" : "text-slate-500"}`}>
        {task.overdue && <AlertTriangle className="mr-1 inline h-3.5 w-3.5" aria-hidden="true" />}
        Due {task.due_date ? formatDate(task.due_date) : "—"}{task.overdue ? " (overdue)" : ""}
      </p>
      <p className="mt-1 text-xs text-slate-500">{task.assignee ? `Assigned to ${task.assignee.name}` : "Unassigned"}
        {!task.mandatory && " · optional"}</p>
      <div className="mt-2 flex flex-wrap gap-1.5">
        <button type="button" disabled={busy} onClick={() => onDone(task)} aria-label={`Mark ${task.title} done`}
          className="inline-flex items-center gap-1 rounded-lg bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-700 hover:bg-emerald-100 disabled:opacity-50">
          <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" /> Mark done
        </button>
        <button type="button" disabled={busy} onClick={() => onAssign(task)} aria-label={`Assign ${task.title}`}
          className="inline-flex items-center gap-1 rounded-lg bg-blue-50 px-2 py-1 text-xs font-semibold text-blue-700 hover:bg-blue-100 disabled:opacity-50">
          <UserPlus className="h-3.5 w-3.5" aria-hidden="true" /> Assign
        </button>
        <button type="button" disabled={busy} onClick={() => onExcuse(task)} aria-label={`${task.title} not needed`}
          className="inline-flex items-center gap-1 rounded-lg bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-200 disabled:opacity-50">
          <XCircle className="h-3.5 w-3.5" aria-hidden="true" /> Not needed
        </button>
      </div>
    </li>
  );
}

export default function ClearanceBoard() {
  const [owner, setOwner] = useState("");
  const [overdueOnly, setOverdueOnly] = useState(false);
  const board = useLoad(() => getClearanceBoard({ owner_role: owner || undefined, overdue: overdueOnly || undefined }), [owner, overdueOnly]);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState(null);
  const [error, setError] = useState(null);
  const [assigning, setAssigning] = useState(null);
  const [assignee, setAssignee] = useState(null);
  const [excusing, setExcusing] = useState(null);
  const [reason, setReason] = useState("");
  const [dialogError, setDialogError] = useState(null);

  const items = board.data?.items || [];
  const run = async (fn, ok) => {
    setBusy(true); setError(null); setNotice(null);
    try { await fn(); setNotice(ok); await board.reload(); return true; } catch (e) { setError(errorMessage(e)); return false; } finally { setBusy(false); }
  };
  const runDialog = async (fn, ok, close) => {
    setBusy(true); setDialogError(null);
    try { await fn(); setNotice(ok); close(); await board.reload(); } catch (e) { setDialogError(errorMessage(e)); } finally { setBusy(false); }
  };
  const columns = OWNER_COLUMNS.filter((c) => !owner || c.key === owner);

  return (
    <OffboardingLayout title="Clearance Board" subtitle="Open clearance tasks across every exit, by owner."
      actions={<SecondaryButton icon={RefreshCw} onClick={board.reload}>Refresh</SecondaryButton>}>
      <div className="space-y-5">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <KpiCard label="Open tasks" icon={ClipboardCheck} tone="blue" kpi={{ value: board.data?.total ?? 0 }} loading={board.loading && !board.data} />
          <KpiCard label="Overdue" icon={AlertTriangle} tone="red" kpi={{ value: board.data?.overdue ?? 0 }} loading={board.loading && !board.data} />
        </div>
        <Card bodyClass="p-4">
          <div className="flex flex-wrap items-end gap-4">
            <FilterSelect label="Owner" value={owner} onChange={setOwner} allLabel="All owners"
              options={OWNER_COLUMNS.map((c) => ({ value: c.key, label: c.label }))} />
            <label className="flex items-center gap-2 pb-2 text-sm text-slate-700">
              <input type="checkbox" checked={overdueOnly} onChange={(e) => setOverdueOnly(e.target.checked)} /> Overdue only
            </label>
          </div>
        </Card>
        {notice && <p role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm text-emerald-800">{notice}</p>}
        <ErrorNote>{error || board.error}</ErrorNote>
        {board.loading && !board.data ? (
          <p role="status" className="text-sm text-slate-500">Loading tasks…</p>
        ) : items.length === 0 ? (
          <Card><EmptyState icon={ClipboardCheck} title="No open clearance tasks">Tasks appear here once an exit is approved.</EmptyState></Card>
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {columns.map((col) => {
              const mine = items.filter((t) => t.owner_role === col.key);
              return (
                <section key={col.key} aria-label={`${col.label} tasks`} className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                  <h2 className="mb-2 flex items-center justify-between text-sm font-semibold text-slate-800">
                    {col.label}
                    <span className="rounded-full bg-white px-2 text-xs text-slate-600 ring-1 ring-slate-200">{mine.length}</span>
                  </h2>
                  {mine.length === 0 ? <p className="py-3 text-center text-xs text-slate-400">Nothing open</p> : (
                    <ul className="space-y-2">
                      {mine.map((t) => (
                        <TaskCard key={t.id} task={t} busy={busy}
                          onDone={(task) => run(() => updateClearanceTask(task.id, { done: true }), `“${task.title}” marked done.`)}
                          onAssign={(task) => { setAssigning(task); setAssignee(task.assignee?.id ?? null); setDialogError(null); }}
                          onExcuse={(task) => { setExcusing(task); setReason(""); setDialogError(null); }} />
                      ))}
                    </ul>
                  )}
                </section>
              );
            })}
          </div>
        )}
      </div>

      <Modal open={Boolean(assigning)} title={`Assign “${assigning?.title || ""}”`} onClose={() => setAssigning(null)}
        footer={<>
          <SecondaryButton onClick={() => setAssigning(null)}>Cancel</SecondaryButton>
          <PrimaryButton disabled={busy} onClick={() => runDialog(() => updateClearanceTask(assigning.id, { assignee_id: assignee }),
            assignee ? "Task assigned." : "Task unassigned.", () => setAssigning(null))}>Save</PrimaryButton>
        </>}>
        <EmployeePicker label="Assign to" value={assignee} onChange={setAssignee} />
        <div className="mt-3"><ErrorNote>{dialogError}</ErrorNote></div>
      </Modal>

      <Modal open={Boolean(excusing)} title={`Mark “${excusing?.title || ""}” not needed`} onClose={() => setExcusing(null)}
        footer={<>
          <SecondaryButton onClick={() => setExcusing(null)}>Cancel</SecondaryButton>
          <PrimaryButton disabled={busy || !reason.trim()} onClick={() => runDialog(() => updateClearanceTask(excusing.id, { exception_reason: reason.trim() }),
            "Task marked not needed.", () => setExcusing(null))}>Mark not needed</PrimaryButton>
        </>}>
        <label htmlFor="excuse-reason" className="mb-1 block text-sm font-medium text-slate-700">Why is it not needed?</label>
        <textarea id="excuse-reason" rows={3} value={reason} maxLength={2000} onChange={(e) => setReason(e.target.value)} className={inputClass} />
        <div className="mt-3"><ErrorNote>{dialogError}</ErrorNote></div>
      </Modal>
    </OffboardingLayout>
  );
}
