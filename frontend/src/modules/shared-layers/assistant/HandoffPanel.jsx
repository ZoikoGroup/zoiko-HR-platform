import { useState } from "react";
import { LifeBuoy, CheckCircle2, X } from "lucide-react";
import { createHandoff } from "../../../service/assistantService";

export default function HandoffPanel({ conversationId, turnId, defaultSummary, onClose }) {
  const [summary, setSummary] = useState(defaultSummary || "");
  const [ticket, setTicket] = useState(null);
  const [busy, setBusy] = useState(false);

  if (ticket) {
    return (
      <div className="mt-3 flex items-center gap-2 rounded-2xl border border-emerald-100 bg-emerald-50 p-3 text-xs font-semibold text-emerald-700">
        <CheckCircle2 className="h-4 w-4" /> Case created — reference {ticket}. HR will follow up with you.
      </div>
    );
  }

  return (
    <div className="mt-3 rounded-2xl border border-[var(--zhr-border-default)] bg-[var(--zhr-surface-overlay)] p-4 text-sm">
      <div className="mb-2 flex items-center justify-between">
        <h4 className="flex items-center gap-1.5 font-bold text-[var(--zhr-text-primary)]">
          <LifeBuoy className="h-4 w-4 text-[var(--zhr-action-primary)]" /> Talk to HR
        </h4>
        {onClose && (
          <button onClick={onClose} aria-label="Close" className="text-[var(--zhr-text-muted)] hover:text-[var(--zhr-text-secondary)]">
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
      <textarea
        value={summary}
        onChange={(e) => setSummary(e.target.value)}
        rows={3}
        autoFocus={!defaultSummary}
        className="w-full rounded-lg border border-[var(--zhr-border-default)] p-2 text-xs"
        placeholder="Describe your issue for HR..."
      />
      <button
        disabled={busy || !summary.trim()}
        onClick={async () => {
          setBusy(true);
          try {
            const handoff = await createHandoff(conversationId, turnId, "user_requested", summary);
            setTicket(handoff.ticket_reference);
          } finally {
            setBusy(false);
          }
        }}
        className="mt-2 rounded-full bg-[var(--zhr-action-primary)] px-3.5 py-1.5 text-xs font-bold text-white hover:bg-[var(--zhr-action-primary-hover)] disabled:opacity-50"
      >
        Send to HR
      </button>
    </div>
  );
}
