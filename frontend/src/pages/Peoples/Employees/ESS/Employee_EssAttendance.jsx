import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Download, Search } from "lucide-react";
import EmployeePageShell from "../../../../components/employee/EmployeePageShell";
import EmployeeStatusBadge from "../../../../components/employee/EmployeeStatusBadge";
import { getAttendanceRecords } from "../../../../service/employee";

// Helper to format date cleanly
function formatDateLabel(dateStr) {
  if (!dateStr) return "-";
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return d.toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return dateStr;
  }
}

export default function EssAttendance() {
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [statusFilter, setStatusFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const mounted = useRef(true);

  // Fetch Attendance records — dynamic only, no mock fallback
  useEffect(() => {
    mounted.current = true;
    setLoading(true);
    setError(null);

    getAttendanceRecords()
      .then((data) => {
        if (!mounted.current) return;
        const list = data?.items || (Array.isArray(data) ? data : []);
        setRecords(list);
        setError(null);
      })
      .catch((err) => {
        if (mounted.current) {
          setError(err?.message || "Failed to load attendance records.");
        }
      })
      .finally(() => {
        if (mounted.current) setLoading(false);
      });

    return () => {
      mounted.current = false;
    };
  }, []);

  // Compute metrics from records (dynamic only)
  const metrics = useMemo(() => {
    const total = records.length;
    const present = records.filter(
      (r) => (r.status || "").toLowerCase() === "present"
    ).length;
    const late = records.filter(
      (r) => (r.status || "").toLowerCase() === "late"
    ).length;
    const absent = records.filter(
      (r) => (r.status || "").toLowerCase() === "absent"
    ).length;
    const halfDay = records.filter(
      (r) => (r.status || "").toLowerCase() === "half day"
    ).length;

    const workingDays = Math.max(present + late + halfDay + absent, 1);
    const attendanceRate = Math.round(((present + late) / workingDays) * 100);
    const punctualityRate = Math.round(
      (present / Math.max(present + late, 1)) * 100
    );

    let hoursSum = 0;
    let hoursCount = 0;
    let overtimeSum = 0;

    records.forEach((r) => {
      const h =
        typeof r.total_hours === "number"
          ? r.total_hours
          : parseFloat(String(r.hours || "0"));
      if (!isNaN(h) && h > 0) {
        hoursSum += h;
        hoursCount++;
        if (h > 8.0) {
          overtimeSum += h - 8.0;
        }
      }
    });

    const avgHours = hoursCount > 0 ? (hoursSum / hoursCount).toFixed(1) : "0.0";

    return {
      total,
      present,
      late,
      absent,
      halfDay,
      attendanceRate,
      punctualityRate,
      avgHours,
      overtimeHours: overtimeSum.toFixed(1),
    };
  }, [records]);

  // Filtered records for table
  const filteredRecords = useMemo(() => {
    return records.filter((r) => {
      const statusMatch =
        statusFilter === "all" ||
        (r.status || "").toLowerCase() === statusFilter.toLowerCase();
      const q = searchQuery.toLowerCase().trim();
      const searchMatch =
        !q ||
        (r.date || "").toLowerCase().includes(q) ||
        (r.status || "").toLowerCase().includes(q) ||
        (r.shift || "").toLowerCase().includes(q);
      return statusMatch && searchMatch;
    });
  }, [records, statusFilter, searchQuery]);

  // Export CSV function
  const handleExportCSV = () => {
    if (records.length === 0) return;
    const headers = ["Date", "Shift", "Check In", "Check Out", "Hours", "Overtime", "Status"];
    const rows = filteredRecords.map((r) => [
      r.date || "",
      r.shift || "-",
      r.checkIn || r.check_in || "-",
      r.checkOut || r.check_out || "-",
      r.hours || "-",
      r.overtime || "-",
      r.status || "-",
    ]);

    const csvContent =
      "data:text/csv;charset=utf-8," +
      [headers.join(","), ...rows.map((e) => e.join(","))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `attendance_records_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (loading) {
    return (
      <EmployeePageShell
        title="My Attendance"
        subtitle="Your attendance records from the server."
      >
        <div className="flex flex-col justify-center items-center py-24">
          <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mb-3" />
          <p className="text-sm text-slate-500 font-medium">Loading attendance records...</p>
        </div>
      </EmployeePageShell>
    );
  }

  if (error) {
    return (
      <EmployeePageShell
        title="My Attendance"
        subtitle="Your attendance records from the server."
      >
        <div role="alert" className="bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 px-4 py-4 rounded-xl text-sm font-medium flex items-center justify-between gap-4">
          <span>{error}</span>
          <button type="button" onClick={() => window.location.reload()} className="inline-flex items-center gap-1.5 font-semibold underline">
            Reload
          </button>
        </div>
      </EmployeePageShell>
    );
  }

  return (
    <EmployeePageShell
      title="My Attendance"
      subtitle="Your attendance records from the server."
      actions={
        <div className="flex items-center gap-3">
          <Link
            to="/employee/ess/time-requests"
            className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-xl bg-white dark:bg-[#1e293b] border border-slate-200 dark:border-[#334155] text-slate-700 dark:text-slate-200 hover:bg-slate-50 transition shadow-sm"
          >
            Time Requests
          </Link>
          <button
            type="button"
            onClick={handleExportCSV}
            className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-xl bg-blue-600 hover:bg-blue-700 text-white transition shadow-sm"
          >
            <Download className="w-3.5 h-3.5" />
            Export CSV
          </button>
        </div>
      }
    >
      <div className="space-y-6">
        {/* KPI METRICS CARDS GRID — computed from live records only */}
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
          <div className="rounded-2xl bg-white dark:bg-[#1e293b] border border-slate-200/80 dark:border-[#334155] p-5 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-[#94a3b8]">
                Present Days
              </span>
            </div>
            <p className="text-2xl font-black text-slate-900 dark:text-white">{metrics.present}</p>
            <span className="inline-block mt-2 text-[11px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 px-2 py-0.5 rounded-md">
              {metrics.attendanceRate}% Attendance
            </span>
          </div>

          <div className="rounded-2xl bg-white dark:bg-[#1e293b] border border-slate-200/80 dark:border-[#334155] p-5 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-[#94a3b8]">
                Punctuality
              </span>
            </div>
            <p className="text-2xl font-black text-slate-900 dark:text-white">{metrics.punctualityRate}%</p>
            <span className="inline-block mt-2 text-[11px] font-bold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/40 px-2 py-0.5 rounded-md">
              {metrics.present} on-time arrivals
            </span>
          </div>

          <div className="rounded-2xl bg-white dark:bg-[#1e293b] border border-slate-200/80 dark:border-[#334155] p-5 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-[#94a3b8]">
                Late Arrivals
              </span>
            </div>
            <p className="text-2xl font-black text-slate-900 dark:text-white">{metrics.late}</p>
          </div>

          <div className="rounded-2xl bg-white dark:bg-[#1e293b] border border-slate-200/80 dark:border-[#334155] p-5 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-[#94a3b8]">
                Absent Days
              </span>
            </div>
            <p className="text-2xl font-black text-slate-900 dark:text-white">{metrics.absent}</p>
          </div>

          <div className="rounded-2xl bg-white dark:bg-[#1e293b] border border-slate-200/80 dark:border-[#334155] p-5 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-[#94a3b8]">
                Avg Daily Hours
              </span>
            </div>
            <p className="text-2xl font-black text-slate-900 dark:text-white">{metrics.avgHours}h</p>
          </div>

          <div className="rounded-2xl bg-white dark:bg-[#1e293b] border border-slate-200/80 dark:border-[#334155] p-5 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-[#94a3b8]">
                Overtime Logged
              </span>
            </div>
            <p className="text-2xl font-black text-slate-900 dark:text-white">{metrics.overtimeHours}h</p>
          </div>
        </div>

        {/* RECORDS FILTER & DATA TABLE */}
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                Attendance Log Records
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Detailed check-in, check-out, duration, and status per date
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
              <div className="inline-flex rounded-xl bg-slate-100 dark:bg-[#1e293b] p-1 border border-slate-200 dark:border-[#334155]">
                {["all", "present", "late", "absent"].map((tab) => (
                  <button
                    key={tab}
                    type="button"
                    onClick={() => setStatusFilter(tab)}
                    className={`px-3 py-1.5 text-xs font-bold rounded-lg capitalize transition-all ${
                      statusFilter === tab
                        ? "bg-white dark:bg-slate-800 text-blue-600 dark:text-blue-400 shadow-sm"
                        : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                    }`}
                  >
                    {tab}
                  </button>
                ))}
              </div>

              <div className="relative flex-1 sm:flex-none">
                <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="Filter records..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-8 pr-3 py-1.5 text-xs rounded-xl border border-slate-200 dark:border-[#334155] bg-white dark:bg-[#1e293b] text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                />
              </div>
            </div>
          </div>

          {records.length === 0 ? (
            <div className="text-center py-16 bg-white dark:bg-[#1e293b] rounded-2xl border border-slate-200 dark:border-[#334155] text-slate-500 dark:text-[#94a3b8]">
              <p className="text-base font-semibold text-slate-800 dark:text-slate-200">
                No attendance records found
              </p>
              <p className="text-xs text-slate-400 mt-1">
                Records load from the server once they exist.
              </p>
            </div>
          ) : (
            <div className="rounded-2xl bg-white dark:bg-[#1e293b] border border-slate-200 dark:border-[#334155] overflow-hidden shadow-sm">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-[#334155] bg-slate-50 dark:bg-[#0f172a]">
                      <th className="px-5 py-3.5 text-left text-xs font-bold text-slate-500 dark:text-[#94a3b8] uppercase tracking-wider">
                        Date
                      </th>
                      <th className="px-5 py-3.5 text-left text-xs font-bold text-slate-500 dark:text-[#94a3b8] uppercase tracking-wider">
                        Shift
                      </th>
                      <th className="px-5 py-3.5 text-left text-xs font-bold text-slate-500 dark:text-[#94a3b8] uppercase tracking-wider">
                        Check In
                      </th>
                      <th className="px-5 py-3.5 text-left text-xs font-bold text-slate-500 dark:text-[#94a3b8] uppercase tracking-wider">
                        Check Out
                      </th>
                      <th className="px-5 py-3.5 text-left text-xs font-bold text-slate-500 dark:text-[#94a3b8] uppercase tracking-wider">
                        Working Hours
                      </th>
                      <th className="px-5 py-3.5 text-left text-xs font-bold text-slate-500 dark:text-[#94a3b8] uppercase tracking-wider">
                        Overtime
                      </th>
                      <th className="px-5 py-3.5 text-left text-xs font-bold text-slate-500 dark:text-[#94a3b8] uppercase tracking-wider">
                        Status
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-[#334155]">
                    {filteredRecords.map((row) => {
                      const isLate = (row.status || "").toLowerCase() === "late";
                      const isPresent = (row.status || "").toLowerCase() === "present";
                      const hVal =
                        typeof row.total_hours === "number"
                          ? row.total_hours
                          : parseFloat(String(row.hours || "0"));

                      return (
                        <tr
                          key={row.id}
                          className="hover:bg-slate-50/80 dark:hover:bg-[#1e293b]/70 transition-colors"
                        >
                          <td className="px-5 py-3.5">
                            <span className="font-semibold text-slate-900 dark:text-white block">
                              {formatDateLabel(row.date)}
                            </span>
                            <span className="text-[11px] text-slate-400 font-mono">
                              {row.date}
                            </span>
                          </td>
                          <td className="px-5 py-3.5 text-slate-600 dark:text-slate-300 text-xs">
                            {row.shift || "-"}
                          </td>
                          <td className="px-5 py-3.5">
                            <span className="font-mono text-slate-800 dark:text-slate-200 font-medium">
                              {row.checkIn || row.check_in || "-"}
                            </span>
                          </td>
                          <td className="px-5 py-3.5 font-mono text-slate-800 dark:text-slate-200 font-medium">
                            {row.checkOut || row.check_out || "-"}
                          </td>
                          <td className="px-5 py-3.5">
                            <span className="font-bold text-slate-900 dark:text-white text-xs">
                              {row.hours || (hVal ? `${hVal} hrs` : "-")}
                            </span>
                          </td>
                          <td className="px-5 py-3.5 text-xs font-semibold text-purple-600 dark:text-purple-400">
                            {row.overtime || (hVal > 8.0 ? `+${(hVal - 8.0).toFixed(1)}h` : "-")}
                          </td>
                          <td className="px-5 py-3.5">
                            <EmployeeStatusBadge status={row.status || "Present"} />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>
    </EmployeePageShell>
  );
}
