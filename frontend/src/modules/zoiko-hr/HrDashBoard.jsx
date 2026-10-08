import React, { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import {
  Users, Building2, Clock, CheckCircle2, Target, RefreshCw,
  FileText, TrendingUp, TrendingDown, Minus, BarChart3,
  UserCog, Settings, ChevronRight, X, Loader2, Timer
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, ResponsiveContainer,
  RadialBarChart, RadialBar, PolarAngleAxis
} from "recharts";

import { getHrDashboardStats, getHrEmployees, getDepartments, getAttendanceDashboard, getLeaveDashboard, getCompensationDashboard, getPerformanceDashboard } from "../../service/hrService";
import { getOrganizationDetails } from "../../service/orgAdminService";
import { createEmployee, getDesignations } from "../../service/employee";
import { pick, employeeName, employeeInitials } from "../../utils/fieldAccess";
import { validateAddEmployee, addEmployeePayload, serverAddEmployeeErrors } from "../../utils/addEmployeeForm";
import { resolveEmployeeDisplayStatus } from "../../utils/employeeStatus";
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

const EMPLOYMENT_TYPES = [
  { value: "full_time", label: "Full Time" },
  { value: "part_time", label: "Part Time" },
  { value: "contract", label: "Contract" },
  { value: "intern", label: "Intern" },
  { value: "probation", label: "Probation" },
];

const EMPTY_EMPLOYEE_FORM = {
  first_name: "",
  last_name: "",
  email: "",
  phone: "",
  job_title: "",
  department_id: "",
  designation_id: "",
  employment_type: "full_time",
  date_of_joining: "",
  basic_salary: "",
  ctc: "",
};

const REPORT_LINKS = [
  { icon: Users, title: "Employee Reports", description: "Directory, headcount and employee exports", href: "/zoiko-hr/employee-management/reports" },
  { icon: Building2, title: "Department Reports", description: "Department-wise headcount and cost analysis", href: "/zoiko-hr/departments/reports" },
  { icon: FileText, title: "Designation Reports", description: "Job title distribution and grade mix", href: "/zoiko-hr/designations/reports" },
  { icon: Clock, title: "Leave Reports", description: "Leave utilisation and trends", href: "/zoiko-hr/leave/reports" },
  { icon: CheckCircle2, title: "Attendance Analytics", description: "Daily attendance, overtime and shift efficiency", href: "/zoiko-hr/attendance/analytics" },
  { icon: Target, title: "Recruitment Analytics", description: "Pipeline health and open requisitions", href: "/zoiko-hr/recruitment" },
  { icon: BarChart3, title: "Workforce Reports", description: "Headcount planning and succession insights", href: "/zoiko-hr/workforce-planning/reports" },
  { icon: TrendingUp, title: "Onboarding Reports", description: "New hire joining and task completion", href: "/zoiko-hr/onboarding/reports" },
];


const fieldClass = (invalid) =>
  `w-full bg-gray-50 border ${invalid ? "border-red-400" : "border-gray-200"} rounded-xl px-4 py-2.5 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 focus:bg-white transition-colors`;

const toOptions = (items, idKeys, labelKeys) =>
  (items || [])
    .map((item) => {
      const raw = pick(item, ...labelKeys);
      return {
        value: pick(item, ...idKeys),
        label: (raw && typeof raw === "object" ? raw.name : raw) ?? null,
      };
    })
    .filter((o) => o.value != null && o.label);

function Field({ label, required, error, children }) {
  return (
    <div>
      <label className="block text-sm font-bold text-gray-700 mb-1.5">
        {label}{required && <span className="text-red-500"> *</span>}
      </label>
      {children}
      {error && <p className="text-red-500 text-xs font-bold mt-1.5">{error}</p>}
    </div>
  );
}

function StatCard({ icon: Icon, tint, color, label, value, sub, trend, trendLabel }) {
  return (
    <div className="rounded-2xl p-4.5 transition hover:-translate-y-0.5" style={{ background: "#fff", border: `1px solid ${LINE}`, boxShadow: cardShadow }}>
      <div className="flex items-center justify-between mb-3.5">
        <div className="w-9 h-9 rounded-[10px] flex items-center justify-center" style={{ background: tint, color }}><Icon size={17} /></div>
        <TrendBadge trend={trend} label={trendLabel} />
      </div>
      <div className="text-xs font-medium mb-1" style={{ color: INK_SOFT }}>{label}</div>
      <div className="text-2xl font-bold tracking-tight" style={{ fontFamily: "'JetBrains Mono', monospace" }}>{value ?? "—"}</div>
      {sub && <div className="text-[11px] mt-1" style={{ color: INK_SOFT }}>{sub}</div>}
    </div>
  );
}

function Panel({ title, subtitle, right, children, className = "" }) {
  return (
    <div className={`rounded-[20px] p-5.5 ${className}`} style={{ background: "#fff", border: `1px solid ${LINE}`, boxShadow: cardShadow }}>
      <div className="flex items-start justify-between gap-3 mb-4">
        <div>
          <h3 className="text-base font-bold" style={{ fontFamily: "'Sora', sans-serif" }}>{title}</h3>
          {subtitle && <p className="text-xs mt-0.5" style={{ color: INK_SOFT }}>{subtitle}</p>}
        </div>
        {right}
      </div>
      {children}
    </div>
  );
}

function MetricBar({ label, value, suffix = "%", color = BLUE }) {
  const pct = Math.max(0, Math.min(100, Number(value) || 0));
  return (
    <div className="mb-4 last:mb-0">
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-xs font-semibold" style={{ color: INK_SOFT }}>{label}</span>
        <span className="text-xs font-bold" style={{ fontFamily: "'JetBrains Mono', monospace" }}>{value != null ? `${value}${suffix}` : "—"}</span>
      </div>
      <div className="h-2 rounded-full overflow-hidden" style={{ background: "#EEF2F7" }}>
        <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: color }} />
      </div>
    </div>
  );
}

function EmptyState({ label, height = 140 }) {
  return (
    <div className="flex items-center justify-center text-sm" style={{ color: INK_SOFT, height }}>{label}</div>
  );
}

export default function HrDashBoard() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState("Executive");
  const [deptView, setDeptView] = useState("Headcount");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [org, setOrg] = useState(null);

  const [addOpen, setAddOpen] = useState(false);
  const [reportsOpen, setReportsOpen] = useState(false);
  const [toast, setToast] = useState(null);
  const [newLogin, setNewLogin] = useState(null);   // the one-time login of the person just added
  const [form, setForm] = useState(EMPTY_EMPLOYEE_FORM);
  const [formErrors, setFormErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [designations, setDesignations] = useState([]);

  const [dashboardData, setDashboardData] = useState({
    hrDashboard: null,
    employees: [],
    departments: [],
    attendance: {},
    leave: {},
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
        attendance: safeValue(attendanceResult, (v) => v || {}) || {},
        leave: safeValue(leaveResult, (v) => v || {}) || {},
        compensation: safeValue(compensationResult, (v) => v || {}),
        performance: safeValue(performanceResult, (v) => v || {}),
      });

      if (orgResult?.status === "fulfilled" && orgResult.value) setOrg(orgResult.value);
    } catch (err) {
      setError("Failed to load dashboard data.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 60000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(t);
  }, [toast]);

  useEffect(() => {
    if (!addOpen && !reportsOpen) return;
    const onKey = (e) => {
      if (e.key !== "Escape") return;
      setAddOpen(false);
      setReportsOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [addOpen, reportsOpen]);

  const openAddEmployee = () => {
    setForm(EMPTY_EMPLOYEE_FORM);
    setFormErrors({});
    setAddOpen(true);
    setReportsOpen(false);
    getDesignations()
      .then((data) => setDesignations(extractArray(data)))
      .catch(() => setDesignations([]));
  };

  const openReports = () => {
    setReportsOpen(true);
    setAddOpen(false);
  };

  const goToReport = (href) => {
    setReportsOpen(false);
    navigate(href);
  };

  const updateForm = (key) => (e) => {
    const value = e.target.value;
    setForm((prev) => ({ ...prev, [key]: value }));
    setFormErrors((prev) => (prev[key] ? { ...prev, [key]: undefined } : prev));
  };

  const handleAddSubmit = async (e) => {
    e.preventDefault();
    if (saving) return;
    const problems = validateAddEmployee(form);
    setFormErrors(problems);
    if (Object.keys(problems).length) return;
    setSaving(true);
    try {
      const created = await createEmployee(addEmployeePayload(form));
      const name = `${form.first_name.trim()} ${form.last_name.trim()}`;
      setAddOpen(false);
      setForm(EMPTY_EMPLOYEE_FORM);
      setToast({ text: `${name} added to the employee directory.` });
      const temp = created?.temporaryPassword || created?.temporary_password;
      if (temp) setNewLogin({ name, email: created?.email || form.email.trim(), password: temp });
      fetchData();
    } catch (err) {
      const { fieldErrors, message } = serverAddEmployeeErrors(err);
      setFormErrors({ ...fieldErrors, ...(message ? { submit: message } : {}) });
    } finally {
      setSaving(false);
    }
  };

  const { hrDashboard, departments, employees, attendance, leave, compensation, performance } = dashboardData;

  const orgName = org?.name || org?.organization_name || "ZoikoOne";
  const orgId = org?.org_code || org?.code || org?.organization_code || "ZK-0192";

  const totalEmployees = hrDashboard?.total_employees ?? employees?.length ?? null;
  const activeEmployees = hrDashboard?.active_employees ?? null;
  const deptCount = departments?.length ?? hrDashboard?.department_count ?? null;
  const pendingLeaves = leave?.pending_requests ?? extractArray(leave).filter((l) => l.status === "pending").length ?? null;
  const todayAttendance = hrDashboard?.attendance_today ?? null;
  const openPositions = hrDashboard?.open_positions ?? null;
  const complianceScore = hrDashboard?.compliance_score ?? null;
  const avgAttendance = hrDashboard?.average_attendance ?? null;
  const healthScore = totalEmployees != null && activeEmployees != null && totalEmployees > 0
    ? Math.round((activeEmployees / totalEmployees) * 100) : null;

  const departmentOptions = useMemo(
    () => toOptions(departments, ["id", "department_id"], ["name", "department_name", "department"]),
    [departments]
  );

  const designationOptions = useMemo(
    () => toOptions(designations, ["id", "designation_id"], ["name", "designation_name", "designation"]),
    [designations]
  );

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

  const attendanceStats = attendance || {};
  const leaveStats = leave || {};
  const performanceStats = performance || {};

  const deptRows = useMemo(() => {
    const rows = (departments || []).map((d) => ({
      id: pick(d, "id", "department_id"),
      name: (typeof d.department === "object" ? d.department?.name : d.department) || d.name || d.dept_name || "Unknown",
      code: pick(d, "department_code", "code") || "—",
      head: pick(d, "head", "head_name") || "—",
      count: d.employee_count ?? d.headcount ?? d.count ?? 0,
      budget: Number(pick(d, "budget", "spent_budget")) || 0,
      active: d.is_active !== false,
    }));
    return rows.sort((a, b) => b.count - a.count);
  }, [departments]);

  const largestDept = deptRows[0] || null;
  const avgHeadcount = deptRows.length
    ? Math.round((deptRows.reduce((sum, r) => sum + Number(r.count || 0), 0) / deptRows.length) * 10) / 10
    : null;

  const attendanceTrend = useMemo(
    () => extractArray(attendanceStats.attendance_trend).slice(-14),
    [attendanceStats]
  );

  const deptAttendance = useMemo(
    () => extractArray(attendanceStats.department_attendance).slice(0, 9).map((r) => ({
      name: r.department || r.name || "Unknown",
      value: r.count ?? 0,
    })),
    [attendanceStats]
  );

  const shiftMix = useMemo(
    () => extractArray(attendanceStats.shift_distribution).map((r) => ({
      name: r.shift || r.name || "Shift",
      value: r.count ?? 0,
    })),
    [attendanceStats]
  );

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
    const toneColors = { working: EMERALD, leave: BLUE, attention: RED, neutral: INK_SOFT };
    const grads = [
      [NAVY, "#1A2744"], [BLUE, "#2563EB"], ["#64748B", "#475569"],
    ];
    const rows = employees.map((e, idx) => {
      const resolved = resolveEmployeeDisplayStatus(e);
      return {
        idx,
        source: e,
        initials: employeeInitials(e),
        name: employeeName(e, "Employee"),
        dept: (typeof e.department === "object" ? e.department?.name : e.department) || (typeof e.dept === "object" ? e.dept?.name : e.dept) || pick(e, "department_name", "departmentName") || "—",
        status: resolved.label,
        statusColor: toneColors[resolved.tone] || EMERALD,
        since: resolved.isOnLeave ? (pick(e, "leave_start", "leaveStart") || "Recent") : "—",
        attendance: pick(e, "attendance_rate", "attendanceRate", "attendance") ?? null,
      };
    });
    // Surface the exceptions worth an admin's attention first, then fall back
    // to the first few employees so the section is never empty.
    const onLeave = rows.filter((r) => r.status === "On Leave");
    const needsAttention = rows.filter((r) => ["Inactive", "Pending", "Terminated", "Resigned", "Deactivated", "Suspended", "Locked", "Archived"].includes(r.status));
    const highlighted = [...onLeave, ...needsAttention];
    const toWatch = (highlighted.length >= 2 ? highlighted : rows).slice(0, 6);
    return toWatch.map((r, i) => ({ ...r, grad: grads[i % grads.length] }));
  }, [employees]);

  return (
    <div className="font-['Inter',system-ui,sans-serif] -m-4 sm:-m-6 lg:-m-8 p-4 sm:p-6 lg:p-8" style={{ background: "#F0F4F8", color: INK, minHeight: "calc(100vh - 4rem)" }}>
      {error && (
        <div className="mb-4 rounded-[14px] border p-4 text-sm" style={{ background: RED_100, borderColor: RED, color: RED }}>
          {error}
        </div>
      )}

      {newLogin && (
        <div role="dialog" aria-modal="true" aria-label="Temporary login" className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
            <h3 className="text-base font-bold text-gray-900">{newLogin.name} can now sign in</h3>
            <p className="text-sm text-gray-600 mt-2">A welcome e-mail with these details was sent to {newLogin.email}. This temporary password is shown only once; they must change it at first sign-in.</p>
            <div className="mt-4 rounded-xl bg-gray-50 border border-gray-200 px-4 py-3 font-mono text-sm text-gray-900 select-all" data-testid="temp-password">{newLogin.password}</div>
            <div className="mt-5 flex justify-end">
              <button type="button" onClick={() => setNewLogin(null)} className="px-5 py-2.5 text-sm font-bold bg-blue-600 hover:bg-blue-700 text-white rounded-xl cursor-pointer">Done</button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div className="mb-4 flex items-center justify-between gap-3 rounded-[14px] border px-4 py-3 text-sm font-semibold" style={{ background: EMERALD_100, borderColor: "rgba(16,185,129,0.45)", color: "#047857" }}>
          <span className="flex items-center gap-2"><CheckCircle2 size={16} />{toast.text}</span>
          <button onClick={() => setToast(null)} className="shrink-0 cursor-pointer opacity-70 hover:opacity-100 transition-opacity" aria-label="Dismiss notification"><X size={15} /></button>
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
                <button onClick={openAddEmployee} className="btn flex items-center gap-2 px-[18px] py-2.5 rounded-[11px] text-[13.5px] font-semibold border-none cursor-pointer whitespace-nowrap" style={{ background: `linear-gradient(135deg,${BLUE},#2563EB)`, color: "#fff", boxShadow: `0 8px 20px -8px rgba(59,130,246,0.7)` }}>
                  ＋ Add Employee
                </button>
                <button onClick={openReports} className="btn flex items-center gap-2 px-[18px] py-2.5 rounded-[11px] text-[13.5px] font-semibold cursor-pointer whitespace-nowrap" style={{ background: "rgba(255,255,255,0.1)", color: "#fff", border: "1px solid rgba(255,255,255,0.22)" }}>
                  View Reports
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

          <div className="flex items-center justify-end gap-4 rounded-2xl px-4.5 py-3.5 mb-5" style={{ background: "#fff", border: `1px solid ${LINE}`, boxShadow: cardShadow }}>
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

          {activeTab === "Executive" && (
            <>
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
                  <tr key={pick(w.source, "id", "employee_id", "employeeId") ?? `emp-${w.idx}`}>
                    <td className="py-3 px-3.5 pl-5.5" style={{ borderBottom: i < watchlist.length - 1 ? `1px solid ${LINE}` : "none" }}>
                      <div className="flex items-center gap-2.5">
                        <div className="flex items-center justify-center text-white text-[11px] font-bold shrink-0 rounded-lg" style={{ width: 30, height: 30, background: `linear-gradient(135deg, ${w.grad[0]}, ${w.grad[1]})`, fontFamily: "'Sora', sans-serif" }}>{w.initials}</div>
                        {w.name}
                      </div>
                    </td>
                    <td className="py-3 px-3.5 text-sm" style={{ borderBottom: i < watchlist.length - 1 ? `1px solid ${LINE}` : "none" }}>{w.dept}</td>
                    <td className="py-3 px-3.5 text-sm" style={{ borderBottom: i < watchlist.length - 1 ? `1px solid ${LINE}` : "none" }}>
                      <span className="inline-block w-1.5 h-1.5 rounded-full mr-1.5" style={{ background: w.statusColor, boxShadow: `0 0 0 3px ${w.statusColor}22` }} />{w.status}
                      {w.status === "Active" && <span className="sr-only"> (currently working)</span>}
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
            </>
          )}

          {activeTab === "Department" && (
            <>
              <div className="grid grid-cols-4 gap-4">
                <StatCard icon={Building2} tint={BLUE_100} color={BLUE} label="Departments" value={deptRows.length || null} trend="flat" trendLabel={deptRows.length ? "tracked" : null} />
                <StatCard icon={CheckCircle2} tint={EMERALD_100} color={EMERALD} label="Active Departments" value={deptRows.filter((r) => r.active).length || null} />
                <StatCard icon={TrendingUp} tint={NAVY_100} color={NAVY} label="Largest Department" value={largestDept ? largestDept.count : null} sub={largestDept ? largestDept.name : undefined} />
                <StatCard icon={Users} tint={BLUE_100} color={BLUE} label="Avg. Headcount" value={avgHeadcount} sub="per department" />
              </div>

              <div className="grid grid-cols-2 gap-4.5 mt-5">
                <Panel title="Headcount by Department" subtitle="Employee count per department">
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
                    <EmptyState label="No department data" height={220} />
                  )}
                </Panel>

                <Panel title="Attendance by Department" subtitle="Attendance records per department">
                  {deptAttendance.length > 0 ? (
                    <ResponsiveContainer width="100%" height={220}>
                      <BarChart data={deptAttendance} layout="vertical">
                        <CartesianGrid horizontal={false} stroke="rgba(10,17,40,0.05)" />
                        <XAxis type="number" tick={{ fill: INK_SOFT, fontSize: 11 }} axisLine={false} tickLine={false} />
                        <YAxis type="category" dataKey="name" width={92} tick={{ fill: INK_SOFT, fontSize: 10.5 }} axisLine={false} tickLine={false} />
                        <Bar dataKey="value" fill={EMERALD} radius={[0, 7, 7, 0]} maxBarSize={22} />
                      </BarChart>
                    </ResponsiveContainer>
                  ) : (
                    <EmptyState label="No attendance data" height={220} />
                  )}
                </Panel>
              </div>

              <div className="rounded-[20px] overflow-hidden mt-5" style={{ background: "#fff", border: `1px solid ${LINE}`, boxShadow: cardShadow }}>
                <table className="w-full border-collapse">
                  <thead>
                    <tr>
                      {["Department", "Code", "Head", "Employees", "Budget"].map((h) => (
                        <th key={h} className="text-left text-[10.5px] uppercase tracking-wide font-bold pb-2.5" style={{ color: INK_SOFT, borderBottom: `1px solid ${LINE}`, padding: "14px" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {deptRows.length > 0 ? deptRows.map((r, i) => (
                      <tr key={r.id || i}>
                        <td className="py-3 px-3.5 pl-5.5 text-sm font-semibold" style={{ borderBottom: i < deptRows.length - 1 ? `1px solid ${LINE}` : "none" }}>{r.name}</td>
                        <td className="py-3 px-3.5 text-sm" style={{ fontFamily: "'JetBrains Mono', monospace", borderBottom: i < deptRows.length - 1 ? `1px solid ${LINE}` : "none" }}>{r.code}</td>
                        <td className="py-3 px-3.5 text-sm" style={{ borderBottom: i < deptRows.length - 1 ? `1px solid ${LINE}` : "none" }}>{r.head}</td>
                        <td className="py-3 px-3.5 text-sm" style={{ borderBottom: i < deptRows.length - 1 ? `1px solid ${LINE}` : "none" }}>{r.count}</td>
                        <td className="py-3 px-3.5 text-sm" style={{ fontFamily: "'JetBrains Mono', monospace", borderBottom: i < deptRows.length - 1 ? `1px solid ${LINE}` : "none" }}>{r.budget ? r.budget.toLocaleString() : "-"}</td>
                      </tr>
                    )) : (
                      <tr><td colSpan={5} className="py-8 text-center text-sm" style={{ color: INK_SOFT }}>No department data</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {activeTab === "Operational" && (
            <>
              <div className="grid grid-cols-4 gap-4">
                <StatCard icon={CheckCircle2} tint={EMERALD_100} color={EMERALD} label="Present Today" value={attendanceStats.present_today ?? null} sub={`of ${attendanceStats.total_employees ?? totalEmployees ?? "-"} employees`} />
                <StatCard icon={Users} tint={RED_100} color={RED} label="Absent Today" value={attendanceStats.absent_today ?? null} />
                <StatCard icon={Clock} tint={BLUE_100} color={BLUE} label="Late Arrivals" value={attendanceStats.late_arrivals ?? null} trend={attendanceStats.late_arrivals > 0 ? "down" : "flat"} trendLabel={attendanceStats.late_arrivals != null ? `${attendanceStats.late_arrivals}` : null} />
                <StatCard icon={FileText} tint={NAVY_100} color={NAVY} label="On Leave Today" value={leaveStats.on_leave_today ?? attendanceStats.on_leave ?? null} />
              </div>

              <div className="grid grid-cols-4 gap-4 mt-4">
                <StatCard icon={TrendingUp} tint={BLUE_100} color={BLUE} label="Attendance %" value={attendanceStats.attendance_percentage != null ? `${attendanceStats.attendance_percentage}%` : null} />
                <StatCard icon={Timer} tint={NAVY_100} color={NAVY} label="Avg. Working Hours" value={attendanceStats.avg_working_hours ?? null} />
                <StatCard icon={Target} tint={EMERALD_100} color={EMERALD} label="Remote / WFH" value={attendanceStats.remote ?? leaveStats.wfh ?? null} />
                <StatCard icon={Clock} tint={RED_100} color={RED} label="Overtime Hours" value={attendanceStats.overtime ?? null} />
              </div>

              <div className="grid grid-cols-2 gap-4.5 mt-5">
                <Panel title="Attendance Trend" subtitle="Present vs absent across recent days">
                  {attendanceTrend.length > 0 ? (
                    <ResponsiveContainer width="100%" height={240}>
                      <BarChart data={attendanceTrend}>
                        <CartesianGrid vertical={false} stroke="rgba(10,17,40,0.05)" />
                        <XAxis dataKey="name" tick={{ fill: INK_SOFT, fontSize: 10.5 }} axisLine={false} tickLine={false} />
                        <YAxis tick={{ fill: INK_SOFT, fontSize: 11 }} axisLine={false} tickLine={false} />
                        <Bar dataKey="present" fill={EMERALD} radius={[5, 5, 0, 0]} maxBarSize={18} />
                        <Bar dataKey="absent" fill={RED} radius={[5, 5, 0, 0]} maxBarSize={18} />
                      </BarChart>
                    </ResponsiveContainer>
                  ) : (
                    <EmptyState label="No attendance trend data" height={240} />
                  )}
                </Panel>

                <Panel title="Shift Distribution" subtitle="Employees mapped per shift">
                  {shiftMix.length > 0 ? (
                    <ResponsiveContainer width="100%" height={240}>
                      <BarChart data={shiftMix} layout="vertical">
                        <CartesianGrid horizontal={false} stroke="rgba(10,17,40,0.05)" />
                        <XAxis type="number" tick={{ fill: INK_SOFT, fontSize: 11 }} axisLine={false} tickLine={false} />
                        <YAxis type="category" dataKey="name" width={92} tick={{ fill: INK_SOFT, fontSize: 10.5 }} axisLine={false} tickLine={false} />
                        <Bar dataKey="value" fill={NAVY} radius={[0, 7, 7, 0]} maxBarSize={22} />
                      </BarChart>
                    </ResponsiveContainer>
                  ) : (
                    <EmptyState label="No shift data" height={240} />
                  )}
                </Panel>
              </div>

              <div className="grid grid-cols-2 gap-4.5 mt-4.5">
                <Panel title="Leave Pipeline" subtitle="Requests by status">
                  <MetricBar label="Total requests" value={leaveStats.total_requests} suffix="" color={NAVY} />
                  <MetricBar label="Approved" value={leaveStats.approved_requests} suffix="" color={EMERALD} />
                  <MetricBar label="Pending" value={leaveStats.pending_requests} suffix="" color={BLUE} />
                  <MetricBar label="Rejected" value={leaveStats.rejected_requests} suffix="" color={RED} />
                  <div className="flex items-center justify-between mt-4 pt-3.5 text-xs font-semibold" style={{ borderTop: `1px solid ${LINE}` }}>
                    <span style={{ color: INK_SOFT }}>Total days taken</span>
                    <span style={{ fontFamily: "'JetBrains Mono', monospace" }}>{leaveStats.total_days_taken ?? "-"}</span>
                  </div>
                </Panel>

                <Panel title="Recruitment Funnel" subtitle={openPositions != null ? `${openPositions} open roles` : "Candidate pipeline"}>
                  {funnel.length > 0 ? funnel.map((f, i) => (
                    <div key={i} className="flex items-center gap-3 mb-3 last:mb-0">
                      <div className="w-24 text-xs font-semibold shrink-0">{f.stage}</div>
                      <div className="h-[26px] rounded-lg flex items-center px-2.5 text-white text-[11.5px] font-bold" style={{ width: `${f.pct}%`, background: f.color }}>{f.count} candidates</div>
                    </div>
                  )) : (
                    <EmptyState label="No recruitment data" />
                  )}
                </Panel>
              </div>
            </>
          )}

          {activeTab === "Performance" && (
            <>
              <div className="grid grid-cols-4 gap-4">
                <StatCard icon={TrendingUp} tint={EMERALD_100} color={EMERALD} label="Avg. Performance Score" value={performanceStats.avg_performance_score ?? null} />
                <StatCard icon={Target} tint={BLUE_100} color={BLUE} label="Goal Completion" value={performanceStats.goal_completion_rate != null ? `${performanceStats.goal_completion_rate}%` : null} />
                <StatCard icon={CheckCircle2} tint={NAVY_100} color={NAVY} label="Review Completion" value={performanceStats.review_completion_rate != null ? `${performanceStats.review_completion_rate}%` : null} />
                <StatCard icon={BarChart3} tint={BLUE_100} color={BLUE} label="Avg. Rating" value={performanceStats.avg_rating ?? null} />
              </div>

              <div className="grid grid-cols-2 gap-4.5 mt-5">
                <Panel title="Completion Progress" subtitle="Goals, reviews and appraisals">
                  <MetricBar label="Goal completion rate" value={performanceStats.goal_completion_rate} color={EMERALD} />
                  <MetricBar label="Review completion rate" value={performanceStats.review_completion_rate} color={BLUE} />
                  <MetricBar label="Performance score" value={performanceStats.avg_performance_score} color={NAVY} />
                  <MetricBar label="Average rating" value={performanceStats.avg_rating} suffix=" / 5" color="#F59E0B" />
                </Panel>

                <Panel title="Reviews &amp; Goals" subtitle="Cycle volume and outstanding work">
                  <MetricBar label="Reviews completed" value={performanceStats.completed_reviews} suffix={` / ${performanceStats.total_reviews ?? "-"}`} color={EMERALD} />
                  <MetricBar label="Reviews pending" value={performanceStats.pending_reviews} suffix="" color={RED} />
                  <MetricBar label="Goals completed" value={performanceStats.completed_goals} suffix={` / ${performanceStats.total_goals ?? "-"}`} color={BLUE} />
                </Panel>
              </div>

              <div className="grid grid-cols-2 gap-4.5 mt-4.5">
                <Panel title="Cycle Totals" subtitle="Feedback, appraisals and ratings in the current cycle">
                  <div className="grid grid-cols-2 gap-4">
                    {[
                      { label: "Feedback", value: performanceStats.total_feedback ?? performanceStats.feedback_count },
                      { label: "Appraisals", value: performanceStats.total_appraisals },
                      { label: "Pending appraisals", value: performanceStats.pending_appraisals },
                    ].map((m) => (
                      <div key={m.label}>
                        <div className="text-lg font-bold" style={{ fontFamily: "'JetBrains Mono', monospace" }}>{m.value ?? "—"}</div>
                        <div className="text-[11px] font-medium" style={{ color: INK_SOFT }}>{m.label}</div>
                      </div>
                    ))}
                  </div>
                </Panel>
              </div>
            </>
          )}

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

      {addOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/40 backdrop-blur-sm p-4" onClick={() => setAddOpen(false)}>
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]" onClick={(e) => e.stopPropagation()}>
            <div className="bg-gradient-to-r from-blue-600 to-blue-700 px-6 py-5 flex justify-between items-center">
              <div>
                <h2 className="text-lg font-bold text-white">Add Employee</h2>
                <p className="text-xs text-blue-100 mt-0.5">Creates a directory record and a portal login. A temporary password is generated and e-mailed; no password is needed here.</p>
              </div>
              <button onClick={() => setAddOpen(false)} className="text-blue-200 hover:text-white transition-colors cursor-pointer" aria-label="Close"><X className="w-5 h-5" /></button>
            </div>

            <div className="p-6 overflow-y-auto">
              <form id="add-employee-form" onSubmit={handleAddSubmit} noValidate className="space-y-5">
                {formErrors.submit && (
                  <div className="text-red-700 text-sm font-semibold bg-red-50 border border-red-200 px-4 py-3 rounded-xl">{formErrors.submit}</div>
                )}

                <div className="grid grid-cols-2 gap-4">
                  <Field label="First Name" required error={formErrors.first_name}>
                    <input type="text" value={form.first_name} onChange={updateForm("first_name")} placeholder="e.g. Aarav"
                      className={fieldClass(!!formErrors.first_name)} />
                  </Field>
                  <Field label="Last Name" required error={formErrors.last_name}>
                    <input type="text" value={form.last_name} onChange={updateForm("last_name")} placeholder="e.g. Sharma"
                      className={fieldClass(!!formErrors.last_name)} />
                  </Field>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <Field label="Email" required error={formErrors.email}>
                    <input type="email" value={form.email} onChange={updateForm("email")} placeholder="name@company.com"
                      className={fieldClass(!!formErrors.email)} />
                  </Field>
                  <Field label="Phone" error={formErrors.phone}>
                    <input type="tel" value={form.phone} onChange={updateForm("phone")} placeholder="Optional, e.g. +91 9876543210"
                      className={fieldClass(!!formErrors.phone)} />
                  </Field>
                </div>

                <Field label="Job Title" required error={formErrors.job_title}>
                  <input type="text" value={form.job_title} onChange={updateForm("job_title")} placeholder="e.g. Software Engineer"
                    className={fieldClass(!!formErrors.job_title)} />
                </Field>

                <div className="grid grid-cols-2 gap-4">
                  <Field label="Department">
                    <select value={form.department_id} onChange={updateForm("department_id")} className={fieldClass(false)}>
                      <option value="">Select department</option>
                      {departmentOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  </Field>
                  <Field label="Designation">
                    <select value={form.designation_id} onChange={updateForm("designation_id")} className={fieldClass(false)}>
                      <option value="">Select designation</option>
                      {designationOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  </Field>
                </div>

                <Field label="Employment Type">
                  <select value={form.employment_type} onChange={updateForm("employment_type")} className={fieldClass(false)}>
                    {EMPLOYMENT_TYPES.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </Field>

                <div className="grid grid-cols-3 gap-4">
                  <Field label="Date of Joining" required error={formErrors.date_of_joining}>
                    <input type="date" value={form.date_of_joining} onChange={updateForm("date_of_joining")} className={fieldClass(!!formErrors.date_of_joining)} />
                  </Field>
                  <Field label="Basic Salary" error={formErrors.basic_salary}>
                    <input type="number" min="0" step="0.01" value={form.basic_salary} onChange={updateForm("basic_salary")} placeholder="0.00"
                      className={fieldClass(!!formErrors.basic_salary)} />
                  </Field>
                  <Field label="CTC" error={formErrors.ctc}>
                    <input type="number" min="0" step="0.01" value={form.ctc} onChange={updateForm("ctc")} placeholder="0.00"
                      className={fieldClass(!!formErrors.ctc)} />
                  </Field>
                </div>
              </form>
            </div>

            <div className="p-5 border-t border-gray-100 bg-gray-50 flex justify-end gap-3 mt-auto">
              <button type="button" onClick={() => setAddOpen(false)}
                className="px-5 py-2.5 text-sm font-bold text-gray-600 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors shadow-sm cursor-pointer">
                Cancel
              </button>
              <button type="submit" form="add-employee-form" disabled={saving}
                className="flex justify-center items-center gap-2 min-w-[150px] px-5 py-2.5 text-sm font-bold bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white rounded-xl transition-colors shadow-sm cursor-pointer">
                {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                {saving ? "Saving..." : "Add Employee"}
              </button>
            </div>
          </div>
        </div>
      )}

      {reportsOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/40 backdrop-blur-sm p-4" onClick={() => setReportsOpen(false)}>
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-3xl overflow-hidden flex flex-col max-h-[90vh]" onClick={(e) => e.stopPropagation()}>
            <div className="bg-gradient-to-r from-[#0A1128] to-[#1A2744] px-6 py-5 flex justify-between items-center">
              <div>
                <h2 className="text-lg font-bold text-white">Reports &amp; Analytics</h2>
                <p className="text-xs text-white/60 mt-0.5">Jump into any HR report workspace.</p>
              </div>
              <button onClick={() => setReportsOpen(false)} className="text-white/60 hover:text-white transition-colors cursor-pointer" aria-label="Close"><X className="w-5 h-5" /></button>
            </div>

            <div className="p-6 overflow-y-auto grid grid-cols-2 gap-3.5">
              {REPORT_LINKS.map((r) => (
                <button key={r.href} onClick={() => goToReport(r.href)}
                  className="text-left rounded-2xl border p-4 transition hover:-translate-y-0.5 hover:border-blue-400 cursor-pointer"
                  style={{ background: "#fff", borderColor: LINE, boxShadow: cardShadow }}>
                  <div className="flex items-center gap-2.5 mb-2">
                    <div className="w-8 h-8 rounded-[9px] flex items-center justify-center shrink-0" style={{ background: BLUE_100, color: BLUE }}><r.icon size={15} /></div>
                    <div className="text-sm font-bold" style={{ fontFamily: "'Sora', sans-serif" }}>{r.title}</div>
                    <ChevronRight size={15} className="ml-auto shrink-0" style={{ color: INK_SOFT }} />
                  </div>
                  <p className="text-xs" style={{ color: INK_SOFT }}>{r.description}</p>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
