/*
 * Onboarding › Settings › "Set up docs for your organisation" (/zoiko-hr/onboarding/settings/docs-setup).
 * Six steps with Back / Next; the step is saved on the server, so the admin can leave and resume (one open setup per
 * organisation). The system proposes; the admin decides; Apply changes everything at once, and nothing is sent to new hires.
 */
import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, ArrowRight, Check, Loader2, X } from "lucide-react";
import { cancelDocsSetup, getDocsSetupStatus, openDocsSetupSession, setDocsSetupStep } from "../../../../service/docsSetupService";
import OnboardingLayout from "../OnboardingLayout";
import AnalyseStep from "./AnalyseStep";
import ApplyStep from "./ApplyStep";
import MappingStep from "./MappingStep";
import PackageFormsStep from "./PackageFormsStep";
import ReviewStep from "./ReviewStep";
import UploadStep from "./UploadStep";
import { Banner, STEPS, errorText } from "./shared";

/** May the admin move on from this step? Returns the reason when not. */
export function stepBlocker(step, session) {
  if (!session) return "Loading…";
  if (step === 1 && !(session.files || []).length) return "Upload at least one document.";
  if (step === 2 && session.status !== "review" && session.status !== "applied") return "Run the analysis first.";
  if (step === 3 && (session.unresolved_conflicts || []).length) return "Choose a value for every conflict first.";
  return "";
}

function Stepper({ step, maxStep, onGo }) {
  return (
    <nav aria-label="Setup steps">
      <ol className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        {STEPS.map((s) => {
          const state = s.n === step ? "current" : s.n < step ? "done" : "todo";
          return (
            <li key={s.n}>
              <button type="button" onClick={() => onGo(s.n)} disabled={s.n > maxStep} aria-current={state === "current" ? "step" : undefined}
                className={`flex w-full items-start gap-2 rounded-xl border px-3 py-2 text-left text-sm disabled:cursor-not-allowed disabled:opacity-50 ${
                  state === "current" ? "border-blue-400 bg-blue-50" : state === "done" ? "border-emerald-200 bg-emerald-50/50" : "border-gray-200 bg-white"}`}>
                <span className={`grid h-6 w-6 shrink-0 place-items-center rounded-full text-xs font-semibold ${
                  state === "done" ? "bg-emerald-600 text-white" : state === "current" ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-600"}`}>
                  {state === "done" ? <Check className="h-3.5 w-3.5" aria-hidden="true" /> : s.n}
                </span>
                <span className="min-w-0">
                  <span className="block font-medium text-gray-900">{s.title}</span>
                  <span className="block text-xs text-gray-500">{state === "done" ? "Done" : state === "current" ? "You are here" : s.help}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

export default function DocsSetupWizard() {
  const [session, setSession] = useState(null);
  const [step, setStep] = useState(1);
  const [error, setError] = useState("");
  const [disabled, setDisabled] = useState(false);

  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const status = await getDocsSetupStatus();
        if (!status?.enabled) { if (live) setDisabled(true); return; }
        const s = await openDocsSetupSession();
        if (!live) return;
        setSession(s);
        setStep(s.status === "applied" ? 6 : s.step || 1);
      } catch (e) {
        if (live) setError(errorText(e, "The setup could not be opened."));
      }
    })();
    return () => { live = false; };
  }, []);

  const go = useCallback(async (n) => {
    setStep(n);
    window.scrollTo?.({ top: 0, behavior: "smooth" });
    if (session) {
      try { await setDocsSetupStep(session.id, n); } catch { /* the step is only remembered for resuming */ }
    }
  }, [session]);

  const onSession = useCallback((s) => setSession((prev) => ({ ...prev, ...s })), []);
  const blocker = stepBlocker(step, session);
  const maxStep = !session ? 1 : session.status === "review" || session.status === "applied" ? 6 : (session.files || []).length ? 2 : 1;
  const locked = session && !["uploading", "review"].includes(session.status);

  const cancel = async () => {
    if (!window.confirm("Cancel this setup? Nothing is changed and the uploaded files are deleted after 30 days.")) return;
    try {
      await cancelDocsSetup(session.id);
      setSession(await openDocsSetupSession());
      setStep(1);
    } catch (e) {
      setError(errorText(e, "The setup could not be cancelled."));
    }
  };

  const page = (body) => (
    <OnboardingLayout title="Set up docs for your organisation"
      subtitle="Upload your documents. We propose settings and draft templates; you decide what is used."
      actions={<Link to="/zoiko-hr/onboarding/settings" className="inline-flex items-center gap-2 rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-800 hover:bg-gray-50">
        <ArrowLeft className="h-4 w-4" />Back to Settings</Link>}>
      {body}
    </OnboardingLayout>
  );

  if (disabled) return page(<Banner tone="info">Setting up docs from your own files is not available for your organisation yet.</Banner>);
  if (error && !session) return page(<Banner tone="error">{error}</Banner>);
  if (!session) return page(<p className="inline-flex items-center gap-2 text-sm text-gray-500"><Loader2 className="h-4 w-4 animate-spin" />Opening your setup…</p>);

  const current = STEPS.find((s) => s.n === step);
  return page(
    <div className="space-y-5">
      <Stepper step={step} maxStep={maxStep} onGo={go} />
      {error && <Banner tone="error">{error}</Banner>}
      <section aria-labelledby="docs-setup-step" className="rounded-2xl border border-gray-200/80 bg-white p-4 shadow-sm sm:p-6">
        <h2 id="docs-setup-step" className="mb-4 text-lg font-semibold text-gray-900">Step {step} of 6: {current.title}</h2>
        {step === 1 && <UploadStep session={session} onSession={onSession} locked={locked} />}
        {step === 2 && <AnalyseStep session={session} onSession={onSession} onDone={() => go(3)} />}
        {step === 3 && <ReviewStep session={session} onSession={onSession} />}
        {step === 4 && <MappingStep session={session} />}
        {step === 5 && <PackageFormsStep session={session} />}
        {step === 6 && <ApplyStep session={session} onSession={onSession} />}
      </section>
      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex gap-2">
          <button type="button" onClick={() => go(step - 1)} disabled={step === 1}
            className="inline-flex items-center gap-2 rounded-xl border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-800 hover:bg-gray-50 disabled:opacity-40">
            <ArrowLeft className="h-4 w-4" />Back
          </button>
          {["uploading", "review", "failed"].includes(session.status) && (
            <button type="button" onClick={cancel} className="inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm text-gray-600 hover:bg-gray-100">
              <X className="h-4 w-4" />Cancel setup
            </button>
          )}
        </div>
        {step < 6 && (
          <div className="flex flex-col items-stretch gap-1 sm:items-end">
            <button type="button" onClick={() => go(step + 1)} disabled={!!blocker}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50">
              Next<ArrowRight className="h-4 w-4" />
            </button>
            {blocker && <p className="text-xs text-gray-600" role="status">{blocker}</p>}
          </div>
        )}
      </div>
    </div>
  );
}
