/**
 * components/NotificationBell.jsx
 * -------------------------------
 * Header bell for the Organization and User portals (ZHR-20): unread badge
 * (capped at "99+"), a dropdown with the latest notifications, "Mark all as
 * read", sound toggle, and "View all". The badge follows the server's unread
 * count: polled (see useUnreadNotifications) and updated immediately after any read action.
 * Plays a notification sound when new notifications arrive (see useNotificationSound).
 *
 * The latest list lives on the shared query cache: hovering/focusing the bell
 * warms it, and reopening shows cached rows immediately while a stale entry
 * revalidates in the background. Read actions update the cache optimistically.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Bell, Volume2, VolumeX } from "lucide-react";
import { notificationService } from "../service/notificationService";
import { keys } from "../service/queryKeys";
import { publishUnreadCount, useUnreadNotifications } from "../hooks/useUnreadNotifications";
import { useNotificationSound } from "../hooks/useNotificationSound";
import { formatBadge, relativeTime } from "../utils/notificationFormat";
import NotificationDetailDialog from "./notifications/NotificationDetailDialog";
import { useDismissible } from "../hooks/useDismissible";

export const NOTIFICATIONS_PATH = "/shared/notifications";
const LATEST = 5;
const LATEST_PARAMS = { page: 1, page_size: LATEST };
const LATEST_KEY = keys.notifications.list(LATEST_PARAMS);
const FRESH_MS = 30_000;
const fetchLatest = ({ signal }) => notificationService.list(LATEST_PARAMS, { signal });

export default function NotificationBell() {
  const { count } = useUnreadNotifications();
  const qc = useQueryClient();
  const { soundEnabled, toggleSound } = useNotificationSound(count);
  const [open, setOpen] = useState(false);
  const [actionError, setActionError] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const rootRef = useRef(null);
  const triggerRef = useRef(null);
  const badge = formatBadge(count);

  const latest = useQuery({
    queryKey: LATEST_KEY,
    queryFn: fetchLatest,
    enabled: open,
    staleTime: FRESH_MS,
    refetchOnWindowFocus: false,
    retry: false,
  });
  const items = latest.data?.items || [];
  const error = actionError || (latest.isError ? latest.error?.message || "Could not load notifications." : null);

  // Start the request on intent, not on click. prefetchQuery is a no-op when the cache entry is still fresh.
  const prefetchLatest = useCallback(() => {
    qc.prefetchQuery({ queryKey: LATEST_KEY, queryFn: fetchLatest, staleTime: FRESH_MS }).catch(() => {});
  }, [qc]);

  // Warm once when the header mounts: touch users have no hover before the tap. The cached rows stay usable even
  // after they go stale — the next open shows them at once and revalidates behind the scenes.
  useEffect(() => { prefetchLatest(); }, [prefetchLatest]);

  useEffect(() => {
    const next = latest.data?.unread_count;
    if (typeof next === "number") publishUnreadCount(next);
  }, [latest.data]);

  useDismissible(rootRef, open, () => setOpen(false), { returnFocusRef: triggerRef });

  const markAll = async () => {
    setActionError(null);
    // A list request already in flight must not overwrite the optimistic read state.
    await qc.cancelQueries({ queryKey: LATEST_KEY });
    const previous = qc.getQueryData(LATEST_KEY);
    qc.setQueryData(LATEST_KEY, (old) => old
      ? { ...old, unread_count: 0, items: (old.items || []).map((i) => ({ ...i, is_read: true })) }
      : old);
    publishUnreadCount(0);
    try {
      const r = await notificationService.markAllRead();
      const nextCount = Number(r?.unread_count) || 0;
      qc.setQueryData(LATEST_KEY, (old) => old ? { ...old, unread_count: nextCount } : old);
      publishUnreadCount(nextCount);
    } catch (e) {
      qc.setQueryData(LATEST_KEY, previous);
      publishUnreadCount(previous?.unread_count ?? count);
      setActionError(e.message || "Could not mark notifications as read.");
    }
  };

  const loadDetail = useCallback(async () => {
    const detail = await notificationService.get(selectedId);
    const nextCount = Number(detail?.unread_count);
    if (Number.isFinite(nextCount)) publishUnreadCount(nextCount);
    qc.setQueryData(LATEST_KEY, (old) => old ? {
      ...old,
      unread_count: Number.isFinite(nextCount) ? nextCount : old.unread_count,
      items: (old.items || []).map((i) => (i.id === detail.id ? { ...i, is_read: true } : i)),
    } : old);
    return detail;
  }, [selectedId, qc]);

  const retry = () => {
    setActionError(null);
    if (latest.isError) latest.refetch();
  };

  return (
    <div className="relative" ref={rootRef}>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        onMouseEnter={prefetchLatest}
        onFocus={prefetchLatest}
        onTouchStart={prefetchLatest}
        aria-label={count > 0 ? `Notifications, ${count} unread` : "Notifications"}
        aria-haspopup="true"
        aria-expanded={open}
        className="relative inline-flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 transition hover:border-slate-300 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
      >
        <Bell className="h-5 w-5" />
        {badge && (
          <span
            data-testid="notification-badge"
            className="absolute -right-1.5 -top-1.5 flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-red-500 px-1 text-[11px] font-bold leading-none text-white ring-2 ring-white"
          >
            {badge}
          </span>
        )}
      </button>

      {open && (
        <div
          role="region"
          aria-label="Notifications"
          className="absolute right-0 z-40 mt-2 w-80 max-w-[90vw] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl"
        >
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
            <span className="text-sm font-bold text-slate-800">Notifications</span>
            <div className="flex items-center gap-2.5">
              <button
                type="button"
                onClick={toggleSound}
                title={soundEnabled ? "Mute notification sound" : "Unmute notification sound"}
                aria-label={soundEnabled ? "Mute notification sound" : "Unmute notification sound"}
                className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition"
              >
                {soundEnabled ? (
                  <Volume2 className="h-4 w-4 text-slate-600" />
                ) : (
                  <VolumeX className="h-4 w-4 text-slate-400" />
                )}
              </button>
              <button
                type="button"
                onClick={markAll}
                disabled={count === 0}
                className="text-xs font-semibold text-blue-600 hover:underline disabled:cursor-not-allowed disabled:text-slate-300 disabled:no-underline"
              >
                Mark all as read
              </button>
            </div>
          </div>

          <div className="max-h-96 overflow-y-auto">
            {latest.isLoading && items.length === 0 ? (
              <p className="px-4 py-6 text-center text-sm text-slate-400">Loading…</p>
            ) : error ? (
              <div role="alert" className="px-4 py-4 text-sm text-red-600">
                {error} <button onClick={retry} className="font-semibold underline">Retry</button>
              </div>
            ) : items.length === 0 ? (
              <p className="px-4 py-6 text-center text-sm text-slate-400">You have no notifications</p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {items.map((n) => (
                  <li key={n.id}>
                    <button
                      onClick={() => { setSelectedId(n.id); setOpen(false); }}
                      className={`flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-slate-50 focus:bg-slate-50 focus:outline-none ${n.is_read ? "" : "bg-blue-50/50"}`}
                    >
                      <span aria-hidden="true" className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${n.is_read ? "bg-transparent" : "bg-blue-500"}`} />
                      <span className="min-w-0 flex-1">
                        <span className={`block truncate text-sm ${n.is_read ? "text-slate-600" : "font-semibold text-slate-900"}`}>{n.title}</span>
                        <span className="block truncate text-xs text-slate-500">{n.preview}</span>
                        <span className="text-[11px] text-slate-400">{relativeTime(n.sent_at)}</span>
                      </span>
                      {!n.is_read && <span className="sr-only">Unread</span>}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="border-t border-slate-100 px-4 py-2 text-center">
            <Link to={NOTIFICATIONS_PATH} onClick={() => setOpen(false)} className="text-sm font-semibold text-blue-600 hover:underline">
              View all
            </Link>
          </div>
        </div>
      )}

      {selectedId !== null && (
        <NotificationDetailDialog
          key={selectedId}
          load={loadDetail}
          onClose={() => setSelectedId(null)}
        />
      )}
    </div>
  );
}
