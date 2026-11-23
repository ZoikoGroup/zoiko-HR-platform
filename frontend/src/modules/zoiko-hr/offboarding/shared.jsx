/* Shared pieces of the Offboarding module: status pills, dialogs, form fields, a data loader and a people picker. */
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { AlertCircle, Loader2, Search, X } from "lucide-react";
import { getHrEmployees } from "../../../service/hrService";
import { errorMessage } from "../../../service/offboardingService";
import { PrimaryButton, SecondaryButton, StatusPill } from "../recruitment/ui";

// ── labels ───────────────────────────────────────────────────────────────────────────────────────────────────────────
export const CASE_STATUS = {
  submitted: ["Awaiting decision", "amber"],
  serving_notice: ["Serving notice", "blue"],
  garden_leave: ["Garden leave", "violet"],
  withdrawal_requested: ["Withdrawal requested", "amber"],
  approved: ["Approved", "blue"],
  exited: ["Exited", "gray"],
  closed: ["Closed", "green"],
  rejected: ["Rejected", "red"],
  withdrawn: ["Withdrawn", "gray"],
  cancelled: ["Cancelled", "gray"],
};

export const EXIT_TYPES = [
  { value: "resignation", label: "Resignation" },
  { value: "termination", label: "Termination" },
  { value: "end_of_contract", label: "End of contract" },
  { value: "mutual_separation", label: "Mutual separation" },
  { value: "retirement", label: "Retirement" },
  { value: "death_in_service", label: "Death in service" },
];
const EXIT_TONE = { resignation: "blue", termination: "red", end_of_contract: "teal", mutual_separation: "violet",
  retirement: "green", death_in_service: "gray" };

export const NOTICE_HANDLING = [
  { value: "serve", label: "Serving notice" },
  { value: "waive", label: "Notice waived" },
  { value: "pay_in_lieu", label: "Pay in lieu of notice" },
  { value: "garden_leave", label: "Garden leave" },
];

export const REASON_CATEGORIES = [
  { value: "better_opportunity", label: "Better opportunity" }, { value: "compensation", label: "Compensation" },
  { value: "career_growth", label: "Career growth" }, { value: "manager_or_team", label: "Manager or team" },
  { value: "work_life_balance", label: "Work-life balance" }, { value: "relocation", label: "Relocation" },
  { value: "higher_studies", label: "Higher studies" }, { value: "health_or_personal", label: "Health or personal reasons" },
  { value: "performance", label: "Performance" }, { value: "conduct", label: "Conduct" },
  { value: "restructuring", label: "Restructuring / redundancy" }, { value: "contract_end", label: "Contract ended" },
  { value: "retirement", label: "Retirement" }, { value: "other", label: "Other" },
];

export const labelOf = (list, value) => list.find((o) => o.value === value)?.label || (value ? String(value).replace(/_/g, " ") : "—");

export function CaseStatusPill({ status }) {
  const [label, tone] = CASE_STATUS[status] || [String(status || "—").replace(/_/g, " "), "gray"];
  return <StatusPill tone={tone}>{label}</StatusPill>;
}

export function ExitTypePill({ type, label }) {
  return <StatusPill tone={EXIT_TONE[type] || "gray"}>{label || labelOf(EXIT_TYPES, type)}</StatusPill>;
}

/** Whole days from today to a date-only value ("2026-12-01"); negative when past, null without a date. */
export function daysUntil(value) {
  if (!value) return null;
  const [y, m, d] = String(value).slice(0, 10).split("-").map(Number);
  if (!y || !m || !d) return null;
  const target = Date.UTC(y, m - 1, d);
  const now = new Date();
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((target - today) / 86400000);
}

export function inDays(n) {
  if (n == null) return "";
  if (n === 0) return "today";
  if (n === 1) return "tomorrow";
  if (n > 1) return `in ${n} days`;
  return `${-n} day${n === -1 ? "" : "s"} ago`;
}

export const todayIso = () => {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}-${String(n.getDate()).padStart(2, "0")}`;
};

// ── data loading ─────────────────────────────────────────────────────────────────────────────────────────────────────
/** Runs `fn` when `deps` change. Returns {data, error, loading, reload}; an older answer never overwrites a newer one. */
export function useLoad(fn, deps = []) {
  const [state, setState] = useState({ data: null, error: "", loading: true });
  const seq = useRef(0);
  const fnRef = useRef(fn);
  fnRef.current = fn;
  const reload = useCallback(async () => {
    const mine = ++seq.current;
    setState((s) => ({ ...s, loading: true, error: "" }));
    try {
      const data = await fnRef.current();
      if (mine === seq.current) setState({ data, error: "", loading: false });
      return data;
    } catch (err) {
      if (mine === seq.current) setState((s) => ({ ...s, error: errorMessage(err), loading: false }));
      return null;
    }
  }, []);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { reload(); }, deps);
  return { ...state, reload };
}

// ── messages ─────────────────────────────────────────────────────────────────────────────────────────────────────────
export function ErrorBanner({ message, onClose }) {
  if (!message) return null;
  return (
    <div role="alert" className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      <span className="flex-1">{message}</span>
      {onClose && <button type="button" onClick={onClose} aria-label="Dismiss" className="text-rose-600 hover:text-rose-800"><X className="h-4 w-4" /></button>}
    </div>
  );
}

export function Notice({ message, onClose }) {
  if (!message) return null;
  return (
    <div role="status" className="flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
      <span className="flex-1">{message}</span>
      {onClose && <button type="button" onClick={onClose} aria-label="Dismiss" className="text-emerald-700"><X className="h-4 w-4" /></button>}
    </div>
  );
}

export function Loading({ label = "Loading…" }) {
  return (
    <div role="status" className="flex items-center gap-2 px-5 py-10 text-sm text-slate-500">
      <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />{label}
    </div>
  );
}

// ── form fields ──────────────────────────────────────────────────────────────────────────────────────────────────────
export const inputClass = "w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100 disabled:bg-gray-50";

/** A labelled field; `children` receives the generated id and the describedby id. */
export function Field({ label, hint, error, required, children, className = "" }) {
  const id = useId();
  const hintId = `${id}-hint`;
  const errId = `${id}-err`;
  const described = [hint ? hintId : null, error ? errId : null].filter(Boolean).join(" ") || undefined;
  return (
    <div className={className}>
      <label htmlFor={id} className="mb-1 block text-sm font-medium text-gray-700">
        {label}{required && <span className="text-rose-600" aria-hidden="true"> *</span>}
      </label>
      {children({ id, describedBy: described, invalid: Boolean(error) })}
      {hint && !error && <p id={hintId} className="mt-1 text-xs text-gray-500">{hint}</p>}
      {error && <p id={errId} className="mt-1 text-xs text-rose-700">{error}</p>}
    </div>
  );
}

export function Input({ label, hint, error, required, className, value, onChange, ...rest }) {
  return (
    <Field label={label} hint={hint} error={error} required={required} className={className}>
      {({ id, describedBy, invalid }) => (
        <input id={id} aria-describedby={describedBy} aria-invalid={invalid || undefined} value={value ?? ""}
          onChange={(e) => onChange(e.target.value)} className={inputClass} {...rest} />
      )}
    </Field>
  );
}

export function Select({ label, hint, error, required, className, value, onChange, options, placeholder, ...rest }) {
  return (
    <Field label={label} hint={hint} error={error} required={required} className={className}>
      {({ id, describedBy, invalid }) => (
        <select id={id} aria-describedby={describedBy} aria-invalid={invalid || undefined} value={value ?? ""}
          onChange={(e) => onChange(e.target.value)} className={inputClass} {...rest}>
          {placeholder !== undefined && <option value="">{placeholder}</option>}
          {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      )}
    </Field>
  );
}

export function Textarea({ label, hint, error, required, className, value, onChange, rows = 3, ...rest }) {
  return (
    <Field label={label} hint={hint} error={error} required={required} className={className}>
      {({ id, describedBy, invalid }) => (
        <textarea id={id} rows={rows} aria-describedby={describedBy} aria-invalid={invalid || undefined} value={value ?? ""}
          onChange={(e) => onChange(e.target.value)} className={inputClass} {...rest} />
      )}
    </Field>
  );
}

// ── dialogs ──────────────────────────────────────────────────────────────────────────────────────────────────────────
/** An accessible modal: Escape and the backdrop close it, the first field gets focus. */
export function Modal({ open, title, onClose, children, footer, wide = false }) {
  const titleId = useId();
  const box = useRef(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === "Escape") closeRef.current?.(); };
    document.addEventListener("keydown", onKey);
    const first = box.current?.querySelector("input, select, textarea, button:not([data-close])");
    first?.focus();
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose?.(); }}>
      <div ref={box} role="dialog" aria-modal="true" aria-labelledby={titleId}
        className={`max-h-[90vh] w-full ${wide ? "max-w-2xl" : "max-w-lg"} overflow-y-auto rounded-2xl bg-white p-6 shadow-xl`}>
        <div className="mb-4 flex items-start justify-between gap-3">
          <h2 id={titleId} className="text-lg font-semibold text-gray-900">{title}</h2>
          <button type="button" data-close onClick={onClose} aria-label="Close" className="rounded-lg p-1 text-gray-400 hover:bg-gray-100"><X className="h-5 w-5" /></button>
        </div>
        {children}
        {footer && <div className="mt-6 flex flex-wrap justify-end gap-2">{footer}</div>}
      </div>
    </div>
  );
}

/**
 * Asks before something happens. With `reasonLabel` a reason is required and passed to onConfirm(reason).
 * onConfirm may return a promise; an error it throws is shown inside the dialog.
 */
export function ConfirmDialog({ open, title, message, confirmLabel = "Confirm", danger = false, reasonLabel, reasonHint,
  reasonRequired = true, onConfirm, onClose }) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => { if (open) { setReason(""); setError(""); setBusy(false); } }, [open]);
  const submit = async () => {
    if (reasonLabel && reasonRequired && !reason.trim()) { setError(`${reasonLabel} is required.`); return; }
    setBusy(true);
    setError("");
    try {
      await onConfirm(reason.trim());
      onClose();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal open={open} title={title} onClose={busy ? undefined : onClose}
      footer={<>
        <SecondaryButton onClick={onClose} disabled={busy}>Cancel</SecondaryButton>
        <button type="button" onClick={submit} disabled={busy}
          className={`inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold text-white shadow-sm disabled:opacity-60 ${danger ? "bg-rose-600 hover:bg-rose-700" : "bg-blue-600 hover:bg-blue-700"}`}>
          {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}{confirmLabel}
        </button>
      </>}>
      {message && <div className="text-sm text-gray-600">{message}</div>}
      {reasonLabel && (
        <Textarea className="mt-4" label={reasonLabel} hint={reasonHint} required={reasonRequired} value={reason} onChange={setReason}
          error={error && !reason.trim() ? error : ""} />
      )}
      {error && (reason.trim() || !reasonLabel) && <div className="mt-3"><ErrorBanner message={error} /></div>}
    </Modal>
  );
}

// ── people picker ────────────────────────────────────────────────────────────────────────────────────────────────────
const personName = (p) => p?.full_name || `${p?.first_name || ""} ${p?.last_name || ""}`.trim() || p?.name || p?.email || "";

/**
 * Searches people in the organisation (GET /hr/employees). value: {id, name} | null. `exclude` is a list of ids not offered.
 */
export function EmployeePicker({ label, value, onChange, error, hint, required, exclude = [], placeholder = "Search by name or code" }) {
  const id = useId();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const seq = useRef(0);
  const excludeKey = exclude.join(",");
  useEffect(() => {
    if (!open) return undefined;
    const mine = ++seq.current;
    setLoading(true);
    const t = setTimeout(async () => {
      try {
        const res = await getHrEmployees({ search: query.trim() || undefined, per_page: 20, include_all_roles: true, status: "active" });
        const list = Array.isArray(res) ? res : res?.items || res?.data || res?.employees || [];
        if (mine === seq.current) {
          const skip = new Set(excludeKey ? excludeKey.split(",").map(Number) : []);
          setItems(list.filter((p) => !skip.has(p.id)));
        }
      } catch {
        if (mine === seq.current) setItems([]);
      } finally {
        if (mine === seq.current) setLoading(false);
      }
    }, 250);
    return () => clearTimeout(t);
  }, [query, open, excludeKey]);
  const listId = `${id}-list`;
  return (
    <div className="relative">
      <label htmlFor={id} className="mb-1 block text-sm font-medium text-gray-700">
        {label}{required && <span className="text-rose-600" aria-hidden="true"> *</span>}
      </label>
      {value ? (
        <div className="flex items-center justify-between gap-2 rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm">
          <span className="truncate font-medium text-gray-900">{value.name}{value.employee_code ? ` · ${value.employee_code}` : ""}</span>
          <button type="button" onClick={() => { onChange(null); setQuery(""); }} className="text-xs font-semibold text-blue-700 hover:underline"
            aria-label={`Change ${label}`}>Change</button>
        </div>
      ) : (
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" aria-hidden="true" />
          <input id={id} type="search" role="combobox" aria-expanded={open} aria-controls={listId} aria-autocomplete="list"
            aria-invalid={error ? true : undefined} value={query} placeholder={placeholder} autoComplete="off"
            onFocus={() => setOpen(true)} onBlur={() => setTimeout(() => setOpen(false), 150)}
            onChange={(e) => { setQuery(e.target.value); setOpen(true); }} className={`${inputClass} pl-9`} />
          {open && (
            <ul id={listId} role="listbox" aria-label={label}
              className="absolute z-30 mt-1 max-h-64 w-full overflow-y-auto rounded-xl border border-gray-200 bg-white py-1 shadow-lg">
              {loading && <li className="px-3 py-2 text-sm text-gray-500">Searching…</li>}
              {!loading && items.length === 0 && <li className="px-3 py-2 text-sm text-gray-500">No one found.</li>}
              {!loading && items.map((p) => (
                <li key={p.id} role="option" aria-selected="false">
                  <button type="button" onMouseDown={(e) => e.preventDefault()}
                    onClick={() => { onChange({ id: p.id, name: personName(p), employee_code: p.employee_code }); setOpen(false); }}
                    className="flex w-full flex-col items-start px-3 py-2 text-left text-sm hover:bg-blue-50">
                    <span className="font-medium text-gray-900">{personName(p)}</span>
                    <span className="text-xs text-gray-500">{[p.employee_code, p.job_title].filter(Boolean).join(" · ")}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      {hint && !error && <p className="mt-1 text-xs text-gray-500">{hint}</p>}
      {error && <p className="mt-1 text-xs text-rose-700">{error}</p>}
    </div>
  );
}

/**
 * Approve an exit: the last working day (defaults to what the case proposes), how the notice is handled, who the
 * direct reports move to and a note. onApprove(body) does the request; its error stays in the dialog.
 */
export function ApproveDialog({ open, exitCase, onApprove, onClose }) {
  const [lwd, setLwd] = useState("");
  const [handling, setHandling] = useState("serve");
  const [reportees, setReportees] = useState(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!open || !exitCase) return;
    setLwd(exitCase.last_working_day || "");
    setHandling(exitCase.notice_handling || "serve");
    setReportees(exitCase.reportees_to ? { id: exitCase.reportees_to.id, name: exitCase.reportees_to.name } : null);
    setNote("");
    setError("");
    setBusy(false);
  }, [open, exitCase]);
  if (!exitCase) return null;
  const submit = async () => {
    if (!lwd) { setError("Choose the last working day."); return; }
    if (exitCase.resignation_date && lwd < exitCase.resignation_date) { setError("The last working day cannot be before the notice date."); return; }
    setBusy(true);
    setError("");
    try {
      const body = { last_working_day: lwd, notice_handling: handling, note: note.trim() || undefined };
      if (reportees) body.reportees_to_id = reportees.id;
      await onApprove(body);
      onClose();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };
  const requested = exitCase.requested_last_day;
  return (
    <Modal open={open} title={`Approve exit of ${exitCase.employee?.name || "employee"}`} onClose={busy ? undefined : onClose}
      footer={<>
        <SecondaryButton onClick={onClose} disabled={busy}>Cancel</SecondaryButton>
        <PrimaryButton onClick={submit} disabled={busy}>{busy ? "Approving…" : "Approve"}</PrimaryButton>
      </>}>
      <div className="space-y-4">
        <p className="text-sm text-gray-600">
          Notice ends on <strong>{exitCase.notice_end_date || "—"}</strong>
          {requested ? <> · the employee asked for <strong>{requested}</strong></> : null}.
          Approving creates the clearance tasks, lists the assets to recover and starts the settlement.
        </p>
        <Input label="Last working day" type="date" required value={lwd} onChange={setLwd} min={exitCase.resignation_date || undefined}
          error={error && !lwd ? error : ""} />
        <Select label="Notice" value={handling} onChange={setHandling} options={NOTICE_HANDLING} />
        <EmployeePicker label="Direct reports move to" value={reportees} onChange={setReportees} exclude={[exitCase.employee?.id]}
          hint="Leave empty to move them to the leaver's own manager." />
        <Textarea label="Note to the employee (optional)" value={note} onChange={setNote} rows={2} />
        {error && lwd && <ErrorBanner message={error} />}
      </div>
    </Modal>
  );
}

/** Progress bar for "done / total". */
export function ProgressBar({ done = 0, total = 0, label }) {
  const pct = total ? Math.round((done * 100) / total) : 0;
  return (
    <div className="min-w-[110px]">
      <div className="flex justify-between text-xs text-gray-500"><span>{done}/{total}</span><span>{pct}%</span></div>
      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-gray-100" role="progressbar" aria-valuemin={0} aria-valuemax={100}
        aria-valuenow={pct} aria-label={label || "Progress"}>
        <div className={`h-full rounded-full ${pct === 100 ? "bg-emerald-500" : "bg-blue-500"}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export { PrimaryButton, SecondaryButton };
