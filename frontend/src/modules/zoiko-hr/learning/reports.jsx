import { useState, useEffect, useMemo } from "react";
import HRPage from "../../../components/HRPage";
import {
  getCourseCompletionReport,
  getCertificationReport,
  getSkillGapAnalysis,
  exportCourseCompletionReportCsv,
  exportCourseCompletionReportExcel,
  exportCertificationReportCsv,
  exportCertificationReportExcel,
  exportSkillGapReportCsv,
  exportSkillGapReportExcel,
} from "../../../service/hrService";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";

const ITEMS_PER_PAGE = 10;

// CSV / Excel export buttons: each shows that it is working, and a failed download (expired session, no permission,
// server error) is reported on the page instead of failing silently (audit L11).
export function ExportButtons({ onCsv, onExcel }) {
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const run = async (kind, fn) => {
    if (busy) return;
    setBusy(kind);
    setError("");
    try {
      await fn();
    } catch (err) {
      setError(err?.message || "The report could not be downloaded. Try again.");
    } finally {
      setBusy("");
    }
  };
  return (
    <div className="flex flex-col items-end gap-1 ml-auto">
      <div className="flex gap-2">
        <button
          onClick={() => run("csv", onCsv)}
          disabled={!!busy}
          className="border border-gray-200 dark:border-[#334155] hover:bg-gray-50 dark:hover:bg-[#0f172a] disabled:opacity-60 text-gray-700 dark:text-[#e2e8f0] text-sm font-medium px-4 py-2 rounded-lg transition-colors flex items-center gap-1.5"
        >
          <span>📥</span> {busy === "csv" ? "Exporting..." : "Export CSV"}
        </button>
        <button
          onClick={() => run("excel", onExcel)}
          disabled={!!busy}
          className="bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors flex items-center gap-1.5"
        >
          <span>📊</span> {busy === "excel" ? "Exporting..." : "Export Excel"}
        </button>
      </div>
      {error && <p role="alert" className="text-xs text-red-600">{error}</p>}
    </div>
  );
}

/** The enrollment period the dashboard tab can be limited to, as the report's start / end dates (audit L12). */
export const PERIODS = [
  { key: "all", label: "All time" },
  { key: "30d", label: "Last 30 days" },
  { key: "90d", label: "Last 90 days" },
  { key: "12m", label: "Last 12 months" },
  { key: "year", label: "This year" },
];

const isoDay = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export function periodParams(key, today = new Date()) {
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  if (key === "30d") start.setDate(start.getDate() - 29);
  else if (key === "90d") start.setDate(start.getDate() - 89);
  else if (key === "12m") start.setFullYear(start.getFullYear() - 1);
  else if (key === "year") start.setMonth(0, 1);
  else return {};
  return { start_date: isoDay(start), end_date: isoDay(today) };
}

function DashboardTab() {
  const [report, setReport] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [period, setPeriod] = useState("all");

  const fetchData = async (key) => {
    setLoading(true);
    setError(null);
    try {
      const reportRes = await getCourseCompletionReport(periodParams(key));
      setReport(Array.isArray(reportRes) ? reportRes : []);
    } catch (err) {
      setError(err.message || "Failed to load report data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(period); }, [period]); // eslint-disable-line react-hooks/exhaustive-deps

  const chartData = useMemo(() => {
    return [...report]
      .sort((a, b) => (b.total_enrollments || 0) - (a.total_enrollments || 0))
      .slice(0, 10)
      .map((r) => ({
        name: r.course_name || "Course",
        rate: Number(parseFloat(r.completion_rate || 0).toFixed(1)),
        enrolled: r.total_enrollments || 0,
        completed: r.completed || 0,
      }));
  }, [report]);

  const totals = useMemo(() => {
    const enrolled = report.reduce((s, r) => s + (r.total_enrollments || 0), 0);
    const completed = report.reduce((s, r) => s + (r.completed || 0), 0);
    return { enrolled, completed, rate: enrolled ? ((completed / enrolled) * 100).toFixed(1) : "0.0" };
  }, [report]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <label htmlFor="report-period" className="text-sm font-medium text-gray-600 dark:text-[#cbd5e1]">Enrollments made:</label>
          <select
            id="report-period"
            value={period}
            onChange={(e) => setPeriod(e.target.value)}
            className="border border-gray-200 dark:border-[#334155] dark:bg-[#0f172a] dark:text-[#f1f5f9] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {PERIODS.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
          </select>
        </div>
        {/* the server's exports: the same period, every course, a real .xlsx, cells quoted and formula-safe */}
        <ExportButtons onCsv={() => exportCourseCompletionReportCsv(periodParams(period))} onExcel={() => exportCourseCompletionReportExcel(periodParams(period))} />
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div></div>
      ) : error ? (
        <div role="alert" className="px-4 py-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 rounded-lg">{error}</div>
      ) : report.length === 0 ? (
        <div className="text-center py-16 bg-white dark:bg-[#1e293b] rounded-xl border border-gray-100 dark:border-[#334155] shadow-sm">
          <p className="text-gray-500 dark:text-[#94a3b8] font-medium">No data available for charts.</p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-white dark:bg-[#1e293b] rounded-xl border border-gray-100 dark:border-[#334155] shadow-sm p-4">
              <p className="text-xs text-gray-500 dark:text-[#94a3b8] font-medium uppercase tracking-wide">Total Courses</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-[#f1f5f9] mt-1" data-testid="total-courses">{report.length}</p>
            </div>
            <div className="bg-white dark:bg-[#1e293b] rounded-xl border border-gray-100 dark:border-[#334155] shadow-sm p-4">
              <p className="text-xs text-gray-500 dark:text-[#94a3b8] font-medium uppercase tracking-wide">Enrollments in Period</p>
              <p className="text-2xl font-bold text-blue-600 mt-1" data-testid="total-enrollments">{totals.enrolled}</p>
            </div>
            <div className="bg-white dark:bg-[#1e293b] rounded-xl border border-gray-100 dark:border-[#334155] shadow-sm p-4">
              <p className="text-xs text-gray-500 dark:text-[#94a3b8] font-medium uppercase tracking-wide">Overall Completion</p>
              <p className="text-2xl font-bold text-emerald-600 mt-1" data-testid="overall-completion">{totals.rate}%</p>
            </div>
          </div>

          <div className="bg-white dark:bg-[#1e293b] rounded-xl border border-gray-100 dark:border-[#334155] shadow-sm p-6">
            <h3 className="text-sm font-bold text-gray-800 dark:text-[#f1f5f9] mb-4">Completion Rate of the Most Enrolled Courses</h3>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={chartData} margin={{ top: 5, right: 20, left: 0, bottom: 60 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#94a3b833" />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} angle={-20} textAnchor="end" interval={0} height={60} />
                <YAxis unit="%" tick={{ fontSize: 12 }} />
                <Tooltip formatter={(value) => `${value}%`} />
                <Bar dataKey="rate" fill="#3b82f6" radius={[4, 4, 0, 0]} name="Completion Rate" />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="bg-white dark:bg-[#1e293b] rounded-xl border border-gray-100 dark:border-[#334155] shadow-sm p-6">
            <h3 className="text-sm font-bold text-gray-800 dark:text-[#f1f5f9] mb-4">Enrollment vs Completion</h3>
            <div className="space-y-3">
              {chartData.slice(0, 5).map((r) => (
                <div key={r.name}>
                  <div className="flex justify-between text-xs text-gray-600 dark:text-[#cbd5e1] mb-1">
                    <span className="font-medium truncate max-w-[200px]">{r.name}</span>
                    <span>{r.completed}/{r.enrolled}</span>
                  </div>
                  <div className="flex gap-1">
                    <div className="flex-1 bg-gray-100 dark:bg-[#0f172a] rounded-full h-2.5 overflow-hidden">
                      <div className="h-full bg-blue-500 rounded-full transition-all" style={{ width: `${Math.min(r.rate, 100)}%` }} />
                    </div>
                    <span className="text-xs font-medium text-gray-500 dark:text-[#94a3b8] w-10 text-right">{r.rate}%</span>
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
    return <div className="mb-4 px-4 py-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 rounded-lg">{error}</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3">
        <div className="bg-white dark:bg-[#1e293b] px-4 py-2 border border-gray-100 dark:border-[#334155] rounded-lg shadow-sm text-sm">
          <span className="text-gray-400 dark:text-[#94a3b8]">Total Courses: </span>
          <span className="font-bold text-gray-800 dark:text-[#f1f5f9]">{stats.total}</span>
        </div>
        <div className="bg-white dark:bg-[#1e293b] px-4 py-2 border border-blue-100 rounded-lg shadow-sm text-sm">
          <span className="text-gray-400 dark:text-[#94a3b8]">Avg Completion Rate: </span>
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
            className="border border-gray-200 dark:border-[#334155] rounded-lg px-3 py-2 text-sm w-64 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-[#0f172a] dark:text-[#f1f5f9]"
          />
        )}
        <ExportButtons onCsv={exportCourseCompletionReportCsv} onExcel={exportCourseCompletionReportExcel} />
      </div>
      {filtered.length === 0 ? (
        <div className="text-center py-16 bg-white dark:bg-[#1e293b] rounded-xl border border-gray-100 dark:border-[#334155] shadow-sm">
          <p className="text-gray-500 dark:text-[#94a3b8] font-medium">
            {data.length === 0 ? "No course completion data available." : "No matches."}
          </p>
        </div>
      ) : (
        <>
          <div className="bg-white dark:bg-[#1e293b] rounded-xl border border-gray-100 dark:border-[#334155] shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 dark:bg-[#0f172a] border-b border-gray-100 dark:border-[#334155]">
                  <tr>
                    <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-[#cbd5e1]">Course</th>
                    <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-[#cbd5e1]">Total Enrollments</th>
                    <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-[#cbd5e1]">Completed</th>
                    <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-[#cbd5e1]">Completion Rate</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50 dark:divide-[#334155]">
                  {paginated.map((r, i) => (
                    <tr key={r.course_id || i} className="hover:bg-gray-50 dark:hover:bg-[#0f172a] transition-colors">
                      <td className="px-4 py-3 font-medium text-gray-800 dark:text-[#f1f5f9]">{r.course_name || r.course || `#${r.course_id}`}</td>
                      <td className="px-4 py-3 text-gray-700 dark:text-[#e2e8f0]">{r.total_enrollments ?? "-"}</td>
                      <td className="px-4 py-3 text-gray-700 dark:text-[#e2e8f0]">{r.completed ?? "-"}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="w-20 bg-gray-200 dark:bg-[#334155] rounded-full h-2">
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
              <span className="text-xs text-gray-400 dark:text-[#94a3b8]">
                Showing {(safePage - 1) * ITEMS_PER_PAGE + 1}-{Math.min(safePage * ITEMS_PER_PAGE, filtered.length)} of {filtered.length}
              </span>
              <div className="flex gap-1">
                <button onClick={() => setCurrentPage((p) => Math.max(1, p - 1))} disabled={safePage <= 1} className="px-3 py-1 text-sm border border-gray-200 dark:border-[#334155] rounded-lg disabled:opacity-40 hover:bg-gray-50 dark:hover:bg-[#0f172a]">Prev</button>
                {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
                  <button key={p} onClick={() => setCurrentPage(p)} className={`px-3 py-1 text-sm border rounded-lg ${p === safePage ? "bg-blue-600 text-white border-blue-600" : "border-gray-200 dark:border-[#334155] hover:bg-gray-50 dark:hover:bg-[#0f172a]"}`}>{p}</button>
                ))}
                <button onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))} disabled={safePage >= totalPages} className="px-3 py-1 text-sm border border-gray-200 dark:border-[#334155] rounded-lg disabled:opacity-40 hover:bg-gray-50 dark:hover:bg-[#0f172a]">Next</button>
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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      // each row names its holder (any role, including people who have left), so no separate people list is loaded
      const res = await getCertificationReport();
      setData(Array.isArray(res) ? res : []);
    } catch (err) {
      setError(err.message || "Failed to load certification report");
      setData([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  const getCertRowStyle = (expiry) => {
    if (!expiry) return "";
    const daysLeft = Math.ceil((new Date(expiry) - new Date()) / (1000 * 60 * 60 * 24));
    if (daysLeft < 0) return "bg-red-50 dark:bg-red-900/20";
    if (daysLeft < 30) return "bg-yellow-50";
    return "";
  };

  const getDaysLeft = (expiry) => {
    if (!expiry) return null;
    return Math.ceil((new Date(expiry) - new Date()) / (1000 * 60 * 60 * 24));
  };

  const getStatusBadge = (expiry) => {
    if (!expiry) return <span className="inline-block px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800 dark:text-green-300">Valid</span>;
    const days = getDaysLeft(expiry);
    if (days < 0) return <span className="inline-block px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">Expired</span>;
    if (days < 30) return <span className="inline-block px-2 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">{days}d left</span>;
    return <span className="inline-block px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800 dark:text-green-300">Valid</span>;
  };

  if (loading) {
    return <div className="flex justify-center py-16"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div></div>;
  }

  if (error) {
    return <div className="mb-4 px-4 py-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 rounded-lg">{error}</div>;
  }

  return (
    <div className="space-y-4">
      {data.length > 0 && (
        <div className="flex justify-end">
          <ExportButtons onCsv={exportCertificationReportCsv} onExcel={exportCertificationReportExcel} />
        </div>
      )}
      {data.length === 0 ? (
        <div className="text-center py-16 bg-white dark:bg-[#1e293b] rounded-xl border border-gray-100 dark:border-[#334155] shadow-sm">
          <p className="text-gray-500 dark:text-[#94a3b8] font-medium">No certification data available.</p>
        </div>
      ) : (
        <div className="bg-white dark:bg-[#1e293b] rounded-xl border border-gray-100 dark:border-[#334155] shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 dark:bg-[#0f172a] border-b border-gray-100 dark:border-[#334155]">
                <tr>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-[#cbd5e1]">Certification</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-[#cbd5e1]">Employee</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-[#cbd5e1]">Issued</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-[#cbd5e1]">Expiry</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-[#cbd5e1]">Days Left</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-[#cbd5e1]">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50 dark:divide-[#334155]">
                {data.map((c, i) => {
                  const empName = c.employee_name || `Employee #${c.employee_id}`;
                  return (
                    <tr key={c.id || i} className={`hover:bg-gray-50 dark:hover:bg-[#0f172a] transition-colors ${getCertRowStyle(c.expiry_date)}`}>
                      <td className="px-4 py-3 font-medium text-gray-800 dark:text-[#f1f5f9]">{c.certification_name || c.name}</td>
                      <td className="px-4 py-3 text-gray-700 dark:text-[#e2e8f0]">{empName}</td>
                      <td className="px-4 py-3 text-xs text-gray-500 dark:text-[#94a3b8]">{c.issue_date || c.issued_date || c.issued}</td>
                      <td className="px-4 py-3 text-xs text-gray-500 dark:text-[#94a3b8]">{c.expiry_date || c.expiry || <span className="text-gray-300 dark:text-[#475569]">-</span>}</td>
                      <td className="px-4 py-3 text-xs text-gray-500 dark:text-[#94a3b8]">
                        {c.expiry_date ? (
                          <span className={getDaysLeft(c.expiry_date) < 0 ? "text-red-600 font-medium" : getDaysLeft(c.expiry_date) < 30 ? "text-yellow-600 font-medium" : ""}>
                            {getDaysLeft(c.expiry_date)}
                          </span>
                        ) : <span className="text-gray-300 dark:text-[#475569]">-</span>}
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
    return <div className="mb-4 px-4 py-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 rounded-lg">{error}</div>;
  }

  if (data.length === 0) {
    return (
      <div className="text-center py-16 bg-white dark:bg-[#1e293b] rounded-xl border border-gray-100 dark:border-[#334155] shadow-sm">
        <p className="text-gray-500 dark:text-[#94a3b8] font-medium">No skill gap data available.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {data.length > 0 && (
        <div className="flex justify-end">
          <ExportButtons onCsv={exportSkillGapReportCsv} onExcel={exportSkillGapReportExcel} />
        </div>
      )}
      {data.map((dept, i) => (
        <div key={dept.department_id || i} className="bg-white dark:bg-[#1e293b] rounded-xl border border-gray-100 dark:border-[#334155] shadow-sm overflow-hidden">
          <div className="px-4 py-3 bg-gray-50 dark:bg-[#0f172a] border-b border-gray-100 dark:border-[#334155]">
            <h3 className="text-sm font-semibold text-gray-800 dark:text-[#f1f5f9]">{dept.department_name || dept.department || `#${dept.department_id}`}</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 dark:bg-[#0f172a] border-b border-gray-100 dark:border-[#334155]">
                <tr>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-[#cbd5e1]">Skill</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-[#cbd5e1]">Employee Count</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-[#cbd5e1]">Gap Level</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50 dark:divide-[#334155]">
                {(Array.isArray(dept.skills) ? dept.skills : []).map((skill, j) => (
                  <tr key={skill.skill_id || skill.skill_name || j} className="hover:bg-gray-50 dark:hover:bg-[#0f172a] transition-colors">
                    <td className="px-4 py-3 font-medium text-gray-700 dark:text-[#e2e8f0]">{skill.skill_name || skill.skill}</td>
                    <td className="px-4 py-3 text-gray-700 dark:text-[#e2e8f0]">{skill.employee_count ?? skill.count ?? "-"}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${
                        skill.gap_level === "high" ? "bg-red-100 text-red-800" :
                        skill.gap_level === "medium" ? "bg-yellow-100 text-yellow-800" :
                        "bg-green-100 text-green-800 dark:text-green-300"
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
      <div className="mb-6 border-b border-gray-200 dark:border-[#334155]">
        <div className="flex gap-1 overflow-x-auto">
          {tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => setActiveTab(t.key)}
              className={`px-4 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
                activeTab === t.key
                  ? "border-blue-600 text-blue-600"
                  : "border-transparent text-gray-500 dark:text-[#94a3b8] hover:text-gray-700 hover:border-gray-300"
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
