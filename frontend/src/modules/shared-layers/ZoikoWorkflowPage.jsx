import React, { useCallback, useEffect, useState } from "react";
import PageHeader from "../../components/PageHeader";
import { Activity, Workflow as WorkflowIcon } from "lucide-react";
import { integrationsService } from "../../service/integrationsService";
import {
  Btn, Card, ErrorNote, Field, Modal, Spinner, StatusPill, SuperAdminOnly, fmt, inputCls, useAction,
} from "./integrationsUi";

const STEP_DEFAULTS = {
  notification: { type: "notification", title: "", message: "", scope: "trigger_org" },
  email: { type: "email", to: "", subject: "", body: "" },
  slack: { type: "slack", message: "" },
  sms: { type: "sms", to: "", message: "" },
  webhook: { type: "webhook", webhook_id: "" },
  delay: { type: "delay", seconds: 60 },
};

const FIELD_LABELS = {
  title: "Title", message: "Message", to: "To", subject: "Subject", body: "Body", seconds: "Wait (seconds)", webhook_id: "Webhook",
};

function WorkspaceDialog({ onClose, onCreated }) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const { pending, error, run } = useAction();

  async function submit(e) {
    e.preventDefault();
    const ws = await run(() => integrationsService.createWorkspace({ name, description: description || null }));
    if (ws) onCreated();
  }

  return (
    <Modal title="Create Workspace" onClose={onClose}>
      <form onSubmit={submit}>
        <ErrorNote message={error} />
        <Field label="Name"><input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} required maxLength={120} /></Field>
        <Field label="Description (optional)"><textarea className={inputCls} rows={2} maxLength={1000} value={description} onChange={(e) => setDescription(e.target.value)} /></Field>
        <div className="mt-4 flex justify-end gap-2">
          <Btn onClick={onClose} disabled={pending}>Cancel</Btn>
          <Btn tone="primary" type="submit" disabled={pending || !name.trim()}>{pending ? "Creating…" : "Create"}</Btn>
        </div>
      </form>
    </Modal>
  );
}

function StepEditor({ step, index, webhooks, onChange, onRemove, onMove, count }) {
  const fields = Object.keys(step).filter((k) => k !== "type" && k !== "scope");
  return (
    <div className="mb-3 rounded-2xl border border-slate-100 bg-slate-50 p-3">
      <div className="mb-2 flex items-center justify-between text-xs font-semibold text-slate-700">
        <span>Step {index + 1}: {step.type}</span>
        <span className="flex gap-1">
          <Btn onClick={() => onMove(-1)} disabled={index === 0}>↑</Btn>
          <Btn onClick={() => onMove(1)} disabled={index === count - 1}>↓</Btn>
          <Btn tone="danger" onClick={onRemove}>Remove</Btn>
        </span>
      </div>
      {fields.map((f) => (
        <Field key={f} label={FIELD_LABELS[f] || f}>
          {f === "webhook_id" ? (
            <select className={inputCls} value={step[f]} onChange={(e) => onChange({ ...step, [f]: Number(e.target.value) })}>
              <option value="">Choose a webhook…</option>
              {webhooks.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
            </select>
          ) : f === "message" || f === "body" ? (
            <textarea className={inputCls} rows={2} value={step[f]} onChange={(e) => onChange({ ...step, [f]: e.target.value })} />
          ) : (
            <input className={inputCls} type={f === "seconds" ? "number" : "text"} min={f === "seconds" ? 1 : undefined}
              value={step[f]} onChange={(e) => onChange({ ...step, [f]: f === "seconds" ? Number(e.target.value) : e.target.value })} />
          )}
        </Field>
      ))}
      {step.type === "notification" ? (
        <Field label="Notify">
          <select className={inputCls} value={step.scope} onChange={(e) => onChange({ ...step, scope: e.target.value })}>
            <option value="trigger_org">Admins of the organization in the trigger</option>
            <option value="all">Admins of all organizations</option>
          </select>
        </Field>
      ) : null}
    </div>
  );
}

function WorkflowDialog({ workflow, workspaces, meta, webhooks, onClose, onSaved }) {
  const [form, setForm] = useState(() => workflow ? {
    workspace_id: workflow.workspace_id, name: workflow.name, description: workflow.description || "",
    trigger_event: workflow.trigger_event, steps: workflow.steps,
  } : {
    workspace_id: workspaces[0]?.id || "", name: "", description: "", trigger_event: meta.triggers[0]?.key || "", steps: [],
  });
  const [addType, setAddType] = useState("slack");
  const { pending, error, run } = useAction();

  function setStep(i, s) {
    setForm({ ...form, steps: form.steps.map((x, j) => (j === i ? s : x)) });
  }
  function move(i, d) {
    const steps = [...form.steps];
    [steps[i], steps[i + d]] = [steps[i + d], steps[i]];
    setForm({ ...form, steps });
  }

  async function submit(e) {
    e.preventDefault();
    const body = { ...form, workspace_id: Number(form.workspace_id) };
    const res = await run(() => workflow
      ? integrationsService.updateWorkflow(workflow.id, { name: body.name, description: body.description, trigger_event: body.trigger_event, steps: body.steps })
      : integrationsService.createWorkflow(body));
    if (res) onSaved();
  }

  return (
    <Modal title={workflow ? "Edit Workflow" : "Create Workflow"} onClose={onClose} wide>
      <form onSubmit={submit}>
        <ErrorNote message={error} />
        <div className="grid gap-x-4 md:grid-cols-2">
          <Field label="Name"><input className={inputCls} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required maxLength={120} /></Field>
          <Field label="Workspace">
            <select className={inputCls} value={form.workspace_id} disabled={!!workflow} onChange={(e) => setForm({ ...form, workspace_id: e.target.value })}>
              {workspaces.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
            </select>
          </Field>
        </div>
        <Field label="Trigger event" hint={meta.triggers.find((t) => t.key === form.trigger_event)?.description}>
          <select className={inputCls} value={form.trigger_event} onChange={(e) => setForm({ ...form, trigger_event: e.target.value })}>
            {meta.triggers.map((t) => <option key={t.key} value={t.key}>{t.key}</option>)}
          </select>
        </Field>
        <p className="mb-1 text-xs text-slate-400">Use {"{{data.email}}"}-style placeholders from the trigger payload in text fields.</p>
        {form.steps.map((s, i) => (
          <StepEditor key={i} step={s} index={i} count={form.steps.length} webhooks={webhooks}
            onChange={(ns) => setStep(i, ns)} onRemove={() => setForm({ ...form, steps: form.steps.filter((_, j) => j !== i) })} onMove={(d) => move(i, d)} />
        ))}
        <div className="mb-2 flex items-center gap-2">
          <select className={`${inputCls} max-w-xs`} value={addType} onChange={(e) => setAddType(e.target.value)}>
            {meta.step_types.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
          </select>
          <Btn onClick={() => setForm({ ...form, steps: [...form.steps, { ...STEP_DEFAULTS[addType] }] })}>Add step</Btn>
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <Btn onClick={onClose} disabled={pending}>Cancel</Btn>
          <Btn tone="primary" type="submit" disabled={pending || form.steps.length === 0 || !form.workspace_id}>{pending ? "Saving…" : "Save"}</Btn>
        </div>
      </form>
    </Modal>
  );
}

function ExecutionDetail({ id, onClose }) {
  const [ex, setEx] = useState(null);
  const [err, setErr] = useState("");
  useEffect(() => {
    integrationsService.getExecution(id).then(setEx).catch((e) => setErr(e?.message || "Failed to load execution."));
  }, [id]);
  return (
    <Modal title={`Execution #${id}`} onClose={onClose} wide>
      <ErrorNote message={err} />
      {!ex ? (err ? null : <Spinner />) : (
        <div className="space-y-3 text-xs">
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-sm font-bold text-slate-800">{ex.workflow_name}</span>
            <StatusPill status={ex.status} />
            <span className="text-slate-400">{ex.trigger_event} · {ex.triggered_by} · started {fmt(ex.started_at || ex.created_at)}</span>
          </div>
          {ex.error ? <ErrorNote message={ex.error} /> : null}
          {ex.status === "waiting" ? <p className="text-slate-500">Waiting until {fmt(ex.resume_at)}.</p> : null}
          {(ex.steps || []).map((s, i) => {
            const r = (ex.step_results || []).find((x) => x.index === i);
            return (
              <div key={i} className="rounded-2xl border border-slate-100 bg-slate-50 p-3">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-slate-700">Step {i + 1}: {s.type}</span>
                  {r ? <StatusPill status={r.status} /> : <StatusPill status="not run" />}
                </div>
                {r?.output ? <p className="mt-1 text-slate-500">{r.output}</p> : null}
                {r?.error ? <p className="mt-1 text-red-500">{r.error}</p> : null}
              </div>
            );
          })}
        </div>
      )}
    </Modal>
  );
}

function ExecutionsLog({ workflows, onBack }) {
  const [filters, setFilters] = useState({ workflow_id: "", status: "", date_from: "", date_to: "" });
  const [page, setPage] = useState(1);
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [detail, setDetail] = useState(null);

  const load = useCallback(async () => {
    const params = { page, page_size: 15 };
    Object.entries(filters).forEach(([k, v]) => { if (v) params[k] = k.startsWith("date") ? new Date(v).toISOString() : v; });
    try {
      setData(await integrationsService.getExecutions(params));
      setError("");
    } catch (e) {
      setError(e?.message || "Failed to load executions.");
      setData((p) => p || { executions: [], total: 0 });
    }
  }, [filters, page]);

  useEffect(() => { load(); }, [load]);

  const pages = data ? Math.max(1, Math.ceil(data.total / 15)) : 1;
  const set = (k, v) => { setPage(1); setFilters({ ...filters, [k]: v }); };

  return (
    <div className="space-y-6 font-sans">
      <PageHeader title="Workflow Executions" description="Every workflow run with its per-step results."
        action={<Btn onClick={onBack}>← Back to workflows</Btn>} />
      <Card title="Executions" icon={Activity}>
        <ErrorNote message={error} />
        <div className="mb-4 grid gap-3 md:grid-cols-4">
          <select className={inputCls} value={filters.workflow_id} onChange={(e) => set("workflow_id", e.target.value)}>
            <option value="">All workflows</option>
            {workflows.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
          </select>
          <select className={inputCls} value={filters.status} onChange={(e) => set("status", e.target.value)}>
            <option value="">Any status</option>
            {["pending", "running", "waiting", "succeeded", "failed"].map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <input className={inputCls} type="date" value={filters.date_from} onChange={(e) => set("date_from", e.target.value)} aria-label="From date" />
          <input className={inputCls} type="date" value={filters.date_to} onChange={(e) => set("date_to", e.target.value)} aria-label="To date" />
        </div>
        {data === null ? <Spinner /> : data.executions.length === 0 ? (
          <p className="text-sm text-slate-500">No executions found.</p>
        ) : (
          <div className="space-y-2">
            {data.executions.map((e) => (
              <button key={e.id} type="button" onClick={() => setDetail(e.id)}
                className="flex w-full flex-wrap items-center justify-between gap-2 rounded-2xl border border-slate-100 bg-slate-50 p-3 text-left text-xs hover:bg-slate-100">
                <span><span className="font-semibold text-slate-800">#{e.id} {e.workflow_name}</span> <span className="text-slate-400">· {e.trigger_event} · {e.triggered_by}</span></span>
                <span className="flex items-center gap-3 text-slate-400">{fmt(e.created_at)} <StatusPill status={e.status} /></span>
              </button>
            ))}
            <div className="flex items-center justify-between pt-2 text-xs text-slate-500">
              <span>Page {page} of {pages} · {data.total} total</span>
              <div className="flex gap-2">
                <Btn onClick={() => setPage(page - 1)} disabled={page <= 1}>Previous</Btn>
                <Btn onClick={() => setPage(page + 1)} disabled={page >= pages}>Next</Btn>
              </div>
            </div>
          </div>
        )}
      </Card>
      {detail ? <ExecutionDetail id={detail} onClose={() => setDetail(null)} /> : null}
    </div>
  );
}

export default function ZoikoWorkflowPage() {
  const [workspaces, setWorkspaces] = useState(null);
  const [workflows, setWorkflows] = useState([]);
  const [recent, setRecent] = useState([]);
  const [meta, setMeta] = useState(null);
  const [webhooks, setWebhooks] = useState([]);
  const [loadError, setLoadError] = useState("");
  const [view, setView] = useState("main");
  const [dialog, setDialog] = useState(null); // {kind, workflow?}
  const [detail, setDetail] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [notice, setNotice] = useState("");
  const act = useAction();

  const load = useCallback(async () => {
    try {
      const [ws, wf, ex, m, wh] = await Promise.all([
        integrationsService.getWorkspaces(),
        integrationsService.getWorkflows(),
        integrationsService.getExecutions({ page: 1, page_size: 5 }),
        integrationsService.getWorkflowMeta(),
        integrationsService.getWebhooks(),
      ]);
      setWorkspaces(ws.workspaces || []);
      setWorkflows(wf.workflows || []);
      setRecent(ex.executions || []);
      setMeta(m);
      setWebhooks(wh.webhooks || []);
      setLoadError("");
    } catch (e) {
      setLoadError(e?.message || "Failed to load Zoiko Workflow.");
      setWorkspaces((p) => p || []);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function toggle(w) {
    await act.run(() => (w.is_active ? integrationsService.deactivateWorkflow(w.id) : integrationsService.activateWorkflow(w.id)));
    load();
  }
  async function runNow(w) {
    setNotice("");
    const ex = await act.run(() => integrationsService.runWorkflow(w.id));
    if (ex) setNotice(`Run #${ex.id} of “${w.name}” finished: ${ex.status}${ex.error ? ` — ${ex.error}` : ""}`);
    load();
  }
  async function del() {
    const ok = await act.run(() => integrationsService.deleteWorkflow(confirmDelete.id));
    if (ok) { setConfirmDelete(null); load(); }
  }

  if (view === "log") {
    return <SuperAdminOnly><ExecutionsLog workflows={workflows} onBack={() => { setView("main"); load(); }} /></SuperAdminOnly>;
  }

  const active = workflows.filter((w) => w.is_active);
  return (
    <SuperAdminOnly>
      <div className="space-y-6 font-sans">
        <PageHeader title="Zoiko Workflow" description="Automate platform events with ordered steps."
          action={
            <div className="flex gap-2">
              <Btn onClick={() => setDialog({ kind: "workspace" })}>Create Workspace</Btn>
              <Btn tone="primary" onClick={() => setDialog({ kind: "workflow" })} disabled={!workspaces || workspaces.length === 0 || !meta}
                title={workspaces && workspaces.length === 0 ? "Create a workspace first" : ""}>Create Workflow</Btn>
            </div>
          } />
        <ErrorNote message={loadError || act.error} />
        {notice ? <div className="rounded-xl border border-slate-200 bg-white p-3 text-xs text-slate-600">{notice}</div> : null}

        {workspaces === null ? <Spinner /> : (
          <>
            <Card title="Workspaces">
              {workspaces.length === 0 ? (
                <p className="text-sm text-slate-500">No workspaces yet. Create one to start adding workflows.</p>
              ) : (
                <div className="grid gap-3 md:grid-cols-3">
                  {workspaces.map((w) => (
                    <div key={w.id} className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
                      <p className="text-sm font-bold text-slate-800">{w.name}</p>
                      {w.description ? <p className="mt-1 text-xs text-slate-400">{w.description}</p> : null}
                      <p className="mt-2 text-xs text-slate-500">{w.workflow_count} workflow{w.workflow_count === 1 ? "" : "s"}</p>
                    </div>
                  ))}
                </div>
              )}
            </Card>

            <Card title="Active Orchestration Flows" icon={WorkflowIcon}>
              {workflows.length === 0 ? (
                <p className="text-sm text-slate-500">No workflows yet.</p>
              ) : (
                <div className="space-y-3">
                  {workflows.map((w) => (
                    <div key={w.id} className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <p className="text-sm font-bold text-slate-800">{w.name}</p>
                          <p className="mt-1 text-xs text-slate-400">
                            {w.workspace_name} · Trigger: {w.trigger_event} · {w.step_count} step{w.step_count === 1 ? "" : "s"}
                          </p>
                          <p className="mt-1 text-xs text-slate-400">
                            Last run: {w.last_run_at ? `${fmt(w.last_run_at)} (${w.last_run_status})` : "never"}
                          </p>
                        </div>
                        <StatusPill status={w.is_active ? "Active" : "Inactive"} />
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <Btn onClick={() => toggle(w)} disabled={act.pending}>{w.is_active ? "Deactivate" : "Activate"}</Btn>
                        <Btn onClick={() => runNow(w)} disabled={act.pending}>Run now</Btn>
                        <Btn onClick={() => setDialog({ kind: "workflow", workflow: w })}>Edit</Btn>
                        <Btn tone="danger" onClick={() => setConfirmDelete(w)}>Delete</Btn>
                      </div>
                    </div>
                  ))}
                  <p className="text-xs text-slate-400">{active.length} of {workflows.length} active</p>
                </div>
              )}
            </Card>

            <Card title="Recent Activity" icon={Activity}
              action={<Btn onClick={() => setView("log")}>View Executions Log</Btn>}>
              {recent.length === 0 ? (
                <p className="text-sm text-slate-500">No executions yet. Activate a workflow or use “Run now”.</p>
              ) : (
                <div className="space-y-2">
                  {recent.map((e) => (
                    <button key={e.id} type="button" onClick={() => setDetail(e.id)}
                      className="flex w-full flex-wrap items-center justify-between gap-2 rounded-2xl border border-slate-100 bg-slate-50 p-3 text-left text-xs hover:bg-slate-100">
                      <span className="font-semibold text-slate-800">{e.workflow_name} <span className="font-normal text-slate-400">· {e.trigger_event}</span></span>
                      <span className="flex items-center gap-3 text-slate-400">{fmt(e.created_at)} <StatusPill status={e.status} /></span>
                    </button>
                  ))}
                </div>
              )}
            </Card>
          </>
        )}

        {dialog?.kind === "workspace" ? <WorkspaceDialog onClose={() => setDialog(null)} onCreated={() => { setDialog(null); load(); }} /> : null}
        {dialog?.kind === "workflow" && meta ? (
          <WorkflowDialog workflow={dialog.workflow} workspaces={workspaces} meta={meta} webhooks={webhooks}
            onClose={() => setDialog(null)} onSaved={() => { setDialog(null); load(); }} />
        ) : null}
        {detail ? <ExecutionDetail id={detail} onClose={() => setDetail(null)} /> : null}
        {confirmDelete ? (
          <Modal title="Delete workflow?" onClose={() => setConfirmDelete(null)}>
            <ErrorNote message={act.error} />
            <p className="text-sm text-slate-600">“{confirmDelete.name}” will be removed. Its execution history is kept.</p>
            <div className="mt-4 flex justify-end gap-2">
              <Btn onClick={() => setConfirmDelete(null)} disabled={act.pending}>Cancel</Btn>
              <Btn tone="danger" onClick={del} disabled={act.pending}>{act.pending ? "Deleting…" : "Delete"}</Btn>
            </div>
          </Modal>
        ) : null}
      </div>
    </SuperAdminOnly>
  );
}
