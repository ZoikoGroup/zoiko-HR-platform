/* StatusBadge Component */
import React from 'react';

export function StatusBadge({ status }) {
  const m = {
    open: "bg-emerald-100 text-emerald-800",
    closed: "bg-slate-100 text-slate-800",
    draft: "bg-slate-100 text-slate-800",
    on_hold: "bg-amber-100 text-amber-800",
    high: "bg-red-100 text-red-800",
    urgent: "bg-red-100 text-red-800",
    medium: "bg-amber-100 text-amber-800",
    low: "bg-emerald-100 text-emerald-800",
    new: "bg-blue-100 text-blue-800",
    screening: "bg-amber-100 text-amber-800",
    interviewed: "bg-blue-100 text-blue-800",
    offered: "bg-blue-100 text-blue-800",
    hired: "bg-emerald-100 text-emerald-800",
    rejected: "bg-red-100 text-red-800",
    pending: "bg-amber-100 text-amber-800",
    completed: "bg-blue-100 text-blue-800",
    accepted: "bg-emerald-100 text-emerald-800",
    negotiating: "bg-blue-100 text-blue-800",
    confirmed: "bg-emerald-100 text-emerald-800",
  };
  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium capitalize ${m[status] || "bg-slate-100 text-slate-800"}`}
    >
      {status?.replace(/_/g, " ")}
    </span>
  );
}