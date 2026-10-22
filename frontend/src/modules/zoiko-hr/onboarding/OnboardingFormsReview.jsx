import { useEffect, useState } from "react";
import {
  errorMessage, getNewHireForms, getPayrollVerifications, returnOnboardingForm,
  revealOnboardingForm, verifyOnboardingForm,
} from "../../../service/onboardingPrompt2Service";

const isBank = (form) => form.canonical_id === "HR-ONB-017";

export default function OnboardingFormsReview({ hireId, payrollQueue = false }) {
  const [forms, setForms] = useState([]);
  const [financePermitted, setFinancePermitted] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busyId, setBusyId] = useState(null);
  const [revealed, setRevealed] = useState({});
  const [returnReasons, setReturnReasons] = useState({});
  const [returningId, setReturningId] = useState(null);

  const load = async () => {
    setLoading(true);
    setError("");
    setNotice("");
    try {
      const result = payrollQueue ? await getPayrollVerifications() : await getNewHireForms(hireId);
      setForms(Array.isArray(result?.items) ? result.items : []);
      setFinancePermitted(!!result?.finance_permitted || payrollQueue);
    } catch (err) {
      setError(errorMessage(err, "Onboarding forms could not be loaded."));
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, [hireId, payrollQueue]);

  const actOn = async (form, action) => {
    setBusyId(form.id);
    setError("");
    setNotice("");
    try {
      const result = action === "verify"
        ? await verifyOnboardingForm(form.id)
        : await returnOnboardingForm(form.id, (returnReasons[form.id] || "").trim());
      setForms((current) => current.map((item) => item.id === form.id ? { ...item, ...result } : item));
      setRevealed((current) => ({ ...current, [form.id]: null }));
      setReturningId(null);
      setReturnReasons((current) => ({ ...current, [form.id]: "" }));
      setNotice(action === "verify" ? `${form.title} verified.` : `${form.title} returned to the new hire.`);
    } catch (err) {
      setError(errorMessage(err, action === "verify" ? "The form could not be verified." : "The form could not be returned."));
    } finally {
      setBusyId(null);
    }
  };

  const toggleReveal = async (form) => {
    if (revealed[form.id]) {
      setRevealed((current) => ({ ...current, [form.id]: null }));
      return;
    }
    setBusyId(form.id);
    setError("");
    try {
      const result = await revealOnboardingForm(form.id);
      setRevealed((current) => ({ ...current, [form.id]: result }));
    } catch (err) {
      setError(errorMessage(err, "Details could not be revealed."));
    } finally {
      setBusyId(null);
    }
  };

  if (loading) return <section className="rounded-xl border bg-white p-5 text-sm text-slate-500">Loading forms…</section>;

  return (
    <section className="space-y-4" aria-label={payrollQueue ? "Payroll verification queue" : "New hire forms"}>
      <header>
        <h2 className="text-lg font-semibold text-slate-900">{payrollQueue ? "Payroll verification queue" : "New hire forms"}</h2>
        <p className="text-sm text-slate-500 mt-1">
          {payrollQueue ? "Submitted bank and payroll forms awaiting finance verification." : "Review submitted onboarding forms. Financial details remain masked unless you explicitly reveal them."}
        </p>
      </header>
      {error && <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
      {notice && <div role="status" className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">{notice}</div>}
      {forms.length === 0 ? (
        <p className="rounded-xl border border-slate-200 bg-white p-5 text-sm text-slate-500">{payrollQueue ? "No payroll forms are waiting for verification." : "No forms have been started."}</p>
      ) : forms.map((form) => {
        const visible = revealed[form.id];
        const values = visible?.values || form.values || {};
        const submitted = String(form.status || "").toUpperCase() === "SUBMITTED";
        const bank = isBank(form);
        const mayVerify = !bank || financePermitted;
        return (
          <article key={form.id || form.canonical_id} className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5">
            <div className="flex flex-wrap justify-between items-start gap-3">
              <div>
                <h3 className="font-semibold text-slate-900">{form.title || form.canonical_id}</h3>
                <p className="mt-1 text-xs text-slate-500">
                  {form.new_hire_name ? `For ${form.new_hire_name} · ` : ""}
                  Status: {String(form.status || "NOT_STARTED").replace(/_/g, " ").toLowerCase()}
                </p>
              </div>
              {bank && form.id && (
                <button type="button" onClick={() => toggleReveal(form)} disabled={busyId === form.id}
                  className="min-h-9 rounded-lg border border-amber-300 px-3 text-xs font-medium text-amber-800 disabled:opacity-50">
                  {busyId === form.id ? "Loading…" : visible ? "Hide financial details" : "Reveal financial details"}
                </button>
              )}
            </div>
            <dl className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-x-5 gap-y-3">
              {(form.fields || []).filter((field) => values[field.key] !== undefined && values[field.key] !== null && values[field.key] !== "")
                .map((field) => (
                  <div key={field.key} className="min-w-0">
                    <dt className="text-xs text-slate-500">{field.label}</dt>
                    <dd className={`mt-0.5 text-sm break-words ${bank && field.classification === "FINANCIAL" ? "font-mono" : ""}`}>
                      {String(values[field.key])}
                    </dd>
                  </div>
                ))}
            </dl>
            {bank && !visible && <p className="mt-3 text-xs text-slate-500">Financial values are masked. Reveal only when needed to verify payroll details.</p>}
            {form.return_reason && <p className="mt-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">Previously returned: {form.return_reason}</p>}
            {submitted && (
              <div className="mt-4 flex flex-wrap justify-end gap-2">
                {!mayVerify && <p className="mr-auto self-center text-xs text-amber-800">Finance permission is required to verify this form.</p>}
                {!payrollQueue && (
                  <button type="button" disabled={busyId === form.id} onClick={() => { setReturningId(form.id); setError(""); }}
                    className="min-h-10 rounded-lg border border-slate-300 px-4 text-sm font-medium text-slate-700 disabled:opacity-50">Return for changes</button>
                )}
                <button type="button" disabled={!mayVerify || busyId === form.id} onClick={() => actOn(form, "verify")}
                  className="min-h-10 rounded-lg bg-blue-600 px-4 text-sm font-medium text-white disabled:opacity-50">Verify</button>
              </div>
            )}
            {!payrollQueue && returningId === form.id && (
              <form className="mt-4 border-t border-slate-100 pt-4" onSubmit={(event) => { event.preventDefault(); actOn(form, "return"); }}>
                <label htmlFor={`return-${form.id}`} className="block text-sm font-medium text-slate-700">What needs to change?</label>
                <textarea id={`return-${form.id}`} required maxLength={2000} value={returnReasons[form.id] || ""}
                  onChange={(event) => setReturnReasons((current) => ({ ...current, [form.id]: event.target.value }))}
                  className="mt-1 w-full min-h-20 rounded-lg border border-slate-300 p-3 text-sm" />
                <div className="mt-2 flex justify-end gap-2">
                  <button type="button" onClick={() => setReturningId(null)} className="min-h-9 rounded-lg border px-3 text-sm">Cancel</button>
                  <button type="submit" disabled={!String(returnReasons[form.id] || "").trim() || busyId === form.id}
                    className="min-h-9 rounded-lg bg-slate-800 px-3 text-sm text-white disabled:opacity-50">Send back</button>
                </div>
              </form>
            )}
          </article>
        );
      })}
      {error && <button type="button" onClick={load} className="min-h-10 rounded-lg border bg-white px-4 text-sm">Try again</button>}
    </section>
  );
}
