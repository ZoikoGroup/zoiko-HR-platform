/*
 * Shared pieces of the Onboarding Settings page: the section card, and the page-level save registry. Sections that are
 * saved by the page header's "Save changes" / "Discard changes" register themselves with useSettingsSection.
 */
import { createContext, useContext, useEffect, useRef } from "react";

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
    <section id={id} aria-labelledby={titleId} className={`scroll-mt-24 rounded-2xl border border-gray-200/80 bg-white shadow-sm ${className}`}>
      <div className="flex flex-wrap items-start justify-between gap-3 px-5 pt-5">
        <div className="flex min-w-0 items-start gap-3">
          {Icon && (
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-blue-50 text-blue-600" aria-hidden="true">
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
