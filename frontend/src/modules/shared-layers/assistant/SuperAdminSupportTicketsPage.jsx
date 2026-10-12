import React, { useCallback, useEffect, useState } from "react";
import PageHeader from "../../../components/PageHeader";
import { LifeBuoy } from "lucide-react";
import { supportService } from "../../../service/supportService";
import { getOrganizations } from "../../../service/documentsService";
import {
  Btn, Card, ErrorNote, Field, Modal, Spinner, StatusPill, SuperAdminOnly, fmt, inputCls, useAction,
} from "../integrationsUi";

const PAGE_SIZE = 15;
const STATUS_LABEL = { new: "New", in_progress: "In progress", resolved: "Resolved" };
const PRIORITIES = ["low", "normal", "high", "urgent"];
const EMPTY = { status: "", priority: "", organization_id: "", assignee_id: "", date_from: "", date_to: "" };
const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

function PriorityBadge({ priority }) {
  const tone = { urgent: "bg-red-50 text-red-700 border-red-100", high: "bg-amber-50 text-amber-700 border-amber-100" }[priority]
    || "bg-slate-100 text-slate-500 border-slate-200";
  return <span className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase ${tone}`}>{priority}</span>;
}

function TicketDetail({ id, assignees, onClose, onChanged }) {
  const [ticket, setTicket] = useState(null);
  const [loadError, setLoadError] = useState("");
  const [reply, setReply] = useState("");
  const [note, setNote] = useState("");
  const action = useAction();

  const load = useCallback(async () => {
    try {
      setTicket(await supportService.get(id));
      setLoadError("");
    } catch (e) {
      setLoadError(e?.message || "Failed to load the ticket.");
    }
  }, [id]);
  useEffect(() => { load(); }, [load]);

  async function patch(data) {
    const updated = await action.run(() => supportService.update(id, data));
    if (updated) { await load(); onChanged(); }
  }
  async function send(resolve) {
    const res = await action.run(() => supportService.reply(id, reply, resolve));
    if (res) {
      setReply("");
      setNote(res.notified ? `Reply sent. ${res.requester_name} was notified.` : "Reply saved, but the notification could not be delivered.");
      setTicket(res);
      onChanged();
    }
  }

  return (
    <Modal title={ticket ? `${ticket.reference} · ${ticket.organization_name}` : `Ticket #${id}`} onClose={onClose} wide>
      <ErrorNote message={loadError || action.error} />
      {!ticket ? (loadError ? null : <Spinner />) : (
        <div className="space-y-4 text-sm">
          <div className="flex flex-wrap items-center gap-3">
            <StatusPill status={STATUS_LABEL[ticket.status]} />
            <PriorityBadge priority={ticket.priority} />
            <span className="text-xs text-slate-400">
              {ticket.requester_name} ({ticket.requester_email}) · opened {fmt(ticket.created_at)}
            </span>
          </div>

          <div className="grid gap-3 md:grid-cols-3">
            <Field label="Status">
              <select className={inputCls} aria-label="Status" value={ticket.status} disabled={action.pending}
                onChange={(e) => patch({ status: e.target.value })}>
                {Object.entries(STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </Field>
            <Field label="Priority">
              <select className={inputCls} aria-label="Priority" value={ticket.priority} disabled={action.pending}
                onChange={(e) => patch({ priority: e.target.value })}>
                {PRIORITIES.map((p) => <option key={p} value={p}>{cap(p)}</option>)}
              </select>
            </Field>
            <Field label="Assignee">
              <select className={inputCls} aria-label="Assignee" value={ticket.assignee_id || 0} disabled={action.pending}
                onChange={(e) => patch({ assigned_to: Number(e.target.value) })}>
                <option value={0}>Unassigned</option>
                {assignees.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </Field>
          </div>

          <div>
            <p className="mb-2 text-xs font-semibold text-slate-500">Conversation</p>
            <ol className="space-y-2">
              {ticket.thread.map((m, i) => (
                <li key={`${m.id}-${i}`} className={`rounded-2xl border p-3 text-xs ${m.author_role === "staff" ? "border-blue-100 bg-blue-50" : "border-slate-100 bg-slate-50"}`}>
                  <p className="mb-1 font-semibold text-slate-700">
                    {m.author_name} <span className="font-normal text-slate-400">· {m.author_role === "staff" ? "Support" : "Requester"} · {fmt(m.created_at)}</span>
                  </p>
                  <p className="whitespace-pre-wrap text-slate-700">{m.body}</p>
                </li>
              ))}
            </ol>
          </div>

          {note ? <p className="rounded-xl border border-emerald-100 bg-emerald-50 p-2 text-xs text-emerald-700">{note}</p> : null}

          {ticket.status === "resolved" ? (
            <p className="text-xs text-slate-500">This ticket is resolved. Set the status back to In progress to reply.</p>
          ) : (
            <div>
              <textarea className={inputCls} rows={3} maxLength={5000} placeholder="Write a reply to the requester…" aria-label="Reply"
                value={reply} onChange={(e) => setReply(e.target.value)} disabled={action.pending} />
              <div className="mt-2 flex justify-end gap-2">
                <Btn onClick={() => send(true)} disabled={action.pending || !reply.trim()}>Reply &amp; resolve</Btn>
                <Btn tone="primary" onClick={() => send(false)} disabled={action.pending || !reply.trim()}>
                  {action.pending ? "Sending…" : "Send reply"}
                </Btn>
              </div>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}

export default function SuperAdminSupportTicketsPage() {
  const [filters, setFilters] = useState(EMPTY);
  const [q, setQ] = useState("");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [orgs, setOrgs] = useState([]);
  const [assignees, setAssignees] = useState([]);
  const [open, setOpen] = useState(null);

  useEffect(() => {
    getOrganizations().then((r) => setOrgs(r.organizations || [])).catch(() => setOrgs([]));
    supportService.assignees().then((r) => setAssignees(r.assignees || [])).catch(() => setAssignees([]));
  }, []);

  useEffect(() => {
    const t = setTimeout(() => { setQuery(q.trim()); setPage(1); }, 300);
    return () => clearTimeout(t);
  }, [q]);

  const load = useCallback(async () => {
    const params = { page, page_size: PAGE_SIZE };
    if (query) params.q = query;
    Object.entries(filters).forEach(([k, v]) => {
      if (v !== "") params[k] = k.startsWith("date_") ? new Date(v).toISOString() : v;
    });
    try {
      setData(await supportService.list(params));
      setError("");
    } catch (e) {
      setError(e?.message || "Failed to load tickets.");
      setData((p) => p || { tickets: [], total: 0 });
    }
  }, [page, query, filters]);
  useEffect(() => { load(); }, [load]);

  const setFilter = (k, v) => { setPage(1); setFilters((p) => ({ ...p, [k]: v })); };
  const hasCriteria = Boolean(query || Object.values(filters).some((v) => v !== ""));
  const pages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;

  return (
    <SuperAdminOnly>
      <div className="space-y-6 font-sans">
        <PageHeader title="Support Tickets" description="Tickets raised by employees across all organizations." />
        <ErrorNote message={error} />
        <Card title="Tickets" icon={LifeBuoy}>
          <div className="mb-4 grid gap-2 md:grid-cols-4">
            <input className={inputCls} type="search" aria-label="Search tickets" placeholder="Search reference, summary, requester…" value={q} onChange={(e) => setQ(e.target.value)} />
            <select className={inputCls} aria-label="Organization" value={filters.organization_id} onChange={(e) => setFilter("organization_id", e.target.value)}>
              <option value="">All organizations</option>
              {orgs.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
            </select>
            <select className={inputCls} aria-label="Status filter" value={filters.status} onChange={(e) => setFilter("status", e.target.value)}>
              <option value="">Any status</option>
              {Object.entries(STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
            <select className={inputCls} aria-label="Priority filter" value={filters.priority} onChange={(e) => setFilter("priority", e.target.value)}>
              <option value="">Any priority</option>
              {PRIORITIES.map((p) => <option key={p} value={p}>{cap(p)}</option>)}
            </select>
            <select className={inputCls} aria-label="Assignee filter" value={filters.assignee_id} onChange={(e) => setFilter("assignee_id", e.target.value)}>
              <option value="">Any assignee</option>
              <option value="0">Unassigned</option>
              {assignees.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
            <input className={inputCls} type="date" aria-label="Created from" value={filters.date_from} onChange={(e) => setFilter("date_from", e.target.value)} />
            <input className={inputCls} type="date" aria-label="Created to" value={filters.date_to} onChange={(e) => setFilter("date_to", e.target.value)} />
            {hasCriteria ? <Btn onClick={() => { setQ(""); setQuery(""); setFilters(EMPTY); setPage(1); }}>Clear filters</Btn> : null}
          </div>

          {data === null ? <Spinner /> : data.tickets.length === 0 ? (
            <p className="py-8 text-center text-sm text-slate-500">{hasCriteria ? "No tickets match your filters." : "No support tickets yet."}</p>
          ) : (
            <div className="space-y-2">
              {data.tickets.map((t) => (
                <button key={t.id} type="button" onClick={() => setOpen(t.id)}
                  className="flex w-full flex-wrap items-center justify-between gap-2 rounded-2xl border border-slate-100 bg-slate-50 p-3 text-left text-xs hover:bg-slate-100">
                  <span className="min-w-0">
                    <span className="font-bold text-slate-800">{t.reference}</span>{" "}
                    <span className="text-slate-700">{t.subject}</span>
                    <span className="block text-[10px] text-slate-400">
                      {t.organization_name} · {t.requester_name} · {t.assignee_name ? `Assigned to ${t.assignee_name}` : "Unassigned"} · updated {fmt(t.updated_at)}
                    </span>
                  </span>
                  <span className="flex items-center gap-2"><PriorityBadge priority={t.priority} /><StatusPill status={STATUS_LABEL[t.status]} /></span>
                </button>
              ))}
              <div className="flex items-center justify-between pt-2 text-xs text-slate-500">
                <span>Page {page} of {pages} · {data.total} ticket{data.total === 1 ? "" : "s"}</span>
                <div className="flex gap-2">
                  <Btn onClick={() => setPage(page - 1)} disabled={page <= 1}>Previous</Btn>
                  <Btn onClick={() => setPage(page + 1)} disabled={page >= pages}>Next</Btn>
                </div>
              </div>
            </div>
          )}
        </Card>
        {open ? <TicketDetail id={open} assignees={assignees} onClose={() => setOpen(null)} onChanged={load} /> : null}
      </div>
    </SuperAdminOnly>
  );
}
