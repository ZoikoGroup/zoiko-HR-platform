import { useEffect, useRef, useState } from "react";
import EmployeePageShell from "../../../../components/employee/EmployeePageShell";
import EmployeeStatusBadge from "../../../../components/employee/EmployeeStatusBadge";
import EmployeeDataTable from "../../../../components/employee/EmployeeDataTable";
import { getLeaveRequests } from "../../../../service/employee";
import { getStoredUser } from "../../../../service/api";
import { formatDate } from "../../../../utils/dateTime";

function formatLeaveDate(dateStr) {
  if (!dateStr) return "-";
  return formatDate(dateStr);
}

export default function LeaveHistory() {
  const [records, setRecords] = useState([]);
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

    getLeaveRequests(employeeId)
      .then((data) => {
        if (!mounted.current) return;
        const list = Array.isArray(data) ? data : [];
        list.sort((a, b) => {
          const da = a.created_at || a.appliedOn || a.start_date;
          const db = b.created_at || b.appliedOn || b.start_date;
          return new Date(db || 0) - new Date(da || 0);
        });
        setRecords(list);
      })
      .catch((err) => {
        if (mounted.current) setError(err.message || "Failed to load leave history");
      })
      .finally(() => {
        if (mounted.current) setLoading(false);
      });

    return () => { mounted.current = false; };
  }, []);

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
          if (col.key === "type") return <span className="text-xs font-semibold text-gray-900 dark:text-[#f1f5f9]">{row.leave_type || row.type || "Leave"}</span>;
if (col.key === "from") return <span className="text-xs text-gray-700 dark:text-[#cbd5e1]">{formatLeaveDate(row.start_date)}</span>;
          if (col.key === "to") return <span className="text-xs text-gray-700 dark:text-[#cbd5e1]">{formatLeaveDate(row.end_date)}</span>;
          if (col.key === "status") return <span className="text-xs text-gray-700 dark:text-[#cbd5e1]">{row.status?.toUpperCase?.() || row.status}</span>;
          if (col.key === "days") return <span className="text-xs text-gray-700 dark:text-[#cbd5e1]">{row.days}</span>;
          if (col.key === "appliedOn") return <span className="text-xs text-gray-700 dark:text-[#cbd5e1]">{formatLeaveDate(row.created_at || row.appliedOn)}</span>;
          if (col.key === "approver") return <span className="text-xs text-gray-700 dark:text-[#cbd5e1]">{row.approver || row.approved_by || "-"}</span>;
          return row[col.key];
        }}
        emptyMessage="No leave history found"
      />
    </EmployeePageShell>
  );
}
