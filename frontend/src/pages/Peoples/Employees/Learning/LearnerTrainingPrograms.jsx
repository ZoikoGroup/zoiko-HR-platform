import { BookOpen } from "lucide-react";
import EmployeeStatusBadge from "../../../../components/employee/EmployeeStatusBadge";

export default function LearnerTrainingPrograms({ programs }) {
  const list = programs || [];

  if (list.length === 0) {
    return (
      <div className="text-center py-16">
        <BookOpen className="w-12 h-12 text-gray-300 dark:text-[#475569] mx-auto mb-4" />
        <p className="text-base font-semibold text-gray-700 dark:text-[#cbd5e1] mb-1">No training programs yet</p>
        <p className="text-sm text-gray-400 dark:text-[#64748b]">Programs for everyone and for your department will appear here.</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {list.map((p) => (
        <div key={p.id} className="bg-white dark:bg-[#1e293b] rounded-xl border border-gray-200 dark:border-[#334155] shadow-sm hover:shadow-md transition-all p-5">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 rounded-lg bg-blue-50 dark:bg-blue-900/30">
              <BookOpen className="w-4 h-4 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <p className="text-sm font-bold text-gray-900 dark:text-[#f1f5f9]">{p.name}</p>
              {p.department && <p className="text-xs text-gray-400 dark:text-[#94a3b8] capitalize">{p.department}</p>}
            </div>
          </div>
          {p.description && <p className="text-xs text-gray-500 dark:text-[#94a3b8] mb-3 line-clamp-2">{p.description}</p>}
          <div className="flex items-center gap-3 text-xs text-gray-400 dark:text-[#94a3b8] mb-3">
            {p.start_date && <span>Start: {p.start_date}</span>}
            {p.end_date && <span>End: {p.end_date}</span>}
            {p.status && <EmployeeStatusBadge status={p.status} />}
          </div>
          {p.resource_link && (
            <a href={p.resource_link} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600 dark:text-blue-400 hover:text-blue-800">
              Open Resource &rarr;
            </a>
          )}
        </div>
      ))}
    </div>
  );
}
