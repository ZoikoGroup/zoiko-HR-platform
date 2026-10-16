import { useEffect, useRef, useState } from "react";
import { MoreHorizontal, History, Plus, LifeBuoy, Ticket, Download, Trash2 } from "lucide-react";

export default function AssistantMenu({ onOpenHistory, onNewConversation, onSupportRequest, onMyTickets, onExportData, onDeleteData }) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef(null);
  const buttonRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onClickOutside = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", onClickOutside);
    requestAnimationFrame(() => menuRef.current?.querySelector('[role="menuitem"]')?.focus());
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [open]);

  const items = [
    { label: "History", icon: History, onClick: onOpenHistory },
    { label: "New conversation", icon: Plus, onClick: onNewConversation },
    { label: "Support request", icon: LifeBuoy, onClick: onSupportRequest },
    { label: "My tickets", icon: Ticket, onClick: onMyTickets },
    ...(onExportData ? [{ label: "Export my data", icon: Download, onClick: onExportData }] : []),
    ...(onDeleteData ? [{ label: "Delete my data", icon: Trash2, onClick: onDeleteData, destructive: true }] : []),
  ];

  // Escape closes the menu first and stops there, so the panel's own Escape
  // handler (close assistant) only fires on the next press. Arrow keys move
  // between items.
  const onKeyDown = (e) => {
    if (!open) return;
    if (e.key === "Escape") {
      e.stopPropagation();
      setOpen(false);
      buttonRef.current?.focus();
      return;
    }
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    e.preventDefault();
    const menuItems = Array.from(menuRef.current?.querySelectorAll('[role="menuitem"]') ?? []);
    const index = menuItems.indexOf(document.activeElement);
    const next = e.key === "ArrowDown" ? (index + 1) % menuItems.length : (index - 1 + menuItems.length) % menuItems.length;
    menuItems[next]?.focus();
  };

  return (
    <div className="relative" ref={menuRef} onKeyDown={onKeyDown}>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="More options"
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex h-10 w-10 items-center justify-center rounded-full border border-[var(--zhr-chat-border)] text-[var(--zhr-chat-navy)] hover:bg-[var(--zhr-chat-surface-alt)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--zhr-chat-blue)]"
      >
        <MoreHorizontal className="h-5 w-5" />
      </button>
      {open && (
        <div
          role="menu"
          aria-label="Assistant options"
          className="absolute right-0 z-30 mt-1 w-52 rounded-xl border border-[var(--zhr-border-default)] bg-[var(--zhr-surface-overlay)] p-1.5 shadow-[var(--zhr-elevation-panel)]"
        >
          {items.map(({ label, icon: Icon, onClick, destructive }) => (
            <button
              key={label}
              role="menuitem"
              type="button"
              onClick={() => { setOpen(false); onClick?.(); }}
              className={`flex min-h-[40px] w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs font-semibold hover:bg-[var(--zhr-surface-panel)] focus-visible:bg-[var(--zhr-surface-panel)] focus-visible:outline-none ${
                destructive ? "text-red-600" : "text-[var(--zhr-text-primary)]"
              }`}
            >
              <Icon className={`h-4 w-4 ${destructive ? "text-red-500" : "text-[var(--zhr-text-secondary)]"}`} />
              {label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
