/**
 * components/PhoneField.jsx
 * -------------------------
 * A phone number as a country calling code + the national number (B8). The value handed to `onChange` is "+91 98765 43210"
 * (or "" when the number box is empty); the server validates it for that country (app/core/field_rules.py) and stores E.164.
 * Only digits, spaces and + - ( ) can be typed; a pasted value is cleaned and the person is told.
 */
import { useEffect, useMemo, useState } from "react";
import SearchableSelect from "./SearchableSelect";
import { parsePhoneNumberFromString } from "libphonenumber-js/max";
import { COUNTRY_CHOICES, callingCode, countryIso, DEFAULT_PHONE_REGION, phoneInputFilter } from "../utils/fieldRules";

/** Width / flex classes a page may pass for a plain input; this component sets its own (w-full, flex-1, min-w-0 …). */
const stripLayout = (cls) => String(cls || "").replace(/(^|\s)(?:[a-z]+:)?(?:w|min-w|max-w|flex|grow|shrink|basis)(?:-\S+)?(?=\s|$)/g, " ")
  .replace(/\s+/g, " ").trim();

function split(value, fallbackIso) {
  const text = String(value || "").trim();
  if (text.startsWith("+")) {
    const parsed = parsePhoneNumberFromString(text);
    if (parsed?.country) return { iso: parsed.country, national: parsed.formatNational() };
    const code = text.match(/^\+(\d{1,3})\s*/);
    const iso = COUNTRY_CHOICES.find((c) => code && callingCode(c.code) === `+${code[1]}`)?.code || fallbackIso;
    return { iso, national: code ? text.slice(code[0].length) : text };
  }
  return { iso: fallbackIso, national: text };
}

/** "+91", "91", "india", "IN": what a person may type to find a country. */
function matchCountry(option, query) {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const digits = q.replace(/[^\d]/g, "");
  if (digits && /^\+?\d+$/.test(q)) return option.dial.replace("+", "").startsWith(digits);
  return option.name.toLowerCase().includes(q) || option.value.toLowerCase() === q;
}

export default function PhoneField({
  id, value, onChange, onBlur, country, invalid, describedBy, className = "", selectClassName = "", disabled, required, placeholder,
}) {
  const fallbackIso = countryIso(country) || DEFAULT_PHONE_REGION;
  const initial = useMemo(() => split(value, fallbackIso), []); // eslint-disable-line react-hooks/exhaustive-deps
  const [iso, setIso] = useState(initial.iso);
  const [national, setNational] = useState(initial.national);
  const [cleanedNote, setCleanedNote] = useState("");

  // a value set from outside (a record loaded for editing, a reset form) is shown as it is
  useEffect(() => {
    const next = split(value, fallbackIso);
    const current = national.trim() ? `${callingCode(iso)} ${national.trim()}` : "";
    if ((value || "") !== current) {
      setIso(next.iso);
      setNational(next.national);
    }
  }, [value]); // eslint-disable-line react-hooks/exhaustive-deps

  // the country of the record changed and nothing has been typed yet: follow it
  useEffect(() => {
    if (!national.trim()) setIso(fallbackIso);
  }, [fallbackIso]); // eslint-disable-line react-hooks/exhaustive-deps

  const emit = (nextIso, nextNational) => onChange?.(nextNational.trim() ? `${callingCode(nextIso)} ${nextNational.trim()}` : "");

  const options = useMemo(
    () => COUNTRY_CHOICES.map((c) => ({ ...c, dial: callingCode(c.code) })).filter((c) => c.dial)
      .map((c) => ({ ...c, value: c.code, label: `${c.dial} ${c.name}`, display: `${c.dial} ${c.code}` })),
    [],
  );

  return (
    // The layout belongs to this component (QA report #17, BUG-15): whatever classes a page passes, the code box keeps a fixed
    // width and the number box keeps room to type; on very narrow screens the number box wraps below instead of collapsing.
    <div className="flex w-full flex-wrap gap-2 sm:flex-nowrap">
      <SearchableSelect
        options={options}
        value={iso}
        disabled={disabled}
        onChange={(next) => { setIso(next); emit(next, national); }}
        ariaLabel="Phone country code"
        searchLabel="Search countries"
        listLabel="Countries"
        searchPlaceholder="Search country or code"
        noMatchText="No country matches"
        match={matchCountry}
        listWidth={288}
        renderOption={(o) => (<><span className="w-12 shrink-0 tabular-nums text-gray-500">{o.dial}</span><span className="truncate">{o.name}</span></>)}
        // the code box is always narrow: a width class passed in for the number box (w-full) must not stretch it and push
        // the number box off the screen
        className={`${stripLayout(`${className} ${selectClassName}`)} w-28 shrink-0 grow-0`}
      />
      <div className="min-w-[9rem] flex-1">
        <input
          id={id}
          type="tel"
          inputMode="tel"
          autoComplete="tel-national"
          maxLength={20}
          value={national}
          disabled={disabled}
          required={required}
          placeholder={placeholder || (iso === "IN" ? "98765 43210" : iso === "US" ? "(415) 555-2671" : "")}
          aria-invalid={invalid ? "true" : undefined}
          aria-describedby={[describedBy, cleanedNote ? `${id}-cleaned` : null].filter(Boolean).join(" ") || undefined}
          onChange={(e) => {
            const typed = e.target.value;
            const allowed = phoneInputFilter(typed);
            setCleanedNote(allowed !== typed ? "Only digits, spaces and + - ( ) can be used in a phone number." : "");
            setNational(allowed);
            emit(iso, allowed);
          }}
          onBlur={onBlur}
          className={`${stripLayout(className)} w-full`}
        />
        {cleanedNote && <p id={`${id}-cleaned`} className="mt-1 text-xs text-amber-700">{cleanedNote}</p>}
      </div>
    </div>
  );
}
