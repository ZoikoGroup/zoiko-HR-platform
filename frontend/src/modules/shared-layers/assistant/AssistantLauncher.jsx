import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useLocation } from "react-router-dom";
import { X } from "lucide-react";
import zoikoWaveGlyph from "../../../assets/zoikohr-wave-glyph.svg";
import { useAuth } from "../../../context/AuthContext";
import { loadStates } from "../../../components/PlanGate";
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
const PUBLIC_PATHS = new Set(["/", "/login", "/forgot-password", "/reset-password", "/verify-email", "/terms", "/register", "/register/success"]);

const CHAT_FEATURE_KEY = "hr.ai.navigation";
const CHAT_BLOCKING_STATES = new Set(["NOT_ENTITLED", "DELINQUENCY_RESTRICTED"]);

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * WF-01 Persistent Launcher and Docked Panel — mounted once at the app
 * root so it's available on every authenticated page. Rendered via a
 * portal straight onto <body> so no ancestor's overflow/transform/z-index
 * context can clip or reposition a widget that has to float above
 * everything, regardless of which route mounted it.
 *
 * Geometry follows the Chatbot Detailed Wireframe v1.0 (§3.1/3.2): a
 * 480px-wide panel docked above the 56px launcher, height capped at 780px
 * within the viewport; at ≤600px it becomes a full-screen sheet with its own
 * header close button, and the launcher steps aside so it can't cover the
 * composer.
 */
export default function AssistantLauncher() {
  const { isAuthenticated } = useAuth();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const launcherRef = useRef(null);
  const panelRef = useRef(null);
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

  // A page dialog (any full-screen overlay) owns the screen: the floating button would sit on its footer buttons on a
  // phone, so it steps aside until the dialog closes. Visibility-filtered:
  // always-mounted scrims (e.g. Sidebar backdrop with opacity-0) must not count.
  const [pageDialogOpen, setPageDialogOpen] = useState(false);
  useEffect(() => {
    const isVisibleDialog = (el) => {
      if (el.hasAttribute("data-assistant-panel")) return false;
      if (el.hasAttribute("data-sidebar-backdrop")) return false;
      if (el.classList.contains("hidden")) return false;
      if (el.classList.contains("opacity-0") && el.classList.contains("pointer-events-none")) return false;
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 && rect.height === 0) return false;
      const style = window.getComputedStyle(el);
      if (style.display === "none" || style.visibility === "hidden" || style.opacity === "0") return false;
      return true;
    };
    const check = () => {
      const candidates = document.querySelectorAll(
        ".fixed.inset-0:not([data-assistant-panel]):not([data-sidebar-backdrop]), [aria-modal='true']:not([data-assistant-panel])"
      );
      setPageDialogOpen(Array.from(candidates).some(isVisibleDialog));
    };
    check();
    const obs = new MutationObserver(check);
    obs.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["class", "style", "aria-modal", "aria-hidden"],
    });
    return () => obs.disconnect();
  }, []);

  // The chatbot is not in the Core plan: hide the launcher when the plan leaves it out (or access is paused for an
  // overdue payment), the same states the server refuses (assistant/plan_gate.py). Any other answer, or none, keeps it.
  const [planAllows, setPlanAllows] = useState(true);
  useEffect(() => {
    if (!isAuthenticated) return undefined;
    let live = true;
    loadStates().then((states) => {
      if (live) setPlanAllows(!CHAT_BLOCKING_STATES.has(states?.[CHAT_FEATURE_KEY]));
    });
    return () => { live = false; };
  }, [isAuthenticated, location.pathname]);

  const close = () => {
    setOpen(false);
    setHistoryOpen(false);
    launcherRef.current?.focus();
  };

  // Escape closes the panel (open menus stop propagation and close first);
  // Tab is contained within the dialog while it's open.
  const onPanelKeyDown = (e) => {
    if (e.key === "Escape") {
      e.stopPropagation();
      close();
      return;
    }
    if (e.key !== "Tab" || !panelRef.current) return;
    const focusables = Array.from(panelRef.current.querySelectorAll(FOCUSABLE)).filter((el) => el.offsetParent !== null);
    if (focusables.length === 0) return;
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    if (e.shiftKey && (document.activeElement === first || document.activeElement === headingRef.current)) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };

  // The new hire's pre-onboarding page is public (reached from an email link) even if this browser holds a sign-in
  // token, so hide the launcher there just like the other public routes.
  if (!isAuthenticated || PUBLIC_PATHS.has(location.pathname) || location.pathname.startsWith("/onboarding-portal/")) return null;
  if (pageDialogOpen && !open) return null;
  if (!planAllows) return null;

  return createPortal(
    <>
      <button
        ref={launcherRef}
        type="button"
        onClick={() => (open ? close() : setOpen(true))}
        aria-label={open ? "Close Zoiko HR Assistant" : "Open Zoiko HR Assistant"}
        aria-expanded={open}
        aria-haspopup="dialog"
        className={`zhr-orb-btn fixed bottom-6 right-6 z-50 flex h-14 w-14 items-center justify-center
          rounded-2xl
          focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--zhr-border-focus)]
          ${open ? "is-open max-[600px]:hidden" : ""}`}
      >
        {open ? <X className="h-6 w-6 text-white" /> : <img src={zoikoWaveGlyph} alt="" className="h-8 w-8" />}
      </button>
      <span aria-hidden="true" className={`zhr-orb-halo ${open ? "is-open max-[600px]:hidden" : ""}`} />

      {open && (
        <div
          ref={panelRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby="zhr-assistant-title"
          aria-label="Zoiko HR Assistant"
          data-assistant-panel=""
          onKeyDown={onPanelKeyDown}
          className="fixed z-40 flex flex-col overflow-hidden bg-[var(--zhr-surface-overlay)]
            max-[600px]:inset-0 max-[600px]:h-[100dvh] max-[600px]:w-screen
            min-[601px]:bottom-[92px] min-[601px]:right-4 lg:right-6
            min-[601px]:h-[min(var(--zhr-panel-max-height),calc(100dvh-108px))] min-[601px]:w-[min(var(--zhr-panel-width),calc(100vw-32px))]
            min-[601px]:rounded-[18px] min-[601px]:border min-[601px]:border-[var(--zhr-chat-border)] min-[601px]:shadow-[var(--zhr-elevation-modal)]"
        >
          <ConversationView
            {...engine}
            onSend={engine.send}
            compact
            headingRef={headingRef}
            historyOpen={historyOpen}
            onToggleHistory={() => setHistoryOpen((v) => !v)}
            onCloseHistory={() => setHistoryOpen(false)}
            onNewConversation={engine.startNewConversation}
            onClose={close}
          />
        </div>
      )}
    </>,
    document.body
  );
}
