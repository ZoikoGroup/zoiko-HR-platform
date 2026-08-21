import { useEffect, useState } from "react";
import { LifeBuoy, CheckCircle2, Clock, X } from "lucide-react";
import { listMyHandoffs } from "../../../service/assistantService";

export default function MyTicketsPanel({ onClose }) {
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    listMyHandoffs()
      .then((data) => { if (active) setTickets(data || []); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  return (
    <div className="mt-3 rounded-2xl border border-[var(--zhr-border-default)] bg-[var(--zhr-surface-overlay)] p-4 text-sm">
      <div className="mb-2 flex items-center justify-between">
        <h4 className="flex items-center gap-1.5 font-bold text-[var(--zhr-text-primary)]">
          <LifeBuoy className="h-4 w-4 text-[var(--zhr-action-primary)]" /> My Tickets
        </h4>
        {onClose && (
          <button onClick={onClose} aria-label="Close" className="text-[var(--zhr-text-muted)] hover:text-[var(--zhr-text-secondary)]">
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {loading && <p className="text-xs text-[var(--zhr-text-muted)]">Loading your tickets...</p>}

      {!loading && tickets.length === 0 && (
        <p className="text-xs text-[var(--zhr-text-muted)]">You haven't raised any support tickets yet.</p>
      )}

      {!loading && tickets.length > 0 && (
        <div className="max-h-64 space-y-2 overflow-y-auto">
          {tickets.map((t) => (
            <div key={t.id} className="rounded-xl border border-[var(--zhr-border-default)] bg-[var(--zhr-surface-panel)] px-3 py-2.5">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-[11px] font-bold text-[var(--zhr-text-secondary)]">{t.ticket_reference}</span>
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
              <p className="mt-1 text-xs text-[var(--zhr-text-primary)]">{t.issue_summary}</p>
              <p className="mt-1 text-[10px] text-[var(--zhr-text-muted)]">
                Raised {new Date(t.created_at).toLocaleString()}
              </p>
              {t.status === "resolved" && (
                <p className="mt-1 text-[10px] text-[var(--zhr-text-muted)]">
                  Resolved{t.resolved_at ? ` ${new Date(t.resolved_at).toLocaleString()}` : ""}
                  {t.resolution_note ? `: "${t.resolution_note}"` : ""}
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
