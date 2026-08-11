export function formatDate(dateStr) {
  if (!dateStr) return "-";
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

export function formatCurrency(amount) {
  if (amount == null) return "-";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(amount);
}

export function daysUntil(dateStr) {
  const d = new Date(dateStr);
  const now = new Date();
  const diff = d - now;
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

export function statusColor(status, module) {
  const map = {
    pending: "bg-yellow-100 text-yellow-800",
    approved: "bg-green-100 text-green-800",
    rejected: "bg-red-100 text-red-800",
    completed: "bg-blue-100 text-blue-800",
    cancelled: "bg-gray-100 text-gray-800",
    draft: "bg-gray-100 text-gray-800",
    active: "bg-green-100 text-green-800",
    inactive: "bg-gray-100 text-gray-800",
    present: "bg-green-100 text-green-800",
    late: "bg-orange-100 text-orange-800",
    half_day: "bg-yellow-100 text-yellow-800",
    absent: "bg-red-100 text-red-800",
    on_leave: "bg-blue-100 text-blue-800",
    annual: "bg-blue-100 text-blue-800",
    sick: "bg-orange-100 text-orange-800",
    personal: "bg-purple-100 text-purple-800",
    unpaid: "bg-gray-100 text-gray-800",
    IT: "bg-indigo-100 text-indigo-800",
    HR: "bg-pink-100 text-pink-800",
    Facilities: "bg-teal-100 text-teal-800",
    Admin: "bg-gray-100 text-gray-800",
  };
  return map[status] || "bg-gray-100 text-gray-800";
}
