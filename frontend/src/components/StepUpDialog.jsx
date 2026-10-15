/**
 * components/StepUpDialog.jsx
 * ---------------------------
 * "Confirm it is you" for sensitive platform actions (ZHR-PRIV-001). The server refuses those actions with
 * MFA_STEP_UP_REQUIRED unless the access token carries a recent authenticator check. `useStepUp()` wraps an action:
 * on that refusal it asks for a 6-digit code, trades it for a fresh token (/auth/mfa/step-up) and runs the action again.
 *
 * A platform account without an authenticator cannot step up (MFA_NOT_ENROLLED); the dialog then sets one up in place
 * (password -> secret -> first code), which signs the person in again with a fresh check, and the action is retried.
 *
 * `useStepUp({ required: false })` skips all of that and just runs the action. The JIT support-access page passes the
 * server's `catalog.mfa_required` here so the dialog cannot appear when the backend has the dev escape hatch
 * (HR_SUPPORT_ACCESS_MFA_REQUIRED=false) switched off.
 */
import { useCallback, useRef, useState } from "react";
import { ShieldCheck, X, Loader2 } from "lucide-react";
import { mfaEnrollConfirm, mfaEnrollStart, mfaStepUp } from "../service/authService";
import { getStoredUser } from "../service/api";

export const STEP_UP_CODE = "MFA_STEP_UP_REQUIRED";

const inputCls =
  "w-full rounded-xl border border-slate-200 bg-white py-2.5 px-4 text-sm text-slate-700 outline-none focus:border-[#3B82F6]";

export function useStepUp({ required = true } = {}) {
  const [state, setState] = useState(null); // { step: "code" | "password" | "enroll", enrollment? }
  const pending = useRef(null);             // { resolve, reject } of the step-up the dialog is answering

  const ask = useCallback(() => new Promise((resolve, reject) => {
    pending.current = { resolve, reject };
    setState({ step: "code" });
  }), []);

  /** Run `fn`; if the server asks for a fresh check, get one and run it once more. */
  const run = useCallback(async (fn) => {
    if (!required) return fn();
    try {
      return await fn();
    } catch (err) {
      if (err?.code !== STEP_UP_CODE) throw err;
      await ask();
      return fn();
    }
  }, [ask, required]);

  const close = (error) => {
    const p = pending.current;
    pending.current = null;
    setState(null);
    if (!p) return;
    if (error) p.reject(error);
    else p.resolve();
  };

  const dialog = state ? (
    <StepUpDialog
      state={state}
      setState={setState}
      onDone={() => close(null)}
      onCancel={() => close(Object.assign(new Error("Confirmation cancelled."), { cancelled: true }))}
    />
  ) : null;

  return { run, dialog };
}

function StepUpDialog({ state, setState, onDone, onCancel }) {
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const email = getStoredUser()?.email || "";

  const submitCode = async () => {
    if (!/^\d{6}$/.test(code)) { setError("Enter the 6-digit code from your authenticator app."); return; }
    setBusy(true);
    setError(null);
    try {
      if (state.step === "enroll") await mfaEnrollConfirm({ email, password, code });
      else await mfaStepUp(code);
      onDone();
    } catch (err) {
      if (err?.code === "MFA_NOT_ENROLLED") {
        setState({ step: "password" });
        setError(null);
      } else {
        setError(err?.message || "That code is not valid. Check the code and try again.");
      }
      setCode("");
    } finally {
      setBusy(false);
    }
  };

  const startEnrollment = async () => {
    if (!password) { setError("Enter your password."); return; }
    setBusy(true);
    setError(null);
    try {
      const enrollment = await mfaEnrollStart({ email, password });
      setState({ step: "enroll", enrollment });
    } catch (err) {
      setError(err?.message || "Could not start the authenticator setup.");
    } finally {
      setBusy(false);
    }
  };

  const onSubmit = (e) => {
    e.preventDefault();
    if (state.step === "password") startEnrollment();
    else submitCode();
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 p-4">
      <form onSubmit={onSubmit} role="dialog" aria-modal="true" aria-label="Confirm it is you"
        className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-6 shadow-xl">
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-50">
              <ShieldCheck className="h-5 w-5 text-[#3B82F6]" />
            </div>
            <h3 className="text-lg font-bold text-slate-800">Confirm it is you</h3>
          </div>
          <button type="button" onClick={onCancel} aria-label="Cancel" className="text-slate-400 hover:text-slate-600"><X size={18} /></button>
        </div>

        {state.step === "code" && (
          <p className="mb-4 text-sm text-slate-500">This action needs a fresh check. Enter the current code from your authenticator app.</p>
        )}
        {state.step === "password" && (
          <>
            <p className="mb-4 text-sm text-slate-500">
              No authenticator app is set up for this account yet, and this action needs one. Enter your password to set it up now.
            </p>
            <input type="password" autoFocus autoComplete="current-password" value={password}
              onChange={(e) => setPassword(e.target.value)} placeholder="Password" className={inputCls} aria-label="Password" />
          </>
        )}
        {state.step === "enroll" && state.enrollment && (
          <div className="mb-4 space-y-2 rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-xs text-slate-700">
            <p>Add this account to your authenticator app, then enter the 6-digit code it shows.</p>
            <p className="break-all font-mono text-sm select-all">{state.enrollment.secret}</p>
            <a className="text-[#3B82F6] underline" href={state.enrollment.otpauth_uri}>Open in my authenticator app</a>
          </div>
        )}
        {state.step !== "password" && (
          <input inputMode="numeric" autoComplete="one-time-code" autoFocus maxLength={6} value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} placeholder="123456"
            className={`${inputCls} tracking-[0.4em] text-center font-mono`} aria-label="Authenticator code" />
        )}
        {error && <p role="alert" className="mt-2 text-xs text-red-600">{error}</p>}

        <div className="mt-6 flex justify-end gap-3">
          <button type="button" onClick={onCancel} className="rounded-full border border-slate-200 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50">Cancel</button>
          <button type="submit" disabled={busy}
            className="flex items-center gap-2 rounded-full bg-[#3B82F6] px-4 py-2 text-sm font-semibold text-white hover:bg-[#2563EB] disabled:opacity-50">
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            {state.step === "password" ? "Continue" : "Confirm"}
          </button>
        </div>
      </form>
    </div>
  );
}
