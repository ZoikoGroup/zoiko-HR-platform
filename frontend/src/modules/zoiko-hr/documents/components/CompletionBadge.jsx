/**
 * "7/10 approved" with a progress bar (docs/new_docs/ZHR-DOCS-ARCH-001 §17 A2). Counts approved REQUIRED documents only.
 * @param {{ approved: number, required: number }} props
 */
export default function CompletionBadge({ approved = 0, required = 0 }) {
  const pct = required ? Math.round((100 * approved) / required) : 100;
  return (
    <div className="min-w-[120px]">
      <p className="text-xs font-semibold text-slate-700 dark:text-[#cbd5e1]">{approved}/{required} approved</p>
      <div className="mt-1 h-1.5 w-full rounded-full bg-slate-100 dark:bg-[#334155]" role="progressbar" aria-valuemin={0}
        aria-valuemax={100} aria-valuenow={pct} aria-label={`${approved} of ${required} required documents approved`}>
        <div className={`h-1.5 rounded-full ${pct === 100 ? "bg-emerald-500" : "bg-blue-600"}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
