import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { getOrganizationDetailedMetrics } from "../../service/orgAdminService";
import { Users, Building2, BadgeInfo, CalendarCheck, Activity, CreditCard, Wrench, ArrowLeft, TrendingUp, TrendingDown, Minus, Briefcase, Clock, UserCheck, UserX, UserMinus, PieChart, Layers, DollarSign, Package, Percent, Hash, BarChart3, List } from "lucide-react";

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

function avatarBg(index) {
  return AVATAR_COLORS[index % AVATAR_COLORS.length];
}

function fmtCurrency(amount) {
  if (amount == null) return "\u2014";
  return `$${Number(amount).toLocaleString()}`;
}

function MiniStat({ icon: Icon, bg, iconColor, label, value, sub }) {
  return (
    <div className="rounded-[14px] border bg-white p-4 shadow-[0_1px_2px_rgba(24,20,51,0.04),0_8px_24px_-12px_rgba(24,20,51,0.10)]" style={{ borderColor: LINE }}>
      <div className="flex items-center gap-2.5 mb-2">
        <div className="w-[32px] h-[32px] rounded-[9px] flex items-center justify-center" style={{ background: bg || VIOLET_100 }}>
          <Icon className="w-4 h-4" strokeWidth={2.5} style={{ color: iconColor || VIOLET }} />
        </div>
        <span className="text-[11.5px] font-semibold" style={{ color: INK_SOFT }}>{label}</span>
      </div>
      <p className="text-[22px] font-bold tracking-[-0.01em]" style={{ color: INK }}>{value}</p>
      {sub ? <p className="text-[11px] mt-0.5" style={{ color: INK_SOFT }}>{sub}</p> : null}
    </div>
  );
}

function Card({ title, subtitle, icon: Icon, iconColor, children, className = "" }) {
  return (
    <div className={`rounded-[20px] border p-5 shadow-[0_1px_2px_rgba(24,20,51,0.04),0_8px_24px_-12px_rgba(24,20,51,0.10)] ${className}`} style={{ background: "#fff", borderColor: LINE }}>
      <div className="flex items-center gap-2 mb-4">
        {Icon ? <Icon className="w-[18px] h-[18px]" strokeWidth={2.5} style={{ color: iconColor || VIOLET }} /> : null}
        <div>
          <h3 className="font-['Sora',system-ui,sans-serif] text-[14.5px] font-bold" style={{ color: INK }}>{title}</h3>
          {subtitle ? <p className="text-[11.5px] mt-0.5" style={{ color: INK_SOFT }}>{subtitle}</p> : null}
        </div>
      </div>
      {children}
    </div>
  );
}

function SectionHeading({ title }) {
  return (
    <div className="flex items-baseline justify-between mb-[14px] mt-[28px] first:mt-0">
      <h2 className="font-['Sora',system-ui,sans-serif] text-[15.5px] font-bold tracking-[-0.01em]" style={{ color: INK }}>{title}</h2>
    </div>
  );
}

function ProgressBar({ value, color, bg = "#F6F5FA", height = "h-2" }) {
  return (
    <div className={`flex-1 ${height} rounded-full overflow-hidden`} style={{ background: bg }}>
      <div className={`${height} rounded-full`} style={{ width: `${Math.min(value, 100)}%`, background: color || VIOLET }} />
    </div>
  );
}

function StatusDot({ color, shadow }) {
  return (
    <span className="inline-block w-[7px] h-[7px] rounded-full mr-1.5 align-middle" style={{ background: color, boxShadow: `0 0 0 3px ${shadow || color}33` }} />
  );
}

export default function OrgAdminMetricsPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    getOrganizationDetailedMetrics()
      .then(res => { if (!cancelled) setData(res); })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  if (loading) {
    return (
      <div className="font-['Inter',system-ui,sans-serif] -m-4 sm:-m-6 lg:-m-8 p-4 sm:p-6 lg:p-8" style={{ background: "#F6F5FA", color: INK, minHeight: "calc(100vh - 4rem)" }}>
        <div className="text-center py-20 text-[13px]" style={{ color: INK_SOFT }}>Loading detailed metrics...</div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="font-['Inter',system-ui,sans-serif] -m-4 sm:-m-6 lg:-m-8 p-4 sm:p-6 lg:p-8" style={{ background: "#F6F5FA", color: INK, minHeight: "calc(100vh - 4rem)" }}>
        <div className="text-center py-20 text-[13px]" style={{ color: INK_SOFT }}>Unable to load metrics.</div>
      </div>
    );
  }

  const em = data.employee_metrics || {};
  const dm = data.department_metrics || {};
  const am = data.attendance_metrics || {};
  const lm = data.leave_metrics || {};
  const pm = data.payroll_metrics || {};
  const asm = data.asset_metrics || {};
  const dsb = data.designation_breakdown || [];

  return (
    <div className="font-['Inter',system-ui,sans-serif] -m-4 sm:-m-6 lg:-m-8 p-4 sm:p-6 lg:p-8" style={{ background: "#F6F5FA", color: INK, minHeight: "calc(100vh - 4rem)" }}>
      <button onClick={() => navigate("/organization-admin/dashboard")} className="flex items-center gap-1.5 text-[12.5px] font-semibold mb-4 cursor-pointer" style={{ color: VIOLET }}>
        <ArrowLeft className="w-3.5 h-3.5" strokeWidth={2.5} />
        Back to Dashboard
      </button>

      <div className="flex items-center gap-3 mb-4 pb-4" style={{ borderBottom: `1px solid ${LINE}` }}>
        <div className="w-10 h-10 rounded-[12px] flex items-center justify-center flex-shrink-0 overflow-hidden" style={{ background: "#270b87" }}>
          <svg viewBox="0 0 608.1 619.11" className="w-7 h-7">
            <rect x="24.76" y="30.27" width="558.57" height="558.57" rx="127.12" ry="127.12" fill="#270b87"/>
            <path fill="url(#favGrad1)" d="M383.03,121.69c0,93.43-76.04,169.47-169.47,169.47v-95.81c40.61,0,73.66-33.06,73.66-73.66h95.81Z"/>
            <path fill="url(#favGrad2)" d="M377.18,225.86v271.55c-52.94,0-95.81-42.91-95.81-95.81v-101.69c40.25-12.15,74.27-38.87,95.81-74.05Z"/>
            <path fill="url(#favGrad1)" d="M213.55,291.16v-95.81c40.61,0,73.66-33.06,73.66-73.66,0,0,32.7,86.49-73.66,169.47Z"/>
            <path fill="url(#favGrad2)" d="M377.18,411.88v85.53c-52.94,0-95.81-42.91-95.81-95.81v-101.51c0,4.75,1.13,104.99,95.81,111.79Z"/>
            <path fill="url(#favGrad3)" d="M377.18,225.86v271.55c-13.64,0-26.61-2.87-38.37-8.01v-219.89c15.16-12.22,28.17-26.96,38.37-43.65Z"/>
            <path fill="url(#favGrad3)" d="M383.03,121.69c0,93.43-76.04,169.47-169.47,169.47v-95.81s118.77,51.24,169.47-73.66Z"/>
            <defs>
              <linearGradient id="favGrad1" x1="435.94" y1="123.97" x2="167.83" y2="257.43" gradientUnits="userSpaceOnUse">
                <stop offset="0" stopColor="#00c5ff"/><stop offset="1" stopColor="#0070ff"/>
              </linearGradient>
              <linearGradient id="favGrad2" x1="293.19" y1="361.64" x2="380.16" y2="361.64" gradientUnits="userSpaceOnUse">
                <stop offset="0" stopColor="#fc4600"/><stop offset="1" stopColor="#ffb900"/>
              </linearGradient>
              <linearGradient id="favGrad3" x1="356.68" y1="226.07" x2="359.39" y2="497.59" gradientUnits="userSpaceOnUse">
                <stop offset="0" stopColor="#009cff"/><stop offset="1" stopColor="#000"/>
              </linearGradient>
            </defs>
          </svg>
        </div>
        <div>
          <p className="font-['Sora',system-ui,sans-serif] text-lg font-bold" style={{ color: INK }}>All Metrics</p>
          <p className="text-[12px] font-medium" style={{ color: INK_SOFT }}>Comprehensive view of your organization's key metrics and analytics</p>
        </div>
      </div>

      <SectionHeading title="Employee Overview" />
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3">
        <MiniStat icon={Users} bg={VIOLET_100} iconColor={VIOLET} label="Total Employees" value={em.total?.toLocaleString() ?? "\u2014"} />
        <MiniStat icon={UserCheck} bg={TEAL_100} iconColor={TEAL} label="Active" value={em.active?.toLocaleString() ?? "\u2014"} sub={`${em.total ? Math.round(em.active / em.total * 100) : 0}% of total`} />
        <MiniStat icon={UserMinus} bg={AMBER_100} iconColor={AMBER} label="On Leave" value={em.on_leave?.toLocaleString() ?? "\u2014"} />
        <MiniStat icon={UserX} bg={RED_100} iconColor={RED} label="Inactive" value={em.inactive?.toLocaleString() ?? "\u2014"} />
        <MiniStat icon={Building2} bg={VIOLET_100} iconColor={VIOLET} label="HR Admins" value={em.hr_admins?.toLocaleString() ?? "\u2014"} />
        <MiniStat icon={Briefcase} bg={TEAL_100} iconColor={TEAL} label="New Hires (30d)" value={data.new_hires_30d?.toLocaleString() ?? "\u2014"} />
      </div>

      {(em.status_breakdown && Object.keys(em.status_breakdown).length > 0) || (em.type_breakdown && Object.keys(em.type_breakdown).length > 0) ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-[18px] mt-[18px]">
          {em.status_breakdown && Object.keys(em.status_breakdown).length > 0 ? (
            <Card title="By Status" icon={PieChart} iconColor={VIOLET}>
              <div className="space-y-2.5">
                {Object.entries(em.status_breakdown).map(([status, count]) => {
                  const pct = em.total ? Math.round(count / em.total * 100) : 0;
                  const colorMap = { active: TEAL, on_leave: AMBER, inactive: RED, terminated: RED, resigned: RED, deactivated: INK_SOFT, suspended: AMBER };
                  return (
                    <div key={status} className="flex items-center gap-2.5">
                      <span className="w-[90px] text-[12px] font-medium capitalize" style={{ color: INK_SOFT }}>{status.replace(/_/g, " ")}</span>
                      <ProgressBar value={pct} color={colorMap[status] || VIOLET} />
                      <span className="w-[48px] text-right text-[12.5px] font-bold" style={{ color: INK }}>{count}</span>
                      <span className="w-[38px] text-right text-[11px]" style={{ color: INK_SOFT }}>{pct}%</span>
                    </div>
                  );
                })}
              </div>
            </Card>
          ) : null}
          {em.type_breakdown && Object.keys(em.type_breakdown).length > 0 ? (
            <Card title="By Employment Type" icon={Layers} iconColor={AMBER}>
              <div className="space-y-2.5">
                {Object.entries(em.type_breakdown).map(([type, count]) => {
                  const pct = em.active ? Math.round(count / (em.active || 1) * 100) : 0;
                  const typeColors = { full_time: VIOLET, part_time: AMBER, contract: TEAL, internship: "#B9B4CC", temporary: RED };
                  return (
                    <div key={type} className="flex items-center gap-2.5">
                      <span className="w-[100px] text-[12px] font-medium capitalize" style={{ color: INK_SOFT }}>{type.replace(/_/g, " ")}</span>
                      <ProgressBar value={pct} color={typeColors[type] || VIOLET} />
                      <span className="w-[48px] text-right text-[12.5px] font-bold" style={{ color: INK }}>{count}</span>
                      <span className="w-[38px] text-right text-[11px]" style={{ color: INK_SOFT }}>{pct}%</span>
                    </div>
                  );
                })}
              </div>
            </Card>
          ) : null}
        </div>
      ) : null}

      <SectionHeading title="Departments" />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-[18px]">
        <Card title="Department Headcount" icon={Building2} iconColor={TEAL} subtitle={`${dm.total ?? 0} departments`}>
          {dm.headcount_by_dept && dm.headcount_by_dept.length > 0 ? (
            <div className="space-y-2.5">
              {dm.headcount_by_dept.map((d, i) => {
                const deptColors = [VIOLET, AMBER, TEAL, VIOLET, "#B9B4CC", "#D8D4EC"];
                return (
                  <div key={d.name} className="flex items-center gap-2.5">
                    <span className="w-[120px] text-[12px] font-semibold" style={{ color: INK }}>{d.name}</span>
                    <ProgressBar value={d.pct} color={deptColors[i % deptColors.length]} />
                    <span className="w-[30px] text-right text-[12.5px] font-bold" style={{ color: INK }}>{d.count}</span>
                    <span className="w-[36px] text-right text-[11px]" style={{ color: INK_SOFT }}>{d.pct}%</span>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-center py-8 text-[13px]" style={{ color: INK_SOFT }}>No department data</div>
          )}
        </Card>
        <Card title="Department Details" icon={List} iconColor={AMBER} subtitle={`${(dm.details || []).length} active departments`}>
          {dm.details && dm.details.length > 0 ? (
            <div className="divide-y" style={{ borderColor: LINE }}>
              {dm.details.map((d, i) => (
                <div key={d.name} className="flex items-center justify-between py-2.5 first:pt-0 last:pb-0" style={{ borderBottom: i < dm.details.length - 1 ? `1px solid ${LINE}` : "none" }}>
                  <div>
                    <p className="text-[12.5px] font-semibold" style={{ color: INK }}>{d.name}</p>
                    <p className="text-[11px] mt-0.5" style={{ color: INK_SOFT }}>{d.headcount} employees · {d.managers} managers</p>
                  </div>
                  <div className="text-right">
                    <p className="text-[13px] font-bold" style={{ color: INK }}>{fmtCurrency(d.budget)}</p>
                    <p className="text-[10.5px]" style={{ color: INK_SOFT }}>budget</p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-[13px]" style={{ color: INK_SOFT }}>No department details</div>
          )}
        </Card>
      </div>

      {dsb.length > 0 ? (
        <>
          <SectionHeading title="Designations" />
          <Card title="Employees by Designation" icon={BadgeInfo} iconColor={VIOLET}>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {dsb.map((d, i) => (
                <div key={d.title} className="rounded-[12px] border p-3 text-center" style={{ borderColor: LINE, background: "#FAFAFE" }}>
                  <p className="text-[20px] font-bold" style={{ color: INK }}>{d.count}</p>
                  <p className="text-[11px] mt-1" style={{ color: INK_SOFT }}>{d.title}</p>
                </div>
              ))}
            </div>
          </Card>
        </>
      ) : null}

      <SectionHeading title="Attendance" />
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <MiniStat icon={UserCheck} bg={TEAL_100} iconColor={TEAL} label="Present Today" value={am.today_breakdown?.present?.toLocaleString() ?? "\u2014"} />
        <MiniStat icon={UserX} bg={RED_100} iconColor={RED} label="Absent Today" value={am.today_breakdown?.absent?.toLocaleString() ?? "\u2014"} />
        <MiniStat icon={Clock} bg={AMBER_100} iconColor={AMBER} label="Late Arrivals" value={am.today_breakdown?.late?.toLocaleString() ?? "\u2014"} />
        <MiniStat icon={Activity} bg={VIOLET_100} iconColor={VIOLET} label="Remote Today" value={am.today_breakdown?.remote?.toLocaleString() ?? "\u2014"} />
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-3">
        <MiniStat icon={Percent} bg={TEAL_100} iconColor={TEAL} label="Attendance Rate" value={am.average_attendance != null ? `${am.average_attendance}%` : "\u2014"} sub="Overall" />
        <MiniStat icon={Percent} bg={VIOLET_100} iconColor={VIOLET} label="Weekly Rate" value={am.weekly_attendance_rate != null ? `${am.weekly_attendance_rate}%` : "\u2014"} sub="Last 7 days" />
        <MiniStat icon={Clock} bg={AMBER_100} iconColor={AMBER} label="Avg Hours/Day" value={am.avg_working_hours != null ? `${am.avg_working_hours}h` : "\u2014"} />
        <MiniStat icon={UserCheck} bg={TEAL_100} iconColor={TEAL} label="On Leave" value={am.today_breakdown?.on_leave?.toLocaleString() ?? "\u2014"} />
      </div>

      <SectionHeading title="Leave Overview" />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-[18px]">
        <Card title="Pending Leaves by Type" icon={CalendarCheck} iconColor={AMBER} subtitle={`${lm.pending_count ?? 0} pending requests`}>
          {lm.pending_by_type && lm.pending_by_type.length > 0 ? (
            <div className="space-y-2.5">
              {lm.pending_by_type.map((lt, i) => {
                const pct = lm.pending_count ? Math.round(lt.count / lm.pending_count * 100) : 0;
                const leaveColors = [VIOLET, AMBER, TEAL, RED, "#B9B4CC"];
                return (
                  <div key={lt.type} className="flex items-center gap-2.5">
                    <span className="w-[100px] text-[12px] font-medium capitalize" style={{ color: INK_SOFT }}>{lt.type.replace(/_/g, " ")}</span>
                    <ProgressBar value={pct} color={leaveColors[i % leaveColors.length]} />
                    <span className="w-[30px] text-right text-[12.5px] font-bold" style={{ color: INK }}>{lt.count}</span>
                    <span className="w-[36px] text-right text-[11px]" style={{ color: INK_SOFT }}>{pct}%</span>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-center py-8 text-[13px]" style={{ color: INK_SOFT }}>No pending leave requests</div>
          )}
        </Card>
        <Card title="Leave Summary" icon={Activity} iconColor={TEAL}>
          <div className="grid grid-cols-2 gap-4">
            <div className="rounded-[12px] border p-4 text-center" style={{ borderColor: LINE, background: "#FAFAFE" }}>
              <p className="text-[26px] font-bold" style={{ color: AMBER }}>{lm.pending_count ?? 0}</p>
              <p className="text-[11.5px] mt-1" style={{ color: INK_SOFT }}>Pending</p>
            </div>
            <div className="rounded-[12px] border p-4 text-center" style={{ borderColor: LINE, background: "#FAFAFE" }}>
              <p className="text-[26px] font-bold" style={{ color: VIOLET }}>{lm.this_month_count ?? 0}</p>
              <p className="text-[11.5px] mt-1" style={{ color: INK_SOFT }}>This Month</p>
            </div>
          </div>
        </Card>
      </div>

      <SectionHeading title="Payroll" />
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <MiniStat icon={DollarSign} bg={TEAL_100} iconColor={TEAL} label="Monthly Payroll" value={fmtCurrency(pm.total_monthly)} />
        <MiniStat icon={Users} bg={VIOLET_100} iconColor={VIOLET} label="Departments" value={pm.by_department?.length?.toLocaleString() ?? "\u2014"} />
      </div>
      {pm.by_department && pm.by_department.length > 0 ? (
        <Card title="Payroll by Department" icon={BarChart3} iconColor={TEAL} className="mt-[18px]">
          <div className="space-y-3">
            {pm.by_department.map((d, i) => {
              const deptColors = [VIOLET, AMBER, TEAL, RED, "#B9B4CC", "#D8D4EC"];
              return (
                <div key={d.name}>
                  <div className="flex items-center justify-between mb-1.5">
                    <div>
                      <span className="text-[12.5px] font-semibold" style={{ color: INK }}>{d.name}</span>
                      <span className="text-[11px] ml-2" style={{ color: INK_SOFT }}>{d.headcount} employees</span>
                    </div>
                    <div className="text-right">
                      <span className="text-[13px] font-bold" style={{ color: INK }}>{fmtCurrency(d.total)}</span>
                      <span className="text-[11px] ml-2" style={{ color: INK_SOFT }}>{d.pct}%</span>
                    </div>
                  </div>
                  <ProgressBar value={d.pct} color={deptColors[i % deptColors.length]} />
                  <p className="text-[10.5px] mt-1" style={{ color: INK_SOFT }}>Avg: {fmtCurrency(d.average)}/employee</p>
                </div>
              );
            })}
          </div>
        </Card>
      ) : null}

      <SectionHeading title="Assets" />
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <MiniStat icon={Package} bg={VIOLET_100} iconColor={VIOLET} label="Total Assets" value={asm.total?.toLocaleString() ?? "\u2014"} />
        <MiniStat icon={Wrench} bg={TEAL_100} iconColor={TEAL} label="Assigned" value={asm.assigned?.toLocaleString() ?? "\u2014"} sub={asm.total ? `${Math.round(asm.assigned / asm.total * 100)}% utilization` : ""} />
        <MiniStat icon={Wrench} bg={AMBER_100} iconColor={AMBER} label="Unassigned" value={asm.unassigned?.toLocaleString() ?? "\u2014"} />
      </div>
      {asm.by_status && Object.keys(asm.by_status).length > 0 ? (
        <Card title="Assets by Status" icon={PieChart} iconColor={AMBER} className="mt-[18px]">
          <div className="space-y-2.5">
            {Object.entries(asm.by_status).map(([status, count]) => {
              const pct = asm.total ? Math.round(count / asm.total * 100) : 0;
              const colorMap = { available: TEAL, assigned: VIOLET, maintenance: AMBER, retired: RED, lost: RED };
              return (
                <div key={status} className="flex items-center gap-2.5">
                  <StatusDot color={colorMap[status] || VIOLET} shadow={colorMap[status] || VIOLET} />
                  <span className="w-[100px] text-[12px] font-medium capitalize" style={{ color: INK_SOFT }}>{status}</span>
                  <ProgressBar value={pct} color={colorMap[status] || VIOLET} />
                  <span className="w-[30px] text-right text-[12.5px] font-bold" style={{ color: INK }}>{count}</span>
                  <span className="w-[36px] text-right text-[11px]" style={{ color: INK_SOFT }}>{pct}%</span>
                </div>
              );
            })}
          </div>
        </Card>
      ) : null}

      <SectionHeading title="Open Positions" />
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <MiniStat icon={Briefcase} bg={AMBER_100} iconColor={AMBER} label="Open Positions" value={data.open_positions ?? 0} />
      </div>
    </div>
  );
}
