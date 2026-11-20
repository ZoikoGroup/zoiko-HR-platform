import { Globe2, Lock, Users } from "lucide-react";

const ICON = { admin_only: Lock, all_employees: Globe2 };

/**
 * Who can see a company category, folder or file (docs/new_docs/ZHR-DOCS-ARCH-001 §17 A3): "Admin only", "All employees"
 * or "Restricted (N)". Written out, never colour alone.
 * @param {{ access: { visibility: string, label: string, audience_count?: number|null, permission?: string } | null }} props
 */
export default function AccessBadge({ access }) {
  if (!access) return null;
  const Icon = ICON[access.visibility] || Users;
  const restricted = !ICON[access.visibility];
  const tone = access.visibility === "admin_only" ? "bg-slate-100 text-slate-700" : access.visibility === "all_employees" ? "bg-emerald-50 text-emerald-700" : "bg-violet-50 text-violet-700";
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${tone}`}>
      <Icon size={12} aria-hidden="true" />
      {access.label}{restricted && typeof access.audience_count === "number" ? ` (${access.audience_count})` : ""}
      {access.permission === "view" && access.visibility !== "admin_only" && <span className="font-normal"> · view only</span>}
    </span>
  );
}
