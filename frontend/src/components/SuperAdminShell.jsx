import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import Header from "./Header";
import Sidebar from "./Sidebar";

// Paths whose header should be hidden. Add more prefixes here if other
// modules want the same treatment.
const HIDE_HEADER_PREFIXES = [];

export default function SuperAdminShell({ children }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const location = useLocation();
  const hideHeader = HIDE_HEADER_PREFIXES.some(
    (prefix) => location.pathname === prefix || location.pathname.startsWith(prefix + "/")
  );

  // On phones and tablets the sidebar is a drawer over the page: tapping a link must reveal the page it opened.
  useEffect(() => {
    setSidebarOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!sidebarOpen) return undefined;
    const onKey = (e) => { if (e.key === "Escape") setSidebarOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [sidebarOpen]);

  return (
    <div className="min-h-screen bg-white text-slate-900 font-sans">
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <div className="min-w-0 lg:pl-72">
        {!hideHeader && <Header onMenuClick={() => setSidebarOpen(true)} />}
        <main className="portal-main mx-auto w-full min-w-0 max-w-7xl px-3 py-4 sm:px-6 sm:py-6 lg:px-8">{children}</main>
      </div>
    </div>
  );
}
