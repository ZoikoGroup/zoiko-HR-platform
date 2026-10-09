import { useState } from "react";
import { Link } from "react-router-dom";
import {
  Check, CheckCircle2, Loader2, Mail, ShieldCheck, ArrowLeft, AlertCircle, CalendarDays, Video, PlayCircle, Users,
  Sparkles, Clock, MessageSquare,
} from "lucide-react";
import logo from "../../assets/zoikohr-logo-svg.svg";
import { requestDemo } from "../../service/demoService";
import { REGISTRATION_COUNTRIES } from "../../utils/registrationRegions";
import {
  DEMO_INTERESTS, TIME_SLOTS, DEMO_FORMATS, COMPANY_SIZES, EMPTY_DEMO, dateLimits, validateDemoForm, buildDemoPayload, serverDemoErrors,
} from "../../utils/demoRequestForm";

const input = "w-full px-4 py-3 rounded-xl border bg-white text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition";
const FORMAT_ICONS = { live: Video, recorded: PlayCircle, in_person: Users };

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

function Section({ step, title, children }) {
  return (
    <fieldset className="space-y-4">
      <legend className="flex items-center gap-2.5 text-sm font-bold text-slate-900 mb-1">
        <span className="w-6 h-6 rounded-full bg-blue-600 text-white text-xs flex items-center justify-center">{step}</span>{title}
      </legend>
      {children}
    </fieldset>
  );
}

export default function BookDemoPage() {
  const [form, setForm] = useState(EMPTY_DEMO);
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState("");
  const [done, setDone] = useState(null);
  const limits = dateLimits();

  const set = (name, value) => {
    setForm((f) => ({ ...f, [name]: value }));
    if (errors[name]) setErrors((e) => ({ ...e, [name]: undefined }));
  };
  const toggleInterest = (v) => set("interests", form.interests.includes(v) ? form.interests.filter((x) => x !== v) : [...form.interests, v]);
  const props = (name) => ({
    id: `dm-${name}`, name, value: form[name],
    "aria-invalid": errors[name] ? "true" : undefined, "aria-describedby": errors[name] ? `dm-${name}-error` : undefined,
    className: `${input} ${errors[name] ? "border-red-400" : "border-slate-200"}`,
    onChange: (e) => set(name, e.target.value),
  });

  async function submit(e) {
    e.preventDefault();
    setFormError("");
    const found = validateDemoForm(form);
    setErrors(found);
    if (Object.keys(found).length) {
      document.getElementById(`dm-${Object.keys(found)[0]}`)?.focus();
      return;
    }
    setSubmitting(true);
    try {
      const res = await requestDemo(buildDemoPayload(form));
      setDone({ reference: res.reference, emailed: res.confirmation_email_sent, email: form.workEmail.trim().toLowerCase() });
      window.scrollTo?.(0, 0);
    } catch (err) {
      const fields = serverDemoErrors(err?.validation);
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

      {/* Hero */}
      <section className="relative overflow-hidden bg-gradient-to-br from-[#0A192F] via-[#0F2942] to-[#1E3A8A] text-white">
        <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-12 pb-24">
          <p className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-500/20 border border-blue-400/30 text-blue-100 text-xs font-semibold"><Sparkles className="w-3.5 h-3.5" /> BOOK A DEMO</p>
          <h1 className="mt-4 text-4xl md:text-5xl font-extrabold tracking-tight max-w-3xl leading-tight">See Zoiko HR working for your organization</h1>
          <p className="mt-4 text-lg text-slate-300 max-w-2xl">A product specialist walks you through the parts that matter to you, answers your questions, and shows how your team would use it day to day.</p>
          <div className="mt-8 grid sm:grid-cols-3 gap-4 max-w-3xl">
            {[[Clock, "30 minutes", "Focused on your needs"], [MessageSquare, "Your questions", "Live answers from a specialist"], [ShieldCheck, "No commitment", "No card, no obligation"]].map(([Icon, t, s]) => (
              <div key={t} className="flex items-start gap-3 rounded-2xl bg-white/5 border border-white/10 p-4">
                <div className="p-2 rounded-xl bg-blue-500/20 text-blue-200"><Icon className="w-5 h-5" /></div>
                <div><p className="font-semibold text-sm">{t}</p><p className="text-xs text-slate-300">{s}</p></div>
              </div>
            ))}
          </div>
        </div>
        <div className="absolute -right-16 -bottom-28 w-96 h-96 rounded-full bg-blue-500/10 blur-3xl pointer-events-none" />
        <div className="absolute top-0 right-1/3 w-64 h-64 rounded-full bg-indigo-500/10 blur-2xl pointer-events-none" />
      </section>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 -mt-14 pb-16 relative z-20 grid lg:grid-cols-[minmax(0,1fr)_340px] gap-8 items-start">
        <main>
          {done ? (
            <div role="status" className="rounded-3xl bg-white border border-slate-200 shadow-lg p-8 sm:p-12 text-center">
              <div className="w-16 h-16 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto"><CheckCircle2 className="w-9 h-9" /></div>
              <h2 className="mt-5 text-2xl font-extrabold text-slate-900">Your demo request is in</h2>
              <p className="mt-2 text-slate-600">Your reference is <span className="font-mono font-bold text-slate-900">{done.reference}</span>. We will email you within one business day to confirm the time.</p>
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
            <form onSubmit={submit} noValidate aria-label="Book a demo" className="rounded-3xl bg-white border border-slate-200 shadow-lg p-6 sm:p-9 space-y-9">
              {formError ? <div role="alert" className="flex items-start gap-2 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3"><AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />{formError}</div> : null}

              <Section step="1" title="About you">
                <div className="grid sm:grid-cols-2 gap-4">
                  <Field id="dm-fullName" label="Full name" required error={errors.fullName}><input {...props("fullName")} autoComplete="name" /></Field>
                  <Field id="dm-workEmail" label="Work email" required error={errors.workEmail} hint="We send the meeting details here."><input {...props("workEmail")} type="email" autoComplete="email" /></Field>
                  <Field id="dm-phone" label="Phone" error={errors.phone}><input {...props("phone")} type="tel" autoComplete="tel" /></Field>
                  <Field id="dm-jobTitle" label="Job title" error={errors.jobTitle}><input {...props("jobTitle")} autoComplete="organization-title" /></Field>
                </div>
              </Section>

              <Section step="2" title="Your organization">
                <div className="grid sm:grid-cols-3 gap-4">
                  <Field id="dm-company" label="Company" required error={errors.company}><input {...props("company")} autoComplete="organization" /></Field>
                  <Field id="dm-country" label="Country" required error={errors.country}>
                    <select {...props("country")}><option value="">Select country</option>{REGISTRATION_COUNTRIES.map((c) => <option key={c} value={c}>{c}</option>)}</select>
                  </Field>
                  <Field id="dm-companySize" label="Employees" required error={errors.companySize}>
                    <select {...props("companySize")}><option value="">Select size</option>{COMPANY_SIZES.map((s) => <option key={s} value={s}>{s}</option>)}</select>
                  </Field>
                </div>
              </Section>

              <Section step="3" title="What would you like to see?">
                <div role="group" aria-label="Topics" className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                  {DEMO_INTERESTS.map((i) => {
                    const on = form.interests.includes(i.value);
                    return (
                      <label key={i.value} className={`flex items-center gap-2 px-3.5 py-3 rounded-xl border text-sm font-semibold cursor-pointer transition ${on ? "border-blue-600 bg-blue-50 text-blue-700" : "border-slate-200 text-slate-700 hover:border-slate-300"}`}>
                        <input type="checkbox" className="sr-only" checked={on} onChange={() => toggleInterest(i.value)} />
                        <span aria-hidden="true" className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${on ? "bg-blue-600 border-blue-600" : "border-slate-300"}`}>{on ? <Check className="w-3 h-3 text-white" /> : null}</span>
                        {i.label}
                      </label>
                    );
                  })}
                </div>
              </Section>

              <Section step="4" title="When suits you?">
                <div role="group" aria-label="Demo format" className="grid sm:grid-cols-3 gap-3">
                  {DEMO_FORMATS.map((f) => {
                    const Icon = FORMAT_ICONS[f.value];
                    const on = form.demoFormat === f.value;
                    return (
                      <button type="button" key={f.value} aria-pressed={on} onClick={() => set("demoFormat", f.value)}
                        className={`text-left p-4 rounded-2xl border transition ${on ? "border-blue-600 bg-blue-50 ring-2 ring-blue-200" : "border-slate-200 hover:border-slate-300"}`}>
                        <Icon className={`w-5 h-5 ${on ? "text-blue-600" : "text-slate-500"}`} />
                        <p className="mt-2 text-sm font-bold text-slate-900">{f.label}</p>
                        <p className="text-xs text-slate-500">{f.sub}</p>
                      </button>
                    );
                  })}
                </div>
                <div className="grid sm:grid-cols-[220px_minmax(0,1fr)] gap-4 items-start">
                  <Field id="dm-preferredDate" label="Preferred date" error={errors.preferredDate}>
                    <input {...props("preferredDate")} type="date" min={limits.min} max={limits.max} />
                  </Field>
                  <div>
                    <p className="block text-xs font-semibold text-slate-600 mb-1.5">Preferred time <span className="text-slate-400 font-normal">(optional, your local time)</span></p>
                    <div role="group" aria-label="Preferred time" className="grid grid-cols-3 gap-2.5">
                      {TIME_SLOTS.map((t) => {
                        const on = form.preferredTime === t.value;
                        return (
                          <button type="button" key={t.value} aria-pressed={on} onClick={() => set("preferredTime", on ? "" : t.value)}
                            className={`px-3 py-2.5 rounded-xl border text-center transition ${on ? "border-blue-600 bg-blue-50 text-blue-700" : "border-slate-200 text-slate-700 hover:border-slate-300"}`}>
                            <span className="block text-sm font-semibold">{t.label}</span>
                            <span className="block text-[11px] text-slate-500">{t.sub}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
                <Field id="dm-message" label="Anything we should prepare?" error={errors.message} hint="For example: your current HR tools, number of locations, or a process you want to see.">
                  <textarea {...props("message")} rows={4} maxLength={2000} />
                </Field>
              </Section>

              <div aria-hidden="true" style={{ position: "absolute", left: "-10000px", width: 1, height: 1, overflow: "hidden" }}>
                <label>Website<input tabIndex={-1} autoComplete="off" value={form.website} onChange={(e) => set("website", e.target.value)} /></label>
              </div>

              <div>
                <label className="flex items-start gap-2.5 text-sm text-slate-600 cursor-pointer">
                  <input id="dm-consent" type="checkbox" checked={form.consent} onChange={(e) => set("consent", e.target.checked)} aria-invalid={errors.consent ? "true" : undefined} className="mt-1 w-4 h-4 rounded border-slate-300" />
                  <span>I agree that Zoiko HR may contact me to arrange this demo. See our <Link to="/terms" className="text-blue-600 font-semibold hover:underline">Terms &amp; Conditions</Link>.</span>
                </label>
                {errors.consent ? <p role="alert" className="text-xs text-red-600 mt-1">{errors.consent}</p> : null}
              </div>

              <div className="flex flex-wrap items-center justify-between gap-4 pt-5 border-t border-slate-100">
                <p className="text-xs text-slate-500 flex items-center gap-1.5"><CalendarDays className="w-3.5 h-3.5" /> We confirm the time by email within one business day.</p>
                <button type="submit" disabled={submitting} className="px-8 py-3 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white text-sm font-bold shadow-lg shadow-blue-600/20 flex items-center gap-2">
                  {submitting ? <><Loader2 className="w-4 h-4 animate-spin" /> Sending...</> : "Book my demo"}
                </button>
              </div>
            </form>
          )}
        </main>

        <aside className="space-y-5 lg:sticky lg:top-8">
          <div className="rounded-3xl bg-white border border-slate-200 shadow-lg p-6">
            <h2 className="text-sm font-bold text-slate-900">What you will see</h2>
            <ul className="mt-4 space-y-3">
              {["Employee records, org chart and self-service", "Leave requests, balances and approvals", "Documents, policies and acknowledgments", "Dashboards, reports and the HR assistant", "Plans and pricing that fit your size"].map((t) => (
                <li key={t} className="flex items-start gap-2.5 text-sm text-slate-700"><Check className="w-4 h-4 mt-0.5 text-emerald-600 shrink-0" />{t}</li>
              ))}
            </ul>
          </div>
          <div className="rounded-3xl bg-white border border-slate-200 shadow-lg p-6">
            <h2 className="text-sm font-bold text-slate-900">What happens next</h2>
            <ol className="mt-4 space-y-4">
              {[["You send this form", "It takes about two minutes."], ["We confirm by email", "You get a reference straight away, and the meeting details within one business day."], ["We meet", "A focused session on what matters to you."]].map(([t, s], i) => (
                <li key={t} className="flex items-start gap-3">
                  <span className="w-6 h-6 rounded-full bg-blue-50 text-blue-700 text-xs font-bold flex items-center justify-center shrink-0">{i + 1}</span>
                  <span className="text-sm"><span className="font-semibold text-slate-900">{t}</span><span className="block text-xs text-slate-500 mt-0.5">{s}</span></span>
                </li>
              ))}
            </ol>
          </div>
          <div className="rounded-3xl bg-gradient-to-br from-[#0A192F] to-[#1E3A8A] text-white p-6">
            <p className="text-sm font-bold">Only need prices?</p>
            <p className="text-xs text-slate-300 mt-1">Tell us about your team and we will send pricing instead.</p>
            <Link to="/request-pricing" className="mt-4 inline-flex text-xs font-semibold px-4 py-2 rounded-xl bg-white/10 border border-white/20 hover:bg-white/20">Request pricing</Link>
          </div>
        </aside>
      </div>
    </div>
  );
}
