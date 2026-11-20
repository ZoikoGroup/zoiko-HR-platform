import { useEffect, useId, useRef, useState } from "react";
import { Loader2, X } from "lucide-react";

/**
 * Send a reminder to upload missing documents (docs/new_docs/ZHR-DOCS-ARCH-001 §17 A2). One reminder per person per
 * 24 hours: the server refuses a second one and its message is shown as-is.
 *
 * @param {{ open: boolean, who: string, what?: string, onSubmit: (v: { message?: string }) => Promise<any>, onClose: () => void }} props
 */
export default function ReminderDialog({ open, who, what, onSubmit, onClose }) {
  const titleId = useId();
  const [message, setMessage] = useState("");
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const first = useRef(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    if (!open) return undefined;
    setMessage(""); setError(null); setBusy(false);
    const back = document.activeElement;
    first.current?.focus();
    const onKey = (e) => { if (e.key === "Escape") closeRef.current?.(); };
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("keydown", onKey); back?.focus?.(); };
  }, [open]);

  if (!open) return null;
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await onSubmit({ message: message.trim() || undefined });
      closeRef.current?.();
    } catch (err) {
      setError(err?.message || "The reminder could not be sent.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <form role="dialog" aria-modal="true" aria-labelledby={titleId} onSubmit={submit} onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-2xl border border-gray-200/80 bg-white p-6 shadow-xl dark:border-[#334155] dark:bg-[#1e293b]">
        <div className="mb-3 flex items-start justify-between gap-3">
          <h2 id={titleId} className="text-lg font-semibold text-slate-900 dark:text-[#f1f5f9]">Send a reminder to {who}</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-lg p-1 text-slate-500 hover:bg-slate-100"><X size={18} aria-hidden="true" /></button>
        </div>
        <p className="mb-3 text-sm text-slate-600">{what || "They will be asked to upload every required document that is missing or needs a new copy."}</p>
        <label htmlFor={`${titleId}-msg`} className="block text-sm font-medium text-slate-700">Note (optional)</label>
        <textarea id={`${titleId}-msg`} ref={first} rows={3} maxLength={500} value={message} onChange={(e) => setMessage(e.target.value)}
          className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-[#334155] dark:bg-[#0f172a]" />
        {error && <p role="alert" className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-800">{error}</p>}
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">Cancel</button>
          <button type="submit" disabled={busy} className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60">
            {busy && <Loader2 size={16} className="animate-spin" aria-hidden="true" />} Send reminder
          </button>
        </div>
      </form>
    </div>
  );
}
