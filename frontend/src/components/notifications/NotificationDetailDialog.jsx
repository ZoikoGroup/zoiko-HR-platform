/**
 * components/notifications/NotificationDetailDialog.jsx
 * -----------------------------------------------------
 * Modal wrapper around NotificationContent. It owns the load / error / retry
 * state, so a caller only supplies `load` (an async fn returning the detail).
 * Used by the Super Admin Notification Center (isAdmin) and by the bell + inbox
 * page for recipients.
 *
 * Accessible: role="dialog", Escape closes, focus moves in on open and returns
 * to the element that opened it on close.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import NotificationContent from "./NotificationContent";

export default function NotificationDetailDialog({ load, isAdmin = false, onClose, onLoaded }) {
  const [notification, setNotification] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const closeRef = useRef(null);
  const openerRef = useRef(typeof document !== "undefined" ? document.activeElement : null);

  const run = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const detail = await load();
      setNotification(detail);
      onLoaded?.(detail);
    } catch (e) {
      setError(e?.message || "Failed to load this notification.");
    } finally {
      setLoading(false);
    }
    // `load` identity is owned by the caller; reload only on explicit retry.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { run(); }, [run]);

  useEffect(() => {
    closeRef.current?.focus();
    const opener = openerRef.current;
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      if (opener && typeof opener.focus === "function") opener.focus();
    };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Notification details"
        className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-2 flex justify-end">
          <button ref={closeRef} onClick={onClose} aria-label="Close notification"
            className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500">
            <X className="h-5 w-5" />
          </button>
        </div>
        <NotificationContent
          notification={notification}
          isAdmin={isAdmin}
          loading={loading}
          error={error}
          onRetry={run}
        />
      </div>
    </div>
  );
}
