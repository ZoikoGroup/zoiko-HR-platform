import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Loader2, AlertCircle, CheckCircle2, Eye, EyeOff } from "lucide-react";
import { resetPasswordWithToken } from "../../service/authService";
import { passwordProblem, PASSWORD_HINT } from "../../utils/passwordPolicy";
import LandingHeader from "../../landing/LandingHeader";
import Footer from "../../landing/Footer";

const inputStyle = {
  width: "100%", padding: "11px 44px 11px 14px", borderRadius: "8px", border: "1.5px solid #E5E7EB",
  fontSize: "14px", color: "#111827", outline: "none", boxSizing: "border-box", background: "white", fontFamily: "inherit",
};

/**
 * The page an emailed "reset your password" link opens. The link carries a single-use token; the person chooses a new
 * password here. It talks to the API through the app's own configured address, so it works wherever the app works.
 */
export default function ResetPasswordPage() {
  const [params] = useSearchParams();
  const token = params.get("token") || "";
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [errors, setErrors] = useState({});
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState(false);
  const [linkProblem, setLinkProblem] = useState(!token);

  async function submit(e) {
    e.preventDefault();
    if (pending) return;
    const problems = {};
    const policy = passwordProblem(password);
    if (policy) problems.password = policy;
    if (!confirm) problems.confirm = "Re-enter the new password.";
    else if (confirm !== password) problems.confirm = "The two passwords do not match.";
    setErrors(problems);
    if (Object.keys(problems).length) return;
    setPending(true);
    try {
      await resetPasswordWithToken({ token, password });
      setDone(true);
    } catch (err) {
      const status = err?.status;
      const message = err?.message || "";
      if (status === 400 && /no longer valid|invalid|expired/i.test(message)) setLinkProblem(true);
      else setErrors({ submit: message || "The password could not be changed. Please try again." });
    } finally {
      setPending(false);
    }
  }

  const card = (children) => (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif", background: "#ffffff" }}>
      <LandingHeader />
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: "48px 24px" }}>
        <div style={{ width: "100%", maxWidth: "420px" }}>{children}</div>
      </div>
      <Footer />
    </div>
  );

  if (done) {
    return card(
      <div style={{ textAlign: "center" }}>
        <CheckCircle2 size={44} color="#059669" style={{ margin: "0 auto 14px" }} />
        <h1 style={{ fontSize: "22px", fontWeight: 800, color: "#0F172A", margin: "0 0 8px" }}>Your password has been changed</h1>
        <p style={{ fontSize: "14px", color: "#6B7280", lineHeight: 1.6, margin: "0 0 24px" }}>You have been signed out everywhere. Sign in with your new password.</p>
        <Link to="/login" style={{ display: "inline-block", background: "#2563EB", color: "#fff", padding: "11px 28px", borderRadius: "10px", fontWeight: 700, fontSize: "14px", textDecoration: "none" }}>Go to sign in</Link>
      </div>
    );
  }

  if (linkProblem) {
    return card(
      <div style={{ textAlign: "center" }}>
        <AlertCircle size={44} color="#DC2626" style={{ margin: "0 auto 14px" }} />
        <h1 style={{ fontSize: "22px", fontWeight: 800, color: "#0F172A", margin: "0 0 8px" }}>This link is no longer valid</h1>
        <p style={{ fontSize: "14px", color: "#6B7280", lineHeight: 1.6, margin: "0 0 24px" }}>Reset links work once and expire after 60 minutes. Ask for a new one, or ask your administrator to send you another.</p>
        <Link to="/forgot-password" style={{ display: "inline-block", background: "#2563EB", color: "#fff", padding: "11px 28px", borderRadius: "10px", fontWeight: 700, fontSize: "14px", textDecoration: "none" }}>Request a new link</Link>
      </div>
    );
  }

  return card(
    <form onSubmit={submit} noValidate>
      <h1 style={{ fontSize: "24px", fontWeight: 800, color: "#0F172A", margin: "0 0 8px", letterSpacing: "-0.5px" }}>Choose a new password</h1>
      <p style={{ fontSize: "14px", color: "#6B7280", lineHeight: 1.6, margin: "0 0 24px" }}>{PASSWORD_HINT} Pick one you have not used for this account before.</p>

      {errors.submit && (
        <div role="alert" style={{ display: "flex", gap: "8px", background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: "8px", padding: "12px 14px", marginBottom: "18px" }}>
          <AlertCircle size={15} color="#DC2626" style={{ marginTop: "1px", flexShrink: 0 }} />
          <span style={{ fontSize: "13px", color: "#DC2626" }}>{errors.submit}</span>
        </div>
      )}

      <label htmlFor="rp-password" style={{ display: "block", fontSize: "13px", fontWeight: 500, color: "#374151", marginBottom: "6px" }}>New password</label>
      <div style={{ position: "relative", marginBottom: errors.password ? "4px" : "16px" }}>
        <input id="rp-password" type={show ? "text" : "password"} autoComplete="new-password" value={password} aria-invalid={!!errors.password}
          onChange={(e) => { setPassword(e.target.value); setErrors((p) => ({ ...p, password: undefined, submit: undefined })); }} style={inputStyle} />
        <button type="button" aria-label={show ? "Hide password" : "Show password"} onClick={() => setShow((v) => !v)}
          style={{ position: "absolute", right: "10px", top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: "#6B7280" }}>
          {show ? <EyeOff size={16} /> : <Eye size={16} />}
        </button>
      </div>
      {errors.password && <p role="alert" style={{ color: "#DC2626", fontSize: "12px", margin: "0 0 14px" }}>{errors.password}</p>}

      <label htmlFor="rp-confirm" style={{ display: "block", fontSize: "13px", fontWeight: 500, color: "#374151", marginBottom: "6px" }}>Confirm new password</label>
      <input id="rp-confirm" type={show ? "text" : "password"} autoComplete="new-password" value={confirm} aria-invalid={!!errors.confirm}
        onChange={(e) => { setConfirm(e.target.value); setErrors((p) => ({ ...p, confirm: undefined, submit: undefined })); }}
        style={{ ...inputStyle, marginBottom: errors.confirm ? "4px" : "20px" }} />
      {errors.confirm && <p role="alert" style={{ color: "#DC2626", fontSize: "12px", margin: "0 0 16px" }}>{errors.confirm}</p>}

      <button type="submit" disabled={pending}
        style={{ width: "100%", background: "#2563EB", color: "#fff", padding: "12px", border: "none", borderRadius: "10px", fontSize: "15px", fontWeight: 700, cursor: pending ? "default" : "pointer", opacity: pending ? 0.7 : 1, display: "flex", alignItems: "center", justifyContent: "center", gap: "8px" }}>
        {pending ? <><Loader2 size={16} className="animate-spin" /> Saving...</> : "Set new password"}
      </button>
    </form>
  );
}
