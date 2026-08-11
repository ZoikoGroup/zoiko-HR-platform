import React from 'react';

export default function Skeleton({ className = "h-4 w-full rounded", count = 1, gap = "gap-2" }) {
  if (count === 1) {
    return (
      <div
        role="status"
        aria-label="Loading…"
        className={`animate-pulse bg-gradient-to-r from-[#E5E0D9] via-[#F0EDE8] to-[#E5E0D9] dark:from-[#38312D] dark:via-[#2A2520] dark:to-[#38312D] bg-[length:200%_100%] ${className}`}
        style={{ animation: "shimmer 1.4s ease-in-out infinite" }}
      />
    );
  }
  return (
    <div className={`flex flex-col ${gap}`} role="status" aria-label="Loading…">
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className={`animate-pulse bg-gradient-to-r from-[#E5E0D9] via-[#F0EDE8] to-[#E5E0D9] dark:from-[#38312D] dark:via-[#2A2520] dark:to-[#38312D] bg-[length:200%_100%] ${className}`}
          style={{ animation: `shimmer 1.4s ease-in-out ${i * 0.1}s infinite` }}
        />
      ))}
    </div>
  );
}
