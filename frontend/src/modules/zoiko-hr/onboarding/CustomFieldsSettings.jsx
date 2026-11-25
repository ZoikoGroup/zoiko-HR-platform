/*
 * Onboarding › Settings › "Your document fields".
 * The organisation's own merge fields ({{custom.<key>}}): things its templates print that the platform does not know (a shift
 * allowance, a pension scheme, a cost centre). Each field says where its value comes from – HR types it for each new hire,
 * the new hire fills it in on the portal, or one fixed value for everyone – and whether a document waits for it.
 */
import { useEffect, useMemo, useState } from "react";
import { Braces, Copy, Loader2, Plus, Save, Trash2 } from "lucide-react";
import { PrimaryButton, SecondaryButton, StatusPill } from "../recruitment/ui";
import { getCustomFields, saveCustomFields } from "../../../service/onboardingSetupService";
import { SettingsCard } from "./settingsUi";

const inputCls = "w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100";
const KEY_RE = /^[a-z][a-z0-9_]{1,39}$/;

/** "Shift Allowance" → "shift_allowance" (the same rule as the server). */
export function slugForField(text) {
  let s = String(text || "").trim().replace(/([a-z0-9])([A-Z])/g, "$1_$2").toLowerCase();
  s = s.replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").replace(/^[0-9_]+/, "").slice(0, 40).replace(/_+$/, "");
  return KEY_RE.test(s) ? s : "";
}

const blank = () => ({ key: "", label: "", type: "text", source: "hr", required: true, help: "", options: [], value: "", active: true, _new: true });

export function fieldProblems(f) {
  const out = [];
  if (!f.label.trim()) out.push("Give the field a label.");
  if (!KEY_RE.test(f.key)) out.push("The field name must be 2–40 lower-case letters, digits or _, starting with a letter.");
  if (f.type === "choice" && !(f.options || []).filter((o) => o.trim()).length) out.push("Add at least one option.");
  if (f.source === "fixed" && f.required && !String(f.value || "").trim()) out.push("Give the value printed for every new hire.");
  return out;
}

export default function CustomFieldsSettings() {
  const [data, setData] = useState(null);
  const [rows, setRows] = useState([]);
  const [saved, setSaved] = useState("[]");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState(null);

  const hydrate = (res) => {
    setData(res);
    const list = (res.fields || []).map((f) => ({ ...blank(), ...f, options: f.options || [], value: f.value ?? "", _new: false }));
    setRows(list);
    setSaved(JSON.stringify(list));
  };

  useEffect(() => {
    let live = true;
    getCustomFields()
      .then((res) => live && hydrate(res))
      .catch((e) => live && setMsg({ tone: "error", text: e?.message || "Your fields could not be loaded." }))
      .finally(() => live && setLoading(false));
    return () => { live = false; };
  }, []);

  const dirty = JSON.stringify(rows) !== saved;
  const problems = useMemo(() => rows.map(fieldProblems), [rows]);
  const duplicate = useMemo(() => {
    const seen = new Set();
    return rows.find((r) => r.key && (seen.has(r.key) || !seen.add(r.key)))?.key;
  }, [rows]);
  const set = (i, patch) => setRows((list) => list.map((r, j) => {
    if (j !== i) return r;
    const next = { ...r, ...patch };
    if (r._new && "label" in patch && (!r.key || r.key === slugForField(r.label))) next.key = slugForField(patch.label);
    return next;
  }));

  const save = async () => {
    setSaving(true);
    setMsg(null);
    try {
      const payload = rows.map(({ _new, in_use, token, ...f }) => ({
        ...f, options: f.type === "choice" ? f.options.filter((o) => o.trim()) : undefined,
        value: f.source === "fixed" ? f.value : undefined,
      }));
      hydrate(await saveCustomFields(payload));
      setMsg({ tone: "ok", text: "Fields saved. Use them in any template as {{custom.<name>}}." });
    } catch (e) {
      setMsg({ tone: "error", text: e?.message || "Your fields could not be saved." });
    } finally {
      setSaving(false);
    }
  };

  const copy = async (text) => {
    try { await navigator.clipboard?.writeText(text); setMsg({ tone: "ok", text: `Copied ${text}` }); } catch { /* clipboard blocked */ }
  };

  const invalid = problems.some((p) => p.length) || !!duplicate;

  return (
    <SettingsCard id="custom-fields" icon={Braces} title="Your document fields"
      help="Things your own templates print that are not standard fields – an allowance, a pension scheme, a cost centre. Write them in a template as {{custom.name}}."
      action={!loading && data ? <SecondaryButton icon={Plus} onClick={() => setRows((l) => [...l, blank()])} disabled={rows.length >= (data.max_fields || 60)}>Add a field</SecondaryButton> : null}>
      {loading ? (
        <div className="flex items-center justify-center py-6 text-sm text-gray-500"><Loader2 className="mr-2 h-5 w-5 animate-spin" />Loading…</div>
      ) : (
        <>
          {msg && (
            <div role={msg.tone === "error" ? "alert" : "status"}
              className={`rounded-xl border px-3 py-2 text-sm ${msg.tone === "error" ? "border-red-200 bg-red-50 text-red-700" : "border-emerald-200 bg-emerald-50 text-emerald-800"}`}>
              {msg.text}
            </div>
          )}
          {rows.length === 0 && (
            <p className="rounded-xl border border-dashed border-gray-200 px-4 py-5 text-center text-sm text-gray-500">
              No fields of your own yet. When an uploaded template uses a placeholder we do not know, you can create it here in one click.
            </p>
          )}
          <ul className="space-y-3" aria-label="Your document fields">
            {rows.map((f, i) => {
              const id = `cf-${i}`;
              const token = `{{custom.${f.key || "name"}}}`;
              return (
                <li key={i} className={`rounded-2xl border p-3 sm:p-4 ${f.active ? "border-gray-200 bg-white" : "border-gray-200 bg-gray-50"}`}>
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    <div>
                      <label htmlFor={`${id}-label`} className="mb-1 block text-xs font-medium text-gray-600">Label</label>
                      <input id={`${id}-label`} className={inputCls} value={f.label} maxLength={120} placeholder="e.g. Shift allowance"
                        onChange={(e) => set(i, { label: e.target.value })} />
                    </div>
                    <div>
                      <label htmlFor={`${id}-key`} className="mb-1 block text-xs font-medium text-gray-600">Name in templates</label>
                      <input id={`${id}-key`} className={`${inputCls} font-mono`} value={f.key} maxLength={40} disabled={!f._new}
                        aria-describedby={`${id}-token`} onChange={(e) => set(i, { key: e.target.value.toLowerCase() })} />
                      <button type="button" id={`${id}-token`} onClick={() => copy(token)}
                        className="mt-1 inline-flex max-w-full items-center gap-1 truncate rounded-md bg-gray-50 px-1.5 py-0.5 font-mono text-[11px] text-gray-600 hover:bg-gray-100">
                        <Copy className="h-3 w-3 shrink-0" aria-hidden="true" />{token}
                      </button>
                    </div>
                    <div>
                      <label htmlFor={`${id}-type`} className="mb-1 block text-xs font-medium text-gray-600">Type</label>
                      <select id={`${id}-type`} className={inputCls} value={f.type} disabled={f.in_use}
                        onChange={(e) => set(i, { type: e.target.value })}>
                        {(data?.types || []).map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                      </select>
                    </div>
                    <div>
                      <label htmlFor={`${id}-source`} className="mb-1 block text-xs font-medium text-gray-600">Value comes from</label>
                      <select id={`${id}-source`} className={inputCls} value={f.source} onChange={(e) => set(i, { source: e.target.value })}>
                        {(data?.sources || []).map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                      </select>
                    </div>
                  </div>
                  {f.type === "choice" && (
                    <div className="mt-3">
                      <label htmlFor={`${id}-options`} className="mb-1 block text-xs font-medium text-gray-600">Options (one per line)</label>
                      <textarea id={`${id}-options`} rows={3} className={inputCls} value={(f.options || []).join("\n")}
                        onChange={(e) => set(i, { options: e.target.value.split("\n") })} />
                    </div>
                  )}
                  {f.source === "fixed" && (
                    <div className="mt-3">
                      <label htmlFor={`${id}-value`} className="mb-1 block text-xs font-medium text-gray-600">Value for every new hire</label>
                      {f.type === "choice" ? (
                        <select id={`${id}-value`} className={inputCls} value={f.value || ""} onChange={(e) => set(i, { value: e.target.value })}>
                          <option value="">Choose…</option>
                          {(f.options || []).filter((o) => o.trim()).map((o) => <option key={o} value={o}>{o}</option>)}
                        </select>
                      ) : (
                        <input id={`${id}-value`} className={inputCls} value={f.value || ""}
                          type={f.type === "date" ? "date" : "text"} inputMode={["number", "money"].includes(f.type) ? "decimal" : undefined}
                          onChange={(e) => set(i, { value: e.target.value })} />
                      )}
                    </div>
                  )}
                  {f.source === "candidate" && (
                    <p className="mt-2 text-xs text-gray-500">
                      Add a field called <span className="font-mono">{f.portal_field || `custom_${f.key || "name"}`}</span> to the portal form under “Forms new hires fill in”; its verified answer is printed.
                    </p>
                  )}
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                    <div className="flex flex-wrap items-center gap-4 text-sm text-gray-700">
                      <label className="inline-flex items-center gap-2">
                        <input type="checkbox" className="h-4 w-4 accent-blue-600" checked={f.required} onChange={(e) => set(i, { required: e.target.checked })} />
                        Documents wait for it
                      </label>
                      <label className="inline-flex items-center gap-2">
                        <input type="checkbox" className="h-4 w-4 accent-blue-600" checked={f.active} onChange={(e) => set(i, { active: e.target.checked })} />
                        In use
                      </label>
                      {f.in_use && <StatusPill tone="blue">Used in your templates</StatusPill>}
                    </div>
                    {!f.in_use && (
                      <button type="button" onClick={() => setRows((l) => l.filter((_, j) => j !== i))}
                        className="inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-sm font-medium text-rose-600 hover:bg-rose-50">
                        <Trash2 className="h-4 w-4" aria-hidden="true" />Remove
                      </button>
                    )}
                  </div>
                  {problems[i].length > 0 && (f.label || f.key) && (
                    <ul className="mt-2 space-y-0.5 text-xs text-red-600">{problems[i].map((p) => <li key={p}>{p}</li>)}</ul>
                  )}
                </li>
              );
            })}
          </ul>
          {duplicate && <p role="alert" className="text-sm text-red-600">The field name {duplicate} is used twice.</p>}
          <div className="flex flex-wrap items-center justify-end gap-2">
            {dirty && <span className="text-sm text-amber-700">Unsaved changes to your fields.</span>}
            <SecondaryButton onClick={() => setRows(JSON.parse(saved))} disabled={!dirty || saving}>Discard</SecondaryButton>
            <PrimaryButton icon={Save} onClick={save} disabled={!dirty || saving || invalid}>{saving ? "Saving…" : "Save fields"}</PrimaryButton>
          </div>
        </>
      )}
    </SettingsCard>
  );
}
