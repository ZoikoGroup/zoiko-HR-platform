import { useEffect, useRef } from "react";

/**
 * Keeps a page that shows someone else's decisions (an approval, a rejection) up to date: calls `load({ silent: true })`
 * when the tab becomes visible again, when the window regains focus, and every `intervalMs` while the tab is open.
 * The first load is the page's own; this only does the later refreshes, and never overlaps two at once.
 */
export function useAutoRefresh(load, { intervalMs = 30000 } = {}) {
  const loadRef = useRef(load);
  loadRef.current = load;
  const busy = useRef(false);

  useEffect(() => {
    const run = async () => {
      if (busy.current) return;
      busy.current = true;
      try { await loadRef.current({ silent: true }); } finally { busy.current = false; }
    };
    const onVisible = () => { if (document.visibilityState === "visible") run(); };
    const timer = setInterval(() => { if (document.visibilityState === "visible") run(); }, intervalMs);
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", run);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", run);
    };
  }, [intervalMs]);
}
