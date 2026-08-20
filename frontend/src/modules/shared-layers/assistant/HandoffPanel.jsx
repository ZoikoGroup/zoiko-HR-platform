import { useEffect, useState } from "react";
import { LifeBuoy, CheckCircle2, Clock, X } from "lucide-react";
import { createHandoff, getMyOpenHandoff } from "../../../service/assistantService";

export default function HandoffPanel({ conversationId, turnId, defaultSummary, onClose, reason = "user_requested", checkOnMount = false }) {
  const [summary, setSummary] = useState(defaultSummary || "");
  const [ticket, setTicket] = useState(null);
  const [busy, setBusy] = useState(false);
  const [checkingExisting, setCheckingExisting] = useState(checkOnMount);

  // Only checked up front when the panel was opened by deliberate action
  // (the menu's "Support request"), not when it auto-appears under a
  // no-answer/restricted message — surfacing ticket status during ordinary
  // chat, before the employee has asked to talk to HR at all, is the wrong
  // moment for it. The auto-shown panel still gets the same "already open"
  // info, just at submit time via createHandoff()'s own dedup response.
  useEffect(() => {
    if (!checkOnMount) return;
    let active = true;
    getMyOpenHandoff()
      .then((existing) => { if (active && existing) setTicket(existing); })
      .finally(() => { if (active) setCheckingExisting(false); });
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (checkingExisting) {
    return (
      <div className="mt-3 rounded-2xl border border-[var(--zhr-border-default)] bg-[var(--zhr-surface-overlay)] p-3 text-xs text-[var(--zhr-text-muted)]">
        Checking for an existing ticket...
      </div>
    );
  }

  if (ticket) {
    return (
      <div className={`mt-3 flex items-start gap-2 rounded-2xl border p-3 text-xs font-semibold ${
        ticket.already_open ? "border-amber-100 bg-amber-50 text-amber-700" : "border-emerald-100 bg-emerald-50 text-emerald-700"
      }`}>
        {ticket.already_open ? <Clock className="mt-0.5 h-4 w-4 shrink-0" /> : <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />}
        <span>
          {ticket.already_open ? (
            <>You already have an open ticket — reference {ticket.ticket_reference}. HR is still working on it; you'll be able to open a new ticket once this one is resolved.</>
          ) : (
            <>Case created — reference {ticket.ticket_reference}. HR will follow up with you.</>
          )}
        </span>
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
            const handoff = await createHandoff(conversationId, turnId, reason, summary);
            setTicket(handoff);
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
