import React, { useCallback, useEffect, useState } from "react";
import PageHeader from "../../components/PageHeader";
import { Globe, Send } from "lucide-react";
import { integrationsService } from "../../service/integrationsService";
import {
  Btn, Card, ErrorNote, Field, Modal, Spinner, StatusPill, SuperAdminOnly, fmt, inputCls, useAction,
} from "./integrationsUi";

const FORMS = {
  slack: [
    { name: "webhook_url", label: "Incoming webhook URL", secret: true, placeholder: "https://hooks.slack.com/services/T…/B…/…" },
    { name: "channel_label", label: "Channel name (display only)", placeholder: "#alerts" },
  ],
  twilio: [
    { name: "account_sid", label: "Account SID", placeholder: "AC…" },
    { name: "auth_token", label: "Auth Token", secret: true },
    { name: "from_number", label: "Sender number (E.164)", placeholder: "+14155552671" },
    { name: "messaging_service_sid", label: "Messaging Service SID (optional)", placeholder: "MG…" },
  ],
};

function ConfigureDialog({ channel, onClose, onSaved }) {
  const [values, setValues] = useState({});
  const { pending, error, run } = useAction();
  const fields = FORMS[channel.key];

  async function submit(e) {
    e.preventDefault();
    const saved = await run(() => integrationsService.saveChannel(channel.key, values));
    if (saved) onSaved();
  }

  return (
    <Modal title={`${channel.status === "Not configured" ? "Configure" : "Edit"} ${channel.name}`} onClose={onClose}>
      <form onSubmit={submit}>
        <ErrorNote message={error} />
        {fields.map((f) => (
          <Field
            key={f.name}
            label={f.label}
            hint={channel.details?.[f.name] && f.secret ? `Current: ${channel.details[f.name]} — leave blank to keep it` : undefined}
          >
            <input
              className={inputCls}
              type={f.secret ? "password" : "text"}
              autoComplete="off"
              placeholder={f.placeholder}
              value={values[f.name] || ""}
              onChange={(e) => setValues({ ...values, [f.name]: e.target.value })}
            />
          </Field>
        ))}
        <div className="mt-4 flex justify-end gap-2">
          <Btn onClick={onClose} disabled={pending}>Cancel</Btn>
          <Btn tone="primary" type="submit" disabled={pending}>{pending ? "Saving…" : "Save"}</Btn>
        </div>
      </form>
    </Modal>
  );
}

function TestDialog({ channel, onClose, onDone }) {
  const [to, setTo] = useState("");
  const [message, setMessage] = useState("");
  const [result, setResult] = useState(null);
  const { pending, error, run } = useAction();
  const isSms = channel.key === "twilio";

  async function submit(e) {
    e.preventDefault();
    const res = await run(() => integrationsService.testChannel(channel.key, { to: to || undefined, message: message || undefined }));
    if (res) setResult(res.message);
    onDone(); // refresh: a failed test is recorded server-side too
  }

  return (
    <Modal title={`Send test message — ${channel.name}`} onClose={onClose}>
      <form onSubmit={submit}>
        <ErrorNote message={error} />
        {result ? <div className="mb-3 rounded-xl border border-emerald-100 bg-emerald-50 p-3 text-xs text-emerald-700">{result}</div> : null}
        {isSms ? (
          <Field label="Recipient phone (E.164)">
            <input className={inputCls} value={to} onChange={(e) => setTo(e.target.value)} placeholder="+14155550100" required />
          </Field>
        ) : null}
        <Field label="Message (optional)">
          <textarea className={inputCls} rows={3} maxLength={500} value={message} onChange={(e) => setMessage(e.target.value)} />
        </Field>
        <div className="mt-4 flex justify-end gap-2">
          <Btn onClick={onClose} disabled={pending}>Close</Btn>
          <Btn tone="primary" type="submit" disabled={pending}>
            <Send className="h-3.5 w-3.5" /> {pending ? "Sending…" : "Send test"}
          </Btn>
        </div>
      </form>
    </Modal>
  );
}

function ChannelRow({ channel, onConfigure, onTest, onDisconnect }) {
  const configured = channel.status !== "Not configured";
  const detail = Object.entries(channel.details || {}).map(([k, v]) => `${k.replace(/_/g, " ")}: ${v}`).join(" · ");
  return (
    <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-bold text-slate-800">{channel.name}</p>
          {detail ? <p className="mt-1 text-xs text-slate-400">{detail}</p> : null}
          {channel.note ? <p className="mt-1 text-xs text-slate-400">{channel.note}</p> : null}
          {channel.last_tested_at ? (
            <p className="mt-1 text-xs text-slate-400">Last {channel.key === "smtp" ? "email" : "tested"}: {fmt(channel.last_tested_at)}</p>
          ) : null}
          {channel.last_error ? <p className="mt-1 text-xs text-red-500">Last error: {channel.last_error}</p> : null}
        </div>
        <StatusPill status={channel.status} />
      </div>
      {channel.editable ? (
        <div className="mt-3 flex flex-wrap gap-2">
          <Btn onClick={() => onConfigure(channel)}>{configured ? "Edit" : "Configure"}</Btn>
          <span title={configured ? "" : "Configure this channel before sending a test message"}>
            <Btn onClick={() => onTest(channel)} disabled={!configured}>Send Test Message</Btn>
          </span>
          {configured ? <Btn tone="danger" onClick={() => onDisconnect(channel)}>Disconnect</Btn> : null}
        </div>
      ) : null}
    </div>
  );
}

export default function ZoikoConnectPage() {
  const [channels, setChannels] = useState(null);
  const [loadError, setLoadError] = useState("");
  const [configuring, setConfiguring] = useState(null);
  const [testing, setTesting] = useState(null);
  const [disconnecting, setDisconnecting] = useState(null);
  const disconnect = useAction();

  const load = useCallback(async () => {
    try {
      const data = await integrationsService.getChannels();
      setChannels(data.channels || []);
      setLoadError("");
    } catch (e) {
      setLoadError(e?.message || "Failed to load channels.");
      setChannels((prev) => prev || []);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function confirmDisconnect() {
    const done = await disconnect.run(() => integrationsService.removeChannel(disconnecting.key));
    if (done) {
      setDisconnecting(null);
      load();
    }
  }

  return (
    <SuperAdminOnly>
      <div className="space-y-6 font-sans">
        <PageHeader title="Zoiko Connect" description="Outbound messaging channels: email, Slack and SMS." />
        <ErrorNote message={loadError} />
        <Card title="Integrated Channels" icon={Globe}>
          {channels === null ? (
            <Spinner />
          ) : (
            <div className="space-y-3">
              {channels.map((c) => (
                <ChannelRow key={c.key} channel={c} onConfigure={setConfiguring} onTest={setTesting} onDisconnect={setDisconnecting} />
              ))}
            </div>
          )}
        </Card>

        {configuring ? (
          <ConfigureDialog channel={configuring} onClose={() => setConfiguring(null)} onSaved={() => { setConfiguring(null); load(); }} />
        ) : null}
        {testing ? <TestDialog channel={testing} onClose={() => setTesting(null)} onDone={load} /> : null}
        {disconnecting ? (
          <Modal title={`Disconnect ${disconnecting.name}?`} onClose={() => setDisconnecting(null)}>
            <ErrorNote message={disconnect.error} />
            <p className="text-sm text-slate-600">The saved credentials will be deleted. Workflows that use this channel will fail until it is configured again.</p>
            <div className="mt-4 flex justify-end gap-2">
              <Btn onClick={() => setDisconnecting(null)} disabled={disconnect.pending}>Cancel</Btn>
              <Btn tone="danger" onClick={confirmDisconnect} disabled={disconnect.pending}>{disconnect.pending ? "Removing…" : "Disconnect"}</Btn>
            </div>
          </Modal>
        ) : null}
      </div>
    </SuperAdminOnly>
  );
}
