/**
 * pages/NotificationsPage.jsx
 * ---------------------------
 * Full inbox for the Organization and User portals (ZHR-20), rendered inside the
 * shared app shell at /shared/notifications. Super admins manage notifications
 * from their own Notification Center, so they are redirected there.
 */
import { useCallback, useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { Bell, ChevronLeft, ChevronRight, AlertTriangle, Mail, MailOpen, CheckCheck } from "lucide-react";
import PageHeader from "../components/PageHeader";
import NotificationDetailDialog from "../components/notifications/NotificationDetailDialog";
import { useAuth } from "../context/AuthContext";
import { ROLES } from "../config/roles";
import { notificationService } from "../service/notificationService";
import { publishUnreadCount } from "../hooks/useUnreadNotifications";
import { formatDateTimeWithZone, formatUtc } from "../utils/dateTime";
import { relativeTime } from "../utils/notificationFormat";

const PAGE_SIZE = 20;

export default function NotificationsPage() {
  const { role } = useAuth();
  const [tab, setTab] = useState("all"); // all | unread
  const [page, setPage] = useState(1);
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [busyId, setBusyId] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await notificationService.list({ filter: tab, page, page_size: PAGE_SIZE });
      setItems(data.items || []);
      setTotal(data.total || 0);
      publishUnreadCount(data.unread_count);
    } catch (e) {
      setError(e.message || "Failed to load notifications.");
    } finally {
      setLoading(false);
    }
  }, [tab, page]);

  useEffect(() => { if (role !== ROLES.SUPER_ADMIN) load(); }, [load, role]);

  if (role === ROLES.SUPER_ADMIN) return <Navigate to="/super-admin/notifications" replace />;

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const switchTab = (next) => { setTab(next); setPage(1); };

  const toggleRead = async (n) => {
    setBusyId(n.id);
    try {
      const r = n.is_read ? await notificationService.markUnread(n.id) : await notificationService.markRead(n.id);
      publishUnreadCount(r.unread_count);
      await load();
    } catch (e) {
      setError(e.message || "Could not update the notification.");
    } finally {
      setBusyId(null);
    }
  };

  const markAll = async () => {
    try {
      const r = await notificationService.markAllRead();
      publishUnreadCount(r.unread_count);
      await load();
    } catch (e) {
      setError(e.message || "Could not mark notifications as read.");
    }
  };

  const loadDetail = async () => {
    const detail = await notificationService.get(selectedId);
    publishUnreadCount(detail.unread_count);
    setItems((list) => list.map((i) => (i.id === detail.id ? { ...i, is_read: true } : i)));
    return detail;
  };

  const emptyText = tab === "unread" ? "You're all caught up" : "You have no notifications";

  return (
    <div className="space-y-6 font-sans">
      <PageHeader title="Notifications" description="Messages sent to you by the Zoiko HR team." icon={Bell} />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div role="tablist" aria-label="Filter notifications" className="flex gap-2">
          {[["all", "All"], ["unread", "Unread"]].map(([key, label]) => (
            <button key={key} role="tab" aria-selected={tab === key} onClick={() => switchTab(key)}
              className={`rounded-xl border px-4 py-2 text-sm font-medium transition ${
                tab === key ? "border-[#3B82F6] bg-[#3B82F6]/5 text-[#3B82F6]" : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"}`}>
              {label}
            </button>
          ))}
        </div>
        <button onClick={markAll}
          className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-50">
          <CheckCheck className="h-4 w-4" /> Mark all as read
        </button>
      </div>

      {error && (
        <div role="alert" className="flex items-center gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          <AlertTriangle className="h-5 w-5 shrink-0" />
          <span>{error}</span>
          <button onClick={load} className="ml-auto text-xs font-semibold underline">Retry</button>
        </div>
      )}

      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-[#3B82F6] border-t-transparent" />
          </div>
        ) : items.length === 0 && !error ? (
          <div className="flex flex-col items-center justify-center py-20 text-slate-400">
            <Bell className="mb-3 h-12 w-12" />
            <p className="text-lg font-medium">{emptyText}</p>
          </div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {items.map((n) => (
              <li key={n.id} className={`flex items-start gap-4 px-6 py-4 ${n.is_read ? "" : "bg-blue-50/40"}`}>
                <span aria-hidden="true" className={`mt-2 h-2 w-2 shrink-0 rounded-full ${n.is_read ? "bg-transparent" : "bg-blue-500"}`} />
                <button onClick={() => setSelectedId(n.id)} className="min-w-0 flex-1 text-left focus:outline-none focus:ring-2 focus:ring-blue-500/40 rounded-lg">
                  <span className={`block text-sm ${n.is_read ? "text-slate-600" : "font-semibold text-slate-900"}`}>
                    {n.title}{!n.is_read && <span className="sr-only"> (unread)</span>}
                  </span>
                  <span className="mt-0.5 line-clamp-2 block text-sm text-slate-500">{n.preview}</span>
                  <span className="mt-1 block text-xs text-slate-400">
                    {n.sender_name} ·{" "}
                    <time dateTime={n.sent_at} title={`${formatDateTimeWithZone(n.sent_at)} (${formatUtc(n.sent_at)})`}>
                      {relativeTime(n.sent_at)}
                    </time>
                  </span>
                </button>
                <button
                  onClick={() => toggleRead(n)}
                  disabled={busyId === n.id}
                  aria-label={n.is_read ? "Mark as unread" : "Mark as read"}
                  title={n.is_read ? "Mark as unread" : "Mark as read"}
                  className="rounded-lg p-2 text-slate-400 transition hover:bg-slate-100 hover:text-[#3B82F6] focus:outline-none focus:ring-2 focus:ring-blue-500/40 disabled:opacity-50"
                >
                  {n.is_read ? <Mail className="h-4 w-4" /> : <MailOpen className="h-4 w-4" />}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {total > PAGE_SIZE && (
        <div className="flex items-center justify-between text-sm text-slate-500">
          <span>Page {page} of {totalPages}</span>
          <div className="flex gap-2">
            <button disabled={page <= 1} onClick={() => setPage(page - 1)}
              className="flex items-center gap-1 rounded-xl border border-slate-200 px-3 py-1.5 hover:bg-slate-50 disabled:opacity-40">
              <ChevronLeft className="h-4 w-4" /> Prev
            </button>
            <button disabled={page >= totalPages} onClick={() => setPage(page + 1)}
              className="flex items-center gap-1 rounded-xl border border-slate-200 px-3 py-1.5 hover:bg-slate-50 disabled:opacity-40">
              Next <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {selectedId !== null && (
        <NotificationDetailDialog
          key={selectedId}
          load={loadDetail}
          onClose={() => { setSelectedId(null); load(); }}
        />
      )}
    </div>
  );
}
