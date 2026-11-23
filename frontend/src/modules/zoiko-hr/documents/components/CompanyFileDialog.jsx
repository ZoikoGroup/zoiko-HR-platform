import { useEffect, useId, useRef, useState } from "react";
import { Loader2, X } from "lucide-react";
import { isValid, validateUpload } from "../validation";
import FileInput from "../../../../components/FileInput";

const COMPANY_EXTENSIONS = [".pdf", ".jpg", ".jpeg", ".png", ".doc", ".docx", ".xls", ".xlsx", ".csv", ".txt", ".rtf", ".ppt", ".pptx", ".odt", ".ods", ".odp"];

/**
 * Upload a company document, or a new version of one (docs/new_docs/ZHR-DOCS-ARCH-001 §17 A3).
 * New file: title, expiry, "people must confirm they read it", publish now or later.
 * New version: change notes and whether it is a material change (people re-confirm) or a minor one.
 *
 * @param {{ open: boolean, mode: 'new'|'version', category?: { id:number, name:string, default_require_ack?:boolean, requires_approval?:boolean },
 *           document?: { id:number, title:string }, folderId?: number, onSubmit: (v: object) => Promise<any>, onClose: () => void }} props
 */
export default function CompanyFileDialog({ open, mode, category, document: doc, folderId, onSubmit, onClose }) {
  const titleId = useId();
  const [file, setFile] = useState(null);
  const [title, setTitle] = useState("");
  const [expiryDate, setExpiryDate] = useState("");
  const [requireAck, setRequireAck] = useState(false);
  const [publishAt, setPublishAt] = useState("");
  const [changeNotes, setChangeNotes] = useState("");
  const [material, setMaterial] = useState(true);
  const [errors, setErrors] = useState({});
  const [serverError, setServerError] = useState(null);
  const [busy, setBusy] = useState(false);
  const first = useRef(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    if (!open) return undefined;
    setFile(null); setTitle(""); setExpiryDate(""); setPublishAt(""); setChangeNotes(""); setMaterial(true);
    setRequireAck(Boolean(category?.default_require_ack)); setErrors({}); setServerError(null); setBusy(false);
    const back = document.activeElement;
    first.current?.focus();
    const onKey = (e) => { if (e.key === "Escape") closeRef.current?.(); };
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("keydown", onKey); back?.focus?.(); };
  }, [open, category?.default_require_ack]);

  if (!open) return null;
  const isVersion = mode === "version";

  const submit = async (e) => {
    e.preventDefault();
    const found = validateUpload({ file, expiryDate, allowedExtensions: COMPANY_EXTENSIONS });
    setErrors(found);
    if (!isValid(found)) return;
    setBusy(true);
    setServerError(null);
    try {
      await onSubmit(isVersion
        ? { documentId: doc.id, file, changeNotes: changeNotes.trim() || undefined, expiryDate: expiryDate || undefined, materialChange: material }
        : { categoryId: category.id, file, title: title.trim() || undefined, folderId, expiryDate: expiryDate || undefined,
            requireAck, publishAt: publishAt ? new Date(publishAt).toISOString() : undefined });   // local time -> UTC
      closeRef.current?.();
    } catch (err) {
      setServerError(err?.message || "The upload failed.");
    } finally {
      setBusy(false);
    }
  };

  const field = "mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-[#334155] dark:bg-[#0f172a]";
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <form role="dialog" aria-modal="true" aria-labelledby={titleId} onSubmit={submit} onClick={(e) => e.stopPropagation()} noValidate
        className="w-full max-w-lg rounded-2xl border border-gray-200/80 bg-white p-6 shadow-xl dark:border-[#334155] dark:bg-[#1e293b]">
        <div className="mb-4 flex items-start justify-between gap-3">
          <h2 id={titleId} className="text-lg font-semibold text-slate-900 dark:text-[#f1f5f9]">
            {isVersion ? `New version of ${doc?.title}` : `Upload to ${category?.name}`}
          </h2>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-lg p-1 text-slate-500 hover:bg-slate-100"><X size={18} aria-hidden="true" /></button>
        </div>
        <label className="block text-sm font-medium text-slate-700" htmlFor={`${titleId}-file`}>File</label>
        <FileInput id={`${titleId}-file`} ref={first} accept={COMPANY_EXTENSIONS.join(",")} file={file} onChange={setFile}
          invalid={Boolean(errors.file)} className="mt-1" />
        {errors.file && <p role="alert" className="mt-1 text-xs text-rose-700">{errors.file}</p>}
        {!isVersion && (
          <>
            <label className="mt-3 block text-sm font-medium text-slate-700" htmlFor={`${titleId}-title`}>Title</label>
            <input id={`${titleId}-title`} value={title} maxLength={255} onChange={(e) => setTitle(e.target.value)} className={field} />
          </>
        )}
        {isVersion && (
          <>
            <label className="mt-3 block text-sm font-medium text-slate-700" htmlFor={`${titleId}-notes`}>What changed</label>
            <textarea id={`${titleId}-notes`} rows={2} maxLength={2000} value={changeNotes} onChange={(e) => setChangeNotes(e.target.value)} className={field} />
            <label className="mt-3 flex items-start gap-2 text-sm">
              <input type="checkbox" checked={material} onChange={(e) => setMaterial(e.target.checked)} className="mt-0.5" />
              <span>Material change — people who confirmed reading the old version must confirm again</span>
            </label>
          </>
        )}
        <label className="mt-3 block text-sm font-medium text-slate-700" htmlFor={`${titleId}-expiry`}>Expiry date (optional)</label>
        <input id={`${titleId}-expiry`} type="date" value={expiryDate} onChange={(e) => setExpiryDate(e.target.value)} className={field} />
        {errors.expiryDate && <p role="alert" className="mt-1 text-xs text-rose-700">{errors.expiryDate}</p>}
        {!isVersion && (
          <>
            <label className="mt-3 flex items-center gap-2 text-sm">
              <input type="checkbox" checked={requireAck} onChange={(e) => setRequireAck(e.target.checked)} /> People must confirm “I have read this”
            </label>
            <label className="mt-3 block text-sm font-medium text-slate-700" htmlFor={`${titleId}-publish`}>Publish at (optional — leave empty to publish now)</label>
            <input id={`${titleId}-publish`} type="datetime-local" value={publishAt} onChange={(e) => setPublishAt(e.target.value)} className={field} />
          </>
        )}
        {category?.requires_approval && <p className="mt-3 text-xs text-amber-800">This category needs approval: the file appears to employees once another approver approves it.</p>}
        {serverError && <p role="alert" className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-800">{serverError}</p>}
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">Cancel</button>
          <button type="submit" disabled={busy} className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60">
            {busy && <Loader2 size={16} className="animate-spin" aria-hidden="true" />} Upload
          </button>
        </div>
      </form>
    </div>
  );
}
