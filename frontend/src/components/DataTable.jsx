/* DataTable Component */
import React from 'react';

export function DataTable({ data, columns, renderCell, actions, emptyMessage }) {
  if (data.length === 0) {
    return (
      <div className="text-center py-8 text-gray-400">
        {emptyMessage}
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <table className="w-full text-sm">
        <thead className="border-b border-gray-200 bg-gray-50 text-xs text-gray-500 uppercase tracking-wider">
          <tr>
            {columns.map((column) => (
              <th key={column} className="px-3 py-3 font-medium text-left">
                {column.charAt(0).toUpperCase() + column.slice(1).replace(/([A-Z])/g, ' $1').trim()}
              </th>
            ))}
            {actions && <th className="px-3 py-3 font-medium text-left">Actions</th>}
          </tr>
        </thead>
        <tbody>
          {data.map((item) => (
            <tr key={item.id} className="border-b border-gray-50 hover:bg-gray-50">
              {columns.map((column) => (
                <td key={`${item.id}-${column}`} className="px-3 py-3">
                  {renderCell(item, column)}
                </td>
              ))}
              {actions && (
                <td className="px-3 py-3">
                  {actions(item)}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}