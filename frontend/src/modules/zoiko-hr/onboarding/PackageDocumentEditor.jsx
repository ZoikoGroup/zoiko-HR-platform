// Per-hire editor for one draft package document: edit the whole block structure, fill the gaps, preview before saving.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDown, ArrowUp, ChevronDown, ChevronRight, Eye, FileText, Info, Loader2, Plus, RotateCcw, Save, Trash2, X,
} from "lucide-react";
import BlockFields, { BLOCK_LABEL, PACKAGE_BLOCK_TYPES, blockSummary, newBlock } from "../documents/templates/components/BlockFields";
import { ClausePicker, FieldPicker } from "../documents/templates/components/InsertPanels";
import { InsertTargetContext } from "../documents/templates/components/SmartText";
import {
  getHirePackageDocumentEdit, previewHirePackageDocumentEdit, resetHirePackageDocumentEdit, saveHirePackageDocumentEdit,
} from "../../../service/hrService";

let keySeq = 0;
const withKey = (block) => ({ k: `b${++keySeq}`, block });
const inputCls = "w-full rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-sm text-gray-900 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100";
const DATE_INPUTS = ["employment.start_date", "employment.assessment_end_date", "document.issue_date"];

function GapInput({ id, field, value, onChange }) {
  const t = field.custom ? field.input_type : null;
  if (t === "choice" || t === "yes_no") {
    const options = t === "yes_no" ? [{ v: "yes", l: "Yes" }, { v: "no", l: "No" }] : (field.options || []).map((o) => ({ v: o, l: o }));
    return (
      <select id={id} className={inputCls} value={value || ""} onChange={(e) => onChange(e.target.value)}>
        <option value="">Choose…</option>
        {options.map((o) => <option key={o.v} value={o.v}>{o.l}</option>)}
      </select>
    );
  }
  if (t === "long_text" || (!field.custom && field.key === "job.role_purpose")) {
    return <textarea id={id} rows={3} maxLength={4000} className={inputCls} value={value || ""} onChange={(e) => onChange(e.target.value)} />;
  }
  return (
    <input id={id} className={inputCls} value={value || ""} maxLength={field.org_wide ? 255 : 300}
      type={t === "date" || DATE_INPUTS.includes(field.key) ? "date" : "text"}
      inputMode={t === "number" || t === "money" ? "decimal" : undefined}
      onChange={(e) => onChange(e.target.value)} />
  );
}

function BlockRow({ item, index, count, expanded, editable, fields, clauseKeys, listSources, onToggle, onChange, onMove, onDelete }) {
  const { block } = item;
  const label = `${BLOCK_LABEL[block.type] || block.type} block ${index + 1}`;
  return (
    <li className="rounded-xl border border-gray-200 bg-white">
      <div className="flex items-center gap-1 px-2 py-1.5">
        <button type="button" onClick={onToggle} aria-expanded={expanded} aria-controls={`pkg-blk-${item.k}`}
          className="flex min-w-0 flex-1 items-center gap-1.5 rounded text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">
          {expanded ? <ChevronDown className="h-4 w-4 shrink-0 text-gray-500" /> : <ChevronRight className="h-4 w-4 shrink-0 text-gray-500" />}
          <span className="w-5 shrink-0 text-right text-xs text-gray-400">{index + 1}</span>
          <span className="shrink-0 text-xs font-semibold text-gray-800">{BLOCK_LABEL[block.type] || block.type}</span>
          <span className="min-w-0 truncate text-xs text-gray-500">{blockSummary(block)}</span>
          {block.include_when && <span className="shrink-0 text-[10px] font-medium text-blue-700">conditional</span>}
        </button>
        {editable && (
          <>
            <button type="button" className="rounded p-1 text-gray-500 hover:bg-gray-100 disabled:opacity-30" disabled={index === 0}
              onClick={() => onMove(index, -1)} aria-label={`Move ${label} up`}><ArrowUp className="h-3.5 w-3.5" /></button>
            <button type="button" className="rounded p-1 text-gray-500 hover:bg-gray-100 disabled:opacity-30" disabled={index === count - 1}
              onClick={() => onMove(index, 1)} aria-label={`Move ${label} down`}><ArrowDown className="h-3.5 w-3.5" /></button>
            <button type="button" className="rounded p-1 text-rose-600 hover:bg-rose-50" onClick={() => onDelete(index)}
              aria-label={`Delete ${label}`}><Trash2 className="h-3.5 w-3.5" /></button>
          </>
        )}
      </div>
      {expanded && (
        <div id={`pkg-blk-${item.k}`} className="border-t border-gray-100 px-3 py-2">
          <BlockFields block={block} onChange={onChange} pkg disabled={!editable} fields={fields} clauseKeys={clauseKeys} listSources={listSources} />
        </div>
      )}
    </li>
  );
}

export default function PackageDocumentEditor({ hireId, category, title, onClose, onSaved, onError }) {
  const [data, setData] = useState(null);
  const [items, setItems] = useState([]);
  const [values, setValues] = useState({});
  const [expanded, setExpanded] = useState(() => new Set());
  const [addType, setAddType] = useState("paragraph");
  const [dirty, setDirty] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [problems, setProblems] = useState([]);
  const [tab, setTab] = useState("preview");
  const [preview, setPreview] = useState({ url: null, loading: false, error: "" });
  const target = useRef(null);
  const previewSeq = useRef(0);
  const previewUrl = useRef(null);
  const insertCtx = useMemo(() => ({ register: (t) => { target.current = t; } }), []);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await getHirePackageDocumentEdit(hireId, category);
      setData(res);
      setItems((res.content || []).map(withKey));
      setValues(Object.fromEntries((res.missing_fields || []).map((f) => [f.key, res.values?.[f.key] || ""])));
      setDirty(false);
      setProblems([]);
    } catch (e) {
      setError(e?.message || "The document could not be opened for editing.");
    } finally {
      setLoading(false);
    }
  }, [hireId, category]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape" && !dirty) onClose?.(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [dirty, onClose]);

  useEffect(() => {
    const warn = (e) => { if (dirty) { e.preventDefault(); e.returnValue = ""; } };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const contentBody = useMemo(() => items.map((i) => i.block), [items]);
  const contentKey = useMemo(() => JSON.stringify(contentBody), [contentBody]);
  const valuesKey = useMemo(() => JSON.stringify(values), [values]);

  useEffect(() => {
    if (!data || !data.editable) return undefined;
    let alive = true;
    const seq = ++previewSeq.current;
    setPreview((p) => ({ ...p, loading: true, error: "" }));
    const t = setTimeout(() => {
      previewHirePackageDocumentEdit(hireId, category, contentBody, values)
        .then(({ blob }) => {
          if (!alive || seq !== previewSeq.current) return;
          if (previewUrl.current) URL.revokeObjectURL(previewUrl.current);
          const url = URL.createObjectURL(blob);
          previewUrl.current = url;
          setPreview({ url, loading: false, error: "" });
        })
        .catch((e) => { if (alive && seq === previewSeq.current) setPreview((p) => ({ ...p, loading: false, error: e?.message || "The preview could not be made." })); });
    }, 800);
    return () => { alive = false; clearTimeout(t); };
    // contentKey and valuesKey are the bodies; the arrays themselves change identity on each keystroke
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contentKey, valuesKey, data?.editable, hireId, category]);

  useEffect(() => () => {
    if (previewUrl.current) URL.revokeObjectURL(previewUrl.current);
  }, []);

  const updateBlock = (index, block) => { setItems((list) => list.map((it, i) => (i === index ? { ...it, block } : it))); setDirty(true); };
  const moveBlock = (index, d) => {
    setItems((list) => {
      const j = index + d;
      if (j < 0 || j >= list.length) return list;
      const next = [...list];
      [next[index], next[j]] = [next[j], next[index]];
      return next;
    });
    setDirty(true);
  };
  const deleteBlock = (index) => { setItems((list) => list.filter((_, i) => i !== index)); setDirty(true); };
  const addBlock = () => {
    const it = withKey(newBlock(addType, true));
    setItems((list) => [...list, it]);
    setExpanded((s) => new Set(s).add(it.k));
    setDirty(true);
  };
  const toggle = (k) => setExpanded((s) => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n; });

  const insertPlaceholder = (text) => {
    const t = target.current;
    if (t && t.isAlive()) {
      t.insert(text);
      setDirty(true);
      return;
    }
    const it = withKey({ type: "paragraph", text, style: "normal" });
    setItems((list) => [...list, it]);
    setExpanded((s) => new Set(s).add(it.k));
    setDirty(true);
  };

  const save = async () => {
    setSaving(true);
    setError("");
    setProblems([]);
    try {
      const gapValues = Object.fromEntries(Object.entries(values).filter(([, v]) => String(v || "").trim()));
      const pkg = await saveHirePackageDocumentEdit(hireId, category, contentBody, gapValues);
      onSaved?.(pkg, "Your edits are saved. Preview and download now use this wording.");
      await load();
    } catch (e) {
      const list = e?.problems || e?.detail?.problems || [];
      setProblems(Array.isArray(list) ? list : []);
      setError(e?.message || "The edits could not be saved.");
      onError?.(e?.message || "The edits could not be saved.");
    } finally {
      setSaving(false);
    }
  };

  const reset = async () => {
    if (!window.confirm("Discard your edits and use the standard wording for this document?")) return;
    setSaving(true);
    setError("");
    try {
      const pkg = await resetHirePackageDocumentEdit(hireId, category);
      onSaved?.(pkg, "The standard wording is used again.");
      await load();
    } catch (e) {
      setError(e?.message || "The edits could not be reset.");
    } finally {
      setSaving(false);
    }
  };

  if (loading && !data) {
    return (
      <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/60" role="status">
        <Loader2 className="h-6 w-6 animate-spin text-white" />
      </div>
    );
  }

  const editable = !!data?.editable;
  const gaps = data?.missing_fields || [];
  const placeholders = data?.placeholders;
  const fields = placeholders?.fields || [];
  const clauses = placeholders?.clauses || [];
  const listSources = placeholders?.list_sources || [];
  const titleText = data?.title || title || "Document";

  return (
    <InsertTargetContext.Provider value={insertCtx}>
      <div className="fixed inset-0 z-[60] flex justify-center bg-slate-900/60 p-2 sm:p-5" role="dialog" aria-modal="true"
        aria-label={`Edit ${titleText}`}>
        <div className="flex h-full w-full max-w-7xl flex-col overflow-hidden rounded-2xl bg-slate-50 shadow-2xl">
          <header className="flex shrink-0 flex-wrap items-start gap-x-3 gap-y-2 border-b border-gray-200 bg-white px-4 py-3">
            <div className="min-w-[12rem] flex-1">
              <h2 className="truncate text-base font-semibold text-gray-900">Edit / Fill missing gaps – {titleText}</h2>
              <p className="text-xs text-gray-500">
                {data?.template_id} · {editable ? "Draft for this new hire only" : "Sent documents are read-only"}
                {data?.edited ? " · edited wording" : ""}
              </p>
            </div>
            <div className="ml-auto flex shrink-0 items-center gap-2">
              {dirty && <span className="hidden text-xs font-semibold text-amber-700 sm:inline">Unsaved changes</span>}
              {editable && (
                <>
                  {data?.edited && (
                    <button type="button" onClick={reset} disabled={saving}
                      className="inline-flex items-center gap-1 rounded-lg border border-gray-300 px-2.5 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50">
                      <RotateCcw className="h-3.5 w-3.5" />Use standard
                    </button>
                  )}
                  <button type="button" onClick={save} disabled={saving || (!dirty && !gaps.some((f) => String(values[f.key] || "").trim()))}
                    className="inline-flex items-center gap-1 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50">
                    {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}Save changes
                  </button>
                </>
              )}
              <button type="button" onClick={() => {
                if (dirty && !window.confirm("Discard unsaved changes?")) return;
                if (previewUrl.current) { URL.revokeObjectURL(previewUrl.current); previewUrl.current = null; }
                onClose?.();
              }} aria-label="Close editor" className="rounded-lg p-1.5 text-gray-500 hover:bg-gray-100"><X className="h-5 w-5" /></button>
            </div>
          </header>

          {(error || problems.length > 0) && (
            <div className="shrink-0 space-y-1 border-b border-gray-200 px-4 py-2 text-xs">
              {error && <p role="alert" className="font-medium text-rose-700">{error}</p>}
              {problems.map((p, i) => <p key={i} role="alert" className="text-rose-700">• {p}</p>)}
            </div>
          )}

          <div className="min-h-0 flex-1 overflow-y-auto p-3 sm:p-4">
            {!editable && (
              <p className="mb-3 rounded-xl border border-gray-200 bg-white p-3 text-sm text-slate-700">
                This document has already been sent. The copy that went out is never rewritten; the panel's Preview shows exactly what was sent.
              </p>
            )}
            <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_24rem]">
              <div className="space-y-4">
                {gaps.length > 0 && editable && (
                  <section className="rounded-2xl border border-amber-200 bg-amber-50/70 p-3" aria-label="Missing details">
                    <h3 className="text-sm font-semibold text-amber-900">Missing details and wording</h3>
                    <p className="mt-0.5 text-xs text-amber-900">
                      Type a value here to fill a gap in this document. Values are saved for this new hire when you press Save changes.
                    </p>
                    <div className="mt-2 grid gap-2 sm:grid-cols-2">
                      {gaps.filter((f) => f.editable).map((f) => (
                        <div key={f.key}>
                          <label htmlFor={`pkg-edit-gap-${f.key}`} className="mb-0.5 block text-xs font-semibold text-amber-900">
                            {f.meaning}{f.org_wide ? " (all new hires)" : ""}
                          </label>
                          <GapInput id={`pkg-edit-gap-${f.key}`} field={f} value={values[f.key] || ""}
                            onChange={(v) => { setValues((p) => ({ ...p, [f.key]: v })); setDirty(true); }} />
                        </div>
                      ))}
                    </div>
                    {gaps.filter((f) => !f.editable).map((f) => (
                      <p key={f.key} className="mt-2 text-xs text-amber-900">
                        {f.meaning} – {f.settings_path
                          ? <a href={f.settings_path} className="font-semibold underline">set it in Settings</a>
                          : "entered by the new hire in their portal"}
                      </p>
                    ))}
                    {(data?.missing_clauses || []).map((c) => (
                      <p key={c.key} className="mt-1 text-xs text-amber-900">Counsel wording: {c.title} – <a href="/zoiko-hr/onboarding/settings#offer-package" className="font-semibold underline">add it in Settings</a></p>
                    ))}
                  </section>
                )}

                <section className="rounded-2xl border border-gray-200 bg-white p-3">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <h3 className="text-sm font-semibold text-gray-900">Document wording</h3>
                    {editable && (
                      <span className="flex gap-2 text-xs font-semibold text-blue-700">
                        <button type="button" onClick={() => setExpanded(new Set(items.map((i) => i.k)))}>Expand all</button>
                        <button type="button" onClick={() => setExpanded(new Set())}>Collapse all</button>
                      </span>
                    )}
                  </div>
                  {!editable && <p className="mb-2 text-xs text-gray-500">The blocks below are the wording of the sent copy, shown for reference.</p>}
                  <ol className="space-y-1.5">
                    {items.map((it, i) => (
                      <BlockRow key={it.k} item={it} index={i} count={items.length} editable={editable}
                        fields={fields} clauseKeys={clauses.map((c) => c.key)} listSources={listSources}
                        expanded={expanded.has(it.k)} onToggle={() => toggle(it.k)} onChange={(b) => updateBlock(i, b)}
                        onMove={moveBlock} onDelete={deleteBlock} />
                    ))}
                  </ol>
                  {editable && (
                    <div className="mt-3 flex flex-wrap items-end gap-2 border-t border-gray-100 pt-3">
                      <label htmlFor="pkg-edit-add-type" className="text-xs font-semibold text-gray-600">Add a block</label>
                      <select id="pkg-edit-add-type" className={inputCls + " max-w-[14rem]"} value={addType} onChange={(e) => setAddType(e.target.value)}>
                        {PACKAGE_BLOCK_TYPES.map((b) => <option key={b.type} value={b.type}>{b.label}</option>)}
                      </select>
                      <button type="button" onClick={addBlock} className="inline-flex items-center gap-1 rounded-lg border border-gray-300 px-2.5 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50">
                        <Plus className="h-3.5 w-3.5" />Add
                      </button>
                    </div>
                  )}
                </section>
              </div>

              <aside className="space-y-3 xl:sticky xl:top-0 xl:self-start">
                <div className="rounded-2xl border border-gray-200 bg-white p-3">
                  <div role="tablist" aria-label="Editor tools" className="mb-2 flex gap-1 rounded-lg bg-gray-100 p-1">
                    {[["preview", "Preview", Eye], ["fields", "Insert field", FileText], ["clauses", "Insert clause", FileText]].map(([id, label, Icon]) => (
                      <button key={id} type="button" role="tab" id={`pkg-edit-tab-${id}`} aria-selected={tab === id}
                        aria-controls={`pkg-edit-panel-${id}`} onClick={() => setTab(id)}
                        className={`flex flex-1 items-center justify-center gap-1 rounded-md px-1 py-1.5 text-[11px] font-semibold ${tab === id ? "bg-white text-gray-900 shadow-sm" : "text-gray-600 hover:text-gray-800"}`}>
                        <Icon className="h-3.5 w-3.5" />{label}
                      </button>
                    ))}
                  </div>
                  <div role="tabpanel" id="pkg-edit-panel-preview" aria-labelledby="pkg-edit-tab-preview" hidden={tab !== "preview"}>
                    <p className="mb-1 text-[11px] text-gray-500">Live preview with this new hire's details. Nothing is sent.</p>
                    {preview.loading && <p className="mb-1 text-xs text-gray-500"><Loader2 className="mr-1 inline h-3 w-3 animate-spin" />Updating preview…</p>}
                    {preview.error && <p role="alert" className="mb-1 text-xs text-rose-700">{preview.error}</p>}
                    {preview.url
                      ? <iframe title="Document preview" src={preview.url} className="h-[70vh] w-full rounded-lg border border-gray-200 bg-white" />
                      : !preview.loading && <p className="rounded-lg border border-dashed border-gray-300 p-6 text-center text-xs text-gray-500">Preview not available.</p>}
                  </div>
                  <div role="tabpanel" id="pkg-edit-panel-fields" aria-labelledby="pkg-edit-tab-fields" hidden={tab !== "fields"}>
                    {editable ? <FieldPicker fields={fields} onInsert={insertPlaceholder} /> : <p className="text-sm text-gray-500">Read-only.</p>}
                  </div>
                  <div role="tabpanel" id="pkg-edit-panel-clauses" aria-labelledby="pkg-edit-tab-clauses" hidden={tab !== "clauses"}>
                    {editable ? <ClausePicker clauses={clauses} onInsert={insertPlaceholder} /> : <p className="text-sm text-gray-500">Read-only.</p>}
                  </div>
                </div>
                <p className="flex items-start gap-1.5 rounded-xl border border-blue-100 bg-blue-50 p-2 text-[11px] text-blue-900">
                  <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  Use the field and clause buttons to insert <code>{"{{placeholders}}"}</code> at the cursor. Saved edits affect this
                  hire's draft, its preview, downloads and what is issued on Send – never a document already sent.
                </p>
                {data?.edited_at && <p className="text-[11px] text-gray-500">Last edited {new Date(data.edited_at).toLocaleString()}</p>}
              </aside>
            </div>
          </div>
        </div>
      </div>
    </InsertTargetContext.Provider>
  );
}
