import { useState } from "react";
import { NavLink } from "react-router-dom";
import HRPage from "../../../components/HRPage";

const NAV_ITEMS = [
  { label: "Dashboard", href: "/zoiko-hr/ess" },
  { label: "Profile", href: "/zoiko-hr/ess/profile" },
  { label: "Leave Management", href: "/zoiko-hr/ess/leave" },
  { label: "Attendance", href: "/zoiko-hr/ess/attendance" },
  { label: "My Documents", href: "/zoiko-hr/ess/my-documents" },
  { label: "Learning", href: "/zoiko-hr/ess/requests" },
  { label: "Settings", href: "/zoiko-hr/ess/settings" },
];

function SubNav() {
  return (
    <div className="flex gap-1 overflow-x-auto pb-1 mb-6 border-b border-gray-100">
      {NAV_ITEMS.map((item) => (
        <NavLink
          key={item.href}
          to={item.href}
          end={item.href === "/zoiko-hr/ess"}
          className={({ isActive }) =>
            `whitespace-nowrap px-3 py-2 text-sm font-medium rounded-t-lg transition-colors ${
              isActive
                ? "text-blue-600 border-b-2 border-blue-600 bg-blue-50/50"
                : "text-gray-500 hover:text-gray-700 hover:bg-gray-50"
            }`
          }
        >
          {item.label}
        </NavLink>
      ))}
    </div>
  );
}

const mockAttendanceData = {
  today: {
    status: "Present",
    checkIn: "09:00 AM",
    checkOut: "05:30 PM",
    hoursWorked: 8.5,
  },
  monthlyStats: {
    present: 22,
    late: 2,
    absent: 1,
    onLeave: 3,
    avgHoursWorked: 8.2,
  },
  weekly: [
    { id: 1, date: "2025-03-31", checkIn: "09:00 AM", checkOut: "05:30 PM", hoursWorked: 8.5, status: "present" },
    { id: 2, date: "2025-04-01", checkIn: "09:05 AM", checkOut: "05:45 PM", hoursWorked: 8.5, status: "present" },
    { id: 3, date: "2025-04-02", checkIn: "09:00 AM", checkOut: "04:30 PM", hoursWorked: 7.5, status: "late" },
    { id: 4, date: "2025-04-03", checkIn: "09:00 AM", checkOut: "05:30 PM", hoursWorked: 8.5, status: "present" },
    { id: 5, date: "2025-04-04", checkIn: "09:00 AM", checkOut: "05:30 PM", hoursWorked: 8.5, status: "present" },
    { id: 6, date: "2025-04-05", checkIn: "09:00 AM", checkOut: "05:30 PM", hoursWorked: 8.5, status: "present" },
    { id: 7, date: "2025-04-06", checkIn: "09:00 AM", checkOut: "05:30 PM", hoursWorked: 8.5, status: "present" },
  ],
  monthly: [
    { id: 1, date: "2025-03-01", checkIn: "09:00 AM", checkOut: "05:30 PM", hoursWorked: 8.5, status: "present" },
    { id: 2, date: "2025-03-02", checkIn: "09:00 AM", checkOut: "05:30 PM", hoursWorked: 8.5, status: "present" },
    { id: 3, date: "2025-03-03", checkIn: "09:00 AM", checkOut: "05:30 PM", hoursWorked: 8.5, status: "present" },
    { id: 4, date: "2025-03-04", checkIn: "09:00 AM", checkOut: "05:30 PM", hoursWorked: 8.5, status: "present" },
    { id: 5, date: "2025-03-05", checkIn: "09:00 AM", checkOut: "05:30 PM", hoursWorked: 8.5, status: "present" },
    { id: 6, date: "2025-03-06", checkIn: "09:00 AM", checkOut: "05:30 PM", hoursWorked: 8.5, status: "present" },
    { id: 7, date: "2025-03-07", checkIn: "09:00 AM", checkOut: "05:30 PM", hoursWorked: 8.5, status: "present" },
    { id: 8, date: "2025-03-08", checkIn: "09:00 AM", checkOut: "05:30 PM", hoursWorked: 8.5, status: "present" },
    { id: 9, date: "2025-03-09", checkIn: "09:00 AM", checkOut: "05:30 PM", hoursWorked: 8.5, status: "present" },
    { id: 10, date: "2025-03-10", checkIn: "09:00 AM", checkOut: "05:30 PM", hoursWorked: 8.5, status: "present" },
    { id: 11, date: "2025-03-11", checkIn: "09:00 AM", checkOut: "05:30 PM", hoursWorked: 8.5, status: "present" },
    { id: 12, date: "2025-03-12", checkIn: "09:00 AM", checkOut: "05:30 PM", hoursWorked: 8.5, status: "present" },
    { id: 13, date: "2025-03-13", checkIn: "09:00 AM", checkOut: "05:30 PM", hoursWorked: 8.5, status: "present" },
    { id: 14, date: "2025-03-14", checkIn: "09:00 AM", checkOut: "05:30 PM", hoursWorked: 8.5, status: "present" },
    { id: 15, date: "2025-03-15", checkIn: "09:00 AM", checkOut: "05:30 PM", hoursWorked: 8.5, status: "present" },
    { id: 16, date: "2025-03-16", checkIn: "09:00 AM", checkOut: "05:30 PM", hoursWorked: 8.5, status: "present" },
    { id: 17, date: "2025-03-17", checkIn: "09:00 AM", checkOut: "05:30 PM", hoursWorked: 8.5, status: "present" },
    { id: 18, date: "2025-03-18", checkIn: "09:00 AM", checkOut: "05:30 PM", hoursWorked: 8.5, status: "present" },
    { id: 19, date: "2025-03-19", checkIn: "09:00 AM", checkOut: "05:30 PM", hoursWorked: 8.5, status: "present" },
    { id: 20, date: "2025-03-20", checkIn: "09:00 AM", checkOut: "05:30 PM", hoursWorked: 8.5, status: "present" },
    { id: 21, date: "2025-03-21", checkIn: "09:00 AM", checkOut: "05:30 PM", hoursWorked: 8.5, status: "present" },
    { id: 22, date: "2025-03-22", checkIn: "09:00 AM", checkOut: "05:30 PM", hoursWorked: 8.5, status: "present" },
    { id: 23, date: "2025-03-23", checkIn: "09:00 AM", checkOut: "05:30 PM", hoursWorked: 8.5, status: "present" },
    { id: 24, date: "2025-03-24", checkIn: "09:00 AM", checkOut: "05:30 PM", hoursWorked: 8.5, status: "present" },
    { id: 25, date: "2025-03-25", checkIn: "09:00 AM", checkOut: "05:30 PM", hoursWorked: 8.5, status: "present" },
    { id: 26, date: "2025-03-26", checkIn: "09:00 AM", checkOut: "05:30 PM", hoursWorked: 8.5, status: "present" },
    { id: 27, date: "2025-03-27", checkIn: "09:00 AM", checkOut: "05:30 PM", hoursWorked: 8.5, status: "present" },
    { id: 28, date: "2025-03-28", checkIn: "09:00 AM", checkOut: "05:30 PM", hoursWorked: 8.5, status: "present" },
    { id: 29, date: "2025-03-29", checkIn: "09:00 AM", checkOut: "05:30 PM", hoursWorked: 8.5, status: "present" },
    { id: 30, date: "2025-03-30", checkIn: "09:00 AM", checkOut: "05:30 PM", hoursWorked: 8.5, status: "present" },
  ],
};

export default function EssAttendance() {
  const [data] = useState(mockAttendanceData);

  const weeklyColumns = [
    { key: "date", label: "Date", render: (v) => <span className="font-medium text-gray-900">{v}</span> },
    { key: "checkIn", label: "Check In", render: (v) => <span className="text-gray-700">{v}</span> },
    { key: "checkOut", label: "Check Out", render: (v) => <span className="text-gray-700">{v}</span> },
    { key: "hoursWorked", label: "Hours", render: (v) => <span className="font-semibold">{v}</span> },
    { key: "status", label: "Status", render: (v) => <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium capitalize ${
      v === "present" ? "bg-green-100 text-green-800" : v === "late" ? "bg-orange-100 text-orange-800" : "bg-red-100 text-red-800"
    }`}>{v}</span> },
  ];

  const monthlyColumns = [
    { key: "date", label: "Date", render: (v) => <span className="font-medium text-gray-900">{v}</span> },
    { key: "checkIn", label: "Check In" },
    { key: "checkOut", label: "Check Out" },
    { key: "hoursWorked", label: "Hours", render: (v) => <span className="font-semibold">{v}</span> },
    { key: "status", label: "Status", render: (v) => <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium capitalize ${
      v === "present" ? "bg-green-100 text-green-800" : v === "late" ? "bg-orange-100 text-orange-800" : "bg-red-100 text-red-800"
    }`}>{v}</span> },
  ];

  const statCards = data.monthlyStats
    ? [
        { title: "Present", value: data.monthlyStats.present, icon: "✅", change: null, trend: null },
        { title: "Late", value: data.monthlyStats.late, icon: "⚠️", change: null, trend: null },
        { title: "Absent", value: data.monthlyStats.absent, icon: "❌", change: null, trend: null },
        { title: "On Leave", value: data.monthlyStats.onLeave, icon: "🏠", change: null, trend: null },
        { title: "Avg Hours", value: data.monthlyStats.avgHoursWorked, icon: "⏰", change: null, trend: null },
      ]
    : [];

  return (
    <HRPage title="Employee Self Service" subtitle="Track your time and attendance records">
      <SubNav />

      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Attendance</h1>
          <p className="text-sm text-gray-500 mt-1">Track your time and attendance records</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h2 className="text-lg font-semibold text-gray-900 mb-3">Today's Record</h2>
            <div className="space-y-4">
              <div className="flex items-center justify-between p-3 bg-blue-50 rounded-lg">
                <span className="text-sm text-gray-600">Status</span>
                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium capitalize ${
                  data.today.status === "Present" ? "bg-green-100 text-green-800" : "bg-orange-100 text-orange-800"
                }`}>{data.today.status}</span>
              </div>
              <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <span className="text-sm text-gray-600">Check In</span>
                <span className="text-sm font-bold text-gray-900">{data.today.checkIn}</span>
              </div>
              <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <span className="text-sm text-gray-600">Check Out</span>
                <span className="text-sm font-bold text-gray-900">{data.today.checkOut}</span>
              </div>
              <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <span className="text-sm text-gray-600">Hours Worked</span>
                <span className="text-sm font-bold text-blue-600">{data.today.hoursWorked}</span>
              </div>
            </div>
          </div>

          <div className="lg:col-span-2">
            {statCards.length > 0 && (
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                {statCards.map((s) => (
                  <div key={s.title} className="bg-white rounded-xl border border-gray-200 p-4 text-center">
                    <p className="text-xs text-gray-500">{s.title}</p>
                    <p className="text-xl font-bold text-gray-900 mt-1">{s.value}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">This Week</h2>
          <div className="space-y-3">
            {data.weekly.map((r) => (
              <div key={r.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors">
                <div className="flex items-center gap-3">
                  <span className="text-sm font-medium text-gray-900">{r.date}</span>
                  <span className="text-xs text-gray-500">In: {r.checkIn}</span>
                  <span className="text-xs text-gray-500">Out: {r.checkOut}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm font-semibold text-gray-900">{r.hoursWorked} hrs</span>
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium capitalize ${
                    r.status === "present" ? "bg-green-100 text-green-800" : r.status === "late" ? "bg-orange-100 text-orange-800" : "bg-red-100 text-red-800"
                  }`}>{r.status}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Monthly Attendance</h2>
          <div className="space-y-3">
            {data.monthly.map((r) => (
              <div key={r.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors">
                <div className="flex items-center gap-3">
                  <span className="text-sm font-medium text-gray-900">{r.date}</span>
                  <span className="text-xs text-gray-500">In: {r.checkIn}</span>
                  <span className="text-xs text-gray-500">Out: {r.checkOut}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm font-semibold text-gray-900">{r.hoursWorked} hrs</span>
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium capitalize ${
                    r.status === "present" ? "bg-green-100 text-green-800" : r.status === "late" ? "bg-orange-100 text-orange-800" : "bg-red-100 text-red-800"
                  }`}>{r.status}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </HRPage>
  );
}
