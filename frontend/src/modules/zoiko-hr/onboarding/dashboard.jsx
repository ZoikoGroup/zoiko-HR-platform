/*
 * Onboarding Dashboard — the Recruitment look (recruitment/ui.jsx) over real data only:
 *  - live metrics, pipeline, joiner progress, orientation, activity and overdue counts from
 *    GET /hr/recruitment/insights?section=onboarding (useInsights("onboarding"));
 *  - totals, monthly trend, department split, completion split and the true upcoming count from
 *    GET /hr/onboarding/dashboard (getOnboardingDashboard), as before.
 */
import { useState, useEffect } from "react";
import { NavLink } from "react-router-dom";
import { getOnboardingDashboard } from "../../../service/hrService";
import {
  Activity, AlertCircle, AlertTriangle, BarChart3, Building2, CalendarCheck, CalendarDays, CheckCircle2, ChevronRight, Circle,
  ClipboardCheck, Clock, FileText, MapPin, Package, Percent, Plus, RefreshCw, Send, UserCheck, UserPlus, Users, Video, WalletCards,
  XCircle,
} from "lucide-react";
import { formatDate, formatDateTime, parseDateOnly } from "../../../utils/dateTime";
import { monthLabel, barPercent, completionParts } from "../../../utils/onboardingDashboard";
import { Avatar, Card, EmptyState, KpiCard, PersonCell, SecondaryButton, StatusPill, TONES, relativeTime, td, th, useInsights } from "../recruitment/ui";
import OnboardingLayout from "./OnboardingLayout";

const DEPARTMENT_COLORS = [
  "bg-blue-500", "bg-emerald-500", "bg-amber-500", "bg-[#0A1128]",
  "bg-rose-500", "bg-cyan-500", "bg-amber-600", "bg-teal-500",
];

const STAGE_LOOK = {
  offer_sent: { icon: Send, tone: "blue", bar: "bg-blue-400", tile: "bg-blue-50" },
  offer_accepted: { icon: UserCheck, tone: "violet", bar: "bg-violet-400", tile: "bg-violet-50" },
  in_progress: { icon: ClipboardCheck, tone: "amber", bar: "bg-amber-400", tile: "bg-amber-50" },
  completed: { icon: CheckCircle2, tone: "green", bar: "bg-emerald-400", tile: "bg-emerald-50" },
  cancelled: { icon: XCircle, tone: "gray", bar: "bg-gray-300", tile: "bg-gray-50" },
};

const STATUS_TONE = { offer_sent: "blue", offer_accepted: "violet", in_progress: "amber", completed: "green", cancelled: "gray" };

const linkClass = "text-sm font-medium text-blue-600 hover:underline";
const primaryLinkClass = "inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-blue-700";

const humanize = (s) => String(s || "").replace(/_/g, " ");

/** Whole days from today to a date-only value (negative when past); null when there is no usable date. */
function daysUntil(value) {
  const d = parseDateOnly(typeof value === "string" ? value.slice(0, 10) : value);
  if (!d) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((d.getTime() - today.getTime()) / 86400000);
}

function inDays(n) {
  if (n == null) return "";
  if (n === 0) return "today";
  if (n === 1) return "tomorrow";
  if (n > 1) return `in ${n} days`;
  return `${-n} day${n === -1 ? "" : "s"} ago`;
}

// label | bar | value. The label column is wide enough for a department name and never runs into the bar:
// a longer name is cut with "..." and the full name shows on hover.
function SimpleBar({ label, value, max, color, labelClass = "w-24 sm:w-28", detail }) {
  const pct = barPercent(value, max);
  return (
    <div className="flex items-center gap-3" title={detail || `${label}: ${value}`}>
      <span className={`text-xs text-gray-600 shrink-0 truncate ${labelClass}`}>{label}</span>
      <div className="flex-1 min-w-0 h-2.5 bg-gray-100 rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all duration-500 ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs font-semibold text-gray-700 w-8 shrink-0 text-right">{value}</span>
    </div>
  );
}

function PieSegment({ label, value, percent, color }) {
  return (
    <div className="flex items-center gap-2">
      <Circle size={10} fill={color} stroke={color} className="shrink-0" />
      <span className="text-xs text-gray-600 flex-1 min-w-0 break-words">{label}</span>
      <span className="text-xs font-medium text-gray-800 shrink-0">{percent}% ({value})</span>
    </div>
  );
}

/** A count that opens the page behind it. */
function GlanceTile({ title, count, icon: Icon, tone = "blue", to }) {
  const t = TONES[tone] || TONES.blue;
  return (
    <NavLink to={to} end className="flex items-center gap-3 rounded-xl border border-gray-100 px-3 py-2.5 transition hover:border-blue-200 hover:bg-blue-50/40 focus:outline-none focus:ring-2 focus:ring-blue-300">
      <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ${t.tile}`}><Icon className="h-4 w-4" /></span>
      <div className="min-w-0 flex-1">
        <p className="text-xs text-gray-500 break-words">{title}</p>
        <p className="text-lg font-bold text-gray-900">{count}</p>
      </div>
      <ChevronRight className="h-4 w-4 shrink-0 text-gray-300" aria-hidden="true" />
    </NavLink>
  );
}

function Pipeline({ stages }) {
  const total = stages.reduce((sum, s) => sum + (Number(s.count) || 0), 0);
  if (!total) return <EmptyState icon={Users} title="No new hires in the pipeline">New hires appear here by stage once an offer is sent or accepted.</EmptyState>;
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
      {stages.map((s, i) => {
        const look = STAGE_LOOK[s.key] || STAGE_LOOK.offer_sent;
        const Icon = look.icon;
        const pct = Math.round(((Number(s.count) || 0) * 100) / total);
        return (
          <div key={s.key} className="flex min-w-0 items-center gap-1">
            <div className="min-w-0 flex-1">
              <div className={`rounded-2xl p-3 ${look.tile}`}>
                <Icon className={`h-5 w-5 ${TONES[look.tone].tile.split(" ")[1]}`} />
                <p className="mt-2 truncate text-xs font-medium text-gray-600" title={s.label}>{s.label}</p>
                <p className="text-2xl font-bold text-gray-900">{s.count}</p>
              </div>
              <p className="mt-2 text-xs font-medium text-gray-600">{pct}%</p>
              <div className="mt-1 h-1.5 rounded-full bg-gray-100"><div className={`h-1.5 rounded-full ${look.bar}`} style={{ width: `${pct}%` }} /></div>
            </div>
            {i < stages.length - 1 && <ChevronRight className="hidden h-4 w-4 shrink-0 text-gray-300 xl:block" aria-hidden="true" />}
          </div>
        );
      })}
    </div>
  );
}

function ProgressBar({ pct }) {
  if (pct == null) return <span className="text-xs text-gray-400" title="No checklist assigned yet">—</span>;
  const color = pct >= 100 ? "bg-emerald-500" : pct >= 50 ? "bg-blue-500" : "bg-amber-500";
  return (
    <div className="flex min-w-[120px] items-center gap-2" title={`Checklist ${pct}% done`}>
      <div className="h-1.5 flex-1 rounded-full bg-gray-100"><div className={`h-1.5 rounded-full ${color}`} style={{ width: `${pct}%` }} /></div>
      <span className="w-9 shrink-0 text-right text-xs font-semibold text-gray-700">{pct}%</span>
    </div>
  );
}

function JoinerAlerts({ j }) {
  const pills = [];
  if (j.overdue > 0) pills.push(<StatusPill key="o" tone="red" icon={AlertTriangle}>{j.overdue} overdue</StatusPill>);
  if (j.open_tasks > 0) pills.push(<StatusPill key="t" tone="amber" icon={CalendarCheck}>{j.open_tasks} open task{j.open_tasks === 1 ? "" : "s"}</StatusPill>);
  if (j.pending_documents > 0) pills.push(<StatusPill key="d" tone="violet" icon={FileText}>{j.pending_documents} doc{j.pending_documents === 1 ? "" : "s"} pending</StatusPill>);
  if (!pills.length) {
    return j.overdue == null ? <span className="text-xs text-gray-400">—</span> : <StatusPill tone="green" icon={CheckCircle2}>On track</StatusPill>;
  }
  return <div className="flex flex-wrap gap-1">{pills}</div>;
}

function UpcomingJoiners({ rows, total }) {
  const note = total > rows.length ? `Showing next ${rows.length} of ${total} upcoming` : `${total} upcoming`;
  return (
    <Card title="Upcoming joiners" bodyClass="pt-3"
      action={<div className="flex items-center gap-3"><span className="text-xs text-gray-500">{note}</span>
        <NavLink to="/zoiko-hr/onboarding/new-hires" end className={linkClass}>View All</NavLink></div>}>
      {!rows.length ? <EmptyState icon={UserPlus} title="No upcoming joiners">New hires with a joining date ahead of today appear here.</EmptyState> : (
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-100">
            <thead className="bg-gray-50/60"><tr>
              <th scope="col" className={th}>New hire</th>
              <th scope="col" className={th}>Joining date</th>
              <th scope="col" className={th}>Manager</th>
              <th scope="col" className={th}>Status</th>
              <th scope="col" className={th}>Checklist</th>
              <th scope="col" className={th}>Alerts</th>
              <th scope="col" className={th}><span className="sr-only">Open</span></th>
            </tr></thead>
            <tbody className="divide-y divide-gray-100 bg-white">
              {rows.map((j) => {
                const n = daysUntil(j.joining_date);
                return (
                  <tr key={j.id} className="hover:bg-gray-50/60">
                    <td className={td}><PersonCell name={j.name} sub={[j.position, j.department].filter(Boolean).join(" · ") || "—"} /></td>
                    <td className={`${td} whitespace-nowrap`}>
                      <p className="text-gray-900">{j.joining_date ? formatDate(j.joining_date) : "—"}</p>
                      {n != null && <p className="text-xs text-gray-500">{inDays(n)}</p>}
                    </td>
                    <td className={td}>{j.manager ? <span className="flex items-center gap-2"><Avatar name={j.manager} size="xs" />{j.manager}</span> : "—"}</td>
                    <td className={td}><StatusPill tone={STATUS_TONE[j.status] || "blue"}><span className="capitalize">{j.status ? humanize(j.status) : "Upcoming"}</span></StatusPill></td>
                    <td className={td}><ProgressBar pct={j.pct ?? null} /></td>
                    <td className={td}><JoinerAlerts j={j} /></td>
                    <td className={`${td} text-right`}>
                      <NavLink to="/zoiko-hr/onboarding/new-hires" end aria-label={`Open ${j.name || "new hire"} in New Hires`} className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:underline">
                        Open<ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
                      </NavLink>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

function UpcomingOrientation({ rows, loading }) {
  return (
    <Card title="Upcoming orientation" action={<NavLink to="/zoiko-hr/onboarding/orientation" end className={linkClass}>View All</NavLink>}>
      {loading ? <div className="h-32 animate-pulse rounded-xl bg-gray-50" /> : !rows.length ? <EmptyState icon={CalendarDays} title="No orientation sessions scheduled" /> : (
        <ul className="space-y-3">
          {rows.map((o) => {
            const d = parseDateOnly(String(o.date || "").slice(0, 10));
            return (
              <li key={o.id} className="flex gap-3">
                <div className="grid w-12 shrink-0 place-items-center rounded-xl bg-blue-50 py-1.5 text-blue-700">
                  <span className="text-[10px] font-semibold uppercase">{d ? d.toLocaleDateString("en-GB", { month: "short" }) : "—"}</span>
                  <span className="text-lg font-bold leading-none">{d ? d.getDate() : ""}</span>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-gray-900" title={o.title}>{o.title || "—"}</p>
                  <p className="flex flex-wrap items-center gap-x-2 text-xs text-gray-500">
                    <span className="inline-flex items-center gap-1"><Clock className="h-3 w-3" aria-hidden="true" />{o.time || "—"}</span>
                    {o.presenter && <span>· {o.presenter}</span>}
                    <span>· {o.attendees ?? 0} attendee{o.attendees === 1 ? "" : "s"}</span>
                  </p>
                  {o.location && <p className="mt-0.5 inline-flex items-center gap-1 truncate text-xs text-gray-500"><MapPin className="h-3 w-3" aria-hidden="true" />{o.location}</p>}
                </div>
                {o.meeting_link && (
                  <a href={o.meeting_link} target="_blank" rel="noreferrer noopener" className="inline-flex h-8 shrink-0 items-center gap-1 self-center rounded-lg bg-blue-600 px-3 text-xs font-semibold text-white hover:bg-blue-700">
                    <Video className="h-3.5 w-3.5" />Join
                  </a>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

function RecentActivity({ rows }) {
  return (
    <Card title="Recent Activity">
      {!rows.length ? <EmptyState icon={Activity} title="No recent activity" /> : (
        <ol className="relative space-y-4 border-l border-gray-100 pl-5">
          {rows.map((a, i) => (
            <li key={a.key || i} className="relative">
              <span className="absolute -left-[27px] top-0.5 grid h-3.5 w-3.5 place-items-center rounded-full bg-blue-100 ring-4 ring-white">
                <span className="h-1.5 w-1.5 rounded-full bg-blue-600" />
              </span>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm text-gray-800 break-words">{a.text || "—"}</p>
                  {a.who && <p className="text-xs text-gray-500">{a.who}</p>}
                </div>
                <span className="shrink-0 text-xs text-gray-400" title={a.at ? formatDateTime(a.at) : undefined}>{a.at ? relativeTime(a.at) || formatDateTime(a.at) : ""}</span>
              </div>
            </li>
          ))}
        </ol>
      )}
    </Card>
  );
}

function AttentionNeeded({ data, loading }) {
  const overdue = data?.overdue;
  const payroll = data?.kpis?.payroll_to_verify?.value;
  const items = overdue ? [
    { label: "Overdue checklist items", count: overdue.checklist_items, to: "/zoiko-hr/onboarding/checklists", icon: ClipboardCheck },
    { label: "Overdue pre-boarding tasks", count: overdue.preboarding_tasks, to: "/zoiko-hr/onboarding/pre-onboarding", icon: CalendarCheck },
    ...(payroll != null ? [{ label: "Payroll forms to verify", count: payroll, to: "/zoiko-hr/onboarding/payroll-verifications", icon: WalletCards }] : []),
  ] : [];
  const open = items.filter((i) => Number(i.count) > 0);
  return (
    <Card title="Attention needed">
      {loading ? <div className="h-32 animate-pulse rounded-xl bg-gray-50" />
        : !overdue ? <EmptyState icon={AlertCircle} title="Not available">Live onboarding metrics could not be loaded.</EmptyState>
        : !open.length ? <EmptyState icon={CheckCircle2} title="Nothing overdue">No overdue checklist items or pre-boarding tasks.</EmptyState> : (
          <ul className="space-y-2">
            {open.map((i) => (
              <li key={i.label}>
                <NavLink to={i.to} end className="flex items-center gap-3 rounded-xl border border-rose-100 bg-rose-50/50 px-3 py-2.5 hover:bg-rose-50">
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-white text-rose-600 ring-1 ring-rose-100"><i.icon className="h-4 w-4" /></span>
                  <span className="min-w-0 flex-1 text-sm font-medium text-gray-800">{i.label}</span>
                  <span className="text-lg font-bold text-rose-700">{i.count}</span>
                  <ChevronRight className="h-4 w-4 text-rose-300" aria-hidden="true" />
                </NavLink>
              </li>
            ))}
          </ul>
        )}
    </Card>
  );
}

const SUBTITLE = "Overview of onboarding activities and metrics.";

export default function OnboardingDashboard() {
  const [dashboard, setDashboard] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [reloads, setReloads] = useState(0);
  const insights = useInsights("onboarding");

  useEffect(() => {
    let mounted = true;
    const fetch = async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await getOnboardingDashboard();
        if (mounted) setDashboard(data);
      } catch (err) {
        if (mounted) setError(err.message || "Failed to load dashboard");
      } finally {
        if (mounted) setLoading(false);
      }
    };
    fetch();
    return () => { mounted = false; };
  }, [reloads]);

  const refresh = () => { setReloads((n) => n + 1); insights.reload(); };
  const actions = (
    <>
      <SecondaryButton icon={RefreshCw} onClick={refresh}>Refresh</SecondaryButton>
      <NavLink to="/zoiko-hr/onboarding/new-hires?new=1" end className={primaryLinkClass}><Plus className="h-4 w-4" />Add New Hire</NavLink>
    </>
  );
  const shell = (body) => <OnboardingLayout title="Onboarding Dashboard" subtitle={SUBTITLE} actions={actions}>{body}</OnboardingLayout>;

  if (loading) {
    return shell(
      <div className="flex justify-center items-center py-20">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        <span className="ml-3 text-gray-500">Loading dashboard...</span>
      </div>
    );
  }

  if (error) {
    return shell(
      <div role="alert" className="rounded-2xl border border-rose-200 bg-rose-50 p-6 text-center">
        <p className="inline-flex items-center gap-2 text-sm text-rose-700 break-words"><AlertCircle className="h-5 w-5 shrink-0" />{error}</p>
        <div className="mt-3">
          <button type="button" onClick={() => setReloads((n) => n + 1)} className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700">Try again</button>
        </div>
      </div>
    );
  }

  const stats = dashboard;
  const live = insights.data;
  const k = live?.kpis || {};

  const monthlyTrend = stats?.monthlyJoiningTrend || [];
  const maxMonthly = Math.max(...monthlyTrend.map((m) => m.count), 1);

  const deptData = stats?.departmentWise || [];
  const maxDept = Math.max(...deptData.map((d) => d.count), 1);
  const deptTotal = deptData.reduce((sum, d) => sum + (d.count || 0), 0);

  const completion = completionParts(stats?.completionStatus);

  const legacyJoiners = Array.isArray(stats?.upcomingJoiners) ? stats.upcomingJoiners : [];
  // the list is capped; the true count comes separately
  const upcomingTotal = Number.isFinite(Number(stats?.upcomingJoinersTotal)) && stats?.upcomingJoinersTotal != null
    ? Number(stats.upcomingJoinersTotal) : legacyJoiners.length;
  // the insights rows carry checklist progress and alerts; the department comes from the dashboard list when it has the hire
  const deptOf = Object.fromEntries(legacyJoiners.map((j) => [j.id, j.department]));
  const joiners = Array.isArray(live?.upcoming_joiners)
    ? live.upcoming_joiners.map((j) => ({ ...j, department: deptOf[j.id] }))
    : legacyJoiners;

  const activity = Array.isArray(live?.recent_activity)
    ? live.recent_activity.map((a, i) => ({ key: i, text: a.description || humanize(a.action), who: a.new_hire, at: a.at }))
    : (stats?.recentActivities || []).map((a, i) => ({ key: a.id || i, text: a.description || a.message, at: a.timestamp }));

  const pct = (v) => `${Math.round(Number(v))}%`;

  return shell(
    <div className="space-y-6">
      {insights.error && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-800">
          <span className="inline-flex items-center gap-2"><AlertCircle className="h-4 w-4" />Live onboarding metrics could not be loaded: {insights.error}</span>
          <button type="button" onClick={insights.reload} className="font-medium underline">Reload metrics</button>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4 2xl:grid-cols-7">
        <KpiCard label="Active New Hires" icon={Users} tone="blue" kpi={k.active_new_hires} loading={insights.loading} />
        <KpiCard label="Joining This Month" icon={CalendarDays} tone="green" kpi={k.joining_this_month} loading={insights.loading} />
        <KpiCard label="Pre-boarding Tasks Open" icon={CalendarCheck} tone="violet" kpi={k.preboarding_open} loading={insights.loading} />
        <KpiCard label="Documents Pending" icon={FileText} tone="amber" kpi={k.documents_pending} loading={insights.loading} />
        <KpiCard label="Checklist Completion" icon={Percent} tone="teal" kpi={k.checklist_completion} loading={insights.loading} format={pct} />
        <KpiCard label="Completed This Month" icon={CheckCircle2} tone="pink" kpi={k.completed} loading={insights.loading} />
        <KpiCard label="Payroll Forms to Verify" icon={WalletCards} tone="red" kpi={k.payroll_to_verify} loading={insights.loading} />
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <Card title="Onboarding pipeline" action={<span className="text-xs text-gray-500">New hires by current stage</span>}>
          {insights.loading ? <div className="h-36 animate-pulse rounded-xl bg-gray-50" />
            : Array.isArray(live?.stages) ? <Pipeline stages={live.stages} />
            : <EmptyState icon={Users} title="Pipeline not available">Live onboarding metrics could not be loaded.</EmptyState>}
        </Card>
        <AttentionNeeded data={live} loading={insights.loading} />
      </div>

      <UpcomingJoiners rows={joiners} total={Math.max(upcomingTotal, joiners.length)} />

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <UpcomingOrientation rows={Array.isArray(live?.orientation) ? live.orientation : []} loading={insights.loading} />
        <RecentActivity rows={activity} />
        <Card title="Pending items">
          <div className="space-y-2">
            <GlanceTile title="Total New Hires" count={stats?.totalNewHires ?? 0} icon={Users} tone="blue" to="/zoiko-hr/onboarding/new-hires" />
            <GlanceTile title="Pending Onboarding" count={stats?.pendingOnboarding ?? 0} icon={Clock} tone="amber" to="/zoiko-hr/onboarding/new-hires" />
            <GlanceTile title="Completed Onboarding" count={stats?.completedOnboarding ?? 0} icon={CheckCircle2} tone="green" to="/zoiko-hr/onboarding/new-hires" />
            <GlanceTile title="Documents Pending" count={stats?.documentsPending ?? 0} icon={FileText} tone="violet" to="/zoiko-hr/onboarding/documents" />
            <GlanceTile title="Checklist Items Pending" count={stats?.checklistsPending ?? 0} icon={Package} tone="teal" to="/zoiko-hr/onboarding/checklists" />
            <GlanceTile title="Upcoming Orientation Sessions" count={stats?.orientationPending ?? 0} icon={CalendarDays} tone="pink" to="/zoiko-hr/onboarding/orientation" />
            <GlanceTile title="Upcoming Joiners" count={upcomingTotal} icon={UserPlus} tone="red" to="/zoiko-hr/onboarding/new-hires" />
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <Card title="Monthly Joining Trend" action={<BarChart3 className="h-4 w-4 text-gray-400" aria-hidden="true" />}>
          <div className="space-y-2.5">
            {monthlyTrend.length === 0 ? (
              <p className="text-xs text-gray-400 text-center py-6">No data available</p>
            ) : (
              monthlyTrend.map((m) => (
                <SimpleBar key={m.month} label={monthLabel(m.month)} labelClass="w-20" value={m.count} max={maxMonthly} color="bg-blue-500"
                  detail={`${monthLabel(m.month)}: ${m.count} joining`} />
              ))
            )}
          </div>
        </Card>

        <Card title="Department-wise" action={<Building2 className="h-4 w-4 text-gray-400" aria-hidden="true" />}>
          <div className="space-y-2.5">
            {deptData.length === 0 ? (
              <p className="text-xs text-gray-400 text-center py-6">No data available</p>
            ) : (
              deptData.map((d, i) => (
                <SimpleBar key={d.department || i} label={d.department || "Unassigned"} value={d.count} max={maxDept}
                  color={DEPARTMENT_COLORS[i % DEPARTMENT_COLORS.length]}
                  detail={`${d.department || "Unassigned"}: ${d.count} of ${deptTotal} new hire${deptTotal === 1 ? "" : "s"}`} />
              ))
            )}
          </div>
        </Card>

        <Card title="Completion Status">
          {completion.total === 0 ? (
            <p className="text-xs text-gray-400 text-center py-6">No new hires yet</p>
          ) : (
            <>
              <div className="flex items-center gap-0.5 py-2" role="img" aria-label={completion.parts.map((p) => `${p.label} ${p.percent}%`).join(", ")}>
                {completion.parts.filter((p) => p.value > 0).map((p) => (
                  <div key={p.key} title={`${p.label}: ${p.value}`} className="h-3 first:rounded-l-full last:rounded-r-full transition-all duration-500"
                    style={{ flexGrow: p.value, flexBasis: 0, minWidth: "6px", backgroundColor: p.color }} />
                ))}
              </div>
              <div className="space-y-1.5 mt-3">
                {completion.parts.map((p) => (
                  <PieSegment key={p.key} label={p.label} value={p.value} percent={p.percent} color={p.color} />
                ))}
              </div>
              {completion.cancelled > 0 ? <p className="text-xs text-gray-400 mt-3">{completion.cancelled} cancelled (not counted above)</p> : null}
            </>
          )}
        </Card>
      </div>
    </div>
  );
}
