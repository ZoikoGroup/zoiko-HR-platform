/**
 * components/PhoneField.jsx
 * -------------------------
 * A phone number as a country calling code + the national number (B8). The value handed to `onChange` is "+91 98765 43210"
 * (or "" when the number box is empty); the server validates it for that country (app/core/field_rules.py) and stores E.164.
 * Only digits, spaces and + - ( ) can be typed; a pasted value is cleaned and the person is told.
 */
import { useEffect, useMemo, useState } from "react";
import { parsePhoneNumberFromString } from "libphonenumber-js/max";
import { COUNTRY_CHOICES, callingCode, countryIso, DEFAULT_PHONE_REGION, phoneInputFilter } from "../utils/fieldRules";

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
    () => COUNTRY_CHOICES.map((c) => ({ ...c, dial: callingCode(c.code) })).filter((c) => c.dial),
    [],
  );

  return (
    <div className="flex gap-2">
      <select
        aria-label="Phone country code"
        value={iso}
        disabled={disabled}
        onChange={(e) => { setIso(e.target.value); emit(e.target.value, national); }}
        className={`${className} ${selectClassName} w-28 shrink-0`}
      >
        {options.map((c) => <option key={c.code} value={c.code}>{`${c.dial} ${c.name}`}</option>)}
      </select>
      <div className="min-w-0 flex-1">
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
          className={`${className} w-full`}
        />
        {cleanedNote && <p id={`${id}-cleaned`} className="mt-1 text-xs text-amber-700">{cleanedNote}</p>}
      </div>
    </div>
  );
}
