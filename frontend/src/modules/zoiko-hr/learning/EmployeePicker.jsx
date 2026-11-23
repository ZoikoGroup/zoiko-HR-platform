import { useEffect, useRef, useState } from "react";
import { searchLearningPeople } from "../../../service/hrService";

export function personLabel(e) {
  if (!e) return "";
  const first = e.firstName || e.first_name;
  const last = e.lastName || e.last_name;
  const name = e.fullName || e.full_name || e.name || (first || last ? `${first || ""} ${last || ""}`.trim() : "");
  return name || e.email || `Employee #${e.id}`;
}

/**
 * Pick one person of the organization by typing part of their name, email or code. The search runs on the server, so
 * nobody is out of reach however large the organization is (audit L9/L4).
 */
export default function EmployeePicker({ id = "employee-picker", label = "Employee", value, onChange, required, error, placeholder = "Type a name or email..." }) {
  const [term, setTerm] = useState("");
  const [results, setResults] = useState([]);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState("");
  const latest = useRef(0);

  useEffect(() => {
    if (!open) return undefined;
    const ticket = ++latest.current;
    const t = setTimeout(async () => {
      setBusy(true);
      setFailed("");
      try {
        const res = await searchLearningPeople(term.trim());
        if (ticket !== latest.current) return;
        setResults(Array.isArray(res) ? res : res?.items || res?.data || []);
      } catch (err) {
        if (ticket !== latest.current) return;
        setResults([]);
        setFailed(err?.message || "People could not be loaded.");
      } finally {
        if (ticket === latest.current) setBusy(false);
      }
    }, 250);
    return () => clearTimeout(t);
  }, [term, open]);

  const pick = (e) => {
    onChange({ id: e.id, name: personLabel(e) });
    setTerm("");
    setOpen(false);
  };

  return (
    <div className="relative">
      <label htmlFor={id} className="block text-sm font-medium text-gray-700 dark:text-[#e2e8f0] mb-1">{label}{required && <span className="text-red-500"> *</span>}</label>
      {value ? (
        <div className="flex items-center justify-between gap-2 border border-gray-200 dark:border-[#334155] rounded-lg px-3 py-2 text-sm bg-gray-50 dark:bg-[#0f172a]">
          <span className="font-medium text-gray-800 dark:text-[#f1f5f9]" data-testid={`${id}-selected`}>{value.name}</span>
          <button type="button" onClick={() => { onChange(null); setOpen(true); }} className="text-xs text-blue-600 hover:underline">Change</button>
        </div>
      ) : (
        <input
          id={id}
          type="search"
          role="combobox"
          aria-expanded={open}
          aria-invalid={!!error}
          autoComplete="off"
          value={term}
          placeholder={placeholder}
          onFocus={() => setOpen(true)}
          onChange={(e) => { setTerm(e.target.value); setOpen(true); }}
          className={`w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${error ? "border-red-300" : "border-gray-200 dark:border-[#334155]"} dark:bg-[#0f172a] dark:text-[#f1f5f9]`}
        />
      )}
      {open && !value && (
        <ul role="listbox" aria-label={`${label} results`} className="absolute z-20 mt-1 w-full max-h-56 overflow-auto bg-white dark:bg-[#1e293b] border border-gray-200 dark:border-[#334155] rounded-lg shadow-lg text-sm">
          {busy && <li className="px-3 py-2 text-gray-400 dark:text-[#94a3b8]">Searching...</li>}
          {!busy && failed && <li className="px-3 py-2 text-red-600">{failed}</li>}
          {!busy && !failed && results.length === 0 && <li className="px-3 py-2 text-gray-400 dark:text-[#94a3b8]">No one matches.</li>}
          {!busy && results.map((e) => (
            <li key={e.id} role="option" aria-selected="false">
              <button type="button" onClick={() => pick(e)} className="w-full text-left px-3 py-2 hover:bg-blue-50 dark:hover:bg-blue-900/30">
                <span className="font-medium text-gray-800 dark:text-[#f1f5f9]">{personLabel(e)}</span>
                {e.email && <span className="ml-2 text-xs text-gray-400 dark:text-[#94a3b8]">{e.email}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
      {error && <p role="alert" className="text-red-500 text-xs mt-1">{error}</p>}
    </div>
  );
}
