import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { getOrganizationDashboardStats, getOrganizationDetails } from "../../service/orgAdminService";
import { getLearningDashboard } from "../../service/hrService";
import { getPerformanceDashboard } from "../../service/hrService";
import { getRecruitmentDashboard } from "../../service/hrService";
import { LineChart, Line, BarChart, Bar, PieChart, Pie, Cell, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { Users, Building2, BadgeInfo, CalendarCheck, Activity, CreditCard, Wrench, BookOpen, ClipboardCheck, UserPlus, Clock } from "lucide-react";

const VIOLET = "#5B3FE0";
const AMBER = "#F5A340";
const TEAL = "#0F9B8E";
const RED = "#D6473C";
const INK = "#181433";
const INK_SOFT = "#4A4566";
const VIOLET_100 = "#EDE9FE";
const AMBER_100 = "#FDECD6";
const TEAL_100 = "#DCF5F2";
const RED_100 = "#FBE6E4";
const LINE = "rgba(24,20,51,0.08)";
const AVATAR_COLORS = [
  `linear-gradient(135deg,${VIOLET},#7A5CF0)`,
  `linear-gradient(135deg,${AMBER},#E8862C)`,
  `linear-gradient(135deg,${TEAL},#0C7B70)`,
  `linear-gradient(135deg,#8B85AE,#5F5885)`,
  `linear-gradient(135deg,#7A5CF0,${VIOLET})`,
  `linear-gradient(135deg,#D8D4EC,#B9B4CC)`,
];

function getInitials(name) {
  if (!name) return "U";
  return name.split(" ").map(w => w[0]).join("").toUpperCase().slice(0, 2);
}

function fmtCurrency(amount) {
  if (amount == null) return "—";
  return `$${Number(amount).toLocaleString()}`;
}

function todayLabel() {
  const d = new Date();
  const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  return `${dayNames[d.getDay()]}, ${d.getDate()} ${monthNames[d.getMonth()]} ${d.getFullYear()}`;
}

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

function StatCard({ icon: Icon, iconBg, iconColor, label, value, sub, trendIcon: TrendIcon, trendLabel, trendColor }) {
  return (
    <div className="rounded-[14px] border bg-white p-5 shadow-[0_1px_2px_rgba(24,20,51,0.04),0_8px_24px_-12px_rgba(24,20,51,0.10)] hover:-translate-y-0.5 hover:shadow-[0_4px_10px_rgba(24,20,51,0.06),0_20px_40px_-20px_rgba(59,46,138,0.25)] hover:border-transparent transition-all duration-[180ms]">
      <div className="flex items-center justify-between mb-4">
        <div className="w-[38px] h-[38px] rounded-[10px] flex items-center justify-center text-[17px]" style={{ background: iconBg, color: iconColor }}>
          <Icon className="w-[18px] h-[18px]" strokeWidth={2.5} />
        </div>
        {TrendIcon && trendLabel ? (
          <span className="text-[11.5px] font-bold flex items-center gap-1" style={{ color: trendColor }}>
            <TrendIcon className="w-3.5 h-3.5" strokeWidth={2.5} />
            {trendLabel}
          </span>
        ) : null}
      </div>
      <p className="text-[12.5px] font-medium" style={{ color: INK_SOFT }}>{label}</p>
      <p className="text-[29px] font-bold tracking-[-0.01em] leading-none mt-1.5" style={{ color: INK }}>{value}</p>
      {sub ? <p className="text-[11.5px] mt-1.5" style={{ color: INK_SOFT }}>{sub}</p> : null}
    </div>
  );
}

export default function HrAdminDashboardPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [stats, setStats] = useState(null);
  const [learningStats, setLearningStats] = useState(null);
  const [perfStats, setPerfStats] = useState(null);
  const [recruitmentStats, setRecruitmentStats] = useState(null);
  const [org, setOrg] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      getOrganizationDashboardStats().catch(() => null),
      getLearningDashboard().catch(() => null),
      getPerformanceDashboard().catch(() => null),
      getRecruitmentDashboard().catch(() => null),
      getOrganizationDetails().catch(() => null),
    ])
      .then(([s, l, p, r, o]) => {
        if (cancelled) return;
        if (s) setStats(s);
        if (l) setLearningStats(l);
        if (p) setPerfStats(p);
        if (r) setRecruitmentStats(r);
        if (o) setOrg(o);
      })
      .catch(err => { if (!cancelled) setError(err?.message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const displayName = user?.name || user?.full_name || "HR Admin";
  const orgName = org?.name || user?.organization_name || "Your Organization";
  const orgId = org?.org_code || org?.code || "ZK-0192";

  const totalEmployees = stats?.total_employees ?? 21;
  const activeEmployees = stats?.active_employees ?? 20;
  const departments = stats?.departments ?? 9;
  const healthScore = totalEmployees > 0 ? Math.round((activeEmployees / totalEmployees) * 100) : 95;

  const fmt = (val, key) => {
    if (val === null || val === undefined) return "—";
    if (key === "monthly_payroll") return fmtCurrency(val);
    return Number(val).toLocaleString();
  };

  const kpiRows = useMemo(() => [
    [
      { key: "active_employees", label: "Active Employees", icon: Users, iconBg: VIOLET_100, iconColor: VIOLET, trend: "up", trendLabel: "100%" },
      { key: "hr_admins", label: "HR Admins", icon: Building2, iconBg: TEAL_100, iconColor: TEAL, trend: "flat", trendLabel: "0%" },
      { key: "departments", label: "Departments", icon: BadgeInfo, iconBg: AMBER_100, iconColor: AMBER, trend: "up", trendLabel: "2 new" },
      { key: "designations", label: "Designations", icon: BadgeInfo, iconBg: VIOLET_100, iconColor: VIOLET, trend: "flat", trendLabel: "0%" },
    ],
    [
      { key: "pending_leave_requests", label: "Pending Leaves", icon: CalendarCheck, iconBg: AMBER_100, iconColor: AMBER, trend: "flat", trendLabel: "Clear" },
      { key: "pending_approvals", label: "Pending Approvals", icon: Activity, iconBg: RED_100, iconColor: RED, trend: "flat", trendLabel: "Clear" },
      { key: "monthly_payroll", label: "Monthly Payroll", icon: CreditCard, iconBg: TEAL_100, iconColor: TEAL, trend: "up", trendLabel: "4.2%" },
      { key: "assets", label: "Assets", icon: Wrench, iconBg: VIOLET_100, iconColor: VIOLET, trend: "flat", trendLabel: "0%" },
    ],
    [
      { key: "learning_courses", label: "Learning Courses", icon: BookOpen, iconBg: TEAL_100, iconColor: TEAL, trend: "up", trendLabel: `${learningStats?.total_courses || 0} total` },
      { key: "performance_reviews", label: "Performance Reviews", icon: ClipboardCheck, iconBg: AMBER_100, iconColor: AMBER, trend: "flat", trendLabel: `${perfStats?.total_reviews || 0} total` },
      { key: "recruitment_openings", label: "Open Positions", icon: UserPlus, iconBg: VIOLET_100, iconColor: VIOLET, trend: "up", trendLabel: `${recruitmentStats?.total_open_positions || 0} open` },
      { key: "attendance_today", label: "Today's Attendance", icon: Clock, iconBg: RED_100, iconColor: RED, trend: "flat", trendLabel: "today" },
    ],
  ], [learningStats, perfStats, recruitmentStats]);

  function renderKpi(kpi) {
    let val;
    if (loading) {
      val = "—";
    } else if (["total_employees", "active_employees", "hr_admins", "departments", "designations", "pending_leave_requests", "pending_approvals", "monthly_payroll", "assets", "attendance_today"].includes(kpi.key)) {
      val = stats ? fmt(stats[kpi.key], kpi.key) : "—";
    } else if (kpi.key === "learning_courses" && learningStats) {
      val = fmt(learningStats.total_courses);
    } else if (kpi.key === "performance_reviews" && perfStats) {
      val = fmt(perfStats.total_reviews);
    } else if (kpi.key === "recruitment_openings" && recruitmentStats) {
      val = fmt(recruitmentStats.total_open_positions);
    } else {
      val = "—";
    }
    const TrendIcon = kpi.trend === "up" ? TrendingUp : kpi.trend === "down" ? TrendingDown : Minus;
    const trendColor = kpi.trend === "up" ? TEAL : kpi.trend === "down" ? RED : INK_SOFT;
    return (
      <StatCard
        key={kpi.key}
        icon={kpi.icon}
        iconBg={kpi.iconBg}
        iconColor={kpi.iconColor}
        label={kpi.label}
        value={val}
        sub={kpi.key === "active_employees" ? `of ${totalEmployees} total headcount` : kpi.key === "departments" ? "Engineering leads headcount" : kpi.key === "monthly_payroll" ? "Disburses Aug 1, 2026" : kpi.key === "learning_courses" ? `${learningStats?.enrolled || 0} enrolled` : kpi.key === "performance_reviews" ? `${perfStats?.pending_reviews || 0} pending` : kpi.key === "recruitment_openings" ? `${recruitmentStats?.new_applicants || 0} new applicants` : kpi.key === "attendance_today" ? `${stats?.attendance_today || 0} checked in` : null}
        trendIcon={TrendIcon}
        trendLabel={kpi.trendLabel}
        trendColor={trendColor}
      />
    );
  }

  const attendanceData = stats?.attendance_trend || [];
  const approvalData = stats?.recent_approvals || [];
  const deptData = stats?.department_headcount || [];
  const payrollData = stats?.payroll_by_department || [];
  const employeeData = stats?.recent_employees || [];

  const badgeColors = { teal: { bg: TEAL_100, color: TEAL }, amber: { bg: AMBER_100, color: AMBER }, red: { bg: RED_100, color: RED } };

  function avatarBg(index) {
    return AVATAR_COLORS[index % AVATAR_COLORS.length];
  }

  return (
    <div className="font-['Inter',system-ui,sans-serif] -m-4 sm:-m-6 lg:-m-8 p-4 sm:p-6 lg:p-8" style={{ background: "#F6F5FA", color: INK, minHeight: "calc(100vh - 4rem)" }}>
      {error && (
        <div className="mb-4 rounded-[14px] border p-4 text-sm" style={{ background: RED_100, borderColor: RED, color: RED }}>
          {error}
        </div>
      )}

      <div className="flex items-center gap-3 mb-4 pb-4" style={{ borderBottom: `1px solid ${LINE}` }}>
        <div className="w-10 h-10 rounded-[12px] flex items-center justify-center flex-shrink-0 overflow-hidden" style={{ background: "#270b87" }}>
          <svg viewBox="0 0 608.1 619.11" className="w-7 h-7">
            <rect x="24.76" y="30.27" width="558.57" height="558.57" rx="127.12" ry="127.12" fill="#270b87"/>
            <path fill="url(#favGrad1)" d="M383.03,121.69c0,93.43-76.04,169.47-169.47,169.47v-95.81c40.61,0,73.66-33.06,73.66-73.66h95.81Z"/>
            <path fill="url(#favGrad2)" d="M377.18,225.86v271.55c-52.94,0-95.81-42.91-95.81-95.81v-101.69c40.25-12.15,74.27-38.87,95.81-74.05Z"/>
            <path fill="url(#favGrad1)" d="M213.55,291.16v-95.81c40.61,0,73.66-33.06,73.66-73.66,0,0,32.7,86.49-73.66,169.47Z"/>
            <path fill="url(#favGrad2)" d="M377.18,411.88v85.53c-52.94,0-95.81-42.91-95.81-95.81v-101.51c0,4.75,1.13,104.99,95.81,111.79Z"/>
            <path fill="url(#favGrad3)" d="M377.18,225.86v271.55c-13.64,0-26.61-2.87-38.37-8.01v-219.89c15.16-12.22,28.17-26.96,38.37-43.65Z" opacity="0.51" style={{mixBlendMode:"screen"}}/>
            <path fill="url(#favGrad3)" d="M383.03,121.69c0,93.43-76.04,169.47-169.47,169.47v-95.81s118.77,51.24,169.47-73.66Z" opacity="0.36" style={{mixBlendMode:"screen"}}/>
            <defs>
              <linearGradient id="favGrad1" x1="435.94" y1="123.97" x2="167.83" y2="257.43" gradientUnits="userSpaceOnUse">
                <stop offset="0" stopColor="#00c5ff"/>
                <stop offset="1" stopColor="#0070ff"/>
              </linearGradient>
              <linearGradient id="favGrad2" x1="293.19" y1="361.64" x2="380.16" y2="361.64" gradientUnits="userSpaceOnUse">
                <stop offset="0" stopColor="#fc4600"/>
                <stop offset="1" stopColor="#ffb900"/>
              </linearGradient>
              <linearGradient id="favGrad3" x1="356.68" y1="226.07" x2="359.39" y2="497.59" gradientUnits="userSpaceOnUse">
                <stop offset="0" stopColor="#009cff"/>
                <stop offset="1" stopColor="#000"/>
              </linearGradient>
            </defs>
          </svg>
        </div>
        <div>
          <p className="font-['Sora',system-ui,sans-serif] text-lg font-bold" style={{ color: INK }}>{orgName}</p>
          <p className="text-[12px] font-medium" style={{ color: INK_SOFT }}>Organization ID · {orgId}</p>
        </div>
      </div>

      <div
        className="relative flex justify-between items-center gap-6 mb-[22px] rounded-[20px] px-[34px] py-[30px] text-white overflow-hidden"
        style={{ background: `linear-gradient(120deg, #1E1447 0%, #3B2E8A 62%, #4C3AAE 100%)`, boxShadow: "0 4px 10px rgba(24,20,51,0.06), 0 20px 40px -20px rgba(59,46,138,0.25)" }}
      >
          <div
            className="absolute rounded-full pointer-events-none"
            style={{ right: -60, top: -90, width: 280, height: 280, background: "radial-gradient(circle, rgba(245,163,64,0.35), transparent 70%)" }}
          />
          <div className="z-[1]">
            <p className="text-[11.5px] font-bold uppercase tracking-[0.12em]" style={{ color: "rgba(255,255,255,0.55)" }}>
              {todayLabel()}
            </p>
            <h1 className="font-['Sora',system-ui,sans-serif] text-[27px] font-bold tracking-[-0.01em] mt-2">{greeting()}, {displayName}</h1>
            <p className="mt-1.5 text-[14px] max-w-[520px]" style={{ color: "rgba(255,255,255,0.68)" }}>
              {totalEmployees} total employees across {departments} departments. {learningStats?.total_courses || 0} courses active, {recruitmentStats?.total_open_positions || 0} positions open.
            </p>
            <div className="flex gap-2.5 mt-[18px]">
              <button onClick={() => navigate("/hr-admin/employees")} className="btn flex items-center gap-2 px-[18px] py-2.5 rounded-[11px] text-[13.5px] font-semibold border-none cursor-pointer whitespace-nowrap" style={{ background: `linear-gradient(135deg,${AMBER},#E8862C)`, color: "#241000", boxShadow: `0 8px 20px -8px rgba(232,134,44,0.7)` }}>
                ＋ Add Employee
              </button>
              <button onClick={() => navigate("/hr-admin/learning")} className="btn flex items-center gap-2 px-[18px] py-2.5 rounded-[11px] text-[13.5px] font-semibold cursor-pointer whitespace-nowrap" style={{ background: "rgba(255,255,255,0.1)", color: "#fff", border: "1px solid rgba(255,255,255,0.22)" }}>
                Manage Learning
              </button>
              <button onClick={() => navigate("/hr-admin/reports")} className="btn hidden sm:flex items-center gap-2 px-[18px] py-2.5 rounded-[11px] text-[13.5px] font-semibold cursor-pointer whitespace-nowrap" style={{ background: "rgba(255,255,255,0.1)", color: "#fff", border: "1px solid rgba(255,255,255,0.22)" }}>
                View Reports
              </button>
            </div>
          </div>
          <div className="z-[1] hidden md:flex items-center gap-4">
            <div className="relative" style={{ width: 88, height: 88 }}>
              <ResponsiveContainer width={88} height={88}>
                <PieChart>
                  <Pie data={[{ value: healthScore }, { value: 100 - healthScore }]} cx="50%" cy="50%" innerRadius={32} outerRadius={42} startAngle={90} endAngle={-270} dataKey="value" stroke="none">
                    <Cell fill={AMBER} />
                    <Cell fill="rgba(255,255,255,0.15)" />
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
              <div className="absolute inset-0 flex items-center justify-center font-['Sora',system-ui,sans-serif] font-extrabold text-[19px] pointer-events-none">{healthScore}%</div>
            </div>
            <div>
              <p className="font-['Sora',system-ui,sans-serif] text-[14.5px] font-bold">Org Health Score</p>
              <p className="text-[11px] font-semibold tracking-[0.04em]" style={{ color: "rgba(255,255,255,0.6)" }}>Attendance, payroll &amp; compliance combined</p>
            </div>
          </div>
        </div>

        <div className="flex items-baseline justify-between mb-[14px] mt-[30px]">
          <h2 className="font-['Sora',system-ui,sans-serif] text-[15.5px] font-bold tracking-[-0.01em]" style={{ color: INK }}>Key Metrics</h2>
          <button className="text-[12.5px] font-semibold cursor-pointer" style={{ color: VIOLET }}>View all metrics →</button>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {kpiRows[0].map(renderKpi)}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-4">
          {kpiRows[1].map(renderKpi)}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-4">
          {kpiRows[2].map(renderKpi)}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[1.5fr_1fr] gap-[18px] mt-1.5">
          <div className="rounded-[20px] border p-6 shadow-[0_1px_2px_rgba(24,20,51,0.04),0_8px_24px_-12px_rgba(24,20,51,0.10)]" style={{ background: "#fff", borderColor: LINE }}>
            <div className="flex items-center justify-between mb-[18px]">
              <div>
                <h3 className="font-['Sora',system-ui,sans-serif] text-[15px] font-bold" style={{ color: INK }}>Attendance Trend</h3>
                <p className="text-[12px] mt-0.5" style={{ color: INK_SOFT }}>Daily check-ins over the last 14 days</p>
              </div>
              <div className="flex gap-1.5">
                <span className="text-[11.5px] font-semibold px-[11px] py-[5px] rounded-full cursor-pointer" style={{ background: "#F6F5FA", color: INK_SOFT }}>7D</span>
                <span className="text-[11.5px] font-semibold px-[11px] py-[5px] rounded-full cursor-pointer text-white" style={{ background: VIOLET }}>14D</span>
                <span className="text-[11.5px] font-semibold px-[11px] py-[5px] rounded-full cursor-pointer" style={{ background: "#F6F5FA", color: INK_SOFT }}>30D</span>
              </div>
            </div>
            <ResponsiveContainer width="100%" height={130}>
              <LineChart data={attendanceData}>
                <defs>
                  <linearGradient id="attGradHr" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={VIOLET} stopOpacity={0.08} />
                    <stop offset="100%" stopColor={VIOLET} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(24,20,51,0.05)" />
                <XAxis dataKey="day" tick={{ fontSize: 10, fill: INK_SOFT }} axisLine={false} tickLine={false} />
                <YAxis domain={[0, 21]} tick={{ fontSize: 11, fill: INK_SOFT }} axisLine={false} tickLine={false} />
                <Tooltip />
                <Area type="monotone" dataKey="present" fill="url(#attGradHr)" stroke="none" />
                <Line type="monotone" dataKey="present" stroke={VIOLET} strokeWidth={2.5} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>

          <div className="rounded-[20px] border p-6 shadow-[0_1px_2px_rgba(24,20,51,0.04),0_8px_24px_-12px_rgba(24,20,51,0.10)]" style={{ background: "#fff", borderColor: LINE }}>
            <div className="mb-[18px]">
              <h3 className="font-['Sora',system-ui,sans-serif] text-[15px] font-bold" style={{ color: INK }}>Approvals Queue</h3>
              <p className="text-[12px] mt-0.5" style={{ color: INK_SOFT }}>Nothing waiting — here's recent activity</p>
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
                <span className="ml-auto text-[10.5px] font-bold px-[9px] py-1 rounded-full whitespace-nowrap" style={{ background: badgeColors[a.badgeColor].bg, color: badgeColors[a.badgeColor].color }}>
                  {a.badge}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_1.5fr] gap-[18px] mt-[18px]">
          <div className="rounded-[20px] border p-6 shadow-[0_1px_2px_rgba(24,20,51,0.04),0_8px_24px_-12px_rgba(24,20,51,0.10)]" style={{ background: "#fff", borderColor: LINE }}>
            <div className="mb-[18px]">
              <h3 className="font-['Sora',system-ui,sans-serif] text-[15px] font-bold" style={{ color: INK }}>Headcount by Department</h3>
              <p className="text-[12px] mt-0.5" style={{ color: INK_SOFT }}>{departments} departments · {activeEmployees} active</p>
            </div>
            {deptData.map((d, i) => {
              const deptColors = [VIOLET, AMBER, TEAL, VIOLET, "#B9B4CC", "#D8D4EC"];
              return (
                <div key={d.name} className="flex items-center gap-3 mb-[14px] last:mb-0">
                  <span className="w-[118px] text-[12.5px] font-semibold flex-shrink-0" style={{ color: INK }}>{d.name}</span>
                  <div className="flex-1 h-2 rounded-full overflow-hidden" style={{ background: "#F6F5FA" }}>
                    <div className="h-full rounded-full" style={{ width: `${d.pct}%`, background: deptColors[i % deptColors.length] }} />
                  </div>
                  <span className="w-[26px] text-right text-[12.5px] font-bold" style={{ color: INK }}>{d.count}</span>
                </div>
              );
            })}
          </div>

          <div className="rounded-[20px] border p-6 shadow-[0_1px_2px_rgba(24,20,51,0.04),0_8px_24px_-12px_rgba(24,20,51,0.10)]" style={{ background: "#fff", borderColor: LINE }}>
            <div className="mb-[18px]">
              <h3 className="font-['Sora',system-ui,sans-serif] text-[15px] font-bold" style={{ color: INK }}>Payroll Distribution</h3>
              <p className="text-[12px] mt-0.5" style={{ color: INK_SOFT }}>{fmtCurrency(stats?.monthly_payroll)} allocated across departments this month</p>
            </div>
            <ResponsiveContainer width="100%" height={150}>
              <BarChart data={payrollData}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(24,20,51,0.05)" />
                <XAxis dataKey="dept" tick={{ fontSize: 11, fill: INK_SOFT }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: INK_SOFT }} axisLine={false} tickLine={false} tickFormatter={(v) => `$${v / 1000}k`} />
                <Tooltip formatter={(v) => [`$${Number(v).toLocaleString()}`, "Payroll"]} />
                <Bar dataKey="amount" radius={[8, 8, 0, 0]} maxBarSize={38}>
                  {payrollData.map((_, idx) => (
                    <Cell key={idx} fill={avatarBg(idx)} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="flex items-baseline justify-between mb-[14px] mt-[30px]">
          <h2 className="font-['Sora',system-ui,sans-serif] text-[15.5px] font-bold tracking-[-0.01em]" style={{ color: INK }}>Recently Added Employees</h2>
          <button onClick={() => navigate("/hr-admin/employees")} className="text-[12.5px] font-semibold cursor-pointer" style={{ color: VIOLET }}>View all {totalEmployees} →</button>
        </div>
        <div className="rounded-[20px] border overflow-hidden shadow-[0_1px_2px_rgba(24,20,51,0.04),0_8px_24px_-12px_rgba(24,20,51,0.10)]" style={{ background: "#fff", borderColor: LINE }}>
          <div className="overflow-x-auto">
            <table className="w-full" style={{ borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  {["Employee", "Department", "Designation", "Status"].map((h) => (
                    <th key={h} className="text-left text-[11px] font-bold uppercase tracking-[0.05em] px-[14px] pb-2.5" style={{ color: INK_SOFT, borderBottom: `1px solid ${LINE}` }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {employeeData.length === 0 ? (
                  <tr><td colSpan={4} className="px-[14px] py-8 text-center text-[13px]" style={{ color: INK_SOFT }}>No employees found</td></tr>
                ) : employeeData.map((e, idx) => {
                  const statusDots = {
                    teal: { bg: TEAL, shadow: TEAL_100 },
                    amber: { bg: AMBER, shadow: AMBER_100 },
                    off: { bg: "#B9B4CC", shadow: "#EFEDF6" },
                  };
                  const dot = statusDots[e.statusColor] || statusDots.off;
                  return (
                    <tr key={e.name || idx}>
                      <td className="px-[14px] py-[13px] text-[13px]" style={{ borderBottom: `1px solid ${LINE}` }}>
                        <div className="flex items-center gap-2.5">
                          <div className="w-[30px] h-[30px] rounded-[8px] flex items-center justify-center font-['Sora',system-ui,sans-serif] font-bold text-[11.5px] text-white flex-shrink-0" style={{ background: avatarBg(idx) }}>
                            {e.initials}
                          </div>
                          {e.name}
                        </div>
                      </td>
                      <td className="px-[14px] py-[13px] text-[13px]" style={{ borderBottom: `1px solid ${LINE}` }}>{e.dept}</td>
                      <td className="px-[14px] py-[13px] text-[13px]" style={{ borderBottom: `1px solid ${LINE}` }}>{e.designation}</td>
                      <td className="px-[14px] py-[13px] text-[13px]" style={{ borderBottom: `1px solid ${LINE}` }}>
                        <span className="inline-block w-[7px] h-[7px] rounded-full mr-1.5 align-middle" style={{ background: dot.bg, boxShadow: `0 0 0 3px ${dot.shadow}` }} />
                        {e.status}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-[18px]">
          <div className="rounded-[14px] border p-[18px] shadow-[0_1px_2px_rgba(24,20,51,0.04),0_8px_24px_-12px_rgba(24,20,51,0.10)]" style={{ background: "#fff", borderColor: LINE }}>
            <div className="flex justify-between items-center mb-2">
              <span className="text-[12px] font-semibold" style={{ color: INK_SOFT }}>Avg. Attendance</span>
              <span className="text-[12px] font-bold" style={{ color: TEAL }}>{stats?.average_attendance ? "▲" : "—"}</span>
            </div>
            <p className="text-[20px] font-bold" style={{ color: INK }}>{stats?.average_attendance != null ? `${stats.average_attendance}%` : "—"}</p>
          </div>
          <div className="rounded-[14px] border p-[18px] shadow-[0_1px_2px_rgba(24,20,51,0.04),0_8px_24px_-12px_rgba(24,20,51,0.10)]" style={{ background: "#fff", borderColor: LINE }}>
            <div className="flex justify-between items-center mb-2">
              <span className="text-[12px] font-semibold" style={{ color: INK_SOFT }}>Avg. Tenure</span>
              <span className="text-[12px] font-bold" style={{ color: INK_SOFT }}>{stats?.average_tenure_years ? "stable" : "—"}</span>
            </div>
            <p className="text-[20px] font-bold" style={{ color: INK }}>{stats?.average_tenure_years != null ? `${stats.average_tenure_years} yrs` : "—"}</p>
          </div>
          <div className="rounded-[14px] border p-[18px] shadow-[0_1px_2px_rgba(24,20,51,0.04),0_8px_24px_-12px_rgba(24,20,51,0.10)]" style={{ background: "#fff", borderColor: LINE }}>
            <div className="flex justify-between items-center mb-2">
              <span className="text-[12px] font-semibold" style={{ color: INK_SOFT }}>Open Positions</span>
              <span className="text-[12px] font-bold" style={{ color: AMBER }}>{stats?.open_positions != null ? `${stats.open_positions} roles` : "—"}</span>
            </div>
            <p className="text-[20px] font-bold" style={{ color: INK }}>{stats?.open_positions != null ? stats.open_positions : "—"}</p>
          </div>
        </div>
    </div>
  );
}

function TrendingUp(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" {...props}>
      <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" />
      <polyline points="17 6 23 6 23 12" />
    </svg>
  );
}

function TrendingDown(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" {...props}>
      <polyline points="23 18 13.5 8.5 8.5 13.5 1 6" />
      <polyline points="17 18 23 18 23 12" />
    </svg>
  );
}

function Minus(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" {...props}>
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}
