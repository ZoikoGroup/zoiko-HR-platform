import { useState, useEffect } from "react";
import { NavLink } from "react-router-dom";
import HRPage from "../../../components/HRPage";
import { getOnboardingJoiningReport } from "../../../service/hrService";
import {
  Users,
  UserPlus,
  CalendarDays,
  TrendingUp,
  Clock,
  Download,
  CheckCircle2,
} from "lucide-react";

const NAV_ITEMS = [
  { label: "Dashboard", href: "/zoiko-hr/onboarding" },
  { label: "New Hires", href: "/zoiko-hr/onboarding/new-hires" },
  { label: "Pre-Onboarding", href: "/zoiko-hr/onboarding/pre-onboarding" },
  { label: "Documents", href: "/zoiko-hr/onboarding/documents" },
  { label: "Checklists", href: "/zoiko-hr/onboarding/checklists" },
  { label: "Orientation", href: "/zoiko-hr/onboarding/orientation" },
  { label: "Reports", href: "/zoiko-hr/onboarding/reports" },
  { label: "Settings", href: "/zoiko-hr/onboarding/settings" },
];


function SubNav() {
  return (
    <div className="flex gap-1 overflow-x-auto pb-1 mb-6 border-b border-gray-100">
      {NAV_ITEMS.map((item) => (
        <NavLink
          key={item.href}
          to={item.href}
          end={item.href === "/zoiko-hr/onboarding"}
          className={({ isActive }) =>
            `whitespace-nowrap px-3 py-2 text-sm font-medium rounded-t-lg transition-colors ${
              isActive
                ? "text-blue-600 border-b-2 border-blue-600 bg-blue-50/50"
                : "text-gray-500 hover:text-gray-700 hover:bg-gray-50"
            }`
          }
        >
          {item.label}
        </NavLink>
      ))}
    </div>
  );
}

function StatCard({ title, value, icon: Icon, color, suffix, className = "" }) {
  return (
    <div className={`bg-white rounded-xl border border-gray-100 shadow-sm p-4 flex items-center justify-between gap-3 min-w-0 ${className}`}>
      <div className="min-w-0">
        <p className="text-xs text-gray-400 font-medium uppercase tracking-wider break-words">{title}</p>
        <p className="text-2xl font-bold text-gray-800 mt-1">
          {value}{suffix && <span className="text-sm font-normal text-gray-400 ml-1">{suffix}</span>}
        </p>
      </div>
      <div className={`w-10 h-10 shrink-0 rounded-lg flex items-center justify-center ${color || "bg-blue-50"}`}>
        <Icon size={20} className={color ? "text-white" : "text-blue-600"} />
      </div>
    </div>
  );
}

function SimpleBar({ label, value, max, color }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div className="flex items-center gap-3">
      <span className="text-xs text-gray-500 w-20 shrink-0 truncate" title={label}>{label}</span>
      <div className="flex-1 min-w-0 h-5 bg-gray-100 rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all duration-500 ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs font-medium text-gray-600 w-8 shrink-0 text-right">{value}</span>
    </div>
  );
}


function downloadCSV(headers, rows, filename) {
  const csvContent = [
    headers.join(","),
    ...rows.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",")),
  ].join("\n");
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
  URL.revokeObjectURL(link.href);
}

function SectionHeader({ title, icon: Icon, onDownload }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
      <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
        <Icon size={16} className="text-blue-600" />
        {title}
      </h3>
      {onDownload && (
        <button
          onClick={onDownload}
          className="flex items-center gap-1.5 text-xs font-medium text-blue-600 hover:text-blue-800 bg-blue-50 hover:bg-blue-100 px-3 py-1.5 rounded-lg transition-colors"
        >
          <Download size={14} />
          CSV
        </button>
      )}
    </div>
  );
}

export default function OnboardingReports() {
  const [joining, setJoining] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let mounted = true;
    const fetchAll = async () => {
      setLoading(true);
      setError(null);
      try {
        const j = await getOnboardingJoiningReport();
        if (!mounted) return;
        setJoining(j || {});
      } catch (err) {
        if (mounted) { setJoining(null); setError(err?.message || "The joining report could not be loaded."); }
      } finally {
        if (mounted) setLoading(false);
      }
    };
    fetchAll();
    return () => { mounted = false; };
  }, [reloadKey]);

  const monthlyTrend = Array.isArray(joining?.monthlyTrend) ? joining.monthlyTrend : [];
  const maxMonthly = Math.max(...monthlyTrend.map((m) => Number(m.count) || 0), 1);
  const measured = Number(joining?.avgDaysMeasured) || 0;
  const avgValue = measured > 0 && joining?.avgDaysToOnboard != null ? joining.avgDaysToOnboard : "-";
  const avgLabel = measured > 0
    ? `Avg days from joining to completion (based on ${measured} hire${measured === 1 ? "" : "s"})`
    : "Avg days from joining to completion";

  const handleDownload = () => {
    const summary = [
      ["Total joiners (cancelled excluded)", joining?.totalJoiners ?? 0],
      ["This month", joining?.thisMonth ?? 0],
      ["This quarter", joining?.thisQuarter ?? 0],
      ["Completed", joining?.completed ?? 0],
      ["Avg days from joining to completion", measured > 0 ? joining?.avgDaysToOnboard ?? "" : ""],
      ["Hires measured for average", measured],
      ["", ""],
      ["Month", "Joiners"],
      ...monthlyTrend.map((m) => [m.month, m.count]),
    ];
    downloadCSV(["Metric", "Value"], summary, "joining-report.csv");
  };

  if (loading) {
    return (
      <HRPage title="Onboarding Reports" subtitle="Analyse onboarding metrics and generate reports.">
        <SubNav />
        <div className="flex justify-center items-center py-20">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          <span className="ml-3 text-gray-500">Loading reports...</span>
        </div>
      </HRPage>
    );
  }

  if (error) {
    return (
      <HRPage title="Onboarding Reports" subtitle="Analyse onboarding metrics and generate reports.">
        <SubNav />
        <div role="alert" className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-6 text-center">
          <p className="text-sm font-medium break-words">{error}</p>
          <button onClick={() => setReloadKey((k) => k + 1)} className="mt-3 text-sm font-medium text-white bg-red-600 hover:bg-red-700 px-4 py-2 rounded-lg">
            Retry
          </button>
        </div>
      </HRPage>
    );
  }

  return (
    <HRPage title="Onboarding Reports" subtitle="Analyse onboarding metrics and generate reports.">
      <SubNav />
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-gray-700">Joining Report</h2>
          <button
            onClick={handleDownload}
            className="flex items-center justify-center gap-1.5 min-h-10 w-full sm:w-auto text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded-lg transition-colors shadow-sm"
          >
            <Download size={16} />
            Download CSV
          </button>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 sm:gap-4">
          <StatCard title="Total Joiners" value={joining?.totalJoiners ?? 0} icon={Users} color="bg-blue-500" />
          <StatCard title="This Month" value={joining?.thisMonth ?? 0} icon={UserPlus} color="bg-emerald-500" />
          <StatCard title="This Quarter" value={joining?.thisQuarter ?? 0} icon={CalendarDays} color="bg-[#0A1128]" />
          <StatCard title="Completed" value={joining?.completed ?? 0} icon={CheckCircle2} color="bg-green-600" />
          <StatCard title={avgLabel} value={avgValue} icon={Clock} color="bg-amber-500" suffix={avgValue === "-" ? "" : "days"} className="col-span-2 md:col-span-1" />
        </div>
        <p className="text-xs text-gray-400">Cancelled new hires are not counted in these figures.</p>

        <SectionHeader title="Monthly Joining Trend" icon={TrendingUp} />
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
          {monthlyTrend.length === 0 ? (
            <p className="text-xs text-gray-400 text-center py-6">No joining data available</p>
          ) : (
            <div className="space-y-2">
              {monthlyTrend.map((m) => (
                <SimpleBar key={m.month} label={m.month} value={m.count} max={maxMonthly} color="bg-blue-500" />
              ))}
            </div>
          )}
        </div>
      </div>
    </HRPage>
  );
}
