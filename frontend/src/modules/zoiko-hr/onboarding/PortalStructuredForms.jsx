/*
 * Structured onboarding forms on the new-hire portal (New starter information, Bank and payroll details).
 *
 * QA report #17 (BUG-1…BUG-14): every field follows its shared rule (utils/fieldRules.js = the server's
 * app/core/field_rules.py, same messages), checked when the field is left and before Save draft / Submit; the server's 422
 * `errors` land under their fields. Country and preferred language are lists, the region is a list where the country has one,
 * the mobile number uses the country-aware PhoneField. Address rules follow the country typed in the form; bank rules follow
 * the hire's work country. A saved bank value is masked ("•••• 4565"): leaving the box blank keeps it.
 */
import { useEffect, useState } from "react";
import {
  errorMessage, getPortalForms, savePortalForm, submitPortalForm,
} from "../../../service/onboardingPrompt2Service";
import PhoneField from "../../../components/PhoneField";
import SearchableSelect from "../../../components/SearchableSelect";
import { COUNTRY_CHOICES, LANGUAGES, fieldProblem, regionsFor } from "../../../utils/fieldRules";

const editable = (form) => ["NOT_STARTED", "DRAFT", "RETURNED"].includes(String(form?.status || "").toUpperCase());
const savedMask = (key, values) => values?.[key] || "Saved securely";
const ADDRESS_RULES = new Set(["state", "postal_code", "phone"]);       // follow the country entered in the form
const COUNTRY_DEPENDENT = ["postal_code", "region", "mobile_phone"];    // re-checked when the country changes
const fieldCls = (bad) => `w-full min-h-10 border rounded-xl px-3.5 py-2 text-sm bg-slate-50/40 focus:bg-white focus:ring-2 disabled:bg-slate-50 disabled:text-slate-500 transition outline-none ${
  bad ? "border-rose-300 focus:border-rose-500 focus:ring-rose-100" : "border-slate-200 focus:border-blue-500 focus:ring-blue-100"}`;

/** The rule's message for one field ("" when fine, blank or a kept masked value). */
function problemFor(form, field, values, keepMasked) {
  const value = values[field.key];
  if (!field.rule || keepMasked || value === undefined || value === null || String(value).trim() === "") return "";
  const country = ADDRESS_RULES.has(field.rule) ? (values.country || form.work_country) : form.work_country;
  return fieldProblem(field.rule, value, { country });
}

export default function PortalStructuredForms({ token, onChanged }) {
  const [forms, setForms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState("");
  const [notice, setNotice] = useState("");
  const [declarations, setDeclarations] = useState({});
  const [fieldErrors, setFieldErrors] = useState({});
  const [touched, setTouched] = useState({});

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const result = await getPortalForms(token);
      const rawItems = Array.isArray(result?.items) ? result.items : [];
      // Emergency contacts (HR-ONB-003) are part of "Your contact & address details" on this page
      const cleanItems = rawItems.filter(
        (form) => form.canonical_id !== "HR-ONB-003" && !/emergency/i.test(form.title || "")
      );
      setForms(cleanItems);
      // values saved before the rules existed: their problems show at once, so they are corrected before submitting
      const loaded = {};
      cleanItems.forEach((form) => Object.entries(form.errors || {}).forEach(([key, message]) => {
        loaded[`${form.canonical_id}:${key}`] = message;
      }));
      setFieldErrors(loaded);
    } catch (err) {
      setError(errorMessage(err, "The onboarding forms could not be loaded."));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [token]); // eslint-disable-line react-hooks/exhaustive-deps

  // bank and tax numbers follow the work country; when HR has not set one, the country the new hire entered in their address
  const homeCountry = forms.find((f) => f.canonical_id === "HR-ONB-001")?.values?.country || "";
  const withCountry = (form) => (form.work_country || !homeCountry ? form : { ...form, work_country: homeCountry });

  const isKeptMasked = (form, key) => (form.masked_keys || []).includes(key) && !!form.values?.[key] && !touched[`${form.canonical_id}:${key}`];

  const setField = (form, key, value) => {
    const id = form.canonical_id;
    const nextValues = { ...(form.values || {}), [key]: value };
    if (key === "country" && regionsFor(value) && nextValues.region && !regionsFor(value).includes(nextValues.region)) {
      nextValues.region = "";                                  // a region of another country no longer applies
    }
    setForms((current) => current.map((f) => (f.canonical_id === id ? { ...f, values: nextValues } : f)));
    setTouched((current) => ({ ...current, [`${id}:${key}`]: true }));
    setFieldErrors((current) => {
      const next = { ...current, [`${id}:${key}`]: "" };
      if (key === "country") {                                 // postal code, region and phone follow the country
        (form.fields || []).filter((f) => COUNTRY_DEPENDENT.includes(f.key)).forEach((f) => {
          if (current[`${id}:${f.key}`] || nextValues[f.key]) next[`${id}:${f.key}`] = problemFor(withCountry(form), f, nextValues, false);
        });
      }
      return next;
    });
  };

  const checkField = (form, field) => {
    const id = form.canonical_id;
    const message = problemFor(withCountry(form), field, form.values || {}, isKeptMasked(form, field.key));
    setFieldErrors((current) => ({ ...current, [`${id}:${field.key}`]: message }));
  };

  const save = async (form, submitting) => {
    const id = form.canonical_id;
    const values = form.values || {};
    const errors = {};
    (form.fields || []).forEach((field) => {
      const kept = isKeptMasked(form, field.key);
      if (submitting && field.required && !kept && !String(values[field.key] ?? "").trim()) {
        errors[`${id}:${field.key}`] = `${field.label} is required.`;
        return;
      }
      const message = problemFor(withCountry(form), field, values, kept);
      if (message) errors[`${id}:${field.key}`] = message;
    });
    if (submitting && !declarations[id] && form.declaration) errors[`${id}:declaration`] = "Confirm the declaration before submitting.";
    setFieldErrors((current) => {
      const next = { ...current };
      Object.keys(next).filter((key) => key.startsWith(`${id}:`)).forEach((key) => delete next[key]);
      return { ...next, ...errors };
    });
    if (Object.keys(errors).length) {
      const first = (form.fields || []).find((f) => errors[`${id}:${f.key}`]);
      if (first) document.getElementById(`portal-${id}-${first.key}`)?.focus();
      setError("");
      setNotice("");
      return;
    }
    setBusyId(id);
    setError("");
    setNotice("");
    try {
      // Never send masked values back as replacements for the encrypted values.
      const payload = Object.fromEntries(Object.entries(values).filter(([key]) =>
        !(form.masked_keys || []).includes(key) || touched[`${id}:${key}`]));
      const result = submitting
        ? await submitPortalForm(token, id, payload, true)
        : await savePortalForm(token, id, payload);
      setForms((current) => current.map((entry) => entry.canonical_id === id
        ? { ...entry, ...result, values: { ...(entry.values || {}), ...(result.values || {}) } }
        : entry));
      setNotice(submitting ? `${form.title} submitted for review.` : `${form.title} draft saved.`);
      setDeclarations((current) => ({ ...current, [id]: false }));
      setTouched((current) => {
        const next = { ...current };
        Object.keys(next).filter((key) => key.startsWith(`${id}:`)).forEach((key) => delete next[key]);
        return next;
      });
      onChanged?.();                                           // the portal's checklist and Submit button follow
    } catch (err) {
      const serverErrors = err?.detail?.errors;
      if (serverErrors && typeof serverErrors === "object") {
        setFieldErrors((current) => ({
          ...current,
          ...Object.fromEntries(Object.entries(serverErrors).map(([key, message]) => [`${id}:${key}`, message])),
        }));
        const first = (form.fields || []).find((f) => serverErrors[f.key]);
        if (first) document.getElementById(`portal-${id}-${first.key}`)?.focus();
        setError(err?.detail?.message || "Fix the highlighted fields.");
      } else if (Array.isArray(err?.detail?.missing)) {
        setError(`Complete the required fields: ${err.detail.missing.join(", ")}.`);
      } else {
        setError(errorMessage(err, submitting ? "The form could not be submitted." : "The draft could not be saved."));
      }
    } finally {
      setBusyId("");
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-6 bg-white/70 backdrop-blur-xs rounded-2xl border border-blue-100/80 shadow-xs">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-blue-600 border-b-transparent"></div>
        <span className="ml-2.5 text-xs font-medium text-slate-500">Loading structured forms...</span>
      </div>
    );
  }

  if (!forms.length) return null;

  const renderInput = (form, field, writable) => {
    const id = form.canonical_id;
    const inputId = `portal-${id}-${field.key}`;
    const values = form.values || {};
    const fieldError = fieldErrors[`${id}:${field.key}`];
    const kept = isKeptMasked(form, field.key);
    const common = {
      id: inputId,
      disabled: !writable,
      "aria-invalid": fieldError ? true : undefined,
      "aria-describedby": fieldError ? `${inputId}-error` : kept ? `${inputId}-kept` : undefined,
      onBlur: () => checkField(form, field),
      className: fieldCls(!!fieldError),
    };
    const value = kept ? "" : (values[field.key] || "");
    const set = (v) => setField(form, field.key, v);
    const input = field.input || (field.type === "date" ? "date" : null);

    if (input === "country") {
      return (
        <SearchableSelect id={common.id} disabled={common.disabled} className={common.className} invalid={!!common["aria-invalid"]}
          describedBy={common["aria-describedby"]} onBlur={common.onBlur} value={value} onChange={set} allowEmpty placeholder="Choose a country"
          options={COUNTRY_CHOICES.map((c) => ({ value: c.name, label: c.name, keywords: [c.code] }))}
          searchLabel="Search countries" listLabel="Countries" searchPlaceholder="Search country" />
      );
    }
    if (input === "region") {
      const list = regionsFor(values.country || form.work_country);
      if (list) {
        return (
          <SearchableSelect id={common.id} disabled={common.disabled} className={common.className} invalid={!!common["aria-invalid"]}
            describedBy={common["aria-describedby"]} onBlur={common.onBlur} value={value} onChange={set} allowEmpty
            placeholder="Choose a state / region" options={list.map((r) => ({ value: r, label: r }))}
            searchLabel="Search states" listLabel="States" searchPlaceholder="Search state / region" />
        );
      }
    }
    if (input === "language") {
      const known = LANGUAGES.some(([code]) => code === value);
      return (
        <select {...common} value={value} onChange={(e) => set(e.target.value)}>
          <option value="">Choose a language</option>
          {value && !known && <option value={value} disabled>{value} (choose from the list)</option>}
          {LANGUAGES.map(([code, name]) => <option key={code} value={code}>{name}</option>)}
        </select>
      );
    }
    if (input === "phone") {
      return (
        <PhoneField id={inputId} value={value} country={values.country || form.work_country} onChange={set}
          onBlur={() => checkField(form, field)} disabled={!writable} invalid={!!fieldError}
          describedBy={fieldError ? `${inputId}-error` : undefined} className={fieldCls(!!fieldError)} />
      );
    }
    const type = input === "date" ? "date" : input === "email" ? "email" : "text";
    const upper = field.rule === "bank_routing";
    return (
      <input {...common} type={type} value={value} placeholder={kept ? savedMask(field.key, form.values) : ""}
        autoComplete="off" onChange={(e) => set(upper ? e.target.value.toUpperCase() : e.target.value)}
        className={`${common.className}${upper ? " uppercase" : ""}`} />
    );
  };

  return (
    <section aria-label="Onboarding forms" className="space-y-4">
      <div className="flex items-center gap-2">
        <span className="h-2 w-2 rounded-full bg-blue-600"></span>
        <h2 className="text-base font-semibold text-slate-900 tracking-tight">Structured Onboarding Forms</h2>
      </div>
      {error && <div role="alert" className="rounded-xl border border-red-200 bg-red-50/90 px-4 py-3 text-sm text-red-700">{error}</div>}
      {notice && <div role="status" className="rounded-xl border border-emerald-200 bg-emerald-50/90 px-4 py-3 text-sm text-emerald-800">{notice}</div>}
      {forms.map((form) => {
        const id = form.canonical_id;
        const writable = editable(form);
        const statusLabel = String(form.status || "NOT_STARTED").replace(/_/g, " ").toLowerCase();
        return (
          <article key={id} className="bg-white rounded-2xl shadow-xs hover:shadow-sm border border-blue-100/80 p-5 sm:p-6 transition-all duration-200">
            <div className="flex flex-wrap justify-between items-start gap-3 border-b border-slate-100 pb-3.5 mb-4">
              <div>
                <h3 className="font-semibold text-slate-900 text-base">{form.title}</h3>
                <p className="text-xs text-slate-500 mt-0.5">Please fill out this form accurately to complete your verification.</p>
              </div>
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-blue-50 text-blue-700 border border-blue-200/60 capitalize">
                <span className="h-1.5 w-1.5 rounded-full bg-blue-600"></span>
                {statusLabel}
              </span>
              {form.return_reason && <p className="basis-full text-xs text-red-700 bg-red-50/90 border border-red-100 rounded-xl p-3">HR asked for an update: {form.return_reason}</p>}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {(form.fields || []).map((field) => {
                const inputId = `portal-${id}-${field.key}`;
                const fieldError = fieldErrors[`${id}:${field.key}`];
                const kept = isKeptMasked(form, field.key);
                return (
                  <div key={field.key} className={field.input === "phone" ? "min-w-0 sm:col-span-2" : "min-w-0"}>
                    <label htmlFor={inputId} className="block text-xs font-medium text-slate-700 mb-1">
                      {field.label}{field.required ? " *" : ""}
                    </label>
                    {renderInput(form, field, writable)}
                    {kept && !fieldError && <p id={`${inputId}-kept`} className="mt-1 text-[11px] text-slate-400">Leave blank to keep the saved value.</p>}
                    {fieldError && <p id={`${inputId}-error`} role="alert" className="mt-1 text-xs text-red-600">{fieldError}</p>}
                  </div>
                );
              })}
            </div>
            {form.declaration && (
              <div className="mt-4 pt-3 border-t border-slate-100">
                <label className="flex items-start gap-2.5 text-xs text-slate-600 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={!!declarations[id]}
                    disabled={!writable}
                    onChange={(event) => setDeclarations((current) => ({ ...current, [id]: event.target.checked }))}
                    className="mt-0.5 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span>{form.declaration}</span>
                </label>
                {fieldErrors[`${id}:declaration`] && <p role="alert" className="mt-1 text-xs text-red-600">{fieldErrors[`${id}:declaration`]}</p>}
              </div>
            )}
            {writable && (
              <div className="mt-5 pt-3 border-t border-slate-100 flex flex-wrap justify-end gap-2.5">
                <button type="button" onClick={() => save(form, false)} disabled={busyId === id}
                  className="min-h-9 rounded-xl border border-slate-200 bg-white px-4 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 transition shadow-xs">
                  {busyId === id ? "Saving…" : "Save draft"}
                </button>
                <button type="button" onClick={() => save(form, true)} disabled={busyId === id}
                  className="min-h-9 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 px-4 py-1.5 text-xs font-semibold text-white shadow-xs hover:shadow disabled:opacity-50 transition">
                  {busyId === id ? "Submitting…" : "Submit form"}
                </button>
              </div>
            )}
          </article>
        );
      })}
      {error && <button type="button" onClick={load} className="min-h-9 rounded-xl border border-slate-200 bg-white px-3.5 text-xs font-medium text-slate-700 hover:bg-slate-50">Try again</button>}
    </section>
  );
}
