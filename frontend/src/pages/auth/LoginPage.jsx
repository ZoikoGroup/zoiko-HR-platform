import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { ChevronRight } from "lucide-react";
import PasswordInput from "../../components/PasswordInput";
import { useAuth } from "../../context/AuthContext";
import { googleSignInEnabled, mfaEnrollStart, resendVerification } from "../../service/authService";
import { API_BASE_URL } from "../../service/api";
import { googleErrorMessage, googleExchangeMessage, googleLoginUrl, readGoogleReturn, withoutGoogleParams } from "../../utils/googleSignIn";
import { realEmailError } from "../../utils/realEmail";
import { ROLE_DEFAULT_REDIRECT } from "../../config/roles";
import "./LoginPage.css";

export default function LoginPage() {
  const { login, loginWithGoogle, confirmMfaEnrollment, error: authError, defaultRedirect } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = location.state?.from?.pathname || null;
  // A1: where to go once signed in. The page a guard sent the person away from, else the home of the role the server just
  // returned (defaultRedirect is computed before anyone is signed in, so it cannot know the role yet). A temporary
  // password goes to the screen that replaces it.
  const destinationFor = (signedIn) => {
    if (signedIn?.mustChangePassword || signedIn?.must_change_password) return "/change-password";
    return from || ROLE_DEFAULT_REDIRECT[signedIn?.role] || defaultRedirect;
  };
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fieldErrors, setFieldErrors] = useState({});
  const [mfaStep, setMfaStep] = useState(null);
  const [mfaCode, setMfaCode] = useState("");
  const [enrollment, setEnrollment] = useState(null);
  const [rememberMe, setRememberMe] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [localError, setLocalError] = useState(null);
  const [googleReady, setGoogleReady] = useState(true);
  const [googleBusy, setGoogleBusy] = useState(false);
  const googleHandled = useRef(false);
  const [providerNote, setProviderNote] = useState("");
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
      .then((signedIn) => navigate(destinationFor(signedIn), { replace: true }))
      .catch((err) => setLocalError(googleExchangeMessage(err)))
      .finally(() => setGoogleBusy(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Microsoft, Apple and company SSO have no server side yet: say so instead of pretending to start a sign-in.
  function providerUnavailable(name) {
    setProviderNote(`Sign in with ${name} is not available yet. Use Google or your email and password.`);
  }

  function startGoogle() {
    if (!googleReady || googleBusy) return;
    setProviderNote("");
    setLocalError(null);
    setGoogleBusy(true);
    // return_to: the server sends the browser back to this app (checked against its allow-list), not to a configured default
    window.location.href = googleLoginUrl(API_BASE_URL, window.location.origin);
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
      const signedIn = mfaStep === "enroll"
        ? await confirmMfaEnrollment({ email: address, password, code: mfaCode.trim() })
        : await login(mfaStep === "code" ? { email: address, password, mfaCode: mfaCode.trim() } : { email: address, password });
      navigate(destinationFor(signedIn), { replace: true });
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
      <div className="login-frame">
        <section className="login-hero" aria-label="About Zoiko HR">
          <picture>
            <source
              srcSet="/zoiko-login-hero-760.webp 760w, /zoiko-login-hero.webp 808w, /zoiko-login-hero-2x.webp 1616w"
              sizes="(max-width: 900px) 100vw, 49vw"
              type="image/webp"
            />
            <img
              src="/zoiko-login-hero.jpg"
              alt="Zoiko HR: People today. A stronger tomorrow. A modern HR platform for a global workforce."
              className="login-hero-image"
              width="808"
              height="1024"
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

              <div className="social-login-options">
                <button type="button" className="social-login" onClick={() => providerUnavailable("Microsoft")}>
                  <svg aria-hidden="true" viewBox="0 0 24 24">
                    <rect x="1" y="1" width="10.5" height="10.5" fill="#F25022" />
                    <rect x="12.5" y="1" width="10.5" height="10.5" fill="#7FBA00" />
                    <rect x="1" y="12.5" width="10.5" height="10.5" fill="#00A4EF" />
                    <rect x="12.5" y="12.5" width="10.5" height="10.5" fill="#FFB900" />
                  </svg>
                  <span>Continue with Microsoft</span><ChevronRight aria-hidden="true" />
                </button>
                <button
                  type="button"
                  onClick={startGoogle}
                  disabled={!googleReady || googleBusy}
                  title={googleReady ? undefined : "Sign in with Google is not set up for this site yet"}
                  className="social-login google-login"
                >
                  <svg aria-hidden="true" className="google-icon" viewBox="0 0 24 24">
                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18A11 11 0 0 0 1 12c0 1.78.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/>
                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
                  </svg>
                  <span>{googleBusy ? "Connecting to Google…" : "Continue with Google"}</span><ChevronRight aria-hidden="true" />
                </button>
                <button type="button" className="social-login" onClick={() => providerUnavailable("Apple")}>
                  <svg aria-hidden="true" className="apple-icon" viewBox="0 0 24 24">
                    <path fill="#000" d="M16.37 12.6c-.03-2.6 2.13-3.86 2.22-3.92-1.21-1.77-3.1-2.01-3.77-2.04-1.6-.16-3.13.95-3.94.95-.82 0-2.07-.93-3.4-.9-1.75.03-3.37 1.02-4.27 2.58-1.82 3.16-.47 7.84 1.31 10.4.87 1.25 1.9 2.66 3.26 2.61 1.31-.05 1.8-.85 3.38-.85 1.58 0 2.02.85 3.4.82 1.41-.02 2.3-1.27 3.16-2.53.99-1.45 1.4-2.86 1.43-2.93-.03-.01-2.74-1.05-2.78-4.19zM13.78 4.97c.72-.88 1.21-2.09 1.08-3.31-1.04.04-2.31.7-3.05 1.57-.67.77-1.26 2.01-1.1 3.2 1.16.09 2.35-.59 3.07-1.46z"/>
                  </svg>
                  <span>Continue with Apple</span><ChevronRight aria-hidden="true" />
                </button>
                <button type="button" className="social-login" onClick={() => providerUnavailable("Company SSO")}>
                  <svg aria-hidden="true" className="sso-icon" viewBox="0 0 32 34" fill="none">
                    <rect x="1.75" y="1.75" width="17" height="29.6" rx="3" stroke="currentColor" strokeWidth="3.5" />
                    <path d="M18.75 11.85h7.5a3 3 0 0 1 3 3v13.5a3 3 0 0 1-3 3h-7.5" stroke="currentColor" strokeWidth="3.5" strokeLinejoin="round" />
                    <g fill="currentColor">
                      <rect x="6.45" y="7.2" width="2.6" height="2.6" /><rect x="10.7" y="7.2" width="2.6" height="2.6" />
                      <rect x="6.45" y="12.6" width="2.6" height="2.6" /><rect x="10.7" y="12.6" width="2.6" height="2.6" />
                      <rect x="6.45" y="18.2" width="2.6" height="2.6" /><rect x="10.7" y="18.2" width="2.6" height="2.6" />
                      <rect x="21.45" y="16.2" width="2.6" height="2.6" /><rect x="21.45" y="22.6" width="2.6" height="2.6" />
                      <rect x="8.6" y="24.5" width="2.6" height="7" />
                    </g>
                  </svg>
                  <span>Continue with Company SSO</span><ChevronRight aria-hidden="true" />
                </button>
                {!googleReady && <p role="note" className="google-unavailable">Sign in with Google is not set up for this site yet. Use your email and password.</p>}
                {providerNote && <p role="status" className="provider-note">{providerNote}</p>}
              </div>

              <div className="login-divider"><span />or sign in with email<span /></div>

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
                  <PasswordInput
                    wrapperClassName="password-input-wrap"
                    toggleClassName="password-toggle"
                    id="login-password"
                    name="password"
                    value={password}
                    aria-invalid={fieldErrors.password ? "true" : undefined}
                    onChange={(e) => { setPassword(e.target.value); if (fieldErrors.password) setFieldErrors((f) => ({ ...f, password: undefined })); }}
                    placeholder="Enter your password"
                    autoComplete="current-password"
                    iconSize={20}
                  />
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
      </div>
    </main>
  );
}
