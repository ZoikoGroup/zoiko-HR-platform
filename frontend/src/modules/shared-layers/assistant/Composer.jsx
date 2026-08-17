import { Send } from "lucide-react";

export default function Composer({ value, onChange, onSubmit, disabled, placeholder }) {
  return (
    <form
      onSubmit={(e) => { e.preventDefault(); onSubmit(); }}
      className="relative shrink-0"
    >
      <input
        type="text"
        placeholder={placeholder || "Ask about HR..."}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        style={{ minHeight: "var(--zhr-control-min-target)" }}
        className="w-full rounded-full border border-[var(--zhr-border-default)] bg-[var(--zhr-surface-panel)] py-3 pl-5 pr-14 text-sm text-[var(--zhr-text-primary)] outline-none focus:bg-[var(--zhr-surface-canvas)] focus:border-[var(--zhr-border-focus)] disabled:opacity-60"
      />
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
  );
}
