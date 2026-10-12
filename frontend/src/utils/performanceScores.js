// Scores on the performance pages are out of 5. These helpers keep every page honest about that scale.
export const SCALE_MAX = 5;

/** "4.2/5", or "-" when there is no score or it falls outside the scale (so "10/5" can never be shown). */
export function formatScore(value) {
  if (value == null || value === "") return "-";
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0 || n > SCALE_MAX) return "-";
  return `${Math.round(n * 100) / 100}/${SCALE_MAX}`;
}

/** A 0-5 score as a percentage of the scale, or null when there is none / it is out of range. */
export function scorePercent(value) {
  if (value == null || value === "") return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0 || n > SCALE_MAX) return null;
  return Math.round((n / SCALE_MAX) * 1000) / 10;
}

const csvCell = (v) => {
  const text = String(v ?? "");
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

/** Rows -> CSV text, quoting cells that need it. */
export function analyticsRows(rows) {
  return rows.map((r) => r.map(csvCell).join(",")).join("\n");
}
