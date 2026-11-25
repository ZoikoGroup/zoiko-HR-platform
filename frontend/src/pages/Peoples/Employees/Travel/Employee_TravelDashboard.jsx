import { useEffect, useMemo, useState } from "react";
import EmployeePageShell from "../../../../components/employee/EmployeePageShell";
import EmployeeStatusBadge from "../../../../components/employee/EmployeeStatusBadge";
import StatCard from "../../../../components/employee/StatCard";
import { getTravel, getTravelExpenses } from "../../../../service/employee";
import { getStoredUser } from "../../../../service/api";
import { formatClaimAmount } from "../../../../utils/travelExpenseForm";

// Trips and expense claims share one status vocabulary here (an expense "submitted" is waiting for approval).
export function normalizeStatus(s) {
  const v = String(s || "").toLowerCase();
  if (v.includes("reimburs") || v.includes("paid")) return "Reimbursed";
  if (v.includes("approve")) return "Approved";
  if (v.includes("pending") || v.includes("submitted") || v.includes("progress")) return "Pending";
  if (v.includes("reject")) return "Rejected";
  if (v.includes("cancel")) return "Cancelled";
  if (v.includes("complete")) return "Completed";
  return s ? String(s) : "";
}

const asList = (res) => {
  const data = res?.data || res?.items || res || [];
  return Array.isArray(data) ? data : Array.isArray(data?.items) ? data.items : [];
};

/** "Expenses claimed": every claim that is still standing (not rejected or cancelled), summed per currency. */
export function claimedTotal(claims) {
  const byCurrency = {};
  claims.forEach((c) => {
    if (["Rejected", "Cancelled"].includes(normalizeStatus(c.status))) return;
    const n = Number(c.amount);
    if (!Number.isFinite(n)) return;
    const cur = c.currency || "INR";
    byCurrency[cur] = (byCurrency[cur] || 0) + n;
  });
  const parts = Object.entries(byCurrency).map(([cur, n]) => formatClaimAmount(n, cur));
  return parts.length ? parts.join(" + ") : formatClaimAmount(0, "INR");
}

export default function TravelDashboard() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [trips, setTrips] = useState([]);
  const [claims, setClaims] = useState([]);

  useEffect(() => {
    let mounted = true;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const me = getStoredUser()?.id;
        const [tripRes, claimRes] = await Promise.all([getTravel(me), getTravelExpenses(me).catch(() => [])]);
        if (!mounted) return;
        setTrips(asList(tripRes));
        setClaims(asList(claimRes));
      } catch (e) {
        if (!mounted) return;
        setError(e?.message || "Failed to load travel data");
        setTrips([]);
        setClaims([]);
      } finally {
        if (mounted) setLoading(false);
      }
    }
    load();
    return () => { mounted = false; };
  }, []);

  const stats = useMemo(() => {
    const total = trips.length;
    // waiting on someone: travel requests and expense claims alike
    const pending = [...trips, ...claims].filter((t) => normalizeStatus(t.status) === "Pending").length;
    const upcoming = trips.filter((t) => {
      const st = normalizeStatus(t.status);
      return st === "Approved" || st === "Pending";
    }).length;
    return { total, pending, expenses: claimedTotal(claims), upcoming };
  }, [trips, claims]);

  const recentTrips = useMemo(() => {
    return trips
      .filter((t) => {
        const st = normalizeStatus(t.status);
        return st === "Approved" || st === "Pending" || st === "Completed" || st === "Rejected";
      })
      .slice(0, 5);
  }, [trips]);

  const tripName = useMemo(() => Object.fromEntries(trips.map((t) => [t.id, t.destination])), [trips]);
  const recentClaims = useMemo(
    () => [...claims].sort((a, b) => (Number(b.id) || 0) - (Number(a.id) || 0)).slice(0, 5),
    [claims]
  );

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
            <StatCard label="Total Trips" value={stats.total} accentColor="text-blue-600 dark:text-blue-400" />
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

          <div className="bg-white dark:bg-[#1e293b] rounded-xl border border-gray-200 dark:border-[#334155] p-6">
            <h3 className="text-base font-bold text-gray-900 dark:text-[#f1f5f9] mb-4">Recent Expense Claims</h3>
            {recentClaims.length === 0 ? (
              <p className="text-sm text-gray-400 dark:text-[#64748b] text-center py-8">No expense claims yet.</p>
            ) : (
              recentClaims.map((c) => (
                <div key={c.id} className="flex justify-between items-center gap-3 py-3.5 border-t border-gray-100 dark:border-[#334155] first:border-t-0">
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-gray-900 dark:text-[#f1f5f9]">
                      {c.expense_type || c.category || "Expense"} · {formatClaimAmount(c.amount, c.currency || "INR")}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-[#94a3b8] truncate">
                      {c.request_id ? tripName[c.request_id] || `Trip #${c.request_id}` : ""}{c.description ? ` — ${c.description}` : ""}
                    </p>
                  </div>
                  <EmployeeStatusBadge status={normalizeStatus(c.status) || "-"} />
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </EmployeePageShell>
  );
}
