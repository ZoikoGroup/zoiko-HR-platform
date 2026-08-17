import { AlertTriangle, Info } from "lucide-react";

/**
 * WF-14 degraded/service-unavailable: states exactly which capability is
 * unavailable rather than a generic "something went wrong" — precision the
 * spec explicitly calls for over vague status copy.
 */
export default function SystemBanner({ capabilities, errorMessage }) {
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
    </div>
  );
}
