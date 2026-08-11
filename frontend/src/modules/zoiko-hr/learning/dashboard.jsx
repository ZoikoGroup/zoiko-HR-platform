import { useState, useEffect, useMemo } from "react";
import HRPage from "../../../components/HRPage";
import { getLearningDashboard } from "../../../service/hrService";

const KPI_CONFIG = [
  { key: "total_courses", label: "Total Courses", color: "text-blue-600" },
  { key: "active_courses", label: "Active Courses", color: "text-indigo-600" },
  { key: "total_enrollments", label: "Total Enrollments", color: "text-yellow-600" },
  { key: "completed_enrollments", label: "Completed", color: "text-green-600" },
  { key: "completion_rate", label: "Completion Rate", color: "text-teal-600", suffix: "%" },
  { key: "total_certifications", label: "Certifications", color: "text-purple-600" },
  { key: "total_skills", label: "Skills Tracked", color: "text-cyan-600" },
  { key: "avg_skill_level", label: "Avg Skill Level", color: "text-rose-600" },
  { key: "pending_assessments", label: "Pending Assessments", color: "text-orange-600" },
  { key: "upcoming_events", label: "Upcoming Events", color: "text-pink-600" },
];

export default function LearningDashboard({ isTab }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchDashboard = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await getLearningDashboard();
      setData(result);
    } catch (err) {
      setError(err.message || "Failed to load dashboard");
      setData(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboard();
  }, []);

  if (loading && !data) {
    const loadingEl = (
      <div className="flex justify-center items-center py-20">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        <span className="ml-3 text-gray-500">Loading dashboard...</span>
      </div>
    );
    if (isTab) return loadingEl;
    return (
      <HRPage title="Learning Dashboard" subtitle="Overview of learning and development KPIs.">
        {loadingEl}
      </HRPage>
    );
  }

  const content = (
    <>
      {error && (
        <div className="mb-4 px-4 py-3 bg-red-50 border border-red-200 text-red-700 rounded-lg flex justify-between items-center">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="text-red-500 hover:text-red-700 font-bold">&times;</button>
        </div>
      )}

      <div className="space-y-6">
        {!data ? (
          <div className="text-center py-16 bg-white rounded-xl border border-gray-100 shadow-sm">
            <div className="text-4xl mb-3">📊</div>
            <p className="text-gray-500 font-medium">No dashboard data available.</p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
              {KPI_CONFIG.map((kpi) => {
                const val = data[kpi.key];
                const display = kpi.suffix ? `${val ?? 0}${kpi.suffix}` : (val ?? 0);
                return (
                  <div key={kpi.key} className="bg-white rounded-xl border border-gray-100 shadow-sm px-4 py-3">
                    <p className="text-xs text-gray-400">{kpi.label}</p>
                    <p className={`text-2xl font-bold mt-1 ${kpi.color}`}>{display}</p>
                  </div>
                );
              })}
            </div>
            
          </>
        )}
      </div>
    </>
  );

  if (isTab) return content;

  return (
    <HRPage title="Learning Dashboard" subtitle="Overview of learning and development KPIs.">
      {content}
    </HRPage>
  );
}
