/* StatusBadge Component */
import React from 'react';

export function StatusBadge({ status }) {
  const m = {
    open: "bg-green-100 text-green-800",
    closed: "bg-gray-100 text-gray-800",
    draft: "bg-gray-100 text-gray-800",
    on_hold: "bg-yellow-100 text-yellow-800",
    high: "bg-red-100 text-red-800",
    urgent: "bg-red-100 text-red-800",
    medium: "bg-yellow-100 text-yellow-800",
    low: "bg-green-100 text-green-800",
    new: "bg-blue-100 text-blue-800",
    screening: "bg-yellow-100 text-yellow-800",
    interviewed: "bg-purple-100 text-purple-800",
    offered: "bg-orange-100 text-orange-800",
    hired: "bg-green-100 text-green-800",
    rejected: "bg-red-100 text-red-800",
    pending: "bg-yellow-100 text-yellow-800",
    completed: "bg-blue-100 text-blue-800",
    accepted: "bg-green-100 text-green-800",
    negotiating: "bg-blue-100 text-blue-800",
    confirmed: "bg-green-100 text-green-800",
  };
  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium capitalize ${m[status] || "bg-gray-100 text-gray-800"}`}
    >
      {status?.replace(/_/g, " ")}
    </span>
  );
}