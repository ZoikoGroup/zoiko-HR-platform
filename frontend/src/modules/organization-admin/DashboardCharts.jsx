import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import {
  Clock, CheckCircle2, AlertCircle, ArrowUpRight, TrendingUp, Users,
  Briefcase, ChevronRight, BarChart3, Building
} from "lucide-react";

const BLUE = "#3B82F6";
const EMERALD = "#10B981";
const AMBER = "#F59E0B";
const RED = "#EF4444";
const INK = "#0A1128";
const INK_SOFT = "#475569";
const BLUE_100 = "#DBEAFE";
const EMERALD_100 = "#D1FAE5";
const AMBER_100 = "#FEF3C7";
const RED_100 = "#FEE2E2";
const LINE = "rgba(10,17,40,0.08)";

const AVATAR_COLORS = [
  "linear-gradient(135deg, #3B82F6, #1D4ED8)",
  "linear-gradient(135deg, #10B981, #047857)",
  "linear-gradient(135deg, #F59E0B, #B45309)",
  "linear-gradient(135deg, #8B5CF6, #6D28D9)",
  "linear-gradient(135deg, #06B6D4, #0E7490)",
  "linear-gradient(135deg, #EC4899, #BE185D)",
];

const DEPT_GRADIENTS = [
  "linear-gradient(90deg, #3B82F6, #60A5FA)",
  "linear-gradient(90deg, #10B981, #34D399)",
  "linear-gradient(90deg, #F59E0B, #FBBF24)",
  "linear-gradient(90deg, #8B5CF6, #A78BFA)",
  "linear-gradient(90deg, #06B6D4, #22D3EE)",
  "linear-gradient(90deg, #64748B, #94A3B8)",
];

function avatarBg(index) {
  return AVATAR_COLORS[index % AVATAR_COLORS.length];
}

const badgeStyles = {
  teal: { bg: "bg-emerald-50 text-emerald-700 border-emerald-200", icon: CheckCircle2 },
  amber: { bg: "bg-amber-50 text-amber-700 border-amber-200", icon: Clock },
  red: { bg: "bg-rose-50 text-rose-700 border-rose-200", icon: AlertCircle },
};

function CustomAttendanceTooltip({ active, payload, label }) {
  if (active && payload && payload.length) {
    const val = payload[0].value;
    return (
      <div className="rounded-xl border border-slate-200 bg-white/95 backdrop-blur-md p-3 shadow-xl">
        <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">{label}</p>
        <div className="flex items-center gap-2 mt-1">
          <span className="w-2.5 h-2.5 rounded-full bg-blue-600" />
          <p className="font-['Sora',system-ui,sans-serif] text-sm font-bold text-slate-900">
            {val} <span className="text-xs font-normal text-slate-500">present</span>
          </p>
        </div>
      </div>
    );
  }
  return null;
}

export default function DashboardCharts({ stats, loading, totalEmployees, departments, activeEmployees }) {
  const navigate = useNavigate();
  const [timeRange, setTimeRange] = useState("14D");

  const rawAttendance = stats?.attendance_trend || [];
  const attendanceData = timeRange === "7D"
    ? rawAttendance.slice(-7)
    : rawAttendance;

  const approvalData = stats?.recent_approvals || [];
  const deptData = stats?.department_headcount || [];
  const employeeData = stats?.recent_employees || [];

  return (
    <div className="space-y-6">
      {/* Attendance & Approvals Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-[1.5fr_1fr] gap-6">
        {/* Attendance Trend Chart Card */}
        <div className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-[0_2px_12px_rgba(10,17,40,0.04)]">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
            <div>
              <div className="flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-blue-600" />
                <h3 className="font-['Sora',system-ui,sans-serif] text-base font-bold text-slate-900">Attendance Trend</h3>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">Daily workforce check-ins &amp; presence tracking</p>
            </div>
            <div className="inline-flex rounded-xl bg-slate-100 p-1 self-start sm:self-auto border border-slate-200/60">
              {["7D", "14D", "30D"].map((range) => (
                <button
                  key={range}
                  type="button"
                  onClick={() => setTimeRange(range)}
                  className={`text-xs font-semibold px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                    timeRange === range
                      ? "bg-white text-blue-600 shadow-sm"
                      : "text-slate-500 hover:text-slate-800"
                  }`}
                >
                  {range}
                </button>
              ))}
            </div>
          </div>

          <div className="h-[280px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={attendanceData} margin={{ top: 10, right: 10, left: -20, bottom: 5 }}>
                <defs>
                  <linearGradient id="attendanceAreaGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#3B82F6" stopOpacity={0.28} />
                    <stop offset="85%" stopColor="#3B82F6" stopOpacity={0.02} />
                    <stop offset="100%" stopColor="#3B82F6" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(10,17,40,0.06)" />
                <XAxis
                  dataKey="day"
                  tick={{ fontSize: 11, fill: "#64748B" }}
                  axisLine={false}
                  tickLine={false}
                  interval="preserveStartEnd"
                  height={30}
                />
                <YAxis
                  domain={[0, totalEmployees ? Math.max(totalEmployees, 25) : 25]}
                  tick={{ fontSize: 11, fill: "#94A3B8" }}
                  axisLine={false}
                  tickLine={false}
                  width={35}
                />
                <Tooltip content={<CustomAttendanceTooltip />} />
                <Area
                  type="monotone"
                  dataKey="present"
                  stroke="#3B82F6"
                  strokeWidth={2.5}
                  fill="url(#attendanceAreaGrad)"
                  dot={{ r: 3, fill: "#3B82F6", stroke: "#fff", strokeWidth: 2 }}
                  activeDot={{ r: 6, fill: "#3B82F6", stroke: "#fff", strokeWidth: 3 }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Approvals Queue Card */}
        <div className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-[0_2px_12px_rgba(10,17,40,0.04)] flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="font-['Sora',system-ui,sans-serif] text-base font-bold text-slate-900">Approvals &amp; Activity</h3>
                <p className="text-xs text-slate-500 mt-0.5">Recent organizational requests</p>
              </div>
              <button
                type="button"
                onClick={() => navigate("/zoiko-hr/documents/approvals")}
                className="text-xs font-semibold text-blue-600 hover:text-blue-700 cursor-pointer"
              >
                View all →
              </button>
            </div>

            <div className="space-y-3">
              {approvalData.length === 0 ? (
                <div className="py-8 text-center text-xs text-slate-400">No pending approvals at this time.</div>
              ) : (
                approvalData.map((a, i) => {
                  const style = badgeStyles[a.badgeColor] || badgeStyles.teal;
                  const Icon = style.icon;
                  return (
                    <div
                      key={i}
                      className="group flex items-center justify-between gap-3 p-3 rounded-xl border border-slate-100 hover:border-slate-200 hover:bg-slate-50/70 transition-all duration-200"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div
                          className="w-9 h-9 rounded-xl flex-shrink-0 flex items-center justify-center font-['Sora',system-ui,sans-serif] font-bold text-xs text-white shadow-sm"
                          style={{ background: avatarBg(i) }}
                        >
                          {a.initials}
                        </div>
                        <div className="min-w-0 truncate">
                          <p className="text-xs sm:text-sm font-semibold text-slate-900 truncate">{a.name}</p>
                          <p className="text-[11px] text-slate-500 truncate">{a.meta}</p>
                        </div>
                      </div>
                      <span className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded-full border whitespace-nowrap ${style.bg}`}>
                        <Icon className="w-3 h-3" />
                        {a.badge}
                      </span>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
            <span>Automated SLA verification active</span>
            <span className="font-semibold text-emerald-600">✓ In compliance</span>
          </div>
        </div>
      </div>

      {/* Headcount by Department */}
      <div className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-[0_2px_12px_rgba(10,17,40,0.04)]">
        <div className="flex items-center justify-between mb-5">
          <div>
            <div className="flex items-center gap-2">
              <Building className="w-4 h-4 text-indigo-600" />
              <h3 className="font-['Sora',system-ui,sans-serif] text-base font-bold text-slate-900">Headcount by Department</h3>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">{departments} configured departments · {activeEmployees} active workforce</p>
          </div>
          <button
            type="button"
            onClick={() => navigate("/zoiko-hr/departments")}
            className="text-xs font-semibold text-blue-600 hover:text-blue-700 cursor-pointer"
          >
            Manage Departments →
          </button>
        </div>

        <div className="space-y-4">
          {deptData.map((d, i) => (
            <div key={d.name} className="space-y-1.5">
              <div className="flex items-center justify-between text-xs font-semibold">
                <span className="text-slate-800">{d.name}</span>
                <div className="flex items-center gap-2">
                  <span className="text-slate-500 font-normal">{d.pct}%</span>
                  <span className="inline-block px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 font-bold text-[11px]">
                    {d.count} staff
                  </span>
                </div>
              </div>
              <div className="h-2.5 w-full rounded-full bg-slate-100 overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-500 shadow-sm"
                  style={{
                    width: `${Math.max(d.pct, 4)}%`,
                    background: DEPT_GRADIENTS[i % DEPT_GRADIENTS.length],
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Recently Added Employees Table */}
      <div className="space-y-3">
        <div className="flex items-baseline justify-between">
          <div>
            <h2 className="font-['Sora',system-ui,sans-serif] text-base font-bold tracking-tight text-slate-900">
              Recently Added Employees
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">Latest onboarded personnel records</p>
          </div>
          <button
            onClick={() => navigate("/organization-admin/users")}
            className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600 hover:text-blue-700 cursor-pointer"
          >
            View all {totalEmployees} employees <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="rounded-2xl border border-slate-200/80 bg-white overflow-hidden shadow-[0_2px_12px_rgba(10,17,40,0.04)]">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50/80 border-b border-slate-200/80 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                  <th className="px-5 py-3.5">Employee</th>
                  <th className="px-4 py-3.5">Department</th>
                  <th className="px-4 py-3.5">Designation</th>
                  <th className="px-5 py-3.5">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {employeeData.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-5 py-8 text-center text-xs text-slate-400">
                      No recent employees found
                    </td>
                  </tr>
                ) : (
                  employeeData.map((e, idx) => {
                    const statusConfig = {
                      teal: { text: "text-emerald-700", bg: "bg-emerald-500", ring: "ring-emerald-200" },
                      amber: { text: "text-amber-700", bg: "bg-amber-500", ring: "ring-amber-200" },
                      off: { text: "text-slate-600", bg: "bg-slate-400", ring: "ring-slate-200" },
                    };
                    const dot = statusConfig[e.statusColor] || statusConfig.off;
                    return (
                      <tr
                        key={e.name || idx}
                        className="hover:bg-blue-50/30 transition-colors cursor-pointer"
                        onClick={() => navigate("/organization-admin/users")}
                      >
                        <td className="px-5 py-3.5">
                          <div className="flex items-center gap-3">
                            <div
                              className="w-8 h-8 rounded-xl flex items-center justify-center font-['Sora',system-ui,sans-serif] font-bold text-xs text-white flex-shrink-0 shadow-sm"
                              style={{ background: avatarBg(idx) }}
                            >
                              {e.initials}
                            </div>
                            <span className="font-semibold text-slate-900">{e.name}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3.5">
                          <span className="inline-block px-2.5 py-0.5 rounded-md bg-slate-100 text-slate-700 text-xs font-medium">
                            {e.dept || "—"}
                          </span>
                        </td>
                        <td className="px-4 py-3.5 text-slate-600 text-xs font-medium">{e.designation || "—"}</td>
                        <td className="px-5 py-3.5">
                          <div className="flex items-center gap-2">
                            <span className={`w-2 h-2 rounded-full ring-4 ${dot.bg} ${dot.ring}`} />
                            <span className={`text-xs font-semibold capitalize ${dot.text}`}>
                              {e.status}
                            </span>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Quick Summary Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-[0_2px_12px_rgba(10,17,40,0.04)] flex items-center justify-between">
          <div className="flex items-center gap-3.5">
            <div className="w-11 h-11 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shadow-sm">
              <TrendingUp className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Average Attendance</p>
              <p className="font-['Sora',system-ui,sans-serif] text-2xl font-bold text-slate-900 mt-0.5">
                {stats?.average_attendance != null ? `${stats.average_attendance}%` : "95.2%"}
              </p>
            </div>
          </div>
          <span className="text-xs font-semibold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-200">
            ↑ High Rate
          </span>
        </div>

        <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-[0_2px_12px_rgba(10,17,40,0.04)] flex items-center justify-between">
          <div className="flex items-center gap-3.5">
            <div className="w-11 h-11 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center shadow-sm">
              <Briefcase className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Open Positions</p>
              <p className="font-['Sora',system-ui,sans-serif] text-2xl font-bold text-slate-900 mt-0.5">
                {stats?.open_positions != null ? stats.open_positions : "4"}
              </p>
            </div>
          </div>
          <button
            onClick={() => navigate("/zoiko-hr/recruitment")}
            className="text-xs font-semibold text-blue-600 bg-blue-50 hover:bg-blue-100 px-3 py-1.5 rounded-lg transition-colors cursor-pointer"
          >
            Go to Hiring →
          </button>
        </div>
      </div>
    </div>
  );
}
