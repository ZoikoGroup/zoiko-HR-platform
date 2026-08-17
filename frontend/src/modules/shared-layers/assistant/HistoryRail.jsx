import { useState } from "react";
import { MessageSquare, Trash2, Pencil, Check, X } from "lucide-react";

function timeLabel(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  return sameDay
    ? d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    : d.toLocaleDateString([], { month: "short", day: "numeric" });
}

/**
 * WF-11 Conversation History and Session Controls. Compact list — resume,
 * rename, delete. Auto-generated titles (conversation.title is null until
 * renamed) fall back to "New chat" rather than showing raw content.
 */
export default function HistoryRail({ conversations, activeId, onSelect, onRename, onDelete }) {
  const [editingId, setEditingId] = useState(null);
  const [editValue, setEditValue] = useState("");

  const startEdit = (conv) => {
    setEditingId(conv.id);
    setEditValue(conv.title || "");
  };

  const commitEdit = async () => {
    if (editValue.trim()) await onRename(editingId, editValue.trim());
    setEditingId(null);
  };

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-[var(--zhr-border-default)] p-3 pr-9">
        <h4 className="text-xs font-bold uppercase tracking-wide text-[var(--zhr-text-muted)]">Conversations</h4>
      </div>
      <div className="flex-1 overflow-y-auto p-1.5 space-y-0.5">
        {conversations.length === 0 && (
          <p className="p-3 text-center text-[11px] text-[var(--zhr-text-muted)]">No conversations yet.</p>
        )}
        {conversations.map((conv) => (
          <div
            key={conv.id}
            className={`group flex items-center gap-1.5 rounded-lg px-2 py-2 text-xs cursor-pointer ${
              conv.id === activeId ? "bg-[var(--zhr-action-primary)]/10 text-[var(--zhr-action-primary)]" : "hover:bg-[var(--zhr-surface-panel)] text-[var(--zhr-text-secondary)]"
            }`}
            onClick={() => editingId !== conv.id && onSelect(conv.id)}
          >
            <MessageSquare className="h-3.5 w-3.5 shrink-0" />
            {editingId === conv.id ? (
              <input
                autoFocus
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                onClick={(e) => e.stopPropagation()}
                onKeyDown={(e) => e.key === "Enter" && commitEdit()}
                className="min-w-0 flex-1 rounded border border-[var(--zhr-border-focus)] px-1 py-0.5 text-[11px]"
              />
            ) : (
              <span className="min-w-0 flex-1 truncate font-semibold">{conv.title || "New chat"}</span>
            )}
            <span className="shrink-0 text-[10px] text-[var(--zhr-text-muted)]">{timeLabel(conv.updated_at || conv.created_at)}</span>
            {editingId === conv.id ? (
              <>
                <button onClick={(e) => { e.stopPropagation(); commitEdit(); }} className="shrink-0 opacity-70 hover:opacity-100"><Check className="h-3 w-3" /></button>
                <button onClick={(e) => { e.stopPropagation(); setEditingId(null); }} className="shrink-0 opacity-70 hover:opacity-100"><X className="h-3 w-3" /></button>
              </>
            ) : (
              <div className="hidden shrink-0 items-center gap-1 group-hover:flex">
                <button onClick={(e) => { e.stopPropagation(); startEdit(conv); }} aria-label="Rename" className="opacity-70 hover:opacity-100"><Pencil className="h-3 w-3" /></button>
                <button onClick={(e) => { e.stopPropagation(); onDelete(conv.id); }} aria-label="Delete" className="opacity-70 hover:opacity-100 hover:text-red-600"><Trash2 className="h-3 w-3" /></button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
