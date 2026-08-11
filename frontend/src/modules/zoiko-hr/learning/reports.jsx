import { useState, useEffect, useMemo, useCallback } from "react";
import HRPage from "../../../components/HRPage";
import {
  getCourses,
  getCourseCompletionReport,
  getCertificationReport,
  getSkillGapAnalysis,
  exportCourseCompletionReportCsv,
  exportCourseCompletionReportExcel,
  exportCertificationReportCsv,
  exportCertificationReportExcel,
  exportSkillGapReportCsv,
  exportSkillGapReportExcel,
  getHrEmployees,
} from "../../../service/hrService";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";

const ITEMS_PER_PAGE = 10;

function DashboardTab() {
  const [courses, setCourses] = useState([]);
  const [report, setReport] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [dateRange, setDateRange] = useState("monthly");

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [coursesRes, reportRes] = await Promise.all([getCourses(), getCourseCompletionReport()]);
      setCourses(Array.isArray(coursesRes) ? coursesRes : coursesRes?.items || coursesRes?.data || []);
      setReport(Array.isArray(reportRes) ? reportRes : []);
    } catch (err) {
      setError(err.message || "Failed to load report data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  const chartData = useMemo(() => {
    if (report.length === 0 && courses.length === 0) return [];
    const source = report.length > 0 ? report : courses;
    return source.slice(0, 10).map((r) => ({
      name: r.course_name || r.course || r.title || r.name || "Course",
      rate: parseFloat(r.completion_rate || r.completionRate || 0).toFixed(1),
      enrolled: r.total_enrollments || r.enrolled || r.enrollments || 0,
      completed: r.completed || r.completions || 0,
    }));
  }, [report, courses]);

  const handleDownloadCsv = useCallback(() => {
    if (chartData.length === 0) return;
    const headers = ["Course,Completion Rate,Enrolled,Completed"];
    const rows = chartData.map((r) => `${r.name},${r.rate}%,${r.enrolled},${r.completed}`);
    const blob = new Blob([headers.join(""), ...rows.map(r => "\n" + r)], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "learning_dashboard.csv"; a.click();
    URL.revokeObjectURL(url);
  }, [chartData]);

  const handleDownloadExcel = useCallback(() => {
    if (chartData.length === 0) return;
    const rows = [["Course", "Completion Rate (%)", "Enrolled", "Completed"]];
    chartData.forEach((r) => rows.push([r.name, r.rate, r.enrolled, r.completed]));
    const csv = rows.map(row => row.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "learning_dashboard.csv"; a.click();
    URL.revokeObjectURL(url);
  }, [chartData]);

  if (loading) {
    return <div className="flex justify-center py-16"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div></div>;
  }

  if (error) {
    return <div className="mb-4 px-4 py-3 bg-red-50 border border-red-200 text-red-700 rounded-lg">{error}</div>;
  }

  return (
    <div className="space-y-6">
      {/* Filters Row */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <label className="text-sm font-medium text-gray-600">Date Range:</label>
          <select
            value={dateRange}
            onChange={(e) => setDateRange(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="daily">Daily</option>
            <option value="monthly">Monthly</option>
            <option value="yearly">Yearly</option>
          </select>
        </div>
        <div className="flex gap-2">
          <button onClick={handleDownloadCsv} className="border border-gray-200 hover:bg-gray-50 text-gray-700 text-sm font-medium px-4 py-2 rounded-lg transition-colors flex items-center gap-1.5">
            <span>📥</span> CSV
          </button>
          <button onClick={handleDownloadExcel} className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors flex items-center gap-1.5">
            <span>📊</span> Excel
          </button>
        </div>
      </div>

      {chartData.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-xl border border-gray-100 shadow-sm">
          <p className="text-gray-500 font-medium">No data available for charts.</p>
        </div>
      ) : (
        <>
          {/* Bar Chart */}
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6">
            <h3 className="text-sm font-bold text-gray-800 mb-4">Course Completion Rates</h3>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={chartData} margin={{ top: 5, right: 20, left: 0, bottom: 60 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} angle={-20} textAnchor="end" interval={0} height={60} />
                <YAxis unit="%" tick={{ fontSize: 12 }} />
                <Tooltip formatter={(value) => `${value}%`} />
                <Bar dataKey="rate" fill="#3b82f6" radius={[4, 4, 0, 0]} name="Completion Rate" />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Summary Cards */}
          <div className="grid grid-cols-3 gap-4">
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
              <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">Total Courses</p>
              <p className="text-2xl font-bold text-gray-900 mt-1">{courses.length || report.length}</p>
            </div>
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
              <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">Total Enrollments</p>
              <p className="text-2xl font-bold text-blue-600 mt-1">{chartData.reduce((s, r) => s + (r.enrolled || 0), 0)}</p>
            </div>
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
              <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">Avg Completion</p>
              <p className="text-2xl font-bold text-emerald-600 mt-1">
                {chartData.length > 0 ? (chartData.reduce((s, r) => s + parseFloat(r.rate || 0), 0) / chartData.length).toFixed(1) : 0}%
              </p>
            </div>
          </div>

          {/* Flow Chart / Progress bars */}
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6">
            <h3 className="text-sm font-bold text-gray-800 mb-4">Enrollment vs Completion</h3>
            <div className="space-y-3">
              {chartData.slice(0, 5).map((r, i) => (
                <div key={i}>
                  <div className="flex justify-between text-xs text-gray-600 mb-1">
                    <span className="font-medium truncate max-w-[200px]">{r.name}</span>
                    <span>{r.completed}/{r.enrolled}</span>
                  </div>
                  <div className="flex gap-1">
                    <div className="flex-1 bg-gray-100 rounded-full h-2.5 overflow-hidden">
                      <div className="h-full bg-blue-500 rounded-full transition-all" style={{ width: `${Math.min((r.enrolled ? (r.completed / r.enrolled) * 100 : 0), 100)}%` }} />
                    </div>
                    <span className="text-xs font-medium text-gray-500 w-10 text-right">{r.rate}%</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function CompletionTab() {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState("");
  const [currentPage, setCurrentPage] = useState(1);

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await getCourseCompletionReport();
      setData(Array.isArray(res) ? res : []);
    } catch (err) {
      setError(err.message || "Failed to load course completion report");
      setData([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  const stats = useMemo(() => {
    const total = data.length;
    const avgRate = total > 0
      ? Math.round(data.reduce((s, r) => s + (parseFloat(r.completion_rate) || 0), 0) / total)
      : 0;
    return { total, avgRate };
  }, [data]);

  const filtered = useMemo(() => {
    if (!search.trim()) return data;
    const q = search.toLowerCase();
    return data.filter((r) => r.course_name?.toLowerCase().includes(q) || r.course?.toLowerCase().includes(q));
  }, [data, search]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / ITEMS_PER_PAGE));
  const safePage = Math.min(currentPage, totalPages);
  const paginated = useMemo(() => {
    const start = (safePage - 1) * ITEMS_PER_PAGE;
    return filtered.slice(start, start + ITEMS_PER_PAGE);
  }, [filtered, safePage]);

  useEffect(() => {
    if (currentPage > totalPages) setCurrentPage(totalPages);
  }, [totalPages, currentPage]);

  if (loading) {
    return <div className="flex justify-center py-16"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div></div>;
  }

  if (error) {
    return <div className="mb-4 px-4 py-3 bg-red-50 border border-red-200 text-red-700 rounded-lg">{error}</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3">
        <div className="bg-white px-4 py-2 border border-gray-100 rounded-lg shadow-sm text-sm">
          <span className="text-gray-400">Total Courses: </span>
          <span className="font-bold text-gray-800">{stats.total}</span>
        </div>
        <div className="bg-white px-4 py-2 border border-blue-100 rounded-lg shadow-sm text-sm">
          <span className="text-gray-400">Avg Completion Rate: </span>
          <span className="font-bold text-blue-600">{stats.avgRate}%</span>
        </div>
      </div>
      <div className="flex flex-wrap justify-between items-center gap-3">
        {data.length > 0 && (
          <input
            type="text"
            placeholder="Search by course name..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setCurrentPage(1); }}
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm w-64 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        )}
        <div className="flex gap-2 ml-auto">
          <button
            onClick={exportCourseCompletionReportCsv}
            className="border border-gray-200 hover:bg-gray-50 text-gray-700 text-sm font-medium px-4 py-2 rounded-lg transition-colors flex items-center gap-1.5"
          >
            <span>📥</span> Export CSV
          </button>
          <button
            onClick={exportCourseCompletionReportExcel}
            className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors flex items-center gap-1.5"
          >
            <span>📊</span> Export Excel
          </button>
        </div>
      </div>
      {filtered.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-xl border border-gray-100 shadow-sm">
          <p className="text-gray-500 font-medium">
            {data.length === 0 ? "No course completion data available." : "No matches."}
          </p>
        </div>
      ) : (
        <>
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-100">
                  <tr>
                    <th className="text-left px-4 py-3 font-semibold text-gray-600">Course</th>
                    <th className="text-left px-4 py-3 font-semibold text-gray-600">Total Enrollments</th>
                    <th className="text-left px-4 py-3 font-semibold text-gray-600">Completed</th>
                    <th className="text-left px-4 py-3 font-semibold text-gray-600">Completion Rate</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {paginated.map((r, i) => (
                    <tr key={r.course_id || i} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3 font-medium text-gray-800">{r.course_name || r.course || `#${r.course_id}`}</td>
                      <td className="px-4 py-3 text-gray-700">{r.total_enrollments ?? "-"}</td>
                      <td className="px-4 py-3 text-gray-700">{r.completed ?? "-"}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="w-20 bg-gray-200 rounded-full h-2">
                            <div className={`h-2 rounded-full ${
                              parseFloat(r.completion_rate) >= 80 ? "bg-green-500" : parseFloat(r.completion_rate) >= 50 ? "bg-yellow-500" : "bg-red-500"
                            }`} style={{ width: `${Math.min(parseFloat(r.completion_rate) || 0, 100)}%` }} />
                          </div>
                          <span className="text-xs font-medium">{parseFloat(r.completion_rate).toFixed(1) || 0}%</span>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          {totalPages > 1 && (
            <div className="flex justify-between items-center">
              <span className="text-xs text-gray-400">
                Showing {(safePage - 1) * ITEMS_PER_PAGE + 1}-{Math.min(safePage * ITEMS_PER_PAGE, filtered.length)} of {filtered.length}
              </span>
              <div className="flex gap-1">
                <button onClick={() => setCurrentPage((p) => Math.max(1, p - 1))} disabled={safePage <= 1} className="px-3 py-1 text-sm border border-gray-200 rounded-lg disabled:opacity-40 hover:bg-gray-50">Prev</button>
                {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
                  <button key={p} onClick={() => setCurrentPage(p)} className={`px-3 py-1 text-sm border rounded-lg ${p === safePage ? "bg-blue-600 text-white border-blue-600" : "border-gray-200 hover:bg-gray-50"}`}>{p}</button>
                ))}
                <button onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))} disabled={safePage >= totalPages} className="px-3 py-1 text-sm border border-gray-200 rounded-lg disabled:opacity-40 hover:bg-gray-50">Next</button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function CertificationTab() {
  const [data, setData] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [res, emps] = await Promise.all([getCertificationReport(), getHrEmployees()]);
      setData(Array.isArray(res) ? res : []);
      setEmployees(emps?.items || (Array.isArray(emps) ? emps : []));
    } catch (err) {
      setError(err.message || "Failed to load certification report");
      setData([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  const employeeMap = useMemo(() => {
    const m = {};
    employees.forEach((e) => {
      m[e.id] = e;
    });
    return m;
  }, [employees]);

  const getCertRowStyle = (expiry) => {
    if (!expiry) return "";
    const daysLeft = Math.ceil((new Date(expiry) - new Date()) / (1000 * 60 * 60 * 24));
    if (daysLeft < 0) return "bg-red-50";
    if (daysLeft < 30) return "bg-yellow-50";
    return "";
  };

  const getDaysLeft = (expiry) => {
    if (!expiry) return null;
    return Math.ceil((new Date(expiry) - new Date()) / (1000 * 60 * 60 * 24));
  };

  const getStatusBadge = (expiry) => {
    if (!expiry) return <span className="inline-block px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">Valid</span>;
    const days = getDaysLeft(expiry);
    if (days < 0) return <span className="inline-block px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">Expired</span>;
    if (days < 30) return <span className="inline-block px-2 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">{days}d left</span>;
    return <span className="inline-block px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">Valid</span>;
  };

  if (loading) {
    return <div className="flex justify-center py-16"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div></div>;
  }

  if (error) {
    return <div className="mb-4 px-4 py-3 bg-red-50 border border-red-200 text-red-700 rounded-lg">{error}</div>;
  }

  return (
    <div className="space-y-4">
      {data.length > 0 && (
        <div className="flex justify-end gap-2">
          <button
            onClick={exportCertificationReportCsv}
            className="border border-gray-200 hover:bg-gray-50 text-gray-700 text-sm font-medium px-4 py-2 rounded-lg transition-colors flex items-center gap-1.5"
          >
            <span>📥</span> Export CSV
          </button>
          <button
            onClick={exportCertificationReportExcel}
            className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors flex items-center gap-1.5"
          >
            <span>📊</span> Export Excel
          </button>
        </div>
      )}
      {data.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-xl border border-gray-100 shadow-sm">
          <p className="text-gray-500 font-medium">No certification data available.</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600">Certification</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600">Employee</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600">Issued</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600">Expiry</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600">Days Left</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {data.map((c, i) => {
                  const emp = employeeMap[c.employee_id];
                  const empName = emp ? `${emp.first_name || ""} ${emp.last_name || ""}`.trim() : `#${c.employee_id}`;
                  return (
                    <tr key={c.id || i} className={`hover:bg-gray-50 transition-colors ${getCertRowStyle(c.expiry_date)}`}>
                      <td className="px-4 py-3 font-medium text-gray-800">{c.certification_name || c.name}</td>
                      <td className="px-4 py-3 text-gray-700">{empName}</td>
                      <td className="px-4 py-3 text-xs text-gray-500">{c.issue_date || c.issued_date || c.issued}</td>
                      <td className="px-4 py-3 text-xs text-gray-500">{c.expiry_date || c.expiry || <span className="text-gray-300">-</span>}</td>
                      <td className="px-4 py-3 text-xs text-gray-500">
                        {c.expiry_date ? (
                          <span className={getDaysLeft(c.expiry_date) < 0 ? "text-red-600 font-medium" : getDaysLeft(c.expiry_date) < 30 ? "text-yellow-600 font-medium" : ""}>
                            {getDaysLeft(c.expiry_date)}
                          </span>
                        ) : <span className="text-gray-300">-</span>}
                      </td>
                      <td className="px-4 py-3">{getStatusBadge(c.expiry_date)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function SkillGapTab() {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await getSkillGapAnalysis();
      setData(Array.isArray(res) ? res : []);
    } catch (err) {
      setError(err.message || "Failed to load skill gap analysis");
      setData([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  if (loading) {
    return <div className="flex justify-center py-16"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div></div>;
  }

  if (error) {
    return <div className="mb-4 px-4 py-3 bg-red-50 border border-red-200 text-red-700 rounded-lg">{error}</div>;
  }

  if (data.length === 0) {
    return (
      <div className="text-center py-16 bg-white rounded-xl border border-gray-100 shadow-sm">
        <p className="text-gray-500 font-medium">No skill gap data available.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {data.length > 0 && (
        <div className="flex justify-end gap-2">
          <button
            onClick={exportSkillGapReportCsv}
            className="border border-gray-200 hover:bg-gray-50 text-gray-700 text-sm font-medium px-4 py-2 rounded-lg transition-colors flex items-center gap-1.5"
          >
            <span>📥</span> Export CSV
          </button>
          <button
            onClick={exportSkillGapReportExcel}
            className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors flex items-center gap-1.5"
          >
            <span>📊</span> Export Excel
          </button>
        </div>
      )}
      {data.map((dept, i) => (
        <div key={dept.department_id || i} className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-4 py-3 bg-gray-50 border-b border-gray-100">
            <h3 className="text-sm font-semibold text-gray-800">{dept.department_name || dept.department || `#${dept.department_id}`}</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600">Skill</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600">Employee Count</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600">Gap Level</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {(Array.isArray(dept.skills) ? dept.skills : []).map((skill, j) => (
                  <tr key={skill.skill_id || skill.skill_name || j} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 font-medium text-gray-700">{skill.skill_name || skill.skill}</td>
                    <td className="px-4 py-3 text-gray-700">{skill.employee_count ?? skill.count ?? "-"}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${
                        skill.gap_level === "high" ? "bg-red-100 text-red-800" :
                        skill.gap_level === "medium" ? "bg-yellow-100 text-yellow-800" :
                        "bg-green-100 text-green-800"
                      }`}>
                        {skill.gap_level || "unknown"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </div>
  );
}

export default function ZoikoHRReports({ isTab }) {
  const [activeTab, setActiveTab] = useState("completion");

  const tabs = [
    { key: "dashboard", label: "Dashboard" },
    { key: "completion", label: "Course Completion" },
    { key: "certification", label: "Certification Report" },
    { key: "skillgap", label: "Skill Gap" },
  ];

  const content = (
    <>
      <div className="mb-6 border-b border-gray-200">
        <div className="flex gap-1 overflow-x-auto">
          {tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => setActiveTab(t.key)}
              className={`px-4 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
                activeTab === t.key
                  ? "border-blue-600 text-blue-600"
                  : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {activeTab === "dashboard" && <DashboardTab />}
      {activeTab === "completion" && <CompletionTab />}
      {activeTab === "certification" && <CertificationTab />}
      {activeTab === "skillgap" && <SkillGapTab />}
    </>
  );

  if (isTab) {
    return content;
  }

  return (
    <HRPage title="Reports & Analytics" subtitle="Course completion, certification, and skill gap reports.">
      {content}
    </HRPage>
  );
}
