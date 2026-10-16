import { useLayoutEffect, useRef } from "react";
import { Send, Paperclip, X, Loader2, FileText } from "lucide-react";

const ACCEPTED = ".pdf,.txt,.doc,.docx,.png,.jpg,.jpeg";
const MAX_LINES_HEIGHT = 120; // 5 lines × 24px (wireframe CH-07: 1–5 line auto-expanding)

const FOCUS_RING =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--zhr-chat-blue)]";

/**
 * CH-07 persistent composer. `disabled` blocks typing entirely (no
 * conversation yet); `busy` only blocks sending, so the next question can be
 * drafted while an answer is still streaming.
 */
export default function Composer({
  value, onChange, onSubmit, disabled, busy = false, placeholder,
  pendingAttachment, attachmentUploading, onAttachFile, onClearAttachment,
}) {
  const fileInputRef = useRef(null);
  const textareaRef = useRef(null);
  const canSend = !disabled && !busy && value.trim().length > 0;

  useLayoutEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, MAX_LINES_HEIGHT)}px`;
  }, [value]);

  const send = () => {
    if (canSend) onSubmit();
  };

  return (
    <div className="shrink-0">
      {(pendingAttachment || attachmentUploading) && (
        <div className="mb-1.5 flex items-center gap-1.5 rounded-full border border-[var(--zhr-chat-border)] bg-[var(--zhr-chat-surface-alt)] px-3 py-1 text-[11px] font-semibold text-[var(--zhr-text-secondary)] w-fit max-w-full">
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
      <form onSubmit={(e) => { e.preventDefault(); send(); }}>
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
        <div className="flex items-end gap-1 rounded-[28px] border border-[var(--zhr-chat-border)] bg-white p-1.5 focus-within:border-[var(--zhr-chat-blue)] focus-within:ring-2 focus-within:ring-[var(--zhr-chat-blue)]/15">
          {onAttachFile ? (
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={disabled || attachmentUploading}
              aria-label="Attach a file"
              className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-[var(--zhr-text-muted)] hover:text-[var(--zhr-chat-blue)] disabled:opacity-50 ${FOCUS_RING}`}
            >
              <Paperclip className="h-5 w-5" />
            </button>
          ) : (
            <span className="w-3.5 shrink-0" />
          )}
          <label htmlFor="zhr-assistant-input" className="sr-only">{placeholder || "Ask about HR"}</label>
          <textarea
            id="zhr-assistant-input"
            ref={textareaRef}
            rows={1}
            placeholder={placeholder || "Ask about HR..."}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={(e) => {
              // Enter sends, Shift+Enter breaks a line; never send mid-IME composition.
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing && e.keyCode !== 229) {
                e.preventDefault();
                send();
              }
            }}
            disabled={disabled}
            className="max-h-[120px] min-h-[24px] flex-1 resize-none self-center bg-transparent py-2 text-[15px] leading-6 text-[var(--zhr-chat-navy)] outline-none placeholder:text-[var(--zhr-text-muted)] disabled:opacity-60"
          />
          <button
            type="submit"
            disabled={!canSend}
            aria-label={busy ? "Sending…" : "Send message"}
            className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[var(--zhr-chat-blue)] text-white transition-colors hover:bg-[var(--zhr-chat-blue-hover)] disabled:cursor-not-allowed disabled:opacity-40 ${FOCUS_RING}`}
          >
            {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}
          </button>
        </div>
      </form>
    </div>
  );
}
