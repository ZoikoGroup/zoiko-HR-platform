/*
 * The organisation's welcome message on the onboarding portal (and the Settings preview). The server renders it once for
 * the e-mail and the portal (backend app/modules/hr/welcome_message.py): `blocks` are headings ("## " lines) and
 * paragraphs whose single line breaks are kept. Everything is plain text, so React escapes it; raw HTML is never shown.
 * A long message is shown as a few lines with "Read more" so the steps below stay in view on a phone.
 */
import { Fragment, useId, useState } from "react";
import { ChevronDown } from "lucide-react";

const LONG = 320;           // characters shown before "Read more"

/** Server blocks -> a safe, normalised list (unknown shapes are dropped). */
export function normaliseBlocks(blocks) {
  if (!Array.isArray(blocks)) return [];
  return blocks
    .map((b) => (b && b.type === "heading" && typeof b.text === "string" ? { type: "heading", text: b.text }
      : b && b.type === "paragraph" && Array.isArray(b.lines) ? { type: "paragraph", lines: b.lines.map(String) } : null))
    .filter(Boolean);
}

export function blocksLength(blocks) {
  return normaliseBlocks(blocks).reduce((n, b) => n + (b.type === "heading" ? b.text.length : b.lines.join(" ").length), 0);
}

export default function WelcomeMessage({ blocks, signature, collapsible = true }) {
  const items = normaliseBlocks(blocks);
  const long = collapsible && blocksLength(items) > LONG;
  const [open, setOpen] = useState(false);
  const id = useId();
  if (!items.length) return null;

  return (
    <section aria-label="Welcome message" className="mt-5 rounded-2xl border border-blue-100 bg-gradient-to-br from-blue-50/80 via-white to-sky-50/60 p-4 sm:p-5">
      <div id={id} className={`relative space-y-2.5 text-sm leading-6 text-slate-600 ${long && !open ? "max-h-36 overflow-hidden" : ""}`}>
        {items.map((b, i) => (b.type === "heading"
          ? <h2 key={i} className="pt-1 text-base font-semibold text-slate-900 first:pt-0">{b.text}</h2>
          : (
            <p key={i} className="break-words">
              {b.lines.map((line, j) => <Fragment key={j}>{j > 0 && <br />}{line}</Fragment>)}
            </p>
          )))}
        {signature && <p className="pt-1 font-medium text-slate-800">{signature}</p>}
        {long && !open && (
          <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 bottom-0 h-14 bg-gradient-to-t from-white to-transparent" />
        )}
      </div>
      {long && (
        <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-controls={id}
          className="mt-2 inline-flex items-center gap-1 rounded-lg px-1 py-1 text-sm font-semibold text-blue-700 hover:text-blue-900">
          {open ? "Show less" : "Read more"}
          <ChevronDown className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`} aria-hidden="true" />
        </button>
      )}
    </section>
  );
}
