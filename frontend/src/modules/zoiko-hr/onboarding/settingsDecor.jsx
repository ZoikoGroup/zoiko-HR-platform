/*
 * Presentational pieces of the Onboarding Settings page: the "Set up docs for your organisation" hero, numbered section
 * headers, the quick-jump chips (small screens) and the scroll-spy that highlights the section in view.
 */
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { CheckCircle2, ShieldCheck, Sparkles, UploadCloud } from "lucide-react";

/** The most visible entry point: upload the organisation's own documents and let the setup (AI-assisted) propose the rest.
 * A lean one-row banner: icon, title, one line of text, a short reassurance and the "Set up with AI" button. */
export function DocsSetupHero({ setupStatus, profileComplete, path }) {
  const last = setupStatus?.last_session;
  const inProgress = last && ["uploading", "analysing", "review"].includes(last.status);
  return (
    <section id="docs-setup" aria-labelledby="docs-setup-title"
      className="relative scroll-mt-24 overflow-hidden rounded-2xl bg-gradient-to-r from-blue-700 via-blue-600 to-sky-500 px-4 py-3.5 text-white shadow-md shadow-blue-900/10 sm:px-5">
      <div aria-hidden="true" className="pointer-events-none absolute -right-10 -top-16 h-40 w-40 rounded-full bg-white/10" />
      <div className="relative flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-white/15 ring-1 ring-white/25" aria-hidden="true">
            <UploadCloud className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <h2 id="docs-setup-title" className="text-base font-semibold leading-snug">Set up docs for your organisation</h2>
            <p className="text-sm text-blue-50">
              {profileComplete
                ? "Upload your offer letter, contract, NDA and forms – we draft your templates and settings from them."
                : "Your Company Profile is incomplete – upload your documents and we suggest the missing details."}
            </p>
            <p className="mt-0.5 inline-flex flex-wrap items-center gap-x-1.5 text-xs text-blue-100">
              <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />You approve every suggestion; nothing is sent to new hires.
              {last && last.status !== "cancelled" && (
                <span className="inline-flex items-center gap-1">
                  · <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                  Last setup: {last.status === "applied" ? "applied" : `in progress (step ${last.step} of 6)`}
                </span>
              )}
            </p>
          </div>
        </div>
        {setupStatus?.enabled !== false && (
          <Link to={path}
            className="inline-flex shrink-0 items-center justify-center gap-2 self-start rounded-xl bg-white px-4 py-2 text-sm font-semibold text-blue-700 shadow-sm transition hover:-translate-y-0.5 hover:bg-blue-50 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-white/70 sm:self-center">
            <Sparkles className="h-4 w-4" aria-hidden="true" />
            {inProgress ? "Continue setting up with AI" : "Set up with AI"}
          </Link>
        )}
      </div>
    </section>
  );
}

/** A numbered part of the page: badge, icon, title, help and a fading rule. */
export function SectionHeader({ id, step, icon: Icon, title, help }) {
  return (
    <div id={id} className="scroll-mt-24 pt-3">
      <div className="flex items-start gap-3">
        <span className="relative grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-blue-600 to-sky-500 text-white shadow-sm shadow-blue-900/10" aria-hidden="true">
          {Icon ? <Icon className="h-5 w-5" /> : null}
          <span className="absolute -right-1.5 -top-1.5 grid h-5 w-5 place-items-center rounded-full bg-white text-[10px] font-bold text-blue-700 ring-1 ring-blue-100">{step}</span>
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
          <p className="mt-0.5 text-sm text-gray-500">{help}</p>
        </div>
      </div>
      <div aria-hidden="true" className="mt-3 h-px bg-gradient-to-r from-blue-200 via-gray-200 to-transparent" />
    </div>
  );
}

/** Horizontal chips that jump to a section (the sidebar's "On this page" is only shown on wide screens). */
export function QuickJump({ items, active }) {
  return (
    <nav aria-label="Jump to a section" className="-mx-1 overflow-x-auto pb-1 xl:hidden">
      <ul className="flex w-max gap-2 px-1">
        {items.map((it) => (
          <li key={it.href}>
            <a href={it.href}
              className={`inline-flex items-center whitespace-nowrap rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                active === it.href.slice(1) ? "border-blue-300 bg-blue-600 text-white shadow-sm" : "border-gray-200 bg-white text-gray-700 hover:border-blue-200 hover:text-blue-700"}`}>
              {it.label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}

/** The id of the section nearest the top of the screen (IntersectionObserver; nothing in environments without it). */
export function useScrollSpy(ids) {
  const [active, setActive] = useState("");
  const key = ids.join("|");
  useEffect(() => {
    if (typeof window === "undefined" || typeof window.IntersectionObserver === "undefined") return undefined;
    const seen = new Map();
    const observer = new window.IntersectionObserver((entries) => {
      entries.forEach((e) => seen.set(e.target.id, e.isIntersecting ? e.boundingClientRect.top : null));
      const visible = [...seen.entries()].filter(([, top]) => top !== null).sort((a, b) => a[1] - b[1]);
      if (visible.length) setActive(visible[0][0]);
    }, { rootMargin: "-80px 0px -55% 0px" });
    let tries = 0;
    const attach = () => {                      // the section components render their ids after loading their data
      ids.forEach((id) => { const el = document.getElementById(id); if (el && !seen.has(id)) { seen.set(id, null); observer.observe(el); } });
      tries += 1;
      if (seen.size < ids.length && tries < 20) timer = setTimeout(attach, 400);
    };
    let timer = setTimeout(attach, 0);
    return () => { clearTimeout(timer); observer.disconnect(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return active;
}
