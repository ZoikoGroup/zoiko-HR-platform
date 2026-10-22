// Shared building blocks for the generated-documents, policy-distribution and governance pages: dates in the viewer's
// timezone, status chips (text + colour), a local toast, a reason prompt, the governance RecordView, export buttons and an
// employee picker. Kept here so the three pages stay consistent without touching the shared component library.
import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, Check, Download, FileText, Loader2, X } from "lucide-react";
import { Modal } from "../../../../components/billing-ui";
import { getHrEmployees } from "../../../../service/hrService";
import { exportGovernance } from "../../../../service/docTemplatesService";

// ── dates ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
// The backend stores UTC without an offset ("2026-10-21T09:00:00"): read such values as UTC, date-only values as a local day.
export function toDate(value) {
  if (value === null || value === undefined || value === "") return null;
  if (value instanceof Date) return value;
  const s = String(value);
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (dateOnly) return new Date(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3]));
  const hasZone = /(Z|[+-]\d{2}:?\d{2})$/i.test(s);
  const d = new Date(hasZone ? s : `${s.replace(" ", "T")}Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function fmtDateTime(value) {
  const d = toDate(value);
  return d ? d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : "—";
}

export function fmtDate(value) {
  const d = toDate(value);
  return d ? d.toLocaleDateString(undefined, { dateStyle: "medium" }) : "—";
}

// ── statuses ──────────────────────────────────────────────────────────────────────────────────────────────────────────
const TONES = {
  slate: "bg-slate-100 text-slate-700 border-slate-200",
  blue: "bg-blue-50 text-blue-800 border-blue-200",
  amber: "bg-amber-50 text-amber-800 border-amber-200",
  green: "bg-emerald-50 text-emerald-800 border-emerald-200",
  red: "bg-red-50 text-red-800 border-red-200",
  violet: "bg-violet-50 text-violet-800 border-violet-200",
};

export const DOCUMENT_STATUSES = {
  REQUESTED: ["Requested", "slate"],
  CONTEXT_VALIDATED: ["Checked", "slate"],
  RENDERED_DRAFT: ["Draft", "slate"],
  PENDING_APPROVAL: ["Awaiting approval", "amber"],
  HUMAN_APPROVED: ["Approved", "blue"],
  ISSUED: ["Issued", "blue"],
  ACKNOWLEDGED: ["Acknowledged", "green"],
  EXECUTED: ["Executed", "green"],
  DECLINED: ["Declined", "red"],
  REJECTED: ["Rejected", "red"],
  CANCELLED: ["Cancelled", "slate"],
  EXPIRED: ["Expired", "amber"],
  CORRECTED: ["Corrected", "violet"],
  SUPERSEDED: ["Superseded", "violet"],
  RETAINED: ["Retained", "slate"],
  LEGAL_HOLD: ["Legal hold", "red"],
};

const OTHER_STATUSES = {
  DRAFT: ["Draft", "slate"],
  PUBLISHED: ["Published", "green"],
  CLOSED: ["Closed", "slate"],
  OPEN: ["Open", "amber"],
  RENEWED: ["Renewed", "green"],
  WAIVED: ["Waived", "slate"],
  PENDING: ["Pending", "amber"],
  SIGNED: ["Signed", "green"],
  ERROR: ["Error", "red"],
  APPROVED: ["Approved", "green"],
  ALLOW: ["Allowed", "green"],
  DENY: ["Blocked", "red"],
  NEEDS_LEGAL_REVIEW: ["Needs legal review", "amber"],
  PASS: ["Pass", "green"],
  FAIL: ["Fail", "red"],
  GENERATED: ["Generated", "green"],
  BLOCKED: ["Blocked", "red"],
};

export function StatusChip({ status, className = "" }) {
  const [label, tone] = DOCUMENT_STATUSES[status] || OTHER_STATUSES[status] || [status ? String(status).replace(/_/g, " ").toLowerCase() : "—", "slate"];
  return (
    <span className={`inline-flex items-center whitespace-nowrap rounded-full border px-2 py-0.5 text-xs font-semibold capitalize ${TONES[tone]} ${className}`}>
      {label}
    </span>
  );
}

// ── toast (no provider is mounted in the app) ─────────────────────────────────────────────────────────────────────────
export function useToast() {
  const [toast, setToast] = useState(null);
  const timer = useRef(null);
  const showToast = useCallback((type, msg) => {
    clearTimeout(timer.current);
    setToast({ type, msg });
    timer.current = setTimeout(() => setToast(null), 4000);
  }, []);
  useEffect(() => () => clearTimeout(timer.current), []);
  return [toast, showToast];
}

export function Toast({ toast }) {
  if (!toast) return null;
  return (
    <div
      role="status"
      aria-live="polite"
      className={`fixed bottom-6 right-6 z-[120] flex max-w-sm items-center gap-2 rounded-xl px-4 py-3 text-sm font-medium text-white shadow-lg ${toast.type === "success" ? "bg-emerald-700" : "bg-rose-700"}`}
    >
      {toast.type === "success" ? <Check className="h-4 w-4 shrink-0" aria-hidden="true" /> : <X className="h-4 w-4 shrink-0" aria-hidden="true" />}
      {toast.msg}
    </div>
  );
}

// ── small UI pieces ───────────────────────────────────────────────────────────────────────────────────────────────────
export const inputCls =
  "w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-500/30";

export function PrimaryButton({ children, loading, icon: Icon, className = "", ...rest }) {
  return (
    <button
      type="button"
      disabled={loading || rest.disabled}
      className={`inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60 ${className}`}
      {...rest}
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : Icon ? <Icon className="h-4 w-4" aria-hidden="true" /> : null}
      {children}
    </button>
  );
}

const SECONDARY_TONES = {
  default: "border-gray-200 bg-white text-slate-700 hover:bg-slate-50",
  danger: "border-red-200 bg-red-50 text-red-800 hover:bg-red-100",
};

export function SecondaryButton({ children, loading, icon: Icon, tone = "default", className = "", ...rest }) {
  return (
    <button
      type="button"
      disabled={loading || rest.disabled}
      className={`inline-flex items-center justify-center gap-2 rounded-xl border px-3 py-2 text-sm font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60 ${SECONDARY_TONES[tone]} ${className}`}
      {...rest}
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : Icon ? <Icon className="h-4 w-4" aria-hidden="true" /> : null}
      {children}
    </button>
  );
}

export function ErrorBanner({ error, className = "" }) {
  if (!error) return null;
  return (
    <div role="alert" className={`flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-800 ${className}`}>
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      <span>{typeof error === "string" ? error : error.message || "Something went wrong."}</span>
    </div>
  );
}

export function Card({ title, actions, children, className = "" }) {
  return (
    <section className={`rounded-xl border border-gray-200 bg-white ${className}`}>
      {(title || actions) && (
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-100 px-4 py-3">
          {title && <h2 className="text-sm font-semibold text-slate-800">{title}</h2>}
          {actions}
        </div>
      )}
      <div className="p-4">{children}</div>
    </section>
  );
}

// A modal that asks for a comment / reason before running an action. `onSubmit(text)` may throw; the error is shown inline.
export function ReasonModal({ open, title, description, label = "Reason", required = true, confirmLabel = "Confirm", danger = false, onSubmit, onClose }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  useEffect(() => {
    if (open) { setText(""); setError(null); setBusy(false); }
  }, [open]);

  const submit = async () => {
    if (required && !text.trim()) { setError("Please enter a " + label.toLowerCase() + "."); return; }
    setBusy(true); setError(null);
    try {
      await onSubmit(text.trim());
    } catch (e) {
      setError(e);
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={busy ? undefined : onClose}
      title={title}
      description={description}
      size="md"
      footer={
        <>
          <SecondaryButton onClick={onClose} disabled={busy}>Cancel</SecondaryButton>
          {danger ? (
            <SecondaryButton tone="danger" loading={busy} onClick={submit}>{confirmLabel}</SecondaryButton>
          ) : (
            <PrimaryButton loading={busy} onClick={submit}>{confirmLabel}</PrimaryButton>
          )}
        </>
      }
    >
      <label htmlFor="reason-modal-text" className="mb-1.5 block text-sm font-medium text-slate-700">
        {label}{required && <span className="text-red-600"> (required)</span>}
      </label>
      <textarea
        id="reason-modal-text"
        rows={4}
        value={text}
        onChange={(e) => setText(e.target.value)}
        maxLength={2000}
        className={inputCls}
      />
      <ErrorBanner error={error} className="mt-3" />
    </Modal>
  );
}

// ── governance records ────────────────────────────────────────────────────────────────────────────────────────────────
// sections: ["heading", text, level] | ["paragraph", text, style] | ["kv", [[label, value], ...]] | ["table", columns, rows]
function cellText(v) {
  if (v === null || v === undefined || v === "") return "—";
  if (typeof v === "boolean") return v ? "Yes" : "No";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

export function RecordView({ record }) {
  if (!record) return null;
  const sections = Array.isArray(record.sections) ? record.sections : [];
  return (
    <article className="space-y-4 text-sm text-slate-800" aria-label={record.title || "Record"}>
      {(record.title || record.canonical_id) && (
        <header className="border-b border-gray-100 pb-3">
          {record.canonical_id && <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">{record.canonical_id}</p>}
          {record.title && <h3 className="text-lg font-bold text-slate-900">{record.title}</h3>}
        </header>
      )}
      {sections.length === 0 && <p className="text-slate-500">This record has no content.</p>}
      {sections.map((section, i) => {
        const [kind, a, b] = section || [];
        if (kind === "heading") {
          const level = Number(b) || 2;
          const cls = level <= 1 ? "text-base font-bold text-slate-900" : "text-sm font-semibold text-slate-900";
          return level <= 1 ? <h4 key={i} className={cls}>{a}</h4> : <h5 key={i} className={cls}>{a}</h5>;
        }
        if (kind === "paragraph") {
          const small = b === "small" || b === "note" || b === "muted";
          return <p key={i} className={small ? "text-xs text-slate-600" : b === "bold" ? "font-semibold" : ""}>{a}</p>;
        }
        if (kind === "kv") {
          return (
            <dl key={i} className="grid grid-cols-1 gap-x-6 gap-y-1.5 rounded-lg border border-gray-100 bg-slate-50/60 p-3 sm:grid-cols-[minmax(10rem,auto)_1fr]">
              {(a || []).map(([label, value], j) => (
                <div key={j} className="contents">
                  <dt className="font-medium text-slate-600">{label}</dt>
                  <dd className="break-words text-slate-900">{cellText(value)}</dd>
                </div>
              ))}
            </dl>
          );
        }
        if (kind === "table") {
          const cols = a || [];
          const rows = b || [];
          return (
            <div key={i} className="overflow-x-auto rounded-lg border border-gray-200">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-600">
                  <tr>{cols.map((c, j) => <th key={j} scope="col" className="whitespace-nowrap px-3 py-2 font-semibold">{c}</th>)}</tr>
                </thead>
                <tbody>
                  {rows.length === 0 ? (
                    <tr><td colSpan={cols.length || 1} className="px-3 py-3 text-slate-500">No rows.</td></tr>
                  ) : rows.map((row, r) => (
                    <tr key={r} className="border-t border-gray-100">
                      {(row || []).map((v, c) => <td key={c} className="px-3 py-2 align-top text-slate-800">{cellText(v)}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        }
        return null;
      })}
    </article>
  );
}

// CSV / PDF download of a governance API path. `formats` limits the buttons (e.g. ["pdf"] for a stored record PDF).
export function ExportButtons({ path, filename, formats = ["csv", "pdf"], onError, size = "md" }) {
  const [busy, setBusy] = useState(null);
  const run = async (format) => {
    setBusy(format);
    try {
      await exportGovernance(path, format, `${filename}.${format}`);
    } catch (e) {
      onError?.(e.message || "Export failed.");
    } finally {
      setBusy(null);
    }
  };
  const pad = size === "sm" ? "px-2.5 py-1 text-xs" : "";
  return (
    <div className="flex flex-wrap gap-2">
      {formats.map((f) => (
        <SecondaryButton key={f} className={pad} loading={busy === f} icon={f === "pdf" ? FileText : Download} onClick={() => run(f)} disabled={!path}>
          Export {f.toUpperCase()}
        </SecondaryButton>
      ))}
    </div>
  );
}

// ── employees ─────────────────────────────────────────────────────────────────────────────────────────────────────────
export function employeeName(e) {
  if (!e) return "";
  return e.full_name || [e.first_name, e.last_name].filter(Boolean).join(" ") || e.name || e.email || `Employee #${e.id}`;
}

// Searchable multi-select of employees. `value` is a map {id: name}; `onChange` receives the next map.
export function EmployeePicker({ value = {}, onChange, idPrefix = "emp-picker", max = 200 }) {
  const [search, setSearch] = useState("");
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    let alive = true;
    const t = setTimeout(() => {
      setLoading(true);
      setError(null);
      getHrEmployees({ per_page: 100, search: search.trim() || undefined })
        .then((res) => { if (alive) setItems(res?.items || res?.data || (Array.isArray(res) ? res : [])); })
        .catch((e) => { if (alive) { setItems([]); setError(e.message || "Could not load employees."); } })
        .finally(() => { if (alive) setLoading(false); });
    }, 250);
    return () => { alive = false; clearTimeout(t); };
  }, [search]);

  const selectedIds = Object.keys(value).map(Number);
  const toggle = (e) => {
    const next = { ...value };
    if (next[e.id] !== undefined) delete next[e.id];
    else if (selectedIds.length < max) next[e.id] = employeeName(e);
    onChange(next);
  };
  const remove = (id) => {
    const next = { ...value };
    delete next[id];
    onChange(next);
  };
  const addVisible = () => {
    const next = { ...value };
    for (const e of items) {
      if (Object.keys(next).length >= max) break;
      next[e.id] = employeeName(e);
    }
    onChange(next);
  };

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <label htmlFor={`${idPrefix}-search`} className="sr-only">Search employees</label>
        <input id={`${idPrefix}-search`} type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search employees by name or email" className={inputCls} />
        <SecondaryButton onClick={addVisible} disabled={!items.length}>Add all shown</SecondaryButton>
      </div>
      {error && <ErrorBanner error={error} />}
      <ul className="max-h-56 overflow-y-auto rounded-xl border border-gray-200" aria-label="Employees" aria-busy={loading}>
        {loading && <li className="px-3 py-2 text-sm text-slate-500">Loading…</li>}
        {!loading && items.length === 0 && <li className="px-3 py-2 text-sm text-slate-500">No employees found.</li>}
        {!loading && items.map((e) => {
          const id = `${idPrefix}-${e.id}`;
          return (
            <li key={e.id} className="border-b border-gray-100 last:border-0">
              <label htmlFor={id} className="flex cursor-pointer items-center gap-3 px-3 py-2 text-sm hover:bg-slate-50">
                <input id={id} type="checkbox" checked={value[e.id] !== undefined} onChange={() => toggle(e)} className="h-4 w-4 accent-blue-600" />
                <span className="font-medium text-slate-800">{employeeName(e)}</span>
                {e.email && <span className="truncate text-xs text-slate-500">{e.email}</span>}
              </label>
            </li>
          );
        })}
      </ul>
      <p className="text-xs text-slate-600">{selectedIds.length} selected{max ? ` (up to ${max})` : ""}</p>
      {selectedIds.length > 0 && (
        <ul className="flex flex-wrap gap-1.5" aria-label="Selected employees">
          {selectedIds.map((id) => (
            <li key={id} className="inline-flex items-center gap-1 rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-xs text-blue-800">
              {value[id]}
              <button type="button" onClick={() => remove(id)} aria-label={`Remove ${value[id]}`} className="rounded-full p-0.5 hover:bg-blue-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">
                <X className="h-3 w-3" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
