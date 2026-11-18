/*
 * Loading state of the offer letter preview: a letter "being written" (shimmering lines appear one after another under a
 * moving pen), an indeterminate progress bar and the step being worked on. It is a live status region, and every motion
 * stops for people who ask for reduced motion.
 */
import { useEffect, useState } from "react";
import { FileSignature } from "lucide-react";

const STEPS = ["Gathering the offer terms", "Laying out the letter", "Preparing the preview"];
const LINES = ["w-11/12", "w-10/12", "w-9/12", "w-11/12", "w-7/12", "w-10/12", "w-8/12"];

const CSS = `
@keyframes oll-shimmer { 0% { background-position: -200% 0 } 100% { background-position: 200% 0 } }
@keyframes oll-write { 0% { transform: scaleX(0); opacity: .4 } 60%, 100% { transform: scaleX(1); opacity: 1 } }
@keyframes oll-pen { 0% { transform: translate(0, 0) rotate(-8deg) } 50% { transform: translate(120px, 6px) rotate(6deg) } 100% { transform: translate(0, 0) rotate(-8deg) } }
@keyframes oll-bar { 0% { transform: translateX(-100%) } 100% { transform: translateX(250%) } }
@keyframes oll-float { 0%, 100% { transform: translateY(0) } 50% { transform: translateY(-4px) } }
.oll-line { background: linear-gradient(90deg, #e2e8f0 25%, #f1f5f9 50%, #e2e8f0 75%); background-size: 200% 100%;
  transform-origin: left; animation: oll-write 1.6s ease-out both, oll-shimmer 1.8s linear infinite; }
.oll-pen { animation: oll-pen 2.4s ease-in-out infinite; }
.oll-bar { animation: oll-bar 1.4s ease-in-out infinite; }
.oll-float { animation: oll-float 3s ease-in-out infinite; }
@media (prefers-reduced-motion: reduce) { .oll-line, .oll-pen, .oll-bar, .oll-float { animation: none !important; } }
`;

export default function OfferLetterLoading({ candidateName, title = "Preparing the offer letter" }) {
  const [step, setStep] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setStep((s) => Math.min(s + 1, STEPS.length - 1)), 1400);
    return () => clearInterval(t);
  }, []);

  return (
    <div role="status" aria-live="polite" data-testid="offer-letter-loading"
      className="relative flex min-h-[22rem] flex-col items-center justify-center overflow-hidden rounded-2xl border border-blue-100 bg-gradient-to-b from-blue-50/80 via-white to-white px-4 py-8">
      <style>{CSS}</style>
      <div aria-hidden="true" className="oll-float relative w-full max-w-sm rounded-xl border border-slate-200 bg-white p-5 shadow-lg shadow-blue-100/60">
        <div className="mb-4 flex items-center justify-between">
          <div className="h-3 w-24 rounded-full bg-blue-200" />
          <div className="h-6 w-6 rounded-md bg-blue-100" />
        </div>
        <div className="mb-3 h-2.5 w-1/3 rounded-full bg-slate-300" />
        <div className="space-y-2.5">
          {LINES.map((w, i) => (
            <div key={i} className={`oll-line h-2 rounded-full ${w}`} style={{ animationDelay: `${i * 0.18}s, 0s` }} />
          ))}
        </div>
        <div className="mt-5 flex items-end justify-between">
          <div className="space-y-1.5">
            <div className="h-2 w-20 rounded-full bg-slate-200" />
            <div className="h-2 w-14 rounded-full bg-slate-200" />
          </div>
          <div className="relative h-8 w-28 border-b-2 border-dashed border-blue-200">
            <FileSignature className="oll-pen absolute -top-3 left-0 h-6 w-6 text-blue-600" />
          </div>
        </div>
      </div>

      <p className="mt-6 text-sm font-semibold text-slate-900">{title}{candidateName ? ` for ${candidateName}` : ""}</p>
      <p className="mt-1 text-xs text-slate-500">{STEPS[step]}…</p>
      <div className="mt-3 h-1.5 w-56 overflow-hidden rounded-full bg-blue-100" aria-hidden="true">
        <div className="oll-bar h-full w-2/5 rounded-full bg-gradient-to-r from-blue-500 to-indigo-500" />
      </div>
      <ol className="mt-4 flex flex-wrap justify-center gap-x-4 gap-y-1 text-[11px]" aria-hidden="true">
        {STEPS.map((s, i) => (
          <li key={s} className={`flex items-center gap-1.5 ${i <= step ? "text-blue-700" : "text-slate-400"}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${i < step ? "bg-blue-600" : i === step ? "bg-blue-500 motion-safe:animate-pulse" : "bg-slate-300"}`} />
            {s}
          </li>
        ))}
      </ol>
    </div>
  );
}
