import React, { useState, useEffect, useMemo } from "react";
import {
  Users, Building2, Clock, CheckCircle2, Target, RefreshCw, Filter,
  Download, FileText, TrendingUp, TrendingDown, Minus, BarChart3,
  UserCog, Settings, Bell, ChevronRight
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, ResponsiveContainer,
  RadialBarChart, RadialBar, PolarAngleAxis
} from "recharts";

import { getHrDashboardStats, getHrEmployees, getDepartments, getAttendanceDashboard, getLeaveDashboard, getCompensationDashboard, getPerformanceDashboard } from "../../service/hrService";
import { getOrganizationDetails } from "../../service/orgAdminService";
import { pick, employeeName, employeeInitials } from "../../utils/fieldAccess";
import zoikoIcon from "../../assets/zoikohr-icon-svg.svg";

const NAVY = "#0A1128";
const BLUE = "#3B82F6";
const EMERALD = "#10B981";
const RED = "#EF4444";
const INK = "#0A1128";
const INK_SOFT = "#475569";
const NAVY_100 = "#E0E7FF";
const BLUE_100 = "#DBEAFE";
const EMERALD_100 = "#D1FAE5";
const RED_100 = "#FEE2E2";
const LINE = "rgba(10,17,40,0.08)";

const cardShadow = "0 1px 2px rgba(10,17,40,0.04), 0 8px 24px -12px rgba(10,17,40,0.10)";
const liftShadow = "0 4px 10px rgba(10,17,40,0.06), 0 20px 40px -20px rgba(59,130,246,0.25)";

function TrendBadge({ trend, label }) {
  const map = {
    up: { color: EMERALD, Icon: TrendingUp },
    down: { color: RED, Icon: TrendingDown },
    flat: { color: INK_SOFT, Icon: Minus },
  };
  const m = trend ? map[trend] : null;
  if (!m || !label) return null;
  return (
    <span className="inline-flex items-center gap-1 text-xs font-bold" style={{ color: m.color }}>
      <m.Icon size={12} strokeWidth={2.5} /> {label}
    </span>
  );
}

const extractArray = (data) => {
  if (!data) return [];
  if (Array.isArray(data)) return data;
  if (Array.isArray(data.items)) return data.items;
  if (Array.isArray(data.data)) return data.data;
  return [];
};

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

const quickActions = [
  { icon: BarChart3, title: "Generate Report", from: BLUE, to: "#1E40AF" },
  { icon: TrendingUp, title: "View Analytics", from: EMERALD, to: "#059669" },
  { icon: UserCog, title: "Manage Users", from: NAVY, to: "#1A2744" },
  { icon: Settings, title: "Settings", from: "#475569", to: "#334155" },
];

export default function HrDashBoard() {
  const [activeTab, setActiveTab] = useState("Executive");
  const [deptView, setDeptView] = useState("Headcount");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [org, setOrg] = useState(null);

  const [dashboardData, setDashboardData] = useState({
    hrDashboard: null,
    employees: [],
    departments: [],
    attendance: [],
    leave: [],
    compensation: null,
    performance: null,
  });

  const fetchData = async () => {
    try {
      setError(null);
      const results = await Promise.allSettled([
        getHrDashboardStats(),
        getHrEmployees(),
        getDepartments(),
        getAttendanceDashboard(),
        getLeaveDashboard(),
        getCompensationDashboard(),
        getPerformanceDashboard(),
        getOrganizationDetails().catch(() => null),
      ]);

      const [hrResult, employeesResult, departmentsResult, attendanceResult, leaveResult, compensationResult, performanceResult, orgResult] = results;

      const safeValue = (result, transform = (v) => v) =>
        result.status === "fulfilled" ? transform(result.value) : null;

      setDashboardData({
        hrDashboard: safeValue(hrResult, (v) => v || {}),
        employees: safeValue(employeesResult, extractArray) || [],
        departments: safeValue(departmentsResult, extractArray) || [],
        attendance: safeValue(attendanceResult, extractArray) || [],
        leave: safeValue(leaveResult, extractArray) || [],
        compensation: safeValue(compensationResult, (v) => v || {}),
        performance: safeValue(performanceResult, (v) => v || {}),
      });

      if (orgResult?.status === "fulfilled" && orgResult.value) setOrg(orgResult.value);
    } catch (err) {
      setError("Failed to load dashboard data.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 60000);
    return () => clearInterval(interval);
  }, []);

  const handleRefresh = () => {
    setRefreshing(true);
    fetchData();
  };

  const { hrDashboard, departments, employees, attendance, leave, compensation, performance } = dashboardData;

  const orgName = org?.name || org?.organization_name || "ZoikoOne";
  const orgId = org?.org_code || org?.code || org?.organization_code || "ZK-0192";

  const totalEmployees = hrDashboard?.total_employees ?? employees?.length ?? null;
  const activeEmployees = hrDashboard?.active_employees ?? null;
  const deptCount = departments?.length ?? hrDashboard?.department_count ?? null;
  const pendingLeaves = leave?.filter?.((l) => l.status === "pending")?.length ?? null;
  const todayAttendance = hrDashboard?.attendance_today ?? null;
  const openPositions = hrDashboard?.open_positions ?? null;
  const complianceScore = hrDashboard?.compliance_score ?? null;
  const avgAttendance = hrDashboard?.average_attendance ?? null;
  const healthScore = totalEmployees != null && activeEmployees != null && totalEmployees > 0
    ? Math.round((activeEmployees / totalEmployees) * 100) : null;

  const deptData = useMemo(() => {
    if (departments?.length) {
      return departments.slice(0, 9).map((d) => ({
        name: (typeof d.department === "object" ? d.department?.name : d.department) || d.name || d.dept_name || "Unknown",
        value: d.employee_count || d.headcount || d.count || d.total_employees || 0,
      }));
    }
    const dist = hrDashboard?.department_distribution;
    if (dist && typeof dist === "object") {
      return Object.entries(dist).slice(0, 9).map(([name, value]) => ({ name, value }));
    }
    return [];
  }, [departments, hrDashboard]);

  const funnel = useMemo(() => {
    const rec = hrDashboard?.recruitment_pipeline || performance?.recruitment_pipeline || {};
    const applied = rec.applications ?? hrDashboard?.total_applications ?? null;
    const screened = rec.screened ?? null;
    const interviewed = rec.interviews ?? null;
    const offered = rec.offers ?? null;
    const hired = rec.hired ?? hrDashboard?.total_hired ?? null;
    if (applied == null) return [];
    return [
      { stage: "Applied", count: applied, pct: 100, color: BLUE },
      ...(screened != null ? [{ stage: "Screened", count: screened, pct: Math.round((screened / applied) * 100), color: "#60A5FA" }] : []),
      ...(interviewed != null ? [{ stage: "Interview", count: interviewed, pct: Math.round((interviewed / applied) * 100), color: EMERALD }] : []),
      ...(offered != null ? [{ stage: "Offer", count: offered, pct: Math.round((offered / applied) * 100), color: NAVY }] : []),
      ...(hired != null ? [{ stage: "Hired", count: hired, pct: Math.round((hired / applied) * 100), color: "#1E40AF" }] : []),
    ];
  }, [hrDashboard, performance]);

  const notifications = useMemo(() => {
    const items = [];
    if (pendingLeaves != null && pendingLeaves > 0) {
      items.push({ icon: FileText, bg: BLUE_100, fg: BLUE, text: `${pendingLeaves} leave request(s) pending approval`, time: "Today" });
    }
    if (todayAttendance != null && todayAttendance > 0) {
      items.push({ icon: CheckCircle2, bg: EMERALD_100, fg: EMERALD, text: `${todayAttendance} employee(s) checked in today`, time: "Today" });
    }
    if (openPositions != null && openPositions > 0) {
      items.push({ icon: Target, bg: NAVY_100, fg: NAVY, text: `${openPositions} open position(s) awaiting candidates`, time: "Active" });
    }
    return items;
  }, [pendingLeaves, todayAttendance, openPositions]);

  const watchlist = useMemo(() => {
    if (!employees?.length) return [];
    const statusColors = { "On Leave": BLUE, "Working": EMERALD, "Absent": RED };
    const grads = [
      [NAVY, "#1A2744"], [BLUE, "#2563EB"], ["#64748B", "#475569"],
    ];
    const leaveStatus = (e) =>
      pick(e, "status", "leave_status", "leaveStatus", "attendance_status");
    const isOnLeave = (e) =>
      leaveStatus(e) === "on_leave" || leaveStatus(e) === "On Leave" || leaveStatus(e) === "active";
    const toWatch = employees.filter(isOnLeave).length >= 2
      ? employees.filter(isOnLeave)
      : employees.slice(0, 3);
    return toWatch.map((e, i) => {
      const status = isOnLeave(e) ? "On Leave" : "Working";
      const name = employeeName(e, "Employee");
      const initials = employeeInitials(e);
      return {
        initials, grad: grads[i % grads.length], name,
        dept: (typeof e.department === "object" ? e.department?.name : e.department) || (typeof e.dept === "object" ? e.dept?.name : e.dept) || pick(e, "department_name", "departmentName") || "—",
        status, statusColor: statusColors[status] || EMERALD,
        since: status === "On Leave" ? (pick(e, "leave_start", "leaveStart") || "Recent") : "—",
        attendance: pick(e, "attendance_rate", "attendanceRate", "attendance") ?? null,
      };
    });
  }, [employees]);

  return (
    <div className="font-['Inter',system-ui,sans-serif] -m-4 sm:-m-6 lg:-m-8 p-4 sm:p-6 lg:p-8" style={{ background: "#F0F4F8", color: INK, minHeight: "calc(100vh - 4rem)" }}>
      {error && (
        <div className="mb-4 rounded-[14px] border p-4 text-sm" style={{ background: RED_100, borderColor: RED, color: RED }}>
          {error}
        </div>
      )}

      <div className="flex items-center gap-3 mb-4 pb-4" style={{ borderBottom: `1px solid ${LINE}` }}>
        <img src={zoikoIcon} alt="ZoikoHR" className="w-10 h-10" />
        <div>
          <p className="font-['Sora',system-ui,sans-serif] text-lg font-bold" style={{ color: INK }}>{orgName}</p>
          <p className="text-[12px] font-medium" style={{ color: INK_SOFT }}>Organization ID · {orgId}</p>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <RefreshCw size={24} className="animate-spin" style={{ color: BLUE }} />
        </div>
      ) : (
        <>
          <div
            className="relative flex justify-between items-center gap-6 mb-[22px] rounded-[20px] px-[34px] py-[30px] text-white overflow-hidden"
            style={{ background: `linear-gradient(120deg, #0A1128 0%, #1A2744 62%, #1E3A5F 100%)`, boxShadow: liftShadow }}
          >
            <div className="absolute rounded-full pointer-events-none" style={{ right: -60, top: -90, width: 280, height: 280, background: "radial-gradient(circle, rgba(59,130,246,0.35), transparent 70%)" }} />
            <div className="z-[1]">
              <p className="text-[11.5px] font-bold uppercase tracking-[0.12em]" style={{ color: "rgba(255,255,255,0.55)" }}>
                {todayLabel()}
              </p>
              <h1 className="font-['Sora',system-ui,sans-serif] text-[27px] font-bold tracking-[-0.01em] mt-2">{greeting()}</h1>
              <p className="mt-1.5 text-[14px] max-w-[520px]" style={{ color: "rgba(255,255,255,0.68)" }}>
                {totalEmployees != null ? `${totalEmployees} total employees` : "Manage workforce"} — {deptCount != null ? `${deptCount} departments` : "all departments"}. HR operations at a glance.
              </p>
              <div className="flex gap-2.5 mt-[18px]">
                <button className="btn flex items-center gap-2 px-[18px] py-2.5 rounded-[11px] text-[13.5px] font-semibold border-none cursor-pointer whitespace-nowrap" style={{ background: `linear-gradient(135deg,${BLUE},#2563EB)`, color: "#fff", boxShadow: `0 8px 20px -8px rgba(59,130,246,0.7)` }}>
                  ＋ Add Employee
                </button>
                <button className="btn flex items-center gap-2 px-[18px] py-2.5 rounded-[11px] text-[13.5px] font-semibold cursor-pointer whitespace-nowrap" style={{ background: "rgba(255,255,255,0.1)", color: "#fff", border: "1px solid rgba(255,255,255,0.22)" }}>
                  View Reports
                </button>
                <button className="btn hidden sm:flex items-center gap-2 px-[18px] py-2.5 rounded-[11px] text-[13.5px] font-semibold cursor-pointer whitespace-nowrap" style={{ background: "rgba(255,255,255,0.1)", color: "#fff", border: "1px solid rgba(255,255,255,0.22)" }}>
                  Run Payroll
                </button>
              </div>
            </div>
            <div className="z-[1] hidden md:flex items-center gap-4">
              <div className="relative" style={{ width: 88, height: 88 }}>
                <svg viewBox="0 0 88 88" className="w-full h-full">
                  <circle cx="44" cy="44" r="37" fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth="8" />
                  <circle cx="44" cy="44" r="37" fill="none" stroke={BLUE} strokeWidth="8" strokeDasharray={`${2 * Math.PI * 37 * (healthScore ?? 0) / 100} ${2 * Math.PI * 37 * (100 - (healthScore ?? 0)) / 100}`} strokeLinecap="round" transform="rotate(-90 44 44)" />
                </svg>
                <div className="absolute inset-0 flex items-center justify-center font-['Sora',system-ui,sans-serif] font-extrabold text-[19px] pointer-events-none">{healthScore != null ? `${healthScore}%` : "—"}</div>
              </div>
              <div>
                <p className="font-['Sora',system-ui,sans-serif] text-[14.5px] font-bold">Org Health Score</p>
                <p className="text-[11px] font-semibold tracking-[0.04em]" style={{ color: "rgba(255,255,255,0.6)" }}>Attendance, payroll &amp; compliance combined</p>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between gap-4 rounded-2xl px-4.5 py-3.5 mb-5" style={{ background: "#fff", border: `1px solid ${LINE}`, boxShadow: cardShadow }}>
            <div className="flex gap-2">
              {[RefreshCw, Filter, Download].map((Icon, i) => (
                <button key={i} onClick={i === 0 ? handleRefresh : undefined} className="w-9 h-9 rounded-[9px] flex items-center justify-center" style={{ background: "#F0F4F8", border: `1px solid ${LINE}`, color: INK_SOFT }}>
                  <Icon size={15} className={i === 0 && refreshing ? "animate-spin" : ""} />
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold mr-1" style={{ color: INK_SOFT }}>Quick Access:</span>
              {["Executive", "Department", "Operational", "Performance"].map((tab) => (
                <button key={tab} onClick={() => setActiveTab(tab)} className="px-4 py-2 rounded-[9px] text-sm font-semibold transition"
                  style={activeTab === tab ? { background: `linear-gradient(135deg, ${BLUE}, #2563EB)`, color: "#fff", boxShadow: "0 6px 14px -4px rgba(59,130,246,0.5)" } : { color: INK_SOFT }}>
                  {tab}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-5 gap-4">
            <div className="rounded-2xl p-4.5 transition hover:-translate-y-0.5" style={{ background: "#fff", border: `1px solid ${LINE}`, boxShadow: cardShadow }}>
              <div className="flex items-center justify-between mb-3.5">
                <div className="w-9 h-9 rounded-[10px] flex items-center justify-center" style={{ background: BLUE_100, color: BLUE }}><Users size={17} /></div>
                <TrendBadge trend={totalEmployees != null ? "up" : null} label={totalEmployees != null ? "active" : null} />
              </div>
              <div className="text-xs font-medium mb-1" style={{ color: INK_SOFT }}>Total Employees</div>
              <div className="text-2xl font-bold tracking-tight" style={{ fontFamily: "'JetBrains Mono', monospace" }}>{totalEmployees ?? "—"}</div>
              <div className="text-[11px] mt-1" style={{ color: INK_SOFT }}>{activeEmployees != null ? `${activeEmployees} active` : "—"}</div>
            </div>
            <div className="rounded-2xl p-4.5 transition hover:-translate-y-0.5" style={{ background: "#fff", border: `1px solid ${LINE}`, boxShadow: cardShadow }}>
              <div className="flex items-center justify-between mb-3.5">
                <div className="w-9 h-9 rounded-[10px] flex items-center justify-center" style={{ background: EMERALD_100, color: EMERALD }}><Building2 size={17} /></div>
                <TrendBadge trend={deptCount != null ? "flat" : null} label={deptCount != null ? String(deptCount) : null} />
              </div>
              <div className="text-xs font-medium mb-1" style={{ color: INK_SOFT }}>Active Departments</div>
              <div className="text-2xl font-bold tracking-tight" style={{ fontFamily: "'JetBrains Mono', monospace" }}>{deptCount ?? "—"}</div>
            </div>
            <div className="rounded-2xl p-4.5 transition hover:-translate-y-0.5" style={{ background: "#fff", border: `1px solid ${LINE}`, boxShadow: cardShadow }}>
              <div className="flex items-center justify-between mb-3.5">
                <div className="w-9 h-9 rounded-[10px] flex items-center justify-center" style={{ background: RED_100, color: RED }}><Clock size={17} /></div>
                <TrendBadge trend={pendingLeaves != null ? (pendingLeaves > 0 ? "down" : "flat") : null} label={pendingLeaves != null ? `${pendingLeaves} req` : null} />
              </div>
              <div className="text-xs font-medium mb-1" style={{ color: INK_SOFT }}>Pending Requests</div>
              <div className="text-2xl font-bold tracking-tight" style={{ fontFamily: "'JetBrains Mono', monospace" }}>{pendingLeaves ?? "—"}</div>
              <div className="text-[11px] mt-1" style={{ color: INK_SOFT }}>Leave & asset approvals</div>
            </div>
            <div className="rounded-2xl p-4.5 transition hover:-translate-y-0.5" style={{ background: "#fff", border: `1px solid ${LINE}`, boxShadow: cardShadow }}>
              <div className="flex items-center justify-between mb-3.5">
                <div className="w-9 h-9 rounded-[10px] flex items-center justify-center" style={{ background: EMERALD_100, color: EMERALD }}><CheckCircle2 size={17} /></div>
                <TrendBadge trend={avgAttendance != null ? (avgAttendance >= 90 ? "up" : avgAttendance > 0 ? "down" : "flat") : null} label={avgAttendance != null ? `${avgAttendance}%` : null} />
              </div>
              <div className="text-xs font-medium mb-1" style={{ color: INK_SOFT }}>Avg. Attendance</div>
              <div className="text-2xl font-bold tracking-tight" style={{ fontFamily: "'JetBrains Mono', monospace" }}>{avgAttendance != null ? `${avgAttendance}%` : "—"}</div>
              <div className="text-[11px] mt-1" style={{ color: INK_SOFT }}>Last 14 working days</div>
            </div>
            <div className="rounded-2xl p-4.5 transition hover:-translate-y-0.5" style={{ background: "#fff", border: `1px solid ${LINE}`, boxShadow: cardShadow }}>
              <div className="flex items-center justify-between mb-3.5">
                <div className="w-9 h-9 rounded-[10px] flex items-center justify-center" style={{ background: NAVY_100, color: NAVY }}><Target size={17} /></div>
                <TrendBadge trend={openPositions != null ? (openPositions > 0 ? "up" : "flat") : null} label={openPositions != null ? `${openPositions} open` : null} />
              </div>
              <div className="text-xs font-medium mb-1" style={{ color: INK_SOFT }}>Open Positions</div>
              <div className="text-2xl font-bold tracking-tight" style={{ fontFamily: "'JetBrains Mono', monospace" }}>{openPositions ?? "—"}</div>
            </div>
          </div>

          <div className="grid grid-cols-[1.4fr_1fr] gap-4.5 mt-5">
            <div className="rounded-[20px] p-5.5" style={{ background: "#fff", border: `1px solid ${LINE}`, boxShadow: cardShadow }}>
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-base font-bold" style={{ fontFamily: "'Sora', sans-serif" }}>Department Comparison</h3>
                  <p className="text-xs mt-0.5" style={{ color: INK_SOFT }}>Employee count by department</p>
                </div>
                <div className="flex gap-1.5">
                  {["Headcount", "Payroll"].map((v) => (
                    <button key={v} onClick={() => setDeptView(v)} className="text-xs font-semibold px-3 py-1.5 rounded-full"
                      style={deptView === v ? { background: BLUE, color: "#fff" } : { background: "#F0F4F8", color: INK_SOFT }}>
                      {v}
                    </button>
                  ))}
                </div>
              </div>
              {deptData.length > 0 ? (
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={deptData}>
                    <CartesianGrid vertical={false} stroke="rgba(10,17,40,0.05)" />
                    <XAxis dataKey="name" tick={{ fill: INK_SOFT, fontSize: 10.5 }} axisLine={false} tickLine={false} interval={0} angle={-10} textAnchor="end" height={50} />
                    <YAxis tick={{ fill: INK_SOFT, fontSize: 11 }} axisLine={false} tickLine={false} />
                    <Bar dataKey="value" fill={BLUE} radius={[7, 7, 0, 0]} maxBarSize={30} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex items-center justify-center h-[220px] text-sm" style={{ color: INK_SOFT }}>No department data</div>
              )}
            </div>

            <div className="rounded-[20px] p-5.5" style={{ background: "#fff", border: `1px solid ${LINE}`, boxShadow: cardShadow }}>
              <div className="mb-2">
                <h3 className="text-base font-bold" style={{ fontFamily: "'Sora', sans-serif" }}>Compliance Score</h3>
                <p className="text-xs mt-0.5" style={{ color: INK_SOFT }}>Policy & statutory compliance</p>
              </div>
              <div className="flex flex-col items-center pt-1.5">
                <ResponsiveContainer width={220} height={140}>
                  <RadialBarChart innerRadius="75%" outerRadius="100%" data={[{ name: "Compliance", value: complianceScore ?? 0, fill: EMERALD }]} startAngle={180} endAngle={0} barSize={16}>
                    <PolarAngleAxis type="number" domain={[0, 100]} tick={false} />
                    <RadialBar dataKey="value" cornerRadius={8} background={{ fill: "rgba(16,185,129,0.12)" }} />
                  </RadialBarChart>
                </ResponsiveContainer>
                <div className="text-3xl font-extrabold -mt-16" style={{ fontFamily: "'Sora', sans-serif" }}>{complianceScore ?? "—"}%</div>
                <div className="text-xs font-semibold mb-1.5" style={{ color: INK_SOFT }}>Compliant across all departments</div>
                {complianceScore == null && <div className="text-[10px] mt-1" style={{ color: INK_SOFT }}>Data not yet available</div>}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4.5 mt-4.5">
            <div className="rounded-[20px] p-5.5" style={{ background: "#fff", border: `1px solid ${LINE}`, boxShadow: cardShadow }}>
              <div className="mb-4">
                <h3 className="text-base font-bold" style={{ fontFamily: "'Sora', sans-serif" }}>Recruitment Funnel</h3>
                <p className="text-xs mt-0.5" style={{ color: INK_SOFT }}>{openPositions != null ? `${openPositions} open roles · ` : ""}{funnel[0]?.count || 0} candidates in pipeline</p>
              </div>
              {funnel.length > 0 ? funnel.map((f, i) => (
                <div key={i} className="flex items-center gap-3 mb-3 last:mb-0">
                  <div className="w-24 text-xs font-semibold shrink-0">{f.stage}</div>
                  <div className="h-[26px] rounded-lg flex items-center px-2.5 text-white text-[11.5px] font-bold" style={{ width: `${f.pct}%`, background: f.color }}>{f.count} candidates</div>
                </div>
              )) : (
                <div className="flex items-center justify-center h-[140px] text-sm" style={{ color: INK_SOFT }}>No recruitment data</div>
              )}
            </div>

            <div className="rounded-[20px] p-5.5" style={{ background: "#fff", border: `1px solid ${LINE}`, boxShadow: cardShadow }}>
              <div className="mb-3">
                <h3 className="text-base font-bold" style={{ fontFamily: "'Sora', sans-serif" }}>Recent Notifications</h3>
                <p className="text-xs mt-0.5" style={{ color: INK_SOFT }}>Latest updates across your organization</p>
              </div>
              {notifications.length > 0 ? notifications.map((n, i) => (
                <div key={i} className="flex items-start gap-3 py-3 last:pb-0" style={{ borderBottom: i < notifications.length - 1 ? `1px solid ${LINE}` : "none" }}>
                  <div className="w-8 h-8 rounded-[9px] flex items-center justify-center shrink-0" style={{ background: n.bg, color: n.fg }}><n.icon size={14} /></div>
                  <div>
                    <div className="text-sm font-medium">{n.text}</div>
                    <div className="text-[11px] mt-0.5" style={{ color: INK_SOFT }}>{n.time}</div>
                  </div>
                </div>
              )) : (
                <div className="flex items-center justify-center h-[140px] text-sm" style={{ color: INK_SOFT }}>No notifications</div>
              )}
            </div>
          </div>

          <div className="flex items-baseline justify-between mt-7 mb-3.5">
            <h2 className="text-[15.5px] font-bold" style={{ fontFamily: "'Sora', sans-serif" }}>Employee Status Overview</h2>
          </div>
          <div className="rounded-[20px] overflow-hidden" style={{ background: "#fff", border: `1px solid ${LINE}`, boxShadow: cardShadow }}>
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  {["Employee", "Department", "Status", "Since", "Attendance (30d)"].map((h) => (
                    <th key={h} className="text-left text-[10.5px] uppercase tracking-wide font-bold pb-2.5" style={{ color: INK_SOFT, borderBottom: `1px solid ${LINE}`, padding: "14px" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {watchlist.length > 0 ? watchlist.map((w, i) => (
                  <tr key={i}>
                    <td className="py-3 px-3.5 pl-5.5" style={{ borderBottom: i < watchlist.length - 1 ? `1px solid ${LINE}` : "none" }}>
                      <div className="flex items-center gap-2.5">
                        <div className="flex items-center justify-center text-white text-[11px] font-bold shrink-0 rounded-lg" style={{ width: 30, height: 30, background: `linear-gradient(135deg, ${w.grad[0]}, ${w.grad[1]})`, fontFamily: "'Sora', sans-serif" }}>{w.initials}</div>
                        {w.name}
                      </div>
                    </td>
                    <td className="py-3 px-3.5 text-sm" style={{ borderBottom: i < watchlist.length - 1 ? `1px solid ${LINE}` : "none" }}>{w.dept}</td>
                    <td className="py-3 px-3.5 text-sm" style={{ borderBottom: i < watchlist.length - 1 ? `1px solid ${LINE}` : "none" }}>
                      <span className="inline-block w-1.5 h-1.5 rounded-full mr-1.5" style={{ background: w.statusColor, boxShadow: `0 0 0 3px ${w.statusColor}22` }} />{w.status}
                    </td>
                    <td className="py-3 px-3.5 text-sm" style={{ borderBottom: i < watchlist.length - 1 ? `1px solid ${LINE}` : "none" }}>{w.since}</td>
                    <td className="py-3 px-3.5 text-sm" style={{ fontFamily: "'JetBrains Mono', monospace", borderBottom: i < watchlist.length - 1 ? `1px solid ${LINE}` : "none" }}>{w.attendance != null ? `${w.attendance}%` : "—"}</td>
                  </tr>
                )) : (
                  <tr><td colSpan={5} className="py-8 text-center text-sm" style={{ color: INK_SOFT }}>No employee data</td></tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="mt-7 mb-3.5">
            <h2 className="text-[15.5px] font-bold" style={{ fontFamily: "'Sora', sans-serif" }}>Quick Actions</h2>
          </div>
          <div className="grid grid-cols-4 gap-3.5">
            {quickActions.map((a, i) => (
              <button key={i} className="rounded-2xl px-4.5 py-5 text-white text-left flex flex-col gap-6 transition hover:-translate-y-0.5" style={{ background: `linear-gradient(135deg, ${a.from}, ${a.to})`, boxShadow: cardShadow, border: "1px solid rgba(255,255,255,0.12)" }}>
                <div className="flex items-center justify-center rounded-[9px]" style={{ width: 34, height: 34, background: "rgba(255,255,255,0.18)" }}><a.icon size={16} /></div>
                <div className="text-sm font-bold" style={{ fontFamily: "'Sora', sans-serif" }}>{a.title}</div>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
