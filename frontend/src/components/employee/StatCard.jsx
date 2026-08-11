export default function StatCard({ label, value, sub, accentColor = "text-indigo-600 dark:text-indigo-400" }) {
  return (
    <div className="rounded-2xl bg-white dark:bg-[#1e293b] border border-[#E5E7EB] dark:border-[#334155] p-5 shadow-sm hover:shadow-md transition-shadow">
      <p className="text-xs font-semibold text-[#6B7280] dark:text-[#94a3b8] uppercase tracking-wider mb-2">{label}</p>
      <p className={`text-3xl font-extrabold mb-0.5 ${accentColor}`}>{value}</p>
      {sub && <p className="text-xs text-[#6B7280] dark:text-[#64748b]">{sub}</p>}
    </div>
  );
}
