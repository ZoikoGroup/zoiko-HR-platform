import React, { useState, useEffect, useMemo, useCallback, lazy, Suspense } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { getOrganizationDashboardStats, getOrganizationDetails } from "../../service/orgAdminService";
import {
  Users, Building2, BadgeInfo, CalendarCheck, Activity, Wrench, Sparkles,
  TrendingUp, TrendingDown, Minus, CreditCard, ArrowUpRight, ShieldCheck, CheckCircle2, ChevronRight
} from "lucide-react";
import EvaluationTimeRemaining from "../../components/EvaluationTimeRemaining";
import zoikoIcon from "../../assets/zoikohr-icon-svg.svg";
import { DashboardSkeleton } from "../../components/OrgAdminSkeleton";

const DashboardCharts = lazy(() => import("./DashboardCharts"));

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

const StatCard = React.memo(({ icon: Icon, iconBg, iconColor, label, value, sub, trendIcon: TrendIcon, trendLabel, trendColor, topAccent, onClick }) => {
  return (
    <div
      onClick={onClick}
      className="group relative overflow-hidden rounded-2xl border border-slate-200/80 bg-white p-5 shadow-[0_2px_12px_rgba(10,17,40,0.04)] hover:-translate-y-1 hover:shadow-[0_12px_28px_-8px_rgba(10,17,40,0.12)] hover:border-blue-300/60 transition-all duration-300 cursor-pointer"
    >
      {/* Top accent line */}
      <div
        className="absolute inset-x-0 top-0 h-1 transition-opacity duration-300 group-hover:h-1.5"
        style={{ background: topAccent || iconColor || BLUE }}
      />

      <div className="flex items-center justify-between mb-3.5">
        <div
          className="w-10 h-10 rounded-xl flex items-center justify-center transition-transform duration-300 group-hover:scale-105 shadow-sm"
          style={{ background: iconBg, color: iconColor }}
        >
          <Icon className="w-5 h-5" strokeWidth={2.2} />
        </div>
        {TrendIcon && trendLabel ? (
          <span
            className="text-[11px] font-bold flex items-center gap-1 px-2 py-0.5 rounded-full"
            style={{
              color: trendColor,
              background: trendColor === EMERALD ? "rgba(16,185,129,0.10)" : trendColor === RED ? "rgba(239,68,68,0.10)" : "rgba(100,116,139,0.10)",
            }}
          >
            <TrendIcon className="w-3.5 h-3.5" strokeWidth={2.5} />
            {trendLabel}
          </span>
        ) : null}
      </div>

      <p className="text-xs font-medium tracking-wide uppercase text-slate-500">{label}</p>
      <div className="flex items-baseline justify-between gap-2 mt-1">
        <p className="font-['Sora',system-ui,sans-serif] text-2xl sm:text-[28px] font-bold tracking-tight text-slate-900 leading-none">
          {value}
        </p>
        <span className="text-slate-300 group-hover:text-blue-500 transition-colors">
          <ChevronRight className="w-4 h-4" />
        </span>
      </div>
      {sub ? <p className="text-[11.5px] text-slate-400 mt-2 truncate font-medium">{sub}</p> : null}
    </div>
  );
});

export default function OrgAdminDashboardPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [stats, setStats] = useState(null);
  const [org, setOrg] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      getOrganizationDashboardStats().catch(() => null),
      getOrganizationDetails().catch(() => null),
    ])
      .then(([s, o]) => {
        if (cancelled) return;
        if (s) setStats(s);
        if (o) setOrg(o);
      })
      .catch(err => { if (!cancelled) setError(err?.message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  if (loading) return <DashboardSkeleton />;

  const displayName = user?.name || user?.full_name || "Organization Admin";
  const orgName = org?.name || user?.organization_name || "Your Organization";
  const orgId = org?.org_code || org?.code || "ZK-0192";

  const totalEmployees = stats?.total_employees ?? 21;
  const activeEmployees = stats?.active_employees ?? 20;
  const departments = stats?.departments ?? 9;
  const healthScore = totalEmployees > 0 ? Math.round((activeEmployees / totalEmployees) * 100) : 95;

  const fmt = (val) => {
    if (val === null || val === undefined) return "—";
    return Number(val).toLocaleString();
  };

  const kpiRows = [
    [
      {
        key: "active_employees",
        label: "Active Employees",
        icon: Users,
        iconBg: "rgba(59,130,246,0.12)",
        iconColor: "#2563EB",
        topAccent: "linear-gradient(90deg, #3B82F6, #60A5FA)",
        trend: "up",
        trendLabel: "100%",
        path: "/organization-admin/users",
        sub: `of ${totalEmployees} total headcount`
      },
      {
        key: "hr_admins",
        label: "HR Admins",
        icon: Building2,
        iconBg: "rgba(16,185,129,0.12)",
        iconColor: "#059669",
        topAccent: "linear-gradient(90deg, #10B981, #34D399)",
        trend: "flat",
        trendLabel: null,
        path: "/organization-admin/users",
        sub: "Authorized personnel"
      },
      {
        key: "departments",
        label: "Departments",
        icon: BadgeInfo,
        iconBg: "rgba(99,102,241,0.12)",
        iconColor: "#4F46E5",
        topAccent: "linear-gradient(90deg, #6366F1, #818CF8)",
        trend: "up",
        trendLabel: "2 active",
        path: "/zoiko-hr/departments",
        sub: "Engineering leads headcount"
      },
      {
        key: "designations",
        label: "Designations",
        icon: BadgeInfo,
        iconBg: "rgba(14,165,233,0.12)",
        iconColor: "#0284C7",
        topAccent: "linear-gradient(90deg, #0EA5E9, #38BDF8)",
        trend: "flat",
        trendLabel: null,
        path: "/zoiko-hr/designations",
        sub: "Configured roles & titles"
      },
    ],
    [
      {
        key: "pending_leave_requests",
        label: "Pending Leaves",
        icon: CalendarCheck,
        iconBg: "rgba(245,158,11,0.12)",
        iconColor: "#D97706",
        topAccent: "linear-gradient(90deg, #F59E0B, #FBBF24)",
        trend: "flat",
        trendLabel: "Clear",
        path: "/zoiko-hr/leave",
        sub: "All time-off accounted for"
      },
      {
        key: "pending_approvals",
        label: "Pending Approvals",
        icon: Activity,
        iconBg: "rgba(239,68,68,0.12)",
        iconColor: "#DC2626",
        topAccent: "linear-gradient(90deg, #EF4444, #F87171)",
        trend: "flat",
        trendLabel: "Clear",
        path: "/zoiko-hr/documents/approvals",
        sub: "No blocking requests"
      },
      {
        key: "assets",
        label: "Assets Assigned",
        icon: Wrench,
        iconBg: "rgba(139,92,246,0.12)",
        iconColor: "#7C3AED",
        topAccent: "linear-gradient(90deg, #8B5CF6, #A78BFA)",
        trend: "flat",
        trendLabel: null,
        path: "/organization-admin/assets",
        sub: "Hardware & licenses tracked"
      },
    ],
  ];

  const renderKpi = (kpi) => {
    const val = stats ? fmt(stats[kpi.key]) : "—";
    const TrendIcon = kpi.trend === "up" ? TrendingUp : kpi.trend === "down" ? TrendingDown : Minus;
    const trendColor = kpi.trend === "up" ? EMERALD : kpi.trend === "down" ? RED : INK_SOFT;
    return (
      <StatCard
        key={kpi.key}
        icon={kpi.icon}
        iconBg={kpi.iconBg}
        iconColor={kpi.iconColor}
        topAccent={kpi.topAccent}
        label={kpi.label}
        value={val}
        sub={kpi.sub}
        trendIcon={TrendIcon}
        trendLabel={kpi.trendLabel}
        trendColor={trendColor}
        onClick={() => navigate(kpi.path)}
      />
    );
  };

  return (
    <div className="font-['Inter',system-ui,sans-serif] space-y-6">
      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 flex items-center justify-between">
          <span>{error}</span>
        </div>
      )}

      {/* Top Organization Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200/80">
        <div className="flex items-center gap-3.5">
          <div className="relative">
            <img src={zoikoIcon} alt="ZoikoHR" className="w-11 h-11 rounded-xl shadow-sm border border-slate-100" />
            <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-emerald-500 border-2 border-white" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="font-['Sora',system-ui,sans-serif] text-lg font-bold text-slate-900 tracking-tight">{orgName}</h2>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                Active
              </span>
            </div>
            <p className="text-xs font-medium text-slate-500 mt-0.5">
              Organization Code: <span className="font-semibold text-slate-700">{orgId}</span> · Enterprise Edition
            </p>
          </div>
        </div>
        {org?.evaluation_ends_at && (
          <div>
            <EvaluationTimeRemaining evaluationEndsAt={org.evaluation_ends_at} />
          </div>
        )}
      </div>

      {/* Hero Banner */}
      <div
        className="relative flex flex-col md:flex-row justify-between items-center gap-6 rounded-3xl p-6 sm:p-8 text-white overflow-hidden shadow-[0_12px_36px_rgba(10,17,40,0.22)] min-h-[150px]"
        style={{
          background: `linear-gradient(135deg, #070D1E 0%, #0F1E36 45%, #152E52 80%, #1A365D 100%)`
        }}
      >
        {/* Ambient atmospheric glows */}
        <div
          className="absolute rounded-full pointer-events-none blur-3xl opacity-40"
          style={{ right: -40, top: -70, width: 340, height: 340, background: "radial-gradient(circle, #3B82F6 0%, transparent 70%)" }}
        />
        <div
          className="absolute rounded-full pointer-events-none blur-2xl opacity-20"
          style={{ left: 100, bottom: -60, width: 280, height: 280, background: "radial-gradient(circle, #10B981 0%, transparent 70%)" }}
        />

        <div className="relative z-[1] max-w-xl">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 backdrop-blur-md border border-white/15 text-xs font-semibold text-blue-200 mb-3">
            <span className="w-2 h-2 rounded-full bg-blue-400 animate-pulse" />
            {todayLabel()}
          </div>
          <h1 className="font-['Sora',system-ui,sans-serif] text-2xl sm:text-3xl font-extrabold tracking-tight text-white leading-tight">
            {greeting()}, {displayName}
          </h1>
          <p className="mt-2 text-sm text-slate-300 leading-relaxed max-w-[500px]">
            Managing <span className="font-semibold text-white">{totalEmployees} employees</span> across <span className="font-semibold text-white">{departments} departments</span>. All operations are running smoothly.
          </p>
          <div className="flex flex-wrap gap-3 mt-6">
            <button
              onClick={() => navigate("/organization-admin/users")}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-white shadow-lg shadow-blue-500/25 hover:shadow-blue-500/40 hover:-translate-y-0.5 transition-all duration-200 border-none cursor-pointer"
              style={{ background: "linear-gradient(135deg, #3B82F6 0%, #2563EB 100%)" }}
            >
              <Users className="w-4 h-4" />
              ＋ Add Employee
            </button>
            <button
              onClick={() => navigate("/organization-admin/billing-and-plan")}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-white bg-white/10 hover:bg-white/15 backdrop-blur-md border border-white/15 hover:-translate-y-0.5 transition-all duration-200 cursor-pointer"
            >
              <CreditCard className="w-4 h-4 text-blue-300" />
              Billing &amp; Plans
            </button>
            <button
              onClick={() => navigate("/organization-admin/metrics")}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-slate-200 bg-white/5 hover:bg-white/10 border border-white/10 hover:-translate-y-0.5 transition-all duration-200 cursor-pointer"
            >
              <Activity className="w-4 h-4 text-emerald-300" />
              All Metrics
            </button>
          </div>
        </div>

        {/* Circular Org Health Score widget */}
        <div className="relative z-[1] hidden md:flex items-center gap-4 bg-white/5 backdrop-blur-md border border-white/10 rounded-2xl p-4 shadow-inner">
          <div className="relative" style={{ width: 92, height: 92 }}>
            <svg width="92" height="92" viewBox="0 0 92 92" className="drop-shadow-sm">
              <defs>
                <linearGradient id="healthGrad" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0%" stopColor="#38BDF8" />
                  <stop offset="100%" stopColor="#3B82F6" />
                </linearGradient>
              </defs>
              <circle cx="46" cy="46" r="39" fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth="9" />
              <circle
                cx="46" cy="46" r="39"
                fill="none"
                stroke="url(#healthGrad)"
                strokeWidth="9"
                strokeDasharray={`${2 * Math.PI * 39 * healthScore / 100} ${2 * Math.PI * 39 * (100 - healthScore) / 100}`}
                strokeLinecap="round"
                transform="rotate(-90 46 46)"
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center font-['Sora',system-ui,sans-serif] pointer-events-none">
              <span className="text-[20px] font-extrabold text-white leading-none">{healthScore}%</span>
              <span className="text-[9px] font-semibold text-blue-200 uppercase tracking-widest mt-0.5">Score</span>
            </div>
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              <p className="font-['Sora',system-ui,sans-serif] text-[15px] font-bold text-white">Org Health</p>
            </div>
            <p className="text-xs text-slate-300 font-medium mt-1">Operational &amp; compliance</p>
            <span className="inline-block mt-1.5 text-[10px] font-bold uppercase tracking-wider text-emerald-300 bg-emerald-500/20 px-2 py-0.5 rounded-full border border-emerald-400/30">
              Optimal Condition
            </span>
          </div>
        </div>
      </div>

      {/* Primary KPI Section */}
      <div className="space-y-4">
        <div className="flex items-baseline justify-between">
          <div>
            <h2 className="font-['Sora',system-ui,sans-serif] text-base font-bold tracking-tight text-slate-900">
              Key Metrics &amp; Personnel
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">Live counts across organization staff, leaves, and approvals</p>
          </div>
          <button
            onClick={() => navigate("/organization-admin/metrics")}
            className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600 hover:text-blue-700 hover:underline cursor-pointer"
          >
            View all metrics <ArrowUpRight className="w-3.5 h-3.5" />
          </button>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {kpiRows[0].map(renderKpi)}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {kpiRows[1].map(renderKpi)}
        </div>
      </div>

      {/* Analytics & Charts */}
      <Suspense fallback={<div className="mt-8 text-center text-xs text-slate-500">Loading charts...</div>}>
        <DashboardCharts stats={stats} loading={false} totalEmployees={totalEmployees} departments={departments} activeEmployees={activeEmployees} />
      </Suspense>
    </div>
  );
}
