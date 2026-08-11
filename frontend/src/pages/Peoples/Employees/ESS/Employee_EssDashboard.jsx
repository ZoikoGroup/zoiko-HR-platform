import { useEffect, useMemo, useRef, useState } from "react";
import EmployeePageShell from "../../../../components/employee/EmployeePageShell";
import EmployeeStatusBadge from "../../../../components/employee/EmployeeStatusBadge";
import StatCard from "../../../../components/employee/StatCard";
import { getMyProfile, getLeaveBalances, getAttendanceRecords, getEss, getDocuments } from "../../../../service/employee";
import { getStoredUser } from "../../../../service/api";

export default function EssDashboard() {
  const [profile, setProfile] = useState(null);
  const [balances, setBalances] = useState([]);
  const [attendance, setAttendance] = useState([]);
  const [essRecords, setEssRecords] = useState([]);
  const [documents, setDocuments] = useState({ data: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    setLoading(true);
    setError(null);

    const employeeId = getStoredUser()?.id;

    Promise.all([
      getMyProfile(),
      employeeId ? getLeaveBalances(employeeId) : Promise.resolve([]),
      getAttendanceRecords(),
      employeeId ? getEss(employeeId) : Promise.resolve([]),
      getDocuments({}),
    ])
      .then(([profileRes, balancesRes, attendanceRes, essRes, docsRes]) => {
        if (!mounted.current) return;
        setProfile(profileRes.data || profileRes);
        setBalances(Array.isArray(balancesRes) ? balancesRes : []);
        setAttendance(
          attendanceRes?.items || (Array.isArray(attendanceRes) ? attendanceRes : [])
        );
        setEssRecords(Array.isArray(essRes) ? essRes : []);
        setDocuments(docsRes);
      })
      .catch((err) => {
        if (mounted.current) setError(err.message || "Failed to load dashboard");
      })
      .finally(() => {
        if (mounted.current) setLoading(false);
      });

    return () => { mounted.current = false; };
  }, []);

  const stats = useMemo(() => {
    const totalLeaveDays = balances.reduce((sum, b) => sum + (b.remaining_days ?? b.remaining ?? 0), 0);
    const presentDays = attendance.filter((r) => r.status === "Present").length;
    const totalDays = attendance.length || 1;
    const attendancePct = Math.round((presentDays / totalDays) * 100);
    const pendingRequests = essRecords.filter((r) => r.status === "Pending").length;
    const docCount = documents?.data?.length || 0;

    return [
      { label: "Leave Balance", value: `${totalLeaveDays} Days`, sub: "Annual leave remaining", color: "#4F46E5" },
      { label: "Attendance", value: `${attendancePct}%`, sub: "This month", color: "#059669" },
      { label: "Pending Requests", value: String(pendingRequests), sub: "Awaiting approval", color: "#D97706" },
      { label: "Documents", value: String(docCount), sub: "Files uploaded", color: "#0EA5E9" },
    ];
  }, [balances, attendance, essRecords, documents]);

  const recentActivity = useMemo(() => {
    const activities = [];

    essRecords.forEach((r) => {
      if (r.type || r.leave_type || r.requestType) {
        activities.push({
          action: `${r.type || r.requestType || r.leave_type} request`,
          date: r.createdAt || r.created_at || r.raised,
          status: r.status === "Approved" ? "Approved" : r.status === "Pending" ? "Pending" : r.status,
        });
      }
    });

    attendance.forEach((r) => {
      if (r.date) {
        activities.push({
          action: `Attendance marked — ${r.status}`,
          date: r.date,
          status: "Done",
        });
      }
    });

    activities.sort((a, b) => {
      const da = a.date ? new Date(a.date) : new Date(0);
      const db = b.date ? new Date(b.date) : new Date(0);
      return db - da;
    });

    return activities.slice(0, 8);
  }, [essRecords, attendance]);

  if (loading) {
    return (
      <EmployeePageShell title="Employee Self Service" subtitle="Welcome back! Here's your personal overview for today.">
        <div className="flex justify-center items-center py-20">
          <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
        </div>
      </EmployeePageShell>
    );
  }

  if (error) {
    return (
      <EmployeePageShell title="Employee Self Service" subtitle="Welcome back! Here's your personal overview for today.">
        <div className="bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 px-4 py-3 rounded-lg text-sm font-medium">
          {error}
        </div>
      </EmployeePageShell>
    );
  }

  return (
    <EmployeePageShell title="Employee Self Service" subtitle="Welcome back! Here's your personal overview for today.">
      <div className="grid grid-cols-4 gap-4 mb-7">
        {stats.map((s) => (
          <StatCard key={s.label} label={s.label} value={s.value} sub={s.sub} accentColor={
            s.color === "#4F46E5" ? "text-indigo-600 dark:text-indigo-400" :
            s.color === "#059669" ? "text-emerald-600 dark:text-emerald-400" :
            s.color === "#D97706" ? "text-amber-600 dark:text-amber-400" :
            "text-sky-600 dark:text-sky-400"
          } />
        ))}
      </div>

      {recentActivity.length === 0 ? (
        <div className="text-center py-16 text-gray-500 dark:text-[#94a3b8]">
          <p className="text-lg font-medium dark:text-[#f1f5f9]">No recent activity</p>
        </div>
      ) : (
        <div className="p-6 rounded-xl bg-white dark:bg-[#1e293b] border border-gray-200 dark:border-[#334155]">
          <h3 className="text-base font-bold text-gray-900 dark:text-[#f1f5f9] mb-4">Recent Activity</h3>
          {recentActivity.map((a, i) => (
            <div key={i} className="flex justify-between items-center py-3 border-t border-gray-100 dark:border-[#334155]">
              <div>
                <p className="text-sm font-semibold text-gray-900 dark:text-[#f1f5f9]">{a.action}</p>
                <p className="text-xs text-gray-500 dark:text-[#94a3b8]">
                  {a.date
                    ? new Date(a.date).toLocaleDateString("en-US", {
                        year: "numeric",
                        month: "short",
                        day: "numeric",
                      })
                    : "-"}
                </p>
              </div>
              <EmployeeStatusBadge status={a.status} />
            </div>
          ))}
        </div>
      )}
    </EmployeePageShell>
  );
}
