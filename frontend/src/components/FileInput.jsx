/*
 * The one file picker for forms: a visible "Browse" button and the chosen file's name (and size), instead of the browser's
 * bare "Choose File / No file chosen" control, which looks different in every browser and ignores the app's styles.
 *
 * The real <input type="file"> stays in the page (visually hidden, still focusable), so a <label htmlFor={id}>, keyboard
 * use (Tab, then Space/Enter opens the picker), screen readers and tests that fire "change" on it all keep working. The
 * forwarded ref points at that input (dialogs focus it when they open).
 *
 * Controlled: pass the chosen `file` (or null) and get the new one from onChange(file | null, event). When `file` becomes
 * null the input is emptied too, so the same file can be chosen again.
 */
import { forwardRef, useEffect, useId, useImperativeHandle, useRef } from "react";
import { UploadCloud, X } from "lucide-react";

export function fileSizeLabel(bytes) {
  const n = Number(bytes);
  if (!Number.isFinite(n) || n < 0) return "";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

const FileInput = forwardRef(function FileInput({
  id, accept, file = null, onChange, disabled = false, invalid = false, placeholder = "No file chosen", buttonLabel = "Browse",
  ariaLabel, describedBy, name, showSize = true, size = "md", className = "",
}, ref) {
  const autoId = useId();
  const inputId = id || `file-${autoId}`;
  const input = useRef(null);
  useImperativeHandle(ref, () => input.current);

  useEffect(() => {
    if (!file && input.current) input.current.value = "";
  }, [file]);

  const clear = () => {
    if (input.current) input.current.value = "";
    onChange?.(null);
  };
  const small = size === "sm";
  const sizeText = file && showSize ? fileSizeLabel(file.size) : "";
  return (
    <div className={`relative min-w-0 ${className}`} data-file-input="">
      <input ref={input} id={inputId} type="file" name={name} accept={accept} disabled={disabled}
        aria-invalid={invalid || undefined} aria-describedby={describedBy} aria-label={ariaLabel}
        onChange={(e) => onChange?.(e.target.files?.[0] || null, e)} className="peer sr-only" />
      <label htmlFor={inputId}
        className={`flex min-w-0 items-center gap-3 rounded-xl border bg-white text-sm transition peer-focus-visible:border-blue-400 peer-focus-visible:ring-2 peer-focus-visible:ring-blue-100 dark:bg-[#0f172a] ${small ? "px-2 py-1.5" : "px-3 py-2"} ${file && !disabled ? "pr-10" : ""} ${invalid ? "border-rose-300" : "border-gray-200 hover:border-blue-300 dark:border-[#334155]"} ${disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer"}`}>
        <span aria-hidden="true"
          className={`inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-blue-50 font-semibold text-blue-700 ring-1 ring-inset ring-blue-100 dark:bg-blue-500/10 dark:text-blue-300 ${small ? "px-2.5 py-1 text-xs" : "px-3 py-1.5 text-xs"}`}>
          <UploadCloud className="h-4 w-4" />{buttonLabel}
        </span>
        <span className={`min-w-0 flex-1 truncate ${small ? "text-xs" : "text-sm"} ${file ? "font-medium text-gray-900 dark:text-[#f1f5f9]" : "text-gray-500 dark:text-[#94a3b8]"}`}
          title={file?.name || undefined} data-testid="file-input-name">
          {file ? file.name : placeholder}
        </span>
        {sizeText && <span className="shrink-0 text-xs text-gray-400">{sizeText}</span>}
      </label>
      {file && !disabled && (
        <button type="button" onClick={clear} aria-label={`Remove ${file.name}`}
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-rose-600 focus:outline-none focus:ring-2 focus:ring-blue-200">
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      )}
    </div>
  );
});

export default FileInput;
