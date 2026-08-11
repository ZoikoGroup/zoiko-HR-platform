import { Search, Download, FileText, BarChart3, Users, Calendar } from "lucide-react";

function StatusBadge({ status }) {
  const m = {
    pending: "bg-yellow-100 text-yellow-800",
    approved: "bg-green-100 text-green-800",
    rejected: "bg-red-100 text-red-800",
    completed: "bg-blue-100 text-blue-800",
    cancelled: "bg-gray-100 text-gray-800",
    draft: "bg-gray-100 text-gray-800",
    active: "bg-green-100 text-green-800",
    inactive: "bg-gray-100 text-gray-800",
    present: "bg-green-100 text-green-800",
    late: "bg-orange-100 text-orange-800",
    half_day: "bg-yellow-100 text-yellow-800",
    absent: "bg-red-100 text-red-800",
    on_leave: "bg-blue-100 text-blue-800",
    annual: "bg-blue-100 text-blue-800",
    sick: "bg-orange-100 text-orange-800",
    personal: "bg-purple-100 text-purple-800",
    unpaid: "bg-gray-100 text-gray-800",
    IT: "bg-indigo-100 text-indigo-800",
    HR: "bg-pink-100 text-pink-800",
    Facilities: "bg-teal-100 text-teal-800",
    Admin: "bg-gray-100 text-gray-800",
  };
  return <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium capitalize ${m[status] || "bg-gray-100 text-gray-800"}`}>{status?.replace(/_/g, " ")}</span>;
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

export { DataTable, StatusBadge };
