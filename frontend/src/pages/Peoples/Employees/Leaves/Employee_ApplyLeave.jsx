import { useEffect, useMemo, useRef, useState } from "react";
import EmployeePageShell from "../../../../components/employee/EmployeePageShell";
import StatCard from "../../../../components/employee/StatCard";
import EmployeeStatusBadge from "../../../../components/employee/EmployeeStatusBadge";
import { getLeaveBalances, getLeaveRequests } from "../../../../service/employee";
import { getStoredUser } from "../../../../service/api";

const colorToAccent = {
  "#4F46E5": "text-indigo-600 dark:text-indigo-400",
  "#059669": "text-emerald-600 dark:text-emerald-400",
  "#0EA5E9": "text-sky-600 dark:text-sky-400",
  "#DC2626": "text-red-600 dark:text-red-400",
  "#6B7280": "text-gray-500 dark:text-gray-400",
};

function formatDate(dateStr) {
  if (!dateStr) return "-";
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

export default function MyLeave() {
  const [balances, setBalances] = useState([]);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    setLoading(true);
    setError(null);

    const employeeId = getStoredUser()?.id;
    if (!employeeId) {
      if (mounted.current) {
        setError("User not found. Please log in again.");
        setLoading(false);
      }
      return;
    }

    Promise.all([
      getLeaveBalances(employeeId),
      getLeaveRequests(employeeId),
    ])
      .then(([balancesRes, historyRes]) => {
        if (!mounted.current) return;
        setBalances(Array.isArray(balancesRes) ? balancesRes : []);
        const list = Array.isArray(historyRes) ? historyRes : [];
        list.sort((a, b) => {
          const da = a.created_at || a.appliedOn || a.start_date;
          const db = b.created_at || b.appliedOn || b.start_date;
          return new Date(db || 0) - new Date(da || 0);
        });
        setHistory(list);
      })
      .catch((err) => {
        if (mounted.current) setError(err.message || "Failed to load leave data");
      })
      .finally(() => {
        if (mounted.current) setLoading(false);
      });

    return () => { mounted.current = false; };
  }, []);

  const leaveTypes = useMemo(
    () =>
      balances.map((b) => ({
        type: b.leave_type || b.type || "Leave",
        total: b.total_days || b.total || 0,
        used: b.used_days || b.used || 0,
        remaining: b.remaining_days ?? b.remaining ?? ((b.total_days || b.total || 0) - (b.used_days || b.used || 0)),
        color:
          (b.leave_type || b.type || "").includes("Annual")
            ? "#4F46E5"
            : (b.leave_type || b.type || "").includes("Sick")
              ? "#059669"
              : (b.leave_type || b.type || "").includes("Casual")
                ? "#0EA5E9"
                : (b.leave_type || b.type || "").includes("Unpaid")
                  ? "#DC2626"
                  : "#6B7280",
      })),
    [balances]
  );

  if (loading) {
    return (
      <EmployeePageShell title="My Leave" subtitle="View your leave balances and request history.">
        <div className="flex justify-center items-center py-20">
          <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
        </div>
      </EmployeePageShell>
    );
  }

  if (error) {
    return (
      <EmployeePageShell title="My Leave" subtitle="View your leave balances and request history.">
        <div className="bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 px-4 py-3 rounded-lg text-sm font-medium">
          {error}
        </div>
      </EmployeePageShell>
    );
  }

  return (
    <EmployeePageShell title="My Leave" subtitle="View your leave balances and request history.">
      {leaveTypes.length === 0 ? (
        <div className="text-center py-16 text-gray-500 dark:text-[#94a3b8]">
          <p className="text-lg font-medium dark:text-[#e2e8f0]">No leave balances found</p>
          <p className="text-sm mt-1">Contact HR to initialize your leave balance.</p>
        </div>
      ) : (
        <div className="grid grid-cols-4 gap-4 mb-7">
          {leaveTypes.map((l) => (
            <StatCard
              key={l.type}
              label={l.type}
              value={l.remaining}
              sub={`of ${l.total} days remaining`}
              accentColor={colorToAccent[l.color] || "text-gray-500 dark:text-gray-400"}
            />
          ))}
        </div>
      )}

      {history.length === 0 ? (
        <div className="text-center py-16 text-gray-500 dark:text-[#94a3b8]">
          <p className="text-lg font-medium dark:text-[#e2e8f0]">No leave history</p>
        </div>
      ) : (
        <div className="p-6 rounded-xl bg-white dark:bg-[#1e293b] border border-gray-200 dark:border-[#334155]">
          <h3 className="text-base font-bold text-gray-900 dark:text-[#f1f5f9] mb-4">Leave History</h3>
            {history.map((h, i) => (
              <div key={h.id || i} className="flex justify-between items-center py-3 border-t border-gray-100 dark:border-[#334155]">
                <div>
                  <p className="text-sm font-semibold text-gray-900 dark:text-[#f1f5f9]">
                    {h.leave_type || h.type || "Leave"}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-[#94a3b8]">
                  {formatDate(h.start_date)} &rarr; {formatDate(h.end_date)} &middot;{" "}
                  {h.days || 1} day(s)
                </p>
              </div>
              <EmployeeStatusBadge status={h.status} />
            </div>
          ))}
        </div>
      )}
    </EmployeePageShell>
  );
}
