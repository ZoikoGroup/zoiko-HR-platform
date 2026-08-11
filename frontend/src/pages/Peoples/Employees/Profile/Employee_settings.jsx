import { useState, useEffect, useRef } from "react";
import { Eye, EyeOff, Lock, ShieldCheck, Shield, CheckCircle, XCircle, Loader2, AlertCircle } from "lucide-react";
import { getMyProfile, updateMyProfile } from "../../../../service/employee";
import { changePassword } from "../../../../service/authService";
import EmployeePageShell from "../../../../components/employee/EmployeePageShell";

const calcStrength = (pw) => {
  if (!pw) return { score: 0, label: "", color: "" };
  let score = 0;
  if (pw.length >= 8) score++;
  if (pw.length >= 12) score++;
  if (/[A-Z]/.test(pw)) score++;
  if (/[0-9]/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;
  if (score <= 1) return { score, label: "Weak", color: "bg-red-400" };
  if (score <= 3) return { score, label: "Medium", color: "bg-amber-400" };
  return { score, label: "Strong", color: "bg-emerald-500" };
};

const requirements = [
  { label: "At least 8 characters", test: (pw) => pw.length >= 8 },
  { label: "One uppercase letter", test: (pw) => /[A-Z]/.test(pw) },
  { label: "One number", test: (pw) => /[0-9]/.test(pw) },
  { label: "One special character", test: (pw) => /[^A-Za-z0-9]/.test(pw) },
];

const PasswordField = ({ label, value, onChange, show, onToggle, placeholder }) => (
  <div>
    <label className="text-xs font-semibold text-slate-400 dark:text-[#94a3b8] uppercase tracking-widest block mb-1.5">{label}</label>
    <div className="relative">
      <div className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-300 dark:text-[#64748b]">
        <Lock size={15} />
      </div>
      <input
        type={show ? "text" : "password"}
        value={value}
        onChange={onChange}
        placeholder={placeholder || "••••••••"}
        className="w-full border border-slate-200 dark:border-[#334155] rounded-xl pl-9 pr-10 py-2.5 text-sm font-medium text-slate-800 dark:text-[#e2e8f0] bg-slate-50 dark:bg-[#0f172a] outline-none focus:ring-2 focus:ring-indigo-300 focus:border-indigo-400 focus:bg-white dark:focus:bg-[#0f172a] transition"
      />
      <button
        type="button"
        onClick={onToggle}
        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-[#94a3b8] hover:text-slate-600 dark:hover:text-[#cbd5e1] transition"
      >
        {show ? <EyeOff size={15} /> : <Eye size={15} />}
      </button>
    </div>
  </div>
);

export default function ChangePassword() {
  const [current, setCurrent] = useState("");
  const [newPw, setNewPw] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState({ current: false, new: false, confirm: false });
  const [twoFA, setTwoFA] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [success, setSuccess] = useState(null);
  const [errors, setErrors] = useState({});
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    setLoading(true);
    getMyProfile()
      .then((res) => {
        if (!mounted.current) return;
        const p = res.data || res;
        setTwoFA(p.isTwoFAEnabled || p.twoFactorEnabled || false);
      })
      .catch(() => {})
      .finally(() => {
        if (mounted.current) setLoading(false);
      });
    return () => { mounted.current = false; };
  }, []);

  const strength = calcStrength(newPw);

  const validate = () => {
    const e = {};
    if (!current) e.current = "Enter your current password";
    if (!newPw) e.newPw = "Enter a new password";
    if (strength.score < 3) e.newPw = "Password is too weak";
    if (newPw !== confirm) e.confirm = "Passwords do not match";
    if (!confirm) e.confirm = "Confirm your password";
    return e;
  };

  const handleSubmit = () => {
    const e = validate();
    if (Object.keys(e).length) { setErrors(e); return; }
    setSaving(true);
    setErrors({});
    setSuccess(null);
    changePassword({ currentPassword: current, newPassword: newPw })
      .then(() => {
        if (!mounted.current) return;
        setSuccess("password");
        setCurrent("");
        setNewPw("");
        setConfirm("");
        setTimeout(() => { if (mounted.current) setSuccess(null); }, 4000);
      })
      .catch((err) => {
        if (mounted.current) setErrors({ _api: err?.message || "Failed to update password" });
      })
      .finally(() => {
        if (mounted.current) setSaving(false);
      });
  };

  const handleToggle2FA = () => {
    const newVal = !twoFA;
    setSaving(true);
    setErrors({});
    setSuccess(null);
    updateMyProfile({ isTwoFAEnabled: newVal })
      .then(() => {
        if (!mounted.current) return;
        setTwoFA(newVal);
        setSuccess("2fa");
        setTimeout(() => { if (mounted.current) setSuccess(null); }, 4000);
      })
      .catch((err) => {
        if (mounted.current) setErrors({ _2fa: err?.message || "Failed to update 2FA setting" });
      })
      .finally(() => {
        if (mounted.current) setSaving(false);
      });
  };

  const toggle = (field) => setShow((s) => ({ ...s, [field]: !s[field] }));

  if (loading) {
    return (
      <EmployeePageShell title="Security Settings" subtitle="Profile">
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-6 h-6 text-indigo-500 animate-spin" />
          <span className="ml-3 text-sm text-slate-500 dark:text-[#94a3b8] font-medium">Loading settings...</span>
        </div>
      </EmployeePageShell>
    );
  }

  return (
    <EmployeePageShell title="Security Settings" subtitle="Manage your password and authentication preferences.">
      <div className="max-w-lg">
        {success === "password" && (
          <div className="mb-6 flex items-center gap-3 bg-emerald-50 dark:bg-emerald-900/30 border border-emerald-200 dark:border-emerald-800 rounded-xl px-4 py-3 text-emerald-700 dark:text-emerald-300 text-sm font-semibold">
            <CheckCircle size={16} /> Password updated successfully!
          </div>
        )}

        {success === "2fa" && (
          <div className="mb-6 flex items-center gap-3 bg-emerald-50 dark:bg-emerald-900/30 border border-emerald-200 dark:border-emerald-800 rounded-xl px-4 py-3 text-emerald-700 dark:text-emerald-300 text-sm font-semibold">
            <CheckCircle size={16} /> Two-factor authentication {twoFA ? "enabled" : "disabled"} successfully!
          </div>
        )}

        {errors._api && (
          <div className="mb-6 flex items-center gap-3 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-xl px-4 py-3 text-red-700 dark:text-red-300 text-sm font-semibold">
            <AlertCircle size={16} /> {errors._api}
          </div>
        )}

        {/* Password Form */}
        <div className="bg-white dark:bg-[#1e293b] rounded-2xl shadow-sm border border-slate-100 dark:border-[#334155] p-6 mb-5">
          <div className="flex items-center gap-2 mb-5">
            <div className="p-2 rounded-xl bg-indigo-50 dark:bg-indigo-500/20">
              <Lock size={16} className="text-indigo-500" />
            </div>
            <h2 className="text-base font-bold text-slate-800 dark:text-[#f1f5f9]">Change Password</h2>
          </div>

          <div className="space-y-4">
            <div>
              <PasswordField
                label="Current Password"
                value={current}
                onChange={(e) => { setCurrent(e.target.value); setErrors((p) => ({ ...p, current: "" })); }}
                show={show.current}
                onToggle={() => toggle("current")}
              />
              {errors.current && <p className="text-xs text-red-500 mt-1">{errors.current}</p>}
            </div>

            <div>
              <PasswordField
                label="New Password"
                value={newPw}
                onChange={(e) => { setNewPw(e.target.value); setErrors((p) => ({ ...p, newPw: "" })); }}
                show={show.new}
                onToggle={() => toggle("new")}
                placeholder="Create a strong password"
              />
              {errors.newPw && <p className="text-xs text-red-500 mt-1">{errors.newPw}</p>}

              {newPw && (
                <div className="mt-3">
                  <div className="flex gap-1 mb-1.5">
                    {[1, 2, 3, 4, 5].map((i) => (
                      <div
                        key={i}
                        className={`h-1.5 flex-1 rounded-full transition-all duration-300 ${
                          i <= strength.score ? strength.color : "bg-slate-200 dark:bg-[#334155]"
                        }`}
                      />
                    ))}
                  </div>
                  <p className={`text-xs font-semibold ${
                    strength.label === "Strong" ? "text-emerald-600"
                    : strength.label === "Medium" ? "text-amber-500"
                    : "text-red-500"
                  }`}>
                    {strength.label} Password
                  </p>

                  <div className="mt-3 space-y-1.5">
                    {requirements.map((req) => {
                      const met = req.test(newPw);
                      return (
                        <div key={req.label} className="flex items-center gap-2">
                          {met
                            ? <CheckCircle size={13} className="text-emerald-500 shrink-0" />
                            : <XCircle size={13} className="text-slate-300 shrink-0" />
                          }
                          <span className={`text-xs ${met ? "text-slate-600 dark:text-[#94a3b8]" : "text-slate-400 dark:text-[#64748b]"}`}>{req.label}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            <div>
              <PasswordField
                label="Confirm New Password"
                value={confirm}
                onChange={(e) => { setConfirm(e.target.value); setErrors((p) => ({ ...p, confirm: "" })); }}
                show={show.confirm}
                onToggle={() => toggle("confirm")}
                placeholder="Re-enter your new password"
              />
              {errors.confirm && <p className="text-xs text-red-500 mt-1">{errors.confirm}</p>}
              {confirm && newPw && confirm === newPw && (
                <p className="text-xs text-emerald-600 dark:text-emerald-400 font-medium mt-1 flex items-center gap-1">
                  <CheckCircle size={12} /> Passwords match
                </p>
              )}
            </div>
          </div>

          <button
            onClick={handleSubmit}
            disabled={saving}
            className="mt-6 w-full py-3 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white text-sm font-bold rounded-xl transition shadow-sm shadow-indigo-200 flex items-center justify-center gap-2"
          >
            {saving ? <><Loader2 size={14} className="animate-spin" /> Updating...</> : "Update Password"}
          </button>
        </div>

        {/* 2FA Section */}
        <div className="bg-white dark:bg-[#1e293b] rounded-2xl shadow-sm border border-slate-100 dark:border-[#334155] p-6">
          <div className="flex items-center gap-2 mb-1">
            <div className="p-2 rounded-xl bg-violet-50 dark:bg-violet-500/20">
              <ShieldCheck size={16} className="text-violet-500" />
            </div>
            <h2 className="text-base font-bold text-slate-800 dark:text-[#f1f5f9]">Two-Factor Authentication</h2>
          </div>
          <p className="text-xs text-slate-400 dark:text-[#94a3b8] mb-5 ml-10">Add an extra layer of security to your account with 2FA.</p>

          {errors._2fa && (
            <div className="mb-4 flex items-center gap-2 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-xl px-4 py-3 text-red-700 dark:text-red-300 text-sm font-semibold">
              <AlertCircle size={14} /> {errors._2fa}
            </div>
          )}

          <div className="flex items-center justify-between p-4 bg-slate-50 dark:bg-[#0f172a] rounded-xl border border-slate-100 dark:border-[#334155]">
            <div className="flex items-center gap-3">
              <Shield size={18} className={twoFA ? "text-violet-500" : "text-slate-300 dark:text-[#64748b]"} />
              <div>
                <p className="text-sm font-semibold text-slate-800 dark:text-[#f1f5f9]">Authenticator App</p>
                <p className="text-xs text-slate-400 dark:text-[#94a3b8] mt-0.5">
                  {twoFA ? "2FA is enabled on your account" : "Use Google Authenticator or Authy"}
                </p>
              </div>
            </div>

            {saving ? (
              <Loader2 size={18} className="text-indigo-500 animate-spin" />
            ) : (
              <button
                onClick={handleToggle2FA}
                className={`relative w-12 h-6 rounded-full transition-colors duration-300 ${twoFA ? "bg-violet-500" : "bg-slate-200 dark:bg-[#334155]"}`}
                aria-label="Toggle 2FA"
              >
                <span
                  className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow transition-all duration-300 ${
                    twoFA ? "left-7" : "left-1"
                  }`}
                />
              </button>
            )}
          </div>

          {twoFA && (
            <div className="mt-4 p-4 bg-violet-50 dark:bg-violet-900/30 border border-violet-100 dark:border-violet-800 rounded-xl">
              <p className="text-xs font-semibold text-violet-700 dark:text-violet-300 mb-1">✓ Two-factor authentication is active</p>
              <p className="text-xs text-violet-500 dark:text-violet-400">
                You'll be asked for a verification code each time you sign in from a new device.
              </p>
            </div>
          )}
        </div>
      </div>
    </EmployeePageShell>
  );
}
