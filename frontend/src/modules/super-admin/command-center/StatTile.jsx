import { LineChart, Line, ResponsiveContainer } from "recharts";
import { formatDeltaPct, INK, INK_SOFT, EMERALD, RED } from "./format";

export default function StatTile({ icon: Icon, iconGradient, title, valueDisplay, deltaPct, series, sparklineColor }) {
  const chartData = (series?.values || []).map((v, i) => ({ i, v }));
  const deltaLabel = formatDeltaPct(deltaPct);
  const deltaPositive = (deltaPct ?? 0) >= 0;

  return (
    <div className="p-5 bg-white border border-slate-200/80 rounded-3xl shadow-sm transition-all hover:shadow-md">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2.5">
          <div className={`p-2 bg-gradient-to-br ${iconGradient} text-white rounded-xl shadow-sm`}>
            <Icon className="w-4 h-4" />
          </div>
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">{title}</p>
        </div>
      </div>
      <div className="flex items-end justify-between gap-2">
        <div>
          <p className="text-2xl font-extrabold" style={{ color: INK }}>{valueDisplay}</p>
          {deltaLabel && (
            <p className="text-[11px] font-semibold mt-1" style={{ color: deltaPositive ? EMERALD : RED }}>
              {deltaLabel} <span style={{ color: INK_SOFT, fontWeight: 500 }}>vs {series?.values?.length > 1 ? `${series.values.length}d ago` : "prior"}</span>
            </p>
          )}
        </div>
        {chartData.length > 1 && (
          <div className="w-16 h-8 flex-shrink-0">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData}>
                <Line type="monotone" dataKey="v" stroke={sparklineColor} strokeWidth={2} dot={false} isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </div>
  );
}
