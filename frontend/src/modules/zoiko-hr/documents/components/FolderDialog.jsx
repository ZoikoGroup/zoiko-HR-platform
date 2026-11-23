import { useEffect, useRef, useState } from "react";

export const FOLDER_NAME_MAX = 100;
const BAD = /[/\\:*?"<>|]/;

/** Same rules as the server (hr/service.py _clean_folder_name), so most mistakes are caught before sending. */
export function folderNameProblem(raw) {
  const name = (raw || "").split(/\s+/).filter(Boolean).join(" ");
  if (!name) return "Give the folder a name.";
  if (name.length > FOLDER_NAME_MAX) return `A folder name can be at most ${FOLDER_NAME_MAX} characters.`;
  if (BAD.test(name)) return 'A folder name cannot contain / \\ : * ? " < > |';
  return null;
}

/**
 * Create or rename a company-document folder. `onSubmit(name)` returns a promise; a server refusal (for example a
 * folder with that name already exists here) is shown under the field and the dialog stays open.
 *
 * @param {{ open: boolean, mode: 'create'|'rename', initialName?: string, placeName?: string,
 *           onSubmit: (name: string) => Promise<unknown>, onClose: () => void }} props
 */
export default function FolderDialog({ open, mode = "create", initialName = "", placeName = "", onSubmit, onClose }) {
  const [name, setName] = useState(initialName);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    setName(initialName);
    setError(null);
    setBusy(false);
    setTimeout(() => inputRef.current?.select(), 0);
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, initialName, onClose]);

  if (!open) return null;
  const title = mode === "rename" ? `Rename folder ${initialName}` : `New folder in ${placeName || "this category"}`;
  const submit = async (e) => {
    e.preventDefault();
    const problem = folderNameProblem(name);
    if (problem) { setError(problem); return; }
    setBusy(true);
    setError(null);
    try {
      await onSubmit(name.split(/\s+/).filter(Boolean).join(" "));
      onClose();
    } catch (err) {
      setError(err?.message || "That didn't work. Please try again.");
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <form role="dialog" aria-modal="true" aria-label={title} onSubmit={submit} onClick={(e) => e.stopPropagation()} noValidate
        className="w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl dark:bg-[#1e293b]">
        <h2 className="text-base font-semibold text-slate-900 dark:text-white">{title}</h2>
        <label htmlFor="folder-name" className="mt-4 block text-sm font-medium text-slate-700 dark:text-slate-200">Folder name</label>
        <input id="folder-name" ref={inputRef} value={name} onChange={(e) => { setName(e.target.value); setError(null); }}
          maxLength={FOLDER_NAME_MAX + 20} aria-invalid={Boolean(error)} aria-describedby={error ? "folder-name-error" : "folder-name-hint"}
          className={`mt-1 w-full rounded-lg border px-3 py-2 text-sm ${error ? "border-rose-400" : "border-gray-200"}`} />
        {error
          ? <p id="folder-name-error" role="alert" className="mt-1 text-xs text-rose-700">{error}</p>
          : <p id="folder-name-hint" className="mt-1 text-xs text-slate-500">Up to {FOLDER_NAME_MAX} characters. Not allowed: / \ : * ? " &lt; &gt; |</p>}
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onClose}
            className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-[#334155] dark:text-slate-200">
            Cancel
          </button>
          <button type="submit" disabled={busy} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60">
            {busy ? "Saving…" : mode === "rename" ? "Rename" : "Create folder"}
          </button>
        </div>
      </form>
    </div>
  );
}
