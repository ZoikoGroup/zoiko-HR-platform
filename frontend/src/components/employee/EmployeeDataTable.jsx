export default function EmployeeDataTable({ columns, rows, renderCell, actions, emptyMessage = "No data found" }) {
  if (!rows || rows.length === 0) {
    return (
      <div className="text-center py-16 text-[#6B7280] dark:text-[#64748b]">
        <p className="text-base font-medium">{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl bg-white dark:bg-[#1e293b] border border-[#E5E7EB] dark:border-[#334155] overflow-hidden shadow-sm">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[#E5E7EB] dark:border-[#334155] bg-[#F8F7FC] dark:bg-[#0f172a]">
              {columns.map((col) => (
                <th key={col.key} className="px-5 py-3.5 text-left text-xs font-semibold text-[#6B7280] dark:text-[#94a3b8] uppercase tracking-wider">
                  {col.label}
                </th>
              ))}
              {actions && (
                <th className="px-5 py-3.5 text-right text-xs font-semibold text-[#6B7280] dark:text-[#94a3b8] uppercase tracking-wider">
                  Actions
                </th>
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-[#E5E7EB] dark:divide-[#334155]">
            {rows.map((row, i) => (
              <tr key={row.id || i} className="hover:bg-[#F8F7FC] dark:hover:bg-[#1e293b]/50 transition-colors">
                {columns.map((col) => (
                  <td key={col.key} className="px-5 py-3.5 text-sm text-[#111827] dark:text-[#e2e8f0]">
                    {renderCell ? renderCell(row, col) : row[col.key]}
                  </td>
                ))}
                {actions && (
                  <td className="px-5 py-3.5 text-right">
                    {actions(row)}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
