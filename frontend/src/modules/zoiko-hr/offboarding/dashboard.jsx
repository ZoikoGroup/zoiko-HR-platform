/* Offboarding Dashboard: the numbers that need attention, upcoming last days, open exits by type and recent activity. */
import { Link } from "react-router-dom";
import { Activity, AlertTriangle, CalendarClock, ClipboardCheck, FileSignature, Package, Percent, RefreshCw, UserMinus, Users,
  WalletCards } from "lucide-react";
import { getOffboardingDashboard } from "../../../service/offboardingService";
import { Card, EmptyState, KpiCard, PersonCell, SecondaryButton, relativeTime, shortDate } from "../recruitment/ui";
import OffboardingLayout from "./OffboardingLayout";
import { CaseStatusPill, ErrorBanner, ExitTypePill, Loading, daysUntil, inDays, useLoad } from "./shared";

const linkButton = "inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 to-blue-700 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:from-blue-700 hover:to-blue-800";
const linkSecondary = "inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50";

export default function OffboardingDashboard() {
  const { data, error, loading, reload } = useLoad(() => getOffboardingDashboard(), []);
  const k = data?.kpis || {};
  const kpi = (v) => ({ value: v });
  const maxType = Math.max(1, ...(data?.open_by_type || []).map((t) => t.count));
  return (
    <OffboardingLayout title="Offboarding Dashboard" subtitle="Everyone who is leaving, and what is left to do."
      counts={{ Resignations: k.awaiting_decision || 0 }}
      actions={<>
        <Link to="/zoiko-hr/offboarding/new" className={linkButton}><UserMinus className="h-4 w-4" aria-hidden="true" />New exit</Link>
        <Link to="/zoiko-hr/offboarding/resignations" className={linkSecondary}><FileSignature className="h-4 w-4" aria-hidden="true" />Review resignations</Link>
      </>}>
      <div className="space-y-6">
        <ErrorBanner message={error} />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4 2xl:grid-cols-7">
          <KpiCard label="Open exits" icon={Users} tone="blue" kpi={kpi(k.open_exits)} loading={loading && !data} />
          <KpiCard label="Leaving this month" icon={CalendarClock} tone="violet" kpi={kpi(k.leaving_this_month)} loading={loading && !data} />
          <KpiCard label="Awaiting decision" icon={FileSignature} tone="amber" kpi={kpi(k.awaiting_decision)} loading={loading && !data} />
          <KpiCard label="Overdue clearance tasks" icon={AlertTriangle} tone="red" kpi={kpi(k.overdue_tasks)} loading={loading && !data} />
          <KpiCard label="Assets not returned" icon={Package} tone="pink" kpi={kpi(k.assets_pending)} loading={loading && !data} />
          <KpiCard label="Settlements pending" icon={WalletCards} tone="teal" kpi={kpi(k.settlements_pending)} loading={loading && !data} />
          <KpiCard label="Attrition (last 12 months)" icon={Percent} tone="gray" kpi={kpi(k.attrition_rate)} format={(v) => `${v}%`}
            loading={loading && !data} />
        </div>

        <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
          <Card title="Upcoming last working days" className="xl:col-span-2"
            action={<SecondaryButton icon={RefreshCw} onClick={reload} aria-label="Refresh dashboard">Refresh</SecondaryButton>} bodyClass="p-0 pt-3">
            {loading && !data ? <Loading /> : (data?.upcoming || []).length === 0 ? (
              <EmptyState icon={CalendarClock} title="No one is leaving soon">Approved exits appear here until their last day.</EmptyState>
            ) : (
              <ul className="divide-y divide-gray-100">
                {data.upcoming.map((c) => {
                  const n = daysUntil(c.last_working_day);
                  return (
                    <li key={c.id}>
                      <Link to={`/zoiko-hr/offboarding/cases/${c.id}`} className="flex flex-wrap items-center gap-4 px-5 py-3 hover:bg-slate-50">
                        <div className="min-w-[200px] flex-1">
                          <PersonCell name={c.employee?.name} sub={[c.employee?.job_title, c.employee?.department].filter(Boolean).join(" · ")} />
                        </div>
                        <ExitTypePill type={c.exit_type} label={c.exit_type_label} />
                        <CaseStatusPill status={c.display_status} />
                        <div className="w-36 text-right text-sm">
                          <p className="font-medium text-gray-900">{shortDate(c.last_working_day)}</p>
                          <p className="text-xs text-gray-500">{inDays(n)}</p>
                        </div>
                        <div className="w-24 text-right text-xs text-gray-500">
                          {c.progress?.tasks_done}/{c.progress?.tasks_total} tasks
                        </div>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>

          <div className="space-y-6">
            <Card title="Open exits by type">
              {(data?.open_by_type || []).length === 0 ? <p className="text-sm text-gray-500">No open exits.</p> : (
                <ul className="space-y-3">
                  {data.open_by_type.map((t) => (
                    <li key={t.exit_type}>
                      <div className="flex justify-between text-sm"><span className="text-gray-700">{t.label}</span><span className="font-semibold">{t.count}</span></div>
                      <div className="mt-1 h-2 overflow-hidden rounded-full bg-gray-100">
                        <div className="h-full rounded-full bg-blue-500" style={{ width: `${(t.count * 100) / maxType}%` }} />
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
            <Card title="Quick actions">
              <div className="grid gap-2">
                <Link to="/zoiko-hr/offboarding/new" className={linkSecondary}><UserMinus className="h-4 w-4" aria-hidden="true" />Start an exit</Link>
                <Link to="/zoiko-hr/offboarding/resignations" className={linkSecondary}><FileSignature className="h-4 w-4" aria-hidden="true" />Resignations to decide ({k.awaiting_decision || 0})</Link>
                <Link to="/zoiko-hr/offboarding/clearance" className={linkSecondary}><ClipboardCheck className="h-4 w-4" aria-hidden="true" />Clearance board ({k.overdue_tasks || 0} overdue)</Link>
                <Link to="/zoiko-hr/offboarding/assets" className={linkSecondary}><Package className="h-4 w-4" aria-hidden="true" />Asset recovery</Link>
              </div>
            </Card>
          </div>
        </div>

        <Card title="Recent activity" bodyClass="p-0 pt-3">
          {(data?.recent_activity || []).length === 0 ? (
            <EmptyState icon={Activity} title="Nothing yet">Resignations, decisions and clearance updates appear here.</EmptyState>
          ) : (
            <ul className="divide-y divide-gray-100">
              {data.recent_activity.map((a, i) => (
                <li key={`${a.case_id}-${i}`} className="flex flex-wrap items-center gap-3 px-5 py-3 text-sm">
                  <Link to={`/zoiko-hr/offboarding/cases/${a.case_id}`} className="font-mono text-xs font-semibold text-blue-700 hover:underline">{a.case_number}</Link>
                  <span className="flex-1 text-gray-700">{a.message}</span>
                  <span className="text-xs text-gray-400">{relativeTime(a.created_at)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </OffboardingLayout>
  );
}
