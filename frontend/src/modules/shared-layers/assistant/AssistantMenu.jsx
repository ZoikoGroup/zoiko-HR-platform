import { useEffect, useRef, useState } from "react";
import { MoreVertical, History, Plus, LifeBuoy } from "lucide-react";

export default function AssistantMenu({ onOpenHistory, onNewConversation, onSupportRequest }) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onClickOutside = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setOpen(false);
    };
    const onEscape = (e) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onClickOutside);
    document.addEventListener("keydown", onEscape);
    return () => {
      document.removeEventListener("mousedown", onClickOutside);
      document.removeEventListener("keydown", onEscape);
    };
  }, [open]);

  const items = [
    { label: "History", icon: History, onClick: onOpenHistory },
    { label: "New conversation", icon: Plus, onClick: onNewConversation },
    { label: "Support request", icon: LifeBuoy, onClick: onSupportRequest },
  ];

  return (
    <div className="relative" ref={menuRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Assistant options"
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex h-8 w-8 items-center justify-center rounded-lg text-[var(--zhr-text-secondary)] hover:bg-[var(--zhr-surface-panel)]"
      >
        <MoreVertical className="h-4.5 w-4.5" />
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 z-30 mt-1 w-48 rounded-xl border border-[var(--zhr-border-default)] bg-[var(--zhr-surface-overlay)] p-1.5 shadow-[var(--zhr-elevation-panel)]"
        >
          {items.map(({ label, icon: Icon, onClick }) => (
            <button
              key={label}
              role="menuitem"
              type="button"
              onClick={() => { setOpen(false); onClick?.(); }}
              className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs font-semibold text-[var(--zhr-text-primary)] hover:bg-[var(--zhr-surface-panel)]"
            >
              <Icon className="h-4 w-4 text-[var(--zhr-text-secondary)]" />
              {label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
