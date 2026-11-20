import { useState, useEffect } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import HRPage from "../../../components/HRPage";
import { getLearningDashboard } from "../../../service/hrService";

// Each tile counts exactly what its label says (audit L13): "Awaiting Review" is the quiz attempts whose essay answers
// wait for a mark; quizzes opened but not yet submitted are counted apart.
export const KPI_CONFIG = [
  { key: "total_courses", label: "Total Courses", color: "text-blue-600" },
  { key: "active_courses", label: "Active Courses", color: "text-blue-600" },
  { key: "total_enrollments", label: "Total Enrollments", color: "text-yellow-600" },
  { key: "completed_enrollments", label: "Completed", color: "text-green-600" },
  { key: "completion_rate", label: "Completion Rate", color: "text-teal-600", suffix: "%" },
  { key: "total_certifications", label: "Certifications", color: "text-blue-600" },
  { key: "total_skills", label: "Skills Tracked", color: "text-cyan-600" },
  { key: "avg_skill_level", label: "Avg Skill Level", color: "text-rose-600" },
  { key: "awaiting_review", fallback: "pending_assessments", label: "Awaiting Review", color: "text-orange-600" },
  { key: "in_progress_attempts", label: "Quizzes In Progress", color: "text-indigo-600" },
  { key: "upcoming_events", label: "Upcoming Events", color: "text-pink-600" },
];

const card = "bg-white dark:bg-[#1e293b] rounded-xl border border-gray-100 dark:border-[#334155] shadow-sm";

/** "2026-03" as "Mar 2026". */
export function monthLabel(ym) {
  const m = /^(\d{4})-(\d{2})$/.exec(String(ym || ""));
  if (!m) return String(ym || "");
  return new Date(Number(m[1]), Number(m[2]) - 1, 1).toLocaleString("en-US", { month: "short", year: "numeric" });
}

export default function LearningDashboard({ isTab }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchDashboard = async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await getLearningDashboard());
    } catch (err) {
      setError(err.message || "Failed to load dashboard");
      setData(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchDashboard(); }, []);

  if (loading && !data) {
    const loadingEl = (
      <div className="flex justify-center items-center py-20">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        <span className="ml-3 text-gray-500 dark:text-[#94a3b8]">Loading dashboard...</span>
      </div>
    );
    if (isTab) return loadingEl;
    return <HRPage title="Learning Dashboard" subtitle="Overview of learning and development KPIs.">{loadingEl}</HRPage>;
  }

  const trend = (data?.enrollment_trend || []).slice(-12).map((t) => ({ month: monthLabel(t.month), count: t.count || 0 }));
  const categories = [...(data?.category_distribution || [])].sort((a, b) => (b.count || 0) - (a.count || 0));
  const maxCategory = Math.max(1, ...categories.map((c) => c.count || 0));
  const recent = data?.recent_enrollments || [];

  const content = (
    <>
      {error && (
        <div role="alert" className="mb-4 px-4 py-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 rounded-lg flex justify-between items-center">
          <span>{error}</span>
          <button onClick={() => setError(null)} aria-label="Dismiss" className="text-red-500 hover:text-red-700 font-bold">&times;</button>
        </div>
      )}

      <div className="space-y-6">
        {!data ? (
          <div className={`text-center py-16 ${card}`}>
            <div className="text-4xl mb-3">📊</div>
            <p className="text-gray-500 dark:text-[#94a3b8] font-medium">No dashboard data available.</p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
              {KPI_CONFIG.map((kpi) => {
                const val = data[kpi.key] ?? (kpi.fallback ? data[kpi.fallback] : undefined);
                const display = kpi.suffix ? `${val ?? 0}${kpi.suffix}` : (val ?? 0);
                return (
                  <div key={kpi.key} className={`${card} px-4 py-3`} data-testid={`kpi-${kpi.key}`}>
                    <p className="text-xs text-gray-400 dark:text-[#94a3b8]">{kpi.label}</p>
                    <p className={`text-2xl font-bold mt-1 ${kpi.color}`}>{display}</p>
                  </div>
                );
              })}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <section aria-label="Enrollment trend" className={`${card} p-5`}>
                <h3 className="text-sm font-bold text-gray-800 dark:text-[#f1f5f9] mb-3">Enrollments per Month</h3>
                {trend.length === 0 ? (
                  <p className="text-sm text-gray-500 dark:text-[#94a3b8] py-8 text-center">No enrollments yet.</p>
                ) : (
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={trend} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#94a3b833" />
                      <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                      <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                      <Tooltip />
                      <Bar dataKey="count" name="Enrollments" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </section>

              <section aria-label="Courses by category" className={`${card} p-5`}>
                <h3 className="text-sm font-bold text-gray-800 dark:text-[#f1f5f9] mb-3">Courses by Category</h3>
                {categories.length === 0 ? (
                  <p className="text-sm text-gray-500 dark:text-[#94a3b8] py-8 text-center">No categories yet.</p>
                ) : (
                  <ul className="space-y-2">
                    {categories.map((c) => (
                      <li key={c.category}>
                        <div className="flex justify-between text-xs text-gray-600 dark:text-[#cbd5e1] mb-1">
                          <span className="font-medium">{c.category}</span><span>{c.count}</span>
                        </div>
                        <div className="bg-gray-100 dark:bg-[#0f172a] rounded-full h-2 overflow-hidden">
                          <div className="h-full bg-teal-500 rounded-full" style={{ width: `${((c.count || 0) / maxCategory) * 100}%` }} />
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </div>

            <section aria-label="Recent enrollments" className={`${card} p-5`}>
              <h3 className="text-sm font-bold text-gray-800 dark:text-[#f1f5f9] mb-3">Recent Enrollments</h3>
              {recent.length === 0 ? (
                <p className="text-sm text-gray-500 dark:text-[#94a3b8]">No enrollments yet.</p>
              ) : (
                <ul className="divide-y divide-gray-100 dark:divide-[#334155] text-sm">
                  {recent.map((e) => (
                    <li key={e.id} className="flex flex-wrap justify-between gap-2 py-2">
                      <span className="text-gray-800 dark:text-[#f1f5f9]"><span className="font-medium">{e.employee_name || "Someone"}</span> · {e.course_name || "a course"}</span>
                      <span className="text-xs text-gray-500 dark:text-[#94a3b8] capitalize">{String(e.status || "").replace(/_/g, " ")}{e.enrolled_at ? ` · ${String(e.enrolled_at).slice(0, 10)}` : ""}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </>
        )}
      </div>
    </>
  );

  if (isTab) return content;
  return <HRPage title="Learning Dashboard" subtitle="Overview of learning and development KPIs.">{content}</HRPage>;
}
