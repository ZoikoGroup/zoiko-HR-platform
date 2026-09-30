/**
 * components/notifications/NotificationContent.jsx
 * ------------------------------------------------
 * The one notification detail body, shared by the Super Admin Notification
 * Center (isAdmin) and the Organization / User inbox. Admin-only sections
 * (audience, channels, recipient stats) render only when isAdmin is true.
 *
 * The body HTML is ALWAYS passed through sanitizeHtml() before it reaches the
 * DOM.
 */
import { AlertTriangle, Info, AlertCircle } from "lucide-react";
import { formatDateTimeWithZone, formatUtc } from "../../utils/dateTime";
import { relativeTime } from "../../utils/notificationFormat";
import { sanitizeHtml } from "../../utils/sanitizeHtml";

const CONTENT_UNAVAILABLE = "Content not available for this notification";

const PRIORITY_TONES = {
  critical: "bg-red-100 text-red-700",
  high: "bg-orange-100 text-orange-700",
  normal: "bg-blue-100 text-blue-700",
  low: "bg-slate-100 text-slate-600",
};

function PriorityIcon({ priority }) {
  if (priority === "critical") return <AlertCircle className="h-4 w-4 text-red-500" aria-hidden="true" />;
  if (priority === "high") return <AlertTriangle className="h-4 w-4 text-orange-500" aria-hidden="true" />;
  return <Info className="h-4 w-4 text-blue-500" aria-hidden="true" />;
}

function Row({ name, children }) {
  return (
    <div className="grid grid-cols-3 gap-3 border-b border-slate-100 py-2 text-sm">
      <dt className="font-semibold text-slate-500">{name}</dt>
      <dd className="col-span-2 min-w-0 break-words text-slate-800">{children}</dd>
    </div>
  );
}

export default function NotificationContent({ notification, isAdmin = false, loading = false, error = null, onRetry }) {
  if (loading) {
    return (
      <div role="status" aria-label="Loading notification" className="space-y-3 py-6">
        <div className="h-5 w-2/3 animate-pulse rounded bg-slate-200" />
        <div className="h-3 w-1/3 animate-pulse rounded bg-slate-100" />
        <div className="h-24 animate-pulse rounded bg-slate-100" />
      </div>
    );
  }

  if (error) {
    return (
      <div role="alert" className="flex items-center gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
        <AlertTriangle className="h-5 w-5 shrink-0" />
        <span className="min-w-0 flex-1">{error}</span>
        {onRetry && <button onClick={onRetry} className="shrink-0 text-xs font-semibold underline">Retry</button>}
      </div>
    );
  }

  if (!notification) return null;

  const n = notification;
  const sent = n.sent_at || n.created_at;
  const unavailable = n.content_available === false;
  const html = unavailable ? "" : sanitizeHtml(n.body_html || "");

  return (
    <article className="space-y-4">
      <header>
        <div className="flex flex-wrap items-center gap-2">
          <PriorityIcon priority={n.priority} />
          <h3 className="text-lg font-bold text-slate-900">{n.title}</h3>
          {n.notification_type && (
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500">{n.notification_type}</span>
          )}
          {n.priority && n.priority !== "normal" && (
            <span className={`rounded-full px-2 py-0.5 text-xs ${PRIORITY_TONES[n.priority] || PRIORITY_TONES.normal}`}>{n.priority}</span>
          )}
        </div>
        <p className="mt-1 text-xs text-slate-500">
          From <strong>{n.sender_name || "Zoiko HR Admin"}</strong>
          {sent && (
            <>
              {" · "}
              <time dateTime={sent} title={formatUtc(sent)}>{formatDateTimeWithZone(sent)}</time>
              {" · "}{relativeTime(sent)}
            </>
          )}
        </p>
      </header>

      {unavailable ? (
        <p className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-500">
          {n.content_unavailable_message || CONTENT_UNAVAILABLE}
        </p>
      ) : (
        <div
          data-testid="notification-body"
          className="prose prose-sm max-w-none break-words text-sm text-slate-800 [&_a]:text-blue-600 [&_a]:underline"
          // Safe: html comes from sanitizeHtml() above (DOMPurify allow-list).
          dangerouslySetInnerHTML={{ __html: html }}
        />
      )}

      {isAdmin && (
        <section aria-label="Delivery details" className="rounded-xl border border-slate-200 bg-slate-50/60 p-4">
          <h4 className="mb-1 text-xs font-bold uppercase tracking-wider text-slate-500">Audience &amp; delivery</h4>
          <dl>
            <Row name="Sent to">{n.target_summary || "—"}</Row>
            {Array.isArray(n.targets) && n.targets.length > 0 && (
              <Row name="Targets">
                <ul className="list-disc pl-4">
                  {n.targets.map((t) => <li key={`${t.kind}-${t.ref}`}>{t.label}</li>)}
                </ul>
              </Row>
            )}
            <Row name="Channels">{(n.channels || ["in_app"]).map((c) => c.replace(/_/g, "-")).join(", ")}</Row>
            <Row name="Time (UTC)">{sent ? formatUtc(sent) : "—"}</Row>
            {n.stats && (
              <>
                <Row name="Recipients">{n.stats.recipient_count}</Row>
                <Row name="Read">{n.stats.read_count} of {n.stats.recipient_count}</Row>
                <Row name="Unread">{n.stats.unread_count}</Row>
              </>
            )}
          </dl>
        </section>
      )}
    </article>
  );
}
