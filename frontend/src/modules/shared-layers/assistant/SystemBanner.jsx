import { useState } from "react";
import { AlertTriangle, Info } from "lucide-react";
import { liftRestriction } from "../../../service/assistantService";

/**
 * WF-14 degraded/service-unavailable: states exactly which capability is
 * unavailable rather than a generic "something went wrong" — precision the
 * spec explicitly calls for over vague status copy.
 */
export default function SystemBanner({ capabilities, errorMessage, onRestrictionLifted }) {
  const [undoing, setUndoing] = useState(false);

  if (errorMessage) {
    return (
      <div className="mb-3 flex items-center gap-2 rounded-xl border border-red-100 bg-red-50 p-3 text-xs font-semibold text-red-600">
        <AlertTriangle className="h-4 w-4 shrink-0" /> {errorMessage}
      </div>
    );
  }

  if (!capabilities || (capabilities.generation_enabled && capabilities.actions_enabled)) return null;

  const available = [];
  const unavailable = [];
  (capabilities.generation_enabled ? available : unavailable).push("policy answers");
  (capabilities.actions_enabled ? available : unavailable).push("actions (e.g. booking leave)");
  available.push("your personal HR records");

  return (
    <div className="mb-3 rounded-xl border border-amber-100 bg-amber-50 p-3 text-xs text-amber-800">
      <p className="flex items-center gap-2 font-bold">
        <Info className="h-4 w-4 shrink-0" /> HR Assistant is temporarily limited
      </p>
      <p className="mt-1">
        <span className="font-semibold">Available:</span> {available.join(", ")}.{" "}
        <span className="font-semibold">Unavailable:</span> {unavailable.join(", ")}.
      </p>
      {capabilities.employee_restricted && (
        <div className="mt-2">
          <p>This is because you submitted a data-privacy request to restrict assistant processing.</p>
          <button
            type="button"
            disabled={undoing}
            onClick={async () => {
              setUndoing(true);
              try {
                await liftRestriction();
                onRestrictionLifted?.();
              } finally {
                setUndoing(false);
              }
            }}
            className="mt-1.5 rounded-full border border-amber-300 px-3 py-1 text-[11px] font-bold text-amber-800 hover:bg-amber-100 disabled:opacity-50"
          >
            {undoing ? "Undoing..." : "Undo restriction"}
          </button>
        </div>
      )}
    </div>
  );
}
