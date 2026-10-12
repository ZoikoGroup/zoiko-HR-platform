import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Loader2, AlertCircle, CheckCircle2, MailCheck } from "lucide-react";
import { verifyEmail, resendVerification } from "../../service/authService";
import { realEmailError } from "../../utils/realEmail";
import LandingHeader from "../../landing/LandingHeader";
import Footer from "../../landing/Footer";

const button = { display: "inline-block", background: "#2563EB", color: "#fff", padding: "11px 28px", borderRadius: "10px", fontWeight: 700, fontSize: "14px", textDecoration: "none", border: "none", cursor: "pointer" };

/**
 * The page the "Confirm my email address" link opens. It confirms the address straight away (one click is all it takes) and
 * then sends the person to sign in. A link that no longer works offers to send a new one.
 */
export default function VerifyEmailPage() {
  const [params] = useSearchParams();
  const token = params.get("token") || "";
  const [state, setState] = useState(token ? "working" : "problem");
  const [message, setMessage] = useState("");
  const [email, setEmail] = useState("");
  const [emailError, setEmailError] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState("");
  const started = useRef(false);

  useEffect(() => {
    if (!token || started.current) return;
    started.current = true;
    verifyEmail(token)
      .then(() => setState("done"))
      .catch((err) => { setMessage(err?.message || ""); setState("problem"); });
  }, [token]);

  async function sendNew(e) {
    e.preventDefault();
    if (sending) return;
    const problem = !email.trim() ? "Enter the email address you signed up with." : realEmailError(email);
    setEmailError(problem);
    if (problem) return;
    setSending(true);
    try {
      const res = await resendVerification(email.trim());
      setSent(res?.message || "A new confirmation link has been sent.");
    } catch (err) {
      setEmailError(err?.message || "The link could not be sent. Please try again.");
    } finally {
      setSending(false);
    }
  }

  const card = (children) => (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif", background: "#ffffff" }}>
      <LandingHeader />
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: "48px 24px" }}>
        <div style={{ width: "100%", maxWidth: "440px", textAlign: "center" }}>{children}</div>
      </div>
      <Footer />
    </div>
  );

  if (state === "working") {
    return card(
      <div role="status">
        <Loader2 size={40} color="#2563EB" className="animate-spin" style={{ margin: "0 auto 14px" }} />
        <h1 style={{ fontSize: "20px", fontWeight: 800, color: "#0F172A", margin: 0 }}>Confirming your email address...</h1>
      </div>
    );
  }

  if (state === "done") {
    return card(
      <div>
        <CheckCircle2 size={46} color="#059669" style={{ margin: "0 auto 14px" }} />
        <h1 style={{ fontSize: "22px", fontWeight: 800, color: "#0F172A", margin: "0 0 8px" }}>Your email address is confirmed</h1>
        <p style={{ fontSize: "14px", color: "#6B7280", lineHeight: 1.6, margin: "0 0 24px" }}>Thank you. You can now sign in to Zoiko HR.</p>
        <Link to="/login" style={button}>Sign in</Link>
      </div>
    );
  }

  return card(
    <div>
      <AlertCircle size={46} color="#DC2626" style={{ margin: "0 auto 14px" }} />
      <h1 style={{ fontSize: "22px", fontWeight: 800, color: "#0F172A", margin: "0 0 8px" }}>This confirmation link no longer works</h1>
      <p style={{ fontSize: "14px", color: "#6B7280", lineHeight: 1.6, margin: "0 0 22px" }}>
        {message || "The link has already been used, has expired, or was replaced by a newer one."} Enter your email address and we will send a new one.
      </p>
      {sent ? (
        <div role="status" style={{ background: "#ECFDF5", border: "1px solid #A7F3D0", borderRadius: "10px", padding: "14px", fontSize: "13px", color: "#047857", display: "flex", gap: "8px", textAlign: "left" }}>
          <MailCheck size={18} style={{ flexShrink: 0 }} /> <span>{sent}</span>
        </div>
      ) : (
        <form onSubmit={sendNew} noValidate style={{ textAlign: "left" }}>
          <label htmlFor="ve-email" style={{ display: "block", fontSize: "13px", fontWeight: 500, color: "#374151", marginBottom: "6px" }}>Email address</label>
          <input id="ve-email" type="email" autoComplete="email" value={email} aria-invalid={!!emailError}
            onChange={(e) => { setEmail(e.target.value); setEmailError(""); }}
            style={{ width: "100%", padding: "11px 14px", borderRadius: "8px", border: `1.5px solid ${emailError ? "#F87171" : "#E5E7EB"}`, fontSize: "14px", boxSizing: "border-box" }} />
          {emailError && <p role="alert" style={{ color: "#DC2626", fontSize: "12px", margin: "6px 0 0" }}>{emailError}</p>}
          <button type="submit" disabled={sending} style={{ ...button, width: "100%", marginTop: "16px", opacity: sending ? 0.7 : 1 }}>
            {sending ? "Sending..." : "Send me a new link"}
          </button>
        </form>
      )}
      <p style={{ marginTop: "22px", fontSize: "13px" }}><Link to="/login" style={{ color: "#2563EB", fontWeight: 600, textDecoration: "none" }}>Back to sign in</Link></p>
    </div>
  );
}
