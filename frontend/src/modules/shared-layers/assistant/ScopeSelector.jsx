import { useState } from "react";
import { Users, ChevronDown, Check } from "lucide-react";

/**
 * WF-09 manager team scope: active subject stays visible and editable
 * before execution. Only renders when the caller has at least one direct
 * report — server-authorized list only, never a client-side directory.
 */
export default function ScopeSelector({ teamMembers, scope, onChange }) {
  const [open, setOpen] = useState(false);
  if (!teamMembers || teamMembers.length === 0) return null;

  const label = scope ? scope.full_name : "Me";

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 rounded-full border border-[var(--zhr-border-default)] bg-[var(--zhr-surface-panel)] px-3 py-1.5 text-xs font-bold text-[var(--zhr-text-secondary)] hover:border-[var(--zhr-border-focus)]"
      >
        <Users className="h-3.5 w-3.5" />
        Scope: {label}
        <ChevronDown className="h-3.5 w-3.5" />
      </button>
      {open && (
        <div className="absolute right-0 z-20 mt-1 w-56 rounded-xl border border-[var(--zhr-border-default)] bg-[var(--zhr-surface-overlay)] p-1.5 shadow-[var(--zhr-elevation-panel)]">
          <button
            type="button"
            onClick={() => { onChange(null); setOpen(false); }}
            className="flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-left text-xs font-semibold text-[var(--zhr-text-primary)] hover:bg-[var(--zhr-surface-panel)]"
          >
            Me {!scope && <Check className="h-3.5 w-3.5 text-[var(--zhr-action-primary)]" />}
          </button>
          <div className="my-1 border-t border-[var(--zhr-border-default)]" />
          {teamMembers.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => { onChange(m); setOpen(false); }}
              className="flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-left text-xs font-semibold text-[var(--zhr-text-primary)] hover:bg-[var(--zhr-surface-panel)]"
            >
              <span>{m.full_name}<span className="block text-[10px] font-normal text-[var(--zhr-text-muted)]">{m.job_title}</span></span>
              {scope?.id === m.id && <Check className="h-3.5 w-3.5 text-[var(--zhr-action-primary)]" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
