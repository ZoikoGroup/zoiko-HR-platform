/*
 * Recruitment design kit — the shared look of the Recruitment screens (dashboard, requisitions, candidates, interviews,
 * offers): page header with the section tabs, KPI cards with trend and sparkline, status pills, avatars, filter controls,
 * tables and the right-hand detail panel. Data comes from the pages; nothing here invents a number.
 */
import { useEffect, useId, useState } from "react";
import { NavLink } from "react-router-dom";
import { ArrowDownRight, ArrowUpRight, Briefcase, Calendar, ChevronDown, ChevronRight, FileCheck2, LayoutDashboard, Search, Send,
  Users, X } from "lucide-react";

export const NAV_ITEMS = [
  { label: "Dashboard", href: "/zoiko-hr/recruitment", icon: LayoutDashboard },
  { label: "Job Requisitions", href: "/zoiko-hr/recruitment/job-requisitions", icon: Briefcase },
  { label: "Candidates", href: "/zoiko-hr/recruitment/candidates", icon: Users },
  { label: "Interviews", href: "/zoiko-hr/recruitment/interviews", icon: Calendar },
  { label: "Offer Management", href: "/zoiko-hr/recruitment/offers", icon: FileCheck2 },
  { label: "Offers Issued", href: "/zoiko-hr/recruitment/offers-issued", icon: Send },
];

// the page each heading belongs to (the header never reads the URL, so it also works where the router is replaced)
const PAGE_OF_TITLE = { "Recruitment Dashboard": "Dashboard", "Candidate Profile": "Candidates" };
function pageFor(title) {
  const label = PAGE_OF_TITLE[title] || title;
  return NAV_ITEMS.find((i) => i.label === label) || NAV_ITEMS[0];
}

// ── tones (icon tiles, pills, sparklines) ───────────────────────────────────────────────────────────────────────────
export const TONES = {
  blue: { tile: "bg-blue-50 text-blue-600", pill: "bg-blue-50 text-blue-700 ring-blue-200", line: "#3b82f6" },
  green: { tile: "bg-emerald-50 text-emerald-600", pill: "bg-emerald-50 text-emerald-700 ring-emerald-200", line: "#10b981" },
  amber: { tile: "bg-amber-50 text-amber-600", pill: "bg-amber-50 text-amber-700 ring-amber-200", line: "#f59e0b" },
  violet: { tile: "bg-violet-50 text-violet-600", pill: "bg-violet-50 text-violet-700 ring-violet-200", line: "#8b5cf6" },
  pink: { tile: "bg-pink-50 text-pink-600", pill: "bg-pink-50 text-pink-700 ring-pink-200", line: "#ec4899" },
  red: { tile: "bg-rose-50 text-rose-600", pill: "bg-rose-50 text-rose-700 ring-rose-200", line: "#f43f5e" },
  gray: { tile: "bg-gray-100 text-gray-600", pill: "bg-gray-100 text-gray-700 ring-gray-200", line: "#9ca3af" },
  teal: { tile: "bg-teal-50 text-teal-600", pill: "bg-teal-50 text-teal-700 ring-teal-200", line: "#14b8a6" },
};

// ── page shell ──────────────────────────────────────────────────────────────────────────────────────────────────────
/**
 * Navy header band in the sidebar's colours (#0A1128 → #111A33): breadcrumb, page icon, heading, subtitle, the page's
 * actions, and the section tabs as folder tabs that join the content below.
 */
export function RecruitmentLayout({ title, subtitle, actions, children }) {
  const page = pageFor(title);
  const PageIcon = page.icon;
  return (
    <div className="min-h-screen bg-slate-50">
      <header className="relative overflow-hidden rounded-b-3xl bg-gradient-to-r from-[#0A1128] via-[#0E1734] to-[#111A33] text-white shadow-[0_10px_30px_rgba(4,7,20,0.25)] sm:rounded-3xl">
        <div aria-hidden="true" className="pointer-events-none absolute -right-24 -top-24 h-64 w-64 rounded-full bg-blue-500/10 blur-3xl" />
        <div className="relative mx-auto max-w-[1600px] px-4 pt-5 sm:px-6 lg:px-8">
          <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-xs text-slate-400">
            <span>Zoiko HR</span><ChevronRight className="h-3 w-3" aria-hidden="true" />
            <span>Recruitment</span><ChevronRight className="h-3 w-3" aria-hidden="true" />
            <span className="font-medium text-slate-200">{title}</span>
          </nav>
          <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
            <div className="flex min-w-0 items-center gap-4">
              <span className="hidden h-12 w-12 shrink-0 place-items-center rounded-2xl bg-white/10 ring-1 ring-white/15 sm:grid" aria-hidden="true">
                <PageIcon className="h-6 w-6 text-blue-300" />
              </span>
              <div className="min-w-0">
                <h1 className="text-2xl font-bold tracking-tight text-white sm:text-[28px]">{title}</h1>
                {subtitle && <p className="mt-1 text-sm text-slate-300">{subtitle}</p>}
              </div>
            </div>
            {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
          </div>
          <nav aria-label="Recruitment sections" className="mt-6 flex gap-1 overflow-x-auto">
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              return (
                <NavLink key={item.href} to={item.href} end={item.href === "/zoiko-hr/recruitment"}
                  className={({ isActive }) => `inline-flex items-center gap-2 whitespace-nowrap rounded-t-xl px-4 py-2.5 text-sm font-medium transition-colors ${
                    isActive ? "bg-slate-50 text-[#0A1128] shadow-[0_-2px_8px_rgba(0,0,0,0.08)]" : "text-slate-300 hover:bg-white/10 hover:text-white"}`}>
                  <Icon className="h-4 w-4" aria-hidden="true" />{item.label}
                </NavLink>
              );
            })}
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-[1600px] px-4 pb-10 pt-6 sm:px-6 lg:px-8">{children}</main>
    </div>
  );
}

// ── buttons ─────────────────────────────────────────────────────────────────────────────────────────────────────────
export function PrimaryButton({ icon: Icon, children, className = "", ...props }) {
  return (
    <button type="button" {...props}
      className={`inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50 ${className}`}>
      {Icon && <Icon className="h-4 w-4" />}{children}
    </button>
  );
}

export function SecondaryButton({ icon: Icon, children, className = "", ...props }) {
  return (
    <button type="button" {...props}
      className={`inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 ${className}`}>
      {Icon && <Icon className="h-4 w-4" />}{children}
    </button>
  );
}

/** A tile button for the detail panel's "Quick Actions" row. */
export function QuickAction({ icon: Icon, label, tone = "default", ...props }) {
  const look = tone === "primary" ? "border-blue-600 bg-blue-600 text-white hover:bg-blue-700"
    : tone === "danger" ? "border-rose-200 bg-rose-50 text-rose-600 hover:bg-rose-100"
    : "border-gray-200 bg-white text-gray-700 hover:bg-gray-50";
  return (
    <button type="button" {...props}
      className={`flex min-w-[64px] flex-1 flex-col items-center gap-1 rounded-xl border px-2 py-2 text-xs font-medium disabled:cursor-not-allowed disabled:opacity-40 ${look}`}>
      {Icon && <Icon className="h-4 w-4" />}{label}
    </button>
  );
}

// ── KPI cards ───────────────────────────────────────────────────────────────────────────────────────────────────────
const WINDOW_TEXT = { "30d": "vs previous 30 days", week: "vs last week", month: "vs last month", day: "vs same day last week" };

export function Sparkline({ points, color = "#3b82f6", height = 36 }) {
  const gid = useId().replace(/:/g, "");
  const vals = (points || []).map((p) => (p == null ? null : Number(p)));
  const known = vals.filter((v) => v != null);
  if (known.length < 2) return <div style={{ height }} aria-hidden="true" />;
  const w = 120;
  const max = Math.max(...known), min = Math.min(...known);
  const span = max - min || 1;
  const step = w / (vals.length - 1);
  const pts = vals.map((v, i) => [i * step, v == null ? null : height - 4 - ((v - min) / span) * (height - 8)]).filter(([, y]) => y != null);
  let d = `M${pts[0][0]},${pts[0][1]}`;
  for (let i = 1; i < pts.length; i++) {
    const [x0, y0] = pts[i - 1], [x1, y1] = pts[i];
    const cx = (x0 + x1) / 2;
    d += ` C${cx},${y0} ${cx},${y1} ${x1},${y1}`;
  }
  const area = `${d} L${pts[pts.length - 1][0]},${height} L${pts[0][0]},${height} Z`;
  return (
    <svg viewBox={`0 0 ${w} ${height}`} preserveAspectRatio="none" className="w-full" style={{ height }} aria-hidden="true">
      <defs>
        <linearGradient id={gid} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.25" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${gid})`} />
      <path d={d} fill="none" stroke={color} strokeWidth="1.75" strokeLinecap="round" />
    </svg>
  );
}

export function Trend({ kpi }) {
  if (!kpi || !kpi.window) return null;          // a plain count with no comparison period claims no trend
  const pct = kpi.change_pct;
  const label = WINDOW_TEXT[kpi.window] || "vs previous period";
  if (pct == null) {
    return <p className="mt-1 text-xs text-gray-400" title="Nothing to compare with in the previous period">No comparison yet</p>;
  }
  const up = pct >= 0;
  const good = kpi.better === "down" ? !up : up;
  const Icon = up ? ArrowUpRight : ArrowDownRight;
  const title = `${kpi.current ?? "–"} now vs ${kpi.previous ?? "–"} (${label.replace(/^vs /, "")})`;
  return (
    <p className="mt-1 flex items-center gap-1 text-xs" title={title}>
      <span className={`inline-flex items-center font-semibold ${pct === 0 ? "text-gray-500" : good ? "text-emerald-600" : "text-rose-600"}`}>
        <Icon className="h-3.5 w-3.5" />{Math.abs(pct)}%
      </span>
      <span className="text-gray-400">{label}</span>
    </p>
  );
}

export function KpiCard({ label, icon: Icon, tone = "blue", kpi, format = (v) => v, loading }) {
  const t = TONES[tone] || TONES.blue;
  const value = kpi?.value;
  return (
    <div className="flex min-w-0 flex-col rounded-2xl border border-gray-200/80 bg-white p-4 shadow-sm">
      <div className="flex items-start gap-3">
        {Icon && <div className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${t.tile}`}><Icon className="h-5 w-5" /></div>}
        <div className="min-w-0">
          <p className="text-xs font-medium leading-snug text-gray-500" title={label}>{label}</p>
          <p className="mt-0.5 text-2xl font-bold text-gray-900">
            {loading ? <span className="inline-block h-6 w-12 animate-pulse rounded bg-gray-100" /> : value == null ? "–" : format(value)}
          </p>
          {!loading && <Trend kpi={kpi} />}
        </div>
      </div>
      <div className="mt-2"><Sparkline points={kpi?.series} color={t.line} /></div>
    </div>
  );
}

export function KpiGrid({ children, cols = 6 }) {
  const grid = { 4: "lg:grid-cols-4", 5: "lg:grid-cols-5", 6: "lg:grid-cols-3 2xl:grid-cols-6" }[cols] || "lg:grid-cols-6";
  return <div className={`grid grid-cols-1 gap-4 sm:grid-cols-2 ${grid}`}>{children}</div>;
}

// ── cards, pills, avatars ───────────────────────────────────────────────────────────────────────────────────────────
export function Card({ title, action, children, className = "", bodyClass = "p-5" }) {
  return (
    <section className={`rounded-2xl border border-gray-200/80 bg-white shadow-sm ${className}`}>
      {(title || action) && (
        <div className="flex items-center justify-between gap-3 px-5 pt-4">
          {title && <h2 className="text-base font-semibold text-gray-900">{title}</h2>}
          {action}
        </div>
      )}
      <div className={bodyClass}>{children}</div>
    </section>
  );
}

export function StatusPill({ tone = "gray", icon: Icon, children }) {
  const t = TONES[tone] || TONES.gray;
  return (
    <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-lg px-2 py-1 text-xs font-medium ring-1 ring-inset ${t.pill}`}>
      {Icon && <Icon className="h-3.5 w-3.5" />}{children}
    </span>
  );
}

const AVATAR_TONES = ["bg-blue-100 text-blue-700", "bg-emerald-100 text-emerald-700", "bg-amber-100 text-amber-700",
  "bg-violet-100 text-violet-700", "bg-pink-100 text-pink-700", "bg-teal-100 text-teal-700", "bg-indigo-100 text-indigo-700"];

export function initials(name) {
  const parts = String(name || "?").trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] || "?") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
}

export function Avatar({ name, size = "md", className = "" }) {
  const s = { xs: "h-6 w-6 text-[10px]", sm: "h-8 w-8 text-xs", md: "h-9 w-9 text-xs", lg: "h-14 w-14 text-lg" }[size];
  let h = 0;
  for (const ch of String(name || "")) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return (
    <span title={name || undefined} aria-hidden="true"
      className={`inline-grid shrink-0 place-items-center rounded-full font-semibold ring-2 ring-white ${s} ${AVATAR_TONES[h % AVATAR_TONES.length]} ${className}`}>
      {initials(name)}
    </span>
  );
}

export function AvatarStack({ names = [], max = 3 }) {
  const shown = names.slice(0, max);
  return (
    <span className="flex items-center" aria-label={names.join(", ") || "No interviewer"}>
      {shown.map((n, i) => <Avatar key={`${n}-${i}`} name={n} size="sm" className={i ? "-ml-2" : ""} />)}
      {names.length > max && <span className="-ml-2 inline-grid h-8 w-8 place-items-center rounded-full bg-gray-100 text-xs font-medium text-gray-600 ring-2 ring-white">+{names.length - max}</span>}
    </span>
  );
}

export function PersonCell({ name, sub }) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <Avatar name={name} />
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-gray-900">{name || "—"}</p>
        {sub && <p className="truncate text-xs text-gray-500">{sub}</p>}
      </div>
    </div>
  );
}

// ── filters and sub-navigation ──────────────────────────────────────────────────────────────────────────────────────
export function SearchInput({ value, onChange, placeholder = "Search…", label = "Search" }) {
  return (
    <label className="relative block min-w-[220px] flex-1">
      <span className="sr-only">{label}</span>
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
      <input type="search" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
        className="w-full rounded-xl border border-gray-200 bg-white py-2 pl-9 pr-3 text-sm text-gray-900 placeholder:text-gray-400 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100" />
    </label>
  );
}

export function FilterSelect({ label, value, onChange, options, allLabel }) {
  const id = useId();
  return (
    <div className="min-w-[140px]">
      <label htmlFor={id} className="mb-1 block text-xs font-medium text-gray-600">{label}</label>
      <div className="relative">
        <select id={id} value={value} onChange={(e) => onChange(e.target.value)}
          className="w-full appearance-none rounded-xl border border-gray-200 bg-white py-2 pl-3 pr-8 text-sm text-gray-800 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100">
          <option value="">{allLabel || `All ${label}`}</option>
          {options.map((o) => {
            const v = typeof o === "object" ? o.value : o;
            const l = typeof o === "object" ? o.label : o;
            return <option key={v} value={v}>{l}</option>;
          })}
        </select>
        <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
      </div>
    </div>
  );
}

/** Underlined text tabs ("All Offers · Offers Issued · …"). */
export function UnderlineTabs({ tabs, value, onChange, label }) {
  return (
    <div role="tablist" aria-label={label} className="flex gap-1 overflow-x-auto border-b border-gray-200">
      {tabs.map((t) => (
        <button key={t.value} type="button" role="tab" aria-selected={value === t.value} onClick={() => onChange(t.value)}
          className={`-mb-px whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium ${value === t.value ? "border-blue-600 text-blue-600" : "border-transparent text-gray-500 hover:text-gray-800"}`}>
          {t.label}{t.count != null && <span className="ml-1 text-gray-400">({t.count})</span>}
        </button>
      ))}
    </div>
  );
}

/** Rounded chips with counts ("All (36) · Drafts (5) · …"). */
export function ChipTabs({ tabs, value, onChange, label }) {
  return (
    <div role="tablist" aria-label={label} className="flex flex-wrap gap-2">
      {tabs.map((t) => (
        <button key={t.value} type="button" role="tab" aria-selected={value === t.value} onClick={() => onChange(t.value)}
          className={`whitespace-nowrap rounded-xl px-3 py-1.5 text-sm font-medium ${value === t.value ? "bg-blue-600 text-white shadow-sm" : "border border-gray-200 bg-white text-gray-700 hover:bg-gray-50"}`}>
          {t.label}{t.count != null && ` (${t.count})`}
        </button>
      ))}
    </div>
  );
}

/** Segmented control with icons ("Upcoming · Calendar · Panels · Feedback"). */
export function SegmentTabs({ tabs, value, onChange, label }) {
  return (
    <div role="tablist" aria-label={label} className="inline-flex flex-wrap gap-1 rounded-2xl border border-gray-200 bg-white p-1 shadow-sm">
      {tabs.map((t) => (
        <button key={t.value} type="button" role="tab" aria-selected={value === t.value} onClick={() => onChange(t.value)}
          className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium ${value === t.value ? "bg-blue-50 text-blue-700" : "text-gray-600 hover:bg-gray-50"}`}>
          {t.icon && <t.icon className="h-4 w-4" />}{t.label}
        </button>
      ))}
    </div>
  );
}

// ── table ───────────────────────────────────────────────────────────────────────────────────────────────────────────
export const th = "px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500";
export const td = "px-4 py-3 align-middle text-sm text-gray-700";

export function Table({ columns, children, empty }) {
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-gray-100">
        <thead className="bg-gray-50/60"><tr>{columns.map((c, i) => <th key={i} scope="col" className={`${th} ${c.className || ""}`}>{c.label}</th>)}</tr></thead>
        <tbody className="divide-y divide-gray-100 bg-white">{children}</tbody>
      </table>
      {empty}
    </div>
  );
}

export function EmptyState({ icon: Icon, title, children }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
      {Icon && <div className="mb-3 grid h-12 w-12 place-items-center rounded-2xl bg-gray-100 text-gray-400"><Icon className="h-6 w-6" /></div>}
      <p className="text-sm font-medium text-gray-800">{title}</p>
      {children && <div className="mt-1 text-sm text-gray-500">{children}</div>}
    </div>
  );
}

export function Pagination({ page, pageSize, total, onPage, onPageSize }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const from = total ? (page - 1) * pageSize + 1 : 0;
  const to = Math.min(page * pageSize, total);
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-gray-100 px-4 py-3 text-sm text-gray-600">
      <span>{from}–{to} of {total}</span>
      <div className="flex items-center gap-3">
        {onPageSize && (
          <label className="flex items-center gap-2">Rows per page
            <select value={pageSize} onChange={(e) => onPageSize(Number(e.target.value))} className="rounded-lg border border-gray-200 px-2 py-1">
              {[10, 25, 50].map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </label>
        )}
        <div className="flex gap-1">
          <button type="button" aria-label="Previous page" disabled={page <= 1} onClick={() => onPage(page - 1)} className="rounded-lg border border-gray-200 px-2.5 py-1 disabled:opacity-40">‹</button>
          <span className="px-2 py-1">{page} / {pages}</span>
          <button type="button" aria-label="Next page" disabled={page >= pages} onClick={() => onPage(page + 1)} className="rounded-lg border border-gray-200 px-2.5 py-1 disabled:opacity-40">›</button>
        </div>
      </div>
    </div>
  );
}

// ── right-hand detail panel ─────────────────────────────────────────────────────────────────────────────────────────
/**
 * Beside the content on wide screens (pass it as the second column of <WithDetail>), a full-height sheet on small ones.
 */
export function DetailPanel({ title, onClose, children, header }) {
  return (
    <aside aria-label={title} className="fixed inset-0 z-40 flex justify-end bg-black/30 2xl:static 2xl:z-auto 2xl:block 2xl:bg-transparent">
      <div className="flex h-full w-full max-w-md flex-col overflow-y-auto bg-white shadow-xl 2xl:sticky 2xl:top-4 2xl:h-auto 2xl:max-h-[calc(100vh-2rem)] 2xl:max-w-none 2xl:rounded-2xl 2xl:border 2xl:border-gray-200/80 2xl:shadow-sm">
        <div className="flex items-start justify-between gap-3 border-b border-gray-100 px-5 py-4">
          <div className="min-w-0 flex-1">{header || <h2 className="text-base font-semibold text-gray-900">{title}</h2>}</div>
          <button type="button" onClick={onClose} aria-label="Close details" className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"><X className="h-5 w-5" /></button>
        </div>
        <div className="flex-1 px-5 py-4">{children}</div>
      </div>
    </aside>
  );
}

export function WithDetail({ detail, children }) {
  return (
    <div className={detail ? "grid grid-cols-1 gap-6 2xl:grid-cols-[minmax(0,1fr)_360px]" : ""}>
      <div className="min-w-0">{children}</div>
      {detail}
    </div>
  );
}

export function DetailSection({ title, action, children }) {
  return (
    <div className="mt-5 first:mt-0">
      {(title || action) && (
        <div className="mb-2 flex items-center justify-between">
          {title && <h3 className="text-sm font-semibold text-gray-900">{title}</h3>}
          {action}
        </div>
      )}
      {children}
    </div>
  );
}

// ── formatting ──────────────────────────────────────────────────────────────────────────────────────────────────────
export function relativeTime(value) {
  if (!value) return "";
  const t = new Date(value).getTime();
  if (Number.isNaN(t)) return "";
  const s = Math.round((Date.now() - t) / 1000);
  const future = s < 0;
  const a = Math.abs(s);
  const [n, unit] = a < 60 ? [a, "second"] : a < 3600 ? [Math.round(a / 60), "minute"] : a < 86400 ? [Math.round(a / 3600), "hour"]
    : a < 86400 * 30 ? [Math.round(a / 86400), "day"] : a < 86400 * 365 ? [Math.round(a / (86400 * 30)), "month"] : [Math.round(a / (86400 * 365)), "year"];
  if (unit === "second") return future ? "in a moment" : "just now";
  const word = `${n} ${unit}${n === 1 ? "" : "s"}`;
  return future ? `in ${word}` : `${word} ago`;
}

export function shortDate(value) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

export function money(amount, currency) {
  if (amount == null || amount === "") return "—";
  const n = Number(amount);
  if (Number.isNaN(n)) return String(amount);
  try {
    return new Intl.NumberFormat(currency === "INR" ? "en-IN" : undefined, { style: "currency", currency: currency || "USD", maximumFractionDigits: 0 }).format(n);
  } catch {
    return `${currency || ""} ${n.toLocaleString()}`.trim();
  }
}

// ── data ────────────────────────────────────────────────────────────────────────────────────────────────────────────
/** Loads GET /hr/recruitment/insights?section=… ; `reload()` after any change that moves a number. */
export function useInsights(section) {
  const [state, setState] = useState({ data: null, loading: true, error: "" });
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let live = true;
    setState((s) => ({ ...s, loading: true, error: "" }));
    // loaded lazily: pages that only use the layout (and tests that replace hrService) do not need this call
    import("../../../service/hrService")
      .then((m) => (typeof m.getRecruitmentInsights === "function" ? m.getRecruitmentInsights(section) : null))
      .then((data) => live && setState({ data, loading: false, error: "" }))
      .catch((e) => live && setState({ data: null, loading: false, error: e?.message || "Insights could not be loaded." }));
    return () => { live = false; };
  }, [section, tick]);
  return { ...state, reload: () => setTick((t) => t + 1) };
}
