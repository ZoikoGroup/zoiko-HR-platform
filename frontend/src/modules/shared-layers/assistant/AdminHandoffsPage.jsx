import { useEffect, useState } from "react";
import PageHeader from "../../../components/PageHeader";
import { LifeBuoy, CheckCircle2, Clock, Search } from "lucide-react";
import { listHandoffTickets, resolveHandoffTicket } from "../../../service/assistantService";

const REASON_LABELS = {
  no_reliable_answer: "Assistant couldn't answer",
  restricted: "Restricted topic",
  conflict: "Conflicting sources",
  user_requested: "Employee requested HR",
};

function ResolveForm({ ticketId, onResolved, busy, setBusy }) {
  const [note, setNote] = useState("");
  const [open, setOpen] = useState(false);

  const submit = async () => {
    setBusy(true);
    try {
      await resolveHandoffTicket(ticketId, note.trim() || undefined);
      onResolved();
    } finally {
      setBusy(false);
    }
  };

  if (!open) {
    return (
      <button
        disabled={busy}
        onClick={() => setOpen(true)}
        className="rounded-full border border-[var(--zhr-action-primary)] px-3 py-1 text-[11px] font-bold text-[var(--zhr-action-primary)] disabled:opacity-50"
      >
        Mark resolved
      </button>
    );
  }

  return (
    <div className="flex items-center gap-1.5">
      <input
        autoFocus
        placeholder="Resolution note (optional)"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && submit()}
        className="w-48 rounded-lg border border-slate-200 px-2 py-1 text-[11px]"
      />
      <button disabled={busy} onClick={submit} className="rounded-full bg-[var(--zhr-action-primary)] px-3 py-1 text-[11px] font-bold text-white disabled:opacity-50">
        Confirm
      </button>
      <button disabled={busy} onClick={() => setOpen(false)} className="text-[11px] font-semibold text-slate-400 hover:text-slate-600">
        Cancel
      </button>
    </div>
  );
}

export default function AdminHandoffsPage() {
  const [tickets, setTickets] = useState([]);
  const [statusFilter, setStatusFilter] = useState("sent");
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  const reload = async () => {
    setLoading(true);
    try {
      const data = await listHandoffTickets(statusFilter || undefined);
      setTickets(data);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { reload(); }, [statusFilter]);

  const filtered = tickets.filter((t) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      t.ticket_reference?.toLowerCase().includes(q)
      || t.employee_name?.toLowerCase().includes(q)
      || t.issue_summary?.toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-6 font-sans">
      <PageHeader
        title="HR Assistant — Support Tickets"
        description="Tickets raised when the assistant hands an employee off to HR — every org admin sees every ticket raised in this organization."
      />

      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h3 className="flex items-center gap-2 text-lg font-bold text-slate-800">
            <LifeBuoy className="h-5 w-5 text-[var(--zhr-action-primary)]" /> Tickets
          </h3>
          <div className="flex gap-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
              <input
                placeholder="Search tickets..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-56 rounded-lg border border-slate-200 py-1.5 pl-8 pr-2 text-xs"
              />
            </div>
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="rounded-lg border border-slate-200 px-2 py-1.5 text-xs">
              <option value="sent">Open</option>
              <option value="resolved">Resolved</option>
              <option value="">All</option>
            </select>
          </div>
        </div>

        {loading && <p className="text-xs text-slate-400">Loading tickets...</p>}

        {!loading && (
          <div className="space-y-2">
            {filtered.map((t) => (
              <div key={t.id} className="rounded-xl border border-slate-100 bg-slate-50 px-4 py-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-xs font-bold text-slate-700">{t.ticket_reference}</span>
                      <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-bold uppercase text-slate-600">
                        {REASON_LABELS[t.reason] || t.reason}
                      </span>
                      {t.status === "resolved" ? (
                        <span className="flex items-center gap-1 text-[11px] font-bold text-emerald-600">
                          <CheckCircle2 className="h-3.5 w-3.5" /> Resolved
                        </span>
                      ) : (
                        <span className="flex items-center gap-1 text-[11px] font-bold text-amber-600">
                          <Clock className="h-3.5 w-3.5" /> Open
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-sm text-slate-800">{t.issue_summary}</p>
                    <p className="mt-1 text-[11px] text-slate-500">
                      Raised by {t.employee_name || `employee #${t.employee_id}`} · {new Date(t.created_at).toLocaleString()}
                    </p>
                    {t.status === "resolved" && (
                      <p className="mt-1 text-[11px] text-slate-500">
                        Resolved by {t.resolved_by_name || "—"}{t.resolved_at ? ` on ${new Date(t.resolved_at).toLocaleString()}` : ""}
                        {t.resolution_note ? `: "${t.resolution_note}"` : ""}
                      </p>
                    )}
                  </div>
                  {t.status !== "resolved" && (
                    <ResolveForm ticketId={t.id} busy={busy} setBusy={setBusy} onResolved={reload} />
                  )}
                </div>
              </div>
            ))}
            {filtered.length === 0 && <p className="text-xs text-slate-400">No tickets match your filters.</p>}
          </div>
        )}
      </div>
    </div>
  );
}
