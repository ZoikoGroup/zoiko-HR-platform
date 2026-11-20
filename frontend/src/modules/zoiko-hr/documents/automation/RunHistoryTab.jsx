import { useEffect, useRef, useState } from "react";
import { RotateCcw } from "lucide-react";
import SectionState from "../components/SectionState";
import Pager from "../components/Pager";
import { useAutomationRun, useAutomationRuns, useRetryAutomationRun } from "../hooks/useAutomation";
import { formatDateTime } from "../../../../utils/dateTime";

const STATUSES = [["", "All"], ["succeeded", "Succeeded"], ["waiting", "Waiting"], ["pending", "Pending"], ["failed", "Failed"],
  ["dead", "Gave up"], ["skipped", "Skipped"]];
const STATUS_STYLE = { succeeded: "bg-emerald-50 text-emerald-800", failed: "bg-rose-50 text-rose-800", dead: "bg-rose-100 text-rose-900",
  skipped: "bg-slate-100 text-slate-600", waiting: "bg-amber-50 text-amber-800", pending: "bg-blue-50 text-blue-800", running: "bg-blue-50 text-blue-800" };
const label = (s) => (STATUSES.find(([v]) => v === s)?.[1]) || s;

/** Run history (docs/new_docs/ZHR-DOCS-ARCH-001 §15.3): what each rule did, step by step; failed runs can be retried. */
export default function RunHistoryTab() {
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState(null);
  const query = useAutomationRuns({ status: status || undefined, page, per_page: 50 });
  return (
    <div className="space-y-3">
      <label className="inline-flex items-center gap-2 text-sm">Status
        <select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} className="rounded-lg border border-gray-200 px-2 py-1">
          {STATUSES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      </label>
      <SectionState query={query} label="Loading runs" isEmpty={(d) => !d?.items?.length} empty={{ title: "No runs yet" }}>
        {(data) => (
          <>
            <div className="overflow-x-auto rounded-2xl border border-gray-200/80 bg-white shadow-sm dark:border-[#334155] dark:bg-[#1e293b]">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                  <tr><th className="px-4 py-3">When</th><th className="px-4 py-3">Rule</th><th className="px-4 py-3">Event</th>
                    <th className="px-4 py-3">Status</th><th className="px-4 py-3"><span className="sr-only">Open</span></th></tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {data.items.map((r) => (
                    <tr key={r.id}>
                      <td className="px-4 py-3 text-xs">{formatDateTime(r.created_at)}</td>
                      <td className="px-4 py-3">{r.rule_name || "Deleted rule"}{r.mode === "shadow" && <span className="ml-1 text-xs text-violet-700">(shadow)</span>}</td>
                      <td className="px-4 py-3 font-mono text-xs">{r.event_type}</td>
                      <td className="px-4 py-3"><span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS_STYLE[r.status] || ""}`}>{label(r.status)}</span></td>
                      <td className="px-4 py-3 text-right">
                        <button type="button" onClick={() => setOpen(r.id)} aria-label={`Details of run ${r.id}`} className="text-xs font-semibold text-blue-700 hover:underline">Details</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pager page={data.page} perPage={data.per_page} total={data.total} onPage={setPage} />
          </>
        )}
      </SectionState>
      {open && <RunDetailDrawer runId={open} onClose={() => setOpen(null)} />}
    </div>
  );
}

function RunDetailDrawer({ runId, onClose }) {
  const query = useAutomationRun(runId);
  const retry = useRetryAutomationRun();
  const [error, setError] = useState(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") closeRef.current(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);
  const run = query.data;
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40" onClick={onClose}>
      <section role="dialog" aria-modal="true" aria-label={`Run ${runId}`} onClick={(e) => e.stopPropagation()}
        className="h-full w-full max-w-lg overflow-auto bg-white p-5 shadow-2xl dark:bg-[#1e293b]">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold">Run {runId}</h2>
          <button type="button" onClick={onClose} className="text-sm underline">Close</button>
        </div>
        <SectionState query={query} label="Loading run">
          {() => (
            <div className="space-y-3 text-sm">
              <p><strong>{run.rule_name || "Deleted rule"}</strong> · <span className="font-mono text-xs">{run.event_type}</span></p>
              <p>Status: <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS_STYLE[run.status] || ""}`}>{label(run.status)}</span>
                {run.attempt > 0 && <span className="ml-2 text-xs text-slate-500">attempt {run.attempt}</span>}</p>
              {run.error && <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-rose-800">{run.error}</p>}
              <ol aria-label="Steps" className="space-y-2">
                {(run.steps || []).map((s, i) => (
                  <li key={i} className="rounded-lg border border-slate-200 p-2">
                    <span className="font-semibold">{i + 1}. {s.type}</span> <span className={s.ok === false ? "text-rose-700" : "text-emerald-700"}>{s.ok === false ? "failed" : "done"}</span>
                    {s.detail && <pre className="mt-1 whitespace-pre-wrap break-all text-xs text-slate-600">{JSON.stringify(s.detail)}</pre>}
                  </li>
                ))}
                {(run.steps || []).length === 0 && <li className="text-slate-500">No steps ran yet.</li>}
              </ol>
              {error && <p role="alert" className="text-rose-700">{error}</p>}
              {run.can_retry && (
                <button type="button" disabled={retry.isPending}
                  onClick={async () => { setError(null); try { await retry.mutateAsync(run.id); } catch (e) { setError(e?.message || "Retry failed."); } }}
                  className="inline-flex items-center gap-1 rounded-xl bg-blue-600 px-4 py-2 font-semibold text-white disabled:opacity-60">
                  <RotateCcw size={14} aria-hidden="true" /> Retry
                </button>
              )}
            </div>
          )}
        </SectionState>
      </section>
    </div>
  );
}
