import { useState, useEffect, useMemo } from "react";
import { NavLink } from "react-router-dom";
import HRPage from "../../../components/HRPage";
import {
  getOnboardingDashboard,
  getOnboardingRecords,
  deleteOnboardingRecord,
  updateOnboardingRecord,
  getOnboardingTasks,
  createOnboardingTask,
  updateOnboardingTask,
  deleteOnboardingTask,
} from "../../../service/hrService";
import {
  Users,
  UserPlus,
  CheckCircle2,
  Clock,
  FileText,
  Package,
  Calendar,
  TrendingUp,
  Building2,
  BarChart3,
  Activity,
  ChevronRight,
  Circle,
} from "lucide-react";
import { formatDate, formatDateTime } from "../../../utils/dateTime";
import { monthLabel, barPercent, completionParts } from "../../../utils/onboardingDashboard";

const NAV_ITEMS = [
  { label: "Dashboard", href: "/zoiko-hr/onboarding" },
  { label: "New Hires", href: "/zoiko-hr/onboarding/new-hires" },
  { label: "Pre-Onboarding", href: "/zoiko-hr/onboarding/pre-onboarding" },
  { label: "Documents", href: "/zoiko-hr/onboarding/documents" },
  { label: "Checklists", href: "/zoiko-hr/onboarding/checklists" },
  { label: "Orientation", href: "/zoiko-hr/onboarding/orientation" },
  { label: "Reports", href: "/zoiko-hr/onboarding/reports" },
  { label: "Settings", href: "/zoiko-hr/onboarding/settings" },
];

const DEPARTMENT_COLORS = [
  "bg-blue-500", "bg-emerald-500", "bg-amber-500", "bg-[#0A1128]",
  "bg-rose-500", "bg-cyan-500", "bg-amber-600", "bg-teal-500",
];

function SubNav() {
  return (
    <div className="flex gap-1 overflow-x-auto pb-1 mb-6 border-b border-gray-100">
      {NAV_ITEMS.map((item) => (
        <NavLink
          key={item.href}
          to={item.href}
          end={item.href === "/zoiko-hr/onboarding"}
          className={({ isActive }) =>
            `whitespace-nowrap px-3 py-2 text-sm font-medium rounded-t-lg transition-colors ${
              isActive
                ? "text-blue-600 border-b-2 border-blue-600 bg-blue-50/50"
                : "text-gray-500 hover:text-gray-700 hover:bg-gray-50"
            }`
          }
        >
          {item.label}
        </NavLink>
      ))}
    </div>
  );
}

function StatCard({ title, value, icon: Icon, color }) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 flex items-center justify-between">
      <div>
        <p className="text-xs text-gray-400 font-medium uppercase tracking-wider">{title}</p>
        <p className="text-2xl font-bold text-gray-800 mt-1">{value}</p>
      </div>
      <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${color || "bg-blue-50"}`}>
        <Icon size={20} className={color ? "text-white" : "text-blue-600"} />
      </div>
    </div>
  );
}

function PendingCard({ title, count, icon: Icon, color }) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-3 flex items-center gap-3">
      <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${color || "bg-amber-50"}`}>
        <Icon size={18} className={color ? "text-white" : "text-amber-600"} />
      </div>
      <div>
        <p className="text-xs text-gray-400">{title}</p>
        <p className="text-lg font-bold text-gray-800">{count}</p>
      </div>
    </div>
  );
}

// label | bar | value. The label column is wide enough for a department name and never runs into the bar:
// a longer name is cut with "..." and the full name shows on hover.
function SimpleBar({ label, value, max, color, labelClass = "w-24 sm:w-28", detail }) {
  const pct = barPercent(value, max);
  return (
    <div className="flex items-center gap-3" title={detail || `${label}: ${value}`}>
      <span className={`text-xs text-gray-600 shrink-0 truncate ${labelClass}`}>{label}</span>
      <div className="flex-1 min-w-0 h-5 bg-gray-100 rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all duration-500 ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs font-medium text-gray-600 w-8 shrink-0 text-right">{value}</span>
    </div>
  );
}

function PieSegment({ label, value, percent, color }) {
  return (
    <div className="flex items-center gap-2">
      <Circle size={10} fill={color} stroke={color} />
      <span className="text-xs text-gray-500 flex-1">{label}</span>
      <span className="text-xs font-medium text-gray-700">{percent}% ({value})</span>
    </div>
  );
}

export default function OnboardingDashboard() {
  const [dashboard, setDashboard] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [reloads, setReloads] = useState(0);

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

  const stats = useMemo(() => {
    if (!dashboard) return null;
    return dashboard;
  }, [dashboard]);

  const monthlyTrend = stats?.monthlyJoiningTrend || [];
  const maxMonthly = Math.max(...monthlyTrend.map((m) => m.count), 1);

  const deptData = stats?.departmentWise || [];
  const maxDept = Math.max(...deptData.map((d) => d.count), 1);
  const deptTotal = deptData.reduce((sum, d) => sum + (d.count || 0), 0);

  const completion = completionParts(stats?.completionStatus);

  const upcomingJoiners = stats?.upcomingJoiners || [];
  const recentActivities = stats?.recentActivities || [];

  if (loading) {
    return (
      <HRPage title="Onboarding Dashboard" subtitle="Overview of onboarding activities and metrics.">
        <SubNav />
        <div className="flex justify-center items-center py-20">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          <span className="ml-3 text-gray-500">Loading dashboard...</span>
        </div>
      </HRPage>
    );
  }

  if (error) {
    return (
      <HRPage title="Onboarding Dashboard" subtitle="Overview of onboarding activities and metrics.">
        <SubNav />
        <div role="alert" className="mb-4 px-4 py-3 bg-red-50 border border-red-200 text-red-700 rounded-lg flex items-center justify-between gap-3">
          <span>{error}</span>
          <button onClick={() => setReloads((n) => n + 1)} className="px-3 py-1.5 text-sm bg-white border border-red-200 rounded-lg hover:bg-red-100">Try again</button>
        </div>
      </HRPage>
    );
  }

  return (
    <HRPage title="Onboarding Dashboard" subtitle="Overview of onboarding activities and metrics.">
      <SubNav />

      <div className="space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <StatCard
            title="Total New Hires"
            value={stats?.totalNewHires ?? 0}
            icon={Users}
            color="bg-blue-500"
          />
          <StatCard
            title="Pending Onboarding"
            value={stats?.pendingOnboarding ?? 0}
            icon={Clock}
            color="bg-amber-500"
          />
          <StatCard
            title="Completed Onboarding"
            value={stats?.completedOnboarding ?? 0}
            icon={CheckCircle2}
            color="bg-green-500"
          />
        </div>

        <div>
          <h3 className="text-sm font-semibold text-gray-700 mb-3">Pending Items</h3>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <PendingCard title="Documents Pending" count={stats?.documentsPending ?? 0} icon={FileText} color="bg-blue-500" />
            <PendingCard title="Checklist Items Pending" count={stats?.checklistsPending ?? 0} icon={Package} color="bg-[#0A1128]" />
            <PendingCard title="Orientation Pending" count={stats?.orientationPending ?? 0} icon={Calendar} color="bg-amber-500" />
            <PendingCard title="Upcoming Joiners" count={upcomingJoiners.length} icon={UserPlus} color="bg-rose-500" />
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 lg:col-span-2">
            <h3 className="text-sm font-semibold text-gray-700 mb-4 flex items-center gap-2">
              <TrendingUp size={16} className="text-blue-600" />
              Monthly Joining Trend
            </h3>
            <div className="space-y-2">
              {monthlyTrend.length === 0 ? (
                <p className="text-xs text-gray-400 text-center py-6">No data available</p>
              ) : (
                monthlyTrend.map((m) => (
                  <SimpleBar
                    key={m.month}
                    label={monthLabel(m.month)}
                    labelClass="w-20"
                    value={m.count}
                    max={maxMonthly}
                    color="bg-blue-500"
                    detail={`${monthLabel(m.month)}: ${m.count} joining`}
                  />
                ))
              )}
            </div>
          </div>

          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
            <h3 className="text-sm font-semibold text-gray-700 mb-4 flex items-center gap-2">
              <Building2 size={16} className="text-blue-600" />
              Department-wise
            </h3>
            <div className="space-y-2">
              {deptData.length === 0 ? (
                <p className="text-xs text-gray-400 text-center py-6">No data available</p>
              ) : (
                deptData.map((d, i) => (
                  <SimpleBar
                    key={d.department || i}
                    label={d.department || "Unassigned"}
                    value={d.count}
                    max={maxDept}
                    color={DEPARTMENT_COLORS[i % DEPARTMENT_COLORS.length]}
                    detail={`${d.department || "Unassigned"}: ${d.count} of ${deptTotal} new hire${deptTotal === 1 ? "" : "s"}`}
                  />
                ))
              )}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
            <h3 className="text-sm font-semibold text-gray-700 mb-4 flex items-center gap-2">
              <BarChart3 size={16} className="text-blue-600" />
              Completion Status
            </h3>
            {completion.total === 0 ? (
              <p className="text-xs text-gray-400 text-center py-6">No new hires yet</p>
            ) : (
              <>
                <div className="flex items-center gap-0.5 py-4" role="img" aria-label={completion.parts.map((p) => `${p.label} ${p.percent}%`).join(", ")}>
                  {completion.parts.filter((p) => p.value > 0).map((p) => (
                    <div key={p.key} title={`${p.label}: ${p.value}`} className="h-12 first:rounded-l-full last:rounded-r-full transition-all duration-500"
                      style={{ flexGrow: p.value, flexBasis: 0, minWidth: "6px", backgroundColor: p.color }} />
                  ))}
                </div>
                <div className="space-y-1.5 mt-2">
                  {completion.parts.map((p) => (
                    <PieSegment key={p.key} label={p.label} value={p.value} percent={p.percent} color={p.color} />
                  ))}
                </div>
                {completion.cancelled > 0 ? <p className="text-xs text-gray-400 mt-3">{completion.cancelled} cancelled (not counted above)</p> : null}
              </>
            )}
          </div>

          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 lg:col-span-2">
            <h3 className="text-sm font-semibold text-gray-700 mb-4 flex items-center gap-2">
              <Activity size={16} className="text-blue-600" />
              Recent Activity
            </h3>
            {recentActivities.length === 0 ? (
              <p className="text-xs text-gray-400 text-center py-6">No recent activity</p>
            ) : (
              <div className="space-y-0 divide-y divide-gray-50">
                {recentActivities.map((act, i) => (
                  <div key={act.id || i} className="flex items-start gap-3 py-2.5">
                    <div className="w-6 h-6 rounded-full bg-blue-50 flex items-center justify-center shrink-0 mt-0.5">
                      <Activity size={12} className="text-blue-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-gray-700">{act.description || act.message}</p>
                      <p className="text-xs text-gray-400 mt-0.5">{act.timestamp ? formatDateTime(act.timestamp) : ""}</p>
                    </div>
                    <ChevronRight size={14} className="text-gray-300 shrink-0 mt-1" />
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-100 shadow-sm">
          <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
              <UserPlus size={16} className="text-blue-600" />
              Upcoming Joiners
            </h3>
            <span className="text-xs text-gray-400">{upcomingJoiners.length} upcoming</span>
          </div>
          {upcomingJoiners.length === 0 ? (
            <p className="text-xs text-gray-400 text-center py-6">No upcoming joiners</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-100">
                  <tr>
                    <th className="text-left px-4 py-2.5 font-semibold text-gray-600">Name</th>
                    <th className="text-left px-4 py-2.5 font-semibold text-gray-600">Position</th>
                    <th className="text-left px-4 py-2.5 font-semibold text-gray-600">Department</th>
                    <th className="text-left px-4 py-2.5 font-semibold text-gray-600">Joining Date</th>
                    <th className="text-left px-4 py-2.5 font-semibold text-gray-600">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {upcomingJoiners.map((j) => (
                    <tr key={j.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-2.5 font-medium text-gray-800">{j.name}</td>
                      <td className="px-4 py-2.5 text-gray-500">{j.position || "-"}</td>
                      <td className="px-4 py-2.5 text-gray-500">{j.department || "Unassigned"}</td>
                      <td className="px-4 py-2.5 text-gray-500">{j.joining_date ? formatDate(j.joining_date) : "-"}</td>
                      <td className="px-4 py-2.5">
                        <span className="inline-block px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-700 capitalize">
                          {j.status ? j.status.replace(/_/g, " ") : "Upcoming"}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </HRPage>
  );
}
