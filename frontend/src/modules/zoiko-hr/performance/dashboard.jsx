import { useState, useEffect, useCallback } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { Trophy, Target, Star, MessageSquare, Award, RefreshCw, TrendingUp, Activity, CheckCircle, Clock, AlertCircle } from "lucide-react";
import HRPage from "../../../components/HRPage";
import { getPerformanceDashboard, getPerformanceAnalytics, getHrEmployees } from "../../../service/hrService";

const NAV_ITEMS = [
  { label: "Dashboard", href: "/zoiko-hr/performance" },
  { label: "Goals & OKRs", href: "/zoiko-hr/performance/goals" },
  { label: "Performance Reviews", href: "/zoiko-hr/performance/reviews" },
  { label: "Appraisals", href: "/zoiko-hr/performance/appraisals" },
  { label: "Performance Analytics", href: "/zoiko-hr/performance/analytics" },
];

function SubNav() {
  return (
    <div className="flex gap-1 overflow-x-auto pb-1 mb-6 border-b border-gray-100">
      {NAV_ITEMS.map((item) => (
        <NavLink key={item.href} to={item.href} end={item.href === "/zoiko-hr/performance"}
          className={({ isActive }) =>
            `whitespace-nowrap px-3 py-2 text-sm font-medium rounded-t-lg transition-colors ${isActive ? "text-blue-600 border-b-2 border-blue-600 bg-blue-50/50" : "text-gray-500 hover:text-gray-700 hover:bg-gray-50"}`
          }>
          {item.label}
        </NavLink>
      ))}
    </div>
  );
}

function StatsCard({ title, value, icon: Icon, subtitle, color }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
      <div className="flex items-start justify-between">
        <p className="text-sm text-gray-500 font-medium">{title}</p>
        {Icon && <div className={`p-2 ${color} rounded-lg`}><Icon className="w-5 h-5 text-white" /></div>}
      </div>
      <p className="text-2xl font-bold text-gray-900 mt-1">{value}</p>
      {subtitle && <p className="text-xs text-gray-400 mt-1">{subtitle}</p>}
    </div>
  );
}

function ProgressBlock({ label, value, total, color }) {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0;
  return (
    <div>
      <div className="flex justify-between text-sm mb-1">
        <span className="text-gray-600">{label}</span>
        <span className="font-medium text-gray-900">{value}/{total} ({pct}%)</span>
      </div>
      <div className="w-full bg-gray-100 rounded-full h-2.5">
        <div className={`h-2.5 rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function EmptyState({ icon: Icon, title, message, action }) {
  return (
    <div className="text-center py-12">
      {Icon && <Icon className="w-12 h-12 mx-auto mb-4 text-gray-300" />}
      <h3 className="text-lg font-medium text-gray-900 mb-2">{title}</h3>
      <p className="text-gray-500 mb-4">{message}</p>
      {action}
    </div>
  );
}

export default function PerformanceDashboard() {
  const navigate = useNavigate();
  const [dash, setDash] = useState(null);
  const [analytics, setAnalytics] = useState(null);
  const [employees, setEmployees] = useState([]);
  const [selectedEmployee, setSelectedEmployee] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    Promise.all([
      getPerformanceDashboard(selectedEmployee || undefined),
      getPerformanceAnalytics(selectedEmployee || undefined),
      getHrEmployees({ per_page: 200, include_all_roles: true }).catch(() => []),
    ])
      .then(([d, a, emps]) => {
        setDash(d);
        setAnalytics(a);
        setEmployees(Array.isArray(emps) ? emps : emps?.items || emps?.data || []);
      })
      .catch((err) => {
        console.error("Dashboard load error:", err);
        setError("Failed to load dashboard data. Please try again later.");
      })
      .finally(() => setLoading(false));
  }, [selectedEmployee]);

  useEffect(() => { load(); }, [load]);

  if (loading) return <HRPage title="Performance Dashboard" subtitle="Team performance overview and metrics"><SubNav /><div className="p-6 text-center text-gray-400">Loading dashboard...</div></HRPage>;

  if (error) return <HRPage title="Performance Dashboard" subtitle="Team performance overview and metrics"><SubNav /><div className="p-6 text-center text-red-500 bg-red-50 rounded-lg m-4"><AlertCircle className="w-8 h-8 mx-auto mb-2" />{error}</div></HRPage>;

  const d = dash || {};
  const a = analytics || {};
  const reviewCompletion = d.total_reviews > 0 ? Math.round((d.completed_reviews / d.total_reviews) * 100) : 0;
  const goalCompletion = d.total_goals > 0 ? Math.round((d.completed_goals / d.total_goals) * 100) : 0;

  return (
    <HRPage title="Performance Dashboard" subtitle="Team performance overview and metrics">
      <SubNav />
      <div className="space-y-6">
        <div className="flex items-center justify-end gap-3">
          <select
            value={selectedEmployee}
            onChange={(e) => setSelectedEmployee(e.target.value)}
            className="px-3 py-1.5 text-xs text-gray-700 border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">All Employees</option>
            {employees.map((emp) => {
              const first = emp.firstName || emp.first_name;
              const last = emp.lastName || emp.last_name;
              const name = emp.fullName || emp.full_name || (first && last ? `${first} ${last}` : null) || `Employee #${emp.id}`;
              return <option key={emp.id} value={emp.id}>{name}</option>;
            })}
          </select>
          <button onClick={load} className="flex items-center gap-2 px-3 py-1.5 text-xs text-gray-500 border border-gray-200 rounded-lg hover:bg-gray-50">
            <RefreshCw className="w-3.5 h-3.5" /> Refresh
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatsCard title="Avg Performance Score" value={`${a.avg_performance_score ?? 0}%`} icon={TrendingUp} subtitle="Across all reviews" color="bg-blue-500" />
          <StatsCard title="Goal Completion" value={`${a.goal_completion_rate ?? 0}%`} icon={Target} subtitle="Goals completed" color="bg-green-500" />
          <StatsCard title="Review Completion" value={`${a.review_completion_rate ?? 0}%`} icon={CheckCircle} subtitle="Reviews completed" color="bg-orange-500" />
          <StatsCard title="Avg Rating" value={a.avg_rating ? `${a.avg_rating}/5` : "0/5"} icon={Star} subtitle="Across all reviews" color="bg-purple-500" />
          <StatsCard title="Total Reviews" value={d.total_reviews ?? 0} icon={Activity} subtitle={`${d.completed_reviews ?? 0} completed`} color="bg-indigo-500" />
          <StatsCard title="Total Goals" value={d.total_goals ?? 0} icon={Target} subtitle={`${d.completed_goals ?? 0} completed`} color="bg-teal-500" />
          <StatsCard title="Feedback Items" value={d.total_feedback ?? 0} icon={MessageSquare} color="bg-cyan-500" />
          <StatsCard title="Total Appraisals" value={d.total_appraisals ?? 0} icon={Award} subtitle={`${d.pending_appraisals ?? 0} in draft`} color="bg-rose-500" />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Review Statistics</h2>
            {d.total_reviews === 0 ? (
              <EmptyState
                icon={MessageSquare}
                title="No reviews found"
                message="Create your first review to get started"
                action={<button onClick={() => navigate("/zoiko-hr/performance/reviews")} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">Create Review</button>}
              />
            ) : (
              <div className="space-y-4">
                <ProgressBlock label="Completed" value={d.completed_reviews ?? 0} total={d.total_reviews || 1} color="bg-green-500" />
                <ProgressBlock label="Pending" value={d.pending_reviews ?? 0} total={d.total_reviews || 1} color="bg-yellow-500" />
                <div className="mt-2 pt-3 border-t border-gray-100 flex justify-between text-sm">
                  <span className="text-gray-500">Overall Completion</span>
                  <span className="font-bold text-gray-900">{reviewCompletion}%</span>
                </div>
              </div>
            )}
          </div>

          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Goal Statistics</h2>
            {d.total_goals === 0 ? (
              <EmptyState
                icon={Target}
                title="No goals found"
                message="Create your first goal to get started"
                action={<button onClick={() => navigate("/zoiko-hr/performance/goals")} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">Create Goal</button>}
              />
            ) : (
              <div className="space-y-4">
                <ProgressBlock label="Completed" value={d.completed_goals ?? 0} total={d.total_goals || 1} color="bg-green-500" />
                <ProgressBlock label="Remaining" value={(d.total_goals ?? 0) - (d.completed_goals ?? 0)} total={d.total_goals || 1} color="bg-blue-500" />
                <div className="mt-2 pt-3 border-t border-gray-100 flex justify-between text-sm">
                  <span className="text-gray-500">Completion Rate</span>
                  <span className="font-bold text-gray-900">{goalCompletion}%</span>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </HRPage>
  );
}
