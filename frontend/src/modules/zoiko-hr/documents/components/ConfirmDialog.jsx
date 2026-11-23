import { useEffect, useRef, useState } from "react";

/**
 * A small "are you sure?" dialog. `onConfirm` may return a promise: the dialog stays open while it runs and shows the
 * server's message if it fails (e.g. "“Forms” still has 2 files. Move or remove them first."), so nothing fails silently.
 *
 * @param {{ open: boolean, title: string, message?: React.ReactNode, confirmLabel?: string, danger?: boolean,
 *           onConfirm: () => (void|Promise<unknown>), onClose: () => void }} props
 */
export default function ConfirmDialog({ open, title, message, confirmLabel = "Confirm", danger = false, onConfirm, onClose }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const cancelRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    setError(null);
    setBusy(false);
    cancelRef.current?.focus();
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;
  const confirm = async () => {
    setBusy(true);
    setError(null);
    try {
      await onConfirm();
      onClose();
    } catch (e) {
      setError(e?.message || "That didn't work. Please try again.");
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <section role="alertdialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl dark:bg-[#1e293b]">
        <h2 className="text-base font-semibold text-slate-900 dark:text-white">{title}</h2>
        {message && <div className="mt-2 text-sm text-slate-600 dark:text-slate-300">{message}</div>}
        {error && <p role="alert" className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}
        <div className="mt-5 flex justify-end gap-2">
          <button ref={cancelRef} type="button" onClick={onClose}
            className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-[#334155] dark:text-slate-200">
            Cancel
          </button>
          <button type="button" onClick={confirm} disabled={busy}
            className={`rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:opacity-60 ${danger ? "bg-rose-600 hover:bg-rose-700" : "bg-blue-600 hover:bg-blue-700"}`}>
            {busy ? "Working…" : confirmLabel}
          </button>
        </div>
      </section>
    </div>
  );
}
