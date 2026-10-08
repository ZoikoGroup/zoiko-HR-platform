import { useEffect, useRef, useState } from "react";
import EmployeePageShell from "../../../../components/employee/EmployeePageShell";
import EmployeeStatusBadge from "../../../../components/employee/EmployeeStatusBadge";
import EmployeeDataTable from "../../../../components/employee/EmployeeDataTable";
import { getLeaveRequests } from "../../../../service/employee";
import { getStoredUser } from "../../../../service/api";
import { formatDate } from "../../../../utils/dateTime";
import { useAutoRefresh } from "../../../../utils/useAutoRefresh";
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
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const mounted = useRef(true);

  const load = async ({ silent = false } = {}) => {
    const employeeId = getStoredUser()?.id;
    if (!employeeId) {
      if (mounted.current) {
        setError("User not found. Please log in again.");
        setLoading(false);
      }
      return;
    }
    if (!silent) {
      setLoading(true);
      setError(null);
    }
    try {
      const data = await getLeaveRequests(employeeId);
      if (!mounted.current) return;
      const list = Array.isArray(data) ? [...data] : [];
      list.sort((a, b) => {
        const da = a.created_at || a.appliedOn || a.start_date;
        const db = b.created_at || b.appliedOn || b.start_date;
        const diff = new Date(db || 0) - new Date(da || 0);
        return diff || (Number(b.id) || 0) - (Number(a.id) || 0);
      });
      setRecords(list);
      setError(null);
    } catch (err) {
      // a failed background refresh keeps what is on screen; only the first load shows the error
      if (mounted.current && !silent) setError(err.message || "Failed to load leave history");
    } finally {
      if (mounted.current && !silent) setLoading(false);
    }
  };

  useEffect(() => {
    mounted.current = true;
    load();
    return () => { mounted.current = false; };
  }, []);

  useAutoRefresh(load);

  if (loading) {
    return (
      <EmployeePageShell title="Leave History" subtitle="Complete record of all your leave requests.">
        <div className="flex justify-center items-center py-20">
          <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
        </div>
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
