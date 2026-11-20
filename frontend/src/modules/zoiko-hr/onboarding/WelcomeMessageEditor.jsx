/*
 * Onboarding › Settings › Welcome message: the text of the offer-accepted welcome e-mail and the new hire's portal page.
 *
 * Plain text: "## " starts a heading, a blank line a new paragraph. Placeholders ({{employee_first_name}} …) are filled by the
 * server, which also renders both previews (the same renderer the real e-mail and portal use), so what HR sees here is what
 * the new hire gets. The text is saved with the rest of the page ("Save changes"); "Send test email" sends the text as typed.
 */
import { useEffect, useRef, useState } from "react";
import { AlertCircle, CheckCircle2, Eye, Mail, MonitorSmartphone, RotateCcw, Send } from "lucide-react";
import { previewWelcomeMessage, sendTestWelcomeMessage } from "../../../service/hrService";
import WelcomeMessage from "../../../components/WelcomeMessage";
import { SecondaryButton } from "../recruitment/ui";

export const WELCOME_MAX = 2000;
export const SIGNATURE_MAX = 120;

// mirrors the server's list (it is also returned with the settings); the server is the one that enforces it
export const DEFAULT_PLACEHOLDERS = [
  { key: "company_name", token: "{{company_name}}", label: "Company name" },
  { key: "employee_first_name", token: "{{employee_first_name}}", label: "Employee first name" },
  { key: "start_date", token: "{{start_date}}", label: "Start date" },
  { key: "position", token: "{{position}}", label: "Position" },
  { key: "manager_name", token: "{{manager_name}}", label: "Manager name" },
];

/** Placeholders in the text that the server would refuse. */
export function unknownPlaceholders(text, placeholders = DEFAULT_PLACEHOLDERS) {
  const allowed = new Set(placeholders.map((p) => p.key));
  const bad = [];
  for (const m of String(text || "").matchAll(/\{\{\s*([^{}]*?)\s*\}\}/g)) {
    if (!allowed.has(m[1]) && !bad.includes(m[1])) bad.push(m[1]);
  }
  return bad;
}

const box = (invalid) => `w-full rounded-xl border ${invalid ? "border-rose-300" : "border-gray-200"} px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100`;

const FieldError = ({ msg, id }) => (msg ? <p id={id} role="alert" className="mt-1 inline-flex items-center gap-1 text-xs text-rose-600"><AlertCircle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />{msg}</p> : null);

export default function WelcomeMessageEditor({ message, signature, autoInvite, onMessage, onSignature, errors = {},
  defaultMessage, defaultSignature, placeholders = DEFAULT_PLACEHOLDERS }) {
  const area = useRef(null);
  const [tab, setTab] = useState("email");
  const [preview, setPreview] = useState(null);
  const [previewError, setPreviewError] = useState("");
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [test, setTest] = useState({ state: "", text: "" });

  const len = message.length;
  const bad = unknownPlaceholders(message, placeholders);
  const localError = bad.length
    ? `Unknown placeholder ${bad.map((b) => `{{${b}}}`).join(", ")}. Use one of the buttons above.` : "";
  const messageError = errors.welcome_message || localError;

  // the server renders both previews; debounced so typing stays smooth
  useEffect(() => {
    if (bad.length || len > WELCOME_MAX) return undefined;
    let live = true;
    const t = setTimeout(async () => {
      setLoadingPreview(true);
      try {
        const out = await previewWelcomeMessage({ welcome_message: message, welcome_signature: signature, auto_send_portal_invite: autoInvite });
        if (live) { setPreview(out); setPreviewError(""); }
      } catch (err) {
        if (live) setPreviewError(err?.message || "The preview could not be loaded.");
      } finally {
        if (live) setLoadingPreview(false);
      }
    }, 450);
    return () => { live = false; clearTimeout(t); };
  }, [message, signature, autoInvite]); // eslint-disable-line react-hooks/exhaustive-deps

  const insert = (token) => {
    const el = area.current;
    const start = el ? el.selectionStart : message.length;
    const end = el ? el.selectionEnd : message.length;
    const next = `${message.slice(0, start)}${token}${message.slice(end)}`;
    if (next.length > WELCOME_MAX) return;
    onMessage(next);
    requestAnimationFrame(() => {
      if (!area.current) return;
      area.current.focus();
      area.current.setSelectionRange(start + token.length, start + token.length);
    });
  };

  const sendTest = async () => {
    setTest({ state: "sending", text: "" });
    try {
      const out = await sendTestWelcomeMessage({ welcome_message: message, welcome_signature: signature, auto_send_portal_invite: autoInvite });
      setTest({ state: "sent", text: `Test email sent to ${out?.to || "you"}.` });
    } catch (err) {
      setTest({ state: "error", text: err?.message || "The test email could not be sent." });
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div className="min-w-0">
            <label htmlFor="os-welcome" className="block text-sm font-medium text-gray-800">Welcome message</label>
            <p className="text-xs text-gray-500">
              Sent in the email a candidate gets when they accept their offer, and shown on their pre-onboarding page.
              Start a line with <code className="rounded bg-gray-100 px-1">## </code> for a heading; leave a blank line between paragraphs.
            </p>
          </div>
          <SecondaryButton icon={RotateCcw} onClick={() => onMessage(defaultMessage || "")}
            disabled={!defaultMessage || message === defaultMessage}>Reset to default</SecondaryButton>
        </div>
        <div className="mt-2 flex flex-wrap gap-1.5" role="group" aria-label="Insert a placeholder">
          {placeholders.map((p) => (
            <button key={p.key} type="button" onClick={() => insert(p.token)}
              className="rounded-full border border-blue-200 bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-800 hover:bg-blue-100 focus:outline-none focus:ring-2 focus:ring-blue-300"
              title={`Insert ${p.token}`}>
              + {p.label}
            </button>
          ))}
        </div>
        <textarea id="os-welcome" ref={area} rows={12} value={message} maxLength={WELCOME_MAX}
          aria-invalid={!!messageError} aria-describedby="os-welcome-count os-welcome-error"
          onChange={(e) => onMessage(e.target.value)} className={`mt-2 font-mono ${box(!!messageError)}`} />
        <div className="flex flex-wrap justify-between gap-x-3">
          <FieldError id="os-welcome-error" msg={messageError} />
          <span id="os-welcome-count" aria-live="polite" className={`ml-auto text-xs ${len >= WELCOME_MAX ? "text-rose-600" : "text-gray-500"}`}>
            {len}/{WELCOME_MAX} characters
          </span>
        </div>
      </div>

      <div>
        <label htmlFor="os-welcome-signature" className="block text-sm font-medium text-gray-800">Signed by</label>
        <p className="mb-1 text-xs text-gray-500">The sign-off under the message, followed by your company name.</p>
        <input id="os-welcome-signature" type="text" value={signature} maxLength={SIGNATURE_MAX}
          placeholder={defaultSignature || "Your People & Culture Team"} aria-invalid={!!errors.welcome_signature}
          onChange={(e) => onSignature(e.target.value)} className={`sm:max-w-md ${box(!!errors.welcome_signature)}`} />
        <FieldError msg={errors.welcome_signature} />
      </div>

      <div className="rounded-2xl border border-gray-200 bg-gray-50/60">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-200 px-3 py-2">
          <div role="tablist" aria-label="Preview" className="inline-flex rounded-xl bg-white p-0.5 ring-1 ring-gray-200">
            {[["email", "Email", Mail], ["portal", "Portal page", MonitorSmartphone]].map(([key, label, Icon]) => (
              <button key={key} type="button" role="tab" aria-selected={tab === key} onClick={() => setTab(key)}
                className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold ${tab === key ? "bg-blue-600 text-white" : "text-gray-700 hover:bg-gray-50"}`}>
                <Icon className="h-3.5 w-3.5" aria-hidden="true" />{label}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {loadingPreview && <span className="inline-flex items-center gap-1 text-xs text-gray-500"><Eye className="h-3.5 w-3.5" aria-hidden="true" />Updating preview…</span>}
            <SecondaryButton icon={Send} onClick={sendTest} disabled={test.state === "sending" || !!localError || len > WELCOME_MAX}>
              {test.state === "sending" ? "Sending…" : "Send test email"}
            </SecondaryButton>
          </div>
        </div>
        {test.text && (
          <p role={test.state === "error" ? "alert" : "status"}
            className={`mx-3 mt-2 inline-flex items-center gap-1.5 text-xs ${test.state === "error" ? "text-rose-600" : "text-emerald-700"}`}>
            {test.state === "error" ? <AlertCircle className="h-3.5 w-3.5" aria-hidden="true" /> : <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />}
            {test.text}
          </p>
        )}
        <div className="p-3" role="tabpanel" aria-label={tab === "email" ? "Email preview" : "Portal page preview"}>
          {previewError && <p role="alert" className="mb-2 text-xs text-rose-600">{previewError}</p>}
          {!preview ? (
            <p className="py-6 text-center text-sm text-gray-500">{localError ? "Fix the message to see the preview." : "Loading preview…"}</p>
          ) : tab === "email" ? (
            <div>
              <p className="mb-2 break-words text-xs text-gray-600"><span className="font-semibold text-gray-800">Subject:</span> {preview.subject}</p>
              {/* sandboxed: the e-mail HTML is server-rendered and escaped, and scripts never run here */}
              <iframe title="Welcome email preview" sandbox="" srcDoc={preview.email_html}
                className="h-[560px] w-full rounded-xl border border-gray-200 bg-white" />
            </div>
          ) : (
            <div className="rounded-xl border border-gray-200 bg-white p-3 sm:p-4">
              <p className="text-xs text-gray-500">Shown under the new hire's name on their pre-onboarding page (sample values).</p>
              <WelcomeMessage blocks={preview.blocks} signature={preview.signature} collapsible={false} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
