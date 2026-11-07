import { useEffect, useState } from "react";
import {
  errorMessage, getPortalForms, savePortalForm, submitPortalForm,
} from "../../../service/onboardingPrompt2Service";

const editable = (form) => ["NOT_STARTED", "DRAFT", "RETURNED"].includes(String(form?.status || "").toUpperCase());
const savedMask = (key, values) => values?.[key] || "Saved securely";

export default function PortalStructuredForms({ token }) {
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
      // Filter out any Emergency contacts form (HR-ONB-003)
      const cleanItems = rawItems.filter(
        (form) => form.canonical_id !== "HR-ONB-003" && !/emergency/i.test(form.title || "")
      );
      setForms(cleanItems);
    } catch (err) {
      setError(errorMessage(err, "The onboarding forms could not be loaded."));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [token]);

  const setField = (formId, key, value) => {
    setForms((current) => current.map((form) => form.canonical_id === formId
      ? { ...form, values: { ...(form.values || {}), [key]: value } }
      : form));
    setTouched((current) => ({ ...current, [`${formId}:${key}`]: true }));
    setFieldErrors((current) => ({ ...current, [`${formId}:${key}`]: "" }));
  };

  const save = async (form, submitting) => {
    const id = form.canonical_id;
    const values = form.values || {};
    const errors = {};
    if (submitting) {
      (form.fields || []).forEach((field) => {
        const isSavedMasked = (form.masked_keys || []).includes(field.key)
          && !!values[field.key] && !touched[`${id}:${field.key}`];
        if (field.required && !isSavedMasked && !String(values[field.key] ?? "").trim()) {
          errors[`${id}:${field.key}`] = `${field.label} is required.`;
        }
      });
      if (id === "HR-ONB-003" && !(values.contact1_name || (form.masked_keys || []).includes("contact1_name"))
        || (id === "HR-ONB-003" && !(values.contact1_phone || (form.masked_keys || []).includes("contact1_phone")))) {
        errors[`${id}:contact1_name`] = "Add at least one emergency contact name and phone.";
      }
      if (!declarations[id]) errors[`${id}:declaration`] = "Confirm the declaration before submitting.";
      setFieldErrors((current) => ({ ...current, ...errors }));
      if (Object.keys(errors).length) return;
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
      setFieldErrors((current) => {
        const next = { ...current };
        Object.keys(next).filter((key) => key.startsWith(`${id}:`)).forEach((key) => delete next[key]);
        return next;
      });
    } catch (err) {
      setError(errorMessage(err, submitting ? "The form could not be submitted." : "The draft could not be saved."));
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
        const values = form.values || {};
        const masked = new Set(form.masked_keys || []);
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
                const fieldError = fieldErrors[`${id}:${field.key}`];
                const protectedSaved = masked.has(field.key) && !!values[field.key] && !touched[`${id}:${field.key}`];
                const type = field.type === "date" ? "date"
                  : /email/i.test(field.key) ? "email"
                    : /phone|mobile/i.test(field.key) ? "tel" : "text";
                return (
                  <div key={field.key} className="min-w-0">
                    <label htmlFor={`portal-${id}-${field.key}`} className="block text-xs font-medium text-slate-700 mb-1">
                      {field.label}{field.required ? " *" : ""}
                    </label>
                    <input
                      id={`portal-${id}-${field.key}`}
                      type={type}
                      value={protectedSaved ? "" : (values[field.key] || "")}
                      placeholder={protectedSaved ? savedMask(field.key, form.values) : ""}
                      disabled={!writable}
                      aria-invalid={!!fieldError}
                      onChange={(event) => setField(id, field.key, event.target.value)}
                      className="w-full min-h-10 border border-slate-200 rounded-xl px-3.5 py-2 text-sm bg-slate-50/40 focus:bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-100 disabled:bg-slate-50 disabled:text-slate-500 transition outline-none"
                    />
                    {protectedSaved && <p className="mt-1 text-[11px] text-slate-400">Leave blank to keep the saved value.</p>}
                    {fieldError && <p role="alert" className="mt-1 text-xs text-red-600">{fieldError}</p>}
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
