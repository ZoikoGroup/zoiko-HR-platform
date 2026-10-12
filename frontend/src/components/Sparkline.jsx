// A tiny inline-SVG line chart: no chart library, no layout measuring, so it renders with the page instead of after a
// 100+ KB vendor chunk. The curve is a monotone cubic through the points (it never overshoots the data), like the
// "monotone" line it replaces.

/** Path through points that never overshoots: Fritsch-Carlson slopes, one cubic Bezier per segment. */
export function sparklinePath(points) {
  const n = points.length;
  if (n === 0) return "";
  if (n === 1) return `M${points[0].x},${points[0].y}`;
  const dx = [], slope = [];
  for (let i = 0; i < n - 1; i += 1) {
    dx[i] = points[i + 1].x - points[i].x;
    slope[i] = dx[i] === 0 ? 0 : (points[i + 1].y - points[i].y) / dx[i];
  }
  const m = [slope[0]];
  for (let i = 1; i < n - 1; i += 1) m[i] = slope[i - 1] * slope[i] <= 0 ? 0 : (slope[i - 1] + slope[i]) / 2;
  m[n - 1] = slope[n - 2];
  for (let i = 0; i < n - 1; i += 1) {
    if (slope[i] === 0) { m[i] = 0; m[i + 1] = 0; continue; }
    const a = m[i] / slope[i], b = m[i + 1] / slope[i], s = a * a + b * b;
    if (s > 9) { const t = 3 / Math.sqrt(s); m[i] = t * a * slope[i]; m[i + 1] = t * b * slope[i]; }
  }
  let d = `M${points[0].x},${points[0].y}`;
  for (let i = 0; i < n - 1; i += 1) {
    const w = dx[i] / 3;
    d += ` C${points[i].x + w},${points[i].y + m[i] * w} ${points[i + 1].x - w},${points[i + 1].y - m[i + 1] * w} ${points[i + 1].x},${points[i + 1].y}`;
  }
  return d;
}

export default function Sparkline({ values = [], color = "#3B82F6", width = 64, height = 32, strokeWidth = 2, className, ariaLabel }) {
  const nums = (values || []).map(Number).filter(Number.isFinite);
  if (nums.length < 2) return null;
  const pad = strokeWidth;                                   // keeps the stroke inside the box
  const min = Math.min(...nums), max = Math.max(...nums);
  const span = max - min || 1;                               // a flat series draws a flat line in the middle
  const points = nums.map((v, i) => ({
    x: pad + (i * (width - 2 * pad)) / (nums.length - 1),
    y: max === min ? height / 2 : pad + (1 - (v - min) / span) * (height - 2 * pad),
  }));
  const label = ariaLabel;
  return (
    <svg viewBox={`0 0 ${width} ${height}`} width="100%" height="100%" preserveAspectRatio="none" className={className}
      role={label ? "img" : undefined} aria-label={label} aria-hidden={label ? undefined : true} focusable="false">
      <path d={sparklinePath(points)} fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}
