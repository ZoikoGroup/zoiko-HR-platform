import React, { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import PageHeader from "../../components/PageHeader";
import { Layers, Webhook } from "lucide-react";
import { integrationsService } from "../../service/integrationsService";
import {
  Btn, Card, ErrorNote, Field, Modal, Spinner, StatusPill, SuperAdminOnly, fmt, inputCls, useAction, useIsSuperAdmin,
} from "./integrationsUi";

function SecretReveal({ secret, onClose }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(secret);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }
  return (
    <Modal title="Signing secret" onClose={onClose}>
      <div className="mb-3 rounded-xl border border-amber-100 bg-amber-50 p-3 text-xs text-amber-700">
        Copy this secret now. It will not be shown again — if you lose it, rotate the secret.
      </div>
      <code className="block break-all rounded-xl bg-slate-100 p-3 text-xs text-slate-800">{secret}</code>
      <div className="mt-4 flex justify-end gap-2">
        <Btn onClick={copy}>{copied ? "Copied" : "Copy"}</Btn>
        <Btn tone="primary" onClick={onClose}>I've saved it</Btn>
      </div>
    </Modal>
  );
}

function label(key) {
  const s = String(key).replace(/_/g, " ");
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function FactList({ facts }) {
  const entries = Object.entries(facts || {}).filter(([, v]) => v !== null && v !== undefined && v !== "");
  if (entries.length === 0) return null;
  return (
    <dl className="mt-2 space-y-0.5">
      {entries.map(([k, v]) => (
        <div key={k} className="flex gap-2 text-[11px]">
          <dt className="shrink-0 text-slate-400">{label(k)}</dt>
          <dd className="min-w-0 break-all text-slate-600">{Array.isArray(v) ? v.join(", ") || "—" : String(v)}</dd>
        </div>
      ))}
    </dl>
  );
}

function ApplicationCard({ app }) {
  const metrics = Object.entries(app.metrics || {});
  const setup = app.href && /not (connected|configured|available)/i.test(app.status || "");
  return (
    <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-bold text-slate-800">{app.name}</p>
          {app.last_activity_at ? (
            <p className="mt-1 text-xs text-slate-400">
              Last activity {fmt(app.last_activity_at)}{app.last_activity ? ` · ${app.last_activity}` : ""}
            </p>
          ) : null}
          {setup ? <Link to={app.href} className="mt-1 block text-xs text-[#3B82F6] hover:underline">Set up</Link> : null}
        </div>
        <StatusPill status={app.status} />
      </div>
      <FactList facts={app.details} />
      {metrics.length ? (
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
          {metrics.map(([k, v]) => (
            <span key={k} className="text-[11px] text-slate-500">
              <span className="font-semibold text-slate-700">{v}</span> {label(k).toLowerCase()}
            </span>
          ))}
        </div>
      ) : null}
      {app.last_error ? <p className="mt-2 text-[11px] text-red-500">{app.last_error}</p> : null}
    </div>
  );
}

function WebhookForm({ events, onClose, onCreated }) {
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [selected, setSelected] = useState([]);
  const { pending, error, run } = useAction();

  function toggle(key) {
    setSelected((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));
  }

  async function submit(e) {
    e.preventDefault();
    const created = await run(() => integrationsService.createWebhook({ name, url, events: selected }));
    if (created) onCreated(created.signing_secret);
  }

  return (
    <Modal title="Register New Webhook" onClose={onClose}>
      <form onSubmit={submit}>
        <ErrorNote message={error} />
        <Field label="Name">
          <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} required maxLength={120} />
        </Field>
        <Field label="Endpoint URL" hint="Must be a public https URL. Private and internal addresses are rejected.">
          <input className={inputCls} type="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://example.com/hooks/zoiko" required />
        </Field>
        <p className="mb-1 text-xs font-semibold text-slate-600">Events</p>
        <div className="mb-3 max-h-64 space-y-1 overflow-y-auto">
          {events.map((ev) => (
            <label key={ev.key} className="flex items-start gap-2 text-xs text-slate-600">
              <input type="checkbox" className="mt-0.5" checked={selected.includes(ev.key)} onChange={() => toggle(ev.key)} />
              <span>
                <span className="font-semibold text-slate-800">{ev.key}</span> — {ev.description}
                <span className="ml-1 text-slate-400">
                  · {ev.subscribed_webhooks} subscribed · {ev.deliveries} deliveries
                  {ev.last_delivery_at ? ` · last ${fmt(ev.last_delivery_at)}` : ""}
                </span>
              </span>
            </label>
          ))}
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <Btn onClick={onClose} disabled={pending}>Cancel</Btn>
          <Btn tone="primary" type="submit" disabled={pending || selected.length === 0}>{pending ? "Registering…" : "Register"}</Btn>
        </div>
      </form>
    </Modal>
  );
}

function DeliveriesDialog({ webhook, onClose, onChanged }) {
  const [data, setData] = useState(null);
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState(null);
  const { pending, error, run } = useAction();

  const load = useCallback(async () => {
    const res = await integrationsService.getDeliveries(webhook.id, { page, page_size: 10 });
    setData(res);
  }, [webhook.id, page]);

  useEffect(() => {
    load().catch(() => setData({ deliveries: [], total: 0 }));
  }, [load]);

  async function retry(id) {
    await run(() => integrationsService.retryDelivery(id));
    await load();
    onChanged();
  }

  const pages = data ? Math.max(1, Math.ceil(data.total / 10)) : 1;
  return (
    <Modal title={`Deliveries — ${webhook.name}`} onClose={onClose} wide>
      <ErrorNote message={error} />
      {data === null ? (
        <Spinner />
      ) : data.deliveries.length === 0 ? (
        <p className="text-sm text-slate-500">No deliveries yet. Send a test event to see one here.</p>
      ) : (
        <div className="space-y-2">
          {data.deliveries.map((d) => (
            <div key={d.id} className="rounded-2xl border border-slate-100 bg-slate-50 p-3 text-xs">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <span className="font-semibold text-slate-800">{d.event_type}</span>
                  <span className="ml-2 text-slate-400">{fmt(d.last_attempt_at || d.created_at)}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-slate-500">
                    {d.response_status ? `HTTP ${d.response_status}` : "no response"}
                    {d.duration_ms != null ? ` · ${d.duration_ms} ms` : ""} · attempt {d.attempt}
                  </span>
                  <StatusPill status={d.status} />
                  {d.status !== "success" ? <Btn onClick={() => retry(d.id)} disabled={pending}>Retry</Btn> : null}
                  <Btn onClick={() => setOpen(open === d.id ? null : d.id)}>{open === d.id ? "Hide" : "Details"}</Btn>
                </div>
              </div>
              {d.error ? <p className="mt-1 text-red-500">{d.error}</p> : null}
              {d.next_attempt_at && d.status === "pending" ? <p className="mt-1 text-slate-400">Next retry: {fmt(d.next_attempt_at)}</p> : null}
              {open === d.id ? (
                <div className="mt-2 space-y-2">
                  <div>
                    <p className="font-semibold text-slate-600">Payload</p>
                    <pre className="max-h-48 overflow-auto rounded-xl bg-white p-2 text-[11px]">{JSON.stringify(d.payload, null, 2)}</pre>
                  </div>
                  <div>
                    <p className="font-semibold text-slate-600">Response</p>
                    <pre className="max-h-32 overflow-auto rounded-xl bg-white p-2 text-[11px]">{d.response_body || "—"}</pre>
                  </div>
                </div>
              ) : null}
            </div>
          ))}
          <div className="flex items-center justify-between pt-2 text-xs text-slate-500">
            <span>Page {page} of {pages}</span>
            <div className="flex gap-2">
              <Btn onClick={() => setPage(page - 1)} disabled={page <= 1}>Previous</Btn>
              <Btn onClick={() => setPage(page + 1)} disabled={page >= pages}>Next</Btn>
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
}

function WebhookRow({ webhook, onAction, busy }) {
  const status = webhook.auto_disabled ? "Auto-disabled" : webhook.is_active ? "Active" : "Disabled";
  return (
    <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-bold text-slate-800">{webhook.name}</p>
          <p className="mt-1 break-all font-mono text-xs text-slate-500">{webhook.url}</p>
          <p className="mt-1 text-xs text-slate-400">Events: {webhook.events.join(", ")}</p>
          <p className="mt-1 text-xs text-slate-400">
            Secret {webhook.secret} · Last delivery: {webhook.last_delivery_at ? `${fmt(webhook.last_delivery_at)} (${webhook.last_delivery_status})` : "none yet"}
          </p>
          {webhook.auto_disabled ? (
            <p className="mt-1 text-xs text-red-500">Disabled automatically after {webhook.consecutive_failures} consecutive failed deliveries. Fix the endpoint, then enable it again.</p>
          ) : null}
        </div>
        <StatusPill status={status} />
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <Btn onClick={() => onAction("deliveries", webhook)}>Deliveries</Btn>
        <Btn onClick={() => onAction("test", webhook)} disabled={busy}>Send test event</Btn>
        <Btn onClick={() => onAction(webhook.is_active ? "disable" : "enable", webhook)} disabled={busy}>{webhook.is_active ? "Disable" : "Enable"}</Btn>
        <Btn onClick={() => onAction("rotate", webhook)} disabled={busy}>Rotate secret</Btn>
        <Btn tone="danger" onClick={() => onAction("delete", webhook)} disabled={busy}>Delete</Btn>
      </div>
    </div>
  );
}

export default function ZoikoHubPage() {
  const isSuperAdmin = useIsSuperAdmin();
  const [apps, setApps] = useState(null);
  const [webhooks, setWebhooks] = useState(null);
  const [events, setEvents] = useState([]);
  const [loadError, setLoadError] = useState("");
  const [registering, setRegistering] = useState(false);
  const [secret, setSecret] = useState(null);
  const [viewing, setViewing] = useState(null);
  const [confirm, setConfirm] = useState(null); // {kind, webhook}
  const [notice, setNotice] = useState("");
  const act = useAction();

  const load = useCallback(async () => {
    if (!isSuperAdmin) return;
    try {
      const [a, w, e] = await Promise.all([
        integrationsService.getApplications(),
        integrationsService.getWebhooks(),
        integrationsService.getEvents(),
      ]);
      setApps(a.applications || []);
      setWebhooks(w.webhooks || []);
      setEvents(e.events || []);
      setLoadError("");
    } catch (err) {
      setLoadError(err?.message || "Failed to load Zoiko Hub.");
      setApps((p) => p || []);
      setWebhooks((p) => p || []);
    }
  }, [isSuperAdmin]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleAction(kind, webhook) {
    setNotice("");
    if (kind === "deliveries") return setViewing(webhook);
    if (kind === "delete" || kind === "rotate") return setConfirm({ kind, webhook });
    if (kind === "test") {
      const res = await act.run(() => integrationsService.testWebhook(webhook.id));
      if (res) setNotice(res.status === "success" ? `Test event delivered (HTTP ${res.response_status}).` : `Test event failed: ${res.error || "no response"}`);
    } else if (kind === "enable") {
      await act.run(() => integrationsService.enableWebhook(webhook.id));
    } else if (kind === "disable") {
      await act.run(() => integrationsService.disableWebhook(webhook.id));
    }
    load();
  }

  async function runConfirmed() {
    const { kind, webhook } = confirm;
    const res = await act.run(() =>
      kind === "delete" ? integrationsService.deleteWebhook(webhook.id) : integrationsService.rotateWebhookSecret(webhook.id)
    );
    if (res) {
      setConfirm(null);
      if (kind === "rotate") setSecret(res.signing_secret);
      load();
    }
  }

  return (
    <SuperAdminOnly>
      <div className="space-y-6 font-sans">
        <PageHeader
          title="Zoiko Hub"
          description="Connected applications and outbound webhooks."
          action={<Btn tone="primary" onClick={() => setRegistering(true)} disabled={events.length === 0}>Register New Webhook</Btn>}
        />
        <ErrorNote message={loadError || act.error} />
        {notice ? <div className="rounded-xl border border-slate-200 bg-white p-3 text-xs text-slate-600">{notice}</div> : null}

        <Card title="Integrated Applications" icon={Layers}>
          {apps === null ? (
            <Spinner />
          ) : apps.length === 0 ? (
            <p className="text-sm text-slate-500">No integration sources are available.</p>
          ) : (
            <div className="grid gap-3 md:grid-cols-2">
              {apps.map((a) => <ApplicationCard key={a.key} app={a} />)}
            </div>
          )}
        </Card>

        <Card title="Outbound Webhooks" icon={Webhook}>
          {webhooks === null ? (
            <Spinner />
          ) : webhooks.length === 0 ? (
            <p className="text-sm text-slate-500">No webhooks registered yet. Use “Register New Webhook” to send signed platform events to your own endpoint.</p>
          ) : (
            <div className="space-y-3">
              {webhooks.map((w) => <WebhookRow key={w.id} webhook={w} onAction={handleAction} busy={act.pending} />)}
            </div>
          )}
        </Card>

        {registering ? (
          <WebhookForm
            events={events}
            onClose={() => setRegistering(false)}
            onCreated={(s) => { setRegistering(false); setSecret(s); load(); }}
          />
        ) : null}
        {secret ? <SecretReveal secret={secret} onClose={() => setSecret(null)} /> : null}
        {viewing ? <DeliveriesDialog webhook={viewing} onClose={() => setViewing(null)} onChanged={load} /> : null}
        {confirm ? (
          <Modal title={confirm.kind === "delete" ? "Delete webhook?" : "Rotate signing secret?"} onClose={() => setConfirm(null)}>
            <ErrorNote message={act.error} />
            <p className="text-sm text-slate-600">
              {confirm.kind === "delete"
                ? `“${confirm.webhook.name}” and its delivery log will be permanently removed.`
                : "The current secret stops working immediately. Your endpoint must switch to the new secret."}
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <Btn onClick={() => setConfirm(null)} disabled={act.pending}>Cancel</Btn>
              <Btn tone={confirm.kind === "delete" ? "danger" : "primary"} onClick={runConfirmed} disabled={act.pending}>
                {act.pending ? "Working…" : confirm.kind === "delete" ? "Delete" : "Rotate"}
              </Btn>
            </div>
          </Modal>
        ) : null}
      </div>
    </SuperAdminOnly>
  );
}
