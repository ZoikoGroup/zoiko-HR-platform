/**
 * OrgAdminSkeleton.jsx
 * Reusable animated skeleton screens for all Organisation Admin pages.
 * Use these instead of full-page spinners so pages feel instant.
 */

const PULSE = "animate-pulse bg-slate-200/80 rounded";

export function SkeletonBar({ w = "100%", h = 14, className = "" }) {
  return (
    <div
      className={`${PULSE} ${className}`}
      style={{ width: w, height: h, borderRadius: 7 }}
    />
  );
}

export function SkeletonStatCard() {
  return (
    <div className="rounded-[14px] border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <div className={`${PULSE} w-[38px] h-[38px] rounded-[10px]`} />
        <div className={`${PULSE} w-12 h-3`} />
      </div>
      <div className={`${PULSE} w-24 h-3 mb-2`} />
      <div className={`${PULSE} w-16 h-8`} />
    </div>
  );
}

export function SkeletonTableRow({ cols = 5 }) {
  return (
    <tr>
      {Array.from({ length: cols }).map((_, i) => (
        <td key={i} className="px-4 py-3.5 border-b border-slate-100">
          <div className={`${PULSE} h-4`} style={{ width: `${50 + (i * 13) % 40}%` }} />
        </td>
      ))}
    </tr>
  );
}

export function SkeletonHero() {
  return (
    <div className="rounded-[20px] bg-slate-200/60 animate-pulse p-8 mb-6 h-[140px]" />
  );
}

export function DashboardSkeleton() {
  return (
    <div className="font-['Inter',system-ui,sans-serif] -m-4 sm:-m-6 lg:-m-8 p-4 sm:p-6 lg:p-8"
      style={{ background: "#F0F4F8", minHeight: "calc(100vh - 4rem)" }}>
      <SkeletonHero />
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        {Array.from({ length: 4 }).map((_, i) => <SkeletonStatCard key={i} />)}
      </div>
      <div className="rounded-[20px] border border-slate-200 bg-white overflow-hidden shadow-sm">
        <div className="p-4 border-b border-slate-100">
          <div className={`${PULSE} w-40 h-5`} />
        </div>
        <table className="w-full">
          <tbody>
            {Array.from({ length: 6 }).map((_, i) => <SkeletonTableRow key={i} cols={5} />)}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function UsersSkeleton() {
  return (
    <div style={{ fontFamily: "Inter, sans-serif" }}>
      <SkeletonHero />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 16, marginBottom: 22 }}>
        {Array.from({ length: 3 }).map((_, i) => <SkeletonStatCard key={i} />)}
      </div>
      <div className="rounded-[20px] border border-slate-200 bg-white overflow-hidden shadow-sm">
        <table className="w-full">
          <tbody>
            {Array.from({ length: 8 }).map((_, i) => <SkeletonTableRow key={i} cols={6} />)}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function MetricsSkeleton() {
  return (
    <div className="font-['Inter',system-ui,sans-serif] -m-4 sm:-m-6 lg:-m-8 p-4 sm:p-6 lg:p-8"
      style={{ background: "#F0F4F8", minHeight: "calc(100vh - 4rem)" }}>
      <div className={`${PULSE} w-28 h-4 mb-6`} />
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        {Array.from({ length: 8 }).map((_, i) => <SkeletonStatCard key={i} />)}
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-[20px] border border-slate-200 bg-white p-5 shadow-sm">
            <div className={`${PULSE} w-32 h-5 mb-4`} />
            {Array.from({ length: 4 }).map((_, j) => (
              <div key={j} className="flex items-center gap-3 mb-3">
                <div className={`${PULSE} w-8 h-8 rounded-full`} />
                <div className="flex-1">
                  <div className={`${PULSE} h-3 mb-1`} />
                  <div className={`${PULSE} h-2 w-2/3`} />
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

export function BillingSkeleton() {
  return (
    <div className="font-['Inter',system-ui,sans-serif] -m-4 sm:-m-6 lg:-m-8 p-4 sm:p-6 lg:p-8"
      style={{ background: "#F0F4F8", minHeight: "calc(100vh - 4rem)" }}>
      <div className={`${PULSE} w-28 h-4 mb-6`} />
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        {Array.from({ length: 4 }).map((_, i) => <SkeletonStatCard key={i} />)}
      </div>
      <div className="rounded-[16px] border border-slate-200 bg-white p-5 shadow-sm mb-5">
        <div className={`${PULSE} w-48 h-5 mb-5`} />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="rounded-2xl border border-slate-200 p-5">
              <div className={`${PULSE} w-24 h-5 mb-3`} />
              <div className={`${PULSE} w-32 h-8 mb-4`} />
              <div className={`${PULSE} h-10 rounded-xl`} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function OrgProfileSkeleton() {
  return (
    <div style={{ fontFamily: "Inter, sans-serif", background: "#F0F4F8", minHeight: "100vh", padding: "40px 32px" }}>
      <div className={`${PULSE} w-48 h-7 mb-8`} />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="rounded-[18px] border border-slate-200 bg-white p-5 shadow-sm">
            <div className={`${PULSE} w-32 h-5 mb-4`} />
            {Array.from({ length: 3 }).map((_, j) => (
              <div key={j} className="mb-3">
                <div className={`${PULSE} w-20 h-3 mb-2`} />
                <div className={`${PULSE} h-9 rounded-[10px]`} />
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

export function AssetsSkeleton() {
  return (
    <div className="font-['Inter',system-ui,sans-serif] -m-4 sm:-m-6 lg:-m-8 p-4 sm:p-6 lg:p-8"
      style={{ background: "#F0F4F8", minHeight: "calc(100vh - 4rem)" }}>
      <SkeletonHero />
      <div className="flex gap-3 mb-5">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className={`${PULSE} h-10 w-32 rounded-xl`} />
        ))}
      </div>
      <div className="rounded-[20px] border border-slate-200 bg-white overflow-hidden shadow-sm">
        <table className="w-full">
          <tbody>
            {Array.from({ length: 8 }).map((_, i) => <SkeletonTableRow key={i} cols={6} />)}
          </tbody>
        </table>
      </div>
    </div>
  );
}
