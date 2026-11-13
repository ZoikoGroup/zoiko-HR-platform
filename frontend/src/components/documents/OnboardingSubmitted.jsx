import { useEffect, useRef } from "react";
import { Check, ClipboardCheck, Mail, CalendarDays, ShieldCheck, FileText } from "lucide-react";
import useStayOnPage from "./useStayOnPage";


// The new hire's "submission successful · onboarding complete" page, shown after they submit their onboarding documents
// (from the portal or straight after their last signature). White and blue, calm, nothing left to do: it has no buttons,
// and the browser's Back button keeps the new hire here instead of returning them to the forms they already submitted.

function when(value, withTime = false) {
  if (!value) return null;
  const d = new Date(String(value).length <= 10 ? `${value}T00:00:00` : `${value}${/[zZ]|[+-]\d\d:?\d\d$/.test(value) ? "" : "Z"}`);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleString(undefined, withTime
    ? { day: "numeric", month: "long", year: "numeric", hour: "numeric", minute: "2-digit" }
    : { day: "numeric", month: "long", year: "numeric" });
}

export default function OnboardingSubmitted({
  organizationName, organizationLogo, candidateName, position, joiningDate, submittedAt, documentsCount,
}) {
  const headingRef = useRef(null);
  useStayOnPage();
  useEffect(() => { headingRef.current?.focus(); }, []);
  const first = (candidateName || "").trim().split(/\s+/)[0];
  const org = organizationName || "your new employer";
  const start = when(joiningDate);
  const steps = [
    { icon: ClipboardCheck, title: "HR reviews your documents", text: `${org}'s HR team checks your signed agreements and uploads.` },
    { icon: Mail, title: "Watch your inbox", text: "You'll receive your account details and anything else needed before day one." },
    { icon: CalendarDays, title: start ? `Your first day: ${start}` : "Your first day", text: "Your manager and team will be ready to welcome you." },
  ];

  return (
    <div className="min-h-screen overflow-x-hidden bg-white">
      <div className="h-56 bg-gradient-to-b from-blue-50 via-blue-50/60 to-white sm:h-64" aria-hidden="true" />
      <main className="relative mx-auto -mt-44 max-w-2xl px-4 pb-12 sm:-mt-52">
        <div className="mb-6 flex items-center justify-center gap-2.5">
          {organizationLogo ? (
            <img src={organizationLogo} alt="" className="h-9 w-9 rounded-lg object-contain" />
          ) : (
            <span className="grid h-9 w-9 place-items-center rounded-lg bg-blue-600 text-white" aria-hidden="true"><FileText size={18} /></span>
          )}
          <span className="text-sm font-semibold text-slate-700">{organizationName}</span>
        </div>

        <section className="rounded-3xl border border-slate-200/80 bg-white px-6 py-10 text-center shadow-[0_20px_60px_-25px_rgba(37,99,235,0.35)] sm:px-12 sm:py-12" role="status">
          <div className="mx-auto grid h-20 w-20 place-items-center rounded-full bg-blue-50 ring-8 ring-blue-50/60">
            <span className="grid h-14 w-14 place-items-center rounded-full bg-blue-600 text-white shadow-lg shadow-blue-600/30">
              <Check size={30} strokeWidth={3} aria-hidden="true" />
            </span>
          </div>
          <p className="mt-6 text-xs font-bold uppercase tracking-[0.2em] text-blue-600">Submission successful</p>
          <h1 ref={headingRef} tabIndex={-1} className="mt-2 text-2xl font-semibold tracking-tight text-slate-900 outline-none sm:text-3xl">
            Onboarding complete{first ? `, ${first}` : ""}
          </h1>
          <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-slate-600">
            Thank you. All your onboarding documents have been signed and submitted to {org}. There is nothing more you need to do here.
          </p>

          <dl className="mx-auto mt-8 grid max-w-lg grid-cols-1 gap-px overflow-hidden rounded-2xl border border-slate-200 bg-slate-200 text-left sm:grid-cols-3">
            {[
              ["Position", position || "—"],
              ["Documents", documentsCount != null ? `${documentsCount} submitted` : "Submitted"],
              ["Submitted", when(submittedAt, true) || "Just now"],
            ].map(([k, v]) => (
              <div key={k} className="bg-white px-4 py-3">
                <dt className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">{k}</dt>
                <dd className="mt-1 break-words text-sm font-semibold text-slate-800">{v}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section className="mt-6 rounded-3xl border border-slate-200/80 bg-white p-6 sm:p-8" aria-labelledby="next-steps">
          <h2 id="next-steps" className="text-sm font-bold text-slate-900">What happens next</h2>
          <ol className="mt-5 space-y-5">
            {steps.map(({ icon: Icon, title, text }, i) => (
              <li key={title} className="flex gap-4">
                <span className="relative grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-blue-50 text-blue-600">
                  <Icon size={18} aria-hidden="true" />
                  {i < steps.length - 1 && <span className="absolute left-1/2 top-10 h-5 w-px -translate-x-1/2 bg-blue-100" aria-hidden="true" />}
                </span>
                <div className="min-w-0 pt-0.5">
                  <p className="text-sm font-semibold text-slate-900">{title}</p>
                  <p className="mt-0.5 text-sm text-slate-500">{text}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>

        <div className="mt-8 flex flex-col items-center gap-3 text-center">
          <p className="text-sm font-medium text-slate-600">You can now close this window.</p>
          <p className="inline-flex items-center gap-1.5 text-xs text-slate-400">
            <ShieldCheck size={14} className="text-blue-500" aria-hidden="true" /> Secured by Zoiko HR
          </p>
        </div>
      </main>
    </div>
  );
}
