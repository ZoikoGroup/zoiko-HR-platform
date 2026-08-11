import { useEffect, useMemo, useRef, useState } from "react";
import EmployeePageShell from "../../../../components/employee/EmployeePageShell";
import EmployeeStatusBadge from "../../../../components/employee/EmployeeStatusBadge";
import StatCard from "../../../../components/employee/StatCard";
import EmployeeDataTable from "../../../../components/employee/EmployeeDataTable";
import { getAttendanceRecords } from "../../../../service/employee";

export default function EssAttendance() {
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    setLoading(true);
    setError(null);

    getAttendanceRecords()
      .then((data) => {
        if (!mounted.current) return;
        const list = data?.items || (Array.isArray(data) ? data : []);
        setRecords(list);
      })
      .catch((err) => {
        if (mounted.current) setError(err.message || "Failed to load attendance records");
      })
      .finally(() => {
        if (mounted.current) setLoading(false);
      });

    return () => { mounted.current = false; };
  }, []);

  const summary = useMemo(
    () => ({
      present: records.filter((r) => r.status === "Present").length,
      absent: records.filter((r) => r.status === "Absent").length,
      late: records.filter((r) => r.status === "Late").length,
    }),
    [records]
  );

  if (loading) {
    return (
      <EmployeePageShell title="My Attendance" subtitle="Track your daily check-in and check-out records.">
        <div className="flex justify-center items-center py-20">
          <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
        </div>
      </EmployeePageShell>
    );
  }

  if (error) {
    return (
      <EmployeePageShell title="My Attendance" subtitle="Track your daily check-in and check-out records.">
        <div className="bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 px-4 py-3 rounded-lg text-sm font-medium">
          {error}
        </div>
      </EmployeePageShell>
    );
  }

  return (
    <EmployeePageShell title="My Attendance" subtitle="Track your daily check-in and check-out records.">
      {records.length === 0 ? (
        <div className="text-center py-16 text-gray-500 dark:text-[#94a3b8]">
          <p className="text-lg font-medium dark:text-[#f1f5f9]">No attendance records found</p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-4 mb-7">
            {[
              { label: "Present Days", value: summary.present, color: "#059669" },
              { label: "Absent Days", value: summary.absent, color: "#DC2626" },
              { label: "Late Arrivals", value: summary.late, color: "#D97706" },
            ].map((s) => (
              <StatCard key={s.label} label={s.label} value={s.value} accentColor={
                s.color === "#059669" ? "text-emerald-600 dark:text-emerald-400" :
                s.color === "#DC2626" ? "text-red-600 dark:text-red-400" :
                "text-amber-600 dark:text-amber-400"
              } />
            ))}
          </div>

          <h3 className="text-base font-bold text-gray-900 dark:text-[#f1f5f9] mb-4">Attendance Records</h3>
          <EmployeeDataTable
            columns={[
              { key: "date", label: "Date" },
              { key: "checkIn", label: "Check In" },
              { key: "checkOut", label: "Check Out" },
              { key: "hours", label: "Hours" },
              { key: "status", label: "Status" },
            ]}
            rows={records}
            renderCell={(row, col) => {
              if (col.key === "date") return <span className="text-sm font-medium text-gray-900 dark:text-[#f1f5f9]">{row.date || row.date}</span>;
              if (col.key === "checkIn") return <span className="text-sm text-gray-700 dark:text-[#cbd5e1]">{row.checkIn || row.check_in || "-"}</span>;
              if (col.key === "checkOut") return <span className="text-sm text-gray-700 dark:text-[#cbd5e1]">{row.checkOut || row.check_out || "-"}</span>;
              if (col.key === "hours") return <span className="text-sm text-gray-700 dark:text-[#cbd5e1]">{row.hours || row.total_hours || "-"}</span>;
              if (col.key === "status") return <EmployeeStatusBadge status={row.status} />;
              return null;
            }}
          />
        </>
      )}
    </EmployeePageShell>
  );
}
