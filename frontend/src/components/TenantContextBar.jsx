import React, { useContext } from "react";
import { AuthContext } from "../context/AuthContext";
import { X } from "lucide-react";

/**
 * Displays the current tenant (organization) context when a Super Admin
 * is acting on behalf of a customer. Shows the organization name and an
 * "Exit" button that triggers an audit event and clears the context.
 */
export default function TenantContextBar({ onExit }) {
  const { tenant } = useContext(AuthContext);

  if (!tenant) return null; // hidden when not in tenant context

  const handleExit = () => {
    // TODO: dispatch audit event "context.exited"
    if (onExit) onExit();
  };

  return (
    <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-4 py-2 text-sm text-slate-600 font-sans">
      <span>
        Viewing: <strong className="text-slate-900">{tenant.name}</strong>
      </span>
      <button
        onClick={handleExit}
        className="inline-flex items-center gap-1 rounded-full bg-slate-200 px-3 py-1 text-xs text-slate-700 hover:bg-slate-300 transition"
        aria-label="Exit tenant context"
      >
        <X className="h-3 w-3" /> Exit
      </button>
    </div>
  );
}
