import React from 'react';

/**
 * Generic badge component for both status and leave type.
 * Props:
 * - variant: "status" | "type"
 * - value: string value (e.g., "approved", "paid")
 */
export default function Badge({ variant, value }) {
  const statusColors = {
    pending: 'bg-yellow-100 text-yellow-800',
    approved: 'bg-green-100 text-green-800',
    rejected: 'bg-red-100 text-red-800',
    cancelled: 'bg-gray-100 text-gray-500',
  };
  const typeColors = {
    annual: 'bg-blue-100 text-blue-800',
    sick: 'bg-red-100 text-red-800',
    personal: 'bg-purple-100 text-purple-800',
    maternity: 'bg-pink-100 text-pink-800',
    paternity: 'bg-indigo-100 text-indigo-800',
    bereavement: 'bg-gray-100 text-gray-800',
    unpaid: 'bg-yellow-100 text-yellow-800',
    other: 'bg-orange-100 text-orange-800',
  };
  const colorClass = variant === 'status' ? statusColors[value] : typeColors[value] || 'bg-gray-100 text-gray-800';
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium capitalize ${colorClass}`}>
      {value?.replace(/_/g, ' ')}
    </span>
  );
}
