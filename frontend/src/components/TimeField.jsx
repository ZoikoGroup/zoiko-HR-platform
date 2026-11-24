/**
 * components/TimeField.jsx
 * ------------------------
 * A time of day with AM / PM (QA bug 10: the browser's <input type="time"> shows a 24-hour "09:00" on many machines, with
 * no AM / PM). Three small lists — hour (1-12), minute, AM / PM — that read the same on every browser and language.
 *
 * value / onChange use "HH:MM" in 24 hours ("14:30"), exactly what <input type="time"> gave, so forms and the API are
 * unchanged. "" means no time. Choosing an hour first fills the minute (":00") and a likely half of the day (7-11 → AM,
 * 12 and 1-6 → PM); both can be changed.
 *
 * `id` goes on the hour list, so <label htmlFor={id}> names the field; the three lists are a labelled group.
 */
import { useMemo, useRef } from "react";

const pad = (n) => String(n).padStart(2, "0");

/** "14:30" → { h12: 2, m: 30, pm: true }; anything unreadable → null. */
export function splitTime(value) {
  const m = /^(\d{1,2}):(\d{2})/.exec(String(value || ""));
  if (!m) return null;
  const h = Number(m[1]), min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return { h12: h % 12 === 0 ? 12 : h % 12, m: min, pm: h >= 12 };
}

/** (2, 30, true) → "14:30" */
export function joinTime(h12, m, pm) {
  const h = (Number(h12) % 12) + (pm ? 12 : 0);
  return `${pad(h)}:${pad(m)}`;
}

/** "14:30" → "2:30 PM" (for summaries next to the field). */
export function label12(value) {
  const t = splitTime(value);
  return t ? `${t.h12}:${pad(t.m)} ${t.pm ? "PM" : "AM"}` : "";
}

export default function TimeField({
  id, value, onChange, onBlur, step = 5, disabled, invalid, describedBy, className = "", label = "Time",
}) {
  const group = useRef(null);
  const t = splitTime(value);
  const minutes = useMemo(() => {
    const list = [];
    for (let m = 0; m < 60; m += Math.max(1, step)) list.push(m);
    if (t && !list.includes(t.m)) list.push(t.m);       // a saved time off the step stays visible
    return list.sort((a, b) => a - b);
  }, [step, t?.m]); // eslint-disable-line react-hooks/exhaustive-deps

  const set = (part, v) => {
    if (part === "h") {
      if (v === "") { onChange?.(""); return; }
      const h12 = Number(v);
      onChange?.(joinTime(h12, t ? t.m : 0, t ? t.pm : !(h12 >= 7 && h12 <= 11)));
    } else if (part === "m") {
      onChange?.(joinTime(t ? t.h12 : 9, Number(v), t ? t.pm : false));
    } else {
      onChange?.(joinTime(t ? t.h12 : 9, t ? t.m : 0, v === "PM"));
    }
  };
  // the field is left when focus moves outside all three lists
  const leave = (e) => { if (onBlur && !group.current?.contains(e.relatedTarget)) onBlur(e); };
  // The page passes its input look (border, colours, radius, height, maybe w-full and px-3.5). Widths and horizontal padding
  // are this field's own: three narrow lists share the row evenly and stay inside it.
  const look = String(className).replace(/(^|\s)(?:[a-z]+:)?(?:w|min-w|max-w|flex|grow|shrink|basis|px|pl|pr)-\S+/g, " ").replace(/\s+/g, " ").trim();
  const box = `${look} w-full min-w-0 pl-2 pr-1 text-sm`;
  const common = { disabled, onBlur: leave, "aria-invalid": invalid ? "true" : undefined, "aria-describedby": describedBy };

  return (
    <div ref={group} role="group" aria-label={label} data-time-field=""
      className="grid w-full min-w-0 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)_minmax(0,1.2fr)] items-center gap-1">
      <select id={id} aria-label={`${label}: hour`} value={t ? String(t.h12) : ""} onChange={(e) => set("h", e.target.value)} className={box} {...common}>
        <option value="">--</option>
        {Array.from({ length: 12 }, (_, i) => i + 1).map((h) => <option key={h} value={h}>{h}</option>)}
      </select>
      <span aria-hidden="true" className="text-gray-400">:</span>
      <select aria-label={`${label}: minutes`} value={t ? String(t.m) : ""} onChange={(e) => set("m", e.target.value)} className={box} {...common}>
        {!t && <option value="">--</option>}
        {minutes.map((m) => <option key={m} value={m}>{pad(m)}</option>)}
      </select>
      <select aria-label={`${label}: AM or PM`} value={t ? (t.pm ? "PM" : "AM") : ""} onChange={(e) => set("p", e.target.value)} className={box} {...common}>
        {!t && <option value="">--</option>}
        <option value="AM">AM</option>
        <option value="PM">PM</option>
      </select>
    </div>
  );
}
