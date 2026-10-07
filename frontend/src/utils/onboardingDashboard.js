// Display rules for the Onboarding Dashboard charts.
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "2026-03" -> "Mar 2026"; anything else is shown as it came. */
export function monthLabel(value) {
  const m = /^(\d{4})-(\d{2})$/.exec(String(value ?? ""));
  if (!m) return String(value ?? "");
  const idx = Number(m[2]) - 1;
  return idx >= 0 && idx < 12 ? `${MONTHS[idx]} ${m[1]}` : String(value);
}

/** Bar length as a whole percent of the largest bar; a non-zero value always shows at least a sliver. */
export function barPercent(value, max) {
  const v = Number(value) || 0;
  if (!(max > 0) || v <= 0) return 0;
  return Math.min(100, Math.max(3, Math.round((v / max) * 100)));
}

/**
 * The three parts of the completion bar and their shares of the total. Cancelled hires are left out of the bar
 * (they are not part of onboarding) and reported separately.
 */
export function completionParts(status) {
  const s = status || {};
  const completed = Number(s.completed) || 0;
  const inProgress = Number(s.in_progress) || 0;
  const notStarted = s.not_started != null ? Number(s.not_started) || 0 : Math.max((Number(s.total) || 0) - completed - inProgress - (Number(s.cancelled) || 0), 0);
  const total = completed + inProgress + notStarted;
  const pct = (n) => (total > 0 ? Math.round((n / total) * 100) : 0);
  return {
    total,
    cancelled: Number(s.cancelled) || 0,
    parts: [
      { key: "completed", label: "Completed", value: completed, percent: pct(completed), color: "#22c55e" },
      { key: "in_progress", label: "In Progress", value: inProgress, percent: pct(inProgress), color: "#3b82f6" },
      { key: "not_started", label: "Not Started", value: notStarted, percent: pct(notStarted), color: "#f59e0b" },
    ],
  };
}
