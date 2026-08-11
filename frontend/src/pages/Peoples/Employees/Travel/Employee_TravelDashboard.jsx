import { useEffect, useMemo, useState } from "react";
import EmployeePageShell from "../../../../components/employee/EmployeePageShell";
import EmployeeStatusBadge from "../../../../components/employee/EmployeeStatusBadge";
import StatCard from "../../../../components/employee/StatCard";
import { getTravel } from "../../../../service/employee";

function normalizeStatus(s) {
  const v = String(s || "").toLowerCase();
  if (v.includes("approve")) return "Approved";
  if (v.includes("pending")) return "Pending";
  if (v.includes("reject")) return "Rejected";
  if (v.includes("complete")) return "Completed";
  if (v.includes("expense")) return "Expense";
  return s ? String(s) : "";
}


function computeAmount(records) {
  const total = records.reduce((sum, r) => {
    const amt = parseFloat(String(r.amount || r.expense_amount || "0").replace(/[^0-9.]/g, ""));
    return sum + (isNaN(amt) ? 0 : amt);
  }, 0);
  return `₹${total.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
}

export default function TravelDashboard() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [trips, setTrips] = useState([]);

  useEffect(() => {
    let mounted = true;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const res = await getTravel();
        const data = res?.data || res?.items || res || [];
        const arr = Array.isArray(data) ? data : Array.isArray(data?.items) ? data.items : [];
        if (mounted) setTrips(arr);
      } catch (e) {
        if (!mounted) return;
        setError(e?.message || "Failed to load travel data");
        setTrips([]);
      } finally {
        if (mounted) setLoading(false);
      }
    }
    load();
    return () => { mounted = false; };
  }, []);

  const stats = useMemo(() => {
    const total = trips.length;
    const pending = trips.filter((t) => normalizeStatus(t.status) === "Pending").length;
    const expenseRecords = trips.filter((t) => normalizeStatus(t.status) === "Expense" || t.type === "expense" || t.category);
    const expenses = expenseRecords.length > 0
      ? computeAmount(expenseRecords)
      : `₹${trips.reduce((s, t) => {
          const a = parseFloat(String(t.amount || t.expense_amount || "0").replace(/[^0-9.]/g, ""));
          return s + (isNaN(a) ? 0 : a);
        }, 0).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
    const upcoming = trips.filter((t) => {
      const st = normalizeStatus(t.status);
      return st === "Approved" || st === "Pending";
    }).length;
    return { total, pending, expenses, upcoming };
  }, [trips]);

  const recentTrips = useMemo(() => {
    return trips
      .filter((t) => {
        const st = normalizeStatus(t.status);
        return st === "Approved" || st === "Pending" || st === "Completed";
      })
      .slice(0, 5);
  }, [trips]);

  return (
    <EmployeePageShell title="Travel Dashboard" subtitle="Overview of your business travel and reimbursements.">
      {loading && (
        <div className="flex justify-center items-center py-20">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
          <span className="ml-3 text-gray-500">Loading travel data...</span>
        </div>
      )}

      {!loading && error && (
        <div className="mb-4 px-4 py-3 bg-red-50 border border-red-200 text-red-700 rounded-lg">{error}</div>
      )}

      {!loading && !error && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard label="Total Trips" value={stats.total} accentColor="text-indigo-600 dark:text-indigo-400" />
            <StatCard label="Pending Approval" value={stats.pending} accentColor="text-yellow-600 dark:text-amber-400" />
            <StatCard label="Expenses Claimed" value={stats.expenses} accentColor="text-green-600 dark:text-emerald-400" />
            <StatCard label="Upcoming Trips" value={stats.upcoming} accentColor="text-sky-600 dark:text-sky-400" />
          </div>

          <div className="bg-white dark:bg-[#1e293b] rounded-xl border border-gray-200 dark:border-[#334155] p-6">
            <h3 className="text-base font-bold text-gray-900 dark:text-[#f1f5f9] mb-4">Recent Trips</h3>
            {recentTrips.length === 0 ? (
              <p className="text-sm text-gray-400 dark:text-[#64748b] text-center py-8">No recent trips found.</p>
            ) : (
              recentTrips.map((t, i) => {
                const st = normalizeStatus(t.status);
                return (
                  <div key={t.id || i} className="flex justify-between items-center py-3.5 border-t border-gray-100 dark:border-[#334155] first:border-t-0">
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-gray-900 dark:text-[#f1f5f9]">{t.destination || t.location || t.city || "Trip"}</p>
                      <p className="text-xs text-gray-500 dark:text-[#94a3b8]">{t.purpose || t.reason || ""}</p>
                      <p className="text-xs text-gray-400 dark:text-[#64748b]">{t.travel_date || t.date || t.from || ""}</p>
                    </div>
                    <EmployeeStatusBadge status={st || t.status || "-"} />
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </EmployeePageShell>
  );
}
