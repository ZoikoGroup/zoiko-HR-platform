import { useState } from "react";
import { FileText, ShieldCheck, Paperclip } from "lucide-react";

const TIER_LABELS = { A: "Binding policy", B: "Operational (SOP)", C: "Explanatory", D: "Reference" };

function isAttachment(source) {
  return source.hr_record_ref?.startsWith("attachment:");
}

export function SourceDetail({ source }) {
  if (isAttachment(source)) {
    return (
      <div className="text-xs text-[var(--zhr-text-secondary)]">
        <p className="font-bold text-[var(--zhr-text-primary)]">{source.label}</p>
        <p className="mt-1">
          This answer was read from a document you uploaded. It does not override or count as published
          company policy.
        </p>
      </div>
    );
  }
  if (source.hr_record_ref) {
    return (
      <div className="text-xs text-[var(--zhr-text-secondary)]">
        <p className="font-bold text-[var(--zhr-text-primary)]">{source.label}</p>
        <p className="mt-1">This answer was read directly from your live HR record, not a policy document.</p>
      </div>
    );
  }
  return (
    <div className="text-xs text-[var(--zhr-text-secondary)]">
      <p className="font-bold text-[var(--zhr-text-primary)]">{source.label}</p>
      <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] text-[var(--zhr-text-muted)]">
        {source.authority_tier && <span>{TIER_LABELS[source.authority_tier] || source.authority_tier}</span>}
        {source.version_no && <span>Version {source.version_no}</span>}
        {source.effective_from && <span>Effective {source.effective_from}</span>}
      </div>
      {source.excerpt && <p className="mt-2 rounded-lg bg-[var(--zhr-surface-panel)] p-2 leading-relaxed">{source.excerpt}</p>}
    </div>
  );
}

export default function SourceChip({ source }) {
  const [open, setOpen] = useState(false);
  const Icon = isAttachment(source) ? Paperclip : source.hr_record_ref ? ShieldCheck : FileText;
  return (
    <div className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1 rounded-full border border-[var(--zhr-border-default)] bg-[var(--zhr-surface-panel)] px-2.5 py-1 text-[11px] font-semibold text-[var(--zhr-text-secondary)] hover:border-[var(--zhr-border-focus)] hover:text-[var(--zhr-action-primary)] transition"
      >
        <Icon className="h-3 w-3" />
        {source.label}
      </button>
      {open && (
        <div className="absolute z-10 mt-1 w-72 rounded-xl border border-[var(--zhr-border-default)] bg-[var(--zhr-surface-overlay)] p-3 shadow-[var(--zhr-elevation-panel)]">
          <SourceDetail source={source} />
        </div>
      )}
    </div>
  );
}
