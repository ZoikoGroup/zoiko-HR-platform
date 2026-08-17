import { useEffect, useState } from "react";
import { CalendarDays, CheckCircle2, AlertTriangle, Loader2 } from "lucide-react";
import {
  getWorkflow, updateWorkflowFields, validateWorkflow, confirmWorkflow, executeWorkflow, cancelWorkflow,
} from "../../../service/assistantService";

const FIELD_LABELS = { leave_type: "Leave type", start_date: "Start date", end_date: "End date", reason: "Reason" };

export default function WorkflowPanel({ workflowId, onExecuted }) {
  const [workflow, setWorkflow] = useState(null);
  const [editValues, setEditValues] = useState({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const load = async () => {
    const wf = await getWorkflow(workflowId);
    setWorkflow(wf);
    const values = {};
    (wf.fields || []).forEach((f) => { values[f.field_name] = f.field_value ?? ""; });
    setEditValues(values);
  };

  useEffect(() => { load(); }, [workflowId]);

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
    return <div className="flex items-center gap-2 text-xs text-slate-400"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading request...</div>;
  }

  const status = workflow.status;
  const isDraft = status === "draft";
  const isValidated = status === "validated";
  const isAwaitingConfirmation = status === "awaiting_confirmation";
  const isTerminal = ["completed", "cancelled", "failed", "reconciliation_required"].includes(status);

  return (
    <div className="mt-3 rounded-2xl border border-slate-200 bg-white p-4 text-sm">
      <div className="mb-3 flex items-center justify-between">
        <h4 className="flex items-center gap-1.5 font-bold text-slate-800">
          <CalendarDays className="h-4 w-4 text-[#FF7A00]" /> Leave request draft
        </h4>
        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold uppercase text-slate-500">{status.replace(/_/g, " ")}</span>
      </div>

      <div className="space-y-2">
        {Object.entries(FIELD_LABELS).map(([name, label]) => (
          <div key={name} className="flex items-center gap-2">
            <label className="w-24 shrink-0 text-[11px] font-semibold text-slate-500">{label}</label>
            {isDraft ? (
              <input
                type={name.includes("date") ? "date" : "text"}
                value={editValues[name] || ""}
                onChange={(e) => setEditValues((v) => ({ ...v, [name]: e.target.value }))}
                className="flex-1 rounded-lg border border-slate-200 px-2 py-1 text-xs"
              />
            ) : (
              <span className="text-xs text-slate-700">{editValues[name] || "—"}</span>
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
                className="rounded-full bg-[#FF7A00] px-3.5 py-1.5 text-xs font-bold text-white hover:bg-[#e56e00] disabled:opacity-50"
              >
                Save &amp; validate
              </button>
              <button disabled={busy} onClick={() => run(() => cancelWorkflow(workflowId))} className="rounded-full border border-slate-200 px-3.5 py-1.5 text-xs font-bold text-slate-500">
                Cancel
              </button>
            </>
          )}
          {isValidated && (
            <>
              <button
                disabled={busy}
                onClick={() => run(() => confirmWorkflow(workflowId, workflow.confirmation_token))}
                className="rounded-full bg-[#FF7A00] px-3.5 py-1.5 text-xs font-bold text-white hover:bg-[#e56e00] disabled:opacity-50"
              >
                Confirm request
              </button>
              <button disabled={busy} onClick={() => run(() => cancelWorkflow(workflowId))} className="rounded-full border border-slate-200 px-3.5 py-1.5 text-xs font-bold text-slate-500">
                Cancel
              </button>
            </>
          )}
          {isAwaitingConfirmation && (
            <button
              disabled={busy}
              onClick={() => run(() => executeWorkflow(workflowId, `${workflowId}-${Date.now()}`))}
              className="rounded-full bg-[#FF7A00] px-3.5 py-1.5 text-xs font-bold text-white hover:bg-[#e56e00] disabled:opacity-50"
            >
              Submit leave request
            </button>
          )}
        </div>
      )}
    </div>
  );
}
