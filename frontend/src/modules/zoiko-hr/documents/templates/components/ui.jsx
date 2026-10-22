// Shared building blocks for the document template pages (library, detail, editor, clauses, packs).
import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, Check, Loader2, Lock, X } from "lucide-react";
import { useAuth } from "../../../../../context/AuthContext";
import { Modal } from "../../../../../components/billing-ui";

export const TEMPLATES_PATH = "/zoiko-hr/documents/templates";
export const PACKS_PATH = "/zoiko-hr/documents/jurisdiction-packs";
export const CLAUSES_PATH = "/zoiko-hr/documents/clauses";
export const GOVERNANCE_PATH = "/zoiko-hr/documents/governance";
export const templatePath = (canonicalId) => `${TEMPLATES_PATH}/${encodeURIComponent(canonicalId)}`;
export const editorPath = (variantId) => `${TEMPLATES_PATH}/variants/${variantId}`;

export const inputClass =
  "w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-800 placeholder:text-gray-400 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-500/30 disabled:bg-gray-50 disabled:text-gray-500";
export const btnPrimary =
  "inline-flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50";
export const btnSecondary =
  "inline-flex items-center justify-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50";
export const btnDanger =
  "inline-flex items-center justify-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm font-semibold text-red-700 hover:bg-red-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50";
export const btnSmall =
  "inline-flex items-center justify-center gap-1.5 rounded-md border border-gray-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-50";
export const btnIcon =
  "inline-flex items-center justify-center rounded-md p-1.5 text-gray-500 hover:bg-gray-100 hover:text-gray-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-40";
export const cardClass = "rounded-xl border border-gray-200 bg-white p-5 shadow-sm";

// ── current user ───────────────────────────────────────────────────────────────────────────────────────────────────
export function useCurrentUser() {
  const { user, role } = useAuth();
  // The backend compares typed names with "first_name last_name", so prefer that over any display name.
  const fullName = [user?.first_name, user?.last_name].filter(Boolean).join(" ") || user?.full_name || user?.name || "";
  return { id: user?.id ?? null, role: role || user?.role || null, fullName, isOrgAdmin: (role || user?.role) === "admin" };
}

// ── formatting ─────────────────────────────────────────────────────────────────────────────────────────────────────
export function fmtDate(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? String(iso) : d.toLocaleDateString();
}
export function fmtDateTime(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? String(iso) : d.toLocaleString();
}

export function errorMessage(err) {
  if (!err) return "";
  if (err.code === "SEPARATION_OF_DUTIES") return `Separation of duties: ${err.message}`;
  return err.message || "Something went wrong.";
}

export function errorProblems(err) {
  const p = err?.detail?.problems;
  return Array.isArray(p) ? p : [];
}

// ── badges ─────────────────────────────────────────────────────────────────────────────────────────────────────────
const TONES = {
  gray: "bg-gray-100 text-gray-700 border-gray-200",
  blue: "bg-blue-50 text-blue-700 border-blue-200",
  green: "bg-emerald-50 text-emerald-700 border-emerald-200",
  amber: "bg-amber-50 text-amber-800 border-amber-200",
  red: "bg-red-50 text-red-700 border-red-200",
  purple: "bg-violet-50 text-violet-700 border-violet-200",
  slate: "bg-slate-100 text-slate-700 border-slate-300",
};

export function Badge({ tone = "gray", children, title, className = "" }) {
  return (
    <span title={title} className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] font-semibold ${TONES[tone] || TONES.gray} ${className}`}>
      {children}
    </span>
  );
}

const RISK_TONE = { L1: "green", L2: "amber", L3: "red" };
const RISK_LABEL = { L1: "Low risk", L2: "Medium risk", L3: "High risk" };
export function RiskBadge({ value }) {
  if (!value) return null;
  return <Badge tone={RISK_TONE[value]} title={`Legal risk ${value}`}>{value} · {RISK_LABEL[value] || "Risk"}</Badge>;
}

const SENS_TONE = { C2: "blue", C3: "amber", C4: "red" };
export function SensitivityBadge({ value }) {
  if (!value) return null;
  return <Badge tone={SENS_TONE[value] || "gray"} title="Data sensitivity">Sensitivity {value}</Badge>;
}

export function ReleaseModeBadge({ mode }) {
  if (mode === "TENANT_ATTESTED") return <Badge tone="purple">Organization-approved</Badge>;
  if (mode === "PLATFORM_COUNSEL") return <Badge tone="blue">Platform counsel</Badge>;
  return null;
}

const STATUS_TONE = {
  IN_DRAFT: "gray", DRAFT: "gray", LEGAL_REVIEW: "amber", LEGAL_APPROVED: "blue", RELEASE_TESTED: "blue",
  ACTIVE: "green", SUSPENDED: "red", RETIRED: "slate",
};
const STATUS_LABEL = {
  IN_DRAFT: "Draft", DRAFT: "Draft", LEGAL_REVIEW: "In legal review", LEGAL_APPROVED: "Legally approved",
  RELEASE_TESTED: "Release tested", ACTIVE: "Active", SUSPENDED: "Suspended", RETIRED: "Retired",
};
export function StatusBadge({ status }) {
  if (!status) return null;
  return <Badge tone={STATUS_TONE[status] || "gray"}>{STATUS_LABEL[status] || status}</Badge>;
}

const CLASS_TONE = {
  PLATFORM_META: "slate", PERSONAL_BASIC: "blue", PERSONAL_CONFIDENTIAL: "amber", FINANCIAL: "amber",
  SPECIAL_CATEGORY: "red", TENANT_CUSTOMER: "purple",
};
export function ClassificationBadge({ value }) {
  if (!value) return null;
  return <Badge tone={CLASS_TONE[value] || "gray"} title="Data classification">{String(value).replaceAll("_", " ").toLowerCase()}</Badge>;
}

export function LockedBadge() {
  return (
    <Badge tone="slate" title="This block is locked and cannot be edited, moved out or removed">
      <Lock className="h-3 w-3" aria-hidden="true" /> Locked
    </Badge>
  );
}

// ── feedback ───────────────────────────────────────────────────────────────────────────────────────────────────────
export function useToast() {
  const [toast, setToast] = useState(null);
  const timer = useRef(null);
  const show = useCallback((type, msg) => {
    setToast({ type, msg });
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setToast(null), 4000);
  }, []);
  useEffect(() => () => clearTimeout(timer.current), []);
  const node = toast ? (
    <div role="status" aria-live="polite"
      className={`fixed bottom-6 right-6 z-[120] flex max-w-md items-center gap-2 rounded-xl px-4 py-3 text-sm font-medium text-white shadow-lg ${toast.type === "success" ? "bg-emerald-600" : "bg-rose-600"}`}>
      {toast.type === "success" ? <Check className="h-4 w-4 shrink-0" /> : <X className="h-4 w-4 shrink-0" />}
      <span>{toast.msg}</span>
    </div>
  ) : null;
  return [node, show];
}

export function ErrorBanner({ error, problems, onDismiss, title }) {
  if (!error && !(problems && problems.length)) return null;
  return (
    <div role="alert" className="mb-4 flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        {title && <p className="font-semibold">{title}</p>}
        {error && <p>{error}</p>}
        {problems?.length > 0 && (
          <ul className="mt-1 list-disc space-y-0.5 pl-5">
            {problems.map((p, i) => <li key={i}>{typeof p === "string" ? p : JSON.stringify(p)}</li>)}
          </ul>
        )}
      </div>
      {onDismiss && (
        <button type="button" onClick={onDismiss} aria-label="Dismiss message" className={btnIcon}>
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}

export function InfoBanner({ children, tone = "blue", icon: Icon = AlertTriangle }) {
  const tones = {
    blue: "border-blue-200 bg-blue-50 text-blue-900",
    amber: "border-amber-200 bg-amber-50 text-amber-900",
    gray: "border-gray-200 bg-gray-50 text-gray-700",
  };
  return (
    <div className={`mb-4 flex items-start gap-3 rounded-xl border px-4 py-3 text-sm ${tones[tone] || tones.blue}`}>
      <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

export function Spinner({ label = "Loading…" }) {
  return (
    <div className="flex items-center justify-center gap-2 py-12 text-sm text-gray-500" role="status">
      <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" /> {label}
    </div>
  );
}

export function Labeled({ id, label, hint, required, children, className = "" }) {
  return (
    <div className={className}>
      <label htmlFor={id} className="mb-1 block text-xs font-semibold text-gray-600">
        {label}{required && <span className="ml-0.5 text-red-600" aria-hidden="true">*</span>}
        {required && <span className="sr-only"> (required)</span>}
      </label>
      {children}
      {hint && <p className="mt-1 text-xs text-gray-500">{hint}</p>}
    </div>
  );
}

// A modal asking for a free-text reason (suspend / retire).
export function ReasonModal({ open, title, description, confirmLabel = "Confirm", onClose, onConfirm, busy }) {
  const [reason, setReason] = useState("");
  useEffect(() => { if (open) setReason(""); }, [open]);
  return (
    <Modal open={open} onClose={onClose} title={title} description={description} size="sm"
      footer={<>
        <button type="button" className={btnSecondary} onClick={onClose}>Cancel</button>
        <button type="button" className={btnDanger} disabled={!reason.trim() || busy} onClick={() => onConfirm(reason.trim())}>
          {busy && <Loader2 className="h-4 w-4 animate-spin" />} {confirmLabel}
        </button>
      </>}>
      <Labeled id="reason-input" label="Reason" required hint="Recorded in the audit trail.">
        <textarea id="reason-input" rows={3} className={inputClass} value={reason} onChange={(e) => setReason(e.target.value)} />
      </Labeled>
    </Modal>
  );
}

// Explains why the current user cannot act; buttons stay disabled but the server remains the source of truth.
export function DutyNote({ children }) {
  if (!children) return null;
  return <p className="mt-1 text-xs text-amber-700">{children}</p>;
}
