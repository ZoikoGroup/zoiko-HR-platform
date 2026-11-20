import { useEffect, useRef, useState } from "react";
import { ArrowDown, ArrowUp, Plus, X } from "lucide-react";
import { useAutomationCatalog, useCreateAutomationRule, useDryRunAutomationRule, useUpdateAutomationRule } from "../hooks/useAutomation";

const OP_LABEL = { eq: "is", ne: "is not", in: "is one of", not_in: "is not one of", gt: ">", gte: "≥", lt: "<", lte: "≤", exists: "is set", contains: "contains" };
const LIST_OPS = new Set(["in", "not_in"]);
// Typed parameters each action's form shows (anything else in the action is kept as it is).
const ACTION_FIELDS = {
  notify: [["to", "Send to", ["assignee", "manager", "hr_admins", "org_admins"]], ["title", "Title", "text"]],
  create_task: [["kind", "Task", ["upload_required", "reupload", "acknowledge", "review", "renew"]], ["due_in_days", "Due in (days)", "number"]],
  cancel_tasks: [["kind", "Task", ["upload_required", "reupload", "acknowledge", "review", "renew"]]],
  create_upload_tasks: [["due_in_days", "Due in (days)", "number"]],
  reassess_requirements: [["due_in_days", "Due in (days)", "number"]],
  notify_document_decision: [["due_in_days", "Re-upload due in (days)", "number"]],
  open_renew_task: [["due_in_days", "Due in (days)", "number"]],
  delay: [["seconds", "Wait (seconds, at most 7 days)", "number"]],
  log: [["message", "Message", "text"]],
};

function parseValue(op, raw) {
  if (op === "exists") return undefined;
  const one = (v) => { const t = String(v).trim(); return t !== "" && !Number.isNaN(Number(t)) ? Number(t) : t === "true" ? true : t === "false" ? false : t; };
  return LIST_OPS.has(op) ? String(raw).split(",").map((v) => v.trim()).filter(Boolean).map(one) : one(raw);
}
const showValue = (v) => (Array.isArray(v) ? v.join(", ") : v ?? "");

/**
 * Rule builder (docs/new_docs/ZHR-DOCS-ARCH-001 §15.3): WHEN an event happens, IF all / any conditions hold, THEN the
 * actions run in order. "Try it" dry-runs the rule against recent real events and sends nothing. A system rule's trigger
 * is fixed; it can be edited and paused.
 */
export default function RuleBuilderDrawer({ rule, onClose }) {
  const catalog = useAutomationCatalog();
  const create = useCreateAutomationRule();
  const update = useUpdateAutomationRule();
  const dry = useDryRunAutomationRule();
  const defn = rule?.definition || {};
  const groupKey = defn.conditions?.any ? "any" : "all";
  const [name, setName] = useState(rule?.name || "");
  const [event, setEvent] = useState(rule?.trigger_event || "");
  const [mode, setMode] = useState(groupKey);
  const [conditions, setConditions] = useState(() => (defn.conditions?.[groupKey] || []).filter((c) => c.field)
    .map((c) => ({ field: c.field, op: c.op, raw: showValue(c.value) })));
  const [actions, setActions] = useState(() => (defn.actions || []).map((a) => ({ ...a })));
  const [problems, setProblems] = useState([]);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") closeRef.current(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  const cat = catalog.data;
  const eventFields = (cat?.events || []).find((e) => e.type === event)?.fields || [];
  const fieldOptions = [...eventFields.map((f) => ({ field: f, label: f.replace(/^data\./, "event: ") })), ...((cat?.fields) || [])];
  const definition = () => ({
    ...(defn.feature ? { feature: defn.feature } : {}),
    conditions: { [mode]: conditions.map((c) => ({ field: c.field, op: c.op, ...(c.op === "exists" ? {} : { value: parseValue(c.op, c.raw) }) })) },
    actions: actions.map((a) => Object.fromEntries(Object.entries(a).filter(([, v]) => v !== "" && v !== undefined))),
  });
  const fail = (e) => setProblems(e?.problems || e?.data?.problems || [e?.message || "That didn't work."]);

  const save = async (status) => {
    setProblems([]);
    if (!name.trim() || !event || actions.length === 0) { setProblems(["Give the rule a name, an event and at least one action."]); return; }
    try {
      if (rule) {
        await update.mutateAsync({ id: rule.id, name, ...(rule.is_system ? {} : { trigger_event: event }), definition: definition() });
      } else {
        await create.mutateAsync({ name, trigger_event: event, definition: definition(), status });
      }
      onClose();
    } catch (e) { fail(e); }
  };
  const tryIt = async () => {
    setProblems([]);
    try { await dry.mutateAsync({ id: rule?.id, definition: definition(), triggerEvent: event }); } catch (e) { fail(e); }
  };
  const move = (i, d) => setActions((list) => { const n = [...list]; [n[i], n[i + d]] = [n[i + d], n[i]]; return n; });

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40" onClick={onClose}>
      <section role="dialog" aria-modal="true" aria-label={rule ? `Edit rule ${rule.name}` : "New rule"} onClick={(e) => e.stopPropagation()}
        className="h-full w-full max-w-2xl overflow-auto bg-white p-5 shadow-2xl dark:bg-[#1e293b]">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold">{rule ? `Edit rule` : "New rule"}</h2>
          <button type="button" onClick={onClose} className="text-sm underline">Close</button>
        </div>
        <div className="space-y-5 text-sm">
          <label className="block font-medium">Name
            <input value={name} onChange={(e) => setName(e.target.value)} maxLength={120} className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2" />
          </label>

          <fieldset className="rounded-xl border border-slate-200 p-3">
            <legend className="px-1 text-xs font-bold uppercase tracking-wide text-slate-500">When</legend>
            <label className="block">
              <span className="sr-only">Event</span>
              <select aria-label="Event" value={event} onChange={(e) => setEvent(e.target.value)} disabled={Boolean(rule?.is_system)}
                className="w-full rounded-lg border border-gray-200 px-3 py-2">
                <option value="">Choose an event…</option>
                {(cat?.events || []).map((e) => <option key={e.type} value={e.type}>{e.type} — {e.description}</option>)}
              </select>
            </label>
            {rule?.is_system && <p className="mt-1 text-xs text-slate-500">A system rule's event can't change.</p>}
          </fieldset>

          <fieldset className="rounded-xl border border-slate-200 p-3">
            <legend className="px-1 text-xs font-bold uppercase tracking-wide text-slate-500">If</legend>
            <div className="mb-2 flex items-center gap-2 text-xs">
              <span>Match</span>
              <select aria-label="Match all or any" value={mode} onChange={(e) => setMode(e.target.value)} className="rounded-lg border border-gray-200 px-2 py-1">
                <option value="all">all conditions</option><option value="any">any condition</option>
              </select>
              {conditions.length === 0 && <span className="text-slate-500">(no conditions: every event of this kind)</span>}
            </div>
            <ul className="space-y-2">
              {conditions.map((c, i) => (
                <li key={i} className="flex flex-wrap items-center gap-2">
                  <select aria-label={`Condition ${i + 1} field`} value={c.field} onChange={(e) => setConditions((l) => l.map((x, j) => (j === i ? { ...x, field: e.target.value } : x)))}
                    className="rounded-lg border border-gray-200 px-2 py-1">
                    {!fieldOptions.some((f) => f.field === c.field) && <option value={c.field}>{c.field}</option>}
                    {fieldOptions.map((f) => <option key={f.field} value={f.field}>{f.label}</option>)}
                  </select>
                  <select aria-label={`Condition ${i + 1} operator`} value={c.op} onChange={(e) => setConditions((l) => l.map((x, j) => (j === i ? { ...x, op: e.target.value } : x)))}
                    className="rounded-lg border border-gray-200 px-2 py-1">
                    {(cat?.operators || Object.keys(OP_LABEL)).map((o) => <option key={o} value={o}>{OP_LABEL[o] || o}</option>)}
                  </select>
                  {c.op !== "exists" && (
                    <input aria-label={`Condition ${i + 1} value`} value={c.raw} placeholder={LIST_OPS.has(c.op) ? "a, b, c" : "value"}
                      onChange={(e) => setConditions((l) => l.map((x, j) => (j === i ? { ...x, raw: e.target.value } : x)))}
                      className="min-w-[8rem] flex-1 rounded-lg border border-gray-200 px-2 py-1" />
                  )}
                  <button type="button" aria-label={`Remove condition ${i + 1}`} onClick={() => setConditions((l) => l.filter((_, j) => j !== i))}
                    className="rounded p-1 text-slate-500 hover:bg-slate-100"><X size={14} aria-hidden="true" /></button>
                </li>
              ))}
            </ul>
            <button type="button" disabled={conditions.length >= (cat?.limits?.conditions || 10)}
              onClick={() => setConditions((l) => [...l, { field: fieldOptions[0]?.field || "data.category_key", op: "eq", raw: "" }])}
              className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-blue-700 disabled:opacity-50"><Plus size={12} aria-hidden="true" /> Add condition</button>
          </fieldset>

          <fieldset className="rounded-xl border border-slate-200 p-3">
            <legend className="px-1 text-xs font-bold uppercase tracking-wide text-slate-500">Then</legend>
            <ol className="space-y-2">
              {actions.map((a, i) => (
                <li key={i} className="rounded-lg border border-slate-200 p-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-slate-500">{i + 1}.</span>
                    <select aria-label={`Action ${i + 1}`} value={a.type} onChange={(e) => setActions((l) => l.map((x, j) => (j === i ? { type: e.target.value } : x)))}
                      className="flex-1 rounded-lg border border-gray-200 px-2 py-1">
                      {!(cat?.actions || []).some((x) => x.type === a.type) && <option value={a.type}>{a.type}</option>}
                      {(cat?.actions || []).map((x) => <option key={x.type} value={x.type}>{x.type} — {x.description}</option>)}
                    </select>
                    <button type="button" aria-label={`Move action ${i + 1} up`} disabled={i === 0} onClick={() => move(i, -1)} className="rounded p-1 disabled:opacity-30"><ArrowUp size={14} aria-hidden="true" /></button>
                    <button type="button" aria-label={`Move action ${i + 1} down`} disabled={i === actions.length - 1} onClick={() => move(i, 1)} className="rounded p-1 disabled:opacity-30"><ArrowDown size={14} aria-hidden="true" /></button>
                    <button type="button" aria-label={`Remove action ${i + 1}`} onClick={() => setActions((l) => l.filter((_, j) => j !== i))} className="rounded p-1 text-slate-500 hover:bg-slate-100"><X size={14} aria-hidden="true" /></button>
                  </div>
                  {(ACTION_FIELDS[a.type] || []).length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-3 pl-5">
                      {ACTION_FIELDS[a.type].map(([key, label, kind]) => (
                        <label key={key} className="text-xs">{label}
                          {Array.isArray(kind) ? (
                            <select value={a[key] ?? ""} onChange={(e) => setActions((l) => l.map((x, j) => (j === i ? { ...x, [key]: e.target.value } : x)))}
                              className="ml-1 rounded border border-gray-200 px-1 py-0.5">
                              <option value="">—</option>{kind.map((o) => <option key={o} value={o}>{o}</option>)}
                            </select>
                          ) : (
                            <input type={kind} value={a[key] ?? ""} onChange={(e) => setActions((l) => l.map((x, j) => (j === i ? { ...x, [key]: kind === "number" ? (e.target.value === "" ? "" : Number(e.target.value)) : e.target.value } : x)))}
                              className="ml-1 w-28 rounded border border-gray-200 px-1 py-0.5" />
                          )}
                        </label>
                      ))}
                    </div>
                  )}
                </li>
              ))}
            </ol>
            <button type="button" disabled={actions.length >= (cat?.limits?.actions || 8)} onClick={() => setActions((l) => [...l, { type: "notify", to: "assignee" }])}
              className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-blue-700 disabled:opacity-50"><Plus size={12} aria-hidden="true" /> Add action</button>
          </fieldset>

          {problems.length > 0 && (
            <div role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-rose-800"><ul className="list-disc pl-4">{problems.map((p) => <li key={p}>{p}</li>)}</ul></div>
          )}
          {dry.data && (
            <section role="status" aria-label="Try-it result" className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <p className="font-semibold">{dry.data.events === 0 ? "No recent events of this kind to try it on yet." : `Matched ${dry.data.matched} of the last ${dry.data.events} event${dry.data.events === 1 ? "" : "s"}. Nothing was sent.`}</p>
              <ul className="mt-1 space-y-1 text-xs">
                {dry.data.results.filter((r) => r.matched).slice(0, 5).map((r) => (
                  <li key={r.event_id}><span className="font-mono">{String(r.event_id).slice(0, 8)}</span>: would {r.actions.map((x) => x.type).join(" → ")}</li>
                ))}
              </ul>
            </section>
          )}
          <div className="flex flex-wrap justify-between gap-2 border-t border-slate-100 pt-3">
            <button type="button" onClick={tryIt} disabled={!event || dry.isPending} className="rounded-xl border border-slate-200 px-4 py-2 font-medium disabled:opacity-50">Try it</button>
            <div className="flex gap-2">
              {rule ? (
                <button type="button" onClick={() => save()} className="rounded-xl bg-blue-600 px-4 py-2 font-semibold text-white hover:bg-blue-700">Save</button>
              ) : (
                <>
                  <button type="button" onClick={() => save("shadow")} className="rounded-xl border border-violet-200 px-4 py-2 font-medium text-violet-800">Save as shadow</button>
                  <button type="button" onClick={() => save("paused")} className="rounded-xl border border-slate-200 px-4 py-2 font-medium">Save paused</button>
                  <button type="button" onClick={() => save("active")} className="rounded-xl bg-blue-600 px-4 py-2 font-semibold text-white hover:bg-blue-700">Activate</button>
                </>
              )}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
