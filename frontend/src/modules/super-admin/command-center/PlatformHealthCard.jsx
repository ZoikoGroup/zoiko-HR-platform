import { useState } from "react";
import { HEALTH_STATUS_META, INK, INK_SOFT } from "./format";

const STATUS_OPTIONS = ["healthy", "warning", "down"];

export default function PlatformHealthCard({ data, loading, onUpdateStatus }) {
  const [editing, setEditing] = useState(null);

  return (
    <div className="bg-white border border-slate-200/80 rounded-3xl shadow-sm p-6">
      <div className="flex items-center justify-between mb-1">
        <h2 className="text-lg font-bold" style={{ color: INK }}>Platform Health</h2>
      </div>
      <p className="text-[11px] mb-4" style={{ color: INK_SOFT }}>Admin-maintained · click a status to update</p>

      {loading ? (
        <div className="h-40 bg-slate-100 rounded-2xl animate-pulse" />
      ) : (
        <div className="space-y-1">
          {(data || []).map((svc) => {
            const meta = HEALTH_STATUS_META[svc.status] || HEALTH_STATUS_META.healthy;
            return (
              <div key={svc.service_name} className="flex items-center justify-between gap-2 px-1 py-2 rounded-xl hover:bg-slate-50">
                <div className="min-w-0">
                  <p className="text-sm font-semibold truncate" style={{ color: INK }}>{svc.display_name}</p>
                  <p className="text-[11px] mt-0.5" style={{ color: INK_SOFT }}>
                    {svc.availability_pct != null ? `${svc.availability_pct.toFixed(2)}%` : "Availability —"}
                    {" · "}
                    {svc.latency_p95_ms != null ? `${svc.latency_p95_ms}ms p95` : "Latency —"}
                  </p>
                </div>
                <div className="relative flex-shrink-0">
                  <button
                    onClick={() => setEditing(editing === svc.service_name ? null : svc.service_name)}
                    className="inline-flex items-center gap-1.5 justify-end px-2 py-1 rounded-lg hover:bg-slate-100"
                  >
                    <span className={`w-1.5 h-1.5 rounded-full ${meta.dot}`} />
                    <span className={`text-xs font-semibold ${meta.text}`}>{meta.label}</span>
                  </button>
                  {editing === svc.service_name && (
                    <div className="absolute right-0 top-8 z-10 bg-white border border-slate-200 rounded-xl shadow-lg py-1 w-32">
                      {STATUS_OPTIONS.map((opt) => (
                        <button
                          key={opt}
                          onClick={() => { onUpdateStatus(svc.service_name, opt); setEditing(null); }}
                          className="w-full text-left px-3 py-1.5 text-xs font-medium hover:bg-slate-50 flex items-center gap-1.5"
                        >
                          <span className={`w-1.5 h-1.5 rounded-full ${HEALTH_STATUS_META[opt].dot}`} />
                          {HEALTH_STATUS_META[opt].label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
