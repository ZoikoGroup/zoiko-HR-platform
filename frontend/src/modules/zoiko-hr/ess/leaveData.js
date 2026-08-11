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
