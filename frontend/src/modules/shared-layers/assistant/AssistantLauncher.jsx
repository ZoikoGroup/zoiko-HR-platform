import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useLocation } from "react-router-dom";
import { X } from "lucide-react";
import zoikoWaveGlyph from "../../../assets/zoikohr-wave-glyph.svg";
import { useAuth } from "../../../context/AuthContext";
import { useAssistantConversation } from "./useAssistantConversation";
import ConversationView from "./ConversationView";

// Public, unauthenticated routes (kept in sync with the public <Route>
// entries in App.jsx). AssistantContext's `isAuthenticated` is a raw
// token-presence check (`Boolean(user) || isAuthenticated()`), not a
// route-aware one — a leftover token from a previous session (e.g. after an
// expired-session redirect to /login that didn't clear storage) reads as
// "authenticated" even while the login form is the thing on screen. The
// launcher is mounted once at the app root regardless of route, so it needs
// its own route check rather than relying on the token check alone.
const PUBLIC_PATHS = new Set(["/", "/login", "/forgot-password", "/register", "/register/success"]);

/**
 * WF-01 Persistent Launcher and Docked Panel — mounted once at the app
 * root so it's available on every authenticated page. Rendered via a
 * portal straight onto <body> so no ancestor's overflow/transform/z-index
 * context can clip or reposition a widget that has to float above
 * everything, regardless of which route mounted it.
 *
 * The button is always present and its own icon/rotation/fill state is the
 * single toggle affordance — one `open` boolean drives the icon swap, the
 * rotation, the accent fill, and whether the panel renders at all.
 *
 * Below `sm` the panel becomes the WF-03 full-screen mobile composition
 * (a deliberate difference from a plain floating widget): the button stays
 * on top of it as the close control, so the composer reserves extra
 * bottom clearance there to avoid the two overlapping.
 */
export default function AssistantLauncher() {
  const { isAuthenticated } = useAuth();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const launcherRef = useRef(null);
  const headingRef = useRef(null);

  // Engine only mounts once the panel is opened — no assistant API calls
  // fire on every page load, only when the user actually opens it.
  const [engineActive, setEngineActive] = useState(false);
  const engine = useAssistantConversation(engineActive);

  useEffect(() => {
    if (open) {
      setEngineActive(true);
      requestAnimationFrame(() => headingRef.current?.focus());
    }
  }, [open]);

  const close = () => {
    setOpen(false);
    setHistoryOpen(false);
    launcherRef.current?.focus();
  };

  if (!isAuthenticated || PUBLIC_PATHS.has(location.pathname)) return null;

  return createPortal(
    <>
      <button
        ref={launcherRef}
        type="button"
        onClick={() => (open ? close() : setOpen(true))}
        aria-label={open ? "Close HR Assistant" : "Open HR Assistant"}
        aria-expanded={open}
        className={`zhr-orb-btn fixed bottom-5 right-5 z-50 flex h-14 w-14 items-center justify-center
          rounded-2xl
          focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--zhr-border-focus)]
          ${open ? "is-open" : ""}`}
      >
        {open ? <X className="h-6 w-6 text-white" /> : <img src={zoikoWaveGlyph} alt="" className="h-8 w-8" />}
      </button>
      <span aria-hidden="true" className={`zhr-orb-halo ${open ? "is-open" : ""}`} />

      {open && (
        <div
          role="dialog"
          aria-label="HR Assistant"
          className="fixed inset-0 z-40 flex flex-col overflow-hidden bg-[var(--zhr-surface-overlay)]
            sm:inset-auto sm:bottom-24 sm:right-5 sm:rounded-3xl sm:border sm:border-[var(--zhr-border-default)] sm:shadow-[var(--zhr-elevation-modal)]"
          style={{
            "--_panel-w": "min(92vw, var(--zhr-panel-width))",
            "--_panel-h": "min(75vh, 640px)",
          }}
        >
          <div className="flex h-full w-full flex-col sm:h-[var(--_panel-h)] sm:w-[var(--_panel-w)]">
            <div className="min-h-0 flex-1" tabIndex={-1} ref={headingRef}>
              <ConversationView
                {...engine}
                onSend={engine.send}
                compact
                historyOpen={historyOpen}
                onToggleHistory={() => setHistoryOpen((v) => !v)}
                onCloseHistory={() => setHistoryOpen(false)}
                onNewConversation={engine.startNewConversation}
                onClose={close}
              />
            </div>
          </div>
        </div>
      )}
    </>,
    document.body
  );
}
