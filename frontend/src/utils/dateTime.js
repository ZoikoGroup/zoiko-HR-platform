// A date-only value ("2026-10-22") is a calendar day, not an instant: `new Date()` would read it as UTC midnight and
// show the day before anywhere west of UTC. Build it in local time instead.
export function parseDateOnly(value) {
  const m = typeof value === "string" && /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null;
}

export function formatDate(value) {
  if (value === null || value === undefined || value === "") return "";
  const d = parseDateOnly(value) || new Date(value);
  if (isNaN(d.getTime())) return value ?? "";
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

// ── clock times (one format for the whole product) ──────────────────────────────────────────────────────────────────
// No organization or user time-format preference is stored yet, so clock times are 12-hour with AM/PM. Durations
// ("7h 45m", a running "05:12:44" timer) are not clock times and never go through these helpers.

/** Default clock style. Pass `hour12: false` only for a value that feeds an <input type="time"> (24-hour "HH:MM"). */
export const DEFAULT_HOUR12 = true;

const pad2 = (n) => String(n).padStart(2, "0");
const ZONED = /(Z|[+-]\d{2}:?\d{2})$/i;                     // an instant (UTC or with an offset), not a wall-clock time

/** {h, m, s} (24-hour) of a value: a wall-clock "HH:MM[:SS]" / "YYYY-MM-DDTHH:MM[:SS]" as written, or an instant
 *  (ISO with Z/offset, Date, epoch ms) read in `timeZone` (an IANA name; the browser's zone when absent or unknown). */
function clockParts(value, timeZone) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "string" && !ZONED.test(value.trim())) {
    const m = /(?:^|[T\s])(\d{1,2}):(\d{2})(?::(\d{2}))?/.exec(value.trim());
    if (!m) return null;
    const p = { h: Number(m[1]), m: Number(m[2]), s: Number(m[3] || 0) };
    return p.h > 23 || p.m > 59 || p.s > 59 ? null : p;
  }
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  const read = (tz) => {
    const parts = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23", timeZone: tz })
      .formatToParts(d);
    const get = (t) => Number(parts.find((p) => p.type === t)?.value);
    return { h: get("hour") % 24, m: get("minute"), s: get("second") };
  };
  try { return read(timeZone); } catch { return read(undefined); }
}

/**
 * The one clock format: "03:08 PM", or "03:08:09 PM" with `seconds`. Two-digit hour, upper-case AM/PM; midnight is
 * "12:00 AM", noon "12:00 PM". Accepts an ISO instant (converted to `timeZone` first), a Date / epoch ms, or a
 * wall-clock "HH:MM[:SS]" string (shown as written). Null / empty -> `empty` ("—"); unreadable text is returned as is.
 *
 * @param {string|number|Date|null|undefined} value
 * @param {{ seconds?: boolean, timeZone?: string, hour12?: boolean, empty?: string }} [opts]
 */
export function formatTime12h(value, { timeZone, seconds = false, hour12 = DEFAULT_HOUR12, empty = "—" } = {}) {
  const p = clockParts(value, timeZone);
  if (!p) return value === null || value === undefined || value === "" ? empty : String(value);
  const tail = `${pad2(p.m)}${seconds ? `:${pad2(p.s)}` : ""}`;
  if (!hour12) return `${pad2(p.h)}:${tail}`;
  return `${pad2(p.h % 12 || 12)}:${tail} ${p.h < 12 ? "AM" : "PM"}`;
}

/** The calendar date ("YYYY-MM-DD") of an instant in `timeZone` (browser zone when absent). */
function localDateIn(value, timeZone) {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  const read = (tz) => new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit", timeZone: tz }).format(d);
  try { return read(timeZone); } catch { return read(undefined); }
}

/**
 * How many calendar days after `workDate` ("YYYY-MM-DD") the instant falls, in `timeZone`: 0 the same day, 1 for an
 * overnight check-out ("+1 day"). Null when either value is missing or unreadable.
 */
export function dayOffset(instant, workDate, timeZone) {
  if (!instant || !workDate) return null;
  const local = localDateIn(instant, timeZone);
  const a = /^(\d{4})-(\d{2})-(\d{2})/.exec(local || "");
  const b = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(workDate));
  if (!a || !b) return null;
  return Math.round((Date.UTC(+a[1], +a[2] - 1, +a[3]) - Date.UTC(+b[1], +b[2] - 1, +b[3])) / 86400000);
}

/** "03:08 PM" in the viewer's time zone. Unreadable input is returned as is (old behaviour). */
export function formatTime(value) {
  const d = new Date(value);
  if (isNaN(d.getTime())) return value ?? "";
  return formatTime12h(d);
}

export function formatDateTime(value) {
  const d = new Date(value);
  if (isNaN(d.getTime())) return value ?? "";
  return `${formatDate(d)}, ${formatTime(d)}`;
}

// `new Date(null)` is the epoch and `new Date("")` is invalid: only a real value may format.
function parseTimestamp(value) {
  if (value === null || value === undefined || value === "") return null;
  const d = new Date(value);
  return isNaN(d.getTime()) ? null : d;
}

/**
 * "30 Sep 2026, 02:05:32 PM GMT+1" — the viewer's local time with an explicit zone,
 * so an audit timestamp is never ambiguous. Missing/unparseable input returns
 * "" / the raw value instead of a bogus 1970 date.
 */
export function formatDateTimeWithZone(value) {
  const d = parseTimestamp(value);
  if (!d) return value ?? "";
  // Recent ICU spells September "Sept" in en-GB; normalise to the 3-letter form.
  const datePart = d
    .toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })
    .replace("Sept", "Sep");
  return `${datePart}, ${formatTime12h(d, { seconds: true })} ${timeZoneLabel(d)}`;
}

/**
 * The viewer's timezone as a short name people recognise. Intl spells India "GMT+5:30" in en-GB/en-US, so
 * India is named IST (the en-IN locale knows it); other zones use Intl's own short name.
 */
export function timeZoneLabel(date = new Date()) {
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone || "";
  const name = (locale) => {
    const part = new Intl.DateTimeFormat(locale, { timeZoneName: "short" }).formatToParts(date).find((p) => p.type === "timeZoneName");
    return part ? part.value : "";
  };
  if (/^Asia\/(Kolkata|Calcutta)$/.test(zone)) return "IST";
  return name("en-GB");
}

/** "2026-09-30 09:21:52 UTC" — the stored instant, for hover text and detail views. */
export function formatUtc(value) {
  const d = parseTimestamp(value);
  if (!d) return value ?? "";
  return `${d.toISOString().slice(0, 19).replace("T", " ")} UTC`;
}
