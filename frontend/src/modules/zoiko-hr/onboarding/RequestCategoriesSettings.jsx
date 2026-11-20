/*
 * The organisation's document request (upload) categories: add, rename, describe, accepted file types, maximum size,
 * requested by default, reorder, switch off. A category that has been used is switched off, never deleted. The five
 * standard categories can be renamed but their keys stay.
 */
import { useState } from "react";
import { ArrowDown, ArrowUp, Loader2, Plus, Save, Trash2 } from "lucide-react";
import { PrimaryButton, SecondaryButton, StatusPill } from "../recruitment/ui";
import { addRequestCategory, deleteRequestCategory, updateRequestCategory } from "../../../service/docsSetupService";

const inputCls = "w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100";

function CategoryRow({ c, index, count, fileTypes, maxMb, onSaved, onMove, onMessage }) {
  const [form, setForm] = useState({ label: c.label, description: c.description || "", accepted_types: c.accepted_types,
    max_size_mb: c.max_size_mb, required_by_default: c.required_by_default, active: c.active });
  const [busy, setBusy] = useState(false);
  const dirty = JSON.stringify(form) !== JSON.stringify({ label: c.label, description: c.description || "", accepted_types: c.accepted_types,
    max_size_mb: c.max_size_mb, required_by_default: c.required_by_default, active: c.active });

  const save = async () => {
    setBusy(true);
    try {
      onSaved(await updateRequestCategory(c.id, { ...form, max_size_mb: Number(form.max_size_mb) }));
      onMessage({ tone: "ok", text: `${form.label} saved.` });
    } catch (e) {
      onMessage({ tone: "error", text: e?.message || "The category could not be saved." });
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    const used = c.used || c.is_system;
    if (!window.confirm(used ? `${c.label} has been used, so it will be switched off (not deleted). Continue?` : `Delete ${c.label}?`)) return;
    setBusy(true);
    try {
      onSaved(await deleteRequestCategory(c.id));
    } catch (e) {
      onMessage({ tone: "error", text: e?.message || "The category could not be removed." });
    } finally {
      setBusy(false);
    }
  };

  return (
    <li className={`rounded-2xl border p-3 ${form.active ? "border-gray-200 bg-white" : "border-gray-200 bg-gray-50"}`}>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor={`rc-label-${c.id}`} className="mb-1 block text-xs font-semibold text-gray-600">Name</label>
          <input id={`rc-label-${c.id}`} className={inputCls} value={form.label} onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))} />
          <p className="mt-1 text-xs text-gray-400">Key: <code>{c.key}</code>{c.is_system ? " · standard category" : ""}</p>
        </div>
        <div>
          <label htmlFor={`rc-desc-${c.id}`} className="mb-1 block text-xs font-semibold text-gray-600">What to upload (shown to the new hire)</label>
          <input id={`rc-desc-${c.id}`} className={inputCls} value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
        </div>
        <fieldset>
          <legend className="mb-1 block text-xs font-semibold text-gray-600">Accepted files</legend>
          <div className="flex flex-wrap gap-2">
            {fileTypes.map((t) => (
              <label key={t} className="inline-flex items-center gap-1 text-xs text-gray-700">
                <input type="checkbox" className="accent-blue-600" checked={form.accepted_types.includes(t)}
                  onChange={(e) => setForm((f) => ({ ...f, accepted_types: e.target.checked ? [...f.accepted_types, t] : f.accepted_types.filter((x) => x !== t) }))} />
                {t.toUpperCase()}
              </label>
            ))}
          </div>
        </fieldset>
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label htmlFor={`rc-max-${c.id}`} className="mb-1 block text-xs font-semibold text-gray-600">Maximum size (MB)</label>
            <input id={`rc-max-${c.id}`} type="number" min={1} max={maxMb} className={`${inputCls} w-24`} value={form.max_size_mb}
              onChange={(e) => setForm((f) => ({ ...f, max_size_mb: e.target.value }))} />
          </div>
          <label className="inline-flex items-center gap-1.5 pb-2 text-sm text-gray-700">
            <input type="checkbox" className="accent-blue-600" checked={form.required_by_default}
              onChange={(e) => setForm((f) => ({ ...f, required_by_default: e.target.checked }))} />Requested by default
          </label>
          <label className="inline-flex items-center gap-1.5 pb-2 text-sm text-gray-700">
            <input type="checkbox" className="accent-blue-600" checked={form.active} onChange={(e) => setForm((f) => ({ ...f, active: e.target.checked }))} />Active
          </label>
        </div>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-1">
        <button type="button" className="rounded-lg p-1.5 text-gray-500 hover:bg-gray-50 disabled:opacity-40" disabled={index === 0}
          onClick={() => onMove(index, -1)} aria-label={`Move ${c.label} up`}><ArrowUp className="h-4 w-4" /></button>
        <button type="button" className="rounded-lg p-1.5 text-gray-500 hover:bg-gray-50 disabled:opacity-40" disabled={index === count - 1}
          onClick={() => onMove(index, 1)} aria-label={`Move ${c.label} down`}><ArrowDown className="h-4 w-4" /></button>
        {!form.active && <StatusPill tone="gray">Switched off</StatusPill>}
        <span className="ml-auto flex gap-2">
          <button type="button" onClick={remove} disabled={busy}
            className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-sm text-rose-600 hover:bg-rose-50 disabled:opacity-50">
            <Trash2 className="h-4 w-4" />{c.used || c.is_system ? "Switch off" : "Delete"}
          </button>
          <SecondaryButton icon={busy ? Loader2 : Save} onClick={save} disabled={!dirty || busy}>Save</SecondaryButton>
        </span>
      </div>
    </li>
  );
}

/** `view` is the categories response; `onChange(view)` receives every new state. */
export default function RequestCategoriesSettings({ view, onChange }) {
  const [label, setLabel] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const cats = view?.categories || [];

  const add = async () => {
    if (!label.trim()) return;
    setBusy(true);
    try {
      onChange(await addRequestCategory({ label: label.trim() }));
      setLabel("");
      setMsg({ tone: "ok", text: "Category added." });
    } catch (e) {
      setMsg({ tone: "error", text: e?.message || "The category could not be added." });
    } finally {
      setBusy(false);
    }
  };

  const move = async (i, d) => {
    const j = i + d;
    if (j < 0 || j >= cats.length) return;
    try {
      await updateRequestCategory(cats[i].id, { sort_order: cats[j].sort_order });
      onChange(await updateRequestCategory(cats[j].id, { sort_order: cats[i].sort_order }));
    } catch (e) {
      setMsg({ tone: "error", text: e?.message || "The order could not be changed." });
    }
  };

  return (
    <div className="space-y-3 rounded-2xl border border-gray-200 bg-gray-50/40 p-3 sm:p-4">
      {msg && (
        <div role={msg.tone === "error" ? "alert" : "status"}
          className={`rounded-xl border px-3 py-2 text-sm ${msg.tone === "error" ? "border-red-200 bg-red-50 text-red-700" : "border-emerald-200 bg-emerald-50 text-emerald-800"}`}>
          {msg.text}
        </div>
      )}
      <ol className="space-y-2">
        {cats.map((c, i) => (
          <CategoryRow key={`${c.id}-${c.sort_order}-${c.label}`} c={c} index={i} count={cats.length} fileTypes={view.file_types || []}
            maxMb={view.max_size_mb || 20} onSaved={onChange} onMove={move} onMessage={setMsg} />
        ))}
      </ol>
      <div className="flex flex-col gap-2 sm:flex-row">
        <label htmlFor="rc-new" className="sr-only">New category name</label>
        <input id="rc-new" className={inputCls} placeholder="e.g. Driving licence" value={label} onChange={(e) => setLabel(e.target.value)} />
        <PrimaryButton icon={Plus} onClick={add} disabled={busy || !label.trim()}>Add category</PrimaryButton>
      </div>
    </div>
  );
}
