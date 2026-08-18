import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Loader2, Eye, EyeOff, AlertCircle, Check, Building2, Crown, Phone } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import {
  REGISTRATION_COUNTRIES,
  getStatesForCountryName,
  getTimezonesForCountryName,
  getDefaultTimezoneForCountry,
} from "../../utils/registrationRegions";
import LandingHeader from "../../landing/LandingHeader";
import Footer from "../../landing/Footer";

const STEPS = ["Plan Selection", "Organization Details", "Admin Account"];

export default function RegisterPage() {
  const { register, error: authError } = useAuth();
  const navigate = useNavigate();

  const [step, setStep] = useState(0);
  const [form, setForm] = useState({
    selectedPlan: "",
    orgName: "",
    orgType: "",
    registeredEmail: "",
    phone: "",
    address: "",
    city: "",
    state: "",
    country: "",
    timezone: "",
    industry: "",
    taxNumber: "",
    adminName: "",
    adminEmail: "",
    password: "",
    termsAccepted: false,
  });
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [localError, setLocalError] = useState(null);

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
      if (!form.phone.trim()) return "Phone number is required.";
      if (!form.taxNumber.trim()) return "Tax / Registration number is required.";
      if (!form.address.trim()) return "Address is required.";
      if (!form.country) return "Country is required.";
    }
    if (s === 2) {
      if (!form.adminName.trim()) return "Admin name is required.";
      if (!form.adminEmail.trim()) return "Admin email is required.";
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
      });
      navigate("/register/success", {
        state: {
          organizationName: form.orgName,
          email: form.adminEmail,
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

  const inputStyle = {
    width: "100%", padding: "11px 14px", borderRadius: "10px",
    border: "1.5px solid #E5E7EB", fontSize: "14px", color: "#111827",
    outline: "none", boxSizing: "border-box", transition: "border-color 0.2s",
    background: "#F9FAFB",
  };
  const focusHandlers = {
    onFocus: (e) => (e.target.style.borderColor = "#3B82F6"),
    onBlur: (e) => (e.target.style.borderColor = "#E5E7EB"),
  };
  const labelStyle = { display: "block", fontSize: "13px", fontWeight: "600", color: "#374151", marginBottom: "6px" };

  return (
    <div style={{
      minHeight: "100vh", display: "flex", flexDirection: "column",
      background: "#ffffff",
      fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif"
    }}>
      <LandingHeader />
      <div style={{
        flex: 1, display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center",
        padding: "40px 24px"
      }}>
        <div style={{ width: "100%", maxWidth: "680px" }}>
          <div style={{ textAlign: "center", marginBottom: "36px" }}>
            <h1 style={{ fontSize: "26px", fontWeight: "800", color: "#111827", margin: "0 0 8px 0", letterSpacing: "-0.5px" }}>
              Start your free evaluation
            </h1>
            <p style={{ fontSize: "14px", color: "#6B7280", margin: 0 }}>
              Try Zoiko HR with Core or Advanced features. No credit card required.
            </p>
          </div>

          <div style={{ display: "flex", justifyContent: "center", gap: "0", marginBottom: "28px" }}>
            {STEPS.map((label, i) => (
              <div key={label} style={{ display: "flex", alignItems: "center" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <div style={{
                    width: "28px", height: "28px", borderRadius: "50%",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: "12px", fontWeight: "700",
                    background: i < step ? "#10B981" : i === step ? "#3B82F6" : "#E5E7EB",
                    color: i <= step ? "white" : "#9CA3AF",
                    transition: "all 0.3s",
                  }}>
                    {i < step ? <Check size={14} strokeWidth={3} /> : i + 1}
                  </div>
                  <span style={{
                    fontSize: "12px", fontWeight: i === step ? "600" : "400",
                    color: i === step ? "#111827" : "#9CA3AF",
                  }}>
                    {label}
                  </span>
                </div>
                {i < STEPS.length - 1 && (
                  <div style={{
                    width: "40px", height: "2px", margin: "0 12px",
                    background: i < step ? "#10B981" : "#E5E7EB",
                    transition: "background 0.3s",
                  }} />
                )}
              </div>
            ))}
          </div>

          <div style={{
            background: "white", borderRadius: "20px",
            boxShadow: "0 8px 40px rgba(0,0,0,0.10)",
            border: "1px solid #F3F4F6", padding: "36px"
          }}>
            {(localError || authError) && (
              <div style={{
                display: "flex", alignItems: "flex-start", gap: "8px",
                background: "#FEF2F2", border: "1px solid #FECACA",
                borderRadius: "10px", padding: "12px 14px", marginBottom: "20px"
              }}>
                <AlertCircle size={16} color="#DC2626" style={{ marginTop: "1px", flexShrink: 0 }} />
                <span style={{ fontSize: "13px", color: "#DC2626" }}>{localError || authError}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "18px" }}>
              {step === 0 && (
                <>
                  <p style={{ fontSize: "13px", color: "#6B7280", margin: "0 0 4px 0" }}>
                    Choose the package you would like to evaluate. Enterprise is contract-priced and sales-led only.
                  </p>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px" }}>
                    {[
                      { code: "core", name: "Core", icon: <Building2 size={22} />, desc: "Essential HR tools for small to mid-size teams \u2014 employee management, leave, attendance, and basics." },
                      { code: "advanced", name: "Advanced", icon: <Crown size={22} />, desc: "Advanced HR, payroll, and compliance \u2014 full suite for growing organisations." },
                    ].map((plan) => {
                      const isSelected = form.selectedPlan === plan.code;
                      return (
                        <button
                          key={plan.code}
                          type="button"
                          onClick={() => update("selectedPlan", plan.code)}
                          style={{
                            padding: "24px 20px", borderRadius: "14px", cursor: "pointer", textAlign: "left",
                            border: isSelected ? "2.5px solid #3B82F6" : "1.5px solid #E5E7EB",
                            background: isSelected ? "#EFF6FF" : "#F9FAFB",
                            transition: "all 0.2s",
                            boxShadow: isSelected ? "0 4px 16px rgba(59,130,246,0.18)" : "none",
                          }}
                        >
                          <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "10px" }}>
                            <div style={{ color: isSelected ? "#3B82F6" : "#6B7280", transition: "color 0.2s" }}>
                              {plan.icon}
                            </div>
                            <span style={{ fontSize: "16px", fontWeight: "700", color: isSelected ? "#3B82F6" : "#111827" }}>
                              {plan.name}
                            </span>
                          </div>
                          <p style={{ margin: 0, fontSize: "12px", color: "#6B7280", lineHeight: "1.5" }}>
                            {plan.desc}
                          </p>
                          <div style={{
                            marginTop: "12px", display: "inline-block",
                            padding: "3px 10px", borderRadius: "20px",
                            fontSize: "11px", fontWeight: "600",
                            background: isSelected ? "#DBEAFE" : "#F3F4F6",
                            color: isSelected ? "#2563EB" : "#6B7280",
                          }}>
                            Free 14-day evaluation
                          </div>
                        </button>
                      );
                    })}
                  </div>

                  <a
                    href="mailto:sales@zoikohr.com?subject=Enterprise%20Inquiry"
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      display: "block", padding: "18px 20px", borderRadius: "14px",
                      border: "1.5px dashed #D1D5DB", background: "#FAFAFA",
                      textDecoration: "none", transition: "all 0.2s",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "6px" }}>
                      <Phone size={18} color="#6B7280" />
                      <span style={{ fontSize: "15px", fontWeight: "700", color: "#111827" }}>Enterprise</span>
                      <span style={{
                        marginLeft: "auto", padding: "3px 10px", borderRadius: "20px",
                        fontSize: "11px", fontWeight: "600", background: "#FEF3C7", color: "#92400E",
                      }}>
                        Contact Sales
                      </span>
                    </div>
                    <p style={{ margin: 0, fontSize: "12px", color: "#6B7280", lineHeight: "1.5" }}>
                      Custom deployment with dedicated support. Contract-priced and sales-led.
                    </p>
                  </a>
                </>
              )}

              {step === 1 && (
                <>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "18px" }}>
                    <div>
                      <label style={labelStyle}>Organization Name <span style={{ color: "#DC2626" }}>*</span></label>
                      <input type="text" required value={form.orgName} onChange={(e) => update("orgName", e.target.value)} placeholder="Acme Inc." style={inputStyle} {...focusHandlers} />
                    </div>
                    <div>
                      <label style={labelStyle}>Organization Type <span style={{ color: "#DC2626" }}>*</span></label>
                      <select required value={form.orgType} onChange={(e) => update("orgType", e.target.value)} style={{ ...inputStyle, appearance: "auto" }} {...focusHandlers}>
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
                      <label style={labelStyle}>Registered Email <span style={{ color: "#DC2626" }}>*</span></label>
                      <input type="email" required value={form.registeredEmail} onChange={(e) => update("registeredEmail", e.target.value)} placeholder="company@example.com" style={inputStyle} {...focusHandlers} />
                    </div>
                    <div>
                      <label style={labelStyle}>Phone Number <span style={{ color: "#DC2626" }}>*</span></label>
                      <input type="tel" required value={form.phone} onChange={(e) => update("phone", e.target.value)} placeholder="+1 (555) 123-4567" style={inputStyle} {...focusHandlers} />
                    </div>
                    <div>
                      <label style={labelStyle}>Tax / Registration Number <span style={{ color: "#DC2626" }}>*</span></label>
                      <input type="text" required value={form.taxNumber} onChange={(e) => update("taxNumber", e.target.value)} placeholder="GSTIN / VAT / EIN" style={inputStyle} {...focusHandlers} />
                    </div>
                  </div>

                  <div>
                    <label style={labelStyle}>Address <span style={{ color: "#DC2626" }}>*</span></label>
                    <textarea required value={form.address} onChange={(e) => update("address", e.target.value)} placeholder="123 Main St, Suite 100" rows={2} style={{ ...inputStyle, resize: "vertical", fontFamily: "inherit" }} {...focusHandlers} />
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "18px" }}>
                    <div>
                      <label style={labelStyle}>City</label>
                      <input type="text" value={form.city} onChange={(e) => update("city", e.target.value)} placeholder="New York" style={inputStyle} {...focusHandlers} />
                    </div>
                    <div>
                      <label style={labelStyle}>State / Province</label>
                      <select value={form.state} onChange={(e) => update("state", e.target.value)} disabled={countryStates.length === 0} style={{ ...inputStyle, appearance: "auto", cursor: countryStates.length === 0 ? "not-allowed" : "default" }} {...focusHandlers}>
                        <option value="">{countryStates.length === 0 ? "Select country first" : "Select state"}</option>
                        {countryStates.map((s) => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </div>
                    <div>
                      <label style={labelStyle}>Country <span style={{ color: "#DC2626" }}>*</span></label>
                      <select required value={form.country} onChange={(e) => handleCountryChange(e.target.value)} style={{ ...inputStyle, appearance: "auto" }} {...focusHandlers}>
                        <option value="">Select country</option>
                        {REGISTRATION_COUNTRIES.map((c) => <option key={c} value={c}>{c}</option>)}
                      </select>
                    </div>
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "18px" }}>
                    <div>
                      <label style={labelStyle}>Timezone</label>
                      <select value={form.timezone} onChange={(e) => update("timezone", e.target.value)} disabled={countryTimezones.length === 0} style={{ ...inputStyle, appearance: "auto", cursor: countryTimezones.length === 0 ? "not-allowed" : "default" }} {...focusHandlers}>
                        {countryTimezones.length === 0 ? (
                          <option value="">Select a country first</option>
                        ) : (
                          countryTimezones.map((tz) => <option key={tz} value={tz}>{tz}</option>)
                        )}
                      </select>
                    </div>
                    <div>
                      <label style={labelStyle}>Industry</label>
                      <input type="text" value={form.industry} onChange={(e) => update("industry", e.target.value)} placeholder="Technology" style={inputStyle} {...focusHandlers} />
                    </div>
                  </div>
                </>
              )}

              {step === 2 && (
                <>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "18px" }}>
                    <div>
                      <label style={labelStyle}>Admin Name <span style={{ color: "#DC2626" }}>*</span></label>
                      <input type="text" required value={form.adminName} onChange={(e) => update("adminName", e.target.value)} placeholder="Jane Doe" style={inputStyle} {...focusHandlers} />
                    </div>
                    <div>
                      <label style={labelStyle}>Admin Email <span style={{ color: "#DC2626" }}>*</span></label>
                      <input type="email" required value={form.adminEmail} onChange={(e) => update("adminEmail", e.target.value)} placeholder="admin@company.com" style={inputStyle} {...focusHandlers} />
                    </div>
                  </div>

                  <div>
                    <label style={labelStyle}>Password <span style={{ color: "#DC2626" }}>*</span></label>
                    <div style={{ position: "relative" }}>
                      <input
                        type={showPassword ? "text" : "password"}
                        required
                        minLength={8}
                        value={form.password}
                        onChange={(e) => update("password", e.target.value)}
                        placeholder="At least 8 characters"
                        style={{ ...inputStyle, padding: "11px 44px 11px 14px" }}
                        {...focusHandlers}
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword((v) => !v)}
                        style={{
                          position: "absolute", right: "12px", top: "50%", transform: "translateY(-50%)",
                          background: "none", border: "none", cursor: "pointer", color: "#9CA3AF", padding: 0,
                        }}
                        aria-label={showPassword ? "Hide password" : "Show password"}
                      >
                        {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
                      </button>
                    </div>
                  </div>

                  <div style={{ display: "flex", alignItems: "flex-start", gap: "10px" }}>
                    <input
                      id="termsAccepted"
                      type="checkbox"
                      required
                      checked={form.termsAccepted}
                      onChange={(e) => update("termsAccepted", e.target.checked)}
                      style={{ marginTop: "2px", width: "16px", height: "16px", flexShrink: 0, accentColor: "#3B82F6", cursor: "pointer" }}
                    />
                    <label htmlFor="termsAccepted" style={{ fontSize: "13px", color: "#374151", cursor: "pointer", lineHeight: "1.4" }}>
                      I accept the{" "}
                      <Link to="/terms" style={{ color: "#3B82F6", fontWeight: "600", textDecoration: "none" }}>
                        Terms & Conditions
                      </Link>
                    </label>
                  </div>

                  <div style={{ background: "#F9FAFB", borderRadius: "12px", padding: "16px 20px", border: "1px solid #F3F4F6" }}>
                    <p style={{ fontSize: "12px", fontWeight: "600", color: "#6B7280", margin: "0 0 10px 0", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                      Review
                    </p>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px 24px" }}>
                      <div>
                        <span style={{ fontSize: "11px", color: "#9CA3AF" }}>Organization</span>
                        <p style={{ fontSize: "13px", fontWeight: "600", color: "#111827", margin: 0 }}>{form.orgName || "\u2014"}</p>
                      </div>
                      <div>
                        <span style={{ fontSize: "11px", color: "#9CA3AF" }}>Plan</span>
                        <p style={{ fontSize: "13px", fontWeight: "600", color: "#111827", margin: 0 }}>{form.selectedPlan ? form.selectedPlan.charAt(0).toUpperCase() + form.selectedPlan.slice(1) : "\u2014"}</p>
                      </div>
                      <div>
                        <span style={{ fontSize: "11px", color: "#9CA3AF" }}>Admin Email</span>
                        <p style={{ fontSize: "13px", fontWeight: "600", color: "#111827", margin: 0 }}>{form.adminEmail || "\u2014"}</p>
                      </div>
                      <div>
                        <span style={{ fontSize: "11px", color: "#9CA3AF" }}>Country</span>
                        <p style={{ fontSize: "13px", fontWeight: "600", color: "#111827", margin: 0 }}>{form.country || "\u2014"}</p>
                      </div>
                    </div>
                    <p style={{ fontSize: "11px", color: "#6B7280", margin: "12px 0 0 0", lineHeight: "1.4" }}>
                      Your 14-day evaluation will begin once approved. No credit card required.
                    </p>
                  </div>
                </>
              )}

              <div style={{ display: "flex", gap: "12px", marginTop: "8px" }}>
                {step > 0 && (
                  <button
                    type="button"
                    onClick={goBack}
                    style={{
                      flex: "0 0 auto", padding: "13px 24px", borderRadius: "10px",
                      border: "1.5px solid #E5E7EB", background: "white",
                      fontSize: "14px", fontWeight: "600", color: "#374151",
                      cursor: "pointer", transition: "all 0.2s",
                    }}
                  >
                    Back
                  </button>
                )}
                {step < 2 ? (
                  <button
                    type="button"
                    onClick={goNext}
                    style={{
                      flex: 1, padding: "13px", borderRadius: "10px", border: "none",
                      fontSize: "15px", fontWeight: "700", color: "white",
                      background: "#3B82F6", cursor: "pointer",
                      boxShadow: "0 6px 20px rgba(59,130,246,0.35)",
                      display: "flex", alignItems: "center", justifyContent: "center", gap: "8px",
                      transition: "all 0.2s",
                    }}
                  >
                    Continue
                  </button>
                ) : (
                  <button
                    type="submit"
                    disabled={submitting}
                    style={{
                      flex: 1, padding: "13px", borderRadius: "10px", border: "none",
                      fontSize: "15px", fontWeight: "700", color: "white",
                      cursor: submitting ? "not-allowed" : "pointer",
                      background: submitting ? "#93C5FD" : "#3B82F6",
                      boxShadow: "0 6px 20px rgba(59,130,246,0.35)",
                      display: "flex", alignItems: "center", justifyContent: "center", gap: "8px",
                      transition: "all 0.2s",
                    }}
                  >
                    {submitting && <Loader2 size={16} style={{ animation: "spin 1s linear infinite" }} />}
                    {submitting ? "Starting evaluation..." : "Start Evaluation"}
                  </button>
                )}
              </div>
            </form>

            <p style={{ textAlign: "center", fontSize: "13px", color: "#6B7280", marginTop: "20px", marginBottom: 0 }}>
              Already have an account?{" "}
              <Link to="/login" style={{ color: "#3B82F6", fontWeight: "600", textDecoration: "none" }}>
                Sign in
              </Link>
            </p>
          </div>

          <p style={{ textAlign: "center", marginTop: "20px" }}>
            <Link to="/" style={{ fontSize: "13px", color: "#9CA3AF", textDecoration: "none" }}>
              Back to homepage
            </Link>
          </p>
        </div>
      </div>

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
      <Footer />
    </div>
  );
}
