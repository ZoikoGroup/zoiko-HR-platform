import { useEffect, useRef, useState } from "react";
import { Sparkles, X } from "lucide-react";
import { useAuth } from "../../../context/AuthContext";
import { useAssistantConversation } from "./useAssistantConversation";
import ConversationView from "./ConversationView";
import HistoryRail from "./HistoryRail";

/**
 * WF-01 Persistent Launcher and Docked Panel — mounted once at the app
 * root so it's available on every authenticated page.
 */
export default function AssistantLauncher() {
  const { isAuthenticated } = useAuth();
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

  if (!isAuthenticated) return null;

  return (
    <>
      <button
        ref={launcherRef}
        type="button"
        onClick={() => (open ? close() : setOpen(true))}
        aria-label={open ? "Close HR Assistant" : "Open HR Assistant"}
        aria-expanded={open}
        className="fixed bottom-5 right-5 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-[var(--zhr-action-primary)] text-white shadow-[var(--zhr-elevation-panel)] transition hover:bg-[var(--zhr-action-primary-hover)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--zhr-border-focus)]"
      >
        {open ? <X className="h-6 w-6" /> : <Sparkles className="h-6 w-6" />}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="HR Assistant"
          className="fixed bottom-24 right-5 z-40 flex overflow-hidden rounded-3xl border border-[var(--zhr-border-default)] bg-[var(--zhr-surface-overlay)] shadow-[var(--zhr-elevation-modal)]"
          style={{ width: "min(92vw, var(--zhr-panel-width))", height: "min(75vh, 640px)" }}
        >
          {historyOpen && (
            <div className="absolute inset-0 z-10 flex flex-col bg-[var(--zhr-surface-canvas)]">
              <button onClick={() => setHistoryOpen(false)} className="absolute right-2 top-2 rounded-lg p-1.5 text-[var(--zhr-text-muted)]">
                <X className="h-4 w-4" />
              </button>
              <HistoryRail
                conversations={engine.conversations}
                activeId={engine.conversationId}
                onSelect={(id) => { engine.openConversation(id); setHistoryOpen(false); }}
                onRename={engine.renameCurrentConversation}
                onDelete={engine.removeConversation}
              />
            </div>
          )}
          <div className="flex-1 min-w-0" tabIndex={-1} ref={headingRef}>
            <ConversationView
              {...engine}
              onSend={engine.send}
              compact
              onToggleHistory={() => setHistoryOpen((v) => !v)}
              onNewConversation={engine.startNewConversation}
            />
          </div>
        </div>
      )}
    </>
  );
}
