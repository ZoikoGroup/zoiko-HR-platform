// Employee dashboard: the numbers shown on it, worked out from the person's real data. Kept apart from the page so it can be tested.

const lower = (v) => String(v ?? "").trim().toLowerCase();
const day = (v) => { const d = new Date(v); return Number.isNaN(d.getTime()) ? null : new Date(d.getFullYear(), d.getMonth(), d.getDate()); };
export const isoDate = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export function firstNameOf(profile) {
  const p = profile || {};
  const n = p.firstName || p.first_name || String(p.fullName || p.full_name || "").split(" ")[0] || "";
  return String(n).trim();
}

export function greetingFor(now = new Date()) {
  const h = now.getHours();
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

/** First day of this month as YYYY-MM-DD (the attendance window). */
export function monthStart(now = new Date()) {
  return isoDate(new Date(now.getFullYear(), now.getMonth(), 1));
}

/** Leave left across this year's balances: { remaining, total, pct }. Balances of other years are ignored when this year has some. */
export function leaveTotals(balances, now = new Date()) {
  const list = Array.isArray(balances) ? balances : [];
  const thisYear = list.filter((b) => !b.year || Number(b.year) === now.getFullYear());
  const rows = thisYear.length ? thisYear : list;
  let remaining = 0;
  let total = 0;
  for (const b of rows) {
    const t = Number(b.total_days ?? b.total ?? 0) || 0;
    const used = Number(b.used_days ?? b.used ?? 0) || 0;
    const pending = Number(b.pending_days ?? 0) || 0;
    const left = b.remaining_days ?? b.remaining;
    remaining += left != null && left !== "" ? Number(left) || 0 : Math.max(t - used - pending, 0);
    total += t;
  }
  return { remaining, total, pct: total > 0 ? Math.min(Math.round((remaining / total) * 100), 100) : 0 };
}

const PRESENT_LIKE = new Set(["present", "remote", "late", "half_day", "half day"]);

/** This month's attendance: the share of recorded days the person was there, the on-time count, and the last 7 days as bars. */
export function attendanceSummary(records) {
  const list = (Array.isArray(records) ? records : []).filter((r) => r && r.date);
  const counted = list.filter((r) => !["holiday", "on_leave", "on leave"].includes(lower(r.status)));
  const present = counted.filter((r) => PRESENT_LIKE.has(lower(r.status))).length;
  const onTime = list.filter((r) => ["present", "remote"].includes(lower(r.status))).length;
  const last7 = [...list].sort((a, b) => new Date(a.date) - new Date(b.date)).slice(-7).map((r) => {
    const s = lower(r.status);
    const height = s === "present" || s === "remote" ? 100 : s === "late" || s === "half_day" || s === "half day" ? 60 : s === "absent" ? 12 : 40;
    return { date: r.date, status: s, height };
  });
  return { pct: counted.length ? Math.round((present / counted.length) * 100) : null, recorded: list.length, present, onTime, last7 };
}

/** Requests still waiting for someone to decide: leave, self-service requests, travel and expense claims. */
export function pendingCount({ leaves = [], ess = [], trips = [], claims = [] } = {}) {
  const waiting = (r) => ["pending", "in_progress", "submitted"].includes(lower(r?.status));
  return [leaves, ess, trips, claims].reduce((n, list) => n + (Array.isArray(list) ? list.filter(waiting).length : 0), 0);
}

/** The next holidays from today on: [{ name, date, inDays }]. */
export function upcomingHolidays(holidays, today = new Date(), limit = 3) {
  const t0 = day(today);
  return (Array.isArray(holidays) ? holidays : [])
    .filter((h) => h && h.date && h.is_active !== false)
    .map((h) => ({ name: h.name, date: h.date, d: day(h.date) }))
    .filter((h) => h.d && h.d >= t0)
    .sort((a, b) => a.d - b.d)
    .slice(0, limit)
    .map((h) => ({ name: h.name, date: h.date, inDays: Math.round((h.d - t0) / 86400000) }));
}

export function inDaysText(n) {
  return n === 0 ? "Today" : n === 1 ? "Tomorrow" : `In ${n} days`;
}

/** Newest first: a person's own leave requests, trimmed. */
export function recentLeaves(leaves, limit = 4) {
  return [...(Array.isArray(leaves) ? leaves : [])]
    .sort((a, b) => (new Date(b.created_at || b.start_date || 0) - new Date(a.created_at || a.start_date || 0)) || ((Number(b.id) || 0) - (Number(a.id) || 0)))
    .slice(0, limit);
}
