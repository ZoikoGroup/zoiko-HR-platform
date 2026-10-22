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
      setForms(Array.isArray(result?.items) ? result.items : []);
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

  if (loading) return <section aria-label="Onboarding forms" className="bg-white rounded-2xl border border-slate-200 p-5 text-sm text-slate-500">Loading your forms…</section>;

  return (
    <section aria-label="Onboarding forms" className="space-y-4">
      <header>
        <h2 className="text-lg font-semibold text-slate-900">Your onboarding forms</h2>
        <p className="text-sm text-slate-500 mt-1">Save a draft at any time. Submit each form when it is complete.</p>
      </header>
      {error && <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
      {notice && <div role="status" className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">{notice}</div>}
      {!forms.length && !error && <p className="rounded-xl border bg-white p-4 text-sm text-slate-500">No forms are available yet.</p>}
      {forms.map((form) => {
        const id = form.canonical_id;
        const writable = editable(form);
        const values = form.values || {};
        const masked = new Set(form.masked_keys || []);
        return (
          <article key={id} className="bg-white rounded-2xl shadow-sm border border-slate-200 p-4 sm:p-6">
            <div className="flex flex-wrap justify-between items-start gap-3">
              <div>
                <h3 className="font-semibold text-slate-900">{form.title}</h3>
                <p className="text-xs text-slate-500 mt-1">Status: {String(form.status || "NOT_STARTED").replace(/_/g, " ").toLowerCase()}</p>
              </div>
              {form.return_reason && <p className="basis-full text-sm text-red-700 bg-red-50 rounded-lg p-3">HR asked for an update: {form.return_reason}</p>}
            </div>
            <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
              {(form.fields || []).map((field) => {
                const fieldError = fieldErrors[`${id}:${field.key}`];
                const protectedSaved = masked.has(field.key) && !!values[field.key] && !touched[`${id}:${field.key}`];
                const type = field.type === "date" ? "date"
                  : /email/i.test(field.key) ? "email"
                    : /phone|mobile/i.test(field.key) ? "tel" : "text";
                return (
                  <div key={field.key} className="min-w-0">
                    <label htmlFor={`portal-${id}-${field.key}`} className="block text-sm font-medium text-slate-700 mb-1">
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
                      className="w-full min-h-10 border border-slate-200 rounded-lg px-3 py-2 text-sm disabled:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    {protectedSaved && <p className="mt-1 text-xs text-slate-500">Leave blank to keep the saved value.</p>}
                    {fieldError && <p role="alert" className="mt-1 text-xs text-red-600">{fieldError}</p>}
                  </div>
                );
              })}
            </div>
            {form.declaration && (
              <div className="mt-4">
                <label className="flex items-start gap-2 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    checked={!!declarations[id]}
                    disabled={!writable}
                    onChange={(event) => setDeclarations((current) => ({ ...current, [id]: event.target.checked }))}
                    className="mt-1 rounded border-slate-300"
                  />
                  <span>{form.declaration}</span>
                </label>
                {fieldErrors[`${id}:declaration`] && <p role="alert" className="mt-1 text-xs text-red-600">{fieldErrors[`${id}:declaration`]}</p>}
              </div>
            )}
            {writable && (
              <div className="mt-5 flex flex-wrap justify-end gap-2">
                <button type="button" onClick={() => save(form, false)} disabled={busyId === id}
                  className="min-h-10 rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 disabled:opacity-50">
                  {busyId === id ? "Saving…" : "Save draft"}
                </button>
                <button type="button" onClick={() => save(form, true)} disabled={busyId === id}
                  className="min-h-10 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
                  {busyId === id ? "Submitting…" : "Submit form"}
                </button>
              </div>
            )}
          </article>
        );
      })}
      {error && <button type="button" onClick={load} className="min-h-10 rounded-lg border border-slate-300 bg-white px-4 text-sm">Try again</button>}
    </section>
  );
}
