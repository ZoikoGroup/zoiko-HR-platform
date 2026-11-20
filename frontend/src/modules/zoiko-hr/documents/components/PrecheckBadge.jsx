import { useId, useState } from "react";
import { AlertTriangle, CheckCircle2, XCircle } from "lucide-react";

/**
 * The upload pre-check outcome for reviewers (docs/new_docs/ZHR-DOCS-ARCH-001 §14.1): green "Pre-checks passed" or amber
 * "N warnings" that expands to the reasons. Pre-checks never approve anything; a person still decides.
 *
 * @param {{ precheck: { status: string, checks?: {code:string,status:string,message:string}[] } | null, compact?: boolean }} props
 */
export default function PrecheckBadge({ precheck, compact = false }) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  if (!precheck || !precheck.status) return null;
  const issues = (precheck.checks || []).filter((c) => c.status !== "pass");
  if (precheck.status === "pass" || issues.length === 0) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
        <CheckCircle2 size={12} aria-hidden="true" /> Pre-checks passed
      </span>
    );
  }
  const failed = precheck.status === "fail";
  const label = failed ? "Pre-check failed" : `${issues.length} warning${issues.length === 1 ? "" : "s"}`;
  const Icon = failed ? XCircle : AlertTriangle;
  return (
    <span className="inline-flex flex-col items-start">
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} aria-controls={panelId}
        className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${failed ? "bg-rose-50 text-rose-700" : "bg-amber-50 text-amber-800"}`}>
        <Icon size={12} aria-hidden="true" /> {label}
      </button>
      {open && !compact && (
        <ul id={panelId} className="mt-1 list-disc space-y-0.5 pl-5 text-xs text-slate-600">
          {issues.map((c) => <li key={c.code}>{c.message}</li>)}
        </ul>
      )}
      {open && compact && (
        <ul id={panelId} className="mt-1 text-xs text-slate-600">{issues.map((c) => <li key={c.code}>{c.message}</li>)}</ul>
      )}
    </span>
  );
}
