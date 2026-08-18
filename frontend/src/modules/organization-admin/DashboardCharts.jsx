import { useNavigate } from "react-router-dom";
import { LineChart, Line, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

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
  `linear-gradient(135deg,${BLUE},#2563EB)`,
  `linear-gradient(135deg,${EMERALD},#059669)`,
  `linear-gradient(135deg,${AMBER},#D97706)`,
  `linear-gradient(135deg,#94A3B8,#64748B)`,
  `linear-gradient(135deg,#2563EB,${BLUE})`,
  `linear-gradient(135deg,#CBD5E1,#94A3B8)`,
];

function avatarBg(index) {
  return AVATAR_COLORS[index % AVATAR_COLORS.length];
}

const badgeColors = { teal: { bg: EMERALD_100, color: EMERALD }, amber: { bg: AMBER_100, color: AMBER }, red: { bg: RED_100, color: RED } };

export default function DashboardCharts({ stats, loading, totalEmployees, departments, activeEmployees }) {
  const navigate = useNavigate();
  const attendanceData = stats?.attendance_trend || [];
  const approvalData = stats?.recent_approvals || [];
  const deptData = stats?.department_headcount || [];
  const employeeData = stats?.recent_employees || [];

  return (
    <>
      <div className="grid grid-cols-1 lg:grid-cols-[1.5fr_1fr] gap-[18px] mt-1.5">
        <div className="rounded-[20px] border p-6 shadow-[0_1px_2px_rgba(10,17,40,0.04),0_8px_24px_-12px_rgba(10,17,40,0.10)]" style={{ background: "#fff", borderColor: LINE }}>
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-['Sora',system-ui,sans-serif] text-[17px] font-bold" style={{ color: INK }}>Attendance Trend</h3>
              <p className="text-[12.5px] mt-0.5" style={{ color: INK_SOFT }}>Daily check-ins over the last 14 days</p>
            </div>
            <div className="flex gap-1.5 flex-shrink-0">
              <span className="text-[12px] font-semibold px-[12px] py-[5px] rounded-full cursor-pointer" style={{ background: "#F0F4F8", color: INK_SOFT }}>7D</span>
              <span className="text-[12px] font-semibold px-[12px] py-[5px] rounded-full cursor-pointer text-white" style={{ background: BLUE }}>14D</span>
              <span className="text-[12px] font-semibold px-[12px] py-[5px] rounded-full cursor-pointer" style={{ background: "#F0F4F8", color: INK_SOFT }}>30D</span>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={attendanceData} margin={{ top: 10, right: 15, left: -5, bottom: 5 }}>
              <defs>
                <linearGradient id="attGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={BLUE} stopOpacity={0.08} />
                  <stop offset="100%" stopColor={BLUE} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(10,17,40,0.1)" />
              <XAxis dataKey="day" tick={{ fontSize: 10, fill: INK_SOFT }} axisLine={false} tickLine={false} interval={0} angle={-12} textAnchor="end" height={65} />
              <YAxis domain={[0, 21]} tick={{ fontSize: 11, fill: INK_SOFT }} axisLine={false} tickLine={false} width={30} />
              <Tooltip />
              <Area type="monotone" dataKey="present" fill="url(#attGrad)" stroke="none" />
              <Line type="monotone" dataKey="present" stroke={BLUE} strokeWidth={3} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div className="rounded-[20px] border p-6 shadow-[0_1px_2px_rgba(10,17,40,0.04),0_8px_24px_-12px_rgba(10,17,40,0.10)]" style={{ background: "#fff", borderColor: LINE }}>
          <div className="mb-[18px]">
            <h3 className="font-['Sora',system-ui,sans-serif] text-[15px] font-bold" style={{ color: INK }}>Approvals Queue</h3>
            <p className="text-[12px] mt-0.5" style={{ color: INK_SOFT }}>Nothing waiting \u2014 here's recent activity</p>
          </div>
          {approvalData.map((a, i) => (
            <div key={i} className="flex items-center gap-[13px] py-3" style={{ borderBottom: i < approvalData.length - 1 ? `1px solid ${LINE}` : "none" }}>
              <div className="w-[38px] h-[38px] rounded-[10px] flex-shrink-0 flex items-center justify-center font-['Sora',system-ui,sans-serif] font-bold text-[13px] text-white" style={{ background: avatarBg(i) }}>
                {a.initials}
              </div>
              <div>
                <p className="text-[13.5px] font-semibold" style={{ color: INK }}>{a.name}</p>
                <p className="text-[12px] mt-0.5" style={{ color: INK_SOFT }}>{a.meta}</p>
              </div>
              <span className="ml-auto text-[10.5px] font-bold px-[9px] py-1 rounded-full whitespace-nowrap" style={{ background: badgeColors[a.badgeColor]?.bg, color: badgeColors[a.badgeColor]?.color }}>
                {a.badge}
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-[18px]">
        <div className="rounded-[20px] border p-6 shadow-[0_1px_2px_rgba(10,17,40,0.04),0_8px_24px_-12px_rgba(10,17,40,0.10)]" style={{ background: "#fff", borderColor: LINE }}>
          <div className="mb-[18px]">
            <h3 className="font-['Sora',system-ui,sans-serif] text-[15px] font-bold" style={{ color: INK }}>Headcount by Department</h3>
            <p className="text-[12px] mt-0.5" style={{ color: INK_SOFT }}>{departments} departments \u00B7 {activeEmployees} active</p>
          </div>
          {deptData.map((d, i) => {
            const deptColors = [BLUE, AMBER, EMERALD, BLUE, "#94A3B8", "#CBD5E1"];
            return (
              <div key={d.name} className="flex items-center gap-3 mb-[14px] last:mb-0">
                <span className="w-[118px] text-[12.5px] font-semibold flex-shrink-0" style={{ color: INK }}>{d.name}</span>
                <div className="flex-1 h-2 rounded-full overflow-hidden" style={{ background: "#F0F4F8" }}>
                  <div className="h-full rounded-full" style={{ width: `${d.pct}%`, background: deptColors[i % deptColors.length] }} />
                </div>
                <span className="w-[26px] text-right text-[12.5px] font-bold" style={{ color: INK }}>{d.count}</span>
              </div>
            );
          })}
        </div>
      </div>

      <div className="flex items-baseline justify-between mb-[14px] mt-[30px]">
        <h2 className="font-['Sora',system-ui,sans-serif] text-[15.5px] font-bold tracking-[-0.01em]" style={{ color: INK }}>Recently Added Employees</h2>
        <button onClick={() => navigate("/organization-admin/users")} className="text-[12.5px] font-semibold cursor-pointer" style={{ color: BLUE }}>View all {totalEmployees} \u2192</button>
      </div>
        <div className="rounded-[20px] border overflow-hidden shadow-[0_1px_2px_rgba(10,17,40,0.04),0_8px_24px_-12px_rgba(10,17,40,0.10)]" style={{ background: "#fff", borderColor: LINE }}>
        <div className="overflow-x-auto">
          <table className="w-full" style={{ borderCollapse: "collapse" }}>
            <thead>
              <tr>
                {["Employee", "Department", "Designation", "Status"].map((h) => (
                  <th key={h} className="text-left text-[11px] font-bold uppercase tracking-[0.05em] px-[14px] py-[13px]" style={{ color: INK_SOFT, borderBottom: `2px solid ${LINE}` }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {employeeData.length === 0 ? (
                <tr><td colSpan={4} className="px-[14px] py-8 text-center text-[13px]" style={{ color: INK_SOFT }}>No employees found</td></tr>
              ) : employeeData.map((e, idx) => {
                const statusDots = {
                  teal: { bg: EMERALD, shadow: EMERALD_100 },
                  amber: { bg: AMBER, shadow: AMBER_100 },
                  off: { bg: "#94A3B8", shadow: "#F1F5F9" },
                };
                const dot = statusDots[e.statusColor] || statusDots.off;
                return (
                  <tr key={e.name || idx}>
                    <td className="px-[14px] py-[13px] text-[13px]" style={{ borderBottom: `1px solid ${LINE}` }}>
                      <div className="flex items-center gap-2.5">
                        <div className="w-[30px] h-[30px] rounded-[8px] flex items-center justify-center font-['Sora',system-ui,sans-serif] font-bold text-[11.5px] text-white flex-shrink-0" style={{ background: avatarBg(idx) }}>
                          {e.initials}
                        </div>
                        <span>{e.name}</span>
                      </div>
                    </td>
                    <td className="px-[14px] py-[13px] text-[13px]" style={{ borderBottom: `1px solid ${LINE}` }}>{e.dept}</td>
                    <td className="px-[14px] py-[13px] text-[13px]" style={{ borderBottom: `1px solid ${LINE}` }}>{e.designation}</td>
                    <td className="px-[14px] py-[13px] text-[13px]" style={{ borderBottom: `1px solid ${LINE}` }}>
                      <div className="flex items-center gap-1.5">
                        <span className="w-[7px] h-[7px] rounded-full flex-shrink-0" style={{ background: dot.bg, boxShadow: `0 0 0 3px ${dot.shadow}` }} />
                        <span>{e.status}</span>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-[18px]">
        <div className="rounded-[14px] border p-[18px] shadow-[0_1px_2px_rgba(10,17,40,0.04),0_8px_24px_-12px_rgba(10,17,40,0.10)]" style={{ background: "#fff", borderColor: LINE }}>
          <div className="flex justify-between items-center mb-2">
            <span className="text-[12px] font-semibold" style={{ color: INK_SOFT }}>Avg. Attendance</span>
            <span className="text-[12px] font-bold" style={{ color: EMERALD }}>{stats?.average_attendance ? "\u25B2" : "\u2014"}</span>
          </div>
          <p className="text-[20px] font-bold" style={{ color: INK }}>{stats?.average_attendance != null ? `${stats.average_attendance}%` : "\u2014"}</p>
        </div>
        <div className="rounded-[14px] border p-[18px] shadow-[0_1px_2px_rgba(10,17,40,0.04),0_8px_24px_-12px_rgba(10,17,40,0.10)]" style={{ background: "#fff", borderColor: LINE }}>
          <div className="flex justify-between items-center mb-2">
            <span className="text-[12px] font-semibold" style={{ color: INK_SOFT }}>Open Positions</span>
            <span className="text-[12px] font-bold" style={{ color: AMBER }}>{stats?.open_positions != null ? `${stats.open_positions} roles` : "\u2014"}</span>
          </div>
          <p className="text-[20px] font-bold" style={{ color: INK }}>{stats?.open_positions != null ? stats.open_positions : "\u2014"}</p>
        </div>
      </div>
    </>
  );
}
