import { useNavigate } from "react-router-dom";
import { formatRelativeAge, INK, INK_SOFT } from "./format";

const ACTION_COLORS = {
  create: "bg-emerald-50 text-emerald-600",
  update: "bg-blue-50 text-blue-600",
  delete: "bg-red-50 text-red-600",
  suspend: "bg-amber-50 text-amber-600",
  activate: "bg-emerald-50 text-emerald-600",
  login: "bg-blue-50 text-blue-600",
  logout: "bg-slate-50 text-slate-600",
  config_change: "bg-blue-50 text-blue-600",
};

export default function GovernanceAuditCard({ auditEventsCount, recentActivity, loading }) {
  const navigate = useNavigate();

  return (
    <div className="bg-white border border-slate-200/80 rounded-3xl shadow-sm p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-bold" style={{ color: INK }}>Governance &amp; Audit</h2>
      </div>

      {loading ? (
        <div className="h-40 bg-slate-100 rounded-2xl animate-pulse" />
      ) : (
        <>
          <div className="p-3 rounded-2xl bg-slate-50 border border-slate-100 mb-4 inline-block">
            <p className="text-[10.5px] font-semibold text-slate-500 uppercase tracking-wide">Audit Events</p>
            <p className="text-lg font-extrabold mt-1" style={{ color: INK }}>{auditEventsCount ?? 0}</p>
          </div>

          <p className="text-[11px] font-bold uppercase tracking-wider mb-2" style={{ color: INK_SOFT }}>
            Recent Audit Activity
          </p>
          <div className="space-y-2 max-h-52 overflow-y-auto">
            {(!recentActivity || recentActivity.length === 0) ? (
              <p className="text-sm" style={{ color: INK_SOFT }}>No audit activity recorded yet.</p>
            ) : (
              recentActivity.map((log) => (
                <div key={log.id} className="flex items-center justify-between gap-2 text-xs">
                  <span className={`px-2 py-0.5 rounded-full font-semibold flex-shrink-0 ${ACTION_COLORS[log.action] || "bg-slate-50 text-slate-600"}`}>
                    {(log.action || "").replace("_", " ")}
                  </span>
                  <span className="truncate flex-1" style={{ color: INK }}>{log.entity_type}</span>
                  <span className="flex-shrink-0" style={{ color: INK_SOFT }}>{formatRelativeAge(log.created_at)}</span>
                </div>
              ))
            )}
          </div>
        </>
      )}

      <button
        onClick={() => navigate("/super-admin/audit-logs")}
        className="mt-4 text-xs font-semibold text-blue-600 hover:text-blue-800"
      >
        View audit logs →
      </button>
    </div>
  );
}
