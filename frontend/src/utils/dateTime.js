export function formatDate(value) {
  const d = new Date(value);
  if (isNaN(d.getTime())) return value ?? "";
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

export function formatTime(value) {
  const d = new Date(value);
  if (isNaN(d.getTime())) return value ?? "";
  return d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: true });
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
 * "30 Sep 2026, 14:05:32 GMT+1" — the viewer's local time with an explicit zone,
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
  const timePart = new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false, timeZoneName: "short",
  }).format(d);
  return `${datePart}, ${timePart}`;
}

/** "2026-09-30 09:21:52 UTC" — the stored instant, for hover text and detail views. */
export function formatUtc(value) {
  const d = parseTimestamp(value);
  if (!d) return value ?? "";
  return `${d.toISOString().slice(0, 19).replace("T", " ")} UTC`;
}
