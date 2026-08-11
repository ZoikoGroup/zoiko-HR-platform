export function getAttendanceSummary() {
  return {
    today: { status: "Present", checkIn: "09:00 AM", checkOut: "05:30 PM", hoursWorked: 8.5 },
    monthlyStats: { present: 22, late: 2, absent: 1, onLeave: 3, avgHoursWorked: 8.2 },
    weekly: [],
    monthly: [],
  };
}
