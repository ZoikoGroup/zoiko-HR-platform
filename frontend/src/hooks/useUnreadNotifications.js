/**
 * hooks/useUnreadNotifications.js
 * --------------------------------
 * The unread badge count. There is no push channel, so it polls (default 45 s)
 * and refetches when the tab regains focus. Mutations elsewhere (opening or
 * marking a notification) call publishUnreadCount() with the count the server
 * returned, so every mounted badge updates immediately without a refetch.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { notificationService } from "../service/notificationService";

export const UNREAD_EVENT = "zoiko-notifications-unread";
export const POLL_MS = 45_000;

export function publishUnreadCount(count) {
  if (typeof window === "undefined" || typeof count !== "number") return;
  window.dispatchEvent(new window.CustomEvent(UNREAD_EVENT, { detail: { count } }));
}

export function useUnreadNotifications({ enabled = true, pollMs = POLL_MS } = {}) {
  const [count, setCount] = useState(0);
  const alive = useRef(true);

  const refresh = useCallback(async () => {
    if (!enabled) return;
    try {
      const data = await notificationService.getUnreadCount();
      if (alive.current) setCount(Number(data?.unread_count) || 0);
    } catch {
      /* a failed poll keeps the last known count; the next tick retries */
    }
  }, [enabled]);

  useEffect(() => {
    alive.current = true;
    if (!enabled) return undefined;
    refresh();
    const timer = setInterval(refresh, pollMs);
    const onFocus = () => refresh();
    const onVisible = () => { if (document.visibilityState === "visible") refresh(); };
    const onPublished = (e) => { if (alive.current) setCount(Number(e.detail?.count) || 0); };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener(UNREAD_EVENT, onPublished);
    return () => {
      alive.current = false;
      clearInterval(timer);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener(UNREAD_EVENT, onPublished);
    };
  }, [enabled, pollMs, refresh]);

  return { count, refresh };
}
