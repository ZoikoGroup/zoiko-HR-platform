import { useCallback, useEffect, useRef, useState } from "react";
import {
  Loader2, X, ChevronRight, ArrowRight, ArrowDown, ShieldCheck,
  CalendarDays, BookOpen, CalendarPlus, Clock, LifeBuoy,
} from "lucide-react";
import zoikoHrIcon from "../../../assets/zoikohr-icon-svg.svg";
import zoikoHrLogo from "../../../assets/zoikohr-logo-svg.svg";
import AssistantAnswer, { UserMessage } from "./MessageBubble";
import Composer from "./Composer";
import ScopeSelector from "./ScopeSelector";
import SystemBanner from "./SystemBanner";
import AssistantMenu from "./AssistantMenu";
import HandoffPanel from "./HandoffPanel";
import MyTicketsPanel from "./MyTicketsPanel";
import HistoryRail from "./HistoryRail";
import { createPrivacyRequest } from "../../../service/assistantService";

// First-run content follows the Chatbot Detailed Wireframe v1.0 anatomy
// (intro → 2×2 task cards → welcome → six starter prompts → CTA), with
// employee-facing tasks in place of the public site's sales journeys. Every
// query below routes to an intent the backend actually handles
// (orchestration_service.classify_intent) — don't add one that doesn't.
const TASK_CARDS = [
  { id: "TC-01", title: "My Leave Balance", subtext: "Check your remaining leave days", query: "How many leave days do I have left?", Icon: CalendarDays, tone: "bg-[#E8F1FD] text-[#1D5FD1]" },
  { id: "TC-02", title: "HR Policies", subtext: "Ask about approved company policies", query: "What is the annual leave policy?", Icon: BookOpen, tone: "bg-[#E4F5EC] text-[#15803D]" },
  { id: "TC-03", title: "Request Time Off", subtext: "Book leave in a few guided steps", query: "I want to request annual leave", Icon: CalendarPlus, tone: "bg-[#F1EAFE] text-[#7C3AED]" },
  { id: "TC-04", title: "My Attendance", subtext: "See today's clock-in status", query: "Have I clocked in today?", Icon: Clock, tone: "bg-[#FFEFE3] text-[#C2410C]" },
];

const STARTER_PROMPTS = [
  "What is the annual leave policy?",
  "How many leave days do I have left?",
  "Book 2 days of annual leave",
  "How many sick days do I have?",
  "Have I clocked in today?",
  "Can I speak to HR?",
];

const FOCUS_RING =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--zhr-chat-blue)]";

const HEADER_ICON_BTN =
  `flex h-10 w-10 items-center justify-center rounded-full border border-[var(--zhr-chat-border)] text-[var(--zhr-chat-navy)] hover:bg-[var(--zhr-chat-surface-alt)] ${FOCUS_RING}`;

function prefersReducedMotion() {
  return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
}

/**
 * Presentational conversation canvas — the docked panel's content. State
 * lives in useAssistantConversation() at the launcher level.
 */
export default function ConversationView({
  turns, conversationId, conversations, scope, setScope, teamMembers, capabilities,
  sending, loadingConversation, streamingTurnId, streamingText, degradedMessage, onSend,
  pendingAttachment, attachmentUploading, attachFile, clearPendingAttachment, refreshCapabilities,
  openConversation, removeConversation, renameCurrentConversation,
  compact = false, headingRef, historyOpen = false, onToggleHistory, onCloseHistory, onNewConversation, onClose,
}) {
  const [input, setInput] = useState("");
  const [supportRequestOpen, setSupportRequestOpen] = useState(false);
  const [myTicketsOpen, setMyTicketsOpen] = useState(false);
  const [showLatest, setShowLatest] = useState(false);
  const [sessionStartedAt] = useState(() => new Date());
  const scrollRef = useRef(null);
  const stickToBottomRef = useRef(true);

  // Scroll contract (wireframe §3.2): follow new content unless the user has
  // deliberately scrolled up, in which case offer a "Latest message" jump.
  const scrollToBottom = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: prefersReducedMotion() ? "auto" : "smooth" });
    stickToBottomRef.current = true;
    setShowLatest(false);
  }, []);

  useEffect(() => {
    if (turns.length === 0) return;
    if (stickToBottomRef.current) scrollToBottom();
    else setShowLatest(true);
  }, [turns, streamingText, scrollToBottom]);

  const onScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    stickToBottomRef.current = atBottom;
    if (atBottom) setShowLatest(false);
  };

  useEffect(() => {
    setSupportRequestOpen(false);
    setMyTicketsOpen(false);
  }, [conversationId]);

  const submit = (text) => {
    const value = text ?? input;
    if (!value.trim() || !conversationId || sending) return;
    if (text === undefined) setInput("");
    stickToBottomRef.current = true;
    onSend(value);
  };

  const exportMyData = async () => {
    try {
      const request = await createPrivacyRequest("export");
      const blob = new Blob([JSON.stringify(request.result, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `hr-assistant-data-export-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      window.alert(e.message || "Could not export your data. Please try again shortly.");
    }
  };

  const deleteMyData = async () => {
    if (!window.confirm("This permanently deletes all your HR Assistant conversations. This cannot be undone. Continue?")) return;
    try {
      await createPrivacyRequest("delete");
      window.location.reload();
    } catch (e) {
      window.alert(e.message || "Could not delete your data. Please try again shortly.");
    }
  };

  const generationOff = capabilities && !capabilities.generation_enabled;
  const ready = Boolean(conversationId) && !sending;
  const showFirstRun = !loadingConversation && turns.length === 0 && !degradedMessage && !supportRequestOpen && !myTicketsOpen;
  const gutter = compact ? "px-4 min-[601px]:px-5" : "px-5";

  return (
    <div className="flex h-full min-h-0 flex-col text-[var(--zhr-chat-navy)]">
      {/* CH-01 Branded header */}
      <header className={`flex min-h-[64px] shrink-0 items-center justify-between gap-2 border-b border-[var(--zhr-chat-border)] pt-[env(safe-area-inset-top)] ${gutter}`}>
        <h2 id="zhr-assistant-title" ref={headingRef} tabIndex={-1} className="min-w-0 outline-none">
          <span className="sr-only">Zoiko HR Assistant</span>
          <img src={zoikoHrLogo} alt="" className="h-auto w-[120px] min-[400px]:w-[154px]" />
        </h2>
        <div className="flex items-center gap-2">
          <ScopeSelector teamMembers={teamMembers} scope={scope} onChange={setScope} />
          {generationOff && (
            <span className="rounded-full border border-slate-200 bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-slate-600">
              Paused
            </span>
          )}
          <AssistantMenu
            onOpenHistory={onToggleHistory}
            onNewConversation={onNewConversation}
            onSupportRequest={() => setSupportRequestOpen(true)}
            onMyTickets={() => setMyTicketsOpen(true)}
            onExportData={exportMyData}
            onDeleteData={deleteMyData}
          />
          {onClose && (
            <button type="button" onClick={onClose} aria-label="Close Zoiko HR Assistant" className={HEADER_ICON_BTN}>
              <X className="h-5 w-5" />
            </button>
          )}
        </div>
      </header>

      {historyOpen ? (
        <HistoryRail
          conversations={conversations}
          activeId={conversationId}
          onSelect={(id) => { openConversation(id); onCloseHistory(); }}
          onRename={renameCurrentConversation}
          onDelete={removeConversation}
          onBack={onCloseHistory}
        />
      ) : (
      <div className="relative min-h-0 flex-1">
        <div className={`h-full overflow-y-auto overscroll-contain py-5 ${gutter}`} ref={scrollRef} onScroll={onScroll}>
          <SystemBanner capabilities={capabilities} errorMessage={degradedMessage} onRestrictionLifted={refreshCapabilities} />

          {supportRequestOpen && (
            <HandoffPanel
              conversationId={conversationId}
              turnId={null}
              defaultSummary=""
              onClose={() => setSupportRequestOpen(false)}
              checkOnMount
            />
          )}

          {myTicketsOpen && <MyTicketsPanel onClose={() => setMyTicketsOpen(false)} />}

          {loadingConversation && (
            <div className="flex h-full items-center justify-center text-[var(--zhr-text-muted)]" role="status">
              <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
              <span className="sr-only">Loading conversation…</span>
            </div>
          )}

          {showFirstRun && (
            <div className="flex flex-col gap-5">
              {/* CH-02 Intro */}
              <div className="flex items-start gap-3">
                <img src={zoikoHrIcon} alt="" className="h-8 w-8 shrink-0" />
                <div className="min-w-0">
                  <h3 className="text-[22px] font-bold leading-tight tracking-tight min-[601px]:text-2xl">
                    Hi! I’m the Zoiko HR Assistant.
                  </h3>
                  <p className="mt-2 text-[15px] leading-relaxed text-[var(--zhr-text-secondary)]">
                    I can help you with leave, attendance, company policies and HR requests — or connect you with your HR team.
                  </p>
                </div>
              </div>

              {/* CH-03 Task cards */}
              <ul className="grid grid-cols-2 gap-3 max-[360px]:grid-cols-1">
                {TASK_CARDS.map(({ id, title, subtext, query, Icon, tone }) => (
                  <li key={id}>
                    <button
                      type="button"
                      disabled={!ready}
                      onClick={() => submit(query)}
                      className={`group flex h-full min-h-[44px] w-full flex-col gap-3 rounded-2xl border border-[var(--zhr-chat-border)] bg-white p-4 text-left transition-colors hover:border-[var(--zhr-chat-blue)] hover:bg-[var(--zhr-chat-surface-alt)] disabled:cursor-wait disabled:opacity-60 ${FOCUS_RING}`}
                    >
                      <span className="flex w-full items-start justify-between">
                        <span className={`flex h-10 w-10 items-center justify-center rounded-xl ${tone}`}>
                          <Icon className="h-5 w-5" aria-hidden="true" />
                        </span>
                        <ChevronRight className="h-4 w-4 text-[var(--zhr-chat-blue)] transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
                      </span>
                      <span>
                        <span className="block text-[15px] font-semibold leading-snug">{title}</span>
                        <span className="mt-1 block text-[13px] leading-snug text-[var(--zhr-text-secondary)]">{subtext}</span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>

              {/* CH-04 Welcome + CH-05 starter prompts */}
              <div className="flex flex-col gap-3">
                <div className="flex items-start gap-2.5">
                  <img src={zoikoHrIcon} alt="" className="h-6 w-6 shrink-0" />
                  <div>
                    <div className="rounded-2xl rounded-tl-md bg-[var(--zhr-chat-bubble)] px-4 py-3 text-[15px] leading-relaxed">
                      <span className="sr-only">Zoiko HR Assistant (AI): </span>
                      <span className="block font-semibold">Welcome! I’m the Zoiko HR Assistant.</span>
                      <span className="block text-[var(--zhr-text-secondary)]">Here are some popular questions to get you started:</span>
                    </div>
                    <time dateTime={sessionStartedAt.toISOString()} className="mt-1.5 block pl-1 text-xs text-[var(--zhr-text-muted)]">
                      {sessionStartedAt.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
                    </time>
                  </div>
                </div>

                <ul className="flex flex-col gap-2" aria-label="Popular questions">
                  {STARTER_PROMPTS.map((p) => (
                    <li key={p}>
                      <button
                        type="button"
                        disabled={!ready}
                        onClick={() => submit(p)}
                        className={`flex min-h-[44px] w-full items-center justify-between gap-3 rounded-full border border-[var(--zhr-chat-border)] bg-white px-5 py-2 text-left text-[15px] text-[var(--zhr-chat-blue)] transition-colors hover:border-[var(--zhr-chat-blue)] hover:bg-[var(--zhr-chat-surface-alt)] disabled:cursor-wait disabled:opacity-60 ${FOCUS_RING}`}
                      >
                        <span>{p}</span>
                        <ChevronRight className="h-4 w-4 shrink-0" aria-hidden="true" />
                      </button>
                    </li>
                  ))}
                </ul>
              </div>

              {/* CH-06 CTA — the in-product equivalent of "Book a demo" is a
                  route to a real person on the HR team. */}
              <div className="flex flex-wrap items-center gap-x-4 gap-y-3 rounded-2xl bg-gradient-to-r from-[#0A4C93] to-[#0B5FCC] p-4 text-white">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white/15">
                  <LifeBuoy className="h-6 w-6" aria-hidden="true" />
                </span>
                <div className="min-w-[150px] flex-1">
                  <p className="text-[17px] font-bold leading-tight">Need help from a person?</p>
                  <p className="mt-0.5 text-[13px] text-white/90">Raise a support request with your HR team.</p>
                </div>
                <button
                  type="button"
                  onClick={() => setSupportRequestOpen(true)}
                  className="inline-flex min-h-[44px] items-center gap-1.5 rounded-full bg-white px-5 text-sm font-semibold text-[var(--zhr-chat-blue)] hover:bg-[#EEF4FC] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
                >
                  Contact HR <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>
            </div>
          )}

          <div role="log" aria-live="polite" aria-relevant="additions" aria-label="Conversation" className="space-y-4 text-[15px]">
            {turns.map((turn) => (
              <div key={turn.id} className="space-y-3">
                <UserMessage text={turn.user_input_text} />
                <AssistantAnswer
                  turn={turn}
                  conversationId={conversationId}
                  isStreaming={streamingTurnId === turn.id}
                  streamingText={streamingTurnId === turn.id ? streamingText : ""}
                  onWorkflowExecuted={() => {}}
                />
              </div>
            ))}
          </div>
        </div>

        {showLatest && (
          <button
            type="button"
            onClick={scrollToBottom}
            className={`absolute bottom-3 left-1/2 flex -translate-x-1/2 items-center gap-1.5 rounded-full border border-[var(--zhr-chat-border)] bg-white px-3.5 py-2 text-[13px] font-semibold text-[var(--zhr-chat-blue)] shadow-md ${FOCUS_RING}`}
          >
            <ArrowDown className="h-4 w-4" aria-hidden="true" /> Latest message
          </button>
        )}
      </div>
      )}

      {/* CH-07 Composer + CH-08 trust footer — always visible. */}
      {!historyOpen && (
        <div className={`shrink-0 border-t border-[var(--zhr-chat-border)] bg-white pt-3 pb-[max(12px,env(safe-area-inset-bottom))] ${gutter}`}>
          <Composer
            value={input}
            onChange={setInput}
            onSubmit={() => submit()}
            disabled={!conversationId}
            busy={sending}
            placeholder="Ask about leave, policies or your HR records…"
            pendingAttachment={pendingAttachment}
            attachmentUploading={attachmentUploading}
            onAttachFile={attachFile}
            onClearAttachment={clearPendingAttachment}
          />
          <div className="mt-2.5 flex items-start gap-2.5 text-xs leading-relaxed text-[var(--zhr-text-muted)]">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <p>
              This AI assistant may make mistakes. Answers use approved Zoiko HR sources and your account permissions —
              check important decisions with your HR team.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
