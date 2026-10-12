// Shown inside the content area while a page's code is still loading, so the sidebar and header stay on screen.
// A slim progress bar at the top of the content plus a layout-neutral skeleton; the bar only appears after a short
// delay, so a chunk that arrives quickly never flashes anything.
import { useEffect, useState } from "react";

export function TopProgressBar() {
  return (
    <div className="fixed inset-x-0 top-0 z-50 h-0.5 overflow-hidden bg-blue-100" role="progressbar" aria-label="Loading page">
      <div className="h-full w-1/3 bg-blue-600" style={{ animation: "page-progress 1.1s ease-in-out infinite" }} />
      <style>{"@keyframes page-progress { 0% { transform: translateX(-100%); } 100% { transform: translateX(300%); } }"}</style>
    </div>
  );
}

export default function PageFallback({ delayMs = 120 }) {
  const [visible, setVisible] = useState(delayMs === 0);
  useEffect(() => {
    if (delayMs === 0) return undefined;
    const t = setTimeout(() => setVisible(true), delayMs);
    return () => clearTimeout(t);
  }, [delayMs]);
  if (!visible) return <div className="min-h-[60vh]" aria-busy="true" />;
  return (
    <div className="min-h-[60vh] space-y-6" aria-busy="true" aria-live="polite">
      <TopProgressBar />
      <div className="space-y-2">
        <div className="h-7 w-56 rounded-lg bg-slate-200 animate-pulse" />
        <div className="h-4 w-80 max-w-full rounded bg-slate-100 animate-pulse" />
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => <div key={i} className="h-24 rounded-2xl border border-slate-200 bg-slate-100 animate-pulse" />)}
      </div>
      <div className="h-64 rounded-2xl border border-slate-200 bg-slate-100 animate-pulse" />
    </div>
  );
}
