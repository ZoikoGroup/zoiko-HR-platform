/**
 * hooks/useUnreadNotifications.js
 * --------------------------------
 * The unread badge count, on the query cache. There is no push channel, so it polls (default 45 s, only while the tab
 * is visible) and refetches when the tab regains focus. Mutations elsewhere (opening or marking a notification) call
 * publishUnreadCount() with the count the server returned, which writes it straight into the cache, so every mounted
 * badge updates immediately without a refetch.
 */
import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { notificationService } from "../service/notificationService";
import { keys } from "../service/queryKeys";

export const UNREAD_EVENT = "zoiko-notifications-unread";
export const POLL_MS = 45_000;

/** Tell every mounted badge the server's new unread count (it is written into the query cache by the hook below). */
export function publishUnreadCount(count) {
  if (typeof window === "undefined" || typeof count !== "number") return;
  window.dispatchEvent(new window.CustomEvent(UNREAD_EVENT, { detail: { count } }));
}

export function useUnreadNotifications({ enabled = true, pollMs = POLL_MS } = {}) {
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: keys.notifications.unreadCount(),
    queryFn: ({ signal }) => notificationService.getUnreadCount({ signal }),
    enabled,
    refetchInterval: pollMs,
    staleTime: 0,          // a focus/visibility return always re-checks, as before
    retry: false,          // a failed poll keeps the last known count; the next tick retries
  });
  useEffect(() => {
    if (!enabled) return undefined;
    const onPublished = (e) => qc.setQueryData(keys.notifications.unreadCount(), { unread_count: Number(e.detail?.count) || 0 });
    // the query client re-checks on tab visibility; a plain window focus (no tab switch) should too, as it always did
    const onFocus = () => qc.invalidateQueries({ queryKey: keys.notifications.unreadCount() });
    window.addEventListener(UNREAD_EVENT, onPublished);
    window.addEventListener("focus", onFocus);
    return () => { window.removeEventListener(UNREAD_EVENT, onPublished); window.removeEventListener("focus", onFocus); };
  }, [enabled, qc]);
  // The query that is mounted reads the shared cache, so the count it shows is the one last written by any source.
  const count = enabled ? Number(query.data?.unread_count) || 0 : 0;
  return { count, refresh: () => query.refetch() };
}
