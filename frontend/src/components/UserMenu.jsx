import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronDown, UserCircle, LogOut } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { ROLE_LABELS } from "../config/roles";
import { useDismissible } from "../hooks/useDismissible";

export default function UserMenu() {
  const { user, role, logout } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);
  const triggerRef = useRef(null);
  const menuRef = useRef(null);

  // B15: outside click, Escape and navigation all close the menu.
  useDismissible(rootRef, open, () => setOpen(false), { returnFocusRef: triggerRef });

  const displayName = user?.name || user?.full_name || ROLE_LABELS[role] || "User";
  const displayEmail = user?.email || "user@zoiko.one";

  const items = () => Array.from(menuRef.current?.querySelectorAll('[role="menuitem"]') || []);

  function openMenu(focusFirst) {
    setOpen(true);
    if (focusFirst) requestAnimationFrame(() => items()[0]?.focus());
  }

  function onTriggerKey(e) {
    if (e.key === "ArrowDown" || e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      openMenu(true);
    }
  }

  function onMenuKey(e) {
    const list = items();
    if (!list.length) return;
    const i = list.indexOf(document.activeElement);
    if (e.key === "ArrowDown") { e.preventDefault(); list[(i + 1) % list.length].focus(); }
    else if (e.key === "ArrowUp") { e.preventDefault(); list[(i - 1 + list.length) % list.length].focus(); }
    else if (e.key === "Home") { e.preventDefault(); list[0].focus(); }
    else if (e.key === "End") { e.preventDefault(); list[list.length - 1].focus(); }
    else if (e.key === "Tab") setOpen(false);
  }

  async function handleLogout() {
    setOpen(false);
    await logout();
    navigate("/login", { replace: true });
  }

  return (
    <div className="relative font-sans" ref={rootRef}>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        onKeyDown={onTriggerKey}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls="user-menu"
        aria-label={`Account menu for ${displayName}`}
        className="inline-flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-3.5 py-2 text-sm text-slate-800 transition hover:border-slate-300 hover:bg-slate-100"
      >
        <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-slate-200">
          <UserCircle className="h-5 w-5 text-slate-600" />
        </span>
        <span className="hidden text-left sm:block">
          <span className="block text-xs font-semibold text-slate-800">{displayName}</span>
          <span className="text-[10px] text-slate-500">{displayEmail}</span>
        </span>
        <ChevronDown className="h-3.5 w-3.5 text-slate-500" />
      </button>

      {open && (
        <div
          id="user-menu"
          ref={menuRef}
          role="menu"
          aria-label="Account"
          onKeyDown={onMenuKey}
          className="absolute right-0 top-full z-30 mt-2 w-56 rounded-xl border border-slate-200 bg-white p-2 shadow-[0_12px_40px_rgba(0,0,0,0.08)]"
        >
          <div className="border-b border-slate-100 px-3 py-2" role="presentation">
            <p className="text-sm font-semibold text-slate-800">{displayName}</p>
            <p className="text-xs text-slate-500">{displayEmail}</p>
          </div>
          <button
            type="button"
            role="menuitem"
            onClick={handleLogout}
            className="mt-2 flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-red-600 transition hover:bg-red-50 focus:bg-red-50 focus:outline-none"
          >
            <LogOut className="h-4 w-4" />
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}
