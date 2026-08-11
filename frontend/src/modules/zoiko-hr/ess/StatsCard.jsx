import { CalendarDays, ClipboardList, UserCheck, Clock, FileText, ArrowRight } from "lucide-react";

function StatsCard({ title, value, icon: Icon, color, change }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 flex items-center justify-between">
      <div>
        <p className="text-xs text-gray-500 font-medium uppercase tracking-wider">{title}</p>
        <p className="text-2xl font-bold text-gray-900 mt-1">{value}</p>
        {change !== undefined && (
          <p className="text-xs text-gray-400 mt-1 flex items-center gap-1">
            <ArrowRight size={12} className="text-green-500" />
            {change} from last month
          </p>
        )}
      </div>
      <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${color || "bg-blue-50"}`}>
        <Icon size={20} className={color ? "text-white" : "text-blue-600"} />
      </div>
    </div>
  );
}

function PendingCard({ title, count, icon: Icon, color }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-3 flex items-center gap-3">
      <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${color || "bg-amber-50"}`}>
        <Icon size={18} className={color ? "text-white" : "text-amber-600"} />
      </div>
      <div>
        <p className="text-xs text-gray-500">{title}</p>
        <p className="text-lg font-bold text-gray-900">{count}</p>
      </div>
    </div>
  );
}

function SimpleBar({ label, value, max, color }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div className="flex items-center gap-3">
      <span className="text-xs text-gray-500 w-10 shrink-0">{label}</span>
      <div className="flex-1 h-5 bg-gray-100 rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all duration-500 ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs font-medium text-gray-600 w-8 text-right">{value}</span>
    </div>
  );
}

function PieSegment({ label, value, total, color }) {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0;
  return (
    <div className="flex items-center gap-2">
      <div className="w-2 h-2 rounded-full" style={{ backgroundColor: color }} />
      <span className="text-xs text-gray-500 flex-1">{label}</span>
      <span className="text-xs font-medium text-gray-700">{pct}% ({value})</span>
    </div>
  );
}

export { StatsCard, PendingCard, SimpleBar, PieSegment };
