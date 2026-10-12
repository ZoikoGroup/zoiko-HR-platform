import { realEmailError } from "../../utils/realEmail";
import PlanComparison from "../../components/PlanComparison";
import { planHighlights } from "../../config/planMatrix";
import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { readGoogleSignup, withoutGoogleSignupParams } from "../../utils/googleSignup";
import { Loader2, Eye, EyeOff, AlertCircle, Check, X, Building2, Crown, Phone, Sparkles, ShieldCheck, ChevronDown, ArrowLeft } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import {
  REGISTRATION_COUNTRIES,
  getStatesForCountryName,
  getTimezonesForCountryName,
  getDefaultTimezoneForCountry,
} from "../../utils/registrationRegions";
import LandingHeader from "../../landing/LandingHeader";
import Footer from "../../landing/Footer";
import { usePublicCatalog, formatRate } from "../../hooks/usePublicCatalog";

const STEPS = ["Plan Selection", "Organization Details", "Admin Account"];

export default function RegisterPage() {
  const { register, error: authError } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  // Arrived through "Continue with Google" without an account: their Google email (and name) fill the form in, and the
  // signed proof lets the new account start with the address already confirmed.
  const [google] = useState(() => readGoogleSignup(location.search));
  useEffect(() => {
    if (google) navigate(`${location.pathname}${withoutGoogleSignupParams(location.search)}`, { replace: true });     // keep the proof out of the address bar
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [step, setStep] = useState(0);
  const [form, setForm] = useState({
    selectedPlan: "",
    orgName: "",
    orgType: "",
    registeredEmail: google?.email || "",
    phone: "",
    address: "",
    city: "",
    state: "",
    country: "",
    timezone: "",
    industry: "",
    taxNumber: "",
    adminName: google?.name || "",
    adminEmail: google?.email || "",
    password: "",
    termsAccepted: false,
  });
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [localError, setLocalError] = useState(null);

  // Live published rates. The plan cards below render these, so a Super Admin
  // re-price reaches registration with no redeploy. Null on failure => the cards
  // simply omit the price.
  const { byCode } = usePublicCatalog();

  function update(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  function handleCountryChange(value) {
    setForm((f) => ({
      ...f,
      country: value,
      state: "",
      timezone: getDefaultTimezoneForCountry(value),
    }));
  }

  const countryStates = getStatesForCountryName(form.country);
  const countryTimezones = getTimezonesForCountryName(form.country);

  function validateStep(s) {
    if (s === 0) {
      if (!form.selectedPlan) return "Please select a plan to evaluate.";
    }
    if (s === 1) {
      if (!form.orgName.trim()) return "Organization name is required.";
      if (!form.orgType) return "Organization type is required.";
      if (!form.registeredEmail.trim()) return "Registered email is required.";
      if (realEmailError(form.registeredEmail)) return `Registered email: ${realEmailError(form.registeredEmail)}`;
      if (!form.phone.trim()) return "Phone number is required.";
      if (!form.taxNumber.trim()) return "Tax / Registration number is required.";
      if (!form.address.trim()) return "Address is required.";
      if (!form.country) return "Country is required.";
    }
    if (s === 2) {
      if (!form.adminName.trim()) return "Admin name is required.";
      if (!form.adminEmail.trim()) return "Admin email is required.";
      if (realEmailError(form.adminEmail)) return `Admin email: ${realEmailError(form.adminEmail)}`;
      if (!form.password || form.password.length < 8) return "Password must be at least 8 characters.";
      if (!form.termsAccepted) return "You must accept the Terms & Conditions.";
    }
    return null;
  }

  function goNext() {
    setLocalError(null);
    const err = validateStep(step);
    if (err) { setLocalError(err); return; }
    setStep((s) => Math.min(s + 1, 2));
  }

  function goBack() {
    setLocalError(null);
    setStep((s) => Math.max(s - 1, 0));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setLocalError(null);
    const err = validateStep(2);
    if (err) { setLocalError(err); return; }
    setSubmitting(true);
    try {
      const result = await register({
        name: form.adminName,
        email: form.adminEmail,
        password: form.password,
        organization: form.orgName,
        planCode: form.selectedPlan,
        orgType: form.orgType,
        phone: form.phone,
        address: form.address,
        city: form.city,
        state: form.state,
        country: form.country,
        timezone: form.timezone,
        industry: form.industry,
        taxNumber: form.taxNumber,
        registeredEmail: form.registeredEmail,
        googleProof: google && google.email.toLowerCase() === form.adminEmail.trim().toLowerCase() ? google.proof : undefined,
      });
      navigate("/register/success", {
        state: {
          organizationName: form.orgName,
          email: form.adminEmail,
          emailConfirmed: !!(google && google.email.toLowerCase() === form.adminEmail.trim().toLowerCase()),
          planCode: form.selectedPlan,
          evaluationEndsAt: result.evaluation_ends_at,
        },
      });
    } catch (err) {
      setLocalError(err.message || "Unable to create your account.");
    } finally {
      setSubmitting(false);
    }
  }

  const field = "w-full h-11 px-3.5 rounded-xl border border-slate-200 bg-slate-50 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:bg-white focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 transition disabled:cursor-not-allowed disabled:opacity-60";
  const label = "block text-[13px] font-semibold text-slate-700 mb-1.5";
  const Req = () => <span className="text-red-600"> *</span>;
  const PLANS = [
    { code: "core", name: "Core", icon: Building2, desc: "Essential HR tools for small to mid-size teams: employee management, leave, attendance and the basics." },
    { code: "advanced", name: "Advanced", icon: Crown, desc: "Advanced HR, payroll and compliance: the full suite for growing organisations." },
  ];
  const planName = form.selectedPlan ? form.selectedPlan.charAt(0).toUpperCase() + form.selectedPlan.slice(1) : "—";

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 font-['Inter',-apple-system,BlinkMacSystemFont,sans-serif]">
      <LandingHeader />

      <main className="flex-1 w-full max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-10 lg:py-14">
        <div className="grid lg:grid-cols-[340px_minmax(0,1fr)] gap-8 items-start">
          {/* Left: what you get, and where you are */}
          <aside className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#0A192F] via-[#0F2942] to-[#1E3A8A] text-white p-7 lg:sticky lg:top-8">
            <div className="relative z-10">
              <p className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-500/20 border border-blue-400/30 text-blue-100 text-[11px] font-semibold tracking-wide">
                <Sparkles className="w-3.5 h-3.5" /> FREE 14-DAY EVALUATION
              </p>
              <h1 className="mt-4 text-[26px] leading-tight font-extrabold tracking-tight">Start your free evaluation</h1>
              <p className="mt-2 text-sm text-slate-300">Try Zoiko HR with Core or Advanced features. No credit card required.</p>

              <ol className="mt-7 space-y-1" aria-label="Registration steps">
                {STEPS.map((s, i) => {
                  const state = i < step ? "done" : i === step ? "current" : "todo";
                  return (
                    <li key={s} aria-current={state === "current" ? "step" : undefined}
                      className={`flex items-center gap-3 rounded-xl px-3 py-2.5 transition ${state === "current" ? "bg-white/10 border border-white/15" : "border border-transparent"}`}>
                      <span className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${state === "done" ? "bg-emerald-500 text-white" : state === "current" ? "bg-blue-500 text-white" : "bg-white/10 text-slate-400"}`}>
                        {state === "done" ? <Check size={14} strokeWidth={3} /> : i + 1}
                      </span>
                      <span className={`text-sm ${state === "todo" ? "text-slate-400" : "text-white font-semibold"}`}>{s}</span>
                    </li>
                  );
                })}
              </ol>

              <ul className="mt-7 pt-6 border-t border-white/10 space-y-2.5 text-sm text-slate-200">
                {["Full product access for 14 days", "No card, no commitment", "Your data is kept if you subscribe"].map((t) => (
                  <li key={t} className="flex items-start gap-2.5"><ShieldCheck className="w-4 h-4 mt-0.5 text-blue-300 shrink-0" />{t}</li>
                ))}
              </ul>
            </div>
            <div className="absolute -right-16 -bottom-24 w-72 h-72 rounded-full bg-blue-500/10 blur-3xl pointer-events-none" />
          </aside>

          {/* Right: the form */}
          <section className="min-w-0">
            {google && (
              <div role="status" className="mb-5 rounded-2xl bg-emerald-50 border border-emerald-200 px-4 py-3 text-[13px] text-emerald-800">
                You signed in with Google as <strong>{google.email}</strong>. There is no Zoiko HR account for it yet: choose a plan and register your organization below. Your email address is already confirmed.
              </div>
            )}

            <div className="rounded-3xl bg-white border border-slate-200 shadow-[0_8px_40px_rgba(15,23,42,0.08)] p-6 sm:p-9">
              <div className="flex items-baseline justify-between gap-4 pb-5 mb-6 border-b border-slate-100">
                <div>
                  <p className="text-xs font-semibold text-blue-600 uppercase tracking-wider">Step {step + 1} of {STEPS.length}</p>
                  <h2 className="text-xl font-bold text-slate-900 mt-1">{STEPS[step]}</h2>
                </div>
                <div className="hidden sm:flex gap-1.5" aria-hidden="true">
                  {STEPS.map((s, i) => <span key={s} className={`h-1.5 w-10 rounded-full ${i <= step ? "bg-blue-600" : "bg-slate-200"}`} />)}
                </div>
              </div>

              {(localError || authError) && (
                <div role="alert" className="flex items-start gap-2 rounded-xl bg-red-50 border border-red-200 px-4 py-3 mb-6">
                  <AlertCircle size={16} className="text-red-600 mt-0.5 shrink-0" />
                  <span className="text-[13px] text-red-700">{localError || authError}</span>
                </div>
              )}

              <form onSubmit={handleSubmit} className="flex flex-col gap-5">
                {step === 0 && (
                  <>
                    <p className="text-[13px] text-slate-500 -mt-1">Choose the package you would like to evaluate. Enterprise is contract-priced and sales-led only.</p>
                    <div className="grid sm:grid-cols-2 gap-4 items-stretch">
                      {PLANS.map((plan) => {
                        const isSelected = form.selectedPlan === plan.code;
                        // Live rate from the published customer catalog. Renders
                        // nothing when unavailable, so a fetch failure can never
                        // display a wrong or zero price.
                        const live = byCode[plan.code];
                        const monthly = formatRate(live, "monthly");
                        const annual = formatRate(live, "annual");
                        const h = planHighlights(plan.code);
                        const Icon = plan.icon;
                        return (
                          <button key={plan.code} type="button" aria-pressed={isSelected} onClick={() => update("selectedPlan", plan.code)}
                            className={`relative text-left flex flex-col rounded-2xl border-2 p-5 transition ${isSelected ? "border-blue-600 bg-blue-50/60 shadow-[0_6px_20px_rgba(37,99,235,0.15)]" : "border-slate-200 bg-white hover:border-slate-300 hover:shadow-sm"}`}>
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2.5">
                                <span className={`w-9 h-9 rounded-xl flex items-center justify-center ${isSelected ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-600"}`}><Icon size={18} /></span>
                                <span className={`text-base font-bold ${isSelected ? "text-blue-700" : "text-slate-900"}`}>{plan.name}</span>
                              </div>
                              <span aria-hidden="true" className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${isSelected ? "border-blue-600 bg-blue-600" : "border-slate-300"}`}>
                                {isSelected && <Check size={12} strokeWidth={3} className="text-white" />}
                              </span>
                            </div>
                            {(monthly || annual) && (
                              <div className="mt-4">
                                {monthly !== null && <><span className="text-[26px] font-extrabold tracking-tight text-slate-900">${monthly}</span><span className="text-xs font-semibold text-slate-500 ml-1">/month</span></>}
                                {annual !== null && <div className="text-[11px] font-semibold text-slate-500 mt-0.5">${annual}/year</div>}
                              </div>
                            )}
                            <p className="mt-3 text-[12.5px] leading-relaxed text-slate-500">{plan.desc}</p>
                            <ul className="mt-3 space-y-1 text-[12px] leading-snug">
                              {h.includes.map((f) => <li key={f} className="flex items-start gap-1.5 text-emerald-800"><Check size={13} className="mt-0.5 shrink-0" />{f}</li>)}
                              {h.excludes.map((f) => <li key={f} className="flex items-start gap-1.5 text-slate-400"><X size={13} className="mt-0.5 shrink-0" />{f}</li>)}
                            </ul>
                            <span className={`mt-auto pt-4 self-start`}>
                              <span className={`inline-block px-2.5 py-1 rounded-full text-[11px] font-semibold ${isSelected ? "bg-blue-100 text-blue-700" : "bg-slate-100 text-slate-600"}`}>Free 14-day evaluation</span>
                            </span>
                          </button>
                        );
                      })}
                    </div>

                    <details className="group rounded-2xl border border-slate-200 bg-white px-4 py-3">
                      <summary className="cursor-pointer text-sm font-bold text-blue-700 list-none flex items-center justify-between">
                        Compare Core and Advanced side by side
                        <ChevronDown className="w-4 h-4 transition group-open:rotate-180" />
                      </summary>
                      <div className="mt-3"><PlanComparison highlight={form.selectedPlan} compact /></div>
                    </details>

                    <a href="mailto:sales@zoikohr.com?subject=Enterprise%20Inquiry" target="_blank" rel="noopener noreferrer"
                      className="flex items-start gap-3 rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50 px-5 py-4 hover:border-slate-300 transition">
                      <span className="w-9 h-9 rounded-xl bg-white border border-slate-200 flex items-center justify-center shrink-0"><Phone size={16} className="text-slate-500" /></span>
                      <span className="flex-1 min-w-0">
                        <span className="flex items-center gap-2">
                          <span className="text-[15px] font-bold text-slate-900">Enterprise</span>
                          <span className="ml-auto px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-amber-100 text-amber-800">Contact Sales</span>
                        </span>
                        <span className="block mt-1 text-[12.5px] text-slate-500">Custom deployment with dedicated support. Contract-priced and sales-led.</span>
                      </span>
                    </a>
                  </>
                )}

                {step === 1 && (
                  <>
                    <div className="grid sm:grid-cols-2 gap-x-5 gap-y-4">
                      <div>
                        <label className={label}>Organization Name<Req /></label>
                        <input type="text" required value={form.orgName} onChange={(e) => update("orgName", e.target.value)} placeholder="Acme Inc." className={field} />
                      </div>
                      <div>
                        <label className={label}>Organization Type<Req /></label>
                        <select required value={form.orgType} onChange={(e) => update("orgType", e.target.value)} className={field}>
                          <option value="">Select type</option>
                          <option value="sole_proprietorship">Sole Proprietorship</option>
                          <option value="partnership">Partnership</option>
                          <option value="llc">LLC</option>
                          <option value="corporation">Corporation</option>
                          <option value="nonprofit">Non-Profit</option>
                          <option value="other">Other</option>
                        </select>
                      </div>
                      <div>
                        <label className={label}>Registered Email<Req /></label>
                        <input type="email" required value={form.registeredEmail} onChange={(e) => update("registeredEmail", e.target.value)} placeholder="company@yourcompany.com" className={field} />
                      </div>
                      <div>
                        <label className={label}>Phone Number<Req /></label>
                        <input type="tel" required value={form.phone} onChange={(e) => update("phone", e.target.value)} placeholder="+1 (555) 123-4567" className={field} />
                      </div>
                      <div>
                        <label className={label}>Tax / Registration Number<Req /></label>
                        <input type="text" required value={form.taxNumber} onChange={(e) => update("taxNumber", e.target.value)} placeholder="GSTIN / VAT / EIN" className={field} />
                      </div>
                      <div>
                        <label className={label}>Industry</label>
                        <input type="text" value={form.industry} onChange={(e) => update("industry", e.target.value)} placeholder="Technology" className={field} />
                      </div>
                    </div>

                    <div>
                      <label className={label}>Address<Req /></label>
                      <textarea required value={form.address} onChange={(e) => update("address", e.target.value)} placeholder="123 Main St, Suite 100" rows={2} className={`${field} h-auto py-2.5 resize-y`} />
                    </div>

                    <div className="grid sm:grid-cols-2 gap-x-5 gap-y-4">
                      <div>
                        <label className={label}>Country<Req /></label>
                        <select required value={form.country} onChange={(e) => handleCountryChange(e.target.value)} className={field}>
                          <option value="">Select country</option>
                          {REGISTRATION_COUNTRIES.map((c) => <option key={c} value={c}>{c}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className={label}>State / Province</label>
                        <select value={form.state} onChange={(e) => update("state", e.target.value)} disabled={countryStates.length === 0} className={field}>
                          <option value="">{countryStates.length === 0 ? "Select country first" : "Select state"}</option>
                          {countryStates.map((s) => <option key={s} value={s}>{s}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className={label}>City</label>
                        <input type="text" value={form.city} onChange={(e) => update("city", e.target.value)} placeholder="New York" className={field} />
                      </div>
                      <div>
                        <label className={label}>Timezone</label>
                        <select value={form.timezone} onChange={(e) => update("timezone", e.target.value)} disabled={countryTimezones.length === 0} className={field}>
                          {countryTimezones.length === 0 ? (
                            <option value="">Select a country first</option>
                          ) : (
                            countryTimezones.map((tz) => <option key={tz} value={tz}>{tz}</option>)
                          )}
                        </select>
                      </div>
                    </div>
                  </>
                )}

                {step === 2 && (
                  <>
                    <div className="grid sm:grid-cols-2 gap-x-5 gap-y-4">
                      <div>
                        <label className={label}>Admin Name<Req /></label>
                        <input type="text" required value={form.adminName} onChange={(e) => update("adminName", e.target.value)} placeholder="Jane Doe" className={field} />
                      </div>
                      <div>
                        <label className={label}>Admin Email<Req /></label>
                        <input type="email" required value={form.adminEmail} readOnly={!!google} onChange={(e) => update("adminEmail", e.target.value)} placeholder="admin@company.com"
                          className={`${field} ${google ? "bg-slate-100 text-slate-500 cursor-not-allowed" : ""}`} />
                        {google && <p className="mt-1.5 text-xs text-emerald-700 flex items-center gap-1"><Check size={12} strokeWidth={3} />Confirmed by Google</p>}
                      </div>
                    </div>

                    <div>
                      <label className={label}>Password<Req /></label>
                      <div className="relative">
                        <input type={showPassword ? "text" : "password"} required minLength={8} value={form.password} onChange={(e) => update("password", e.target.value)}
                          placeholder="At least 8 characters" className={`${field} pr-11`} />
                        <button type="button" onClick={() => setShowPassword((v) => !v)} aria-label={showPassword ? "Hide password" : "Show password"}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                          {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
                        </button>
                      </div>
                    </div>

                    <div className="rounded-2xl bg-slate-50 border border-slate-200 p-5">
                      <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-3">Review</p>
                      <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3">
                        {[["Organization", form.orgName || "—"], ["Plan", planName], ["Admin Email", form.adminEmail || "—"], ["Country", form.country || "—"]].map(([k, v]) => (
                          <div key={k} className="min-w-0">
                            <dt className="text-[11px] text-slate-400">{k}</dt>
                            <dd className="text-[13px] font-semibold text-slate-900 truncate">{v}</dd>
                          </div>
                        ))}
                      </dl>
                      <p className="mt-4 text-[11.5px] text-slate-500">Your 14-day evaluation starts the moment you sign up. No credit card required.</p>
                    </div>

                    <div className="flex items-start gap-2.5">
                      <input id="termsAccepted" type="checkbox" required checked={form.termsAccepted} onChange={(e) => update("termsAccepted", e.target.checked)}
                        className="mt-0.5 w-4 h-4 shrink-0 accent-blue-600 cursor-pointer" />
                      <label htmlFor="termsAccepted" className="text-[13px] text-slate-700 cursor-pointer leading-snug">
                        I accept the{" "}
                        <Link to="/terms" target="_blank" rel="noopener noreferrer" className="text-blue-600 font-semibold hover:underline">Terms & Conditions</Link>
                      </label>
                    </div>
                  </>
                )}

                <div className="flex flex-col-reverse sm:flex-row gap-3 pt-5 mt-1 border-t border-slate-100">
                  {step > 0 && (
                    <button type="button" onClick={goBack}
                      className="h-12 px-6 rounded-xl border border-slate-200 bg-white text-sm font-semibold text-slate-700 hover:bg-slate-50 transition flex items-center justify-center gap-1.5">
                      <ArrowLeft size={16} /> Back
                    </button>
                  )}
                  {step < 2 ? (
                    <button type="button" onClick={goNext}
                      className="h-12 w-full sm:flex-1 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-[15px] font-bold shadow-lg shadow-blue-600/25 transition flex items-center justify-center gap-2">
                      Continue
                    </button>
                  ) : (
                    <button type="submit" disabled={submitting}
                      className="h-12 w-full sm:flex-1 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 disabled:cursor-not-allowed text-white text-[15px] font-bold shadow-lg shadow-blue-600/25 transition flex items-center justify-center gap-2">
                      {submitting && <Loader2 size={16} className="animate-spin" />}
                      {submitting ? "Starting evaluation..." : "Start Evaluation"}
                    </button>
                  )}
                </div>
              </form>

              <p className="text-center text-[13px] text-slate-500 mt-6">
                Already have an account?{" "}
                <Link to="/login" className="text-blue-600 font-semibold hover:underline">Sign in</Link>
              </p>
            </div>

            <p className="text-center mt-5">
              <Link to="/" className="text-[13px] text-slate-400 hover:text-slate-600">Back to homepage</Link>
            </p>
          </section>
        </div>
      </main>

      <Footer />
    </div>
  );
}
