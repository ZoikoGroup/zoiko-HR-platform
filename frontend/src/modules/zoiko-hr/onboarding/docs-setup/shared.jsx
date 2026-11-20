// Shared pieces of the "Set up docs for your organisation" wizard.
import { AlertCircle, CheckCircle2, Info } from "lucide-react";

export const inputCls = "w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100";

export const STEPS = [
  { n: 1, title: "Upload", help: "Add your documents" },
  { n: 2, title: "Analyse", help: "We read them" },
  { n: 3, title: "Review settings", help: "Accept, edit or reject" },
  { n: 4, title: "Map documents", help: "Your versions and new documents" },
  { n: 5, title: "Documents to collect", help: "What new hires upload" },
  { n: 6, title: "Apply", help: "Confirm the changes" },
];

export const FILE_LABELS = [
  { value: "", label: "Let us work it out" },
  { value: "offer_letter", label: "Offer letter" },
  { value: "contract", label: "Contract" },
  { value: "handbook", label: "Handbook" },
  { value: "policy", label: "Policy" },
  { value: "form", label: "Form" },
  { value: "other", label: "Other" },
];

export const KIND_LABELS = {
  offer_letter: "Offer letter", contract: "Employment contract", nda: "Non-disclosure agreement", handbook: "Handbook",
  policy: "Policy", form: "Form", job_description: "Job description", affidavit: "Affidavit", other: "Other document",
};

export const UNIT_LABELS = { calendar_days: "days", business_days: "working days", weeks: "weeks", months: "months" };

/** A proposed or current value as plain text. */
export function formatValue(v) {
  if (v === null || v === undefined || v === "") return "—";
  if (Array.isArray(v)) return v.join("; ");
  if (typeof v === "object") {
    if ("value" in v && "unit" in v) return `${v.value} ${UNIT_LABELS[v.unit] || v.unit}`;
    if ("label" in v) return [v.label, v.type && v.type !== "text" ? `(${v.type}${v.options ? `: ${v.options.join(", ")}` : ""})` : ""].filter(Boolean).join(" ");
    if ("category" in v) return `${v.category}: ${v.enabled === false ? "switched off" : "on"}`;
    return JSON.stringify(v);
  }
  if (typeof v === "boolean") return v ? "Yes" : "No";
  return String(v);
}

export function Banner({ tone = "info", children }) {
  const styles = {
    info: "border-blue-200 bg-blue-50 text-blue-900",
    ok: "border-emerald-200 bg-emerald-50 text-emerald-800",
    warn: "border-amber-200 bg-amber-50 text-amber-900",
    error: "border-rose-200 bg-rose-50 text-rose-700",
  }[tone];
  const Icon = tone === "ok" ? CheckCircle2 : tone === "info" ? Info : AlertCircle;
  return (
    <div role={tone === "error" ? "alert" : "status"} className={`flex items-start gap-2 rounded-xl border px-3 py-2 text-sm ${styles}`}>
      <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" /><div className="min-w-0 break-words">{children}</div>
    </div>
  );
}

export const errorText = (e, fallback) => {
  const d = e?.detail || e?.data?.detail;
  if (d && typeof d === "object" && d.message) return d.message;
  return e?.message || fallback;
};
