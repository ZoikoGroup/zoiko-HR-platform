import { Briefcase, Target, Users, DollarSign, TrendingUp, UserPlus } from "lucide-react";

function StatsCard({ title, value, icon: Icon, color, change }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 flex items-center justify-between">
      <div>
        <p className="text-xs text-gray-500 font-medium uppercase tracking-wider">{title}</p>
        <p className="text-2xl font-bold text-gray-900 mt-1">{value}</p>
        {change !== undefined && (
          <p className="text-xs text-gray-400 mt-1 flex items-center gap-1">
            <svg className="w-3 h-3 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 10l7-7m0 0l7 7m-7 0v18m0-13H6" />
            </svg>
            {change} from last month
          </p>
        )}
      </div>
      <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${color || "bg-teal-50"}`}>
        <Icon size={20} className={color ? "text-white" : "text-teal-600"} />
      </div>
    </div>
  );
}

function DataTable({ columns, data }) {
  if (!data || data.length ===0) {
    return <div className="text-center py-8 text-gray-400">No data available</div>;
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <table className="w-full">
        <thead>
          <tr className="border-b border-gray-100 bg-gray-50">
            {columns.map((col) => (
              <th key={col.key} className="text-left px-4 py-3 text-xs font-semibold text-gray-600">
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-50">
          {data.map((row, idx) => (
            <tr key={idx} className="hover:bg-gray-50 transition-colors">
              {columns.map((col) => (
                <td key={col.key} className="px-4 py-3 text-sm">
                  {col.render ? col.render(row[col.key], row) : row[col.key]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export { StatsCard, DataTable };
