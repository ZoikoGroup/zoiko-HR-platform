import { useEffect, useId, useRef, useState } from "react";
import { AlertTriangle, Loader2, Mail, PenLine, Type, XCircle, CheckCircle2, Info } from "lucide-react";
import SignaturePad from "./SignaturePad";

// The electronic-signature steps shared by the employee portal, the authorised-signatory queue and the public candidate
// page: consent statement → (one-time code) → typed or drawn signature → Sign, or Decline with a reason.
// A signature is never an acknowledgement: this component is only used where a signature is asked for.

export const E_SIGNATURE_NOTICE = "This is an electronic signature recorded by Zoiko HR. It is not a qualified electronic signature.";
export const NAME_MISMATCH_TEXT = "Type your name exactly as it appears on the document. If it is wrong, ask HR to correct it.";

const inputCls =
  "w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-base sm:text-sm text-slate-800 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/30 disabled:bg-slate-50";
const primaryBtn =
  "inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50";
const secondaryBtn =
  "inline-flex items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50";
const dangerBtn =
  "inline-flex items-center justify-center gap-2 rounded-xl border border-red-300 bg-white px-4 py-2.5 text-sm font-semibold text-red-700 hover:bg-red-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50";

// Turns an API error from sign / OTP calls into text, and says whether a fresh code is needed.
export function describeSigningError(e) {
  const code = e?.code || e?.detail?.code;
  if (code === "OTP_INVALID") {
    const left = e?.detail?.attempts_left;
    if (left === 0) return { text: "That code is not right and no attempts are left. Send a new code.", newCode: true };
    return { text: `That code is not right.${typeof left === "number" ? ` ${left} attempt${left === 1 ? "" : "s"} left.` : ""}`, field: "otp" };
  }
  if (code === "OTP_EXPIRED") return { text: "The code has expired. Send a new code and enter it.", newCode: true };
  if (code === "OTP_LOCKED") return { text: "Too many wrong codes. Send a new code and try again.", newCode: true };
  if (code === "NAME_MISMATCH") return { text: NAME_MISMATCH_TEXT, field: "name" };
  if (code === "DOCUMENT_INTEGRITY_FAILED") {
    return { text: e?.message || "The stored document does not match the issued version. It cannot be signed. HR has been told.", blocked: true };
  }
  if (e?.status === 429) return { text: e?.message || "Too many attempts. Wait a minute and try again." };
  return { text: e?.message || "Something went wrong. Please try again." };
}

export default function SigningSteps({
  consent,
  needsOtp,
  expectedName,
  requestOtp,
  submit,
  decline,
  onSigned,
  onDeclined,
  signLabel = "Sign",
  partyNote,
}) {
  const uid = useId();
  const ids = {
    consent: `${uid}-consent`,
    otp: `${uid}-otp`,
    otpHelp: `${uid}-otp-help`,
    name: `${uid}-name`,
    nameHelp: `${uid}-name-help`,
    reason: `${uid}-reason`,
    pad: `${uid}-pad`,
    error: `${uid}-error`,
  };
  const [agreed, setAgreed] = useState(false);
  const [otpInfo, setOtpInfo] = useState(null); // { sent_to, expires_in_minutes }
  const [otp, setOtp] = useState("");
  const [sending, setSending] = useState(false);
  const [method, setMethod] = useState("TYPED");
  const [typedName, setTypedName] = useState("");
  const [drawn, setDrawn] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null); // { text, field, blocked }
  const [declining, setDeclining] = useState(false);
  const [reason, setReason] = useState("");
  const otpRef = useRef(null);
  const nameRef = useRef(null);
  const reasonRef = useRef(null);
  const errorRef = useRef(null);

  useEffect(() => { if (otpInfo) otpRef.current?.focus(); }, [otpInfo]);
  useEffect(() => { if (declining) reasonRef.current?.focus(); }, [declining]);
  useEffect(() => {
    if (!error) return;
    if (error.field === "otp") otpRef.current?.focus();
    else if (error.field === "name") nameRef.current?.focus();
    else errorRef.current?.focus();
  }, [error]);

  const sendCode = async () => {
    setSending(true);
    setError(null);
    try {
      const res = await requestOtp();
      setOtp("");
      setOtpInfo(res || { sent_to: null });
    } catch (e) {
      setError({ text: e?.message || "The code could not be sent. Try again." });
    } finally {
      setSending(false);
    }
  };

  const otpOk = !needsOtp || /^\d{6}$/.test(otp);
  const drawnOk = method === "TYPED" || !!drawn;
  const canSign = agreed && otpOk && typedName.trim().length > 0 && drawnOk && !busy && !error?.blocked && (!needsOtp || otpInfo);

  const doSign = async (e) => {
    e?.preventDefault?.();
    if (!canSign) return;
    setBusy(true);
    setError(null);
    const body = { typed_name: typedName.trim(), method, consent_version: consent?.version };
    if (method === "DRAWN") body.drawn_signature = drawn;
    if (needsOtp) body.otp_code = otp;
    try {
      const res = await submit(body);
      onSigned?.(res);
    } catch (err) {
      const d = describeSigningError(err);
      if (d.newCode) {
        setOtpInfo(null);
        setOtp("");
      }
      setError(d);
    } finally {
      setBusy(false);
    }
  };

  const doDecline = async (e) => {
    e?.preventDefault?.();
    if (!reason.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const res = await decline(reason.trim());
      onDeclined?.(res);
    } catch (err) {
      setError({ text: err?.message || "The document could not be declined. Try again." });
    } finally {
      setBusy(false);
    }
  };

  const errorBox = error && (
    <div ref={errorRef} tabIndex={-1} id={ids.error} role="alert" className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800 outline-none">
      <AlertTriangle size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
      <span>{error.text}</span>
    </div>
  );

  if (declining) {
    return (
      <form onSubmit={doDecline} className="space-y-4" aria-labelledby={`${uid}-decline-title`}>
        <h3 id={`${uid}-decline-title`} className="text-base font-bold text-slate-900">Decline to sign</h3>
        <p className="text-sm text-slate-600">HR will see your reason. Declining does not sign the document.</p>
        <div>
          <label htmlFor={ids.reason} className="mb-1.5 block text-sm font-semibold text-slate-700">
            Why are you declining? <span className="text-red-600" aria-hidden="true">*</span><span className="sr-only">(required)</span>
          </label>
          <textarea
            id={ids.reason}
            ref={reasonRef}
            rows={4}
            required
            maxLength={2000}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className={inputCls}
          />
        </div>
        {errorBox}
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button type="button" className={secondaryBtn} onClick={() => { setDeclining(false); setError(null); }} disabled={busy}>
            Back
          </button>
          <button type="submit" className={`${dangerBtn} border-red-600 bg-red-600 text-white hover:bg-red-700`} disabled={busy || !reason.trim()}>
            {busy ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : <XCircle size={16} aria-hidden="true" />}
            Decline document
          </button>
        </div>
      </form>
    );
  }

  return (
    <form onSubmit={doSign} className="space-y-5" noValidate>
      <div className="flex items-start gap-2 rounded-xl border border-blue-100 bg-blue-50 p-3 text-sm text-blue-900">
        <Info size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
        <p>{E_SIGNATURE_NOTICE}{partyNote ? ` ${partyNote}` : ""}</p>
      </div>

      {/* 1. consent */}
      <fieldset className="space-y-2">
        <legend className="text-sm font-bold text-slate-900">1. Agree to sign electronically</legend>
        <div className="flex items-start gap-3 rounded-xl border border-slate-200 p-3">
          <input
            id={ids.consent}
            type="checkbox"
            checked={agreed}
            onChange={(e) => setAgreed(e.target.checked)}
            className="mt-1 h-5 w-5 shrink-0 rounded border-slate-300 text-blue-600 focus:ring-2 focus:ring-blue-500"
          />
          <label htmlFor={ids.consent} className="text-sm text-slate-700">
            {consent?.text || "I agree to sign this document electronically."}
            {consent?.version && <span className="mt-1 block text-xs text-slate-400">Statement {consent.version}</span>}
          </label>
        </div>
      </fieldset>

      {/* 2. one-time code */}
      {needsOtp && (
        <fieldset className="space-y-2" disabled={!agreed}>
          <legend className="text-sm font-bold text-slate-900">2. Confirm it is you</legend>
          {!agreed && <p className="text-xs text-slate-500">Tick the statement above first.</p>}
          {!otpInfo ? (
            <div className="space-y-2">
              <p className="text-sm text-slate-600">We will e-mail you a 6-digit code.</p>
              <button type="button" className={secondaryBtn} onClick={sendCode} disabled={!agreed || sending}>
                {sending ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : <Mail size={16} aria-hidden="true" />}
                Send code
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              <p id={ids.otpHelp} className="text-sm text-slate-600" aria-live="polite">
                We sent a code{otpInfo.sent_to ? ` to ${otpInfo.sent_to}` : ""}.
                {otpInfo.expires_in_minutes ? ` It expires in ${otpInfo.expires_in_minutes} minutes.` : ""}
              </p>
              <label htmlFor={ids.otp} className="block text-sm font-semibold text-slate-700">6-digit code</label>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  id={ids.otp}
                  ref={otpRef}
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  pattern="\d{6}"
                  maxLength={6}
                  value={otp}
                  onChange={(e) => {
                    setOtp(e.target.value.replace(/\D/g, "").slice(0, 6));
                    if (error?.field === "otp") setError(null);
                  }}
                  aria-describedby={`${ids.otpHelp}${error?.field === "otp" ? ` ${ids.error}` : ""}`}
                  aria-invalid={error?.field === "otp" ? "true" : undefined}
                  className={`${inputCls} w-40 font-mono tracking-[0.4em]`}
                />
                <button type="button" onClick={sendCode} disabled={sending} className="text-sm font-semibold text-blue-700 underline hover:text-blue-900 disabled:opacity-50">
                  {sending ? "Sending..." : "Send a new code"}
                </button>
              </div>
            </div>
          )}
        </fieldset>
      )}

      {/* 3. signature */}
      <fieldset className="space-y-3" disabled={!agreed}>
        <legend className="text-sm font-bold text-slate-900">{needsOtp ? "3" : "2"}. Your signature</legend>
        <div role="radiogroup" aria-label="How to sign" className="inline-flex rounded-xl border border-slate-200 bg-slate-50 p-1">
          {[
            { v: "TYPED", label: "Type", icon: Type },
            { v: "DRAWN", label: "Draw", icon: PenLine },
          ].map(({ v, label, icon: Icon }) => (
            <button
              key={v}
              type="button"
              role="radio"
              aria-checked={method === v}
              onClick={() => setMethod(v)}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${method === v ? "bg-white text-blue-700 shadow-sm" : "text-slate-600 hover:text-slate-800"}`}
            >
              <Icon size={15} aria-hidden="true" /> {label}
            </button>
          ))}
        </div>

        <div>
          <label htmlFor={ids.name} className="mb-1.5 block text-sm font-semibold text-slate-700">
            Your full name <span className="text-red-600" aria-hidden="true">*</span><span className="sr-only">(required)</span>
          </label>
          <input
            id={ids.name}
            ref={nameRef}
            type="text"
            autoComplete="name"
            maxLength={200}
            value={typedName}
            onChange={(e) => {
              setTypedName(e.target.value);
              if (error?.field === "name") setError(null);
            }}
            aria-describedby={`${ids.nameHelp}${error?.field === "name" ? ` ${ids.error}` : ""}`}
            aria-invalid={error?.field === "name" ? "true" : undefined}
            className={inputCls}
          />
          <p id={ids.nameHelp} className="mt-1 text-xs text-slate-500">
            Type your name exactly as it appears on the document{expectedName ? ` (${expectedName})` : ""}.
            {method === "DRAWN" ? " It is required with a drawn signature too." : ""}
          </p>
          {method === "TYPED" && typedName.trim() && (
            <p className="mt-2 rounded-lg border border-slate-200 bg-white px-3 py-2 font-serif text-2xl italic text-slate-800" aria-hidden="true">
              {typedName}
            </p>
          )}
        </div>

        {method === "DRAWN" && (
          <div>
            <p className="mb-1.5 block text-sm font-semibold text-slate-700">Draw your signature</p>
            <SignaturePad id={ids.pad} onChange={setDrawn} disabled={!agreed} />
          </div>
        )}
      </fieldset>

      {errorBox}

      <div className="flex flex-col-reverse gap-2 border-t border-slate-100 pt-4 sm:flex-row sm:items-center sm:justify-between">
        {decline ? (
          <button type="button" className={dangerBtn} onClick={() => { setDeclining(true); setError(null); }} disabled={busy}>
            <XCircle size={16} aria-hidden="true" /> Decline
          </button>
        ) : <span />}
        <button type="submit" className={primaryBtn} disabled={!canSign}>
          {busy ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : <CheckCircle2 size={16} aria-hidden="true" />}
          {signLabel}
        </button>
      </div>
      {busy && <p className="text-right text-xs text-slate-500" role="status">Recording your signature securely. Please keep this page open for a moment.</p>}
      {!canSign && !busy && (
        <p className="text-right text-xs text-slate-500" aria-live="polite">
          {!agreed
            ? "Tick the statement to continue."
            : needsOtp && !otpInfo
              ? "Send yourself a code to continue."
              : needsOtp && !otpOk
                ? "Enter the 6-digit code."
                : !typedName.trim()
                  ? "Type your full name."
                  : !drawnOk
                    ? "Draw your signature, or switch to Type."
                    : ""}
        </p>
      )}
    </form>
  );
}
