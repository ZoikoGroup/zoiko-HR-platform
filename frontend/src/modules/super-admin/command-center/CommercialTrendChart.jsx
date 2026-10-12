// The Commercial Health trend chart. It lives in its own file so the chart library is only fetched when this chart is
// actually drawn (lazy-loaded by CommercialHealthCard), not with the rest of the dashboard.
import { AreaChart, Area, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { formatCompactNumber, BLUE, EMERALD, INK_SOFT, SLATE_LINE } from "./format";

const formatCompactUsd = (value) => `$${formatCompactNumber(value)}`;

export default function CommercialTrendChart({ trend }) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <AreaChart data={trend} margin={{ top: 5, right: 4, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="mrrGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={BLUE} stopOpacity={0.15} />
            <stop offset="100%" stopColor={BLUE} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke={SLATE_LINE} />
        <XAxis dataKey="date" tick={{ fontSize: 10, fill: INK_SOFT }} axisLine={false} tickLine={false} />
        <YAxis yAxisId="mrr" tick={{ fontSize: 10, fill: INK_SOFT }} axisLine={false} tickLine={false} width={52} tickFormatter={formatCompactUsd} />
        <YAxis yAxisId="workforce" orientation="right" tick={{ fontSize: 10, fill: INK_SOFT }} axisLine={false} tickLine={false} width={44} tickFormatter={formatCompactNumber} />
        <Tooltip />
        <Area yAxisId="mrr" type="monotone" dataKey="mrr" stroke={BLUE} fill="url(#mrrGrad)" strokeWidth={2} />
        <Line yAxisId="workforce" type="monotone" dataKey="workforce" stroke={EMERALD} strokeWidth={2} dot={false} />
      </AreaChart>
    </ResponsiveContainer>
  );
}
