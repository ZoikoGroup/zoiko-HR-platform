import { useState, useEffect, useCallback } from "react";
import PageHeader from "../../components/PageHeader";
import { Bell, Mail, MailOpen, Trash2, Send, ChevronLeft, ChevronRight, Info, AlertTriangle, AlertCircle } from "lucide-react";
import { superAdminService } from "../../service/superAdminService";

export default function NotificationCenter() {
  const [notifications, setNotifications] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filter, setFilter] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ title: "", message: "", notification_type: "info", priority: "normal", target_org_id: "", target_user_id: "" });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setError(null);
      const params = { page, page_size: pageSize };
      if (filter === "read") params.is_read = true;
      if (filter === "unread") params.is_read = false;
      const data = await superAdminService.getNotifications(params);
      setNotifications(data.notifications || []);
      setTotal(data.total || 0);
    } catch (e) {
      console.error("Failed to load notifications", e);
      setError(e.message || "Failed to load notifications.");
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, filter]);

  useEffect(() => { load(); }, [load]);

  const handleMarkRead = async (id) => {
    try {
      await superAdminService.markNotificationRead(id);
      load();
    } catch (e) { console.error(e); }
  };

  const handleDelete = async (id) => {
    if (!confirm("Delete this notification?")) return;
    try {
      await superAdminService.deleteNotification(id);
      load();
    } catch (e) { console.error(e); }
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    try {
      await superAdminService.createNotification({
        title: form.title,
        message: form.message,
        notification_type: form.notification_type,
        priority: form.priority,
        target_org_id: form.target_org_id ? parseInt(form.target_org_id) : null,
        target_user_id: form.target_user_id ? parseInt(form.target_user_id) : null,
      });
      setShowCreate(false);
      setForm({ title: "", message: "", notification_type: "info", priority: "normal", target_org_id: "", target_user_id: "" });
      setPage(1);
      load();
    } catch (e) { console.error(e); }
  };

  const priorityIcon = (p) => {
    if (p === "critical") return <AlertCircle className="h-4 w-4 text-red-500" />;
    if (p === "high") return <AlertTriangle className="h-4 w-4 text-orange-500" />;
    return <Info className="h-4 w-4 text-blue-500" />;
  };

  const totalPages = Math.ceil(total / pageSize);

  return (
    <div>
      <PageHeader
        title="Notification Center"
        description="Send and manage platform-wide notifications"
        icon={Bell}
      />

      {error && (
        <div className="rounded-3xl border border-red-200 bg-red-50 p-4 text-red-700 text-sm flex items-center gap-3">
          <AlertTriangle className="h-5 w-5 flex-shrink-0" />
          <span>{error}</span>
          <button onClick={load} className="ml-auto text-red-600 underline hover:text-red-800 text-xs font-semibold">Retry</button>
        </div>
      )}

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-2">
          {["", "read", "unread"].map((f) => (
            <button
              key={f}
              onClick={() => { setFilter(f); setPage(1); }}
              className={`rounded-xl border px-4 py-2 text-sm font-medium transition ${
                filter === f
                  ? "border-[#FF7A00] bg-[#FF7A00]/5 text-[#FF7A00]"
                  : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
              }`}
            >
              {f === "" ? "All" : f === "read" ? "Read" : "Unread"}
            </button>
          ))}
        </div>
        <button
          onClick={() => setShowCreate(!showCreate)}
          className="inline-flex items-center gap-2 rounded-xl bg-[#FF7A00] px-4 py-2 text-sm font-medium text-white hover:bg-orange-600 transition"
        >
          <Send className="h-4 w-4" /> New Notification
        </button>
      </div>

      {showCreate ? (
        <form onSubmit={handleCreate} className="mb-6 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <h3 className="mb-4 text-lg font-semibold text-slate-800">Create Notification</h3>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="md:col-span-2">
              <label className="mb-1 block text-sm font-medium text-slate-700">Title *</label>
              <input
                required
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm focus:border-[#FF7A00] focus:outline-none"
                placeholder="Notification title"
              />
            </div>
            <div className="md:col-span-2">
              <label className="mb-1 block text-sm font-medium text-slate-700">Message *</label>
              <textarea
                required
                rows={3}
                value={form.message}
                onChange={(e) => setForm({ ...form, message: e.target.value })}
                className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm focus:border-[#FF7A00] focus:outline-none"
                placeholder="Notification message"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Type</label>
              <select
                value={form.notification_type}
                onChange={(e) => setForm({ ...form, notification_type: e.target.value })}
                className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm focus:border-[#FF7A00] focus:outline-none"
              >
                <option value="info">Info</option>
                <option value="warning">Warning</option>
                <option value="error">Error</option>
                <option value="announcement">Announcement</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Priority</label>
              <select
                value={form.priority}
                onChange={(e) => setForm({ ...form, priority: e.target.value })}
                className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm focus:border-[#FF7A00] focus:outline-none"
              >
                <option value="low">Low</option>
                <option value="normal">Normal</option>
                <option value="high">High</option>
                <option value="critical">Critical</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Target Org ID (optional)</label>
              <input
                value={form.target_org_id}
                onChange={(e) => setForm({ ...form, target_org_id: e.target.value })}
                className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm focus:border-[#FF7A00] focus:outline-none"
                placeholder="Leave empty for all"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Target User ID (optional)</label>
              <input
                value={form.target_user_id}
                onChange={(e) => setForm({ ...form, target_user_id: e.target.value })}
                className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm focus:border-[#FF7A00] focus:outline-none"
                placeholder="Leave empty for all"
              />
            </div>
          </div>
          <div className="mt-4 flex gap-2">
            <button type="submit" className="rounded-xl bg-[#FF7A00] px-6 py-2.5 text-sm font-medium text-white hover:bg-orange-600 transition">Send</button>
            <button type="button" onClick={() => setShowCreate(false)} className="rounded-xl border border-slate-200 px-6 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-50 transition">Cancel</button>
          </div>
        </form>
      ) : null}

      <div className="rounded-3xl border border-slate-200 bg-white shadow-sm">
        {loading ? (
          <div className="flex items-center justify-center py-20 text-slate-400">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-[#FF7A00] border-t-transparent" />
          </div>
        ) : notifications.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-slate-400">
            <Bell className="mb-3 h-12 w-12" />
            <p className="text-lg font-medium">No notifications</p>
            <p className="text-sm">Create a notification to get started</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {notifications.map((n) => (
              <div key={n.id} className={`flex items-start gap-4 px-6 py-4 transition hover:bg-slate-50 ${!n.is_read ? "bg-[#FF7A00]/[0.02]" : ""}`}>
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100">
                  {priorityIcon(n.priority)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className={`text-sm font-semibold ${!n.is_read ? "text-slate-900" : "text-slate-600"}`}>{n.title}</span>
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500">{n.notification_type}</span>
                    <span className={`rounded-full px-2 py-0.5 text-xs ${
                      n.priority === "critical" ? "bg-red-100 text-red-700" :
                      n.priority === "high" ? "bg-orange-100 text-orange-700" :
                      "bg-blue-100 text-blue-700"
                    }`}>{n.priority}</span>
                  </div>
                  <p className="mt-1 text-sm text-slate-500 line-clamp-2">{n.message}</p>
                  <p className="mt-1 text-xs text-slate-400">{new Date(n.created_at).toLocaleString()}</p>
                </div>
                <div className="flex gap-1">
                  {!n.is_read ? (
                    <button onClick={() => handleMarkRead(n.id)} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-[#FF7A00] transition" title="Mark as read">
                      <MailOpen className="h-4 w-4" />
                    </button>
                  ) : (
                    <span className="rounded-lg p-2 text-slate-300"><Mail className="h-4 w-4" /></span>
                  )}
                  <button onClick={() => handleDelete(n.id)} className="rounded-lg p-2 text-slate-400 hover:bg-red-50 hover:text-red-500 transition" title="Delete">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {totalPages > 1 ? (
        <div className="mt-4 flex items-center justify-between text-sm text-slate-500">
          <span>Page {page} of {totalPages}</span>
          <div className="flex gap-2">
            <button disabled={page <= 1} onClick={() => setPage(page - 1)} className="flex items-center gap-1 rounded-xl border border-slate-200 px-3 py-1.5 text-sm disabled:opacity-40 hover:bg-slate-50 transition">
              <ChevronLeft className="h-4 w-4" /> Prev
            </button>
            <button disabled={page >= totalPages} onClick={() => setPage(page + 1)} className="flex items-center gap-1 rounded-xl border border-slate-200 px-3 py-1.5 text-sm disabled:opacity-40 hover:bg-slate-50 transition">
              Next <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}