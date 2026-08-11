import React, { useState, useEffect, useRef } from "react";
import { NavLink } from "react-router-dom";
import { Download, BarChart, PieChart, TrendingUp, Target, CheckCircle, Star, Users, FileText, Printer } from "lucide-react";
import HRPage from "../../../components/HRPage";
import { BarChart as RechartsBarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart as RechartsPieChart, Pie, Cell } from "recharts";
import { getPerformanceAnalytics } from "../../../service/hrService";

class ChartErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error("Chart Error:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center h-64 bg-red-50 rounded-lg border border-red-200">
          <div className="text-red-500 text-lg font-medium mb-2">⚠️ Chart Error</div>
          <div className="text-red-400 text-sm">Unable to render chart data</div>
        </div>
      );
    }

    return this.props.children;
  }
}

const extractArray = (data) => {
  if (!data) return [];
  if (Array.isArray(data)) return data;
  if (Array.isArray(data.items)) return data.items;
  if (Array.isArray(data.data)) return data.data;
  return [];
};

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

function printPage() {
  window.print();
}

export default function PerformanceAnalytics() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const analyticsRef = useRef();

  useEffect(() => {
    let mounted = true;
    getPerformanceAnalytics()
      .then((res) => { if (mounted) setData(res); })
      .catch((err) => {
        console.error("Analytics load error:", err);
        if (mounted) setError("Failed to load analytics data. Please try again later.");
      })
      .finally(() => { if (mounted) setLoading(false); });
    return () => { mounted = false; };
  }, []);

  if (loading) return <HRPage title="Performance Analytics" subtitle="Key performance metrics and trends"><SubNav /><div className="p-6 text-center text-gray-400">Loading analytics...</div></HRPage>;

  if (error) return <HRPage title="Performance Analytics" subtitle="Key performance metrics and trends"><SubNav /><div className="p-6 text-center text-red-500 bg-red-50 rounded-lg m-4">Error: {error}</div></HRPage>;

  const d = data || {};

  const hasData = d.avg_performance_score != null || d.total_reviews > 0;

  const scoreData = hasData ? [
    { name: "Avg Performance Score", value: d.avg_performance_score ?? 0, fill: "#3B82F6" },
    { name: "Goal Completion Rate", value: d.goal_completion_rate ?? 0, fill: "#10B981" },
    { name: "Review Completion Rate", value: d.review_completion_rate ?? 0, fill: "#F59E0B" },
    { name: "Avg Rating", value: d.avg_rating ?? 0, fill: "#8B5CF6" },
  ] : [];

  const pieData = hasData ? [
    { name: "Completed", value: d.completed_reviews ?? 0, color: "#10B981" },
    { name: "Pending", value: d.pending_reviews ?? 0, color: "#F59E0B" },
  ] : [];
  return (
    <div ref={analyticsRef} className="min-h-screen bg-gray-50">
      <HRPage title="Performance Analytics" subtitle="Key performance metrics and trends">
        <SubNav />
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Performance Analytics</h1>
              <p className="text-sm text-gray-500 mt-1">Key performance metrics and trends</p>
            </div>
            <div className="flex gap-2">
              <button onClick={printPage} className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 text-sm font-medium">
                <Printer className="w-4 h-4" /> Print
              </button>
              <button
                onClick={() => {
                  const rows = [["Metric","Value"]];
                  const metrics = [
                    ["Avg Performance Score", `${d.avg_performance_score ?? 0}%`],
                    ["Goal Completion", `${d.goal_completion_rate ?? 0}%`],
                    ["Review Completion", `${d.review_completion_rate ?? 0}%`],
                    ["Avg Rating", d.avg_rating ? `${d.avg_rating}/5` : "0/5"],
                    ["Total Reviews", d.total_reviews ?? 0],
                    ["Completed Reviews", d.completed_reviews ?? 0],
                    ["Total Goals", d.total_goals ?? 0],
                    ["Completed Goals", d.completed_goals ?? 0],
                    ["Feedback Items", d.feedback_count ?? 0],
                    ["Total Appraisals", d.total_appraisals ?? 0],
                  ];
                  metrics.forEach(m => rows.push(m));
                  const csv = rows.map(r => r.join(",")).join("\n");
                  const blob = new Blob([csv], { type: "text/csv" });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement("a"); a.href = url; a.download = "performance_analytics.csv"; a.click();
                  URL.revokeObjectURL(url);
                }}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium"
              >
                <Download className="w-4 h-4" /> Export CSV
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <StatsCard title="Avg Performance Score" value={`${d.avg_performance_score ?? 0}%`} icon={TrendingUp} subtitle="Across all reviews" color="bg-blue-500" />
            <StatsCard title="Goal Completion" value={`${d.goal_completion_rate ?? 0}%`} icon={Target} subtitle="Goals completed" color="bg-green-500" />
            <StatsCard title="Review Completion" value={`${d.review_completion_rate ?? 0}%`} icon={CheckCircle} subtitle="Reviews completed" color="bg-orange-500" />
            <StatsCard title="Avg Rating" value={d.avg_rating ? `${d.avg_rating}/5` : "0/5"} icon={Star} subtitle="Across all reviews" color="bg-purple-500" />
            <StatsCard title="Total Reviews" value={d.total_reviews ?? 0} icon={FileText} subtitle={`${d.completed_reviews ?? 0} completed`} color="bg-indigo-500" />
            <StatsCard title="Total Goals" value={d.total_goals ?? 0} icon={Target} subtitle={`${d.completed_goals ?? 0} completed`} color="bg-teal-500" />
            <StatsCard title="Feedback Items" value={d.feedback_count ?? 0} icon={FileText} color="bg-cyan-500" />
            <StatsCard title="Total Appraisals" value={d.total_appraisals ?? 0} icon={Users} color="bg-rose-500" />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Performance Metrics</h2>
            <div className="w-full h-[350px] min-h-[350px]">
              <ChartErrorBoundary>
                {scoreData && scoreData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={320}>
                    <RechartsBarChart data={extractArray(scoreData)} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="name" />
                      <YAxis />
                      <Tooltip formatter={(value) => [`${value}%`, "Value"]} />
                      <Legend />
                      <Bar dataKey="value" fill="#3B82F6" radius={[4, 4, 0, 0]} />
                    </RechartsBarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex flex-col items-center justify-center h-full min-h-[320px] bg-gray-50 rounded-lg border border-gray-200">
                    <div className="text-gray-400 text-lg mb-2">📊 No performance metrics available</div>
                    <div className="text-gray-300 text-sm">Performance data will appear here when available</div>
                  </div>
                )}
              </ChartErrorBoundary>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Review Status Distribution</h2>
            <div className="w-full h-[350px] min-h-[350px]">
              <ChartErrorBoundary>
                {pieData && pieData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={320}>
                    <RechartsPieChart>
                      <Pie
                        data={extractArray(pieData)}
                        cx="50%"
                        cy="50%"
                        outerRadius={80}
                        fill="#8884d8"
                        dataKey="value"
                        label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                      >
                        {extractArray(pieData).map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip />
                      <Legend />
                    </RechartsPieChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex flex-col items-center justify-center h-full min-h-[320px] bg-gray-50 rounded-lg border border-gray-200">
                    <div className="text-gray-400 text-lg mb-2">📊 No review status data available</div>
                    <div className="text-gray-300 text-sm">Review status data will appear here when available</div>
                  </div>
                )}
              </ChartErrorBoundary>
            </div>
          </div>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Performance Summary</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div>
                <h3 className="text-sm font-medium text-gray-500 mb-2">Review Performance</h3>
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Total Reviews</span>
                    <span className="font-medium text-gray-900">{d.total_reviews ?? 0}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Completed</span>
                    <span className="font-medium text-green-600">{d.completed_reviews ?? 0}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Pending</span>
                    <span className="font-medium text-yellow-600">{d.pending_reviews ?? 0}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Completion Rate</span>
                    <span className="font-medium text-gray-900">{(d.total_reviews ? Math.round((d.completed_reviews / d.total_reviews) * 100) : 0)}%</span>
                  </div>
                </div>
              </div>

              <div>
                <h3 className="text-sm font-medium text-gray-500 mb-2">Goal Performance</h3>
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Total Goals</span>
                    <span className="font-medium text-gray-900">{d.total_goals ?? 0}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Completed</span>
                    <span className="font-medium text-green-600">{d.completed_goals ?? 0}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Completion Rate</span>
                    <span className="font-medium text-gray-900">{(d.total_goals ? Math.round((d.completed_goals / d.total_goals) * 100) : 0)}%</span>
                  </div>
                </div>
              </div>

              <div>
                <h3 className="text-sm font-medium text-gray-500 mb-2">Appraisal Summary</h3>
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Total Appraisals</span>
                    <span className="font-medium text-gray-900">{d.total_appraisals ?? 0}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Avg Score</span>
                    <span className="font-medium text-gray-900">{d.avg_appraisal_score ? `${d.avg_appraisal_score}/5` : "-"}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </HRPage>
    </div>
  );
}
