import { useState, useEffect, useMemo } from "react";
import { NavLink } from "react-router-dom";
import { TrendingUp, Calendar, CheckCircle, XCircle, Download } from "lucide-react";
import HRPage from "../../../components/HRPage";
import { getLeaveStatistics } from "../../../service/hrService";

const NAV_ITEMS = [
  { label: "Dashboard", href: "/zoiko-hr/leave" },
  { label: "Requests", href: "/zoiko-hr/leave/requests" },
  { label: "Calendar", href: "/zoiko-hr/leave/calendar" },
  { label: "Reports", href: "/zoiko-hr/leave/reports" },
];

const typeColors = {
  annual: "bg-blue-500", sick: "bg-pink-500", casual: "bg-orange-500", earned: "bg-teal-500",
  maternity: "bg-purple-500", paternity: "bg-indigo-500", unpaid: "bg-gray-500", study: "bg-cyan-500", emergency: "bg-red-500",
};

function SubNav() {
  return (
    <div className="flex gap-1 overflow-x-auto pb-1 mb-6 border-b border-gray-100">
      {NAV_ITEMS.map((item) => (
        <NavLink key={item.href} to={item.href} end={item.href === "/zoiko-hr/leave"}
          className={({ isActive }) =>
            `whitespace-nowrap px-3 py-2 text-sm font-medium rounded-t-lg transition-colors ${
              isActive ? "text-teal-600 border-b-2 border-teal-600 bg-teal-50/50" : "text-gray-500 hover:text-gray-700 hover:bg-gray-50"
            }`
          }>
          {item.label}
        </NavLink>
      ))}
    </div>
  );
}

function StatCard({ title, value, icon: Icon, change, trend }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm text-gray-500 font-medium">{title}</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{value}</p>
        </div>
        {Icon && <div className="p-2 bg-teal-50 rounded-lg"><Icon className="w-5 h-5 text-teal-600" /></div>}
      </div>
    </div>
  );
}

export default function LeaveReports() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    getLeaveStatistics()
      .then((data) => { if (mounted) setStats(data); })
      .catch(() => {})
      .finally(() => { if (mounted) setLoading(false); });
    return () => { mounted = false; };
  }, []);

  const reportData = useMemo(() => {
    if (!stats) return null;
    return {
      totalRequests: stats.total_requests || 0,
      approvalRate: stats.approval_rate || 0,
      avgDays: stats.average_days_per_request || "0",
      rejected: (stats.total_requests || 0) - (stats.approval_rate ? Math.round((stats.approval_rate / 100) * stats.total_requests) : 0),
      typeDistribution: Array.isArray(stats.leave_type_breakdown) ? stats.leave_type_breakdown.map((t) => ({ type: t.type, count: t.count })) : [],
      monthlyTrend: Array.isArray(stats.monthly_trend) ? stats.monthly_trend.map((m) => ({
        month: new Date(m.year, m.month - 1).toLocaleString("en-US", { month: "short" }),
        requests: m.count,
        approved: m.count,
      })) : [],
    };
  }, [stats]);

  const statCards = reportData ? [
    { title: "Total Requests", value: reportData.totalRequests, icon: Calendar },
    { title: "Approval Rate", value: `${reportData.approvalRate}%`, icon: CheckCircle },
    { title: "Avg Days/Request", value: reportData.avgDays, icon: TrendingUp },
    { title: "Rejected", value: reportData.rejected, icon: XCircle },
  ] : [];

  const maxMonthly = reportData ? Math.max(...reportData.monthlyTrend.map((m) => m.requests), 1) : 1;
  const maxTypeCount = reportData ? Math.max(...reportData.typeDistribution.map((t) => t.count), 1) : 1;

  const handleExport = () => {
    if (!reportData) return;
    let csv = "Leave Type,Requests\n";
    reportData.typeDistribution.forEach((d) => { csv += `${d.type},${d.count}\n`; });
    csv += "\nMonth,Requests\n";
    reportData.monthlyTrend.forEach((m) => { csv += `${m.month},${m.requests}\n`; });
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "leave_report.csv";
    document.body.appendChild(a); a.click();
    document.body.removeChild(a); URL.revokeObjectURL(url);
  };

  if (loading) {
    return (
      <HRPage title="Leave Reports" subtitle="Analytics and insights on leave utilization">
        <SubNav />
        <div className="flex justify-center items-center py-20">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-teal-600"></div>
          <span className="ml-3 text-gray-500">Loading reports...</span>
        </div>
      </HRPage>
    );
  }

  return (
    <HRPage title="Leave Reports" subtitle="Analytics and insights on leave utilization">
      <SubNav />
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Leave Reports</h1>
            <p className="text-sm text-gray-500 mt-1">Analytics and insights on leave utilization</p>
          </div>
          <button onClick={handleExport} className="flex items-center gap-2 px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors text-sm font-medium">
            <Download className="w-4 h-4" /> Export Report
          </button>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {statCards.map((s) => <StatCard key={s.title} {...s} />)}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {reportData && reportData.typeDistribution.length > 0 && (
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Leave Type Distribution</h2>
            <div className="overflow-x-auto rounded-lg border border-gray-200">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Leave Type</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Requests</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-100">
                  {reportData.typeDistribution.map((d, i) => (
                    <tr key={d.type + i} className="hover:bg-teal-50/50 transition-colors">
                      <td className="px-4 py-3 text-sm font-medium text-gray-900 capitalize">{d.type}</td>
                      <td className="px-4 py-3 text-sm text-gray-700">{d.count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          )}

          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Monthly Trend</h2>
            <div className="flex items-end gap-2 h-40">
              {reportData && reportData.monthlyTrend.map((m) => (
                <div key={m.month} className="flex-1 flex flex-col items-center gap-1">
                  <div className="w-full flex flex-col items-center justify-end h-full">
                    <div className="w-full bg-green-400 rounded-t" style={{ height: `${(m.approved / maxMonthly) * 100}%`, minHeight: m.approved > 0 ? "4px" : "0" }} />
                    <div className="w-full bg-amber-400 rounded-t" style={{ height: `${((m.requests - m.approved) / maxMonthly) * 100}%`, minHeight: m.requests - m.approved > 0 ? "4px" : "0" }} />
                  </div>
                  <span className="text-xs text-gray-500">{m.month}</span>
                </div>
              ))}
            </div>
            <div className="flex items-center gap-4 mt-3 text-xs text-gray-500">
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-green-400" /> Approved</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-400" /> Pending/Rejected</span>
            </div>
          </div>
        </div>

      </div>
    </HRPage>
  );
}
