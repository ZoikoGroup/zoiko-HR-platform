import { useEffect, useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import {
  Activity,
  ArrowRight,
  BookOpen,
  Briefcase,
  Building2,
  CalendarCheck,
  ClipboardCheck,
  CreditCard,
  GraduationCap,
  LayoutDashboard,
  Package,
  UserPlus,
  Users,
} from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { getOrganizationDashboardStats, getOrganizationDetails } from "../../service/orgAdminService";
import { getLearningDashboard, getPerformanceDashboard, getRecruitmentDashboard } from "../../service/hrService";
import { ModuleLayout, PrimaryButton } from "../zoiko-hr/recruitment/ui";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const HR_ADMIN_NAV = [
  { label: "Dashboard", href: "/hr-admin/dashboard", icon: LayoutDashboard },
  { label: "My Organization", href: "/hr-admin/my-organization", icon: Building2 },
  { label: "Documents", href: "/hr-admin/documents", icon: ClipboardCheck },
];

const PAGE_OF_TITLE = { "HR Admin Dashboard": "Dashboard" };
const TONES = {
  blue: "bg-blue-50 text-blue-600",
  teal: "bg-teal-50 text-teal-600",
  violet: "bg-violet-50 text-violet-600",
  amber: "bg-amber-50 text-amber-600",
  slate: "bg-slate-100 text-slate-600",
};

const cardClass = "rounded-2xl border border-slate-200/80 bg-white shadow-sm shadow-slate-900/[0.03]";

function number(value) {
  if (value === null || value === undefined || value === "") return "—";
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed.toLocaleString() : String(value);
}

function money(value, currency) {
  if (value === null || value === undefined || value === "") return "—";
  const amount = Number(value);
  if (!Number.isFinite(amount)) return String(value);
  if (!/^[A-Z]{3}$/.test(currency || "")) return amount.toLocaleString();
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
    }).format(amount);
  } catch {
    return amount.toLocaleString();
  }
}

function currentDate() {
  return new Intl.DateTimeFormat(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(new Date());
}

function localDateISO() {
  const date = new Date();
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 10);
}

function greeting() {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

function MetricCard({ icon: Icon, label, value, detail, tone = "blue", to, compact = false }) {
  const content = (
    <>
      <div className="flex items-start justify-between gap-3">
        <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${TONES[tone] || TONES.blue}`}>
          <Icon className="h-5 w-5" aria-hidden="true" />
        </span>
        {to && <ArrowRight className="mt-1 h-4 w-4 text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-blue-600" aria-hidden="true" />}
      </div>
      <div className={compact ? "mt-4" : "mt-5"}>
        <p className="text-sm font-medium text-slate-500">{label}</p>
        <p className={`${compact ? "mt-1 text-2xl" : "mt-1.5 text-3xl"} font-semibold tracking-tight text-slate-950`}>{value}</p>
        {detail && <p className="mt-1 text-xs leading-5 text-slate-500">{detail}</p>}
      </div>
    </>
  );

  if (to) {
    return (
      <NavLink to={to} className={`${cardClass} group block p-4 transition hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-md ${compact ? "sm:p-4" : "sm:p-5"}`}>
        {content}
      </NavLink>
    );
  }
  return <div className={`${cardClass} p-4 ${compact ? "sm:p-4" : "sm:p-5"}`}>{content}</div>;
}

function PanelHeading({ title, description, action }) {
  return (
    <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
      <div>
        <h2 className="text-base font-semibold tracking-tight text-slate-900">{title}</h2>
        {description && <p className="mt-1 text-sm text-slate-500">{description}</p>}
      </div>
      {action}
    </div>
  );
}

function EmptyChart({ children = "No data available for this period." }) {
  return <div className="grid h-56 place-items-center rounded-xl border border-dashed border-slate-200 bg-slate-50/70 px-6 text-center text-sm text-slate-500">{children}</div>;
}

function initials(name) {
  return (name || "?").split(/\s+/).filter(Boolean).map((part) => part[0]).join("").slice(0, 2).toUpperCase();
}

function statusTone(status) {
  const normalized = String(status || "").toLowerCase();
  if (normalized.includes("active") || normalized.includes("approved") || normalized === "done") return "bg-emerald-50 text-emerald-700 ring-emerald-600/10";
  if (normalized.includes("leave") || normalized.includes("pending") || normalized.includes("review")) return "bg-amber-50 text-amber-700 ring-amber-600/10";
  if (normalized.includes("reject") || normalized.includes("inactive") || normalized.includes("cancel")) return "bg-rose-50 text-rose-700 ring-rose-600/10";
  return "bg-slate-100 text-slate-600 ring-slate-500/10";
}

export default function HrAdminDashboardPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [stats, setStats] = useState(null);
  const [learningStats, setLearningStats] = useState(null);
  const [performanceStats, setPerformanceStats] = useState(null);
  const [recruitmentStats, setRecruitmentStats] = useState(null);
  const [organization, setOrganization] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let live = true;
    Promise.allSettled([
      getOrganizationDashboardStats(),
      getLearningDashboard(),
      getPerformanceDashboard(),
      getRecruitmentDashboard(),
      getOrganizationDetails(),
    ]).then(([dashboard, learning, performance, recruitment, org]) => {
      if (!live) return;
      if (dashboard.status === "fulfilled") setStats(dashboard.value);
      else setError(dashboard.reason?.message || "The workforce dashboard could not be loaded.");
      if (learning.status === "fulfilled") setLearningStats(learning.value);
      if (performance.status === "fulfilled") setPerformanceStats(performance.value);
      if (recruitment.status === "fulfilled") setRecruitmentStats(recruitment.value);
      if (org.status === "fulfilled") setOrganization(org.value);
    }).finally(() => {
      if (live) setLoading(false);
    });
    return () => { live = false; };
  }, []);

  const displayName = user?.name || user?.full_name || "HR Admin";
  const orgName = organization?.name || user?.organization_name || "Your organization";
  const currency = organization?.currency || stats?.currency;
  const totalEmployees = stats?.total_employees;
  const activeEmployees = stats?.active_employees;
  const attendanceTrend = Array.isArray(stats?.attendance_trend) ? stats.attendance_trend : [];
  const departmentData = Array.isArray(stats?.department_headcount) ? stats.department_headcount : [];
  const payrollData = Array.isArray(stats?.payroll_by_department) ? stats.payroll_by_department : [];
  const recentApprovals = Array.isArray(stats?.recent_approvals) ? stats.recent_approvals : [];
  const recentEmployees = Array.isArray(stats?.recent_employees) ? stats.recent_employees : [];
  const openPositions = recruitmentStats?.total_open_positions ?? stats?.open_positions;

  const headerActions = (
    <PrimaryButton icon={UserPlus} onClick={() => navigate("/hr-admin/employees")}>
      Add employee
    </PrimaryButton>
  );

  return (
    <ModuleLayout
      module="HR Admin"
      items={HR_ADMIN_NAV}
      pageOfTitle={PAGE_OF_TITLE}
      title="HR Admin Dashboard"
      subtitle={`${orgName} · ${greeting().toLowerCase()}, ${displayName}`}
      actions={headerActions}
    >
      <div className="space-y-7">
        {error && (
          <div role="alert" className="flex items-start gap-3 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
            <Activity className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
            <div><p className="font-semibold">Dashboard data is unavailable</p><p className="mt-1 text-rose-700">{error}</p></div>
          </div>
        )}

        <section className={`${cardClass} relative overflow-hidden p-5 sm:p-7`} aria-labelledby="dashboard-welcome">
          <div aria-hidden="true" className="pointer-events-none absolute -right-12 -top-20 h-64 w-64 rounded-full bg-blue-100/80 blur-3xl" />
          <div className="relative flex flex-wrap items-end justify-between gap-5">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-blue-700">People operations</p>
              <h2 id="dashboard-welcome" className="mt-2 text-2xl font-semibold tracking-tight text-slate-950 sm:text-3xl">Your workforce, at a glance</h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">Review team activity, follow up on requests, and keep your organization moving.</p>
            </div>
            <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white/80 px-3.5 py-2.5 text-sm font-medium text-slate-600">
              <CalendarCheck className="h-4 w-4 text-blue-600" aria-hidden="true" />
              <time dateTime={localDateISO()}>{currentDate()}</time>
            </div>
          </div>
        </section>

        <section aria-labelledby="workforce-overview">
          <div className="mb-3 flex items-end justify-between gap-3">
            <div>
              <h2 id="workforce-overview" className="text-lg font-semibold tracking-tight text-slate-950">Workforce overview</h2>
              <p className="mt-1 text-sm text-slate-500">Key items that may need your attention.</p>
            </div>
            {loading && <span className="text-xs font-medium text-slate-400" role="status">Updating…</span>}
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <MetricCard icon={Users} label="Active employees" value={number(activeEmployees)} detail={`of ${number(totalEmployees)} total employees`} tone="blue" to="/hr-admin/employees" />
            <MetricCard icon={CalendarCheck} label="Pending leave requests" value={number(stats?.pending_leave_requests)} detail="Awaiting review" tone="amber" to="/zoiko-hr/leave" />
            <MetricCard icon={Activity} label="Checked in today" value={number(stats?.attendance_today)} detail="Attendance records for today" tone="teal" to="/zoiko-hr/attendance" />
            <MetricCard icon={Briefcase} label="Open positions" value={number(openPositions)} detail={recruitmentStats?.new_applicants == null ? "Across your hiring pipeline" : `${number(recruitmentStats.new_applicants)} new applicants`} tone="violet" to="/zoiko-hr/recruitment" />
          </div>
        </section>

        <section aria-labelledby="organization-metrics">
          <div className="mb-3">
            <h2 id="organization-metrics" className="text-lg font-semibold tracking-tight text-slate-950">Organization metrics</h2>
            <p className="mt-1 text-sm text-slate-500">A quick view across your HR functions.</p>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
            <MetricCard compact icon={Building2} label="HR admins" value={number(stats?.hr_admins)} tone="teal" to="/hr-admin/my-organization" />
            <MetricCard compact icon={Building2} label="Departments" value={number(stats?.departments)} tone="blue" to="/zoiko-hr/departments" />
            <MetricCard compact icon={Users} label="Designations" value={number(stats?.designations)} tone="slate" to="/zoiko-hr/designations" />
            <MetricCard compact icon={ClipboardCheck} label="Pending approvals" value={number(stats?.pending_approvals)} detail="Requests awaiting decision" tone="amber" to="/zoiko-hr/leave/requests" />
            <MetricCard compact icon={CreditCard} label="Monthly payroll" value={money(stats?.monthly_payroll, currency)} detail={currency || "Organization currency"} tone="violet" to="/payroll" />
            <MetricCard compact icon={Package} label="Assets" value={number(stats?.assets)} tone="amber" to="/zoiko-hr/assets" />
            <MetricCard compact icon={BookOpen} label="Learning courses" value={number(learningStats?.total_courses)} detail={learningStats?.enrolled == null ? undefined : `${number(learningStats.enrolled)} enrolled`} tone="blue" to="/hr-admin/learning" />
            <MetricCard compact icon={GraduationCap} label="Performance reviews" value={number(performanceStats?.total_reviews)} detail={performanceStats?.pending_reviews == null ? undefined : `${number(performanceStats.pending_reviews)} pending`} tone="teal" to="/hr-admin/performance" />
          </div>
        </section>

        <section className="grid grid-cols-1 gap-5 xl:grid-cols-2" aria-label="Workforce analytics">
          <div className={`${cardClass} p-5 sm:p-6`}>
            <PanelHeading title="Attendance trend" description="Daily attendance over the last two weeks." />
            {attendanceTrend.length ? (
              <ResponsiveContainer width="100%" height={250}>
                <AreaChart data={attendanceTrend} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
                  <defs>
                    <linearGradient id="hrAttendanceFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#2563eb" stopOpacity={0.2} />
                      <stop offset="100%" stopColor="#2563eb" stopOpacity={0.01} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid vertical={false} stroke="#e8edf4" strokeDasharray="4 4" />
                  <XAxis dataKey="day" tick={{ fontSize: 11, fill: "#64748b" }} tickLine={false} axisLine={false} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "#64748b" }} tickLine={false} axisLine={false} />
                  <Tooltip contentStyle={{ borderRadius: 12, borderColor: "#e2e8f0", boxShadow: "0 8px 24px rgba(15,23,42,.08)" }} />
                  <Area type="monotone" dataKey="present" name="Present" stroke="#2563eb" strokeWidth={2.5} fill="url(#hrAttendanceFill)" activeDot={{ r: 5 }} />
                </AreaChart>
              </ResponsiveContainer>
            ) : <EmptyChart>{loading ? "Loading attendance…" : "Attendance history will appear here when available."}</EmptyChart>}
          </div>

          <div className={`${cardClass} p-5 sm:p-6`}>
            <PanelHeading title="Headcount by department" description="Active employees grouped by department." />
            {departmentData.length ? (
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={departmentData} layout="vertical" margin={{ top: 0, right: 18, left: 4, bottom: 0 }}>
                  <CartesianGrid horizontal={false} stroke="#e8edf4" strokeDasharray="4 4" />
                  <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11, fill: "#64748b" }} tickLine={false} axisLine={false} />
                  <YAxis type="category" dataKey="name" width={100} tick={{ fontSize: 11, fill: "#475569" }} tickLine={false} axisLine={false} />
                  <Tooltip cursor={{ fill: "#f8fafc" }} contentStyle={{ borderRadius: 12, borderColor: "#e2e8f0" }} />
                  <Bar dataKey="count" name="Employees" fill="#3b82f6" radius={[0, 6, 6, 0]} maxBarSize={24} />
                </BarChart>
              </ResponsiveContainer>
            ) : <EmptyChart>{loading ? "Loading departments…" : "Department headcount will appear here when available."}</EmptyChart>}
          </div>

          <div className={`${cardClass} p-5 sm:p-6`}>
            <PanelHeading title="Payroll by department" description={currency ? `Monthly allocation in ${currency}.` : "Monthly payroll allocation by department."} />
            {payrollData.length ? (
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={payrollData} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
                  <CartesianGrid vertical={false} stroke="#e8edf4" strokeDasharray="4 4" />
                  <XAxis dataKey="dept" tick={{ fontSize: 11, fill: "#64748b" }} tickLine={false} axisLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: "#64748b" }} tickLine={false} axisLine={false} tickFormatter={(value) => Number(value).toLocaleString(undefined, { notation: "compact", maximumFractionDigits: 1 })} />
                  <Tooltip formatter={(value) => [money(value, currency), "Payroll"]} contentStyle={{ borderRadius: 12, borderColor: "#e2e8f0" }} />
                  <Bar dataKey="amount" name="Payroll" fill="#0f766e" radius={[6, 6, 0, 0]} maxBarSize={42} />
                </BarChart>
              </ResponsiveContainer>
            ) : <EmptyChart>{loading ? "Loading payroll…" : "Payroll distribution will appear here when available."}</EmptyChart>}
          </div>

          <div className={`${cardClass} p-5 sm:p-6`}>
            <PanelHeading
              title="Recent leave activity"
              description="Latest leave requests and their current status."
              action={<NavLink to="/zoiko-hr/leave" className="inline-flex items-center gap-1 text-sm font-semibold text-blue-700 hover:text-blue-800">View leave <ArrowRight className="h-4 w-4" aria-hidden="true" /></NavLink>}
            />
            {recentApprovals.length ? (
              <ul className="divide-y divide-slate-100">
                {recentApprovals.map((item, index) => (
                  <li key={`${item.name || "request"}-${index}`} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-slate-100 text-xs font-semibold text-slate-600">{item.initials || initials(item.name)}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-slate-800">{item.name || "Employee"}</span>
                      <span className="mt-0.5 block truncate text-xs text-slate-500">{item.meta || "Leave request"}</span>
                    </span>
                    <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset ${statusTone(item.badge)}`}>{item.badge || "Updated"}</span>
                  </li>
                ))}
              </ul>
            ) : <EmptyChart>{loading ? "Loading activity…" : "No recent leave activity."}</EmptyChart>}
          </div>
        </section>

        <section className={`${cardClass} overflow-hidden`} aria-labelledby="recent-employees-heading">
          <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-5 sm:px-6">
            <div>
              <h2 id="recent-employees-heading" className="text-base font-semibold tracking-tight text-slate-900">Recently added employees</h2>
              <p className="mt-1 text-sm text-slate-500">The newest additions to your organization.</p>
            </div>
            <NavLink to="/hr-admin/employees" className="inline-flex items-center gap-1.5 text-sm font-semibold text-blue-700 hover:text-blue-800">View employees <ArrowRight className="h-4 w-4" aria-hidden="true" /></NavLink>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-100">
              <thead className="bg-slate-50/80">
                <tr>
                  {["Employee", "Department", "Designation", "Status"].map((heading) => <th key={heading} scope="col" className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">{heading}</th>)}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {recentEmployees.length ? recentEmployees.map((employee, index) => (
                  <tr key={`${employee.name || "employee"}-${index}`} className="hover:bg-slate-50/70">
                    <td className="whitespace-nowrap px-5 py-3.5">
                      <div className="flex items-center gap-3">
                        <span className="grid h-9 w-9 place-items-center rounded-full bg-blue-50 text-xs font-semibold text-blue-700">{employee.initials || initials(employee.name)}</span>
                        <span className="text-sm font-medium text-slate-800">{employee.name || "—"}</span>
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-5 py-3.5 text-sm text-slate-600">{employee.dept || "—"}</td>
                    <td className="whitespace-nowrap px-5 py-3.5 text-sm text-slate-600">{employee.designation || "—"}</td>
                    <td className="whitespace-nowrap px-5 py-3.5"><span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset ${statusTone(employee.status)}`}>{employee.status || "Unknown"}</span></td>
                  </tr>
                )) : (
                  <tr><td colSpan={4} className="px-5 py-10 text-center text-sm text-slate-500">{loading ? "Loading employees…" : "No recently added employees."}</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section aria-label="Additional workforce indicators" className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className={`${cardClass} flex items-center gap-3 p-4`}><span className="grid h-10 w-10 place-items-center rounded-xl bg-teal-50 text-teal-600"><Activity className="h-5 w-5" aria-hidden="true" /></span><div><p className="text-xs font-medium text-slate-500">Average attendance</p><p className="mt-0.5 text-lg font-semibold text-slate-900">{stats?.average_attendance == null ? "—" : `${number(stats.average_attendance)}%`}</p></div></div>
          <div className={`${cardClass} flex items-center gap-3 p-4`}><span className="grid h-10 w-10 place-items-center rounded-xl bg-violet-50 text-violet-600"><Users className="h-5 w-5" aria-hidden="true" /></span><div><p className="text-xs font-medium text-slate-500">Average tenure</p><p className="mt-0.5 text-lg font-semibold text-slate-900">{stats?.average_tenure_years == null ? "—" : `${number(stats.average_tenure_years)} years`}</p></div></div>
          <NavLink to="/zoiko-hr/recruitment" className={`${cardClass} group flex items-center gap-3 p-4 transition hover:border-blue-200 hover:shadow-md`}><span className="grid h-10 w-10 place-items-center rounded-xl bg-blue-50 text-blue-600"><Briefcase className="h-5 w-5" aria-hidden="true" /></span><span className="min-w-0 flex-1"><span className="block text-xs font-medium text-slate-500">Hiring pipeline</span><span className="mt-0.5 block text-lg font-semibold text-slate-900">{number(openPositions)} open roles</span></span><ArrowRight className="h-4 w-4 text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-blue-600" aria-hidden="true" /></NavLink>
        </section>
      </div>
    </ModuleLayout>
  );
}
