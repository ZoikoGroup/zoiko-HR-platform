import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Eye, EyeOff } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { googleSignInEnabled, mfaEnrollStart, resendVerification } from "../../service/authService";
import { API_BASE_URL } from "../../service/api";
import { googleErrorMessage, readGoogleReturn, withoutGoogleParams } from "../../utils/googleSignIn";
import { realEmailError } from "../../utils/realEmail";

export default function LoginPage() {
  const { login, loginWithGoogle, confirmMfaEnrollment, error: authError, defaultRedirect } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = location.state?.from?.pathname || defaultRedirect;
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fieldErrors, setFieldErrors] = useState({});
  const [mfaStep, setMfaStep] = useState(null);
  const [mfaCode, setMfaCode] = useState("");
  const [enrollment, setEnrollment] = useState(null);
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [localError, setLocalError] = useState(null);
  const [googleReady, setGoogleReady] = useState(true);
  const [googleBusy, setGoogleBusy] = useState(false);
  const googleHandled = useRef(false);
  const [unconfirmed, setUnconfirmed] = useState(false);
  const [resendNote, setResendNote] = useState("");
  const [resending, setResending] = useState(false);

  async function sendNewConfirmation() {
    if (resending) return;
    setResending(true);
    try {
      const res = await resendVerification(email.trim());
      setResendNote(res?.message || "A new confirmation link has been sent.");
    } catch (err) {
      setResendNote(err?.message || "The link could not be sent. Please try again.");
    } finally {
      setResending(false);
    }
  }

  useEffect(() => {
    let alive = true;
    googleSignInEnabled().then((enabled) => { if (alive && enabled === false) setGoogleReady(false); });
    return () => { alive = false; };
  }, []);

  // Coming back from Google with the Back button restores this page from the browser's cache: un-stick the button.
  useEffect(() => {
    const restored = (e) => { if (e.persisted) setGoogleBusy(false); };
    window.addEventListener("pageshow", restored);
    return () => window.removeEventListener("pageshow", restored);
  }, []);

  useEffect(() => {
    if (googleHandled.current) return;
    const { ticket, error } = readGoogleReturn(location.search);
    if (!ticket && !error) return;
    googleHandled.current = true;
    navigate(`${location.pathname}${withoutGoogleParams(location.search)}`, { replace: true, state: location.state });
    if (error) { setLocalError(googleErrorMessage(error)); return; }
    setGoogleBusy(true);
    loginWithGoogle(ticket)
      .then(() => navigate(from, { replace: true }))
      .catch((err) => setLocalError(err?.message || googleErrorMessage("failed")))
      .finally(() => setGoogleBusy(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function startGoogle() {
    if (!googleReady || googleBusy) return;
    setLocalError(null);
    setGoogleBusy(true);
    window.location.href = `${API_BASE_URL}/auth/google/login`;
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setLocalError(null);
    setUnconfirmed(false);
    setResendNote("");
    const address = email.trim();
    const problems = {};
    if (!address) problems.email = "Enter your email address.";
    else if (realEmailError(address)) problems.email = realEmailError(address);
    if (!password) problems.password = "Enter your password.";
    setFieldErrors(problems);
    if (Object.keys(problems).length) return;
    if (mfaStep && !/^\d{6}$/.test(mfaCode.trim())) {
      setFieldErrors({ mfa: "Enter the 6-digit code from your authenticator app." });
      return;
    }
    setSubmitting(true);
    try {
      if (mfaStep === "enroll") await confirmMfaEnrollment({ email: address, password, code: mfaCode.trim() });
      else await login(mfaStep === "code" ? { email: address, password, mfaCode: mfaCode.trim() } : { email: address, password });
      navigate(from, { replace: true });
    } catch (err) {
      if (err?.code === "MFA_REQUIRED") {
        setMfaStep("code");
        setMfaCode("");
        setLocalError(null);
      } else if (err?.code === "MFA_ENROLLMENT_REQUIRED") {
        try {
          setEnrollment(await mfaEnrollStart({ email: address, password }));
          setMfaStep("enroll");
          setMfaCode("");
          setLocalError(null);
        } catch (startErr) {
          setLocalError(startErr.message || "The authenticator could not be set up. Please try again.");
        }
      } else {
        if (err?.code === "MFA_INVALID") setMfaCode("");
        setUnconfirmed(err?.code === "EMAIL_NOT_VERIFIED");
        setLocalError(err.message || "Unable to sign in. Please check your credentials.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  const errorMsg = localError || authError;

  return (
    <main className="login-page">
      <section className="login-hero" aria-label="About Zoiko HR">
        <picture>
          <source
            srcSet="/zoiko-login-hero-760.webp 760w, /zoiko-login-hero.webp 1276w"
            sizes="(max-width: 900px) 100vw, 52vw"
            type="image/webp"
          />
          <img
            src="/zoiko-login-hero.jpg"
            alt="Zoiko HR: People today. A stronger tomorrow. A modern HR platform for a global workforce."
            className="login-hero-image"
            width="1276"
            height="1536"
            loading="eager"
            fetchPriority="high"
            decoding="async"
          />
        </picture>
      </section>

      <section className="login-panel">
        <div className="login-shell">
          <div className="login-card">
            <nav className="auth-tabs" aria-label="Account options">
              <Link to="/login" className="auth-tab active" aria-current="page">Login</Link>
              <Link to="/register" className="auth-tab">Register</Link>
              <Link to="/forgot-password" className="auth-tab">Reset Password</Link>
            </nav>
            <div className="login-form-card">
            <h1>Welcome back!</h1>
            <p className="login-subtitle">Sign in to your Zoiko HR account.</p>

            {errorMsg && <div role="alert" className="login-alert"><span aria-hidden="true">●</span><span>{errorMsg}</span></div>}
            {unconfirmed && (
              <div className="verification-note">
                {resendNote ? <p role="status">{resendNote}</p> : (
                  <button type="button" onClick={sendNewConfirmation} disabled={resending}>
                    {resending ? "Sending..." : "Send me a new confirmation email"}
                  </button>
                )}
              </div>
            )}

            <form className="login-form" onSubmit={handleSubmit} noValidate autoComplete="on">
              <div className="login-field">
                <label htmlFor="login-email">Email address</label>
                <input
                  id="login-email"
                  name="email"
                  type="email"
                  value={email}
                  aria-invalid={fieldErrors.email ? "true" : undefined}
                  aria-describedby={fieldErrors.email ? "login-email-error" : undefined}
                  onChange={(e) => { setEmail(e.target.value); if (fieldErrors.email) setFieldErrors((f) => ({ ...f, email: undefined })); }}
                  placeholder="name@company.com"
                  autoComplete="email"
                />
                {fieldErrors.email && <p id="login-email-error" role="alert" className="field-error">{fieldErrors.email}</p>}
              </div>

              <div className="login-field">
                <label htmlFor="login-password">Password</label>
                <div className="password-input-wrap">
                  <input
                    id="login-password"
                    name="password"
                    type={showPassword ? "text" : "password"}
                    value={password}
                    aria-invalid={fieldErrors.password ? "true" : undefined}
                    onChange={(e) => { setPassword(e.target.value); if (fieldErrors.password) setFieldErrors((f) => ({ ...f, password: undefined })); }}
                    placeholder="Enter your password"
                    autoComplete="current-password"
                  />
                  <button type="button" className="password-toggle" onClick={() => setShowPassword(!showPassword)} aria-label={showPassword ? "Hide password" : "Show password"}>
                    {showPassword ? <EyeOff /> : <Eye />}
                  </button>
                </div>
                {fieldErrors.password && <p role="alert" className="field-error">{fieldErrors.password}</p>}
              </div>

              {mfaStep === "enroll" && enrollment && (
                <div className="mfa-enroll-note" data-testid="mfa-enroll">
                  <p className="font-semibold">Set up your authenticator app</p>
                  <p>Platform accounts need a second step. In your authenticator app, add an account with this key, then enter the 6-digit code it shows.</p>
                  <p className="mfa-secret" aria-label="Authenticator key">{enrollment.secret}</p>
                  <a href={enrollment.otpauth_uri}>Open in my authenticator app</a>
                </div>
              )}

              {mfaStep && (
                <div className="login-field">
                  <label htmlFor="login-mfa">Authenticator code</label>
                  <input
                    id="login-mfa"
                    name="one-time-code"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    maxLength={6}
                    autoFocus
                    value={mfaCode}
                    aria-invalid={fieldErrors.mfa ? "true" : undefined}
                    aria-describedby={fieldErrors.mfa ? "login-mfa-error" : undefined}
                    onChange={(e) => { setMfaCode(e.target.value.replace(/\D/g, "")); if (fieldErrors.mfa) setFieldErrors((f) => ({ ...f, mfa: undefined })); }}
                    placeholder="123456"
                  />
                  {fieldErrors.mfa && <p id="login-mfa-error" role="alert" className="field-error">{fieldErrors.mfa}</p>}
                </div>
              )}

              <div className="login-options">
                <label className="remember-option">
                  <input type="checkbox" checked={rememberMe} onChange={(e) => setRememberMe(e.target.checked)} />
                  <span>Remember me for 30 days</span>
                </label>
                <Link to="/forgot-password">Forgot password?</Link>
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="login-submit"
                aria-label={mfaStep === "enroll" ? "Confirm and sign in" : "Sign In"}
              >
                {submitting ? "Signing in…" : mfaStep === "enroll" ? "Confirm and sign in" : "Log In"}
              </button>
            </form>

            <div className="login-divider"><span />or continue with<span /></div>
            <div className="social-login-options">
              <button
                type="button"
                onClick={startGoogle}
                disabled={!googleReady || googleBusy}
                title={googleReady ? undefined : "Sign in with Google is not set up for this site yet"}
                className="social-login google-login"
              >
                <svg aria-hidden="true" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18A11 11 0 0 0 1 12c0 1.78.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/>
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
                </svg>
                <span>{googleBusy ? "Connecting to Google…" : "Continue with Google"}</span><b aria-hidden="true">›</b>
              </button>
              {!googleReady && <p role="note" className="google-unavailable">Sign in with Google is not set up for this site yet. Use your email and password.</p>}
            </div>

              <p className="register-prompt">New to Zoiko HR? <Link to="/register">Register</Link></p>
            </div>
          </div>
          <footer className="login-footer">
            <nav aria-label="Legal links">
              <a href="mailto:privacy@zoiko.com">Privacy</a><span>•</span><Link to="/terms">Terms</Link><span>•</span><a href="mailto:accessibility@zoiko.com">Accessibility</a><span>•</span><a href="mailto:support@zoiko.com">Help</a>
            </nav>
            <span>© 2026 Zoiko Tech Inc.</span>
          </footer>
        </div>
      </section>
    </main>
  );
}
