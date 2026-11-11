import React, { useState } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { changePassword, fetchCurrentUser } from "../../service/authService";
import { getAccessToken, getRefreshToken, setSession } from "../../service/api";
import { ROLE_DEFAULT_REDIRECT } from "../../config/roles";

import { PASSWORD_HINT, passwordProblem } from "../../utils/passwordPolicy";
import PasswordInput from "../../components/PasswordInput";

export { PASSWORD_HINT, passwordProblem };

/**
 * Shown when an administrator set a temporary password (user.mustChangePassword).
 * The backend blocks every other route until the password is changed.
 */
export default function ChangePasswordPage() {
  const { isAuthenticated, user, role } = useAuth();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  if (!isAuthenticated) return <Navigate to="/login" replace />;

  async function submit(e) {
    e.preventDefault();
    if (pending) return;
    const problem = passwordProblem(next);
    if (problem) return setError(problem);
    if (next !== confirm) return setError("The new passwords do not match.");
    setPending(true);
    setError("");
    try {
      await changePassword({ currentPassword: current, newPassword: next });
      const me = await fetchCurrentUser();
      setSession({ accessToken: getAccessToken(), refreshToken: getRefreshToken(), user: me });
      window.location.assign(ROLE_DEFAULT_REDIRECT[role] || "/");
    } catch (err) {
      setError(err?.message || "Could not change the password.");
      setPending(false);
    }
  }

  const input = "w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm focus:border-blue-500 focus:outline-none";
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4 font-sans">
      <form onSubmit={submit} className="w-full max-w-md space-y-4 rounded-2xl bg-white p-8 shadow-lg">
        <h1 className="text-xl font-bold text-slate-900">Set a new password</h1>
        <p className="text-sm text-slate-500">
          {user?.email ? `${user.email} is using a temporary password. ` : ""}Choose your own password to continue.
        </p>
        {error ? <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div> : null}
        {/* A2: each password box has its own show/hide eye. */}
        <div>
          <label htmlFor="cp-current" className="block text-sm font-semibold text-slate-700">Temporary password</label>
          <PasswordInput id="cp-current" wrapperClassName="mt-1" className={input} autoComplete="current-password" value={current}
            onChange={(e) => setCurrent(e.target.value)} required />
        </div>
        <div>
          <label htmlFor="cp-new" className="block text-sm font-semibold text-slate-700">New password</label>
          <PasswordInput id="cp-new" wrapperClassName="mt-1" className={input} autoComplete="new-password" value={next}
            onChange={(e) => setNext(e.target.value)} required aria-describedby="cp-new-hint" />
          <span id="cp-new-hint" className="mt-1 block text-xs font-normal text-slate-400">{PASSWORD_HINT}</span>
        </div>
        <div>
          <label htmlFor="cp-confirm" className="block text-sm font-semibold text-slate-700">Confirm new password</label>
          <PasswordInput id="cp-confirm" wrapperClassName="mt-1" className={input} autoComplete="new-password" value={confirm}
            onChange={(e) => setConfirm(e.target.value)} required />
        </div>
        <button type="submit" disabled={pending}
          className="w-full rounded-xl bg-blue-600 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50">
          {pending ? "Saving…" : "Change password"}
        </button>
      </form>
    </div>
  );
}
