import React, { useState } from "react";
import { useAuth } from "../../context/AuthContext";
import { ROLES } from "../../config/roles";
import { formatDateTime } from "../../utils/dateTime";

// Small shared building blocks for the Connect / Hub / Workflow pages.

export function fmt(value) {
  return value ? formatDateTime(value) : "—";
}

export function useIsSuperAdmin() {
  const { user } = useAuth();
  return user?.role === ROLES.SUPER_ADMIN;
}

export function SuperAdminOnly({ children }) {
  const allowed = useIsSuperAdmin();
  if (allowed) return children;
  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-6 text-sm text-slate-500 shadow-sm">
      This page is available to platform super admins only.
    </div>
  );
}

const TONES = {
  green: "bg-emerald-50 text-emerald-700 border-emerald-100",
  amber: "bg-amber-50 text-amber-700 border-amber-100",
  red: "bg-red-50 text-red-600 border-red-100",
  slate: "bg-slate-100 text-slate-500 border-slate-200",
  blue: "bg-blue-50 text-blue-700 border-blue-100",
};

const STATUS_TONE = {
  Connected: "green", Active: "green", succeeded: "green", success: "green",
  "Configured (untested)": "amber", "Configured, disabled": "amber", "Configured (no traffic)": "amber",
  waiting: "amber", pending: "amber",
  Error: "red", failed: "red", "Auto-disabled": "red", approved: "green", rejected: "red", Approved: "green", Paid: "green", Pending: "amber", Rejected: "red", Inactive: "slate",
  running: "blue",
};

export function StatusPill({ status }) {
  const tone = TONES[STATUS_TONE[status] || "slate"];
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${tone}`}>
      {status}
    </span>
  );
}

export function Card({ title, icon: Icon, action, children }) {
  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h3 className="flex items-center gap-2 text-lg font-bold text-slate-800">
          {Icon ? <Icon className="h-5 w-5 text-[#3B82F6]" /> : null}
          {title}
        </h3>
        {action}
      </div>
      {children}
    </section>
  );
}

export function Btn({ children, tone = "default", className = "", ...props }) {
  const styles = {
    default: "border-slate-200 bg-white text-slate-700 hover:bg-slate-50",
    primary: "border-[#3B82F6] bg-[#3B82F6] text-white hover:bg-blue-600",
    danger: "border-red-200 bg-white text-red-600 hover:bg-red-50",
  };
  return (
    <button
      type="button"
      {...props}
      className={`inline-flex items-center justify-center gap-1.5 rounded-full border px-4 py-1.5 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${styles[tone]} ${className}`}
    >
      {children}
    </button>
  );
}

export function Modal({ title, onClose, children, wide = false }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4" role="dialog" aria-modal="true">
      <div className={`max-h-[90vh] w-full overflow-y-auto rounded-3xl bg-white p-6 shadow-xl ${wide ? "max-w-3xl" : "max-w-lg"}`}>
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-bold text-slate-800">{title}</h3>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-600" aria-label="Close">×</button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Field({ label, hint, children }) {
  return (
    <label className="mb-3 block text-xs font-semibold text-slate-600">
      {label}
      <div className="mt-1 font-normal">{children}</div>
      {hint ? <span className="mt-1 block text-[11px] font-normal text-slate-400">{hint}</span> : null}
    </label>
  );
}

export const inputCls =
  "w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-800 focus:border-[#3B82F6] focus:outline-none";

export function ErrorNote({ message }) {
  if (!message) return null;
  return <div className="mb-3 rounded-xl border border-red-100 bg-red-50 p-3 text-xs text-red-600">{message}</div>;
}

export function Spinner() {
  return (
    <div className="flex items-center justify-center py-16">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-[#3B82F6] border-t-transparent" />
    </div>
  );
}

/** Runs an async action once at a time; exposes pending + error for disabling buttons. */
export function useAction() {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  async function run(fn) {
    if (pending) return undefined;
    setPending(true);
    setError("");
    try {
      return await fn();
    } catch (e) {
      setError(e?.message || "Something went wrong.");
      return undefined;
    } finally {
      setPending(false);
    }
  }
  return { pending, error, setError, run };
}
