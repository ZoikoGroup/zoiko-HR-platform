import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Loader2, AlertCircle, CheckCircle2, ArrowLeft } from "lucide-react";
import { forgotPassword } from "../../service/authService";
import LandingHeader from "../../landing/LandingHeader";
import Footer from "../../landing/Footer";

const RESEND_SECONDS = 60;

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [sent, setSent] = useState(false);
  const [wait, setWait] = useState(0);          // seconds until another link may be requested (the server sends one a minute)
  const [resent, setResent] = useState(false);

  useEffect(() => {
    if (wait <= 0) return undefined;
    const t = setTimeout(() => setWait((w) => w - 1), 1000);
    return () => clearTimeout(t);
  }, [wait]);

  async function request({ again = false } = {}) {
    const address = email.trim();
    if (!address) { setError("Enter your email address."); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)) { setError("Enter a valid email address, like you@company.com."); return; }
    setError(null);
    setSubmitting(true);
    try {
      await forgotPassword({ email: address });
      setEmail(address);
      setSent(true);
      setResent(again);
      setWait(RESEND_SECONDS);
    } catch (err) {
      setError(err?.status === 429
        ? "Too many requests. Please wait a minute and try again."
        : err.message || "Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  function handleSubmit(e) {
    e.preventDefault();
    request();
  }

  const inputStyle = {
    width: "100%",
    padding: "11px 14px",
    borderRadius: "8px",
    border: "1.5px solid #E5E7EB",
    fontSize: "14px",
    color: "#111827",
    outline: "none",
    boxSizing: "border-box",
    background: "white",
    fontFamily: "inherit",
  };

  return (
    <div style={{
      minHeight: "100vh",
      display: "flex",
      flexDirection: "column",
      fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
      background: "#ffffff",
    }}>
      <LandingHeader />
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: "48px 24px" }}>
        <div style={{ width: "100%", maxWidth: "420px" }}>
          {!sent ? (
            <>
              <h1 style={{ fontSize: "24px", fontWeight: "800", color: "#0F172A", margin: "0 0 8px 0", letterSpacing: "-0.5px" }}>
                Forgot your password?
              </h1>
              <p style={{ fontSize: "14px", color: "#6B7280", lineHeight: "1.6", margin: "0 0 28px 0" }}>
                Enter the email address registered to your account and we'll send you a secure link to reset your password.
              </p>

              {error && (
                <div style={{
                  display: "flex", alignItems: "flex-start", gap: "8px",
                  background: "#FEF2F2", border: "1px solid #FECACA",
                  borderRadius: "8px", padding: "12px 14px", marginBottom: "20px"
                }}>
                  <AlertCircle size={15} color="#DC2626" style={{ marginTop: "1px", flexShrink: 0 }} />
                  <span style={{ fontSize: "13px", color: "#DC2626" }}>{error}</span>
                </div>
              )}

              <form onSubmit={handleSubmit} noValidate style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                <div>
                  <label htmlFor="email" style={{ display: "block", fontSize: "13px", fontWeight: "500", color: "#374151", marginBottom: "6px" }}>
                    Email address
                  </label>
                  <input
                    id="email" type="email" autoComplete="email"
                    value={email} onChange={e => setEmail(e.target.value)}
                    placeholder="you@company.com"
                    style={inputStyle}
                    onFocus={e => e.target.style.borderColor = "#3B82F6"}
                    onBlur={e => e.target.style.borderColor = "#E5E7EB"}
                  />
                </div>

                <button type="submit" disabled={submitting}
                  style={{
                    width: "100%", padding: "13px", borderRadius: "50px", border: "none",
                    fontSize: "15px", fontWeight: "600", color: "white",
                    cursor: submitting ? "not-allowed" : "pointer",
                    background: submitting ? "#93C5FD" : "#3B82F6",
                    boxShadow: "0 4px 16px rgba(59,130,246,0.4)",
                    display: "flex", alignItems: "center", justifyContent: "center", gap: "8px",
                    marginTop: "4px", letterSpacing: "0.01em",
                  }}>
                  {submitting && <Loader2 size={16} style={{ animation: "spin 1s linear infinite" }} />}
                  {submitting ? "Sending…" : "Send reset link"}
                </button>
              </form>
            </>
          ) : (
            <div style={{ textAlign: "center", padding: "8px 0" }}>
              <CheckCircle2 size={40} color="#059669" style={{ margin: "0 auto 16px" }} />
              <h1 style={{ fontSize: "22px", fontWeight: "800", color: "#0F172A", margin: "0 0 8px 0", letterSpacing: "-0.5px" }}>
                Check your email
              </h1>
              <p style={{ fontSize: "14px", color: "#6B7280", lineHeight: "1.7", margin: "0 0 8px 0" }}>
                If an account exists for <strong>{email}</strong>, a password reset link has been sent.
              </p>
              <p style={{ fontSize: "13px", color: "#9CA3AF", margin: "0 0 24px 0" }}>
                The link expires in 60 minutes.
              </p>
              {error && <p role="alert" style={{ fontSize: "13px", color: "#DC2626", margin: "0 0 12px" }}>{error}</p>}
              {resent && !error && <p role="status" style={{ fontSize: "13px", color: "#059669", margin: "0 0 12px" }}>We asked for another email. It can take a minute to arrive; check spam too.</p>}
              <button type="button" onClick={() => request({ again: true })} disabled={wait > 0 || submitting}
                style={{
                  display: "block", margin: "0 auto 14px", padding: "9px 20px", borderRadius: "50px", border: "1.5px solid #3B82F6",
                  background: "white", cursor: wait > 0 || submitting ? "not-allowed" : "pointer", opacity: wait > 0 || submitting ? 0.55 : 1,
                  fontSize: "13px", color: "#2563EB", fontWeight: "600", fontFamily: "inherit",
                }}>
                {submitting ? "Sending…" : wait > 0 ? `Send it again in ${wait}s` : "Send it again"}
              </button>
              <button type="button" onClick={() => { setSent(false); setEmail(""); setError(null); setWait(0); setResent(false); }}
                style={{
                  background: "none", border: "none", cursor: "pointer",
                  fontSize: "13px", color: "#3B82F6", fontWeight: "600", fontFamily: "inherit",
                }}>
                Use a different email
              </button>
            </div>
          )}

          <div style={{ textAlign: "center", marginTop: "24px" }}>
            <Link to="/login"
              style={{
                display: "inline-flex", alignItems: "center", gap: "6px",
                fontSize: "13px", color: "#374151", textDecoration: "none", fontWeight: "500",
              }}>
              <ArrowLeft size={14} />
              Back to sign in
            </Link>
          </div>
        </div>
      </div>
      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
      <Footer />
    </div>
  );
}
