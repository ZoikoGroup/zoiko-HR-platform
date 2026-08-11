export function getEssDashboard() {
  return {
    totalLeaveBalance: 25,
    pendingRequests: 3,
    pendingApprovals: 2,
    attendanceToday: { status: "Present", checkIn: "09:00 AM", checkOut: "05:30 PM", hoursWorked: 8.5 },
    summary: { annual: { used: 12, total: 20 }, sick: { used: 2, total: 5 }, personal: { used: 1, total: 3 }, unpaid: { used: 0, total: 2 } },
    recentRequests: [
      { id: 1, type: "Annual Leave", description: "Request for vacation", status: "pending", date: "2025-04-01" },
      { id: 2, type: "Sick Leave", description: "Doctor's appointment", status: "approved", date: "2025-03-28" },
      { id: 3, type: "Personal Leave", description: "Family event", status: "pending", date: "2025-04-05" },
    ],
    upcomingEvents: [
      { id: 1, title: "Team Meeting", date: "2025-04-02", time: "10:00 AM" },
      { id: 2, title: "Performance Review", date: "2025-04-05", time: "02:00 PM" },
    ],
    quickLinks: [
      { label: "Apply Leave", href: "/zoiko-hr/ess/leave" },
      { label: "Request Time Off", href: "/zoiko-hr/ess/requests" },
      { label: "View Documents", href: "/zoiko-hr/ess/my-documents" },
      { label: "Update Profile", href: "/zoiko-hr/ess/profile" },
    ],
  };
}

export function recentRequests() {
  return [
    { id: 1, type: "Annual Leave", description: "Request for vacation", status: "pending", date: "2025-04-01" },
    { id: 2, type: "Sick Leave", description: "Doctor's appointment", status: "approved", date: "2025-03-28" },
    { id: 3, type: "Personal Leave", description: "Family event", status: "pending", date: "2025-04-05" },
  ];
}

export function getLeaveBalance() {
  return { annual: { remaining: 12, total: 20 }, sick: { remaining: 2, total: 5 }, personal: { remaining: 1, total: 3 }, unpaid: { remaining: 0, total: 2 } };
}

export function getLeaveRequests() {
  return [
    { id: 1, type: "annual", startDate: "2025-04-01", endDate: "2025-04-05", days: 5, reason: "Family vacation", status: "pending", appliedOn: "2025-03-28" },
    { id: 2, type: "sick", startDate: "2025-03-25", endDate: "2025-03-26", days: 2, reason: "Doctor's appointment", status: "approved", appliedOn: "2025-03-24" },
    { id: 3, type: "personal", startDate: "2025-04-10", endDate: "2025-04-10", days: 1, reason: "Family event", status: "pending", appliedOn: "2025-04-01" },
  ];
}

export function getAttendanceSummary() {
  return {
    today: { status: "Present", checkIn: "09:00 AM", checkOut: "05:30 PM", hoursWorked: 8.5 },
    monthlyStats: { present: 22, late: 2, absent: 1, onLeave: 3, avgHoursWorked: 8.2 },
    weekly: [],
    monthly: [],
  };
}

export function getProfile() {
  return {
    name: "John Doe",
    email: "john.doe@company.com",
    phone: "+1 (555) 123-4567",
    address: "123 Main St, New York, NY 10001",
    workEmail: "john.doe@company.com",
    workPhone: "+1 (555) 987-6543",
    jobTitle: "Senior Software Engineer",
    employeeId: "ZO0001",
    joinDate: "2020-03-15",
    department: "Engineering",
    bloodGroup: "O+",
    manager: "Jane Smith",
    emergencyContacts: [
      { id: 1, name: "Jane Doe", relationship: "Spouse", phone: "+1 (555) 222-3333", email: "jane.doe@email.com" },
      { id: 2, name: "Bob Johnson", relationship: "Father", phone: "+1 (555) 444-5555", email: "bob.j@email.com" },
    ],
  };
}

export function getMyDocuments() {
  return [
    { id: 1, name: "January 2025 Payslip", category: "Payslips", size: "2.4 MB", status: "available", uploadDate: "2025-01-15" },
    { id: 2, name: "Q4 2024 Tax Forms", category: "Tax Forms", size: "1.8 MB", status: "available", uploadDate: "2024-12-20" },
    { id: 3, name: "Employee ID Card", category: "Certificates", size: "0.5 MB", status: "available", uploadDate: "2025-01-10" },
  ];
}

export function getEssRequests() {
  return [
    { id: 1, category: "IT", subject: "Laptop Repair", description: "My laptop is not working properly", priority: "high", status: "pending", createdOn: "2025-04-01" },
    { id: 2, category: "HR", subject: "Leave Request", description: "Request for annual leave", priority: "medium", status: "approved", createdOn: "2025-03-28" },
  ];
}
