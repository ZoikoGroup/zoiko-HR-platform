import { useEffect, useMemo, useState } from "react";
import EmployeePageShell from "../../../../components/employee/EmployeePageShell";
import EmployeeStatusBadge from "../../../../components/employee/EmployeeStatusBadge";
import StatCard from "../../../../components/employee/StatCard";
import { getTravel, getTravelExpenses } from "../../../../service/employee";
import { getStoredUser } from "../../../../service/api";
import { formatDate } from "../../../../utils/dateTime";
import { formatClaimAmount } from "../../../../utils/travelExpenseForm";

// An expense claim is "submitted" while it waits; once reimbursed it counts with the approved ones.
export function normalizeStatus(s) {
  const v = String(s || "").toLowerCase();
  if (v.includes("approve") || v.includes("reimburs") || v.includes("paid")) return "Approved";
  if (v.includes("pending") || v.includes("submitted") || v.includes("progress")) return "Pending";
  if (v.includes("reject")) return "Rejected";
  return s ? String(s) : "";
}

const asList = (res) => {
  const data = res?.data || res?.items || res || [];
  return Array.isArray(data) ? data : Array.isArray(data?.items) ? data.items : [];
};

const DECIDED = ["Approved", "Pending", "Rejected"];

/** Travel requests and expense claims as one list of decisions, newest first. */
export function approvalItems(trips, claims) {
  const tripName = Object.fromEntries(trips.map((t) => [t.id, t.destination]));
  const items = [
    ...trips.map((t) => ({
      key: `trip-${t.id}`,
      kind: "Travel request",
      ref: t.id || t.travel_id || t.request_id || t.code || "TR",
      title: t.destination || t.location || t.city || "Destination",
      approver: t.approver || t.approved_by || t.manager_name || "",
      when: t.requestedOn || t.requested_on || t.created_at || "",
      note: t.note || t.reason || t.comment || "",
      status: normalizeStatus(t.status),
    })),
    ...claims.map((c) => ({
      key: `expense-${c.id}`,
      kind: "Expense claim",
      ref: `EXP-${c.id}`,
      title: `${c.expense_type || c.category || "Expense"} · ${formatClaimAmount(c.amount, c.currency || "INR")}`
        + (c.request_id ? ` (${tripName[c.request_id] || `Trip #${c.request_id}`})` : ""),
      approver: c.approved_by_name || c.approver || "",
      when: c.created_at || c.submitted_at || "",
      note: c.description || "",
      status: normalizeStatus(c.status),
    })),
  ];
  return items
    .filter((i) => DECIDED.includes(i.status))
    .sort((a, b) => String(b.when).localeCompare(String(a.when)));
}

export default function TravelApprovals() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [approvals, setApprovals] = useState([]);

  useEffect(() => {
    let mounted = true;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const me = getStoredUser()?.id;
        const [tripRes, claimRes] = await Promise.all([getTravel(me), getTravelExpenses(me).catch(() => [])]);
        if (mounted) setApprovals(approvalItems(asList(tripRes), asList(claimRes)));
      } catch (e) {
        if (!mounted) return;
        setError(e?.message || "Failed to load travel approvals");
        setApprovals([]);
      } finally {
        if (mounted) setLoading(false);
      }
    }

    load();
    return () => {
      mounted = false;
    };
  }, []);

  const stats = useMemo(() => {
    const s = { Approved: 0, Pending: 0, Rejected: 0 };
    approvals.forEach((a) => {
      if (s[a.status] !== undefined) s[a.status]++;
    });
    return s;
  }, [approvals]);

  return (
    <EmployeePageShell title="Travel Approvals" subtitle="View the approval status of your travel requests and expense claims.">
      {loading && (
        <div className="flex justify-center items-center py-20">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
          <span className="ml-3 text-gray-500 dark:text-[#94a3b8]">Loading approvals...</span>
        </div>
      )}

      {!loading && error && (
        <div className="mb-4 px-4 py-3 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 rounded-lg">{error}</div>
      )}

      {!loading && !error && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <StatCard label="Approved" value={stats.Approved} accentColor="text-green-600 dark:text-emerald-400" />
            <StatCard label="Pending" value={stats.Pending} accentColor="text-yellow-600 dark:text-amber-400" />
            <StatCard label="Rejected" value={stats.Rejected} accentColor="text-red-600 dark:text-red-400" />
          </div>

          {approvals.length === 0 ? (
            <div className="text-center py-16 bg-white dark:bg-[#1e293b] rounded-xl border border-gray-200 dark:border-[#334155]">
              <p className="text-gray-500 dark:text-[#94a3b8] font-medium">No travel approvals found.</p>
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              {approvals.map((a) => (
                <div key={a.key} className="p-5 rounded-xl bg-white dark:bg-[#1e293b] border border-gray-200 dark:border-[#334155]">
                  <div className="flex justify-between items-start gap-4">
                    <div className="min-w-0">
                      <div className="flex flex-wrap gap-x-3 gap-y-1 items-center mb-2">
                        <span className="text-xs font-bold text-gray-400 dark:text-[#64748b]">{a.ref}</span>
                        <span className="text-base font-bold text-gray-900 dark:text-[#f1f5f9] break-words">{a.title}</span>
                        <span className="text-[11px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full bg-gray-100 dark:bg-[#334155] text-gray-600 dark:text-[#cbd5e1]">{a.kind}</span>
                      </div>
                      <p className="text-sm text-gray-600 dark:text-[#94a3b8] mb-1">Approver: <strong>{a.approver || "-"}</strong></p>
                      <p className="text-sm text-gray-600 dark:text-[#94a3b8] mb-1">Requested: {a.when ? formatDate(a.when) : "-"}</p>
                      {a.note && <p className="text-sm text-gray-700 dark:text-[#cbd5e1] italic break-words">{a.note}</p>}
                    </div>

                    <EmployeeStatusBadge status={a.status || "-"} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </EmployeePageShell>
  );
}
