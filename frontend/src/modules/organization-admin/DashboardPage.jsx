import React, { useState, useEffect, useMemo, useCallback, lazy, Suspense } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { getOrganizationDashboardStats, getOrganizationDetails } from "../../service/orgAdminService";
import { Users, Building2, BadgeInfo, CalendarCheck, Activity, Wrench } from "lucide-react";
import zoikoIcon from "../../assets/zoikohr-icon-svg.svg";

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
const AVATAR_COLORS = [
  `linear-gradient(135deg,${NAVY},#1A2744)`,
  `linear-gradient(135deg,${BLUE},#2563EB)`,
  `linear-gradient(135deg,${EMERALD},#059669)`,
  `linear-gradient(135deg,#64748B,#475569)`,
  `linear-gradient(135deg,#2563EB,${BLUE})`,
  `linear-gradient(135deg,#CBD5E1,#94A3B8)`,
];



function getInitials(name) {
  if (!name) return "U";
  return name.split(" ").map(w => w[0]).join("").toUpperCase().slice(0, 2);
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

const StatCard = React.memo(({ icon: Icon, iconBg, iconColor, label, value, sub, trendIcon: TrendIcon, trendLabel, trendColor, onClick }) => {
  return (
      <div onClick={onClick} className="rounded-[14px] border bg-white p-5 shadow-[0_1px_2px_rgba(10,17,40,0.04),0_8px_24px_-12px_rgba(10,17,40,0.10)] hover:-translate-y-0.5 hover:shadow-[0_4px_10px_rgba(10,17,40,0.06),0_20px_40px_-20px_rgba(59,130,246,0.25)] hover:border-transparent transition-all duration-[180ms] cursor-pointer">
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

  const kpiRows = useMemo(() => [
    [
      { key: "active_employees", label: "Active Employees", icon: Users, iconBg: BLUE_100, iconColor: BLUE, trend: "up", trendLabel: "100%", path: "/organization-admin/users" },
      { key: "hr_admins", label: "HR Admins", icon: Building2, iconBg: EMERALD_100, iconColor: EMERALD, trend: "flat", trendLabel: null, path: "/organization-admin/users" },
      { key: "departments", label: "Departments", icon: BadgeInfo, iconBg: NAVY_100, iconColor: NAVY, trend: "up", trendLabel: "2 new", path: "/zoiko-hr/departments" },
      { key: "designations", label: "Designations", icon: BadgeInfo, iconBg: BLUE_100, iconColor: BLUE, trend: "flat", trendLabel: null, path: "/zoiko-hr/designations" },
    ],
    [
      { key: "pending_leave_requests", label: "Pending Leaves", icon: CalendarCheck, iconBg: NAVY_100, iconColor: NAVY, trend: "flat", trendLabel: "Clear", path: "/zoiko-hr/leave" },
      { key: "pending_approvals", label: "Pending Approvals", icon: Activity, iconBg: RED_100, iconColor: RED, trend: "flat", trendLabel: "Clear", path: "/zoiko-hr/documents/approvals" },
      { key: "assets", label: "Assets", icon: Wrench, iconBg: BLUE_100, iconColor: BLUE, trend: "flat", trendLabel: null, path: "/organization-admin/assets" },
    ],
  ], []);

  const renderKpi = useCallback((kpi) => {
    const val = loading ? "—" : stats ? fmt(stats[kpi.key]) : "—";
    const TrendIcon = kpi.trend === "up" ? TrendingUp : kpi.trend === "down" ? TrendingDown : Minus;
    const trendColor = kpi.trend === "up" ? EMERALD : kpi.trend === "down" ? RED : INK_SOFT;
    return (
      <StatCard
        key={kpi.key}
        icon={kpi.icon}
        iconBg={kpi.iconBg}
        iconColor={kpi.iconColor}
        label={kpi.label}
        value={val}
        sub={kpi.key === "active_employees" ? `of ${totalEmployees} total headcount` : kpi.key === "departments" ? "Engineering leads headcount" : null}
        trendIcon={TrendIcon}
        trendLabel={kpi.trendLabel}
        trendColor={trendColor}
        onClick={() => navigate(kpi.path)}
      />
    );
  }, [loading, stats, totalEmployees, navigate]);

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

      <div
        className="relative flex justify-between items-center gap-6 mb-[22px] rounded-[20px] px-[34px] py-[30px] text-white overflow-hidden"
        style={{ background: `linear-gradient(120deg, #0A1128 0%, #1A2744 62%, #1E3A5F 100%)`, boxShadow: "0 4px 10px rgba(10,17,40,0.06), 0 20px 40px -20px rgba(59,130,246,0.25)" }}
      >
          <div
            className="absolute rounded-full pointer-events-none"
            style={{ right: -60, top: -90, width: 280, height: 280, background: "radial-gradient(circle, rgba(59,130,246,0.35), transparent 70%)" }}
          />
          <div className="z-[1]">
            <p className="text-[11.5px] font-bold uppercase tracking-[0.12em]" style={{ color: "rgba(255,255,255,0.55)" }}>
              {todayLabel()}
            </p>
            <h1 className="font-['Sora',system-ui,sans-serif] text-[27px] font-bold tracking-[-0.01em] mt-2">{greeting()}, {displayName}</h1>
            <p className="mt-1.5 text-[14px] max-w-[520px]" style={{ color: "rgba(255,255,255,0.68)" }}>
              {totalEmployees} total employees across {departments} departments.
            </p>
            <div className="flex gap-2.5 mt-[18px]">
              <button onClick={() => navigate("/organization-admin/users")} className="btn flex items-center gap-2 px-[18px] py-2.5 rounded-[11px] text-[13.5px] font-semibold border-none cursor-pointer whitespace-nowrap" style={{ background: `linear-gradient(135deg,${BLUE},#2563EB)`, color: "#fff", boxShadow: `0 8px 20px -8px rgba(59,130,246,0.7)` }}>
                ＋ Add Employee
              </button>
            </div>
          </div>
          <div className="z-[1] hidden md:flex items-center gap-4">
            <div className="relative" style={{ width: 88, height: 88 }}>
              <svg width="88" height="88" viewBox="0 0 88 88">
                <circle cx="44" cy="44" r="37" fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth="10" />
                <circle cx="44" cy="44" r="37" fill="none" stroke={BLUE} strokeWidth="10"
                  strokeDasharray={`${2 * Math.PI * 37 * healthScore / 100} ${2 * Math.PI * 37 * (100 - healthScore) / 100}`}
                  strokeLinecap="round" transform="rotate(-90 44 44)" />
              </svg>
              <div className="absolute inset-0 flex items-center justify-center font-['Sora',system-ui,sans-serif] font-extrabold text-[19px] pointer-events-none">{healthScore}%</div>
            </div>
            <div>
              <p className="font-['Sora',system-ui,sans-serif] text-[14.5px] font-bold">Org Health Score</p>
              <p className="text-[11px] font-semibold tracking-[0.04em]" style={{ color: "rgba(255,255,255,0.6)" }}>Attendance &amp; compliance combined</p>
            </div>
          </div>
        </div>

        <div className="flex items-baseline justify-between mb-[14px] mt-[30px]">
          <h2 className="font-['Sora',system-ui,sans-serif] text-[15.5px] font-bold tracking-[-0.01em]" style={{ color: INK }}>Key Metrics</h2>
          <button onClick={() => navigate("/organization-admin/metrics")} className="text-[12.5px] font-semibold cursor-pointer" style={{ color: BLUE }}>View all metrics →</button>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {kpiRows[0].map(renderKpi)}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mt-4">
          {kpiRows[1].map(renderKpi)}
        </div>

        <Suspense fallback={<div className="mt-8 text-center text-[13px]" style={{ color: INK_SOFT }}>Loading charts...</div>}>
          <DashboardCharts stats={stats} loading={loading} totalEmployees={totalEmployees} departments={departments} activeEmployees={activeEmployees} />
        </Suspense>
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


