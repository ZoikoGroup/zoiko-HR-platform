import { fmtDate } from "./ui";

// Renders the result of diffVariants(): clause / field change summary plus a unified text diff.
function ChangeList({ label, change }) {
  const added = change?.added || [];
  const removed = change?.removed || [];
  if (!added.length && !removed.length) return null;
  return (
    <li className="text-sm">
      <span className="font-semibold text-gray-700">{label}: </span>
      {added.map((k) => <span key={`a-${k}`} className="mr-1 inline-block rounded bg-emerald-50 px-1.5 font-mono text-xs text-emerald-800">+ {k}</span>)}
      {removed.map((k) => <span key={`r-${k}`} className="mr-1 inline-block rounded bg-red-50 px-1.5 font-mono text-xs text-red-800">− {k}</span>)}
    </li>
  );
}

function lineClass(line) {
  if (line.startsWith("+++") || line.startsWith("---")) return "text-gray-500";
  if (line.startsWith("@@")) return "bg-blue-50 text-blue-800";
  if (line.startsWith("+")) return "bg-emerald-50 text-emerald-900";
  if (line.startsWith("-")) return "bg-red-50 text-red-900";
  return "text-gray-700";
}

export default function VariantDiff({ diff }) {
  if (!diff) return null;
  const cc = diff.clause_changes || {};
  const fc = diff.field_changes || {};
  const summary = [
    ["Mandatory clauses", cc.mandatory], ["Optional clauses", cc.optional], ["Prohibited clauses", cc.prohibited],
    ["Required fields", fc.required], ["Optional fields", fc.optional],
  ].filter(([, c]) => (c?.added?.length || 0) + (c?.removed?.length || 0) > 0);
  const lines = diff.text_diff || [];
  const dates = diff.effective_dates;

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-700">
        Comparing version <strong>{diff.from_version}</strong> with version <strong>{diff.to_version}</strong>.
        {" "}Lines starting with “+” were added; lines starting with “−” were removed.
      </p>
      <div>
        <h3 className="mb-1 text-sm font-semibold text-gray-800">Clauses and fields</h3>
        {summary.length ? <ul className="space-y-1">{summary.map(([label, c]) => <ChangeList key={label} label={label} change={c} />)}</ul> : <p className="text-sm text-gray-500">No clause or field changes.</p>}
        {diff.applicability_changed && <p className="mt-1 text-sm text-amber-800">Applicability rules changed.</p>}
        {dates?.from && (
          <p className="mt-1 text-xs text-gray-500">
            Effective from: {fmtDate(dates.from[0])} → {fmtDate(dates.from[1])} · Effective to: {fmtDate(dates.to?.[0])} → {fmtDate(dates.to?.[1])}
          </p>
        )}
      </div>
      <div>
        <h3 className="mb-1 text-sm font-semibold text-gray-800">Text changes</h3>
        {lines.length === 0 ? <p className="text-sm text-gray-500">No text changes.</p> : (
          <pre className="max-h-[28rem] overflow-auto rounded-lg border border-gray-200 bg-white p-0 text-xs leading-5" aria-label="Unified text diff">
            {lines.map((l, i) => <div key={i} className={`whitespace-pre-wrap px-3 font-mono ${lineClass(l)}`}>{l || " "}</div>)}
          </pre>
        )}
      </div>
    </div>
  );
}
