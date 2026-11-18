// "Did you mean name@gmail.com?" under an email box when the domain is a well-known typo (gmial.com, hotmial.com …).
// A suggestion only: the address can still be saved as typed (QA report #13, BUG-8 / BUG-25).
import { suggestEmail } from "../utils/realEmail";

export default function EmailSuggestion({ value, onAccept }) {
  const suggestion = suggestEmail(value);
  if (!suggestion) return null;
  return (
    <p className="mt-1.5 flex flex-wrap items-center gap-x-1.5 rounded-lg bg-amber-50 px-2.5 py-1.5 text-xs text-amber-800 ring-1 ring-inset ring-amber-200" role="status">
      <span className="min-w-0 break-all">Did you mean <span className="font-semibold">{suggestion}</span>?</span>
      <button type="button" onClick={() => onAccept(suggestion)} className="font-semibold text-amber-900 underline hover:no-underline">Use it</button>
    </p>
  );
}
