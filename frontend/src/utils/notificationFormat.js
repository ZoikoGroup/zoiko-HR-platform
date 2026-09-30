/**
 * utils/notificationFormat.js
 * ---------------------------
 * Small pure helpers shared by the bell, the inbox page and the Super Admin view.
 */

/** Badge text: hidden at 0, capped at "99+". */
export function formatBadge(count) {
  const n = Number(count) || 0;
  if (n <= 0) return "";
  return n > 99 ? "99+" : String(n);
}

/** "just now" / "5 min ago" / "3 h ago" / "2 d ago" / "30 Sep 2026". */
export function relativeTime(value, now = Date.now()) {
  const t = new Date(value).getTime();
  if (value === null || value === undefined || value === "" || Number.isNaN(t)) return "";
  const seconds = Math.round((now - t) / 1000);
  if (seconds < 45) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days} d ago`;
  return new Date(t).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }).replace("Sept", "Sep");
}
