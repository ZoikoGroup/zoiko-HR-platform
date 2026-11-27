/*
 * Shared pieces of the Onboarding Settings page: the section card, and the page-level save registry. Sections that are
 * saved by the page header's "Save changes" / "Discard changes" register themselves with useSettingsSection.
 */
import { createContext, useContext, useEffect, useRef, useState } from "react";

// ── jumping to a section or field of a settings page ────────────────────────────────────────────────────────────────
// Plain browser hash changes (no router hooks), so a card works the same inside or outside a router. Going to the hash the
// page is already on fires no "hashchange", so that case sends this event instead.
const SECTION_EVENT = "zhr:section";

/** Go to "#id" on the current page (scrolls even when the address already ends in "#id"). */
export function goToSection(id) {
  if (typeof window === "undefined" || !id) return;
  if (window.location.hash === `#${id}`) window.dispatchEvent(new Event(SECTION_EVENT));
  else window.location.hash = id;
}

/** The address's hash, and a counter that moves on every jump (also a jump to the same hash). */
export function useSectionHash() {
  const read = () => (typeof window !== "undefined" ? window.location.hash : "");
  const [state, setState] = useState(() => ({ hash: read(), key: 0 }));
  useEffect(() => {
    const on = () => setState((s) => ({ hash: read(), key: s.key + 1 }));
    window.addEventListener("hashchange", on);
    window.addEventListener("popstate", on);
    window.addEventListener(SECTION_EVENT, on);
    return () => {
      window.removeEventListener("hashchange", on);
      window.removeEventListener("popstate", on);
      window.removeEventListener(SECTION_EVENT, on);
    };
  }, []);
  return state;
}

/** A link to "path#id": on that same page it only jumps to the section; from any other page it navigates there. `as` is the
 * router Link of the card using it. */
export function SectionLink({ as: LinkComponent, to, children, onClick, ...rest }) {
  const [path, id] = String(to).split("#");
  return (
    <LinkComponent to={to} {...rest} onClick={(e) => {
      onClick?.(e);
      if (id && typeof window !== "undefined" && (!path || window.location.pathname === path)) { e.preventDefault(); goToSection(id); }
    }}>{children}</LinkComponent>
  );
}

export const SettingsSaveContext = createContext(null);

/**
 * Register a section with the page's Save / Discard buttons. `save` resolves to true when it saved (or had nothing to
 * save) and false when it failed (the section shows its own errors). Returns true when the page owns saving, so the
 * section can hide its own buttons.
 */
export function useSettingsSection(id, { dirty, save, discard }) {
  const ctx = useContext(SettingsSaveContext);
  const handlers = useRef({ save, discard });
  handlers.current = { save, discard };
  useEffect(() => {
    if (!ctx) return undefined;
    ctx.register(id, { save: () => handlers.current.save(), discard: () => handlers.current.discard() });
    return () => ctx.unregister(id);
  }, [ctx, id]);
  useEffect(() => { ctx?.report(id, !!dirty); }, [ctx, id, dirty]);
  return !!ctx;
}

/** One card on the page: an icon tile, the title and help text, an optional action on the right, then the body. */
export function SettingsCard({ id, icon: Icon, title, help, action, children, className = "" }) {
  const titleId = id ? `${id}-title` : undefined;
  return (
    <section id={id} aria-labelledby={titleId}
      className={`relative scroll-mt-24 overflow-hidden rounded-2xl border border-gray-200/80 bg-white shadow-sm transition-shadow duration-200 hover:shadow-md ${className}`}>
      <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-blue-500/70 via-sky-400/50 to-transparent" />
      <div className="flex flex-wrap items-start justify-between gap-3 px-5 pt-5">
        <div className="flex min-w-0 items-start gap-3">
          {Icon && (
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-blue-50 to-sky-50 text-blue-600 ring-1 ring-blue-100" aria-hidden="true">
              <Icon className="h-5 w-5" />
            </span>
          )}
          <div className="min-w-0">
            <h2 id={titleId} className="text-base font-semibold text-gray-900">{title}</h2>
            {help ? <p className="mt-0.5 text-sm text-gray-500">{help}</p> : null}
          </div>
        </div>
        {action}
      </div>
      <div className="space-y-4 px-5 pb-5 pt-4">{children}</div>
    </section>
  );
}
