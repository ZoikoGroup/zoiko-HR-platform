import { useEffect, useRef, useState } from "react";
import { Loader2, X } from "lucide-react";
import zoikoHrIcon from "../../../assets/zoikohr-icon-svg.svg";
import AssistantAnswer, { UserMessage } from "./MessageBubble";
import Composer from "./Composer";
import ScopeSelector from "./ScopeSelector";
import SystemBanner from "./SystemBanner";
import AssistantMenu from "./AssistantMenu";
import HandoffPanel from "./HandoffPanel";
import MyTicketsPanel from "./MyTicketsPanel";
import HistoryRail from "./HistoryRail";
import { createPrivacyRequest } from "../../../service/assistantService";

const WELCOME_PROMPTS = [
  "What is the annual leave policy?",
  "How many leave days do I have left?",
  "Book 2 days of annual leave",
];

/**
 * Presentational conversation canvas — the docked panel's content. State
 * lives in useAssistantConversation() at the launcher level.
 */
export default function ConversationView({
  turns, conversationId, conversations, scope, setScope, teamMembers, capabilities,
  sending, loadingConversation, streamingTurnId, streamingText, degradedMessage, onSend,
  pendingAttachment, attachmentUploading, attachFile, clearPendingAttachment, refreshCapabilities,
  openConversation, removeConversation, renameCurrentConversation,
  compact = false, historyOpen = false, onToggleHistory, onCloseHistory, onNewConversation, onClose,
}) {
  const [input, setInput] = useState("");
  const [supportRequestOpen, setSupportRequestOpen] = useState(false);
  const [myTicketsOpen, setMyTicketsOpen] = useState(false);
  const scrollRef = useRef(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [turns, streamingText]);

  useEffect(() => {
    setSupportRequestOpen(false);
    setMyTicketsOpen(false);
  }, [conversationId]);

  const submit = (text) => {
    const value = text ?? input;
    if (!value.trim()) return;
    setInput("");
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

  return (
    <div className="flex h-full flex-col">
      <div className={`flex items-center justify-between border-b border-[var(--zhr-border-default)] ${compact ? "px-3 py-2.5" : "px-4 py-3"}`}>
        <h3 className="flex items-center gap-2 font-bold text-[var(--zhr-text-primary)]">
          <img src={zoikoHrIcon} alt="" className="h-6 w-6 rounded-lg" /> HR Assistant
        </h3>
        <div className="flex items-center gap-2">
          <ScopeSelector teamMembers={teamMembers} scope={scope} onChange={setScope} />
          <span className={`text-[11px] px-2 py-0.5 rounded-full font-bold ${generationOff ? "text-slate-500 bg-slate-100 border border-slate-200" : "text-emerald-600 bg-emerald-50 border border-emerald-100"}`}>
            {generationOff ? "Paused" : "Online"}
          </span>
          <AssistantMenu
            onOpenHistory={onToggleHistory}
            onNewConversation={onNewConversation}
            onSupportRequest={() => setSupportRequestOpen(true)}
            onMyTickets={() => setMyTicketsOpen(true)}
            onExportData={exportMyData}
            onDeleteData={deleteMyData}
          />
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              aria-label="Close HR Assistant"
              className="flex h-8 w-8 items-center justify-center rounded-lg text-[var(--zhr-text-secondary)] hover:bg-[var(--zhr-surface-panel)]"
            >
              <X className="h-4.5 w-4.5" />
            </button>
          )}
        </div>
      </div>

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
      <div className={`flex-1 overflow-y-auto ${compact ? "px-3 py-3" : "px-4 py-4"}`} ref={scrollRef}>
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
          <div className="flex h-full items-center justify-center text-[var(--zhr-text-muted)]">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        )}

        {!loadingConversation && turns.length === 0 && !degradedMessage && !supportRequestOpen && !myTicketsOpen && (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-center text-[var(--zhr-text-muted)]">
            <img src={zoikoHrIcon} alt="" className="h-12 w-12 rounded-2xl opacity-40" />
            <p className="text-sm">Ask about leave policies, your balance, or book time off.</p>
            <div className="flex flex-wrap justify-center gap-2">
              {WELCOME_PROMPTS.map((p) => (
                <button
                  key={p}
                  onClick={() => submit(p)}
                  className="rounded-full border border-[var(--zhr-border-default)] px-3 py-1.5 text-xs font-semibold text-[var(--zhr-text-secondary)] hover:border-[var(--zhr-border-focus)] hover:text-[var(--zhr-action-primary)]"
                >
                  {p}
                </button>
              ))}
            </div>
            <p className="max-w-xs text-[10px]">
              I use approved Zoiko HR sources and your account permissions — I'll say so if I can't find a reliable answer.
            </p>
          </div>
        )}

        <div className="space-y-4 text-sm">
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
      )}

      {!historyOpen && (
        <div
          className={`${compact ? "px-3" : "px-4"} pt-0 pb-[max(4.5rem,calc(env(safe-area-inset-bottom)+3.75rem))] sm:pb-3`}
        >
          <Composer
            value={input}
            onChange={setInput}
            onSubmit={() => submit()}
            disabled={!conversationId || sending}
            placeholder="Ask about HR..."
            pendingAttachment={pendingAttachment}
            attachmentUploading={attachmentUploading}
            onAttachFile={attachFile}
            onClearAttachment={clearPendingAttachment}
          />
        </div>
      )}
    </div>
  );
}
