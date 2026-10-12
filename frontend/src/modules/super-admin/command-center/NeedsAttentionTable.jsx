import { useNavigate } from "react-router-dom";
import { CheckCircle2, ChevronRight } from "lucide-react";
import { SEVERITY_META, formatRelativeAge, INK, INK_SOFT } from "./format";

export default function NeedsAttentionTable({ items, loading }) {
  const navigate = useNavigate();

  return (
    <div className="bg-white border border-slate-200/80 rounded-3xl shadow-sm overflow-hidden">
      <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/30">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-bold" style={{ color: INK }}>Needs Your Attention</h2>
          {!loading && (
            <span className="px-2.5 py-0.5 text-xs font-semibold text-red-600 bg-red-50 border border-red-200/60 rounded-full">
              {items.length}
            </span>
          )}
        </div>
      </div>

      {loading ? (
        <div className="p-6 space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-10 bg-slate-100 rounded-xl animate-pulse" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="p-8 flex flex-col items-center gap-2 text-center">
          <CheckCircle2 className="w-8 h-8 text-emerald-500" />
          <p className="text-sm font-semibold" style={{ color: INK }}>Nothing needs attention right now.</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full table-fixed">
            <thead>
              <tr>
                <th className="w-[22%] text-left text-[11px] font-bold uppercase tracking-wider px-4 py-3 border-b border-slate-100" style={{ color: INK_SOFT }}>Severity</th>
                <th className="w-[34%] text-left text-[11px] font-bold uppercase tracking-wider px-4 py-3 border-b border-slate-100" style={{ color: INK_SOFT }}>Issue</th>
                <th className="w-[24%] text-left text-[11px] font-bold uppercase tracking-wider px-4 py-3 border-b border-slate-100 truncate" style={{ color: INK_SOFT }}>Org</th>
                <th className="w-[14%] text-left text-[11px] font-bold uppercase tracking-wider px-4 py-3 border-b border-slate-100" style={{ color: INK_SOFT }}>Age</th>
                <th className="w-[6%] px-2 py-3 border-b border-slate-100">
                  <span className="sr-only">Action</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {items.map((item, idx) => {
                const meta = SEVERITY_META[item.severity] || SEVERITY_META.low;
                const clickable = Boolean(item.action_href);
                return (
                  <tr
                    key={idx}
                    onClick={clickable ? () => navigate(item.action_href) : undefined}
                    title={item.action_label}
                    className={`hover:bg-slate-50/60 ${clickable ? "cursor-pointer" : ""}`}
                  >
                    <td className="px-4 py-3 border-b border-slate-100 align-top">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold ${meta.bg} ${meta.text} border ${meta.border}`}>
                        {meta.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 border-b border-slate-100 align-top text-sm font-medium break-words" style={{ color: INK }}>{item.issue}</td>
                    <td className="px-4 py-3 border-b border-slate-100 align-top text-sm font-medium text-blue-600 break-words">
                      {item.organization_name || "Platform-wide"}
                    </td>
                    <td className="px-4 py-3 border-b border-slate-100 align-top text-sm whitespace-nowrap" style={{ color: INK_SOFT }}>
                      {formatRelativeAge(item.detected_at)}
                    </td>
                    <td className="px-2 py-3 border-b border-slate-100 align-top">
                      {clickable && (
                        <ChevronRight
                          className={`w-4 h-4 ${item.severity === "critical" || item.severity === "high" ? "text-red-500" : "text-slate-400"}`}
                        />
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
