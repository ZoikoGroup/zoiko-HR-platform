// The edit form for one content block, per block type (see docs/templates block grammar).
import { useId, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import SmartText from "./SmartText";
import { ClassificationBadge, Labeled, btnIcon, btnSmall, inputClass } from "./ui";

export const BLOCK_TYPES = [
  { type: "heading", label: "Heading" },
  { type: "paragraph", label: "Paragraph" },
  { type: "list", label: "List" },
  { type: "table", label: "Table" },
  { type: "field_group", label: "Field group" },
  { type: "form_fields", label: "Form fields" },
  { type: "checklist", label: "Checklist" },
  { type: "clause", label: "Clause" },
  { type: "declaration", label: "Declaration" },
  { type: "signature_block", label: "Signature block" },
  { type: "letterhead", label: "Letterhead" },
  { type: "page_break", label: "Page break" },
];
export const BLOCK_LABEL = Object.fromEntries(BLOCK_TYPES.map((b) => [b.type, b.label]));

export const SIGNATURE_PARTIES = ["employer", "employee", "candidate", "witness", "reviewer"];
const FORM_FIELD_TYPES = ["text", "textarea", "date", "number", "select", "checkbox"];
const DEFAULT_CLASSIFICATIONS = ["PERSONAL_BASIC", "PERSONAL_CONFIDENTIAL", "FINANCIAL", "SPECIAL_CATEGORY", "TENANT_CUSTOMER", "PLATFORM_META"];

export function newBlock(type) {
  switch (type) {
    case "heading": return { type, text: "", level: 2 };
    case "paragraph": return { type, text: "", style: "normal" };
    case "list": return { type, style: "bullet", items: [""] };
    case "table": return { type, columns: ["Column 1", "Column 2"], rows: [["", ""]] };
    case "field_group": return { type, fields: [] };
    case "form_fields": return { type, fields: [{ key: "", label: "", type: "text", required: false }] };
    case "checklist": return { type, items: [{ key: "", label: "", mandatory: true }] };
    case "clause": return { type, key: "", required: true };
    case "declaration": return { type, text: "", mode: "acknowledge" };
    case "signature_block": return { type, parties: ["employer", "employee"] };
    default: return { type };
  }
}

export function blockSummary(b) {
  const clip = (s) => (s && s.length > 90 ? `${s.slice(0, 90)}…` : s || "");
  switch (b.type) {
    case "heading": case "paragraph": case "declaration": return clip(b.text) || "(empty)";
    case "list": return `${(b.items || []).length} item(s)`;
    case "table": return b.rows_from ? `rows from ${b.rows_from}` : `${(b.columns || []).length} column(s), ${(b.rows || []).length} row(s)`;
    case "field_group": return (b.fields || []).join(", ") || "(no fields)";
    case "form_fields": return (b.fields || []).map((f) => f.label || f.key).join(", ") || "(no fields)";
    case "checklist": return `${(b.items || []).length} item(s)`;
    case "clause": return b.key ? `{{clause:${b.key}}}${b.required ? " · required" : ""}` : "(no clause chosen)";
    case "signature_block": return (b.parties || []).join(", ");
    default: return "";
  }
}

// Helpers for list-of-object editors.
const replaceAt = (arr, i, v) => arr.map((x, j) => (j === i ? v : x));
const removeAt = (arr, i) => arr.filter((_, j) => j !== i);
const move = (arr, i, d) => {
  const j = i + d;
  if (j < 0 || j >= arr.length) return arr;
  const out = [...arr];
  [out[i], out[j]] = [out[j], out[i]];
  return out;
};

function RowControls({ index, count, onMove, onRemove, label, disabled }) {
  return (
    <div className="flex shrink-0 items-center">
      <button type="button" className={btnIcon} disabled={disabled || index === 0} onClick={() => onMove(index, -1)} aria-label={`Move ${label} up`}><ArrowUp className="h-3.5 w-3.5" /></button>
      <button type="button" className={btnIcon} disabled={disabled || index === count - 1} onClick={() => onMove(index, 1)} aria-label={`Move ${label} down`}><ArrowDown className="h-3.5 w-3.5" /></button>
      <button type="button" className={btnIcon} disabled={disabled} onClick={() => onRemove(index)} aria-label={`Remove ${label}`}><Trash2 className="h-3.5 w-3.5" /></button>
    </div>
  );
}

function FieldMultiSelect({ uid, selected, onChange, fields, disabled }) {
  const [q, setQ] = useState("");
  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    return fields.filter((f) => !s || f.key.toLowerCase().includes(s) || (f.label || "").toLowerCase().includes(s)).slice(0, 80);
  }, [fields, q]);
  return (
    <div>
      <label htmlFor={`${uid}-fs`} className="mb-1 block text-xs font-semibold text-gray-600">Fields shown in this group</label>
      <input id={`${uid}-fs`} type="search" className={inputClass} placeholder="Search fields…" value={q} onChange={(e) => setQ(e.target.value)} disabled={disabled} />
      <fieldset className="mt-1.5 max-h-56 overflow-y-auto rounded-lg border border-gray-200 p-2">
        <legend className="sr-only">Fields</legend>
        {list.map((f) => (
          <label key={f.key} className="flex items-center gap-2 py-0.5 text-sm text-gray-700">
            <input type="checkbox" className="h-4 w-4 accent-blue-600" disabled={disabled} checked={selected.includes(f.key)}
              onChange={(e) => onChange(e.target.checked ? [...selected, f.key] : selected.filter((k) => k !== f.key))} />
            <span className="min-w-0 flex-1 truncate">{f.label} <code className="text-xs text-gray-500">{f.key}</code></span>
            <ClassificationBadge value={f.classification} />
          </label>
        ))}
        {list.length === 0 && <p className="text-xs text-gray-500">No matching fields.</p>}
      </fieldset>
      {selected.some((k) => !fields.find((f) => f.key === k)) && (
        <p className="mt-1 text-xs text-gray-500">Also selected: {selected.filter((k) => !fields.find((f) => f.key === k)).join(", ")}</p>
      )}
    </div>
  );
}

export default function BlockFields({ block, onChange, fields = [], clauseKeys = [], disabled = false }) {
  const uid = useId();
  const b = block;
  const set = (patch) => onChange({ ...b, ...patch });
  const classifications = useMemo(() => {
    const s = new Set(fields.map((f) => f.classification).filter(Boolean));
    return s.size ? [...s] : DEFAULT_CLASSIFICATIONS;
  }, [fields]);

  const [conditionText, setConditionText] = useState(() => (b.include_when ? JSON.stringify(b.include_when, null, 2) : ""));
  const [conditionError, setConditionError] = useState("");
  const commitCondition = (text) => {
    setConditionText(text);
    if (!text.trim()) { setConditionError(""); const { include_when: _omit, ...rest } = b; onChange(rest); return; }
    try {
      const parsed = JSON.parse(text);
      if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) throw new Error("must be an object");
      setConditionError("");
      set({ include_when: parsed });
    } catch (e) {
      setConditionError(`Not valid JSON (${e.message}). The condition is not applied until it is valid.`);
    }
  };

  let body = null;
  switch (b.type) {
    case "letterhead":
      body = <p className="text-sm text-gray-500">Prints the employer's letterhead (name, address, logo). Nothing to configure.</p>;
      break;
    case "page_break":
      body = <p className="text-sm text-gray-500">Starts a new page in the PDF. Nothing to configure.</p>;
      break;
    case "heading":
      body = (
        <div className="grid gap-3 sm:grid-cols-[1fr_8rem]">
          <Labeled id={`${uid}-t`} label="Heading text"><SmartText id={`${uid}-t`} value={b.text} onChange={(text) => set({ text })} disabled={disabled} /></Labeled>
          <Labeled id={`${uid}-l`} label="Level">
            <select id={`${uid}-l`} className={inputClass} value={b.level || 2} disabled={disabled} onChange={(e) => set({ level: Number(e.target.value) })}>
              <option value={1}>1 (title)</option><option value={2}>2</option><option value={3}>3</option>
            </select>
          </Labeled>
        </div>
      );
      break;
    case "paragraph":
      body = (
        <div className="space-y-3">
          <Labeled id={`${uid}-t`} label="Text" hint="Use the field and clause pickers to insert {{placeholders}} at the cursor.">
            <SmartText id={`${uid}-t`} multiline rows={5} value={b.text} onChange={(text) => set({ text })} disabled={disabled} />
          </Labeled>
          <Labeled id={`${uid}-s`} label="Style" className="max-w-[12rem]">
            <select id={`${uid}-s`} className={inputClass} value={b.style || "normal"} disabled={disabled} onChange={(e) => set({ style: e.target.value })}>
              <option value="normal">Normal</option><option value="small">Small print</option><option value="notice">Notice (highlighted)</option>
            </select>
          </Labeled>
        </div>
      );
      break;
    case "declaration":
      body = (
        <div className="space-y-3">
          <Labeled id={`${uid}-t`} label="Declaration text">
            <SmartText id={`${uid}-t`} multiline rows={4} value={b.text} onChange={(text) => set({ text })} disabled={disabled} />
          </Labeled>
          <Labeled id={`${uid}-m`} label="The recipient must" className="max-w-[14rem]">
            <select id={`${uid}-m`} className={inputClass} value={b.mode || "acknowledge"} disabled={disabled} onChange={(e) => set({ mode: e.target.value })}>
              <option value="acknowledge">Acknowledge</option><option value="sign">Sign</option><option value="consent">Give consent</option>
            </select>
          </Labeled>
        </div>
      );
      break;
    case "list": {
      const items = b.items || [];
      body = (
        <div className="space-y-3">
          <Labeled id={`${uid}-s`} label="List style" className="max-w-[12rem]">
            <select id={`${uid}-s`} className={inputClass} value={b.style || "bullet"} disabled={disabled} onChange={(e) => set({ style: e.target.value })}>
              <option value="bullet">Bullets</option><option value="number">Numbered</option><option value="check">Check boxes</option>
            </select>
          </Labeled>
          <fieldset>
            <legend className="mb-1 text-xs font-semibold text-gray-600">Items</legend>
            <ol className="space-y-1.5">
              {items.map((it, i) => (
                <li key={i} className="flex items-center gap-1.5">
                  <span className="w-6 text-right text-xs text-gray-400">{i + 1}.</span>
                  <SmartText id={`${uid}-i${i}`} aria-label={`List item ${i + 1}`} value={it} disabled={disabled} onChange={(v) => set({ items: replaceAt(items, i, v) })} />
                  <RowControls index={i} count={items.length} label={`item ${i + 1}`} disabled={disabled}
                    onMove={(x, d) => set({ items: move(items, x, d) })} onRemove={(x) => set({ items: removeAt(items, x) })} />
                </li>
              ))}
            </ol>
            {!disabled && <button type="button" className={`${btnSmall} mt-2`} onClick={() => set({ items: [...items, ""] })}><Plus className="h-3.5 w-3.5" /> Add item</button>}
          </fieldset>
        </div>
      );
      break;
    }
    case "table": {
      const columns = b.columns || [];
      const rows = b.rows || [];
      body = (
        <div className="space-y-2">
          {b.rows_from && <p className="text-sm text-gray-600">Rows are filled from <code>{b.rows_from}</code> when the document is generated.</p>}
          <div className="overflow-x-auto">
            <table className="text-sm">
              <caption className="sr-only">Table cells</caption>
              <thead>
                <tr>
                  {columns.map((c, ci) => (
                    <th key={ci} scope="col" className="p-1 align-bottom">
                      <div className="flex items-center gap-1">
                        <SmartText id={`${uid}-c${ci}`} aria-label={`Column ${ci + 1} heading`} value={c} disabled={disabled} className="min-w-[8rem] font-semibold"
                          onChange={(v) => set({ columns: replaceAt(columns, ci, v) })} />
                        {!disabled && (
                          <button type="button" className={btnIcon} aria-label={`Remove column ${ci + 1}`}
                            onClick={() => set({ columns: removeAt(columns, ci), rows: rows.map((r) => removeAt(r, ci)) })}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              {!b.rows_from && (
                <tbody>
                  {rows.map((r, ri) => (
                    <tr key={ri}>
                      {columns.map((_, ci) => (
                        <td key={ci} className="p-1">
                          <SmartText id={`${uid}-r${ri}c${ci}`} aria-label={`Row ${ri + 1}, column ${ci + 1}`} value={r[ci] ?? ""} disabled={disabled}
                            className="min-w-[8rem]"
                            onChange={(v) => set({ rows: replaceAt(rows, ri, columns.map((__, k) => (k === ci ? v : r[k] ?? ""))) })} />
                        </td>
                      ))}
                      <td className="p-1">
                        {!disabled && (
                          <button type="button" className={btnIcon} aria-label={`Remove row ${ri + 1}`} onClick={() => set({ rows: removeAt(rows, ri) })}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              )}
            </table>
          </div>
          {!disabled && (
            <div className="flex gap-2">
              <button type="button" className={btnSmall} onClick={() => set({ columns: [...columns, `Column ${columns.length + 1}`], rows: rows.map((r) => [...r, ""]) })}>
                <Plus className="h-3.5 w-3.5" /> Add column
              </button>
              {!b.rows_from && (
                <button type="button" className={btnSmall} onClick={() => set({ rows: [...rows, columns.map(() => "")] })}>
                  <Plus className="h-3.5 w-3.5" /> Add row
                </button>
              )}
            </div>
          )}
        </div>
      );
      break;
    }
    case "field_group": {
      const selected = b.fields || [];
      const labels = b.labels || {};
      body = (
        <div className="space-y-3">
          <FieldMultiSelect uid={uid} selected={selected} fields={fields} disabled={disabled} onChange={(next) => set({ fields: next })} />
          {selected.length > 0 && (
            <fieldset>
              <legend className="mb-1 text-xs font-semibold text-gray-600">Custom labels (optional)</legend>
              <div className="grid gap-2 sm:grid-cols-2">
                {selected.map((k) => (
                  <Labeled key={k} id={`${uid}-lb-${k}`} label={k}>
                    <input id={`${uid}-lb-${k}`} className={inputClass} disabled={disabled} value={labels[k] || ""}
                      placeholder={fields.find((f) => f.key === k)?.label || ""}
                      onChange={(e) => {
                        const next = { ...labels, [k]: e.target.value };
                        if (!e.target.value) delete next[k];
                        set({ labels: Object.keys(next).length ? next : undefined });
                      }} />
                  </Labeled>
                ))}
              </div>
            </fieldset>
          )}
        </div>
      );
      break;
    }
    case "form_fields": {
      const list = b.fields || [];
      body = (
        <fieldset>
          <legend className="mb-1 text-xs font-semibold text-gray-600">Form fields the recipient fills in</legend>
          <ul className="space-y-2">
            {list.map((f, i) => (
              <li key={i} className="rounded-lg border border-gray-200 p-2">
                <div className="grid gap-2 sm:grid-cols-[1fr_1fr_8rem_10rem]">
                  <Labeled id={`${uid}-fk${i}`} label="Key"><input id={`${uid}-fk${i}`} className={inputClass} disabled={disabled} value={f.key || ""} onChange={(e) => set({ fields: replaceAt(list, i, { ...f, key: e.target.value }) })} /></Labeled>
                  <Labeled id={`${uid}-fl${i}`} label="Label"><input id={`${uid}-fl${i}`} className={inputClass} disabled={disabled} value={f.label || ""} onChange={(e) => set({ fields: replaceAt(list, i, { ...f, label: e.target.value }) })} /></Labeled>
                  <Labeled id={`${uid}-ft${i}`} label="Type">
                    <select id={`${uid}-ft${i}`} className={inputClass} disabled={disabled} value={f.type || "text"} onChange={(e) => set({ fields: replaceAt(list, i, { ...f, type: e.target.value }) })}>
                      {FORM_FIELD_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </Labeled>
                  <Labeled id={`${uid}-fc${i}`} label="Classification">
                    <select id={`${uid}-fc${i}`} className={inputClass} disabled={disabled} value={f.classification || ""}
                      onChange={(e) => set({ fields: replaceAt(list, i, { ...f, classification: e.target.value || undefined }) })}>
                      <option value="">Default</option>
                      {classifications.map((c) => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </Labeled>
                </div>
                <div className="mt-2 flex flex-wrap items-end gap-3">
                  {f.type === "select" && (
                    <Labeled id={`${uid}-fo${i}`} label="Options (comma separated)" className="min-w-[14rem] flex-1">
                      <input id={`${uid}-fo${i}`} className={inputClass} disabled={disabled} value={(f.options || []).join(", ")}
                        onChange={(e) => set({ fields: replaceAt(list, i, { ...f, options: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) }) })} />
                    </Labeled>
                  )}
                  <label className="flex items-center gap-2 py-2 text-sm text-gray-700">
                    <input type="checkbox" className="h-4 w-4 accent-blue-600" disabled={disabled} checked={!!f.required}
                      onChange={(e) => set({ fields: replaceAt(list, i, { ...f, required: e.target.checked }) })} /> Required
                  </label>
                  <div className="ml-auto"><RowControls index={i} count={list.length} label={`form field ${i + 1}`} disabled={disabled}
                    onMove={(x, d) => set({ fields: move(list, x, d) })} onRemove={(x) => set({ fields: removeAt(list, x) })} /></div>
                </div>
              </li>
            ))}
          </ul>
          {!disabled && <button type="button" className={`${btnSmall} mt-2`} onClick={() => set({ fields: [...list, { key: "", label: "", type: "text", required: false }] })}><Plus className="h-3.5 w-3.5" /> Add form field</button>}
        </fieldset>
      );
      break;
    }
    case "checklist": {
      const items = b.items || [];
      body = (
        <fieldset>
          <legend className="mb-1 text-xs font-semibold text-gray-600">Checklist items</legend>
          <ul className="space-y-2">
            {items.map((it, i) => (
              <li key={i} className="rounded-lg border border-gray-200 p-2">
                <div className="grid gap-2 sm:grid-cols-[1fr_2fr_9rem_7rem]">
                  <Labeled id={`${uid}-ck${i}`} label="Key"><input id={`${uid}-ck${i}`} className={inputClass} disabled={disabled} value={it.key || ""} onChange={(e) => set({ items: replaceAt(items, i, { ...it, key: e.target.value }) })} /></Labeled>
                  <Labeled id={`${uid}-cl${i}`} label="Label"><SmartText id={`${uid}-cl${i}`} disabled={disabled} value={it.label || ""} onChange={(v) => set({ items: replaceAt(items, i, { ...it, label: v }) })} /></Labeled>
                  <Labeled id={`${uid}-co${i}`} label="Owner role"><input id={`${uid}-co${i}`} className={inputClass} disabled={disabled} value={it.owner_role || ""} placeholder="e.g. manager" onChange={(e) => set({ items: replaceAt(items, i, { ...it, owner_role: e.target.value || undefined }) })} /></Labeled>
                  <Labeled id={`${uid}-cd${i}`} label="Due (days)"><input id={`${uid}-cd${i}`} type="number" className={inputClass} disabled={disabled} value={it.due_offset_days ?? ""} onChange={(e) => set({ items: replaceAt(items, i, { ...it, due_offset_days: e.target.value === "" ? undefined : Number(e.target.value) }) })} /></Labeled>
                </div>
                <div className="mt-1 flex items-center justify-between">
                  <label className="flex items-center gap-2 text-sm text-gray-700">
                    <input type="checkbox" className="h-4 w-4 accent-blue-600" disabled={disabled} checked={!!it.mandatory}
                      onChange={(e) => set({ items: replaceAt(items, i, { ...it, mandatory: e.target.checked }) })} /> Mandatory
                  </label>
                  <RowControls index={i} count={items.length} label={`checklist item ${i + 1}`} disabled={disabled}
                    onMove={(x, d) => set({ items: move(items, x, d) })} onRemove={(x) => set({ items: removeAt(items, x) })} />
                </div>
              </li>
            ))}
          </ul>
          {!disabled && <button type="button" className={`${btnSmall} mt-2`} onClick={() => set({ items: [...items, { key: "", label: "", mandatory: true }] })}><Plus className="h-3.5 w-3.5" /> Add item</button>}
        </fieldset>
      );
      break;
    }
    case "clause":
      body = (
        <div className="flex flex-wrap items-end gap-3">
          <Labeled id={`${uid}-ck`} label="Clause key" className="min-w-[16rem] flex-1" hint="The clause's released text in the jurisdiction pack is inserted here.">
            <input id={`${uid}-ck`} list={`${uid}-ckl`} className={inputClass} disabled={disabled} value={b.key || ""}
              onChange={(e) => set({ key: e.target.value.trim() })} />
            <datalist id={`${uid}-ckl`}>{clauseKeys.map((k) => <option key={k} value={k} />)}</datalist>
          </Labeled>
          <label className="flex items-center gap-2 py-2 text-sm text-gray-700">
            <input type="checkbox" className="h-4 w-4 accent-blue-600" disabled={disabled} checked={!!b.required} onChange={(e) => set({ required: e.target.checked })} /> Required
          </label>
        </div>
      );
      break;
    case "signature_block": {
      const parties = b.parties || [];
      body = (
        <fieldset>
          <legend className="mb-1 text-xs font-semibold text-gray-600">Who signs</legend>
          <div className="flex flex-wrap gap-4">
            {SIGNATURE_PARTIES.map((p) => (
              <label key={p} className="flex items-center gap-2 text-sm capitalize text-gray-700">
                <input type="checkbox" className="h-4 w-4 accent-blue-600" disabled={disabled} checked={parties.includes(p)}
                  onChange={(e) => set({ parties: e.target.checked ? SIGNATURE_PARTIES.filter((x) => x === p || parties.includes(x)) : parties.filter((x) => x !== p) })} />
                {p}
              </label>
            ))}
          </div>
        </fieldset>
      );
      break;
    }
    default:
      body = <pre className="overflow-x-auto rounded bg-gray-50 p-2 text-xs text-gray-700">{JSON.stringify(b, null, 2)}</pre>;
  }

  return (
    <div className="space-y-3">
      {body}
      <details className="rounded-lg border border-dashed border-gray-200 px-3 py-2" open={!!b.include_when}>
        <summary className="cursor-pointer text-xs font-semibold text-gray-600">Condition (include only when…)</summary>
        <Labeled id={`${uid}-cond`} label="include_when (JSON)" className="mt-2"
          hint='Leave empty to always include. Example: {"field": "employment.employment_type", "op": "in", "value": ["part_time"]}. Ops: eq, ne, in, not_in, present, absent; combine with {"all": [...]} or {"any": [...]}.'>
          <textarea id={`${uid}-cond`} rows={3} className={`${inputClass} font-mono text-xs`} disabled={disabled} value={conditionText}
            onChange={(e) => commitCondition(e.target.value)} />
        </Labeled>
        {conditionError && <p className="mt-1 text-xs text-red-700" role="alert">{conditionError}</p>}
      </details>
    </div>
  );
}
