import React from 'react';

/**
 * Generic badge component for both status and leave type.
 * Props:
 * - variant: "status" | "type"
 * - value: string value (e.g., "approved", "paid")
 */
export default function Badge({ variant, value }) {
  const statusColors = {
    pending: 'bg-amber-100 text-amber-800',
    approved: 'bg-emerald-100 text-emerald-800',
    rejected: 'bg-red-100 text-red-800',
    cancelled: 'bg-gray-100 text-gray-500',
  };
  const typeColors = {
    annual: 'bg-blue-100 text-blue-800',
    sick: 'bg-red-100 text-red-800',
    personal: 'bg-emerald-100 text-emerald-800',
    maternity: 'bg-pink-100 text-pink-800',
    paternity: 'bg-sky-100 text-sky-800',
    bereavement: 'bg-gray-100 text-gray-800',
    unpaid: 'bg-amber-100 text-amber-800',
    other: 'bg-amber-100 text-amber-800',
  };
  const colorClass = variant === 'status' ? statusColors[value] : typeColors[value] || 'bg-gray-100 text-gray-800';
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium capitalize ${colorClass}`}>
      {value?.replace(/_/g, ' ')}
    </span>
  );
}
