/* Onboarding Reports — the joining report (GET /hr/onboarding/reports/joining) in the Recruitment look. */
import { useState, useEffect } from "react";
import { AlertCircle, CalendarDays, CheckCircle2, Clock, Download, TrendingUp, UserPlus, Users } from "lucide-react";
import { getOnboardingJoiningReport } from "../../../service/hrService";
import { Card, EmptyState, FilterSelect, KpiCard, PrimaryButton, td, th } from "../recruitment/ui";
import OnboardingLayout from "./OnboardingLayout";

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

// "Oct 2026" → "2026"; anything else has no year to filter by
const yearOf = (month) => (/(\d{4})\s*$/.exec(String(month || "")) || [])[1] || "";

const SUBTITLE = "Analyse onboarding metrics and generate reports.";

export default function OnboardingReports() {
  const [joining, setJoining] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [year, setYear] = useState("");

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
  const years = [...new Set(monthlyTrend.map((m) => yearOf(m.month)).filter(Boolean))].sort().reverse();
  const shown = year ? monthlyTrend.filter((m) => yearOf(m.month) === year) : monthlyTrend;
  const maxMonthly = Math.max(...shown.map((m) => Number(m.count) || 0), 1);
  const shownTotal = shown.reduce((sum, m) => sum + (Number(m.count) || 0), 0);
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

  const shell = (body, actions) => (
    <OnboardingLayout title="Onboarding Reports" subtitle={SUBTITLE} actions={actions}>{body}</OnboardingLayout>
  );

  if (loading) {
    return shell(
      <div className="flex justify-center items-center py-20">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        <span className="ml-3 text-gray-500">Loading reports...</span>
      </div>
    );
  }

  if (error) {
    return shell(
      <div role="alert" className="rounded-2xl border border-rose-200 bg-rose-50 p-6 text-center">
        <p className="inline-flex items-center gap-2 text-sm font-medium text-rose-700 break-words"><AlertCircle className="h-5 w-5 shrink-0" />{error}</p>
        <div className="mt-3"><PrimaryButton onClick={() => setReloadKey((k) => k + 1)}>Retry</PrimaryButton></div>
      </div>
    );
  }

  const v = (value) => ({ value });

  return shell(
    <div className="space-y-6">
      <Card title="Joining Report" action={<PrimaryButton icon={Download} onClick={handleDownload}>Download CSV</PrimaryButton>}>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <KpiCard label="Total Joiners" icon={Users} tone="blue" kpi={v(joining?.totalJoiners ?? 0)} />
          <KpiCard label="This Month" icon={UserPlus} tone="green" kpi={v(joining?.thisMonth ?? 0)} />
          <KpiCard label="This Quarter" icon={CalendarDays} tone="violet" kpi={v(joining?.thisQuarter ?? 0)} />
          <KpiCard label="Completed" icon={CheckCircle2} tone="teal" kpi={v(joining?.completed ?? 0)} />
          <KpiCard label={avgLabel} icon={Clock} tone="amber" kpi={v(avgValue)} format={(x) => (x === "-" ? "-" : `${x} days`)} />
        </div>
        <p className="mt-3 text-xs text-gray-500">Cancelled new hires are not counted in these figures.</p>
      </Card>

      <Card title="Monthly Joining Trend" bodyClass="pt-3">
        {monthlyTrend.length === 0 ? (
          <EmptyState icon={TrendingUp} title="No joining data available">Joiners appear here by month once new hires have a joining date.</EmptyState>
        ) : (
          <>
            <div className="flex flex-wrap items-end justify-between gap-3 px-5 pb-4">
              {years.length > 1 ? (
                <FilterSelect label="Year" value={year} onChange={setYear} options={years} allLabel="All years" />
              ) : <span />}
              <p className="text-xs text-gray-500">{shown.length} month{shown.length === 1 ? "" : "s"} · {shownTotal} joiner{shownTotal === 1 ? "" : "s"}</p>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-100">
                <thead className="bg-gray-50/60"><tr>
                  <th scope="col" className={th}>Month</th>
                  <th scope="col" className={`${th} w-full`}>Joiners</th>
                  <th scope="col" className={`${th} text-right`}>Count</th>
                  <th scope="col" className={`${th} text-right`}>Share</th>
                </tr></thead>
                <tbody className="divide-y divide-gray-100 bg-white">
                  {shown.map((m) => {
                    const count = Number(m.count) || 0;
                    const width = Math.round((count / maxMonthly) * 100);
                    return (
                      <tr key={m.month}>
                        <td className={`${td} whitespace-nowrap font-medium text-gray-900`}>{m.month}</td>
                        <td className={td}>
                          <div className="h-2.5 min-w-[120px] rounded-full bg-gray-100" title={`${m.month}: ${count} joining`}>
                            <div className="h-2.5 rounded-full bg-blue-500" style={{ width: `${width}%` }} />
                          </div>
                        </td>
                        <td className={`${td} text-right font-semibold text-gray-900`}>{m.count}</td>
                        <td className={`${td} text-right text-gray-500`}>{shownTotal ? `${Math.round((count * 100) / shownTotal)}%` : "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </Card>
    </div>
  );
}
