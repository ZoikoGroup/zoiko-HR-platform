import { useEffect, useRef } from "react";
import { Check, PenTool, ShieldCheck, MapPin, Phone } from "lucide-react";
import useStayOnPage from "./useStayOnPage";

// Shown after the new hire submits their pre-onboarding details in the portal. White and blue, matching the
// "onboarding complete" page: a clear confirmation and what was recorded. A final page: no buttons, and the browser's
// Back button keeps the new hire here. Remaining steps are reached again from the onboarding link in their e-mail.

export default function DetailsSubmitted({ organizationName, candidateName, details, phone, released = 0, nextActions = 0 }) {
  const headingRef = useRef(null);
  useStayOnPage();
  useEffect(() => { headingRef.current?.focus(); }, []);
  const first = (candidateName || "").trim().split(/\s+/)[0];
  const address = [details?.address, details?.city, details?.state, details?.postal_code, details?.country].filter(Boolean).join(", ");

  return (
    <div className="min-h-screen overflow-x-hidden bg-white">
      <div className="h-56 bg-gradient-to-b from-blue-50 via-blue-50/60 to-white sm:h-64" aria-hidden="true" />
      <main className="relative mx-auto -mt-44 max-w-xl px-4 pb-12 sm:-mt-52">
        <p className="mb-6 text-center text-sm font-semibold text-slate-600">{organizationName}</p>

        <section className="rounded-3xl border border-slate-200/80 bg-white px-6 py-10 text-center shadow-[0_20px_60px_-25px_rgba(37,99,235,0.35)] sm:px-10" role="status">
          <div className="mx-auto grid h-20 w-20 place-items-center rounded-full bg-blue-50 ring-8 ring-blue-50/60">
            <span className="grid h-14 w-14 place-items-center rounded-full bg-blue-600 text-white shadow-lg shadow-blue-600/30">
              <Check size={30} strokeWidth={3} aria-hidden="true" />
            </span>
          </div>
          <p className="mt-6 text-xs font-bold uppercase tracking-[0.2em] text-blue-600">Submission successful</p>
          <h1 ref={headingRef} tabIndex={-1} className="mt-2 text-2xl font-semibold tracking-tight text-slate-900 outline-none sm:text-3xl">
            Details submitted{first ? `, ${first}` : ""}
          </h1>
          <p className="mx-auto mt-3 max-w-sm text-sm leading-6 text-slate-600">
            Thank you. Your contact and address details have been sent securely to {organizationName || "HR"}.
          </p>

          <dl className="mt-8 space-y-px overflow-hidden rounded-2xl border border-slate-200 bg-slate-200 text-left">
            <div className="flex items-start gap-3 bg-white px-4 py-3">
              <Phone size={16} className="mt-0.5 shrink-0 text-blue-600" aria-hidden="true" />
              <div className="min-w-0">
                <dt className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Phone</dt>
                <dd className="mt-0.5 break-words text-sm font-semibold text-slate-800">{phone || "—"}</dd>
              </div>
            </div>
            <div className="flex items-start gap-3 bg-white px-4 py-3">
              <MapPin size={16} className="mt-0.5 shrink-0 text-blue-600" aria-hidden="true" />
              <div className="min-w-0">
                <dt className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Residential address</dt>
                <dd className="mt-0.5 break-words text-sm font-semibold text-slate-800">{address || "—"}</dd>
              </div>
            </div>
          </dl>

          {(released > 0 || nextActions > 0) && (
            <div className="mt-6 flex items-start gap-3 rounded-2xl border border-blue-100 bg-blue-50/70 p-4 text-left">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-white text-blue-600"><PenTool size={16} aria-hidden="true" /></span>
              <div>
                <p className="text-sm font-semibold text-blue-900">
                  {released > 0
                    ? `${released} ${released === 1 ? "agreement is" : "agreements are"} now ready for your signature`
                    : `${nextActions} onboarding ${nextActions === 1 ? "step is" : "steps are"} still waiting for you`}
                </p>
                <p className="mt-0.5 text-xs text-blue-800/80">Open the onboarding link in your e-mail again whenever you are ready to complete them.</p>
              </div>
            </div>
          )}

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
