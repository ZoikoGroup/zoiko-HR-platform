import React, { useCallback, useEffect, useRef, useState } from "react";
import { Activity } from "lucide-react";
import { activityService } from "../../service/activityService";
import { Btn, Card, ErrorNote, Modal, Spinner, fmt, inputCls } from "./integrationsUi";

const PAGE_SIZE = 20;
const EMPTY = { organization_id: "", action_group: "", status: "", actor: "", q: "", date_from: "", date_to: "" };

function relative(iso) {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "";
  const s = Math.max(0, Math.round((Date.now() - t) / 1000));
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return `${Math.floor(s / 86400)} d ago`;
}

function Badge({ status }) {
  const failed = status === "failed";
  return (
    <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${failed ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-700"}`}>
      {failed ? "Failed" : "Success"}
    </span>
  );
}

function show(v) {
  if (v === null || v === undefined || v === "") return "—";
  return typeof v === "object" ? JSON.stringify(v) : String(v);
}

function EventDetail({ event, onClose }) {
  return (
    <Modal title="Activity details" onClose={onClose}>
      <div className="space-y-3 text-sm">
        <p className="font-semibold text-slate-800">{event.sentence}</p>
        <dl className="grid grid-cols-[110px_1fr] gap-y-1 text-xs">
          <dt className="text-slate-400">Organization</dt><dd>{show(event.organization_name)}</dd>
          <dt className="text-slate-400">Actor</dt>
          <dd>{show(event.actor_name)}{event.actor_role_label ? ` (${event.actor_role_label})` : ""}{event.actor_email ? ` · ${event.actor_email}` : ""}</dd>
          <dt className="text-slate-400">Target</dt><dd>{show(event.target_label)}</dd>
          <dt className="text-slate-400">Status</dt><dd><Badge status={event.status} /></dd>
          <dt className="text-slate-400">When</dt><dd>{fmt(event.created_at)}</dd>
          {event.ip_address ? (<><dt className="text-slate-400">IP address</dt><dd>{event.ip_address}</dd></>) : null}
        </dl>
        {event.error_message ? <ErrorNote message={event.error_message} /> : null}
        {event.counts ? (
          <p className="text-xs text-slate-600">{Object.entries(event.counts).map(([k, v]) => `${k}: ${v}`).join(" · ")}</p>
        ) : null}
        {event.changes?.length ? (
          <table className="w-full text-left text-xs" aria-label="Changes">
            <thead><tr className="text-slate-400"><th className="py-1 pr-2">Field</th><th className="pr-2">Before</th><th>After</th></tr></thead>
            <tbody>
              {event.changes.map((c, i) => (
                <tr key={`${c.field}-${i}`} className="border-t border-slate-100">
                  <td className="py-1 pr-2 font-medium text-slate-700">{c.label || c.field}</td>
                  <td className="pr-2 text-slate-500">{show(c.before)}</td>
                  <td className="text-slate-800">{show(c.after)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : <p className="text-xs text-slate-400">No field changes recorded.</p>}
      </div>
      <div className="mt-4 flex justify-end"><Btn onClick={onClose}>Close</Btn></div>
    </Modal>
  );
}

export default function OrgActivityFeed() {
  const [options, setOptions] = useState({ organizations: [], action_groups: [] });
  const [draft, setDraft] = useState(EMPTY);
  const [applied, setApplied] = useState(EMPTY);
  const [page, setPage] = useState(1);
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(null);
  const seq = useRef(0);

  useEffect(() => {
    activityService.filters().then((o) => setOptions(o || { organizations: [], action_groups: [] })).catch(() => {});
  }, []);

  const load = useCallback(async () => {
    const id = ++seq.current;
    setLoading(true);
    const params = { page, page_size: PAGE_SIZE };
    Object.entries(applied).forEach(([k, v]) => { if (v !== "") params[k] = v; });
    if (params.date_from) params.date_from = new Date(`${params.date_from}T00:00:00`).toISOString();
    if (params.date_to) params.date_to = new Date(`${params.date_to}T23:59:59`).toISOString();
    try {
      const r = await activityService.list(params);
      if (id !== seq.current) return;
      setData(r);
      setError("");
    } catch (e) {
      if (id !== seq.current) return;
      setError(e?.message || "Could not load activity.");
    } finally {
      if (id === seq.current) setLoading(false);
    }
  }, [applied, page]);

  useEffect(() => { load(); }, [load]);

  const set = (k) => (e) => setDraft((d) => ({ ...d, [k]: e.target.value }));
  const apply = (e) => { e?.preventDefault(); setPage(1); setApplied(draft); };
  const clear = () => { setDraft(EMPTY); setApplied(EMPTY); setPage(1); };
  const events = data?.events || [];
  const pages = Math.max(1, Math.ceil((data?.total || 0) / PAGE_SIZE));
  const filtered = Object.values(applied).some((v) => v !== "");

  return (
    <Card title={`Organization Activity${data ? ` (${data.total})` : ""}`} icon={Activity}>
      <form onSubmit={apply} className="mb-4 grid gap-2 md:grid-cols-4" aria-label="Activity filters">
        <select aria-label="Organization" className={inputCls} value={draft.organization_id} onChange={set("organization_id")}>
          <option value="">All organizations</option>
          {options.organizations.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
        </select>
        <select aria-label="Action" className={inputCls} value={draft.action_group} onChange={set("action_group")}>
          <option value="">All actions</option>
          {(options.action_groups || []).map((g) => <option key={g.key} value={g.key}>{g.label}</option>)}
        </select>
        <select aria-label="Status" className={inputCls} value={draft.status} onChange={set("status")}>
          <option value="">Any status</option>
          <option value="success">Success</option>
          <option value="failed">Failed</option>
        </select>
        <input aria-label="Actor" className={inputCls} placeholder="Actor name or email" value={draft.actor} onChange={set("actor")} />
        <input aria-label="From date" type="date" className={inputCls} value={draft.date_from} onChange={set("date_from")} />
        <input aria-label="To date" type="date" className={inputCls} value={draft.date_to} onChange={set("date_to")} />
        <input aria-label="Search" className={inputCls} placeholder="Search target, actor, organization" value={draft.q} onChange={set("q")} />
        <div className="flex gap-2"><Btn tone="primary" type="submit">Apply</Btn><Btn onClick={clear}>Clear</Btn></div>
      </form>

      <ErrorNote message={error} />
      {error ? <div className="mb-2"><Btn onClick={load}>Retry</Btn></div> : null}
      {loading && !data ? <Spinner /> : events.length === 0 && !error ? (
        <p className="text-sm text-slate-500">
          {filtered ? "No activity matches these filters." : "No organization activity yet. Actions taken by organization admins will appear here."}
        </p>
      ) : (
        <ul className={`space-y-2 ${loading ? "opacity-60" : ""}`} aria-label="Activity events">
          {events.map((e) => (
            <li key={e.id}>
              <button type="button" onClick={() => setOpen(e)}
                className="flex w-full flex-wrap items-center justify-between gap-2 rounded-2xl border border-slate-100 bg-slate-50 p-3 text-left text-xs hover:bg-slate-100">
                <span className="text-slate-800">
                  <span className="font-semibold">{e.sentence}</span>
                  <span className="ml-2 rounded-full bg-white px-2 py-0.5 text-[10px] font-semibold text-slate-500">{e.organization_name || "No organization"}</span>
                </span>
                <span className="flex items-center gap-3 text-slate-400" title={fmt(e.created_at)}>
                  {relative(e.created_at)} · {fmt(e.created_at)} <Badge status={e.status} />
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {data && data.total > PAGE_SIZE ? (
        <div className="mt-3 flex items-center justify-end gap-2 text-xs text-slate-500">
          <Btn onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1 || loading}>Previous</Btn>
          <span>Page {page} of {pages}</span>
          <Btn onClick={() => setPage((p) => Math.min(pages, p + 1))} disabled={page >= pages || loading}>Next</Btn>
        </div>
      ) : null}
      {open ? <EventDetail event={open} onClose={() => setOpen(null)} /> : null}
    </Card>
  );
}
