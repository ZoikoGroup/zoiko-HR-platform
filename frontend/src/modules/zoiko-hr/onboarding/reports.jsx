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

function StatCard({ title, value, icon: Icon, color, suffix }) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 flex items-center justify-between">
      <div>
        <p className="text-xs text-gray-400 font-medium uppercase tracking-wider">{title}</p>
        <p className="text-2xl font-bold text-gray-800 mt-1">
          {value}{suffix && <span className="text-sm font-normal text-gray-400 ml-1">{suffix}</span>}
        </p>
      </div>
      <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${color || "bg-blue-50"}`}>
        <Icon size={20} className={color ? "text-white" : "text-blue-600"} />
      </div>
    </div>
  );
}

function SimpleBar({ label, value, max, color }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div className="flex items-center gap-3">
      <span className="text-xs text-gray-500 w-16 shrink-0 truncate">{label}</span>
      <div className="flex-1 h-5 bg-gray-100 rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all duration-500 ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs font-medium text-gray-600 w-8 text-right">{value}</span>
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
    <div className="flex items-center justify-between mb-4">
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

  useEffect(() => {
    let mounted = true;
    const fetchAll = async () => {
      setLoading(true);
      try {
        const j = await getOnboardingJoiningReport();
        if (!mounted) return;
        setJoining(j);
      } catch (err) {
        // silently degrade — data just won't display
      } finally {
        if (mounted) setLoading(false);
      }
    };
    fetchAll();
    return () => { mounted = false; };
  }, []);

  const monthlyTrend = joining?.monthlyTrend || [];
  const maxMonthly = Math.max(...monthlyTrend.map((m) => m.count), 1);

  const handleDownload = () => {
    const headers = ["Month", "Count"];
    const rows = monthlyTrend.map((m) => [m.month, m.count]);
    downloadCSV(headers, rows, "joining-report.csv");
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

  return (
    <HRPage title="Onboarding Reports" subtitle="Analyse onboarding metrics and generate reports.">
      <SubNav />
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-gray-700">Joining Report</h2>
          <button
            onClick={handleDownload}
            className="flex items-center gap-1.5 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded-lg transition-colors shadow-sm"
          >
            <Download size={16} />
            Download CSV
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard title="Total Joiners" value={joining?.totalJoiners ?? 0} icon={Users} color="bg-blue-500" />
          <StatCard title="This Month" value={joining?.thisMonth ?? 0} icon={UserPlus} color="bg-emerald-500" />
          <StatCard title="This Quarter" value={joining?.thisQuarter ?? 0} icon={CalendarDays} color="bg-violet-500" />
          <StatCard title="Avg Days to Onboard" value={joining?.avgDaysToOnboard ?? 0} icon={Clock} color="bg-amber-500" suffix="days" />
        </div>

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
