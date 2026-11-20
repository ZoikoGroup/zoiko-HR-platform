import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import SectionState from "../components/SectionState";
import RuleBuilderDrawer from "./RuleBuilderDrawer";
import { useAutomationRules, useDeleteAutomationRule, useSetAutomationRuleStatus } from "../hooks/useAutomation";
import { formatDateTime } from "../../../../utils/dateTime";

const STATUS_STYLE = { active: "bg-emerald-50 text-emerald-800", paused: "bg-slate-100 text-slate-600", shadow: "bg-violet-50 text-violet-800" };
const STATUS_LABEL = { active: "Active", paused: "Paused", shadow: "Shadow" };

/**
 * Rules tab (docs/new_docs/ZHR-DOCS-ARCH-001 §15.3): every rule with its trigger, status, last run and 7-day success rate.
 * System rules can be paused or edited, never deleted. New / edit opens the WHEN · IF · THEN builder.
 */
export default function RulesTab() {
  const query = useAutomationRules();
  const setStatus = useSetAutomationRuleStatus();
  const remove = useDeleteAutomationRule();
  const [editing, setEditing] = useState(null);         // {} for a new rule, or the rule
  const [error, setError] = useState(null);
  const run = async (fn) => {
    setError(null);
    try { await fn(); } catch (e) { setError(e?.message || "That didn't work."); }
  };

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <button type="button" onClick={() => setEditing({})}
          className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700">
          <Plus size={16} aria-hidden="true" /> New rule
        </button>
      </div>
      {error && <p role="alert" className="rounded-xl bg-rose-50 px-4 py-2 text-sm text-rose-800">{error}</p>}
      <SectionState query={query} label="Loading rules" isEmpty={(d) => !d?.length} empty={{ title: "No rules yet" }}>
        {(rules) => (
          <div className="overflow-x-auto rounded-2xl border border-gray-200/80 bg-white shadow-sm dark:border-[#334155] dark:bg-[#1e293b]">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                <tr><th className="px-4 py-3">Rule</th><th className="px-4 py-3">When</th><th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Last run</th><th className="px-4 py-3">7-day success</th><th className="px-4 py-3"><span className="sr-only">Actions</span></th></tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {rules.map((r) => (
                  <tr key={r.id}>
                    <td className="px-4 py-3">
                      <button type="button" onClick={() => setEditing(r)} className="text-left font-medium text-blue-700 hover:underline">{r.name}</button>
                      {r.is_system && <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600">System</span>}
                      {r.description && <p className="text-xs text-slate-500">{r.description}</p>}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs">{r.trigger_event}</td>
                    <td className="px-4 py-3">
                      <label className="sr-only" htmlFor={`rule-status-${r.id}`}>Status of {r.name}</label>
                      <select id={`rule-status-${r.id}`} value={r.status} onChange={(e) => run(() => setStatus.mutateAsync({ id: r.id, status: e.target.value }))}
                        className={`rounded-full border-0 px-2 py-1 text-xs font-semibold ${STATUS_STYLE[r.status] || ""}`}>
                        {Object.entries(STATUS_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                      </select>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-600">{r.last_run_at ? formatDateTime(r.last_run_at) : "—"}</td>
                    <td className="px-4 py-3 text-xs">{r.success_rate_7d == null ? "—" : `${r.success_rate_7d}% of ${r.runs_7d}`}</td>
                    <td className="px-4 py-3 text-right">
                      {!r.is_system && (
                        <button type="button" aria-label={`Delete ${r.name}`} onClick={() => run(() => remove.mutateAsync(r.id))}
                          className="rounded-lg p-1.5 text-rose-700 hover:bg-rose-50"><Trash2 size={16} aria-hidden="true" /></button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionState>
      {editing && <RuleBuilderDrawer rule={editing.id ? editing : null} onClose={() => setEditing(null)} />}
    </div>
  );
}
