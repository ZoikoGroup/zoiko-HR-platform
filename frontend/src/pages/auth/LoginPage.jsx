import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { googleSignInEnabled, resendVerification } from "../../service/authService";
import { API_BASE_URL } from "../../service/api";
import { googleErrorMessage, readGoogleReturn, withoutGoogleParams } from "../../utils/googleSignIn";
import logo from "../../assets/zoikohr-logo-svg.svg";

export default function LoginPage() {
  const { login, loginWithGoogle, error: authError, defaultRedirect } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = location.state?.from?.pathname || defaultRedirect;

  // Demo credentials only ever prefill in a dev server build (`import.meta.env.DEV`);
  // a production build ignores these vars even if a deploy platform sets them,
  // so a default admin login can never ship in the bundle users download.
  const [email, setEmail] = useState(
    import.meta.env.DEV ? import.meta.env.VITE_DEFAULT_EMAIL || "" : ""
  );
  const [password, setPassword] = useState(
    import.meta.env.DEV ? import.meta.env.VITE_DEFAULT_PASSWORD || "" : ""
  );
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [localError, setLocalError] = useState(null);
  const [googleReady, setGoogleReady] = useState(true);      // optimistic until the server answers
  const [googleBusy, setGoogleBusy] = useState(false);
  const googleHandled = useRef(false);
  const [unconfirmed, setUnconfirmed] = useState(false);       // the password was right but the email address is not confirmed yet
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

  // Is Sign in with Google set up on this server?
  useEffect(() => {
    let alive = true;
    googleSignInEnabled().then((enabled) => { if (alive) setGoogleReady(enabled); });
    return () => { alive = false; };
  }, []);

  // Google sends the person back here: a one-time ticket (finish signing in) or a reason it did not work.
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
    setSubmitting(true);
    try {
      await login({ email, password });
      navigate(from, { replace: true });
    } catch (err) {
      setUnconfirmed(err?.code === "EMAIL_NOT_VERIFIED");
      setLocalError(err.message || "Unable to sign in. Please check your credentials.");
    } finally {
      setSubmitting(false);
    }
  }

  const errorMsg = localError || authError;

  return (
    <div className="min-h-screen flex flex-col font-sans bg-white text-slate-800">
      {/* ---------------- TOP NAVBAR ---------------- */}
      <header className="w-full flex items-center justify-between px-6 sm:px-8 lg:px-12 py-4 border-b border-slate-100 bg-white">
        <Link to="/" className="flex items-center cursor-pointer">
          <img src={logo} alt="Zoiko HR" className="h-9 w-auto object-contain" />
        </Link>

        <Link to="/book-demo" className="bg-[#3B82F6] hover:bg-[#2563EB] text-white text-sm font-medium px-5 py-2.5 rounded-full shadow-sm transition-all">
          Book a Demo
        </Link>
      </header>

      {/* ---------------- MAIN CONTENT GRID ---------------- */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-2 min-h-[calc(100vh-73px)]">
        {/* LEFT COLUMN: LOGIN FORM */}
        <div className="flex flex-col justify-center items-center px-6 py-12 lg:px-16 xl:px-24 bg-white">
          <div className="w-full max-w-md space-y-6">
            <div>
              <h2 className="text-3xl font-extrabold text-slate-900 tracking-tight">
                Sign in to Zoiko HR.
              </h2>
            </div>

            {errorMsg && (
              <div className="flex items-start space-x-2 bg-red-50 border border-red-200 rounded-lg px-4 py-3">
                <span className="text-red-500 font-bold">●</span>
                <span className="text-xs text-red-600">{errorMsg}</span>
              </div>
            )}

            {unconfirmed && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 text-xs text-amber-800 space-y-2">
                {resendNote ? (
                  <p role="status">{resendNote}</p>
                ) : (
                  <button type="button" onClick={sendNewConfirmation} disabled={resending} className="font-semibold underline disabled:opacity-60">
                    {resending ? "Sending..." : "Send me a new confirmation email"}
                  </button>
                )}
              </div>
            )}

            <form className="space-y-4" onSubmit={handleSubmit}>
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1">
                  Email address
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@company.com"
                  autoComplete="email"
                  className="w-full px-4 py-3 rounded-lg border border-slate-200 bg-slate-50 text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-[#3B82F6] focus:bg-white transition-all"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1">
                  Password
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    autoComplete="current-password"
                    className="w-full px-4 py-3 rounded-lg border border-slate-200 bg-slate-50 text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-[#3B82F6] focus:bg-white transition-all"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs font-medium"
                  >
                    {showPassword ? "Hide" : "Show"}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="w-full bg-[#3B82F6] hover:bg-[#2563EB] disabled:opacity-60 text-white font-bold py-3.5 rounded-xl shadow-md transition-all flex items-center justify-center space-x-2"
              >
                <span>{submitting ? "Signing in…" : "Sign In"}</span>
                <span>→</span>
              </button>
            </form>

            <div className="text-center">
              <Link to="/forgot-password" className="text-xs font-semibold text-[#3B82F6] hover:underline">
                Forgot password?
              </Link>
            </div>

            <div className="text-center">
              <p className="text-xs text-slate-500">
                Don't have an account?{" "}
                <Link to="/register" className="font-semibold text-[#3B82F6] hover:underline">
                  Start Free Evaluation
                </Link>
              </p>
            </div>

            <div className="relative flex py-2 items-center">
              <div className="flex-grow border-t border-slate-200"></div>
              <span className="flex-shrink mx-4 text-xs text-slate-400">or</span>
              <div className="flex-grow border-t border-slate-200"></div>
            </div>

            <div className="space-y-3">
              <button
                type="button"
                onClick={startGoogle}
                disabled={!googleReady || googleBusy}
                title={googleReady ? undefined : "Sign in with Google is not set up for this site yet"}
                className="w-full border border-slate-200 hover:bg-slate-50 disabled:opacity-60 disabled:cursor-not-allowed py-3 rounded-xl text-sm font-semibold text-slate-700 flex items-center justify-center space-x-3 transition-colors"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/>
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
                </svg>
                <span>{googleBusy ? "Connecting to Google…" : "Continue with Google"}</span>
              </button>
              {!googleReady && (
                <p role="note" className="text-[11px] text-slate-400 text-center -mt-1">Sign in with Google is not set up for this site yet. Use your email and password.</p>
              )}
            </div>

            <div className="pt-4 flex items-start space-x-2 text-[11px] text-slate-400 leading-tight">
              <span className="text-[#3B82F6]">●</span>
              <p>Your access is governed by your organization's permissions, roles, workspace settings and security policies.</p>
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN: DARK NAVY FEATURE BANNER */}
        <div className="hidden lg:flex flex-col justify-center px-16 xl:px-24 py-16 bg-[#0A1128] text-white">
          <div className="space-y-6 w-full max-w-md">
            <span className="text-xs font-bold tracking-widest text-[#3B82F6] uppercase">
              NEW TO ZOIKO HR?
            </span>

            <h1 className="text-4xl font-extrabold leading-tight tracking-tight">
              Run global HR, <br />
              <span className="text-[#10B981]">not fragmented spreadsheets.</span>
            </h1>

            <p className="text-slate-300 text-sm leading-relaxed">
              You don't need an account to explore. See how Zoiko HR connects people, payroll, attendance, leave, and compliance across your entire workforce.
            </p>

            <Link to="/book-demo" className="w-full bg-[#3B82F6] hover:bg-[#2563EB] text-white font-bold py-4 rounded-xl shadow-lg transition-all flex items-center justify-center space-x-2">
              <span>Book a Demo</span>
              <span>→</span>
            </Link>

            <div className="space-y-3 pt-2">
              <div className="p-4 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 transition-colors cursor-pointer flex items-center space-x-4">
                <div className="p-2 bg-white/10 rounded-lg text-white">
                  ▶
                </div>
                <div>
                  <h4 className="text-sm font-bold text-white">Take the Product Tour</h4>
                  <p className="text-xs text-slate-400">See it tailored to your organization</p>
                </div>
              </div>

              <Link to="/request-pricing" className="p-4 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 transition-colors cursor-pointer flex items-center space-x-4 no-underline">
                <div className="p-2 bg-white/10 rounded-lg text-white">
                  🎯
                </div>
                <div>
                  <h4 className="text-sm font-bold text-white">Request Pricing</h4>
                  <p className="text-xs text-slate-400">Find your pricing path</p>
                </div>
              </Link>

              <Link to="/hr-products" className="p-4 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 transition-colors cursor-pointer flex items-center space-x-4 no-underline">
                <div className="p-2 bg-white/10 rounded-lg text-white">
                  ❖
                </div>
                <div>
                  <h4 className="text-sm font-bold text-white">Explore HR Products</h4>
                  <p className="text-xs text-slate-400">Core HR + Leave Management + Docs Pro</p>
                </div>
              </Link>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500 font-medium pt-10 w-full max-w-md">
            <span>Global structure</span>
            <span>•</span>
            <span>Role-based access</span>
            <span>•</span>
            <span>Auditable lifecycle</span>
          </div>
        </div>
      </div>
    </div>
  );
}
