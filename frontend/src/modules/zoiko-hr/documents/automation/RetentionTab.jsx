import { useState } from "react";
import SectionState from "../components/SectionState";
import { useDeleteRetentionPolicy, useRetentionPolicies, useSaveRetentionPolicy } from "../hooks/useAutomation";

const CLOCK_LABEL = { from_upload: "after upload", from_exit: "after the person leaves", from_expiry: "after it expires" };
const ACTION_LABEL = { flag: "Tell HR", archive: "Archive", delete: "Delete (after review)" };

/**
 * Retention tab (docs/new_docs/ZHR-DOCS-ARCH-001 Phase 7): how long each category's files are kept and what happens then.
 * No policy = kept indefinitely. Only the Org Admin may choose Delete, and files on legal hold are never removed.
 */
export default function RetentionTab() {
  const query = useRetentionPolicies();
  const [error, setError] = useState(null);
  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-600">Files are kept indefinitely unless you set a period. When it ends, HR is told first; deleting
        happens only after the review window, and never for files on legal hold.</p>
      {error && <p role="alert" className="rounded-xl bg-rose-50 px-4 py-2 text-sm text-rose-800">{error}</p>}
      <SectionState query={query} label="Loading retention policies" isEmpty={(d) => !d?.items?.length} empty={{ title: "No categories" }}>
        {(data) => (
          <div className="overflow-x-auto rounded-2xl border border-gray-200/80 bg-white shadow-sm dark:border-[#334155] dark:bg-[#1e293b]">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                <tr><th className="px-4 py-3">Category</th><th className="px-4 py-3">Keep for</th><th className="px-4 py-3">Counted</th>
                  <th className="px-4 py-3">Then</th><th className="px-4 py-3"><span className="sr-only">Save</span></th></tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {data.items.map((c) => (
                  <PolicyRow key={`${c.scope}:${c.key}`} category={c} canDelete={data.can_delete} onError={setError} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionState>
    </div>
  );
}

function PolicyRow({ category: c, canDelete, onError }) {
  const p = c.policy;
  const [years, setYears] = useState(p?.retain_years ?? "");
  const [clock, setClock] = useState(p?.clock ?? (c.scope === "employee" ? "from_exit" : "from_upload"));
  const [action, setAction] = useState(p?.action ?? "archive");
  const save = useSaveRetentionPolicy();
  const remove = useDeleteRetentionPolicy();
  const changed = String(years) !== String(p?.retain_years ?? "") || clock !== (p?.clock ?? clock) || action !== (p?.action ?? "archive");
  const run = async (fn) => {
    onError(null);
    try { await fn(); } catch (e) { onError(e?.message || "That change was not saved."); }
  };
  const label = `${c.name} (${c.scope === "employee" ? "employee" : "company"})`;
  return (
    <tr>
      <td className="px-4 py-3">
        <p className="font-medium text-slate-900 dark:text-[#f1f5f9]">{c.name}</p>
        <p className="text-xs text-slate-500">{c.scope === "employee" ? "Employee documents" : "Company documents"} · {p ? "" : "kept indefinitely"}</p>
      </td>
      <td className="px-4 py-3">
        <label className="inline-flex items-center gap-1">
          <input type="number" min={1} max={100} value={years} onChange={(e) => setYears(e.target.value)} aria-label={`Years to keep ${label}`}
            className="w-20 rounded-lg border border-gray-200 px-2 py-1 text-sm" /> years
        </label>
      </td>
      <td className="px-4 py-3">
        <select value={clock} onChange={(e) => setClock(e.target.value)} aria-label={`When the period starts for ${label}`}
          className="rounded-lg border border-gray-200 px-2 py-1 text-sm">
          {Object.entries(CLOCK_LABEL).filter(([v]) => c.scope === "employee" || v !== "from_exit")
            .map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      </td>
      <td className="px-4 py-3">
        <select value={action} onChange={(e) => setAction(e.target.value)} aria-label={`What happens to ${label}`}
          className="rounded-lg border border-gray-200 px-2 py-1 text-sm">
          {Object.entries(ACTION_LABEL).filter(([v]) => v !== "delete" || canDelete || action === "delete")
            .map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      </td>
      <td className="whitespace-nowrap px-4 py-3 text-right">
        <button type="button" disabled={!changed || !years || save.isPending}
          onClick={() => run(() => save.mutateAsync({ scope: c.scope, key: c.key, retainYears: Number(years), clock, action }))}
          className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50">Save</button>
        {p && (
          <button type="button" onClick={() => run(() => remove.mutateAsync({ scope: c.scope, key: c.key }))}
            className="ml-2 rounded-lg px-2 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100" aria-label={`Keep ${label} indefinitely`}>
            Keep indefinitely
          </button>
        )}
      </td>
    </tr>
  );
}
