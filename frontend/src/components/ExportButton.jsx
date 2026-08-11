/* ExportButton Component */
import React from 'react';
import { Download, FileText, FileSpreadsheet } from 'lucide-react';

export function ExportButton({ onExport, isExporting, formats }) {
  const [isOpen, setIsOpen] = React.useState(false);

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        disabled={isExporting}
        className="flex items-center gap-2 px-3 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium"
      >
        <Download className="w-4 h-4" />
        Export
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-48 bg-white rounded-lg shadow-lg border border-gray-200 z-10">
          {formats.map((format) => {
            const Icon = format === 'csv' ? FileSpreadsheet : FileText;
            return (
              <button
                key={format}
                onClick={() => {
                  onExport(format);
                  setIsOpen(false);
                }}
                className="w-full flex items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
              >
                <Icon className="w-4 h-4" />
                Export as {format.toUpperCase()}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}