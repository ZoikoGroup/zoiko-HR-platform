import { AlertCircle, AlertTriangle, ShieldAlert, Loader2, UserCircle2 } from "lucide-react";
import zoikoHrIcon from "../../../assets/zoikohr-icon-svg.svg";
import SourceChip from "./SourceChip";
import FeedbackControl from "./FeedbackControl";
import WorkflowPanel from "./WorkflowPanel";
import HandoffPanel from "./HandoffPanel";

// Wireframe CH-04: a small 24px inline identity mark beside bot messages.
function AssistantAvatar() {
  return <img src={zoikoHrIcon} alt="" className="h-6 w-6 flex-shrink-0" />;
}

export function UserMessage({ text }) {
  return (
    <div className="ml-auto max-w-[85%]">
      <span className="sr-only">You said: </span>
      <p className="whitespace-pre-wrap break-words rounded-2xl rounded-tr-md bg-[var(--zhr-chat-blue)] px-4 py-2.5 leading-relaxed text-white">
        {text}
      </p>
    </div>
  );
}

export default function AssistantAnswer({ turn, streamingText, isStreaming, conversationId, onWorkflowExecuted }) {
  const inProgress = !turn.completed_at && !streamingText && turn.status !== "failed";

  if (inProgress && !isStreaming) {
    return (
      <div className="flex items-start gap-2.5 max-w-[85%]">
        <AssistantAvatar />
        <div role="status" className="px-4 py-3 rounded-2xl rounded-tl-md bg-[var(--zhr-chat-bubble)] text-[var(--zhr-text-secondary)] flex items-center gap-2 text-xs">
          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> Zoiko HR Assistant is responding…
        </div>
      </div>
    );
  }

  const displayText = isStreaming ? streamingText : turn.answer_text;
  const answerType = turn.answer_type;
  const isConflict = !isStreaming && turn.confidence_state === "conflict";
  const isNoAnswer = answerType === "no_answer";
  const isRestricted = answerType === "restricted";
  const showHandoff = !isStreaming && (isNoAnswer || isConflict || isRestricted);
  const handoffReason = isRestricted ? "restricted" : isConflict ? "conflict" : "no_reliable_answer";

  const bubbleTone = isConflict || isNoAnswer
    ? { bg: "var(--zhr-evidence-partial-bg)", border: "var(--zhr-evidence-partial-border)", text: "var(--zhr-evidence-partial-text)" }
    : isRestricted
    ? { bg: "var(--zhr-evidence-unavailable-bg)", border: "var(--zhr-evidence-unavailable-border)", text: "var(--zhr-evidence-unavailable-text)" }
    : { bg: "var(--zhr-chat-bubble)", border: "var(--zhr-chat-bubble)", text: "var(--zhr-evidence-grounded-text)" };

  return (
    <div className="flex items-start gap-2.5 max-w-[92%]">
      <AssistantAvatar />
      <div className="flex-1 min-w-0">
        {!isStreaming && turn.subject_name && (
          <p className="mb-1 flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-[var(--zhr-text-muted)]">
            <UserCircle2 className="h-3 w-3" /> About {turn.subject_name}
          </p>
        )}
        <div
          style={{ background: bubbleTone.bg, borderColor: bubbleTone.border, color: bubbleTone.text }}
          className="px-4 py-3 rounded-2xl rounded-tl-md border leading-relaxed whitespace-pre-wrap break-words"
        >
          <span className="sr-only">Zoiko HR Assistant (AI) said: </span>
          {isConflict && (
            <p className="mb-1.5 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide">
              <AlertTriangle className="h-3.5 w-3.5" /> Sources conflict
            </p>
          )}
          {isNoAnswer && !isConflict && (
            <p className="mb-1.5 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide">
              <AlertCircle className="h-3.5 w-3.5" /> No reliable answer
            </p>
          )}
          {isRestricted && (
            <p className="mb-1.5 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide">
              <ShieldAlert className="h-3.5 w-3.5" /> Restricted
            </p>
          )}
          {turn.status === "failed" ? (turn.error_message || "The assistant hit an error. Please try again.") : displayText}
        </div>

        {turn.sources?.length > 0 && !isStreaming && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {turn.sources.map((s, i) => <SourceChip key={i} source={s} />)}
          </div>
        )}

        {turn.workflow_id && !isStreaming && (
          <WorkflowPanel workflowId={turn.workflow_id} onExecuted={onWorkflowExecuted} />
        )}

        {showHandoff && (
          <HandoffPanel conversationId={conversationId} turnId={turn.id} defaultSummary={turn.user_input_text} reason={handoffReason} />
        )}

        {turn.status === "completed" && !isStreaming && (
          <div className="mt-2">
            <FeedbackControl turnId={turn.id} />
          </div>
        )}
      </div>
    </div>
  );
}
