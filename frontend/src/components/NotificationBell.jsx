import { Bell } from "lucide-react";

export default function NotificationBell() {
  return (
    <button
      type="button"
      className="relative inline-flex h-12 w-12 items-center justify-center rounded-3xl border border-slate-800 bg-slate-950 text-slate-200 transition hover:border-slate-700 hover:bg-slate-900"
      aria-label="View notifications"
    >
      <Bell className="h-5 w-5" />
      <span className="absolute right-2 top-2 inline-flex h-2.5 w-2.5 rounded-full bg-amber-400 ring-1 ring-slate-950" />
    </button>
  );
}
