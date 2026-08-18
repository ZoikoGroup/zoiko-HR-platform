import { useRef } from "react";
import { Send, Paperclip, X, Loader2, FileText } from "lucide-react";

const ACCEPTED = ".pdf,.txt,.doc,.docx,.png,.jpg,.jpeg";

export default function Composer({
  value, onChange, onSubmit, disabled, placeholder,
  pendingAttachment, attachmentUploading, onAttachFile, onClearAttachment,
}) {
  const fileInputRef = useRef(null);

  return (
    <div className="shrink-0">
      {(pendingAttachment || attachmentUploading) && (
        <div className="mb-1.5 flex items-center gap-1.5 rounded-full border border-[var(--zhr-border-default)] bg-[var(--zhr-surface-panel)] px-3 py-1 text-[11px] font-semibold text-[var(--zhr-text-secondary)] w-fit max-w-full">
          {attachmentUploading ? (
            <><Loader2 className="h-3 w-3 shrink-0 animate-spin" /> Uploading...</>
          ) : (
            <>
              <FileText className="h-3 w-3 shrink-0" />
              <span className="truncate">{pendingAttachment.file_name}</span>
              <button type="button" onClick={onClearAttachment} aria-label="Remove attachment" className="shrink-0 text-[var(--zhr-text-muted)] hover:text-[var(--zhr-text-secondary)]">
                <X className="h-3 w-3" />
              </button>
            </>
          )}
        </div>
      )}
      <form onSubmit={(e) => { e.preventDefault(); onSubmit(); }} className="relative">
        <input
          ref={fileInputRef}
          type="file"
          accept={ACCEPTED}
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) onAttachFile?.(file);
            e.target.value = "";
          }}
        />
        <input
          type="text"
          placeholder={placeholder || "Ask about HR..."}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          style={{ minHeight: "var(--zhr-control-min-target)" }}
          className="w-full rounded-full border border-[var(--zhr-border-default)] bg-[var(--zhr-surface-panel)] py-3 pl-11 pr-14 text-sm text-[var(--zhr-text-primary)] outline-none focus:bg-[var(--zhr-surface-canvas)] focus:border-[var(--zhr-border-focus)] disabled:opacity-60"
        />
        {onAttachFile && (
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={disabled || attachmentUploading}
            aria-label="Attach a file"
            style={{ width: "var(--zhr-control-min-target)", height: "var(--zhr-control-min-target)" }}
            className="absolute left-0.5 top-1/2 -translate-y-1/2 flex items-center justify-center rounded-full text-[var(--zhr-text-muted)] hover:text-[var(--zhr-action-primary)] disabled:opacity-50"
          >
            <Paperclip className="h-4 w-4" />
          </button>
        )}
        <button
          type="submit"
          disabled={disabled || !value.trim()}
          aria-label="Send message"
          style={{ width: "var(--zhr-control-min-target)", height: "var(--zhr-control-min-target)" }}
          className="absolute right-1.5 top-1/2 -translate-y-1/2 flex items-center justify-center rounded-full bg-[var(--zhr-action-primary)] hover:bg-[var(--zhr-action-primary-hover)] text-white shadow-sm transition disabled:opacity-50"
        >
          <Send className="h-4 w-4" />
        </button>
      </form>
    </div>
  );
}
