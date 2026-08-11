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
  XCircle,
  Clock,
  FileText,
  Package,
  Calendar,
  BookOpen,
  TrendingUp,
  Building2,
  BarChart3,
  Activity,
  ChevronRight,
  ArrowUpRight,
  Circle,
} from "lucide-react";

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

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const DEPARTMENT_COLORS = [
  "bg-blue-500", "bg-emerald-500", "bg-amber-500", "bg-violet-500",
  "bg-rose-500", "bg-cyan-500", "bg-orange-500", "bg-teal-500",
];

const PIE_COLORS = ["#22c55e", "#eab308", "#ef4444", "#3b82f6"];

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

function StatCard({ title, value, icon: Icon, color, change }) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 flex items-center justify-between">
      <div>
        <p className="text-xs text-gray-400 font-medium uppercase tracking-wider">{title}</p>
        <p className="text-2xl font-bold text-gray-800 mt-1">{value}</p>
        {change !== undefined && (
          <p className="text-xs text-gray-400 mt-1 flex items-center gap-1">
            <ArrowUpRight size={12} className="text-green-500" />
            {change} from last month
          </p>
        )}
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

function SimpleBar({ label, value, max, color }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div className="flex items-center gap-3">
      <span className="text-xs text-gray-500 w-10 shrink-0">{label}</span>
      <div className="flex-1 h-5 bg-gray-100 rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all duration-500 ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs font-medium text-gray-600 w-8 text-right">{value}</span>
    </div>
  );
}

function PieSegment({ label, value, total, color }) {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0;
  return (
    <div className="flex items-center gap-2">
      <Circle size={10} fill={color} stroke={color} />
      <span className="text-xs text-gray-500 flex-1">{label}</span>
      <span className="text-xs font-medium text-gray-700">{pct}% ({value})</span>
    </div>
  );
}

export default function OnboardingDashboard() {
  const [dashboard, setDashboard] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

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
  }, []);

  const stats = useMemo(() => {
    if (!dashboard) return null;
    return dashboard;
  }, [dashboard]);

  const monthlyTrend = stats?.monthlyJoiningTrend || [];
  const maxMonthly = Math.max(...monthlyTrend.map((m) => m.count), 1);

  const deptData = stats?.departmentWise || [];
  const maxDept = Math.max(...deptData.map((d) => d.count), 1);

  const completionRaw = stats?.completionStatus || { total: 0, completed: 0, pending: 0 };
  const completionTotal = completionRaw.total || 0;
  const completedCount = completionRaw.completed || 0;
  const pendingCount = completionRaw.pending || 0;
  const notStartedCount = Math.max(completionTotal - completedCount - pendingCount, 0);
  const completionStatus = { completed: completedCount, pending: pendingCount, notStarted: notStartedCount };
  const completionDenom = completionTotal || 1;

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
        <div className="mb-4 px-4 py-3 bg-red-50 border border-red-200 text-red-700 rounded-lg">
          Error: {error}
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
            change="+12%"
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
            change="+8%"
          />
        </div>

        <div>
          <h3 className="text-sm font-semibold text-gray-700 mb-3">Pending Items</h3>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <PendingCard title="Documents Pending" count={stats?.documentsPending ?? 0} icon={FileText} color="bg-blue-500" />
            <PendingCard title="Assets Pending" count={stats?.assetsPending ?? 0} icon={Package} color="bg-violet-500" />
            <PendingCard title="Orientation Pending" count={stats?.orientationPending ?? 0} icon={Calendar} color="bg-amber-500" />
            <PendingCard title="Training Pending" count={stats?.trainingPending ?? 0} icon={BookOpen} color="bg-rose-500" />
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
                    label={m.month}
                    value={m.count}
                    max={maxMonthly}
                    color="bg-blue-500"
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
                    label={d.department}
                    value={d.count}
                    max={maxDept}
                    color={DEPARTMENT_COLORS[i % DEPARTMENT_COLORS.length]}
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
            <div className="flex items-center justify-center gap-1 py-4">
              {[
                { key: "completed", value: completionStatus.completed, color: PIE_COLORS[0] },
                { key: "pending", value: completionStatus.pending, color: PIE_COLORS[2] },
                { key: "notStarted", value: completionStatus.notStarted, color: PIE_COLORS[3] },
              ].map((seg) => (
                <div
                  key={seg.key}
                  className="h-16 first:rounded-l-full last:rounded-r-full transition-all duration-500"
                  style={{
                    width: `${(seg.value / completionDenom) * 100}%`,
                    backgroundColor: seg.color,
                    minWidth: seg.value > 0 ? "4px" : "0",
                  }}
                />
              ))}
            </div>
            <div className="space-y-1.5 mt-2">
              <PieSegment label="Completed" value={completionStatus.completed} total={completionDenom} color={PIE_COLORS[0]} />
              <PieSegment label="In Onboarding" value={completionStatus.pending} total={completionDenom} color={PIE_COLORS[2]} />
              <PieSegment label="Not Started" value={completionStatus.notStarted} total={completionDenom} color={PIE_COLORS[3]} />
            </div>
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
                      <p className="text-xs text-gray-400 mt-0.5">{act.timestamp || act.date || ""}</p>
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
                      <td className="px-4 py-2.5 text-gray-500">{j.position}</td>
                      <td className="px-4 py-2.5 text-gray-500">{j.department}</td>
                      <td className="px-4 py-2.5 text-gray-500">{j.joining_date || "-"}</td>
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
