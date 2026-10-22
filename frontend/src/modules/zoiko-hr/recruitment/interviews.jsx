import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { AlertCircle, AlertTriangle, Building2, CalendarPlus, Check, Clock, Globe, Link2, Loader2, Mail, Search, StickyNote, CalendarCheck, CalendarClock, CalendarDays, CheckCircle2, ChevronLeft, ChevronRight, CircleX,
  ClipboardCheck, Code2, ExternalLink, LayoutList, MapPin, MessageSquare, MoreHorizontal, Pencil, Phone, Plus, Star, Trash2,
  UserRound, Users, Video, X } from "lucide-react";
import { getInterviews, createInterview, updateInterview, updateInterviewFeedback, deleteInterview, getCandidates } from "../../../service/hrService";
import { getRequisitionScorecards, submitInterviewScorecard } from "../../../service/recruitmentDocumentsService";
import { getEmployees } from "../../../service/employee";
import { formatDate as formatDateUtil } from "../../../utils/dateTime";
import { STATUS_LABELS, cardActions, statusOptions, validateInterviewForm } from "../../../utils/interviewFlow";
import { Avatar, AvatarStack, Card, DetailPanel, DetailSection, EmptyState, FilterSelect, KpiCard, KpiGrid, Pagination, PersonCell,
  PrimaryButton, QuickAction, RecruitmentLayout, SearchInput, SecondaryButton,SegmentTabs, StatusPill, Table, td, useInsights } from "./ui";

function formatDate(dateStr) {
  if (!dateStr) return "—";
  try { return formatDateUtil(dateStr); }
  catch { return dateStr; }
}

const PAGE_SIZE = 8;

const BROWSER_TZ = (() => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || ""; } catch { return ""; } })();
const TIME_ZONES = (() => {
  try { return Intl.supportedValuesOf("timeZone"); } catch { return [BROWSER_TZ, "UTC"].filter(Boolean); }
})();
// the values the schedule form can store (the backend's interview types); filters list only the types actually in use
const TYPE_OPTIONS = [
  ["phone", "Phone screen"], ["video", "Video call"], ["in_person", "In person"], ["technical", "Technical"], ["panel", "Panel"], ["hr", "HR round"],
];
const TYPE_LABEL = Object.fromEntries(TYPE_OPTIONS);
const TYPE_ICON = { phone: Phone, video: Video, in_person: Building2, "in-person": Building2, technical: Code2, panel: Users, hr: UserRound };
const humanize = (v) => String(v || "").replace(/[_-]+/g, " ").replace(/^\w/, (c) => c.toUpperCase());
const typeLabel = (t) => (t ? TYPE_LABEL[t] || humanize(t) : "—");
const STATUS_TONE = { scheduled: "blue", in_progress: "violet", completed: "green", cancelled: "red" };
const statusLabel = (s) => STATUS_LABELS[s] || humanize(s) || STATUS_LABELS.scheduled;

const initForm = {
  candidate_id: "", candidate_name: "", position: "", interview_type: "video", interview_date: "", start_time: "", end_time: "",
  timezone: BROWSER_TZ, meeting_link: "", location: "", interviewer_id: "", interviewer: "", status: "scheduled", notes: "", notify: true,
};
const personName = (e) => e.full_name || `${e.first_name || ""} ${e.last_name || ""}`.trim() || e.email;

// ── dates (interview dates are calendar days, so they are handled as local YYYY-MM-DD strings) ──────────────────
const pad = (n) => String(n).padStart(2, "0");
const isoDay = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const dayOf = (iv) => (iv?.interview_date ? String(iv.interview_date).slice(0, 10) : "");
const parseDay = (s) => { const [y, m, d] = String(s).split("-").map(Number); return new Date(y, (m || 1) - 1, d || 1); };
const daysBetween = (a, b) => Math.round((parseDay(b) - parseDay(a)) / 86400000);

function fmtTime(t) {
  if (!t) return "";
  const [h, m] = String(t).split(":").map(Number);
  if (Number.isNaN(h)) return String(t);
  return new Date(2000, 0, 1, h, m || 0).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}
const timeRange = (iv) => (iv.start_time ? `${fmtTime(iv.start_time)}${iv.end_time ? ` – ${fmtTime(iv.end_time)}` : ""}` : "");

function dayLabel(day, today) {
  if (!day) return "—";
  const diff = daysBetween(today, day);
  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  if (diff === -1) return "Yesterday";
  return formatDate(day);
}

function TypeCell({ type }) {
  const Icon = TYPE_ICON[type] || MessageSquare;
  return (
    <span className="inline-flex items-center gap-2 text-sm text-gray-700">
      <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-violet-50 text-violet-600"><Icon className="h-3.5 w-3.5" /></span>
      {typeLabel(type)}
    </span>
  );
}

function IvStatus({ status }) {
  const s = status || "scheduled";
  return <StatusPill tone={STATUS_TONE[s] || "gray"}>{statusLabel(s)}</StatusPill>;
}

// ── right column ─────────────────────────────────────────────────────────────────────────────────────────────────
function LinkButton({ children, ...props }) {
  return <button type="button" {...props} className="text-sm font-medium text-blue-600 hover:underline">{children}</button>;
}

function TodaysAgenda({ rows, loading, onOpen, onCalendar }) {
  return (
    <Card title="Today's Agenda" action={<LinkButton onClick={onCalendar}>View Calendar</LinkButton>}>
      {loading ? <div className="h-32 animate-pulse rounded-xl bg-gray-50" /> : !rows.length ? (
        <EmptyState icon={CalendarCheck} title="Nothing scheduled today" />
      ) : (
        <ol className="relative">
          {rows.map((r, i) => (
            <li key={r.id} className="relative flex gap-3 pb-4 last:pb-0">
              <span className="w-16 shrink-0 pt-0.5 text-xs font-medium text-gray-500">{fmtTime(r.time) || "—"}</span>
              <span className="relative flex w-3 shrink-0 justify-center" aria-hidden="true">
                <span className={`mt-1.5 h-2.5 w-2.5 rounded-full ${r.status === "cancelled" ? "bg-gray-300" : "bg-blue-600"}`} />
                {i < rows.length - 1 && <span className="absolute top-4 bottom-[-0.25rem] w-px bg-gray-200" />}
              </span>
              <button type="button" onClick={() => onOpen(r.id)} className="min-w-0 flex-1 text-left">
                <span className="block truncate text-sm font-medium text-gray-900">{r.candidate_name || "—"}</span>
                <span className="block truncate text-xs text-gray-500">{[r.position, r.interview_type ? typeLabel(r.interview_type) : null].filter(Boolean).join(" · ") || "—"}</span>
              </button>
              <span className="shrink-0"><IvStatus status={r.status} /></span>
            </li>
          ))}
        </ol>
      )}
    </Card>
  );
}

function InterviewerWorkload({ rows, loading, onViewAll }) {
  return (
    <Card title="Interviewer Workload" action={<LinkButton aria-label="View all interview panels" onClick={onViewAll}>View All</LinkButton>}>
      {loading ? <div className="h-32 animate-pulse rounded-xl bg-gray-50" /> : !rows.length ? (
        <EmptyState icon={Users} title="No interviewers assigned" />
      ) : (
        <>
          <ul className="space-y-3">
            {rows.map((r) => (
              <li key={r.interviewer} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 sm:grid-cols-[minmax(0,9rem)_auto_minmax(0,1fr)_2.5rem]">
                <span className="flex min-w-0 items-center gap-2">
                  <AvatarStack names={[r.interviewer]} max={1} />
                  <span className="truncate text-sm text-gray-800">{r.interviewer}</span>
                </span>
                <span className="text-xs text-gray-500">{r.count} interview{r.count === 1 ? "" : "s"}</span>
                <span className="col-span-2 h-2 rounded-full bg-gray-100 sm:col-span-1" aria-hidden="true">
                  <span className="block h-2 rounded-full bg-blue-600" style={{ width: `${Math.max(0, Math.min(100, r.pct || 0))}%` }} />
                </span>
                <span className="hidden text-right text-xs font-medium text-gray-600 sm:block">{r.pct ?? "—"}%</span>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-[11px] text-gray-400">Interviews in the last and next 30 days · % of the busiest interviewer</p>
        </>
      )}
    </Card>
  );
}

function Donut({ pct }) {
  const r = 30, c = 2 * Math.PI * r;
  const v = pct == null ? 0 : Math.max(0, Math.min(100, pct));
  return (
    <svg viewBox="0 0 80 80" className="h-20 w-20 shrink-0" role="img" aria-label={pct == null ? "No feedback due yet" : `${pct}% of feedback completed`}>
      <circle cx="40" cy="40" r={r} fill="none" stroke="#e5e7eb" strokeWidth="9" />
      <circle cx="40" cy="40" r={r} fill="none" stroke="#2563eb" strokeWidth="9" strokeLinecap="round"
        strokeDasharray={`${(v / 100) * c} ${c}`} transform="rotate(-90 40 40)" />
      <text x="40" y="45" textAnchor="middle" className="fill-gray-900 text-[15px] font-bold">{pct == null ? "—" : `${pct}%`}</text>
    </svg>
  );
}

function FeedbackCompletion({ data, loading, onViewAll }) {
  const items = [["Completed", data?.completed, "bg-emerald-500"], ["Pending", data?.pending, "bg-amber-400"], ["Overdue", data?.overdue, "bg-rose-500"]];
  return (
    <Card title="Feedback Completion" action={<LinkButton aria-label="View all feedback" onClick={onViewAll}>View All</LinkButton>}>
      {loading ? <div className="h-20 animate-pulse rounded-xl bg-gray-50" /> : (
        <>
          <div className="flex items-center gap-5">
            <Donut pct={data?.pct ?? null} />
            <dl className="grid flex-1 grid-cols-3 gap-2">
              {items.map(([label, n, dot]) => (
                <div key={label} className="min-w-0">
                  <dt className="flex items-center gap-1.5 text-xs text-gray-500"><span className={`h-2 w-2 rounded-full ${dot}`} />{label}</dt>
                  <dd className="text-lg font-bold text-gray-900">{n ?? "—"}</dd>
                </div>
              ))}
            </dl>
          </div>
          {data?.due_days != null && <p className="mt-3 text-[11px] text-gray-400">Overdue: no feedback more than {data.due_days} days after the interview</p>}
        </>
      )}
    </Card>
  );
}

// ── calendar tab ─────────────────────────────────────────────────────────────────────────────────────────────────
function CalendarView({ interviews, today, onOpen }) {
  const [month, setMonth] = useState(() => { const d = parseDay(today); return new Date(d.getFullYear(), d.getMonth(), 1); });
  const byDay = useMemo(() => {
    const m = {};
    interviews.forEach((iv) => { const d = dayOf(iv); if (d) (m[d] = m[d] || []).push(iv); });
    Object.values(m).forEach((list) => list.sort((a, b) => String(a.start_time || "").localeCompare(String(b.start_time || ""))));
    return m;
  }, [interviews]);
  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const start = new Date(first); start.setDate(1 - first.getDay());
  const cells = Array.from({ length: 42 }, (_, i) => { const d = new Date(start); d.setDate(start.getDate() + i); return d; });
  const weekdays = cells.slice(0, 7).map((d) => d.toLocaleDateString(undefined, { weekday: "short" }));
  const inMonth = interviews.filter((iv) => dayOf(iv).startsWith(`${month.getFullYear()}-${pad(month.getMonth() + 1)}`)).length;
  const shift = (n) => setMonth(new Date(month.getFullYear(), month.getMonth() + n, 1));
  return (
    <Card title={month.toLocaleDateString(undefined, { month: "long", year: "numeric" })}
      action={
        <div className="flex items-center gap-2">
          <span className="hidden text-xs text-gray-500 sm:inline">{inMonth} interview{inMonth === 1 ? "" : "s"}</span>
          <button type="button" aria-label="Previous month" onClick={() => shift(-1)} className="rounded-lg border border-gray-200 p-1.5 hover:bg-gray-50"><ChevronLeft className="h-4 w-4" /></button>
          <button type="button" onClick={() => { const d = parseDay(today); setMonth(new Date(d.getFullYear(), d.getMonth(), 1)); }} className="rounded-lg border border-gray-200 px-2.5 py-1 text-sm hover:bg-gray-50">Today</button>
          <button type="button" aria-label="Next month" onClick={() => shift(1)} className="rounded-lg border border-gray-200 p-1.5 hover:bg-gray-50"><ChevronRight className="h-4 w-4" /></button>
        </div>
      }>
      <div className="overflow-x-auto">
        <div className="grid min-w-[640px] grid-cols-7 overflow-hidden rounded-xl border border-gray-200 bg-gray-200 gap-px">
          {weekdays.map((w) => <div key={w} className="bg-gray-50 px-2 py-1.5 text-xs font-semibold text-gray-500">{w}</div>)}
          {cells.map((d) => {
            const key = isoDay(d);
            const list = byDay[key] || [];
            const other = d.getMonth() !== month.getMonth();
            return (
              <div key={key} className={`min-h-[96px] p-1.5 ${other ? "bg-gray-50/70" : "bg-white"}`}>
                <span className={`inline-grid h-6 min-w-6 place-items-center rounded-full px-1 text-xs ${key === today ? "bg-blue-600 font-semibold text-white" : other ? "text-gray-400" : "text-gray-700"}`}>{d.getDate()}</span>
                <div className="mt-1 space-y-1">
                  {list.slice(0, 3).map((iv) => (
                    <button key={iv.id} type="button" onClick={() => onOpen(iv.id)} title={`${iv.candidate_name || ""} · ${typeLabel(iv.interview_type)}`}
                      className={`block w-full truncate rounded-md px-1.5 py-0.5 text-left text-[11px] font-medium ${iv.status === "cancelled" ? "bg-gray-100 text-gray-400 line-through" : iv.status === "completed" ? "bg-emerald-50 text-emerald-700" : "bg-blue-50 text-blue-700"}`}>
                      {iv.start_time ? `${fmtTime(iv.start_time)} ` : ""}{iv.candidate_name || "—"}
                    </button>
                  ))}
                  {list.length > 3 && <span className="block px-1.5 text-[11px] text-gray-500">+{list.length - 3} more</span>}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </Card>
  );
}

// ── panels tab ───────────────────────────────────────────────────────────────────────────────────────────────────
function PanelsView({ interviews, panelOf, today, onOpen }) {
  const groups = useMemo(() => {
    const m = new Map();
    interviews.forEach((iv) => {
      const names = panelOf(iv);
      (names.length ? names : [""]).forEach((n) => { if (!m.has(n)) m.set(n, []); m.get(n).push(iv); });
    });
    return [...m.entries()].map(([name, list]) => ({
      name, list,
      upcoming: list.filter((iv) => dayOf(iv) >= today && iv.status !== "cancelled" && iv.status !== "completed").length,
      completed: list.filter((iv) => iv.status === "completed").length,
    })).sort((a, b) => (!a.name) - (!b.name) || b.list.length - a.list.length || a.name.localeCompare(b.name));
  }, [interviews, panelOf, today]);
  if (!groups.length) return <Card><EmptyState icon={Users} title="No interviews yet">Interview panels appear here once interviews are scheduled.</EmptyState></Card>;
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      {groups.map((g) => {
        const next = [...g.list].sort((a, b) => `${dayOf(b)} ${b.start_time || ""}`.localeCompare(`${dayOf(a)} ${a.start_time || ""}`)).slice(0, 5);
        return (
          <Card key={g.name || "none"}>
            <div className="flex items-center justify-between gap-3">
              <PersonCell name={g.name || "No interviewer assigned"} sub={`${g.list.length} interview${g.list.length === 1 ? "" : "s"}`} />
              <div className="flex shrink-0 gap-2 text-xs text-gray-500">
                <span>{g.upcoming} upcoming</span><span aria-hidden="true">·</span><span>{g.completed} completed</span>
              </div>
            </div>
            <ul className="mt-4 divide-y divide-gray-100">
              {next.map((iv) => (
                <li key={iv.id}>
                  <button type="button" onClick={() => onOpen(iv.id)} className="flex w-full items-center justify-between gap-3 py-2 text-left hover:bg-gray-50">
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium text-gray-900">{iv.candidate_name || "—"}</span>
                      <span className="block truncate text-xs text-gray-500">{[iv.position, typeLabel(iv.interview_type), dayLabel(dayOf(iv), today)].filter(Boolean).join(" · ")}</span>
                    </span>
                    <IvStatus status={iv.status} />
                  </button>
                </li>
              ))}
            </ul>
            {g.list.length > next.length && <p className="mt-2 text-xs text-gray-400">Showing the latest {next.length} of {g.list.length}</p>}
          </Card>
        );
      })}
    </div>
  );
}

// ── page ─────────────────────────────────────────────────────────────────────────────────────────────────────────
// ── schedule / edit panel ───────────────────────────────────────────────────────────────────────────────────────────
// the element each form field lives in, in the order the form reads (the first invalid one is focused)
const FIELD_IDS = {
  candidate_name: "iv-name", position: "iv-position", interview_date: "iv-date", start_time: "iv-time", end_time: "iv-end",
  timezone: "iv-tz", meeting_link: "iv-link", location: "iv-loc", interviewer: "iv-interviewer-name", notes: "iv-notes",
};
function focusFirstError(errs) {
  const key = Object.keys(FIELD_IDS).find((k) => errs[k] && document.getElementById(FIELD_IDS[k]));
  if (!key) return;
  // after the re-render (a fieldset disabled while saving cannot take focus yet)
  setTimeout(() => document.getElementById(FIELD_IDS[key])?.focus(), 0);
}
/** Field messages from a refused save: FastAPI's per-field list, or the service's known one-line refusals. */
function serverFieldErrors(err) {
  const out = {};
  for (const v of Array.isArray(err?.validation) ? err.validation : []) {
    const loc = Array.isArray(v?.loc) ? v.loc : [];
    const field = [...loc].reverse().find((k) => typeof k === "string" && FIELD_IDS[k]);
    if (field && !out[field]) out[field] = String(v?.msg || "Check this field.").replace(/^Value error,\s*/i, "");
  }
  if (Object.keys(out).length) return out;
  const msg = String(err?.message || "");
  if (/end time/i.test(msg)) out.end_time = msg;
  else if (/\bpast\b/i.test(msg)) out.interview_date = msg;
  else if (/meeting link/i.test(msg)) out.meeting_link = msg;
  return out;
}

const toMin = (t) => {
  if (!t) return null;
  const [h, m] = String(t).split(":").map(Number);
  return Number.isNaN(h) ? null : h * 60 + (m || 0);
};
const fromMin = (n) => `${pad(Math.floor(n / 60))}:${pad(n % 60)}`;
const DURATIONS = [30, 45, 60, 90];
const durationText = (min) => (min >= 60 ? `${Math.floor(min / 60)} h${min % 60 ? ` ${min % 60} min` : ""}` : `${min} min`);
const longDay = (s) => parseDay(s).toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long", year: parseDay(s).getFullYear() === new Date().getFullYear() ? undefined : "numeric" });

// minutes east of UTC for a zone at a moment (Intl only; null when the zone is unknown)
function zoneOffset(tz, utcMs) {
  try {
    const p = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })
      .formatToParts(new Date(utcMs)).map((x) => [x.type, x.value]));
    return (Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute) - Math.floor(utcMs / 60000) * 60000) / 60000;
  } catch { return null; }
}
/** The instant (ms) of a wall-clock time on a day in a zone; with no zone, the viewer's own. */
function instantOf(day, time, tz) {
  const mins = toMin(time);
  if (!day || mins == null) return null;
  const [y, m, d] = day.split("-").map(Number);
  const wall = Date.UTC(y, m - 1, d, 0, mins);
  if (!tz) return new Date(y, m - 1, d, 0, mins).getTime();
  const off = zoneOffset(tz, wall);
  if (off == null) return new Date(y, m - 1, d, 0, mins).getTime();
  const guess = wall - off * 60000;
  const off2 = zoneOffset(tz, guess);            // second pass settles daylight-saving edges
  return off2 == null ? guess : wall - off2 * 60000;
}
function spanOf(day, start, end, tz) {
  const s = instantOf(day, start, tz);
  if (s == null) return null;
  const e = instantOf(day, end, tz);
  return { s, e: e != null && e > s ? e : s };
}
const overlaps = (a, b) => Boolean(a && b) && ((a.s < b.e && b.s < a.e) || a.s === b.s);

const MEETING_PROVIDERS = [[/(^|\.)meet\.google\.com$/, "Google Meet"], [/(^|\.)zoom\.us$/, "Zoom"],
  [/(^|\.)teams\.(microsoft|live)\.com$/, "Microsoft Teams"], [/(^|\.)webex\.com$/, "Webex"]];
function meetingProvider(link) {
  try {
    const host = new URL(link).hostname.toLowerCase();
    return MEETING_PROVIDERS.find(([re]) => re.test(host))?.[1] || host;
  } catch { return null; }
}
// which place fields each interview type asks for
const SHOWS_LINK = new Set(["video", "technical", "panel", "hr"]);
const SHOWS_LOCATION = new Set(["in_person", "technical", "panel", "hr"]);
const STAGE_TONE = { applied: "gray", screening: "blue", interview: "violet", offer: "amber" };
const sameName = (a, b) => Boolean(String(a || "").trim()) && String(a).trim().toLowerCase() === String(b || "").trim().toLowerCase();

const fieldBase = "w-full rounded-xl border bg-white px-3 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 disabled:bg-gray-50 disabled:text-gray-500";
const fieldLook = (bad) => `${fieldBase} ${bad ? "border-rose-300 focus:border-rose-400 focus:ring-rose-100" : "border-gray-200 focus:border-blue-400 focus:ring-blue-100"}`;
const labelCls = "mb-1 block text-xs font-medium text-gray-600";

function FieldError({ id, children }) {
  if (!children) return null;
  return <p id={id} role="alert" className="mt-1 flex items-center gap-1 text-xs text-rose-600"><AlertCircle className="h-3.5 w-3.5 shrink-0" />{children}</p>;
}

function FormSection({ id, icon: Icon, title, hint, action, children }) {
  return (
    <section aria-labelledby={`${id}-h`} className="rounded-2xl border border-gray-200/80 bg-white p-4 shadow-sm sm:p-5">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-blue-50 text-blue-600" aria-hidden="true"><Icon className="h-4 w-4" /></span>
          <div className="min-w-0">
            <h3 id={`${id}-h`} className="text-sm font-semibold text-gray-900">{title}</h3>
            {hint && <p className="text-xs text-gray-500">{hint}</p>}
          </div>
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

/** A search box with a list of loaded records under it (combobox / listbox, arrow keys, Enter picks, Esc closes). */
function RecordPicker({ id, label, placeholder, items, itemKey, itemText, renderItem, onPick, emptyText }) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    return (s ? items.filter((it) => itemText(it).toLowerCase().includes(s)) : items).slice(0, 50);
  }, [q, items, itemText]);
  const pick = (it) => { onPick(it); setQ(""); setOpen(false); };
  const onKeyDown = (e) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setOpen(true); setActive((a) => Math.min(a + 1, Math.max(0, list.length - 1))); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
    else if (e.key === "Enter") { e.preventDefault(); if (open && list[active]) pick(list[active]); }
    else if (e.key === "Escape" && open) { e.stopPropagation(); setOpen(false); }
  };
  const optId = (i) => `${id}-opt-${i}`;
  return (
    <div className="relative">
      <label htmlFor={id} className="sr-only">{label}</label>
      <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-gray-400" aria-hidden="true" />
      <input id={id} type="text" role="combobox" autoComplete="off" aria-expanded={open} aria-controls={`${id}-list`} aria-autocomplete="list"
        aria-activedescendant={open && list[active] ? optId(active) : undefined} value={q} placeholder={placeholder}
        onChange={(e) => { setQ(e.target.value); setOpen(true); setActive(0); }} onClick={() => setOpen(true)} onBlur={() => setOpen(false)}
        onKeyDown={onKeyDown} className={`${fieldLook(false)} pl-9`} />
      {open && (
        <ul id={`${id}-list`} role="listbox" aria-label={`${label}: results`}
          className="absolute left-0 right-0 z-10 mt-1 max-h-64 overflow-y-auto rounded-xl border border-gray-200 bg-white py-1 shadow-lg">
          {list.length === 0 && <li className="px-3 py-2 text-sm text-gray-500">{emptyText}</li>}
          {list.map((it, i) => (
            <li key={itemKey(it)} id={optId(i)} role="option" aria-selected={i === active}
              onMouseDown={(e) => { e.preventDefault(); pick(it); }} onMouseEnter={() => setActive(i)}
              className={`cursor-pointer px-3 py-2 ${i === active ? "bg-blue-50" : ""}`}>
              {renderItem(it)}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ChosenCard({ name, sub, extra, onChange, changeLabel }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-blue-100 bg-blue-50/50 p-3">
      <Avatar name={name} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-gray-900">{name || "—"}</p>
        {sub && <p className="truncate text-xs text-gray-600">{sub}</p>}
        {extra}
      </div>
      <button type="button" onClick={onChange} aria-label={changeLabel}
        className="shrink-0 rounded-lg border border-gray-200 bg-white px-2.5 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50">Change</button>
    </div>
  );
}

function ScheduleInterviewPanel({ editItem, form, setForm, setField, errors, setErrors, saveError, saving, candidates, people, interviews,
  pickCandidate, isDirty, onClose, onSubmit, today }) {
  const dialogRef = useRef(null);
  const editing = Boolean(editItem);

  const requestClose = useCallback(() => {
    if (saving) return;
    if (isDirty() && !window.confirm("Discard your changes to this interview?")) return;
    onClose();
  }, [saving, isDirty, onClose]);

  // focus moves into the panel on open and back to where it was on close; the page behind does not scroll
  useEffect(() => {
    const before = document.activeElement;
    const first = editing ? "iv-date" : (document.getElementById("iv-cand-search") ? "iv-cand-search" : "iv-name");
    document.getElementById(first)?.focus();
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = overflow;
      if (before && typeof before.focus === "function" && document.contains(before)) before.focus();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const onKeyDown = (e) => {
    if (e.key === "Escape") { e.preventDefault(); requestClose(); return; }
    if (e.key !== "Tab" || !dialogRef.current) return;
    const nodes = [...dialogRef.current.querySelectorAll('a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])')];
    if (!nodes.length) return;
    const firstEl = nodes[0], lastEl = nodes[nodes.length - 1];
    if (e.shiftKey && document.activeElement === firstEl) { e.preventDefault(); lastEl.focus(); }
    else if (!e.shiftKey && document.activeElement === lastEl) { e.preventDefault(); firstEl.focus(); }
  };

  const validateField = (key) => {
    const msg = validateInterviewForm(form)[key];
    setErrors((prev) => (prev[key] === msg ? prev : { ...prev, [key]: msg }));
  };
  const err = (k) => errors[k];
  const described = (k, hintId) => [errors[k] ? `${FIELD_IDS[k]}-err` : null, hintId].filter(Boolean).join(" ") || undefined;

  // ── candidate ──
  const candidate = form.candidate_id ? candidates.find((c) => String(c.id) === String(form.candidate_id)) : null;
  const candidateText = useCallback((c) => `${c.name || ""} ${c.position || ""} ${c.email || ""}`, []);
  // ── interviewer ──
  const person = form.interviewer_id ? people.find((p) => String(p.id) === String(form.interviewer_id)) : null;
  const personText = useCallback((p) => `${personName(p) || ""} ${p.job_title || ""} ${p.department?.name || ""} ${p.email || ""}`, []);
  const interviewerLabel = form.interviewer_id ? (person ? personName(person) : editItem?.interviewer || `Employee #${form.interviewer_id}`) : form.interviewer.trim();
  const pickPerson = (p) => {
    setForm((prev) => ({ ...prev, interviewer_id: String(p.id), interviewer: "" }));
    setErrors((prev) => ({ ...prev, interviewer: undefined }));
  };
  const clearPerson = () => {
    setForm((prev) => ({ ...prev, interviewer_id: "" }));
    setTimeout(() => document.getElementById("iv-person-search")?.focus() || document.getElementById("iv-interviewer-name")?.focus(), 0);
  };

  // ── when ──
  const startMin = toMin(form.start_time), endMin = toMin(form.end_time);
  const duration = startMin != null && endMin != null && endMin > startMin ? endMin - startMin : null;
  const setStart = (value) => {
    // keep the length of the slot when the start moves
    const ns = toMin(value);
    setForm((prev) => {
      const os = toMin(prev.start_time), oe = toMin(prev.end_time);
      const keep = os != null && oe != null && oe > os && ns != null && ns + (oe - os) < 1440;
      return { ...prev, start_time: value, end_time: keep ? fromMin(ns + (oe - os)) : prev.end_time };
    });
    setErrors((prev) => ({ ...prev, start_time: undefined, end_time: undefined }));
  };
  const setDuration = (min) => { if (startMin != null && startMin + min < 1440) setField("end_time", fromMin(startMin + min)); };
  const dateOk = /^\d{4}-\d{2}-\d{2}$/.test(form.interview_date || "");
  const dayDiff = dateOk ? daysBetween(today, form.interview_date) : null;
  const relative = dayDiff == null ? "" : dayDiff === 0 ? "Today" : dayDiff === 1 ? "Tomorrow" : dayDiff === -1 ? "Yesterday"
    : dayDiff > 0 ? `In ${dayDiff} days` : `${-dayDiff} days ago`;
  const localTime = (() => {
    if (!dateOk || startMin == null || !form.timezone || !BROWSER_TZ || form.timezone === BROWSER_TZ) return "";
    const at = instantOf(form.interview_date, form.start_time, form.timezone);
    return at == null ? "" : new Date(at).toLocaleString(undefined, { weekday: "short", hour: "numeric", minute: "2-digit" });
  })();
  const zones = useMemo(() => {
    const all = TIME_ZONES.includes(form.timezone) || !form.timezone ? TIME_ZONES : [form.timezone, ...TIME_ZONES];
    return all.filter((z) => z !== BROWSER_TZ);
  }, [form.timezone]);

  // ── schedule check (the interviews already loaded on this page) ──
  const check = useMemo(() => {
    if (!dateOk) return null;
    const mine = spanOf(form.interview_date, form.start_time, form.end_time, form.timezone);
    const live = interviews.filter((iv) => (!editItem || iv.id !== editItem.id) && (iv.status || "scheduled") !== "cancelled");
    const byInterviewer = (iv) => (form.interviewer_id
      ? String(iv.interviewer_id || "") === String(form.interviewer_id) || (!iv.interviewer_id && sameName(iv.interviewer, interviewerLabel))
      : Boolean(interviewerLabel) && sameName(iv.interviewer, interviewerLabel));
    const byCandidate = (iv) => (form.candidate_id ? String(iv.candidate_id || "") === String(form.candidate_id) : !iv.candidate_id && sameName(iv.candidate_name, form.candidate_name));
    const spanFor = (iv) => spanOf(dayOf(iv), iv.start_time, iv.end_time, iv.timezone || form.timezone);
    const sameDay = (iv) => dayOf(iv) === form.interview_date;
    const sorted = (rows) => rows.sort((a, b) => String(a.start_time || "").localeCompare(String(b.start_time || "")));
    const interviewerDay = interviewerLabel || form.interviewer_id ? sorted(live.filter((iv) => sameDay(iv) && byInterviewer(iv))) : [];
    const conflicts = [];
    if (mine) {
      for (const iv of live) {
        if (Math.abs((spanFor(iv)?.s ?? Infinity) - mine.s) > 2 * 86400000) continue;
        const who = [byInterviewer(iv) && "Interviewer", byCandidate(iv) && "Candidate"].filter(Boolean);
        if (who.length && overlaps(mine, spanFor(iv))) conflicts.push({ iv, who });
      }
    }
    return { timed: Boolean(mine), conflicts, interviewerDay, clash: new Set(conflicts.map((c) => c.iv.id)) };
  }, [dateOk, form, interviews, editItem, interviewerLabel]);

  const link = form.meeting_link.trim();
  const linkOk = link && !validateInterviewForm({ ...form, meeting_link: link }).meeting_link;
  const showLink = SHOWS_LINK.has(form.interview_type);
  const showLocation = SHOWS_LOCATION.has(form.interview_type);

  const statusChoicesForEdit = editing ? statusOptions(editItem.status) : [];
  const recipients = [form.candidate_id && "the candidate", form.interviewer_id && "the interviewer"].filter(Boolean);
  const title = editing ? "Edit Interview" : "Schedule Interview";
  const subtitle = editing
    ? [form.candidate_name, form.position].filter(Boolean).join(" · ") || "Change the details and save."
    : "Pick the candidate, the time and the interviewer.";

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div aria-hidden="true" className="absolute inset-0 bg-slate-900/40 backdrop-blur-[2px]" onClick={requestClose} />
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="iv-panel-title" aria-describedby="iv-panel-sub" onKeyDown={onKeyDown}
        className="relative flex h-full w-full flex-col bg-slate-50 shadow-2xl sm:max-w-[640px] sm:rounded-l-2xl">
        <form noValidate onSubmit={(ev) => { ev.preventDefault(); onSubmit(); }} className="flex min-h-0 flex-1 flex-col">
          <header className="shrink-0 bg-gradient-to-r from-[#0A1128] to-[#111A33] px-4 py-4 text-white sm:rounded-tl-2xl sm:px-6 sm:py-5">
            <div className="flex items-start gap-3">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white/10 ring-1 ring-white/15" aria-hidden="true">
                {editing ? <CalendarClock className="h-5 w-5 text-blue-300" /> : <CalendarPlus className="h-5 w-5 text-blue-300" />}
              </span>
              <div className="min-w-0 flex-1">
                <h2 id="iv-panel-title" className="text-lg font-semibold tracking-tight">{title}</h2>
                <p id="iv-panel-sub" className="truncate text-sm text-slate-300">{subtitle}</p>
              </div>
              {editing && <span className="hidden sm:inline-flex"><IvStatus status={editItem.status} /></span>}
              <button type="button" onClick={requestClose} disabled={saving} aria-label="Close"
                className="-mr-1 shrink-0 rounded-lg p-1.5 text-slate-300 hover:bg-white/10 hover:text-white disabled:opacity-50"><X className="h-5 w-5" /></button>
            </div>
          </header>

          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-6">
            <fieldset disabled={saving} className="min-w-0 space-y-4">
              <legend className="sr-only">Interview details</legend>
              <p className="text-xs text-gray-500">Fields marked <span className="text-rose-500">*</span> are required.</p>

              {editing && (
                <FormSection id="iv-sec-status" icon={CheckCircle2} title="Status" hint={statusChoicesForEdit.length === 1 ? "A completed interview is final." : "Changing it emails the candidate and interviewer."}>
                  <label htmlFor="iv-status" className={labelCls}>Status</label>
                  <select id="iv-status" value={form.status} disabled={statusChoicesForEdit.length === 1} onChange={(e) => setField("status", e.target.value)} className={fieldLook(false)}>
                    {statusChoicesForEdit.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </FormSection>
              )}

              <FormSection id="iv-sec-cand" icon={UserRound} title="Candidate" hint="Linked candidates receive the invitation by email.">
                {form.candidate_id ? (
                  <ChosenCard name={candidate?.name || form.candidate_name} changeLabel="Change candidate"
                    sub={[candidate?.position || form.position, candidate?.email].filter(Boolean).join(" · ")}
                    extra={candidate?.status ? <span className="mt-1 inline-flex"><StatusPill tone={STAGE_TONE[candidate.status] || "gray"}>{humanize(candidate.status)}</StatusPill></span> : null}
                    onChange={() => { pickCandidate(""); setTimeout(() => (document.getElementById("iv-cand-search") || document.getElementById("iv-name"))?.focus(), 0); }} />
                ) : (
                  <div className="space-y-3">
                    {candidates.length > 0 && (
                      <RecordPicker id="iv-cand-search" label="Search candidates" placeholder={`Search ${candidates.length} candidate${candidates.length === 1 ? "" : "s"} by name, role or email…`}
                        items={candidates} itemKey={(c) => c.id} itemText={candidateText} emptyText="No candidate matches. Enter the details below."
                        onPick={(c) => pickCandidate(String(c.id))}
                        renderItem={(c) => (
                          <div className="flex items-center gap-3">
                            <Avatar name={c.name} size="sm" />
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm font-medium text-gray-900">{c.name}</p>
                              <p className="truncate text-xs text-gray-500">{[c.position, c.email].filter(Boolean).join(" · ")}</p>
                            </div>
                            {c.status && <StatusPill tone={STAGE_TONE[c.status] || "gray"}>{humanize(c.status)}</StatusPill>}
                          </div>
                        )} />
                    )}
                    {candidates.length > 0 && <p className="text-center text-[11px] font-medium uppercase tracking-wide text-gray-400">or enter someone not in the list</p>}
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <div>
                        <label htmlFor="iv-name" className={labelCls}>Candidate name <span className="text-rose-500">*</span></label>
                        <input id="iv-name" value={form.candidate_name} maxLength={150} aria-invalid={!!err("candidate_name")} aria-describedby={described("candidate_name")}
                          onChange={(e) => setField("candidate_name", e.target.value)} className={fieldLook(err("candidate_name"))} />
                        <FieldError id="iv-name-err">{err("candidate_name")}</FieldError>
                      </div>
                      <div>
                        <label htmlFor="iv-position" className={labelCls}>Position <span className="text-rose-500">*</span></label>
                        <input id="iv-position" value={form.position} maxLength={150} aria-invalid={!!err("position")} aria-describedby={described("position")}
                          onChange={(e) => setField("position", e.target.value)} className={fieldLook(err("position"))} />
                        <FieldError id="iv-position-err">{err("position")}</FieldError>
                      </div>
                    </div>
                    <p className="flex items-center gap-1.5 text-[11px] text-amber-700"><AlertTriangle className="h-3.5 w-3.5 shrink-0" />Not linked to a candidate record, so no invitation is emailed to them.</p>
                  </div>
                )}
              </FormSection>

              <FormSection id="iv-sec-when" icon={CalendarDays} title="When"
                hint={dateOk ? <span><span className="font-medium text-gray-700">{longDay(form.interview_date)}</span>{relative ? ` · ${relative}` : ""}</span> : "Date, time and time zone."}>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1.3fr_1fr_1fr]">
                  <div>
                    <label htmlFor="iv-date" className={labelCls}>Date <span className="text-rose-500">*</span></label>
                    <input id="iv-date" type="date" min={editing ? undefined : today} value={form.interview_date} aria-invalid={!!err("interview_date")} aria-describedby={described("interview_date")}
                      onChange={(e) => setField("interview_date", e.target.value)} onBlur={() => form.interview_date && validateField("interview_date")} className={fieldLook(err("interview_date"))} />
                    <FieldError id="iv-date-err">{err("interview_date")}</FieldError>
                  </div>
                  <div>
                    <label htmlFor="iv-time" className={labelCls}>Start</label>
                    <input id="iv-time" type="time" step={300} value={form.start_time} aria-invalid={!!err("start_time")} aria-describedby={described("start_time")}
                      onChange={(e) => setStart(e.target.value)} className={fieldLook(err("start_time"))} />
                    <FieldError id="iv-time-err">{err("start_time")}</FieldError>
                  </div>
                  <div>
                    <label htmlFor="iv-end" className={labelCls}>End</label>
                    <input id="iv-end" type="time" step={300} value={form.end_time} aria-invalid={!!err("end_time")} aria-describedby={described("end_time")}
                      onChange={(e) => setField("end_time", e.target.value)} onBlur={() => validateField("end_time")} className={fieldLook(err("end_time"))} />
                    <FieldError id="iv-end-err">{err("end_time")}</FieldError>
                  </div>
                </div>
                {!editing && dayDiff != null && dayDiff < 0 && (
                  <p className="mt-2 flex items-center gap-1.5 text-xs text-amber-700"><AlertTriangle className="h-3.5 w-3.5" />This date has passed; an interview cannot be scheduled in the past.</p>
                )}
                <div className="mt-3 flex flex-wrap items-center gap-2" role="group" aria-label="Duration">
                  <span className="mr-1 flex items-center gap-1 text-xs font-medium text-gray-600"><Clock className="h-3.5 w-3.5" aria-hidden="true" />Duration</span>
                  {DURATIONS.map((min) => {
                    const on = duration === min;
                    return (
                      <button key={min} type="button" aria-pressed={on} disabled={startMin == null || startMin + min >= 1440} onClick={() => setDuration(min)}
                        title={startMin == null ? "Pick a start time first" : `End at ${fmtTime(fromMin(startMin + min))}`}
                        className={`rounded-lg px-3 py-1.5 text-xs font-medium ring-1 ring-inset disabled:cursor-not-allowed disabled:opacity-40 ${on ? "bg-blue-600 text-white ring-blue-600" : "bg-white text-gray-700 ring-gray-200 hover:bg-gray-50"}`}>
                        {min} min
                      </button>
                    );
                  })}
                  {duration != null && !DURATIONS.includes(duration) && <span className="text-xs text-gray-500">{durationText(duration)}</span>}
                  {startMin == null && <span className="text-xs text-gray-400">Pick a start time to use these.</span>}
                </div>
                <div className="mt-3">
                  <label htmlFor="iv-tz" className={labelCls}>Time zone</label>
                  <div className="relative">
                    <Globe className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-gray-400" aria-hidden="true" />
                    <select id="iv-tz" value={form.timezone} onChange={(e) => setField("timezone", e.target.value)} className={`${fieldLook(err("timezone"))} pl-9`} aria-describedby={localTime ? "iv-tz-local" : undefined}>
                      <option value="">Not specified</option>
                      {BROWSER_TZ && <optgroup label="Your time zone"><option value={BROWSER_TZ}>{BROWSER_TZ}</option></optgroup>}
                      <optgroup label="All time zones">{zones.map((z) => <option key={z} value={z}>{z}</option>)}</optgroup>
                    </select>
                  </div>
                  {localTime && <p id="iv-tz-local" className="mt-1 text-xs text-gray-500">That is {localTime} in your time zone ({BROWSER_TZ}).</p>}
                </div>
              </FormSection>

              <FormSection id="iv-sec-format" icon={Video} title="Format" hint="How the interview takes place.">
                <div role="radiogroup" aria-label="Interview type" id="iv-type" className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {TYPE_OPTIONS.map(([value, label], i) => {
                    const Icon = TYPE_ICON[value] || CalendarDays;
                    const on = form.interview_type === value;
                    return (
                      <button key={value} type="button" role="radio" aria-checked={on} tabIndex={on ? 0 : -1}
                        onClick={() => setField("interview_type", value)}
                        onKeyDown={(e) => {
                          const step = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;
                          if (!step) return;
                          e.preventDefault();
                          const next = TYPE_OPTIONS[(i + step + TYPE_OPTIONS.length) % TYPE_OPTIONS.length][0];
                          setField("interview_type", next);
                          setTimeout(() => e.currentTarget?.parentElement?.querySelector('[aria-checked="true"]')?.focus(), 0);
                        }}
                        className={`flex items-center gap-2 rounded-xl px-3 py-2.5 text-left text-sm font-medium ring-1 ring-inset transition-colors ${on ? "bg-blue-50 text-blue-700 ring-blue-300" : "bg-white text-gray-700 ring-gray-200 hover:bg-gray-50"}`}>
                        <Icon className={`h-4 w-4 shrink-0 ${on ? "text-blue-600" : "text-gray-400"}`} aria-hidden="true" />{label}
                      </button>
                    );
                  })}
                </div>
                {(showLink || showLocation) ? (
                  <div className={`mt-4 grid grid-cols-1 gap-3 ${showLink && showLocation ? "sm:grid-cols-2" : ""}`}>
                    {showLink && (
                      <div>
                        <label htmlFor="iv-link" className={labelCls}>Meeting link{form.interview_type === "video" ? "" : " (if remote)"}</label>
                        <div className="relative">
                          <Link2 className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-gray-400" aria-hidden="true" />
                          <input id="iv-link" type="url" inputMode="url" placeholder="https://" value={form.meeting_link} aria-invalid={!!err("meeting_link")} aria-describedby={described("meeting_link")}
                            onChange={(e) => setField("meeting_link", e.target.value)} onBlur={() => validateField("meeting_link")} className={`${fieldLook(err("meeting_link"))} pl-9`} />
                        </div>
                        <FieldError id="iv-link-err">{err("meeting_link")}</FieldError>
                        {linkOk && (
                          <p className="mt-1 flex items-center gap-2 text-xs text-gray-500">
                            <StatusPill tone="green" icon={Check}>{meetingProvider(link)}</StatusPill>
                            <a href={link} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-medium text-blue-600 hover:underline">Test link<ExternalLink className="h-3 w-3" /></a>
                          </p>
                        )}
                        {!link && form.interview_type === "video" && <p className="mt-1 text-xs text-amber-700">Add the link so the invitation includes it.</p>}
                      </div>
                    )}
                    {showLocation && (
                      <div>
                        <label htmlFor="iv-loc" className={labelCls}>Location{form.interview_type === "in_person" ? "" : " (if on site)"}</label>
                        <div className="relative">
                          <MapPin className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-gray-400" aria-hidden="true" />
                          <input id="iv-loc" maxLength={255} placeholder="Office, floor or room" value={form.location} aria-invalid={!!err("location")} aria-describedby={described("location")}
                            onChange={(e) => setField("location", e.target.value)} className={`${fieldLook(err("location"))} pl-9`} />
                        </div>
                        <FieldError id="iv-loc-err">{err("location")}</FieldError>
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="mt-3 text-xs text-gray-500">A phone screen needs no link or room; put the number to call in the notes if the panel needs it.</p>
                )}
              </FormSection>

              <FormSection id="iv-sec-who" icon={Users} title="Interviewer" hint="Employees receive the invitation by email.">
                {form.interviewer_id ? (
                  <ChosenCard name={interviewerLabel} changeLabel="Change interviewer" onChange={clearPerson}
                    sub={person ? [person.job_title, person.department?.name, person.email].filter(Boolean).join(" · ") : null} />
                ) : (
                  <div className="space-y-3">
                    {people.length > 0 && (
                      <RecordPicker id="iv-person-search" label="Search employees" placeholder="Search employees by name, title or email…"
                        items={people} itemKey={(p) => p.id} itemText={personText} emptyText="No employee matches. Type the name below."
                        onPick={pickPerson}
                        renderItem={(p) => (
                          <div className="flex items-center gap-3">
                            <Avatar name={personName(p)} size="sm" />
                            <div className="min-w-0">
                              <p className="truncate text-sm font-medium text-gray-900">{personName(p)}</p>
                              <p className="truncate text-xs text-gray-500">{[p.job_title, p.department?.name, p.email].filter(Boolean).join(" · ")}</p>
                            </div>
                          </div>
                        )} />
                    )}
                    <div>
                      <label htmlFor="iv-interviewer-name" className={people.length ? "mb-1 block text-[11px] font-medium uppercase tracking-wide text-gray-400" : labelCls}>
                        {people.length ? "Or someone outside the system" : "Interviewer"}
                      </label>
                      <input id="iv-interviewer-name" aria-label="Interviewer name" value={form.interviewer} maxLength={150} placeholder="Interviewer name"
                        aria-invalid={!!err("interviewer")} aria-describedby={described("interviewer")}
                        onChange={(e) => setField("interviewer", e.target.value)} className={fieldLook(err("interviewer"))} />
                      <FieldError id="iv-interviewer-name-err">{err("interviewer")}</FieldError>
                      {form.interviewer.trim() && <p className="mt-1 text-[11px] text-gray-500">Someone outside the system is not emailed; send them the details yourself.</p>}
                    </div>
                  </div>
                )}
              </FormSection>

              {check && (check.timed || check.interviewerDay.length > 0) && (
                <section aria-labelledby="iv-sec-conflicts-h" aria-live="polite"
                  className={`rounded-2xl border p-4 sm:p-5 ${check.conflicts.length ? "border-amber-200 bg-amber-50" : "border-emerald-200 bg-emerald-50/60"}`}>
                  <h3 id="iv-sec-conflicts-h" className={`flex items-center gap-2 text-sm font-semibold ${check.conflicts.length ? "text-amber-900" : "text-emerald-800"}`}>
                    {check.conflicts.length ? <AlertTriangle className="h-4 w-4" aria-hidden="true" /> : <CheckCircle2 className="h-4 w-4" aria-hidden="true" />}
                    Conflicts{check.conflicts.length ? ` (${check.conflicts.length})` : ""}
                  </h3>
                  {check.timed ? (
                    check.conflicts.length ? (
                      <ul className="mt-2 space-y-1.5">
                        {check.conflicts.map(({ iv, who }) => (
                          <li key={iv.id} className="text-sm text-amber-900">
                            <span className="font-medium">{who.join(" and ")}</span> already {who.length > 1 ? "have" : "has"} {typeLabel(iv.interview_type).toLowerCase()} with {iv.candidate_name || "a candidate"}, {timeRange(iv)}{iv.timezone ? ` (${iv.timezone})` : ""}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="mt-1 text-sm text-emerald-800">No overlap with the {interviewerLabel || form.interviewer_id ? "interviewer's or the " : ""}candidate's other interviews.</p>
                    )
                  ) : (
                    <p className="mt-1 text-sm text-gray-600">Pick a start time to check for overlaps.</p>
                  )}
                  {check.interviewerDay.length > 0 && (
                    <div className="mt-3 border-t border-black/5 pt-3">
                      <p className="text-xs font-semibold text-gray-700">{interviewerLabel || "The interviewer"} on {longDay(form.interview_date)}</p>
                      <ul className="mt-1.5 space-y-1">
                        {check.interviewerDay.map((iv) => (
                          <li key={iv.id} className="flex items-center gap-2 text-xs text-gray-700">
                            <span className={`w-28 shrink-0 font-medium ${check.clash.has(iv.id) ? "text-amber-800" : ""}`}>{timeRange(iv) || "No time set"}</span>
                            <span className="min-w-0 truncate">{iv.candidate_name || "—"} · {typeLabel(iv.interview_type)}</span>
                            {check.clash.has(iv.id) && <StatusPill tone="amber">Overlaps</StatusPill>}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  <p className="mt-3 text-[11px] text-gray-500">Checked against the {interviews.length} interview{interviews.length === 1 ? "" : "s"} loaded on this page.</p>
                </section>
              )}

              <FormSection id="iv-sec-notes" icon={StickyNote} title="Notes for the panel" hint="Internal; not included in the candidate's email.">
                <label htmlFor="iv-notes" className="sr-only">Notes for the panel</label>
                <textarea id="iv-notes" rows={3} maxLength={5000} value={form.notes} placeholder="Focus areas, questions to cover, anything the panel should know"
                  aria-invalid={!!err("notes")} aria-describedby={described("notes")}
                  onChange={(e) => setField("notes", e.target.value)} className={fieldLook(err("notes"))} />
                <div className="mt-1 flex justify-between"><FieldError id="iv-notes-err">{err("notes")}</FieldError><span className="ml-auto text-[11px] text-gray-400">{form.notes.length}/5000</span></div>
              </FormSection>
            </fieldset>
          </div>

          <footer className="shrink-0 border-t border-gray-200 bg-white px-4 py-3 sm:rounded-bl-2xl sm:px-6 sm:py-4">
            {saveError ? <p role="alert" className="mb-3 flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />{saveError}</p> : null}
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <label className="flex min-w-0 items-start gap-2 text-xs text-gray-600">
                <input type="checkbox" checked={form.notify} disabled={saving} onChange={(e) => setField("notify", e.target.checked)} className="mt-0.5 h-4 w-4 rounded border-gray-300 text-blue-600" />
                <span className="min-w-0">
                  <span className="flex items-center gap-1 font-medium text-gray-800"><Mail className="h-3.5 w-3.5" aria-hidden="true" />Send calendar invitations</span>
                  {recipients.length
                    ? `${recipients.join(" and ").replace(/^t/, "T")} ${recipients.length > 1 ? "get" : "gets"} an email with a calendar invite${editing ? " if the date, time or status changes" : ""}.`
                    : "Nobody can be emailed: link a candidate or pick an employee as interviewer."}
                </span>
              </label>
              <div className="flex shrink-0 justify-end gap-2">
                <SecondaryButton onClick={requestClose} disabled={saving}>Cancel</SecondaryButton>
                <PrimaryButton type="submit" disabled={saving} aria-busy={saving}>
                  {saving && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
                  {saving ? "Saving…" : editing ? "Update" : "Create"}
                </PrimaryButton>
              </div>
            </div>
          </footer>
        </form>
      </div>
    </div>
  );
}

export default function Interviews() {
  const [tab, setTab] = useState("upcoming");
  const [interviews, setInterviews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);       // the page could not load
  const [notice, setNotice] = useState("");        // an action failed: a banner, the page stays
  const [errors, setErrors] = useState({});        // field messages in the dialog
  const [saveError, setSaveError] = useState("");
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [showAll, setShowAll] = useState(false);
  const [page, setPage] = useState(1);
  const [menu, setMenu] = useState(null);          // { id, top, right } of the open "…" menu
  const [selectedId, setSelectedId] = useState(null);

  const [showModal, setShowModal] = useState(false);
  const [editItem, setEditItem] = useState(null);
  const [form, setForm] = useState({ ...initForm });
  const [candidates, setCandidates] = useState([]);
  const [people, setPeople] = useState([]);
  const [success, setSuccess] = useState("");
  const [feedbackFor, setFeedbackFor] = useState(null);
  const [feedbackForm, setFeedbackForm] = useState({ feedback: "", rating: 0, complete: true });
  const [scorecardFor, setScorecardFor] = useState(null);
  const [scorecardCriteria, setScorecardCriteria] = useState([]);
  const [scorecardSummary, setScorecardSummary] = useState(null);
  const [scorecardForm, setScorecardForm] = useState({ scores: [], questions: "", evidence_notes: "", strengths: "", concerns: "", adjustments_provided: "", recommendation: "proceed", recommendation_reason: "", mark_completed: false });
  const [scorecardBusy, setScorecardBusy] = useState(false);
  const [scorecardError, setScorecardError] = useState("");

  const insights = useInsights("interviews");
  const reloadInsights = insights.reload;
  const today = isoDay(new Date());

  const fetchAll = useCallback(() => {
    setLoading(true);
    setError(null);
    Promise.all([
      getInterviews({ per_page: 100 }),
      getCandidates({ per_page: 100 }).catch(() => ({ items: [] })),
      getEmployees({ per_page: 200, include_all_roles: true, status: "active" }).catch(() => ({ items: [] })),
    ]).then(([d, c, e]) => {
      const list = Array.isArray(d) ? d : d?.items || d?.data || [];
      // upcoming first (soonest at the top), then past interviews, most recent first
      const now = isoDay(new Date());
      list.sort((a, b) => {
        const fa = dayOf(a) >= now, fb = dayOf(b) >= now;
        if (fa !== fb) return fa ? -1 : 1;
        const ka = `${dayOf(a)} ${a.start_time || ""}`, kb = `${dayOf(b)} ${b.start_time || ""}`;
        return fa ? ka.localeCompare(kb) : kb.localeCompare(ka);
      });
      setInterviews(list);
      setCandidates((Array.isArray(c) ? c : c?.items || []).filter((x) => x.status !== "hired" && x.status !== "rejected"));
      setPeople(Array.isArray(e) ? e : e?.items || e?.employees || []);
    }).catch((err) => {
      setError(err.message || "Failed to load interview data.");
    }).finally(() => setLoading(false));
  }, []);
  // every change reloads the list and the insight numbers together
  const load = useCallback(() => { fetchAll(); reloadInsights(); }, [fetchAll]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // the "…" menu closes on Escape, a click elsewhere, or when the page scrolls (it is positioned on the screen)
  useEffect(() => {
    if (!menu) return undefined;
    const close = () => setMenu(null);
    const onKey = (e) => { if (e.key === "Escape") close(); };
    const onDown = (e) => { if (!e.target.closest?.("[data-row-menu]")) close(); };
    window.addEventListener("keydown", onKey);
    window.addEventListener("mousedown", onDown);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [menu]);

  const panels = insights.data?.panels || {};
  const panelOf = useCallback((iv) => {
    const members = panels[iv.id]?.members;
    if (Array.isArray(members) && members.length) return members;
    return iv.interviewer ? [iv.interviewer] : [];
  }, [panels]);
  const hasFeedback = (iv) => Boolean(String(iv.feedback || "").trim()) || (panels[iv.id]?.feedback_count || 0) > 0;
  const needsFeedback = (iv) => dayOf(iv) && dayOf(iv) <= today && ["scheduled", "in_progress", "completed"].includes(iv.status || "scheduled") && !hasFeedback(iv);
  const candidateOf = (iv) => candidates.find((c) => String(c.id) === String(iv.candidate_id));

  const emailedText = (n) => (n ? ` ${n} email${n === 1 ? "" : "s"} sent.` : "");

  const changeStatus = async (interview, action) => {
    setMenu(null);
    if (action.status === "scheduled") {          // reschedule: pick the new date and time first
      openEdit(interview, { status: "scheduled" });
      return;
    }
    if (action.confirm && !window.confirm(`${action.confirm} The candidate and interviewer are emailed.`)) return;
    setNotice("");
    try {
      const r = await updateInterview(interview.id, { status: action.status });
      setSuccess(`Interview ${STATUS_LABELS[action.status]?.toLowerCase() || action.status}.${emailedText(r?.emails_sent)}`);
    } catch (err) {
      setNotice(err?.message || "The status could not be changed.");
    }
    load();
  };

  const handleDelete = async (iv) => {
    setMenu(null);
    if (!window.confirm("Delete this interview? No email is sent; cancel it instead to tell the candidate.")) return;
    try {
      await deleteInterview(iv.id);
      setSuccess("Interview deleted.");
      if (selectedId === iv.id) setSelectedId(null);
      load();
    } catch (err) {
      setNotice(err?.message || "The interview could not be deleted.");
    }
  };

  // filter choices come from the interviews that are loaded
  const typeChoices = useMemo(() => [...new Set(interviews.map((i) => i.interview_type).filter(Boolean))]
    .map((v) => ({ value: v, label: typeLabel(v) })).sort((a, b) => a.label.localeCompare(b.label)), [interviews]);
  const statusChoices = useMemo(() => [...new Set(interviews.map((i) => i.status || "scheduled"))]
    .map((v) => ({ value: v, label: statusLabel(v) })), [interviews]);

  const isUpcoming = (iv) => dayOf(iv) >= today || iv.status === "in_progress";
  const scoped = showAll ? interviews : interviews.filter(isUpcoming);
  const filteredSchedule = scoped.filter((e) => {
    const q = search.trim().toLowerCase();
    if (q && !e.candidate_name?.toLowerCase().includes(q) && !e.position?.toLowerCase().includes(q)) return false;
    if (typeFilter && e.interview_type !== typeFilter) return false;
    if (statusFilter && (e.status || "scheduled") !== statusFilter) return false;
    return true;
  });

  const totalPages = Math.max(1, Math.ceil(filteredSchedule.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const paged = filteredSchedule.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);
  const feedbackDue = interviews.filter(needsFeedback);
  const dueDays = insights.data?.feedback_completion?.due_days;

  const formStart = useRef("");                  // the form as it opened: closing a changed form asks first
  const isDirty = useCallback(() => JSON.stringify(form) !== formStart.current, [form]);
  const openCreate = () => {
    const fresh = { ...initForm };
    formStart.current = JSON.stringify(fresh);
    setEditItem(null); setForm(fresh); setErrors({}); setSaveError(""); setShowModal(true);
  };
  const setField = (key, value) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => (prev[key] ? { ...prev, [key]: undefined } : prev));
  };
  const openEdit = (e, override = {}) => {
    setMenu(null);
    setEditItem(e);
    const next = {
      ...initForm,
      candidate_id: e.candidate_id ? String(e.candidate_id) : "",
      candidate_name: e.candidate_name || "",
      position: e.position || "",
      interview_type: e.interview_type || "video",
      interview_date: e.interview_date ? String(e.interview_date).split("T")[0] : "",
      start_time: e.start_time || "",
      end_time: e.end_time || "",
      timezone: e.timezone || BROWSER_TZ,
      meeting_link: e.meeting_link || "",
      location: e.location || "",
      interviewer_id: e.interviewer_id ? String(e.interviewer_id) : "",
      interviewer: e.interviewer || "",
      status: e.status || "scheduled",
      notes: e.notes || "",
      ...override,
    };
    formStart.current = JSON.stringify(next);
    setForm(next);
    setErrors({}); setSaveError("");
    setShowModal(true);
  };

  const pickCandidate = (id) => {
    const c = candidates.find((x) => String(x.id) === String(id));
    setForm((prev) => ({ ...prev, candidate_id: id, candidate_name: c ? c.name : prev.candidate_name, position: c ? c.position : prev.position }));
    setErrors((prev) => ({ ...prev, candidate_name: undefined, position: undefined }));
  };

  const handleSave = async () => {
    const found = validateInterviewForm(form);
    setErrors(found);
    setSaveError("");
    if (Object.keys(found).length) { focusFirstError(found); return; }
    setSaving(true);
    try {
      const payload = {
        candidate_id: form.candidate_id ? Number(form.candidate_id) : null,
        candidate_name: form.candidate_name.trim() || null,
        position: form.position.trim() || null,
        interview_type: form.interview_type,
        interview_date: form.interview_date,
        start_time: form.start_time || null,
        end_time: form.end_time || null,
        timezone: form.timezone || null,
        // only the place fields the chosen type shows are kept
        meeting_link: SHOWS_LINK.has(form.interview_type) ? form.meeting_link.trim() || null : null,
        location: SHOWS_LOCATION.has(form.interview_type) ? form.location.trim() || null : null,
        interviewer_id: form.interviewer_id ? Number(form.interviewer_id) : null,
        interviewer: form.interviewer_id ? null : (form.interviewer.trim() || null),
        notes: form.notes.trim() || null,
        notify: form.notify,
      };
      let r;
      if (editItem) {
        // the status is sent only when it was changed, so saving details never touches it
        if (form.status !== (editItem.status || "scheduled")) payload.status = form.status;
        r = await updateInterview(editItem.id, payload);
      } else {
        r = await createInterview(payload);
      }
      setShowModal(false);
      setNotice("");
      setSuccess(`${editItem ? "Interview updated." : "Interview scheduled."}${emailedText(r?.emails_sent)}`);
      load();
    } catch (err) {
      const fields = serverFieldErrors(err);
      if (Object.keys(fields).length) {
        setErrors((prev) => ({ ...prev, ...fields }));
        setSaveError("The interview was not saved. Check the highlighted fields.");
        focusFirstError(fields);
      } else {
        setSaveError(err?.message || "The interview could not be saved. Please try again.");
      }
    } finally {
      setSaving(false);
    }
  };

  const openFeedback = (iv) => {
    setMenu(null);
    setFeedbackFor(iv);
    setFeedbackForm({ feedback: iv.feedback || "", rating: iv.rating || 0, complete: iv.status !== "completed" });
  };

  const saveFeedback = async () => {
    try {
      const body = { feedback: feedbackForm.feedback.trim() || null, rating: feedbackForm.rating || null };
      if (feedbackForm.complete && feedbackFor.status !== "completed") body.status = "completed";
      await updateInterviewFeedback(feedbackFor.id, body);
      setFeedbackFor(null);
      setSuccess("Feedback saved.");
      load();
    } catch (err) {
      setNotice(err.message || "Failed to save feedback.");
    }
  };

  const openScorecard = async (interview) => {
    setMenu(null);
    setScorecardFor(interview);
    setScorecardError("");
    const candidate = candidates.find((c) => String(c.id) === String(interview.candidate_id));
    let criteria = [];
    let summary = null;
    if (candidate?.requisition_id) {
      try {
        const response = await getRequisitionScorecards(candidate.requisition_id);
        criteria = response?.criteria || [];
        summary = (response?.candidates || []).find((row) => String(row.candidate_id) === String(candidate.id)) || null;
      } catch (e) {
        setScorecardError(e?.message || "Requisition scorecards could not be loaded.");
      }
    }
    if (!criteria.length) criteria = [{ key: "overall", label: "Overall assessment", weight: 1 }];
    setScorecardCriteria(criteria);
    setScorecardSummary(summary);
    setScorecardForm({
      scores: criteria.map((criterion) => ({ criterion_key: criterion.key, label: criterion.label || criterion.key, score: "", evidence: "" })),
      questions: "", evidence_notes: "", strengths: "", concerns: "", adjustments_provided: "",
      recommendation: "proceed", recommendation_reason: "", mark_completed: false,
    });
  };

  const saveScorecard = async (event) => {
    event.preventDefault();
    const missingEvidence = scorecardForm.scores.some((item) => !item.evidence.trim() || !item.score);
    if (missingEvidence) {
      setScorecardError("Select a score and record evidence for every criterion.");
      return;
    }
    if (scorecardForm.recommendation !== "proceed" && !scorecardForm.recommendation_reason.trim()) {
      setScorecardError("Give a job-related reason for this recommendation.");
      return;
    }
    setScorecardBusy(true);
    setScorecardError("");
    try {
      await submitInterviewScorecard(scorecardFor.id, {
        ...scorecardForm,
        scores: scorecardForm.scores.map((item) => ({ ...item, score: Number(item.score) })),
        questions: scorecardForm.questions.split("\n").map((question) => question.trim()).filter(Boolean),
        stage: scorecardFor.status || "interview",
        recommendation_reason: scorecardForm.recommendation_reason.trim() || null,
      });
      setScorecardFor(null);
      setSuccess("Structured scorecard saved.");
      load();
    } catch (e) {
      setScorecardError(e?.message || "Scorecard could not be saved.");
    } finally {
      setScorecardBusy(false);
    }
  };

  const toggleMenu = (iv, ev) => {
    if (menu?.id === iv.id) { setMenu(null); return; }
    const r = ev.currentTarget.getBoundingClientRect?.() || { bottom: 0, right: 0 };
    setMenu({ id: iv.id, top: r.bottom + 4, right: Math.max(8, (window.innerWidth || 0) - r.right) });
  };

  // the "…" menu: edit, feedback, scorecard, the status moves the interview allows, delete
  const RowMenu = ({ iv }) => {
    const acts = cardActions(iv.status || "scheduled");
    const item = "flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-gray-50";
    return (
      <div data-row-menu="" style={{ position: "fixed", top: menu.top, right: menu.right }}
        className="z-30 w-52 overflow-hidden rounded-xl border border-gray-200 bg-white py-1 text-gray-700 shadow-lg">
        <button type="button" className={item} onClick={() => openEdit(iv)}><Pencil className="h-4 w-4 text-gray-400" />Edit</button>
        {iv.status !== "cancelled" && (
          <>
            <button type="button" className={item} onClick={() => openFeedback(iv)}>
              <MessageSquare className="h-4 w-4 text-gray-400" />Feedback
              {iv.rating ? <span className="ml-auto flex items-center text-xs text-amber-500"><Star className="h-3 w-3 fill-current" />{iv.rating}</span> : null}
            </button>
            {iv.candidate_id && <button type="button" className={item} onClick={() => openScorecard(iv)}><Star className="h-4 w-4 text-gray-400" />Scorecard</button>}
          </>
        )}
        <div data-status-actions="" aria-label="Status actions" className="border-t border-gray-100 py-1">
          {acts.map((act) => (
            <button key={act.status} type="button" onClick={() => changeStatus(iv, act)}
              className={`${item} ${act.tone === "red" ? "text-rose-600" : act.tone === "green" ? "text-emerald-700" : act.tone === "blue" ? "text-blue-700" : ""}`}>
              {act.status === "cancelled" ? <CircleX className="h-4 w-4" /> : act.status === "completed" ? <CheckCircle2 className="h-4 w-4" /> : act.status === "scheduled" ? <CalendarClock className="h-4 w-4" /> : <Video className="h-4 w-4" />}
              {act.text}
            </button>
          ))}
          {acts.length === 0 ? <p className="px-3 py-2 text-xs text-gray-400">Final</p> : null}
        </div>
        <div className="border-t border-gray-100 pt-1">
          <button type="button" className={`${item} text-rose-600`} onClick={() => handleDelete(iv)}><Trash2 className="h-4 w-4" />Delete</button>
        </div>
      </div>
    );
  };

  const canJoin = (iv) => Boolean(iv.meeting_link) && iv.status !== "cancelled" && iv.status !== "completed"
    && (dayOf(iv) === today || iv.status === "in_progress");

  const RowActions = ({ iv }) => (
    <div className="flex items-center justify-end gap-2" data-row-menu="">
      {canJoin(iv) ? (
        <a href={iv.meeting_link} target="_blank" rel="noopener noreferrer"
          className="inline-flex items-center rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700">Join</a>
      ) : (
        <button type="button" onClick={() => { setMenu(null); setSelectedId(iv.id); }}
          className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50">View</button>
      )}
      <button type="button" aria-label={`More actions for ${iv.candidate_name || `interview ${iv.id}`}`} aria-haspopup="menu" aria-expanded={menu?.id === iv.id}
        onClick={(ev) => toggleMenu(iv, ev)} className="rounded-lg border border-gray-200 bg-white p-1.5 text-gray-500 hover:bg-gray-50">
        <MoreHorizontal className="h-4 w-4" />
      </button>
      {menu?.id === iv.id && <RowMenu iv={iv} />}
    </div>
  );

  const candidateSub = (iv) => {
    if (!iv.candidate_id) return <span title="Not linked to a candidate record: the candidate is not emailed" className="text-amber-600">⚠ Not linked to a candidate</span>;
    return candidateOf(iv)?.email || null;
  };
  const roleSub = (iv) => { const c = candidateOf(iv); return c?.requisition_id ? `Req #${c.requisition_id}` : null; };

  const selected = selectedId != null ? interviews.find((iv) => iv.id === selectedId) : null;

  const detail = selected ? (
    <DetailPanel title="Interview details" onClose={() => setSelectedId(null)}
      header={<PersonCell name={selected.candidate_name} sub={selected.position || "—"} />}>
      <div className="flex flex-wrap items-center gap-2"><IvStatus status={selected.status} />
        {needsFeedback(selected) && <StatusPill tone="amber">Feedback pending</StatusPill>}</div>
      <div className="mt-4 flex flex-wrap gap-2">
        {canJoin(selected) && <QuickAction icon={ExternalLink} label="Join" tone="primary" onClick={() => window.open(selected.meeting_link, "_blank", "noopener,noreferrer")} />}
        <QuickAction icon={Pencil} label="Edit" onClick={() => openEdit(selected)} />
        {selected.status !== "cancelled" && <QuickAction icon={MessageSquare} label="Feedback" onClick={() => openFeedback(selected)} />}
        {selected.status !== "cancelled" && selected.candidate_id && <QuickAction icon={ClipboardCheck} label="Scorecard" onClick={() => openScorecard(selected)} />}
      </div>
      <DetailSection title="Schedule">
        <dl className="space-y-2 text-sm">
          <div className="flex justify-between gap-3"><dt className="text-gray-500">Date</dt><dd className="text-right text-gray-900">{formatDate(dayOf(selected))}</dd></div>
          <div className="flex justify-between gap-3"><dt className="text-gray-500">Time</dt><dd className="text-right text-gray-900">{timeRange(selected) || "—"}{selected.timezone ? ` (${selected.timezone})` : ""}</dd></div>
          <div className="flex justify-between gap-3"><dt className="text-gray-500">Type</dt><dd className="text-right text-gray-900">{typeLabel(selected.interview_type)}</dd></div>
          <div className="flex justify-between gap-3"><dt className="text-gray-500">Meeting link</dt><dd className="min-w-0 truncate text-right">{selected.meeting_link ? <a href={selected.meeting_link} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">Open link</a> : "—"}</dd></div>
          <div className="flex justify-between gap-3"><dt className="text-gray-500">Location</dt><dd className="flex items-center gap-1 text-right text-gray-900">{selected.location ? <><MapPin className="h-3.5 w-3.5 text-gray-400" />{selected.location}</> : "—"}</dd></div>
        </dl>
      </DetailSection>
      <DetailSection title="Panel">
        {panelOf(selected).length ? (
          <ul className="space-y-2">{panelOf(selected).map((n) => <li key={n}><PersonCell name={n} /></li>)}</ul>
        ) : <p className="text-sm text-gray-500">—</p>}
      </DetailSection>
      <DetailSection title="Feedback">
        {selected.rating ? <p className="flex items-center gap-1 text-sm text-amber-500"><Star className="h-4 w-4 fill-current" />{selected.rating} / 5</p> : null}
        <p className="whitespace-pre-wrap break-words text-sm text-gray-700">{selected.feedback || (panels[selected.id]?.feedback_count ? `${panels[selected.id].feedback_count} scorecard(s) recorded` : "—")}</p>
      </DetailSection>
      {selected.notes ? <DetailSection title="Internal notes"><p className="whitespace-pre-wrap break-words text-sm text-gray-700">{selected.notes}</p></DetailSection> : null}
      <DetailSection title="Status">
        <div className="flex flex-wrap gap-2">
          {cardActions(selected.status || "scheduled").map((act) => (
            <QuickAction key={act.status} label={act.text} tone={act.tone === "red" ? "danger" : "default"} onClick={() => changeStatus(selected, act)} />
          ))}
          {cardActions(selected.status || "scheduled").length === 0 && <p className="text-xs text-gray-400">A completed interview is final.</p>}
        </div>
      </DetailSection>
      <div className="mt-6 border-t border-gray-100 pt-4">
        <button type="button" onClick={() => handleDelete(selected)} className="inline-flex items-center gap-2 text-sm font-medium text-rose-600 hover:text-rose-700"><Trash2 className="h-4 w-4" />Delete interview</button>
      </div>
    </DetailPanel>
  ) : null;

  const k = insights.data?.kpis || {};
  const kLoading = insights.loading;
  const layout = (body) => (
    <RecruitmentLayout title="Interviews" subtitle="Coordinate interview schedules, interview panels, and feedback completion."
      actions={<PrimaryButton icon={Plus} onClick={openCreate}>Schedule Interview</PrimaryButton>}>
      {body}
    </RecruitmentLayout>
  );

  if (loading && interviews.length === 0 && !error) return layout(<div className="space-y-6"><div className="h-28 animate-pulse rounded-2xl bg-white" /><div className="h-64 animate-pulse rounded-2xl bg-white" /><p className="text-sm text-gray-400">Loading...</p></div>);

  if (error && interviews.length === 0) return layout(<div className="rounded-2xl border border-rose-200 bg-rose-50 p-6 text-center"><div className="inline-flex items-center gap-2 text-sm text-rose-700"><AlertCircle className="w-5 h-5" />{error}</div><div className="mt-4"><PrimaryButton onClick={load}>Try Again</PrimaryButton></div></div>);

  const TABS = [
    { value: "upcoming", label: "Upcoming", icon: LayoutList },
    { value: "calendar", label: "Calendar", icon: CalendarDays },
    { value: "panels", label: "Panels", icon: Users },
    { value: "feedback", label: "Feedback", icon: MessageSquare },
  ];
  const openById = (id) => { setMenu(null); setSelectedId(id); };

  const upcomingCard = (
    <Card title={`${showAll ? "All Interviews" : "Upcoming Interviews"} (${filteredSchedule.length})`} bodyClass="pt-3"
      action={<LinkButton aria-label={showAll ? "Show upcoming interviews" : "View all interviews"} onClick={() => { setShowAll((v) => !v); setPage(1); }}>{showAll ? "Show Upcoming" : "View All"}</LinkButton>}>
      <div className="flex flex-wrap items-end gap-3 px-5 pb-3">
        <SearchInput value={search} onChange={(v) => { setSearch(v); setPage(1); }} placeholder="Search candidate or role…" label="Search interviews" />
        <FilterSelect label="Interview type" allLabel="All interview types" value={typeFilter} onChange={(v) => { setTypeFilter(v); setPage(1); }} options={typeChoices} />
        <FilterSelect label="Status" allLabel="All statuses" value={statusFilter} onChange={(v) => { setStatusFilter(v); setPage(1); }} options={statusChoices} />
      </div>
      <Table columns={[{ label: "Candidate" }, { label: "Role" }, { label: "Interview Type" }, { label: "Panel" }, { label: "Date & Time" }, { label: "Status" }, { label: "Actions", className: "text-right" }]}
        empty={paged.length === 0 ? <EmptyState icon={CalendarDays} title={interviews.length ? "No interviews match" : "No interviews yet"}>
          {interviews.length ? (showAll ? "Try another search or filter." : "Nothing upcoming; use View All for past interviews.") : "Scheduled interviews appear here."}</EmptyState> : null}>
        {paged.map((e) => (
          <tr key={e.id} className="hover:bg-gray-50/60">
            <td className={`${td} min-w-[12rem]`}><PersonCell name={e.candidate_name} sub={candidateSub(e)} /></td>
            <td className={`${td} min-w-[9rem]`}>
              <p className="font-medium text-gray-800">{e.position || "—"}</p>
              {roleSub(e) && <p className="text-xs text-gray-500">{roleSub(e)}</p>}
            </td>
            <td className={td}><TypeCell type={e.interview_type} /></td>
            <td className={td}>{panelOf(e).length ? <AvatarStack names={panelOf(e)} max={3} /> : <span className="text-gray-400">—</span>}</td>
            <td className={`${td} min-w-[9rem]`}>
              <p className="font-medium text-gray-800">{dayLabel(dayOf(e), today)}</p>
              <p className="text-xs text-gray-500">{timeRange(e) || "—"}{e.timezone ? <span className="text-gray-400"> ({e.timezone})</span> : null}</p>
            </td>
            <td className={td}>
              <div className="flex flex-col items-start gap-1">
                <IvStatus status={e.status} />
                {needsFeedback(e) && <span className="text-[11px] font-medium text-amber-600">Feedback pending</span>}
              </div>
            </td>
            <td className={`${td} text-right`}><RowActions iv={e} /></td>
          </tr>
        ))}
      </Table>
      {filteredSchedule.length > PAGE_SIZE && <Pagination page={safePage} pageSize={PAGE_SIZE} total={filteredSchedule.length} onPage={setPage} />}
    </Card>
  );

  const feedbackCard = (
    <Card title={`Feedback Needed (${feedbackDue.length})`} bodyClass="pt-3"
      action={<span className="text-xs text-gray-500">Held interviews with no feedback or scorecard yet</span>}>
      <Table columns={[{ label: "Candidate" }, { label: "Role" }, { label: "Interview" }, { label: "Panel" }, { label: "Waiting" }, { label: "Actions", className: "text-right" }]}
        empty={feedbackDue.length === 0 ? <EmptyState icon={CheckCircle2} title="All feedback is in">Interviews that have taken place without feedback appear here.</EmptyState> : null}>
        {feedbackDue.map((e) => {
          const waited = daysBetween(dayOf(e), today);
          const overdue = dueDays != null && waited > dueDays;
          return (
            <tr key={e.id} className="hover:bg-gray-50/60">
              <td className={`${td} min-w-[12rem]`}><PersonCell name={e.candidate_name} sub={candidateSub(e)} /></td>
              <td className={td}>{e.position || "—"}</td>
              <td className={td}><p className="text-gray-800">{typeLabel(e.interview_type)}</p><p className="text-xs text-gray-500">{formatDate(dayOf(e))}</p></td>
              <td className={td}>{panelOf(e).length ? <AvatarStack names={panelOf(e)} max={3} /> : <span className="text-gray-400">—</span>}</td>
              <td className={td}>
                <StatusPill tone={overdue ? "red" : "amber"}>{waited === 0 ? "Today" : `${waited} day${waited === 1 ? "" : "s"}`}{overdue ? " · Overdue" : ""}</StatusPill>
              </td>
              <td className={`${td} text-right`}>
                <div className="flex items-center justify-end gap-2">
                  <button type="button" onClick={() => openFeedback(e)} className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50">Feedback</button>
                  {e.candidate_id && <button type="button" onClick={() => openScorecard(e)} className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700">Scorecard</button>}
                </div>
              </td>
            </tr>
          );
        })}
      </Table>
    </Card>
  );

  const sideColumn = detail || (
    <div className="space-y-6">
      <TodaysAgenda rows={insights.data?.today_agenda || []} loading={kLoading} onOpen={openById} onCalendar={() => setTab("calendar")} />
      <InterviewerWorkload rows={insights.data?.interviewer_workload || []} loading={kLoading} onViewAll={() => setTab("panels")} />
      <FeedbackCompletion data={insights.data?.feedback_completion} loading={kLoading} onViewAll={() => setTab("feedback")} />
    </div>
  );

  return layout(
    <>
      <div className="space-y-6">
        {notice ? (
          <div role="alert" className="px-4 py-3 bg-red-50 border border-red-200 text-red-700 text-sm font-medium rounded-xl flex items-center justify-between gap-2">
            <span className="min-w-0 break-words">{notice}</span>
            <button onClick={() => setNotice("")} aria-label="Dismiss" className="shrink-0 -my-1 px-2 py-0.5 text-red-500 hover:text-red-800 text-lg">&times;</button>
          </div>
        ) : null}
        {success ? (
          <div className="px-4 py-3 bg-green-50 border border-green-200 text-green-700 text-sm font-medium rounded-xl flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 shrink-0" /><span className="min-w-0 break-words">{success}</span>
            <button onClick={() => setSuccess("")} aria-label="Dismiss" className="ml-auto shrink-0 -my-1 px-2 py-0.5 text-green-600 hover:text-green-800 text-lg">&times;</button>
          </div>
        ) : null}
        {insights.error ? (
          <p role="status" className="flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-800">
            <AlertCircle className="h-4 w-4 shrink-0" />{insights.error}
            <button type="button" onClick={reloadInsights} className="ml-auto font-medium underline">Retry</button>
          </p>
        ) : null}

        <KpiGrid cols={5}>
          <KpiCard label="Scheduled Today" icon={CalendarDays} tone="blue" kpi={k.scheduled_today} loading={kLoading} />
          <KpiCard label="Scheduled This Week" icon={Users} tone="green" kpi={k.scheduled_this_week} loading={kLoading} />
          <KpiCard label="Pending Feedback" icon={MessageSquare} tone="violet" kpi={k.pending_feedback} loading={kLoading} />
          <KpiCard label="Completed" icon={CheckCircle2} tone="amber" kpi={k.completed} loading={kLoading} />
          <KpiCard label="Canceled Rate" icon={CircleX} tone="pink" kpi={k.cancel_rate} loading={kLoading} format={(v) => `${v}%`} />
        </KpiGrid>

        <div className="grid grid-cols-1 gap-6 2xl:grid-cols-[minmax(0,1fr)_360px]">
          <div className="min-w-0 space-y-4">
            <SegmentTabs label="Interview views" value={tab} onChange={(v) => { setTab(v); setMenu(null); }} tabs={TABS} />
            {tab === "upcoming" && upcomingCard}
            {tab === "calendar" && <CalendarView interviews={interviews} today={today} onOpen={openById} />}
            {tab === "panels" && <PanelsView interviews={interviews} panelOf={panelOf} today={today} onOpen={openById} />}
            {tab === "feedback" && feedbackCard}
          </div>
          <div className="min-w-0">{sideColumn}</div>
        </div>
      </div>

      {showModal && (
        <ScheduleInterviewPanel editItem={editItem} form={form} setForm={setForm} setField={setField} errors={errors} setErrors={setErrors}
          saveError={saveError} saving={saving} candidates={candidates} people={people} interviews={interviews} pickCandidate={pickCandidate}
          isDirty={isDirty} onClose={() => setShowModal(false)} onSubmit={handleSave} today={today} />
      )}

      {feedbackFor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-3 sm:p-4">
          <div className="bg-white rounded-xl p-4 sm:p-6 w-full max-w-md shadow-xl max-h-[92vh] overflow-y-auto">
            <div className="flex justify-between items-center gap-2 mb-4">
              <h2 className="min-w-0 break-words text-lg font-semibold">Feedback · {feedbackFor.candidate_name}</h2>
              <button type="button" onClick={() => setFeedbackFor(null)} aria-label="Close" className="shrink-0 -m-1.5 p-1.5"><X className="w-5 h-5 text-gray-400" /></button>
            </div>
            <label className="text-xs text-gray-500 font-medium">Rating</label>
            <div className="mt-1 mb-3 flex gap-1">
              {[1, 2, 3, 4, 5].map((n) => (
                <button key={n} type="button" aria-label={`${n} star${n > 1 ? "s" : ""}`} onClick={() => setFeedbackForm({ ...feedbackForm, rating: n === feedbackForm.rating ? 0 : n })}>
                  <Star className={`h-6 w-6 ${n <= feedbackForm.rating ? "fill-amber-400 text-amber-400" : "text-gray-300"}`} />
                </button>
              ))}
            </div>
            <label htmlFor="fb-text" className="text-xs text-gray-500 font-medium">Feedback</label>
            <textarea id="fb-text" rows={4} maxLength={5000} value={feedbackForm.feedback} onChange={(e) => setFeedbackForm({ ...feedbackForm, feedback: e.target.value })} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
            {feedbackFor.status !== "completed" && (
              <label className="mt-3 flex items-center gap-2 text-sm text-gray-600">
                <input type="checkbox" checked={feedbackForm.complete} onChange={(e) => setFeedbackForm({ ...feedbackForm, complete: e.target.checked })} /> Mark the interview completed
              </label>
            )}
            <div className="flex flex-wrap justify-end gap-2 mt-5">
              <button type="button" onClick={() => setFeedbackFor(null)} className="px-4 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50">Cancel</button>
              <button type="button" onClick={saveFeedback} className="px-4 py-2 text-sm text-white bg-blue-600 rounded-lg hover:bg-blue-700">Save feedback</button>
            </div>
          </div>
        </div>
      )}

      {scorecardFor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-3 sm:p-4">
          <form onSubmit={saveScorecard} className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-xl bg-white p-4 shadow-xl sm:p-6">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold">Structured scorecard · {scorecardFor.candidate_name}</h2>
                <p className="mt-1 text-xs text-gray-500">{scorecardFor.position} · {scorecardFor.interview_type?.replace(/_/g, " ")}</p>
              </div>
              <button type="button" onClick={() => setScorecardFor(null)} aria-label="Close scorecard" className="-m-1.5 p-1.5"><X className="h-5 w-5 text-gray-400" /></button>
            </div>
            {scorecardError && <p role="alert" className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{scorecardError}</p>}
            {scorecardSummary && (
              <section className="mt-4 rounded-lg bg-indigo-50 p-3">
                <h3 className="text-sm font-semibold text-indigo-900">Existing requisition scorecards</h3>
                <p className="mt-1 text-xs text-indigo-800">Candidate average: {scorecardSummary.average ?? "—"} · {scorecardSummary.scorecards?.length || 0} scorecard(s)</p>
                <ul className="mt-2 space-y-1 text-xs text-indigo-800">
                  {(scorecardSummary.scorecards || []).map((item) => <li key={item.feedback_id}>Interview #{item.interview_id}: {item.weighted_total} · {item.recommendation?.replace(/_/g, " ")}</li>)}
                </ul>
              </section>
            )}
            <div className="mt-4 space-y-3">
              <h3 className="text-sm font-semibold text-gray-800">Criterion scores and evidence</h3>
              {scorecardCriteria.map((criterion, index) => (
                <fieldset key={criterion.key} className="grid gap-2 rounded-lg border border-gray-200 p-3 sm:grid-cols-[1fr_8rem]">
                  <legend className="px-1 text-sm font-medium text-gray-800">{criterion.label || criterion.key}{criterion.weight ? ` · weight ${criterion.weight}` : ""}</legend>
                  <label className="text-xs font-medium text-gray-600">Score (1–5)
                    <select required value={scorecardForm.scores[index]?.score ?? ""} onChange={(e) => setScorecardForm((prev) => ({ ...prev, scores: prev.scores.map((item, i) => i === index ? { ...item, score: e.target.value } : item) }))} className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm">
                      <option value="">Select</option>{[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}</option>)}
                    </select>
                  </label>
                  <label className="text-xs font-medium text-gray-600 sm:col-span-2">Evidence (required)
                    <textarea required maxLength={2000} rows={2} value={scorecardForm.scores[index]?.evidence || ""} onChange={(e) => setScorecardForm((prev) => ({ ...prev, scores: prev.scores.map((item, i) => i === index ? { ...item, evidence: e.target.value } : item) }))} className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" />
                  </label>
                </fieldset>
              ))}
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="text-xs font-medium text-gray-600">Recommendation
                  <select value={scorecardForm.recommendation} onChange={(e) => setScorecardForm({ ...scorecardForm, recommendation: e.target.value })} className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm">
                    <option value="proceed">Proceed</option><option value="hold">Hold</option><option value="do_not_proceed">Do not proceed</option>
                  </select>
                </label>
                <label className="text-xs font-medium text-gray-600">Job-related reason {scorecardForm.recommendation !== "proceed" ? "*" : "(optional)"}
                  <input required={scorecardForm.recommendation !== "proceed"} maxLength={3000} value={scorecardForm.recommendation_reason} onChange={(e) => setScorecardForm({ ...scorecardForm, recommendation_reason: e.target.value })} className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" />
                </label>
              </div>
              <label className="block text-xs font-medium text-gray-600">Interview questions (one per line)
                <textarea maxLength={5000} rows={2} value={scorecardForm.questions} onChange={(e) => setScorecardForm({ ...scorecardForm, questions: e.target.value })} className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" />
              </label>
              <div className="grid gap-3 sm:grid-cols-2">
                {[
                  ["evidence_notes", "Evidence notes"], ["strengths", "Strengths"], ["concerns", "Concerns"], ["adjustments_provided", "Adjustments provided"],
                ].map(([key, label]) => (
                  <label key={key} className="text-xs font-medium text-gray-600">{label}
                    <textarea maxLength={5000} rows={2} value={scorecardForm[key]} onChange={(e) => setScorecardForm({ ...scorecardForm, [key]: e.target.value })} className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" />
                  </label>
                ))}
              </div>
              <label className="flex items-center gap-2 text-sm text-gray-600">
                <input type="checkbox" checked={scorecardForm.mark_completed} onChange={(e) => setScorecardForm({ ...scorecardForm, mark_completed: e.target.checked })} />
                Mark the interview completed after saving
              </label>
            </div>
            <div className="mt-5 flex flex-wrap justify-end gap-2">
              <button type="button" onClick={() => setScorecardFor(null)} className="rounded-lg border border-gray-200 px-4 py-2 text-sm text-gray-600">Cancel</button>
              <button type="submit" disabled={scorecardBusy} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">{scorecardBusy ? "Saving…" : "Save scorecard"}</button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}
