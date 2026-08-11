import React, { useEffect } from "react";
import { Menu } from "lucide-react";
import { Link } from "react-router-dom";
import UserMenu from "./UserMenu";
import { useAuth } from "../context/AuthContext";
import { ROLE_LABELS } from "../config/roles";
import logo from "../assets/logo.png";

/**
 * Header component for the app shell.
 * - Shows Zoiko One logo and a role-based badge.
 * - Provides a mobile menu button (hamburger) to toggle the sidebar.
 */
export default function Header({ onMenuClick, onSearch }) {
  const { role } = useAuth();
  // Keyboard shortcut for command palette
  useEffect(() => {
    const handler = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        if (onSearch) onSearch();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onSearch]);

  return (
    <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 backdrop-blur-xl backdrop-saturate-150 rounded-b-xl">
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-4 px-4 sm:px-6 lg:px-8">
        {/* Mobile menu button */}
        <button
          type="button"
          onClick={onMenuClick}
          className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 transition hover:border-slate-300 hover:bg-slate-50 lg:hidden"
          aria-label="Open sidebar"
        >
          <Menu className="h-5 w-5" />
        </button>

        {/* Branding */}
        <div className="flex items-center space-x-2">
          <Link to="/"><img src={logo} alt="Zoiko One" className="h-7 w-auto object-contain" /></Link>
          <span className="ml-2 rounded-full bg-[#FF7A00]/10 border border-[#FF7A00]/25 px-2.5 py-0.5 text-xs font-semibold text-[#FF7A00]">
            {ROLE_LABELS[role] ?? "Super Admin"}
          </span>
        </div>

        {/* User menu */}
        <div className="ml-auto">
          <UserMenu />
        </div>
      </div>
    </header>
  );
}