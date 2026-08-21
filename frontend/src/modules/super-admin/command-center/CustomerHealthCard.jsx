import { useNavigate } from "react-router-dom";
import { CheckCircle2, Eye, AlertTriangle } from "lucide-react";
import { INK, INK_SOFT } from "./format";

export default function CustomerHealthCard({ data, loading }) {
  const navigate = useNavigate();

  return (
    <div className="bg-white border border-slate-200/80 rounded-3xl shadow-sm p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-bold" style={{ color: INK }}>Customer Health</h2>
      </div>

      {loading ? (
        <div className="h-40 bg-slate-100 rounded-2xl animate-pulse" />
      ) : (
        <>
          <div className="grid grid-cols-3 gap-3 mb-5">
            <div className="p-3 rounded-2xl bg-emerald-50 border border-emerald-100 flex flex-col items-center">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 mb-1" />
              <p className="text-xl font-extrabold text-emerald-700">{data?.healthy ?? 0}</p>
              <p className="text-[11px] font-semibold text-emerald-600">Healthy</p>
            </div>
            <div className="p-3 rounded-2xl bg-amber-50 border border-amber-100 flex flex-col items-center">
              <Eye className="w-4 h-4 text-amber-600 mb-1" />
              <p className="text-xl font-extrabold text-amber-700">{data?.watch ?? 0}</p>
              <p className="text-[11px] font-semibold text-amber-600">Watch</p>
            </div>
            <div className="p-3 rounded-2xl bg-red-50 border border-red-100 flex flex-col items-center">
              <AlertTriangle className="w-4 h-4 text-red-600 mb-1" />
              <p className="text-xl font-extrabold text-red-700">{data?.at_risk ?? 0}</p>
              <p className="text-[11px] font-semibold text-red-600">At Risk</p>
            </div>
          </div>

          <p className="text-[11px] font-bold uppercase tracking-wider mb-2" style={{ color: INK_SOFT }}>
            Top At-Risk Organizations
          </p>
          {(!data?.top_at_risk || data.top_at_risk.length === 0) ? (
            <p className="text-sm" style={{ color: INK_SOFT }}>No organizations currently at risk.</p>
          ) : (
            <div className="space-y-1">
              {data.top_at_risk.map((org) => (
                <div
                  key={org.organization_id}
                  onClick={() => navigate(`/super-admin/organizations/${org.organization_id}`)}
                  className="flex items-center justify-between py-2 px-2 rounded-xl hover:bg-slate-50 cursor-pointer group"
                  title={org.reasons?.join(" · ")}
                >
                  <span className="text-sm font-semibold group-hover:text-blue-600 truncate" style={{ color: INK }}>
                    {org.organization_name}
                  </span>
                  <span className="flex items-center gap-1.5 text-xs font-bold text-red-600 flex-shrink-0">
                    <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
                    {org.risk_score}
                  </span>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
