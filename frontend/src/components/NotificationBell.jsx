/**
 * components/NotificationBell.jsx
 * -------------------------------
 * Header bell for the Organization and User portals (ZHR-20): unread badge
 * (capped at "99+"), a dropdown with the latest notifications, "Mark all as
 * read" and "View all". The badge follows the server's unread count: polled
 * (see useUnreadNotifications) and updated immediately after any read action.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Bell } from "lucide-react";
import { notificationService } from "../service/notificationService";
import { publishUnreadCount, useUnreadNotifications } from "../hooks/useUnreadNotifications";
import { formatBadge, relativeTime } from "../utils/notificationFormat";
import NotificationDetailDialog from "./notifications/NotificationDetailDialog";

export const NOTIFICATIONS_PATH = "/shared/notifications";
const LATEST = 5;

export default function NotificationBell() {
  const { count, refresh } = useUnreadNotifications();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const rootRef = useRef(null);
  const badge = formatBadge(count);

  const loadLatest = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await notificationService.list({ page: 1, page_size: LATEST });
      setItems(data.items || []);
      publishUnreadCount(data.unread_count);
    } catch (e) {
      setError(e.message || "Could not load notifications.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { if (open) loadLatest(); }, [open, loadLatest]);

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => { if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false); };
    const onKey = (e) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const markAll = async () => {
    try {
      const r = await notificationService.markAllRead();
      publishUnreadCount(r.unread_count);
      setItems((list) => list.map((i) => ({ ...i, is_read: true })));
    } catch (e) {
      setError(e.message || "Could not mark notifications as read.");
    }
  };

  const loadDetail = useCallback(async () => {
    const detail = await notificationService.get(selectedId);
    publishUnreadCount(detail.unread_count);
    setItems((list) => list.map((i) => (i.id === detail.id ? { ...i, is_read: true } : i)));
    return detail;
  }, [selectedId]);

  return (
    <div className="relative" ref={rootRef}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
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
            <button onClick={markAll} disabled={count === 0}
              className="text-xs font-semibold text-blue-600 hover:underline disabled:cursor-not-allowed disabled:text-slate-300 disabled:no-underline">
              Mark all as read
            </button>
          </div>

          <div className="max-h-96 overflow-y-auto">
            {loading && items.length === 0 ? (
              <p className="px-4 py-6 text-center text-sm text-slate-400">Loading…</p>
            ) : error ? (
              <div role="alert" className="px-4 py-4 text-sm text-red-600">
                {error} <button onClick={loadLatest} className="font-semibold underline">Retry</button>
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
          onClose={() => { setSelectedId(null); refresh(); }}
        />
      )}
    </div>
  );
}
