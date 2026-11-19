/*
 * The organisation's welcome message on the onboarding portal. HR writes it as free text (Onboarding › Settings): its
 * blank lines and line breaks become paragraphs, short lines without a full stop ("Your Journey Starts Here") become
 * headings, and a long message is shown as a few lines with "Read more" so the steps below stay in view on a phone.
 */
import { useState } from "react";
import { ChevronDown } from "lucide-react";

const LONG = 320;           // characters shown before "Read more"

export function welcomeBlocks(text) {
  return String(text || "")
    .replace(/\r\n?/g, "\n")
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => ({
      text: line,
      heading: line.length <= 60 && !/[.!?:,;]$/.test(line) && /^[A-Z]/.test(line) && line.split(/\s+/).length <= 8,
    }));
}

export default function WelcomeMessage({ text, fallback }) {
  const blocks = welcomeBlocks(text || fallback);
  const total = blocks.reduce((n, b) => n + b.text.length, 0);
  const long = total > LONG;
  const [open, setOpen] = useState(false);
  if (!blocks.length) return null;

  return (
    <div className="mt-5 rounded-2xl border border-blue-100 bg-gradient-to-br from-blue-50/80 via-white to-sky-50/60 p-4 sm:p-5">
      <div id="welcome-message" className={`relative space-y-2.5 text-sm leading-6 text-slate-600 ${long && !open ? "max-h-36 overflow-hidden" : ""}`}>
        {blocks.map((b, i) => (b.heading
          ? <p key={i} className="pt-1 text-sm font-semibold text-slate-900 first:pt-0">{b.text}</p>
          : <p key={i} className="break-words">{b.text}</p>))}
        {long && !open && (
          <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 bottom-0 h-14 bg-gradient-to-t from-white to-transparent" />
        )}
      </div>
      {long && (
        <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-controls="welcome-message"
          className="mt-2 inline-flex items-center gap-1 rounded-lg px-1 py-1 text-sm font-semibold text-blue-700 hover:text-blue-900">
          {open ? "Show less" : "Read more"}
          <ChevronDown className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`} aria-hidden="true" />
        </button>
      )}
    </div>
  );
}
