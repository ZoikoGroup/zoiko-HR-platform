import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { getOrganizationDetailedMetrics } from "../../service/orgAdminService";
import { Users, Building2, BadgeInfo, CalendarCheck, Activity, CreditCard, Wrench, ArrowLeft, TrendingUp, TrendingDown, Minus, Briefcase, Clock, UserCheck, UserX, UserMinus, PieChart, Layers, DollarSign, Package, Percent, Hash, BarChart3, List } from "lucide-react";
import zoikoIcon from "../../assets/zoikohr-icon-svg.svg";

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

function fmtCurrency(amount) {
  if (amount == null) return "\u2014";
  return `$${Number(amount).toLocaleString()}`;
}

function MiniStat({ icon: Icon, bg, iconColor, label, value, sub }) {
  return (
    <div className="rounded-[14px] border bg-white p-4 shadow-[0_1px_2px_rgba(10,17,40,0.04),0_8px_24px_-12px_rgba(10,17,40,0.10)]" style={{ borderColor: LINE }}>
      <div className="flex items-center gap-2.5 mb-2">
        <div className="w-[32px] h-[32px] rounded-[9px] flex items-center justify-center" style={{ background: bg || BLUE_100 }}>
          <Icon className="w-4 h-4" strokeWidth={2.5} style={{ color: iconColor || BLUE }} />
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
    <div className={`rounded-[20px] border p-5 shadow-[0_1px_2px_rgba(10,17,40,0.04),0_8px_24px_-12px_rgba(10,17,40,0.10)] ${className}`} style={{ background: "#fff", borderColor: LINE }}>
      <div className="flex items-center gap-2 mb-4">
        {Icon ? <Icon className="w-[18px] h-[18px]" strokeWidth={2.5} style={{ color: iconColor || BLUE }} /> : null}
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

function ProgressBar({ value, color, bg = "#F0F4F8", height = "h-2" }) {
  return (
    <div className={`flex-1 ${height} rounded-full overflow-hidden`} style={{ background: bg }}>
      <div className={`${height} rounded-full`} style={{ width: `${Math.min(value, 100)}%`, background: color || BLUE }} />
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
      <div className="font-['Inter',system-ui,sans-serif] -m-4 sm:-m-6 lg:-m-8 p-4 sm:p-6 lg:p-8" style={{ background: "#F0F4F8", color: INK, minHeight: "calc(100vh - 4rem)" }}>
        <div className="text-center py-20 text-[13px]" style={{ color: INK_SOFT }}>Loading detailed metrics...</div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="font-['Inter',system-ui,sans-serif] -m-4 sm:-m-6 lg:-m-8 p-4 sm:p-6 lg:p-8" style={{ background: "#F0F4F8", color: INK, minHeight: "calc(100vh - 4rem)" }}>
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
    <div className="font-['Inter',system-ui,sans-serif] -m-4 sm:-m-6 lg:-m-8 p-4 sm:p-6 lg:p-8" style={{ background: "#F0F4F8", color: INK, minHeight: "calc(100vh - 4rem)" }}>
      <button onClick={() => navigate("/organization-admin/dashboard")} className="flex items-center gap-1.5 text-[12.5px] font-semibold mb-4 cursor-pointer" style={{ color: BLUE }}>
        <ArrowLeft className="w-3.5 h-3.5" strokeWidth={2.5} />
        Back to Dashboard
      </button>

      <div className="flex items-center gap-3 mb-4 pb-4" style={{ borderBottom: `1px solid ${LINE}` }}>
        <div className="w-10 h-10 rounded-[12px] flex items-center justify-center flex-shrink-0 overflow-hidden">
          <img src={zoikoIcon} className="w-10 h-10" alt="ZoikoHR" />
        </div>
        <div>
          <p className="font-['Sora',system-ui,sans-serif] text-lg font-bold" style={{ color: INK }}>All Metrics</p>
          <p className="text-[12px] font-medium" style={{ color: INK_SOFT }}>Comprehensive view of your organization's key metrics and analytics</p>
        </div>
      </div>

      <SectionHeading title="Employee Overview" />
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3">
        <MiniStat icon={Users} bg={BLUE_100} iconColor={BLUE} label="Total Employees" value={em.total?.toLocaleString() ?? "\u2014"} />
        <MiniStat icon={UserCheck} bg={EMERALD_100} iconColor={EMERALD} label="Active" value={em.active?.toLocaleString() ?? "\u2014"} sub={`${em.total ? Math.round(em.active / em.total * 100) : 0}% of total`} />
        <MiniStat icon={UserMinus} bg={AMBER_100} iconColor={AMBER} label="On Leave" value={em.on_leave?.toLocaleString() ?? "\u2014"} />
        <MiniStat icon={UserX} bg={RED_100} iconColor={RED} label="Inactive" value={em.inactive?.toLocaleString() ?? "\u2014"} />
        <MiniStat icon={Building2} bg={BLUE_100} iconColor={BLUE} label="HR Admins" value={em.hr_admins?.toLocaleString() ?? "\u2014"} />
        <MiniStat icon={Briefcase} bg={EMERALD_100} iconColor={EMERALD} label="New Hires (30d)" value={data.new_hires_30d?.toLocaleString() ?? "\u2014"} />
      </div>

      {(em.status_breakdown && Object.keys(em.status_breakdown).length > 0) || (em.type_breakdown && Object.keys(em.type_breakdown).length > 0) ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-[18px] mt-[18px]">
          {em.status_breakdown && Object.keys(em.status_breakdown).length > 0 ? (
            <Card title="By Status" icon={PieChart} iconColor={BLUE}>
              <div className="space-y-2.5">
                {Object.entries(em.status_breakdown).map(([status, count]) => {
                  const pct = em.total ? Math.round(count / em.total * 100) : 0;
                  const colorMap = { active: EMERALD, on_leave: AMBER, inactive: RED, terminated: RED, resigned: RED, deactivated: INK_SOFT, suspended: AMBER };
                  return (
                    <div key={status} className="flex items-center gap-2.5">
                      <span className="w-[90px] text-[12px] font-medium capitalize" style={{ color: INK_SOFT }}>{status.replace(/_/g, " ")}</span>
                      <ProgressBar value={pct} color={colorMap[status] || BLUE} />
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
                  const typeColors = { full_time: BLUE, part_time: AMBER, contract: EMERALD, internship: "#94A3B8", temporary: RED };
                  return (
                    <div key={type} className="flex items-center gap-2.5">
                      <span className="w-[100px] text-[12px] font-medium capitalize" style={{ color: INK_SOFT }}>{type.replace(/_/g, " ")}</span>
                      <ProgressBar value={pct} color={typeColors[type] || BLUE} />
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
        <Card title="Department Headcount" icon={Building2} iconColor={EMERALD} subtitle={`${dm.total ?? 0} departments`}>
          {dm.headcount_by_dept && dm.headcount_by_dept.length > 0 ? (
            <div className="space-y-2.5">
              {dm.headcount_by_dept.map((d, i) => {
                const deptColors = [BLUE, AMBER, EMERALD, BLUE, "#94A3B8", "#CBD5E1"];
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
          <Card title="Employees by Designation" icon={BadgeInfo} iconColor={BLUE}>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {dsb.map((d, i) => (
                <div key={d.title} className="rounded-[12px] border p-3 text-center" style={{ borderColor: LINE, background: "#F8FAFC" }}>
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
        <MiniStat icon={UserCheck} bg={EMERALD_100} iconColor={EMERALD} label="Present Today" value={am.today_breakdown?.present?.toLocaleString() ?? "\u2014"} />
        <MiniStat icon={UserX} bg={RED_100} iconColor={RED} label="Absent Today" value={am.today_breakdown?.absent?.toLocaleString() ?? "\u2014"} />
        <MiniStat icon={Clock} bg={AMBER_100} iconColor={AMBER} label="Late Arrivals" value={am.today_breakdown?.late?.toLocaleString() ?? "\u2014"} />
        <MiniStat icon={Activity} bg={BLUE_100} iconColor={BLUE} label="Remote Today" value={am.today_breakdown?.remote?.toLocaleString() ?? "\u2014"} />
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-3">
        <MiniStat icon={Percent} bg={EMERALD_100} iconColor={EMERALD} label="Attendance Rate" value={am.average_attendance != null ? `${am.average_attendance}%` : "\u2014"} sub="Overall" />
        <MiniStat icon={Percent} bg={BLUE_100} iconColor={BLUE} label="Weekly Rate" value={am.weekly_attendance_rate != null ? `${am.weekly_attendance_rate}%` : "\u2014"} sub="Last 7 days" />
        <MiniStat icon={Clock} bg={AMBER_100} iconColor={AMBER} label="Avg Hours/Day" value={am.avg_working_hours != null ? `${am.avg_working_hours}h` : "\u2014"} />
        <MiniStat icon={UserCheck} bg={EMERALD_100} iconColor={EMERALD} label="On Leave" value={am.today_breakdown?.on_leave?.toLocaleString() ?? "\u2014"} />
      </div>

      <SectionHeading title="Leave Overview" />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-[18px]">
        <Card title="Pending Leaves by Type" icon={CalendarCheck} iconColor={AMBER} subtitle={`${lm.pending_count ?? 0} pending requests`}>
          {lm.pending_by_type && lm.pending_by_type.length > 0 ? (
            <div className="space-y-2.5">
              {lm.pending_by_type.map((lt, i) => {
                const pct = lm.pending_count ? Math.round(lt.count / lm.pending_count * 100) : 0;
                const leaveColors = [BLUE, AMBER, EMERALD, RED, "#94A3B8"];
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
        <Card title="Leave Summary" icon={Activity} iconColor={EMERALD}>
          <div className="grid grid-cols-2 gap-4">
            <div className="rounded-[12px] border p-4 text-center" style={{ borderColor: LINE, background: "#F8FAFC" }}>
              <p className="text-[26px] font-bold" style={{ color: AMBER }}>{lm.pending_count ?? 0}</p>
              <p className="text-[11.5px] mt-1" style={{ color: INK_SOFT }}>Pending</p>
            </div>
            <div className="rounded-[12px] border p-4 text-center" style={{ borderColor: LINE, background: "#F8FAFC" }}>
              <p className="text-[26px] font-bold" style={{ color: BLUE }}>{lm.this_month_count ?? 0}</p>
              <p className="text-[11.5px] mt-1" style={{ color: INK_SOFT }}>This Month</p>
            </div>
          </div>
        </Card>
      </div>

      <SectionHeading title="Payroll" />
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <MiniStat icon={DollarSign} bg={EMERALD_100} iconColor={EMERALD} label="Monthly Payroll" value={fmtCurrency(pm.total_monthly)} />
        <MiniStat icon={Users} bg={BLUE_100} iconColor={BLUE} label="Departments" value={pm.by_department?.length?.toLocaleString() ?? "\u2014"} />
      </div>
      {pm.by_department && pm.by_department.length > 0 ? (
        <Card title="Payroll by Department" icon={BarChart3} iconColor={EMERALD} className="mt-[18px]">
          <div className="space-y-3">
            {pm.by_department.map((d, i) => {
              const deptColors = [BLUE, AMBER, EMERALD, RED, "#94A3B8", "#CBD5E1"];
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
        <MiniStat icon={Package} bg={BLUE_100} iconColor={BLUE} label="Total Assets" value={asm.total?.toLocaleString() ?? "\u2014"} />
        <MiniStat icon={Wrench} bg={EMERALD_100} iconColor={EMERALD} label="Assigned" value={asm.assigned?.toLocaleString() ?? "\u2014"} sub={asm.total ? `${Math.round(asm.assigned / asm.total * 100)}% utilization` : ""} />
        <MiniStat icon={Wrench} bg={AMBER_100} iconColor={AMBER} label="Unassigned" value={asm.unassigned?.toLocaleString() ?? "\u2014"} />
      </div>
      {asm.by_status && Object.keys(asm.by_status).length > 0 ? (
        <Card title="Assets by Status" icon={PieChart} iconColor={AMBER} className="mt-[18px]">
          <div className="space-y-2.5">
            {Object.entries(asm.by_status).map(([status, count]) => {
              const pct = asm.total ? Math.round(count / asm.total * 100) : 0;
              const colorMap = { available: EMERALD, assigned: BLUE, maintenance: AMBER, retired: RED, lost: RED };
              return (
                <div key={status} className="flex items-center gap-2.5">
                  <StatusDot color={colorMap[status] || BLUE} shadow={colorMap[status] || BLUE} />
                  <span className="w-[100px] text-[12px] font-medium capitalize" style={{ color: INK_SOFT }}>{status}</span>
                  <ProgressBar value={pct} color={colorMap[status] || BLUE} />
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
