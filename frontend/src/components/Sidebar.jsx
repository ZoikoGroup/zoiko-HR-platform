"use client";

import { useEffect, useState } from "react";
import { Link, NavLink, useLocation } from "react-router-dom";
import { ChevronDown, X } from "lucide-react";
import useFilteredNavigation from "../hooks/useFilteredNavigation";
import { ROLE_LABELS } from "../config/roles";
import { useAuth } from "../context/AuthContext";

import SearchBar from "./SearchBar.jsx";
import logo from "../assets/zoikohr-icon-svg.svg";

function isActive(href, pathname, search = "") {
  if (!href) return false;
  const cleanHref = href.split(/[?#]/)[0];
  const hrefSearch = href.includes("?") ? `?${href.split("?")[1].split("#")[0]}` : "";
  if (cleanHref === "/") return pathname === "/";
  if (hrefSearch) return pathname === cleanHref && search === hrefSearch;
  return pathname === cleanHref || pathname.startsWith(`${cleanHref}/`);
}

function MenuItem({ item, pathname, search }) {
  const hasActiveChild = item.children
    ? item.children.some((child) => isActive(child.href, pathname, search))
    : false;
  const [expanded, setExpanded] = useState(hasActiveChild);

  useEffect(() => {
    if (hasActiveChild) {
      setExpanded(true);
    }
  }, [hasActiveChild, pathname]);

  if (item.sidebar === false) return null;

  const active = isActive(item.href, pathname, search) || hasActiveChild;

  if (item.children) {
    return (
      <div className="space-y-2">
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          className={`group flex w-full items-center justify-between gap-3 rounded-[14px] border px-4 py-3 text-left text-sm transition duration-200 ${
            active
              ? "border-[#3B82F6]/40 bg-gradient-to-r from-[#2563EB] to-[#3B82F6] text-white shadow-[0_18px_40px_rgba(37,99,235,0.18)]"
              : "border-white/10 bg-white/5 text-[#CBD5E1] hover:border-white/20 hover:bg-white/10"
          }`}
        >
          <span className="inline-flex items-center gap-3">
            <item.icon className={`h-4 w-4 transition duration-200 ${active ? "text-white" : "text-[#94A3B8]"}`} />
            <span>{item.label}</span>
          </span>
          <ChevronDown className={`h-4 w-4 transition-transform duration-200 ${expanded ? "rotate-180 text-white" : "text-[#94A3B8]"}`} />
        </button>
        {expanded ? (
          <div className="space-y-2 pl-5">
            {item.children.map((child) => (
              <MenuItem key={child.label} item={child} pathname={pathname} search={search} />
            ))}
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <NavLink
      to={item.href ?? "/"}
      className={({ isActive: navActive }) => {
        const exactQueryItem = item.href?.includes("?");
        const isCurrent = exactQueryItem ? isActive(item.href, pathname, search) : navActive || isActive(item.href, pathname, search);
        return `group flex items-center gap-3 rounded-[14px] border px-4 py-3 text-sm transition duration-200 ${
          isCurrent
            ? "border-[#3B82F6]/40 bg-gradient-to-r from-[#2563EB] to-[#3B82F6] text-white shadow-[0_18px_40px_rgba(37,99,235,0.18)]"
            : "border-white/10 bg-white/5 text-[#94A3B8] hover:border-white/20 hover:bg-white/10 hover:text-white"
        }`;
      }}
      end
    >
      <item.icon className="h-4 w-4 shrink-0" />
      <span className="flex-1 truncate">{item.label}</span>
      {item.badge ? (
        <span className="ml-auto min-w-[22px] rounded-full bg-[#3B82F6] px-2 py-0.5 text-[10px] font-semibold text-white shadow-[0_8px_24px_rgba(37,99,235,0.18)]">
          {item.badge}
        </span>
      ) : null}
    </NavLink>
  );
}

export default function Sidebar({ open, onClose }) {
  const { pathname, search } = useLocation();
  const { role, product, products } = useAuth();
  const filteredSections = useFilteredNavigation(role, product, products);

  return (
    <div>
      <div className={`fixed inset-0 z-30 bg-slate-950/40 transition-opacity ${open ? "opacity-100" : "pointer-events-none opacity-0"}`} onClick={onClose} />

      <aside
        className={`fixed inset-y-0 left-0 z-40 w-72 overflow-y-auto border-r border-white/10 bg-gradient-to-b from-[#0A1128] to-[#111A33] px-4 py-6 shadow-[0_24px_80px_rgba(4,7,20,0.42)] transition-transform lg:translate-x-0 ${open ? "translate-x-0" : "-translate-x-full"}`}
      >
        <div className="mb-8 flex items-center justify-between gap-3">
          <div className="flex flex-col gap-2">
            <Link to="/" className="inline-flex items-center gap-2.5">
              <img src={logo} alt="Zoiko One" className="h-10 w-auto max-w-full object-contain" />
              <span className="text-[22px] font-extrabold tracking-tight text-white">
                Zoiko<span className="text-[#3B82F6]">HR</span>
              </span>
            </Link>
            {ROLE_LABELS[role] ? (
              <p className="text-xs font-semibold uppercase tracking-[0.3em] text-[#94A3B8]">
                {ROLE_LABELS[role]}
              </p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-9 w-9 items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-white transition hover:border-white/20 hover:bg-white/10 lg:hidden"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mb-6">
          <SearchBar />
        </div>

        <div className="space-y-7 pb-8">
          {filteredSections.map((section, idx) => (
            <div key={`${section.title}-${idx}`}>
              <p className="mb-4 text-[10px] uppercase tracking-[0.32em] text-[#64748B]">
                {section.title}
              </p>
              <div className="space-y-2">
                {section.items.map((item) => (
                  <MenuItem key={item.label} item={item} pathname={pathname} search={search} />
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="mt-auto border-t border-white/10 pt-5">
          <p className="text-[9px] tracking-[0.28em] text-[#64748B]">POWERED BY</p>
          <p className="text-[14px] font-extrabold text-white">
            <span>Zoiko</span>
            <span className="text-[#3B82F6]">One</span>
          </p>
        </div>
      </aside>
    </div>
  );
}
