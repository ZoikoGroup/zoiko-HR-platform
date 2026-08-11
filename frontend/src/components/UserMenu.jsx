import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronDown, UserCircle, LogOut } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { ROLE_LABELS } from "../config/roles";

export default function UserMenu() {
  const { user, role, logout } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  const displayName = user?.name || user?.full_name || ROLE_LABELS[role] || "User";
  const displayEmail = user?.email || "user@zoiko.one";

  async function handleLogout() {
    await logout();
    navigate("/login", { replace: true });
  }

  return (
    <div className="relative font-sans">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
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
        <div className="absolute right-0 top-full z-30 mt-2 w-56 rounded-xl border border-slate-200 bg-white p-2 shadow-[0_12px_40px_rgba(0,0,0,0.08)]">
          <div className="border-b border-slate-100 px-3 py-2">
            <p className="text-sm font-semibold text-slate-800">{displayName}</p>
            <p className="text-xs text-slate-500">{displayEmail}</p>
          </div>
          <button
            type="button"
            onClick={handleLogout}
            className="mt-2 flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-red-600 transition hover:bg-red-50"
          >
            <LogOut className="h-4 w-4" />
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}
