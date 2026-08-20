import { AlertCircle, AlertTriangle, ShieldAlert, Loader2, UserCircle2 } from "lucide-react";
import zoikoHrIcon from "../../../assets/zoikohr-icon-svg.svg";
import SourceChip from "./SourceChip";
import FeedbackControl from "./FeedbackControl";
import WorkflowPanel from "./WorkflowPanel";
import HandoffPanel from "./HandoffPanel";

function AssistantAvatar() {
  return (
    <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center overflow-hidden rounded-xl">
      <img src={zoikoHrIcon} alt="" className="h-full w-full object-cover" />
    </div>
  );
}

export function UserMessage({ text }) {
  return (
    <div className="flex gap-3 max-w-[85%] ml-auto flex-row-reverse">
      <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-xl bg-[var(--zhr-action-primary)] text-white text-xs font-bold">U</div>
      <div className="p-3.5 rounded-2xl bg-[var(--zhr-action-primary)] text-white rounded-tr-none">
        <p className="leading-relaxed whitespace-pre-wrap">{text}</p>
      </div>
    </div>
  );
}

export default function AssistantAnswer({ turn, streamingText, isStreaming, conversationId, onWorkflowExecuted }) {
  const inProgress = !turn.completed_at && !streamingText && turn.status !== "failed";

  if (inProgress && !isStreaming) {
    return (
      <div className="flex gap-3 max-w-[85%]">
        <AssistantAvatar />
        <div className="p-3.5 rounded-2xl bg-[var(--zhr-evidence-grounded-bg)] border border-[var(--zhr-evidence-grounded-border)] text-[var(--zhr-text-secondary)] rounded-tl-none flex items-center gap-2 text-xs">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Thinking...
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
    : { bg: "var(--zhr-evidence-grounded-bg)", border: "var(--zhr-evidence-grounded-border)", text: "var(--zhr-evidence-grounded-text)" };

  return (
    <div className="flex gap-3 max-w-[90%]">
      <AssistantAvatar />
      <div className="flex-1 min-w-0">
        {!isStreaming && turn.subject_name && (
          <p className="mb-1 flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-[var(--zhr-text-muted)]">
            <UserCircle2 className="h-3 w-3" /> About {turn.subject_name}
          </p>
        )}
        <div
          style={{ background: bubbleTone.bg, borderColor: bubbleTone.border, color: bubbleTone.text }}
          className="p-3.5 rounded-2xl rounded-tl-none border text-sm leading-relaxed whitespace-pre-wrap"
        >
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
