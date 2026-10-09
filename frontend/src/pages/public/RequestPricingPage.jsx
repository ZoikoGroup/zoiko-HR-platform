import { useState } from "react";
import { Link } from "react-router-dom";
import { Check, CheckCircle2, Loader2, Mail, ShieldCheck, Clock, Sparkles, ArrowLeft, AlertCircle } from "lucide-react";
import logo from "../../assets/zoikohr-logo-svg.svg";
import { requestPricing } from "../../service/pricingService";
import { REGISTRATION_COUNTRIES } from "../../utils/registrationRegions";
import {
  COMPANY_SIZES, PLANS, PRODUCT_OPTIONS, TIMELINES, EMPTY_FORM, suggestedPlan, validatePricingForm, buildPricingPayload, serverFieldErrors,
} from "../../utils/pricingRequestForm";

const input = "w-full px-4 py-3 rounded-xl border bg-white text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition";

function Field({ id, label, required, error, hint, children }) {
  return (
    <div>
      <label htmlFor={id} className="block text-xs font-semibold text-slate-600 mb-1.5">
        {label}{required ? <span className="text-red-500"> *</span> : <span className="text-slate-400 font-normal"> (optional)</span>}
      </label>
      {children}
      {hint && !error ? <p className="text-[11px] text-slate-400 mt-1">{hint}</p> : null}
      {error ? <p id={`${id}-error`} role="alert" className="text-xs text-red-600 mt-1">{error}</p> : null}
    </div>
  );
}

export default function RequestPricingPage() {
  const [form, setForm] = useState(EMPTY_FORM);
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState("");
  const [done, setDone] = useState(null);

  const set = (name, value) => {
    setForm((f) => ({ ...f, [name]: value }));
    if (errors[name]) setErrors((e) => ({ ...e, [name]: undefined }));
  };
  const toggleProduct = (value) => set("products", form.products.includes(value) ? form.products.filter((p) => p !== value) : [...form.products, value]);
  const suggestion = suggestedPlan(form.companySize);
  const chosenPlan = form.planInterest || suggestion;
  const props = (id, name) => ({
    id, name, value: form[name], "aria-invalid": errors[name] ? "true" : undefined, "aria-describedby": errors[name] ? `${id}-error` : undefined,
    className: `${input} ${errors[name] ? "border-red-400" : "border-slate-200"}`,
    onChange: (e) => set(name, e.target.value),
  });

  async function submit(e) {
    e.preventDefault();
    setFormError("");
    const found = validatePricingForm(form);
    setErrors(found);
    if (Object.keys(found).length) {
      document.getElementById(`pr-${Object.keys(found)[0]}`)?.focus();
      return;
    }
    setSubmitting(true);
    try {
      const res = await requestPricing(buildPricingPayload(form));
      setDone({ reference: res.reference, emailed: res.confirmation_email_sent, email: form.workEmail.trim().toLowerCase() });
    } catch (err) {
      const fields = serverFieldErrors(err?.validation);
      if (Object.keys(fields).length) setErrors(fields);
      else setFormError(err?.status === 429 ? "You have sent several requests in a short time. Please try again in a little while." : err?.message || "We could not send your request. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 font-sans antialiased">
      <header className="bg-white border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <Link to="/login" aria-label="Zoiko HR, sign in"><img src={logo} alt="Zoiko HR" className="h-8" /></Link>
          <Link to="/login" className="flex items-center gap-1.5 text-sm font-semibold text-slate-600 hover:text-blue-700"><ArrowLeft className="w-4 h-4" /> Back to sign in</Link>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 lg:py-14 grid lg:grid-cols-[420px_minmax(0,1fr)] gap-8 items-start">
        {/* Left: the pricing path */}
        <aside className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#0A192F] via-[#0F2942] to-[#1E3A8A] text-white p-8 lg:sticky lg:top-8">
          <div className="relative z-10">
            <p className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-500/20 border border-blue-400/30 text-blue-100 text-xs font-semibold"><Sparkles className="w-3.5 h-3.5" /> REQUEST PRICING</p>
            <h1 className="mt-4 text-3xl font-extrabold tracking-tight leading-tight">Find your pricing path</h1>
            <p className="mt-3 text-slate-300 text-sm leading-relaxed">Tell us a little about your organization. We will reply with pricing for the plan that fits, usually within one business day.</p>

            <div className="mt-7 space-y-3" aria-label="Plans">
              {PLANS.map((p) => (
                <div key={p.value} className={`rounded-2xl border p-4 transition ${chosenPlan === p.value ? "bg-white/15 border-white/40" : "bg-white/5 border-white/10"}`}>
                  <div className="flex items-center justify-between">
                    <p className="font-bold">{p.label}</p>
                    {suggestion === p.value ? <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-400/20 text-emerald-200 border border-emerald-300/30">SUGGESTED FOR YOUR SIZE</span> : null}
                  </div>
                  <p className="text-xs text-slate-300 mt-1">{p.who}</p>
                  <ul className="mt-2 space-y-1">
                    {p.points.map((pt) => <li key={pt} className="flex items-start gap-2 text-xs text-slate-200"><Check className="w-3.5 h-3.5 mt-0.5 text-blue-300 shrink-0" />{pt}</li>)}
                  </ul>
                </div>
              ))}
            </div>

            <ol className="mt-7 space-y-3 text-sm">
              {[["Send the form", "It takes about two minutes."], ["We confirm by email", "You get a reference number straight away."], ["Our team replies", "With pricing that fits, within one business day."]].map(([t, s], i) => (
                <li key={t} className="flex items-start gap-3">
                  <span className="w-6 h-6 rounded-full bg-blue-500/30 border border-blue-300/30 text-xs font-bold flex items-center justify-center shrink-0">{i + 1}</span>
                  <span><span className="font-semibold">{t}</span><span className="block text-xs text-slate-300">{s}</span></span>
                </li>
              ))}
            </ol>
            <p className="mt-6 text-xs text-slate-400 flex items-center gap-1.5"><ShieldCheck className="w-3.5 h-3.5" /> We only use your details to answer this request.</p>
          </div>
          <div className="absolute -right-16 -bottom-24 w-72 h-72 rounded-full bg-blue-500/10 blur-3xl pointer-events-none" />
        </aside>

        {/* Right: the form, or the confirmation */}
        <main>
          {done ? (
            <div role="status" className="rounded-3xl bg-white border border-slate-200 shadow-sm p-8 sm:p-12 text-center">
              <div className="w-16 h-16 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto"><CheckCircle2 className="w-9 h-9" /></div>
              <h2 className="mt-5 text-2xl font-extrabold text-slate-900">Thank you, we have your request</h2>
              <p className="mt-2 text-slate-600">Your reference is <span className="font-mono font-bold text-slate-900">{done.reference}</span>. Our team will reply within one business day.</p>
              <div className="mt-6 inline-flex items-start gap-2.5 text-left rounded-2xl bg-slate-50 border border-slate-200 p-4 text-sm text-slate-600 max-w-md">
                <Mail className="w-5 h-5 text-blue-600 mt-0.5 shrink-0" />
                {done.emailed
                  ? <span>A confirmation is on its way to <b className="text-slate-900">{done.email}</b>. If you do not see it in a few minutes, check your spam folder.</span>
                  : <span>We saved your request, but could not send the confirmation email to <b className="text-slate-900">{done.email}</b> right now. Our team will still contact you.</span>}
              </div>
              <div className="mt-8 flex flex-wrap justify-center gap-3">
                <Link to="/hr-products" className="px-5 py-2.5 rounded-xl border border-slate-300 text-sm font-semibold text-slate-700 hover:bg-slate-50">Explore HR products</Link>
                <Link to="/login" className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold">Back to sign in</Link>
              </div>
            </div>
          ) : (
            <form onSubmit={submit} noValidate className="rounded-3xl bg-white border border-slate-200 shadow-sm p-6 sm:p-9 space-y-8" aria-label="Request pricing">
              {formError ? (
                <div role="alert" className="flex items-start gap-2 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3"><AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />{formError}</div>
              ) : null}

              <fieldset className="space-y-4">
                <legend className="text-sm font-bold text-slate-900 mb-1">About you</legend>
                <div className="grid sm:grid-cols-2 gap-4">
                  <Field id="pr-fullName" label="Full name" required error={errors.fullName}><input {...props("pr-fullName", "fullName")} autoComplete="name" /></Field>
                  <Field id="pr-workEmail" label="Work email" required error={errors.workEmail} hint="We reply to this address."><input {...props("pr-workEmail", "workEmail")} type="email" autoComplete="email" /></Field>
                  <Field id="pr-phone" label="Phone" error={errors.phone}><input {...props("pr-phone", "phone")} type="tel" autoComplete="tel" /></Field>
                  <Field id="pr-jobTitle" label="Job title" error={errors.jobTitle}><input {...props("pr-jobTitle", "jobTitle")} autoComplete="organization-title" /></Field>
                </div>
              </fieldset>

              <fieldset className="space-y-4">
                <legend className="text-sm font-bold text-slate-900 mb-1">Your organization</legend>
                <div className="grid sm:grid-cols-2 gap-4">
                  <Field id="pr-company" label="Company" required error={errors.company}><input {...props("pr-company", "company")} autoComplete="organization" /></Field>
                  <Field id="pr-country" label="Country" required error={errors.country}>
                    <select {...props("pr-country", "country")}>
                      <option value="">Select country</option>
                      {REGISTRATION_COUNTRIES.map((c) => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </Field>
                  <Field id="pr-companySize" label="Company size (employees)" required error={errors.companySize}>
                    <select {...props("pr-companySize", "companySize")}>
                      <option value="">Select size</option>
                      {COMPANY_SIZES.map((s) => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </Field>
                  <Field id="pr-timeline" label="When do you want to start?" error={errors.timeline}>
                    <select {...props("pr-timeline", "timeline")}>
                      <option value="">Select</option>
                      {TIMELINES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                    </select>
                  </Field>
                </div>
              </fieldset>

              <fieldset className="space-y-4">
                <legend className="text-sm font-bold text-slate-900 mb-1">What are you looking for?</legend>
                <div role="group" aria-label="Plan of interest" className="grid sm:grid-cols-4 gap-2.5">
                  {[...PLANS, { value: "not_sure", label: "Not sure yet" }].map((p) => (
                    <button type="button" key={p.value} aria-pressed={chosenPlan === p.value || (!chosenPlan && p.value === "not_sure")}
                      onClick={() => set("planInterest", p.value)}
                      className={`px-3 py-3 rounded-xl border text-sm font-semibold transition ${(chosenPlan === p.value || (!chosenPlan && p.value === "not_sure")) ? "border-blue-600 bg-blue-50 text-blue-700 ring-2 ring-blue-200" : "border-slate-200 text-slate-700 hover:border-slate-300"}`}>
                      {p.label}
                    </button>
                  ))}
                </div>
                <div role="group" aria-label="Products" className="flex flex-wrap gap-2.5">
                  {PRODUCT_OPTIONS.map((p) => {
                    const on = form.products.includes(p.value);
                    return (
                      <label key={p.value} className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border text-sm font-semibold cursor-pointer transition ${on ? "border-blue-600 bg-blue-50 text-blue-700" : "border-slate-200 text-slate-700 hover:border-slate-300"}`}>
                        <input type="checkbox" className="sr-only" checked={on} onChange={() => toggleProduct(p.value)} />
                        <span aria-hidden="true" className={`w-4 h-4 rounded border flex items-center justify-center ${on ? "bg-blue-600 border-blue-600" : "border-slate-300"}`}>{on ? <Check className="w-3 h-3 text-white" /> : null}</span>
                        {p.label}
                      </label>
                    );
                  })}
                </div>
                <div role="group" aria-label="Billing preference" className="flex items-center gap-2 text-sm">
                  <span className="text-xs font-semibold text-slate-600 mr-1">Billing:</span>
                  {[["monthly", "Monthly"], ["annual", "Annual"]].map(([v, l]) => (
                    <button type="button" key={v} aria-pressed={form.billingPreference === v} onClick={() => set("billingPreference", form.billingPreference === v ? "" : v)}
                      className={`px-4 py-1.5 rounded-lg border text-xs font-semibold ${form.billingPreference === v ? "border-blue-600 bg-blue-50 text-blue-700" : "border-slate-200 text-slate-600"}`}>{l}</button>
                  ))}
                </div>
                <Field id="pr-message" label="Anything we should know?" error={errors.message} hint="For example: number of legal entities, countries, or must-have features.">
                  <textarea {...props("pr-message", "message")} rows={4} maxLength={2000} />
                </Field>
              </fieldset>

              {/* Honeypot: hidden from people, bots fill it in */}
              <div aria-hidden="true" style={{ position: "absolute", left: "-10000px", width: 1, height: 1, overflow: "hidden" }}>
                <label>Website<input tabIndex={-1} autoComplete="off" value={form.website} onChange={(e) => set("website", e.target.value)} /></label>
              </div>

              <div>
                <label className="flex items-start gap-2.5 text-sm text-slate-600 cursor-pointer">
                  <input id="pr-consent" type="checkbox" checked={form.consent} onChange={(e) => set("consent", e.target.checked)} aria-invalid={errors.consent ? "true" : undefined} className="mt-1 w-4 h-4 rounded border-slate-300" />
                  <span>I agree that Zoiko HR may contact me about this request. See our <Link to="/terms" className="text-blue-600 font-semibold hover:underline">Terms &amp; Conditions</Link>.</span>
                </label>
                {errors.consent ? <p role="alert" className="text-xs text-red-600 mt-1">{errors.consent}</p> : null}
              </div>

              <div className="flex flex-wrap items-center justify-between gap-4 pt-2 border-t border-slate-100">
                <p className="text-xs text-slate-500 flex items-center gap-1.5"><Clock className="w-3.5 h-3.5" /> We reply within one business day.</p>
                <button type="submit" disabled={submitting} className="px-7 py-3 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white text-sm font-bold shadow-sm flex items-center gap-2">
                  {submitting ? <><Loader2 className="w-4 h-4 animate-spin" /> Sending...</> : "Request pricing"}
                </button>
              </div>
            </form>
          )}
        </main>
      </div>
    </div>
  );
}
