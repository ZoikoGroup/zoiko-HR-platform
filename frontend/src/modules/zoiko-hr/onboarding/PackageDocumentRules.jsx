/*
 * The rules of one package document (Settings › Documents in your onboarding package): when it is prepared, who signs it,
 * and which new hires receive it ("include when"). Also the package-wide automation mode and the starter sets.
 */
import { useEffect, useState } from "react";
import { Loader2, Plus, Sparkles, Wand2, X, Zap } from "lucide-react";
import { SecondaryButton } from "../recruitment/ui";
import { applyStarterSet, getStarterSets, savePackageAutomation } from "../../../service/onboardingSetupService";

const inputCls = "w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100 disabled:bg-gray-50";
const LIST_OPS = ["any_of", "none_of"];
const NO_VALUE = ["set", "not_set"];

/** "Prepared when the new hire is created · Only when Work country is IN" */
export function ruleSummary(row, data) {
  const parts = [];
  const trig = (data?.triggers || []).find((t) => t.value === (row.send_when || "manual"));
  if (row.send_when === "days_before_start") parts.push(`Prepared ${row.send_days_before ?? 0} day${row.send_days_before === 1 ? "" : "s"} before the start date`);
  else if (row.send_when && row.send_when !== "manual") parts.push(`Prepared ${trig ? trig.label.charAt(0).toLowerCase() + trig.label.slice(1) : row.send_when}`);
  else parts.push("Sent by HR");
  if ((row.signers || []).includes("employer") && row.mode === "SIGN") parts.push("employer countersigns");
  if ((row.conditions || []).length) parts.push(`only when ${conditionsText(row.conditions, data)}`);
  return parts.join(" · ");
}

export function conditionsText(conditions, data) {
  const fields = Object.fromEntries((data?.condition_fields || []).map((f) => [f.value, f]));
  const ops = Object.fromEntries((data?.condition_ops || []).map((o) => [o.value, o.label]));
  return (conditions || []).map((c) => {
    const f = fields[c.field];
    const label = f?.label || c.field;
    const show = (v) => f?.options?.find((o) => o.value === v)?.label || v;
    const value = Array.isArray(c.value) ? c.value.map(show).join(", ") : c.value ? show(c.value) : "";
    return `${label} ${ops[c.op] || c.op}${value ? ` ${value}` : ""}`;
  }).join(" and ");
}

/** Every condition complete enough to send (field, operator, value where one is needed). */
export function conditionsComplete(conditions) {
  return (conditions || []).every((c) => c.field && c.op && (NO_VALUE.includes(c.op)
    || (LIST_OPS.includes(c.op) ? Array.isArray(c.value) && c.value.length > 0 : String(c.value ?? "").trim())));
}

function ValueInput({ id, field, op, value, onChange }) {
  if (NO_VALUE.includes(op)) return null;
  const options = field?.options || [];
  if (LIST_OPS.includes(op)) {
    const list = Array.isArray(value) ? value : [];
    if (options.length) {
      return (
        <fieldset className="flex flex-wrap gap-1.5 sm:col-span-3">
          <legend className="sr-only">Values</legend>
          {options.map((o) => {
            const on = list.includes(o.value);
            return (
              <label key={o.value} className={`inline-flex cursor-pointer items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs ${on ? "border-blue-300 bg-blue-50 text-blue-800" : "border-gray-200 text-gray-600"}`}>
                <input type="checkbox" className="h-3.5 w-3.5 accent-blue-600" checked={on}
                  onChange={(e) => onChange(e.target.checked ? [...list, o.value] : list.filter((v) => v !== o.value))} />
                {o.label}
              </label>
            );
          })}
        </fieldset>
      );
    }
    return (
      <input id={id} className={inputCls} placeholder="Values separated by commas" value={list.join(", ")}
        onChange={(e) => onChange(e.target.value.split(",").map((v) => v.trim()).filter(Boolean))} />
    );
  }
  if (options.length) {
    return (
      <select id={id} className={inputCls} value={value || ""} onChange={(e) => onChange(e.target.value)}>
        <option value="">Choose…</option>
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    );
  }
  return (
    <input id={id} className={inputCls} value={value || ""} type={field?.kind === "date" ? "date" : "text"}
      inputMode={field?.kind === "number" ? "decimal" : undefined}
      placeholder={field?.kind === "country" ? "e.g. India or IN" : ""} onChange={(e) => onChange(e.target.value)} />
  );
}

export function ConditionEditor({ id, data, value, onChange, disabled }) {
  const fields = data?.condition_fields || [];
  const opLabel = Object.fromEntries((data?.condition_ops || []).map((o) => [o.value, o.label]));
  const set = (i, patch) => onChange(value.map((c, j) => (j === i ? { ...c, ...patch } : c)));
  return (
    <div className="space-y-2">
      {value.length === 0 && <p className="text-xs text-gray-500">Every new hire (within the profiles chosen above) receives it.</p>}
      {value.map((c, i) => {
        const f = fields.find((x) => x.value === c.field);
        const ops = f?.ops || [];
        return (
          <div key={i} className="grid grid-cols-1 gap-2 rounded-xl border border-gray-100 bg-gray-50/60 p-2 sm:grid-cols-[1fr_9rem_1fr_auto] sm:items-start">
            <div>
              <label htmlFor={`${id}-f-${i}`} className="sr-only">Field</label>
              <select id={`${id}-f-${i}`} className={inputCls} value={c.field} disabled={disabled}
                onChange={(e) => {
                  const nf = fields.find((x) => x.value === e.target.value);
                  set(i, { field: e.target.value, op: nf?.ops?.[0] || "is", value: "" });
                }}>
                {fields.map((x) => <option key={x.value} value={x.value}>{x.label}{x.custom ? " (your field)" : ""}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor={`${id}-o-${i}`} className="sr-only">Condition</label>
              <select id={`${id}-o-${i}`} className={inputCls} value={c.op} disabled={disabled}
                onChange={(e) => set(i, { op: e.target.value, value: LIST_OPS.includes(e.target.value) ? [] : "" })}>
                {ops.map((o) => <option key={o} value={o}>{opLabel[o] || o}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor={`${id}-v-${i}`} className="sr-only">Value</label>
              <ValueInput id={`${id}-v-${i}`} field={f} op={c.op} value={c.value} onChange={(v) => set(i, { value: v })} />
            </div>
            <button type="button" onClick={() => onChange(value.filter((_, j) => j !== i))} disabled={disabled}
              className="justify-self-end rounded-lg p-2 text-gray-400 hover:bg-white hover:text-rose-600" aria-label="Remove condition">
              <X className="h-4 w-4" />
            </button>
          </div>
        );
      })}
      {!disabled && fields.length > 0 && value.length < 10 && (
        <button type="button" onClick={() => onChange([...value, { field: fields[0].value, op: fields[0].ops?.[0] || "is", value: "" }])}
          className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-semibold text-blue-700 hover:bg-blue-50">
          <Plus className="h-3.5 w-3.5" aria-hidden="true" />Add a condition
        </button>
      )}
    </div>
  );
}

/** When the document is prepared, who signs it, and which new hires receive it. */
export function RulesPanel({ row, doc, data, onChange }) {
  const id = `rules-${row.category.replace(/[^a-z0-9]/gi, "-")}`;
  const signs = row.mode === "SIGN";
  const employer = (row.signers || []).includes("employer");
  return (
    <div className="mt-3 grid gap-4 rounded-xl border border-blue-100 bg-blue-50/30 p-3 lg:grid-cols-2">
      <div className="space-y-3">
        <div>
          <label htmlFor={`${id}-when`} className="mb-1 block text-sm font-medium text-gray-700">When to prepare it</label>
          <select id={`${id}-when`} className={inputCls} value={row.send_when || "manual"}
            onChange={(e) => onChange({ send_when: e.target.value, send_days_before: e.target.value === "days_before_start" ? (row.send_days_before ?? 7) : null })}>
            {(data.triggers || []).map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
          {row.send_when === "days_before_start" && (
            <div className="mt-2 flex items-center gap-2 text-sm text-gray-700">
              <label htmlFor={`${id}-days`} className="sr-only">Days before the start date</label>
              <input id={`${id}-days`} type="number" min={0} max={90} className={`${inputCls} w-24`} value={row.send_days_before ?? 7}
                onChange={(e) => onChange({ send_days_before: e.target.value === "" ? "" : Number(e.target.value) })} />
              days before the start date
            </div>
          )}
        </div>
        {signs && (
          <fieldset>
            <legend className="mb-1 block text-sm font-medium text-gray-700">Who signs</legend>
            <div className="flex flex-wrap gap-4 text-sm text-gray-700">
              <label className="inline-flex items-center gap-2 text-gray-500">
                <input type="checkbox" className="h-4 w-4 accent-blue-600" checked disabled />New hire
              </label>
              <label className="inline-flex items-center gap-2">
                <input type="checkbox" className="h-4 w-4 accent-blue-600" checked={employer}
                  onChange={(e) => onChange({ signers: e.target.checked ? ["candidate", "employer"] : ["candidate"] })} />
                The employer countersigns after them
              </label>
            </div>
            {employer && <p className="mt-1 text-xs text-gray-500">Choose who countersigns under “Employer countersignature”. Until someone can, this document is held.</p>}
          </fieldset>
        )}
      </div>
      <div>
        <p className="mb-1 text-sm font-medium text-gray-700">Only send it when</p>
        {doc.mandatory ? (
          <p className="text-xs text-gray-500">{doc.title} goes to every new hire.</p>
        ) : (
          <ConditionEditor id={id} data={data} value={row.conditions || []} onChange={(conditions) => onChange({ conditions })} />
        )}
      </div>
    </div>
  );
}

/** Prepare-and-review or send-automatically, for documents that have a trigger. Saved at once. */
export function AutomationBar({ automation, onSaved, onMessage }) {
  const [busy, setBusy] = useState(false);
  if (!automation) return null;
  const choose = async (mode) => {
    if (mode === automation.mode) return;
    setBusy(true);
    try {
      onSaved(await savePackageAutomation({ mode }));
      onMessage({ tone: "ok", text: mode === "auto" ? "Documents with a trigger are now sent as soon as they are ready." : "Documents with a trigger are now prepared for you to review and send." });
    } catch (e) {
      onMessage({ tone: "error", text: e?.message || "The setting could not be saved." });
    } finally {
      setBusy(false);
    }
  };
  return (
    <fieldset className="rounded-xl border border-gray-200 bg-gray-50/60 p-3" disabled={busy}>
      <legend className="flex items-center gap-1.5 px-1 text-sm font-semibold text-gray-800"><Zap className="h-4 w-4 text-blue-600" aria-hidden="true" />Documents with a trigger</legend>
      <div className="grid gap-2 sm:grid-cols-2">
        {(automation.modes || []).map((m) => (
          <label key={m.value} className={`flex cursor-pointer items-start gap-2 rounded-xl border p-3 text-sm ${automation.mode === m.value ? "border-blue-300 bg-white ring-1 ring-blue-100" : "border-gray-200 bg-white/60"}`}>
            <input type="radio" name="pkg-automation" className="mt-0.5 accent-blue-600" checked={automation.mode === m.value} onChange={() => choose(m.value)} />
            <span>
              <span className="block font-medium text-gray-900">{m.value === "auto" ? "Send automatically" : "Prepare, then I send"}</span>
              <span className="text-xs text-gray-600">{m.label}. A document missing a value is never sent; you are told what is missing.</span>
            </span>
          </label>
        ))}
      </div>
      {busy && <Loader2 className="mt-2 h-4 w-4 animate-spin text-blue-600" aria-label="Saving" />}
    </fieldset>
  );
}

/** "Start from a starter set": the platform documents that suit the organisation's country. */
export function StarterSetPicker({ onApplied, onMessage }) {
  const [open, setOpen] = useState(false);
  const [opts, setOpts] = useState(null);
  const [choice, setChoice] = useState("");
  const [when, setWhen] = useState("hire_created");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!open || opts) return;
    getStarterSets().then((o) => { setOpts(o); setChoice(o.current || o.suggested); })
      .catch((e) => onMessage({ tone: "error", text: e?.message || "The starter sets could not be loaded." }));
  }, [open, opts, onMessage]);
  const apply = async () => {
    if (!window.confirm("Switch your platform documents to this starter set? Your own documents are not changed, and documents already sent stay with each hire.")) return;
    setBusy(true);
    try {
      onApplied(await applyStarterSet(choice, when));
      onMessage({ tone: "ok", text: "Starter set applied." });
      setOpen(false);
      setOpts(null);
    } catch (e) {
      onMessage({ tone: "error", text: e?.message || "The starter set could not be applied." });
    } finally {
      setBusy(false);
    }
  };
  if (!open) {
    return <SecondaryButton icon={Wand2} onClick={() => setOpen(true)}>Start from a starter set</SecondaryButton>;
  }
  return (
    <div className="rounded-2xl border border-blue-200 bg-blue-50/40 p-4" role="region" aria-label="Starter sets">
      <div className="mb-2 flex items-center justify-between">
        <p className="flex items-center gap-1.5 text-sm font-semibold text-gray-900"><Sparkles className="h-4 w-4 text-blue-600" aria-hidden="true" />Starter sets</p>
        <button type="button" onClick={() => setOpen(false)} className="rounded-lg p-1 text-gray-500 hover:bg-white" aria-label="Close"><X className="h-4 w-4" /></button>
      </div>
      {!opts ? <Loader2 className="h-5 w-5 animate-spin text-blue-600" aria-label="Loading" /> : (
        <>
          <div className="space-y-2">
            {opts.sets.map((s) => (
              <label key={s.key} className={`flex cursor-pointer items-start gap-2 rounded-xl border bg-white p-3 text-sm ${choice === s.key ? "border-blue-300 ring-1 ring-blue-100" : "border-gray-200"}`}>
                <input type="radio" name="starter-set" className="mt-0.5 accent-blue-600" checked={choice === s.key} onChange={() => setChoice(s.key)} />
                <span className="min-w-0">
                  <span className="block font-medium text-gray-900">{s.name}{s.key === opts.suggested ? " · suggested for your country" : ""}{s.key === opts.current ? " · in use" : ""}</span>
                  <span className="block text-xs text-gray-600">{s.documents.join(", ")}</span>
                </span>
              </label>
            ))}
          </div>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <label htmlFor="starter-when" className="mb-1 block text-xs font-medium text-gray-600">Prepare them</label>
              <select id="starter-when" className={inputCls} value={when} onChange={(e) => setWhen(e.target.value)}>
                <option value="hire_created">When the new hire is created</option>
                <option value="details_submitted">When the new hire submits their details</option>
                <option value="manual">Only when HR sends them</option>
              </select>
            </div>
            <SecondaryButton onClick={apply} disabled={busy || !choice}>{busy ? "Applying…" : "Apply this set"}</SecondaryButton>
          </div>
        </>
      )}
    </div>
  );
}
