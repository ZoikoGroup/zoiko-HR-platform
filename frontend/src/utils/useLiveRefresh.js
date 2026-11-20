/*
 * Keeps a view fresh: calls `refresh` when the window regains focus, when the tab becomes visible again, and every
 * `intervalMs` while the tab is visible (no polling in a hidden tab).
 */
import { useEffect, useRef } from "react";

const visible = () => typeof document === "undefined" || document.visibilityState !== "hidden";

export function startLiveRefresh(refresh, intervalMs = 30000) {
  if (typeof window === "undefined") return () => {};
  const onFocus = () => refresh();
  const onVisibility = () => { if (visible()) refresh(); };
  const timer = setInterval(() => { if (visible()) refresh(); }, intervalMs);
  window.addEventListener("focus", onFocus);
  document.addEventListener("visibilitychange", onVisibility);
  return () => {
    clearInterval(timer);
    window.removeEventListener("focus", onFocus);
    document.removeEventListener("visibilitychange", onVisibility);
  };
}

export default function useLiveRefresh(refresh, intervalMs = 30000) {
  const ref = useRef(refresh);
  ref.current = refresh;
  useEffect(() => startLiveRefresh(() => ref.current(), intervalMs), [intervalMs]);
}
