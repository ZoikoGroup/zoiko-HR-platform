import { useState, useEffect, useCallback, useRef } from "react";
import PageHeader from "../../components/PageHeader";
import OrgPicker from "../../components/OrgPicker";
import NotificationDetailDialog from "../../components/notifications/NotificationDetailDialog";
import {
  Bell, Mail, MailOpen, Check, Trash2, Send, ChevronLeft, ChevronRight, Info, AlertTriangle, AlertCircle, X,
} from "lucide-react";
import { superAdminService } from "../../service/superAdminService";
import { formatDateTimeWithZone, formatUtc } from "../../utils/dateTime";

const ROLE_OPTIONS = [
  { value: "admin", label: "Organization Admin" },
  { value: "hr_admin", label: "HR Admin" },
  { value: "billing_admin", label: "Billing Admin" },
  { value: "manager", label: "Manager" },
  { value: "employee", label: "Employee" },
];

const EMPTY_FORM = {
  title: "", message: "", notification_type: "info", priority: "normal",
  target_type: "all", audience: "org_admins", user_ids: "", roles: [],
};

const fieldCls = "w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm focus:border-[#3B82F6] focus:outline-none";
const looksLikeHtml = (text) => /<[a-z][\s\S]*>/i.test(text);

export default function NotificationCenter() {
  const [notifications, setNotifications] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [actionError, setActionError] = useState(null);
  const [filter, setFilter] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [orgs, setOrgs] = useState([]); // [{id, name}]
  const [pickerKey, setPickerKey] = useState(0);
  const [sending, setSending] = useState(false);
  const [formError, setFormError] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const sendInFlight = useRef(false);

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
    setActionError(null);
    try {
      await superAdminService.markNotificationRead(id);
      load();
    } catch (e) { setActionError(e.message || "Could not mark the notification as read."); }
  };

  const handleDelete = async (id) => {
    if (!confirm("Delete this notification? It will also disappear from recipients' inboxes.")) return;
    setActionError(null);
    try {
      await superAdminService.deleteNotification(id);
      load();
    } catch (e) { setActionError(e.message || "Could not delete the notification."); }
  };

  const buildPayload = () => {
    const payload = {
      title: form.title.trim(),
      notification_type: form.notification_type,
      priority: form.priority,
      target_type: form.target_type,
    };
    if (looksLikeHtml(form.message)) payload.body_html = form.message;
    else payload.message = form.message;
    if (form.target_type === "organization") {
      payload.target_org_ids = orgs.map((o) => o.id);
      payload.audience = form.audience;
    }
    if (form.target_type === "user") {
      payload.target_user_ids = form.user_ids.split(/[\s,]+/).filter(Boolean).map(Number).filter((n) => Number.isInteger(n) && n > 0);
    }
    if (form.target_type === "role") payload.target_roles = form.roles;
    return payload;
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    if (sendInFlight.current) return;
    setFormError(null);
    if (form.target_type === "organization" && orgs.length === 0) { setFormError("Select at least one organization."); return; }
    if (form.target_type === "user" && buildPayload().target_user_ids.length === 0) { setFormError("Enter at least one valid user ID."); return; }
    if (form.target_type === "role" && form.roles.length === 0) { setFormError("Select at least one role."); return; }
    sendInFlight.current = true;
    setSending(true);
    try {
      await superAdminService.createNotification(buildPayload());
      setShowCreate(false);
      setForm(EMPTY_FORM);
      setOrgs([]);
      setPage(1);
      load();
    } catch (err) {
      setFormError(err.message || "Could not send the notification.");
    } finally {
      sendInFlight.current = false;
      setSending(false);
    }
  };

  const priorityIcon = (p) => {
    if (p === "critical") return <AlertCircle className="h-4 w-4 text-red-500" />;
    if (p === "high") return <AlertTriangle className="h-4 w-4 text-orange-500" />;
    return <Info className="h-4 w-4 text-blue-500" />;
  };

  const toggleRole = (value) =>
    setForm((f) => ({ ...f, roles: f.roles.includes(value) ? f.roles.filter((r) => r !== value) : [...f.roles, value] }));

  const totalPages = Math.ceil(total / pageSize);

  return (
    <div>
      <PageHeader
        title="Notification Center"
        description="Send and manage platform-wide notifications"
        icon={Bell}
      />

      {error && (
        <div role="alert" className="mb-4 flex items-center gap-3 rounded-3xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          <AlertTriangle className="h-5 w-5 flex-shrink-0" />
          <span>{error}</span>
          <button onClick={load} className="ml-auto text-xs font-semibold text-red-600 underline hover:text-red-800">Retry</button>
        </div>
      )}
      {actionError && (
        <div role="alert" className="mb-4 flex items-center gap-3 rounded-3xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          <AlertTriangle className="h-5 w-5 flex-shrink-0" />
          <span>{actionError}</span>
          <button onClick={() => setActionError(null)} className="ml-auto text-xs font-semibold underline">Dismiss</button>
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
                  ? "border-[#3B82F6] bg-[#3B82F6]/5 text-[#3B82F6]"
                  : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
              }`}
            >
              {f === "" ? "All" : f === "read" ? "Read" : "Unread"}
            </button>
          ))}
        </div>
        <button
          onClick={() => setShowCreate(!showCreate)}
          className="inline-flex items-center gap-2 rounded-xl bg-[#3B82F6] px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 transition"
        >
          <Send className="h-4 w-4" /> New Notification
        </button>
      </div>

      {showCreate ? (
        <form onSubmit={handleCreate} className="mb-6 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <h3 className="mb-4 text-lg font-semibold text-slate-800">Create Notification</h3>
          {formError && (
            <div role="alert" className="mb-4 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> {formError}
            </div>
          )}
          <div className="grid gap-4 md:grid-cols-2">
            <div className="md:col-span-2">
              <label className="mb-1 block text-sm font-medium text-slate-700" htmlFor="nc-title">Title *</label>
              <input id="nc-title" required value={form.title} maxLength={300}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                className={fieldCls} placeholder="Notification title" />
            </div>
            <div className="md:col-span-2">
              <label className="mb-1 block text-sm font-medium text-slate-700" htmlFor="nc-message">Message * <span className="font-normal text-slate-400">(plain text or simple HTML)</span></label>
              <textarea id="nc-message" required rows={4} value={form.message}
                onChange={(e) => setForm({ ...form, message: e.target.value })}
                className={fieldCls} placeholder="Notification message" />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700" htmlFor="nc-type">Type</label>
              <select id="nc-type" value={form.notification_type}
                onChange={(e) => setForm({ ...form, notification_type: e.target.value })} className={fieldCls}>
                <option value="info">Info</option>
                <option value="warning">Warning</option>
                <option value="error">Error</option>
                <option value="announcement">Announcement</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700" htmlFor="nc-priority">Priority</label>
              <select id="nc-priority" value={form.priority}
                onChange={(e) => setForm({ ...form, priority: e.target.value })} className={fieldCls}>
                <option value="low">Low</option>
                <option value="normal">Normal</option>
                <option value="high">High</option>
                <option value="critical">Critical</option>
              </select>
            </div>

            <div className="md:col-span-2">
              <label className="mb-1 block text-sm font-medium text-slate-700" htmlFor="nc-target">Send to</label>
              <select id="nc-target" value={form.target_type}
                onChange={(e) => setForm({ ...form, target_type: e.target.value })} className={fieldCls}>
                <option value="all">Everyone (all organizations and users)</option>
                <option value="organization">Specific organizations</option>
                <option value="user">Specific users</option>
                <option value="role">A role across all organizations</option>
              </select>
            </div>

            {form.target_type === "organization" && (
              <>
                <div className="md:col-span-2">
                  <label className="mb-1 block text-sm font-medium text-slate-700">Organizations *</label>
                  <OrgPicker
                    key={pickerKey}
                    selectedOrg={null}
                    onSelect={(o) => {
                      if (o && !orgs.some((x) => x.id === o.id)) setOrgs([...orgs, { id: o.id, name: o.name }]);
                      setPickerKey((k) => k + 1);
                    }}
                    placeholder="Search and add organizations..."
                  />
                  {orgs.length > 0 && (
                    <ul className="mt-2 flex flex-wrap gap-2">
                      {orgs.map((o) => (
                        <li key={o.id} className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-3 py-1 text-xs font-medium text-blue-700">
                          {o.name}
                          <button type="button" aria-label={`Remove ${o.name}`} onClick={() => setOrgs(orgs.filter((x) => x.id !== o.id))}>
                            <X className="h-3 w-3" />
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                <div className="md:col-span-2">
                  <label className="mb-1 block text-sm font-medium text-slate-700" htmlFor="nc-audience">Who in those organizations</label>
                  <select id="nc-audience" value={form.audience}
                    onChange={(e) => setForm({ ...form, audience: e.target.value })} className={fieldCls}>
                    <option value="org_admins">Organization admins only</option>
                    <option value="all_members">All members</option>
                  </select>
                </div>
              </>
            )}

            {form.target_type === "user" && (
              <div className="md:col-span-2">
                <label className="mb-1 block text-sm font-medium text-slate-700" htmlFor="nc-users">User IDs * <span className="font-normal text-slate-400">(comma separated)</span></label>
                <input id="nc-users" value={form.user_ids}
                  onChange={(e) => setForm({ ...form, user_ids: e.target.value })}
                  className={fieldCls} placeholder="e.g. 42, 57" />
              </div>
            )}

            {form.target_type === "role" && (
              <fieldset className="md:col-span-2">
                <legend className="mb-1 block text-sm font-medium text-slate-700">Roles *</legend>
                <div className="flex flex-wrap gap-3">
                  {ROLE_OPTIONS.map((r) => (
                    <label key={r.value} className="inline-flex items-center gap-2 text-sm text-slate-700">
                      <input type="checkbox" checked={form.roles.includes(r.value)} onChange={() => toggleRole(r.value)} />
                      {r.label}
                    </label>
                  ))}
                </div>
              </fieldset>
            )}
          </div>
          <div className="mt-4 flex gap-2">
            <button type="submit" disabled={sending}
              className="rounded-xl bg-[#3B82F6] px-6 py-2.5 text-sm font-medium text-white transition hover:bg-blue-700 disabled:opacity-50">
              {sending ? "Sending..." : "Send"}
            </button>
            <button type="button" disabled={sending} onClick={() => setShowCreate(false)}
              className="rounded-xl border border-slate-200 px-6 py-2.5 text-sm font-medium text-slate-600 transition hover:bg-slate-50 disabled:opacity-50">Cancel</button>
          </div>
        </form>
      ) : null}

      <div className="rounded-3xl border border-slate-200 bg-white shadow-sm">
        {loading ? (
          <div className="flex items-center justify-center py-20 text-slate-400">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-[#3B82F6] border-t-transparent" />
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
              <div key={n.id} className={`flex items-start gap-4 px-6 py-4 transition hover:bg-slate-50 ${!n.is_read ? "bg-[#3B82F6]/[0.02]" : ""}`}>
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100">
                  {priorityIcon(n.priority)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`text-sm font-semibold ${!n.is_read ? "text-slate-900" : "text-slate-600"}`}>{n.title}</span>
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500">{n.notification_type}</span>
                    <span className={`rounded-full px-2 py-0.5 text-xs ${
                      n.priority === "critical" ? "bg-red-100 text-red-700" :
                      n.priority === "high" ? "bg-orange-100 text-orange-700" :
                      "bg-blue-100 text-blue-700"
                    }`}>{n.priority}</span>
                  </div>
                  <p className="mt-1 text-sm text-slate-500 line-clamp-2">
                    {n.content_available === false ? "Content not available for this notification" : n.message}
                  </p>
                  <p className="mt-1 text-xs text-slate-400">
                    {n.target_summary && <span>To: {n.target_summary} · </span>}
                    <time dateTime={n.sent_at || n.created_at} title={formatUtc(n.sent_at || n.created_at)}>
                      {formatDateTimeWithZone(n.sent_at || n.created_at)}
                    </time>
                  </p>
                </div>
                <div className="flex gap-1">
                  {/* ZHR-19: a real, labelled, keyboard-operable button that opens the full content. */}
                  <button
                    type="button"
                    onClick={() => setSelectedId(n.id)}
                    aria-label={`View notification: ${n.title}`}
                    title="View notification"
                    className="rounded-lg p-2 text-slate-400 transition hover:bg-slate-100 hover:text-[#3B82F6] focus:outline-none focus:ring-2 focus:ring-[#3B82F6]"
                  >
                    {n.is_read ? <Mail className="h-4 w-4" /> : <MailOpen className="h-4 w-4" />}
                  </button>
                  {!n.is_read && (
                    <button type="button" onClick={() => handleMarkRead(n.id)} aria-label={`Mark as read: ${n.title}`} title="Mark as read"
                      className="rounded-lg p-2 text-slate-400 transition hover:bg-slate-100 hover:text-emerald-600 focus:outline-none focus:ring-2 focus:ring-[#3B82F6]">
                      <Check className="h-4 w-4" />
                    </button>
                  )}
                  <button type="button" onClick={() => handleDelete(n.id)} aria-label={`Delete notification: ${n.title}`} title="Delete"
                    className="rounded-lg p-2 text-slate-400 transition hover:bg-red-50 hover:text-red-500 focus:outline-none focus:ring-2 focus:ring-red-400">
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

      {selectedId !== null && (
        <NotificationDetailDialog
          key={selectedId}
          isAdmin
          load={() => superAdminService.getNotification(selectedId)}
          onClose={() => setSelectedId(null)}
        />
      )}
    </div>
  );
}
