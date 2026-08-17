import { useEffect, useRef, useState } from "react";
import { Bot, Loader2 } from "lucide-react";
import AssistantAnswer, { UserMessage } from "./MessageBubble";
import Composer from "./Composer";
import ScopeSelector from "./ScopeSelector";
import SystemBanner from "./SystemBanner";
import AssistantMenu from "./AssistantMenu";
import HandoffPanel from "./HandoffPanel";

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
  turns, conversationId, scope, setScope, teamMembers, capabilities,
  sending, loadingConversation, streamingTurnId, streamingText, degradedMessage, onSend,
  compact = false, onToggleHistory, onNewConversation,
}) {
  const [input, setInput] = useState("");
  const [supportRequestOpen, setSupportRequestOpen] = useState(false);
  const scrollRef = useRef(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [turns, streamingText]);

  useEffect(() => {
    setSupportRequestOpen(false);
  }, [conversationId]);

  const submit = (text) => {
    const value = text ?? input;
    if (!value.trim()) return;
    setInput("");
    onSend(value);
  };

  const generationOff = capabilities && !capabilities.generation_enabled;

  return (
    <div className="flex h-full flex-col">
      <div className={`flex items-center justify-between border-b border-[var(--zhr-border-default)] ${compact ? "px-3 py-2.5" : "px-4 py-3"}`}>
        <h3 className="flex items-center gap-2 font-bold text-[var(--zhr-text-primary)]">
          <Bot className="h-5 w-5 text-[var(--zhr-action-primary)]" /> HR Assistant
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
          />
        </div>
      </div>

      <div className={`flex-1 overflow-y-auto ${compact ? "px-3 py-3" : "px-4 py-4"}`} ref={scrollRef}>
        <SystemBanner capabilities={capabilities} errorMessage={degradedMessage} />

        {supportRequestOpen && (
          <HandoffPanel
            conversationId={conversationId}
            turnId={null}
            defaultSummary=""
            onClose={() => setSupportRequestOpen(false)}
          />
        )}

        {loadingConversation && (
          <div className="flex h-full items-center justify-center text-[var(--zhr-text-muted)]">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        )}

        {!loadingConversation && turns.length === 0 && !degradedMessage && !supportRequestOpen && (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-center text-[var(--zhr-text-muted)]">
            <Bot className="h-10 w-10 text-[var(--zhr-border-default)]" />
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

      <div className={compact ? "px-3 pb-3" : "px-4 pb-4"}>
        <Composer
          value={input}
          onChange={setInput}
          onSubmit={() => submit()}
          disabled={!conversationId || sending}
          placeholder="Ask about HR..."
        />
      </div>
    </div>
  );
}
