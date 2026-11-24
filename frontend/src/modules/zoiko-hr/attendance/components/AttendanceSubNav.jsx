import { NavLink } from "react-router-dom";

// One sub-navigation for the admin attendance pages (was copied into each page).
export const ATTENDANCE_NAV = [
  { label: "Dashboard", href: "/zoiko-hr/attendance" },
  { label: "Attendance Records", href: "/zoiko-hr/attendance/daily" },
  { label: "Approvals", href: "/zoiko-hr/attendance/approvals" },
  { label: "Shifts & Work Policy", href: "/zoiko-hr/attendance/shifts" },
  { label: "Holiday Calendar", href: "/zoiko-hr/attendance/holidays" },
  { label: "Attendance Analytics", href: "/zoiko-hr/attendance/analytics" },
];

export default function AttendanceSubNav({ items = ATTENDANCE_NAV }) {
  return (
    <nav aria-label="Attendance sections" className="mb-6 flex gap-1 overflow-x-auto border-b border-gray-100 pb-1">
      {items.map((item) => (
        <NavLink key={item.href} to={item.href} end={item.href === "/zoiko-hr/attendance"}
          className={({ isActive }) => `whitespace-nowrap rounded-t-xl px-4 py-2.5 text-sm font-bold transition-all ${
            isActive ? "border-b-2 border-blue-600 bg-blue-50/50 text-blue-600" : "text-gray-500 hover:bg-gray-50 hover:text-gray-800"}`}>
          {item.label}
        </NavLink>
      ))}
    </nav>
  );
}
