import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";

export default function LoginPage() {
  const { login, error: authError, defaultRedirect } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = location.state?.from?.pathname || defaultRedirect;

  const [email, setEmail] = useState(import.meta.env.VITE_DEFAULT_EMAIL || "");
  const [password, setPassword] = useState(import.meta.env.VITE_DEFAULT_PASSWORD || "");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [localError, setLocalError] = useState(null);

  async function handleSubmit(e) {
    e.preventDefault();
    setLocalError(null);
    setSubmitting(true);
    try {
      await login({ email, password });
      navigate(from, { replace: true });
    } catch (err) {
      setLocalError(err.message || "Unable to sign in. Please check your credentials.");
    } finally {
      setSubmitting(false);
    }
  }

  const errorMsg = localError || authError;

  return (
    <div className="min-h-screen flex flex-col font-sans bg-white text-slate-800">
      {/* ---------------- TOP NAVBAR ---------------- */}
      <header className="w-full flex items-center justify-between px-8 py-4 border-b border-slate-100 bg-white">
        <Link to="/" className="flex items-center space-x-1 cursor-pointer">
          <span className="text-2xl font-black text-[#EAB308]">Z</span>
          <span className="text-2xl font-black text-[#1E3A8A]">OIKO</span>
          <span className="text-2xl font-black text-[#06B6D4]">HR</span>
          <span className="text-[10px] text-slate-400 align-top -ml-1">TM</span>
        </Link>

        <nav className="hidden md:flex items-center space-x-6 text-sm font-medium text-slate-600">
          <a href="#" className="hover:text-slate-900 transition-colors">Platform ▾</a>
          <a href="#" className="hover:text-slate-900 transition-colors">Solutions ▾</a>
          <a href="#" className="hover:text-slate-900 transition-colors">Integrations ▾</a>
          <a href="#" className="hover:text-slate-900 transition-colors">Resources ▾</a>
          <a href="#" className="hover:text-slate-900 transition-colors">Company ▾</a>
          <a href="#" className="hover:text-slate-900 transition-colors">Pricing</a>
        </nav>

        <div className="flex items-center space-x-4">
          <a href="#" className="text-sm font-semibold text-slate-700 hover:text-slate-900">Sign In</a>
          <button className="bg-[#3B82F6] hover:bg-[#2563EB] text-white text-sm font-medium px-5 py-2.5 rounded-full shadow-sm transition-all">
            Book a Demo
          </button>
        </div>
      </header>

      {/* ---------------- MAIN CONTENT GRID ---------------- */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-2">
        {/* LEFT COLUMN: LOGIN FORM */}
        <div className="flex flex-col justify-center items-center px-6 py-12 lg:px-20 bg-white">
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

            <div className="relative flex py-2 items-center">
              <div className="flex-grow border-t border-slate-200"></div>
              <span className="flex-shrink mx-4 text-xs text-slate-400">or</span>
              <div className="flex-grow border-t border-slate-200"></div>
            </div>

            <div className="space-y-3">
              <button className="w-full border border-slate-200 hover:bg-slate-50 py-3 rounded-xl text-sm font-semibold text-slate-700 flex items-center justify-center space-x-3 transition-colors">
                <svg className="w-4 h-4" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/>
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
                </svg>
                <span>Continue with Google</span>
              </button>

              <button className="w-full border border-slate-200 hover:bg-slate-50 py-3 rounded-xl text-sm font-semibold text-slate-700 flex items-center justify-center space-x-3 transition-colors">
                <svg className="w-4 h-4" viewBox="0 0 23 23">
                  <path fill="#f35325" d="M1 1h10v10H1z"/>
                  <path fill="#81bc06" d="M12 1h10v10H12z"/>
                  <path fill="#05a6f0" d="M1 12h10v10H1z"/>
                  <path fill="#ffba08" d="M12 12h10v10H12z"/>
                </svg>
                <span>Continue with Microsoft</span>
              </button>

              <button className="w-full border border-slate-200 hover:bg-slate-50 py-3 rounded-xl text-sm font-semibold text-slate-700 flex items-center justify-center space-x-3 transition-colors">
                <span className="w-4 h-4 flex items-center justify-center border border-slate-400 rounded-full text-[10px] font-bold text-slate-600">👤</span>
                <span>Continue with SSO</span>
              </button>
            </div>

            <div className="pt-4 flex items-start space-x-2 text-[11px] text-slate-400 leading-tight">
              <span className="text-[#3B82F6]">●</span>
              <p>Your access is governed by your organization's permissions, roles, workspace settings and security policies.</p>
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN: DARK NAVY FEATURE BANNER */}
        <div className="hidden lg:flex flex-col justify-between p-16 bg-[#0A1128] text-white">
          <div className="space-y-6 max-w-xl">
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

            <button className="w-full bg-[#3B82F6] hover:bg-[#2563EB] text-white font-bold py-4 rounded-xl shadow-lg transition-all flex items-center justify-center space-x-2">
              <span>Book a Demo</span>
              <span>→</span>
            </button>

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

              <div className="p-4 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 transition-colors cursor-pointer flex items-center space-x-4">
                <div className="p-2 bg-white/10 rounded-lg text-white">
                  🎯
                </div>
                <div>
                  <h4 className="text-sm font-bold text-white">Request Pricing</h4>
                  <p className="text-xs text-slate-400">Find your pricing path</p>
                </div>
              </div>

              <div className="p-4 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 transition-colors cursor-pointer flex items-center space-x-4">
                <div className="p-2 bg-white/10 rounded-lg text-white">
                  ❖
                </div>
                <div>
                  <h4 className="text-sm font-bold text-white">Explore HR Products</h4>
                  <p className="text-xs text-slate-400">Core HR + Leave Management + Docs Pro</p>
                </div>
              </div>
            </div>
          </div>

          <div className="flex items-center space-x-4 text-xs text-slate-500 font-medium pt-8">
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
