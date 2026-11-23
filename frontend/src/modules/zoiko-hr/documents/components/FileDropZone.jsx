import { useId, useRef, useState } from "react";
import { UploadCloud } from "lucide-react";

/**
 * Drag-and-drop area with a "browse" fallback. Keyboard users get the real file input (focusable, Enter/Space opens it).
 * `onFiles` receives an array of File objects, whether dropped or chosen.
 *
 * @param {{ label: string, multiple?: boolean, accept?: string[], hint?: string, disabled?: boolean,
 *           onFiles: (files: File[]) => void, inputRef?: React.Ref<HTMLInputElement> }} props
 */
export default function FileDropZone({ label, multiple = false, accept = [], hint, disabled = false, onFiles, inputRef }) {
  const id = useId();
  const own = useRef(null);
  const input = inputRef || own;
  const [over, setOver] = useState(false);

  const take = (list) => {
    const files = Array.from(list || []);
    if (files.length) onFiles(multiple ? files : files.slice(0, 1));
  };

  return (
    <div
      data-testid="drop-zone"
      onDragOver={(e) => { e.preventDefault(); if (!disabled) setOver(true); }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => { e.preventDefault(); setOver(false); if (!disabled) take(e.dataTransfer?.files); }}
      className={`mt-1 flex flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed px-4 py-6 text-center text-sm transition-colors ${
        over ? "border-blue-500 bg-blue-50 dark:bg-blue-900/20" : "border-slate-300 bg-slate-50/60 dark:border-[#334155] dark:bg-[#0f172a]"
      } ${disabled ? "opacity-60" : ""}`}>
      <UploadCloud size={26} className={over ? "text-blue-600" : "text-slate-400"} aria-hidden="true" />
      <p className="text-slate-700 dark:text-slate-200">
        {over ? "Drop to add" : multiple ? "Drag files here, or " : "Drag a file here, or "}
        {!over && (
          <label htmlFor={id} className="cursor-pointer font-semibold text-blue-700 underline focus-within:outline focus-within:outline-2 focus-within:outline-blue-600">
            browse
          </label>
        )}
      </p>
      {hint && <p className="text-xs text-slate-500">{hint}</p>}
      <input id={id} ref={input} type="file" aria-label={label} multiple={multiple} accept={accept.join(",")} disabled={disabled}
        onChange={(e) => { take(e.target.files); e.target.value = ""; }}
        className="sr-only focus:not-sr-only" />
    </div>
  );
}
