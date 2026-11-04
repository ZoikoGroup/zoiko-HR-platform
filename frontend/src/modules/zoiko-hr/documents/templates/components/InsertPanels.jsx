// Searchable pickers that insert {{field}} and {{clause:key}} placeholders into the focused text box.
import { useMemo, useState } from "react";
import { CornerDownLeft } from "lucide-react";
import { ClassificationBadge, StatusBadge, inputClass } from "./ui";

export function FieldPicker({ fields = [], onInsert, disabled, hint }) {
  const [q, setQ] = useState("");
  const [group, setGroup] = useState("");
  const groups = useMemo(() => [...new Set(fields.map((f) => f.group).filter(Boolean))].sort(), [fields]);
  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    return fields.filter((f) => (!group || f.group === group)
      && (!s || f.key.toLowerCase().includes(s) || (f.label || "").toLowerCase().includes(s)));
  }, [fields, q, group]);

  return (
    <div>
      <p className="mb-2 text-xs text-gray-500">{hint || "Click into a text box, then choose a field to insert it at the cursor."}</p>
      <div className="mb-2 grid gap-2 sm:grid-cols-2">
        <div>
          <label htmlFor="fp-search" className="sr-only">Search fields</label>
          <input id="fp-search" type="search" className={inputClass} placeholder="Search fields…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <div>
          <label htmlFor="fp-group" className="sr-only">Field group</label>
          <select id="fp-group" className={inputClass} value={group} onChange={(e) => setGroup(e.target.value)}>
            <option value="">All groups</option>
            {groups.map((g) => <option key={g} value={g}>{g}</option>)}
          </select>
        </div>
      </div>
      <ul className="max-h-[28rem] divide-y divide-gray-100 overflow-y-auto rounded-lg border border-gray-200" aria-label="Fields">
        {list.map((f) => (
          <li key={f.key}>
            <button type="button" disabled={disabled} onClick={() => onInsert(`{{${f.key}}}`)}
              className="flex w-full items-start gap-2 px-3 py-2 text-left hover:bg-blue-50 focus:bg-blue-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
              aria-label={`Insert field ${f.label} (${f.key})`}>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium text-gray-800">{f.label}</span>
                <code className="block truncate text-xs text-gray-500">{`{{${f.key}}}`}</code>
              </span>
              <span className="flex flex-col items-end gap-1">
                <ClassificationBadge value={f.classification} />
                <span className="text-[11px] text-gray-400">{f.type}</span>
              </span>
              <CornerDownLeft className="mt-1 h-3.5 w-3.5 shrink-0 text-gray-400" aria-hidden="true" />
            </button>
          </li>
        ))}
        {list.length === 0 && <li className="px-3 py-4 text-center text-xs text-gray-500">No matching fields.</li>}
      </ul>
    </div>
  );
}

// clauses: [{ key, title?, status?, source: "rules" | "pack" }]
export function ClausePicker({ clauses = [], onInsert, disabled }) {
  const [q, setQ] = useState("");
  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    return clauses.filter((c) => !s || c.key.toLowerCase().includes(s) || (c.title || "").toLowerCase().includes(s));
  }, [clauses, q]);
  return (
    <div>
      <p className="mb-2 text-xs text-gray-500">
        Inserts <code>{"{{clause:key}}"}</code> at the cursor. Use <code>{"{{required_clause_block}}"}</code> to print every mandatory clause in one place.
      </p>
      <label htmlFor="cp-search" className="sr-only">Search clauses</label>
      <input id="cp-search" type="search" className={`${inputClass} mb-2`} placeholder="Search clause keys…" value={q} onChange={(e) => setQ(e.target.value)} />
      <button type="button" disabled={disabled} onClick={() => onInsert("{{required_clause_block}}")}
        className="mb-2 w-full rounded-lg border border-dashed border-gray-300 px-3 py-2 text-left text-sm text-gray-700 hover:bg-blue-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:opacity-50">
        Insert <code>{"{{required_clause_block}}"}</code>
      </button>
      <ul className="max-h-[24rem] divide-y divide-gray-100 overflow-y-auto rounded-lg border border-gray-200" aria-label="Clauses">
        {list.map((c) => (
          <li key={c.key}>
            <button type="button" disabled={disabled} onClick={() => onInsert(`{{clause:${c.key}}}`)} aria-label={`Insert clause ${c.key}`}
              className="flex w-full items-start gap-2 px-3 py-2 text-left hover:bg-blue-50 focus:bg-blue-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500 disabled:opacity-50">
              <span className="min-w-0 flex-1">
                <code className="block truncate text-sm text-gray-800">{c.key}</code>
                {c.title && <span className="block truncate text-xs text-gray-500">{c.title}</span>}
                {c.rule && <span className="block text-[11px] text-gray-500">In this template's rules: {c.rule}</span>}
              </span>
              {c.status ? <StatusBadge status={c.status} /> : <span className="text-[11px] text-gray-500">No text in pack</span>}
            </button>
          </li>
        ))}
        {list.length === 0 && <li className="px-3 py-4 text-center text-xs text-gray-500">No clauses found.</li>}
      </ul>
    </div>
  );
}
