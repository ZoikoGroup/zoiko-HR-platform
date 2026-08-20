import { useEffect, useState } from "react";
import { CalendarDays, CheckCircle2, AlertTriangle, Loader2 } from "lucide-react";
import {
  getWorkflow, updateWorkflowFields, validateWorkflow, confirmWorkflow, executeWorkflow, cancelWorkflow,
} from "../../../service/assistantService";

const FIELD_LABELS = { leave_type: "Leave type", start_date: "Start date", end_date: "End date", reason: "Reason" };

// Must match backend LeaveType enum values exactly (app/modules/hr/models.py)
// — free text here is what let "annual leave" through instead of "annual".
const LEAVE_TYPE_OPTIONS = ["annual", "sick", "casual", "maternity", "paternity", "unpaid", "emergency", "other"];

export default function WorkflowPanel({ workflowId, onExecuted }) {
  const [workflow, setWorkflow] = useState(null);
  const [editValues, setEditValues] = useState({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  // Minted once per workflow, not per click — a repeated click on "Submit"
  // (double-click, or retrying after a request that looked like it failed)
  // must reuse the same key so the server recognizes it as the same
  // logical operation rather than executing it twice.
  const [idempotencyKey, setIdempotencyKey] = useState(null);

  const load = async () => {
    const wf = await getWorkflow(workflowId);
    setWorkflow(wf);
    const values = {};
    (wf.fields || []).forEach((f) => { values[f.field_name] = f.field_value ?? ""; });
    setEditValues(values);
  };

  useEffect(() => {
    load();
    setIdempotencyKey(`${workflowId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
  }, [workflowId]);

  const run = async (fn) => {
    setBusy(true);
    setError(null);
    try {
      const wf = await fn();
      setWorkflow(wf);
      if (wf.status === "completed" && onExecuted) onExecuted(wf);
    } catch (e) {
      setError(e.message || "Something went wrong.");
    } finally {
      setBusy(false);
    }
  };

  if (!workflow) {
    return <div className="flex items-center gap-2 text-xs text-[var(--zhr-text-muted)]"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading request...</div>;
  }

  const status = workflow.status;
  const isDraft = status === "draft";
  const isValidated = status === "validated";
  const isAwaitingConfirmation = status === "awaiting_confirmation";
  const isTerminal = ["completed", "cancelled", "failed", "reconciliation_required"].includes(status);

  return (
    <div className="mt-3 rounded-2xl border border-[var(--zhr-border-default)] bg-[var(--zhr-surface-overlay)] p-4 text-sm">
      <div className="mb-3 flex items-center justify-between">
        <h4 className="flex items-center gap-1.5 font-bold text-[var(--zhr-text-primary)]">
          <CalendarDays className="h-4 w-4 text-[var(--zhr-action-primary)]" /> Leave request draft
        </h4>
        <span className="rounded-full bg-[var(--zhr-action-secondary)] px-2 py-0.5 text-[10px] font-bold uppercase text-[var(--zhr-text-secondary)]">{status.replace(/_/g, " ")}</span>
      </div>

      <div className="space-y-2">
        {Object.entries(FIELD_LABELS).map(([name, label]) => (
          <div key={name} className="flex items-center gap-2">
            <label className="w-24 shrink-0 text-[11px] font-semibold text-[var(--zhr-text-secondary)]">{label}</label>
            {isDraft && name === "leave_type" ? (
              <select
                value={editValues[name] || ""}
                onChange={(e) => setEditValues((v) => ({ ...v, [name]: e.target.value }))}
                className="flex-1 rounded-lg border border-[var(--zhr-border-default)] px-2 py-1 text-xs"
              >
                <option value="" disabled>Select a leave type...</option>
                {LEAVE_TYPE_OPTIONS.map((opt) => <option key={opt} value={opt}>{opt}</option>)}
              </select>
            ) : isDraft ? (
              <input
                type={name.includes("date") ? "date" : "text"}
                value={editValues[name] || ""}
                onChange={(e) => setEditValues((v) => ({ ...v, [name]: e.target.value }))}
                className="flex-1 rounded-lg border border-[var(--zhr-border-default)] px-2 py-1 text-xs"
              />
            ) : (
              <span className="text-xs text-[var(--zhr-text-primary)]">{editValues[name] || "—"}</span>
            )}
          </div>
        ))}
      </div>

      {workflow.validation_messages?.length > 0 && (
        <div className="mt-3 rounded-lg bg-amber-50 border border-amber-100 p-2.5 text-[11px] text-amber-700 flex gap-1.5">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
          <ul className="list-disc pl-3 space-y-0.5">
            {workflow.validation_messages.map((m, i) => <li key={i}>{m}</li>)}
          </ul>
        </div>
      )}

      {error && <p className="mt-2 text-[11px] font-semibold text-rose-600">{error}</p>}

      {status === "completed" && (
        <p className="mt-3 flex items-center gap-1.5 text-xs font-semibold text-emerald-600">
          <CheckCircle2 className="h-4 w-4" /> Leave request submitted successfully.
        </p>
      )}

      {!isTerminal && (
        <div className="mt-3 flex gap-2">
          {isDraft && (
            <>
              <button
                disabled={busy}
                onClick={() => run(async () => { await updateWorkflowFields(workflowId, editValues); return validateWorkflow(workflowId); })}
                className="rounded-full bg-[var(--zhr-action-primary)] px-3.5 py-1.5 text-xs font-bold text-white hover:bg-[var(--zhr-action-primary-hover)] disabled:opacity-50"
              >
                Save &amp; validate
              </button>
              <button disabled={busy} onClick={() => run(() => cancelWorkflow(workflowId))} className="rounded-full border border-[var(--zhr-border-default)] px-3.5 py-1.5 text-xs font-bold text-[var(--zhr-text-secondary)]">
                Cancel
              </button>
            </>
          )}
          {isValidated && (
            <>
              <button
                disabled={busy}
                onClick={() => run(() => confirmWorkflow(workflowId, workflow.confirmation_token))}
                className="rounded-full bg-[var(--zhr-action-primary)] px-3.5 py-1.5 text-xs font-bold text-white hover:bg-[var(--zhr-action-primary-hover)] disabled:opacity-50"
              >
                Confirm request
              </button>
              <button disabled={busy} onClick={() => run(() => cancelWorkflow(workflowId))} className="rounded-full border border-[var(--zhr-border-default)] px-3.5 py-1.5 text-xs font-bold text-[var(--zhr-text-secondary)]">
                Cancel
              </button>
            </>
          )}
          {isAwaitingConfirmation && (
            <button
              disabled={busy || !idempotencyKey}
              onClick={() => run(() => executeWorkflow(workflowId, idempotencyKey))}
              className="rounded-full bg-[var(--zhr-action-primary)] px-3.5 py-1.5 text-xs font-bold text-white hover:bg-[var(--zhr-action-primary-hover)] disabled:opacity-50"
            >
              Submit leave request
            </button>
          )}
        </div>
      )}
    </div>
  );
}
