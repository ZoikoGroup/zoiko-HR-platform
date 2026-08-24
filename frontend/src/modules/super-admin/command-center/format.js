export const BLUE = "#3B82F6";
export const BLUE_DARK = "#2563EB";
export const EMERALD = "#10B981";
export const AMBER = "#F59E0B";
export const RED = "#EF4444";
export const INK = "#0A1128";
export const INK_SOFT = "#475569";
export const SLATE_LINE = "rgba(10,17,40,0.08)";

export function formatCurrencyFromCents(cents) {
  const value = (cents || 0) / 100;
  if (Math.abs(value) >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M`;
  if (Math.abs(value) >= 1_000) return `$${(value / 1_000).toFixed(1)}K`;
  return `$${value.toFixed(0)}`;
}

export function formatCompactNumber(value) {
  const n = Number(value || 0);
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return `${n}`;
}

export function formatDeltaPct(deltaPct) {
  if (deltaPct === null || deltaPct === undefined) return null;
  const sign = deltaPct > 0 ? "+" : "";
  return `${sign}${deltaPct.toFixed(1)}%`;
}

export function formatRelativeAge(dateStr) {
  if (!dateStr) return "—";
  const then = new Date(dateStr).getTime();
  if (Number.isNaN(then)) return "—";
  const diffMs = Date.now() - then;
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ${mins % 60}m`;
  const days = Math.floor(hours / 24);
  return `${days}d ${hours % 24}h`;
}

export const SEVERITY_META = {
  critical: { label: "Critical", bg: "bg-red-50", text: "text-red-600", border: "border-red-200/60" },
  high: { label: "High", bg: "bg-amber-50", text: "text-amber-600", border: "border-amber-200/60" },
  medium: { label: "Medium", bg: "bg-amber-50", text: "text-amber-600", border: "border-amber-200/60" },
  low: { label: "Low", bg: "bg-slate-100", text: "text-slate-600", border: "border-slate-200/60" },
};

export const HEALTH_STATUS_META = {
  healthy: { label: "Healthy", dot: "bg-emerald-500", text: "text-emerald-600" },
  warning: { label: "Degraded", dot: "bg-amber-500", text: "text-amber-600" },
  down: { label: "Down", dot: "bg-red-500", text: "text-red-600" },
};
