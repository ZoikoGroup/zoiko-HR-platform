/*
 * Onboarding › Settings › "Missing details": every value the organisation's onboarding documents still need, asked for in
 * one place (after "Set up with AI", or at any time). The package is checked for every engagement profile as a real send
 * would; each gap shows the documents it holds and an input. Clause wording can be typed here too. Values each new hire
 * provides are not asked – except the default work location, offered as optional. Saving uses the same validation as each
 * Settings card, then the page reloads its cards so they show the new values.
 */
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, CheckCircle2, ClipboardList, ExternalLink, Loader2, Save, ScrollText, Sparkles } from "lucide-react";
import { PrimaryButton } from "../recruitment/ui";
import { getSettingsGaps, saveSettingsGaps } from "../../../service/onboardingSetupService";

const inputCls = "w-full rounded-xl border bg-white px-3 py-2 text-sm text-gray-900 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100";
const keyOf = (i) => `${i.target}:${i.key}`;

function Field({ input, value, error, onChange }) {
  const id = `gap-${input.target}-${input.key}`;
  const cls = `${inputCls} ${error ? "border-rose-300 bg-rose-50/40" : "border-gray-200"}`;
  let control;
  if (input.kind === "bool") {
    control = (
      <label className="inline-flex items-center gap-2 text-sm text-gray-700">
        <input id={id} type="checkbox" className="h-4 w-4 accent-blue-600" checked={!!value} onChange={(e) => onChange(e.target.checked)} />Yes
      </label>
    );
  } else if ((input.kind === "enum" || input.kind === "choice") && Array.isArray(input.options) && input.options.length) {
    control = (
      <select id={id} className={cls} value={value ?? ""} onChange={(e) => onChange(e.target.value)}>
        <option value="">Choose…</option>
        {input.options.map((o) => <option key={o} value={o}>{String(o).replace(/_/g, " ")}</option>)}
      </select>
    );
  } else if (input.kind === "list") {
    control = (
      <textarea id={id} rows={3} className={cls} placeholder="One per line" value={Array.isArray(value) ? value.join("\n") : value ?? ""}
        onChange={(e) => onChange(e.target.value.split("\n"))} />
    );
  } else {
    control = (
      <input id={id} className={cls} value={value ?? ""} placeholder={input.hint && !input.hint.startsWith("Blank") ? input.hint : ""}
        type={input.kind === "email" ? "email" : input.kind === "url" ? "url" : input.kind === "int" ? "number" : "text"}
        onChange={(e) => onChange(input.kind === "int" && e.target.value !== "" ? Number(e.target.value) : e.target.value)} />
    );
  }
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-xs font-semibold text-gray-700">{input.label}</label>
      {control}
      {error && <p role="alert" className="mt-1 text-xs text-rose-600">{error}</p>}
    </div>
  );
}

export default function MissingDetailsCard({ onSaved }) {
  const [data, setData] = useState(null);
  const [values, setValues] = useState({});
  const [wording, setWording] = useState({});
  const [attest, setAttest] = useState(false);
  const [errors, setErrors] = useState({});
  const [msg, setMsg] = useState(null);
  const [saving, setSaving] = useState(false);

  const hydrate = (res) => {
    setData(res);
    setValues({});
    setWording({});
    setErrors({});
  };
  useEffect(() => {
    let live = true;
    getSettingsGaps().then((r) => live && hydrate(r)).catch((e) => live && setMsg({ tone: "error", text: e?.message || "The missing details could not be checked." }));
    return () => { live = false; };
  }, []);

  // one input per setting even when several gaps need it (e.g. the HR e-mail), with every document it unblocks
  const inputs = useMemo(() => {
    const m = new Map();
    for (const item of [...(data?.fields || []), ...(data?.hire_defaults || [])]) {
      for (const i of item.inputs) {
        const k = keyOf(i);
        const cur = m.get(k) || { ...i, documents: [], optional: !!(data?.hire_defaults || []).includes(item) };
        item.documents.forEach((d) => { if (!cur.documents.includes(d)) cur.documents.push(d); });
        m.set(k, cur);
      }
    }
    return [...m.values()];
  }, [data]);
  const required = inputs.filter((i) => !i.optional);
  const optional = inputs.filter((i) => i.optional);
  const typed = Object.keys(values).length + Object.values(wording).filter((v) => v.trim()).length;
  const wordingTyped = Object.values(wording).some((v) => v.trim());

  const save = async () => {
    setSaving(true);
    setMsg(null);
    setErrors({});
    const payload = { profile: {}, package: {}, clause_tokens: {}, clauses: {} };
    for (const [k, v] of Object.entries(values)) {
      const [target, key] = k.split(/:(.+)/);
      const clean = Array.isArray(v) ? v.map((x) => x.trim()).filter(Boolean) : v;
      payload[target === "clause_token" ? "clause_tokens" : target][key] = clean;
    }
    for (const [k, v] of Object.entries(wording)) if (v.trim()) payload.clauses[k] = v;
    try {
      const res = await saveSettingsGaps(payload);
      hydrate(res);
      setAttest(false);
      setMsg({ tone: "ok", text: res.complete ? "Saved. Every document can now be generated." : "Saved. The list below shows what is still missing." });
      onSaved?.(res);
    } catch (e) {
      const fieldErrors = e?.detail?.errors || {};
      setErrors(Object.fromEntries(Object.entries(fieldErrors).map(([k, v]) => [`profile:${k}`, v])));
      setMsg({ tone: "error", text: e?.message || "The details could not be saved." });
    } finally {
      setSaving(false);
    }
  };

  if (!data) {
    return (
      <section id="missing-details" className="scroll-mt-24 animate-pulse rounded-2xl border border-gray-200/80 bg-white p-5 shadow-sm" aria-label="Missing details">
        {msg ? <p role="alert" className="text-sm text-rose-700">{msg.text}</p> : (
          <div className="flex items-center gap-3 text-sm text-gray-500"><Loader2 className="h-4 w-4 animate-spin" />Checking every document for missing details…</div>
        )}
      </section>
    );
  }

  if (data.complete) {
    return (
      <section id="missing-details" aria-labelledby="missing-details-title"
        className="scroll-mt-24 flex items-center gap-3 rounded-2xl border border-emerald-200 bg-gradient-to-r from-emerald-50 to-white px-5 py-4 shadow-sm">
        <CheckCircle2 className="h-6 w-6 shrink-0 text-emerald-600" aria-hidden="true" />
        <div className="min-w-0">
          <h2 id="missing-details-title" className="text-base font-semibold text-gray-900">Nothing missing</h2>
          <p className="text-sm text-gray-600">All {data.documents_total} documents can be generated for every employment type. Values each new hire provides are asked for in their documents panel.</p>
          {msg && <p role="status" className="mt-1 text-xs text-emerald-700">{msg.text}</p>}
        </div>
      </section>
    );
  }

  const held = data.documents_total - data.documents_ready;
  return (
    <section id="missing-details" aria-labelledby="missing-details-title"
      className="relative scroll-mt-24 overflow-hidden rounded-2xl border border-amber-200 bg-white shadow-sm">
      <div aria-hidden="true" className="h-1 bg-gradient-to-r from-amber-400 via-amber-300 to-transparent" />
      <div className="p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-amber-50 text-amber-600 ring-1 ring-amber-100" aria-hidden="true">
              <ClipboardList className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <h2 id="missing-details-title" className="text-base font-semibold text-gray-900">Missing details</h2>
              <p className="text-sm text-gray-600">
                {held} of {data.documents_total} documents are held until these are filled. Fill them here once – every new hire's documents use them.
              </p>
            </div>
          </div>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-800 ring-1 ring-amber-200">
            <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />{required.length + data.clauses.length} to fill
          </span>
        </div>

        {msg && (
          <p role={msg.tone === "error" ? "alert" : "status"}
            className={`mt-3 rounded-xl border px-3 py-2 text-sm ${msg.tone === "error" ? "border-rose-200 bg-rose-50 text-rose-700" : "border-emerald-200 bg-emerald-50 text-emerald-800"}`}>
            {msg.text}
          </p>
        )}

        {required.length > 0 && (
          <div className="mt-4">
            <h3 className="text-sm font-semibold text-gray-900">Company and legal details</h3>
            <div className="mt-2 grid gap-3 sm:grid-cols-2">
              {required.map((i) => (
                <div key={keyOf(i)} className="rounded-xl border border-gray-100 bg-gray-50/60 p-3">
                  <Field input={i} value={keyOf(i) in values ? values[keyOf(i)] : i.value} error={errors[keyOf(i)]}
                    onChange={(v) => setValues((p) => ({ ...p, [keyOf(i)]: v }))} />
                  <p className="mt-1 text-[11px] text-gray-500">Needed by: {i.documents.join(", ")}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {data.clauses.length > 0 && (
          <div className="mt-5">
            <h3 className="inline-flex items-center gap-1.5 text-sm font-semibold text-gray-900"><ScrollText className="h-4 w-4 text-blue-600" aria-hidden="true" />Clause wording</h3>
            <p className="text-xs text-gray-500">Legal wording your documents print. Use your counsel's text; it is printed exactly as entered.</p>
            <div className="mt-2 space-y-3">
              {data.clauses.map((c) => (
                <div key={c.key} className="rounded-xl border border-gray-100 bg-gray-50/60 p-3">
                  <label htmlFor={`gap-clause-${c.key}`} className="mb-1 block text-xs font-semibold text-gray-700">{c.title}</label>
                  {c.drafting_note && <p className="mb-1 text-[11px] text-gray-500">{c.drafting_note}</p>}
                  <textarea id={`gap-clause-${c.key}`} rows={3} className={`${inputCls} border-gray-200`} value={wording[c.key] || ""}
                    onChange={(e) => setWording((p) => ({ ...p, [c.key]: e.target.value }))} />
                  <p className="mt-1 text-[11px] text-gray-500">Needed by: {c.documents.join(", ")}</p>
                </div>
              ))}
            </div>
            {wordingTyped && (
              <label className="mt-2 flex items-start gap-2 text-xs text-gray-700">
                <input type="checkbox" className="mt-0.5 h-4 w-4 accent-blue-600" checked={attest} onChange={(e) => setAttest(e.target.checked)} />
                I confirm this wording is approved for use in our employment documents.
              </label>
            )}
          </div>
        )}

        {optional.length > 0 && (
          <div className="mt-5">
            <h3 className="text-sm font-semibold text-gray-900">Defaults for every new hire <span className="font-normal text-gray-400">· optional</span></h3>
            <p className="text-xs text-gray-500">Printed when a new hire's offer does not say otherwise.</p>
            <div className="mt-2 grid gap-3 sm:grid-cols-2">
              {optional.map((i) => (
                <div key={keyOf(i)} className="rounded-xl border border-gray-100 bg-gray-50/60 p-3">
                  <Field input={i} value={keyOf(i) in values ? values[keyOf(i)] : i.value} error={errors[keyOf(i)]}
                    onChange={(v) => setValues((p) => ({ ...p, [keyOf(i)]: v }))} />
                  <p className="mt-1 text-[11px] text-gray-500">Used by: {i.documents.join(", ")}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {data.links.length > 0 && (
          <div className="mt-5">
            <h3 className="text-sm font-semibold text-gray-900">Set elsewhere in Settings</h3>
            <ul className="mt-2 space-y-1.5 text-sm">
              {data.links.map((l) => (
                <li key={l.key} className="flex flex-wrap items-center gap-x-2">
                  {l.settings_path
                    ? <Link to={l.settings_path} className="inline-flex items-center gap-1 font-medium text-blue-700 hover:underline">{l.meaning}<ExternalLink className="h-3 w-3" aria-hidden="true" /></Link>
                    : <span className="font-medium text-gray-800">{l.meaning}</span>}
                  <span className="text-xs text-gray-500">– {l.source} · needed by {l.documents.join(", ")}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-gray-100 pt-4">
          <p className="inline-flex items-center gap-1.5 text-xs text-gray-500"><Sparkles className="h-3.5 w-3.5 text-blue-500" aria-hidden="true" />The check runs again after saving.</p>
          <PrimaryButton icon={saving ? Loader2 : Save} onClick={save} disabled={saving || !typed || (wordingTyped && !attest)}>
            {saving ? "Saving…" : "Save missing details"}
          </PrimaryButton>
        </div>
      </div>
    </section>
  );
}
