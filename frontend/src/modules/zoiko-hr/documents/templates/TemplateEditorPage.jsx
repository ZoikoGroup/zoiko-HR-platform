// Block editor for an organization template version (IN_DRAFT only), with field/clause pickers and a live sample preview.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  ArrowDown, ArrowLeft, ArrowUp, CheckCircle2, ChevronDown, ChevronRight, Eye, FileText, Info, Loader2, Lock, Plus, Save, Trash2,
} from "lucide-react";
import HRPage from "../../../../components/HRPage";
import SandboxedHtmlPreview from "../../../../components/documents/SandboxedHtmlPreview";
import {
  getTemplate, getVariant, listClauses, listTemplateFields, previewVariant, updateVariant, validateVariant,
} from "../../../../service/docTemplatesService";
import BlockFields, { BLOCK_LABEL, BLOCK_TYPES, blockSummary, newBlock } from "./components/BlockFields";
import { ClausePicker, FieldPicker } from "./components/InsertPanels";
import { InsertTargetContext } from "./components/SmartText";
import TagListEditor from "./components/TagListEditor";
import {
  ErrorBanner, InfoBanner, Labeled, LockedBadge, ReleaseModeBadge, Spinner, StatusBadge, btnIcon, btnPrimary, btnSecondary, cardClass,
  errorMessage, errorProblems, inputClass, templatePath, useToast,
} from "./components/ui";

let keySeq = 0;
const withKey = (block) => ({ k: `b${++keySeq}`, block });
const toDateInput = (v) => (v ? String(v).slice(0, 10) : "");
const numOrUndef = (v) => (v === "" || v === null || v === undefined ? undefined : Number(v));

function OptionsEditor({ options, onChange, disabled }) {
  const set = (k, v) => {
    const next = { ...options };
    if (v === undefined) delete next[k]; else next[k] = v;
    onChange(next);
  };
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Labeled id="opt-resp" label="Response due (days)" hint="Days the recipient has to respond.">
        <input id="opt-resp" type="number" min={0} className={inputClass} disabled={disabled} value={options.response_days ?? ""}
          onChange={(e) => set("response_days", numOrUndef(e.target.value))} />
      </Labeled>
      <Labeled id="opt-exp" label="Expires after (days)" hint="Leave empty for no expiry.">
        <input id="opt-exp" type="number" min={0} className={inputClass} disabled={disabled} value={options.expires_days ?? ""}
          onChange={(e) => set("expires_days", numOrUndef(e.target.value))} />
      </Labeled>
      <Labeled id="opt-rem" label="Reminders (days before due, comma separated)" hint="e.g. 7, 1">
        <input id="opt-rem" className={inputClass} disabled={disabled}
          value={Array.isArray(options.reminder_days) ? options.reminder_days.join(", ") : options.reminder_days ?? ""}
          onChange={(e) => {
            const list = e.target.value.split(",").map((s) => s.trim()).filter((s) => /^\d+$/.test(s)).map(Number);
            set("reminder_days", e.target.value.trim() ? list : undefined);
          }} />
      </Labeled>
      <label className="flex items-center gap-2 self-center text-sm text-gray-700">
        <input type="checkbox" className="h-4 w-4 accent-blue-600" disabled={disabled} checked={!!options.employer_signs_first}
          onChange={(e) => set("employer_signs_first", e.target.checked || undefined)} />
        Employer signs first
      </label>
    </div>
  );
}

function BlockRow({ item, index, count, locked, expanded, onToggle, onChange, onMove, onDelete, readOnly, fields, clauseKeys }) {
  const { block } = item;
  const label = `${BLOCK_LABEL[block.type] || block.type} block ${index + 1}`;
  const editable = !readOnly && !locked;
  return (
    <li className={`rounded-xl border ${locked ? "border-slate-300 bg-slate-50" : "border-gray-200 bg-white"}`}>
      <div className="flex items-center gap-2 px-3 py-2">
        <button type="button" onClick={onToggle} aria-expanded={expanded} aria-controls={`blk-${item.k}`}
          className="flex min-w-0 flex-1 items-center gap-2 rounded text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">
          {expanded ? <ChevronDown className="h-4 w-4 shrink-0 text-gray-500" aria-hidden="true" /> : <ChevronRight className="h-4 w-4 shrink-0 text-gray-500" aria-hidden="true" />}
          <span className="w-6 shrink-0 text-right text-xs text-gray-400">{index + 1}</span>
          <span className="shrink-0 text-sm font-semibold text-gray-800">{BLOCK_LABEL[block.type] || block.type}</span>
          <span className="min-w-0 truncate text-xs text-gray-500">{blockSummary(block)}</span>
          {block.include_when && <span className="shrink-0 text-[11px] font-medium text-blue-700">conditional</span>}
        </button>
        {locked && <LockedBadge />}
        {!readOnly && (
          <div className="flex shrink-0 items-center">
            <button type="button" className={btnIcon} disabled={index === 0} onClick={() => onMove(index, -1)} aria-label={`Move ${label} up`}><ArrowUp className="h-4 w-4" /></button>
            <button type="button" className={btnIcon} disabled={index === count - 1} onClick={() => onMove(index, 1)} aria-label={`Move ${label} down`}><ArrowDown className="h-4 w-4" /></button>
            <button type="button" className={btnIcon} disabled={locked} onClick={() => onDelete(index)}
              aria-label={locked ? `${label} is locked and cannot be deleted` : `Delete ${label}`} title={locked ? "Locked blocks cannot be deleted" : undefined}>
              {locked ? <Lock className="h-4 w-4" /> : <Trash2 className="h-4 w-4" />}
            </button>
          </div>
        )}
      </div>
      {expanded && (
        <div id={`blk-${item.k}`} className="border-t border-gray-100 px-4 py-3">
          {locked && <p className="mb-2 text-xs text-slate-600">This block is locked by the platform. It is shown for reference and cannot be edited or removed.</p>}
          <BlockFields block={block} onChange={onChange} disabled={!editable} fields={fields} clauseKeys={clauseKeys} />
        </div>
      )}
    </li>
  );
}

export default function TemplateEditorPage() {
  const { variantId } = useParams();
  const [toastNode, showToast] = useToast();
  const [variant, setVariant] = useState(null);
  const [template, setTemplate] = useState(null);
  const [loadError, setLoadError] = useState("");
  const [fields, setFields] = useState([]);
  const [packClauses, setPackClauses] = useState([]);

  const [items, setItems] = useState([]);
  const [fieldContract, setFieldContract] = useState({ required: [], optional: [] });
  const [clauseRules, setClauseRules] = useState({ mandatory: [], optional: [], prohibited: [] });
  const [applicability, setApplicability] = useState({});
  const [options, setOptions] = useState({});
  const [effFrom, setEffFrom] = useState("");
  const [effTo, setEffTo] = useState("");
  const [changeReason, setChangeReason] = useState("");
  const [dirty, setDirty] = useState(false);

  const [expanded, setExpanded] = useState(() => new Set());
  const [addType, setAddType] = useState("paragraph");
  const [tab, setTab] = useState("preview");
  const [saving, setSaving] = useState(false);
  const [validating, setValidating] = useState(false);
  const [problems, setProblems] = useState(null); // { title, list }
  const [preview, setPreview] = useState({ html: null, problems: [], missing: [], loading: false, error: "" });

  const target = useRef(null);
  const insertCtx = useMemo(() => ({ register: (t) => { target.current = t; } }), []);

  const hydrate = useCallback((v) => {
    setVariant(v);
    setItems((v.content || []).map(withKey));
    setFieldContract({ required: v.field_contract?.required || [], optional: v.field_contract?.optional || [] });
    setClauseRules({ mandatory: v.clause_rules?.mandatory || [], optional: v.clause_rules?.optional || [], prohibited: v.clause_rules?.prohibited || [] });
    setApplicability(v.applicability || {});
    setOptions(v.options || {});
    setEffFrom(toDateInput(v.effective_from));
    setEffTo(toDateInput(v.effective_to));
    setChangeReason(v.change_reason || "");
    setDirty(false);
  }, []);

  useEffect(() => {
    let alive = true;
    setLoadError("");
    getVariant(variantId)
      .then((v) => {
        if (!alive) return;
        hydrate(v);
        if (v.problems?.length) setProblems({ title: "This draft has validation problems", list: v.problems });
        getTemplate(v.canonical_id).then((t) => alive && setTemplate(t)).catch(() => {});
        listClauses({ pack_id: v.pack_id, per_page: 200 }).then((r) => alive && setPackClauses(r?.items || [])).catch(() => {});
      })
      .catch((e) => alive && setLoadError(errorMessage(e)));
    listTemplateFields().then((r) => alive && setFields((r?.items || []).filter((f) => !f.system_only))).catch(() => {});
    return () => { alive = false; };
  }, [variantId, hydrate]);

  useEffect(() => {
    if (!dirty) return undefined;
    const warn = (e) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const readOnly = !variant || variant.status !== "IN_DRAFT" || variant.owner !== "organization";
  const lockedIds = useMemo(() => new Set((variant?.locked_block_ids || []).filter(Boolean)), [variant]);
  const isLocked = (b) => !!b.locked || (b.id && lockedIds.has(b.id));

  const contentBody = useMemo(() => ({
    content: items.map((i) => i.block),
    field_contract: fieldContract,
    clause_rules: clauseRules,
  }), [items, fieldContract, clauseRules]);

  const touch = (fn) => (...args) => { fn(...args); setDirty(true); };

  // ── live preview (debounced; stale responses ignored) ──
  const previewSeq = useRef(0);
  const previewKey = useMemo(() => JSON.stringify(contentBody), [contentBody]);
  useEffect(() => {
    if (!variant) return undefined;
    const seq = ++previewSeq.current;
    const t = setTimeout(() => {
      setPreview((p) => ({ ...p, loading: true, error: "" }));
      previewVariant(variant.id, readOnly ? {} : contentBody)
        .then((r) => { if (seq === previewSeq.current) setPreview({ html: r?.html || null, problems: r?.problems || [], missing: r?.missing_clauses || [], loading: false, error: "" }); })
        .catch((e) => { if (seq === previewSeq.current) setPreview((p) => ({ ...p, loading: false, error: errorMessage(e) })); });
    }, 800);
    return () => clearTimeout(t);
    // previewKey captures the body; contentBody itself changes identity on every edit
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [previewKey, variant?.id, readOnly]);

  // ── clause keys known to this template + pack ──
  const clauseOptions = useMemo(() => {
    const map = new Map();
    for (const c of packClauses) {
      const prev = map.get(c.clause_key);
      if (!prev || (prev.status !== "ACTIVE" && (c.status === "ACTIVE" || c.version > (prev.version || 0)))) {
        map.set(c.clause_key, { key: c.clause_key, title: c.title, status: c.status, version: c.version });
      }
    }
    for (const [rule, keys] of Object.entries(clauseRules)) {
      for (const k of keys || []) {
        const cur = map.get(k) || { key: k };
        map.set(k, { ...cur, rule: cur.rule ? `${cur.rule}, ${rule}` : rule });
      }
    }
    return [...map.values()].sort((a, b) => a.key.localeCompare(b.key));
  }, [packClauses, clauseRules]);
  const clauseKeys = useMemo(() => clauseOptions.map((c) => c.key), [clauseOptions]);
  const fieldKeys = useMemo(() => fields.map((f) => f.key), [fields]);

  // ── block operations ──
  const updateBlock = (index, block) => { setItems((list) => list.map((it, i) => (i === index ? { ...it, block } : it))); setDirty(true); };
  const moveBlock = (index, d) => {
    setItems((list) => {
      const j = index + d;
      if (j < 0 || j >= list.length) return list;
      const out = [...list];
      [out[index], out[j]] = [out[j], out[index]];
      return out;
    });
    setDirty(true);
  };
  const deleteBlock = (index) => {
    if (isLocked(items[index].block)) return;
    setItems((list) => list.filter((_, i) => i !== index));
    setDirty(true);
  };
  const addBlock = () => {
    const it = withKey(newBlock(addType));
    setItems((list) => [...list, it]);
    setExpanded((s) => new Set(s).add(it.k));
    setDirty(true);
  };
  const toggle = (k) => setExpanded((s) => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n; });

  const insertPlaceholder = (text) => {
    if (readOnly) return;
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
    showToast("success", "No text box was focused, so the placeholder was added in a new paragraph at the end.");
  };

  // ── validate / save ──
  const validate = async () => {
    setValidating(true);
    try {
      const r = await validateVariant(variant.id, contentBody);
      setProblems(r?.problems?.length ? { title: "Validation problems", list: r.problems } : null);
      if (!r?.problems?.length) showToast("success", "No problems found.");
    } catch (e) {
      setProblems({ title: errorMessage(e), list: errorProblems(e) });
    } finally {
      setValidating(false);
    }
  };

  const save = async () => {
    setSaving(true);
    try {
      const v = await updateVariant(variant.id, {
        ...contentBody, applicability, options,
        effective_from: effFrom || null, effective_to: effTo || null, change_reason: changeReason.trim() || null,
      });
      // Keep the local block keys (and expanded state); the server echoes exactly what was sent.
      setVariant((prev) => ({ ...prev, ...v }));
      setDirty(false);
      setProblems(null);
      showToast("success", "Draft saved.");
    } catch (e) {
      setProblems({ title: e?.detail?.code === "INVALID_TEMPLATE" ? "The draft was not saved because of these problems" : errorMessage(e), list: errorProblems(e) });
      showToast("error", "Draft not saved.");
    } finally {
      setSaving(false);
    }
  };

  if (loadError) {
    return (
      <HRPage title="Template editor">
        <ErrorBanner error={loadError} />
        <Link to="/zoiko-hr/documents/templates" className={btnSecondary}><ArrowLeft className="h-4 w-4" /> Back to templates</Link>
      </HRPage>
    );
  }
  if (!variant) return <HRPage title="Template editor"><Spinner label="Loading template version…" /></HRPage>;

  const title = template?.title || variant.canonical_id;

  return (
    <InsertTargetContext.Provider value={insertCtx}>
      <HRPage title={`${title} — version ${variant.version}`}
        subtitle={`${variant.canonical_id} · ${variant.owner === "organization" ? "Organization version" : "Platform version"} · ${variant.language}`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Link to={templatePath(variant.canonical_id)} className={btnSecondary}><ArrowLeft className="h-4 w-4" /> Template</Link>
            {!readOnly && (
              <>
                <button type="button" className={btnSecondary} onClick={validate} disabled={validating}>
                  {validating ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />} Validate
                </button>
                <button type="button" className={btnPrimary} onClick={save} disabled={saving || !dirty}>
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} {dirty ? "Save draft" : "Saved"}
                </button>
              </>
            )}
          </div>
        }>
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <StatusBadge status={variant.status} />
          <ReleaseModeBadge mode={variant.release_mode} />
          {dirty && <span className="text-xs font-semibold text-amber-700">Unsaved changes</span>}
        </div>

        {readOnly && (
          <InfoBanner icon={Lock} tone="gray">
            {variant.owner !== "organization"
              ? "Platform counsel content is read-only. Set up your organization's own version from the template page to make changes."
              : variant.status === "LEGAL_REVIEW" || variant.status === "LEGAL_APPROVED"
                ? "This version is in review and its content is frozen. Retire it and create a new version to make changes."
                : "Released content is frozen; create a new version."}
          </InfoBanner>
        )}
        {problems && <ErrorBanner title={problems.title} problems={problems.list} onDismiss={() => setProblems(null)} />}

        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_30rem]">
          {/* ── left: blocks + rules ── */}
          <div className="space-y-6">
            <section className={cardClass} aria-labelledby="blocks-h">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <h2 id="blocks-h" className="text-base font-semibold text-gray-900">Content blocks</h2>
                <div className="flex gap-2">
                  <button type="button" className="text-xs font-semibold text-blue-700 hover:underline" onClick={() => setExpanded(new Set(items.map((i) => i.k)))}>Expand all</button>
                  <button type="button" className="text-xs font-semibold text-blue-700 hover:underline" onClick={() => setExpanded(new Set())}>Collapse all</button>
                </div>
              </div>
              {items.length === 0 && <p className="py-6 text-center text-sm text-gray-500">No blocks yet.</p>}
              <ol className="space-y-2">
                {items.map((it, i) => (
                  <BlockRow key={it.k} item={it} index={i} count={items.length} locked={isLocked(it.block)} readOnly={readOnly}
                    expanded={expanded.has(it.k)} onToggle={() => toggle(it.k)} onChange={(b) => updateBlock(i, b)}
                    onMove={moveBlock} onDelete={deleteBlock} fields={fields} clauseKeys={clauseKeys} />
                ))}
              </ol>
              {!readOnly && (
                <div className="mt-4 flex flex-wrap items-end gap-2 border-t border-gray-100 pt-4">
                  <Labeled id="add-type" label="Add a block">
                    <select id="add-type" className={inputClass} value={addType} onChange={(e) => setAddType(e.target.value)}>
                      {BLOCK_TYPES.map((b) => <option key={b.type} value={b.type}>{b.label}</option>)}
                    </select>
                  </Labeled>
                  <button type="button" className={btnSecondary} onClick={addBlock}><Plus className="h-4 w-4" /> Add block</button>
                </div>
              )}
            </section>

            <section className={cardClass} aria-labelledby="rules-h">
              <h2 id="rules-h" className="mb-1 text-base font-semibold text-gray-900">Fields and clauses</h2>
              <p className="mb-4 text-xs text-gray-500">Required fields must be present before a document can be generated. Mandatory clauses must have released text in the jurisdiction pack.</p>
              <div className="grid gap-4 md:grid-cols-2">
                <TagListEditor label="Required fields" values={fieldContract.required} suggestions={fieldKeys} disabled={readOnly}
                  onChange={touch((v) => setFieldContract((c) => ({ ...c, required: v })))} />
                <TagListEditor label="Optional fields" values={fieldContract.optional} suggestions={fieldKeys} disabled={readOnly}
                  onChange={touch((v) => setFieldContract((c) => ({ ...c, optional: v })))} />
                <TagListEditor label="Mandatory clauses" values={clauseRules.mandatory} suggestions={clauseKeys} disabled={readOnly}
                  onChange={touch((v) => setClauseRules((c) => ({ ...c, mandatory: v })))} />
                <TagListEditor label="Optional clauses" values={clauseRules.optional} suggestions={clauseKeys} disabled={readOnly}
                  onChange={touch((v) => setClauseRules((c) => ({ ...c, optional: v })))} />
                <TagListEditor label="Prohibited clauses" values={clauseRules.prohibited} suggestions={clauseKeys} disabled={readOnly}
                  onChange={touch((v) => setClauseRules((c) => ({ ...c, prohibited: v })))} />
              </div>
            </section>

            <section className={cardClass} aria-labelledby="opts-h">
              <h2 id="opts-h" className="mb-4 text-base font-semibold text-gray-900">Applicability, options and release details</h2>
              <div className="space-y-5">
                <div className="grid gap-4 md:grid-cols-2">
                  <TagListEditor label="Employment types" values={applicability.employment_types || []} disabled={readOnly}
                    placeholder="e.g. full_time" hint="Leave empty to apply to every employment type."
                    onChange={touch((v) => setApplicability((a) => { const n = { ...a, employment_types: v }; if (!v.length) delete n.employment_types; return n; }))} />
                  <TagListEditor label="Worker categories" values={applicability.worker_categories || []} disabled={readOnly}
                    placeholder="e.g. employee" hint="Leave empty to apply to every worker category."
                    onChange={touch((v) => setApplicability((a) => { const n = { ...a, worker_categories: v }; if (!v.length) delete n.worker_categories; return n; }))} />
                </div>
                <OptionsEditor options={options} onChange={touch(setOptions)} disabled={readOnly} />
                <div className="grid gap-4 sm:grid-cols-2">
                  <Labeled id="eff-from" label="Effective from">
                    <input id="eff-from" type="date" className={inputClass} disabled={readOnly} value={effFrom} onChange={(e) => { setEffFrom(e.target.value); setDirty(true); }} />
                  </Labeled>
                  <Labeled id="eff-to" label="Effective to" hint="Leave empty for no end date.">
                    <input id="eff-to" type="date" className={inputClass} disabled={readOnly} value={effTo} onChange={(e) => { setEffTo(e.target.value); setDirty(true); }} />
                  </Labeled>
                </div>
                <Labeled id="chg-reason" label="Change reason" required={!readOnly} hint="Required before the version can be submitted for legal review.">
                  <textarea id="chg-reason" rows={2} className={inputClass} disabled={readOnly} value={changeReason}
                    onChange={(e) => { setChangeReason(e.target.value); setDirty(true); }} />
                </Labeled>
              </div>
            </section>
          </div>

          {/* ── right: preview / pickers ── */}
          <aside className="xl:sticky xl:top-4 xl:self-start">
            <div className={cardClass}>
              <div role="tablist" aria-label="Editor tools" className="mb-4 flex gap-1 rounded-lg bg-gray-100 p-1">
                {[["preview", "Preview", Eye], ["fields", "Insert field", FileText], ["clauses", "Insert clause", FileText]].map(([id, label, Icon]) => (
                  <button key={id} type="button" role="tab" id={`tab-${id}`} aria-selected={tab === id} aria-controls={`panel-${id}`}
                    onClick={() => setTab(id)}
                    className={`flex flex-1 items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-semibold focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${tab === id ? "bg-white text-gray-900 shadow-sm" : "text-gray-600 hover:text-gray-800"}`}>
                    <Icon className="h-3.5 w-3.5" aria-hidden="true" /> {label}
                  </button>
                ))}
              </div>

              <div role="tabpanel" id="panel-preview" aria-labelledby="tab-preview" hidden={tab !== "preview"}>
                <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-amber-800">
                  <Info className="h-3.5 w-3.5" aria-hidden="true" /> Sample data — never a real employee
                </p>
                <div aria-live="polite">
                  {preview.loading && <p className="mb-2 text-xs text-gray-500"><Loader2 className="mr-1 inline h-3 w-3 animate-spin" />Updating preview…</p>}
                  {preview.error && <ErrorBanner error={preview.error} />}
                  {preview.problems.length > 0 && <ErrorBanner title="The preview cannot be shown until these are fixed" problems={preview.problems} />}
                  {preview.missing.length > 0 && (
                    <InfoBanner tone="amber">
                      Mandatory clauses with no released text in this pack yet: {preview.missing.map((k) => <code key={k} className="mr-1">{k}</code>)}
                    </InfoBanner>
                  )}
                </div>
                <SandboxedHtmlPreview html={preview.html} title="Template preview with sample data" height={720} />
              </div>

              <div role="tabpanel" id="panel-fields" aria-labelledby="tab-fields" hidden={tab !== "fields"}>
                {readOnly ? <p className="text-sm text-gray-500">The content is read-only.</p> : <FieldPicker fields={fields} onInsert={insertPlaceholder} />}
              </div>

              <div role="tabpanel" id="panel-clauses" aria-labelledby="tab-clauses" hidden={tab !== "clauses"}>
                {readOnly ? <p className="text-sm text-gray-500">The content is read-only.</p> : <ClausePicker clauses={clauseOptions} onInsert={insertPlaceholder} />}
              </div>
            </div>
          </aside>
        </div>
        {toastNode}
      </HRPage>
    </InsertTargetContext.Provider>
  );
}
