// Editable list of short strings (field keys, clause keys, employment types) with optional suggestions.
import { useId, useState } from "react";
import { Plus, X } from "lucide-react";
import { btnSmall, inputClass } from "./ui";

export default function TagListEditor({ label, values = [], onChange, suggestions = [], disabled = false, placeholder = "Add…", hint }) {
  const uid = useId();
  const [draft, setDraft] = useState("");
  const add = () => {
    const v = draft.trim();
    if (!v || values.includes(v)) { setDraft(""); return; }
    onChange([...values, v]);
    setDraft("");
  };
  return (
    <div>
      <label htmlFor={`${uid}-in`} className="mb-1 block text-xs font-semibold text-gray-600">{label}</label>
      <ul className="mb-1.5 flex flex-wrap gap-1" aria-label={`${label} values`}>
        {values.length === 0 && <li className="text-xs text-gray-400">None</li>}
        {values.map((v) => (
          <li key={v} className="inline-flex items-center gap-1 rounded-md border border-gray-200 bg-gray-50 px-1.5 py-0.5 font-mono text-xs text-gray-700">
            {v}
            {!disabled && (
              <button type="button" onClick={() => onChange(values.filter((x) => x !== v))} aria-label={`Remove ${v} from ${label}`}
                className="rounded text-gray-400 hover:text-red-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">
                <X className="h-3 w-3" />
              </button>
            )}
          </li>
        ))}
      </ul>
      {!disabled && (
        <div className="flex gap-1.5">
          <input id={`${uid}-in`} list={suggestions.length ? `${uid}-dl` : undefined} className={inputClass} value={draft} placeholder={placeholder}
            onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }} />
          {suggestions.length > 0 && (
            <datalist id={`${uid}-dl`}>{suggestions.filter((s) => !values.includes(s)).map((s) => <option key={s} value={s} />)}</datalist>
          )}
          <button type="button" className={btnSmall} onClick={add} aria-label={`Add to ${label}`}><Plus className="h-3.5 w-3.5" /></button>
        </div>
      )}
      {hint && <p className="mt-1 text-xs text-gray-500">{hint}</p>}
    </div>
  );
}
