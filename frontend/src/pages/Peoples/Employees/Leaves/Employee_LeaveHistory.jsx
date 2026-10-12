import EmployeePageShell from "../../../../components/employee/EmployeePageShell";
import { TableSkeleton } from "../../../../components/LoadingSkeletons";
import EmployeeStatusBadge from "../../../../components/employee/EmployeeStatusBadge";
import EmployeeDataTable from "../../../../components/employee/EmployeeDataTable";
import { formatDate } from "../../../../utils/dateTime";
import { useMyLeaveRequests } from "../../../../hooks/useMyLeave";
import { formatLeaveType, leaveTypeColor } from "../../../../utils/leaveTypeUtils";

/** Who decided the request: their name once decided, "Awaiting approval" while open, never a bare dash. */
function approverLabel(row) {
  const status = String(row.status || "").toLowerCase();
  const name = row.reviewer_name || row.approver || (row.approved_by && row.approved_by !== "-" ? row.approved_by : "");
  if (name) return name;
  if (status === "approved" || status === "rejected") return "HR team";
  if (status === "cancelled") return "Withdrawn";
  return "Awaiting approval";
}

function formatLeaveDate(dateStr) {
  if (!dateStr) return "-";
  return formatDate(dateStr);
}

export default function LeaveHistory() {
  // cached and refreshed in the background (every 30 s while visible, and on focus): see useMyLeave
  const { query, records, missingUser } = useMyLeaveRequests();
  const loading = !missingUser && query.isPending;
  const error = missingUser ? "User not found. Please log in again." : query.isError && !query.data ? (query.error?.message || "Failed to load leave history") : null;

  if (loading) {
    return (
      <EmployeePageShell title="Leave History" subtitle="Complete record of all your leave requests.">
        <div className="rounded-2xl border border-slate-200 dark:border-slate-700"><TableSkeleton rows={6} label="Loading leave history" /></div>
      </EmployeePageShell>
    );
  }

  if (error) {
    return (
      <EmployeePageShell title="Leave History" subtitle="Complete record of all your leave requests.">
        <div className="bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 px-4 py-3 rounded-lg text-sm font-medium">
          {error}
        </div>
      </EmployeePageShell>
    );
  }

  return (
    <EmployeePageShell title="Leave History" subtitle="Complete record of all your leave requests.">
      <EmployeeDataTable
        columns={[
          {key:"id", label:"ID"},
          {key:"type", label:"Type"},
          {key:"from", label:"From"},
          {key:"to", label:"To"},
          {key:"days", label:"Days"},
          {key:"appliedOn", label:"Applied On"},
          {key:"approver", label:"Approver"},
          {key:"status", label:"Status"},
        ]}
        rows={records}
        renderCell={(row, col) => {
          if (col.key === "status") return <EmployeeStatusBadge status={row.status} />;
          if (col.key === "id") return <span className="text-xs font-semibold text-gray-400 dark:text-[#94a3b8]">{row.id || row.leaveId || "-"}</span>;
          if (col.key === "type") return (
            <span className="inline-flex items-center gap-2 text-xs font-semibold text-gray-900 dark:text-[#f1f5f9]">
              <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: leaveTypeColor(row.leave_type || row.type) }} />
              {formatLeaveType(row.leave_type || row.type)}
            </span>
          );
          if (col.key === "from") return <span className="text-xs text-gray-700 dark:text-[#cbd5e1]">{formatLeaveDate(row.start_date)}</span>;
          if (col.key === "to") return <span className="text-xs text-gray-700 dark:text-[#cbd5e1]">{formatLeaveDate(row.end_date)}</span>;
          if (col.key === "days") return <span className="text-xs text-gray-700 dark:text-[#cbd5e1]">{row.days || 1}</span>;
          if (col.key === "appliedOn") return <span className="text-xs text-gray-700 dark:text-[#cbd5e1]">{formatLeaveDate(row.created_at || row.appliedOn)}</span>;
          if (col.key === "approver") return <span className="text-xs text-gray-700 dark:text-[#cbd5e1]">{approverLabel(row)}</span>;
          return row[col.key];
        }}
        emptyMessage="No leave history found"
      />
    </EmployeePageShell>
  );
}
