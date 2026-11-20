import { useEffect, useId, useRef, useState } from "react";
import { AlertTriangle, Loader2, UploadCloud, X } from "lucide-react";
import { validateUpload, isValid } from "../validation";
import { EMPLOYEE_UPLOAD_EXTENSIONS, MAX_UPLOAD_BYTES } from "../constants";

/**
 * Upload one document into a category (docs/new_docs/ZHR-DOCS-ARCH-001 §17 D2). Used for a first upload, a re-upload
 * after a rejection and a renewed copy (`replacesDocumentId`). Validates in the browser for fast feedback; the server
 * repeats every check and its pre-check messages (corrupt file, wrong contents, password-protected PDF) are shown as-is.
 *
 * Accessibility: a labelled modal dialog, focus starts on the file picker and returns to the opener, Escape closes.
 *
 * @param {{ open: boolean, category: { id:number, name:string, requires_expiry?:boolean } | null, replacesDocumentId?: number,
 *           replacingTitle?: string, onSubmit: (v: { categoryId:number, file:File, title?:string, expiryDate?:string,
 *           replacesDocumentId?:number }) => Promise<any>, onClose: () => void }} props
 */
export default function UploadDialog({ open, category, replacesDocumentId, replacingTitle, onSubmit, onClose }) {
  const titleId = useId();
  const fileId = useId();
  const expiryId = useId();
  const [file, setFile] = useState(null);
  const [expiryDate, setExpiryDate] = useState("");
  const [idNumber, setIdNumber] = useState("");
  const idNumberId = useId();
  const [errors, setErrors] = useState({});
  const [serverError, setServerError] = useState(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef(null);
  const returnFocus = useRef(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  // Runs when the dialog opens or closes only (not on every parent render, which would clear the chosen file).
  useEffect(() => {
    if (!open) return undefined;
    setFile(null); setExpiryDate(""); setIdNumber(""); setErrors({}); setServerError(null); setBusy(false);
    returnFocus.current = document.activeElement;
    fileRef.current?.focus();
    const onKey = (e) => { if (e.key === "Escape") closeRef.current?.(); };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      returnFocus.current?.focus?.();
    };
  }, [open]);

  if (!open || !category) return null;

  const submit = async (e) => {
    e.preventDefault();
    const found = validateUpload({ file, requiresExpiry: Boolean(category.requires_expiry), expiryDate });
    setErrors(found);
    setServerError(null);
    if (!isValid(found)) return;
    setBusy(true);
    try {
      await onSubmit({ categoryId: category.id, file, expiryDate: expiryDate || undefined, replacesDocumentId,
                       ...(idNumber.trim() ? { idNumber: idNumber.trim() } : {}) });
      onClose?.();
    } catch (err) {
      const failed = (err?.checks || []).filter((c) => c.status === "fail").map((c) => c.message);
      setServerError({ message: err?.message || "The upload failed.", details: failed.length > 1 ? failed : [] });
      if (err?.field === "expiry_date") setErrors((prev) => ({ ...prev, expiryDate: err.message }));
    } finally {
      setBusy(false);
    }
  };

  const heading = replacesDocumentId ? `Upload a new copy of ${replacingTitle || category.name}` : `Upload ${category.name}`;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <form role="dialog" aria-modal="true" aria-labelledby={titleId} onSubmit={submit} noValidate
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg rounded-2xl border border-gray-200/80 bg-white p-6 shadow-xl dark:border-[#334155] dark:bg-[#1e293b]">
        <div className="mb-4 flex items-start justify-between gap-3">
          <h2 id={titleId} className="text-lg font-semibold text-slate-900 dark:text-[#f1f5f9]">{heading}</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-lg p-1 text-slate-500 hover:bg-slate-100">
            <X size={18} aria-hidden="true" />
          </button>
        </div>

        <label htmlFor={fileId} className="block text-sm font-medium text-slate-700 dark:text-[#cbd5e1]">File</label>
        <div className="mt-1 flex items-center gap-3 rounded-xl border border-dashed border-slate-300 p-4 dark:border-[#475569]">
          <UploadCloud size={22} className="text-blue-600" aria-hidden="true" />
          <input id={fileId} ref={fileRef} type="file" accept={EMPLOYEE_UPLOAD_EXTENSIONS.join(",")}
            aria-invalid={Boolean(errors.file)} aria-describedby={`${fileId}-hint`}
            onChange={(e) => setFile(e.target.files?.[0] || null)} className="text-sm" />
        </div>
        <p id={`${fileId}-hint`} className="mt-1 text-xs text-slate-500">
          PDF, image, Word or Excel, up to {MAX_UPLOAD_BYTES / (1024 * 1024)} MB.
        </p>
        {errors.file && <p className="mt-1 text-xs font-medium text-rose-700" role="alert">{errors.file}</p>}

        {(category.requires_expiry || replacesDocumentId) && (
          <div className="mt-4">
            <label htmlFor={expiryId} className="block text-sm font-medium text-slate-700 dark:text-[#cbd5e1]">
              Expiry date{category.requires_expiry ? "" : " (optional)"}
            </label>
            <input id={expiryId} type="date" value={expiryDate} onChange={(e) => setExpiryDate(e.target.value)}
              aria-invalid={Boolean(errors.expiryDate)}
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-[#334155] dark:bg-[#0f172a]" />
            {errors.expiryDate && <p className="mt-1 text-xs font-medium text-rose-700" role="alert">{errors.expiryDate}</p>}
          </div>
        )}

        {category.id_number_field && (
          <div className="mt-4">
            <label htmlFor={idNumberId} className="block text-sm font-medium text-slate-700 dark:text-[#cbd5e1]">
              {category.id_number_label || "Document number"} (optional)
            </label>
            <input id={idNumberId} type="text" autoComplete="off" maxLength={40} value={idNumber} onChange={(e) => setIdNumber(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-[#334155] dark:bg-[#0f172a]" />
            <p className="mt-1 text-xs text-slate-500">Helps HR check the document. Only the last four characters are kept.</p>
          </div>
        )}

        {serverError && (
          <div role="alert" className="mt-4 flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">
            <AlertTriangle size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
            <div>
              <p>{serverError.message}</p>
              {serverError.details.length > 0 && (
                <ul className="mt-1 list-disc pl-4">{serverError.details.map((d) => <li key={d}>{d}</li>)}</ul>
              )}
            </div>
          </div>
        )}

        <p className="mt-4 text-xs text-slate-500">HR reviews every upload. You'll be notified when it is approved.</p>
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onClose}
            className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">Cancel</button>
          <button type="submit" disabled={busy}
            className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60">
            {busy && <Loader2 size={16} className="animate-spin" aria-hidden="true" />} Upload
          </button>
        </div>
      </form>
    </div>
  );
}
