import { useNavigate } from "react-router-dom";
import { AlertCircle, Briefcase, Calendar, CheckCircle2, ChevronRight, Clock, FileText, Filter, Globe, Plus, RefreshCw,
  UserPlus, Users, Video } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Avatar, Card, EmptyState, KpiCard, KpiGrid, PersonCell, PrimaryButton, RecruitmentLayout, SecondaryButton, TONES,
  relativeTime, shortDate, useInsights } from "./ui";

const STAGE_LOOK = {
  sourced: { icon: Users, tone: "blue", bar: "bg-blue-400", tile: "bg-blue-50" },
  applied: { icon: FileText, tone: "blue", bar: "bg-sky-400", tile: "bg-sky-50" },
  screening: { icon: Filter, tone: "violet", bar: "bg-violet-400", tile: "bg-violet-50" },
  interview: { icon: Calendar, tone: "pink", bar: "bg-pink-400", tile: "bg-pink-50" },
  offer: { icon: FileText, tone: "amber", bar: "bg-amber-400", tile: "bg-amber-50" },
  hired: { icon: CheckCircle2, tone: "green", bar: "bg-emerald-400", tile: "bg-emerald-50" },
};

const ACTIVITY_LOOK = {
  offer_accepted: { icon: CheckCircle2, tile: "bg-emerald-50 text-emerald-600" },
  candidate_added: { icon: UserPlus, tile: "bg-blue-50 text-blue-600" },
  interview_scheduled: { icon: Calendar, tile: "bg-violet-50 text-violet-600" },
  requisition_created: { icon: Briefcase, tile: "bg-amber-50 text-amber-600" },
  moved_to_offer: { icon: CheckCircle2, tile: "bg-teal-50 text-teal-600" },
};

const SOURCE_TONES = ["bg-blue-500", "bg-indigo-500", "bg-emerald-500", "bg-sky-500", "bg-violet-500", "bg-gray-400"];

function Pipeline({ stages }) {
  const total = stages[0]?.count || 0;
  if (!total) return <EmptyState icon={Users} title="No candidates yet">Candidates you add or who apply appear here by stage.</EmptyState>;
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 2xl:grid-cols-6">
      {stages.map((s, i) => {
        const look = STAGE_LOOK[s.key] || STAGE_LOOK.sourced;
        const Icon = look.icon;
        return (
          <div key={s.key} className="flex min-w-0 items-center gap-1">
            <div className="flex-1">
              <div className={`rounded-2xl p-3 ${look.tile}`}>
                <Icon className={`h-5 w-5 ${TONES[look.tone].tile.split(" ")[1]}`} />
                <p className="mt-2 text-xs font-medium text-gray-600">{s.label}</p>
                <p className="text-2xl font-bold text-gray-900">{s.count}</p>
              </div>
              <p className="mt-2 text-xs font-medium text-gray-600">{s.pct}%</p>
              <div className="mt-1 h-1.5 rounded-full bg-gray-100"><div className={`h-1.5 rounded-full ${look.bar}`} style={{ width: `${s.pct}%` }} /></div>
            </div>
            {i < stages.length - 1 && <ChevronRight className="hidden h-4 w-4 shrink-0 text-gray-300 2xl:block" aria-hidden="true" />}
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
        <BarChart data={data} margin={{ top: 4, right: 4, left: -20, bottom: 0 }} barGap={2}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
          <XAxis dataKey="name" tick={{ fontSize: 11, fill: "#6b7280" }} axisLine={false} tickLine={false} interval={0} />
          <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "#9ca3af" }} axisLine={false} tickLine={false} />
          <Tooltip cursor={{ fill: "#f8fafc" }} contentStyle={{ borderRadius: 12, border: "1px solid #e5e7eb", fontSize: 12 }} />
          <Legend verticalAlign="top" align="right" iconType="square" iconSize={10} wrapperStyle={{ fontSize: 12, paddingBottom: 8 }} />
          <Bar dataKey="Open" fill="#3b82f6" radius={[3, 3, 0, 0]} />
          <Bar dataKey="In Progress" fill="#93c5fd" radius={[3, 3, 0, 0]} />
          <Bar dataKey="Filled" fill="#22c55e" radius={[3, 3, 0, 0]} />
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
    <Card title="Upcoming Interviews" action={<button type="button" onClick={onViewAll} className="text-sm font-medium text-blue-600 hover:underline">View All</button>} bodyClass="pt-3">
      {!rows.length ? <EmptyState icon={Calendar} title="No interviews scheduled" /> : (
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead><tr className="text-left text-xs uppercase tracking-wide text-gray-500">
              <th className="px-5 py-2 font-semibold">Candidate</th><th className="px-3 py-2 font-semibold">Role</th>
              <th className="px-3 py-2 font-semibold">Interviewer</th><th className="px-3 py-2 font-semibold">Date &amp; Time</th>
              <th className="px-5 py-2 font-semibold">Action</th></tr></thead>
            <tbody className="divide-y divide-gray-100">
              {rows.map((iv) => {
                const t = timeLabel(iv);
                return (
                  <tr key={iv.id}>
                    <td className="px-5 py-2.5"><PersonCell name={iv.candidate_name} /></td>
                    <td className="px-3 py-2.5 text-gray-700">{iv.position || "—"}</td>
                    <td className="px-3 py-2.5">{iv.interviewer ? <span className="flex items-center gap-2"><Avatar name={iv.interviewer} size="xs" />{iv.interviewer}</span> : "—"}</td>
                    <td className="px-3 py-2.5 whitespace-nowrap"><p className="text-gray-900">{t.day}</p><p className="text-xs text-gray-500">{t.time}</p></td>
                    <td className="px-5 py-2.5">
                      {iv.meeting_link
                        ? <a href={iv.meeting_link} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-1 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700"><Video className="h-3.5 w-3.5" />Join</a>
                        : <span className="text-xs text-gray-400">No link</span>}
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
    <Card title="Recent Activity">
      {!rows.length ? <EmptyState icon={Clock} title="No recent activity" /> : (
        <ul className="space-y-3">
          {rows.map((a, i) => {
            const look = ACTIVITY_LOOK[a.type] || ACTIVITY_LOOK.candidate_added;
            const Icon = look.icon;
            return (
              <li key={`${a.type}-${i}`} className="flex gap-3">
                <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-full ${look.tile}`}><Icon className="h-4 w-4" /></span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-gray-900">{a.title}</p>
                  <p className="truncate text-xs text-gray-500">{a.detail}</p>
                </div>
                <span className="shrink-0 text-xs text-gray-400">{relativeTime(a.at)}</span>
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
    <Card title="Top Sources">
      {!rows.length ? <EmptyState icon={Globe} title="No candidates yet" /> : (
        <ul className="space-y-3">
          {rows.map((s, i) => (
            <li key={s.source} className="flex items-center gap-3">
              <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-lg text-[11px] font-bold text-white ${SOURCE_TONES[i % SOURCE_TONES.length]}`} aria-hidden="true">
                {s.source.slice(0, 2).toUpperCase()}
              </span>
              <span className="min-w-0 flex-1 truncate text-sm text-gray-800">{s.source}</span>
              <span className="w-8 text-right text-sm font-semibold text-gray-900">{s.count}</span>
              <span className="w-10 text-right text-xs text-gray-500">{s.pct}%</span>
              <span className="hidden h-1.5 w-20 rounded-full bg-gray-100 sm:block"><span className={`block h-1.5 rounded-full ${SOURCE_TONES[i % SOURCE_TONES.length]}`} style={{ width: `${s.pct}%` }} /></span>
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
    <RecruitmentLayout title="Recruitment Dashboard" subtitle="Hiring pipeline and recruitment metrics"
      actions={<>
        <SecondaryButton icon={RefreshCw} onClick={reload} aria-label="Refresh">Refresh</SecondaryButton>
        <PrimaryButton icon={Plus} onClick={() => navigate("/zoiko-hr/recruitment/job-requisitions")}>New Requisition</PrimaryButton>
      </>}>
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

          <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
            <Card title="Hiring Pipeline" action={<span className="text-xs text-gray-500">Candidates by current stage</span>}>
              {loading ? <div className="h-40 animate-pulse rounded-xl bg-gray-50" /> : <Pipeline stages={data?.pipeline || []} />}
            </Card>
            <Card title="Requisition Health" action={<button type="button" onClick={() => navigate("/zoiko-hr/recruitment/job-requisitions")} className="text-sm font-medium text-blue-600 hover:underline">View All</button>}>
              {loading ? <div className="h-64 animate-pulse rounded-xl bg-gray-50" /> : <RequisitionHealth rows={data?.requisition_health || []} />}
            </Card>
          </div>

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
