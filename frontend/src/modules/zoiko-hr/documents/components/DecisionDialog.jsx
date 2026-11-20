import { useEffect, useId, useRef, useState } from "react";
import { Loader2, X } from "lucide-react";
import { REJECT_REASONS } from "../constants";
import { isValid, validateReject } from "../validation";

const COPY = {
  approve: { title: "Approve", button: "Approve", tone: "bg-emerald-600 hover:bg-emerald-700" },
  reject: { title: "Reject", button: "Reject", tone: "bg-rose-600 hover:bg-rose-700" },
  reupload: { title: "Request a new copy", button: "Request new copy", tone: "bg-blue-600 hover:bg-blue-700" },
};

/**
 * Approve (optional remark), reject or request a new copy (reason + note required) — docs/new_docs/ZHR-DOCS-ARCH-001
 * §17 A4. The person is told the reason exactly as written here.
 *
 * @param {{ open: boolean, mode: 'approve'|'reject'|'reupload', item: { title:string, employee?: {name:string} } | null,
 *           onSubmit: (v: { remark?:string, reasonCode?:string, note?:string }) => Promise<any>, onClose: () => void }} props
 */
export default function DecisionDialog({ open, mode, item, onSubmit, onClose }) {
  const titleId = useId();
  const [reasonCode, setReasonCode] = useState("");
  const [note, setNote] = useState("");
  const [errors, setErrors] = useState({});
  const [serverError, setServerError] = useState(null);
  const [busy, setBusy] = useState(false);
  const first = useRef(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    if (!open) return undefined;
    setReasonCode(""); setNote(""); setErrors({}); setServerError(null); setBusy(false);
    const back = document.activeElement;
    first.current?.focus();
    const onKey = (e) => { if (e.key === "Escape") closeRef.current?.(); };
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("keydown", onKey); back?.focus?.(); };
  }, [open]);

  if (!open || !item) return null;
  const copy = COPY[mode] || COPY.approve;
  const needsReason = mode !== "approve";

  const submit = async (e) => {
    e.preventDefault();
    const found = needsReason ? validateReject({ reasonCode, note }) : {};
    setErrors(found);
    if (!isValid(found)) return;
    setBusy(true);
    setServerError(null);
    try {
      await onSubmit(needsReason ? { reasonCode, note: note.trim() } : { remark: note.trim() || undefined });
      closeRef.current?.();
    } catch (err) {
      setServerError(err?.message || "That didn't work. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <form role="dialog" aria-modal="true" aria-labelledby={titleId} onSubmit={submit} noValidate onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-2xl border border-gray-200/80 bg-white p-6 shadow-xl dark:border-[#334155] dark:bg-[#1e293b]">
        <div className="mb-3 flex items-start justify-between gap-3">
          <h2 id={titleId} className="text-lg font-semibold text-slate-900 dark:text-[#f1f5f9]">{copy.title}: {item.title}</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-lg p-1 text-slate-500 hover:bg-slate-100">
            <X size={18} aria-hidden="true" />
          </button>
        </div>
        {item.employee?.name && <p className="mb-3 text-sm text-slate-600">{item.employee.name}</p>}

        {needsReason && (
          <div className="mb-3">
            <label className="block text-sm font-medium text-slate-700" htmlFor={`${titleId}-reason`}>Reason</label>
            <select id={`${titleId}-reason`} ref={first} value={reasonCode} onChange={(e) => setReasonCode(e.target.value)}
              aria-invalid={Boolean(errors.reasonCode)}
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-[#334155] dark:bg-[#0f172a]">
              <option value="">Choose a reason…</option>
              {REJECT_REASONS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
            </select>
            {errors.reasonCode && <p role="alert" className="mt-1 text-xs font-medium text-rose-700">{errors.reasonCode}</p>}
          </div>
        )}
        <label className="block text-sm font-medium text-slate-700" htmlFor={`${titleId}-note`}>
          {needsReason ? "What needs to change" : "Remark (optional)"}
        </label>
        <textarea id={`${titleId}-note`} ref={needsReason ? undefined : first} rows={3} value={note} onChange={(e) => setNote(e.target.value)}
          aria-invalid={Boolean(errors.note)} maxLength={2000}
          className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-[#334155] dark:bg-[#0f172a]" />
        {errors.note && <p role="alert" className="mt-1 text-xs font-medium text-rose-700">{errors.note}</p>}
        {needsReason && <p className="mt-1 text-xs text-slate-500">The employee sees this reason.</p>}
        {serverError && <p role="alert" className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-800">{serverError}</p>}

        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">Cancel</button>
          <button type="submit" disabled={busy}
            className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold text-white disabled:opacity-60 ${copy.tone}`}>
            {busy && <Loader2 size={16} className="animate-spin" aria-hidden="true" />} {copy.button}
          </button>
        </div>
      </form>
    </div>
  );
}
