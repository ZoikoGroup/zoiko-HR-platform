import { INK, INK_SOFT, BLUE } from "./format";

const STAGES = [
  { key: "created", label: "Created" },
  { key: "provisioned", label: "Provisioned" },
  { key: "configured", label: "Configured" },
  { key: "activated", label: "Activated" },
  { key: "adopted", label: "Adopted" },
];

export default function OrgLifecycleFunnel({ data, loading }) {
  const max = data?.created || 1;

  return (
    <div className="bg-white border border-slate-200/80 rounded-3xl shadow-sm p-6">
      <h2 className="text-lg font-bold mb-4" style={{ color: INK }}>Organization Lifecycle</h2>

      {loading ? (
        <div className="h-40 bg-slate-100 rounded-2xl animate-pulse" />
      ) : (
        <>
          <div className="space-y-2.5">
            {STAGES.map((s, i) => {
              const value = data?.[s.key] ?? 0;
              const pct = Math.max((value / max) * 100, value > 0 ? 6 : 0);
              const opacity = 1 - i * 0.14;
              return (
                <div key={s.key} className="flex items-center gap-3">
                  <span className="w-[78px] text-xs font-semibold flex-shrink-0" style={{ color: INK_SOFT }}>{s.label}</span>
                  <div className="flex-1 h-6 rounded-lg overflow-hidden bg-slate-50">
                    <div
                      className="h-full rounded-lg flex items-center justify-end pr-2 transition-all"
                      style={{ width: `${pct}%`, background: BLUE, opacity }}
                    >
                      <span className="text-[11px] font-bold text-white">{value}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="flex items-center justify-between mt-4 pt-4 border-t border-slate-100">
            <span className="text-xs font-semibold" style={{ color: INK_SOFT }}>Conversion Rate</span>
            <span className="text-sm font-extrabold" style={{ color: INK }}>{data?.conversion_rate_pct ?? 0}%</span>
          </div>
        </>
      )}
    </div>
  );
}
