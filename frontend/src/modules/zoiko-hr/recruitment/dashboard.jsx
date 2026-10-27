import { useNavigate } from "react-router-dom";
import {
  AlertCircle, Briefcase, Calendar, CheckCircle2, ChevronRight, Clock, FileText, Filter, Globe, Plus, RefreshCw,
  UserPlus, Users, Video, ArrowUpRight, TrendingUp, Sparkles
} from "lucide-react";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import {
  Avatar, Card, EmptyState, KpiCard, KpiGrid, PersonCell, PrimaryButton, RecruitmentLayout, SecondaryButton, TONES,
  relativeTime, shortDate, useInsights
} from "./ui";

const STAGE_LOOK = {
  sourced: { icon: Users, tone: "blue", bar: "bg-blue-500", tile: "bg-blue-50 text-blue-600", accent: "#3B82F6" },
  applied: { icon: FileText, tone: "blue", bar: "bg-sky-500", tile: "bg-sky-50 text-sky-600", accent: "#0284C7" },
  screening: { icon: Filter, tone: "violet", bar: "bg-violet-500", tile: "bg-violet-50 text-violet-600", accent: "#8B5CF6" },
  interview: { icon: Calendar, tone: "pink", bar: "bg-pink-500", tile: "bg-pink-50 text-pink-600", accent: "#EC4899" },
  offer: { icon: FileText, tone: "amber", bar: "bg-amber-500", tile: "bg-amber-50 text-amber-600", accent: "#F59E0B" },
  hired: { icon: CheckCircle2, tone: "green", bar: "bg-emerald-500", tile: "bg-emerald-50 text-emerald-600", accent: "#10B981" },
};

const ACTIVITY_LOOK = {
  offer_accepted: { icon: CheckCircle2, tile: "bg-emerald-50 text-emerald-600 border border-emerald-200" },
  candidate_added: { icon: UserPlus, tile: "bg-blue-50 text-blue-600 border border-blue-200" },
  interview_scheduled: { icon: Calendar, tile: "bg-violet-50 text-violet-600 border border-violet-200" },
  requisition_created: { icon: Briefcase, tile: "bg-amber-50 text-amber-600 border border-amber-200" },
  moved_to_offer: { icon: CheckCircle2, tile: "bg-teal-50 text-teal-600 border border-teal-200" },
};

const SOURCE_TONES = ["bg-blue-500", "bg-indigo-500", "bg-emerald-500", "bg-sky-500", "bg-violet-500", "bg-slate-500"];

function Pipeline({ stages }) {
  const total = stages[0]?.count || 0;
  if (!total) return <EmptyState icon={Users} title="No candidates yet">Candidates you add or who apply appear here by stage.</EmptyState>;
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 2xl:grid-cols-6">
      {stages.map((s, i) => {
        const look = STAGE_LOOK[s.key] || STAGE_LOOK.sourced;
        const Icon = look.icon;
        const stepNum = String(i + 1).padStart(2, "0");
        return (
          <div key={s.key} className="relative flex min-w-0 items-center gap-1.5">
            <div className="group relative flex-1 overflow-hidden rounded-2xl bg-slate-50/80 border border-slate-100 p-3.5 hover:bg-slate-50 hover:border-slate-200 transition-all duration-200">
              <div className="absolute inset-x-0 top-0 h-1 rounded-t-2xl transition-all group-hover:h-1.5" style={{ background: look.accent }} />
              <div className="flex items-center justify-between mb-2 mt-0.5">
                <span className={`grid h-8 w-8 place-items-center rounded-xl font-bold text-xs ${look.tile}`}>
                  <Icon className="h-4 w-4" />
                </span>
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{stepNum}</span>
              </div>
              <p className="text-xs font-semibold text-slate-600 truncate" title={s.label}>{s.label}</p>
              <div className="mt-1 flex items-baseline justify-between">
                <p className="font-['Sora',system-ui,sans-serif] text-2xl font-bold tracking-tight text-slate-900 leading-none">
                  {s.count}
                </p>
                <span className="text-[11px] font-bold text-slate-500 bg-white px-1.5 py-0.5 rounded-md border border-slate-100">
                  {s.pct}%
                </span>
              </div>
              <div className="mt-3 h-1.5 w-full rounded-full bg-white overflow-hidden border border-slate-100">
                <div className={`h-full rounded-full ${look.bar} transition-all duration-500`} style={{ width: `${Math.max(s.pct, 3)}%` }} />
              </div>
            </div>
            {i < stages.length - 1 && (
              <ChevronRight className="hidden h-4 w-4 shrink-0 text-slate-300 2xl:block" aria-hidden="true" />
            )}
          </div>
        );
      })}
    </div>
  );
}

function RequisitionHealth({ rows }) {
  if (!rows.length) return <EmptyState icon={Briefcase} title="No requisitions yet" />;
  const data = rows.map((r) => ({ name: r.department, Open: r.open, "In Progress": r.in_progress, Filled: r.filled }));
  return (
    <div className="h-64">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, left: -20, bottom: 0 }} barGap={3}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(10,17,40,0.06)" />
          <XAxis dataKey="name" tick={{ fontSize: 11, fill: "#64748B" }} axisLine={false} tickLine={false} interval={0} />
          <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "#94A3B8" }} axisLine={false} tickLine={false} />
          <Tooltip
            cursor={{ fill: "rgba(59,130,246,0.04)" }}
            contentStyle={{ borderRadius: 12, border: "1px solid #E2E8F0", fontSize: 12, boxShadow: "0 10px 25px -5px rgba(0,0,0,0.1)" }}
          />
          <Legend verticalAlign="top" align="right" iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11, paddingBottom: 12 }} />
          <Bar dataKey="Open" fill="#3B82F6" radius={[4, 4, 0, 0]} />
          <Bar dataKey="In Progress" fill="#93C5FD" radius={[4, 4, 0, 0]} />
          <Bar dataKey="Filled" fill="#10B981" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function timeLabel(iv) {
  const today = new Date().toISOString().slice(0, 10);
  const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  const day = String(iv.date || "").slice(0, 10);
  const name = day === today ? "Today" : day === tomorrow ? "Tomorrow" : shortDate(iv.date);
  return { day: name, time: iv.start_time || "" };
}

function UpcomingInterviews({ rows, onViewAll }) {
  return (
    <Card
      title="Upcoming Interviews"
      action={<button type="button" onClick={onViewAll} className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600 hover:text-blue-700 cursor-pointer">View All <ChevronRight className="w-3.5 h-3.5" /></button>}
      bodyClass="p-0"
    >
      {!rows.length ? <div className="p-6"><EmptyState icon={Calendar} title="No interviews scheduled" /></div> : (
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50/70 border-b border-slate-100 text-left text-[11px] font-bold uppercase tracking-wider text-slate-500">
              <tr>
                <th className="px-5 py-3">Candidate</th>
                <th className="px-3 py-3">Role</th>
                <th className="px-3 py-3">Interviewer</th>
                <th className="px-3 py-3">Date &amp; Time</th>
                <th className="px-5 py-3">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((iv) => {
                const t = timeLabel(iv);
                const isToday = t.day === "Today";
                return (
                  <tr key={iv.id} className="hover:bg-blue-50/30 transition-colors">
                    <td className="px-5 py-3"><PersonCell name={iv.candidate_name} /></td>
                    <td className="px-3 py-3 font-medium text-slate-700">{iv.position || "—"}</td>
                    <td className="px-3 py-3">
                      {iv.interviewer ? (
                        <span className="flex items-center gap-2 text-slate-700 text-xs font-medium">
                          <Avatar name={iv.interviewer} size="xs" />{iv.interviewer}
                        </span>
                      ) : "—"}
                    </td>
                    <td className="px-3 py-3 whitespace-nowrap">
                      <span className={`inline-block px-2 py-0.5 rounded-md text-xs font-semibold ${isToday ? "bg-amber-50 text-amber-700 border border-amber-200" : "text-slate-800"}`}>
                        {t.day}
                      </span>
                      <p className="text-xs text-slate-500 mt-0.5">{t.time}</p>
                    </td>
                    <td className="px-5 py-3 whitespace-nowrap">
                      {iv.meeting_link ? (
                        <a
                          href={iv.meeting_link}
                          target="_blank"
                          rel="noreferrer noopener"
                          className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white shadow-xs hover:bg-blue-700 transition-colors"
                        >
                          <Video className="h-3.5 w-3.5" />Join Call
                        </a>
                      ) : (
                        <span className="text-xs text-slate-400">In person</span>
                      )}
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

function RecentActivity({ rows }) {
  return (
    <Card title="Recent Activity" bodyClass="p-5">
      {!rows.length ? <EmptyState icon={Clock} title="No recent activity" /> : (
        <ul className="space-y-4">
          {rows.map((a, i) => {
            const look = ACTIVITY_LOOK[a.type] || ACTIVITY_LOOK.candidate_added;
            const Icon = look.icon;
            return (
              <li key={`${a.type}-${i}`} className="flex items-start gap-3">
                <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-xl shadow-xs mt-0.5 ${look.tile}`}>
                  <Icon className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-slate-900 leading-snug">{a.title}</p>
                  <p className="truncate text-xs text-slate-500 mt-0.5">{a.detail}</p>
                </div>
                <span className="shrink-0 text-[11px] font-medium text-slate-400 whitespace-nowrap">{relativeTime(a.at)}</span>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

function TopSources({ rows }) {
  return (
    <Card title="Top Candidate Sources" bodyClass="p-5">
      {!rows.length ? <EmptyState icon={Globe} title="No candidates yet" /> : (
        <ul className="space-y-3.5">
          {rows.map((s, i) => (
            <li key={s.source} className="flex items-center gap-3">
              <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-lg text-[11px] font-bold text-white shadow-xs ${SOURCE_TONES[i % SOURCE_TONES.length]}`} aria-hidden="true">
                {s.source.slice(0, 2).toUpperCase()}
              </span>
              <span className="min-w-0 flex-1 truncate text-xs font-semibold text-slate-800">{s.source}</span>
              <span className="text-xs font-bold text-slate-900">{s.count}</span>
              <span className="w-10 text-right text-xs font-medium text-slate-500">{s.pct}%</span>
              <span className="hidden h-2 w-20 rounded-full bg-slate-100 sm:block overflow-hidden">
                <span className={`block h-full rounded-full ${SOURCE_TONES[i % SOURCE_TONES.length]}`} style={{ width: `${s.pct}%` }} />
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

export default function RecruitmentDashboard() {
  const navigate = useNavigate();
  const { data, loading, error, reload } = useInsights("dashboard");
  const k = data?.kpis || {};

  return (
    <RecruitmentLayout
      title="Recruitment Dashboard"
      subtitle="Hiring pipeline, open requisitions, and recruitment telemetry"
      actions={<>
        <SecondaryButton icon={RefreshCw} onClick={reload} aria-label="Refresh">Refresh</SecondaryButton>
        <PrimaryButton icon={Plus} onClick={() => navigate("/zoiko-hr/recruitment/job-requisitions")}>New Requisition</PrimaryButton>
      </>}
    >
      {error ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-6 text-center">
          <p className="inline-flex items-center gap-2 text-sm text-rose-700"><AlertCircle className="h-5 w-5" />{error}</p>
          <div className="mt-3"><PrimaryButton onClick={reload}>Try Again</PrimaryButton></div>
        </div>
      ) : (
        <div className="space-y-6">
          <KpiGrid cols={6}>
            <KpiCard label="Open Requisitions" icon={Briefcase} tone="blue" kpi={k.open_requisitions} loading={loading} />
            <KpiCard label="Active Candidates" icon={Users} tone="green" kpi={k.active_candidates} loading={loading} />
            <KpiCard label="Interviews This Week" icon={Calendar} tone="violet" kpi={k.interviews_this_week} loading={loading} />
            <KpiCard label="Offers In Progress" icon={FileText} tone="amber" kpi={k.offers_in_progress} loading={loading} />
            <KpiCard label="Time to Hire" icon={Clock} tone="pink" kpi={k.time_to_hire} loading={loading} format={(v) => `${v} days`} />
            <KpiCard label="Offer Acceptance Rate" icon={CheckCircle2} tone="teal" kpi={k.offer_acceptance_rate} loading={loading} format={(v) => `${Math.round(v)}%`} />
          </KpiGrid>

          <Card
            title="Hiring Pipeline"
            action={<span className="text-xs font-medium text-slate-500">Live candidate stages</span>}
          >
            {loading ? <div className="h-40 animate-pulse rounded-xl bg-slate-100" /> : <Pipeline stages={data?.pipeline || []} />}
          </Card>

          <Card
            title="Requisition Health"
            action={<button type="button" onClick={() => navigate("/zoiko-hr/recruitment/job-requisitions")} className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600 hover:text-blue-700 cursor-pointer">View All <ChevronRight className="w-3.5 h-3.5" /></button>}
          >
            {loading ? <div className="h-64 animate-pulse rounded-xl bg-slate-100" /> : <RequisitionHealth rows={data?.requisition_health || []} />}
          </Card>

          <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
            <UpcomingInterviews rows={data?.upcoming_interviews || []} onViewAll={() => navigate("/zoiko-hr/recruitment/interviews")} />
            <RecentActivity rows={data?.recent_activity || []} />
            <TopSources rows={data?.top_sources || []} />
          </div>
        </div>
      )}
    </RecruitmentLayout>
  );
}
