/*
 * Onboarding › Settings › "Forms new hires fill in": the organisation's changes to New starter information (HR-ONB-001) and
 * Emergency contacts (HR-ONB-003). Core fields are always collected and cannot be hidden; other optional fields can be hidden,
 * and up to 20 fields of the organisation's own can be added. Bank details (HR-ONB-017) stay as the platform defines them.
 * Changes apply to forms not submitted yet; a submitted form keeps the fields it was submitted with.
 */
import { useEffect, useState } from "react";
import { ArrowDown, ArrowUp, ClipboardList, Loader2, Lock, Plus, Save, Trash2 } from "lucide-react";
import { PrimaryButton, SecondaryButton } from "../recruitment/ui";
import { getPortalFormSettings, savePortalFormSettings } from "../../../service/docsSetupService";
import { SettingsCard } from "./settingsUi";

const FORMS = [
  { id: "HR-ONB-001", label: "New starter information" },
  { id: "HR-ONB-003", label: "Emergency contacts" },
];
const TYPE_LABELS = { text: "Short text", textarea: "Long text", date: "Date", number: "Number", select: "Choose from a list", checkbox: "Tick box" };
const inputCls = "w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100";

const blankField = () => ({ label: "", type: "text", required: false, help: "", options: [], rule: "", classification: "PERSONAL_BASIC" });

export default function PortalFormsSettings() {
  const [form, setForm] = useState(FORMS[0].id);
  const [data, setData] = useState(null);
  const [hidden, setHidden] = useState([]);
  const [added, setAdded] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState(null);
  const [errors, setErrors] = useState({});

  useEffect(() => {
    let live = true;
    setLoading(true);
    setMsg(null);
    getPortalFormSettings(form)
      .then((res) => {
        if (!live) return;
        setData(res);
        setHidden(res.fields.filter((f) => f.hidden).map((f) => f.key));
        setAdded((res.added_fields || []).map((f) => ({ ...f, options: f.options || [], rule: f.rule || "", help: f.help || "" })));
      })
      .catch((e) => live && setMsg({ tone: "error", text: e?.message || "The form could not be loaded." }))
      .finally(() => live && setLoading(false));
    return () => { live = false; };
  }, [form]);

  const setField = (i, patch) => setAdded((list) => list.map((f, j) => (j === i ? { ...f, ...patch } : f)));
  const moveField = (i, d) => setAdded((list) => {
    const j = i + d;
    if (j < 0 || j >= list.length) return list;
    const next = [...list];
    [next[i], next[j]] = [next[j], next[i]];
    return next;
  });

  const validate = () => {
    const errs = {};
    added.forEach((f, i) => {
      if (!f.label.trim()) errs[i] = "Give the field a label.";
      else if (f.type === "select" && !(f.options || []).filter((o) => o.trim()).length) errs[i] = "Add the options to choose from.";
    });
    setErrors(errs);
    return !Object.keys(errs).length;
  };

  const save = async () => {
    if (!validate()) return;
    setSaving(true);
    setMsg(null);
    try {
      const payload = {
        hidden_keys: hidden,
        added_fields: added.map((f) => ({ key: f.key, label: f.label.trim(), type: f.type, required: !!f.required,
          help: f.help || null, options: f.type === "select" ? f.options.filter((o) => o.trim()) : undefined,
          rule: f.rule || null, classification: f.classification })),
        field_order: [...(data?.fields || []).map((f) => f.key), ...added.map((f) => f.key).filter(Boolean)],
      };
      const res = await savePortalFormSettings(form, payload);
      setData(res);
      setAdded((res.added_fields || []).map((f) => ({ ...f, options: f.options || [], rule: f.rule || "", help: f.help || "" })));
      setMsg({ tone: "ok", text: `Saved as version ${res.version}. New hires who have not submitted the form see it now; submitted forms keep their fields.` });
    } catch (e) {
      setMsg({ tone: "error", text: e?.message || "The form could not be saved." });
    } finally {
      setSaving(false);
    }
  };

  return (
    <SettingsCard id="portal-forms" icon={ClipboardList} title="Forms new hires fill in"
      help="Hide optional questions or add your own to the forms on the pre-onboarding page. Core questions are always asked.">
      <div role="tablist" aria-label="Form" className="flex flex-wrap gap-2">
        {FORMS.map((f) => (
          <button key={f.id} role="tab" type="button" aria-selected={form === f.id} onClick={() => setForm(f.id)}
            className={`rounded-xl border px-3 py-1.5 text-sm ${form === f.id ? "border-blue-300 bg-blue-50 font-medium text-blue-800" : "border-gray-200 text-gray-600 hover:bg-gray-50"}`}>
            {f.label}
          </button>
        ))}
      </div>
      {loading ? (
        <div className="flex items-center justify-center py-8 text-sm text-gray-500"><Loader2 className="mr-2 h-5 w-5 animate-spin" />Loading…</div>
      ) : data && (
        <>
          {msg && (
            <div role={msg.tone === "error" ? "alert" : "status"}
              className={`rounded-xl border px-3 py-2 text-sm ${msg.tone === "error" ? "border-red-200 bg-red-50 text-red-700" : "border-emerald-200 bg-emerald-50 text-emerald-800"}`}>
              {msg.text}
            </div>
          )}
          <div>
            <p className="mb-2 text-sm font-medium text-gray-800">Questions on the form (version {data.version || 0})</p>
            <ul className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
              {data.fields.map((f) => (
                <li key={f.key} className="flex items-center justify-between gap-2 rounded-xl border border-gray-100 bg-gray-50/60 px-3 py-2">
                  <span className="min-w-0 text-sm text-gray-800">
                    {f.label}
                    {f.locked && <span className="mt-0.5 flex items-center gap-1 text-xs text-gray-500"><Lock className="h-3 w-3" />{f.locked_reason}</span>}
                  </span>
                  {f.locked ? (
                    <span className="text-xs font-medium text-gray-500">Always asked</span>
                  ) : (
                    <label className="inline-flex shrink-0 items-center gap-1.5 text-xs text-gray-700">
                      <input type="checkbox" className="accent-blue-600" checked={!hidden.includes(f.key)} aria-label={`Ask ${f.label}`}
                        onChange={(e) => setHidden((h) => (e.target.checked ? h.filter((k) => k !== f.key) : [...h, f.key]))} />
                      {hidden.includes(f.key) ? "Hidden" : "Asked"}
                    </label>
                  )}
                </li>
              ))}
            </ul>
          </div>
          <div>
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-medium text-gray-800">Your own questions ({added.length} of {data.max_custom_fields})</p>
              <SecondaryButton icon={Plus} onClick={() => setAdded((l) => [...l, blankField()])} disabled={added.length >= data.max_custom_fields}>
                Add a question
              </SecondaryButton>
            </div>
            {added.length === 0 && <p className="text-sm text-gray-500">None yet. Answers to your own questions are kept on the new hire's profile, never in core employee fields.</p>}
            <ol className="space-y-3">
              {added.map((f, i) => (
                <li key={f.key || `new-${i}`} className="rounded-2xl border border-gray-200 p-3">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <label htmlFor={`cf-label-${i}`} className="mb-1 block text-xs font-semibold text-gray-600">Question</label>
                      <input id={`cf-label-${i}`} className={inputCls} value={f.label} aria-invalid={!!errors[i]} onChange={(e) => setField(i, { label: e.target.value })} />
                    </div>
                    <div>
                      <label htmlFor={`cf-type-${i}`} className="mb-1 block text-xs font-semibold text-gray-600">Answer type</label>
                      <select id={`cf-type-${i}`} className={inputCls} value={f.type} onChange={(e) => setField(i, { type: e.target.value })}>
                        {data.types.map((t) => <option key={t} value={t}>{TYPE_LABELS[t] || t}</option>)}
                      </select>
                    </div>
                    {f.type === "select" && (
                      <div className="sm:col-span-2">
                        <label htmlFor={`cf-opt-${i}`} className="mb-1 block text-xs font-semibold text-gray-600">Options (one per line)</label>
                        <textarea id={`cf-opt-${i}`} rows={3} className={inputCls} value={(f.options || []).join("\n")}
                          onChange={(e) => setField(i, { options: e.target.value.split("\n") })} />
                      </div>
                    )}
                    <div>
                      <label htmlFor={`cf-help-${i}`} className="mb-1 block text-xs font-semibold text-gray-600">Help text (optional)</label>
                      <input id={`cf-help-${i}`} className={inputCls} value={f.help || ""} onChange={(e) => setField(i, { help: e.target.value })} />
                    </div>
                    <div>
                      <label htmlFor={`cf-rule-${i}`} className="mb-1 block text-xs font-semibold text-gray-600">Check the answer as</label>
                      <select id={`cf-rule-${i}`} className={inputCls} value={f.rule || ""} onChange={(e) => setField(i, { rule: e.target.value })}>
                        <option value="">No extra check</option>
                        {data.rules.map((r) => <option key={r} value={r}>{r.replace(/_/g, " ")}</option>)}
                      </select>
                    </div>
                    <div>
                      <label htmlFor={`cf-cls-${i}`} className="mb-1 block text-xs font-semibold text-gray-600">How sensitive is it?</label>
                      <select id={`cf-cls-${i}`} className={inputCls} value={f.classification} onChange={(e) => setField(i, { classification: e.target.value })}>
                        <option value="PERSONAL_BASIC">Personal (basic)</option>
                        <option value="PERSONAL_CONFIDENTIAL">Personal (confidential)</option>
                      </select>
                    </div>
                    <label className="inline-flex items-center gap-2 self-end text-sm text-gray-700">
                      <input type="checkbox" className="accent-blue-600" checked={!!f.required} onChange={(e) => setField(i, { required: e.target.checked })} />
                      Must be answered
                    </label>
                  </div>
                  {errors[i] && <p role="alert" className="mt-2 text-xs text-rose-600">{errors[i]}</p>}
                  <div className="mt-2 flex items-center gap-1">
                    <button type="button" className="rounded-lg p-1.5 text-gray-500 hover:bg-gray-50 disabled:opacity-40" disabled={i === 0}
                      onClick={() => moveField(i, -1)} aria-label="Move question up"><ArrowUp className="h-4 w-4" /></button>
                    <button type="button" className="rounded-lg p-1.5 text-gray-500 hover:bg-gray-50 disabled:opacity-40" disabled={i === added.length - 1}
                      onClick={() => moveField(i, 1)} aria-label="Move question down"><ArrowDown className="h-4 w-4" /></button>
                    <button type="button" className="ml-auto inline-flex items-center gap-1 rounded-lg px-2 py-1 text-sm text-rose-600 hover:bg-rose-50"
                      onClick={() => setAdded((l) => l.filter((_, j) => j !== i))}><Trash2 className="h-4 w-4" />Remove</button>
                  </div>
                </li>
              ))}
            </ol>
          </div>
          <div className="flex justify-end">
            <PrimaryButton icon={Save} onClick={save} disabled={saving}>{saving ? "Saving…" : "Save form"}</PrimaryButton>
          </div>
        </>
      )}
    </SettingsCard>
  );
}
