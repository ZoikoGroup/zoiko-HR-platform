/* Small helpers for the Offboarding Clearance / Assets / Settlements / Interviews / Settings pages. */
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { X } from "lucide-react";
import { getHrEmployees } from "../../../service/hrService";
import { errorMessage } from "../../../service/offboardingService";

/** Load data once and on reload(); { data, loading, error, reload }. */
export function useLoad(fn, deps = []) {
  const [state, setState] = useState({ data: null, loading: true, error: null });
  const seq = useRef(0);
  const reload = useCallback(async () => {
    const mine = ++seq.current;
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const data = await fn();
      if (mine === seq.current) setState({ data, loading: false, error: null });
    } catch (err) {
      if (mine === seq.current) setState((s) => ({ ...s, loading: false, error: errorMessage(err) }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  useEffect(() => { reload(); }, [reload]);
  return { ...state, reload };
}

export function Modal({ open, title, onClose, children, footer, wide = false }) {
  const titleId = useId();
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === "Escape") onClose?.(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-labelledby={titleId} onClick={(e) => e.stopPropagation()}
        className={`flex max-h-[90vh] w-full ${wide ? "max-w-3xl" : "max-w-lg"} flex-col rounded-2xl border border-gray-200 bg-white shadow-xl`}>
        <div className="flex items-start justify-between gap-3 border-b border-gray-100 px-6 py-4">
          <h2 id={titleId} className="text-lg font-semibold text-slate-900">{title}</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-lg p-1 text-slate-500 hover:bg-slate-100">
            <X size={18} aria-hidden="true" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">{children}</div>
        {footer && <div className="flex flex-wrap justify-end gap-2 border-t border-gray-100 px-6 py-3">{footer}</div>}
      </div>
    </div>
  );
}

export function ErrorNote({ children }) {
  if (!children) return null;
  return <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-2 text-sm text-rose-800">{children}</p>;
}

export const inputClass = "w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100";

export function LabeledField({ label, hint, children, id }) {
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-sm font-medium text-slate-700">{label}</label>
      {children}
      {hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
    </div>
  );
}

const asList = (raw) => (Array.isArray(raw) ? raw : raw?.items || raw?.data || raw?.employees || []);
const personName = (e) => e?.full_name || e?.name || `${e?.first_name || ""} ${e?.last_name || ""}`.trim() || e?.email || `#${e?.id}`;

/**
 * Choose one active person: type to search (name, e-mail or code), then pick from the list. value: employee id | null.
 * valueLabel names the current value when it is not in the latest results (e.g. a saved setting).
 */
export function EmployeePicker({ label, value, valueLabel, onChange, allowNone = true, noneLabel = "Unassigned" }) {
  const id = useId();
  const [query, setQuery] = useState("");
  const [people, setPeople] = useState([]);
  const [error, setError] = useState(null);
  useEffect(() => {
    let live = true;
    const timer = setTimeout(() => {
      getHrEmployees({ search: query.trim() || undefined, per_page: 50, include_all_roles: true, status: "active" })
        .then((r) => { if (live) { setPeople(asList(r).filter((p) => p.is_active !== false)); setError(null); } })
        .catch((e) => { if (live) setError(errorMessage(e)); });
    }, 250);
    return () => { live = false; clearTimeout(timer); };
  }, [query]);
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-sm font-medium text-slate-700">{label}</label>
      <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search people…"
        aria-label={`Search people for ${label}`} className={`${inputClass} mb-1`} />
      <select id={id} value={value ?? ""} onChange={(e) => onChange(e.target.value ? Number(e.target.value) : null)} className={inputClass}>
        {allowNone && <option value="">{noneLabel}</option>}
        {value && !people.some((p) => p.id === value) && <option value={value}>{valueLabel || `#${value}`}</option>}
        {people.map((p) => <option key={p.id} value={p.id}>{personName(p)}{p.employee_code ? ` (${p.employee_code})` : ""}</option>)}
      </select>
      {error && <p className="mt-1 text-xs text-rose-700">People could not be loaded: {error}</p>}
    </div>
  );
}

export const humanize = (s) => String(s || "").replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());
