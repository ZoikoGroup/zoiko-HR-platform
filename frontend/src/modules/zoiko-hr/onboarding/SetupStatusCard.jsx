/*
 * "Onboarding documents setup": how ready the organisation is to generate its onboarding documents, step by step, each
 * step linking to where it is fixed. Shown at the top of Onboarding Settings and (compact) on the Onboarding dashboard.
 * A progress ring shows the required steps done; each step is a tile with its state.
 */
import { useCallback, useEffect, useState } from "react";
import { ArrowRight, CheckCircle2, Circle, CircleAlert, RefreshCw, Rocket } from "lucide-react";
import { Link } from "react-router-dom";
import { getSetupStatus } from "../../../service/onboardingSetupService";
import { SectionLink } from "./settingsUi";

/** A circular progress indicator (percent 0–100). */
export function ProgressRing({ percent, size = 64, stroke = 7, done = false }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const p = Math.max(0, Math.min(100, Number(percent) || 0));
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90" aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} className="stroke-blue-100" />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} strokeLinecap="round"
          className={`${done ? "stroke-emerald-500" : "stroke-blue-600"} transition-[stroke-dashoffset] duration-700 ease-out`}
          strokeDasharray={c} strokeDashoffset={c - (c * p) / 100} />
      </svg>
      <span className="absolute inset-0 grid place-items-center text-sm font-bold text-gray-900">{p}%</span>
    </div>
  );
}

function Skeleton() {
  return (
    <div className="animate-pulse rounded-2xl border border-gray-200/80 bg-white p-5 shadow-sm" role="status" aria-label="Checking your onboarding documents setup">
      <div className="flex items-center gap-4">
        <div className="h-16 w-16 rounded-full bg-blue-50" />
        <div className="flex-1 space-y-2">
          <div className="h-4 w-56 max-w-full rounded bg-gray-100" />
          <div className="h-3 w-40 max-w-full rounded bg-gray-100" />
        </div>
      </div>
      <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {[0, 1, 2].map((i) => <div key={i} className="h-16 rounded-xl bg-gray-50" />)}
      </div>
      <span className="sr-only">Checking your onboarding documents setup…</span>
    </div>
  );
}

export default function SetupStatusCard({ compact = false, refreshKey = 0 }) {
  const [status, setStatus] = useState(null);
  const [error, setError] = useState("");

  const load = useCallback((fresh = false) => {
    setError("");
    if (fresh) setStatus(null);
    return getSetupStatus(fresh ? { fresh: true } : undefined)
      .then((s) => setStatus(s))
      .catch((e) => setError(e?.message || "Setup status unavailable."));
  }, []);

  useEffect(() => {
    let live = true;
    getSetupStatus().then((s) => live && setStatus(s)).catch((e) => live && setError(e?.message || "Setup status unavailable."));
    return () => { live = false; };
  }, []);
  // re-checked after the page saves; the tiles stay on screen until the new check arrives
  useEffect(() => {
    if (!refreshKey) return undefined;
    let live = true;
    getSetupStatus({ fresh: true }).then((s) => live && setStatus(s)).catch(() => {});
    return () => { live = false; };
  }, [refreshKey]);

  if (error) {
    if (compact) return null;            // the dashboard simply leaves the card out
    return (
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-gray-200/80 bg-white px-4 py-3 text-sm text-gray-600 shadow-sm">
        <span>The setup check could not run just now: {error}</span>
        <button type="button" onClick={() => load(true)}
          className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-blue-700 hover:bg-blue-50">
          <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />Try again
        </button>
      </div>
    );
  }
  if (!status) return <Skeleton />;

  const steps = compact ? status.steps.filter((s) => s.required || !s.done) : status.steps;
  return (
    <section aria-labelledby="setup-status-title"
      className={`relative overflow-hidden rounded-2xl border p-4 shadow-sm sm:p-5 ${status.ready ? "border-emerald-200 bg-gradient-to-br from-emerald-50/70 to-white" : "border-blue-100 bg-gradient-to-br from-blue-50/60 via-white to-white"}`}>
      <div aria-hidden="true" className="pointer-events-none absolute -right-12 -top-12 h-40 w-40 rounded-full bg-blue-100/40" />
      <div className="relative flex flex-wrap items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-4">
          <ProgressRing percent={status.percent} done={status.ready} />
          <div className="min-w-0">
            <h2 id="setup-status-title" className="inline-flex items-center gap-2 text-base font-semibold text-gray-900">
              <Rocket className="h-4 w-4 text-blue-600" aria-hidden="true" />Onboarding documents setup
            </h2>
            <p className="text-sm text-gray-600">
              {status.ready ? "Ready: every required step is done." : `${status.done} of ${status.required} required steps done.`}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="h-2 w-32 overflow-hidden rounded-full bg-gray-100 sm:w-40" role="progressbar" aria-valuenow={status.percent}
            aria-valuemin={0} aria-valuemax={100} aria-label="Setup progress">
            <div className={`h-full rounded-full ${status.ready ? "bg-emerald-500" : "bg-gradient-to-r from-blue-500 to-blue-700"}`} style={{ width: `${status.percent}%` }} />
          </div>
          {!compact && (
            <button type="button" onClick={() => load(true)} aria-label="Check the setup again"
              className="rounded-lg p-1.5 text-gray-400 hover:bg-white hover:text-blue-700">
              <RefreshCw className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>
      <ol className="relative mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {steps.map((s, i) => (
          <li key={s.key}>
            <SectionLink as={Link} to={s.path}
              className={`group flex h-full items-start gap-2.5 rounded-xl border p-3 transition hover:-translate-y-0.5 hover:shadow-md ${
                s.done ? "border-emerald-100 bg-white/90" : s.required ? "border-amber-200 bg-amber-50/40" : "border-gray-100 bg-white/90"}`}>
              <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs font-bold ${
                s.done ? "bg-emerald-100 text-emerald-700" : s.required ? "bg-amber-100 text-amber-700" : "bg-gray-100 text-gray-500"}`}>
                {s.done ? <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                  : s.required ? <CircleAlert className="h-4 w-4" aria-hidden="true" /> : <Circle className="h-4 w-4" aria-hidden="true" />}
                <span className="sr-only">{i + 1}</span>
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium text-gray-900">{s.title}{!s.required ? <span className="font-normal text-gray-400"> · optional</span> : null}</span>
                <span className="block text-xs leading-5 text-gray-600">{s.detail}</span>
              </span>
              <ArrowRight className="mt-1 h-3.5 w-3.5 shrink-0 text-gray-300 transition group-hover:translate-x-0.5 group-hover:text-blue-600" aria-hidden="true" />
            </SectionLink>
          </li>
        ))}
      </ol>
    </section>
  );
}
