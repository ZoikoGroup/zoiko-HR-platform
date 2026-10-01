import React, { useCallback, useEffect, useMemo, useState } from "react";
import PageHeader from "../../components/PageHeader";
import { Activity, Building2, Globe2, Workflow as WorkflowIcon } from "lucide-react";
import { integrationsService } from "../../service/integrationsService";
import OrgActivityFeed from "./OrgActivityFeed";
import { getOrganizations } from "../../service/documentsService";
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

const STEP_TONE = {
  notification: "bg-blue-50 text-blue-700 border-blue-100",
  email: "bg-indigo-50 text-indigo-700 border-indigo-100",
  slack: "bg-purple-50 text-purple-700 border-purple-100",
  sms: "bg-teal-50 text-teal-700 border-teal-100",
  webhook: "bg-orange-50 text-orange-700 border-orange-100",
  delay: "bg-slate-100 text-slate-600 border-slate-200",
};

const ALL = "";          // every organization
const PLATFORM = "0";    // platform-wide workspaces only

function stepLabel(step) {
  switch (step.type) {
    case "notification": return "In-app notification";
    case "email": return `Email${step.to ? ` → ${step.to}` : ""}`;
    case "slack": return "Slack message";
    case "sms": return `SMS${step.to ? ` → ${step.to}` : ""}`;
    case "webhook": return "Call webhook";
    case "delay": return `Wait ${step.seconds}s`;
    default: return step.type;
  }
}

/** Trigger → steps, drawn as a left-to-right flow so what a workflow does is obvious at a glance. */
function FlowDiagram({ trigger, steps }) {
  return (
    <ol className="flex flex-wrap items-center gap-1.5 text-[11px]" aria-label="Workflow flow">
      <li className="rounded-lg border border-emerald-100 bg-emerald-50 px-2 py-1 font-semibold text-emerald-700">When {trigger}</li>
      {steps.map((s, i) => (
        <React.Fragment key={i}>
          <li aria-hidden="true" className="text-slate-300">→</li>
          <li className={`rounded-lg border px-2 py-1 font-medium ${STEP_TONE[s.type] || STEP_TONE.delay}`}>
            <span className="mr-1 text-[9px] opacity-60">{i + 1}</span>{stepLabel(s)}
          </li>
        </React.Fragment>
      ))}
    </ol>
  );
}

function scopeKey(orgId) {
  return orgId ? String(orgId) : PLATFORM;
}

function OrgCard({ row, selected, onSelect }) {
  const platform = !row.organization_id;
  const failing = row.failed_7d > 0;
  return (
    <button
      type="button"
      onClick={() => onSelect(scopeKey(row.organization_id))}
      aria-pressed={selected}
      aria-label={`${row.organization_name} workflows`}
      className={`rounded-2xl border p-4 text-left transition ${selected ? "border-[#3B82F6] bg-blue-50 shadow-sm" : "border-slate-200 bg-white hover:bg-slate-50"}`}
    >
      <div className="flex items-center gap-2">
        {platform ? <Globe2 className="h-4 w-4 text-slate-400" /> : <Building2 className="h-4 w-4 text-slate-400" />}
        <p className="truncate text-sm font-bold text-slate-800">{row.organization_name}</p>
      </div>
      <p className="mt-2 text-xs text-slate-600">
        {row.workflows === 0 ? (
          <span className="text-slate-500">No automation yet</span>
        ) : (
          <>
            <span className="font-bold text-slate-800">{row.active_workflows}</span> of {row.workflows} workflow{row.workflows === 1 ? "" : "s"} active
          </>
        )}
        <span className="text-slate-400"> · {row.workspaces} workspace{row.workspaces === 1 ? "" : "s"}</span>
        {row.organization_code ? <span className="text-slate-400"> · {row.organization_code}</span> : null}
      </p>
      <p className="mt-1 text-[11px] text-slate-500">
        {row.runs_7d} run{row.runs_7d === 1 ? "" : "s"} in 7 days
        {failing ? <span className="ml-1 rounded-full bg-red-50 px-1.5 py-0.5 font-bold text-red-600">{row.failed_7d} failed</span> : null}
      </p>
      <p className="mt-1 text-[11px] text-slate-400">
        {row.last_run_at ? `Last run ${fmt(row.last_run_at)} (${row.last_run_status})` : "No runs yet"}
      </p>
    </button>
  );
}

function WorkspaceDialog({ orgs, defaultOrg, onClose, onCreated }) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [organizationId, setOrganizationId] = useState(defaultOrg && defaultOrg !== ALL && defaultOrg !== PLATFORM ? defaultOrg : "");
  const { pending, error, run } = useAction();

  async function submit(e) {
    e.preventDefault();
    const ws = await run(() => integrationsService.createWorkspace({
      name, description: description || null, organization_id: organizationId ? Number(organizationId) : null,
    }));
    if (ws) onCreated();
  }

  return (
    <Modal title="Create Workspace" onClose={onClose}>
      <form onSubmit={submit}>
        <ErrorNote message={error} />
        <Field label="Name"><input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} required maxLength={120} /></Field>
        <Field label="Applies to" hint="An organization workspace only reacts to that organization's events. Platform-wide reacts to every organization's.">
          <select className={inputCls} aria-label="Applies to" value={organizationId} onChange={(e) => setOrganizationId(e.target.value)}>
            <option value="">Platform-wide (all organizations)</option>
            {orgs.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
          </select>
        </Field>
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

function WorkflowDialog({ workflow, workspaces, defaultWorkspaceId, meta, webhooks, onClose, onSaved }) {
  const [form, setForm] = useState(() => workflow ? {
    workspace_id: workflow.workspace_id, name: workflow.name, description: workflow.description || "",
    trigger_event: workflow.trigger_event, steps: workflow.steps,
  } : {
    workspace_id: defaultWorkspaceId || workspaces[0]?.id || "", name: "", description: "", trigger_event: meta.triggers[0]?.key || "", steps: [],
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
          <Field label="Workspace (decides which organization it applies to)">
            <select className={inputCls} value={form.workspace_id} disabled={!!workflow} onChange={(e) => setForm({ ...form, workspace_id: e.target.value })}>
              {workspaces.map((w) => <option key={w.id} value={w.id}>{w.name} — {w.organization_name}</option>)}
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
            <span className="text-slate-400">{ex.organization_name} · {ex.trigger_event} · {ex.triggered_by} · started {fmt(ex.started_at || ex.created_at)}</span>
          </div>
          {ex.error ? <ErrorNote message={ex.error} /> : null}
          {ex.status === "waiting" ? <p className="text-slate-500">Waiting until {fmt(ex.resume_at)}.</p> : null}
          {(ex.steps || []).map((s, i) => {
            const r = (ex.step_results || []).find((x) => x.index === i);
            return (
              <div key={i} className="rounded-2xl border border-slate-100 bg-slate-50 p-3">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-slate-700">Step {i + 1}: {stepLabel(s)}</span>
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

function ExecutionsLog({ workflows, orgs, initialOrg, onBack }) {
  const [filters, setFilters] = useState({ organization_id: initialOrg ?? ALL, workflow_id: "", status: "", date_from: "", date_to: "" });
  const [page, setPage] = useState(1);
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [detail, setDetail] = useState(null);

  const load = useCallback(async () => {
    const params = { page, page_size: 15 };
    Object.entries(filters).forEach(([k, v]) => { if (v !== "") params[k] = k.startsWith("date") ? new Date(v).toISOString() : v; });
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
      <PageHeader title="Workflow Executions" description="Every workflow run, across organizations, with its per-step results."
        action={<Btn onClick={onBack}>← Back to workflows</Btn>} />
      <Card title="Executions" icon={Activity}>
        <ErrorNote message={error} />
        <div className="mb-4 grid gap-3 md:grid-cols-5">
          <select className={inputCls} aria-label="Organization" value={filters.organization_id} onChange={(e) => set("organization_id", e.target.value)}>
            <option value="">All organizations</option>
            <option value="0">Platform-wide</option>
            {orgs.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
          </select>
          <select className={inputCls} aria-label="Workflow" value={filters.workflow_id} onChange={(e) => set("workflow_id", e.target.value)}>
            <option value="">All workflows</option>
            {workflows.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
          </select>
          <select className={inputCls} aria-label="Status" value={filters.status} onChange={(e) => set("status", e.target.value)}>
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
                <span><span className="font-semibold text-slate-800">#{e.id} {e.workflow_name}</span>
                  <span className="ml-1 rounded-full bg-white px-2 py-0.5 text-[10px] font-semibold text-slate-500">{e.organization_name}</span>
                  <span className="text-slate-400"> · {e.trigger_event} · {e.triggered_by}</span></span>
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

function WorkflowCard({ w, busy, onToggle, onRun, onEdit, onDelete }) {
  return (
    <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-bold text-slate-800">{w.name}</p>
          <p className="mt-0.5 text-[11px] text-slate-400">{w.workspace_name}{w.description ? ` · ${w.description}` : ""}</p>
        </div>
        <StatusPill status={w.is_active ? "Active" : "Inactive"} />
      </div>
      <div className="mt-3"><FlowDiagram trigger={w.trigger_event} steps={w.steps} /></div>
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-slate-500">
        <span>{w.runs} run{w.runs === 1 ? "" : "s"}</span>
        <span>{w.success_rate === null ? "No success rate yet" : `${w.success_rate}% succeeded`}{w.failed ? ` · ${w.failed} failed` : ""}</span>
        <span>{w.last_run_at ? `Last run ${fmt(w.last_run_at)} (${w.last_run_status})` : "Never run"}</span>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <Btn onClick={() => onToggle(w)} disabled={busy}>{w.is_active ? "Deactivate" : "Activate"}</Btn>
        <Btn onClick={() => onRun(w)} disabled={busy}>Run now</Btn>
        <Btn onClick={() => onEdit(w)}>Edit</Btn>
        <Btn tone="danger" onClick={() => onDelete(w)}>Delete</Btn>
      </div>
    </div>
  );
}

export default function ZoikoWorkflowPage() {
  const [overview, setOverview] = useState(null);
  const [workspaces, setWorkspaces] = useState(null);
  const [workflows, setWorkflows] = useState([]);
  const [recent, setRecent] = useState([]);
  const [meta, setMeta] = useState(null);
  const [webhooks, setWebhooks] = useState([]);
  const [orgs, setOrgs] = useState([]);
  const [selected, setSelected] = useState(ALL);
  const [loadError, setLoadError] = useState("");
  const [view, setView] = useState("main");
  const [tab, setTab] = useState("activity"); // activity | automations
  const [dialog, setDialog] = useState(null); // {kind, workflow?}
  const [detail, setDetail] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [notice, setNotice] = useState("");
  const act = useAction();

  useEffect(() => {
    getOrganizations().then((r) => setOrgs(r.organizations || [])).catch(() => setOrgs([]));
  }, []);

  const load = useCallback(async () => {
    const scope = selected === ALL ? undefined : { organization_id: selected };
    try {
      const [ov, ws, wf, ex, m, wh] = await Promise.all([
        integrationsService.getWorkflowOverview(),
        integrationsService.getWorkspaces(scope),
        integrationsService.getWorkflows(scope),
        integrationsService.getExecutions({ page: 1, page_size: 5, ...(scope || {}) }),
        integrationsService.getWorkflowMeta(),
        integrationsService.getWebhooks(),
      ]);
      setOverview(ov);
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
  }, [selected]);

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

  // Group the visible workflows by organization so each organization's automation reads as its own block.
  const groups = useMemo(() => {
    const map = new Map();
    workflows.forEach((w) => {
      const key = scopeKey(w.organization_id);
      if (!map.has(key)) map.set(key, { key, name: w.organization_name, platform: !w.organization_id, items: [] });
      map.get(key).items.push(w);
    });
    return [...map.values()].sort((a, b) => Number(a.platform) - Number(b.platform) || a.name.localeCompare(b.name));
  }, [workflows]);

  if (view === "log") {
    return <SuperAdminOnly><ExecutionsLog workflows={workflows} orgs={orgs} initialOrg={selected} onBack={() => { setView("main"); load(); }} /></SuperAdminOnly>;
  }

  const orgRowCount = overview?.organizations.length;
  const selectedName = selected === ALL ? "All organizations"
    : overview?.organizations.find((o) => scopeKey(o.organization_id) === selected)?.organization_name || "Selected organization";
  const totals = overview?.totals;

  return (
    <SuperAdminOnly>
      <div className="space-y-6 font-sans">
        <PageHeader title="Zoiko Workflow" description="Automations for every organization, and for the whole platform, in one place."
          action={
            <div className="flex gap-2">
              <Btn onClick={() => setDialog({ kind: "workspace" })}>Create Workspace</Btn>
              <Btn tone="primary" onClick={() => setDialog({ kind: "workflow" })} disabled={!workspaces || workspaces.length === 0 || !meta}
                title={workspaces && workspaces.length === 0 ? "Create a workspace first" : ""}>Create Workflow</Btn>
            </div>
          } />
        <div className="flex gap-2" role="tablist" aria-label="Workflow sections">
          {[["activity", "Activity"], ["automations", "Automations"]].map(([key, label]) => (
            <button key={key} type="button" role="tab" aria-selected={tab === key} onClick={() => setTab(key)}
              className={`rounded-xl border px-4 py-1.5 text-xs font-semibold ${tab === key ? "border-[#3B82F6] bg-[#3B82F6] text-white" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`}>
              {label}
            </button>
          ))}
        </div>
        <ErrorNote message={loadError || act.error} />
        {notice ? <div className="rounded-xl border border-slate-200 bg-white p-3 text-xs text-slate-600">{notice}</div> : null}

        {tab === "activity" ? <OrgActivityFeed /> : workspaces === null ? <Spinner /> : (
          <>
            {totals ? (
              <div className="grid gap-3 md:grid-cols-5" aria-label="Workflow totals">
                {[["Workspaces", totals.workspaces], ["Workflows", totals.workflows], ["Active", totals.active_workflows],
                  ["Runs (7 days)", totals.runs_7d], ["Failed (7 days)", totals.failed_7d]].map(([label, n]) => (
                  <div key={label} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">{label}</p>
                    <p className={`mt-1 text-2xl font-bold ${label.startsWith("Failed") && n > 0 ? "text-red-600" : "text-slate-800"}`}>{n}</p>
                  </div>
                ))}
              </div>
            ) : null}

            <Card title={orgRowCount ? `Organizations (${orgRowCount})` : "Organizations"} icon={Building2}
              action={selected !== ALL ? <Btn onClick={() => setSelected(ALL)}>Show all organizations</Btn> : null}>
              {overview && overview.organizations.length === 0 ? (
                <p className="text-sm text-slate-500">There are no organizations on the platform yet. Create one first, then give it a workspace.</p>
              ) : (
                <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                  {(overview?.organizations || []).map((row) => (
                    <OrgCard key={scopeKey(row.organization_id)} row={row} selected={selected === scopeKey(row.organization_id)} onSelect={setSelected} />
                  ))}
                </div>
              )}
            </Card>

            <Card title={`Workflows · ${selectedName}`} icon={WorkflowIcon}>
              {workspaces.length === 0 ? (
                <p className="mb-3 text-sm text-slate-500">No workspaces yet. Create one to start adding workflows.</p>
              ) : (
                <div className="mb-4 flex flex-wrap gap-2" aria-label="Workspaces">
                  {workspaces.map((w) => (
                    <span key={w.id} className="rounded-full border border-slate-200 bg-white px-3 py-1 text-[11px] text-slate-600">
                      <span className="font-semibold text-slate-800">{w.name}</span> · {w.organization_name} · {w.workflow_count} workflow{w.workflow_count === 1 ? "" : "s"}
                    </span>
                  ))}
                </div>
              )}
              {workflows.length === 0 ? (
                <p className="text-sm text-slate-500">No workflows yet.</p>
              ) : (
                <div className="space-y-6">
                  {groups.map((g) => (
                    <section key={g.key} aria-label={`${g.name} workflows`}>
                      <h4 className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-500">
                        {g.platform ? <Globe2 className="h-3.5 w-3.5" /> : <Building2 className="h-3.5 w-3.5" />}
                        {g.name}
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold normal-case text-slate-500">
                          {g.items.filter((i) => i.is_active).length} of {g.items.length} active
                        </span>
                      </h4>
                      <div className="space-y-3">
                        {g.items.map((w) => (
                          <WorkflowCard key={w.id} w={w} busy={act.pending} onToggle={toggle} onRun={runNow}
                            onEdit={(wf) => setDialog({ kind: "workflow", workflow: wf })} onDelete={setConfirmDelete} />
                        ))}
                      </div>
                    </section>
                  ))}
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
                      <span className="font-semibold text-slate-800">{e.workflow_name}
                        <span className="ml-1 rounded-full bg-white px-2 py-0.5 text-[10px] font-semibold text-slate-500">{e.organization_name}</span>
                        <span className="font-normal text-slate-400"> · {e.trigger_event}</span></span>
                      <span className="flex items-center gap-3 text-slate-400">{fmt(e.created_at)} <StatusPill status={e.status} /></span>
                    </button>
                  ))}
                </div>
              )}
            </Card>
          </>
        )}

        {dialog?.kind === "workspace" ? (
          <WorkspaceDialog orgs={orgs} defaultOrg={selected} onClose={() => setDialog(null)} onCreated={() => { setDialog(null); load(); }} />
        ) : null}
        {dialog?.kind === "workflow" && meta ? (
          <WorkflowDialog workflow={dialog.workflow} workspaces={workspaces} meta={meta} webhooks={webhooks}
            defaultWorkspaceId={workspaces[0]?.id}
            onClose={() => setDialog(null)} onSaved={() => { setDialog(null); load(); }} />
        ) : null}
        {detail ? <ExecutionDetail id={detail} onClose={() => setDetail(null)} /> : null}
        {confirmDelete ? (
          <Modal title="Delete workflow?" onClose={() => setConfirmDelete(null)}>
            <ErrorNote message={act.error} />
            <p className="text-sm text-slate-600">“{confirmDelete.name}” ({confirmDelete.organization_name}) will be removed. Its execution history is kept.</p>
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
