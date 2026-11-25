/*
 * "Onboarding documents setup": how ready the organisation is to generate its onboarding documents, step by step, each
 * step linking to where it is fixed. Shown on the Onboarding dashboard and at the top of Onboarding Settings.
 */
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { CheckCircle2, Circle, CircleAlert, Loader2, Rocket } from "lucide-react";
import { getSetupStatus } from "../../../service/onboardingSetupService";

export default function SetupStatusCard({ compact = false }) {
  const [status, setStatus] = useState(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let live = true;
    getSetupStatus().then((s) => live && setStatus(s)).catch((e) => live && setError(e?.message || "Setup status unavailable."));
    return () => { live = false; };
  }, []);

  if (error) return null;
  if (!status) {
    return (
      <div className="flex items-center rounded-2xl border border-gray-200 bg-white p-4 text-sm text-gray-500" role="status">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />Checking your onboarding documents setup…
      </div>
    );
  }
  const steps = compact ? status.steps.filter((s) => s.required || !s.done) : status.steps;
  return (
    <section aria-labelledby="setup-status-title"
      className={`rounded-2xl border p-4 shadow-sm sm:p-5 ${status.ready ? "border-emerald-200 bg-emerald-50/40" : "border-blue-100 bg-white"}`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-blue-50 text-blue-600" aria-hidden="true"><Rocket className="h-5 w-5" /></span>
          <div className="min-w-0">
            <h2 id="setup-status-title" className="text-base font-semibold text-gray-900">Onboarding documents setup</h2>
            <p className="text-sm text-gray-600">
              {status.ready ? "Ready: every required step is done." : `${status.done} of ${status.required} required steps done.`}
            </p>
          </div>
        </div>
        <div className="h-2 w-full max-w-[12rem] overflow-hidden rounded-full bg-gray-100" role="progressbar" aria-valuenow={status.percent}
          aria-valuemin={0} aria-valuemax={100} aria-label="Setup progress">
          <div className={`h-full ${status.ready ? "bg-emerald-500" : "bg-blue-600"}`} style={{ width: `${status.percent}%` }} />
        </div>
      </div>
      <ol className="mt-3 grid gap-2 sm:grid-cols-2">
        {steps.map((s) => (
          <li key={s.key}>
            <Link to={s.path} className="flex items-start gap-2 rounded-xl border border-gray-100 bg-white/80 p-2.5 hover:border-blue-200 hover:bg-blue-50/40">
              {s.done ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" aria-hidden="true" />
                : s.required ? <CircleAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" aria-hidden="true" />
                  : <Circle className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" aria-hidden="true" />}
              <span className="min-w-0">
                <span className="block text-sm font-medium text-gray-900">{s.title}{!s.required ? <span className="font-normal text-gray-400"> · optional</span> : null}</span>
                <span className="block text-xs text-gray-600">{s.detail}</span>
              </span>
            </Link>
          </li>
        ))}
      </ol>
    </section>
  );
}
