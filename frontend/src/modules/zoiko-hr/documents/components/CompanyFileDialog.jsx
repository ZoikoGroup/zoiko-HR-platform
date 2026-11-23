import { useEffect, useId, useRef, useState } from "react";
import { CheckCircle2, FileText, Loader2, RotateCcw, Trash2, X, XCircle } from "lucide-react";
import { isValid, validateUpload } from "../validation";
import FileDropZone from "./FileDropZone";

export const COMPANY_EXTENSIONS = [".pdf", ".jpg", ".jpeg", ".png", ".doc", ".docx", ".xls", ".xlsx", ".csv", ".txt", ".rtf", ".ppt", ".pptx", ".odt", ".ods", ".odp"];
export const MAX_BATCH_FILES = 20;

const stem = (name) => { const i = name.lastIndexOf("."); return (i > 0 ? name.slice(0, i) : name).slice(0, 255); };
const sizeText = (b) => (b >= 1024 * 1024 ? `${(b / (1024 * 1024)).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);
let seq = 0;

/**
 * Upload company documents, or a new version of one (docs/new_docs/ZHR-DOCS-ARCH-001 §17 A3). Same dialog for every
 * company category.
 * New files: drag-and-drop or browse, up to 20 files of up to 10 MB each. Each file gets its own title (defaults to the
 *   file name) and its own result; the expiry, read confirmation, publish time and notify choice apply to all of them.
 *   Files are sent one by one through the normal upload route, so the server checks every file exactly as for a single
 *   upload. Failed files can be retried; "Stop" leaves the rest unsent.
 * New version: one file, change notes and whether it is a material change (people re-confirm) or a minor one.
 *
 * `onSubmit(values)` uploads one file and returns a promise. `onFinished({ uploaded: string[], failed: string[] })` is
 * called when the dialog closes after at least one upload.
 *
 * @param {{ open: boolean, mode: 'new'|'version', category?: { id:number, name:string, default_require_ack?:boolean, requires_approval?:boolean },
 *           document?: { id:number, title:string }, folderId?: number, existingTitles?: string[],
 *           onSubmit: (v: object) => Promise<any>, onFinished?: (r: {uploaded: string[], failed: string[]}) => void, onClose: () => void }} props
 */
export default function CompanyFileDialog({ open, mode, category, document: doc, folderId, existingTitles = [], onSubmit, onFinished, onClose }) {
  const titleId = useId();
  const [items, setItems] = useState([]);          // { key, file, title, error?, state: 'ready'|'invalid'|'uploading'|'done'|'failed', message? }
  const [dropNote, setDropNote] = useState(null);
  const [expiryDate, setExpiryDate] = useState("");
  const [requireAck, setRequireAck] = useState(false);
  const [publishAt, setPublishAt] = useState("");
  const [notify, setNotify] = useState(true);
  const [notifyTouched, setNotifyTouched] = useState(false);
  const [changeNotes, setChangeNotes] = useState("");
  const [material, setMaterial] = useState(true);
  const [errors, setErrors] = useState({});
  const [serverError, setServerError] = useState(null);
  const [busy, setBusy] = useState(false);
  const stopRef = useRef(false);
  const resultRef = useRef({ uploaded: [], failed: [] });
  const first = useRef(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const busyRef = useRef(false);
  busyRef.current = busy;

  const isVersion = mode === "version";

  const finish = () => {
    if (busyRef.current) return;          // never close mid-upload; use Stop first
    const r = resultRef.current;
    if (r.uploaded.length || r.failed.length) onFinished?.({ uploaded: [...r.uploaded], failed: [...r.failed] });
    closeRef.current?.();
  };
  const finishRef = useRef(finish);
  finishRef.current = finish;

  useEffect(() => {
    if (!open) return undefined;
    setItems([]); setDropNote(null); setExpiryDate(""); setPublishAt(""); setChangeNotes(""); setMaterial(true);
    setNotify(true); setNotifyTouched(false);
    setRequireAck(Boolean(category?.default_require_ack)); setErrors({}); setServerError(null); setBusy(false);
    stopRef.current = false;
    resultRef.current = { uploaded: [], failed: [] };
    const back = document.activeElement;
    first.current?.focus();
    const onKey = (e) => { if (e.key === "Escape") finishRef.current(); };
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("keydown", onKey); back?.focus?.(); };
  }, [open, category?.default_require_ack]);

  if (!open) return null;

  const addFiles = (files) => {
    setErrors((e) => ({ ...e, file: undefined }));
    setServerError(null);
    const base = isVersion ? [] : items.filter((p) => p.state !== "done");
    const names = new Set(base.map((p) => `${p.file.name}|${p.file.size}`));
    const room = isVersion ? 1 : MAX_BATCH_FILES - base.length;
    const fresh = [];
    let skippedDup = 0;
    for (const file of files) {
      const id = `${file.name}|${file.size}`;
      if (names.has(id)) { skippedDup += 1; continue; }
      names.add(id);
      fresh.push(file);
    }
    const kept = fresh.slice(0, Math.max(0, room));
    const left = fresh.length - kept.length;
    const notes = [];
    if (left > 0) notes.push(`Only ${MAX_BATCH_FILES} files can be uploaded at a time; ${left} ${left === 1 ? "was" : "were"} left out.`);
    if (skippedDup > 0) notes.push(`${skippedDup} ${skippedDup === 1 ? "file was" : "files were"} already in the list.`);
    setDropNote(notes.length ? notes.join(" ") : null);
    const next = [...base, ...kept.map((file) => {
      const err = validateUpload({ file, allowedExtensions: COMPANY_EXTENSIONS }).file;
      return { key: ++seq, file, title: stem(file.name), state: err ? "invalid" : "ready", error: err };
    })];
    if (!notifyTouched) setNotify(next.length <= 1);
    setItems(next);
  };
  const removeItem = (key) => setItems((prev) => prev.filter((p) => p.key !== key));
  const setTitle = (key, title) => setItems((prev) => prev.map((p) => (p.key === key ? { ...p, title } : p)));
  const patch = (key, values) => setItems((prev) => prev.map((p) => (p.key === key ? { ...p, ...values } : p)));

  const sendable = items.filter((p) => p.state === "ready" || p.state === "failed");
  const many = !isVersion && items.length > 1;
  const taken = new Set(existingTitles.map((t) => t.trim().toLowerCase()));

  const submit = async (e) => {
    e.preventDefault();
    const found = validateUpload({ file: items[0]?.file || null, expiryDate, allowedExtensions: COMPANY_EXTENSIONS });
    if (items.length) delete found.file;
    if (!items.length) found.file = isVersion ? "Choose a file to upload." : "Choose at least one file to upload.";
    else if (items.some((p) => p.state === "invalid")) found.file = "Some files can't be uploaded (marked in red). Remove them to continue.";
    setErrors(found);
    if (!isValid(found) || !sendable.length) return;
    setBusy(true);
    setServerError(null);
    stopRef.current = false;
    const queue = [...sendable];
    let lastError = null;
    for (const item of queue) {
      if (stopRef.current) break;
      patch(item.key, { state: "uploading", message: undefined });
      const title = (item.title || "").trim() || item.file.name;
      try {
        await onSubmit(isVersion
          ? { documentId: doc.id, file: item.file, changeNotes: changeNotes.trim() || undefined, expiryDate: expiryDate || undefined, materialChange: material }
          : { categoryId: category.id, file: item.file, title: (item.title || "").trim() || undefined, folderId, expiryDate: expiryDate || undefined,
              requireAck, publishAt: publishAt ? new Date(publishAt).toISOString() : undefined, notify });   // local time -> UTC
        patch(item.key, { state: "done" });
        resultRef.current.uploaded.push(title);
        resultRef.current.failed = resultRef.current.failed.filter((t) => t !== title);
      } catch (err) {
        lastError = err?.message || "The upload failed.";
        patch(item.key, { state: "failed", message: lastError });
        if (!resultRef.current.failed.includes(title)) resultRef.current.failed.push(title);
      }
    }
    setBusy(false);
    busyRef.current = false;
    if (!stopRef.current && !lastError) {
      finishRef.current();
    } else if (!many && lastError) {
      setServerError(lastError);
    }
  };

  const total = items.filter((p) => p.state !== "invalid").length;
  const done = items.filter((p) => p.state === "done").length;
  const failedCount = items.filter((p) => p.state === "failed").length;
  const started = done > 0 || failedCount > 0 || busy;
  const field = "mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-[#334155] dark:bg-[#0f172a]";
  const submitLabel = isVersion ? "Upload" : failedCount && !items.some((p) => p.state === "ready")
    ? `Retry ${failedCount} failed` : sendable.length > 1 ? `Upload ${sendable.length} files` : "Upload";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={finish}>
      <form role="dialog" aria-modal="true" aria-labelledby={titleId} onSubmit={submit} onClick={(e) => e.stopPropagation()} noValidate
        className="flex max-h-[92vh] w-full max-w-2xl flex-col rounded-2xl border border-gray-200/80 bg-white p-6 shadow-xl dark:border-[#334155] dark:bg-[#1e293b]">
        <div className="mb-4 flex items-start justify-between gap-3">
          <h2 id={titleId} className="text-lg font-semibold text-slate-900 dark:text-[#f1f5f9]">
            {isVersion ? `New version of ${doc?.title}` : `Upload to ${category?.name}`}
          </h2>
          <button type="button" onClick={finish} disabled={busy} aria-label="Close" className="rounded-lg p-1 text-slate-500 hover:bg-slate-100 disabled:opacity-40"><X size={18} aria-hidden="true" /></button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto pr-1">
          <FileDropZone label={isVersion ? "File" : "Files"} multiple={!isVersion} accept={COMPANY_EXTENSIONS} disabled={busy} inputRef={first}
            hint={isVersion ? "One file, up to 10 MB." : `Up to ${MAX_BATCH_FILES} files, 10 MB each. PDF, Word, Excel, PowerPoint, images, text.`}
            onFiles={addFiles} />
          {errors.file && <p role="alert" className="mt-1 text-xs text-rose-700">{errors.file}</p>}
          {dropNote && <p className="mt-1 text-xs text-amber-800">{dropNote}</p>}

          {items.length > 0 && (
            <ul aria-label="Files to upload" className="mt-3 divide-y divide-slate-100 rounded-xl border border-slate-200 dark:divide-[#334155] dark:border-[#334155]">
              {items.map((p) => (
                <li key={p.key} className="flex items-start gap-3 px-3 py-2">
                  <ItemIcon state={p.state} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs text-slate-500">{p.file.name} · {sizeText(p.file.size)}</p>
                    {many && p.state !== "invalid" && (
                      <input aria-label={`Title for ${p.file.name}`} value={p.title} maxLength={255} disabled={busy || p.state === "done"}
                        onChange={(e) => setTitle(p.key, e.target.value)} className="mt-1 w-full rounded-md border border-slate-200 px-2 py-1 text-sm dark:border-[#334155] dark:bg-[#0f172a]" />
                    )}
                    {p.error && <p className="mt-0.5 text-xs text-rose-700">{p.error}</p>}
                    {p.state === "failed" && <p className="mt-0.5 text-xs text-rose-700">{p.message}</p>}
                    {p.state === "done" && <p className="mt-0.5 text-xs text-emerald-700">Uploaded</p>}
                    {!isVersion && p.state === "ready" && taken.has((p.title || "").trim().toLowerCase()) && (
                      <p className="mt-0.5 text-xs text-amber-800">A file with this title is already here. This adds a separate file; use New version to replace it.</p>
                    )}
                  </div>
                  {!busy && p.state !== "done" && (
                    <button type="button" onClick={() => removeItem(p.key)} aria-label={`Remove ${p.file.name} from the list`}
                      className="rounded p-1 text-slate-500 hover:bg-slate-100"><Trash2 size={14} aria-hidden="true" /></button>
                  )}
                </li>
              ))}
            </ul>
          )}

          {started && many && (
            <div className="mt-3">
              <progress aria-label="Upload progress" max={total || 1} value={done} className="h-2 w-full overflow-hidden rounded accent-blue-600" />
              <p role="status" className="mt-1 text-xs text-slate-600">
                {done} of {total} uploaded{failedCount ? ` · ${failedCount} failed` : ""}{busy ? "…" : ""}
              </p>
            </div>
          )}

          {!isVersion && !many && (
            <>
              <label className="mt-3 block text-sm font-medium text-slate-700" htmlFor={`${titleId}-title`}>Title</label>
              <input id={`${titleId}-title`} value={items[0]?.title || ""} maxLength={255} disabled={!items[0] || busy}
                onChange={(e) => items[0] && setTitle(items[0].key, e.target.value)} className={field}
                placeholder={items[0] ? undefined : "Add a file first"} />
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
          {many && <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-slate-500">These settings apply to all {items.length} files</p>}
          <label className="mt-3 block text-sm font-medium text-slate-700" htmlFor={`${titleId}-expiry`}>Expiry date (optional)</label>
          <input id={`${titleId}-expiry`} type="date" value={expiryDate} disabled={busy} onChange={(e) => setExpiryDate(e.target.value)} className={field} />
          {errors.expiryDate && <p role="alert" className="mt-1 text-xs text-rose-700">{errors.expiryDate}</p>}
          {!isVersion && (
            <>
              <label className="mt-3 flex items-center gap-2 text-sm">
                <input type="checkbox" checked={requireAck} disabled={busy} onChange={(e) => setRequireAck(e.target.checked)} /> People must confirm “I have read this”
              </label>
              <label className="mt-3 block text-sm font-medium text-slate-700" htmlFor={`${titleId}-publish`}>Publish at (optional — leave empty to publish now)</label>
              <input id={`${titleId}-publish`} type="datetime-local" value={publishAt} disabled={busy} onChange={(e) => setPublishAt(e.target.value)} className={field} />
              <label className="mt-3 flex items-start gap-2 text-sm">
                <input type="checkbox" checked={notify} disabled={busy} onChange={(e) => { setNotify(e.target.checked); setNotifyTouched(true); }} className="mt-0.5" />
                <span>
                  Notify the people who can see {many ? "these files" : "it"} when {many ? "they are" : "it is"} published
                  {many && <span className="block text-xs text-slate-500">Off by default for several files: each file would send its own notification.</span>}
                </span>
              </label>
            </>
          )}
          {category?.requires_approval && <p className="mt-3 text-xs text-amber-800">This category needs approval: files appear to employees once another approver approves them.</p>}
          {serverError && <p role="alert" className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-800">{serverError}</p>}
        </div>
        <div className="mt-5 flex flex-wrap justify-end gap-2">
          {busy && many
            ? <button type="button" onClick={() => { stopRef.current = true; }} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">Stop after this file</button>
            : <button type="button" onClick={finish} disabled={busy} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50">{done ? "Close" : "Cancel"}</button>}
          <button type="submit" disabled={busy}
            className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60">
            {busy ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : failedCount && !items.some((p) => p.state === "ready") ? <RotateCcw size={16} aria-hidden="true" /> : null}
            {submitLabel}
          </button>
        </div>
      </form>
    </div>
  );
}

function ItemIcon({ state }) {
  if (state === "uploading") return <Loader2 size={18} className="mt-0.5 shrink-0 animate-spin text-blue-600" aria-label="Uploading" />;
  if (state === "done") return <CheckCircle2 size={18} className="mt-0.5 shrink-0 text-emerald-600" aria-label="Uploaded" />;
  if (state === "failed" || state === "invalid") return <XCircle size={18} className="mt-0.5 shrink-0 text-rose-600" aria-label={state === "failed" ? "Failed" : "Cannot upload"} />;
  return <FileText size={18} className="mt-0.5 shrink-0 text-slate-400" aria-hidden="true" />;
}
