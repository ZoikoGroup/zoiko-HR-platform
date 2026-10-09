export default function StatCard({ label, value, sub, accentColor = "text-blue-600 dark:text-blue-300" }) {
  return (
    <div className="rounded-2xl bg-white dark:bg-[#1e293b] border border-slate-200 dark:border-[#334155] p-6 shadow-sm hover:shadow-md transition-shadow">
      <p className="text-xs font-bold text-slate-400 dark:text-[#94a3b8] uppercase tracking-wider mb-3">{label}</p>
      <p className={`text-3xl font-extrabold mb-1 ${accentColor}`}>{value}</p>
      {sub && <p className="text-xs text-slate-500 dark:text-[#64748b]">{sub}</p>}
    </div>
  );
}
